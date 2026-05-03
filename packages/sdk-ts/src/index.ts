export { AgentPayClient } from "./client";
export type { SpendingPolicyInput } from "./client";

// Legacy paywall (kept for backwards compat)
export { paywall } from "./http402/express";
export type { NonceStore, MiddlewareOpts } from "./http402/express";
export { InMemoryNonceStore } from "./http402/nonce";
export { nextPaywall } from "./http402/next";
export { verifyPaymentTx, MEMO_PROGRAM_ID } from "./http402/verify";

// x402-compliant paywall (preferred)
export { x402Paywall, buildPaymentRequired, verifyX402Payment } from "./x402";
export type { X402MiddlewareOpts, X402PaymentRequirement, X402PaymentRequiredResponse } from "./x402";
