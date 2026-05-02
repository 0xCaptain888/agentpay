from fastapi import APIRouter, Depends, Request
from .paywall import paywall_dep
from datetime import datetime

router = APIRouter()


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


@router.get("/status")
async def status(request: Request):
    """Free endpoint — public Agent status (for Dashboard)."""
    vault_state = {"balance": 0, "total_received": 0, "total_spent": 0, "spent_today": 0}
    try:
        if hasattr(request.app.state, "client"):
            vault_state = await request.app.state.client.get_vault_state()
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
        "twitter": "https://x.com/alphascout_ai",
    }


@router.get("/manifest")
async def manifest(request: Request):
    """Public vault ATA so consumers know where to pay."""
    vault_ata = "unknown"
    try:
        if hasattr(request.app.state, "client"):
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
