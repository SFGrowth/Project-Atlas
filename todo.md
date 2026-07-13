# Atlas Nexus — Project TODO

## Sprint 074/075 — MVP

- [x] Add pipeline_reports table to drizzle/schema.ts
- [x] Generate and apply migration SQL
- [x] POST /api/webhook/observe/:token — Dual-layer auth, schema validation, idempotency, DB insert, SSE broadcast
- [x] GET /api/events — SSE stream with heartbeat, catch-up on reconnect, bounded per-client queue
- [x] GET /api/v1/health — health check endpoint
- [x] GET /api/v1/stats — stats endpoint
- [x] GET /api/v1/reports — list recent reports
- [x] tRPC procedures for reports list and stats
- [x] Vitest tests for webhook validation and idempotency — 15/15 pass
- [x] JARVIS/Stark Industries theme in index.css (arc reactor blue, hex grid, scanlines)
- [x] Google Fonts: JetBrains Mono + Rajdhani + Orbitron
- [x] Overview Strip, Market Structure, Model Evaluations, ADE, ARI, TVL, Decision Timeline panels
- [x] Secrets: ATLAS_WEBHOOK_TOKEN — 64-char hex, stored securely, never committed

## Sprint 076 — Atlas Nexus v1.0 Final Delivery

### Database Schema
- [x] paper_trades table
- [x] journal_days table
- [x] system_health_events table
- [x] notification_log table
- [x] Migration SQL generated and applied

### Backend
- [x] Paper trading engine: open/close simulated positions from pipeline reports, track MFE/MAE/duration
- [x] Journal aggregation: compute daily stats from paper_trades
- [x] tRPC procedures: paper trades CRUD, journal queries, system health, notifications
- [x] System health heartbeat: monitor webhook last-received, SSE client count, DB connectivity
- [x] Owner notifications: all 11 alert types via built-in notification API

### Frontend — Navigation & Branding
- [x] Rebrand to ORION: "ORION ONLINE" status, "Quantitative Trading Operating System" subtitle
- [x] OrionLayout: sidebar navigation with all 14 pages
- [x] HudComponents: shared component library for all pages

### Frontend — Pages (17 total)
- [x] Home Dashboard: ORION command centre with live pipeline status, system health, brain view, paper trading summary
- [x] Observatory page: all-modules live view with tRPC fallback
- [x] Market Structure page
- [x] Model Evaluations page: A1/A3/B1 cards + consensus
- [x] Atlas Brain page
- [x] ADE Decision Engine page: decision output + edge score gauge
- [x] ARI Risk Intelligence page: risk decision + session P&L
- [x] TVL Verification page: verification summary + 5 checks
- [x] Execution Layer page
- [x] Position State page
- [x] Decision Timeline page: scrolling event log
- [x] Replay Engine page
- [x] Trading Journal page
- [x] System Health page
- [x] Reports page: list + payload inspector
- [x] Atlas AI page: ORION JARVIS chat interface
- [x] Settings page

### Notifications (11 types)
- [x] Trade Opened
- [x] Trade Closed
- [x] Target Hit
- [x] Stop Hit
- [x] ARI Rejection
- [x] Circuit Breaker Activated
- [x] System Offline (SIGTERM/SIGINT)
- [x] Webhook Failure (15 min silence during market hours)
- [x] TradingView Disconnected (45 min silence escalation)
- [x] Backend Offline (SIGTERM/SIGINT)
- [x] Atlas Online (startup, 8s delay)

### Delivery
- [x] TypeScript: 0 errors
- [x] Vitest: 15/15 tests pass
- [x] Checkpoint saved
- [x] Publish instructions delivered

## Sprint 077 — Backend Hardening + Analytics

- [x] Timeframe validation: reject payloads where timeframe !== "5" with HTTP 422
- [x] Notification deduplication: per-type cooldown windows (ARI_REJECTION 5min, CIRCUIT_BREAKER 30min, WEBHOOK_FAILURE 1hr, TV_DISCONNECTED 2hr)
- [x] 10-minute startup grace period before WEBHOOK_FAILURE/TV_DISCONNECTED checks activate
- [x] tvDisconnectNotified resets on every successful webhook receipt
- [x] M-15 Pine Script: add webhook_secret and pipeline_run_id fields
- [x] Performance Analytics page (/analytics): equity curve, daily P&L, model breakdown, trade log
- [x] Fix all dashboard clocks and timestamps to display in New York (ET) timezone
- [x] Vitest: 17/17 tests pass
- [x] Add trade entry/exit labels to M-15 Pine Script (W/L labels, no reprints, bar-close confirmed) — implemented in atlas_core.pine Sprint 078 commit

## Sprint 079 — Pipeline Fix & Dashboard Hydration
- [x] Root cause identified: nexusRoutes.ts validatePayload() expected flat JSON but M-15 sends nested JSON (metadata.ticker, market_state.session etc.)
- [x] Fix: Added normalisePayload() function to nexusRoutes.ts — extracts flat fields from nested M-15 structure before validation
- [x] Fix: Home.tsx now fetches trpc.nexus.latestReport on mount so dashboard shows data immediately (not waiting for SSE catchup)
- [x] End-to-end test: nested Pine Script payload accepted with 201, sse_clients_reached=14, all fields normalised correctly
- [x] All 17 vitest tests still passing after fixes

## Sprint 081 — ADE v2 Implementation & Certification Framework

### Part 1 — ADE v2 Pine Script (M-14)
- [x] Implement all 17 confidence dimensions in atlas_core.pine (M-14)
- [x] Implement model-specific normalisation (A1, A2, A3 separate max scores)
- [x] Implement confidence ranking and candidate selection
- [x] Implement tie-breaking logic (D-SI-01 then D-MS-02)
- [x] Implement Edge Attribution Record (EAR) generation in Pine Script
- [x] Embed EAR fields in M-15 webhook payload (ade_v2 nested object)
- [x] Verify ARI, TVL, M-15 Observatory remain unchanged

### Part 2 — Database Schema
- [x] Create ade_trade_records table (22 fields per Sprint 080 spec)
- [x] Create ade_version_governance table (version governance)
- [x] Run migration SQL via webdev_execute_sql
- [x] Seed ADE v2.0.0 initial governance record

### Part 3 — Edge Attribution Panel (Atlas Nexus)
- [x] Build EdgeAttributionPanel component — top 5 positive + top 3 penalty dimensions
- [x] Display: raw score, normalised score, candidate status, model, direction
- [x] Per-dimension rows: name, weight, contribution, explanation, current value, normalised value
- [x] Wire to live webhook payload ade_v2 fields via tRPC
- [x] Add to ADE Decision Engine page

### Part 4 — Model Ranking Display
- [x] Build ModelRankingPanel component — ranked list of all evaluated models
- [x] Display per model: rank, model ID, edge score, confidence, ARI state, TVL state, reason
- [x] Wire to live webhook payload
- [x] Add to ADE Decision Engine page

### Part 5 — Atlas Certification Framework
- [x] Build /certification route and CertificationDashboard page
- [x] Display: current production version, research version, certification status
- [x] Display all 14 certification checks with pass/fail/pending status
- [x] Display: paper trades completed, MC pass rate, certification date, version, EDL reference
- [x] Add certification route to App.tsx and sidebar navigation

### Part 6 — Version Governance
- [x] Build version history display in Certification dashboard
- [x] Seed ADE v2.0.0 as the initial governance entry in ade_version_governance table

### Part 7 — Self-Learning Schema
- [x] ade_trade_records table active and ready to receive data from paper trades
- [x] SLF record insertion wired to paper trade close handler in nexusRoutes.ts

### Part 8 — Engineering Validation
- [x] Python validation: all 6 checks pass (raw maxima, normalisation, confidence tiers, ARI/TVL compat, ranking, certification)
- [x] Run full test suite — 17/17 tests pass
- [x] TypeScript compilation clean (0 errors)

## Sprint 082 — ADE v2 Live Data Activation & Validation

### Phase 1 — TradingView M-15 Update
- [x] Deliver updated M-15 script file to user for TradingView paste
- [x] Verify M-15 alert is active on ATLAS chart (MNQ1! 5m, cDPu6HGG)
- [x] Confirm webhook URL and secret are preserved

### Phase 2 — ADE v2 Payload Verification
- [x] Verify all 17 dimensions present in ade_v2 object (NOT_APPLICABLE / RESEARCH_REQUIRED for uncalibrated dims)
- [x] Verify schema_version, ade_version, candidate_model, direction, raw_score, raw_max, norm_score, threshold, candidate_status, ranking, tie_break, rationale all present
- [x] Send test webhook with full ade_v2 payload and confirm DB storage

### Phase 3 — Live Data Wiring (ADE page)
- [x] Remove all placeholder/mock data from ADE.tsx
- [x] Wire Edge Attribution Panel to trpc.nexus.latestReport
- [x] Wire Model Ranking to trpc.nexus.latestReport
- [x] Wire candidate status, norm score, raw score, dimension bars, contributors, rationale, ARI, TVL, timestamp, direction

### Phase 4 — Model Ranking Validation
- [x] Display all evaluated models per bar with full fields
- [x] Verify ranking logic: eligible only, highest norm wins, threshold enforced, tie-break deterministic, exactly one candidate

### Phase 5 — Edge Attribution Validation (50-bar reconciliation)
- [ ] Reconcile Pine vs webhook vs DB vs frontend for all 17 dimensions across 50+ bars (PENDING — awaiting Sunday market open)
- [ ] 100% agreement required

### Phase 6 — Certification Page Wiring
- [x] Wire Certification page to live governance data
- [x] Set ADE v2 status to PAPER VALIDATION (not Production Certified)
- [x] Display all required version/build/validation fields

### Phase 7 — Self-Learning Record Validation
- [x] Confirm ade_trade_records insertion on paper trade close (one record per closed trade) — FIXED 3 bugs
- [x] Verify deduplication, all required fields, no contamination from replayed events

### Phase 8 — Data Freshness States
- [x] ADE page shows LIVE / STALE / DEGRADED / OFFLINE / DATA INVALID states
- [x] No placeholder data — show DATA UNAVAILABLE when data absent

### Phase 9 — Validation Window
- [ ] 50 consecutive confirmed 5-min bars reconciled (after Sunday market open)

### Phase 10 — Engineering Documentation
- [x] ADE v2 live activation report (sprint-082-ade-v2-live-data-activation.md)
- [x] TradingView M-15 deployment record
- [x] Webhook schema verification report
- [ ] 50-bar Edge Attribution reconciliation table (PENDING — awaiting Sunday market open)
- [x] Model Ranking verification report
- [x] Certification status report
- [x] Self-Learning Record integrity report
- [x] Frontend field mapping report
- [x] Critical Self Review
- [x] EDL update
- [x] Permanent Change Log update

## Sprint 083 — Dollar-Risk Position Sizing

### Pine Script (M-14 + M-15)
- [x] Replace legacy multiplier sizing with dollar-risk formula: floor(dollar_risk / (stop_pts × point_value))
- [x] Add ATLAS EXECUTION PROFILE Settings group to M-14 (atlas_core.pine)
- [x] Add ATLAS EXECUTION PROFILE Settings group to M-15 (atlas_observability_webhook.pine)
- [x] Add chart safety banner to M-14 (permanent label, teal=PAPER, red=ARMED, yellow=DISARMED)
- [x] Add arming safety gate (i_execution_armed) for non-PAPER modes
- [x] Add RISK_TOO_SMALL_FOR_ONE_CONTRACT rejection path
- [x] Add profile fields to M-15 ARI JSON payload (13 new fields)
- [x] Fix double-rejection-increment bug in M-14 ARI block
- [x] Fix duplicate t_preview var declaration in M-15
- [x] Generate four profile reference builds in /pine-script/profiles/

### Atlas Nexus
- [x] Add 13 profile/sizing fields to normalisePayload() in nexusRoutes.ts
- [x] Build Execution Profiles page (/execution-profiles)
- [x] Add "Exec Profiles" nav item to EXECUTION group in OrionLayout
- [x] Register /execution-profiles route in App.tsx

### Documentation
- [x] Sprint 083 engineering doc with contract-sizing test matrix (sprint-083-dollar-risk-position-sizing.md)
- [x] Dry-run validation plan for Sunday market open

### Validation
- [ ] Live dry-run: formula fires on first signal (Sunday 6PM ET)
- [ ] Verify stop_distance_points in webhook matches chart stop ±0.25 pts
- [ ] Verify estimated_risk ≤ configured_risk on every bar
- [ ] Verify profile_id = "ATLAS_PAPER_MNQ" in payload
- [ ] Verify chart banner visible with correct values
- [ ] Verify Nexus Exec Profiles page shows live sizing data

## Sprint 088 — SB1 Production Implementation & Forward Validation

### PART 1–3: Pine Script RAS & Validation
- [x] Write Pine Script v5 RAS implementation (9 components, 0–100 score, documented)
- [x] Write Pine RAS vs GBM validation report — server-side GBM architecture chosen (rule-based cannot achieve ≥90% AUC)

### PART 3: Database Schema — SB1 & Scheduler Tables
- [x] Add `sb1_paper_trades` table (entry, exit, MFE, MAE, R, exit reason, holding time, regime, RAS, component scores)
- [x] Add `sb1_rejected_signals` table (suppressed entries with reason code and component breakdown)
- [x] Add `sb1_ras_snapshots` table (as sb1_ras_log) (per-bar RAS with all 9 component scores)
- [x] Add `sb1_daily_reviews` table (as atlas_daily_reviews) (full daily review JSON, permanent archive, searchable)
- [x] Add `sb1_rolling_performance` table (as atlas_rolling_performance) (7/30/90/lifetime rolling stats per window)
- [x] Add `atlas_scheduled_jobs` table (scheduler registry — permanent Atlas scheduling service)
- [x] Run all migration SQL via webdev_execute_sql

### PART 4: Backend Procedures
- [x] `sb1.logTrade` — create/update SB1 paper trade record
- [x] `sb1.logRejectedSignal` — record suppressed entry with reason
- [x] `sb1.logRasSnapshot` — record per-bar RAS component breakdown
- [x] `sb1.openTrades` — get open SB1 paper trades
- [x] `sb1.recentTrades` — paginated closed trades with full metadata
- [x] `sb1.tradeById` — single trade detail
- [x] `sb1.stats` — aggregate stats (PF, WR, expectancy, DD, trade count)
- [x] `sb1.rollingPerformance` — 7/30/90/lifetime rolling metrics
- [x] `sb1.latestRas` — most recent RAS snapshot with component breakdown
- [x] `sb1.certificationStatus` — forward validation progress (days, trades, PF, WR, DD vs targets)
- [x] `dailyReview.latest` — most recent daily review report
- [x] `dailyReview.list` — paginated archive (searchable by date)
- [x] `dailyReview.byDate` — single review by date
- [x] `dailyReview.generateNow` — trigger manual review generation

### PART 5: Heartbeat Scheduler (Permanent Atlas Scheduling Service)
- [x] Create `server/scheduledJobs.ts` with full daily review generation logic
- [x] Mount `/api/scheduled/daily-review` in server/_core/index.ts
- [x] Daily review logic: trading summary, model activity, regime summary, decision review, system health, rolling performance
- [x] Push notification on completion ("Atlas Daily Review Complete") and failure ("Atlas Daily Review Complete") and failure ("Atlas Daily Review Failed")
- [x] Register Heartbeat cron via `manus-heartbeat create` (4:30 PM ET = 20:30 UTC, 6-field: `0 30 20 * * 1-5`) — task_uid: Szbswcmv98W7mRYFoX8Eci, next run: 2026-07-13T20:30:00Z
- [x] Persist task_uid to `atlas_scheduled_jobs` table — Szbswcmv98W7mRYFoX8Eci inserted

### PART 6: Observatory Integration (SB1 Panel)
- [x] Add SB1 status panel to Observatory page — built as dedicated /sb1 page (SB1Observatory.tsx)
- [x] Add activation/suppression reason display with colour coding
- [x] Add winning/losing regime fingerprint comparison cards
- [x] Add live RAS gauge (0–100 arc, threshold line at 45, colour zones)

### PART 7: SB1 Certification Dashboard (expand existing Certification page)
- [x] Add SB1 section to Certification page with 3-state status (built in SB1Observatory certificationStatus panel) (🔴 Research / 🟡 Forward Validation / 🟢 Production Ready)
- [x] Forward validation progress tracker (60-day countdown, trade count vs 60, PF vs 2.0, WR vs 45%, DD vs −$643)
- [x] Pine implementation status card (implemented / validated / agreement rate)
- [x] Observatory connected status card
- [x] Governance isolation display (SB1 never influences A1/A3/B1/live — explicit rule list)

### PART 8: Daily Review Page
- [x] Create `/daily-review` page with full 5-section layout
- [x] Latest review display: trading summary, model activity, regime summary, decision review, system health
- [x] Rolling performance tables (7/30/90/lifetime for PF, WR, expectancy, DD, avg R, trade count)
- [x] Searchable archive of all previous daily reviews
- [x] Add `/daily-review` route to App.tsx
- [x] Add "Daily Review" nav entry to OrionLayout sidebar

### PART 9: Integration & Delivery
- [x] Write vitest tests for new sb1 and dailyReview procedures (8 new tests, 25/25 total passing)
- [x] Verify TypeScript compiles cleanly (0 errors)
- [x] Checkpoint and deliver

## Sprint 089 — Every-Bar BAR_OBSERVATION + ARD Foundation (Constitution-Compliant)

### Pine Script (M-15 Extension)
- [x] Add BAR_OBSERVATION event class to M-15 Pine Script (sent on every barstate.isconfirmed)
- [x] BAR_OBSERVATION payload: event_id, idempotency_key, bar_time, symbol, timeframe, session, OHLCV, ATR, ADX, CHOP, VWAP, EMA9/21/50/200 values and slopes, trend direction, volatility state, compression/expansion, prev-day structure, overnight structure, regime classification, eligible model states, ADE scores, SB1 RAS, active position state, pipeline health, schema/version metadata
- [x] Two-class event architecture: BAR_OBSERVATION (every bar) vs DECISION_EVENT (signals, ADE, ARI, TVL, entries, exits, errors, state changes)
- [x] Exactly one observation per confirmed candle — no intrabar duplicates
- [x] Failed Nexus delivery must never affect Pine decisions
- [x] No execution dependency on Nexus availability

### Database Schema
- [x] `ard_bar_observations` table: full market-state snapshot per confirmed 5-min bar
- [x] `ard_candidates` table: research candidate registry (id, title, hypothesis, status, evidence, sample_size, effect_size, etc.)
- [x] `oracle_predictions` table: immutable prediction record (all fields from Constitution Part V §2)
- [x] `oracle_reality` table: reality record (all fields from Constitution Part V §3)
- [x] `oracle_scores` table: calibration metrics and Oracle Score by model/regime/portfolio
- [x] Run Drizzle migration and apply via webdev_execute_sql

### Backend
- [x] POST /api/bar-observation ingestion endpoint (idempotency enforced on bar_time + symbol)
- [x] Missing-bar detection: flag gaps > 5 min during RTH hours
- [x] ARD feature store write on every ingested observation
- [x] tRPC procedures: ard.recentObservations, ard.observationCount, ard.missingBars, ard.candidates
- [x] Constitution document saved to Project-Atlas git repository

### Frontend (ARD Foundation Page)
- [x] New page: /ard — Autonomous Research Division
- [x] Live observation stream: last 20 bars, bar time, regime, ADX, ATR, CHOP, RAS, model states
- [x] Feature store stats: total observations, today's count, missing bar count, coverage %
- [x] Research Candidate Registry: list with status badges (Observed / Monitor / Research / Rejected / Promoted)
- [x] Add /ard route to App.tsx
- [x] Add "ARD" nav entry to OrionLayout sidebar under INTELLIGENCE section

### Tests & Delivery
- [x] Vitest tests for ard ingestion procedures
- [x] TypeScript 0 errors
- [x] Checkpoint and deliver

## Sprint 089A — Atlas Memory: Continuous Market Memory System

### M-16 Pine Script (Atlas ARD Observer v1.1.0)
- [x] Upgrade M-16 to Sprint 089A designation (v1.1.0)
- [x] Confirm unconditional BAR_OBSERVATION fires on every confirmed 5-min candle (barstate.isconfirmed)
- [x] Add bar_index field to JSON payload
- [x] Confirm all Sprint 089A fields present: schema_version, bar_time, bar_index, OHLCV, EMAs + slopes, ATR, ATR5, ADX, CHOP, RSI, VWAP, regime, prev-day structure, model eligibility, SB1 RAS, pipeline health

### Database Schema
- [x] Add `atlas_memory` table (64 columns) — permanent, immutable, never-delete
- [x] Unique constraints on memory_id and idempotency_key
- [x] Generate migration SQL via drizzle-kit generate
- [x] Apply migration via webdev_execute_sql

### Backend
- [x] Create `server/atlasMemoryDb.ts` — insert and query helpers
- [x] Add `/api/webhook/atlas-memory/:token` endpoint to nexusRoutes.ts
- [x] Idempotent insert (ON DUPLICATE KEY UPDATE skips re-insert)
- [x] Returns HTTP 201 with inserted id and memory_id
- [x] Add `atlasMemory` tRPC router with `recent` and `stats` procedures

### Frontend
- [x] Create `client/src/pages/AtlasMemory.tsx` — Atlas Memory stream dashboard
- [x] Add route `/atlas-memory` to App.tsx
- [x] Add "Atlas Memory" nav item (BrainCircuit icon) to ARD/ORACLE group in OrionLayout

### TradingView Integration
- [x] Update "Atlas Observability Webhook — M-15" alert webhook URL to new `/api/webhook/atlas-memory/:token` endpoint
- [x] Alert confirmed Active, trigger: Any alert() function call, expiration: Open-ended
- [x] End-to-end test: HTTP 201 response confirmed from atlas-memory endpoint

## Sprint 090 — Temporal Intelligence Engine (TIE)

### PART 1 — Database Schema (5 tables)
- [x] `tie_sequences` — active and completed multi-bar sequences (id, type, start_time, end_time, duration_bars, dominant_trend, volatility_profile, vwap_behaviour, ema_behaviour, adx_evolution, atr_evolution, chop_evolution, regime, market_structure, completion_status, confidence, cluster_id, oracle_prediction_id)
- [x] `tie_sequence_library` — permanent behavioural encyclopedia (sequence_type, first_observed, last_observed, occurrences, win_rate, avg_r, avg_duration, avg_mfe, avg_mae, probability_distribution, typical_exit, best_models, worst_models, oracle_accuracy, research_status)
- [x] `tie_clusters` — automatically grouped similar sequences (cluster_id, name, description, occurrences, avg_pf, avg_duration, avg_reversal_prob, confidence, last_updated)
- [x] `tie_oracle_predictions` — per-sequence Oracle predictions vs actuals (sequence_id, predicted_outcome, actual_outcome, prediction_error, confidence_calibration, sequence_reliability, surprise_index)
- [x] `tie_research_candidates` — autonomously discovered new sequences (sequence_id, evidence_score, occurrence_count, statistical_confidence, research_priority, certification_status, first_seen, last_seen, notes)
- [x] Generate migration SQL via drizzle-kit generate
- [x] Apply migration via webdev_execute_sql

### PART 2 — TIE Engine (server-side)
- [x] `server/tieEngine.ts` — core sequence detection logic (analyses last N bars of atlas_memory, classifies active sequences, updates confidence)
- [x] `server/tieLibrary.ts` — sequence library aggregation (merged into tieEngine.ts) (win rate, avg R, avg duration, MFE/MAE, typical exit, model performance)
- [x] `server/tieClustering.ts` — pattern clustering (merged into tieEngine.ts) (groups similar sequences by behavioural fingerprint)
- [x] `server/tieExperienceScore.ts` — experience score computation (merged into tieEngine.ts) (similarity matching against historical clusters)
- [x] `server/tieDiscovery.ts` — autonomous discovery (runAutonomousDiscovery in tieEngine.ts) (weekly scan for unclassified recurring sequences)
- [x] `server/tieOracle.ts` — Oracle integration (merged into tieEngine.ts) (per-sequence prediction, actual outcome recording, calibration)
- [x] Wire TIE engine to atlas_memory SSE event (via tRPC procedures) (runs on every new bar close)

### PART 3 — tRPC Procedures
- [x] `tie.activeSequences` — current active sequences with confidence and cluster membership
- [x] `tie.experienceScore` — current experience score with similarity match and expected outcome
- [x] `tie.library` — paginated sequence library with all stats
- [x] `tie.clusters` — all clusters with occurrence counts and performance metrics
- [x] `tie.oraclePredictions` — recent Oracle predictions vs actuals
- [x] `tie.researchCandidates` — autonomously discovered candidates pending certification
- [x] `tie.sequenceHistory` — historical sequences for a given type/cluster

### PART 4 — Temporal Intelligence Dashboard Page
- [x] Create `client/src/pages/TemporalIntelligence.tsx`
- [x] Panel: Active Sequences (type, confidence, duration, cluster)
- [x] Panel: Experience Score (similarity %, cluster match, expected outcome, expected R, expected duration)
- [x] Panel: Current Behaviour Story (narrative description of unfolding sequence)
- [x] Panel: Sequence Timeline (visual bar-by-bar sequence progression)
- [x] Panel: Historical Similarity (top 3 matching historical examples)
- [x] Panel: Cluster Membership (which cluster the current sequence belongs to)
- [x] Panel: Sequence Confidence (confidence evolution chart)
- [x] Panel: Likely Outcome (Oracle prediction with probability)
- [x] Panel: Historical Examples (past occurrences of current sequence type)
- [x] Add `/tie` route to App.tsx
- [x] Add "Temporal Intelligence" nav item (GitBranch icon) to ARD/ORACLE group in OrionLayout

### PART 5 — Replay Engine Upgrade
- [x] Upgrade `client/src/pages/Replay.tsx` to support behavioural sequence replay
- [x] Add sequence overlay: show which sequence was active at each replayed bar
- [x] Add confidence evolution panel: how TIE confidence changed bar by bar
- [x] Add Oracle expectation panel: when Oracle changed predictions during replay
- [x] Add ARI permission panel: when ARI permitted execution during the sequence
- [x] Add sequence completion summary: how the sequence resolved

### PART 6 — Autonomous Discovery Heartbeat
- [x] Register weekly TIE discovery job in heartbeat scheduler (Sunday 11 PM ET = Monday 03:00 UTC) (Sunday 11 PM ET = Monday 03:00 UTC)
- [x] Job: scan atlas_memory for sequences not matching any existing cluster, generate research candidates
- [x] Push notification on discovery: "Atlas TIE: N new research candidates discovered"
- [x] Persist job to atlas_scheduled_jobs table

### PART 7 — Atlas Constitutional Amendment
- [x] Add TIE constitutional amendment to system documentation: "Markets move because of evolving behaviour. Atlas studies behaviour over time rather than isolated observations. Every sequence becomes experience. Every experience becomes intelligence."

### PART 8 — Engineering Validation
- [x] TypeScript: 0 errors
- [x] Vitest: 36/36 tests pass
- [x] TIE engine processes last 100 atlas_memory bars and generates sequences
- [x] Experience score returns valid similarity match
- [x] Checkpoint saved

## Sprint 091 — Session Coverage Panel (Atlas Memory Dashboard)

- [x] Add `atlasMemory.sessionDistribution` tRPC procedure to routers.ts
- [x] Add session coverage panel to AtlasMemory.tsx showing RTH/ETH/OV/PRE/POST bar counts + % for last 288 bars
- [x] Add "All Hours" indicator badge to dashboard header confirming 24/5 tracking is active
- [x] Expand stats row to show RTH count and non-RTH count for today

## Sprint 094 — Project DARWIN

- [x] DB schema: darwin_candidates, darwin_hypotheses, darwin_backtests, darwin_weekly_reports, darwin_self_eval tables
- [x] Apply DB migration via webdev_execute_sql
- [x] DARWIN analysis engine (darwinEngine.ts) — continuous Atlas Memory analysis, behaviour detection
- [x] Hypothesis generation with statistical significance scoring
- [x] Portfolio impact assessment (PCS, correlation, DD impact)
- [x] Robustness testing framework (sensitivity, parameter stability, stress tests)
- [x] tRPC procedures: darwin router (getCandidates, getHypotheses, getWeeklyReports, getSelfEval, getStats, triggerAnalysis)
- [x] Weekly research report scheduled job (every Sunday)
- [x] DARWIN dashboard page (live research laboratory UI)
- [x] Sprint 094 research report with constitutional amendment
- [x] Checkpoint save

## Sprint 094A — DARWIN Evolution (Autonomous Research Organisation)
- [x] Add darwin_job_queue table to schema
- [x] Add darwin_research_memory table to schema
- [x] Add darwin_exec_briefings table to schema
- [x] Apply DB migration for new tables
- [x] Build darwinAutonomous.ts: job queue manager, duplicate protection, layered scheduler
- [x] Layer 1: per-bar incremental updates (triggered by atlas-memory webhook)
- [x] Layer 2: hourly analysis (heartbeat)
- [x] Layer 3: daily research review (heartbeat)
- [x] Layer 4: weekly executive briefing (heartbeat, Sunday)
- [x] Layer 5: monthly full audit (heartbeat)
- [x] Historical knowledge ingestion: replay 2-year MNQ archive
- [x] Generate Atlas Foundational Research Report
- [x] Research economy scoring (ROI per research hour)
- [x] Owner notifications for high-confidence candidates, promotions, failures
- [x] Update DARWIN dashboard: autonomous mode, engine status, queue, velocity
- [x] Wire heartbeat scheduled jobs
- [ ] Tests: queue recovery, duplicate protection, historical replay (Sprint 100 backlog)
- [x] Save checkpoint and produce Sprint 094A report

## Sprint 095A — Discovery Validation & Regime Recalibration
- [x] AES-001 context search: Sprint 032 RC-003 rejection confirmed on real data
- [x] Regime classifier audit: ATR ratio threshold 1.10 miscalibrated for MNQ 5-min
- [x] Threshold sensitivity analysis: optimal expandThresh = 1.00 (F1-optimal)
- [x] ORB-1 retest with recalibrated regime: 83 trades, 79.5% WR, PF 7.76, PCS 91.2
- [x] ORB-1 promoted to Forward Validation
- [x] RC-002 Mean Reversion Gap Fill: REJECTED (0% WR on real data)
- [x] RC-003 Overnight Inventory: REJECTED (confirms Sprint 032)
- [x] RC-004 Failed Breakout Reversal: REJECTED (26% WR)
- [x] RC-005 Liquidity Sweep Reversal: REJECTED (4.3% WR)
- [x] RC-006 Volatility Expansion Momentum: RESEARCH FURTHER (PF 1.55)
- [x] RC-007 Session Transition Momentum: REJECTED (PF 1.40)
- [x] Portfolio health updated: 87/100, coverage 43.2%
- [x] Sprint 095A report committed to GitHub
- [x] M-16 v1.2.1: expandThresh recalibrated 1.20 → 1.00 (Part 8 action item)
- [x] M-16 v1.2.1: regime_classification JSON closing quote bug fixed
- [x] M-16 v1.2.1 committed and pushed to GitHub (sprint-051)

## Sprint 099 — Atlas Live Data Certification & Autonomous Operations Engine

- [x] AES-001: Read all institutional memory (KNOWLEDGE_BASE, ATLAS_MARKET_LAWS, Sprint 096/097/098 outputs, existing schema, scheduled jobs, routers.ts)
- [x] Add candle_certifications table to schema
- [x] Add candle_gap_log table to schema
- [x] Add market_laws table to schema
- [x] Add morning_briefs table to schema
- [x] Add live_concordance table to schema
- [x] Add pipeline_health_events table to schema
- [x] Apply DB migration via webdev_execute_sql
- [x] Seed 6 Atlas Market Laws (ML-001 through ML-006) into market_laws table
- [x] Build atlasAutonomous.ts: pipeline certification, gap detection, heartbeat monitor, morning brief, daily intelligence report, weekly executive review, live vs historical concordance, self-healing
- [x] Register 5 Sprint-099 scheduled job endpoints in scheduledJobs.ts (total: 14 endpoints)
- [x] Add Sprint 099 tRPC autonomous router to routers.ts (systemHealth, pipelineHealthEvents, candleGapLog, marketLaws, latestMorningBrief, latestConcordance, triggerMorningBrief, triggerHeartbeat, registerCronJobs)
- [x] Build permanent Atlas Owner Dashboard (/autonomous page)
- [x] TypeScript: 0 errors
- [x] KNOWLEDGE_BASE.md updated with Sprint 099 entry
- [x] SPRINT-099-Report.md committed to GitHub sprint-051
- [x] Checkpoint saved (version: 7e48f1cd)
- [ ] Register 5 Sprint-099 Heartbeat cron jobs via /autonomous dashboard (requires owner login — Sprint 100 action)

## Sprint 100A — Live Learning Certification

- [x] Add behaviour_library table to schema
- [x] Add portfolio_intelligence_inputs table to schema
- [x] Add live_learning_cert_sessions table to schema
- [x] Apply DB migration via webdev_execute_sql
- [x] Seed 8 core behaviours from Sprint 096 into behaviour_library
- [x] Build liveLearnEngine.ts: processLiveBar(), certifyCandle(), updateBehaviourLibrary(), updateSequenceLibrary(), updateMarketLawsFromBar(), writeDarwinResearchMemory(), updatePortfolioIntelligenceInputs(), runSessionCertification()
- [x] Wire processLiveBar() into atlas-memory webhook handler (non-blocking)
- [x] Add liveLearning tRPC router (7 queries + 1 mutation)
- [x] Build LiveLearningDashboard.tsx page (/live-learning)
- [x] Add /live-learning route to App.tsx
- [x] Add Live Learning Cert nav link in OrionLayout.tsx (PORTFOLIO group)
- [x] TypeScript: 0 errors
- [ ] Checkpoint saved (pending)
- [ ] Commit all outputs to GitHub sprint-051 (pending)
- [ ] Write Sprint 100A Report (pending)
- [ ] Run certification against 5 live RTH sessions (BLOCKED: M-16 fix required first)
