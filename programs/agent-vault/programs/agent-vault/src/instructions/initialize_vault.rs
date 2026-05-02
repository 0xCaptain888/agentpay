use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};
use crate::state::*;

#[derive(Accounts)]
#[instruction(agent_id: [u8; 32])]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Agent's public key
    pub agent_authority: SystemAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = AgentVault::LEN,
        seeds = [b"vault", agent_authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, AgentVault>,

    /// USDC ATA owned by vault PDA
    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeVault>,
    agent_id: [u8; 32],
    policy: SpendingPolicy,
) -> Result<()> {
    require!(policy.allowlist.len() <= 16, crate::errors::VaultError::AllowlistFull);

    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.authority = ctx.accounts.agent_authority.key();
    vault.mint = ctx.accounts.mint.key();
    vault.bump = ctx.bumps.vault;
    vault.agent_id = agent_id;
    vault.created_at = Clock::get()?.unix_timestamp;
    vault.policy = policy;
    vault.stats = VaultStats::default();
    Ok(())
}
