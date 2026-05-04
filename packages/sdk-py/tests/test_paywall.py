"""Unit tests for the AgentPay Paywall (HTTP 402)."""
import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from agentpay.server import Paywall, NonceRecord


@pytest.fixture
def paywall():
    rpc = AsyncMock()
    return Paywall(
        rpc=rpc,
        recipient_ata="FakeRecipientATA11111111111111111111111111111",
        price=10_000,
        nonce_ttl=300,
    )


@pytest.mark.asyncio
async def test_paywall_returns_402_without_payment(paywall):
    """Missing X-Payment and X-Payment-Nonce headers -> 402."""
    request = MagicMock()
    request.headers = {}
    request.headers.get = lambda key, default=None: None
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 402
    detail = exc.value.detail
    assert detail["x402"] == "1.0"
    assert len(detail["accepts"]) == 1
    assert detail["accepts"][0]["amount"] == "10000"


@pytest.mark.asyncio
async def test_paywall_rejects_unknown_nonce(paywall):
    """Sending a nonce that was never issued -> 402."""
    request = MagicMock()
    request.headers = {"X-Payment": "fakesig", "X-Payment-Nonce": "unknown-nonce"}
    request.headers.get = lambda key, default=None: request.headers.get(key, default)
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_paywall_rejects_expired_nonce(paywall):
    """Using a nonce after TTL -> 402."""
    nonce = "test-expired-nonce"
    paywall.nonces[nonce] = NonceRecord(expires_at=time.time() - 10, paid=False)

    request = MagicMock()
    request.headers = {"X-Payment": "fakesig", "X-Payment-Nonce": nonce}
    request.headers.get = lambda key, default=None: request.headers.get(key, default)
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_paywall_rejects_replay(paywall):
    """Using a nonce that was already marked paid -> 409."""
    nonce = "test-replay-nonce"
    paywall.nonces[nonce] = NonceRecord(expires_at=time.time() + 300, paid=True)

    request = MagicMock()
    request.headers = {"X-Payment": "fakesig", "X-Payment-Nonce": nonce}
    request.headers.get = lambda key, default=None: request.headers.get(key, default)
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 409
