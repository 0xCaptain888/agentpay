"""Paywall dependency for AlphaScout API."""
from solana.rpc.async_api import AsyncClient
from agentpay import Paywall
from ..config import settings

# Initialize paywall with a placeholder recipient_ata.
# main.py lifespan will update recipient_ata once AgentPayClient is available.
_rpc = AsyncClient(settings.rpc_url)
paywall_dep = Paywall(
    rpc=_rpc,
    recipient_ata="11111111111111111111111111111111",
    price=settings.price_per_signal,
)
