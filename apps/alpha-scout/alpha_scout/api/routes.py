from fastapi import APIRouter, Depends, Request
from .paywall import paywall_dep
from datetime import datetime
from agentpay import X402Paywall
from solana.rpc.async_api import AsyncClient
from ..config import settings

router = APIRouter()

# x402-compliant paywall (initialized with placeholder, updated at lifespan)
_x402_rpc = AsyncClient(settings.rpc_url)
x402_paywall_dep = X402Paywall(
    rpc=_x402_rpc,
    recipient_ata="11111111111111111111111111111111",  # set at lifespan
    asset=settings.usdc_mint,
    price=settings.price_per_signal,
    network="solana-devnet",
    description="AlphaScout daily research signals",
)


@router.get("/signals/today", dependencies=[Depends(paywall_dep)])
async def signals_today(request: Request):
    """Paid endpoint — 0.01 USDC per call."""
    cache = request.app.state.cache
    signals = await cache.get_today()
    if not signals:
        return {
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "market_summary": "No signals generated yet today. Check back after 14:00 UTC.",
            "signals": [],
        }
    return signals


@router.get("/x402/signals/today", dependencies=[Depends(x402_paywall_dep)])
async def x402_signals_today(request: Request):
    """x402-compliant version of /signals/today.

    Compatible with @x402/fetch and Coinbase x402 clients.
    """
    cache = request.app.state.cache
    signals = await cache.get_today()
    if not signals:
        return {
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "market_summary": "No signals generated yet today. Check back after 14:00 UTC.",
            "signals": [],
        }
    return signals


@router.get("/status")
async def status(request: Request):
    """Free endpoint — public Agent status (for Dashboard)."""
    vault_state = {
        "balance": 0, "total_received": 0, "total_spent": 0,
        "spent_today": 0, "max_per_day": 5_000_000, "max_per_tx": 500_000,
        "remaining_today": 5_000_000, "allowlist_size": 0,
    }
    try:
        if hasattr(request.app.state, "client") and request.app.state.client is not None:
            raw_state = await request.app.state.client.get_vault_state()
            vault_state.update(raw_state)
    except Exception:
        pass

    last_research = None
    if hasattr(request.app.state, "cache"):
        last_research = await request.app.state.cache.last_run_meta()

    boot_at = getattr(request.app.state, "boot_at", datetime.utcnow())
    uptime = datetime.utcnow() - boot_at
    uptime_hours = round(uptime.total_seconds() / 3600, 2)

    return {
        "agent": "AlphaScout",
        "version": "0.1.0",
        "uptime_hours": uptime_hours,
        "boot_at": boot_at.isoformat(),
        "vault": vault_state,
        "last_research": last_research,
    }


@router.get("/transactions")
async def transactions(request: Request, limit: int = 20):
    """Recent on-chain activity for this agent's vault."""
    if not hasattr(request.app.state, "client") or request.app.state.client is None:
        return {"transactions": []}

    client = request.app.state.client
    try:
        vault_ata = await client.vault_ata()
        sigs = await client.client.get_signatures_for_address(vault_ata, limit=limit)
        txs = []
        for s in (sigs.value or []):
            try:
                tx = await client.client.get_transaction(
                    s.signature,
                    max_supported_transaction_version=0,
                    commitment="confirmed",
                )
                if not tx.value or not tx.value.transaction.meta:
                    continue
                meta = tx.value.transaction.meta

                # Parse token balance change for vault_ata
                vault_ata_str = str(vault_ata)
                account_keys = [
                    str(k)
                    for k in tx.value.transaction.transaction.message.account_keys
                ]
                if vault_ata_str not in account_keys:
                    continue
                idx = account_keys.index(vault_ata_str)

                pre_bal = 0
                post_bal = 0
                for b in (meta.pre_token_balances or []):
                    if b.account_index == idx:
                        pre_bal = int(b.ui_token_amount.amount)
                for b in (meta.post_token_balances or []):
                    if b.account_index == idx:
                        post_bal = int(b.ui_token_amount.amount)

                delta = post_bal - pre_bal
                if delta == 0:
                    continue

                # Try to extract memo
                label = "USDC transfer"
                instructions = tx.value.transaction.transaction.message.instructions or []
                for ix in instructions:
                    prog = str(getattr(ix, "program_id", ""))
                    if "Memo" in prog:
                        data = getattr(ix, "data", None)
                        if data:
                            try:
                                if isinstance(data, str):
                                    import base58
                                    label = base58.b58decode(data).decode("utf-8", errors="replace")
                                else:
                                    label = bytes(data).decode("utf-8", errors="replace")
                            except Exception:
                                pass

                txs.append({
                    "signature": str(s.signature),
                    "timestamp": s.block_time,
                    "type": "earned" if delta > 0 else "spent",
                    "amount": abs(delta) / 1_000_000,
                    "label": label,
                    "time": "",  # Frontend will compute relative time from timestamp
                })
            except Exception:
                continue

        return {"transactions": txs}
    except Exception as e:
        return {"transactions": [], "error": str(e)}


@router.get("/manifest")
async def manifest(request: Request):
    """Public vault ATA so consumers know where to pay."""
    vault_ata = "unknown"
    try:
        if hasattr(request.app.state, "client") and request.app.state.client is not None:
            ata = await request.app.state.client.vault_ata()
            vault_ata = str(ata)
    except Exception:
        pass

    return {
        "name": "AlphaScout",
        "vault_ata": vault_ata,
        "price_per_call": 10_000,
        "asset": "USDC",
        "network": "solana-devnet",
    }


@router.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
