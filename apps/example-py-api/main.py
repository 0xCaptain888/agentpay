"""
Example Python API using AgentPay SDK.
Returns a random motivational quote for 0.001 USDC per call.
"""
import os
from fastapi import FastAPI, Depends
from solana.rpc.async_api import AsyncClient
from agentpay import Paywall
import random

app = FastAPI(title="QuoteBot", description="Pay 0.001 USDC for a motivational quote")

# Initialize paywall
RPC_URL = os.environ.get("RPC_URL", "https://api.devnet.solana.com")
VAULT_ATA = os.environ.get("VAULT_ATA")
if not VAULT_ATA or VAULT_ATA == "11111111111111111111111111111111":
    raise RuntimeError(
        "VAULT_ATA env var required. Set it to your vault's USDC ATA address. "
        "Example: export VAULT_ATA=2EoLQwEHNy4gqeuMws5zhzpjKw6dnoUax3V1obhiqNuP"
    )

rpc = AsyncClient(RPC_URL)
paywall = Paywall(
    rpc=rpc,
    recipient_ata=VAULT_ATA,
    price=1_000,  # 0.001 USDC
)

QUOTES = [
    "The best way to predict the future is to create it. — Peter Drucker",
    "Innovation distinguishes between a leader and a follower. — Steve Jobs",
    "The only way to do great work is to love what you do. — Steve Jobs",
    "Move fast and break things. — Mark Zuckerberg",
    "Stay hungry, stay foolish. — Steve Jobs",
    "Code is like humor. When you have to explain it, it's bad. — Cory House",
    "First, solve the problem. Then, write the code. — John Johnson",
    "The best error message is the one that never shows up. — Thomas Fuchs",
    "Simplicity is the soul of efficiency. — Austin Freeman",
    "Make it work, make it right, make it fast. — Kent Beck",
]


@app.get("/quote", dependencies=[Depends(paywall)])
async def get_quote():
    """Pay 0.001 USDC to get a random motivational quote."""
    return {
        "quote": random.choice(QUOTES),
        "price_paid": "0.001 USDC",
        "powered_by": "AgentPay",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3002)
