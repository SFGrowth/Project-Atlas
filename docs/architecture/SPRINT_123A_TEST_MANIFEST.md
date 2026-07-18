# Sprint 123A Test Manifest
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`

---

## Overview

This manifest defines every test required for Sprint 123A. Each test has a unique ID, sub-sprint, requirement, test file, fixture, expected result, blocking gate, current result, and evidence location. Tests are grouped by sub-sprint. All tests must pass before their respective gate can be approved.

**Test ID format:** `TEST-{sub-sprint}-{sequence}` for unit/integration tests, `TEST-INT-{sequence}` for opt-in live integration tests.

**Blocking status:** A test marked `BLOCKING` for a gate must pass before that gate can be approved. A test marked `NON-BLOCKING` contributes to evidence but does not individually block the gate.

**Current result:** All tests are `NOT RUN` until the sub-sprint is implemented.

---

## Sprint 123A.1 — Foundation and Autonomy Remediation

### TEST-123A1-001 — Feature Flag Config Compiles

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-001 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | `server/market-data/config.ts` exports `MARKET_DATA_AUTHORITY` and all feature flags |
| **Test file** | `server/market-data/__tests__/config.test.ts` |
| **Fixture** | None — tests TypeScript exports only |
| **Expected result** | `tsc --noEmit` passes; all flag types are exported; default values match §18 of amended plan |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | CI build log |

---

### TEST-123A1-002 — Database Migration Applies Cleanly

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-002 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | All 7 new tables (`atlas_bars_1m`, `atlas_bars_5m`, `atlas_canonical_bars`, `atlas_contract_rolls`, `atlas_parity_records`, `atlas_chart_annotations`, `atlas_consumer_processing_ledger`) are created without error |
| **Test file** | `drizzle/__tests__/migration.test.ts` |
| **Fixture** | Test database (in-memory or isolated MySQL) |
| **Expected result** | Migration applies without error; all 7 tables exist; all columns match schema definition; no existing tables modified |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | CI migration log |

---

### TEST-123A1-003 — postBarAutomation Is Sole Caller of liveLearnEngine

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-003 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | No code path outside `postBarAutomation.ts` calls `liveLearnEngine` directly |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `liveLearnEngine`; mock `nexusRoutes` TradingView webhook handler |
| **Expected result** | Source search confirms no import of `liveLearnEngine` in `nexusRoutes.ts`; mock verifies `liveLearnEngine` is called exactly once per bar via `postBarAutomation` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report; source search output |

---

### TEST-123A1-004 — onNewBarObservation Called via postBarAutomation

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-004 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | G-001 fix: `onNewBarObservation()` is called exactly once per bar via `postBarAutomation` |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `darwinAutonomous.onNewBarObservation`; simulate TradingView bar event |
| **Expected result** | `onNewBarObservation` called exactly once per bar; not called from any other code path |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A1-005 — Monthly Review Returns Real Output

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-005 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | G-002 fix: `/api/scheduled/monthly-review` returns real output, not `{ status: "not_implemented" }` |
| **Test file** | `server/__tests__/scheduledJobs.test.ts` |
| **Fixture** | Test database with at least 30 days of `atlas_memory` bars |
| **Expected result** | Response contains at minimum: `{ status: "complete", period: "...", barCount: N, ... }` where `barCount > 0`; response does not contain `"not_implemented"` |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A1-006 — Legacy Behaviour System Unchanged

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-006 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | `LEGACY_BEHAVIOUR_ENABLED=true` — legacy 7-behaviour system writes to `behaviour_library` unchanged |
| **Test file** | `server/__tests__/liveLearnEngine.test.ts` |
| **Fixture** | Mock bar; test database with `behaviour_library` table |
| **Expected result** | After processing a bar, `behaviour_library` contains a new row; the 7 legacy behaviour IDs are present in the output |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A1-007 — Canonical Event Types Compile

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-007 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | `shared/types/canonical-events.ts` exports `CanonicalBarConfirmed`, `AtlasContractRoll`, `AtlasBarDeveloping` (1-min), `AtlasBarConfirmed` (1-min) |
| **Test file** | `shared/types/__tests__/canonical-events.test.ts` |
| **Fixture** | None — tests TypeScript exports only |
| **Expected result** | `tsc --noEmit` passes; all types are exported; `CanonicalEventId` fields match §7 of amended plan |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | CI build log |

---

### TEST-123A1-008 — No Databento Connection in TRADINGVIEW_ONLY Mode

| Field | Value |
|---|---|
| **Test ID** | TEST-123A1-008 |
| **Sub-sprint** | 123A.1 |
| **Requirement** | With `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY`, no Databento client is started |
| **Test file** | `server/market-data/__tests__/config.test.ts` |
| **Fixture** | Mock Databento client; set `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` |
| **Expected result** | Databento client `start()` is never called; no network connection attempted |
| **Blocking gate** | G1 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

## Sprint 123A.2 — Databento Adapter and Private Bridge

### TEST-INT-001 — Databento Symbol Resolution (Opt-In Integration Test)

| Field | Value |
|---|---|
| **Test ID** | TEST-INT-001 |
| **Sub-sprint** | Pre-123A.2 |
| **Requirement** | The actual Databento continuous symbol for MNQ front-month is confirmed; `MNQ1!` is not assumed |
| **Test file** | `services/databento-feed/tests/test_symbol_resolution.py` |
| **Fixture** | Live Databento connection (`DATABENTO_INTEGRATION_TESTS=true`, `DATABENTO_API_KEY` set) |
| **Expected result** | Test connects to Databento metadata API; queries available symbols in `GLBX.MDP3` for MNQ family; confirms the continuous symbol name; subscribes and receives at least 1 `trades` record; records confirmed symbol in `docs/evidence/TEST-INT-001-result.md` |
| **Blocking gate** | G2 (pre-requisite) |
| **Current result** | NOT RUN |
| **Evidence location** | `docs/evidence/TEST-INT-001-result.md` |

---

### TEST-123A2-001 — Python Service Normalises Trades Records

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-001 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | Python feed service correctly normalises Databento `trades` schema records into `AtlasTradeEvent` format |
| **Test file** | `services/databento-feed/tests/test_normalizer.py` |
| **Fixture** | Fixture file: `services/databento-feed/tests/fixtures/trades_sample.bin` (captured from Databento replay) |
| **Expected result** | All fixture records normalise without error; output matches expected `AtlasTradeEvent` schema; no API key in output |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A2-002 — Bridge Server Receives Records

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-002 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | Bridge server receives normalised records from Python service and publishes to `atlasEventBus` |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock Python service sending fixture records over WebSocket |
| **Expected result** | Bridge server receives records; `atlasEventBus` emits `AtlasTradeEvent`; bridge health endpoint returns `{ status: "connected" }` |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A2-003 — atlasEventBus Receives AtlasTradeEvent

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-003 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | `atlasEventBus` emits `AtlasTradeEvent` records received from the bridge |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock bridge input |
| **Expected result** | Event bus subscriber receives `AtlasTradeEvent` with correct fields; `source = "databento"` |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A2-004 — Secret Scanning: API Key Not in Logs

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-004 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | `DATABENTO_API_KEY` does not appear in any log output, SSE payload, database row, error response, or browser bundle |
| **Test file** | `server/__tests__/secret-scanning.test.ts` |
| **Fixture** | Set `DATABENTO_API_KEY=TEST_SECRET_KEY_DO_NOT_LOG`; run full server startup and simulate error conditions |
| **Expected result** | Grep of all log output, SSE payloads, and database rows confirms `TEST_SECRET_KEY_DO_NOT_LOG` does not appear anywhere |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report; grep output |

---

### TEST-123A2-005 — Secret Scanning: API Key Not in Browser Bundle

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-005 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | `DATABENTO_API_KEY` does not appear in the built browser bundle |
| **Test file** | `scripts/check-bundle-secrets.sh` |
| **Fixture** | Build with `DATABENTO_API_KEY=TEST_SECRET_KEY_DO_NOT_LOG` |
| **Expected result** | `grep -r TEST_SECRET_KEY_DO_NOT_LOG dist/` returns no results |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Script output |

---

### TEST-123A2-006 — No processBar() from Databento Path

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-006 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, no `processBar()` call is triggered from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `processBar`; simulate Databento trade events; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `processBar` mock is never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A2-007 — No postBarAutomation from Databento Path

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-007 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, no `postBarAutomation` call is triggered from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `postBarAutomation`; simulate Databento trade events; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `postBarAutomation` mock is never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A2-008 — No onNewBarObservation from Databento Path

| Field | Value |
|---|---|
| **Test ID** | TEST-123A2-008 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | In `DATABENTO_SHADOW` mode, `onNewBarObservation()` is never called from any Databento event |
| **Test file** | `server/market-data/__tests__/bridge-server.test.ts` |
| **Fixture** | Mock `onNewBarObservation`; simulate Databento events; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `onNewBarObservation` mock is never called |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-INT-002 — Databento Live Connection (Opt-In Integration Test)

| Field | Value |
|---|---|
| **Test ID** | TEST-INT-002 |
| **Sub-sprint** | 123A.2 |
| **Requirement** | Python feed service connects to Databento live feed and receives records |
| **Test file** | `services/databento-feed/tests/test_live_connection.py` |
| **Fixture** | Live Databento connection (`DATABENTO_INTEGRATION_TESTS=true`) |
| **Expected result** | Service connects; receives at least 10 `trades` records within 60 seconds; records are normalised without error; no API key in any output |
| **Blocking gate** | G2 |
| **Current result** | NOT RUN |
| **Evidence location** | `docs/evidence/TEST-INT-002-result.md` |

---

## Sprint 123A.3 — Canonical Bar and Contract Services

### TEST-123A3-001 — 1-Min Bar Builder Produces Correct OHLCV

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-001 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Bar builder correctly aggregates trade events into 1-minute OHLCV bars |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | Fixture: 60 seconds of `AtlasTradeEvent` records with known OHLCV |
| **Expected result** | Output 1-min bar matches expected OHLCV exactly; `barType = LIVE_CONFIRMED`; `instrumentId` and `rawSymbol` match fixture |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-002 — 5-Min Aggregator Produces Correct OHLCV

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-002 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Five-minute aggregator correctly aggregates 5 confirmed 1-min bars into a 5-min bar |
| **Test file** | `server/market-data/__tests__/five-min-aggregator.test.ts` |
| **Fixture** | 5 fixture `AtlasBarConfirmed` (1-min) records with known OHLCV |
| **Expected result** | Output 5-min bar: Open = first bar Open, High = max of all Highs, Low = min of all Lows, Close = last bar Close, Volume = sum of all Volumes; `barType = CANONICAL_CONFIRMED` |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-003 — Contract Roll Detected from SymbolMappingMsg

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-003 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Contract Roll Manager detects a roll from a `SymbolMappingMsg` record |
| **Test file** | `server/market-data/__tests__/contract-roll-manager.test.ts` |
| **Fixture** | Fixture `SymbolMappingMsg` with new raw symbol |
| **Expected result** | `atlas_contract_rolls` record created; `AtlasContractRoll` event published; `mappingVersion` incremented; symbol registry updated |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-004 — Consumer Processing Ledger Prevents Duplicates

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-004 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Consumer processing ledger prevents the same bar from being processed twice by the same consumer |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Same `CanonicalEventId` submitted twice to canonical router |
| **Expected result** | Second submission is rejected; consumer ledger contains exactly one record for the event; no duplicate processing occurs |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-005 — No-Trade Minute Produces Synthetic Bar

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-005 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Bar builder generates a `SYNTHETIC_NO_TRADE_BAR` for a confirmed no-trade minute |
| **Test file** | `server/market-data/__tests__/bar-builder.test.ts` |
| **Fixture** | 60-second window with zero trade events; feed health = `LIVE`; sequence continuity verified |
| **Expected result** | Output bar has `barType = SYNTHETIC_NO_TRADE_BAR`; OHLCV is flat (Open = High = Low = Close = previous Close; Volume = 0) |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-006 — Unresolved Minute Blocks 5-Min Dispatch

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-006 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | A 5-min bar containing an `UNRESOLVED` 1-min bar is not dispatched to production consumers |
| **Test file** | `server/market-data/__tests__/five-min-aggregator.test.ts` |
| **Fixture** | 4 confirmed 1-min bars + 1 `UNRESOLVED` 1-min bar |
| **Expected result** | Aggregator sets `containsUnresolvedMinutes = true`; canonical router blocks dispatch; no `processBar()` called; no `postBarAutomation` called |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-007 — atlas_bars_1m Populated

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-007 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | Confirmed 1-min bars are persisted to `atlas_bars_1m` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Test database; simulate 5 minutes of trade events |
| **Expected result** | `atlas_bars_1m` contains 5 rows after 5 minutes; each row has correct OHLCV and `barType` |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-008 — No processBar() from Databento Path in Shadow Mode

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-008 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | In `DATABENTO_SHADOW` mode, canonical router never calls `processBar()` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Mock `processBar`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `processBar` mock is never called regardless of how many bars are confirmed |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A3-009 — No postBarAutomation from Databento Path in Shadow Mode

| Field | Value |
|---|---|
| **Test ID** | TEST-123A3-009 |
| **Sub-sprint** | 123A.3 |
| **Requirement** | In `DATABENTO_SHADOW` mode, canonical router never calls `postBarAutomation` |
| **Test file** | `server/market-data/__tests__/canonical-router.test.ts` |
| **Fixture** | Mock `postBarAutomation`; `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` |
| **Expected result** | `postBarAutomation` mock is never called |
| **Blocking gate** | G3 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

## Sprint 123A.4 — Parity and Chart Authority

### TEST-123A4-001 — Parity Monitor Produces Daily Report

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-001 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | Parity monitor produces a daily report with all fields defined in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` §12 |
| **Test file** | `server/market-data/__tests__/parity-monitor.test.ts` |
| **Fixture** | Test database with 1 day of matched TradingView and Databento bars |
| **Expected result** | Daily report contains all required fields; composite score is computed correctly per the formula in §10 of the spec |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A4-002 — Parity Monitor Correctly Excludes Roll Bars

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-002 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | Parity monitor excludes contract roll boundary bars from all parity calculations |
| **Test file** | `server/market-data/__tests__/parity-monitor.test.ts` |
| **Fixture** | Test database with a simulated contract roll event |
| **Expected result** | Roll boundary bars are excluded; exclusion reason logged as `contract_roll_boundary`; excluded count matches expected |
| **Blocking gate** | G5 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A4-003 — AtlasLiveChart Renders Developing Candle

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-003 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` renders a developing candle when `atlas_bar_developing` SSE event is received |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_bar_developing` events |
| **Expected result** | Chart updates the open bar with new OHLCV values; no error thrown |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A4-004 — AtlasLiveChart Renders Confirmed Candle

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-004 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` renders a confirmed candle when `atlas_bar_confirmed` SSE event is received |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_bar_confirmed` events |
| **Expected result** | Chart closes the open bar and adds a new confirmed bar; no error thrown |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A4-005 — AtlasLiveChart Never Publishes to Event Bus

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-005 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` never calls any tRPC mutation or emits any WebSocket message that could be interpreted as a canonical market event |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock tRPC client; mock WebSocket |
| **Expected result** | No tRPC mutation is called; no WebSocket message is sent; the component is a pure consumer |
| **Blocking gate** | G4, G7 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A4-006 — Feed Health Badge Reflects Feed State

| Field | Value |
|---|---|
| **Test ID** | TEST-123A4-006 |
| **Sub-sprint** | 123A.4 |
| **Requirement** | `AtlasLiveChart.tsx` feed health badge correctly reflects the six feed health states |
| **Test file** | `client/src/components/__tests__/AtlasLiveChart.test.tsx` |
| **Fixture** | Mock SSE stream emitting `atlas_feed_health` events for each of the six states |
| **Expected result** | Badge label and colour change correctly for each state: `LIVE`, `DEGRADED`, `RECONNECTING`, `STALE`, `OFFLINE`, `UNKNOWN` |
| **Blocking gate** | G4 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

## Sprint 123A.5 — Learning Authority Implementation

### TEST-123A5-001 — postBarAutomation Handles DATABENTO_LEARNING_AUTHORITY

| Field | Value |
|---|---|
| **Test ID** | TEST-123A5-001 |
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `postBarAutomation` is triggered by Databento canonical bar, not TradingView bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock TradingView bar; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `postBarAutomation` called once from Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A5-002 — Behaviour Engine Receives Databento Bar in Learning Authority

| Field | Value |
|---|---|
| **Test ID** | TEST-123A5-002 |
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, Behaviour Engine receives canonical Databento bars |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock Behaviour Engine; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | Behaviour Engine `processBar` called with Databento canonical bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A5-003 — liveLearnEngine Triggered by Databento in Learning Authority

| Field | Value |
|---|---|
| **Test ID** | TEST-123A5-003 |
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `liveLearnEngine` is triggered by Databento canonical bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `liveLearnEngine`; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `liveLearnEngine` called with Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A5-004 — DARWIN Triggered by Databento in Learning Authority

| Field | Value |
|---|---|
| **Test ID** | TEST-123A5-004 |
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, `onNewBarObservation()` is triggered by Databento canonical bar |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Mock `onNewBarObservation`; mock Databento canonical bar; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | `onNewBarObservation` called with Databento canonical bar; not called from TradingView bar |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

### TEST-123A5-005 — Zero Duplicate Processing in Learning Authority

| Field | Value |
|---|---|
| **Test ID** | TEST-123A5-005 |
| **Sub-sprint** | 123A.5 |
| **Requirement** | In `DATABENTO_LEARNING_AUTHORITY` mode, each bar is processed exactly once by each consumer |
| **Test file** | `server/automation/__tests__/postBarAutomation.test.ts` |
| **Fixture** | Simulate 100 consecutive bars; mock all consumers; `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` |
| **Expected result** | Each consumer mock called exactly 100 times; consumer processing ledger contains exactly 100 records per consumer; no duplicate `CanonicalEventId` in ledger |
| **Blocking gate** | G6 |
| **Current result** | NOT RUN |
| **Evidence location** | Test report |

---

## Test Summary

| Sub-sprint | Total Tests | Blocking Tests | Non-Blocking Tests |
|---|---|---|---|
| 123A.1 | 8 | 8 | 0 |
| 123A.2 | 8 (6 unit + 2 opt-in integration) | 8 | 0 |
| 123A.3 | 9 | 9 | 0 |
| 123A.4 | 6 | 6 | 0 |
| 123A.5 | 5 | 5 | 0 |
| **Total** | **36** | **36** | **0** |

**Opt-in integration tests (require `DATABENTO_INTEGRATION_TESTS=true`):** TEST-INT-001, TEST-INT-002  
**All other tests:** Fixture-based, no live Databento connection required
