import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { Connection, PublicKey } from "@solana/web3.js";
import type { NonceStore } from "./express";
import { InMemoryNonceStore } from "./express";

export interface NextPaywallOpts {
  connection: Connection;
  recipientVaultAta: PublicKey;
  pricePerCall: bigint;
  noncesCache?: NonceStore;
}

const defaultNonces = new InMemoryNonceStore();

export function nextPaywall(opts: NextPaywallOpts) {
  const nonces = opts.noncesCache ?? defaultNonces;

  return async (req: NextRequest): Promise<NextResponse | null> => {
    const sig = req.headers.get("X-Payment");
    const nonce = req.headers.get("X-Payment-Nonce");

    if (!sig || !nonce) {
      const newNonce = uuid();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      await nonces.set(newNonce, { expiresAt, paid: false });
      return NextResponse.json({
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
      }, { status: 402 });
    }

    const record = await nonces.get(nonce);
    if (!record) return NextResponse.json({ error: "unknown nonce" }, { status: 402 });
    if (Date.now() > record.expiresAt) return NextResponse.json({ error: "nonce expired" }, { status: 402 });
    if (record.paid) return NextResponse.json({ error: "nonce already used" }, { status: 409 });

    try {
      const tx = await opts.connection.getParsedTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return NextResponse.json({ error: "tx not found" }, { status: 402 });

      await nonces.set(nonce, { ...record, paid: true });
      return null; // pass through
    } catch (e) {
      return NextResponse.json({ error: "verification failed" }, { status: 500 });
    }
  };
}
