import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentVault } from "../target/types/agent_vault";
import {
    createMint, mintTo, getOrCreateAssociatedTokenAccount,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("security: edge cases and attack vectors", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.AgentVault as Program<AgentVault>;

    let mint: anchor.web3.PublicKey;
    let owner = provider.wallet;

    before(async () => {
        mint = await createMint(
            provider.connection, (owner as any).payer,
            owner.publicKey, null, 6
        );
    });

    // TEST GROUP 1: Overflow / Boundary Conditions

    it("SECURITY: rejects amount = 0 (no-op drain attempt)", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);

        const agentId = new Array(32).fill(2);
        const policy = {
            maxPerTx: new anchor.BN(500_000),
            maxPerDay: new anchor.BN(5_000_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };

        await program.methods.initializeVault(agentId, policy, 30)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
            program.programId
        );
        const vaultAta = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, vaultPda, true
        );
        await mintTo(
            provider.connection, (owner as any).payer,
            mint, vaultAta.address, owner.publicKey, 1_000_000
        );
        const recipient = anchor.web3.Keypair.generate();
        const recipientAta = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, recipient.publicKey
        );

        await program.methods.withdraw(new anchor.BN(0))
            .accounts({
                agentAuthority: agentKp.publicKey,
                vault: vaultPda,
                vaultAta: vaultAta.address,
                recipientAta: recipientAta.address,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([agentKp])
            .rpc();

        const vault = await program.account.agentVault.fetch(vaultPda);
        assert.equal(vault.stats.totalSpent.toNumber(), 0);
    });

    it("SECURITY: u64 MAX amount is rejected by per-tx limit (no overflow)", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);

        const agentId = new Array(32).fill(3);
        const policy = {
            maxPerTx: new anchor.BN(500_000),
            maxPerDay: new anchor.BN(5_000_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };
        await program.methods.initializeVault(agentId, policy, 30)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
            program.programId
        );
        const recipient = anchor.web3.Keypair.generate();
        const recipientAta = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, recipient.publicKey
        );

        const U64_MAX = new anchor.BN("18446744073709551615");
        try {
            await program.methods.withdraw(U64_MAX)
                .accounts({
                    agentAuthority: agentKp.publicKey,
                    vault: vaultPda,
                    vaultAta: (await getOrCreateAssociatedTokenAccount(
                        provider.connection, (owner as any).payer, mint, vaultPda, true
                    )).address,
                    recipientAta: recipientAta.address,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([agentKp])
                .rpc();
            assert.fail("should have been rejected by ExceedsTxLimit");
        } catch (e: any) {
            assert.include(e.toString(), "ExceedsTxLimit");
        }
    });

    // TEST GROUP 2: Authorization Attacks

    it("SECURITY: non-owner cannot call update_policy", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        const attacker = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);
        await provider.connection.requestAirdrop(attacker.publicKey, 1e9);

        const agentId = new Array(32).fill(4);
        const policy = {
            maxPerTx: new anchor.BN(500_000),
            maxPerDay: new anchor.BN(5_000_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };
        await program.methods.initializeVault(agentId, policy, 30)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
            program.programId
        );

        const unlimitedPolicy = {
            maxPerTx: new anchor.BN(Number.MAX_SAFE_INTEGER),
            maxPerDay: new anchor.BN(Number.MAX_SAFE_INTEGER),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };

        try {
            await program.methods.updatePolicy(unlimitedPolicy)
                .accounts({ owner: attacker.publicKey, vault: vaultPda })
                .signers([attacker])
                .rpc();
            assert.fail("attacker should not be able to update policy");
        } catch (e: any) {
            assert.include(e.toString(), "Unauthorized");
        }
    });

    it("SECURITY: agent_authority cannot call emergency_withdraw", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);

        const agentId = new Array(32).fill(5);
        const policy = {
            maxPerTx: new anchor.BN(500_000),
            maxPerDay: new anchor.BN(5_000_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };
        await program.methods.initializeVault(agentId, policy, 30)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
            program.programId
        );
        const vaultAtaAcc = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, vaultPda, true
        );
        await mintTo(
            provider.connection, (owner as any).payer,
            mint, vaultAtaAcc.address, owner.publicKey, 1_000_000
        );
        const agentOwnAta = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, agentKp.publicKey
        );

        try {
            await program.methods.emergencyWithdraw(new anchor.BN(1_000_000))
                .accounts({
                    owner: agentKp.publicKey,
                    vault: vaultPda,
                    vaultAta: vaultAtaAcc.address,
                    ownerAta: agentOwnAta.address,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([agentKp])
                .rpc();
            assert.fail("agent should not be able to emergency_withdraw");
        } catch (e: any) {
            assert.include(e.toString(), "Unauthorized");
        }
    });

    it("SECURITY: wrong vault PDA is rejected (seed mismatch)", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        const otherAgent = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);
        await provider.connection.requestAirdrop(otherAgent.publicKey, 1e9);

        const agentId = new Array(32).fill(6);
        const policy = {
            maxPerTx: new anchor.BN(500_000),
            maxPerDay: new anchor.BN(5_000_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };
        await program.methods.initializeVault(agentId, policy, 30)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [wrongVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), otherAgent.publicKey.toBuffer()],
            program.programId
        );

        try {
            await program.methods.withdraw(new anchor.BN(100_000))
                .accounts({
                    agentAuthority: agentKp.publicKey,
                    vault: wrongVaultPda,
                    vaultAta: anchor.web3.PublicKey.default,
                    recipientAta: anchor.web3.PublicKey.default,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([agentKp])
                .rpc();
            assert.fail("cross-vault drain should fail");
        } catch (e: any) {
            assert.ok(e);
        }
    });

    // TEST GROUP 3: Daily Limit Rolling Window

    it("SECURITY: daily limit accumulates across multiple small withdrawals", async () => {
        const agentKp = anchor.web3.Keypair.generate();
        await provider.connection.requestAirdrop(agentKp.publicKey, 1e9);

        const agentId = new Array(32).fill(7);
        const policy = {
            maxPerTx: new anchor.BN(100_000),
            maxPerDay: new anchor.BN(250_000),
            allowlist: [], requireAllowlist: false,
            expiresAt: new anchor.BN(0),
        };
        await program.methods.initializeVault(agentId, policy, 0)
            .accounts({ owner: owner.publicKey, agentAuthority: agentKp.publicKey, mint })
            .rpc();

        const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
            program.programId
        );
        const vaultAtaAcc = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, vaultPda, true
        );
        await mintTo(
            provider.connection, (owner as any).payer,
            mint, vaultAtaAcc.address, owner.publicKey, 10_000_000
        );
        const recipient = anchor.web3.Keypair.generate();
        const recipientAta = await getOrCreateAssociatedTokenAccount(
            provider.connection, (owner as any).payer, mint, recipient.publicKey
        );

        const withdrawArgs = {
            accounts: {
                agentAuthority: agentKp.publicKey,
                vault: vaultPda,
                vaultAta: vaultAtaAcc.address,
                recipientAta: recipientAta.address,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
            signers: [agentKp],
        };

        await program.methods.withdraw(new anchor.BN(100_000)).accounts(withdrawArgs.accounts).signers([agentKp]).rpc();
        await program.methods.withdraw(new anchor.BN(100_000)).accounts(withdrawArgs.accounts).signers([agentKp]).rpc();

        try {
            await program.methods.withdraw(new anchor.BN(100_000)).accounts(withdrawArgs.accounts).signers([agentKp]).rpc();
            assert.fail("should have hit daily limit");
        } catch (e: any) {
            assert.include(e.toString(), "ExceedsDailyLimit");
        }

        const vault = await program.account.agentVault.fetch(vaultPda);
        assert.equal(vault.stats.spentToday.toNumber(), 200_000);
        assert.equal(vault.stats.spendCount.toNumber(), 2);
    });
});
