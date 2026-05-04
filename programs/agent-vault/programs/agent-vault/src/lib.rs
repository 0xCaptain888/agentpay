use anchor_lang::prelude::*;

pub mod state;
pub mod errors;
pub mod instructions;

use instructions::*;
use state::SpendingPolicy;

declare_id!("9ms651QWvGskQ1ZCdfUhAw1YfW5Pim8xdrV5xjJrPpWV");

#[program]
pub mod agent_vault {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        agent_id: [u8; 32],
        policy: SpendingPolicy,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, agent_id, policy, fee_bps)
    }

    pub fn initialize_fee_collector(ctx: Context<InitializeFeeCollector>) -> Result<()> {
        instructions::initialize_fee_collector::handler(ctx)
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
