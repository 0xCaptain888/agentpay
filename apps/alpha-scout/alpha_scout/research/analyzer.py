from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from typing import List


class Signal(BaseModel):
    title: str = Field(description="One-line headline, <80 chars")
    thesis: str = Field(description="2-3 sentences why it matters NOW")
    confidence: int = Field(ge=1, le=5, description="1-5 confidence")
    timeframe: str = Field(description="hours/days/weeks")
    relevant_tokens: List[str] = []
    risk_notes: str = ""


class DailySignals(BaseModel):
    date: str
    market_summary: str = Field(description="<200 chars")
    signals: List[Signal] = Field(min_length=3, max_length=5)


ANALYZER_PROMPT = """\
You are AlphaScout, an autonomous on-chain research agent on Solana.

You have access to today's data:

{market_data}

Generate 3-5 actionable signals based on RECENT changes (volume spikes, TVL movements,
new launches, governance events). Each signal must be specific, not generic advice.

Avoid:
- Boilerplate "DYOR" disclaimers (your audience already knows)
- Bullish/bearish predictions without specific catalyst
- Mentioning anything you don't have data for

Be confident, concise, contrarian when justified.

Output JSON matching the schema strictly. No prose outside JSON.
"""


class Analyzer:
    def __init__(self, model: str = "gpt-4o-mini", api_key: str = ""):
        self.llm = ChatOpenAI(
            model=model,
            temperature=0.4,
            api_key=api_key or None,
        )
        self.parser = JsonOutputParser(pydantic_object=DailySignals)

    async def generate(self, market_data: dict) -> DailySignals:
        prompt = ChatPromptTemplate.from_messages([
            ("system", ANALYZER_PROMPT),
            ("system", "Schema: {schema}"),
        ])
        chain = prompt | self.llm | self.parser
        result = await chain.ainvoke({
            "market_data": format_market_data(market_data),
            "schema": self.parser.get_format_instructions(),
        })
        return DailySignals(**result)


def format_market_data(data: dict) -> str:
    """Format market data dict into LLM-friendly text."""
    lines = []
    for token in data.get("top_tokens", [])[:10]:
        lines.append(
            f"- {token.get('symbol', 'N/A')}: "
            f"${token.get('current_price', 0):.4f} "
            f"(24h: {token.get('price_change_percentage_24h', 0):.1f}%, "
            f"vol ${token.get('total_volume', 0):,.0f})"
        )
    for proto in data.get("top_protocols", [])[:5]:
        lines.append(
            f"- {proto.get('name', 'N/A')}: "
            f"TVL ${proto.get('tvl', 0):,.0f} "
            f"(1d change: {proto.get('change_1d', 0):.1f}%)"
        )
    if data.get("large_transfers"):
        lines.append("\nLarge transfers detected:")
        for tx in data["large_transfers"][:5]:
            lines.append(
                f"  - ${tx['amount_usd']:,.0f} {tx['token']} "
                f"from {tx['from']} to {tx['to']}"
            )
    return "\n".join(lines) if lines else "No market data available."
