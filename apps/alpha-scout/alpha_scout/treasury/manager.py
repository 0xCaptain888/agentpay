import os
from solders.pubkey import Pubkey
from datetime import datetime
import logging

log = logging.getLogger("treasury")

# Supplier USDC ATA (Associated Token Account) addresses.
# Override via environment variables: SUPPLIER_USDC_ATA_OPENAI, etc.
SUPPLIER_USDC_ATAS = {
    "openai": os.environ.get("SUPPLIER_USDC_ATA_OPENAI"),
    "rpc": os.environ.get("SUPPLIER_USDC_ATA_RPC"),
    "twitter": os.environ.get("SUPPLIER_USDC_ATA_TWITTER"),
}

# Validate on import — warn if placeholders or missing
_PLACEHOLDER = "11111111111111111111111111111111"
for _name, _addr in SUPPLIER_USDC_ATAS.items():
    if _addr is None or _addr == _PLACEHOLDER:
        log.warning(
            f"SUPPLIER_USDC_ATA_{_name.upper()} not set or is placeholder. "
            "Treasury will not perform real on-chain spends to this supplier. "
            "Run scripts/setup-vendors.sh to generate vendor keypairs."
        )


class TreasuryManager:
    """
    Agent's CFO. Decides when and how much to spend.
    """
    def __init__(self, client, memory=None):
        self.client = client
        self.memory = memory

    def _resolve_supplier(self, supplier: str) -> str | None:
        """Resolve supplier name to USDC ATA address string."""
        ata = SUPPLIER_USDC_ATAS.get(supplier)
        if not ata or ata == "11111111111111111111111111111111":
            log.warning(
                f"No valid USDC ATA for supplier '{supplier}'. "
                f"Set SUPPLIER_USDC_ATA_{supplier.upper()} env var."
            )
            return None
        return ata

    async def check(self, supplier: str, amount_usdc: float) -> dict:
        """Check if a payment would pass policy."""
        if self.client is None:
            return {"can_spend": False, "reason": "client not initialized", "supplier": supplier}

        recipient_str = self._resolve_supplier(supplier)
        if not recipient_str:
            return {"can_spend": False, "reason": f"no valid ATA for {supplier}", "supplier": supplier}

        amount_raw = int(amount_usdc * 1_000_000)
        recipient = Pubkey.from_string(recipient_str)
        ok, reason = await self.client.can_spend(amount_raw, recipient)
        return {"can_spend": ok, "reason": reason, "supplier": supplier}

    async def pay(self, supplier: str, amount_usdc: float, memo: str = None) -> dict:
        """Pay a supplier. recipient is a USDC ATA address."""
        if self.client is None:
            log.error("pay() called but client is None — cannot execute on-chain spend")
            return {"success": False, "reason": "client not initialized"}

        recipient_str = self._resolve_supplier(supplier)
        if not recipient_str:
            return {"success": False, "reason": f"no valid USDC ATA for supplier '{supplier}'"}

        amount_raw = int(amount_usdc * 1_000_000)
        recipient = Pubkey.from_string(recipient_str)

        ok, reason = await self.client.can_spend(amount_raw, recipient)
        if not ok:
            return {"success": False, "reason": reason}

        memo = memo or f"{supplier}-{datetime.utcnow().strftime('%Y-%m-%d')}"
        try:
            sig = await self.client.spend(amount_raw, recipient, memo=memo)
            log.info(f"Paid {supplier}: {amount_usdc} USDC, memo={memo}, sig={sig}")
            if self.memory:
                self.memory.log_spend(supplier, amount_raw)
            return {"success": True, "supplier": supplier, "amount": amount_usdc, "memo": memo, "sig": sig}
        except Exception as e:
            log.error(f"Payment failed for {supplier}: {e}")
            return {"success": False, "error": str(e)}

    async def tick(self) -> dict:
        """Hourly treasury check. Decides whether to spend."""
        if self.client is None:
            log.warning("tick() skipped — client is None, cannot query vault state")
            return {"reason": "client not initialized", "state": None, "actions": []}

        try:
            state = await self.client.get_vault_state()
        except Exception:
            state = {"balance": 0, "spent_today": 0, "max_per_day": 5_000_000}

        log.info(f"Treasury tick — vault state: {state}")
        actions = []

        # Rule 1: Balance too low -> conserve
        if state["balance"] < 1_000_000:
            return {"reason": "balance too low", "state": state, "actions": []}

        # Rule 2: Monthly OpenAI credit (simulated)
        today = datetime.utcnow()
        if today.day == 1 and self.memory and not self.memory.already_spent_today("openai"):
            amount = min(2_000_000, state["balance"] // 4)
            result = await self.pay("openai", amount / 1_000_000, f"openai-credit-{today.strftime('%Y-%m')}")
            if result.get("success"):
                actions.append(result)

        # Rule 3: RPC top-up when balance > 5 USDC
        if state["balance"] > 5_000_000:
            result = await self.pay("rpc", 0.5, f"rpc-topup-{today.isoformat()}")
            if result.get("success"):
                actions.append(result)

        return {"actions": actions, "state": state}
