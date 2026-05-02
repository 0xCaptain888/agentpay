from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime
import logging

from .config import settings
from .api.routes import router
from .research.sources import CoinGeckoSource, DeFiLlamaSource, HeliusSource
from .research.analyzer import Analyzer
from .research.cache import SignalCache
from .social.twitter import TwitterClient
from .treasury.manager import TreasuryManager
from .agent.memory import AgentMemory
from .tasks import research_cron, treasury_cron, social_cron

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("main")

# Global signal cache
_signal_cache = SignalCache()


class ResearchService:
    """Combines sources + analyzer into a single run_daily call."""

    def __init__(self, settings):
        self.coingecko = CoinGeckoSource()
        self.defillama = DeFiLlamaSource()
        self.helius = HeliusSource()
        self.analyzer = Analyzer(
            model=settings.llm_model,
            api_key=settings.openai_api_key,
        )

    async def run_daily(self) -> dict:
        """Gather data from all sources and generate signals."""
        log.info("Gathering market data...")
        market_data = {}

        try:
            market_data["top_tokens"] = await self.coingecko.top_solana_tokens()
        except Exception as e:
            log.warning(f"CoinGecko fetch failed: {e}")
            market_data["top_tokens"] = []

        try:
            protos = await self.defillama.solana_protocols()
            market_data["top_protocols"] = sorted(
                protos, key=lambda x: x.get("tvl", 0), reverse=True
            )[:10]
        except Exception as e:
            log.warning(f"DeFiLlama fetch failed: {e}")
            market_data["top_protocols"] = []

        try:
            market_data["large_transfers"] = await self.helius.recent_large_transfers()
        except Exception as e:
            log.warning(f"Helius fetch failed: {e}")
            market_data["large_transfers"] = []

        log.info("Generating signals...")
        signals = await self.analyzer.generate(market_data)
        return signals.model_dump()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AlphaScout starting up...")

    # Initialize services
    memory = AgentMemory()
    research = ResearchService(settings)
    twitter = TwitterClient(settings)
    treasury = TreasuryManager(client=None, memory=memory)

    # Store on app state
    app.state.cache = _signal_cache
    app.state.boot_at = datetime.utcnow()
    app.state.memory = memory

    # Start background cron tasks
    tasks = [
        asyncio.create_task(
            research_cron.run(None, settings, research_service=research, cache=_signal_cache)
        ),
        asyncio.create_task(treasury_cron.run(treasury, settings)),
        asyncio.create_task(social_cron.run(None, twitter, settings, cache=_signal_cache)),
    ]

    log.info("AlphaScout is live!")
    yield

    log.info("AlphaScout shutting down...")
    for t in tasks:
        t.cancel()


app = FastAPI(
    title="AlphaScout",
    description="Autonomous research agent on Solana — powered by AgentPay",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(router)
