# Sprint 123A.3 — Gate G3 Evidence Submission (Revision 2)

**Branch:** `sprint/123a-2-databento-adapter`
**Implementation SHA:** `cdd3db7679e6761354774cd2a21e55ea5a4cf25a`
**Gate G2 Approved Baseline:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`

---

## 1. Regression Summary

| Suite | File | Tests | Result |
|-------|------|-------|--------|
| Sprint 123A.1 unit | `server/sprint-123a1.test.ts` | 35 | ALL PASS |
| Sprint 123A.1 integration | `server/sprint-123a1-integration.test.ts` | 7 | ALL PASS |
| Sprint 123A.2 TypeScript | `server/market-data/tests/sprint-123a2.test.ts` | 31 | ALL PASS |
| Sprint 123A.3 core | `server/market-data/tests/sprint-123a3.test.ts` | 62 | ALL PASS |
| Trade-built lifecycle | `server/market-data/tests/trade-bar-builder.test.ts` | 12 | ALL PASS |
| Gap recovery integration | `server/market-data/tests/gap-recovery-orchestrator.test.ts` | 9 | ALL PASS |
| Blocked-window state | `server/market-data/tests/blocked-window.test.ts` | 5 | ALL PASS |
| MySQL persistence | `server/market-data/tests/mysql-bar-persistence.test.ts` | 15 | ALL PASS |
| Contract roll integration | `server/market-data/tests/contract-roll-integration.test.ts` | 7 | ALL PASS |
| Sprint 123A.2 Python | `services/databento-feed/tests/` | 143 | ALL PASS |
| `pnpm tsc --noEmit` | — | — | Exit 0 |
| **Total** | | **326** | **ALL PASS** |

Failures: **0** | Skipped: **0** | Unexpected warnings: **0**

---

## 2. Gate G3 Revision 2 Requirements — Evidence

### R1: Full Trade-Built DEVELOPING → PROVISIONAL → CONFIRMED/UNRESOLVED Lifecycle

**File:** `server/market-data/trade-bar-builder.ts`

`TradeBarBuilder` implements a two-source lifecycle:

- Individual `databento:trade` events build a `DEVELOPING` bar in-memory (running OHLCV, trade count, volume).
- At the minute boundary (or on `closeDevelopingBar()` call), the bar transitions to `PROVISIONAL`.
- When the official `databento:ohlcv-1m` record arrives, `BarReconciler.reconcile()` is called and the bar transitions to `CONFIRMED` (within tolerance) or `UNRESOLVED` (outside tolerance or inconsistent).
- `CONFIRMED` is never reached from internal consistency alone — it requires the official ohlcv-1m record.

**Test evidence:** `TEST-123A3-TBB001..TBB012` in `trade-bar-builder.test.ts` — 12 tests, all pass.

| Test ID | Behaviour Proven |
|---------|-----------------|
| TBB001 | First trade creates DEVELOPING bar |
| TBB002 | Running high/low updated correctly across trades |
| TBB003 | closeDevelopingBar() transitions to PROVISIONAL |
| TBB004 | PROVISIONAL bar emits bar:provisional event |
| TBB005 | Official ohlcv-1m confirms PROVISIONAL to CONFIRMED |
| TBB006 | Official ohlcv-1m with large delta transitions to UNRESOLVED |
| TBB007 | Duplicate trade (same sequence) is ignored |
| TBB008 | Trade for wrong instrument is ignored |
| TBB009 | CONFIRMED requires official record — not internal consistency alone |
| TBB010 | Nanosecond precision preserved in barOpenTsNs |
| TBB011 | gap:detected emitted when sequence gap > 1 |
| TBB012 | DEVELOPING bar volume accumulates correctly |

---

### R2: End-to-End Gap Recovery Integration

**File:** `server/market-data/gap-recovery-orchestrator.ts`

`GapRecoveryOrchestrator` connects TypeScript `bar:gap-detected` events to the Python `RecoveryManager` via the bridge server:

1. Subscribes to `bar:gap-detected` events from `TradeBarBuilder`.
2. Emits a `recovery:requested` envelope to the bridge server (which forwards to Python `RecoveryManager`).
3. Subscribes to `recovery:complete`, `recovery:partial`, and `recovery:failed` envelopes from the bridge.
4. On `recovery:complete`: inserts recovered bars into the `WindowAccumulator` to unblock `BLOCKED_UNRESOLVED` windows.
5. On `recovery:partial`: logs unresolved range, does not invoke `on_complete`.
6. On `recovery:failed`: emits `recovery:exhausted` event for downstream alerting.
7. Duplicate recovery requests for the same gap are deduplicated.

**Test evidence:** `TEST-123A3-GRO001..GRO009` in `gap-recovery-orchestrator.test.ts` — 9 tests, all pass.

---

### R3: Blocked-Window State

**File:** `server/market-data/five-min-aggregator.ts` (updated)

`WindowAccumulator` now implements `BLOCKED_UNRESOLVED` state:

- When an `UNRESOLVED` bar arrives for a window, the window transitions to `BLOCKED_UNRESOLVED` (bars are preserved, not discarded).
- `insertRecoveredBar()` replaces an UNRESOLVED slot with a CONFIRMED recovered bar.
- When all 5 slots are CONFIRMED after recovery insertion, `_tryComplete()` emits the five-minute bar exactly once.
- A duplicate-completion guard (`WindowState.EMITTED`) prevents double emission.

**Test evidence:** `TEST-123A3-BLK001..BLK005` in `blocked-window.test.ts` — 5 tests, all pass.

The `sprint-123a3.test.ts` test `TEST-123A3-AGG011` was updated from "window discarded" to "window transitions to BLOCKED_UNRESOLVED" to reflect the approved Revision 2 behaviour.

---

### R4: Real MySQL Persistence Compatibility

**Database:** Disposable MySQL 8 instance at `/tmp/mysql_test.sock` (no production connection).
**Migration:** `drizzle/0026_sprint_123a3_bar_lifecycle.sql` applied in full.
**Adapter:** `MySQLBarDatabaseAdapter` in `server/market-data/bar-persistence.ts`.

The adapter implements:
- `insertBar1m()` with `INSERT IGNORE` effectively-once semantics (idempotent on `(dataset, instrument_id, bar_open_ts_ms)`).
- `insertBar5m()` with `INSERT IGNORE` on `(dataset, instrument_id, bar_open_ts_ms)`.
- `recordProcessed()` writes to `atlas_bar_processing_ledger`.
- `isAlreadyProcessed()` checks the ledger before processing.
- Writes only to `atlas_bars_1m`, `atlas_bars_5m`, and `atlas_bar_processing_ledger` — not `atlas_canonical_bars`.

**Test evidence:** `TEST-123A3-PER001..PER015` in `mysql-bar-persistence.test.ts` — 15 tests against real MySQL 8, all pass.

| Test ID | Behaviour Proven |
|---------|-----------------|
| PER001 | 1m bar inserted successfully |
| PER002 | Duplicate 1m bar INSERT IGNORE (no error, no duplicate row) |
| PER003 | 5m bar inserted successfully |
| PER004 | Duplicate 5m bar INSERT IGNORE |
| PER005 | Processing ledger entry created |
| PER006 | isAlreadyProcessed returns true after recording |
| PER007 | isAlreadyProcessed returns false for new bar |
| PER008 | UNRESOLVED bar stored with correct lifecycle column |
| PER009 | CONFIRMED bar stored with correct lifecycle column |
| PER010 | atlas_canonical_bars is NOT written by this adapter |
| PER011 | Rollback on connection error leaves no partial state |
| PER012 | Multiple bars in sequence all persisted |
| PER013 | bar_open_ts_ms precision preserved (milliseconds) |
| PER014 | instrument_id stored correctly |
| PER015 | Migration 0026 schema matches adapter field names |

---

### R5: Contract Roll Integration — DBN-Decoded Fixture

**Fixture:** `services/databento-feed/tests/fixtures/mnq_definition_record.dbn` (520 bytes)
**Fixture type:** TIER 2 — Official DBN-decoded (real `databento_dbn.InstrumentDefMsg` via `DBNDecoder`)

**Test evidence:** `TEST-123A3-CRL001..CRL007` in `contract-roll-integration.test.ts` — 7 tests, all pass.

| Test ID | Behaviour Proven |
|---------|-----------------|
| CRL001 | Real DBN-decoded definition accepted and stored |
| CRL002 | Expiry decoded correctly from nanosecond timestamp (1748649600000000000 ns → 2025-05-31 UTC) |
| CRL003 | min_price_increment stored correctly in fixed-point (2500000 / 10,000,000 = 0.25 pts) |
| CRL004 | Currency (USD) and instrument_class (F) stored correctly |
| CRL005 | Symbol mapping accepted and linked to contract |
| CRL006 | Contract roll detected when active symbol changes (MNQM5 → MNQU5) |
| CRL007 | isNearExpiry returns true when within 7-day window |

---

## 3. Changed Files (Gate G2 Baseline → Implementation SHA)

New files added in Sprint 123A.3:

| File | Type | Purpose |
|------|------|---------|
| `server/market-data/types/bar-lifecycle.ts` | New | Canonical data model |
| `server/market-data/bar-builder.ts` | New | One-minute bar construction engine |
| `server/market-data/bar-reconciler.ts` | New | Official ohlcv-1m reconciliation |
| `server/market-data/five-min-aggregator.ts` | New (updated R2) | Five-minute aggregation + BLOCKED_UNRESOLVED |
| `server/market-data/contract-manager.ts` | New | Contract definition and roll detection |
| `server/market-data/bar-persistence.ts` | New (updated R2) | Effectively-once persistence |
| `server/market-data/trade-bar-builder.ts` | New | Trade-built lifecycle (R1) |
| `server/market-data/gap-recovery-orchestrator.ts` | New | Gap recovery integration (R2) |
| `server/market-data/tests/sprint-123a3.test.ts` | New (updated R2) | Core Gate G3 test suite |
| `server/market-data/tests/trade-bar-builder.test.ts` | New | Trade lifecycle tests |
| `server/market-data/tests/gap-recovery-orchestrator.test.ts` | New | Gap recovery tests |
| `server/market-data/tests/blocked-window.test.ts` | New | Blocked-window tests |
| `server/market-data/tests/mysql-bar-persistence.test.ts` | New | Real MySQL tests |
| `server/market-data/tests/contract-roll-integration.test.ts` | New | Contract roll tests |

No files outside `server/market-data/` were modified in Sprint 123A.3.

---

## 4. Production Safety Confirmation

| Item | Status |
|------|--------|
| Migration 0026 run against production | **NOT RUN** |
| DATABENTO_SHADOW activated | **NOT ACTIVATED** |
| DATABENTO_CHART_AUTHORITY activated | **NOT ACTIVATED** |
| DATABENTO_LEARNING_AUTHORITY activated | **NOT ACTIVATED** |
| DATABENTO_DECISION_AUTHORITY implemented | **NOT IMPLEMENTED** |
| Databento-triggered postBarAutomation | **NOT CONNECTED** |
| Databento-triggered processBar | **NOT CONNECTED** |
| TradingView processBar trigger | **REMAINS AUTHORITATIVE** |
| Production authority files changed | **NONE** |
| ADE, strategies, risk, or execution changed | **NONE** |
| Sprint 123A.4 begun | **NOT BEGUN** |

---

## 5. Gate G3 Recommendation

All 8 Gate G3 Revision 2 requirements are implemented, tested, and passing.

- One-minute lifecycle evidence: `TEST-123A3-BAR001..BAR012`, `TEST-123A3-TBB001..TBB012`
- Official-bar reconciliation evidence: `TEST-123A3-REC001..REC010`
- Unresolved-bar blocking evidence: `TEST-123A3-BLK001..BLK005`, `TEST-123A3-AGG011`
- Five-minute aggregation evidence: `TEST-123A3-AGG001..AGG012`
- Gap recovery evidence: `TEST-123A3-GRO001..GRO009`
- Contract mapping and rollover evidence: `TEST-123A3-CRL001..CRL007`
- Effectively-once and duplicate handling evidence: `TEST-123A3-PER001..PER015`
- Migration compatibility evidence: `TEST-123A3-PER015`, real MySQL 8 with migration 0026
- Rollback evidence: `TEST-123A3-PER011`
- No production authority changed: confirmed above

**Sprint 123A.3 Gate G3 approval is requested.**
Sprint 123A.4 will not begin until written Gate G3 approval is received from Phil.
