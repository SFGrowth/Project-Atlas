# Sprint 123A.4 — Gate G4 Live Staging Evidence Report

**Date:** 2026-07-21  
**Branch:** `sprint/123a-2-databento-adapter`  
**Final commit:** `321fa28`  
**Author:** DARWIN / Manus AI  
**Status:** ✅ GATE G4 PASSED — All 6 proof points confirmed on Cloud Computer staging

---

## Executive Summary

Sprint 123A.4 delivers the complete server-side startup wiring for the Atlas Nexus market data pipeline. The bridge server, runtime orchestrator, `MySQLBarDatabaseAdapter`, and `/api/market-data` SSE router are now wired into the Atlas server startup sequence. A live staging proof on the Cloud Computer (`35.231.100.83`) confirms all six required integration points.

---

## Implementation Delivered

### Files Changed in Sprint 123A.4

| File | Change |
|---|---|
| `server/_core/index.ts` | Full startup wiring: bridge server, orchestrator, MySQL adapter, market-data router |
| `server/market-data/bar-persistence.ts` | Added `MySQLBarDatabaseAdapter` — production mysql2 Pool-backed `BarDatabaseAdapter` |
| `server/market-data/runtime-orchestrator.ts` | USD→pts100 normalisation layer; `_onBarConfirmed`/`_onBarDeveloping` event unwrapping; `contract:definition-updated` listener for auto-config on roll |
| `server/market-data/trade-bar-builder.ts` | Added `updateConfig()` public method for contract roll support |
| `server/market-data/bridge-server.ts` | Added public `handleMessage()` test injection method; renamed private to `_handleMessage()` |
| `server/market-data/tests/sprint-123a4.test.ts` | Updated tests to emit full `BarBuilderEvent` objects matching real `TradeBarBuilder._emit()` shape |

### Key Architecture Decisions

**USD→pts100 normalisation** is performed in the runtime-orchestrator's `_onTrade` and `_onOhlcv1m` handlers, not in the bridge server. The bridge server passes raw Python payloads through the event bus; the orchestrator normalises them before routing to the `TradeBarBuilder`. This keeps the bridge server protocol-agnostic and the normalisation boundary explicit.

**Contract roll auto-config** is handled by a `contract:definition-updated` listener in the orchestrator that calls `tradeBarBuilder.updateConfig()` whenever a new definition record arrives. The server starts with env-var-driven bootstrap defaults (`BRIDGE_RAW_SYMBOL` / `BRIDGE_INSTRUMENT_ID`) and auto-updates on the first definition record from the Python adapter.

**`MySQLBarDatabaseAdapter`** implements all five `BarDatabaseAdapter` interface methods using plain `INSERT ... ON DUPLICATE KEY UPDATE` patterns with explicit transactions for `persistBarWithLedger`. It accepts a mysql2 `Pool` and parses `DATABASE_URL` at startup to create the pool.

---

## Test Results

```
Test Files  30 passed (31)
Tests       695 passed (696)
```

The single failure is `massive-api.test.ts` — it requires a live `MASSIVE_API_KEY` environment variable. This is a pre-existing external credential test, not Gate-targeted. TypeScript compilation: **0 errors**.

---

## Live Staging Proof — Cloud Computer 35.231.100.83

All six proof points were confirmed by running `staging_proof_v3.py` on the Cloud Computer against the live Atlas server process.

### Proof Results

| # | Proof Point | Result | Evidence |
|---|---|---|---|
| 1 | Bridge server listening on port 9876 | ✅ PASS | `ss -tlnp` confirms `:9876` bound |
| 2 | Python adapter connects and records reach TypeScript | ✅ PASS | WebSocket connected; 6 records accepted by bridge |
| 3 | `atlas_bars_1m` receives a MATCHED row | ✅ PASS | Row confirmed: `bar_open_ts_ms=1784628840000`, `MNQU5/42004800`, `reconciliation_status=MATCHED`, `open_price_pts100=1950025` |
| 4 | SSE routes respond with 401 (auth guard active) | ✅ PASS | `/api/market-data/health` → 401; `/api/market-data/stream` → 401 |
| 5 | Databento remains SHADOW-only | ✅ PASS | No `processBar` or `postBarAutomation` in server log; `shadow pipeline READY` confirmed; `DATABENTO_CHART_AUTHORITY` NOT active |
| 6 | TradingView retains processBar and postBarAutomation authority | ✅ PASS | `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` confirmed in `.env` |

### Server Startup Log (key lines)

```
[RuntimeOrchestrator] Starting shadow pipeline...
[RuntimeOrchestrator] shadow pipeline READY.
[BridgeServer] Listening on 127.0.0.1:9876/databento-bridge
[MarketData] Pipeline wired successfully.
[MarketData] Routes mounted at /api/market-data
Server running on http://localhost:3000/
```

### Record Injection Log (key lines)

```
[BridgeServer] Python adapter connected (conn=... bridge=...)
[FeedHealth] databento: UNKNOWN → CONNECTED
[RuntimeOrchestrator] TradeBarBuilder config updated: GLBX.MDP3/MNQU5/42004800
[BridgeServer] Python adapter disconnected (records=6)
```

### atlas_bars_1m Row Confirmed

```
bar_open_ts_ms    : 1784628840000
raw_symbol        : MNQU5
instrument_id     : 42004800
reconciliation_status : MATCHED
open_price_pts100 : 1950025
```

---

## Bugs Fixed During Sprint 123A.4

Three pre-existing bugs were discovered and fixed during the staging proof:

### Bug 1 — BarBuilderEvent Unwrapping (Critical)
**Root cause:** `TradeBarBuilder._emit()` calls `this.emit(event.type, event)` — it emits the full event object `{ type, bar }`. The orchestrator's `_onBarConfirmed` and `_onBarDeveloping` handlers were typed as `(bar: MinuteBar)` and treated the event object as the bar directly, causing `bar.ohlcv` to be `undefined` in `ChartStreamService.publishDeveloping()`.

**Fix:** Updated both handlers to accept the full `BarBuilderEvent` and destructure `.bar`. Updated sprint-123a4 tests to emit the correct event shape.

### Bug 2 — USD→pts100 Normalisation Gap (Critical)
**Root cause:** The Python adapter sends `price_usd` (float) and `open_usd` (float). The `TradeBarBuilder` expects `price_pts100` (int × 100) and `open_pts100`. The bridge server was doing a raw cast without conversion.

**Fix:** Added normalisation helpers in the runtime-orchestrator's `_onTrade` and `_onOhlcv1m` handlers to convert USD floats to pts100 integers before routing to the `TradeBarBuilder`.

### Bug 3 — Contract Config Not Auto-Updating (High)
**Root cause:** The `TradeBarBuilder` starts with bootstrap defaults (`instrumentId: 0`) and filters all records that don't match. The `ContractManager` emits `contract:definition-updated` when a definition record arrives, but the orchestrator was not listening for this event.

**Fix:** Added `_onContractDefinitionUpdated` handler in the orchestrator that calls `tradeBarBuilder.updateConfig()` with the new `rawSymbol` and `instrumentId` from the definition record. Added `updateConfig()` public method to `TradeBarBuilder`.

---

## Authority Model — Confirmed SHADOW-Only

The staging proof confirms the authority model is correctly enforced:

| Authority | Owner | Status |
|---|---|---|
| `processBar` | TradingView Pine Script M-16 | ✅ Retained — no Databento override |
| `postBarAutomation` | TradingView Pine Script M-16 | ✅ Retained — no Databento override |
| `DATABENTO_CHART_AUTHORITY` | Databento | ❌ NOT active — shadow mode only |
| `MARKET_DATA_AUTHORITY` | `.env` | `DATABENTO_SHADOW` — confirmed |

Databento is observing and recording bars only. TradingView remains the sole authority for bar processing and automation triggers until Gate G5 (Chart Authority Cutover) is approved.

---

## Next Steps

Sprint 123A.4 is complete. The following items are required before Gate G5 (Chart Authority Cutover):

1. **Accumulate 5+ days of live shadow data** — verify `atlas_bars_1m` row counts match TradingView bar counts for the same period
2. **Run reconciliation report** — compare Databento OHLCV against TradingView OHLCV for all bars; confirm MATCHED rate ≥ 95%
3. **Gap recovery validation** — simulate a 15-minute feed gap and confirm `GapRecoveryOrchestrator` backfills correctly
4. **SSE client integration test** — connect a real browser client to `/api/market-data/stream` and confirm developing bar updates arrive in real time
5. **Gate G5 approval** — Phil reviews reconciliation report and approves Chart Authority Cutover

---

*Report generated by DARWIN research engine — Sprint 123A.4 Gate G4 Evidence*
