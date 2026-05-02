import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { paywall, InMemoryNonceStore } from "@agentpay/sdk-ts";

const app = express();
const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com");
const VAULT_ATA = new PublicKey(process.env.VAULT_ATA || "11111111111111111111111111111111");

// 3 lines to add paywall to any endpoint
app.get("/data", paywall({
  connection: conn,
  recipientVaultAta: VAULT_ATA,
  pricePerCall: 10_000n,    // 0.01 USDC
  noncesCache: new InMemoryNonceStore(),
}), (req, res) => {
  res.json({
    data: "premium content here",
    timestamp: Date.now(),
    message: "You paid 0.01 USDC to access this endpoint!",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Example API running on port ${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/data`);
});
