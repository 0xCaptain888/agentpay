#!/bin/bash
# scripts/seed-traffic.sh
# Simulate external users paying 0.01 USDC to AlphaScout vault.
# Requires: solana-cli, spl-token, a funded wallet at ~/.config/solana/id.json
set -euo pipefail

USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
VAULT_ATA="${VAULT_ATA:-YOUR_VAULT_ATA_HERE}"
NUM_PAYMENTS="${1:-10}"

if [ "$VAULT_ATA" = "YOUR_VAULT_ATA_HERE" ]; then
    echo "ERROR: Set VAULT_ATA env var to the vault's USDC ATA address."
    echo "Usage: VAULT_ATA=<address> ./scripts/seed-traffic.sh [num_payments]"
    exit 1
fi

echo "=== Seeding $NUM_PAYMENTS payments to vault ATA: $VAULT_ATA ==="

for i in $(seq 1 "$NUM_PAYMENTS"); do
    echo "Payment $i/$NUM_PAYMENTS..."
    spl-token transfer "$USDC_MINT" 0.01 "$VAULT_ATA" \
        --fund-recipient \
        --url devnet \
        --allow-unfunded-recipient \
        2>&1 | tail -1
    sleep 2
done

echo "=== Done. $NUM_PAYMENTS payments sent. ==="
