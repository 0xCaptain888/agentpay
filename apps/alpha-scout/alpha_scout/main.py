from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime
from pathlib import Path
import logging

from agentpay import AgentPayClient

from .config import settings
from .api.routes import router
from .api.paywall import paywall_dep
from .research.sources import CoinGeckoSource, DeFiLlamaSource, HeliusSource
from .research.analyzer import Analyzer
from .research.cache import SignalCache
from .social.twitter import TwitterClient
from .treasury.manager import TreasuryManager
from .agent.memory import AgentMemory
from .agent.core import AlphaScoutAgent
from .tasks import research_cron, treasury_cron, social_cron, weekly_decision_cron

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
            api_base=settings.openai_api_base,
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


def _try_create_client() -> AgentPayClient | None:
    """Attempt to create an AgentPayClient from the configured keypair path.

    Returns None if the keypair file is missing or invalid (e.g. dev mode).
    """
    keypair_path = Path(settings.agent_keypair_path)
    if not keypair_path.exists():
        log.warning(f"Keypair file not found at {keypair_path} — running without AgentPayClient")
        return None
    try:
        keypair = settings.load_keypair()
        idl_path = keypair_path.parent / "idl.json"
        client = AgentPayClient(
            rpc_url=settings.rpc_url,
            program_id=settings.program_id,
            agent_keypair=keypair,
            idl_path=idl_path,
        )
        log.info("AgentPayClient initialized successfully")
        return client
    except Exception as e:
        log.warning(f"Could not create AgentPayClient: {e} — running without it")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("AlphaScout starting up...")

    # Initialize services
    memory = AgentMemory()
    research = ResearchService(settings)
    twitter = TwitterClient(settings)

    # Attempt to create the vault client; gracefully degrade if unavailable
    vault_client = _try_create_client()
    treasury = TreasuryManager(client=vault_client, memory=memory)

    # Update paywall recipient_ata from the vault client if available
    if vault_client is not None:
        try:
            ata = await vault_client.vault_ata()
            paywall_dep.recipient_ata = str(ata)
            log.info(f"Paywall recipient_ata set to {paywall_dep.recipient_ata}")

            # Also update x402 paywall
            from .api.routes import x402_paywall_dep
            x402_paywall_dep.recipient_ata = str(ata)
            log.info(f"x402 paywall recipient_ata set to {x402_paywall_dep.recipient_ata}")
        except Exception as e:
            log.warning(f"Could not update paywall recipient_ata: {e}")

    # Store on app state
    app.state.cache = _signal_cache
    app.state.boot_at = datetime.utcnow()
    app.state.memory = memory
    app.state.client = vault_client

    # Initialize LangChain Agent (for decision-making tasks)
    agent = None
    if vault_client is not None and settings.openai_api_key:
        try:
            services = {
                "client": vault_client,
                "research": research,
                "twitter": twitter,
                "treasury": treasury,
            }
            agent = AlphaScoutAgent(settings, services)
            app.state.agent = agent
            log.info("LangChain AlphaScoutAgent initialized")
        except Exception as e:
            log.warning(f"Could not initialize AlphaScoutAgent: {e}")

    # Start background cron tasks
    tasks = [
        asyncio.create_task(
            research_cron.run(agent, settings, research_service=research, cache=_signal_cache)
        ),
        asyncio.create_task(treasury_cron.run(treasury, settings)),
        asyncio.create_task(
            social_cron.run(twitter, settings, vault_client=vault_client,
                            cache=_signal_cache, agent=agent)
        ),
    ]
    # Option B: weekly strategic decision cron (agent self-reviews its strategy)
    if agent is not None:
        tasks.append(
            asyncio.create_task(
                weekly_decision_cron.run(agent, settings, vault_client=vault_client)
            )
        )

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
