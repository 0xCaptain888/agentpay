# AgentVault

> The on-chain treasury layer that x402 doesn't solve.
> Programmable spending controls for AI agents on Solana.

[![Devnet Live](https://img.shields.io/badge/devnet-live-brightgreen)](https://explorer.solana.com/address/3iJbMYgjMCFVkvHQSoeAb9EiTbcXyFqDxh88n4b7BP2s?cluster=devnet)
[![Mainnet Live](https://img.shields.io/badge/mainnet-live-brightgreen)](https://explorer.solana.com/address/MAINNET_PROGRAM_ID)
[![x402 Compatible](https://img.shields.io/badge/x402-compatible-blue)](https://github.com/coinbase/x402)
[![MCP Server](https://img.shields.io/badge/MCP-server-purple)](https://modelcontextprotocol.io)
[![Open Source](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Built with Anchor](https://img.shields.io/badge/built_with-Anchor_0.30-orange)](https://www.anchor-lang.com/)

**Live demo**: https://agentpay-dashboard.vercel.app · **Live agent**: [@alphascout_ai](https://x.com/alphascout_ai)

---

## The problem x402 doesn't solve

[Coinbase x402](https://github.com/coinbase/x402), [Stripe MPP](https://stripe.com/mpp),
[Google AP2](https://cloud.google.com/agent-payments-protocol) — they all answer **"how does an
AI agent pay for an API"**. None of them answer **"how do you stop an agent from over-paying"**.

Last month, an AI trading agent in production lost $50K in 3 hours from a single prompt
injection. The fix wasn't a smarter LLM. It was on-chain spending controls.

That's what AgentVault provides:

- **Per-tx + per-day spending limits**, enforced by a Solana program
- **Recipient allowlist** so a compromised agent cannot exfiltrate to attacker addresses
- **Owner emergency override** when the agent's keypair is suspected compromised
- **Full audit trail** as PDA accounts (no separate dashboard required)
- **0.3% protocol fee** on every withdrawal — sustainable on-chain SaaS revenue model

---

## How AgentVault compares

|                              | Coinbase x402 | Stripe MPP | Google AP2 | **AgentVault** |
|------------------------------|---------------|------------|------------|----------------|
| Pay-per-call HTTP payments   | Y             | Y          | Y          | Y              |
| **On-chain spending limits** | -             | -          | -          | **Y**          |
| **Daily caps + allowlist**   | -             | -          | -          | **Y**          |
| **Owner emergency override** | -             | -          | -          | **Y**          |
| **Audit trail**              | facilitator   | dashboard  | dashboard  | **PDA on-chain** |
| **Protocol fee (revenue)**   | -             | -          | -          | **0.3% on-chain** |
| Open source                  | Y             | -          | -          | Y (MIT)        |
| Drop-in middleware           | Y             | Y          | Y          | Y (compatible) |
| MCP server                   | -             | -          | -          | **Y**          |

> AgentVault is **compatible** with Coinbase's x402 protocol. Use Coinbase's `@x402/fetch`
> client unchanged — our middleware speaks the same wire format. The difference is on
> the server side: every withdrawal goes through on-chain policy verification.

---

## Architecture

```
+-----------------------------------------------------------------+
|  AI Agents (Claude / Cursor / your LangChain agent)             |
|  +------------------+              +------------------------+   |
|  | MCP Server        |              | x402 HTTP client       |   |
|  | (create_vault,    |              | (@x402/fetch or our    |   |
|  |  withdraw, etc.)  |              |  TS/Python SDK)        |   |
|  +--------+----------+              +----------+-------------+   |
+-----------|------------------------------------|------------------+
            | stdio                              | HTTP/x402
            v                                    v
+-----------------------------------------------------------------+
|   AgentVault SDK (TypeScript & Python)                           |
|   +-------------------+  +---------------------------------+    |
|   | x402-compliant    |  | Vault client                    |    |
|   | paywall           |  | - createVault, withdraw, query  |    |
|   +--------+----------+  +----------+----------------------+    |
+------------|-------------------------|--------------------------+
             |                         |
             v                         v
+-----------------------------------------------------------------+
|   Solana On-Chain (devnet, mainnet-ready)                        |
|   +----------------------------------------------------------+  |
|   |  AgentVault Anchor Program                                |  |
|   |   - One PDA Vault per agent (seed = "vault" + authority)  |  |
|   |   - SpendingPolicy enforced on every withdrawal:          |  |
|   |       max_per_tx, max_per_day, allowlist, expires_at      |  |
|   |   - 0.3% protocol fee -> FeeCollector PDA (on-chain SaaS) |  |
|   |   - Owner emergency_withdraw escape hatch                 |  |
|   +----------------------------------------------------------+  |
+-----------------------------------------------------------------+
```

---

## Live Demo

**AlphaScout** — an autonomous research agent earning USDC by selling market signals,
spending on its own LLM and infra costs. Running on devnet 24/7.

- Status: https://alpha-scout-prod.up.railway.app/status
- Vault PDA: [`2zeSyVy...`](https://explorer.solana.com/address/2zeSyVyqPYfzcYEJGqFt6c6weZKedK9XC4MFrquWbkay?cluster=devnet)
- Tweets: [@alphascout_ai](https://x.com/alphascout_ai)
- Dashboard: https://agentpay-dashboard.vercel.app

**DataSink** — second agent that consumes AlphaScout's signals (pays via vault).
Demonstrates **agent-to-agent commerce** with on-chain policy enforcement.

---

## Mainnet Deployment

AgentVault is live on **Solana mainnet-beta**.

[![Mainnet Live](https://img.shields.io/badge/mainnet-live-brightgreen)](https://explorer.solana.com/address/MAINNET_PROGRAM_ID)

| | Address | Explorer |
|---|---|---|
| **Program** | `MAINNET_PROGRAM_ID` | [View](https://explorer.solana.com/address/MAINNET_PROGRAM_ID) |
| **Demo Vault** | `MAINNET_VAULT_PDA` | [View](https://explorer.solana.com/address/MAINNET_VAULT_PDA) |
| **Vault USDC** | `MAINNET_VAULT_ATA` | [View](https://explorer.solana.com/address/MAINNET_VAULT_ATA) |

> The demo vault enforces a $0.50 per-tx / $5.00 per-day policy on mainnet.
> A 0.3% protocol fee is collected to the fee collector PDA on every withdrawal.

### Mainnet vs Devnet

| | Devnet | Mainnet |
|---|---|---|
| Real USDC | No (Circle testnet) | **Yes** |
| Policy enforcement | Yes | **Yes** |
| Protocol fee | Yes | **Yes** |

---

## Quick Start

### 1. Receive payments (5 lines)

```typescript
// Express
import { x402Paywall } from "@agentpay/sdk-ts";

app.get("/api/data", x402Paywall({
  connection,
  recipientAta: VAULT_ATA,        // your vault's USDC ATA
  asset: USDC_MINT,
  pricePerCall: 10_000n,           // 0.01 USDC
}), handler);
```

```python
# FastAPI
from agentpay import X402Paywall

paywall = X402Paywall(rpc=client, recipient_ata="...", asset="...", price=10_000)

@app.get("/api/data", dependencies=[Depends(paywall)])
async def data(): ...
```

### 2. Make payments (any x402 client works)

```typescript
import { fetchWithPayment } from "@x402/fetch";  // Coinbase's official client
const data = await fetchWithPayment(wallet, "https://your-host/api/data");
```

### 3. Create a vault with policy

```typescript
import { AgentPayClient } from "@agentpay/sdk-ts";

const client = new AgentPayClient({ connection, owner, agentAuthority });
await client.initializeVault({
  maxPerTx: 500_000n,        // 0.5 USDC max per call
  maxPerDay: 5_000_000n,     // 5 USDC max per day
  allowlist: [openaiAta, rpcAta, twitterAta],
  requireAllowlist: false,
});
```

Or via MCP — ask Claude in plain English:

> "Create a new agent vault for authority `9k...` with $1 per-tx limit and $5 per-day limit."

---

## x402 Protocol Compliance

AgentVault SDK is a drop-in replacement for [Coinbase's official x402 middleware](https://github.com/coinbase/x402),
with the additional benefit of on-chain spending policy enforcement.

```bash
npm install @agentpay/sdk-ts
```

```typescript
// Standard x402 server
import { x402Paywall } from "@agentpay/sdk-ts";

app.get("/data", x402Paywall({
  connection,
  recipientAta,
  asset: USDC_MINT,
  pricePerCall: 10_000n,
}), handler);

// Standard x402 client (Coinbase's @x402/fetch works unchanged)
import { fetchWithPayment } from "@x402/fetch";
const data = await fetchWithPayment(wallet, "https://your-host/data");
```

The difference: Coinbase's middleware accepts payment to *any* address. AgentVault's
SDK additionally lets the agent's wallet enforce per-tx + daily spending limits via
the on-chain `withdraw` instruction, so a compromised agent cannot drain funds even
if the LLM is jailbroken.

---

## Repo Layout

```
agentpay/
+-- programs/agent-vault/      # Anchor program (Rust, ~400 LoC)
+-- packages/
|   +-- sdk-ts/                # TypeScript SDK (vault client + x402 paywall)
|   +-- sdk-py/                # Python SDK
+-- apps/
|   +-- agentpay-mcp/          # MCP Server — agent tools
|   +-- alpha-scout/           # Demo agent A — earns by selling signals
|   +-- data-sink/             # Demo agent B — buys AlphaScout's signals
|   +-- dashboard/             # Live dashboard (Next.js)
|   +-- example-api/           # Reference TS integration (3 lines)
|   +-- example-py-api/        # Reference Python integration
+-- scripts/                   # Deploy/init scripts (devnet + mainnet)
+-- SECURITY.md                # Self-audit security report
```

## Why Solana

x402 settles in 400ms with sub-cent fees. Spending policy checks happen in the same
transaction as the transfer — there's no realistic alternative chain where this is
economically viable for thousands of agent transactions per minute.

## Business Model

AgentVault collects a **0.3% protocol fee** on every agent withdrawal, enforced transparently on-chain via the `FeeCollector` PDA. This creates sustainable, usage-based revenue that scales directly with agent activity:

- 100 agents x $5/day each = $500/day volume -> $1.50/day protocol revenue
- 10,000 agents = $150/day = ~$55K/year
- Fee rate (`fee_bps`) is configurable per vault (0 = free mode for public goods)
- All fees are visible on-chain via the FeeCollector account

---

## Security

See [SECURITY.md](SECURITY.md) for the full self-audit report, including:
- Threat model and reentrancy analysis
- Integer overflow protection
- 10 security test cases covering edge cases and attack vectors
- Known limitations and recommendations

---

## License

MIT.

## Built during

[Solana Frontier Hackathon](https://colosseum.com/frontier), April-May 2026.

---

*"Every AI agent in production needs a budget that the agent itself cannot exceed.
That's not a feature — that's banking."*
