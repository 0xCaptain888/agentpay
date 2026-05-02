# AgentPay

> Programmable wallets and payment rails for AI agents on Solana.
> Stripe for AI agents — built during Solana Frontier Hackathon, April 2026.

## What it does

- **AgentVault**: Anchor program giving each AI agent a self-custodial wallet with on-chain spending policies (max-per-tx, daily limit, allowlist).
- **AgentPay SDK**: Drop-in HTTP 402 middleware for TypeScript and Python. Add 3 lines, charge USDC per API call.
- **AlphaScout**: A live demo agent that earns USDC by selling research signals and autonomously pays for its own operating costs (LLM credits, RPC, social media).

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Consumer Layer                          │
│   Third-party API services  │  Users paying for AlphaScout    │
└────────┬──────────────────────────────┬──────────────────────┘
         │ HTTP 402                     │ HTTP 402
         │ + X-Payment header           │ + X-Payment header
         ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Application Layer                           │
│  ┌─────────────────┐    ┌──────────────────────────────────┐ │
│  │ Third-party APIs │    │ AlphaScout Agent                 │ │
│  │ (using our SDK) │    │  - Autonomous research chain     │ │
│  │                  │    │  - Earns → deposits to Vault     │ │
│  │                  │    │  - Auto-spends (LLM / RPC)      │ │
│  └────────┬─────────┘    └──────────┬──────────────────────┘ │
│           │ TS SDK                  │ Python SDK              │
└───────────┼─────────────────────────┼────────────────────────┘
            ▼                         ▼
┌──────────────────────────────────────────────────────────────┐
│                     On-Chain Layer (Solana devnet)             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AgentVault Anchor Program                             │  │
│  │   - One Vault PDA per Agent                            │  │
│  │   - SpendingPolicy (per-tx, per-day, allowlist)        │  │
│  │   - USDC ATA owned by vault PDA                        │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Helius Webhook → monitor vault fund flows             │  │
│  │             → push to Dashboard real-time              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## How a Paid API Call Works (HTTP 402 Flow)

```
1. User  → AlphaScout: GET /signals/today
2. AlphaScout → User: 402 Payment Required
                       { amount: 10000, asset: USDC,
                         recipient: <vault_ata>,
                         nonce: <uuid>, expires: <ts> }
3. User wallet → On-chain: transfer 0.01 USDC to vault_ata
                            memo = nonce
4. User → AlphaScout: GET /signals/today
                      Header: X-Payment: <tx_signature>
                              X-Payment-Nonce: <nonce>
5. AlphaScout → On-chain: verify tx (amount, recipient, memo)
6. AlphaScout → User: 200 + signal data
7. Nonce cannot be reused (anti-replay, 5 min TTL)
```

## Quick Start

### Run the example API server (charges 0.01 USDC per call)

```bash
pnpm install
pnpm --filter @agentpay/example-api dev
curl http://localhost:3001/data           # → 402 Payment Required
```

### 3-Line SDK Integration (TypeScript)

```typescript
import { paywall, InMemoryNonceStore } from "@agentpay/sdk-ts";

app.get("/data", paywall({
  connection: conn,
  recipientVaultAta: VAULT_ATA,
  pricePerCall: 10_000n,    // 0.01 USDC
  noncesCache: new InMemoryNonceStore(),
}), handler);
```

### 3-Line SDK Integration (Python)

```python
from agentpay import Paywall

paywall = Paywall(rpc=client, recipient_ata="...", price=10_000)

@app.get("/data", dependencies=[Depends(paywall)])
async def data(): ...
```

## Repo Layout

```
agentpay/
├── programs/
│   └── agent-vault/              # Anchor smart contract (Rust)
│       └── programs/agent-vault/
│           └── src/
│               ├── lib.rs              # Program entrypoint
│               ├── state.rs            # AgentVault, SpendingPolicy, VaultStats
│               ├── errors.rs           # Error codes
│               └── instructions/
│                   ├── initialize_vault.rs
│                   ├── withdraw_with_policy.rs
│                   ├── update_policy.rs
│                   └── emergency_withdraw.rs
│
├── packages/
│   ├── sdk-ts/                   # TypeScript SDK
│   │   └── src/
│   │       ├── client.ts               # Vault client
│   │       └── http402/
│   │           ├── express.ts          # Express middleware
│   │           └── next.ts             # Next.js middleware
│   │
│   └── sdk-py/                   # Python SDK
│       └── agentpay/
│           ├── client.py               # Vault client
│           └── server.py               # FastAPI paywall
│
└── apps/
    ├── alpha-scout/              # AlphaScout Agent (Python)
    │   └── alpha_scout/
    │       ├── main.py                 # FastAPI + lifecycle
    │       ├── agent/                  # LangChain ReAct agent
    │       ├── research/               # Data sources + signal generation
    │       ├── treasury/               # Autonomous spending decisions
    │       ├── social/                 # Twitter/X integration
    │       ├── api/                    # Paid + free endpoints
    │       └── tasks/                  # Cron jobs
    │
    ├── dashboard/                # Next.js Dashboard
    │   └── app/
    │       ├── page.tsx                # Main page
    │       └── components/
    │           ├── LiveStats.tsx        # Balance/earned/spent
    │           ├── UptimeCounter.tsx    # Live uptime ticker
    │           ├── TransactionFeed.tsx  # Recent tx list
    │           └── PolicyPanel.tsx      # On-chain spending policy
    │
    ├── example-api/              # TS integration example
    └── example-py-api/           # Python integration example
```

## Module Overview

| Module | Language | Responsibility | Approx Lines |
|---|---|---|---|
| **AgentVault** (contract) | Rust/Anchor | Fund custody, policy enforcement, accounting | ~300 |
| **TypeScript SDK** | TypeScript | Vault client, HTTP 402 Express/Next.js middleware | ~500 |
| **Python Agent SDK** | Python | Vault client, HTTP 402 FastAPI dependency | ~400 |
| **AlphaScout Agent** | Python | Research, earn, autonomous spend, social | ~800 |
| **Dashboard** | TypeScript/Next.js | Real-time visualization | ~600 |

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Contract language | Anchor 0.30+ | Mature, well-documented, avoids native Rust pitfalls |
| Stablecoin | Devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) | Judges understand USDC; feels like real payments |
| Anti-replay | nonce + SPL Memo + 5-min server cache | Simple, effective, no complex state machines |
| Agent LLM | OpenAI gpt-4o-mini | Cost-effective, fast, reliable |
| Agent framework | LangChain + custom ReAct loop | Mature ecosystem, good tool integration |
| On-chain indexing | Helius webhooks + SWR polling | No custom indexer needed |

## Smart Contract Instructions

| Instruction | Signer | Description |
|---|---|---|
| `initialize_vault` | Owner | Create vault PDA + USDC ATA for an agent |
| `withdraw` | Agent Authority | Withdraw USDC subject to spending policy |
| `update_policy` | Owner | Update spending limits, allowlist, expiry |
| `emergency_withdraw` | Owner | Bypass policy — failsafe for compromised agents |

## Spending Policy (On-Chain Enforced)

```rust
pub struct SpendingPolicy {
    pub max_per_tx: u64,        // Max USDC per transaction (6 decimals)
    pub max_per_day: u64,       // Max USDC per rolling day
    pub allowlist: Vec<Pubkey>, // Up to 16 allowed recipients
    pub require_allowlist: bool,// Enforce allowlist check
    pub expires_at: i64,        // Policy expiry (0 = never)
}
```

The agent cannot exceed these limits even if compromised. The owner (human) retains `emergency_withdraw` as a final safety mechanism.

## AlphaScout — The Demo Agent

> AlphaScout is an autonomous research agent living on Solana. It wakes up daily to scan on-chain activity and crypto markets, generates 3-5 trading signals, and sells them for 0.01 USDC each. It uses its earnings to pay for OpenAI credits, RPC fees, and X Premium. It has never asked its creator for a single cent.

**Schedule:**
- **14:00 UTC daily** — Research cycle (fetch data → generate signals via LLM)
- **Every 1 hour** — Treasury tick (check balance, auto-pay suppliers)
- **Every 6 hours** — Social post (status update on X)

**Endpoints:**
- `GET /signals/today` — Paid (0.01 USDC) — Today's research signals
- `GET /status` — Free — Agent status, vault state, uptime
- `GET /manifest` — Free — Vault ATA, pricing info
- `GET /health` — Free — Health check

## Environment Variables

```bash
# Chain
RPC_URL=https://devnet.helius-rpc.com/?api-key=...
PROGRAM_ID=<your program id>
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Agent
AGENT_KEYPAIR_PATH=/secrets/agent.json
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Twitter (optional)
TWITTER_CONSUMER_KEY=...
TWITTER_CONSUMER_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_TOKEN_SECRET=...

# Dashboard
ALPHASCOUT_URL=https://alpha-scout-prod.up.railway.app
NEXT_PUBLIC_PROGRAM_ID=<same as PROGRAM_ID>
NEXT_PUBLIC_VAULT_AUTHORITY=<agent pubkey>
```

## Development Status

- [x] Day 1: Project scaffold, monorepo setup
- [x] Day 2: AgentVault smart contract (4 instructions, 7 error codes, full test suite)
- [x] Day 3: TypeScript SDK + HTTP 402 Express/Next.js middleware
- [x] Day 3-4: Python Agent SDK (vault client + FastAPI paywall)
- [x] Day 4: AlphaScout Agent (research pipeline, treasury, social, cron tasks)
- [x] Day 5: Dashboard (Next.js, real-time stats, uptime counter, tx feed)
- [x] Day 6: Example integrations (TS + Python), end-to-end validation
- [ ] Day 7-9: Pitch, demo video, submission

## Resilience

| Scenario | Behavior |
|---|---|
| RPC temporarily down | Agent retries 3x then skips cycle |
| LLM API 5xx | Agent caches last result, posts "degraded mode" |
| Vault balance insufficient | Refuses spending, posts "low balance" on X |
| Nonce replay | Returns 409 Conflict |
| Underpayment | Returns 402 invalid payment |
| Missing memo | Returns 402 invalid payment |
| Agent keypair compromised | Owner uses `emergency_withdraw` to rescue funds |

## Note on Demo Vendors

In production, supplier recipients (OpenAI, RPC, X Premium) would be real exchange/credit deposit addresses. For the demo, we use mock vendor wallets to demonstrate the autonomous spending flow. Every transaction is a real on-chain USDC transfer on devnet.

## License

MIT
