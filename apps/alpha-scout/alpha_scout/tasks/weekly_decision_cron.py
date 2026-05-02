"""
Weekly strategic decision cron — lets the LangChain agent self-review its
operating strategy once per week.

The agent considers its vault state (balance, spend rate, earnings trajectory)
and decides whether to adjust behavior: e.g. post more/less, spend differently,
change research focus.

This is Option B from the review report — gives the agent genuine autonomous
decision-making beyond template-driven crons.
"""
import asyncio
import logging

log = logging.getLogger("weekly_decision_cron")

# 7 days in seconds
WEEK_SECONDS = 7 * 24 * 3600


async def run(agent, settings, vault_client=None):
    """Run weekly strategic review. First run after 24h, then every 7 days."""
    # Wait 24 hours before first strategic review
    await asyncio.sleep(24 * 3600)

    while True:
        try:
            log.info("Starting weekly strategic decision cycle")

            vault_state = "unavailable"
            if vault_client is not None:
                try:
                    vault_state = await vault_client.get_vault_state()
                except Exception as e:
                    log.warning(f"Could not fetch vault state for weekly review: {e}")

            result = await agent.run(
                trigger="weekly_strategy_review",
                context={"vault_state": vault_state},
            )
            log.info(f"Weekly decision completed: {result}")

        except Exception as e:
            log.error(f"Weekly decision cron error: {e}", exc_info=True)

        await asyncio.sleep(WEEK_SECONDS)
