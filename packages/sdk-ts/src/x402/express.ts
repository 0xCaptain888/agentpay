import type { Request, Response, NextFunction } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { buildPaymentRequired } from "./response";
import { verifyX402Payment } from "./verify";

export interface X402MiddlewareOpts {
  connection: Connection;
  recipientAta: PublicKey;           // SPL token ATA receiving funds
  asset: PublicKey;                   // mint
  pricePerCall: bigint;               // raw units
  network?: "solana-devnet" | "solana-mainnet";
  description?: string;
  resource?: string;                  // canonical URL; if absent inferred from req
}

/**
 * x402-compliant Express middleware.
 * Drop-in replacement for @x402/express.
 *
 * Usage:
 *   app.get("/data", x402Paywall({...}), handler);
 */
export function x402Paywall(opts: X402MiddlewareOpts) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.header("x-payment");

    // No payment → return 402 with x402 schema
    if (!paymentHeader) {
      const resource = opts.resource ?? `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const body = buildPaymentRequired({
        resource,
        recipient: opts.recipientAta.toBase58(),
        asset: opts.asset.toBase58(),
        amount: opts.pricePerCall,
        network: opts.network,
        description: opts.description,
      });
      res.status(402).json(body);
      return;
    }

    // Payment present → verify
    const result = await verifyX402Payment(paymentHeader, {
      connection: opts.connection,
      expectedRecipient: opts.recipientAta,
      expectedAsset: opts.asset,
      minAmount: opts.pricePerCall,
    });

    if (!result.ok) {
      res.status(402).json({
        x402Version: 1,
        accepts: [],
        error: result.reason ?? "payment verification failed",
      });
      return;
    }

    // Set X-PAYMENT-RESPONSE header (base64-JSON)
    const responseHeader = {
      success: true,
      transaction: result.txSignature ?? "",
      network: opts.network ?? "solana-devnet",
      payer: result.payer ?? "",
    };
    res.setHeader(
      "X-PAYMENT-RESPONSE",
      Buffer.from(JSON.stringify(responseHeader)).toString("base64"),
    );

    next();
  };
}
