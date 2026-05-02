import type { Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { Connection, PublicKey } from "@solana/web3.js";

export interface NonceStore {
  get(n: string): Promise<{ expiresAt: number; paid: boolean } | null>;
  set(n: string, v: { expiresAt: number; paid: boolean }): Promise<void>;
}

export class InMemoryNonceStore implements NonceStore {
  private map = new Map<string, { expiresAt: number; paid: boolean }>();
  async get(n: string) { return this.map.get(n) ?? null; }
  async set(n: string, v: { expiresAt: number; paid: boolean }) { this.map.set(n, v); }
}

export interface MiddlewareOpts {
  connection: Connection;
  recipientVaultAta: PublicKey;
  pricePerCall: bigint;
  noncesCache: NonceStore;
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

function verifyPaymentTx(tx: any, expected: {
  recipient: PublicKey;
  minAmount: bigint;
  memo: string;
}): boolean {
  try {
    if (!tx.meta) return false;

    // Check token balance changes
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];
    const accountKeys = tx.transaction.message.accountKeys.map(
      (k: any) => typeof k === "string" ? k : k.pubkey.toString()
    );

    const recipientStr = expected.recipient.toBase58();
    const recipientIdx = accountKeys.indexOf(recipientStr);
    if (recipientIdx === -1) return false;

    // Find balance change for recipient
    const preBal = preBalances.find(
      (b: any) => b.accountIndex === recipientIdx
    );
    const postBal = postBalances.find(
      (b: any) => b.accountIndex === recipientIdx
    );

    const preAmount = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
    const postAmount = BigInt(postBal?.uiTokenAmount?.amount ?? "0");
    const delta = postAmount - preAmount;

    if (delta < expected.minAmount) return false;

    // Verify memo instruction contains nonce
    const instructions = tx.transaction.message.instructions || [];
    const memoIx = instructions.find((ix: any) => {
      const progId = typeof ix.programId === "string"
        ? ix.programId
        : ix.programId?.toString();
      return progId === MEMO_PROGRAM_ID.toBase58();
    });

    if (!memoIx) return false;
    const memoData = memoIx.parsed || memoIx.data || "";
    if (!memoData.includes(expected.memo)) return false;

    return true;
  } catch (e) {
    console.error("verifyPaymentTx error:", e);
    return false;
  }
}
