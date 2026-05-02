use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    /// Only owner can call this - failsafe for compromised agents
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, AgentVault>,

    #[account(
        mut,
        associated_token::mint = vault.mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let authority = vault.authority;
    let seeds = &[b"vault", authority.as_ref(), &[vault.bump]];
    let signer_seeds = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.owner_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    emit!(EmergencyWithdrawEvent {
        vault: vault.key(),
        owner: ctx.accounts.owner.key(),
        amount,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct EmergencyWithdrawEvent {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub ts: i64,
}
