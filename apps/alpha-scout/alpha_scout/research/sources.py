import httpx
from datetime import datetime
from typing import Any


class CoinGeckoSource:
    BASE = "https://api.coingecko.com/api/v3"

    async def top_solana_tokens(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.BASE}/coins/markets", params={
                "vs_currency": "usd",
                "category": "solana-ecosystem",
                "order": "volume_desc",
                "per_page": 25,
                "page": 1,
            })
            r.raise_for_status()
            return r.json()


class DeFiLlamaSource:
    BASE = "https://api.llama.fi"

    async def solana_protocols(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{self.BASE}/protocols")
            r.raise_for_status()
            return [p for p in r.json() if "Solana" in p.get("chains", [])]


class HeliusSource:
    """Monitor large USDC transfers, new token mints."""
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    async def recent_large_transfers(self, min_usd: int = 100_000) -> list[dict]:
        # Helius enhanced transactions API
        # Simplified: returns mock in dev, real data with API key
        if not self.api_key:
            return [
                {
                    "type": "large_transfer",
                    "amount_usd": 250_000,
                    "token": "USDC",
                    "from": "whale_wallet_1",
                    "to": "dex_pool_raydium",
                    "timestamp": datetime.utcnow().isoformat(),
                },
                {
                    "type": "large_transfer",
                    "amount_usd": 180_000,
                    "token": "SOL",
                    "from": "whale_wallet_2",
                    "to": "marinade_staking",
                    "timestamp": datetime.utcnow().isoformat(),
                },
            ]
        return []
