/**
 * scripts/setup-chain.ts
 *
 * One-shot vault initialization on Solana devnet.
 * Uses the keypairs you already generated:
 *   - ~/.config/solana/id.json                                 (deployer/owner)
 *   - ./agent-keypair.json                                     (agent authority)
 *   - ./programs/agent-vault/target/deploy/agent_vault-keypair.json  (program)
 *   - ./vendors/{openai,rpc,twitter}-vendor.json               (suppliers)
 *
 * Prerequisites (in order):
 *   1. anchor build       (must produce target/idl/agent_vault.json)
 *   2. anchor deploy --provider.cluster devnet
 *   3. bash scripts/sync-idl.sh
 *   4. SOL airdropped to deployer (>=5 SOL) and agent (>=0.5 SOL)
 *
 * Usage:
 *   pnpm tsx scripts/setup-chain.ts
 *   # or
 *   pnpm ts-node scripts/setup-chain.ts
 *
 * What this script does:
 *   1. Loads deployer + agent keypairs
 *   2. Derives vault PDA + vault USDC ATA (deterministic)
 *   3. If vault not yet initialized, calls initialize_vault
 *      with policy: max_per_tx=0.5 USDC, max_per_day=5 USDC,
 *      allowlist=[3 vendor wallets], require_allowlist=false
 *   4. Reads back vault state to verify
 *   5. Prints all addresses you'll need for .env
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Configuration — these match the keypairs you already generated
// ============================================================================
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("5odLqG1PdHNoMExgTVqsybSh3Dh5cxg8xD37BSnWe24N");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// 3 vendors that AlphaScout pays
const VENDORS: Record<string, string> = {
  openai:  "FeTNgxgY88REi6TH7jW6cnmDLBMHw2AtV8a3HUfWdW8M",
  rpc:     "BW1RLwCmpWkWpvxGaMMfgdWT1Z98dBnBkUpX78hqSyJz",
  twitter: "Fq6nTGckY54u6CcJTWRaFfeEyQp69J4Ne4HjBCRVnyZg",
};

// Policy
const MAX_PER_TX = 500_000;           // 0.5 USDC (6 decimals)
const MAX_PER_DAY = 5_000_000;        // 5 USDC
const REQUIRE_ALLOWLIST = false;      // start permissive, tighten via update_policy later
const EXPIRES_AT = 0;                 // never

// ============================================================================
// Helpers
// ============================================================================
function loadKeypair(p: string): Keypair {
  if (!fs.existsSync(p)) {
    throw new Error(`Keypair not found: ${p}`);
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function bold(s: string): string { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string): string { return `\x1b[32m${s}\x1b[0m`; }
function dim(s: string): string { return `\x1b[2m${s}\x1b[0m`; }

// ============================================================================
// Main
// ============================================================================
(async () => {
  console.log(bold("=== AgentPay vault setup (devnet) ==="));

  const repoRoot = path.resolve(__dirname, "..");
  const deployerPath = path.join(os.homedir(), ".config/solana/id.json");
  const agentPath = path.join(repoRoot, "agent-keypair.json");
  const idlPath = path.join(repoRoot, "programs/agent-vault/target/idl/agent_vault.json");

  // ---- 1. Load keypairs ----
  const deployer = loadKeypair(deployerPath);
  const agent = loadKeypair(agentPath);

  console.log(`Deployer : ${deployer.publicKey.toBase58()}`);
  console.log(`Agent    : ${agent.publicKey.toBase58()}`);
  console.log(`Program  : ${PROGRAM_ID.toBase58()}`);
  console.log(`USDC mint: ${USDC_MINT.toBase58()}`);
  console.log("");

  // ---- 2. Connect ----
  const conn = new Connection(RPC_URL, "confirmed");

  // Sanity: deployer has SOL?
  const deployerBalance = await conn.getBalance(deployer.publicKey);
  if (deployerBalance < 0.5e9) {
    throw new Error(
      `Deployer has only ${deployerBalance / 1e9} SOL. ` +
      `Run: solana airdrop 2 ${deployer.publicKey.toBase58()} --url devnet`
    );
  }
  console.log(dim(`Deployer SOL balance: ${(deployerBalance / 1e9).toFixed(3)} SOL`));

  // Sanity: program is deployed?
  const programInfo = await conn.getAccountInfo(PROGRAM_ID);
  if (!programInfo) {
    throw new Error(
      `Program ${PROGRAM_ID.toBase58()} is not deployed on devnet. ` +
      `Run: anchor deploy --provider.cluster devnet`
    );
  }
  console.log(dim("Program is deployed ✓"));

  // ---- 3. Load IDL + create program client ----
  if (!fs.existsSync(idlPath)) {
    throw new Error(
      `IDL not found at ${idlPath}. Run anchor build first, then bash scripts/sync-idl.sh.`
    );
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  // Anchor 0.30: ensure programId is in IDL.address
  idl.address = PROGRAM_ID.toBase58();

  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as any, provider);

  // ---- 4. Derive vault PDA + vault ATA ----
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agent.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const vaultAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

  console.log(`Vault PDA: ${vaultPda.toBase58()} ${dim(`(bump=${vaultBump})`)}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);
  console.log("");

  // ---- 5. Check whether vault is already initialized ----
  const existing = await conn.getAccountInfo(vaultPda);
  if (existing) {
    console.log(green("Vault is already initialized — skipping initialize_vault"));
  } else {
    console.log("Calling initialize_vault...");

    // agent_id: 32 bytes. Use "AlphaScout" zero-padded for clarity.
    const agentId = Buffer.alloc(32);
    Buffer.from("AlphaScout", "utf8").copy(agentId);

    const policy = {
      maxPerTx:  new anchor.BN(MAX_PER_TX),
      maxPerDay: new anchor.BN(MAX_PER_DAY),
      allowlist: Object.values(VENDORS).map(v => new PublicKey(v)),
      requireAllowlist: REQUIRE_ALLOWLIST,
      expiresAt: new anchor.BN(EXPIRES_AT),
    };

    const sig = await program.methods
      .initializeVault(Array.from(agentId), policy)
      .accounts({
        owner: deployer.publicKey,
        agentAuthority: agent.publicKey,
        mint: USDC_MINT,
      })
      .signers([deployer])
      .rpc();

    console.log(green(`initialize_vault tx: ${sig}`));
    console.log(dim(`https://explorer.solana.com/tx/${sig}?cluster=devnet`));
    // Wait an extra confirmation for fetch to succeed
    await conn.confirmTransaction(sig, "confirmed");
  }

  // ---- 6. Read vault state back ----
  // @ts-ignore — anchor 0.30 generates camelCase account names
  const vault = await program.account.agentVault.fetch(vaultPda);
  console.log("");
  console.log(bold("Vault state:"));
  console.log(`  owner       : ${vault.owner.toBase58()}`);
  console.log(`  authority   : ${vault.authority.toBase58()}`);
  console.log(`  mint        : ${vault.mint.toBase58()}`);
  console.log(`  policy.maxPerTx       : ${vault.policy.maxPerTx.toString()}`);
  console.log(`  policy.maxPerDay      : ${vault.policy.maxPerDay.toString()}`);
  console.log(`  policy.requireAllowlist: ${vault.policy.requireAllowlist}`);
  console.log(`  policy.allowlist (${vault.policy.allowlist.length}):`);
  for (const a of vault.policy.allowlist) {
    console.log(`    - ${(a as PublicKey).toBase58()}`);
  }

  // ---- 7. Print next steps ----
  console.log("");
  console.log(bold("=== Next steps ==="));
  console.log(`1. Fund the vault (so dashboard shows balance):`);
  console.log(dim(`   spl-token transfer ${USDC_MINT.toBase58()} 5 ${vaultAta.toBase58()} \\`));
  console.log(dim(`     --fund-recipient --url devnet`));
  console.log("");
  console.log(`2. Verify on explorer:`);
  console.log(dim(`   https://explorer.solana.com/address/${vaultPda.toBase58()}?cluster=devnet`));
  console.log("");
  console.log(`3. Add these to your .env:`);
  console.log(`   PROGRAM_ID=${PROGRAM_ID.toBase58()}`);
  console.log(`   VAULT_ATA=${vaultAta.toBase58()}`);
  console.log(`   NEXT_PUBLIC_PROGRAM_ID=${PROGRAM_ID.toBase58()}`);
  console.log(`   NEXT_PUBLIC_VAULT_AUTHORITY=${agent.publicKey.toBase58()}`);
  console.log(`   NEXT_PUBLIC_VAULT_PDA=${vaultPda.toBase58()}`);
  console.log(`   NEXT_PUBLIC_VAULT_ATA=${vaultAta.toBase58()}`);
  console.log("");
  console.log(green("✓ All done."));
})().catch(e => {
  console.error("\x1b[31m✗ Error:\x1b[0m", e.message || e);
  if (e.logs) console.error(e.logs);
  process.exit(1);
});
