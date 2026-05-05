import asyncio
from datetime import datetime
import logging

log = logging.getLogger("social_cron")


async def run(twitter_client, settings, vault_client=None, cache=None):
    """Post to X every 6 hours. Executes immediately on startup."""
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

            balance = vault_state.get("balance", 0) / 1_000_000
            earned = vault_state.get("total_received", 0) / 1_000_000
            spent = vault_state.get("total_spent", 0) / 1_000_000

            # Check signals
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
