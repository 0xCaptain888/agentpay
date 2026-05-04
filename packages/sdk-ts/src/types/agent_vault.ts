import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export type AgentVault = {
  version: "0.1.0";
  name: "agent_vault";
  instructions: [
    {
      name: "initializeVault";
      accounts: [
        { name: "owner"; isMut: true; isSigner: true },
        { name: "agentAuthority"; isMut: false; isSigner: false },
        { name: "mint"; isMut: false; isSigner: false },
        { name: "vault"; isMut: true; isSigner: false },
        { name: "vaultAta"; isMut: true; isSigner: false },
        { name: "systemProgram"; isMut: false; isSigner: false },
        { name: "tokenProgram"; isMut: false; isSigner: false },
        { name: "associatedTokenProgram"; isMut: false; isSigner: false },
        { name: "rent"; isMut: false; isSigner: false }
      ];
      args: [
        { name: "agentId"; type: { array: ["u8", 32] } },
        { name: "policy"; type: { defined: "SpendingPolicy" } }
      ];
    },
    {
      name: "withdraw";
      accounts: [
        { name: "agentAuthority"; isMut: false; isSigner: true },
        { name: "vault"; isMut: true; isSigner: false },
        { name: "vaultAta"; isMut: true; isSigner: false },
        { name: "recipientAta"; isMut: true; isSigner: false },
        { name: "tokenProgram"; isMut: false; isSigner: false }
      ];
      args: [{ name: "amount"; type: "u64" }];
    },
    {
      name: "updatePolicy";
      accounts: [
        { name: "owner"; isMut: false; isSigner: true },
        { name: "vault"; isMut: true; isSigner: false }
      ];
      args: [{ name: "newPolicy"; type: { defined: "SpendingPolicy" } }];
    },
    {
      name: "emergencyWithdraw";
      accounts: [
        { name: "owner"; isMut: false; isSigner: true },
        { name: "vault"; isMut: true; isSigner: false },
        { name: "vaultAta"; isMut: true; isSigner: false },
        { name: "ownerAta"; isMut: true; isSigner: false },
        { name: "tokenProgram"; isMut: false; isSigner: false }
      ];
      args: [{ name: "amount"; type: "u64" }];
    }
  ];
  accounts: [
    {
      name: "AgentVault";
      type: {
        kind: "struct";
        fields: [
          { name: "owner"; type: "publicKey" },
          { name: "authority"; type: "publicKey" },
          { name: "mint"; type: "publicKey" },
          { name: "bump"; type: "u8" },
          { name: "agentId"; type: { array: ["u8", 32] } },
          { name: "createdAt"; type: "i64" },
          { name: "policy"; type: { defined: "SpendingPolicy" } },
          { name: "stats"; type: { defined: "VaultStats" } }
        ];
      };
    }
  ];
  types: [
    {
      name: "SpendingPolicy";
      type: {
        kind: "struct";
        fields: [
          { name: "maxPerTx"; type: "u64" },
          { name: "maxPerDay"; type: "u64" },
          { name: "allowlist"; type: { vec: "publicKey" } },
          { name: "requireAllowlist"; type: "bool" },
          { name: "expiresAt"; type: "i64" }
        ];
      };
    },
    {
      name: "VaultStats";
      type: {
        kind: "struct";
        fields: [
          { name: "totalReceived"; type: "u64" },
          { name: "totalSpent"; type: "u64" },
          { name: "spentToday"; type: "u64" },
          { name: "currentDay"; type: "i64" },
          { name: "spendCount"; type: "u64" },
          { name: "depositCount"; type: "u64" }
        ];
      };
    }
  ];
  events: [
    {
      name: "SpendEvent";
      fields: [
        { name: "vault"; type: "publicKey"; index: false },
        { name: "recipient"; type: "publicKey"; index: false },
        { name: "amount"; type: "u64"; index: false },
        { name: "ts"; type: "i64"; index: false }
      ];
    },
    {
      name: "EmergencyWithdrawEvent";
      fields: [
        { name: "vault"; type: "publicKey"; index: false },
        { name: "owner"; type: "publicKey"; index: false },
        { name: "amount"; type: "u64"; index: false },
        { name: "ts"; type: "i64"; index: false }
      ];
    }
  ];
  errors: [
    { code: 6000; name: "ExceedsTxLimit"; msg: "Spending exceeds per-transaction limit" },
    { code: 6001; name: "ExceedsDailyLimit"; msg: "Spending exceeds daily limit" },
    { code: 6002; name: "NotAllowlisted"; msg: "Recipient not on allowlist" },
    { code: 6003; name: "PolicyExpired"; msg: "Policy has expired" },
    { code: 6004; name: "Unauthorized"; msg: "Unauthorized signer" },
    { code: 6005; name: "AllowlistFull"; msg: "Allowlist full (max 16)" },
    { code: 6006; name: "Overflow"; msg: "Math overflow" }
  ];
};

export const IDL: AgentVault = {
  version: "0.1.0",
  name: "agent_vault",
  instructions: [
    {
      name: "initializeVault",
      accounts: [
        { name: "owner", isMut: true, isSigner: true },
        { name: "agentAuthority", isMut: false, isSigner: false },
        { name: "mint", isMut: false, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "vaultAta", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "associatedTokenProgram", isMut: false, isSigner: false },
        { name: "rent", isMut: false, isSigner: false },
      ],
      args: [
        { name: "agentId", type: { array: ["u8", 32] } },
        { name: "policy", type: { defined: "SpendingPolicy" } },
      ],
    },
    {
      name: "withdraw",
      accounts: [
        { name: "agentAuthority", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "vaultAta", isMut: true, isSigner: false },
        { name: "recipientAta", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "updatePolicy",
      accounts: [
        { name: "owner", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
      ],
      args: [{ name: "newPolicy", type: { defined: "SpendingPolicy" } }],
    },
    {
      name: "emergencyWithdraw",
      accounts: [
        { name: "owner", isMut: false, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "vaultAta", isMut: true, isSigner: false },
        { name: "ownerAta", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
  ],
  accounts: [
    {
      name: "AgentVault",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "authority", type: "publicKey" },
          { name: "mint", type: "publicKey" },
          { name: "bump", type: "u8" },
          { name: "agentId", type: { array: ["u8", 32] } },
          { name: "createdAt", type: "i64" },
          { name: "policy", type: { defined: "SpendingPolicy" } },
          { name: "stats", type: { defined: "VaultStats" } },
        ],
      },
    },
  ],
  types: [
    {
      name: "SpendingPolicy",
      type: {
        kind: "struct",
        fields: [
          { name: "maxPerTx", type: "u64" },
          { name: "maxPerDay", type: "u64" },
          { name: "allowlist", type: { vec: "publicKey" } },
          { name: "requireAllowlist", type: "bool" },
          { name: "expiresAt", type: "i64" },
        ],
      },
    },
    {
      name: "VaultStats",
      type: {
        kind: "struct",
        fields: [
          { name: "totalReceived", type: "u64" },
          { name: "totalSpent", type: "u64" },
          { name: "spentToday", type: "u64" },
          { name: "currentDay", type: "i64" },
          { name: "spendCount", type: "u64" },
          { name: "depositCount", type: "u64" },
        ],
      },
    },
  ],
  events: [
    {
      name: "SpendEvent",
      fields: [
        { name: "vault", type: "publicKey", index: false },
        { name: "recipient", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "ts", type: "i64", index: false },
      ],
    },
    {
      name: "EmergencyWithdrawEvent",
      fields: [
        { name: "vault", type: "publicKey", index: false },
        { name: "owner", type: "publicKey", index: false },
        { name: "amount", type: "u64", index: false },
        { name: "ts", type: "i64", index: false },
      ],
    },
  ],
  errors: [
    { code: 6000, name: "ExceedsTxLimit", msg: "Spending exceeds per-transaction limit" },
    { code: 6001, name: "ExceedsDailyLimit", msg: "Spending exceeds daily limit" },
    { code: 6002, name: "NotAllowlisted", msg: "Recipient not on allowlist" },
    { code: 6003, name: "PolicyExpired", msg: "Policy has expired" },
    { code: 6004, name: "Unauthorized", msg: "Unauthorized signer" },
    { code: 6005, name: "AllowlistFull", msg: "Allowlist full (max 16)" },
    { code: 6006, name: "Overflow", msg: "Math overflow" },
  ],
};

/** Decoded on-chain account data for AgentVault */
export interface AgentVaultAccount {
  owner: PublicKey;
  authority: PublicKey;
  mint: PublicKey;
  bump: number;
  agentId: number[];
  createdAt: BN;
  policy: SpendingPolicyData;
  stats: VaultStatsData;
}

/** Runtime representation of SpendingPolicy */
export interface SpendingPolicyData {
  maxPerTx: BN;
  maxPerDay: BN;
  allowlist: PublicKey[];
  requireAllowlist: boolean;
  expiresAt: BN;
}

/** Runtime representation of VaultStats */
export interface VaultStatsData {
  totalReceived: BN;
  totalSpent: BN;
  spentToday: BN;
  currentDay: BN;
  spendCount: BN;
  depositCount: BN;
}

/** SpendEvent event payload */
export interface SpendEventData {
  vault: PublicKey;
  recipient: PublicKey;
  amount: BN;
  ts: BN;
}

/** EmergencyWithdrawEvent event payload */
export interface EmergencyWithdrawEventData {
  vault: PublicKey;
  owner: PublicKey;
  amount: BN;
  ts: BN;
}
