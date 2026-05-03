"""x402-compliant FastAPI paywall — drop-in replacement for @x402/fastapi."""
import base64
import json
from typing import Optional
from fastapi import HTTPException, Request, Response
from solana.rpc.async_api import AsyncClient
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction


class X402Paywall:
    """
    x402-compliant paywall. Drop-in for FastAPI dependencies.

    Usage:
        paywall = X402Paywall(rpc=client, recipient_ata=ATA, asset=USDC, price=10000)
        @app.get("/data", dependencies=[Depends(paywall)])
        async def data(): ...
    """

    def __init__(
        self,
        rpc: AsyncClient,
        recipient_ata: str,
        asset: str,
        price: int,
        network: str = "solana-devnet",
        description: str = "Paid resource",
    ):
        self.rpc = rpc
        self.recipient_ata = recipient_ata
        self.asset = asset
        self.price = price
        self.network = network
        self.description = description

    def _build_402(self, resource: str) -> dict:
        return {
            "x402Version": 1,
            "accepts": [
                {
                    "scheme": "exact",
                    "network": self.network,
                    "maxAmountRequired": str(self.price),
                    "resource": resource,
                    "description": self.description,
                    "mimeType": "application/json",
                    "payTo": self.recipient_ata,
                    "maxTimeoutSeconds": 300,
                    "asset": self.asset,
                    "extra": {"name": "USDC", "decimals": 6},
                }
            ],
            "error": None,
        }

    async def __call__(self, request: Request, response: Response) -> None:
        # Defensive: warm-up check
        if self.recipient_ata == "11111111111111111111111111111111":
            raise HTTPException(503, "Service warming up, retry in 30s")

        payment_header = request.headers.get("x-payment") or request.headers.get("X-Payment")
        resource = str(request.url)

        # No payment -> 402
        if not payment_header:
            raise HTTPException(
                status_code=402,
                detail=self._build_402(resource),
                headers={"Content-Type": "application/json"},
            )

        # Verify payment
        try:
            decoded = base64.b64decode(payment_header).decode("utf-8")
            payload = json.loads(decoded)
        except Exception:
            raise HTTPException(402, detail={"error": "invalid X-PAYMENT header"})

        if payload.get("x402Version") != 1:
            raise HTTPException(402, detail={"error": "unsupported x402 version"})
        if payload.get("scheme") != "exact":
            raise HTTPException(402, detail={"error": "only 'exact' scheme supported"})

        tx_b64 = payload.get("payload", {}).get("transaction")
        if not tx_b64:
            raise HTTPException(402, detail={"error": "missing payload.transaction"})

        # Submit + verify
        try:
            tx_bytes = base64.b64decode(tx_b64)
            tx = VersionedTransaction.from_bytes(tx_bytes)

            # Submit
            from solana.rpc.types import TxOpts
            send_resp = await self.rpc.send_raw_transaction(
                tx_bytes, opts=TxOpts(skip_preflight=False)
            )
            sig = send_resp.value
            # Wait for confirmation (poll up to 30s)
            import asyncio
            for _ in range(30):
                conf = await self.rpc.get_transaction(
                    sig, max_supported_transaction_version=0
                )
                if conf.value:
                    break
                await asyncio.sleep(1)

            # Verify amount
            tx_info = conf.value
            if not tx_info or tx_info.transaction.meta.err:
                raise HTTPException(402, detail={"error": "tx failed on-chain"})

            pre = tx_info.transaction.meta.pre_token_balances or []
            post = tx_info.transaction.meta.post_token_balances or []
            account_keys = tx_info.transaction.transaction.message.account_keys

            recipient_pk = Pubkey.from_string(self.recipient_ata)
            asset_pk = Pubkey.from_string(self.asset)

            delta = 0
            for p in post:
                acct = account_keys[p.account_index]
                if str(acct) != str(recipient_pk):
                    continue
                if str(p.mint) != str(asset_pk):
                    continue
                pre_entry = next((x for x in pre if x.account_index == p.account_index), None)
                pre_amt = int(pre_entry.ui_token_amount.amount) if pre_entry else 0
                post_amt = int(p.ui_token_amount.amount)
                delta = post_amt - pre_amt
                break

            if delta < self.price:
                raise HTTPException(
                    402,
                    detail={"error": f"insufficient payment: paid {delta}, required {self.price}"},
                )

            # Set response header
            payer = str(account_keys[0])
            resp_payload = {
                "success": True,
                "transaction": str(sig),
                "network": self.network,
                "payer": payer,
            }
            response.headers["X-PAYMENT-RESPONSE"] = base64.b64encode(
                json.dumps(resp_payload).encode()
            ).decode()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(402, detail={"error": f"verification failed: {e}"})
