#!/bin/bash
# scripts/setup-vendors.sh
# Generate 3 vendor test wallets + their USDC ATAs on devnet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDORS_DIR="${ROOT_DIR}/vendors"

mkdir -p "$VENDORS_DIR"

USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
FEE_PAYER="${HOME}/.config/solana/id.json"

echo "=== Vendor Wallet Setup ==="

for VENDOR in openai rpc twitter; do
    KEYPAIR="${VENDORS_DIR}/${VENDOR}-vendor.json"
    if [ ! -f "$KEYPAIR" ]; then
        echo "Generating ${VENDOR} vendor keypair..."
        solana-keygen new --outfile "$KEYPAIR" --no-bip39-passphrase --force
    fi

    PUBKEY=$(solana address -k "$KEYPAIR")
    echo "${VENDOR} vendor pubkey: $PUBKEY"

    # Create USDC ATA
    echo "Creating USDC ATA for ${VENDOR}..."
    ATA=$(spl-token create-account "$USDC_MINT" --owner "$PUBKEY" --fee-payer "$FEE_PAYER" --url devnet 2>&1 | grep -oP 'Creating account \K\S+' || echo "already exists")

    # Get the ATA address
    ATA_ADDR=$(spl-token accounts --owner "$PUBKEY" --url devnet 2>/dev/null | grep "$USDC_MINT" | awk '{print $1}' || echo "unknown")

    echo "  ATA: $ATA_ADDR"
    echo "  Set SUPPLIER_USDC_ATA_$(echo $VENDOR | tr '[:lower:]' '[:upper:]')=$ATA_ADDR in .env"
    echo ""
done

echo "=== Done ==="
echo "Add the ATA addresses to your .env file."
