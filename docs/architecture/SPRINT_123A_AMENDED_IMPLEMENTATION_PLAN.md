# Sprint 123A — Amended Implementation Plan
**Document type:** Authoritative Amended Implementation Plan  
**Supersedes:** `SPRINT-123A-IMPLEMENTATION-PLAN.md`  
**Status:** PENDING HUMAN APPROVAL — do not begin implementation  
**Date:** 2026-07-18  
**Author:** Atlas Systems Architecture Review  
**Approval required from:** Phil

---

## 1. Executive Summary

Sprint 123A establishes Databento as Atlas's canonical market-data backbone. This amended plan corrects twelve architectural defects in the original Sprint 123A plan, divides the work into five independently releasable sub-sprints, and defines the exact authority model, event ownership model, Python/TypeScript responsibility boundary, effective-once processing model, and behaviour-system migration model required before any implementation begins.

The core principle is unchanged: **Databento replaces TradingView as the market-data source of truth, but does so through a staged, certified, human-approved authority migration.** TradingView remains the production decision trigger until `DATABENTO_LEARNING_AUTHORITY` is explicitly approved. `DATABENTO_DECISION_AUTHORITY` is not part of Sprint 123A.

**No production code was modified by this document.** The existing TradingView execution path is unchanged. The existing `processBar()` pipeline is unchanged. The existing Behaviour Engine shadow mode is unchanged.

---

## 2. Verified Repository Inventory

The following table records the verified state of every component claimed in the original plan. Each entry was verified by direct source-code inspection on 2026-07-18.

### 2.1 Market Data Module

| Component | File | Status | Active Call Site | Tests | Production Use |
|---|---|---|---|---|---|
| DBN binary parser | `server/market-data/dbn-parser.ts` | **VERIFIED** | None (test only) | `market-data.test.ts` | UNUSED — test/fallback only |
| Databento TCP client | `server/market-data/databento-client.ts` | **VERIFIED** | `marketData.start()` in `index.ts` — but `start()` is never called from server | `market-data.test.ts` | UNUSED — never started |
| Event normaliser (MBP-1) | `server/market-data/event-normalizer.ts` | **VERIFIED** | None (no live feed) | `market-data.test.ts` | UNUSED |
| Symbol registry | `server/market-data/symbol-registry.ts` | **VERIFIED** | Instantiated in `index.ts` | `market-data.test.ts` | UNUSED |
| Event bus | `server/market-data/event-bus.ts` | **VERIFIED** | Instantiated in `index.ts` | `market-data.test.ts` | UNUSED |
| Feed health monitor | `server/market-data/feed-health.ts` | **VERIFIED** | Instantiated in `index.ts` | `market-data.test.ts` | UNUSED |
| Gap detector | `server/market-data/gap-detector.ts` | **VERIFIED** | Instantiated in `index.ts` | `market-data.test.ts` | UNUSED |
| Market data facade | `server/market-data/index.ts` | **VERIFIED** | Imported nowhere in server startup | None | UNUSED |
| Bar builder | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Five-min aggregator | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Canonical router | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Parity monitor | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Tick storage | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Feature flag config | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Bridge server | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |
| Python feed service | — | **NOT FOUND** | — | — | NOT IMPLEMENTED |

### 2.2 Canonical Event Types

| Component | File | Status | Notes |
|---|---|---|---|
| `AtlasTradeEvent` | `shared/types/market-events.ts` | **VERIFIED** | Complete, versioned |
| `AtlasQuoteEvent` | `shared/types/market-events.ts` | **VERIFIED** | Complete, MBP-1 fields |
| `AtlasBarEvent` | `shared/types/market-events.ts` | **VERIFIED** | 5-min only, developing + confirmed |
| `AtlasFeedHealthEvent` | `shared/types/market-events.ts` | **VERIFIED** | Six-state machine |
| `AtlasSymbolMappingEvent` | `shared/types/market-events.ts` | **VERIFIED** | Complete |
| `CanonicalBarConfirmed` | — | **NOT FOUND** | NOT IMPLEMENTED |
| `AtlasContractRoll` | — | **NOT FOUND** | NOT IMPLEMENTED |
| `AtlasBarDeveloping` (1-min) | — | **NOT FOUND** | NOT IMPLEMENTED |
| `AtlasBarConfirmed` (1-min) | — | **NOT FOUND** | NOT IMPLEMENTED |

### 2.3 Production Execution Pipeline

| Component | File | Status | Active Call Site | Production Use |
|---|---|---|---|---|
| `processBar()` | `server/monitor/paperTradeEngine.ts:429` | **VERIFIED** | `nexusRoutes.ts:1116` | **PRODUCTION** |
| TradingView webhook | `server/nexusRoutes.ts` | **VERIFIED** | Registered in `_core/index.ts` | **PRODUCTION** |
| `certifyCandle()` | `server/atlasAutonomous.ts` | **VERIFIED** | `liveLearnEngine.ts:109` | **PRODUCTION** |
| `detectAndLogGap()` | `server/atlasAutonomous.ts` | **VERIFIED** | `liveLearnEngine.ts` | **PRODUCTION** |
| `updateMarketLawsFromBar()` | `server/atlasAutonomous.ts` | **VERIFIED** | `liveLearnEngine.ts` | **PRODUCTION** |
| `liveLearnEngine` | `server/liveLearnEngine.ts` | **VERIFIED** | `nexusRoutes.ts:1116` | **PRODUCTION** |
| `tpDispatch` | `server/tpDispatch.ts` | **VERIFIED** | `nexusRoutes.ts` | **PRODUCTION** |
| `onNewBarObservation()` | `server/darwinAutonomous.ts:206` | **VERIFIED** | **NEVER CALLED** (G-001) | UNUSED |

### 2.4 Behaviour Engine

| Component | File | Status | Active Call Site | Production Use |
|---|---|---|---|---|
| 12-classifier engine | `server/behaviour-engine/behaviour-engine.ts` | **VERIFIED** | `behaviour-engine/index.ts:21` | **SHADOW** (after processBar) |
| Classifier registry | `server/behaviour-engine/classifier-registry.ts` | **VERIFIED** | Called by engine | SHADOW |
| 12 classifier files | `server/behaviour-engine/classifiers/*.ts` | **VERIFIED** | Registered in registry | SHADOW |
| Behaviour persistence | `server/behaviour-engine/behaviour-persistence.ts` | **VERIFIED** | Called by engine | SHADOW (raw SQL to `atlas_behaviour_instances`) |
| Behaviour event bus | `server/behaviour-engine/behaviour-event-bus.ts` | **VERIFIED** | Called by engine | SHADOW |
| Legacy 7-behaviour system | `server/liveLearnEngine.ts:240–297` | **VERIFIED** | Called in `liveLearnEngine` | **PRODUCTION** (writes to `behaviour_library`) |
| `behaviourEngine.processBar()` | `server/routers.ts:1522` | **VERIFIED** | Also called from `triggerReplay` tRPC | SHADOW |

**Critical finding:** The legacy system uses 7 ad-hoc indicator-derived behaviour IDs (`VWAP_RECLAIM`, `VWAP_REJECTION`, `EMA9_21_CROSS_UP`, `EMA9_21_CROSS_DOWN`, `ATR_EXPANSION`, `RSI_OVERSOLD_BOUNCE`, `RSI_OVERBOUGHT_FADE`) that are entirely distinct from the 12 canonical `BehaviourId` values. These are not a subset of the canonical system — they are a separate classification scheme writing to a separate table (`behaviour_library` vs `atlas_behaviour_instances`).

### 2.5 Autonomy Gaps (Verified from Source)

| Gap | Location | Verified? | Severity |
|---|---|---|---|
| G-001: `onNewBarObservation()` never called | `darwinAutonomous.ts:206` | **YES** — no call site found | MEDIUM |
| G-002: `/api/scheduled/monthly-review` returns stub | `scheduledJobs.ts:220` | **YES** — `{ status: "not_implemented" }` | LOW |
| G-003: Dual behaviour system | `liveLearnEngine.ts:240` + `behaviour-engine/index.ts` | **YES** — confirmed two separate systems | MEDIUM |
| G-004: SSE chart events | `nexusRoutes.ts` | **RESOLVED** in Sprint 123 | CLOSED |
| G-006: BDE functions | `scheduledJobs.ts:55` | **PARTIALLY VERIFIED** — `bdeEngine.ts` does not exist; import not found in scheduledJobs | See §12 |

### 2.6 Claims Disproved

The original plan claimed: *"bdeEngine.ts is imported in scheduledJobs.ts lines 55–57."* This is **disproved**. No import of `bdeEngine` or any of the four claimed functions (`computeMarketIntent`, `runBehaviourClustering`, `buildPortfolioCoverageMap`, `runStrategyInteractionAnalysis`) was found in `scheduledJobs.ts` or anywhere in the server codebase. The file `server/bdeEngine.ts` does not exist. The verification document's claim was based on an earlier version of the codebase.

---

## 3. Architectural Conflicts

### Conflict 1 — TypeScript DBN Parser vs Python Client (RESOLVED)

The repository contains a tested TypeScript DBN binary parser (`dbn-parser.ts`). The amendment directive requires the official Databento Python client as the production feed adapter. **Resolution:** Python service is the production path. The TypeScript parser is retained as a tested fallback, fixture decoder, and development utility. No production Databento protocol implementation in TypeScript.

### Conflict 2 — Candle Construction Ownership (RESOLVED by Amendment 1)

The original plan proposed `bar_builder.py` and `five_min_aggregator.py` in the Python service. **Resolution:** Python owns only raw record normalisation and publication. TypeScript owns all candle construction, reconciliation, aggregation, and persistence. The Python modules `bar_builder.py` and `five_min_aggregator.py` are removed from scope.

### Conflict 3 — Shadow Mode Disabling TradingView processBar (RESOLVED by Amendment 2)

The original plan stated that `DATABENTO_SHADOW` would stop TradingView from calling `processBar()`. This is incorrect and dangerous. **Resolution:** In `DATABENTO_SHADOW`, TradingView continues calling `processBar()` unchanged. Databento records are normalised, persisted, and compared — but cannot trigger any production processing.

### Conflict 4 — Dual `atlas_bar_confirmed` Emitters (RESOLVED by Amendment 14)

Sprint 123 added `atlas_bar_confirmed` emission from the TradingView webhook path. The amendment directive prohibits emitting confirmed bars from two authoritative owners. **Resolution:** The Sprint 123 webhook emission is gated by `MARKET_DATA_AUTHORITY === TRADINGVIEW_ONLY`. When authority advances, the canonical router owns this event exclusively.

### Conflict 5 — Fake BDE Stub (RESOLVED by Amendment 5)

The original plan proposed creating `server/bdeEngine.ts` as a stub. **Resolution:** No fake implementation. A `BDE_CAPABILITY_STATUS.md` document is created instead, recording the verified absence of each claimed function.

### Conflict 6 — Duplicate DARWIN Trigger Risk (RESOLVED by Amendment 4)

The original plan risked triggering `onNewBarObservation()` from both `processBar()` and `CanonicalBarConfirmed`. **Resolution:** A single `server/automation/postBarAutomation.ts` service owns all non-execution post-bar autonomous processing. The trigger source is controlled exclusively by `MARKET_DATA_AUTHORITY`.

### Conflict 7 — Exactly-Once vs Effectively-Once (RESOLVED by Amendment 3)

The original plan claimed "exactly-once processing." This is not achievable with at-least-once delivery. **Resolution:** All claims are corrected to "effectively-once" with documented delivery guarantees, durable canonical event IDs, idempotent consumers, and a consumer-processing ledger.

### Conflict 8 — MBP-1 Schema vs Trades Schema (RESOLVED by Amendment 6)

The original plan used `mbp-1` schema because the existing normaliser was built for it. The amendment directive requires `trades` schema for Sprint 123A. **Resolution:** The event normaliser is extended to support `trades` records. The MBP-1 path is retained for future use. `DATABENTO_BOOK_SCHEMA=mbp-1` is reserved for a future sprint.

### Conflict 9 — Sprint 123A Too Large (RESOLVED by Amendment 15)

The original plan was a single sprint covering infrastructure, Python service, bar building, canonical router, live chart, autonomy remediation, parity service, and documentation. **Resolution:** Split into five independently releasable sub-sprints (123A.1 through 123A.5) plus a separately approved Sprint 123B.

---

## 4. Authority Model

The `MARKET_DATA_AUTHORITY` environment variable controls the data authority mode. No system may automatically promote itself between modes. Every promotion requires documented validation, explicit gate approval, rollback verification, and human authorisation.

| Mode | TradingView | Databento | processBar Trigger | postBarAutomation Trigger | Default |
|---|---|---|---|---|---|
| `TRADINGVIEW_ONLY` | Production authority | Disabled | TradingView webhook | TradingView webhook | **Current** |
| `DATABENTO_SHADOW` | Production authority | Shadow (persist + compare only) | TradingView webhook | TradingView webhook | **Target after 123A.3** |
| `DATABENTO_CHART_AUTHORITY` | Production decision authority | Chart + canonical candle store | TradingView webhook | TradingView webhook | After 123A.4 gate |
| `DATABENTO_LEARNING_AUTHORITY` | Production decision authority | Learning + research trigger | TradingView webhook | **Databento canonical bar** | After 123A.5 gate |
| `DATABENTO_DECISION_AUTHORITY` | Disabled | Full authority | Databento canonical bar | Databento canonical bar | Sprint 123B only |

---

## 5. Event Ownership Model

SSE is transport only. SSE must not invent business state. After reconnect, the client must query canonical persisted state before applying realtime updates.

| Event | Owner | Trigger | SSE Channel |
|---|---|---|---|
| `atlas_market_trade` | Market-data service | Every normalised trade | `atlas:trade` |
| `atlas_bar_developing` | Market-data service | Every trade update (rate-limited) | `atlas:bar_developing` |
| `atlas_bar_confirmed` | Market-data service | Bar boundary (canonical router) | `atlas:bar_confirmed` |
| `atlas_feed_health` | Market-data service | Feed state transition | `atlas:feed_health` |
| `atlas_contract_roll` | Market-data service | Contract mapping change | `atlas:contract_roll` |
| `atlas_strategy_proposal` | Strategy service | ADE candidate selection | `atlas:strategy_proposal` |
| `atlas_decision_recorded` | Decision service | ARI/TVL decision | `atlas:decision` |
| `atlas_trade_opened` | Trade lifecycle service | Paper trade opened | `atlas:trade_opened` |
| `atlas_trade_updated` | Trade lifecycle service | MFE/MAE update | `atlas:trade_updated` |
| `atlas_trade_closed` | Trade lifecycle service | Paper trade closed | `atlas:trade_closed` |
| `atlas_behaviour_detected` | Behaviour Engine | New instance detected | `atlas:behaviour` |
| `atlas_behaviour_updated` | Behaviour Engine | Instance updated | `atlas:behaviour` |
| `atlas_behaviour_expired` | Behaviour Engine | Instance expired | `atlas:behaviour` |

---

## 6. Python/TypeScript Responsibility Boundary

### Python Service Owns

The Python Databento service is a pure adapter. It owns: official Databento client connection, authentication, subscription management, live replay requests, historical requests, raw Databento record normalisation (trades schema), trade-event publication to bridge, official `ohlcv-1m` publication to bridge, definition-record publication to bridge, symbol-mapping publication to bridge, and feed-health publication to bridge.

### Python Service Must Not Own

The Python service must not own: developing candle construction, confirmed candle reconciliation, canonical candle persistence, five-minute aggregation, session logic, strategy logic, behaviour logic, ADE logic, DARWIN logic, or database writes of any kind.

### TypeScript Atlas Owns

TypeScript owns: developing one-minute candles built from trade records, reconciliation against official Databento `ohlcv-1m`, confirmed canonical one-minute bars, synthetic continuity-bar policy, canonical five-minute aggregation, canonical event publication, all persistence, and all downstream automation.

---

## 7. Effective-Once Processing Model

Atlas uses at-least-once delivery with idempotent consumers. The term "exactly-once" is not used. See `ATLAS_EFFECTIVELY_ONCE_PROCESSING.md` for the full specification.

**Canonical Market Event ID** fields (minimum):

| Field | Type | Example |
|---|---|---|
| `source` | string | `databento` |
| `dataset` | string | `GLBX.MDP3` |
| `rawSymbol` | string | `MNQM5` |
| `instrumentId` | number | `12345` |
| `interval` | string | `5m` |
| `barOpenTs` | number | `1750000000000` |
| `revision` | number | `0` |
| `mappingVersion` | number | `1` |

**Consumer Idempotency Key** pattern: `{consumerName}_v{consumerVersion}:{canonicalEventId}`

Examples: `behaviour_engine_v1:databento.GLBX.MDP3.MNQM5.12345.5m.1750000000000.0.1`, `live_learn_v1:...`, `darwin_observation_v1:...`

---

## 8. Databento Contract Resolution Model

The Contract Roll Manager uses Databento continuous-symbol mapping and symbol-mapping records as the primary contract-resolution source. Local volume crossover and expiry calculations are validation and anomaly detection only — not the sole authoritative roll rule. See `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md` for the full specification.

---

## 9. No-Trade-Minute and Gap-Recovery Policy

Three distinct cases govern missing bars. See `DATABENTO_NO_TRADE_AND_GAP_POLICY.md` for the full specification.

**Case A — Confirmed no-trade minute:** Synthetic flat continuity bar may be generated only when the exchange is in an active trading period, feed health is `LIVE`, sequence continuity is verified, and historical reconciliation confirms no trade occurred. Flagged `SYNTHETIC_NO_TRADE_BAR`. Five-minute aggregation must not silently bridge unresolved minutes.

**Case B — Exchange closed or scheduled pause:** Do not synthesise a bar. Mark market schedule state correctly.

**Case C — Feed uncertainty or missing data:** Do not synthesise a bar. Mark interval `UNRESOLVED`. Recover from live replay or Historical API. Confirm bar only after recovery.

---

## 10. Behaviour-System Migration Model

Two parallel behaviour tracking systems currently exist and must remain distinguishable throughout the migration. See `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md` for the full specification.

**Legacy system (7 behaviours):** Writes to `behaviour_library` table. Behaviour IDs are indicator-derived signals (`VWAP_RECLAIM`, `VWAP_REJECTION`, `EMA9_21_CROSS_UP`, `EMA9_21_CROSS_DOWN`, `ATR_EXPANSION`, `RSI_OVERSOLD_BOUNCE`, `RSI_OVERBOUGHT_FADE`). Source field: `legacy_v1`. Production status: **ACTIVE**.

**Canonical system (12 classifiers):** Writes to `atlas_behaviour_instances` table. Behaviour IDs are the 12 `BehaviourId` values in `types.ts`. Source field: `canonical_v1`. Production status: **SHADOW** (runs after TradingView processBar, no production consumers).

**Migration rule:** Neither system may influence live execution during the migration. The canonical system becomes the single source of truth only after certification criteria are met and Phil explicitly approves the transition.

---

## 11. DARWIN Trigger Model

`onNewBarObservation()` in `darwinAutonomous.ts:206` is exported but never called (G-001). The fix is a single call inside `postBarAutomation.ts`, not a `setImmediate` in `liveLearnEngine.ts` (which would risk duplicate triggers).

**Authority rules for `postBarAutomation`:**

- `TRADINGVIEW_ONLY`: TradingView authoritative bar path invokes `postBarAutomation` once per bar.
- `DATABENTO_SHADOW`: TradingView remains the only `postBarAutomation` trigger. Databento parity bars do not invoke it.
- `DATABENTO_CHART_AUTHORITY`: TradingView remains the only `postBarAutomation` trigger.
- `DATABENTO_LEARNING_AUTHORITY`: `CanonicalBarConfirmed` from Databento becomes the only `postBarAutomation` trigger. TradingView post-bar trigger is disabled.
- `DATABENTO_DECISION_AUTHORITY`: Handled only in Sprint 123B.

---

## 12. BDE Capability Status

`computeMarketIntent()`, `runBehaviourClustering()`, `buildPortfolioCoverageMap()`, and `runStrategyInteractionAnalysis()` were not found anywhere in the codebase. `server/bdeEngine.ts` does not exist. No fake implementation will be created. See `BDE_CAPABILITY_STATUS.md` for the full capability status record.

---

## 13. Development Deployment Topology

In local development, Node.js may start the Python service as a child process. The bridge binds to `127.0.0.1:7890`. Authentication uses `BRIDGE_AUTH_TOKEN`. See `DATABENTO_DEPLOYMENT_TOPOLOGY.md` for diagrams.

---

## 14. Production Deployment Topology

In production (Manus webdev deployment), the Python service and Node.js server share the same container or process group. The bridge address is `127.0.0.1:7890` when co-located. If separate containers are used, a private service address and authenticated bridge with TLS are required. The bridge must never be exposed publicly. See `DATABENTO_DEPLOYMENT_TOPOLOGY.md` for diagrams.

---

## 15. Sub-Sprint Sequence

### Sprint 123A.1 — Foundation and Autonomy Remediation

**Branch:** `sprint/123a-1-foundation`  
**No live Databento connection. No production authority change.**

Deliverables:
- `server/market-data/config.ts` — `MARKET_DATA_AUTHORITY` feature flag system
- `drizzle/schema.ts` additions — `atlas_bars_1m`, `atlas_bars_5m`, `atlas_canonical_bars`, `atlas_contract_rolls`, `atlas_parity_records`, `atlas_chart_annotations`, `atlas_consumer_processing_ledger`
- `shared/types/canonical-events.ts` — `CanonicalBarConfirmed`, `AtlasContractRoll`, `AtlasBarDeveloping` (1-min), `AtlasBarConfirmed` (1-min)
- `server/automation/postBarAutomation.ts` — single post-bar automation trigger (TRADINGVIEW_ONLY mode only)
- G-001 fix: `onNewBarObservation()` wired via `postBarAutomation`
- G-002 fix: `/api/scheduled/monthly-review` wired to `runMonthlyAudit()`
- `docs/architecture/BDE_CAPABILITY_STATUS.md`
- `docs/architecture/BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md`
- All supporting architecture documents (this set)

Acceptance criteria: TypeScript compiles, migrations apply, `postBarAutomation` called exactly once per TradingView bar, `onNewBarObservation()` receives every bar, monthly review returns real output, no production execution path changed.

### Sprint 123A.2 — Databento Adapter and Private Bridge

**Branch:** `sprint/123a-2-databento-adapter`  
**Shadow mode only. No canonical bars drive Atlas.**

Deliverables:
- `services/databento-feed/` — Python adapter service (see §6 for module list)
- `server/market-data/bridge-server.ts` — authenticated WebSocket bridge receiver
- `server/market-data/config.ts` — `DATABENTO_LIVE_ENABLED`, `DATABENTO_TRADES_SCHEMA=trades`, `DATABENTO_BAR_SCHEMA=ohlcv-1m`
- Extended `event-normalizer.ts` — `trades` schema support
- Bridge health endpoint
- Fixture-based unit tests for all Python modules
- Secret scanning tests

Acceptance criteria: Python service connects, normalises `trades` records, publishes to bridge, bridge receives and publishes to `atlasEventBus`. No `processBar()` called from Databento path. `DATABENTO_API_KEY` never appears in logs, SSE, DB, or browser bundles.

### Sprint 123A.3 — Canonical Bar and Contract Services

**Branch:** `sprint/123a-3-canonical-bars`  
**Shadow mode only.**

Deliverables:
- `server/market-data/bar-builder.ts` — 1-min developing/confirmed bar builder from trade events
- `server/market-data/five-min-aggregator.ts` — 5-min aggregation from 5 confirmed 1-min bars
- `server/market-data/contract-roll-manager.ts` — contract resolution and roll detection
- `server/market-data/canonical-router.ts` — canonical router (shadow mode: persist + compare only)
- `server/market-data/tick-storage.ts` — async tick persistence
- No-trade-minute policy implementation
- Unresolved-minute handling
- Effective-once consumer ledger

Acceptance criteria: Databento bars persisted to `atlas_bars_1m` and `atlas_bars_5m`. No `processBar()` called from Databento path. Contract rolls detected and persisted. No unresolved minutes silently bridged.

### Sprint 123A.4 — Parity and Chart Authority

**Branch:** `sprint/123a-4-parity-chart`  
**TradingView remains decision authority.**

Deliverables:
- `server/market-data/parity-monitor.ts` — TradingView/Databento bar parity comparison
- Daily parity report (added to DARWIN daily report)
- `client/src/components/AtlasLiveChart.tsx` — full live chart with trade markers, feed health, contract roll markers
- `nexus.getRecentBars` extended for 1-min and 5-min intervals
- All trade lifecycle SSE events (`atlas_strategy_proposal`, `atlas_decision_recorded`, `atlas_trade_opened`, `atlas_trade_updated`, `atlas_trade_closed`)
- Chart authority gate documentation

Acceptance criteria: Parity ≥ 99.9% over 5 consecutive trading days. `AtlasLiveChart.tsx` displays developing and confirmed candles from Databento. `LiveChart.tsx` remains as fallback. TradingView remains decision authority.

### Sprint 123A.5 — Learning Authority

**Branch:** `sprint/123a-5-learning-authority`  
**Requires explicit human approval before activation.**

Deliverables:
- `postBarAutomation.ts` updated for `DATABENTO_LEARNING_AUTHORITY` mode
- Behaviour Engine canonical Databento bar input (separate parity namespace retired after certification)
- `liveLearnEngine` canonical trigger from Databento
- DARWIN canonical trigger from Databento
- Duplicate-learning protection
- `DATABENTO_LEARNING_AUTHORITY` gate

Acceptance criteria: Databento triggers all learning. TradingView learning triggers disabled. Zero duplicate `onNewBarObservation()` calls. Zero duplicate Behaviour Engine instances. TradingView remains decision authority. Phil explicitly approves activation.

---

## 16. Sub-Sprint Dependencies

```
123A.1 (Foundation) → 123A.2 (Adapter) → 123A.3 (Canonical Bars)
                                                    ↓
                                          123A.4 (Parity + Chart)
                                                    ↓
                                          123A.5 (Learning Authority)
                                                    ↓
                                          123B (Decision Authority — separate approval)
```

123A.1 has no dependencies and can begin immediately after Phil approves this plan.

---

## 17. Database Migration Sequence

All migrations are additive (new tables only) until 123A.4. No existing tables are modified in 123A.1 through 123A.3.

| Sub-Sprint | Migration | Type | Risk |
|---|---|---|---|
| 123A.1 | Add `atlas_bars_1m`, `atlas_bars_5m`, `atlas_canonical_bars`, `atlas_contract_rolls`, `atlas_parity_records`, `atlas_chart_annotations`, `atlas_consumer_processing_ledger` | Additive | LOW |
| 123A.2 | None | — | NONE |
| 123A.3 | None | — | NONE |
| 123A.4 | Add `atlas_chart_annotations` inserts | Additive | LOW |
| 123A.5 | None | — | NONE |

---

## 18. Feature Flags and Defaults

| Variable | Default | Set By |
|---|---|---|
| `MARKET_DATA_AUTHORITY` | `TRADINGVIEW_ONLY` | Human approval required to change |
| `DATABENTO_LIVE_ENABLED` | `false` | Set `true` in 123A.2 |
| `DATABENTO_TRADES_SCHEMA` | `trades` | Fixed |
| `DATABENTO_BAR_SCHEMA` | `ohlcv-1m` | Fixed |
| `DATABENTO_BOOK_SCHEMA` | `mbp-1` | Reserved, `DATABENTO_BOOK_ENABLED=false` |
| `DATABENTO_REPLAY_ENABLED` | `true` | Fixed |
| `DATABENTO_FEED_MODE` | `shadow` | Fixed until 123A.4 gate |
| `DATABENTO_HISTORICAL_ENABLED` | `false` | Set in 123A.3 |
| `BRIDGE_AUTH_TOKEN` | Generated | Set in 123A.2 |
| `LEGACY_BEHAVIOUR_ENABLED` | `true` | Do not change until migration certified |

---

## 19. Rollback Strategy

Each sub-sprint has an independent rollback path. The `MARKET_DATA_AUTHORITY` flag is the primary rollback mechanism — setting it to `TRADINGVIEW_ONLY` immediately restores the current production execution path regardless of which sub-sprint is active.

Database migrations are additive only through 123A.3. Rollback requires only dropping the new tables, which have no foreign-key dependencies from existing production tables.

---

## 20. Test Strategy

Normal CI uses fixtures. No paid Databento connection is required. Live integration tests are opt-in via `DATABENTO_INTEGRATION_TESTS=true`. See the Testing Plan in the directive for the full 64-item test requirement list.

---

## 21. Observability Strategy

Every data-quality decision must be persisted. Feed health state transitions are written to `system_health_events`. Parity failures are written to `atlas_parity_records`. Consumer processing records are written to `atlas_consumer_processing_ledger`. The Observatory dashboard exposes feed health, parity statistics, and consumer ledger state.

---

## 22. Security Strategy

`DATABENTO_API_KEY` must never appear in logs, SSE payloads, database rows, error responses, or browser bundles. Secret scanning tests are required in 123A.2. The bridge is private (`127.0.0.1` or internal network). Bridge authentication uses `BRIDGE_AUTH_TOKEN`. The frontend never connects to Databento directly.

---

## 23. Risk Register

See `SPRINT_123A_RISK_REGISTER.md` for the full risk register.

---

## 24. Human Approval Gates

| Gate | Required Before | Approver |
|---|---|---|
| Plan approval | 123A.1 implementation begins | Phil |
| 123A.1 complete | 123A.2 branch begins | Phil |
| 123A.2 complete | 123A.3 branch begins | Phil |
| 123A.3 complete | 123A.4 branch begins | Phil |
| 123A.4 parity certification | `DATABENTO_CHART_AUTHORITY` activation | Phil |
| 123A.5 complete | `DATABENTO_LEARNING_AUTHORITY` activation | Phil |
| Sprint 123B plan | 123B implementation begins | Phil |

---

## 25. Definition of Done

Sprint 123A is complete when:

- All five sub-sprints are merged to `main`
- `DATABENTO_SHADOW` mode is active in production
- Parity ≥ 99.9% over 5 consecutive trading days
- `AtlasLiveChart.tsx` passes Chart Authority gate
- All 64 test categories pass
- No `DATABENTO_API_KEY` in any log, SSE, DB row, or browser bundle
- All architecture documents are committed and linked
- `SPRINT_123A_DATABENTO_LIVE_VALIDATION.md` report is complete
- Phil has approved `DATABENTO_SHADOW` activation
- `DATABENTO_LEARNING_AUTHORITY` is NOT activated (reserved for 123A.5 gate)
- `DATABENTO_DECISION_AUTHORITY` is NOT activated (reserved for Sprint 123B)
- No production execution path was changed without explicit gate approval
