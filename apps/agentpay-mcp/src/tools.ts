import { z } from "zod";
import { VaultManager } from "./vault.js";

export const tools = (vm: VaultManager) => ({
  create_vault: {
    description:
      "Create a new on-chain AgentVault for an AI agent. The vault enforces a spending policy " +
      "(per-tx limit, daily limit, allowlist) directly in the Solana smart contract, so the " +
      "agent cannot exceed these limits even if its LLM is jailbroken or its keypair compromised.",
    inputSchema: z.object({
      agentAuthority: z.string().describe(
        "Solana pubkey (base58) that will sign withdrawals from this vault. The agent holds this keypair.",
      ),
      maxPerTx: z.number().describe(
        "Max USDC per transaction in raw units (6 decimals). E.g., 500000 = 0.5 USDC.",
      ),
      maxPerDay: z.number().describe(
        "Max USDC per rolling day in raw units. E.g., 5000000 = 5 USDC/day.",
      ),
      allowlist: z.array(z.string()).optional().describe(
        "Up to 16 recipient pubkeys this vault is allowed to pay. Optional.",
      ),
      requireAllowlist: z.boolean().optional().describe(
        "If true, withdrawals to non-allowlisted recipients are rejected on-chain. Default false.",
      ),
      expiresAt: z.number().optional().describe(
        "Unix timestamp when policy auto-expires. 0 = never. Default 0.",
      ),
    }),
    handler: async (args: any) => {
      const result = await vm.createVault(args);
      return {
        content: [{
          type: "text",
          text: `Vault created.\n\n` +
                `Vault PDA: ${result.vaultPda}\n` +
                `USDC ATA:  ${result.vaultAta}  (deposit USDC here)\n` +
                `Tx: https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`,
        }],
      };
    },
  },

  get_vault: {
    description:
      "Read the current state of an AgentVault: balance, spending policy, statistics. " +
      "Use this before any spending decision to know what limits apply.",
    inputSchema: z.object({
      agentAuthority: z.string().describe("Agent's signing pubkey (base58)"),
    }),
    handler: async (args: any) => {
      const v = await vm.getVault(args.agentAuthority);
      return {
        content: [{
          type: "text",
          text: `Vault state for agent ${args.agentAuthority}:\n\n` +
                `Balance: ${v.balanceUSDC} USDC (${v.balance} raw)\n\n` +
                `Policy:\n` +
                `  max per tx:  ${(Number(v.policy.maxPerTx) / 1e6).toFixed(2)} USDC\n` +
                `  max per day: ${(Number(v.policy.maxPerDay) / 1e6).toFixed(2)} USDC\n` +
                `  allowlist:   ${v.policy.allowlist.length} entries (${v.policy.requireAllowlist ? "enforced" : "advisory"})\n` +
                `  expires:     ${v.policy.expiresAt === "0" ? "never" : new Date(Number(v.policy.expiresAt) * 1000).toISOString()}\n\n` +
                `Stats:\n` +
                `  total received: ${(Number(v.stats.totalReceived) / 1e6).toFixed(2)} USDC\n` +
                `  total spent:    ${(Number(v.stats.totalSpent) / 1e6).toFixed(2)} USDC\n` +
                `  spent today:    ${(Number(v.stats.spentToday) / 1e6).toFixed(2)} USDC\n` +
                `  spend count:    ${v.stats.spendCount}\n` +
                `  deposit count:  ${v.stats.depositCount}\n\n` +
                `Vault PDA:  https://explorer.solana.com/address/${v.vaultPda}?cluster=devnet\n` +
                `Vault ATA:  https://explorer.solana.com/address/${v.vaultAta}?cluster=devnet`,
        }],
      };
    },
  },

  simulate_payment: {
    description:
      "Check whether a proposed payment would pass the on-chain spending policy WITHOUT actually " +
      "executing it. Use this before calling withdraw to give your user accurate feedback.",
    inputSchema: z.object({
      agentAuthority: z.string(),
      recipient: z.string().describe("Recipient SPL token account (ATA)"),
      amount: z.number().describe("Amount in raw USDC units (6 decimals)"),
    }),
    handler: async (args: any) => {
      const r = await vm.simulatePayment(args);
      return {
        content: [{
          type: "text",
          text: r.allowed
            ? `Payment of ${(args.amount / 1e6).toFixed(6)} USDC would be allowed.`
            : `Payment rejected by policy: ${r.reason}`,
        }],
      };
    },
  },

  update_policy: {
    description:
      "Update the spending policy on an existing vault. Only the vault owner can call this.",
    inputSchema: z.object({
      agentAuthority: z.string(),
      maxPerTx: z.number(),
      maxPerDay: z.number(),
      allowlist: z.array(z.string()).optional(),
      requireAllowlist: z.boolean().optional(),
      expiresAt: z.number().optional(),
    }),
    handler: async (args: any) => {
      const r = await vm.updatePolicy(args);
      return {
        content: [{
          type: "text",
          text: `Policy updated.\nTx: https://explorer.solana.com/tx/${r.txSignature}?cluster=devnet`,
        }],
      };
    },
  },
});
