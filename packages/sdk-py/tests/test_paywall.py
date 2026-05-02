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


def make_request(headers: dict | None = None):
    """Helper: build a request mock with a real-dict-backed .headers."""
    headers = headers or {}
    request = MagicMock()
    request.headers = headers
    return request


@pytest.mark.asyncio
async def test_paywall_returns_402_without_payment(paywall):
    """Missing X-Payment and X-Payment-Nonce headers -> 402."""
    request = make_request({})
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
    request = make_request({"X-Payment": "fakesig", "X-Payment-Nonce": "unknown-nonce"})
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_paywall_rejects_expired_nonce(paywall):
    """Using a nonce after TTL -> 402."""
    nonce = "test-expired-nonce"
    paywall.nonces[nonce] = NonceRecord(expires_at=time.time() - 10, paid=False)

    request = make_request({"X-Payment": "fakesig", "X-Payment-Nonce": nonce})
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_paywall_rejects_replay(paywall):
    """Using a nonce that was already marked paid -> 409."""
    nonce = "test-replay-nonce"
    paywall.nonces[nonce] = NonceRecord(expires_at=time.time() + 300, paid=True)

    request = make_request({"X-Payment": "fakesig", "X-Payment-Nonce": nonce})
    response = MagicMock()

    with pytest.raises(HTTPException) as exc:
        await paywall(request, response)
    assert exc.value.status_code == 409
