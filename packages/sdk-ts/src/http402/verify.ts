import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/**
 * Extract memo text from a parsed memo instruction.
 * Handles both parsed and raw (base58-encoded) formats.
 */
function extractMemoText(memoIx: any): string {
  if (typeof memoIx.parsed === "string") return memoIx.parsed;
  if (memoIx.parsed?.info) return memoIx.parsed.info;
  if (typeof memoIx.data === "string") {
    try {
      return new TextDecoder().decode(bs58.decode(memoIx.data));
    } catch {
      return memoIx.data;
    }
  }
  return "";
}

/**
 * Verify an on-chain payment transaction:
 * 1. Check that recipient received >= minAmount tokens
 * 2. Check that a memo instruction contains the expected nonce
 */
export function verifyPaymentTx(tx: any, expected: {
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
    const memoData = extractMemoText(memoIx);
    if (!memoData.includes(expected.memo)) return false;

    return true;
  } catch (e) {
    console.error("verifyPaymentTx error:", e);
    return false;
  }
}
