from solders.pubkey import Pubkey
from datetime import datetime
import logging

log = logging.getLogger("treasury")

# Mock supplier ATAs for demo
MOCK_SUPPLIERS = {
    "openai": "11111111111111111111111111111111",
    "rpc": "11111111111111111111111111111111",
    "twitter": "11111111111111111111111111111111",
}


class TreasuryManager:
    """
    Agent's CFO. Decides when and how much to spend.
    """
    def __init__(self, client, memory=None):
        self.client = client
        self.memory = memory

    async def check(self, supplier: str, amount_usdc: float) -> dict:
        """Check if a payment would pass policy."""
        amount_raw = int(amount_usdc * 1_000_000)
        recipient = Pubkey.from_string(
            MOCK_SUPPLIERS.get(supplier, MOCK_SUPPLIERS["openai"])
        )
        ok, reason = await self.client.can_spend(amount_raw, recipient)
        return {"can_spend": ok, "reason": reason, "supplier": supplier}

    async def pay(self, supplier: str, amount_usdc: float, memo: str = None) -> dict:
        """Pay a supplier."""
        amount_raw = int(amount_usdc * 1_000_000)
        recipient_str = MOCK_SUPPLIERS.get(supplier, MOCK_SUPPLIERS["openai"])
        recipient = Pubkey.from_string(recipient_str)

        ok, reason = await self.client.can_spend(amount_raw, recipient)
        if not ok:
            return {"success": False, "reason": reason}

        memo = memo or f"{supplier}-{datetime.utcnow().strftime('%Y-%m-%d')}"
        try:
            # In production: actual on-chain spend
            # sig = await self.client.spend(amount_raw, recipient_ata, memo=memo)
            log.info(f"[MOCK] Paid {supplier}: {amount_usdc} USDC, memo={memo}")
            if self.memory:
                self.memory.log_spend(supplier, amount_raw)
            return {"success": True, "supplier": supplier, "amount": amount_usdc, "memo": memo}
        except Exception as e:
            log.error(f"Payment failed: {e}")
            return {"success": False, "error": str(e)}

    async def tick(self) -> dict:
        """Hourly treasury check. Decides whether to spend."""
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
