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
    let vault = &mut ctx.accounts.vault;
    let policy = &vault.policy;
    let now = Clock::get()?.unix_timestamp;

    // 1. Expiry check
    if policy.expires_at > 0 {
        require!(now < policy.expires_at, VaultError::PolicyExpired);
    }

    // 2. Per-tx limit
    require!(amount <= policy.max_per_tx, VaultError::ExceedsTxLimit);

    // 3. Allowlist
    if policy.require_allowlist {
        let recipient_authority = ctx.accounts.recipient_ata.owner;
        require!(
            policy.allowlist.contains(&recipient_authority),
            VaultError::NotAllowlisted
        );
    }

    // 4. Daily limit (rolling window)
    let today = now / 86_400;
    let stats = &mut vault.stats;
    if today != stats.current_day {
        stats.current_day = today;
        stats.spent_today = 0;
    }
    let new_today = stats.spent_today
        .checked_add(amount).ok_or(VaultError::Overflow)?;
    require!(new_today <= policy.max_per_day, VaultError::ExceedsDailyLimit);

    // 5. Execute SPL token transfer (vault PDA as signer)
    let agent_key = ctx.accounts.agent_authority.key();
    let seeds = &[b"vault", agent_key.as_ref(), &[vault.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.recipient_ata.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // 6. Update stats
    stats.spent_today = new_today;
    stats.total_spent = stats.total_spent
        .checked_add(amount).ok_or(VaultError::Overflow)?;
    stats.spend_count += 1;

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
