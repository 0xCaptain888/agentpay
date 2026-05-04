"""
HTTP 402 server implementation — lets Agent expose paid API endpoints.
"""
from fastapi import Request, Response, HTTPException
from solders.signature import Signature
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient
import time
import uuid
import base64
from dataclasses import dataclass

from .client import USDC_DEVNET_MINT, MEMO_PROGRAM_ID


@dataclass
class NonceRecord:
    expires_at: float
    paid: bool = False


class Paywall:
    """
    FastAPI dependency that enforces HTTP 402 payment.
    Usage:
        paywall = Paywall(rpc=client, recipient_ata="...", price=10_000)

        @app.get("/data", dependencies=[Depends(paywall)])
        async def data(): ...
    """
    def __init__(
        self,
        rpc: AsyncClient,
        recipient_ata: str,
        price: int,                # USDC raw (6 decimals)
        asset: str = "USDC",
        network: str = "solana-devnet",
        nonce_ttl: int = 300,
    ):
        self.rpc = rpc
        self.recipient_ata = recipient_ata
        self.price = price
        self.asset = asset
        self.network = network
        self.nonce_ttl = nonce_ttl
        self.nonces: dict[str, NonceRecord] = {}

    async def __call__(self, request: Request, response: Response) -> None:
        sig = request.headers.get("X-Payment")
        nonce = request.headers.get("X-Payment-Nonce")

        if not sig or not nonce:
            new_nonce = str(uuid.uuid4())
            self.nonces[new_nonce] = NonceRecord(
                expires_at=time.time() + self.nonce_ttl
            )
            payload = {
                "x402": "1.0",
                "accepts": [{
                    "scheme": "solana-spl-transfer",
                    "network": self.network,
                    "asset": self.asset,
                    "amount": str(self.price),
                    "recipient": self.recipient_ata,
                    "nonce": new_nonce,
                    "expires_at": int((time.time() + self.nonce_ttl) * 1000),
                }],
            }
            raise HTTPException(status_code=402, detail=payload)

        rec = self.nonces.get(nonce)
        if not rec:
            raise HTTPException(402, "unknown nonce")
        if time.time() > rec.expires_at:
            raise HTTPException(402, "nonce expired")
        if rec.paid:
            raise HTTPException(409, "nonce already used")

        # On-chain verification
        ok = await self._verify_payment(sig, nonce)
        if not ok:
            raise HTTPException(402, "invalid payment")

        rec.paid = True

    async def _verify_payment(self, sig_str: str, nonce: str) -> bool:
        try:
            sig = Signature.from_string(sig_str)
            tx = await self.rpc.get_transaction(
                sig, max_supported_transaction_version=0,
                commitment="confirmed",
            )
            if not tx.value:
                return False

            meta = tx.value.transaction.meta
            if meta.err is not None:
                return False

            # ---- Step 1: Verify transfer amount ----
            pre = {
                b.account_index: int(b.ui_token_amount.amount)
                for b in (meta.pre_token_balances or [])
                if str(b.mint) == str(USDC_DEVNET_MINT)
            }
            post = {
                b.account_index: int(b.ui_token_amount.amount)
                for b in (meta.post_token_balances or [])
                if str(b.mint) == str(USDC_DEVNET_MINT)
            }

            # Find recipient_ata in account_keys
            account_keys = [
                str(k)
                for k in tx.value.transaction.transaction.message.account_keys
            ]
            if self.recipient_ata not in account_keys:
                return False

            idx = account_keys.index(self.recipient_ata)
            delta = post.get(idx, 0) - pre.get(idx, 0)
            if delta < self.price:
                return False

            # ---- Step 2: Verify memo contains nonce ----
            instructions = (
                tx.value.transaction.transaction.message.instructions or []
            )
            memo_program_str = str(MEMO_PROGRAM_ID)
            memo_found = False
            for ix in instructions:
                program_id = str(getattr(ix, "program_id", ""))
                if program_id != memo_program_str:
                    continue
                data = getattr(ix, "data", None)
                if data is None:
                    continue
                try:
                    if isinstance(data, str):
                        # Try base58 decode first
                        try:
                            import base58
                            decoded = base58.b58decode(data).decode("utf-8", errors="replace")
                        except Exception:
                            decoded = data
                    else:
                        decoded = bytes(data).decode("utf-8", errors="replace")
                    if nonce in decoded:
                        memo_found = True
                        break
                except Exception:
                    continue

            if not memo_found:
                return False

            return True
        except Exception as e:
            print(f"verify error: {e}")
            return False
