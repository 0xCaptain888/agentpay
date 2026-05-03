import { X402PaymentRequiredResponse, X402PaymentRequirement } from "./types";

export interface BuildResponseOpts {
  resource: string;
  recipient: string;          // SPL token ATA
  asset: string;              // mint
  amount: bigint;             // raw units
  network?: "solana-devnet" | "solana-mainnet";
  description?: string;
  timeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export function buildPaymentRequired(opts: BuildResponseOpts): X402PaymentRequiredResponse {
  const requirement: X402PaymentRequirement = {
    scheme: "exact",
    network: opts.network ?? "solana-devnet",
    maxAmountRequired: opts.amount.toString(),
    resource: opts.resource,
    description: opts.description ?? "Paid resource",
    mimeType: "application/json",
    payTo: opts.recipient,
    maxTimeoutSeconds: opts.timeoutSeconds ?? 300,
    asset: opts.asset,
    extra: opts.extra,
  };
  return {
    x402Version: 1,
    accepts: [requirement],
    error: null,
  };
}
