from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from pathlib import Path
import json
import hashlib

from solana.rpc.async_api import AsyncClient
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.instruction import Instruction
from solders.transaction import VersionedTransaction
from solders.message import MessageV0
from anchorpy import Program, Provider, Wallet, Idl
from spl.token.constants import TOKEN_PROGRAM_ID

USDC_DEVNET_MINT = Pubkey.from_string(
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
)

MEMO_PROGRAM_ID = Pubkey.from_string(
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
)


@dataclass
class SpendingPolicy:
    max_per_tx: int            # raw USDC units (6 decimals)
    max_per_day: int
    allowlist: list[Pubkey] = field(default_factory=list)
    require_allowlist: bool = False
    expires_at: int = 0


class AgentPayClient:
    """
    Thin wrapper around the AgentVault program.
    Only exposes methods an Agent actually needs.
    """
    def __init__(
        self,
        rpc_url: str,
        program_id: str,
        agent_keypair: Keypair,
        idl_path: str | Path,
        usdc_mint: Pubkey = USDC_DEVNET_MINT,
    ):
        self.client = AsyncClient(rpc_url)
        self.wallet = Wallet(agent_keypair)
        self.provider = Provider(self.client, self.wallet)
        idl = Idl.from_json(Path(idl_path).read_text())
        self.program = Program(idl, Pubkey.from_string(program_id), self.provider)
        self.usdc_mint = usdc_mint
        self.agent_keypair = agent_keypair

    @property
    def authority(self) -> Pubkey:
        return self.agent_keypair.pubkey()

    @property
    def vault_pda(self) -> Pubkey:
        pda, _ = Pubkey.find_program_address(
            [b"vault", bytes(self.authority)],
            self.program.program_id
        )
        return pda

    async def vault_ata(self) -> Pubkey:
        from spl.token.instructions import get_associated_token_address
        return get_associated_token_address(self.vault_pda, self.usdc_mint)

    async def get_vault_state(self) -> dict:
        """Read on-chain vault state. Agent must read this before making decisions."""
        v = await self.program.account["AgentVault"].fetch(self.vault_pda)
        return {
            "balance": await self._balance(),
            "spent_today": v.stats.spent_today,
            "max_per_day": v.policy.max_per_day,
            "remaining_today":
                v.policy.max_per_day - v.stats.spent_today,
            "max_per_tx": v.policy.max_per_tx,
            "total_received": v.stats.total_received,
            "total_spent": v.stats.total_spent,
            # Policy details (for Dashboard PolicyPanel)
            "allowlist_size": len(v.policy.allowlist),
            "require_allowlist": v.policy.require_allowlist,
            "expires_at": v.policy.expires_at,
        }

    async def _balance(self) -> int:
        ata = await self.vault_ata()
        info = await self.client.get_token_account_balance(ata)
        return int(info.value.amount) if info.value else 0

    async def can_spend(self, amount: int, recipient: Pubkey) -> tuple[bool, str]:
        """
        Pre-check — Agent should call this before deciding to spend.
        Returns (can_spend, reason)
        """
        state = await self.get_vault_state()
        if amount > state["max_per_tx"]:
            return False, f"exceeds max_per_tx ({state['max_per_tx']})"
        if state["spent_today"] + amount > state["max_per_day"]:
            return False, "would exceed daily limit"
        if state["balance"] < amount:
            return False, f"insufficient balance ({state['balance']})"
        return True, "ok"

    async def spend(
        self, amount: int, recipient_ata: Pubkey,
        memo: str | None = None
    ) -> str:
        """
        Withdraw from vault to recipient. Returns tx signature.
        """
        ix = await self.program.methods["withdraw"](amount).accounts({
            "agent_authority": self.authority,
            "vault": self.vault_pda,
            "vault_ata": await self.vault_ata(),
            "recipient_ata": recipient_ata,
            "token_program": TOKEN_PROGRAM_ID,
        }).instruction()

        ixs = [ix]
        if memo:
            ixs.append(self._memo_ix(memo))

        return await self._send([self.agent_keypair], ixs)

    def _memo_ix(self, memo: str) -> Instruction:
        """Create a SPL Memo instruction."""
        return Instruction(
            program_id=MEMO_PROGRAM_ID,
            accounts=[],
            data=memo.encode("utf-8"),
        )

    async def _send(self, signers, ixs) -> str:
        recent = await self.client.get_latest_blockhash()
        msg = MessageV0.try_compile(
            payer=self.authority,
            instructions=ixs,
            address_lookup_table_accounts=[],
            recent_blockhash=recent.value.blockhash,
        )
        tx = VersionedTransaction(msg, signers)
        resp = await self.client.send_transaction(tx)
        return str(resp.value)
