from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from typing import Optional


class EmptyArgs(BaseModel):
    pass


class PostToXArgs(BaseModel):
    text: str = Field(max_length=280)


class CheckSpendArgs(BaseModel):
    supplier: str
    amount_usdc: float


class PaySupplierArgs(BaseModel):
    supplier: str = Field(description="One of: openai, rpc, twitter")
    amount_usdc: float
    memo: Optional[str] = None


def build_tools(svc: dict) -> list:
    tools = [
        StructuredTool.from_function(
            name="read_vault_state",
            description="Read current balance, daily spending, policy",
            coroutine=svc["client"].get_vault_state,
            args_schema=EmptyArgs,
        ),
        StructuredTool.from_function(
            name="generate_signals",
            description="Run market research and generate today's signals (costs LLM tokens)",
            coroutine=svc["research"].run_daily,
            args_schema=EmptyArgs,
        ),
        StructuredTool.from_function(
            name="post_to_x",
            description="Post a tweet to X. Use for status updates, market commentary",
            coroutine=svc["twitter"].post,
            args_schema=PostToXArgs,
        ),
        StructuredTool.from_function(
            name="check_can_spend",
            description="Check if a payment of `amount` to `supplier` would pass policy",
            coroutine=svc["treasury"].check,
            args_schema=CheckSpendArgs,
        ),
        StructuredTool.from_function(
            name="pay_supplier",
            description="Pay `supplier` `amount` USDC. ONLY after check_can_spend returns ok.",
            coroutine=svc["treasury"].pay,
            args_schema=PaySupplierArgs,
        ),
    ]
    return tools
