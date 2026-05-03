/**
 * x402 protocol types — Solana exact scheme.
 * Based on https://github.com/coinbase/x402 spec.
 */

export interface X402PaymentRequirement {
  scheme: "exact";
  network: "solana-devnet" | "solana-mainnet";
  maxAmountRequired: string;        // raw units, e.g. "10000" = 0.01 USDC
  resource: string;                  // canonical URL
  description: string;
  mimeType: string;
  payTo: string;                     // recipient ATA (Solana SPL token account)
  maxTimeoutSeconds: number;
  asset: string;                     // SPL mint pubkey
  extra?: Record<string, unknown>;   // free-form metadata
}

export interface X402PaymentRequiredResponse {
  x402Version: 1;
  accepts: X402PaymentRequirement[];
  error: string | null;
}

export interface X402PaymentHeader {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    /**
     * Base64-encoded fully-signed Solana transaction.
     * On Solana, the agent signs and *settles* the tx itself
     * (no facilitator hop required for "exact" scheme).
     */
    transaction: string;
  };
}

export interface X402PaymentResponseHeader {
  success: boolean;
  transaction: string;               // tx signature
  network: string;
  payer: string;                     // payer pubkey (from signed tx)
}
