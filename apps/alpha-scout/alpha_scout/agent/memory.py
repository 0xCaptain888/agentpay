"""Agent state persistence."""
from datetime import datetime
from typing import Optional
import json
import logging

log = logging.getLogger("memory")


class AgentMemory:
    """Simple file-based agent memory for state persistence."""

    def __init__(self, path: str = "./agent_memory.json"):
        self.path = path
        self._state: dict = self._load()

    def _load(self) -> dict:
        try:
            with open(self.path) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {
                "created_at": datetime.utcnow().isoformat(),
                "actions": [],
                "daily_spends": {},
                "signals_generated": 0,
                "tweets_posted": 0,
            }

    def _save(self) -> None:
        with open(self.path, "w") as f:
            json.dump(self._state, f, indent=2)

    def log_action(self, action_type: str, details: dict) -> None:
        entry = {
            "type": action_type,
            "timestamp": datetime.utcnow().isoformat(),
            **details,
        }
        self._state["actions"].append(entry)
        # Keep last 1000 actions
        if len(self._state["actions"]) > 1000:
            self._state["actions"] = self._state["actions"][-500:]
        self._save()

    def log_spend(self, category: str, amount: int) -> None:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if today not in self._state["daily_spends"]:
            self._state["daily_spends"][today] = {}
        day = self._state["daily_spends"][today]
        day[category] = day.get(category, 0) + amount
        self._save()

    def already_spent_today(self, category: str) -> bool:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        return category in self._state.get("daily_spends", {}).get(today, {})

    def increment(self, key: str) -> None:
        self._state[key] = self._state.get(key, 0) + 1
        self._save()

    @property
    def state(self) -> dict:
        return self._state
