#!/bin/bash
# scripts/init-vault.sh
# Initialize a new AgentVault on Solana devnet.
# Prerequisites: solana-cli, spl-token, anchor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== AgentPay Vault Initialization ==="

# 1. Check tools
command -v solana >/dev/null 2>&1 || { echo "solana CLI not found"; exit 1; }
command -v spl-token >/dev/null 2>&1 || { echo "spl-token CLI not found"; exit 1; }

# 2. Config
USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
AGENT_KEYPAIR="${ROOT_DIR}/agent-keypair.json"

# 3. Generate agent keypair if missing
if [ ! -f "$AGENT_KEYPAIR" ]; then
    echo "Generating agent keypair..."
    solana-keygen new --outfile "$AGENT_KEYPAIR" --no-bip39-passphrase --force
fi

AGENT_PUBKEY=$(solana address -k "$AGENT_KEYPAIR")
echo "Agent pubkey: $AGENT_PUBKEY"

# 4. Airdrop SOL to agent (devnet)
echo "Airdropping SOL to agent..."
solana airdrop 2 "$AGENT_PUBKEY" --url devnet || true

# 5. Create USDC ATA for agent (needed for tx fees)
echo "Creating USDC ATA for agent..."
spl-token create-account "$USDC_MINT" --owner "$AGENT_PUBKEY" --fee-payer ~/.config/solana/id.json --url devnet || true

echo ""
echo "=== Done ==="
echo "Agent keypair: $AGENT_KEYPAIR"
echo "Agent pubkey:  $AGENT_PUBKEY"
echo ""
echo "Next steps:"
echo "  1. cd programs/agent-vault && anchor build && anchor deploy --provider.cluster devnet"
echo "  2. Run scripts/setup-vendors.sh to create vendor wallets"
echo "  3. Copy the program ID to .env and lib.rs"
