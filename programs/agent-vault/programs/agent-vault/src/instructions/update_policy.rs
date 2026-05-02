use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::VaultError;

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        has_one = owner @ VaultError::Unauthorized,
    )]
    pub vault: Account<'info, AgentVault>,
}

pub fn handler(ctx: Context<UpdatePolicy>, new_policy: SpendingPolicy) -> Result<()> {
    require!(new_policy.allowlist.len() <= 16, VaultError::AllowlistFull);
    ctx.accounts.vault.policy = new_policy;
    Ok(())
}
