/**
 * Initialize the second agent vault: DataSink.
 * Pre-req: ./datasink-keypair.json exists.
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const RPC_URL = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s");
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// AlphaScout's vault authority — we put its ATA in DataSink's allowlist
const ALPHASCOUT_AUTHORITY = "AMXPUnYM84faY4pXMjyhSBV56AS9yRZwFfqgHdkj6DXT";

function loadKp(p: string) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

(async () => {
  const repoRoot = path.resolve(__dirname, "..");
  const deployer = loadKp(path.join(os.homedir(), ".config/solana/id.json"));
  const datasink = loadKp(path.join(repoRoot, "datasink-keypair.json"));
  const idl = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "programs/agent-vault/target/idl/agent_vault.json"), "utf8"),
  );
  idl.address = PROGRAM_ID.toBase58();

  const conn = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as any, provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), datasink.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const vaultAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);

  console.log("DataSink authority:", datasink.publicKey.toBase58());
  console.log("DataSink vault PDA:", vaultPda.toBase58());
  console.log("DataSink vault ATA:", vaultAta.toBase58());

  // Compute AlphaScout's vault ATA (target of allowlist)
  const alphaAuth = new PublicKey(ALPHASCOUT_AUTHORITY);
  const [alphaPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), alphaAuth.toBuffer()],
    PROGRAM_ID,
  );
  const alphaAta = getAssociatedTokenAddressSync(USDC_MINT, alphaPda, true);
  console.log("AlphaScout ATA (allowlisted):", alphaAta.toBase58());

  const existing = await conn.getAccountInfo(vaultPda);
  if (existing) {
    console.log("DataSink vault already initialized — skipping");
  } else {
    const agentId = Buffer.alloc(32);
    Buffer.from("DataSink", "utf8").copy(agentId);

    const policy = {
      maxPerTx: new anchor.BN(50_000),         // 0.05 USDC per call max
      maxPerDay: new anchor.BN(1_000_000),     // 1 USDC/day total
      allowlist: [alphaAta],                    // can ONLY pay AlphaScout's vault
      requireAllowlist: true,                   // strict
      expiresAt: new anchor.BN(0),
    };

    const sig = await program.methods
      .initializeVault(Array.from(agentId), policy)
      .accounts({
        owner: deployer.publicKey,
        agentAuthority: datasink.publicKey,
        mint: USDC_MINT,
      })
      .signers([deployer])
      .rpc();

    await conn.confirmTransaction(sig, "confirmed");
    console.log(`Initialized: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  }

  console.log("\nNext: fund DataSink with 1 USDC:");
  console.log(`  spl-token transfer 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU 1 ${vaultAta.toBase58()} --fund-recipient --url devnet`);
})().catch(e => { console.error(e); process.exit(1); });
