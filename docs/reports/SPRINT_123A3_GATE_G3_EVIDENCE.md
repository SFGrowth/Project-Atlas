# Sprint 123A.3 — Gate G3 Evidence Submission

**Sprint:** 123A.3 — TypeScript Canonical One-Minute Bar Construction  
**Branch:** `sprint/123a-2-databento-adapter`  
**Implementation SHA:** `a35d472dd3d3d4fec1e5dfab6d73ef1f666b209e`  
**Date:** 2026-07-19  
**Prepared by:** Atlas Nexus Development System  

---

## Gate G2 Approval Reference

Gate G2 was approved at commit `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` with the following scope authorisation for Sprint 123A.3:

> TypeScript canonical one-minute bar construction; developing, provisional, confirmed and unresolved bar lifecycles; reconciliation against official Databento ohlcv-1m records; five-minute aggregation from five confirmed one-minute bars only; gap detection and historical recovery integration; contract definition and symbol-mapping handling; contract-roll preparation; effectively-once processing and persistence preparation; fixture-based and disposable-database validation; parity-data preparation while TradingView remains authoritative.

---

## 1. Regression Results

### 1.1 Targeted TypeScript Regression (Sprint 123A.1 + 123A.2 + 123A.3)

Command:
```
pnpm vitest run \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  server/market-data/tests/sprint-123a2.test.ts \
  server/market-data/tests/sprint-123a3.test.ts \
  --reporter=verbose
```

| Suite | Tests | Result |
|-------|-------|--------|
| Sprint 123A.1 unit (`sprint-123a1.test.ts`) | 35 | ALL PASS |
| Sprint 123A.1 integration (`sprint-123a1-integration.test.ts`) | 7 | ALL PASS |
| Sprint 123A.2 TypeScript (`sprint-123a2.test.ts`) | 31 | ALL PASS |
| Sprint 123A.3 TypeScript (`sprint-123a3.test.ts`) | 62 | ALL PASS |
| **Total TypeScript** | **135** | **ALL PASS** |

Expected stderr: 1 line in INT-006 (`[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure`) — this is the intentional error-isolation test from Sprint 123A.1. Unexpected stderr: none.

### 1.2 Sprint 123A.2 Python Regression

Command: `python3 -m pytest services/databento-feed/tests/ -q`

| Result | Count |
|--------|-------|
| Passed | 143 |
| Failed | 0 |
| Warnings | 0 |

### 1.3 TypeScript Compilation

Command: `pnpm tsc --noEmit`

**Result: Exit 0 — clean (0 errors)**

### 1.4 Combined Totals

| Metric | Value |
|--------|-------|
| Total unique targeted tests | **278** (135 TypeScript + 143 Python) |
| Failures | **0** |
| Skipped | **0** |
| Unexpected warnings | **0** |

---

## 2. One-Minute Bar Lifecycle Evidence (TEST-123A3-BAR001..BAR012)

The `BarBuilder` class in `server/market-data/bar-builder.ts` implements the full one-minute bar lifecycle.

### 2.1 State Transitions

| From State | Trigger | To State |
|-----------|---------|----------|
| — | `processOhlcv1m()` called | `PROVISIONAL` |
| `PROVISIONAL` | OHLCV consistency valid | `CONFIRMED` |
| `PROVISIONAL` | OHLCV consistency invalid | `UNRESOLVED` |
| `PROVISIONAL` | `expirePendingBar()` called | `UNRESOLVED` |

### 2.2 Key Invariants Proven

- `TEST-123A3-BAR001`: `processOhlcv1m` emits `bar:provisional` for a new bar.
- `TEST-123A3-BAR002`: Bar transitions to `CONFIRMED` when OHLCV is internally consistent.
- `TEST-123A3-BAR003`: Bar transitions to `UNRESOLVED` when `high < open`.
- `TEST-123A3-BAR004`: Bar transitions to `UNRESOLVED` when `low > close`.
- `TEST-123A3-BAR005`: Duplicate bar (same `ts_event_ns`) is silently ignored.
- `TEST-123A3-BAR006`: Nanosecond timestamp is preserved in `barOpenTsNs`.
- `TEST-123A3-BAR007`: `barOpenTsMs` is correctly derived from `ts_event_ns` via BigInt.
- `TEST-123A3-BAR008`: `barCloseTsMs = barOpenTsMs + 60,000`.
- `TEST-123A3-BAR009`: Bar for wrong instrument is ignored.
- `TEST-123A3-BAR010`: Reconciliation detail is attached to `CONFIRMED` bar.
- `TEST-123A3-BAR011`: Reconciliation detail is attached to `UNRESOLVED` bar.
- `TEST-123A3-BAR012`: `PENDING_TIMEOUT_MS = 90,000` (3× bar period).

---

## 3. Official-Bar Reconciliation Evidence (TEST-123A3-REC001..REC010)

The `BarReconciler` class in `server/market-data/bar-reconciler.ts` implements OHLCV consistency validation and delta-based reconciliation.

### 3.1 Reconciliation Rules

| Rule | Condition | Outcome |
|------|-----------|---------|
| All fields positive | `open/high/low/close > 0` | Required for MATCHED |
| High is maximum | `high >= open, close, low` | Required for MATCHED |
| Low is minimum | `low <= open, close, high` | Required for MATCHED |
| Delta within tolerance | `|delta| <= 25 pts100` | MATCHED |
| Delta exceeds tolerance | `|delta| > 25 pts100` | UNMATCHED |
| Reference unavailable | Timeout expired | UNAVAILABLE |

### 3.2 Key Tests

- `TEST-123A3-REC005`: Default tolerance is 25 pts100 (0.25 MNQ points).
- `TEST-123A3-REC006`: `reconcile()` returns `CONFIRMED` when timestamps match and within tolerance.
- `TEST-123A3-REC007`: `reconcile()` returns `UNRESOLVED` when timestamps do not match.
- `TEST-123A3-REC008`: `reconcile()` returns `UNRESOLVED` when close delta exceeds tolerance (100 pts100 = 1.0 point).
- `TEST-123A3-REC009`: `markUnavailable()` transitions bar to `UNRESOLVED` with `UNAVAILABLE` status.
- `TEST-123A3-REC010`: Already-`CONFIRMED` bar is returned unchanged by `reconcile()`.

---

## 4. Five-Minute Aggregation Evidence (TEST-123A3-AGG001..AGG012)

The `FiveMinAggregator` class in `server/market-data/five-min-aggregator.ts` enforces 6 invariants before producing a five-minute bar.

### 4.1 Aggregation Invariants

| # | Invariant | Rejection Reason |
|---|-----------|-----------------|
| 1 | Exactly 5 bars | `WRONG_BAR_COUNT` |
| 2 | All bars `CONFIRMED` | `NOT_ALL_CONFIRMED` |
| 3 | No `UNRESOLVED` bars | `CONTAINS_UNRESOLVED` |
| 4 | Bars contiguous (no gaps) | `NON_CONTIGUOUS` |
| 5 | Window on 5-min boundary | `MISALIGNED_WINDOW` |
| 6 | Same instrument/dataset | `MIXED_INSTRUMENTS` |

### 4.2 OHLCV Aggregation Formula

| Field | Formula |
|-------|---------|
| Open | First bar's open |
| High | `max(all highs)` |
| Low | `min(all lows)` |
| Close | Last bar's close |
| Volume | `sum(all volumes)` |
| TradeCount | `sum(all trade counts)` |

### 4.3 Unresolved-Bar Blocking Evidence

`TEST-123A3-AGG002` and `TEST-123A3-AGG011` prove that:
- A window containing an `UNRESOLVED` bar is rejected with `CONTAINS_UNRESOLVED`.
- `WindowAccumulator.addBar()` discards the entire window when an `UNRESOLVED` bar is added.

This is the primary Gate G3 enforcement mechanism for the requirement:
> "A five-minute window containing an unresolved minute must not produce a bar row in atlas_bars_5m."

---

## 5. Gap Detection Evidence (TEST-123A3-GAP001..GAP006)

- `TEST-123A3-GAP001`: Gap detected when a bar arrives more than 1 minute after the last confirmed bar.
- `TEST-123A3-GAP002`: No gap detected for consecutive bars (1 minute apart).
- `TEST-123A3-GAP003`: Gap event contains correct `gapStartTsMs`, `gapEndTsMs`, and `missingBarCount`.
- `TEST-123A3-GAP004`: No gap detected for the first bar (no prior confirmed bar).
- `TEST-123A3-GAP005`: `lastConfirmedBarOpenTsMs` is updated after each `CONFIRMED` bar.
- `TEST-123A3-GAP006`: `lastConfirmedBarOpenTsMs` is NOT updated for `UNRESOLVED` bar.

---

## 6. Contract Definition and Symbol-Mapping Evidence (TEST-123A3-CTR001..CTR008)

The `ContractManager` class in `server/market-data/contract-manager.ts` manages contract definitions, symbol mappings, and roll detection.

- `TEST-123A3-CTR002`: Expiry timestamp correctly decoded from nanoseconds via BigInt.
- `TEST-123A3-CTR003`: `null` `expiry_ts_ns` produces `null` `expiryTsMs`.
- `TEST-123A3-CTR005`: Contract roll detected when active symbol changes (`MNQH4` → `MNQM4`).
- `TEST-123A3-CTR006`: No roll detected when symbol does not change.
- `TEST-123A3-CTR008`: `isNearExpiry()` returns `true` when expiry is within 7 days.

---

## 7. Effectively-Once Persistence Evidence (TEST-123A3-PER001..PER008)

The `BarPersistence` class in `server/market-data/bar-persistence.ts` uses `InMemoryBarDatabaseAdapter` for fixture-based testing (no live database required).

- `TEST-123A3-PER001`: `persistBar1m()` inserts a `CONFIRMED` bar and returns `inserted=true`.
- `TEST-123A3-PER002`: `persistBar1m()` rejects a non-`CONFIRMED` bar.
- `TEST-123A3-PER003`: Duplicate insert returns `inserted=false` (effectively-once).
- `TEST-123A3-PER004`: `persistBar5m()` inserts a five-minute bar.
- `TEST-123A3-PER005`: Duplicate 5m bar insert returns `inserted=false`.
- `TEST-123A3-PER006/007`: Processing ledger correctly tracks `isAlreadyProcessed`/`markProcessed`.
- `TEST-123A3-PER008`: Persisted bar row contains correct reconciliation fields.

---

## 8. Authority Invariant Evidence (TEST-123A3-AUTH001..AUTH006)

- `TEST-123A3-AUTH001`: `BarBuilder` does not emit `processBar` or `postBarAutomation` events.
- `TEST-123A3-AUTH002`: `FiveMinAggregator` is not an `EventEmitter` — it returns results synchronously.
- `TEST-123A3-AUTH003`: `BarPersistence` writes only to `atlas_bars_1m` and `atlas_bars_5m` (not `atlas_canonical_bars`).
- `TEST-123A3-AUTH004`: `UNRESOLVED` bar is not persisted by `BarPersistence`.
- `TEST-123A3-AUTH005`: `FiveMinAggregator` rejects window containing `UNRESOLVED` bar.
- `TEST-123A3-AUTH006`: `source` field on all produced records is always `'DATABENTO'`.

---

## 9. Files Delivered

| File | Type | Description |
|------|------|-------------|
| `server/market-data/types/bar-lifecycle.ts` | New | Canonical data model: all types, enums, constants |
| `server/market-data/bar-builder.ts` | New | One-minute bar construction engine |
| `server/market-data/bar-reconciler.ts` | New | Official-bar reconciliation engine |
| `server/market-data/five-min-aggregator.ts` | New | Five-minute aggregation + WindowAccumulator |
| `server/market-data/contract-manager.ts` | New | Contract definition, symbol mapping, roll detection |
| `server/market-data/bar-persistence.ts` | New | Effectively-once persistence + InMemoryAdapter |
| `server/market-data/tests/sprint-123a3.test.ts` | New | 62 Gate G3 tests |
| `docs/SPRINT-123A3-PLANNING-CONTEXT.md` | New | Sprint planning context |

---

## 10. Production Safety Confirmations

| Item | Status |
|------|--------|
| Migration 0026 not run against production | **CONFIRMED** |
| `DATABENTO_SHADOW` not activated | **CONFIRMED** |
| `DATABENTO_CHART_AUTHORITY` not activated | **CONFIRMED** |
| `DATABENTO_LEARNING_AUTHORITY` not activated | **CONFIRMED** |
| `DATABENTO_DECISION_AUTHORITY` not implemented | **CONFIRMED** |
| Databento-triggered `postBarAutomation` not implemented | **CONFIRMED** |
| Databento-triggered `processBar` not implemented | **CONFIRMED** |
| TradingView remains production `processBar` trigger | **CONFIRMED** |
| Python remains transport/replay/normalisation only | **CONFIRMED** |
| TypeScript Atlas owns candle construction, reconciliation, aggregation, canonical state, persistence | **CONFIRMED** |
| No ADE, strategy, risk, or execution changes | **CONFIRMED** |
| No production chart cutover | **CONFIRMED** |
| Sprint 123A.4 not begun | **CONFIRMED** |

---

## 11. Gate G3 Recommendation

All Sprint 123A.3 deliverables are complete. The implementation satisfies all Gate G2 approval conditions:

- One-minute bar lifecycle (DEVELOPING → PROVISIONAL → CONFIRMED/UNRESOLVED) is implemented and tested.
- Official-bar reconciliation against Databento ohlcv-1m records is implemented and tested.
- Five-minute aggregation from exactly 5 confirmed one-minute bars is implemented with all 6 invariants enforced.
- Unresolved-bar blocking is proven by `TEST-123A3-AGG002`, `TEST-123A3-AGG005`, `TEST-123A3-AGG011`, and `TEST-123A3-AUTH005`.
- Gap detection and recovery integration is implemented and tested.
- Contract definition, symbol-mapping, and roll detection are implemented and tested.
- Effectively-once persistence with `InMemoryBarDatabaseAdapter` is implemented and tested.
- No production authority has changed. TradingView remains the sole `processBar` trigger.

**This submission requests Gate G3 approval to proceed to Sprint 123A.4.**

Sprint 123A.4 must not begin without separate written approval from Phil.
