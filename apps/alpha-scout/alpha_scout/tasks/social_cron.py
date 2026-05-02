import asyncio
from datetime import datetime
import logging

log = logging.getLogger("social_cron")


async def run(twitter_client, settings, vault_client=None, cache=None, agent=None):
    """Post to X every 6 hours. Executes immediately on startup.

    If a LangChain agent is provided, it generates the tweet text autonomously.
    Falls back to a template-based post if the agent is unavailable or errors.
    """
    # Initial warm-up delay, then first run
    await asyncio.sleep(60)
    while True:
        try:
            log.info("Running social cron")

            # Get vault state for the tweet
            vault_state = {"balance": 0, "total_received": 0, "total_spent": 0}
            if vault_client is not None:
                try:
                    vault_state = await vault_client.get_vault_state()
                except Exception:
                    pass

            text = None

            # --- Option A: Let the LangChain agent decide the tweet ---
            if agent is not None:
                try:
                    log.info("Asking LangChain agent to generate social post")
                    result = await agent.run(
                        trigger="generate_social_post",
                        context={"vault_state": vault_state},
                    )
                    # Extract text from agent result
                    if isinstance(result, dict):
                        text = result.get("output") or result.get("text")
                    elif isinstance(result, str):
                        text = result
                    # Validate length (X limit)
                    if text and len(text) > 280:
                        text = text[:277] + "..."
                    if text:
                        log.info("Agent generated social post successfully")
                except Exception as e:
                    log.warning(f"Agent social post generation failed, using template: {e}")
                    text = None

            # --- Fallback: template-based post ---
            if not text:
                balance = vault_state.get("balance", 0) / 1_000_000
                earned = vault_state.get("total_received", 0) / 1_000_000
                spent = vault_state.get("total_spent", 0) / 1_000_000

                signal_count = 0
                if cache:
                    today = await cache.get_today()
                    if today:
                        signal_count = len(today.get("signals", []))

                text = (
                    f"Status update from AlphaScout.\n\n"
                    f"Balance: ${balance:.2f} USDC\n"
                    f"Total earned: ${earned:.2f}\n"
                    f"Total spent: ${spent:.2f}\n"
                    f"Signals today: {signal_count}\n\n"
                    f"Still running autonomously.\n"
                    f"#AlphaScout #Solana #AgentPay"
                )

            await twitter_client.post(text=text)
            log.info("Social post completed")
        except Exception as e:
            log.error(f"Social cron error: {e}", exc_info=True)
        await asyncio.sleep(6 * 3600)  # 6 hours
