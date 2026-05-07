#!/bin/bash
# scripts/sync-idl.sh
# Build the Anchor program and sync the IDL to both SDKs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Sync IDL ==="

cd "${ROOT_DIR}/programs/agent-vault"
echo "Building Anchor program..."
anchor build

IDL_PATH="target/idl/agent_vault.json"
if [ ! -f "$IDL_PATH" ]; then
    echo "ERROR: IDL not found at $IDL_PATH"
    exit 1
fi

echo "Copying IDL to TypeScript SDK..."
cp "$IDL_PATH" "${ROOT_DIR}/packages/sdk-ts/src/idl/agent_vault.json"

echo "Copying IDL to Python SDK..."
cp "$IDL_PATH" "${ROOT_DIR}/packages/sdk-py/agentpay/idl.json"

echo "=== Done ==="
echo "IDL synced to both SDKs."
