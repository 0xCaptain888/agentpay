import asyncio
import logging

log = logging.getLogger("treasury_cron")


async def run(treasury_manager, settings):
    """Run treasury check every hour. Executes immediately on startup."""
    # Initial warm-up delay, then first run
    await asyncio.sleep(30)
    while True:
        try:
            log.info("Running treasury tick")
            result = await treasury_manager.tick()
            if result.get("actions"):
                log.info(f"Treasury actions: {result['actions']}")
            else:
                log.info(f"Treasury: no actions needed ({result.get('reason', 'ok')})")
        except Exception as e:
            log.error(f"Treasury cron error: {e}", exc_info=True)
        await asyncio.sleep(3600)  # 1 hour
