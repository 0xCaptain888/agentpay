import { Connection, PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import { X402PaymentHeader } from "./types";

export interface VerifyOpts {
  connection: Connection;
  expectedRecipient: PublicKey;     // ATA
  expectedAsset: PublicKey;          // mint
  minAmount: bigint;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  txSignature?: string;
  payer?: string;
}

/**
 * Decode the X-PAYMENT header (base64-JSON), submit the signed tx if not yet,
 * then verify it against requirements.
 */
export async function verifyX402Payment(
  headerBase64: string,
  opts: VerifyOpts,
): Promise<VerifyResult> {
  // 1. Decode header
  let parsed: X402PaymentHeader;
  try {
    const json = Buffer.from(headerBase64, "base64").toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "X-PAYMENT header not valid base64-JSON" };
  }

  if (parsed.x402Version !== 1) return { ok: false, reason: "unsupported x402 version" };
  if (parsed.scheme !== "exact") return { ok: false, reason: "only 'exact' scheme supported" };
  if (!parsed.payload?.transaction) return { ok: false, reason: "missing payload.transaction" };

  // 2. Decode tx
  const txBytes = Buffer.from(parsed.payload.transaction, "base64");
  let tx: VersionedTransaction | Transaction;
  let isVersioned = false;
  try {
    tx = VersionedTransaction.deserialize(txBytes);
    isVersioned = true;
  } catch {
    try {
      tx = Transaction.from(txBytes);
    } catch (e: any) {
      return { ok: false, reason: `cannot decode tx: ${e.message}` };
    }
  }

  // 3. Submit (or fetch existing)
  let sig: string;
  try {
    sig = await opts.connection.sendRawTransaction(txBytes, {
      skipPreflight: false,
      maxRetries: 3,
    });
    await opts.connection.confirmTransaction(sig, "confirmed");
  } catch (e: any) {
    // If tx is already confirmed, derive signature from tx
    const errMsg = e.message ?? String(e);
    if (!errMsg.includes("already been processed") && !errMsg.includes("AlreadyProcessed")) {
      return { ok: false, reason: `tx submission failed: ${errMsg}` };
    }
    // try to extract sig from tx
    const sigBytes = isVersioned
      ? (tx as VersionedTransaction).signatures[0]
      : (tx as Transaction).signatures[0]?.signature;
    if (!sigBytes) return { ok: false, reason: "tx has no signature" };
    sig = Buffer.from(sigBytes).toString("base64");
  }

  // 4. Verify on-chain transfer matches requirements
  const txDetails = await opts.connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!txDetails) return { ok: false, reason: "tx not found on-chain" };
  if (txDetails.meta?.err) return { ok: false, reason: `tx failed: ${JSON.stringify(txDetails.meta.err)}` };

  // Walk pre/post token balances to find the transfer to recipient
  const pre = txDetails.meta?.preTokenBalances ?? [];
  const post = txDetails.meta?.postTokenBalances ?? [];
  const accountKeys = txDetails.transaction.message.getAccountKeys
    ? txDetails.transaction.message.getAccountKeys().keySegments().flat()
    : (txDetails.transaction.message as any).accountKeys;

  let delta = 0n;
  for (const p of post) {
    const acct = accountKeys[p.accountIndex];
    if (!acct.equals(opts.expectedRecipient)) continue;
    if (p.mint !== opts.expectedAsset.toBase58()) continue;
    const preEntry = pre.find(x => x.accountIndex === p.accountIndex);
    const preAmt = BigInt(preEntry?.uiTokenAmount.amount ?? "0");
    const postAmt = BigInt(p.uiTokenAmount.amount);
    delta = postAmt - preAmt;
    break;
  }

  if (delta < opts.minAmount) {
    return { ok: false, reason: `insufficient payment: paid ${delta}, required ${opts.minAmount}` };
  }

  // 5. Find payer (first signer)
  let payer: string;
  if (isVersioned) {
    payer = (tx as VersionedTransaction).message.staticAccountKeys[0].toBase58();
  } else {
    payer = (tx as Transaction).feePayer?.toBase58()
      ?? (tx as Transaction).signatures[0]?.publicKey.toBase58()
      ?? "unknown";
  }

  return { ok: true, txSignature: sig, payer };
}
