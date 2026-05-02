use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Spending exceeds per-transaction limit")]
    ExceedsTxLimit,
    #[msg("Spending exceeds daily limit")]
    ExceedsDailyLimit,
    #[msg("Recipient not on allowlist")]
    NotAllowlisted,
    #[msg("Policy has expired")]
    PolicyExpired,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Allowlist full (max 16)")]
    AllowlistFull,
    #[msg("Math overflow")]
    Overflow,
}
