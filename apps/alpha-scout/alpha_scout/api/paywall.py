"""Paywall dependency for AlphaScout API."""
from solana.rpc.async_api import AsyncClient
from agentpay import Paywall
from ..config import settings

# Initialize paywall
_rpc = AsyncClient(settings.rpc_url)
paywall_dep = Paywall(
    rpc=_rpc,
    recipient_ata="11111111111111111111111111111111",  # Set from vault_ata at startup
    price=settings.price_per_signal,
)
