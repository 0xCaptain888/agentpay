#!/bin/bash
set -e

# =============================================================================
# AgentVault - Mainnet Deploy Script
#
# Prerequisites:
# 1. Solana CLI installed, ~/.config/solana/id.json is your deployer wallet
# 2. Deployer wallet has enough SOL (~4-5 SOL for rent + gas)
# 3. Local anchor build completed (devnet version passes tests)
# 4. You have real USDC (mainnet mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
#
# Usage:
#   chmod +x scripts/deploy-mainnet.sh
#   DEPLOYER_KEYPAIR=~/.config/solana/id.json bash scripts/deploy-mainnet.sh
# =============================================================================

NETWORK="mainnet-beta"
NETWORK_URL="https://api.mainnet-beta.solana.com"
USDC_MINT_MAINNET="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

echo "============================================"
echo "  AgentVault Mainnet Deploy"
echo "  Target: ${NETWORK}"
echo "============================================"

# --- Check Solana CLI config ---
echo "[1/6] Checking Solana CLI config..."
DEPLOYER=$(solana-keygen pubkey ~/.config/solana/id.json)
echo "  Deployer: $DEPLOYER"

BALANCE=$(solana balance $DEPLOYER --url $NETWORK_URL 2>/dev/null | awk '{print $1}')
echo "  Balance: ${BALANCE} SOL"

if (( $(echo "$BALANCE < 3" | bc -l) )); then
    echo "  ERROR: Insufficient balance! Mainnet deploy needs ~4 SOL (including program rent)"
    echo "  Please send at least 4 SOL to $DEPLOYER"
    exit 1
fi
echo "  OK: Balance sufficient"

# --- Generate mainnet program keypair ---
echo "[2/6] Generating mainnet program keypair..."
KEYPAIR_DIR="programs/agent-vault/target/deploy"
mkdir -p $KEYPAIR_DIR

MAINNET_KEYPAIR="${KEYPAIR_DIR}/agent_vault_mainnet-keypair.json"
if [ ! -f "$MAINNET_KEYPAIR" ]; then
    solana-keygen new --no-bip39-passphrase --outfile "$MAINNET_KEYPAIR" --force
    echo "  OK: New keypair generated"
else
    echo "  OK: Using existing mainnet keypair"
fi

MAINNET_PROGRAM_ID=$(solana-keygen pubkey "$MAINNET_KEYPAIR")
echo "  Mainnet Program ID: $MAINNET_PROGRAM_ID"

# --- Update Program ID in code ---
echo "[3/6] Updating Program ID in code..."

DEVNET_ID=$(grep "declare_id!" programs/agent-vault/programs/agent-vault/src/lib.rs | grep -o '"[^"]*"' | tr -d '"')
sed -i "s/declare_id!(\"${DEVNET_ID}\")/declare_id!(\"${MAINNET_PROGRAM_ID}\")/" \
    programs/agent-vault/programs/agent-vault/src/lib.rs

sed -i "s/MAINNET_PROGRAM_ID_PLACEHOLDER/${MAINNET_PROGRAM_ID}/" \
    programs/agent-vault/Anchor.toml

echo "  OK: Program ID updated"
echo "  devnet (old): $DEVNET_ID"
echo "  mainnet (new): $MAINNET_PROGRAM_ID"

# --- Build ---
echo "[4/6] Building contract (mainnet build)..."
cd programs/agent-vault

cp "$MAINNET_KEYPAIR" "target/deploy/agent_vault-keypair.json"

anchor build 2>&1 | tail -5
echo "  OK: Build complete"
cd ../..

# --- Deploy to mainnet ---
echo "[5/6] Deploying to mainnet-beta..."
cd programs/agent-vault

anchor deploy \
    --provider.cluster mainnet \
    --provider.wallet ~/.config/solana/id.json \
    --program-keypair "$MAINNET_KEYPAIR" \
    --program-name agent_vault 2>&1

echo "  OK: Deploy complete"
cd ../..

# --- Restore devnet ID ---
echo "[6/6] Restoring devnet development environment..."
sed -i "s/declare_id!(\"${MAINNET_PROGRAM_ID}\")/declare_id!(\"${DEVNET_ID}\")/" \
    programs/agent-vault/programs/agent-vault/src/lib.rs

cp programs/agent-vault/target/idl/agent_vault.json packages/sdk-ts/src/idl/agent_vault.json 2>/dev/null || true
cp programs/agent-vault/target/idl/agent_vault.json packages/sdk-py/agentpay/idl.json 2>/dev/null || true

echo ""
echo "============================================"
echo "  Mainnet Deploy Successful!"
echo "============================================"
echo ""
echo "  Program ID (mainnet): $MAINNET_PROGRAM_ID"
echo "  Explorer: https://explorer.solana.com/address/${MAINNET_PROGRAM_ID}"
echo ""
echo "  Next steps:"
echo "  1. Store MAINNET_PROGRAM_ID in env vars or .env.mainnet"
echo "  2. Run scripts/init-mainnet-vault.ts to initialize first vault"
echo "  3. Send small amount of real USDC (\$5-10 is enough for demo)"
echo "  4. Update README with mainnet badge"
echo ""
echo "  USDC Mint (mainnet): $USDC_MINT_MAINNET"
echo "  WARNING: This is real money, handle with care"
