/**
 * Multi-agent demo script.
 *
 * Orchestrates a full agent-to-agent payment cycle:
 * 1. AlphaScout is running and serving /x402/signals/today
 * 2. DataSink calls AlphaScout, gets 402, pays via x402, receives signals
 * 3. Dashboard shows both vaults updating in real-time
 *
 * Usage:
 *   # Terminal 1: Start AlphaScout
 *   cd apps/alpha-scout && poetry run uvicorn alpha_scout.main:app --port 8000
 *
 *   # Terminal 2: Start Dashboard
 *   cd apps/dashboard && pnpm dev
 *
 *   # Terminal 3: Run this demo
 *   pnpm tsx scripts/multi-agent-demo.ts
 *
 * What this script does:
 *   - Simulates DataSink's tick: call /x402/signals/today, pay, receive
 *   - Prints the full x402 flow with all headers
 *   - Shows the payment on Solana explorer
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

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

async function main() {
  console.log(bold("=== Multi-Agent Demo: DataSink buys from AlphaScout ===\n"));

  // Load buyer keypair (DataSink or default wallet)
  const kpPath = process.env.DATASINK_KEYPAIR_PATH
    || path.join(process.cwd(), "datasink-keypair.json");

  let buyer: Keypair;
  if (fs.existsSync(kpPath)) {
    buyer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, "utf8"))),
    );
    console.log(`Buyer (DataSink): ${buyer.publicKey.toBase58()}`);
  } else {
    // Fallback to default solana wallet
    const defaultPath = path.join(os.homedir(), ".config/solana/id.json");
    buyer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(defaultPath, "utf8"))),
    );
    console.log(`Buyer (default wallet): ${buyer.publicKey.toBase58()}`);
  }

  const conn = new Connection(RPC_URL, "confirmed");

  // Step 1: Call without payment
  console.log(bold("\n--- Step 1: GET /x402/signals/today (no payment) ---"));
  const r1 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`);
  console.log(`Status: ${r1.status}`);

  if (r1.status !== 402) {
    console.log(red(`Expected 402, got ${r1.status}. Is AlphaScout running?`));
    process.exit(1);
  }

  const body402 = await r1.json();
  console.log(`x402Version: ${body402.x402Version}`);
  const req = body402.accepts[0];
  console.log(`Requirement: ${req.maxAmountRequired} raw USDC to ${req.payTo.slice(0, 12)}...`);
  console.log(`Network: ${req.network}`);
  console.log(`Description: ${req.description}`);

  // Step 2: Build payment
  console.log(bold("\n--- Step 2: Build payment transaction ---"));
  const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, buyer.publicKey);
  const recipientAta = new PublicKey(req.payTo);
  const amount = BigInt(req.maxAmountRequired);

  const ix = createTransferCheckedInstruction(
    buyerAta, USDC_MINT, recipientAta,
    buyer.publicKey, amount, 6,
  );
  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: buyer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([buyer]);

  console.log(`Buyer ATA: ${buyerAta.toBase58()}`);
  console.log(`Transfer: ${amount} raw USDC (${Number(amount) / 1e6} USDC)`);
  console.log(`Tx size: ${tx.serialize().length} bytes`);

  // Step 3: Build X-PAYMENT header
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "solana-devnet",
    payload: { transaction: Buffer.from(tx.serialize()).toString("base64") },
  };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  // Step 4: Retry with payment
  console.log(bold("\n--- Step 3: Retry with X-PAYMENT header ---"));
  const r2 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`, {
    headers: { "X-PAYMENT": paymentHeader },
  });
  console.log(`Status: ${r2.status}`);

  if (r2.status === 200) {
    const respHeader = r2.headers.get("X-PAYMENT-RESPONSE");
    if (respHeader) {
      const decoded = JSON.parse(Buffer.from(respHeader, "base64").toString());
      console.log(green(`Payment confirmed!`));
      console.log(`  Tx: ${decoded.transaction}`);
      console.log(`  Payer: ${decoded.payer}`);
      console.log(`  Explorer: https://explorer.solana.com/tx/${decoded.transaction}?cluster=devnet`);
    }

    const signals = await r2.json();
    console.log(`\nReceived ${signals.signals?.length ?? 0} signals`);
    console.log(dim(JSON.stringify(signals, null, 2).slice(0, 300) + "..."));
  } else {
    console.log(red(`Payment failed: ${r2.status}`));
    const errBody = await r2.text();
    console.log(red(errBody));
  }

  console.log(bold("\n=== Demo complete ==="));
}

main().catch(e => {
  console.error(red("Demo failed:"), e);
  process.exit(1);
});
