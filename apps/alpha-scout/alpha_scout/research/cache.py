"""Signal cache — stores and retrieves daily signals."""
from datetime import datetime, date
from typing import Optional
import json
import logging

log = logging.getLogger("cache")


class SignalCache:
    """In-memory signal cache with daily rotation."""

    def __init__(self):
        self._signals: dict[str, dict] = {}
        self._last_run: Optional[dict] = None

    async def store(self, signals: dict) -> None:
        today = date.today().isoformat()
        self._signals[today] = {
            **signals,
            "cached_at": datetime.utcnow().isoformat(),
        }
        self._last_run = {
            "date": today,
            "signal_count": len(signals.get("signals", [])),
            "ran_at": datetime.utcnow().isoformat(),
        }
        log.info(f"Cached {len(signals.get('signals', []))} signals for {today}")

    async def get_today(self) -> Optional[dict]:
        today = date.today().isoformat()
        return self._signals.get(today)

    async def last_run_meta(self) -> Optional[dict]:
        return self._last_run


async def get_today_signals() -> dict:
    """Global accessor for today's signals."""
    from ..main import _signal_cache
    signals = await _signal_cache.get_today()
    if not signals:
        return {
            "date": date.today().isoformat(),
            "market_summary": "No signals generated yet today. Check back after 14:00 UTC.",
            "signals": [],
        }
    return signals
