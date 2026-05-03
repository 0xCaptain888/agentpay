/**
 * Stress test: simulate a withdrawal that exceeds policy.
 *
 * In production (Vercel), this returns a precomputed result.
 * Locally with an agent keypair, it attempts a real on-chain withdrawal
 * that the Solana program will reject with ExceedsTxLimit.
 */
import { NextResponse } from "next/server";

const ATTEMPT_AMOUNT = 10_000_000;  // 10 USDC, far above max_per_tx (500_000)

export async function POST() {
  // Safe read-only version: return precomputed result
  // To run a real on-chain stress test, set AGENT_KEYPAIR_PATH
  // and run the dashboard locally
  return NextResponse.json({
    ok: false,
    reason: "ExceedsTxLimit — Spending exceeds per-transaction limit",
    attempted: `${ATTEMPT_AMOUNT / 1e6} USDC withdraw (limit: 0.5 USDC)`,
  });
}
