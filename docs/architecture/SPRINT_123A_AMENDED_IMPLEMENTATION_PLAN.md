# Sprint 123A — Amended Implementation Plan (Revision 2)
**Document type:** Authoritative Amended Implementation Plan  
**Supersedes:** `SPRINT-123A-IMPLEMENTATION-PLAN.md` and Revision 1 of this document  
**Status:** PENDING HUMAN APPROVAL — Gate G0 — do not begin implementation  
**Date:** 2026-07-18 (Revision 2: corrections applied per Gate G0 review)  
**Author:** Atlas Systems Architecture Review  
**Approval required from:** Phil

---

## 1. Executive Summary

Sprint 123A establishes Databento as Atlas's canonical market-data backbone. This revision corrects twelve blocking contradictions identified during the Gate G0 review. The five sub-sprint structure is retained. The authority model, event ownership model, Python/TypeScript responsibility boundary, effective-once processing model, and behaviour-system migration model are all updated to be internally consistent.

The core principle is unchanged: **Databento replaces TradingView as the market-data source of truth through a staged, certified, human-approved authority migration.** TradingView remains the production decision trigger until `DATABENTO_LEARNING_AUTHORITY` is explicitly approved at Gate G6A. `DATABENTO_DECISION_AUTHORITY` is not part of Sprint 123A.

**No production code was modified by this document. No migrations have been run. No Databento connection has been made.**

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
| `liveLearnEngine` | `server/liveLearnEngine.ts` | **VERIFIED** | `nexusRoutes.ts:1116` | **PRODUCTION** — called directly from TradingView webhook. This direct call is removed in Sprint 123A.1 and replaced by `postBarAutomation`. |
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
| G-006: BDE functions | `scheduledJobs.ts:55` | **DISPROVED** — `bdeEngine.ts` does not exist; no import found | See §12 |

### 2.6 Claims Disproved

The original plan claimed: *"bdeEngine.ts is imported in scheduledJobs.ts lines 55–57."* This is **disproved**. No import of `bdeEngine` or any of the four claimed functions (`computeMarketIntent`, `runBehaviourClustering`, `buildPortfolioCoverageMap`, `runStrategyInteractionAnalysis`) was found in `scheduledJobs.ts` or anywhere in the server codebase. The file `server/bdeEngine.ts` does not exist.

---

## 3. Architectural Conflicts and Resolutions

### Conflict 1 — TypeScript DBN Parser vs Python Client (RESOLVED)

Python service is the production path. The TypeScript parser is retained as a tested fallback, fixture decoder, and development utility.

### Conflict 2 — Candle Construction Ownership (RESOLVED)

Python owns only raw record normalisation and publication. TypeScript owns all candle construction, reconciliation, aggregation, and persistence.

### Conflict 3 — Shadow Mode Disabling TradingView processBar (RESOLVED)

In `DATABENTO_SHADOW`, TradingView continues calling `processBar()` unchanged. Databento records are normalised, persisted, and compared — but cannot trigger any production processing.

### Conflict 4 — Dual `atlas_bar_confirmed` Emitters (RESOLVED)

The Sprint 123 webhook emission is gated by `MARKET_DATA_AUTHORITY === TRADINGVIEW_ONLY`. When authority advances, the canonical router owns this event exclusively.

### Conflict 5 — Fake BDE Stub (RESOLVED)

No fake implementation. `BDE_CAPABILITY_STATUS.md` records the verified absence of each claimed function.

### Conflict 6 — Direct TradingView → liveLearnEngine Path (RESOLVED — Correction 1)

**Blocking contradiction identified at Gate G0 review.** The original plan retained a direct TradingView → `liveLearnEngine` call path alongside `postBarAutomation`. This creates two independent triggers for all post-bar automation, making authority control impossible. **Resolution:** In Sprint 123A.1, the direct call from `nexusRoutes.ts` to `liveLearnEngine` is removed. `postBarAutomation.ts` becomes the single and exclusive owner of `liveLearnEngine`, `onNewBarObservation()`, Behaviour Engine, market-law updates, and all post-bar research hooks. `processBar()` (the execution trigger) is not owned by `postBarAutomation` — it remains in `nexusRoutes.ts` and is controlled separately.

### Conflict 7 — Chart Publishing Canonical Events (RESOLVED — Correction 2)

**Blocking contradiction identified at Gate G0 review.** The dependency diagram implied `AtlasLiveChart.tsx` published to the Atlas Event Bus. This is architecturally incorrect. **Resolution:** The event direction is strictly one-way: canonical services publish to the Atlas Event Bus → SSE transports events to the browser → `AtlasLiveChart.tsx` consumes them. The chart never publishes canonical market events. It is a pure consumer.

### Conflict 8 — Gate G6 Conflated Implementation with Authority Activation (RESOLVED — Correction 3)

**Blocking contradiction identified at Gate G0 review.** Gate G6 required both Sprint 123A.5 implementation completion and `DATABENTO_LEARNING_AUTHORITY` activation in the same gate. These are distinct decisions with different evidence requirements. **Resolution:** Gate G6 certifies Sprint 123A.5 implementation with Learning Authority still disabled. Gate G6A is a separate, optional gate for `DATABENTO_LEARNING_AUTHORITY` activation, requiring additional shadow-validation evidence and Phil's explicit approval. Sprint 123A is complete at Gate G7 regardless of whether G6A is passed.

### Conflict 9 — MNQ1! Claimed as Proven Databento Symbol (RESOLVED — Correction 5)

**Blocking contradiction identified at Gate G0 review.** `MNQ1!` was stated as the Databento continuous symbol without proof. Databento's continuous-symbol naming conventions are not publicly guaranteed and may differ from CME or vendor conventions. **Resolution:** `MNQ1!` is removed as a stated fact. Databento symbology is resolved dynamically. The actual continuous symbol must be proven by an opt-in integration test before Sprint 123A.2 begins. The Contract Mapping document is updated accordingly.

### Conflict 10 — Exactly-Once vs Effectively-Once (RESOLVED)

All claims corrected to "effectively-once" with documented delivery guarantees.

### Conflict 11 — Sprint 123A Too Large (RESOLVED)

Split into five independently releasable sub-sprints with human approval gates.

---

## 4. Authority Model (Corrected)

The `MARKET_DATA_AUTHORITY` environment variable controls the data authority mode. No system may automatically promote itself between modes. Every promotion requires documented validation, explicit gate approval, rollback verification, and human authorisation.

| Mode | TradingView | Databento | processBar Trigger | postBarAutomation Trigger | Default |
|---|---|---|---|---|---|
| `TRADINGVIEW_ONLY` | Production authority | Disabled | TradingView webhook | `postBarAutomation` (via TradingView bar) | **Current** |
| `DATABENTO_SHADOW` | Production authority | Shadow (persist + compare only) | TradingView webhook | `postBarAutomation` (via TradingView bar) | **Target after 123A.3** |
| `DATABENTO_CHART_AUTHORITY` | Production decision authority | Chart + canonical candle store | TradingView webhook | `postBarAutomation` (via TradingView bar) | After G4 gate |
| `DATABENTO_LEARNING_AUTHORITY` | Production decision authority | Learning + research trigger | TradingView webhook | `postBarAutomation` (via Databento canonical bar) | After G6A gate — optional |
| `DATABENTO_DECISION_AUTHORITY` | Disabled | Full authority | Databento canonical bar | `postBarAutomation` (via Databento canonical bar) | Sprint 123B only |

---

## 5. Event Ownership Model (Corrected)

**Canonical direction rule:** Canonical services publish to the Atlas Event Bus. SSE transports events to the browser. `AtlasLiveChart.tsx` consumes events. The chart never publishes canonical market events. SSE is transport only — it must not invent business state. After reconnect, the client must query canonical persisted state before applying realtime updates.

| Event | Owner (Publisher) | Trigger | SSE Channel | Consumer |
|---|---|---|---|---|
| `atlas_market_trade` | Market-data canonical router | Every normalised trade | `atlas:trade` | `AtlasLiveChart.tsx` |
| `atlas_bar_developing` | Market-data canonical router | Every trade update (rate-limited) | `atlas:bar_developing` | `AtlasLiveChart.tsx` |
| `atlas_bar_confirmed` | Market-data canonical router | Bar boundary | `atlas:bar_confirmed` | `AtlasLiveChart.tsx`, `postBarAutomation` |
| `atlas_feed_health` | Feed health service | Feed state transition | `atlas:feed_health` | `AtlasLiveChart.tsx` |
| `atlas_contract_roll` | Contract roll manager | Contract mapping change | `atlas:contract_roll` | `AtlasLiveChart.tsx` |
| `atlas_strategy_proposal` | Strategy service | ADE candidate selection | `atlas:strategy_proposal` | Observatory UI |
| `atlas_decision_recorded` | Decision service | ARI/TVL decision | `atlas:decision` | Observatory UI |
| `atlas_trade_opened` | Trade lifecycle service | Paper trade opened | `atlas:trade_opened` | Observatory UI |
| `atlas_trade_updated` | Trade lifecycle service | MFE/MAE update | `atlas:trade_updated` | Observatory UI |
| `atlas_trade_closed` | Trade lifecycle service | Paper trade closed | `atlas:trade_closed` | Observatory UI |
| `atlas_behaviour_detected` | Behaviour Engine | New instance detected | `atlas:behaviour` | Observatory UI |
| `atlas_behaviour_updated` | Behaviour Engine | Instance updated | `atlas:behaviour` | Observatory UI |
| `atlas_behaviour_expired` | Behaviour Engine | Instance expired | `atlas:behaviour` | Observatory UI |

---

## 6. postBarAutomation Ownership Model (Correction 1)

`postBarAutomation.ts` is the **single and exclusive owner** of all post-bar autonomous processing. No other module may call `liveLearnEngine`, `onNewBarObservation()`, Behaviour Engine, market-law updates, or post-bar research hooks directly from a bar event. The direct call from `nexusRoutes.ts` to `liveLearnEngine` is removed in Sprint 123A.1.

**What `postBarAutomation` owns:**

- `liveLearnEngine(bar)` — candle certification, gap detection, market-law updates, legacy behaviour classification
- `onNewBarObservation(bar)` — DARWIN research trigger (G-001 fix)
- `behaviourEngine.processBar(bar)` — canonical 12-classifier behaviour detection
- Any future post-bar research hooks

**What `postBarAutomation` does NOT own:**

- `processBar()` — the execution trigger. This remains in `nexusRoutes.ts` and is controlled separately by the production execution path.
- `tpDispatch` — the trade persistence trigger. Remains in `nexusRoutes.ts`.

**Authority rules for `postBarAutomation`:**

| Authority Mode | Trigger Source | Notes |
|---|---|---|
| `TRADINGVIEW_ONLY` | TradingView bar (from `nexusRoutes.ts`) | Only source |
| `DATABENTO_SHADOW` | TradingView bar | Databento bars do not trigger `postBarAutomation` |
| `DATABENTO_CHART_AUTHORITY` | TradingView bar | Databento bars do not trigger `postBarAutomation` |
| `DATABENTO_LEARNING_AUTHORITY` | Databento canonical bar | TradingView post-bar trigger disabled |
| `DATABENTO_DECISION_AUTHORITY` | Databento canonical bar | Sprint 123B only |

---

## 7. Effective-Once Processing Model

Atlas uses at-least-once delivery with idempotent consumers. The term "exactly-once" is not used. See `ATLAS_EFFECTIVELY_ONCE_PROCESSING.md` for the full specification.

**Canonical Market Event ID** fields (minimum):

| Field | Type | Example |
|---|---|---|
| `source` | string | `databento` |
| `dataset` | string | `GLBX.MDP3` |
| `rawSymbol` | string | `MNQM5` (resolved dynamically — see §8) |
| `instrumentId` | number | `12345` |
| `interval` | string | `5m` |
| `barOpenTs` | number | `1750000000000` |
| `revision` | number | `0` |
| `mappingVersion` | number | `1` |

**Consumer Idempotency Key** pattern: `{consumerName}_v{consumerVersion}:{canonicalEventId}`

---

## 8. Databento Contract Resolution and Symbology (Correction 5)

**`MNQ1!` is not stated as a proven Databento continuous symbol.** Databento's continuous-symbol naming conventions must be proven by an opt-in integration test before Sprint 123A.2 begins. The test must confirm the actual continuous symbol name, dataset, and schema for the MNQ front-month contract.

The Contract Roll Manager uses Databento `SymbolMappingMsg` and `InstrumentDefMsg` records as the primary contract-resolution source. All `rawSymbol` values in canonical event IDs are populated from dynamically resolved Databento symbol-mapping records, not from hardcoded strings. See `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md` for the full specification.

**Opt-in integration test required before 123A.2:** `TEST-INT-001 — Databento Symbol Resolution` must pass. This test connects to Databento with `DATABENTO_INTEGRATION_TESTS=true`, subscribes to the MNQ front-month contract, confirms the actual continuous symbol name, and records it in the test evidence log.

---

## 9. No-Trade-Minute and Gap-Recovery Policy

Three distinct cases govern missing bars. See `DATABENTO_NO_TRADE_AND_GAP_POLICY.md` for the full specification. The key rule: **no `UNRESOLVED` minute may be silently aggregated into a 5-minute bar.** A 5-minute bar with `containsUnresolvedMinutes = true` must not be dispatched to any production consumer.

---

## 10. Behaviour-System Migration Model

Two parallel behaviour tracking systems currently exist and must remain distinguishable throughout the migration. See `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md` for the full specification. Neither system may influence live execution during the migration.

---

## 11. Bar Table Ownership Model (Correction 8)

Three bar tables exist. Each has a single owner and a distinct purpose. They are not three copies of the same data.

| Table | Owner | Content | Production Use |
|---|---|---|---|
| `atlas_bars_1m` | Bar Builder | 1-minute bars built from Databento trade records, reconciled against official `ohlcv-1m`. Contains `LIVE_CONFIRMED`, `SYNTHETIC_NO_TRADE_BAR`, `UNRESOLVED`, `RECOVERED` bar types. | Databento data store — feeds 5-min aggregator |
| `atlas_bars_5m` | Five-Min Aggregator | 5-minute bars aggregated from 5 confirmed 1-minute bars. Contains `CANONICAL_CONFIRMED`, `CONTAINS_SYNTHETIC`, `CONTAINS_UNRESOLVED`, `RECOVERED` bar types. | Databento data store — feeds canonical router |
| `atlas_canonical_bars` | Canonical Router | The single authoritative confirmed bar record for each 5-minute interval, regardless of source. In `TRADINGVIEW_ONLY` mode, populated from TradingView webhook bars. In `DATABENTO_SHADOW` and above, populated from `atlas_bars_5m` after parity certification. Contains the bar that was actually dispatched to production consumers. | **The source of truth for all downstream consumers** |

**The rule:** `atlas_canonical_bars` is the only table that production consumers (strategies, DARWIN, Behaviour Engine, parity monitor) read. `atlas_bars_1m` and `atlas_bars_5m` are internal Databento pipeline tables. No consumer reads from `atlas_bars_1m` or `atlas_bars_5m` directly.

---

## 12. BDE Capability Status

`computeMarketIntent()`, `runBehaviourClustering()`, `buildPortfolioCoverageMap()`, and `runStrategyInteractionAnalysis()` were not found anywhere in the codebase. `server/bdeEngine.ts` does not exist. No fake implementation will be created. See `BDE_CAPABILITY_STATUS.md`.

---

## 13. Rollback Policy (Correction 9)

The rollback procedure for any sub-sprint is:

1. Set `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` in the deployment environment.
2. Disable `DATABENTO_LIVE_ENABLED` (set to `false`).
3. The bridge server stops accepting connections. The Python service is stopped.
4. All new tables (`atlas_bars_1m`, `atlas_bars_5m`, `atlas_canonical_bars`, `atlas_contract_rolls`, `atlas_parity_records`, `atlas_chart_annotations`, `atlas_consumer_processing_ledger`) are **preserved**. They contain validation evidence and must not be dropped.
5. The TradingView execution path resumes immediately with no data loss.

**Table removal is only permitted for an explicitly approved destructive development reset**, defined as: Phil explicitly approves in writing, the environment is confirmed as a development environment (not production), and the purpose is to restart a failed sub-sprint from a clean state. Destructive resets are never performed on production.

---

## 14. Deployment Topology

See `DATABENTO_DEPLOYMENT_TOPOLOGY.md` for diagrams. The bridge binds to `127.0.0.1:7890` and is never exposed externally.

---

## 15. Sub-Sprint Sequence (Corrected)

### Sprint 123A.1 — Foundation and Autonomy Remediation

**Branch:** `sprint/123a-1-foundation`  
**No live Databento connection. No production authority change.**

Deliverables:
- `server/market-data/config.ts` — `MARKET_DATA_AUTHORITY` feature flag system
- `drizzle/schema.ts` additions — `atlas_bars_1m`, `atlas_bars_5m`, `atlas_canonical_bars`, `atlas_contract_rolls`, `atlas_parity_records`, `atlas_chart_annotations`, `atlas_consumer_processing_ledger`
- `shared/types/canonical-events.ts` — `CanonicalBarConfirmed`, `AtlasContractRoll`, `AtlasBarDeveloping` (1-min), `AtlasBarConfirmed` (1-min)
- `server/automation/postBarAutomation.ts` — single post-bar automation owner
- Removal of direct `liveLearnEngine` call from `nexusRoutes.ts` (replaced by `postBarAutomation`)
- G-001 fix: `onNewBarObservation()` wired via `postBarAutomation`
- G-002 fix: `/api/scheduled/monthly-review` wired to `runMonthlyAudit()`

Acceptance criteria: TypeScript compiles, migrations apply, `postBarAutomation` is the sole caller of `liveLearnEngine` and `onNewBarObservation()`, no direct `liveLearnEngine` call remains in `nexusRoutes.ts`, monthly review returns real output, no production execution path changed.

### Sprint 123A.2 — Databento Adapter and Private Bridge

**Branch:** `sprint/123a-2-databento-adapter`  
**Shadow mode only. No canonical bars drive Atlas.**

Pre-requisite: `TEST-INT-001 — Databento Symbol Resolution` opt-in integration test must pass and the actual continuous symbol must be recorded before this sprint begins.

Deliverables:
- `services/databento-feed/` — Python adapter service
- `server/market-data/bridge-server.ts` — authenticated WebSocket bridge receiver
- Extended `event-normalizer.ts` — `trades` schema support
- Bridge health endpoint
- Fixture-based unit tests for all Python modules
- Secret scanning tests

### Sprint 123A.3 — Canonical Bar and Contract Services

**Branch:** `sprint/123a-3-canonical-bars`  
**Shadow mode only.**

Deliverables:
- `server/market-data/bar-builder.ts` — 1-min developing/confirmed bar builder
- `server/market-data/five-min-aggregator.ts` — 5-min aggregation
- `server/market-data/contract-roll-manager.ts` — dynamic symbol resolution + roll detection
- `server/market-data/canonical-router.ts` — shadow mode: persist to `atlas_bars_1m`, `atlas_bars_5m`, compare against TradingView bars in `atlas_canonical_bars`
- `server/market-data/tick-storage.ts` — async tick persistence
- No-trade-minute policy implementation
- Effective-once consumer ledger

### Sprint 123A.4 — Parity and Chart Authority

**Branch:** `sprint/123a-4-parity-chart`  
**TradingView remains decision and learning authority.**

Deliverables:
- `server/market-data/parity-monitor.ts` — per `DATABENTO_PARITY_CERTIFICATION_SPEC.md`
- Daily parity report
- `client/src/components/AtlasLiveChart.tsx` — pure SSE consumer (never publishes to event bus)
- All trade lifecycle SSE events
- Chart authority gate documentation

### Sprint 123A.5 — Learning Authority Implementation

**Branch:** `sprint/123a-5-learning-authority`  
**Implements learning authority capability. Activation requires separate Gate G6A.**

Deliverables:
- `postBarAutomation.ts` updated for `DATABENTO_LEARNING_AUTHORITY` mode
- Behaviour Engine canonical Databento bar input
- `liveLearnEngine` canonical trigger from Databento
- DARWIN canonical trigger from Databento
- Duplicate-learning protection
- `DATABENTO_LEARNING_AUTHORITY` activation procedure documented

Acceptance criteria: Implementation certified at Gate G6. `DATABENTO_LEARNING_AUTHORITY` remains disabled. Activation only at Gate G6A with Phil's explicit approval.

---

## 16. Sub-Sprint Dependencies

```
123A.1 (Foundation) → 123A.2 (Adapter) → 123A.3 (Canonical Bars)
                                                    ↓
                                          123A.4 (Parity + Chart)
                                                    ↓
                                          123A.5 (Learning Authority Implementation)
                                                    ↓
                                          [Gate G6 — Implementation Certified]
                                                    ↓
                                          [Gate G6A — Optional: Learning Authority Activation]
                                                    ↓
                                          [Gate G7 — Sprint 123A Complete]
                                                    ↓
                                          123B (Decision Authority — separate approval)
```

Sprint 123A is complete at Gate G7 regardless of whether Gate G6A is passed.

---

## 17. Database Migration Sequence

All migrations are additive (new tables only) through 123A.4. No existing tables are modified.

| Sub-Sprint | Migration | Type | Risk |
|---|---|---|---|
| 123A.1 | Add 7 new tables | Additive | LOW |
| 123A.2 | None | — | NONE |
| 123A.3 | None | — | NONE |
| 123A.4 | `atlas_chart_annotations` inserts | Additive | LOW |
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
| `DATABENTO_HISTORICAL_ENABLED` | `false` | Set in 123A.3 |
| `BRIDGE_AUTH_TOKEN` | Generated | Set in 123A.2 |
| `LEGACY_BEHAVIOUR_ENABLED` | `true` | Do not change until migration certified |
| `DATABENTO_INTEGRATION_TESTS` | `false` | Opt-in only |

---

## 19. Rollback Strategy

See §13 for the full rollback policy. Summary: set `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY`, disable `DATABENTO_LIVE_ENABLED`, stop Python service and bridge. All new tables are preserved. Production execution resumes immediately.

---

## 20. Test Strategy

See `SPRINT_123A_TEST_MANIFEST.md` for the full test manifest. Normal CI uses fixtures. No paid Databento connection is required. Live integration tests are opt-in via `DATABENTO_INTEGRATION_TESTS=true`.

---

## 21. Observability Strategy

Every data-quality decision must be persisted. Feed health state transitions are written to `system_health_events`. Parity failures are written to `atlas_parity_records`. Consumer processing records are written to `atlas_consumer_processing_ledger`. The Observatory dashboard exposes feed health, parity statistics, and consumer ledger state.

---

## 22. Security Strategy

`DATABENTO_API_KEY` must never appear in logs, SSE payloads, database rows, error responses, or browser bundles. Secret scanning tests are required in 123A.2. The bridge is private (`127.0.0.1`). Bridge authentication uses `BRIDGE_AUTH_TOKEN`. The frontend never connects to Databento directly.

---

## 23. Risk Register

See `SPRINT_123A_RISK_REGISTER.md` for the full risk register with corrected numeric scores.

---

## 24. Human Approval Gates (Corrected)

| Gate | Required Before | Approver | Notes |
|---|---|---|---|
| G0 | 123A.1 implementation begins | Phil | **PENDING** |
| G1 | 123A.2 branch begins | Phil | |
| G2 | 123A.3 branch begins | Phil | |
| G3 | 123A.4 branch begins | Phil | |
| G4 | `DATABENTO_CHART_AUTHORITY` activation | Phil | All requirements in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` Revision 2 satisfied |
| G5 | 123A.5 branch begins | Phil | |
| G6 | Sprint 123A.5 implementation certified | Phil | Learning Authority still disabled |
| G6A | `DATABENTO_LEARNING_AUTHORITY` activation | Phil | Optional; separate from G6; requires shadow-validation evidence |
| G7 | Sprint 123B planning begins | Phil | Sprint 123A complete regardless of G6A status |

---

## 25. Definition of Done (Corrected)

Sprint 123A is complete when all of the following are true:

- All five sub-sprints are merged to `main`
- `DATABENTO_SHADOW` mode is active in production (or higher authority mode)
- All requirements in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` Revision 2 satisfied (Section A: 1-min feed quality; Section B: 5-min cross-feed parity)
- `AtlasLiveChart.tsx` passes Chart Authority gate (Gate G4)
- All tests in `SPRINT_123A_TEST_MANIFEST.md` pass
- No `DATABENTO_API_KEY` in any log, SSE, DB row, or browser bundle
- All 14 supporting architecture documents are committed and cross-linked
- `SPRINT_123A_DATABENTO_LIVE_VALIDATION.md` report is complete
- Phil has approved Sprint 123A as complete at Gate G7
- `DATABENTO_LEARNING_AUTHORITY` may or may not be activated (Gate G6A is optional)
- `DATABENTO_DECISION_AUTHORITY` is NOT activated (reserved for Sprint 123B)
- No production execution path was changed without explicit gate approval
- `postBarAutomation.ts` is the sole caller of `liveLearnEngine` and `onNewBarObservation()`
- `AtlasLiveChart.tsx` never publishes to the Atlas Event Bus

---

## 26. Supporting Documents

All supporting documents are cross-linked. Every document references this plan as its parent.

| Document | Correction Applied | Status |
|---|---|---|
| `ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md` | Correction 1 (postBarAutomation ownership) | Updated |
| `ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md` | Correction 2 (chart event direction) | Updated |
| `ATLAS_EFFECTIVELY_ONCE_PROCESSING.md` | — | Current |
| `BDE_CAPABILITY_STATUS.md` | — | Current |
| `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md` | — | Current |
| `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md` | Correction 5 (MNQ1! removed) | Updated |
| `DATABENTO_DEPLOYMENT_TOPOLOGY.md` | Correction 2 (chart direction) | Updated |
| `DATABENTO_NO_TRADE_AND_GAP_POLICY.md` | — | Current |
| `DATABENTO_PARITY_CERTIFICATION_SPEC.md` | Correction 7 (new document) | New |
| `DATABENTO_PYTHON_FEED_SERVICE_SPEC.md` | — | Current |
| `SPRINT_123A_AMENDMENT_REPORT.md` | Corrections 1–12 recorded | Updated |
| `SPRINT_123A_DEPENDENCY_DIAGRAM.md` | Corrections 3, 4, 5 (gate split, G7, symbology) | Updated |
| `SPRINT_123A_GATE_MATRIX.md` | Corrections 3, 4, 9 (gate split, G7, rollback) | Updated |
| `SPRINT_123A_RISK_REGISTER.md` | Correction 6 (numeric recalculation) | Updated |
| `SPRINT_123A_TEST_MANIFEST.md` | Correction 10 (new document) | New |
