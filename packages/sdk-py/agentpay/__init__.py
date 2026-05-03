"""AgentPay Python SDK — Vault client and HTTP 402 paywall for AI agents on Solana."""

from .client import AgentPayClient, SpendingPolicy, USDC_DEVNET_MINT
from .server import Paywall          # legacy
from .x402 import X402Paywall        # new — x402-compliant

__all__ = [
    "AgentPayClient", "SpendingPolicy", "USDC_DEVNET_MINT",
    "Paywall", "X402Paywall",
]
__version__ = "0.2.0"
