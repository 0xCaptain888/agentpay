import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentVault } from "../target/types/agent_vault";
import {
  createMint, mintTo, getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("agent-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.AgentVault as Program<AgentVault>;

  let mint: anchor.web3.PublicKey;
  let owner = provider.wallet;
  let agentAuthority = anchor.web3.Keypair.generate();
  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;
  let vaultAta: anchor.web3.PublicKey;

  before(async () => {
    // airdrop SOL to agent
    const sig = await provider.connection.requestAirdrop(
      agentAuthority.publicKey, 1e9
    );
    await provider.connection.confirmTransaction(sig);

    // create mock USDC mint (6 decimals like real USDC)
    mint = await createMint(
      provider.connection, (owner as any).payer,
      owner.publicKey, null, 6
    );

    [vaultPda, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), agentAuthority.publicKey.toBuffer()],
      program.programId
    );
  });

  it("initializes a vault", async () => {
    const policy = {
      maxPerTx: new anchor.BN(500_000),       // 0.5 USDC
      maxPerDay: new anchor.BN(5_000_000),    // 5 USDC
      allowlist: [],
      requireAllowlist: false,
      expiresAt: new anchor.BN(0),
    };
    const agentId = new Array(32).fill(1);

    await program.methods
      .initializeVault(agentId, policy)
      .accounts({
        owner: owner.publicKey,
        agentAuthority: agentAuthority.publicKey,
        mint,
      })
      .rpc();

    const vault = await program.account.agentVault.fetch(vaultPda);
    assert.equal(vault.policy.maxPerTx.toNumber(), 500_000);
    assert.equal(vault.policy.maxPerDay.toNumber(), 5_000_000);
    assert.equal(vault.owner.toBase58(), owner.publicKey.toBase58());
    assert.equal(vault.authority.toBase58(), agentAuthority.publicKey.toBase58());
  });

  it("rejects withdrawal exceeding per-tx limit", async () => {
    // Mint some USDC to vault_ata first
    const vaultAtaAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, vaultPda, true
    );
    vaultAta = vaultAtaAccount.address;

    await mintTo(
      provider.connection, (owner as any).payer,
      mint, vaultAta, owner.publicKey, 10_000_000 // 10 USDC
    );

    // Create recipient ATA
    const recipient = anchor.web3.Keypair.generate();
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, recipient.publicKey
    );

    // Try to withdraw 1 USDC (> 0.5 USDC limit)
    try {
      await program.methods.withdraw(new anchor.BN(1_000_000))
        .accounts({
          agentAuthority: agentAuthority.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          recipientAta: recipientAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([agentAuthority])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "ExceedsTxLimit");
    }
  });

  it("allows withdrawal within limit", async () => {
    const recipient = anchor.web3.Keypair.generate();
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, recipient.publicKey
    );

    // Withdraw 0.1 USDC (within 0.5 limit)
    await program.methods.withdraw(new anchor.BN(100_000))
      .accounts({
        agentAuthority: agentAuthority.publicKey,
        vault: vaultPda,
        vaultAta: vaultAta,
        recipientAta: recipientAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([agentAuthority])
      .rpc();

    const vault = await program.account.agentVault.fetch(vaultPda);
    assert.equal(vault.stats.spendCount.toNumber(), 1);
    assert.equal(vault.stats.totalSpent.toNumber(), 100_000);
  });

  it("enforces daily limit", async () => {
    const recipient = anchor.web3.Keypair.generate();
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, recipient.publicKey
    );

    // Try to withdraw amounts that would exceed daily limit
    // Already spent 100_000, daily limit is 5_000_000
    // Withdraw 0.5 USDC x 10 = would exceed
    for (let i = 0; i < 9; i++) {
      await program.methods.withdraw(new anchor.BN(500_000))
        .accounts({
          agentAuthority: agentAuthority.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          recipientAta: recipientAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([agentAuthority])
        .rpc();
    }

    // Next withdrawal should exceed daily limit (spent: 100_000 + 9*500_000 = 4_600_000)
    // One more 500_000 = 5_100_000 > 5_000_000
    try {
      await program.methods.withdraw(new anchor.BN(500_000))
        .accounts({
          agentAuthority: agentAuthority.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          recipientAta: recipientAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([agentAuthority])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "ExceedsDailyLimit");
    }
  });

  it("enforces allowlist when required", async () => {
    // Update policy to require allowlist
    const allowedRecipient = anchor.web3.Keypair.generate();
    const newPolicy = {
      maxPerTx: new anchor.BN(500_000),
      maxPerDay: new anchor.BN(5_000_000),
      allowlist: [allowedRecipient.publicKey],
      requireAllowlist: true,
      expiresAt: new anchor.BN(0),
    };

    await program.methods.updatePolicy(newPolicy)
      .accounts({
        owner: owner.publicKey,
        vault: vaultPda,
      })
      .rpc();

    // Try to withdraw to non-allowlisted recipient
    const notAllowed = anchor.web3.Keypair.generate();
    const notAllowedAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, notAllowed.publicKey
    );

    try {
      await program.methods.withdraw(new anchor.BN(100_000))
        .accounts({
          agentAuthority: agentAuthority.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          recipientAta: notAllowedAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([agentAuthority])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "NotAllowlisted");
    }
  });

  it("respects policy expiry", async () => {
    // Update policy with expired timestamp
    const expiredPolicy = {
      maxPerTx: new anchor.BN(500_000),
      maxPerDay: new anchor.BN(5_000_000),
      allowlist: [],
      requireAllowlist: false,
      expiresAt: new anchor.BN(1), // Unix timestamp 1 = already expired
    };

    await program.methods.updatePolicy(expiredPolicy)
      .accounts({
        owner: owner.publicKey,
        vault: vaultPda,
      })
      .rpc();

    const recipient = anchor.web3.Keypair.generate();
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, recipient.publicKey
    );

    try {
      await program.methods.withdraw(new anchor.BN(100_000))
        .accounts({
          agentAuthority: agentAuthority.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          recipientAta: recipientAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([agentAuthority])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: any) {
      assert.include(e.toString(), "PolicyExpired");
    }
  });

  it("allows emergency withdraw by owner", async () => {
    // Reset policy first
    const resetPolicy = {
      maxPerTx: new anchor.BN(500_000),
      maxPerDay: new anchor.BN(5_000_000),
      allowlist: [],
      requireAllowlist: false,
      expiresAt: new anchor.BN(0),
    };
    await program.methods.updatePolicy(resetPolicy)
      .accounts({ owner: owner.publicKey, vault: vaultPda })
      .rpc();

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, (owner as any).payer,
      mint, owner.publicKey
    );

    const balanceBefore = await provider.connection.getTokenAccountBalance(vaultAta);
    const amount = Math.floor(parseInt(balanceBefore.value.amount) / 2);

    if (amount > 0) {
      await program.methods.emergencyWithdraw(new anchor.BN(amount))
        .accounts({
          owner: owner.publicKey,
          vault: vaultPda,
          vaultAta: vaultAta,
          ownerAta: ownerAta.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const balanceAfter = await provider.connection.getTokenAccountBalance(vaultAta);
      assert.isTrue(
        parseInt(balanceAfter.value.amount) < parseInt(balanceBefore.value.amount)
      );
    }
  });
});
