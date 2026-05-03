use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct WithdrawWithPolicy<'info> {
    /// Agent signs this
    pub agent_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", agent_authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, AgentVault>,

    #[account(
        mut,
        associated_token::mint = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawWithPolicy<'info> {
    pub fn authority(&self) -> Pubkey { self.vault.authority }
}

pub fn handler(ctx: Context<WithdrawWithPolicy>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let agent_key = ctx.accounts.agent_authority.key();

    // ---- Phase 1: Read & validate (no mutable borrows yet) ----
    let (max_per_tx, max_per_day, expires_at, require_allowlist, allowlist, bump);
    let (mut spent_today, mut current_day, total_spent, spend_count);
    {
        let vault = &ctx.accounts.vault;
        max_per_tx = vault.policy.max_per_tx;
        max_per_day = vault.policy.max_per_day;
        expires_at = vault.policy.expires_at;
        require_allowlist = vault.policy.require_allowlist;
        allowlist = vault.policy.allowlist.clone();
        bump = vault.bump;
        spent_today = vault.stats.spent_today;
        current_day = vault.stats.current_day;
        total_spent = vault.stats.total_spent;
        spend_count = vault.stats.spend_count;
    }

    // 1. Expiry check
    if expires_at > 0 {
        require!(now < expires_at, VaultError::PolicyExpired);
    }

    // 2. Per-tx limit
    require!(amount <= max_per_tx, VaultError::ExceedsTxLimit);

    // 3. Allowlist
    if require_allowlist {
        let recipient_authority = ctx.accounts.recipient_ata.owner;
        require!(
            allowlist.contains(&recipient_authority),
            VaultError::NotAllowlisted
        );
    }

    // 4. Daily limit (rolling window)
    let today = now / 86_400;
    if today != current_day {
        current_day = today;
        spent_today = 0;
    }
    let new_today = spent_today
        .checked_add(amount).ok_or(VaultError::Overflow)?;
    require!(new_today <= max_per_day, VaultError::ExceedsDailyLimit);

    // ---- Phase 2: CPI (use local seeds, vault as authority) ----
    let bump_arr = [bump];
    let seeds: &[&[u8]] = &[b"vault", agent_key.as_ref(), &bump_arr];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.recipient_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // ---- Phase 3: Write back stats ----
    let vault = &mut ctx.accounts.vault;
    vault.stats.spent_today = new_today;
    vault.stats.current_day = current_day;
    vault.stats.total_spent = total_spent
        .checked_add(amount).ok_or(VaultError::Overflow)?;
    vault.stats.spend_count = spend_count + 1;

    emit!(SpendEvent {
        vault: vault.key(),
        recipient: ctx.accounts.recipient_ata.owner,
        amount,
        ts: now,
    });

    Ok(())
}

#[event]
pub struct SpendEvent {
    pub vault: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub ts: i64,
}
