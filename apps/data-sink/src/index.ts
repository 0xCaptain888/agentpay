/**
 * DataSink — a minimal agent that consumes AlphaScout's signals.
 *
 * Loop:
 *  1. Call AlphaScout /x402/signals/today
 *  2. If 402: build payment tx via AgentVault.withdraw, retry
 *  3. Cache signals locally
 *
 * Demonstrates: agent-to-agent commerce mediated by on-chain spending policy.
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

const ALPHASCOUT_URL = process.env.ALPHASCOUT_URL || "http://localhost:8000";
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const KEYPAIR_PATH = process.env.DATASINK_KEYPAIR_PATH || "./datasink-keypair.json";
const SIGNALS_FILE = path.resolve(process.cwd(), "datasink-signals.jsonl");
const POLL_INTERVAL_MS = 30 * 60 * 1000;  // 30 min

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function loadKp(p: string) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

async function tick() {
  const datasink = loadKp(KEYPAIR_PATH);
  const conn = new Connection(RPC_URL, "confirmed");

  // 1. Try without payment
  log(`Calling AlphaScout for today's signals...`);
  const r1 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`);

  if (r1.status === 200) {
    log("Got signals without payment (free?)");
    const data = await r1.json();
    fs.appendFileSync(SIGNALS_FILE, JSON.stringify({ ts: Date.now(), data }) + "\n");
    return;
  }

  if (r1.status !== 402) {
    log(`Unexpected status: ${r1.status}`);
    return;
  }

  const requirement = (await r1.json()).accepts[0];
  const amount = BigInt(requirement.maxAmountRequired);
  const recipientAta = new PublicKey(requirement.payTo);
  log(`Payment required: ${amount} USDC to ${recipientAta.toBase58().slice(0, 8)}...`);

  // 2. Build payment tx — direct SPL transfer from datasink's ATA
  const datasinkAta = getAssociatedTokenAddressSync(USDC_MINT, datasink.publicKey);
  const ix = createTransferCheckedInstruction(
    datasinkAta,
    USDC_MINT,
    recipientAta,
    datasink.publicKey,
    amount,
    6,
  );
  const { blockhash } = await conn.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: datasink.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([datasink]);

  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  const paymentHeader = Buffer.from(JSON.stringify({
    x402Version: 1,
    scheme: "exact",
    network: "solana-devnet",
    payload: { transaction: txBase64 },
  })).toString("base64");

  // 3. Retry
  log("Retrying with X-PAYMENT...");
  const r2 = await fetch(`${ALPHASCOUT_URL}/x402/signals/today`, {
    headers: { "X-PAYMENT": paymentHeader },
  });

  if (r2.status !== 200) {
    log(`Payment failed: ${r2.status} ${await r2.text()}`);
    return;
  }

  const respHeader = r2.headers.get("X-PAYMENT-RESPONSE");
  if (respHeader) {
    const decoded = JSON.parse(Buffer.from(respHeader, "base64").toString());
    log(`Paid! Tx: ${decoded.transaction}`);
  }

  const data = await r2.json();
  fs.appendFileSync(SIGNALS_FILE, JSON.stringify({ ts: Date.now(), data }) + "\n");
  log(`Cached ${(data.signals?.length ?? 0)} signals.`);
}

async function main() {
  log("DataSink starting...");
  log(`Authority: ${loadKp(KEYPAIR_PATH).publicKey.toBase58()}`);
  log(`Polling AlphaScout every ${POLL_INTERVAL_MS / 60000} min`);

  // First tick after 5s
  setTimeout(tick, 5_000);

  // Then every interval
  setInterval(() => tick().catch(e => log(`Error: ${e}`)), POLL_INTERVAL_MS);
}

main();
