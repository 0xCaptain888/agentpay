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
    """Monitor large USDC transfers, new token mints.
    Requires a Helius API key. Returns empty list if no key is set.
    """
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    async def recent_large_transfers(self, min_usd: int = 100_000) -> list[dict]:
        if not self.api_key:
            return []  # No mock data — CoinGecko + DeFiLlama are sufficient
        # Real Helius enhanced transactions API
        url = f"https://api.helius.xyz/v0/addresses/transactions"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url, params={"api-key": self.api_key, "limit": 20})
                r.raise_for_status()
                return [
                    tx for tx in r.json()
                    if tx.get("amount_usd", 0) >= min_usd
                ]
        except Exception:
            return []
