/**
 * Thin wrapper around the AgentPay Anchor program for MCP tool consumption.
 * Loads keypair from env, derives PDAs, calls instructions.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s",
);
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

// Load IDL — we expect it to be at packages/sdk-ts/src/idl/agent_vault.json
function loadIdl() {
  const candidates = [
    path.resolve(process.cwd(), "../../packages/sdk-ts/src/idl/agent_vault.json"),
    path.resolve(process.cwd(), "packages/sdk-ts/src/idl/agent_vault.json"),
    path.resolve(process.cwd(), "../sdk-ts/src/idl/agent_vault.json"),
    process.env.IDL_PATH || "",
  ].filter(Boolean);

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      const idl = JSON.parse(fs.readFileSync(p, "utf8"));
      idl.address = PROGRAM_ID.toBase58();
      return idl;
    }
  }
  throw new Error(
    "Could not find agent_vault IDL. Set IDL_PATH env var to point to it.",
  );
}

function loadOwnerKeypair(): Keypair {
  // Owner = the wallet running the MCP server (likely user's solana cli wallet)
  const p = process.env.MCP_OWNER_KEYPAIR_PATH
    || `${process.env.HOME}/.config/solana/id.json`;
  if (!fs.existsSync(p)) {
    throw new Error(`Owner keypair not found at ${p}. Set MCP_OWNER_KEYPAIR_PATH.`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))),
  );
}

export class VaultManager {
  conn: Connection;
  owner: Keypair;
  program: anchor.Program;

  constructor() {
    this.conn = new Connection(RPC_URL, "confirmed");
    this.owner = loadOwnerKeypair();
    const wallet = new anchor.Wallet(this.owner);
    const provider = new anchor.AnchorProvider(this.conn, wallet, {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);
    this.program = new anchor.Program(loadIdl() as any, provider);
  }

  vaultPda(agentAuthority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentAuthority.toBuffer()],
      PROGRAM_ID,
    );
  }

  vaultAta(vaultPda: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);
  }

  async createVault(input: {
    agentAuthority: string;
    maxPerTx: number;
    maxPerDay: number;
    allowlist?: string[];
    requireAllowlist?: boolean;
    expiresAt?: number;
  }): Promise<{ vaultPda: string; vaultAta: string; txSignature: string }> {
    const authPk = new PublicKey(input.agentAuthority);
    const [vaultPda] = this.vaultPda(authPk);
    const vaultAta = this.vaultAta(vaultPda);

    // Check if exists
    const existing = await this.conn.getAccountInfo(vaultPda);
    if (existing) {
      return {
        vaultPda: vaultPda.toBase58(),
        vaultAta: vaultAta.toBase58(),
        txSignature: "(already initialized)",
      };
    }

    const agentId = Buffer.alloc(32);
    Buffer.from("MCP-created", "utf8").copy(agentId);

    const policy = {
      maxPerTx: new anchor.BN(input.maxPerTx),
      maxPerDay: new anchor.BN(input.maxPerDay),
      allowlist: (input.allowlist ?? []).map(a => new PublicKey(a)),
      requireAllowlist: input.requireAllowlist ?? false,
      expiresAt: new anchor.BN(input.expiresAt ?? 0),
    };

    const sig = await this.program.methods
      .initializeVault(Array.from(agentId), policy)
      .accounts({
        owner: this.owner.publicKey,
        agentAuthority: authPk,
        mint: USDC_MINT,
      })
      .signers([this.owner])
      .rpc();

    await this.conn.confirmTransaction(sig, "confirmed");
    return {
      vaultPda: vaultPda.toBase58(),
      vaultAta: vaultAta.toBase58(),
      txSignature: sig,
    };
  }

  async getVault(agentAuthority: string): Promise<any> {
    const authPk = new PublicKey(agentAuthority);
    const [vaultPda] = this.vaultPda(authPk);
    const vaultAta = this.vaultAta(vaultPda);

    // @ts-ignore
    const v = await this.program.account.agentVault.fetch(vaultPda);
    let balance = 0n;
    try {
      const bal = await this.conn.getTokenAccountBalance(vaultAta);
      balance = BigInt(bal.value.amount);
    } catch {
      // ATA might not be initialized
    }

    return {
      vaultPda: vaultPda.toBase58(),
      vaultAta: vaultAta.toBase58(),
      owner: v.owner.toBase58(),
      authority: v.authority.toBase58(),
      mint: v.mint.toBase58(),
      balance: balance.toString(),
      balanceUSDC: (Number(balance) / 1e6).toFixed(6),
      policy: {
        maxPerTx: v.policy.maxPerTx.toString(),
        maxPerDay: v.policy.maxPerDay.toString(),
        allowlist: v.policy.allowlist.map((p: PublicKey) => p.toBase58()),
        requireAllowlist: v.policy.requireAllowlist,
        expiresAt: v.policy.expiresAt.toString(),
      },
      stats: {
        totalReceived: v.stats.totalReceived.toString(),
        totalSpent: v.stats.totalSpent.toString(),
        spentToday: v.stats.spentToday.toString(),
        currentDay: v.stats.currentDay.toString(),
        spendCount: v.stats.spendCount.toString(),
        depositCount: v.stats.depositCount.toString(),
      },
    };
  }

  async simulatePayment(input: {
    agentAuthority: string;
    recipient: string;
    amount: number;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const v = await this.getVault(input.agentAuthority);
    const amt = BigInt(input.amount);
    const maxTx = BigInt(v.policy.maxPerTx);
    const maxDay = BigInt(v.policy.maxPerDay);
    const spentToday = BigInt(v.stats.spentToday);

    if (amt > maxTx) {
      return { allowed: false, reason: `Exceeds per-tx limit (${maxTx})` };
    }
    if (spentToday + amt > maxDay) {
      return {
        allowed: false,
        reason: `Would exceed daily limit (${maxDay}, ${spentToday} already spent today)`,
      };
    }
    if (v.policy.requireAllowlist && !v.policy.allowlist.includes(input.recipient)) {
      return { allowed: false, reason: "Recipient not in allowlist" };
    }
    if (BigInt(v.policy.expiresAt) > 0n && BigInt(v.policy.expiresAt) < BigInt(Math.floor(Date.now() / 1000))) {
      return { allowed: false, reason: "Policy expired" };
    }
    return { allowed: true };
  }

  async updatePolicy(input: {
    agentAuthority: string;
    maxPerTx: number;
    maxPerDay: number;
    allowlist?: string[];
    requireAllowlist?: boolean;
    expiresAt?: number;
  }): Promise<{ txSignature: string }> {
    const authPk = new PublicKey(input.agentAuthority);
    const [vaultPda] = this.vaultPda(authPk);

    const newPolicy = {
      maxPerTx: new anchor.BN(input.maxPerTx),
      maxPerDay: new anchor.BN(input.maxPerDay),
      allowlist: (input.allowlist ?? []).map(a => new PublicKey(a)),
      requireAllowlist: input.requireAllowlist ?? false,
      expiresAt: new anchor.BN(input.expiresAt ?? 0),
    };

    const sig = await this.program.methods
      .updatePolicy(newPolicy)
      .accounts({ owner: this.owner.publicKey, vault: vaultPda })
      .signers([this.owner])
      .rpc();

    return { txSignature: sig };
  }
}
