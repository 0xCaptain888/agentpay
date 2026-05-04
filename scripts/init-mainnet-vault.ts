/**
 * Initialize mainnet vault and execute validation transaction
 *
 * Prerequisites:
 * - MAINNET_PROGRAM_ID env var is set
 * - DEPLOYER_KEYPAIR path (default ~/.config/solana/id.json)
 * - AGENT_KEYPAIR path (default agent-keypair.json, this script will generate)
 * - Wallet has real USDC and SOL
 *
 * Run:
 *   MAINNET_PROGRAM_ID=xxx pnpm tsx scripts/init-mainnet-vault.ts
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
    getOrCreateAssociatedTokenAccount,
    transfer as splTransfer,
    getAccount,
    getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const MAINNET_RPC = process.env.MAINNET_RPC ?? clusterApiUrl("mainnet-beta");
const MAINNET_PROGRAM_ID = new PublicKey(
    process.env.MAINNET_PROGRAM_ID ?? (() => { throw new Error("MAINNET_PROGRAM_ID not set"); })()
);
const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const deployerKeypairPath = process.env.DEPLOYER_KEYPAIR
    ?? path.join(os.homedir(), ".config/solana/id.json");
const deployerKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(deployerKeypairPath, "utf-8")))
);

const agentKeypairPath = process.env.AGENT_KEYPAIR ?? "./agent-mainnet-keypair.json";
let agentKp: Keypair;
if (fs.existsSync(agentKeypairPath)) {
    agentKp = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(agentKeypairPath, "utf-8")))
    );
    console.log(`  Using existing agent keypair: ${agentKp.publicKey.toBase58()}`);
} else {
    agentKp = Keypair.generate();
    fs.writeFileSync(agentKeypairPath, JSON.stringify(Array.from(agentKp.secretKey)));
    console.log(`  Generated new agent keypair: ${agentKp.publicKey.toBase58()}`);
    console.log(`    Saved to: ${agentKeypairPath}`);
}

async function main() {
    const connection = new Connection(MAINNET_RPC, "confirmed");

    console.log("\n=== AgentVault Mainnet Init ===\n");
    console.log(`  Program:  ${MAINNET_PROGRAM_ID.toBase58()}`);
    console.log(`  Deployer: ${deployerKp.publicKey.toBase58()}`);
    console.log(`  Agent:    ${agentKp.publicKey.toBase58()}`);
    console.log(`  Network:  mainnet-beta`);
    console.log(`  USDC:     ${USDC_MINT_MAINNET.toBase58()}`);
    console.log("");

    const deployerUsdcAta = await getOrCreateAssociatedTokenAccount(
        connection, deployerKp, USDC_MINT_MAINNET, deployerKp.publicKey
    );
    const usdcBalance = await getAccount(connection, deployerUsdcAta.address);
    const usdcAmount = Number(usdcBalance.amount) / 1e6;
    console.log(`  Deployer USDC balance: $${usdcAmount.toFixed(2)}`);

    if (usdcAmount < 1) {
        console.error("  ERROR: Insufficient USDC! Need at least $1 USDC for demo");
        console.error(`  Please send USDC to ${deployerUsdcAta.address.toBase58()}`);
        process.exit(1);
    }

    const { AnchorProvider, Program, BN, web3 } = await import("@coral-xyz/anchor");
    const idl = JSON.parse(
        fs.readFileSync("packages/sdk-ts/src/idl/agent_vault.json", "utf-8")
    );

    const provider = new AnchorProvider(
        connection,
        { publicKey: deployerKp.publicKey, signTransaction: async (tx: any) => {
            tx.partialSign(deployerKp);
            return tx;
        }, signAllTransactions: async (txs: any[]) => {
            return txs.map(tx => { tx.partialSign(deployerKp); return tx; });
        }},
        { commitment: "confirmed" }
    );

    const program = new Program({ ...idl, address: MAINNET_PROGRAM_ID.toBase58() } as any, provider);

    const [vaultPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), agentKp.publicKey.toBuffer()],
        MAINNET_PROGRAM_ID
    );
    console.log(`\n  Vault PDA: ${vaultPda.toBase58()}`);
    console.log(`  Explorer: https://explorer.solana.com/address/${vaultPda.toBase58()}`);

    const existingVault = await connection.getAccountInfo(vaultPda);
    if (!existingVault) {
        console.log("\n  [1/3] Creating vault...");
        const agentId = Array.from(agentKp.publicKey.toBuffer());

        const policy = {
            maxPerTx: new BN(500_000),
            maxPerDay: new BN(5_000_000),
            allowlist: [],
            requireAllowlist: false,
            expiresAt: new BN(0),
        };
        const feeBps = 30;

        const txSig = await program.methods
            .initializeVault(agentId, policy, feeBps)
            .accounts({
                owner: deployerKp.publicKey,
                agentAuthority: agentKp.publicKey,
                mint: USDC_MINT_MAINNET,
            })
            .signers([deployerKp])
            .rpc();

        console.log(`  OK: Vault created`);
        console.log(`  Tx: https://explorer.solana.com/tx/${txSig}`);
    } else {
        console.log("\n  [1/3] Vault already exists, skipping creation");
    }

    console.log("\n  [2/3] Depositing USDC to vault...");
    const vaultAta = getAssociatedTokenAddressSync(USDC_MINT_MAINNET, vaultPda, true);

    const depositAmount = BigInt(2_000_000);
    const depositTx = await splTransfer(
        connection,
        deployerKp,
        deployerUsdcAta.address,
        vaultAta,
        deployerKp,
        depositAmount
    );
    console.log(`  OK: Deposited $2.00 USDC to vault`);
    console.log(`  Vault ATA: ${vaultAta.toBase58()}`);
    console.log(`  Tx: https://explorer.solana.com/tx/${depositTx}`);

    console.log("\n  [3/3] Executing demo withdraw (validating policy execution)...");

    const recipientAta = await getOrCreateAssociatedTokenAccount(
        connection, deployerKp, USDC_MINT_MAINNET, deployerKp.publicKey
    );

    const withdrawTx = await program.methods
        .withdraw(new BN(100_000))
        .accounts({
            agentAuthority: agentKp.publicKey,
            mint: USDC_MINT_MAINNET,
            recipientAta: recipientAta.address,
        })
        .signers([agentKp])
        .rpc();

    console.log(`  OK: Demo withdraw 0.1 USDC succeeded (policy execution valid)`);
    console.log(`  Tx: https://explorer.solana.com/tx/${withdrawTx}`);

    const vaultBalance = await getAccount(connection, vaultAta);
    const finalBalance = Number(vaultBalance.amount) / 1e6;

    console.log("\n==============================================");
    console.log("  Mainnet Init Complete!");
    console.log("==============================================\n");
    console.log(`  Program:   https://explorer.solana.com/address/${MAINNET_PROGRAM_ID.toBase58()}`);
    console.log(`  Vault PDA: https://explorer.solana.com/address/${vaultPda.toBase58()}`);
    console.log(`  Vault ATA: https://explorer.solana.com/address/${vaultAta.toBase58()}`);
    console.log(`  Balance:   $${finalBalance.toFixed(2)} USDC`);

    const envContent = `# AgentVault Mainnet Configuration
# Generated by init-mainnet-vault.ts

MAINNET_PROGRAM_ID=${MAINNET_PROGRAM_ID.toBase58()}
MAINNET_VAULT_PDA=${vaultPda.toBase58()}
MAINNET_VAULT_ATA=${vaultAta.toBase58()}
MAINNET_AGENT_AUTHORITY=${agentKp.publicKey.toBase58()}
USDC_MINT_MAINNET=${USDC_MINT_MAINNET.toBase58()}
`;
    fs.writeFileSync(".env.mainnet", envContent);
    console.log("  OK: Config saved to .env.mainnet");
}

main().catch(e => {
    console.error("\nERROR: Init failed:", e.message);
    process.exit(1);
});
