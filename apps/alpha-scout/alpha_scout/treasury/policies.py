"""Spending policy definitions for AlphaScout."""

# Default policy for the AlphaScout vault
DEFAULT_POLICY = {
    "max_per_tx": 500_000,        # 0.5 USDC
    "max_per_day": 5_000_000,     # 5 USDC
    "require_allowlist": False,
    "expires_at": 0,              # Never expires
}

# Production policy (stricter)
PRODUCTION_POLICY = {
    "max_per_tx": 2_000_000,      # 2 USDC
    "max_per_day": 10_000_000,    # 10 USDC
    "require_allowlist": True,
    "expires_at": 0,
}
