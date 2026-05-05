from pydantic_settings import BaseSettings
from pydantic import Field
from solders.keypair import Keypair
from solders.pubkey import Pubkey
import json
from pathlib import Path


class Settings(BaseSettings):
    # Chain
    rpc_url: str = "https://api.devnet.solana.com"
    program_id: str = "3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s"
    usdc_mint: str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
    agent_keypair_path: str = "./agent-keypair.json"

    # LLM (compatible with OpenAI API format — works with DeepSeek, etc.)
    openai_api_key: str = ""
    openai_api_base: str = ""  # Override base URL for DeepSeek etc.
    llm_model: str = "gpt-4o-mini"

    # Twitter (optional)
    twitter_bearer_token: str | None = None
    twitter_consumer_key: str | None = None
    twitter_consumer_secret: str | None = None
    twitter_access_token: str | None = None
    twitter_access_token_secret: str | None = None

    # Business
    price_per_signal: int = 10_000           # 0.01 USDC
    monthly_llm_cost_estimate: int = 5_000_000   # 5 USDC

    model_config = {"env_file": ".env"}

    def load_keypair(self) -> Keypair:
        data = json.loads(Path(self.agent_keypair_path).read_text())
        return Keypair.from_bytes(bytes(data))


settings = Settings()
