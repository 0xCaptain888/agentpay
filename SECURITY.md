# AgentVault Security Report

**Version**: 0.2.0  
**Audit Type**: Self-audit + Peer review  
**Program ID (devnet)**: `3aWeD7m3YPfruph5yZkLruvvTf7T8yEqWrLC4FaAW9kA`  
**Program Lines of Code**: ~400 (Rust, Anchor 0.30)

---

## Scope

All instructions in `programs/agent-vault/programs/agent-vault/src/`:
- `initialize_vault`
- `withdraw_with_policy` <- primary attack surface
- `update_policy`
- `emergency_withdraw`
- `initialize_fee_collector`

---

## Findings Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| AV-01 | Info | Zero-amount withdrawal allowed | Accepted (SPL Token behavior) |
| AV-02 | Info | Daily limit uses UTC day boundary, not rolling 24h | Accepted (simpler, predictable) |
| AV-03 | Resolved | `spent_today` not reset on policy update | Fixed: reset on day boundary only |

---

## AV-01: Zero-Amount Withdrawal

**Description**: `withdraw(0)` succeeds and increments `spend_count`.  
**Risk**: Minimal - no funds moved. Could inflate stats.  
**Recommendation**: Add `require!(amount > 0, VaultError::ZeroAmount)` if desired.  
**Decision**: Accepted. SPL Token allows zero-transfers; behavior is consistent.

---

## AV-02: Daily Window Is Calendar Day, Not Rolling 24h

**Description**: Daily limit resets at UTC midnight (`unix_ts / 86400`), not 24 hours from first spend.  
**Risk**: An agent could spend full `max_per_day` at 23:59 UTC, then again at 00:01 UTC.  
**Recommendation**: For stricter control, use rolling 24h window.  
**Decision**: Accepted. Calendar day is simpler to reason about for operators.

---

## AV-03: Cross-Vault PDA Enforcement (Resolved)

**Description**: Anchor `seeds` constraint on `vault` account ensures PDA is derived from `agent_authority`. Passing a different agent's vault PDA will fail with account mismatch.  
**Status**: Resolved by Anchor constraint system.

---

## Reentrancy Analysis

Solana programs execute sequentially within a transaction. The `withdraw_with_policy` instruction follows a strict Read -> CPI -> Write pattern:

1. **Phase 1** (Read): All state is read into local variables. No mutable borrows.
2. **Phase 2** (CPI): SPL Token `transfer` is called. No callbacks possible in SPL Token.
3. **Phase 3** (Write): Stats are updated after CPI completes.

Classic reentrancy is not possible in Solana's execution model. The only CPI target is the audited SPL Token program.

---

## Integer Overflow Protection

All arithmetic uses Rust's checked operations:
- `checked_add` for accumulations -> returns `VaultError::Overflow` on wrap
- `u128` intermediate for fee calculation -> prevents `u64` overflow in `fee_bps * amount`
- Policy amounts are `u64`, matching SPL Token precision

---

## Test Coverage

| Test | Coverage |
|------|----------|
| Per-tx limit enforcement | Yes |
| Daily limit accumulation | Yes |
| Allowlist enforcement | Yes |
| Policy expiry | Yes |
| Emergency withdraw by owner | Yes |
| Unauthorized update_policy | Yes |
| Unauthorized emergency_withdraw | Yes |
| u64 MAX overflow attempt | Yes |
| Cross-vault drain attempt | Yes |
| Daily limit multi-tx | Yes |

Run tests: `cd programs/agent-vault && anchor test`

---

## Known Limitations (Out of Scope)

- **No formal verification** (e.g., Solana auditors). Recommended before mainnet-beta with real funds.
- **Owner key is a single keypair** in demo. Production should use Squads multisig.
- **Allowlist max 16 entries** is a hard limit (storage-bound). Extendable via merkle root in v2.
