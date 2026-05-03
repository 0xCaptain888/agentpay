use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use instructions::*;
use state::SpendingPolicy;

declare_id!("5odLqG1PdHNoMExgTVqsybSh3Dh5cxg8xD37BSnWe24N");

#[program]
pub mod agent_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        agent_id: [u8; 32],
        policy: SpendingPolicy,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, agent_id, policy)
    }

    pub fn withdraw(ctx: Context<WithdrawWithPolicy>, amount: u64) -> Result<()> {
        instructions::withdraw_with_policy::handler(ctx, amount)
    }

    pub fn update_policy(ctx: Context<UpdatePolicy>, new_policy: SpendingPolicy) -> Result<()> {
        instructions::update_policy::handler(ctx, new_policy)
    }

    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        instructions::emergency_withdraw::handler(ctx, amount)
    }
}
