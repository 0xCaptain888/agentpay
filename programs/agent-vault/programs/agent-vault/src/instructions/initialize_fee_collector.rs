use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Mint;
use crate::state::FeeCollector;

#[derive(Accounts)]
pub struct InitializeFeeCollector<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Fee collector authority (protocol team controls this)
    /// CHECK: Only storing pubkey, no type validation needed
    pub fee_authority: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = FeeCollector::LEN,
        seeds = [FeeCollector::SEEDS],
        bump
    )]
    pub fee_collector: Account<'info, FeeCollector>,

    /// Fee USDC ATA (owned by fee_collector PDA)
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = fee_collector,
    )]
    pub fee_collector_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeFeeCollector>) -> Result<()> {
    let fc = &mut ctx.accounts.fee_collector;
    fc.authority = ctx.accounts.fee_authority.key();
    fc.total_collected = 0;
    fc.bump = ctx.bumps.fee_collector;
    Ok(())
}
