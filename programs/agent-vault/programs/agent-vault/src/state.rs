use anchor_lang::prelude::*;

#[account]
pub struct AgentVault {
    /// Contract upgrade admin (your deployment wallet)
    pub owner: Pubkey,
    /// Agent's signing authority (Agent holds its own keypair)
    pub authority: Pubkey,
    /// USDC mint
    pub mint: Pubkey,
    /// PDA bump
    pub bump: u8,
    /// Metadata
    pub agent_id: [u8; 32],
    pub created_at: i64,

    /// Policy
    pub policy: SpendingPolicy,

    /// Protocol fee rate in basis points (100 = 1%). 0 = free
    pub fee_bps: u16,

    /// Statistics
    pub stats: VaultStats,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SpendingPolicy {
    /// Max per transaction (USDC, 6 decimals, e.g. 0.5 USDC = 500_000)
    pub max_per_tx: u64,
    /// Max per day
    pub max_per_day: u64,
    /// Allowlist recipients (max 16)
    pub allowlist: Vec<Pubkey>,
    /// Whether to enforce allowlist
    pub require_allowlist: bool,
    /// Policy expiry (0 = never expires)
    pub expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct VaultStats {
    pub total_received: u64,
    pub total_spent: u64,
    /// Today's spending (resets daily)
    pub spent_today: u64,
    /// Current day marker (unix_ts / 86400)
    pub current_day: i64,
    pub spend_count: u64,
    pub deposit_count: u64,
}

impl AgentVault {
    pub const LEN: usize = 8 +
        32 + 32 + 32 + 1 + 32 + 8 +
        8 + 8 + (4 + 32 * 16) + 1 + 8 +
        2 + // fee_bps
        8 + 8 + 8 + 8 + 8 + 8;
}

#[account]
pub struct FeeCollector {
    /// Fee collector authority (protocol team or DAO address)
    pub authority: Pubkey,
    /// Total USDC collected (6 decimals)
    pub total_collected: u64,
    pub bump: u8,
}

impl FeeCollector {
    pub const LEN: usize = 8 + 32 + 8 + 1;
    pub const SEEDS: &'static [u8] = b"fee_collector";
}
