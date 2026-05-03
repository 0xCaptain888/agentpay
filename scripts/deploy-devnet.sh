#!/bin/bash
set -e

# =============================================================================
# AgentPay — 一键部署脚本 (Solana Devnet)
#
# 在你的 Ubuntu 24.04 服务器上执行:
#   bash deploy-devnet.sh
#
# 完成后会输出所有你需要的地址和 .env 配置
# =============================================================================

echo "============================================"
echo "  AgentPay Devnet Deploy Script"
echo "============================================"
echo ""

# --- 1. 系统依赖 ---
echo "[1/8] 安装系统依赖..."
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential pkg-config libssl-dev libudev-dev curl git nodejs npm > /dev/null 2>&1
echo "  ✓ 系统依赖安装完成"

# --- 2. 安装 Rust ---
echo "[2/8] 安装 Rust..."
if command -v rustc &> /dev/null; then
    echo "  ✓ Rust 已安装: $(rustc --version)"
else
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y > /dev/null 2>&1
    echo "  ✓ Rust 安装完成"
fi
source "$HOME/.cargo/env"

# 安装 Anchor 需要的 Rust 1.79 工具链
rustup toolchain install 1.79.0 > /dev/null 2>&1
echo "  ✓ Rust 1.79.0 工具链就绪"

# --- 3. 安装 Solana CLI ---
echo "[3/8] 安装 Solana CLI..."
if command -v solana &> /dev/null; then
    echo "  ✓ Solana 已安装: $(solana --version)"
else
    sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.18/install)" > /dev/null 2>&1
    echo "  ✓ Solana CLI 安装完成"
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana config set --url devnet > /dev/null 2>&1

# --- 4. 安装 Anchor CLI ---
echo "[4/8] 安装 Anchor CLI (这一步需要几分钟编译)..."
if command -v anchor &> /dev/null && [[ "$(anchor --version)" == *"0.30.1"* ]]; then
    echo "  ✓ Anchor 已安装: $(anchor --version)"
else
    cargo install --git https://github.com/coral-xyz/anchor avm --force > /dev/null 2>&1
    avm install 0.30.1 > /dev/null 2>&1
    avm use 0.30.1 > /dev/null 2>&1
    echo "  ✓ Anchor 0.30.1 安装完成"
fi

# --- 5. 克隆项目 & 生成 Keypair ---
echo "[5/8] 克隆项目并生成 keypair..."
cd ~
if [ -d "agentpay" ]; then
    echo "  agentpay 目录已存在，拉取最新代码..."
    cd agentpay && git pull > /dev/null 2>&1
else
    git clone https://github.com/0xCaptain888/agentpay.git > /dev/null 2>&1
    cd agentpay
fi

# 生成 deployer keypair (如果不存在)
if [ ! -f ~/.config/solana/id.json ]; then
    solana-keygen new --no-bip39-passphrase --outfile ~/.config/solana/id.json --force > /dev/null 2>&1
fi
DEPLOYER=$(solana-keygen pubkey ~/.config/solana/id.json)
echo "  Deployer: $DEPLOYER"

# 生成 agent keypair
if [ ! -f agent-keypair.json ]; then
    solana-keygen new --no-bip39-passphrase --outfile agent-keypair.json --force > /dev/null 2>&1
fi
AGENT=$(solana-keygen pubkey agent-keypair.json)
echo "  Agent:    $AGENT"

# 生成 program keypair
mkdir -p programs/agent-vault/target/deploy
if [ ! -f programs/agent-vault/target/deploy/agent_vault-keypair.json ]; then
    solana-keygen new --no-bip39-passphrase --outfile programs/agent-vault/target/deploy/agent_vault-keypair.json --force > /dev/null 2>&1
fi
PROGRAM_ID=$(solana-keygen pubkey programs/agent-vault/target/deploy/agent_vault-keypair.json)
echo "  Program:  $PROGRAM_ID"

# 生成 vendor keypairs
mkdir -p vendors
for vendor in openai rpc twitter; do
    if [ ! -f "vendors/${vendor}-vendor.json" ]; then
        solana-keygen new --no-bip39-passphrase --outfile "vendors/${vendor}-vendor.json" --force > /dev/null 2>&1
    fi
done
VENDOR_OPENAI=$(solana-keygen pubkey vendors/openai-vendor.json)
VENDOR_RPC=$(solana-keygen pubkey vendors/rpc-vendor.json)
VENDOR_TWITTER=$(solana-keygen pubkey vendors/twitter-vendor.json)
echo "  Vendor openai:  $VENDOR_OPENAI"
echo "  Vendor rpc:     $VENDOR_RPC"
echo "  Vendor twitter: $VENDOR_TWITTER"

# --- 更新代码中的 Program ID ---
echo ""
echo "  更新 Program ID 到代码中..."

# 更新 lib.rs
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROGRAM_ID\")/" programs/agent-vault/programs/agent-vault/src/lib.rs

# 更新 Anchor.toml
sed -i "s/agent_vault = \"[^\"]*\"/agent_vault = \"$PROGRAM_ID\"/" programs/agent-vault/Anchor.toml

# 更新 config.py
sed -i "s/program_id: str = \"[^\"]*\"/program_id: str = \"$PROGRAM_ID\"/" apps/alpha-scout/alpha_scout/config.py

echo "  ✓ Keypair 和 Program ID 配置完成"

# --- 6. Anchor Build ---
echo "[6/8] 编译 Anchor 合约 (首次编译需要几分钟)..."
cd ~/agentpay/programs/agent-vault

# 确保 Cargo.lock 兼容
rm -f Cargo.lock

anchor build 2>&1 | tail -5
echo "  ✓ 合约编译完成"

# 验证 program ID 一致
BUILT_ID=$(solana-keygen pubkey target/deploy/agent_vault-keypair.json)
if [ "$BUILT_ID" != "$PROGRAM_ID" ]; then
    echo "  ⚠️ WARNING: Built program ID ($BUILT_ID) != expected ($PROGRAM_ID)"
    echo "  Running anchor keys sync..."
    anchor keys sync
    anchor build 2>&1 | tail -3
fi

# 同步 IDL 到 SDK
cd ~/agentpay
echo "  同步 IDL 到两个 SDK..."
cp programs/agent-vault/target/idl/agent_vault.json packages/sdk-ts/src/idl/agent_vault.json 2>/dev/null || true
cp programs/agent-vault/target/idl/agent_vault.json packages/sdk-py/agentpay/idl.json 2>/dev/null || true
echo "  ✓ IDL 同步完成"

# --- 7. Airdrop SOL & Deploy ---
echo "[7/8] Airdrop SOL 并部署到 devnet..."

echo "  向 Deployer 请求 SOL (可能需要多次)..."
for i in 1 2 3; do
    solana airdrop 2 $DEPLOYER --url devnet > /dev/null 2>&1 || true
    sleep 2
done

echo "  向 Agent 请求 SOL..."
for i in 1 2; do
    solana airdrop 2 $AGENT --url devnet > /dev/null 2>&1 || true
    sleep 2
done

DEPLOYER_BAL=$(solana balance $DEPLOYER --url devnet 2>/dev/null | awk '{print $1}')
AGENT_BAL=$(solana balance $AGENT --url devnet 2>/dev/null | awk '{print $1}')
echo "  Deployer balance: ${DEPLOYER_BAL} SOL"
echo "  Agent balance:    ${AGENT_BAL} SOL"

echo "  部署合约到 devnet..."
cd ~/agentpay/programs/agent-vault
anchor deploy --provider.cluster devnet 2>&1 | tail -5

echo "  ✓ 合约部署完成"

# --- 8. 输出汇总 ---
cd ~/agentpay

# 计算 USDC ATA for vendors
USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

echo ""
echo "============================================"
echo "  部署完成！以下是你需要的所有信息"
echo "============================================"
echo ""
echo ">>> Keypair 汇总 <<<"
echo "  Deployer (owner):  $DEPLOYER"
echo "  Agent (authority):  $AGENT"
echo "  Program ID:         $PROGRAM_ID"
echo "  Vendor openai:      $VENDOR_OPENAI"
echo "  Vendor rpc:         $VENDOR_RPC"
echo "  Vendor twitter:     $VENDOR_TWITTER"
echo ""
echo ">>> Program 在 Explorer 上查看 <<<"
echo "  https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet"
echo ""
echo "============================================"
echo "  接下来需要手动执行的步骤"
echo "============================================"
echo ""
echo "1. 去 Circle USDC 水龙头领测试 USDC:"
echo "   https://faucet.circle.com/"
echo "   选 Solana Devnet, 填地址: $DEPLOYER"
echo ""
echo "2. 创建 vendor USDC ATA:"
echo "   spl-token create-account $USDC_MINT --owner $VENDOR_OPENAI --fee-payer ~/.config/solana/id.json --url devnet"
echo "   spl-token create-account $USDC_MINT --owner $VENDOR_RPC --fee-payer ~/.config/solana/id.json --url devnet"
echo "   spl-token create-account $USDC_MINT --owner $VENDOR_TWITTER --fee-payer ~/.config/solana/id.json --url devnet"
echo ""
echo "3. 初始化 Vault (在项目根目录):"
echo "   cd ~/agentpay"
echo "   npm install -g pnpm"
echo "   pnpm install"
echo "   pnpm add -D tsx -w"
echo "   pnpm tsx scripts/setup-chain.ts"
echo ""
echo "4. 向 Vault 转入 USDC (setup-chain.ts 会输出 VAULT_ATA 地址):"
echo "   spl-token transfer $USDC_MINT 5 <VAULT_ATA> --fund-recipient --url devnet"
echo ""
echo "5. 把输出的地址填入 .env 文件"
echo ""
echo "============================================"
echo "  脚本执行完毕"
echo "============================================"
