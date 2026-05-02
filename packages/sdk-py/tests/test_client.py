"""Unit tests for AgentPay Python SDK."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from agentpay.client import SpendingPolicy


def test_spending_policy_defaults():
    policy = SpendingPolicy(max_per_tx=500_000, max_per_day=5_000_000)
    assert policy.max_per_tx == 500_000
    assert policy.max_per_day == 5_000_000
    assert policy.allowlist == []
    assert policy.require_allowlist is False
    assert policy.expires_at == 0


def test_spending_policy_custom():
    policy = SpendingPolicy(
        max_per_tx=1_000_000,
        max_per_day=10_000_000,
        require_allowlist=True,
        expires_at=1700000000,
    )
    assert policy.max_per_tx == 1_000_000
    assert policy.require_allowlist is True
    assert policy.expires_at == 1700000000
