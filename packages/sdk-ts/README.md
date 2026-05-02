# @agentpay/sdk-ts

> TypeScript SDK for AgentPay — HTTP 402 payment middleware and Vault client for Solana.

## Installation

```bash
pnpm add @agentpay/sdk-ts
```

## Quick Start — 3-Line Integration

```typescript
import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { paywall, InMemoryNonceStore } from "@agentpay/sdk-ts";

const app = express();
const conn = new Connection(process.env.RPC_URL!);
const VAULT_ATA = new PublicKey(process.env.VAULT_ATA!);

app.get("/data", paywall({
  connection: conn,
  recipientVaultAta: VAULT_ATA,
  pricePerCall: 10_000n,    // 0.01 USDC
  noncesCache: new InMemoryNonceStore(),
}), (req, res) => {
  res.json({ data: "premium content here", timestamp: Date.now() });
});

app.listen(3000);
```

## HTTP 402 Flow

1. Client calls your endpoint without payment headers
2. Server responds `402 Payment Required` with payment instructions
3. Client sends USDC on Solana with nonce in memo
4. Client retries with `X-Payment: <tx_sig>` and `X-Payment-Nonce: <nonce>`
5. Server verifies on-chain, marks nonce used, returns `200`

## Vault Client

```typescript
import { AgentPayClient } from "@agentpay/sdk-ts";

const client = new AgentPayClient({
  rpcUrl: "https://api.devnet.solana.com",
  walletAdapter: wallet,
  programId: new PublicKey("..."),
  usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  idl: require("./idl/agent_vault.json"),
});

// Create a vault
await client.createVault(agentAuthority, agentId, {
  maxPerTx: 500_000n,    // 0.5 USDC
  maxPerDay: 5_000_000n, // 5 USDC
});

// Read vault state
const vault = await client.getVault(agentAuthority);
```

## License

MIT
