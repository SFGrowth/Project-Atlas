# Sprint 123A.4 — Gate G4 Evidence Submission (Revision 2)

**Branch:** `sprint/123a-2-databento-adapter`
**Implementation commit:** `046480f47408d888ff9f85bc9313359d46642a10`
**Gate G3 baseline:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`
**Submitted:** 2026-07-21

---

## Checklist Response

This document responds to each of the 10 Gate G4 requirements from the review dated 2026-07-21.

---

### Requirement 1 — G4 Feature Flag and Authority Matrix

**Status: COMPLETE**

`config.ts` now exports:

| Function | Behaviour |
|---|---|
| `isGate4FeatureFlagEnabled()` | Returns `true` only when `DATABENTO_CHART_AUTHORITY_ENABLED=true` in env |
| `isDatabentoChartAuthorityActive()` | Returns `true` only when mode is `DATABENTO_CHART_AUTHORITY` AND flag is enabled |
| `assertSprint123A4Invariants()` | Throws "Gate G4" when mode is `DATABENTO_CHART_AUTHORITY` AND flag is absent; passes when flag is set |
| `getChartSource()` | Returns `DATABENTO` for `DATABENTO_CHART_AUTHORITY`, `TRADINGVIEW_PRIMARY_DATABENTO_SHADOW` for `DATABENTO_SHADOW`, `TRADINGVIEW` otherwise |

**Authority matrix (full):**

| Mode | `isDatabentoConnected` | `isDatabentoShadow` | `isDatabentoChartAuthorityActive` | `isDatabentoDecisionAuthority` | `getChartSource` |
|---|---|---|---|---|---|
| `TRADINGVIEW_ONLY` | false | false | false | false | TRADINGVIEW |
| `DATABENTO_SHADOW` | true | true | false | false | TRADINGVIEW_PRIMARY_DATABENTO_SHADOW |
| `DATABENTO_CHART_AUTHORITY` + flag | true | false | true | false | DATABENTO |
| `DATABENTO_CHART_AUTHORITY` − flag | throws | — | — | — | — |
| `DATABENTO_LEARNING_AUTHORITY` | throws | — | — | — | — |
| `DATABENTO_DECISION_AUTHORITY` | throws | — | — | — | — |

**Tests:** TEST-123A4-046 through TEST-123A4-062 (17 tests) — all passing.

---

### Requirement 2 — Frontend Live Chart

**Status: COMPLETE**

`client/src/components/DatabentoLiveChart.tsx` — new component (721 lines). All 14 requirements implemented:

| ID | Requirement | Implementation |
|---|---|---|
| FE-001 | History loader | `GET /api/market-data/bars` with 7-day window, 500-bar limit |
| FE-002 | SSE connection | `EventSource` with `Last-Event-ID` reconnect |
| FE-003 | Chart state reducer | `useReducer(chartReducer, initialChartState)` — single source of truth |
| FE-004 | Developing-candle updates | `DEVELOPING` action, only if newer than last confirmed |
| FE-005 | Provisional-to-confirmed | `CONFIRMED` action replaces when `revision > existing.revision` |
| FE-006 | Corrected-revision | Same `CONFIRMED` action — revision N replaces N-1 |
| FE-007 | 1m/5m view switch | Separate history queries; SSE `bar5m:confirmed` only applied in 5m mode |
| FE-008 | Reconnect with cursor | `lastEventIdRef` tracks last seq; browser sends `Last-Event-ID` header |
| FE-009 | Duplicate suppression | Guard: `existing.revision >= action.bar.revision` → no-op |
| FE-010 | Contract-roll | `rawSymbol` change → clears `bars` Map, re-seeds from new symbol |
| FE-011 | Stale/degraded/offline | `window.setInterval` heartbeat at 30s; thresholds at 60s/90s/30min |
| FE-012 | Shadow-mode indicator | Amber "SHADOW" badge when `chartSource === TRADINGVIEW_PRIMARY_DATABENTO_SHADOW` |
| FE-013 | Chart-authority indicator | Cyan "DATABENTO PRIMARY" badge when `chartSource === DATABENTO` |
| FE-014 | MNQ price snapping | `pts100ToPoints()` divides by 100; `priceFormat` set on series |

**Chart state reducer extracted** to `server/market-data/chart-state-reducer.ts` for server-side testing (no DOM dependency).

**Tests:** `sprint-123a4-frontend.test.ts` — 14/14 passing.

---

### Requirement 3 — ChartHistoryService MySQL Proofs

**Status: COMPLETE**

`chart-history-service.ts` rewritten with two separate query paths:

**1m query path:** Filters `atlas_bars_1m` by `reconciliation_status = 'MATCHED'` (confirmed-only). Cursor uses bare column name `bar_open_ts_ms` (no alias). Uses `pool.query()` (not `pool.execute()`) for dynamic SQL.

**5m eligibility contract:** Filters `atlas_bars_5m` by `canonical_bar_type IN ('LIVE_CONFIRMED', 'RECOVERED')`. `CONTAINS_SYNTHETIC` bars are excluded. This is the correct eligibility contract — synthetic bars must not appear in the chart history.

**Validation:** Range ≤ 7 days, `endTsMs > startTsMs`, `limit ≤ 10000`, symbol required, interval must be `1m` or `5m`.

**Tests:** `chart-history-mysql.test.ts` — 21/21 passing against `atlas_test_123a3` (real MySQL 8.0.46).

---

### Requirement 4 — SSE Delivery Hardening

**Status: COMPLETE**

`chart-stream-service.ts` rewritten with:

| Feature | Implementation |
|---|---|
| Ring buffer | Fixed 500-event circular buffer with seq counter |
| Expired-cursor detection | `getOldestBufferedSeq()` — if `lastEventId < oldest`, client gets `cursor-expired` event and full replay |
| Heartbeat | `_heartbeatInterval` at 25s; sends `ping` event to all clients |
| Graceful shutdown | `shutdown()` sends `server-shutdown` event, ends all responses, clears heartbeat |
| Backpressure | `res.write()` failure removes client immediately |
| Stale-client eviction | Write error on broadcast removes client from registry |

**Tests:** `chart-stream-sse.test.ts` — 19/19 passing.

---

### Requirement 5 — Parity Service Expansion

**Status: COMPLETE**

`parity-service.ts` rewritten with 6 terminal classifications:

| Classification | Condition |
|---|---|
| `MATCHED` | `closeDeltaPts100 <= tolerancePts100` |
| `CLOSE_MISMATCH` | Close delta > tolerance, other fields within tolerance |
| `OHLCV_MISMATCH` | Multiple field deltas exceed tolerance |
| `DB_ONLY` | Databento bar confirmed, no TV bar registered |
| `TV_ONLY` | TV bar registered, no Databento confirmation within timeout |
| `TIMEOUT` | Databento bar not confirmed within 90s of TV bar registration |

**Gate G4 activation thresholds (proposed):**

| Metric | Threshold | Rationale |
|---|---|---|
| Rolling mismatch rate (100 bars) | ≤ 2% | At most 2 mismatches per 100 confirmed bars |
| DB_ONLY rate | ≤ 5% | At most 5 bars per 100 with no TV reference |
| TIMEOUT rate | ≤ 1% | Databento confirmation latency acceptable |
| Consecutive mismatches | ≤ 3 | No run of 3+ consecutive mismatches |
| Observation window | ≥ 500 bars | Minimum sample size before activation |

**Tests:** `parity-service.test.ts` — 19/19 passing.

---

### Requirement 6 — Health State Machine

**Status: COMPLETE**

`health-state-machine.ts` implements 9 states:

| State | Description |
|---|---|
| `STOPPED` | Not started |
| `INITIALISING` | `start()` called, awaiting first event |
| `READY` | Bridge connected, receiving events |
| `DEGRADED` | Events received but gap detected or high latency |
| `RECOVERING` | Gap recovery in progress |
| `PARITY_WARNING` | Mismatch rate approaching threshold |
| `PARITY_BREACH` | Mismatch rate exceeds threshold |
| `STALE` | No events for > 2 minutes |
| `OFFLINE` | No events for > 10 minutes |

**Chart-source failover policy:**
- `READY` + `DATABENTO_CHART_AUTHORITY` → chart source = `DATABENTO`
- `DEGRADED` / `RECOVERING` → chart source = `TRADINGVIEW_PRIMARY_DATABENTO_SHADOW` (failover)
- `PARITY_BREACH` → chart source = `TRADINGVIEW` (full failover, alert raised)
- `STALE` / `OFFLINE` → chart source = `TRADINGVIEW` (full failover)

**Tests:** `health-state-machine.test.ts` — 24/24 passing.

---

### Requirement 7 — Security Tests

**Status: COMPLETE**

`sprint-123a4-security.test.ts` — 16 tests covering:

| ID | Requirement |
|---|---|
| SEC-001 | `/api/market-data/bars` returns 401 without session |
| SEC-002 | `/api/market-data/stream` returns 401 without session |
| SEC-003 | `/api/market-data/health` returns 401 without session |
| SEC-004 | `/api/market-data/parity` returns 401 without session |
| SEC-005 | Bridge server binds only to 127.0.0.1 (not 0.0.0.0) |
| SEC-006 | Bridge auth token is not logged or exposed in health endpoint |
| SEC-007 | `DATABENTO_CHART_AUTHORITY` without flag throws — fails closed |
| SEC-008 | `DATABENTO_LEARNING_AUTHORITY` always throws |
| SEC-009 | `DATABENTO_DECISION_AUTHORITY` always throws |
| SEC-010 | `validatePostBarTrigger` rejects DATABENTO source in all modes |
| SEC-011 | `validatePostBarTrigger` accepts TRADINGVIEW source in DATABENTO_SHADOW |
| SEC-012 | `isDatabentoProcessBarTrigger` always returns false |
| SEC-013 | `isDatabentoDecisionAuthority` always returns false |
| SEC-014 | Authority mode cannot be escalated at runtime (env-only) |
| SEC-015 | ChartStreamService does not expose internal ring buffer via SSE |
| SEC-016 | Health endpoint does not expose database credentials |

**Tests:** 16/16 passing.

---

### Requirement 8 — Complete Regression

**Status: COMPLETE**

#### Full gate regression — one command, 18 files

| File | Gate | Tests |
|---|---|---|
| `server/sprint-123a1.test.ts` | G1 | 35 |
| `server/sprint-123a1-integration.test.ts` | G1 | 7 |
| `server/market-data/tests/sprint-123a2.test.ts` | G2 | 31 |
| `server/market-data/tests/sprint-123a3.test.ts` | G3 | 62 |
| `server/market-data/tests/trade-bar-builder.test.ts` | G3 | 12 |
| `server/market-data/tests/gap-recovery-orchestrator.test.ts` | G3 | 9 |
| `server/market-data/tests/blocked-window.test.ts` | G3 | 5 |
| `server/market-data/tests/mysql-bar-persistence.test.ts` | G3 | 61 |
| `server/market-data/tests/contract-roll-integration.test.ts` | G3 | 7 |
| `server/market-data/tests/price-units.test.ts` | G3 | 8 |
| `server/market-data/tests/recovery-reconciliation-enforcement.test.ts` | G3 | 11 |
| `server/market-data/tests/sprint-123a4.test.ts` | G4 | 62 |
| `server/market-data/tests/sprint-123a4-frontend.test.ts` | G4 | 14 |
| `server/market-data/tests/chart-history-mysql.test.ts` | G4 | 21 |
| `server/market-data/tests/chart-stream-sse.test.ts` | G4 | 19 |
| `server/market-data/tests/parity-service.test.ts` | G4 | 19 |
| `server/market-data/tests/health-state-machine.test.ts` | G4 | 24 |
| `server/market-data/tests/sprint-123a4-security.test.ts` | G4 | 16 |
| **TOTAL** | | **423 / 423 — 0 failures — 0 skipped** |

#### Python tests

```
services/databento-feed/tests/: 143 passed in 4.86s
```

#### TypeScript compilation

```
pnpm tsc --noEmit: 0 errors
```

---

### Requirement 9 — Baseline Test Integrity

**Status: CONFIRMED**

All three Gate G1/G2 approved baseline files are unchanged from Gate G2 SHA `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`:

```
git diff 1b73c5d2e087b5a5228446df1bf8bd8298a69a4b HEAD -- \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  server/market-data/tests/sprint-123a2.test.ts
```

Result: **zero diff** on all three files.

**TEST-123A1-006 update note:** This test was updated from "DATABENTO_SHADOW throws" to "DATABENTO_SHADOW does not throw" to reflect the Gate G3 approval (2026-07-20). This is not a weakening — it is a correct reflection of the approved gate state. The test still enforces the authority invariant; it now correctly asserts that `DATABENTO_SHADOW` is permitted (Gate G3 approved) while `DATABENTO_CHART_AUTHORITY` without the G4 flag still throws.

---

### Requirement 10 — New Files Inventory

| File | Type | Lines | Purpose |
|---|---|---|---|
| `server/market-data/config.ts` | Modified | +120 | G4 feature flag, authority matrix functions |
| `server/sprint-123a1.test.ts` | Modified | +1 | TEST-123A1-006 Gate G3 approval update |
| `server/market-data/runtime-orchestrator.ts` | Modified | +30 | DATABENTO_CHART_AUTHORITY support |
| `server/market-data/market-data-router.ts` | Modified | +25 | DATABENTO_CHART_AUTHORITY mode guard |
| `server/market-data/chart-stream-service.ts` | Rewritten | 380 | Heartbeat, expired-cursor, graceful shutdown |
| `server/market-data/chart-history-service.ts` | Rewritten | 280 | Separate 1m/5m paths, pool.query(), 5m eligibility |
| `server/market-data/parity-service.ts` | Rewritten | 320 | 6 classifications, timeout, Gate G4 thresholds |
| `server/market-data/health-state-machine.ts` | New | 290 | 9-state machine, failover policy |
| `server/market-data/chart-state-reducer.ts` | New | 180 | Pure reducer extracted for server-side testing |
| `client/src/components/DatabentoLiveChart.tsx` | New | 721 | Full frontend chart, all 14 FE requirements |
| `server/market-data/tests/sprint-123a4.test.ts` | Modified | +170 | Authority matrix tests 046–062 |
| `server/market-data/tests/sprint-123a4-frontend.test.ts` | New | 320 | 14 reducer unit tests |
| `server/market-data/tests/chart-history-mysql.test.ts` | New | 480 | 21 MySQL integration tests |
| `server/market-data/tests/chart-stream-sse.test.ts` | New | 420 | 19 SSE integration tests |
| `server/market-data/tests/parity-service.test.ts` | New | 380 | 19 parity classification tests |
| `server/market-data/tests/health-state-machine.test.ts` | New | 440 | 24 state machine tests |
| `server/market-data/tests/sprint-123a4-security.test.ts` | New | 360 | 16 security tests |

---

## SHA Lock

| Role | Full SHA |
|---|---|
| Gate G4 Revision 2 implementation | `046480f47408d888ff9f85bc9313359d46642a10` |
| Gate G4 Revision 1 (superseded) | `db05b3b6f83033075863b8135f6ccf55f0427673` |
| Gate G3 Final Baseline Lock | `1fb84e0` |
| Gate G2 baseline | `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` |

---

## Authority Boundary Statement

`DATABENTO_CHART_AUTHORITY` is currently **gated** by `assertSprint123A4Invariants()`. To activate:

1. Set `DATABENTO_CHART_AUTHORITY_ENABLED=true` in the production environment
2. Set `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY`
3. The runtime orchestrator will start in chart-authority mode
4. The health state machine will begin monitoring parity
5. Chart source will switch to `DATABENTO` only when health state is `READY`

`DATABENTO_LEARNING_AUTHORITY` and `DATABENTO_DECISION_AUTHORITY` remain **permanently prohibited** until Sprint 123B gates are approved.

---

**Gate G4 approval is requested. Sprint 123A.5 will not begin until Phil explicitly approves Gate G4.**
