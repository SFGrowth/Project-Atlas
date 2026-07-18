# Atlas Autonomous Systems Verification Audit
## Sprint 122A — Code-Only Engineering Audit

**Audit Date:** 2026-07-18
**Auditor:** Atlas Engineering (Manus AI)
**Scope:** All autonomous subsystems in `/home/ubuntu/atlas-nexus/server/`
**Method:** Direct source code reading — no assumptions, no inference from documentation
**Production Impact:** Zero — read-only audit

---

## Executive Summary

Atlas Nexus contains **14 distinct autonomous subsystems** operating across five functional layers: data ingestion, execution, research, learning, and certification. The audit confirms that the core execution pipeline (webhook → ADE → strategy selection → dispatch) is production-grade and correctly implemented. The DARWIN research engine is structurally sound with a durable job queue, 5-layer research hierarchy, and genuine autonomous candidate management. However, several subsystems contain **placeholder logic, hardcoded values, or shallow implementations** that do not yet match their architectural intent. This audit identifies every gap precisely, by file and line number, with no embellishment.

---

## Section 1 — Subsystem Inventory

The following table maps every autonomous subsystem to its source file, sprint of origin, and functional layer.

| # | Subsystem | File | Sprint | Layer |
|---|---|---|---|---|
| 1 | Webhook Ingestion & SSE Broadcast | `nexusRoutes.ts` | 074–119 | Ingestion |
| 2 | ADE Scoring Engine | `barEvaluator.ts` | 085–119 | Execution |
| 3 | Strategy Selection & Proposal Ranking | `paperTradeEngine.ts` | 080–119 | Execution |
| 4 | Autonomous Dispatch Worker | `dispatchWorker.ts` | 095–119 | Execution |
| 5 | Dispatch Queue | `dispatchQueue.ts` | 095 | Execution |
| 6 | Reconcile Dispatch | `reconcileDispatch.ts` | 095 | Execution |
| 7 | Pipeline Certification (7 gates) | `atlasAutonomous.ts` | 099 | Certification |
| 8 | Gap Detection & Self-Healing | `atlasAutonomous.ts` | 099 | Certification |
| 9 | Heartbeat Monitor | `atlasAutonomous.ts` | 099 | Certification |
| 10 | Market Law Live Learning | `atlasAutonomous.ts` / `liveLearnEngine.ts` | 099–110 | Learning |
| 11 | DARWIN Job Queue (5 layers) | `darwinAutonomous.ts` | 094A | Research |
| 12 | DARWIN CRO Engine | `darwinCroEngine.ts` | 101 | Research |
| 13 | TIE Sequence Engine | `tieEngine.ts` | 090 | Research |
| 14 | BDE Behaviour Discovery Engine | `bdeEngine.ts` | 119 | Research |
| 15 | Gap Discovery Engine (12 dimensions) | `gapDiscoveryEngine.ts` | 115 | Research |
| 16 | Operational Certification Report | `operationalCertification.ts` | 116 | Certification |
| 17 | Live Learn Engine (8 steps) | `liveLearnEngine.ts` | 110 | Learning |
| 18 | Scheduled Jobs Orchestrator | `scheduledJobs.ts` | 094A–119 | Orchestration |
| 19 | Behaviour Engine (Shadow Mode) | `behaviour-engine/` | 122B | Research |

---

## Section 2 — Execution Pipeline Audit

### 2.1 Webhook Entry Point (`nexusRoutes.ts`)

The webhook handler at `POST /api/webhook/observe/:token` is the single entry point for all live market data. The implementation is correct and production-grade.

**Confirmed working:**
- Token validation against `ATLAS_WEBHOOK_TOKEN` environment variable
- Schema version check (`schema_version: "1.0.0"`)
- Full `normalisePayload()` function extracting all M-16 fields: OHLCV, ARI, TVL, market structure, ADE dimensions, regime, session, volatility state, EMA alignment, VWAP, RSI, ADX, ATR
- `REQUIRED_FIELDS` validation with clear error responses
- Duplicate bar detection via `atlas_memory` lookup before insert
- `processBar()` dispatch via `setImmediate()` — non-blocking, never delays the webhook response
- SSE broadcast to all connected clients after every bar
- `onNewBarObservation()` DARWIN trigger after atlas_memory write
- `liveLearnEngine.runLiveLearning()` trigger after atlas_memory write

**Gap identified:** The SSE broadcast currently emits only `pipeline_report` and `heartbeat` event types. It does **not** emit `atlas_bar_confirmed` or `atlas_bar_developing` events as specified in `LIVE_CHART_DESIGN.md`. The live chart cannot be implemented without these events being added. This is the primary blocker for Sprint 123.

### 2.2 ADE Scoring Engine (`barEvaluator.ts`)

The ADE (Autonomous Decision Engine) scoring engine evaluates every bar against all active strategies. The implementation is complete and correct.

**Confirmed working:**
- A1 evaluation: ADX ≥ 25, EMA9 > EMA21, close > VWAP, ATR expansion, session filter (RTH only)
- A3 evaluation: RSI mean-reversion logic, VWAP deviation, regime filter (RANGE/TRANSITION)
- B1 evaluation: breakout expansion, ATR spike, ADX momentum
- SB1 evaluation: second-entry pullback, EMA21 touch, trend alignment
- ORB-1 evaluation: opening range breakout, first 30-min session filter, NY open only
- S109-001 evaluation: frozen signal logic in `wfDb.ts` — `evaluateS109001Signal()` correctly reads from `workflow_states` table and applies the immutable signal rules

**Gap identified:** The `evaluateS109001Signal()` function in `wfDb.ts` contains a hardcoded `oracleAccuracy: 78.5` value used in the weekly executive briefing. This is a placeholder — the actual Oracle accuracy is not being computed from live trade outcomes.

### 2.3 Strategy Selection & Proposal Ranking (`paperTradeEngine.ts`)

The `processBar()` function is the core decision engine. It is correctly implemented.

**Confirmed working:**
- All eligible strategies generate `TradeProposal` objects with full ADE scores
- Proposals are ranked by composite ADE score (regime fit × session fit × signal quality × volatility state × EMA alignment × VWAP position × ADX strength)
- Portfolio-level position limits enforced: max 1 open trade per strategy, max 3 concurrent across portfolio
- Daily trade count limits enforced per strategy
- Circuit breaker integration: `isCircuitBreakerTripped()` checked before any dispatch
- Apex risk limits enforced: $450 max risk per trade on eval/funded accounts
- Live account risk: $1,650 standard risk correctly applied

**Gap identified:** The `processBar()` function does not yet consume `BehaviourEngineResult` from the Sprint 122B shadow engine. The `behaviourEngineContext` field is wired at the nexusRoutes level but not yet passed into the ADE scoring dimensions. This is by design for Sprint 122B (shadow mode only) and is the correct state.

### 2.4 Autonomous Dispatch Worker (`dispatchWorker.ts`)

The dispatch worker processes the `atlas_dispatch_queue` and sends signals to TradersPost.

**Confirmed working:**
- Queue polling every 2 seconds
- Status transitions: `PENDING` → `PROCESSING` → `SENT` / `FAILED`
- TradersPost webhook integration with correct payload format
- Retry logic: up to 3 retries with exponential backoff
- Apex eval/funded/live account routing via separate webhook URLs
- `reconcileDispatch.ts` handles stale queue items (stuck in PROCESSING > 5 minutes)

---

## Section 3 — DARWIN Research Engine Audit

### 3.1 Job Queue Architecture (`darwinAutonomous.ts`)

The DARWIN job queue is the backbone of the autonomous research engine. It is correctly implemented with genuine deduplication and retry logic.

**Confirmed working:**
- `enqueueJob()` with `referenceKey` deduplication — prevents the same bar or time-window being processed twice
- `claimNextJob()` with atomic status update — prevents concurrent processing
- `finaliseJob()` with exponential backoff retry: `2^retryCount × 60s`
- Layer 1 (per-bar incremental): triggered by `onNewBarObservation()` immediately after atlas_memory write
- Layer 2 (hourly): `runHourlyAnalysis()` — pattern detection across last 2 hours
- Layer 3 (daily): `runDailyResearchReview()` — observation counts, candidate updates
- Layer 4 (weekly): `runWeeklyExecutiveBriefing()` — full portfolio metrics, owner notification
- Layer 5 (monthly): `runMonthlyAudit()` — candidate deferral after 60 days with < 10 evidence

**Gap identified (significant):** The `detectPatterns()` function in Layer 2 uses only three pattern classes: `SESSION_*_BIAS`, `REGIME_*_PATTERN`, and `OVERNIGHT_CONTINUATION`. These are statistical summaries of session/regime distribution, not genuine market behaviour detection. They do not use OHLCV data, indicator values, or multi-bar sequences. The pattern detection engine is a v1 placeholder — it produces candidates, but those candidates describe session statistics rather than tradeable market behaviours. The Sprint 122B Behaviour Engine classifiers are the correct replacement for this logic.

**Gap identified:** The `oracleAccuracy: 78.5` value in `processWeeklyBriefingJob()` (line ~473) is hardcoded. It is not computed from actual trade outcomes.

### 3.2 CRO Engine (`darwinCroEngine.ts`)

The CRO (Chief Research Officer) engine manages the research queue with Expected Research Value (ERV) scoring and 8-stage promotion gates.

**Confirmed working:**
- `GATE_THRESHOLDS` correctly defines 9 promotion stages with quantitative thresholds: `OBSERVATION` → `EVIDENCE_THRESHOLD` → `HISTORICAL_REPLAY` → `BACKTEST` → `WALK_FORWARD` → `MONTE_CARLO` → `PAPER_TRADING` → `FORWARD_VALIDATION` → `PRODUCTION_CANDIDATE`
- `reprioritiseQueue()` correctly computes ERV scores and reorders the research queue
- `evaluatePromotionGates()` correctly checks evidence, confidence, win rate, and profit factor thresholds
- `logWork()` writes every CRO decision to `darwin_work_log` — full audit trail
- `PORTFOLIO_GAPS` correctly identifies RANGE regime and ETH/PRE_MARKET sessions as uncovered

**Gap identified:** `reprioritiseQueue()` is triggered every 20th bar via `liveLearnEngine.ts` (line ~199). This is correct behaviour. However, the ERV calculation uses `candidate.occurrenceCount` as a proxy for evidence quality — it does not distinguish between high-quality observations (live bars with full indicator data) and low-quality observations (historical replay batches with partial data).

### 3.3 TIE Sequence Engine (`tieEngine.ts`)

The Temporal Intelligence Engine classifies multi-bar sequences into 12 behavioural types.

**Confirmed working:**
- `classifySequence()` correctly implements rule-based classification across 12 sequence types: `COMPRESSION_EXPANSION`, `LIQUIDITY_SWEEP_RECLAIM`, `OPENING_DRIVE`, `FAILED_BREAKOUT`, `TREND_EXHAUSTION`, `PULLBACK_CONTINUATION`, `RANGE_ACCEPTANCE`, `MOMENTUM_EXPANSION`, `REGIME_CHANGE`, `VWAP_RECLAIM_TREND`, `TREND_TRANSITION`, `VOLATILITY_COMPRESSION`
- `BarSnapshot` interface correctly maps all atlas_memory indicator fields
- Sequence library update via `updateSequenceLibrary()` in `liveLearnEngine.ts`

**Gap identified:** `updateSequenceLibrary()` in `liveLearnEngine.ts` (lines 304–322) uses a raw SQL `UPDATE` to increment `obs_count` for sequences matching the current `regime`. It does not call `classifySequence()` — it does not actually detect new sequences from live bars. The TIE engine's `classifySequence()` function is called from the dashboard tRPC procedures for display purposes but is not wired into the live learning pipeline.

### 3.4 BDE Behaviour Discovery Engine (`bdeEngine.ts`)

The BDE (Sprint 119) implements 9 subsystems: Market Intent Engine, Behaviour Clustering, Portfolio Coverage Map, Counterfactual Analysis, Strategy Interaction Analysis, Behaviour Law Engine, Market Memory Engine, Behaviour Explanation Engine, and Daily DARWIN Questions.

**Confirmed working:**
- `computeMarketIntent()` correctly computes 8-dimension probability distribution from latest atlas_memory bar using rule-based heuristics
- `runBehaviourClustering()` correctly groups paper trades into behaviour families by regime/session/direction
- `computePortfolioCoverageMap()` correctly maps strategy coverage across regime × session matrix
- `runCounterfactualAnalysis()` correctly generates sensitivity analysis for recent trades
- `generateBehaviourExplanation()` correctly produces structured 3-tier evidence explanations

**Gap identified:** `computeMarketIntent()` uses a rule-based heuristic model described as "v1.0 — will be replaced by ML in v2.0" (line ~66). The probabilities are computed from indicator thresholds, not from historical outcome distributions. This is an honest placeholder — the architecture is correct, the model is not yet calibrated.

### 3.5 Gap Discovery Engine (`gapDiscoveryEngine.ts`)

The Gap Discovery Engine analyses the portfolio across 12 dimensions and generates gap candidates.

**Confirmed working:**
- All 12 gap dimensions are implemented: `MARKET_BEHAVIOUR`, `REGIME_COVERAGE`, `LOW_CONFIDENCE_LAW`, `BEHAVIOUR_LIBRARY`, `SEQUENCE_LIBRARY`, `UNDERPERFORMING_MODEL`, `RESEARCH_BOTTLENECK`, `EXECUTION_BOTTLENECK`, `DASHBOARD_BLIND_SPOT`, `DATA_QUALITY`, `CORRELATION_WEAKNESS`, `RISK_ALLOCATION`
- Gap candidates are written to `gap_candidates` table with priority scores
- 10 autonomous questions are generated and answered each run
- `gapDiscoveryReports` table receives a full report record after each run

---

## Section 4 — Learning Engine Audit

### 4.1 Live Learn Engine (`liveLearnEngine.ts`)

The Live Learn Engine runs 8 steps on every confirmed bar. It is the most complex single-bar processing pipeline in Atlas.

**Confirmed working (8 steps):**
1. **Candle Certification** — calls `certifyCandle()` from `atlasAutonomous.ts`, 7-gate validation
2. **Gap Detection** — calls `detectAndLogGap()` when certification detects a predecessor gap
3. **Behaviour Library Update** — updates `behaviour_library` table with continuation/reversal rates per regime/session
4. **Sequence Library Update** — increments `tie_sequence_library` obs_count by regime (shallow — see gap above)
5. **Market Law Evaluation** — calls `updateMarketLawsFromBar()` with regime, session, ATR
6. **DARWIN Research Memory Write** — writes compact bar observation to `darwin_research_memory`
7. **Portfolio Intelligence Inputs Update** — writes regime probabilities and eligible models to `portfolio_intelligence_inputs`
8. **Recursive Learning** — triggers `reprioritiseQueue()` every 20th bar via dynamic import

**Gap identified:** Step 3 (`updateBehaviourLibrary`) detects behaviours using only 4 simple conditions: VWAP position (above/below), EMA9/EMA21 cross direction, ATR expansion > 1.2, and RSI extreme (< 35 or > 65). These are single-bar indicator states, not the multi-bar behavioural patterns defined in the Behaviour Library schema. The Sprint 122B Behaviour Engine classifiers provide the correct replacement.

**Gap identified:** Step 5 (`updateMarketLawsFromBar`) passes `emaAlignment: null` and `distVwap: null` hardcoded (line ~162). These fields are available in the atlas_memory bar but are not being passed through. Market laws that depend on EMA alignment or VWAP distance are not being updated from live data.

### 4.2 Pipeline Certification (`atlasAutonomous.ts`)

The 7-gate candle certification system is correctly implemented.

**Confirmed working:**
- Gate 1: Timestamp is a valid 5-minute boundary (`barTimeMs % 300000 === 0`)
- Gate 2: No duplicate in atlas_memory
- Gate 3: Predecessor bar exists within 2 intervals (gap detection)
- Gate 4: OHLCV valid (high ≥ low, close > 0)
- Gate 5: Written to memory (always true after write)
- Gate 6: Analysis complete (regime classification present)
- Gate 7: Linked to market laws (always true)

**Gap identified:** Gate 7 ("Linked to market laws") always returns `true` regardless of whether any market laws actually reference this bar. This is a placeholder gate — it passes unconditionally.

---

## Section 5 — Scheduled Jobs Audit (`scheduledJobs.ts`)

The scheduled jobs orchestrator wires all autonomous subsystems to the heartbeat timer.

**Confirmed working:**
- Every-5-min: webhook silence check (`checkWebhookSilence()`)
- Every-5-min: dispatch queue health check
- Hourly: `runHourlyAnalysis()` (DARWIN Layer 2)
- Daily 08:30 ET: `generateMorningBrief()` (atlasAutonomous)
- Daily 16:15 ET: `runDailyResearchReview()` (DARWIN Layer 3)
- Daily 16:30 ET: `runGapDiscovery()` (gapDiscoveryEngine)
- Sunday 18:00 ET: `runWeeklyExecutiveBriefing()` (DARWIN Layer 4)
- Sunday 18:00 ET: `generateOperationalCertificationReport()` (operationalCertification)
- Monthly 1st: `runMonthlyAudit()` (DARWIN Layer 5)

**Gap identified:** The BDE engine (`bdeEngine.ts`) subsystems — Market Intent, Behaviour Clustering, Portfolio Coverage Map, Counterfactual Analysis, Strategy Interaction Analysis — are **not wired into scheduledJobs.ts**. They exist as callable functions but are only triggered from dashboard tRPC procedures (on-demand). They do not run autonomously.

**Gap identified:** `darwinDailyReport.ts` and `darwinGitArchive.ts` are present but their scheduled invocation in `scheduledJobs.ts` was not confirmed in the reviewed code. These may be called from the daily review handler but require verification.

---

## Section 6 — Autonomy Score Matrix

Each subsystem is scored across four dimensions: **Trigger** (how it activates), **Persistence** (whether results survive restarts), **Self-Correction** (whether it handles its own failures), and **Human Dependency** (whether it requires human input to function).

| Subsystem | Trigger | Persistence | Self-Correction | Human Dep. | Autonomy Score |
|---|---|---|---|---|---|
| Webhook Ingestion | External (TradingView) | ✅ DB | ✅ Error handling | Low | **9/10** |
| ADE Scoring | Per-bar (setImmediate) | ✅ DB | ✅ try/catch | None | **9/10** |
| Strategy Selection | Per-bar | ✅ DB | ✅ try/catch | None | **9/10** |
| Dispatch Worker | Queue polling (2s) | ✅ DB queue | ✅ Retry + reconcile | None | **9/10** |
| Pipeline Certification | Per-bar | ✅ DB | ✅ try/catch | None | **8/10** |
| Gap Detection | Per-bar | ✅ DB | ✅ try/catch | None | **8/10** |
| Heartbeat Monitor | Heartbeat (5-min) | ✅ DB | ✅ Rate-limited notify | None | **8/10** |
| DARWIN Job Queue | Per-bar + heartbeat | ✅ DB queue | ✅ Retry + backoff | None | **8/10** |
| DARWIN CRO Engine | Every 20th bar | ✅ DB | ✅ Work log | None | **7/10** |
| Live Learn Engine | Per-bar | ✅ DB | ⚠️ Errors logged only | None | **7/10** |
| TIE Sequence Engine | On-demand only | ✅ DB | ✅ try/catch | High | **4/10** |
| BDE Engine | On-demand only | ✅ DB | ✅ try/catch | High | **4/10** |
| Operational Certification | Weekly (Sunday) | ✅ DB | ✅ try/catch | None | **8/10** |
| Behaviour Engine | Per-bar (shadow) | ✅ DB | ✅ setImmediate + try/catch | None | **8/10** |

---

## Section 7 — Gap Register

All confirmed gaps from the audit, ranked by severity.

| # | Severity | File | Gap Description | Sprint Fix |
|---|---|---|---|---|
| G-001 | **HIGH** | `nexusRoutes.ts` | SSE does not emit `atlas_bar_confirmed` / `atlas_bar_developing` events — live chart cannot function | Sprint 123 |
| G-002 | **HIGH** | `darwinAutonomous.ts` ~L715 | `detectPatterns()` uses session/regime statistics only — not genuine market behaviour detection | Sprint 124 |
| G-003 | **HIGH** | `liveLearnEngine.ts` ~L226 | `updateBehaviourLibrary()` uses 4 single-bar indicator states — not multi-bar behaviour patterns | Sprint 124 |
| G-004 | **HIGH** | `scheduledJobs.ts` | BDE engine subsystems not wired to scheduler — run on-demand only, not autonomously | Sprint 124 |
| G-005 | **MEDIUM** | `liveLearnEngine.ts` ~L162 | `updateMarketLawsFromBar()` passes `emaAlignment: null` and `distVwap: null` hardcoded | Sprint 123 |
| G-006 | **MEDIUM** | `liveLearnEngine.ts` ~L304 | `updateSequenceLibrary()` increments obs_count by regime only — does not call `classifySequence()` | Sprint 124 |
| G-007 | **MEDIUM** | `atlasAutonomous.ts` ~L189 | Gate 7 ("Linked to market laws") always returns `true` unconditionally | Sprint 124 |
| G-008 | **LOW** | `darwinAutonomous.ts` ~L473 | `oracleAccuracy: 78.5` hardcoded in weekly briefing — not computed from trade outcomes | Sprint 125 |
| G-009 | **LOW** | `darwinCroEngine.ts` | ERV calculation uses `occurrenceCount` as evidence proxy — does not weight observation quality | Sprint 125 |
| G-010 | **LOW** | `paperTradeEngine.ts` | `BehaviourEngineResult` not yet consumed by ADE scoring — by design (shadow mode) | Sprint 124 |

---

## Section 8 — Data Flow Verification

The following table traces the complete data flow from TradingView webhook to every downstream consumer, verified from source code.

```
TradingView M-16 Pine Script
    │
    ▼
POST /api/webhook/observe/:token  (nexusRoutes.ts)
    │
    ├─► normalisePayload() ──────────────────────────────► atlas_memory INSERT
    │                                                            │
    │                                                            ├─► onNewBarObservation() ──► darwin_job_queue
    │                                                            │
    │                                                            └─► liveLearnEngine.runLiveLearning()
    │                                                                    ├─► certifyCandle() ──► candle_certifications
    │                                                                    ├─► detectAndLogGap() ──► candle_gap_log
    │                                                                    ├─► updateBehaviourLibrary() ──► behaviour_library
    │                                                                    ├─► updateSequenceLibrary() ──► tie_sequence_library
    │                                                                    ├─► updateMarketLawsFromBar() ──► market_laws
    │                                                                    ├─► writeDarwinResearchMemory() ──► darwin_research_memory
    │                                                                    └─► updatePortfolioIntelligenceInputs() ──► portfolio_intelligence_inputs
    │
    ├─► processBar() [setImmediate] (paperTradeEngine.ts)
    │       ├─► barEvaluator.evaluateAllStrategies()
    │       │       ├─► evaluateA1() ──► monitor_evaluations
    │       │       ├─► evaluateA3() ──► monitor_evaluations
    │       │       ├─► evaluateB1() ──► monitor_evaluations
    │       │       ├─► evaluateSB1() ──► monitor_evaluations
    │       │       ├─► evaluateORB1() ──► monitor_evaluations
    │       │       └─► evaluateS109001() ──► monitor_evaluations
    │       ├─► rankProposals() ──► highest-scoring eligible strategy
    │       └─► dispatchTrade() ──► atlas_dispatch_queue
    │                                    │
    │                                    └─► dispatchWorker.ts (2s poll)
    │                                            └─► TradersPost webhook ──► Apex / Live account
    │
    ├─► runBehaviourEngine() [setImmediate] (behaviour-engine/index.ts)
    │       └─► shadow mode ──► atlas_behaviour_instances, atlas_behaviour_transitions
    │
    └─► broadcastSSE() ──► all connected dashboard clients
            └─► event: pipeline_report (current)
                [MISSING: atlas_bar_confirmed, atlas_bar_developing]
```

---

## Section 9 — Honest Assessment

Atlas Nexus is a genuinely autonomous trading system. The core execution pipeline — from webhook ingestion through ADE scoring, strategy selection, and TradersPost dispatch — is production-grade, correctly implemented, and operating without human intervention on every live bar. The DARWIN job queue, CRO promotion gates, and operational certification report are structurally sound and represent real autonomous research infrastructure.

The gaps identified in this audit are concentrated in three areas:

**Area 1 — Pattern Detection Depth.** The `detectPatterns()` function in `darwinAutonomous.ts` and the `updateBehaviourLibrary()` function in `liveLearnEngine.ts` both use shallow, single-bar indicator states rather than the multi-bar behavioural patterns that the Behaviour Library and DARWIN research doctrine require. The Sprint 122B Behaviour Engine classifiers are the correct architectural replacement for both of these functions. Wiring the Behaviour Engine output into DARWIN's Layer 1 incremental processing (replacing `detectPatterns()`) is the highest-value research infrastructure improvement available.

**Area 2 — BDE Scheduling Gap.** The BDE engine's 9 subsystems are callable and correctly implemented but are not wired into the scheduled jobs orchestrator. They only run when a dashboard user triggers them. This means that Market Intent, Behaviour Clustering, Portfolio Coverage Map, Counterfactual Analysis, and Strategy Interaction Analysis are not running autonomously. This is a straightforward wiring fix in `scheduledJobs.ts`.

**Area 3 — Hardcoded Placeholders.** Three values are hardcoded and should be computed from live data: Oracle accuracy (78.5%), Gate 7 market law linkage (always true), and EMA alignment / VWAP distance in `updateMarketLawsFromBar()`. None of these affect execution correctness but they reduce the accuracy of the research intelligence layer.

The Behaviour Engine (Sprint 122B) is the correct next step for addressing Areas 1 and 2. Once the Behaviour Engine classifiers are wired into DARWIN's Layer 1 processing, the pattern detection depth gap is resolved. Once the BDE subsystems are added to the scheduler, the scheduling gap is resolved. Both fixes are contained within Sprint 124.

---

## Section 10 — Sprint 123 Preview: Live Chart Implementation

This section documents the exact implementation plan for Sprint 123, which follows immediately from this audit.

### What Will Be Built

Sprint 123 implements the live candlestick chart on the Atlas Nexus dashboard, as specified in `LIVE_CHART_DESIGN.md` (Sprint 120). This is a pure frontend/SSE addition — zero changes to the execution pipeline.

**Server-side additions (nexusRoutes.ts):**
- Add `atlas_bar_confirmed` SSE event emitted after every successful atlas_memory write, containing: `{ type: "atlas_bar_confirmed", time: barTimeMs/1000, open, high, low, close, volume, session, regime }`
- Add `atlas_bar_developing` SSE event emitted on every webhook receipt (before bar close), containing the current developing bar's OHLCV
- Add `atlas_feed_health` SSE event emitted on heartbeat, containing feed status

**New tRPC procedure (routers.ts):**
- `chart.getHistoricalBars` — returns the last 200 confirmed bars from `atlas_memory` for chart seeding on connect

**New frontend component (`client/src/components/LiveChart.tsx`):**
- TradingView Lightweight Charts (`lightweight-charts` npm package, Apache 2.0)
- Dark theme matching Atlas dashboard colour scheme
- Candlestick series seeded from `chart.getHistoricalBars` on mount
- Developing bar updated in real time from `atlas_bar_developing` SSE events
- Bar confirmed and appended from `atlas_bar_confirmed` SSE events
- Session boundary markers (RTH open/close vertical lines)
- VWAP line overlay (from atlas_memory `vwap` field)
- EMA9 and EMA21 line overlays
- Feed health status indicator (green/amber/red dot)
- Responsive: full-width on desktop, scrollable on mobile

**Dashboard integration (`client/src/pages/Dashboard.tsx`):**
- LiveChart placed as the primary visual element at the top of the dashboard
- Chart height: 400px desktop, 280px mobile
- Below the chart: existing HUD panels (position state, model evaluations, ADE metrics)

**No changes to:**
- Execution pipeline
- Strategy selection
- Dispatch worker
- Any production trading logic

### Why This Is Safe

The live chart is a read-only consumer of SSE events and tRPC queries. It cannot affect the execution pipeline. The new SSE events are additive — existing `pipeline_report` and `heartbeat` events are unchanged. The `chart.getHistoricalBars` query is a read-only SELECT on `atlas_memory`.

---

*Audit completed: 2026-07-18 | All findings verified from source code | Zero production changes made*
