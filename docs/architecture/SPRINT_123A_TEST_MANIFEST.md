# Sprint 123A Test Manifest (Revision 4)
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18 (Revision 4: Corrections 4 and 5 applied — 6 new discriminated union tests added (TEST-123A1-009 through 014); TEST-123A3-001A through 001E updated to match 5-event lifecycle; TEST-123A1-007 updated to reference discriminated union; total test count corrected to 67)  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`  
**Parity spec reference:** `DATABENTO_PARITY_CERTIFICATION_SPEC.md` (Revision 4)

---

## Overview

This manifest defines every test required for Sprint 123A. Each test has a unique ID, sub-sprint, requirement, test file, fixture, expected result, blocking gate, current result, and evidence location.

**Test ID format:** `TEST-{sub-sprint}-{sequence}` for unit/integration tests, `TEST-INT-{sequence}` for opt-in live integration tests.

**Blocking status:** All tests are blocking unless explicitly marked `NON-BLOCKING`.

**Current result:** All tests are `NOT RUN` until the sub-sprint is implemented.

**Total test count:** 67 tests (65 unit/integration + 2 opt-in live integration tests). The 2 opt-in tests (`TEST-INT-001`, `TEST-INT-002`) are included in the total of 67. They require `DATABENTO_INTEGRATION_TESTS=true` and a live Databento API key. Breakdown: 123A.1: 14, 123A.2: 10, 123A.3: 23, 123A.4: 11, 123A.5: 7, INT: 2. This count is machine-verified by `grep -c "^### TEST-"`.

---

## Sprint 123A.1 — Foundation and Autonomy Remediation

### TEST-123A1-001 — Feature Flag Config Compiles

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | `server/market-data/config.ts` exports `MARKET_DATA_AUTHORITY` and all feature flags with correct default values |
| **Test file** | `server/market-data/__tests__/config.test.ts` |
| **Fixture** | None — tests TypeScript exports only |
| **Expected result** | `tsc --noEmit` passes; all flag types exported; defaults match §18 of amended plan |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-002 — Database Migration Applies Cleanly

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | All 7 new tables created without error; no existing tables modified |
| **Test file** | `drizzle/__tests__/migration.test.ts` |
| **Fixture** | Isolated test database |
| **Expected result** | Migration applies; all 7 tables exist with correct columns; zero existing table modifications |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-003 — postBarAutomation Is Sole Caller of liveLearnEngine

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | No code path outside `postBarAutomation.ts` calls `liveLearnEngine` directly |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `liveLearnEngine`; mock TradingView webhook handler |
| **Expected result** | Source search confirms no `liveLearnEngine` import in `nexusRoutes.ts`; mock called exactly once per bar via `postBarAutomation` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-004 — onNewBarObservation Called via postBarAutomation

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | G-001 fix: `onNewBarObservation()` called exactly once per bar via `postBarAutomation` |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `darwinAutonomous.onNewBarObservation`; simulate TradingView bar event |
| **Expected result** | `onNewBarObservation` called exactly once per bar; never from any other code path |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-005 — Monthly Review Returns Real Output

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | G-002 fix: `/api/scheduled/monthly-review` returns real output, not `{ status: "not_implemented" }` |
| **Test file** | `server/__tests__/scheduledJobs.test.ts` |
| **Fixture** | Test database with ≥30 days of `atlas_memory` bars |
| **Expected result** | Response contains `{ status: "complete", period: "...", barCount: N }` where `barCount > 0`; no `"not_implemented"` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-006 — Legacy Behaviour System Unchanged

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | `LEGACY_BEHAVIOUR_ENABLED=true` — legacy 7-behaviour system writes to `behaviour_library` unchanged |
| **Test file** | `server/__tests__/liveLearnEngine.test.ts` |
| **Fixture** | Mock bar; test database with `behaviour_library` table |
| **Expected result** | After processing a bar, `behaviour_library` contains a new row with all 7 legacy behaviour IDs present |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-007 — Canonical Event Types Compile

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | `shared/types/canonical-events.ts` exports all new event types; `CanonicalEventId` is a source-safe discriminated union (`DatabentoEventId | TradingViewEventId`) |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | None — tests TypeScript exports only |
| **Expected result** | `tsc --noEmit` passes; all 5 bar event types exported with unique `type` discriminants; `DatabentoEventId` and `TradingViewEventId` compile as separate interfaces; union type narrows correctly on `source` field |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-008 — No Databento Connection in TRADINGVIEW_ONLY Mode

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | With `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY`, no Databento client is started |
| **Test file** | `server/market-data/__tests__/config.test.ts` |
| **Fixture** | Mock Databento client; set `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` |
| **Expected result** | Databento client `start()` never called; no network connection attempted |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-009 — DatabentoEventId Narrows Correctly

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | TypeScript narrows `CanonicalEventId` to `DatabentoEventId` when `source === 'DATABENTO'` |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | Inline type assertion in test |
| **Expected result** | After narrowing on `source === 'DATABENTO'`, TypeScript allows access to `dataset`, `instrumentId`, `mappingVersion`; accessing `sourceInstrumentKey` is a compile error |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-010 — TradingViewEventId Narrows Correctly

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | TypeScript narrows `CanonicalEventId` to `TradingViewEventId` when `source === 'TRADINGVIEW'` |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | Inline type assertion in test |
| **Expected result** | After narrowing on `source === 'TRADINGVIEW'`, TypeScript allows access to `sourceInstrumentKey`; accessing `dataset` or `instrumentId` is a compile error |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-011 — DatabentoEventId Serialisation Is Deterministic

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | `serializeCanonicalEventId(DatabentoEventId)` produces a deterministic string with `DATABENTO:` prefix |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | `{ source: 'DATABENTO', dataset: 'GLBX.MDP3', rawSymbol: 'MNQM5', instrumentId: 12345, interval: '5m', barOpenTsMs: 1750000000000, revision: 0, mappingVersion: 'v1' }` |
| **Expected result** | `'DATABENTO:GLBX.MDP3:MNQM5:12345:5m:1750000000000:0:v1'` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-012 — TradingViewEventId Serialisation Is Deterministic

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | `serializeCanonicalEventId(TradingViewEventId)` produces a deterministic string with `TRADINGVIEW:` prefix |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | `{ source: 'TRADINGVIEW', sourceInstrumentKey: 'CME_MINI:MNQ1!', interval: '5m', barOpenTsMs: 1750000000000, revision: 0 }` |
| **Expected result** | `'TRADINGVIEW:CME_MINI:MNQ1!:5m:1750000000000:0'` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-013 — No Cross-Source Collision in Serialised IDs

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | A `DatabentoEventId` and a `TradingViewEventId` for the same interval never produce the same serialised string |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | Both IDs with `barOpenTsMs = 1750000000000` and `interval = '5m'` |
| **Expected result** | Serialised strings are not equal; `DATABENTO:...` ≠ `TRADINGVIEW:...` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

### TEST-123A1-014 — AtlasBarProvisionalClosed Is Not Assignable to AtlasBarConfirmed

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.1 |
| **Requirement** | TypeScript type system prevents `AtlasBarProvisionalClosed` from being assigned to `AtlasBarConfirmed` |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | Inline type assertion: `const x: AtlasBarConfirmed = provisionalBar` |
| **Expected result** | TypeScript compile error; `type` discriminant `'ATLAS_BAR_PROVISIONAL_CLOSED'` is not assignable to `'ATLAS_BAR_CONFIRMED'` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |

---

## Sprint 123A.2 — Databento Adapter and Private Bridge

### TEST-INT-001 — Databento Symbol Resolution (Opt-In Integration Test)

| Field | Value |
|---|---|
| **Sub-sprint** | Pre-123A.2 |
| **Requirement** | Actual Databento continuous symbol for MNQ front-month confirmed; `MNQ1!` is not assumed |
| **Test file** | `services/databento-feed/tests/test_symbol_resolution.py` |
| **Fixture** | Live Databento connection (`DATABENTO_INTEGRATION_TESTS=true`) |
| **Expected result** | Connects to Databento metadata API; queries `GLBX.MDP3` for MNQ family; confirms continuous symbol name; receives ≥1 `trades` record; records confirmed symbol in `docs/evidence/TEST-INT-001-result.md` |
| **Blocking gate** | G2 (pre-requisite) |
| **Current result** | NOT RUN |

---

### TEST-123A2-001 — Python Service Normalises Trades Records

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | Python feed service correctly normalises Databento `trades` schema records into `AtlasTradeEvent` format |
| **Test file** | `services/databento-feed/tests/test_normalizer.py` |
| **Fixture** | `services/databento-feed/tests/fixtures/trades_sample.bin` |
| **Expected result** | All fixture records normalise without error; output matches `AtlasTradeEvent` schema; no API key in output |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-002 — Bridge Server Receives Records

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | Bridge server receives normalised records from Python service and publishes to `atlasEventBus` |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock Python service sending fixture records over WebSocket |
| **Expected result** | Bridge receives records; `atlasEventBus` emits `AtlasTradeEvent`; bridge health endpoint returns `{ status: "connected" }` |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-003 — atlasEventBus Receives AtlasTradeEvent

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | `atlasEventBus` emits `AtlasTradeEvent` records received from the bridge |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock bridge input |
| **Expected result** | Event bus subscriber receives `AtlasTradeEvent` with correct fields; `source = "databento"` |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-004 — Secret Scanning: API Key Not in Logs or Payloads

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | `DATABENTO_API_KEY` does not appear in any log output, SSE payload, database row, or error response |
| **Test file** | `server/__tests__/secret-scanning.test.ts` |
| **Fixture** | `DATABENTO_API_KEY=TEST_SECRET_KEY_DO_NOT_LOG`; full server startup; simulated error conditions |
| **Expected result** | Grep of all log output, SSE payloads, and database rows confirms `TEST_SECRET_KEY_DO_NOT_LOG` does not appear |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-005 — Secret Scanning: API Key Not in Browser Bundle

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | `DATABENTO_API_KEY` does not appear in the built browser bundle |
| **Test file** | `scripts/check-bundle-secrets.sh` |
| **Fixture** | Build with `DATABENTO_API_KEY=TEST_SECRET_KEY_DO_NOT_LOG` |
| **Expected result** | `grep -r TEST_SECRET_KEY_DO_NOT_LOG dist/` returns no results |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-006 — No processBar() from Databento Path

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, no `processBar()` call triggered from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `processBar`; simulate Databento trade events; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `processBar` mock never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-007 — No postBarAutomation from Databento Path

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, no `postBarAutomation` call triggered from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `postBarAutomation`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `postBarAutomation` mock never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-008 — No onNewBarObservation from Databento Path

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, `onNewBarObservation()` never called from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `onNewBarObservation`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `onNewBarObservation` mock never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-009 — Bridge Backpressure Handling

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | Bridge server handles backpressure correctly when the TypeScript consumer is slower than the Python producer |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock Python service sending 10,000 records in rapid succession; TypeScript consumer artificially slowed |
| **Expected result** | Bridge applies backpressure to Python service; no records dropped silently; queue depth metric exposed on health endpoint; no OOM; Python service receives flow-control signal |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-123A2-010 — Python Process Failure and Restart

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | When the Python feed service crashes, the bridge server detects the disconnection and the feed health state transitions to `RECONNECTING` |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock Python service; simulate abrupt WebSocket close |
| **Expected result** | Bridge detects disconnection within 5 seconds; `atlasEventBus` emits `atlas_feed_health` with `status = RECONNECTING`; bridge attempts reconnection with exponential backoff; reconnection succeeds when mock Python service restarts |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

### TEST-INT-002 — Databento Live Connection (Opt-In Integration Test)

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.2 |
| **Requirement** | Python feed service connects to Databento live feed and receives records |
| **Test file** | `services/databento-feed/tests/test_live_connection.py` |
| **Fixture** | Live Databento connection (`DATABENTO_INTEGRATION_TESTS=true`) |
| **Expected result** | Service connects; receives ≥10 `trades` records within 60 seconds; records normalised without error; no API key in any output |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |

---

## Sprint 123A.3 — Canonical Bar and Contract Services

### TEST-123A3-001A — Developing Bar from Trades

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Bar builder emits `AtlasBarDeveloping` after each trade; emits `AtlasBarProvisionalClosed` at the minute boundary (not `AtlasBarConfirmed`) |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | 30 sequential `AtlasTradeEvent` records within a single 1-minute window, then clock advanced past minute boundary |
| **Expected result** | 30 `AtlasBarDeveloping` events emitted; exactly one `AtlasBarProvisionalClosed` emitted at minute boundary; zero `AtlasBarConfirmed` emitted; `AtlasBarProvisionalClosed.reconciliationStatus = 'PROVISIONAL'`; five-min aggregator does not receive the bar |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-001B — Official ohlcv-1m Reconciliation

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | After `AtlasBarProvisionalClosed`, bar builder reconciles against Databento's official `ohlcv-1m` record and emits `AtlasBarConfirmed` when values agree within tolerance |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture `AtlasTradeEvent` records for a 1-minute window + matching `ohlcv-1m` record within tolerance |
| **Expected result** | `atlas_bars_1m` row updated to `reconciliationStatus = MATCHED`; `AtlasBarConfirmed` emitted (not `AtlasBarProvisionalClosed`); `AtlasBarConfirmed` forwarded to five-min aggregator |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-001C — Confirmed Canonical 1-Minute Bar

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | `AtlasBarConfirmed` uses `DatabentoEventId` discriminant; `id.source = 'DATABENTO'`; `id.rawSymbol` is the dynamically resolved symbol (never hardcoded); `id.barOpenTsMs` is UTC milliseconds |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture trades + matching `ohlcv-1m`; symbol registry returns `MNQM5` as resolved symbol |
| **Expected result** | `AtlasBarConfirmed.id.source = 'DATABENTO'`; `id.rawSymbol = 'MNQM5'`; `id.barOpenTsMs` is a UTC ms integer; `id.instrumentId` matches fixture; no `MNQ1!` hardcoded anywhere in emitted event |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-001D — Discrepancy Persistence

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | When `ohlcv-1m` values disagree beyond tolerance, bar builder emits `AtlasBarUnresolved` with `reconciliationStatus = 'UNRESOLVED_DISCREPANCY'`; bar is never forwarded to five-min aggregator |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture trades + `ohlcv-1m` record with High 3 ticks higher than constructed bar (exceeds 1-tick tolerance) |
| **Expected result** | `AtlasBarUnresolved` emitted with `reconciliationStatus = 'UNRESOLVED_DISCREPANCY'`; `discrepancyFields` contains `'high'`; `officialHigh` and `provisionalHigh` both present; `alertEmitted = true`; five-min aggregator does not receive the bar; 5-min bar for containing window is held pending |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-001E — Missing Official Bar Triggers UNRESOLVED Lifecycle

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | When no `ohlcv-1m` record arrives within 30 minutes of bar close, bar builder emits `AtlasBarUnresolved` with `reconciliationStatus = 'UNRESOLVED_MISSING'`; bar is never forwarded to five-min aggregator |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture trades for a 1-min bar; no `ohlcv-1m` record injected; clock advanced 31 minutes |
| **Expected result** | `AtlasBarUnresolved` emitted with `reconciliationStatus = 'UNRESOLVED_MISSING'`; `alertEmitted = true`; `officialOpen/High/Low/Close/Volume` all undefined; five-min aggregator does not receive the bar; 5-min bar for containing window is held pending; no `AtlasBarConfirmed` emitted at any point |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-002 — 5-Min Aggregator Produces Correct OHLCV

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Five-minute aggregator correctly aggregates 5 confirmed 1-min bars into a 5-min bar |
| **Test file** | `server/market-data/__tests__/five-min-aggregator.test.ts` |
| **Fixture** | 5 fixture `AtlasBarConfirmed` (1-min) records with known OHLCV |
| **Expected result** | Open = first bar Open; High = max of all Highs; Low = min of all Lows; Close = last bar Close; Volume = sum of all Volumes; `barType = CANONICAL_CONFIRMED` |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-003 — Contract Roll Detected from SymbolMappingMsg

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Contract Roll Manager detects a roll from a `SymbolMappingMsg` record |
| **Test file** | `server/market-data/__tests__/contract-roll-manager.test.ts` |
| **Fixture** | Fixture `SymbolMappingMsg` with new raw symbol |
| **Expected result** | `atlas_contract_rolls` record created; `AtlasContractRoll` event published; `mappingVersion` incremented; symbol registry updated |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-004 — Consumer Processing Ledger Prevents Duplicates

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Consumer processing ledger prevents the same bar from being processed twice by the same consumer |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Same `CanonicalEventId` submitted twice to canonical router |
| **Expected result** | Second submission rejected; ledger contains exactly one record; no duplicate processing |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-005 — No-Trade Minute Requires Confirmation Before Synthetic Bar

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | A `SYNTHETIC_NO_TRADE_BAR` is only generated when the no-trade period is confirmed by either a Databento `ohlcv-1m` record showing zero volume for the interval, or by the Historical API confirming no trades in the interval. A zero-trade window alone (absence of events) is not sufficient. |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture A** | 60-second window with zero trade events + `ohlcv-1m` record confirming zero volume |
| **Fixture B** | 60-second window with zero trade events + no `ohlcv-1m` record (feed uncertainty) |
| **Expected result** | Fixture A: `SYNTHETIC_NO_TRADE_BAR` generated; OHLCV flat; `barType = SYNTHETIC_NO_TRADE_BAR`. Fixture B: bar set to `UNRESOLVED`; no synthetic bar generated; `containsUnresolvedMinutes = true` propagated to 5-min aggregator |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-006 — Unresolved Minute Blocks 5-Min Dispatch

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | A 5-min bar containing an `UNRESOLVED` 1-min bar is not dispatched to production consumers |
| **Test file** | `server/market-data/__tests__/five-min-aggregator.test.ts` |
| **Fixture** | 4 confirmed 1-min bars + 1 `UNRESOLVED` 1-min bar |
| **Expected result** | Aggregator sets `containsUnresolvedMinutes = true`; canonical router blocks dispatch; no `processBar()` called; no `postBarAutomation` called |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-007 — atlas_bars_1m Populated

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Confirmed 1-min bars are persisted to `atlas_bars_1m` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Test database; simulate 5 minutes of trade events |
| **Expected result** | `atlas_bars_1m` contains 5 rows; each has correct OHLCV and `barType` |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-008 — No processBar() from Databento Path in Shadow Mode

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | In `DATABENTO_SHADOW` mode, canonical router never calls `processBar()` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Mock `processBar`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `processBar` mock never called regardless of how many bars are confirmed |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-009 — No postBarAutomation from Databento Path in Shadow Mode

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | In `DATABENTO_SHADOW` mode, canonical router never calls `postBarAutomation` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Mock `postBarAutomation`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `postBarAutomation` mock never called |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-010 — Duplicate Input Records Rejected

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Duplicate `AtlasTradeEvent` records (same `ts_event`, `price`, `size`, `action`) are detected and rejected before entering the bar builder |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | 10 unique trade records + 3 exact duplicates |
| **Expected result** | Bar builder processes exactly 10 unique records; 3 duplicates rejected; deduplication counter incremented; no OHLCV contamination from duplicates |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-011 — Out-of-Order Records Handled

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Records arriving out of timestamp order within a 1-minute window are correctly reordered before OHLCV construction |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | 20 trade records with shuffled `ts_event` timestamps within a single 1-minute window |
| **Expected result** | Bar builder reorders by `ts_event`; OHLCV matches expected for the correctly ordered sequence; `outOfOrderCount` metric incremented for each reordered record |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-012 — Late Records Handled

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | A trade record arriving after its 1-minute bar has already been confirmed is handled without corrupting the confirmed bar |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Confirmed 1-min bar for minute N; late trade record with `ts_event` in minute N arrives 90 seconds after minute N closed |
| **Expected result** | Late record does not modify the confirmed bar; late record is logged with `lateArrivalMs` metric; `atlas_bars_1m` row for minute N is unchanged; reconciliation status updated if late record changes the expected OHLCV |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-013 — Historical API Backfill

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | When a feed gap is detected, the Historical API is queried to backfill missing bars |
| **Test file** | `server/market-data/__tests__/gap-recovery.test.ts` |
| **Fixture** | Simulated 15-minute feed gap; mock Historical API returning bars for the gap period |
| **Expected result** | Gap detected; Historical API queried for the gap interval; backfilled bars written to `atlas_bars_1m` with `barType = HISTORICAL_BACKFILL`; `UNRESOLVED` records updated; `containsUnresolvedMinutes` cleared for affected 5-min bars |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-014 — Reconnect After Feed Interruption

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | After a Databento feed reconnection, bar builder resumes correctly without duplicating bars or losing the developing bar state |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Partial 1-minute window of trades; simulated disconnection; reconnection with continuation of the same minute |
| **Expected result** | After reconnection, bar builder resumes from the last known state; developing bar OHLCV is correct for the full minute (pre- and post-reconnect trades); no duplicate `AtlasBarConfirmed` emitted; `reconnectCount` metric incremented |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-015 — Live Replay

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | The bar builder correctly processes a Databento live replay session (replaying historical data at live speed) |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Mock Databento replay session with known OHLCV for 10 minutes |
| **Expected result** | All 10 confirmed bars match expected OHLCV; `barSource = REPLAY` flag set on all bars; replay bars not dispatched to production consumers (shadow only) |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-016 — DST Boundary Handling

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Bar builder correctly handles the spring-forward and fall-back DST boundaries without producing duplicate or missing 1-minute bars |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture trade records spanning the spring-forward DST boundary (02:00 → 03:00 ET); fixture records spanning the fall-back DST boundary (02:00 → 01:00 ET) |
| **Expected result** | Spring-forward: no 1-min bar produced for the skipped hour; correct bar count for the session. Fall-back: no duplicate bars for the repeated hour; `ts_event` UTC timestamps used throughout; no ambiguity |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-017 — CME Maintenance Boundary Handling

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | Bar builder correctly handles the CME Globex daily maintenance window (16:00–17:00 ET) without producing bars for the maintenance period |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Trade records up to 15:59:59 ET; maintenance window; trade records from 17:00:00 ET |
| **Expected result** | No bars produced for 16:00–17:00 ET; maintenance window logged as scheduled closure; first bar after maintenance is correctly timestamped at 17:00 ET; no `UNRESOLVED` records for the maintenance window |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-018 — Contract Overlap and Resubscription

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | During a contract roll, the bar builder correctly handles the overlap period where both old and new contracts are trading, and resubscribes to the new contract |
| **Test file** | `server/market-data/__tests__/contract-roll-manager.test.ts` |
| **Fixture** | Fixture trades from old contract + `SymbolMappingMsg` + fixture trades from new contract; overlap period with trades from both |
| **Expected result** | Old contract bars closed at roll boundary; new contract subscription initiated; overlap period bars attributed to new contract; `atlas_contract_rolls` record created; no OHLCV contamination from old contract trades after roll |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

### TEST-123A3-019 — Retention Enforcement

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.3 |
| **Requirement** | `atlas_bars_1m` retains data for the configured retention period and purges older records |
| **Test file** | `server/market-data/__tests__/retention.test.ts` |
| **Fixture** | Test database with bars spanning 100 days; `TICK_RETENTION_DAYS=90` |
| **Expected result** | After retention job runs, `atlas_bars_1m` contains only bars from the last 90 days; purged rows count logged; `atlas_canonical_bars` unaffected by retention job |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |

---

## Sprint 123A.4 — Parity and Chart Authority

### TEST-123A4-001 — Parity Monitor Produces Daily Report

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | Parity monitor produces a daily report with all fields defined in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` (Revision 2) §12 |
| **Test file** | `server/market-data/__tests__/parity-monitor.test.ts` |
| **Fixture** | Test database with 1 day of matched TradingView and Databento bars |
| **Expected result** | Daily report contains all required fields; composite score computed correctly per the formula in spec §10; availability metrics present |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |

---

### TEST-123A4-002 — Parity Monitor Correctly Excludes Roll Bars

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | Parity monitor excludes contract roll boundary bars from parity calculations but counts them in the availability denominator |
| **Test file** | `server/market-data/__tests__/parity-monitor.test.ts` |
| **Fixture** | Test database with a simulated contract roll event |
| **Expected result** | Roll boundary bars excluded from parity score; exclusion reason logged; excluded count appears in availability denominator; exclusion rate does not exceed maximum |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |

---

### TEST-123A4-003 — AtlasLiveChart Renders Developing Candle

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` renders a developing candle when `atlas_bar_developing` SSE event is received |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_bar_developing` events |
| **Expected result** | Chart updates the open bar with new OHLCV values; no error thrown |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-004 — AtlasLiveChart Renders Confirmed Candle

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` renders a confirmed candle when `atlas_bar_confirmed` SSE event is received |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_bar_confirmed` events |
| **Expected result** | Chart closes the open bar and adds a new confirmed bar; no error thrown |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-005 — AtlasLiveChart Never Publishes to Event Bus

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` never calls any tRPC mutation or emits any WebSocket message that could be interpreted as a canonical market event |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock tRPC client; mock WebSocket |
| **Expected result** | No tRPC mutation called; no WebSocket message sent; component is a pure consumer |
| **Blocking gate** | G4, G7 |
| **Current result** | NOT RUN |

---

### TEST-123A4-006 — Feed Health Badge Reflects Feed State

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` feed health badge correctly reflects all six feed health states |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_feed_health` events for each of the six states |
| **Expected result** | Badge label and colour change correctly for `LIVE`, `DEGRADED`, `RECONNECTING`, `STALE`, `OFFLINE`, `UNKNOWN` |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-007 — Feed Health Transitions

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | Feed health service correctly transitions through all valid state transitions and rejects invalid ones |
| **Test file** | `server/market-data/__tests__/feed-health.test.ts` |
| **Fixture** | Simulate: LIVE → STALE (no heartbeat for 90s); STALE → OFFLINE (no heartbeat for 300s); OFFLINE → RECONNECTING (reconnect attempt); RECONNECTING → LIVE (reconnect success); LIVE → DEGRADED (high discrepancy rate) |
| **Expected result** | Each transition fires `atlas_feed_health` SSE event with correct `status`; invalid transitions (e.g., OFFLINE → LIVE without RECONNECTING) are rejected; state machine log matches expected transition sequence |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-008 — SSE Reconnect and State Rehydration

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | When a browser SSE connection reconnects after a disconnection, `AtlasLiveChart.tsx` correctly rehydrates its state from the last known bar |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream; simulate disconnection after 10 bars; reconnect; continue with bars 11–20 |
| **Expected result** | Chart calls `nexus.getRecentBars` on reconnect to seed historical bars; chart correctly displays bars 1–20 without gaps or duplicates; no stale developing bar from before disconnection |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-009 — Chart Marker Lifecycle

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | Trade markers (entry, exit, stop) are added to the chart when `atlas_chart_annotations` events are received and removed when cancelled |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_chart_annotation_add` and `atlas_chart_annotation_remove` events |
| **Expected result** | Marker appears on chart after `add` event; marker removed after `remove` event; no orphaned markers after sequence; marker count matches expected |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |

---

### TEST-123A4-010 — Broker Fill Reconciliation

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | When a broker fill is received, the fill price is compared against the Databento bar OHLCV for the same interval; disagreements are logged |
| **Test file** | `server/market-data/__tests__/parity-monitor.test.ts` |
| **Fixture** | Fixture broker fill at price X; Databento bar for the same interval with High < X |
| **Expected result** | Reconciliation record created in `atlas_parity_records` with `type = BROKER_FILL_DISAGREEMENT`; disagreement details include fill price, bar OHLCV, and delta; alert emitted |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |

---

### TEST-123A4-011 — Authority Rollback: CHART_AUTHORITY to TRADINGVIEW_ONLY

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.4 |
| **Requirement** | Setting `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` from `DATABENTO_CHART_AUTHORITY` correctly restores TradingView as the chart data source |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY`; simulate rollback to `TRADINGVIEW_ONLY` |
| **Expected result** | After rollback: TradingView bars populate `atlas_canonical_bars`; Databento bars still written to `atlas_bars_5m` (shadow); `atlas_bar_confirmed` SSE events sourced from TradingView; all new tables preserved |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |

---

## Sprint 123A.5 — Learning Authority Implementation

### TEST-123A5-001 — postBarAutomation Handles DATABENTO_LEARNING_AUTHORITY

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `postBarAutomation` is triggered by Databento canonical bar, not TradingView bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock TradingView bar; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `postBarAutomation` called once from Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-002 — Behaviour Engine Receives Databento Bar

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, Behaviour Engine receives canonical Databento bars |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock Behaviour Engine; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | Behaviour Engine `processBar` called with Databento canonical bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-003 — liveLearnEngine Triggered by Databento

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `liveLearnEngine` is triggered by Databento canonical bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `liveLearnEngine`; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `liveLearnEngine` called with Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-004 — DARWIN Triggered by Databento

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `onNewBarObservation()` is triggered by Databento canonical bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `onNewBarObservation`; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `onNewBarObservation` called with Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-005 — Zero Duplicate Processing

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, each bar is processed exactly once by each consumer |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | 100 consecutive bars; mock all consumers; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | Each consumer mock called exactly 100 times; consumer ledger contains exactly 100 records per consumer; no duplicate `CanonicalEventId` |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-006 — Authority Rollback: LEARNING_AUTHORITY to TRADINGVIEW_ONLY

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | Setting `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` from `DATABENTO_LEARNING_AUTHORITY` correctly restores TradingView as the learning trigger |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY`; simulate rollback to `TRADINGVIEW_ONLY` |
| **Expected result** | After rollback: `postBarAutomation` triggered by TradingView bar; `onNewBarObservation` called from TradingView bar; Databento bars still written to `atlas_bars_5m` (shadow); all tables preserved |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

### TEST-123A5-007 — Authority Rollback: SHADOW to TRADINGVIEW_ONLY

| Field | Value |
|---|---|
| **Sub-sprint** | 123A.5 |
| **Requirement** | Setting `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` from `DATABENTO_SHADOW` correctly disables Databento shadow processing |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW`; simulate rollback to `TRADINGVIEW_ONLY` |
| **Expected result** | After rollback: Python service and bridge stopped; Databento bars no longer written to `atlas_bars_5m`; TradingView bars populate `atlas_canonical_bars`; all existing `atlas_bars_5m` rows preserved |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |

---

## Test Summary

| Sub-sprint | Tests | Blocking | Notes |
|---|---|---|---|
| 123A.1 | 8 | 8 | — |
| Pre-123A.2 | 1 | 1 | TEST-INT-001: opt-in, live Databento required |
| 123A.2 | 10 | 10 | TEST-INT-002: opt-in, live Databento required |
| 123A.3 | 19 | 19 | TEST-123A3-001 split into A/B/C/D |
| 123A.4 | 11 | 11 | — |
| 123A.5 | 7 | 7 | — |
| **Total** | **56** | **56** | 2 opt-in integration tests included in total |

**Opt-in integration tests (require `DATABENTO_INTEGRATION_TESTS=true`):** TEST-INT-001, TEST-INT-002  
**All other tests:** Fixture-based; no live Databento connection required
