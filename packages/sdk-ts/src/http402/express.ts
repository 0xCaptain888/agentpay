import type { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { Connection, PublicKey } from "@solana/web3.js";
import { verifyPaymentTx } from "./verify";
import type { NonceStore } from "./nonce";
import { InMemoryNonceStore } from "./nonce";

export type { NonceStore } from "./nonce";
export { InMemoryNonceStore } from "./nonce";

export interface MiddlewareOpts {
  connection: Connection;
  recipientVaultAta: PublicKey;
  pricePerCall: bigint;
  noncesCache: NonceStore;
}

export function paywall(opts: MiddlewareOpts) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sig = req.header("X-Payment");
    const nonce = req.header("X-Payment-Nonce");

    // 1. No payment -> return 402 + payment requirements
    if (!sig || !nonce) {
      const newNonce = uuid();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      await opts.noncesCache.set(newNonce, { expiresAt, paid: false });
      return res.status(402).json({
        x402: "1.0",
        accepts: [{
          scheme: "solana-spl-transfer",
          network: "solana-devnet",
          asset: "USDC",
          amount: opts.pricePerCall.toString(),
          recipient: opts.recipientVaultAta.toBase58(),
          nonce: newNonce,
          expiresAt,
        }],
      });
    }

    // 2. Check nonce
    const record = await opts.noncesCache.get(nonce);
    if (!record) return res.status(402).json({ error: "unknown nonce" });
    if (Date.now() > record.expiresAt) {
      return res.status(402).json({ error: "nonce expired" });
    }
    if (record.paid) {
      return res.status(409).json({ error: "nonce already used" });
    }

    // 3. On-chain tx verification
    try {
      const tx = await opts.connection.getParsedTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return res.status(402).json({ error: "tx not found" });

      const ok = verifyPaymentTx(tx, {
        recipient: opts.recipientVaultAta,
        minAmount: opts.pricePerCall,
        memo: nonce,
      });
      if (!ok) return res.status(402).json({ error: "invalid payment" });

      // 4. Mark nonce as used
      await opts.noncesCache.set(nonce, { ...record, paid: true });

      // 5. Pass through
      next();
    } catch (e) {
      console.error("paywall verification error", e);
      return res.status(500).json({ error: "verification failed" });
    }
  };
}
