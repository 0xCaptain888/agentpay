import asyncio
from datetime import datetime, time
import logging

log = logging.getLogger("research_cron")


async def run(agent, settings, research_service=None, cache=None):
    """Run daily research at 14:00 UTC."""
    while True:
        now = datetime.utcnow()
        target = datetime.combine(now.date(), time(14, 0))
        if now > target:
            from datetime import timedelta
            target += timedelta(days=1)

        wait = (target - now).total_seconds()
        log.info(f"Next research in {wait/3600:.1f} hours")
        await asyncio.sleep(wait)

        try:
            log.info("Starting daily research cycle")
            if research_service and cache:
                signals = await research_service.run_daily()
                if signals:
                    await cache.store(signals)
                    log.info(f"Research complete: {len(signals.get('signals', []))} signals")
            else:
                vault_state = "unavailable"
                try:
                    tools = agent.executor.tools
                    for t in tools:
                        if t.name == "read_vault_state":
                            vault_state = await t.arun({})
                            break
                except Exception:
                    pass

                await agent.run(
                    trigger="daily_research_cycle",
                    context={"vault_state": vault_state},
                )
            log.info("Research cycle completed successfully")
        except Exception as e:
            log.error(f"Research cron error: {e}", exc_info=True)
