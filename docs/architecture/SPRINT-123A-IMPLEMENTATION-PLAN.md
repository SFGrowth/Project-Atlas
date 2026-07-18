# Sprint 123A — Implementation Plan
**Based on:** Full repository inspection completed 2026-07-18  
**Status:** READY FOR EXECUTION  
**Authority:** Source code is truth. Documentation describes intent.

---

## Repository State Summary

### What Already Exists (Do Not Rebuild)

| Component | File | State |
|---|---|---|
| DBN binary parser | `server/market-data/dbn-parser.ts` | Complete, tested |
| DataBento TCP client | `server/market-data/databento-client.ts` | Complete, **never started** |
| Event normaliser (MBP-1 → AtlasTradeEvent) | `server/market-data/event-normalizer.ts` | Complete |
| Symbol registry | `server/market-data/symbol-registry.ts` | Complete |
| Event bus (in-process EventEmitter) | `server/market-data/event-bus.ts` | Complete |
| Feed health state machine | `server/market-data/feed-health.ts` | Complete |
| Canonical market event types | `shared/types/market-events.ts` | Complete |
| Architecture design docs (12 ADRs) | `docs/architecture/market-data/` | Complete |
| 12-classifier Behaviour Engine | `server/behaviour-engine/` | Complete, shadow mode |
| processBar() pipeline | `server/monitor/paperTradeEngine.ts` | Complete, production |
| TradingView webhook ingestion | `server/nexusRoutes.ts` | Complete, production |
| Sprint 123 SSE events | `server/nexusRoutes.ts` | Complete (this session) |
| LiveChart.tsx | `client/src/components/LiveChart.tsx` | Complete (this session) |

### What Does NOT Exist (Must Build)

| Component | Required By |
|---|---|
| Bar builder (1-min + 5-min) | Spec §DEVELOPING AND CONFIRMED CANDLES |
| Canonical Market Data Router | Spec §EXACTLY-ONCE BAR PROCESSING |
| Contract Resolver + Roll Manager | Spec §MNQ CONTRACT RESOLUTION |
| Python feed service | Spec §DATABENTO INTEGRATION ARCHITECTURE |
| WebSocket bridge (Python → TypeScript) | Spec §DATABENTO INTEGRATION ARCHITECTURE |
| Feature flag system (MARKET_DATA_AUTHORITY) | Spec §FAIL-SAFE AND EXECUTION POLICY |
| Dual-feed parity service | Spec §PARITY AND SHADOW VALIDATION |
| AtlasLiveChart.tsx (full version) | Spec §LIVE CHART (replaces LiveChart.tsx) |
| Trade marker overlay | Spec §TRADE MARKERS |
| DB tables: atlas_bars_1m, atlas_bars_5m, atlas_canonical_bars, atlas_contract_rolls, atlas_parity_records | Spec §DATA RETENTION |
| Secret scanning tests | Spec §DATABENTO CONFIGURATION |
| G-001 fix: onNewBarObservation() wired | `darwinAutonomous.ts:206` |
| G-002 fix: monthly review endpoint | `scheduledJobs.ts:220` stub |
| G-003 fix: behaviour system adapter | Legacy 7 vs canonical 12 |
| G-006 fix: BDE functions wired or disabled | bdeEngine functions not found |

### Critical Architectural Decision

The spec says: *"Use official Databento Python client. Do not build a custom DBN binary decoder in TypeScript unless the repository already contains a tested and supported implementation."*

**The repository DOES contain a tested TypeScript DBN decoder** (`dbn-parser.ts` with full test coverage in `market-data.test.ts`). However, the spec's preference for the Python client is explicit and the rationale is sound: the official Databento Python client handles protocol versioning, reconnection, and schema changes automatically.

**Decision:** Build the Python feed service as specified. The existing TypeScript DBN parser remains as a fallback and for testing, but the production path uses the Python service.

**Transport:** The existing `AtlasEventBus` (in-process EventEmitter) cannot bridge Python → TypeScript. A private authenticated WebSocket bridge will be used as specified. No Redis/Kafka/NATS.

---

## Implementation Sequence

### Phase 1 — Foundation (Database + Feature Flags + Canonical Contracts)

**Objective:** Lay the database and type foundation before any live connection.

**Files to create/modify:**

1. `drizzle/schema.ts` — Add tables:
   - `atlas_bars_1m` — confirmed 1-minute bars (unique key: source + instrumentId + barOpenTs)
   - `atlas_bars_5m` — confirmed 5-minute bars (unique key: source + instrumentId + barOpenTs)
   - `atlas_canonical_bars` — the single authority table (unique key: instrumentId + interval + barOpenTs + revision)
   - `atlas_contract_rolls` — contract roll history
   - `atlas_parity_records` — dual-feed parity comparison records
   - `atlas_chart_annotations` — trade lifecycle markers for chart

2. `server/market-data/config.ts` — Feature flag system:
   - `MARKET_DATA_AUTHORITY` enum: `TRADINGVIEW_ONLY | DATABENTO_SHADOW | DATABENTO_CHART_AUTHORITY | DATABENTO_LEARNING_AUTHORITY | DATABENTO_DECISION_AUTHORITY`
   - Default: `TRADINGVIEW_ONLY` (current), target after sprint: `DATABENTO_SHADOW`
   - Helper: `isDatabentoAuthoritativeFor(domain: 'chart' | 'learning' | 'decision')`

3. `shared/types/canonical-events.ts` — Sprint 123A canonical event contracts:
   - `AtlasMarketTrade` (extended from existing `AtlasTradeEvent`)
   - `AtlasBarDeveloping` (1-min developing)
   - `AtlasBarConfirmed` (1-min confirmed)
   - `AtlasFeedHealth` (extended from existing `AtlasFeedHealthEvent`)
   - `AtlasContractRoll`
   - `CanonicalBarConfirmed` (the single trigger event for all downstream processing)

4. `server/market-data/canonical-router.ts` — Canonical Market Data Router:
   - Receives `CanonicalBarConfirmed` events
   - Enforces idempotency via DB unique constraint
   - Dispatches to: atlas_memory persistence, certifyCandle, gap detection, market law updates, Behaviour Engine, liveLearnEngine, DARWIN, SSE fanout
   - Replaces the scattered `processBar()` calls in `nexusRoutes.ts`

**Acceptance:** TypeScript compiles, migrations apply, no live connection.

---

### Phase 2 — Python Feed Service + Bridge

**Objective:** Build the Python Databento service and WebSocket bridge.

**Files to create:**

1. `services/databento-feed/` directory:
   - `requirements.txt` — `databento`, `websockets`, `python-dotenv`
   - `main.py` — supervised entry point with signal handling
   - `feed_client.py` — Databento live client (trades + ohlcv-1m + definition)
   - `bar_builder.py` — 1-min developing/confirmed candle builder from trades
   - `five_min_aggregator.py` — 5-min bar from 5 confirmed 1-min bars
   - `contract_resolver.py` — MNQ contract resolution and roll detection
   - `bridge_publisher.py` — authenticated WebSocket publisher to Atlas TypeScript server
   - `config.py` — env var loading (DATABENTO_API_KEY never logged)
   - `health.py` — feed health state machine (mirrors TypeScript version)
   - `tests/` — unit tests for all components

2. `server/market-data/bridge-server.ts` — WebSocket bridge receiver:
   - Binds to `127.0.0.1:7890` (private only)
   - Authenticates with `BRIDGE_AUTH_TOKEN`
   - Receives normalised events from Python service
   - Publishes to `atlasEventBus`
   - Bounded queue with backpressure
   - Health endpoint

3. `server/_core/index.ts` — Start bridge server and (when `DATABENTO_SHADOW` mode) start Python service supervisor

**Key design constraints:**
- Python service never connects to the database directly
- Python service never reads or writes to `atlas_memory`
- Python service only publishes normalised events to the bridge
- Bridge server only receives and forwards — no business logic
- DATABENTO_API_KEY never appears in logs, SSE, or error responses

---

### Phase 3 — Bar Builder + Contract Roll Manager

**Objective:** Build the TypeScript-side bar processing pipeline.

**Files to create:**

1. `server/market-data/bar-builder.ts` — 1-min bar builder:
   - Subscribes to `atlasEventBus` TRADE events
   - Maintains `DevelopingBar` state per symbol
   - Emits `AtlasBarDeveloping` on every trade (rate-limited to 1/sec per symbol)
   - Emits `AtlasBarConfirmed` on bar boundary
   - Handles DST, CME session boundaries, contract rolls
   - Reconciles against Databento ohlcv-1m records

2. `server/market-data/five-min-aggregator.ts` — 5-min aggregator:
   - Subscribes to `AtlasBarConfirmed` (1-min) events
   - Aggregates exactly 5 confirmed 1-min bars
   - Emits `CanonicalBarConfirmed` (5-min) — the trigger for all downstream processing
   - Never emits a partial 5-min bar
   - Handles late-bar tolerance (configurable, default 2s)

3. `server/market-data/contract-roll-manager.ts`:
   - Resolves active MNQ contract at startup and reconnect
   - Monitors for roll signals (volume crossover, definition updates)
   - Emits `AtlasContractRoll` event
   - Persists every mapping change to `atlas_contract_rolls`
   - Supports overlap period
   - Deterministic cutover

4. `server/market-data/tick-storage.ts`:
   - Async write of trade events to `atlas_ticks` (if retention policy requires)
   - Non-blocking — never on the socket read loop

---

### Phase 4 — Canonical Router Wiring + Idempotency

**Objective:** Wire `CanonicalBarConfirmed` as the single trigger for all market-derived processing.

**Modify:**

1. `server/market-data/canonical-router.ts` — Wire all consumers:
   ```
   CanonicalBarConfirmed
     → insertAtlasMemory() (idempotent, unique constraint)
     → certifyCandle()
     → detectAndLogGap()
     → updateMarketLawsFromBar()
     → behaviourEngine.processBar() (shadow mode)
     → liveLearnEngine.processBar() (when LEARNING_AUTHORITY)
     → onNewBarObservation() (G-001 fix — exactly once)
     → broadcastSSE('atlas_bar_confirmed', ...)
   ```

2. `server/nexusRoutes.ts` — Add idempotency guard:
   - TradingView webhook continues to call `processBar()` when `MARKET_DATA_AUTHORITY === TRADINGVIEW_ONLY`
   - When `DATABENTO_SHADOW` or higher: TradingView webhook writes to `atlas_memory` but does NOT call `processBar()` — that is now owned by `CanonicalBarConfirmed`
   - Dual-feed: both write to parity table, only authority triggers processing

3. G-001 fix — `server/liveLearnEngine.ts`:
   - Add `setImmediate(() => onNewBarObservation(bar.bar_time))` after processBar completes
   - Wrapped in try/catch, failure written to `system_health_events`
   - Idempotency key: `darwin_obs_${bar.bar_time}`

---

### Phase 5 — AtlasLiveChart.tsx (Full Implementation)

**Objective:** Replace `LiveChart.tsx` with the full `AtlasLiveChart.tsx` per spec.

**File:** `client/src/components/AtlasLiveChart.tsx`

**Features:**
- 1-min and 5-min candle toggle
- Historical seed via `nexus.getRecentBars` (extended to support interval param)
- Realtime developing candle via `atlas_bar_developing` SSE
- Confirmed candle replacement via `atlas_bar_confirmed` SSE
- Volume pane
- Scroll-to-realtime
- Active raw contract display
- Feed source + health badge
- Delayed/offline warning overlay
- Contract-roll marker
- Configurable visible range (default: 200 bars)
- Trade lifecycle markers (proposal → fill → close) from `atlas_strategy_proposal`, `atlas_trade_opened`, `atlas_trade_closed` SSE events
- Incremental series update only — never full series replacement

**Trade marker SSE events to add to `nexusRoutes.ts`:**
- `atlas_strategy_proposal` — when ADE selects a candidate
- `atlas_decision_recorded` — when ARI/TVL decision is recorded
- `atlas_trade_opened` — when paper_trade is opened
- `atlas_trade_updated` — on MFE/MAE update
- `atlas_trade_closed` — when paper_trade is closed
- `atlas_behaviour_detected` — from Behaviour Engine
- `atlas_contract_roll` — from Contract Roll Manager

---

### Phase 6 — Autonomy Gap Remediation

**G-001 — DARWIN Per-Bar Trigger** (covered in Phase 4)

**G-002 — Monthly Review Dead Endpoint:**
- `server/scheduledJobs.ts` line 220: Replace TODO stub with real `runMonthlyAudit()` call
- `runMonthlyAudit()` already exists in `darwinAutonomous.ts:572`
- Wire the `/api/scheduled/monthly-review` endpoint to call `runMonthlyAudit()`
- Remove the competing `/api/scheduled/darwin-monthly` endpoint or unify them
- Add idempotency key: `monthly_audit_${year}_${month}`

**G-003 — Behaviour System Unification:**
- Create `server/behaviour-engine/legacy-adapter.ts`:
  - Maps legacy 7-behaviour output to canonical 12-classifier format
  - Produces shadow comparison report (legacy vs canonical, agreement/disagreement)
  - Deprecation flag: `LEGACY_BEHAVIOUR_ENABLED=true` (default, until certified)
- One canonical persistence model: canonical 12-classifier writes to `behaviour_library`
- Legacy system continues to write to existing table with `source='legacy'` tag
- Migration plan documented

**G-006 — BDE Functions:**
- `computeMarketIntent`, `runBehaviourClustering`, `buildPortfolioCoverageMap`, `runStrategyInteractionAnalysis` — not found in codebase
- These are referenced in the verification doc but do not exist as TypeScript functions
- Action: Mark explicitly disabled in `server/bdeEngine.ts` (create file as stub with documented reason)
- Do not invent implementations

---

### Phase 7 — Dual-Feed Parity Service

**File:** `server/market-data/parity-monitor.ts`

- Subscribes to both TradingView bars (from `atlas_memory`) and Databento bars (from `atlas_bars_5m`)
- Compares over identical 5-min intervals
- Stores results in `atlas_parity_records`
- Generates daily parity report (added to DARWIN daily report)
- Metrics: timestamp agreement, OHLCV tick differences, volume difference, session classification

---

### Phase 8 — Tests + Secret Scanning + Documentation

**Tests:**
- Unit tests for all new market-data components
- Databento fixture-based integration tests (no live connection required)
- Failure injection tests (disconnect, duplicate, out-of-order, stale contract)
- Secret scanning test: verify DATABENTO_API_KEY pattern never appears in SSE/logs/DB

**Documentation to create:**
- `docs/architecture/DATABENTO_CANONICAL_MARKET_DATA_ARCHITECTURE.md`
- `docs/architecture/ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md`
- `docs/architecture/ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md`
- `docs/runbooks/DATABENTO_LIVE_FEED_RUNBOOK.md`
- `docs/runbooks/DATABENTO_FEED_FAILURE_AND_RECOVERY.md`
- `docs/runbooks/DATABENTO_CONTRACT_ROLL_RUNBOOK.md`
- `docs/reports/SPRINT-123A-DATABENTO-LIVE-VALIDATION.md`
- `docs/reports/ATLAS_AUTONOMY_GAP_REMEDIATION_REPORT.md`

---

## Architectural Conflicts to Flag

**Conflict 1 — Existing TypeScript DBN parser vs Python client**
The repo has a working TypeScript DBN parser. The spec prefers the Python client. Resolution: Python service is the production path. TypeScript parser is retained for testing and as documented fallback.

**Conflict 2 — Sprint 123 LiveChart.tsx vs Sprint 123A AtlasLiveChart.tsx**
Sprint 123 (this session) already created `LiveChart.tsx` and wired it into `Home.tsx`. Sprint 123A requires `AtlasLiveChart.tsx` with full trade markers and Databento integration. Resolution: Build `AtlasLiveChart.tsx` as the full implementation. `LiveChart.tsx` remains as the TradingView-only fallback until `AtlasLiveChart.tsx` passes Gate 2.

**Conflict 3 — processBar() scattered vs canonical router**
Currently `processBar()` is called directly from `nexusRoutes.ts` on every TradingView webhook. The canonical router must become the single call site. The migration must be staged to avoid breaking production execution. Resolution: Feature flag gates the migration. `TRADINGVIEW_ONLY` mode preserves current behaviour exactly.

**Conflict 4 — atlas_bar_confirmed SSE already emitted from nexusRoutes.ts (Sprint 123)**
Sprint 123 added `atlas_bar_confirmed` emission directly from the TradingView webhook path. Sprint 123A spec says: "Do not emit confirmed bars from both TradingView and Databento." Resolution: When `DATABENTO_SHADOW` mode activates, the canonical router owns `atlas_bar_confirmed` emission. The Sprint 123 webhook emission is gated by `MARKET_DATA_AUTHORITY === TRADINGVIEW_ONLY`.

---

## Environment Variables Required

| Variable | Purpose | Default |
|---|---|---|
| `DATABENTO_API_KEY` | Databento authentication | (set via secrets) |
| `DATABENTO_DATASET` | Dataset identifier | `GLBX.MDP3` |
| `DATABENTO_PARENT_SYMBOL` | Parent symbol | `MNQ` |
| `DATABENTO_LIVE_ENABLED` | Enable live connection | `false` |
| `DATABENTO_HISTORICAL_ENABLED` | Enable historical seed | `false` |
| `DATABENTO_TRADES_SCHEMA` | Live schema | `mbp-1` |
| `DATABENTO_BAR_SCHEMA` | Bar schema | `ohlcv-1m` |
| `DATABENTO_REPLAY_ENABLED` | Enable replay on reconnect | `true` |
| `DATABENTO_FEED_MODE` | Feed mode | `shadow` |
| `MARKET_DATA_AUTHORITY` | Authority mode | `TRADINGVIEW_ONLY` |
| `MARKET_DATA_SHADOW_COMPARE_ENABLED` | Enable parity comparison | `false` |
| `BRIDGE_AUTH_TOKEN` | Python→TypeScript bridge auth | (generated) |

---

## Execution Order

1. Phase 1 — DB schema + feature flags + canonical types (no live connection, safe)
2. Phase 6 — G-001, G-002, G-003, G-006 gap remediation (independent of Databento)
3. Phase 2 — Python service + bridge (shadow mode, not started by default)
4. Phase 3 — Bar builder + contract roll manager
5. Phase 4 — Canonical router wiring + idempotency
6. Phase 5 — AtlasLiveChart.tsx
7. Phase 7 — Parity service
8. Phase 8 — Tests + docs

**Phases 1 and 6 can proceed immediately and safely. They do not touch the production execution path.**
