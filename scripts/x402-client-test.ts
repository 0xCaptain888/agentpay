/**
 * Test that AlphaScout's /x402/signals/today endpoint is callable
 * by a standard x402 client. We simulate the client manually here
 * since we don't have @x402/fetch installed in this monorepo.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const ALPHASCOUT_URL = process.env.ALPHASCOUT_URL || "http://localhost:8000";
const RPC_URL = "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

async function main() {
  // 1. First call -> expect 402
  console.log("Step 1: Call without payment");
  const r1 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`);
  console.log("  Status:", r1.status);
  const body1 = await r1.json();
  console.log("  Body:", JSON.stringify(body1, null, 2));

  if (r1.status !== 402) {
    throw new Error(`Expected 402, got ${r1.status}`);
  }
  if (body1.x402Version !== 1) {
    throw new Error("Response not x402-compliant");
  }

  const requirement = body1.accepts[0];
  console.log("\nStep 2: Build payment tx");

  // 2. Build payment tx
  const conn = new Connection(RPC_URL, "confirmed");
  const buyerPath = path.join(os.homedir(), ".config/solana/id.json");
  const buyer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(buyerPath, "utf8"))),
  );
  const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer.publicKey);
  const recipientAta = new PublicKey(requirement.payTo);

  const ix = createTransferCheckedInstruction(
    buyerAta,
    USDC_MINT,
    recipientAta,
    buyer.publicKey,
    BigInt(requirement.maxAmountRequired),
    6,
  );
  const { blockhash } = await conn.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: buyer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([buyer]);

  // 3. Build X-PAYMENT header
  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "solana-devnet",
    payload: { transaction: txBase64 },
  };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  // 4. Retry with X-PAYMENT
  console.log("\nStep 3: Retry with X-PAYMENT");
  const r2 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`, {
    headers: { "X-PAYMENT": paymentHeader },
  });
  console.log("  Status:", r2.status);
  const responseHeader = r2.headers.get("X-PAYMENT-RESPONSE");
  if (responseHeader) {
    const decoded = JSON.parse(Buffer.from(responseHeader, "base64").toString());
    console.log("  X-PAYMENT-RESPONSE:", decoded);
  }
  const body2 = await r2.json();
  console.log("  Body:", JSON.stringify(body2, null, 2).slice(0, 200) + "...");

  if (r2.status !== 200) {
    throw new Error(`Expected 200, got ${r2.status}`);
  }
  console.log("\nx402 protocol compliance verified");
}

main().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
