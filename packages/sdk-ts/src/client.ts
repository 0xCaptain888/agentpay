import { Program, AnchorProvider, BN, web3 } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export interface SpendingPolicyInput {
  maxPerTx: bigint;
  maxPerDay: bigint;
  allowlist?: PublicKey[];
  requireAllowlist?: boolean;
  expiresAt?: bigint;
}

export class AgentPayClient {
  public program: Program;
  public connection: Connection;
  public usdcMint: PublicKey;

  constructor(opts: {
    rpcUrl: string;
    walletAdapter: any;
    programId: PublicKey;
    usdcMint: PublicKey;
    idl: any;
  }) {
    this.connection = new Connection(opts.rpcUrl, "confirmed");
    const provider = new AnchorProvider(this.connection, opts.walletAdapter, {});
    // Anchor 0.30 API: inject programId into IDL's address field
    const idlWithAddress = {
      ...opts.idl,
      address: opts.programId.toBase58(),
    };
    this.program = new Program(idlWithAddress as any, provider);
    this.usdcMint = opts.usdcMint;
  }

  vaultPda(agentAuthority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentAuthority.toBuffer()],
      this.program.programId
    );
  }

  vaultAta(agentAuthority: PublicKey): PublicKey {
    const [vault] = this.vaultPda(agentAuthority);
    return getAssociatedTokenAddressSync(this.usdcMint, vault, true);
  }

  async createVault(
    agentAuthority: PublicKey,
    agentId: Buffer,
    policy: SpendingPolicyInput
  ): Promise<string> {
    return await this.program.methods
      .initializeVault(Array.from(agentId), {
        maxPerTx: new BN(policy.maxPerTx.toString()),
        maxPerDay: new BN(policy.maxPerDay.toString()),
        allowlist: policy.allowlist ?? [],
        requireAllowlist: policy.requireAllowlist ?? false,
        expiresAt: new BN((policy.expiresAt ?? 0n).toString()),
      })
      .accounts({ agentAuthority, mint: this.usdcMint })
      .rpc();
  }

  async getVault(agentAuthority: PublicKey) {
    const [pda] = this.vaultPda(agentAuthority);
    return await this.program.account.agentVault.fetch(pda);
  }

  /** Build a USDC payment instruction to a vault (for payer to call) */
  buildPaymentIx(opts: {
    payer: PublicKey;
    payerAta: PublicKey;
    recipientVaultAuthority: PublicKey;
    amount: bigint;
  }): web3.TransactionInstruction {
    const recipientAta = this.vaultAta(opts.recipientVaultAuthority);
    return createTransferCheckedInstruction(
      opts.payerAta, this.usdcMint, recipientAta,
      opts.payer, opts.amount, 6
    );
  }
}
