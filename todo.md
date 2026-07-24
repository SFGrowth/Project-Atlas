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
- [x] Checkpoint saved (version: 125a4845)
- [x] Commit all outputs to GitHub sprint-051 (commit: 977267e)
- [x] Write Sprint 100A Report
- [ ] Run certification against 5 live RTH sessions (BLOCKED: M-16 fix required first — Sprint 100B)

## Sprint 100B — Live Learning Deployment & Certification

- [x] AES-001: Read M-16 v1.2.2, deployment notes, atlas_memory schema, webhook handler
- [x] Verify M-16 script is already correct (EVENT_TYPE=BAR_OBSERVATION, alert.freq_once_per_bar_close, expandThresh=1.00)
- [x] Produce TradingView deployment instructions (correct webhook URL: /api/webhook/atlas-memory/:token)
- [ ] User deploys corrected TradingView alert (BLOCKED: requires user action in TradingView)
- [ ] Verify live pipeline: TradingView → Webhook → Atlas Memory → 7 learning steps
- [ ] Run 5-session Live Learning Certification
- [ ] Produce Atlas Live Learning Certificate
- [ ] Commit all Sprint 100B outputs to GitHub sprint-051

## Atlas Dashboard Operational Audit — 2026-07-14
- [x] BUG FIX: writeDarwinResearchMemory — wrong column names corrected to actual schema (memory_id, hypothesis_description, supporting_evidence, final_outcome, lessons_learned)
- [x] BUG FIX: updateMarketLawsFromBar — added regime normalisation (TRENDING_BULL/BEAR→TREND, CHOPPY→RANGE, TRANSITIONAL→TRANSITION) and session normalisation (OV filtered out)
- [x] BUG FIX: Health page sevClass — added CRITICAL and WARNING severity matching
- [x] BUG FIX: LiveLearningDashboard M-16 warning — replaced hardcoded static warning with conditional display driven by recentGaps data
- [ ] AUDIT FINDING: darwin_research_memory has 0 rows — will self-heal after MEMORY_WRITE_FAILURE fix deployed
- [ ] AUDIT FINDING: ML-002/ML-006 live_observations_consistent = 0 — will self-heal after regime/session normalisation fix deployed
- [ ] AUDIT FINDING: pipeline_reports contain only test payloads — model_a1/a3/b1 fields null (no real M-16 OBSERVABILITY schema bars yet)
- [ ] AUDIT FINDING: DARWIN candidates missing hypothesisType/status/certificationStatus — schema mismatch between tieResearchCandidates and darwin_research_candidates tables
- [ ] AUDIT FINDING: SB1 paper trades = 0, candle certifications = 0 — no live RTH session data yet
- [ ] AUDIT FINDING: GitHub connector token had zero scopes — fixed with Atlas-Manus-Access PAT

## Sprint 101 — DARWIN Autonomous Research Orchestration Engine (CRO)

- [x] AES-001: Read all institutional knowledge (ATLAS.md, KNOWLEDGE_BASE.md, PRODUCTION_FREEZE.md, existing DARWIN schema, darwinAutonomous.ts, darwinEngine.ts, scheduled jobs)
- [x] Schema migration: darwin_research_queue table (14 fields, ERV-based prioritisation)
- [x] Schema migration: darwin_rejection_registry table (permanent hypothesis archive)
- [x] Schema migration: darwin_cro_reports table (weekly CRO reports)
- [x] Schema migration: darwin_work_log table (per-session autonomous work diary)
- [x] Schema migration: darwin_promotion_gates table (8-stage gate decisions)
- [x] DB migration 0012 applied via webdev_execute_sql
- [x] Build darwinCroEngine.ts: getCroDashboardStats, getResearchQueue, getPromotionGates, getRejectionRegistry, getWorkLog, getCroReports, enqueueResearch, rejectResearch, reprioritiseQueue, runDailyCroWork, generateWeeklyCroReport
- [x] Add darwin-cro-daily scheduled job (5PM ET weekdays) to scheduledJobs.ts
- [x] Add darwin-cro-weekly scheduled job (Sunday 8PM ET) to scheduledJobs.ts
- [x] Add 8 CRO tRPC procedures to darwin router in routers.ts (croDashboardStats, croResearchQueue, croPromotionGates, croRejectionRegistry, croWorkLog, croCroReports, enqueueResearch, rejectResearch, triggerCroDaily, triggerCroReport)
- [x] Build DarwinCRO.tsx page (/darwin-cro) with 10 panels: Stats, Research Queue, Promotion Gates, Rejection Registry, Work Log, CRO Reports, Portfolio Gaps, ERV Chart, Manual Enqueue, Trigger Controls
- [x] Add DARWIN CRO nav entry to PORTFOLIO section in OrionLayout.tsx
- [x] Add /darwin-cro lazy route to App.tsx
- [x] Wire recursive learning hook in processLiveBar() — reprioritiseQueue() fires every 20th bar (fire-and-forget)
- [x] Write darwinCroEngine.test.ts — 17 new tests (ERV calculation, promotion gate thresholds, portfolio gap analysis, rejection reason codes, work log structure)
- [x] All 53 tests pass (5 test files)
- [x] TypeScript: 0 errors
- [x] Checkpoint saved (version: sprint-101)
- [ ] Register darwin-cro-daily and darwin-cro-weekly Heartbeat cron jobs via /autonomous dashboard (requires owner login)
- [ ] First daily CRO run will auto-populate research queue from existing DARWIN candidates

## Sprint 102 — Portfolio Intelligence Audit
- [x] AES-001: Read all institutional knowledge (ATLAS.md, KNOWLEDGE_BASE.md, PRODUCTION_FREEZE.md, sprint-051 branch, DARWIN schema)
- [x] Repository Sync: Merged sprint-051 branch (56 commits, Sprints 051-100A) into main — governance violation resolved
- [x] Created ATLAS_BEHAVIOUR_LIBRARY.md (8 behaviours documented)
- [x] Created ATLAS_CANDIDATE_REGISTRY.md (7 candidates documented)
- [x] Created ATLAS_REJECTION_REGISTRY.md (9 rejections archived)
- [x] Created ATLAS_SEQUENCE_LIBRARY.md (3 sequences documented)
- [x] Updated KNOWLEDGE_BASE.md with Sprint 100A and Sprint 101 entries
- [x] Part 1: Complete Portfolio Audit — all 5 production models, ORB-1 paper, 7 DARWIN candidates queried from live DB
- [x] Part 2: Gap Analysis — RANGE (53.3% of days), VOLATILE (19.6%) have zero certified coverage. PCS 66.1.
- [x] Part 3: Two-year historical search (140,933 bars) — regime distribution, pre-market level respect (75.2%), VOLATILE ORB viability
- [x] Part 4: Candidate Registry Review — 4 archived/rejected (RC-003, RC-004, RC-005, RC-007), 2 new registered (RC-NEW-001, RC-NEW-002)
- [x] Part 5: Paper Trading Review — ORB-1 on track (84% WR, PF 6.26, PCS 91.2, ~50% through 60-day period)
- [x] Part 6: Research Roadmap — 4 items in priority queue, path to PCS 80.0 mapped across 3-4 sprints
- [x] Part 7: Autonomous Promotion Recommendations — RC-006 escalated to BACKTEST, ORB-1 continue paper
- [x] Part 8: Executive Questions answered (scale capital, highest-leverage action, ORB-1 readiness, B1 status, RC-003/004/005/007 fate)
- [x] Portfolio Intelligence dashboard rebuilt with live data (6 tabs: Overview, Gap Analysis, Research Queue, Candidates, Paper Trading, Roadmap)
- [x] DB updates: RC-003 archived, RC-004/005/007 rejected, REJ-010/011/012 added to rejection registry, RC-NEW-001/002 registered, 4 research queue items added
- [x] Sprint 102 report written: research/sprint-102-portfolio-intelligence-audit.md
- [x] GitHub commit: a9c10dc — all outputs pushed to main
- [x] Checkpoint saved (version: 7f92e82b)

## Sprint 104A — Executive Portfolio Intelligence Dashboard

- [x] Add `strategy_performance_snapshots` table to schema (per-model daily snapshots for historical charting)
- [x] Add `risk_profiles` table to schema (configurable risk profiles: Prop $450, Live $1650, Custom)
- [x] Apply DB migration via webdev_execute_sql
- [x] Build `executive` tRPC router: homeStats, strategyPerformance, riskAnalytics, portfolioOverview, gapAnalysis, liveFeed
- [x] Build ExecutivePortfolio.tsx page (/executive-portfolio) with 5 sections: Model Cards, Portfolio View, Gap Analysis, Risk Analytics, Live Feed
- [x] Per-model cards: 30 fields (status, stage, confidence, risk profile, regime, session, today/7d/30d/all-time stats, streaks, PCS, promotion countdown, recommendation)
- [x] Portfolio view: PCS, PF, WR, drawdown, health, capital allocation, active models, research priority, projection
- [x] Gap analysis: gaps, severity, expected PCS improvement, research time, probability, progress
- [x] Risk profile selector: Prop ($450) / Live ($1650) / Custom — instant recalculation of all P&L projections
- [x] Live intelligence feed: auto-refresh every 30s + invalidate on trade close
- [x] Add "Executive Portfolio" nav entry to PORTFOLIO group in OrionLayout.tsx
- [x] Add /executive-portfolio lazy route to App.tsx
- [x] Write vitest tests for executive router procedures
- [x] TypeScript: 0 errors
- [x] Checkpoint saved
- [x] GitHub commit to main
- [x] Sprint 104A report written and committed

## Sprint 104C — Autonomous Pipeline Monitor

- [x] Build `server/monitor/barEvaluator.ts` — per-bar integrity check, model eligibility engine, gap/duplicate detection
- [x] Build `server/monitor/paperTradeEngine.ts` — full paper-trade lifecycle: entry, tracking, exit, P&L calculation
- [x] Build `server/monitor/sessionReporter.ts` — end-of-RTH-session report: bars, models, signals, trades, P&L, certification status
- [x] Wire monitor into nexusRoutes.ts — called on every successful atlas-memory write
- [x] Add `monitor_evaluations` DB table — per-bar evaluation log with model eligibility reasons
- [x] Add `live_learning_sessions` DB table — certification session tracking (5-session LLC)
- [x] Add `session_reports` DB table — end-of-session report storage
- [x] Expose monitor status via `executive.monitorStatus` tRPC procedure
- [x] Display live eligibility status on Executive Portfolio dashboard (Live Feed section)
- [x] GitHub commit after each material correction or completed certification report

## Sprint 104D — Operational Verification Phase

- [x] Session startup protocol: GitHub connector ENABLED, atlas_memory LIVE (156 bars in 24h)
- [x] Backfill 158 pre-deployment atlas_memory bars into monitor_evaluations
- [x] Audit: 3 gaps detected (2 legacy test-payload gaps, 1 real 1397-min gap at session boundary), 1 integrity failure (null OHLCV test row), 0 duplicates
- [x] Build /pipeline-monitor page — regime, session, last bar, ADX, model eligibility grid, open positions, LLC progress, evaluation log, closed trades, session reports
- [x] Add Pipeline Monitor nav entry to PIPELINE group in OrionLayout.tsx
- [x] Register /pipeline-monitor route in App.tsx
- [x] Expand monitorStatus to return 20 bars with per-model eligibility per bar
- [x] Add getRecentClosedTrades() helper to paperTradeEngine.ts
- [x] Add getTradeEvidenceReport() helper to paperTradeEngine.ts
- [x] Add executive.recentClosedTrades tRPC procedure
- [x] Add executive.tradeEvidence tRPC procedure
- [x] TypeScript: 0 errors
- [x] Tests: 77/77 passing
- [ ] First valid RTH session received and evaluated (PENDING — awaiting market open)
- [ ] First eligible model signal fires (PENDING — awaiting TRENDING regime in RTH)
- [ ] First paper-trade lifecycle completed (entry → MFE/MAE tracking → exit → P&L)
- [ ] Evidence report auto-generated for first signal
- [ ] Session 1 of 5 LLC certification report generated and committed to GitHub
- [ ] Sessions 2-5 LLC certification (PENDING — requires 5 clean RTH sessions)
- [ ] LLC 5-session certificate earned

## Sprint 104E — Defect Fixes (from Daily Ops Report 2026-07-14)

- [x] DEF-001 CRITICAL: Fix SB1 backfill contamination — mark 6 contaminated trades INVALID, add price sanity check to backfill script, add atomic hasOpenPosition() check
- [x] DEF-002 HIGH: Fix sessionReporter RTH close trigger — verify 16:00 ET session-close detection logic fires correctly
- [x] DEF-003 MEDIUM: Fix dashboard P&L to exclude contaminated/invalid trades from performance queries
- [x] Audit historical 30-day paper trade corpus for data quality — 507 PAPER SB1 trades, 4 PAPER paper_trades, all BACKTEST/TEST/CONTAMINATED excluded
- [ ] Review A1 ATR stop multiplier (1.5× → 2.0×) for TRENDING_BULL regime
- [x] Generate Atlas Daily Operations Report 2026-07-14 (local commit 1ffb3a3, GitHub push blocked — SFGrowth org lacks CreateRepository permission)

## Sprint 104E — Operational Integrity & Live Certification

### P1 — DEF-001 SB1 Contamination Fix
- [x] Add `data_source` and `provenance` columns to `paper_trades` and `sb1_paper_trades`
- [x] Mark all 12 TEST_ID sb1 trades as CONTAMINATED (id LIKE 'test-%')
- [x] Mark ATLAS_BACKTEST_2YR paper_trades as BACKTEST provenance
- [x] Mark ATLAS_MNQ_PAPER paper_trades as TEST provenance
- [x] Mark ATLAS_MONITOR_PAPER paper_trades as PAPER provenance
- [x] Mark SB1 LEGACY_PRICE_BACKTEST (entry < 25000, no test-id) as BACKTEST provenance
- [x] Mark SB1 PRICE_25000_28000 and LIVE_PRICE_GT28000 as PAPER provenance
- [x] Add price sanity check to paperTradeEngine.ts (entry must be within 20% of current bar close)
- [x] Add atomic hasOpenPosition() guard using DB unique constraint on (account/model, OPEN status)
- [x] Update all performance queries to exclude CONTAMINATED and TEST provenance

### P2 — Dashboard Reconciliation
- [x] Fix executive.strategyPerformance to filter by provenance=PAPER only
- [x] Fix executive.monitorStatus to exclude contaminated trades
- [x] Verify today/7d/30d/all-time P&L matches clean DB values exactly
- [x] Add provenance filter to all portfolio analytics queries

### P3 — Historical Data Audit
- [x] Write audit report: classify all 1,778 SB1 + 648 paper_trades by provenance
- [x] Confirm test data never appears in production analytics

### P4 — LLC Certification
- [x] Fix DEF-002: wire sessionReporter RTH close trigger (16:00 ET detection)
- [x] Add 5-session LLC progress display to Pipeline Monitor dashboard
- [x] Restart LLC window from next clean RTH session

### P5 — Automated Daily Ops Report
- [x] Build auto-report generator triggered at RTH close via heartbeat
- [x] Include all 6 sections: System/Market/Models/Portfolio/Live Learning/LLC
- [x] Store report in session_reports table and commit to GitHub

### P6 — Portfolio Intelligence View
- [x] Build /portfolio-intelligence page with per-strategy stats
- [x] Support today/7d/30d/all-time windows per model
- [x] Risk profile selector: $450 (Prop), $1,650 (Live), custom
- [x] Display: trades, WR, PF, net P&L$, net P&L R, avg win, avg loss, drawdown, streak, eligibility

## Sprint 105 — Portfolio Intelligence & DARWIN Expansion

- [x] Institutional knowledge audit: strategy registry, market laws, behaviour library, DARWIN candidates
- [x] Portfolio gap analysis against 280 live bars: regime distribution, session distribution, coverage %
- [x] Candidate registry review: promotion assessment for all active candidates
- [x] Add `executive.portfolioCoverage` tRPC procedure — live regime distribution vs coverage
- [x] Add `executive.candidateRegistry` tRPC procedure — full registry + DARWIN + laws + behaviours
- [x] Add `executive.darwinDiscovery` tRPC procedure — DARWIN research status + live ML-001 validation
- [x] Add `executive.weeklyReport` tRPC procedure — 7d performance (PAPER provenance only)
- [x] Add `executive.monthlyReport` tRPC procedure — 30d performance (PAPER provenance only)
- [x] Build `/portfolio-coverage` page — live coverage map, regime distribution, strategy pipeline
- [x] Build `/darwin-discovery` page — DARWIN research status, behaviour library, market laws
- [x] Register 5 new DARWIN hypotheses: H001 CHOPPY_RANGE_MEAN_REVERSION, H002 TRANSITIONAL_BREAKOUT_FADE, H003 LUNCH_COMPRESSION_BREAKOUT, H004 VOLATILE_ORB_EXTENSION, H005 OV_SESSION_VWAP_ANCHOR
- [x] Write Sprint 105 closure report with all 9 executive questions answered
- [x] Commit to Project-Atlas (commit 8b9f7e6)

## Sprint 106 — DARWIN Behavioural Discovery Engine

- [x] Repository audit: git log, Behaviour Library, Market Laws, Sequence Library, Candidate Registry
- [x] Behavioural clustering: classify all 286 live bars by behaviour type (21 behaviour classes)
- [x] Sequence discovery: 12 statistically significant 3-bar sequences identified
- [x] Market Law ML-010 admitted: Wick Rejection Continuation (76.0%, 25 obs, 77.8% confidence)
- [x] 4 law candidates tested and not admitted (insufficient observations or below threshold)
- [x] 7 DARWIN candidates generated: DARWIN-S106-001 through DARWIN-S106-007
- [x] 8 Behaviour Library entries registered: BL-009 through BL-016
- [x] 12 Sequence Library entries registered in tie_sequence_library
- [x] Sprint 106 closure report written and committed to Project-Atlas (commit e4f8c35)
- [x] All 8 executive questions answered with database evidence

## Sprint 107 — VWAP Behavioural Decomposition (2026-07-15)

- [x] Mandatory repository audit: git log, all registries, atlas_memory schema (293 bars)
- [x] VWAP deviation event extraction: 10 episodes identified, avg 26.3 bars, 89.8% of bars deviating
- [x] Behavioural decomposition: 6 families tested, 2 warranted by evidence
- [x] Statistical separation test: bimodal duration distribution (2-5 bars vs 11-119 bars) confirms 2 distinct families
- [x] Disprove DARWIN-S106-001 original hypothesis: only 10% mean reversion observed, 90% continuation
- [x] Revise DARWIN-S106-001 confidence to 28% (INVESTIGATING stage)
- [x] Add DARWIN-S107-001 VWAP_REJECTION_RETURN (45% conf, HYPOTHESIS, 3 obs)
- [x] Add DARWIN-S107-002 VWAP_CONTINUATION_TREND_RIDER (58% conf, INVESTIGATING, 10 obs)
- [x] Add DARWIN-S107-003 VWAP_EPISODE_BOUNDARY (42% conf, HYPOTHESIS, 10 obs)
- [x] Update BL-009 VWAP_DEVIATION (293 obs, 90% continuation rate)
- [x] Add BL-017 VWAP_CONTINUATION (293 obs)
- [x] Add BL-018 VWAP_REJECTION_RETURN (3 obs)
- [x] Add BL-019 VWAP_EPISODE_STRUCTURE (293 obs)
- [x] Add 3 Sequence Library entries (CONTINUATION_LONG, REJECTION_SHORT, EXPANSION_ONSET)
- [x] Write Sprint 107 closure report answering all 5 executive questions with evidence
- [x] Commit to Project-Atlas (commit 192e3cc)
- [x] 77/77 tests passing, 0 TypeScript errors

## Sprint 108 — Institutional Validation of DARWIN-S107-002 (2026-07-15)

- [x] Mandatory repository audit: git log, all registries, locate 2-year MNQ dataset
- [x] Re-download 2-year MNQ 5-min OHLCV from Massive.com (136,198 bars, MNQU4-MNQM6)
- [x] Create permanent `mnq_candles` database table — survives sandbox resets
- [x] Store MASSIVE_API_KEY as permanent project secret
- [x] Part 1 — Full 2-year replay: 579 trades, WR 52.7%, PF 1.058, P&L +$1,728 — FAIL (4/7 thresholds)
- [x] Part 2 — Robustness: AM session has real edge (WR 58.1%), LUNCH/PM destroy edge
- [x] Part 3 — Stability: Q1-Q2 2025 PF 0.821 — UNSTABLE across 4 periods
- [x] Part 4 — Monte Carlo: 34.7% prop firm pass rate — INSUFFICIENT
- [x] Part 5 — Portfolio contribution: 12.1% coverage, Calmar 0.721
- [x] Executive decision: RESEARCH — do not promote, refine session filter + target
- [x] Update DARWIN-S107-002 confidence 58%→42%, stage→investigating, evidence 579 trades
- [x] Register DARWIN-S108-001 (AM_VWAP_CONTINUATION) — P1 priority, 62% confidence
- [x] Write Sprint 108 closure report and commit to Project-Atlas (commit 9e8fa11)

## Dataset Recovery Validation Gate — Mandatory Pre-Sprint 108 Acceptance Audit

- [x] Part 1+2: Dataset identity audit — exact row count, date range, instrument, provider, timezone, session coverage, contract symbols, roll methodology; reconcile 136,198 vs 140,933 bars (4,735 difference)
- [x] Part 3: Full data-quality audit — duplicates, OHLC integrity, gaps classified by type (MARKET_CLOSED/CME_MAINTENANCE/HOLIDAY/EARLY_CLOSE/CONTRACT_ROLL/PROVIDER_MISSING/IMPORT_FAILURE/UNKNOWN)
- [x] Part 4+6: Create permanent provenance record in DB (dataset_provenance table), declare Atlas Canonical MNQ 5-Minute Dataset with canonical row count, checksum, version
- [x] Part 5: Durable backup — manifest.json, checksums.json, recovery.mjs, verify.mjs committed to Project-Atlas
- [x] Part 7: Re-run Sprint 108 DARWIN-S107-002 against certified canonical dataset, cite dataset ID/version in all results
- [x] Part 8 + Repository Protocol: Add Memory Safeguard rule, update all registries, write DATASET-RECOVERY-VALIDATION-GATE.md reconciliation report, commit to Project-Atlas

## Sprint 109 — Behavioural Discriminator Discovery (2026-07-15)

- [x] Repository audit: git log, verify canonical dataset ATLAS-MNQ-5M-V1 v1.0 checksum, load all registries
- [x] Part 1: Trade forensics — extract 27 features for all 643 DARWIN-S107-002 trades
- [x] Part 2: Winner vs loser analysis — 13 significant discriminators found
- [x] Part 3: Feature importance ranking — top 5 discriminators identified
- [x] Part 4: Behavioural subgroup clustering — 4 groups: ALIGNED_FLOW (PF 4.23), MIXED, COUNTER_FLOW (PF 0.94), OR_BREAKOUT
- [x] Part 5: Portfolio impact — triple filter achieves PF 4.609, Max DD $685, Calmar 49.8
- [x] Part 6: Executive decision — SPLIT+REFINE: S107-002 RETIRED, S109-001 HYPOTHESIS, S109-002 RESEARCH
- [x] Update Behaviour Library (BL-020/021/022), Sequence Library (SEQ-016/017), Market Laws (ML-011/012), DARWIN Registry
- [x] Write Sprint 109 closure report and commit to Project-Atlas
- [x] Push to SFGrowth/Project-Atlas — commit c253fb4, 4 files, push verified

## Sprint 110 — Out-of-Sample Validation of DARWIN-S109-001 (2026-07-15)

- [x] Part 1: Freeze DARWIN-S109-001 hypothesis — locked, no optimisation
- [x] Part 2: OOS validation — 6/6 WF windows positive, 4/4 expanding windows, 3/3 years, 8/8 quarters, 5/5 regimes
- [x] Part 3: Stability — PF CV=0.098, WR CV=0.034, no dominant quarter, worst 3Q = +$10,587
- [x] Part 4: Monte Carlo — ruin 0.4%, prop pass 99.6%, positive 100%, median DD $2,452
- [x] Part 5: VERDICT — WALK FORWARD — 10/10 thresholds passed, DARWIN-S109-001 promoted
- [x] Committed to SFGrowth/Project-Atlas — commit 135840f, 2 files, push verified

## Sprint 111 — Live Walk-Forward Validation of DARWIN-S109-001 (2026-07-15)

- [x] Repository audit: git log, load all registries, Sprint 110 closure, canonical dataset
- [x] Database schema: wf_live_trades, wf_sessions, wf_drift_alerts, wf_daily_reports — migrated
- [x] Live signal engine: wfDb.ts + wfRouter.ts + webhook hook in nexusRoutes.ts — TypeScript clean
- [x] Walk-Forward dashboard at /walk-forward: promotion gate, KPIs, live vs benchmark, drift alerts, trade log, sessions
- [x] Daily executive report generator: auto-fires on PM_CLOSE bar, writes wf_sessions + wf_daily_reports
- [x] Registry updates, Sprint 111 closure report, commit 69321b9 pushed to SFGrowth/Project-Atlas

## Sprint 112 — Apex 50K Evaluation Validation Plan (2026-07-15)

- [x] Repository audit: git log, load all registries, Sprint 111 closure, Apex/Tradovate docs
- [x] Part 1: Apex 50K risk analysis — 99.6% pass probability, 0.4% ruin, median 5 trades to pass
- [x] Part 2+3: APEX-EXECUTION-WORKFLOW.md + divergence engine (NONE/EXPECTED/ELEVATED/OUTCOME/ERROR)
- [x] Part 4: apex_trades + apex_account_snapshots tables, apexRouter.ts, ApexEvaluation.tsx at /apex-evaluation
- [x] Part 5+6: APEX-CAPITAL-SCALING-ROADMAP.md — 4 phases, $450→$5,100 daily exposure scaling
- [x] Part 7: Sprint 112 closure report, commit f8b9a71 pushed to SFGrowth/Project-Atlas

## ARP-1 — Atlas Autonomous Research Program 1

- [x] Repository audit: git log, verify canonical dataset, load all registries, Sprint 112 closure
- [x] Program A: Live operations continuity — 8 processes monitored, real-time status
- [x] Program B: Continuous discovery engine — per-bar behaviour analysis, candidate generation, market law updates wired into webhook
- [x] Program C: Portfolio coverage tracker — wired into PM_CLOSE pipeline
- [x] Program D: Model lifecycle state machine — 9 states, auto-promotion rules, 7 models seeded
- [x] Program E: Portfolio intelligence engine — PF, WR, DD, diversification score, regime coverage at PM_CLOSE
- [x] Program F: Weekly self-review generator — Heartbeat cron Sunday 22:00 UTC (18:00 ET)
- [x] Program G: Daily owner briefing — Heartbeat cron weekdays 12:00 UTC (08:00 ET)
- [x] ARP-1 Command Centre dashboard page at /arp1 — unified 7-program status view with lifecycle transitions
- [x] ARP-1 closure report commit f473d5e pushed to SFGrowth/Project-Atlas

## TradersPost Multi-Strategy Alert Audit & Implementation

- [x] Part 1+9: Full Pine repository audit — find A1/A3/B1/M-14/M-15/M-16 files, answer all 9 required questions with code evidence
- [x] Parts 2+3+4: Architecture design — dual-pipeline separation, governance preservation, single-strategy rule
- [x] Part 5: Server-side dispatch for S109-001 (frozen/PRE_LIVE_GATE gate in tpDispatch.ts) — Pine Script deferred to Pine Sprint
- [x] Part 5: Server-side dispatch for A1 (tpDispatch.ts gate 1+2) — Pine Script deferred to Pine Sprint
- [x] Part 5: Server-side dispatch for A3 (tpDispatch.ts gate 1+2) — Pine Script deferred to Pine Sprint
- [x] Part 5: Server-side dispatch for B1 (tpDispatch.ts gate 1+2) — Pine Script deferred to Pine Sprint
- [x] Part 6: TradersPost payload spec implemented in tpDispatch.ts — { ticker, action, price, quantity } + idempotency key
- [x] Part 7: TradingView alert inventory documented in TRADERSPOST-ARCHITECTURE.md
- [x] Part 8: Testing checklist — 17 vitest tests cover all safety gates, idempotency, payload structure, stats aggregation
- [x] Repository Protocol: TRADERSPOST-AUDIT-PART1.md + TRADERSPOST-ARCHITECTURE.md committed to SFGrowth/Project-Atlas master (82fe175)

## Sprint 113 — TradersPost Server-Side Integration (Completed)

- [x] Part 1 audit: answered all 9 questions with code evidence — TRADERSPOST-AUDIT-PART1.md
- [x] Architecture design: dual-pipeline separation, governance preservation, single-strategy rule — TRADERSPOST-ARCHITECTURE.md
- [x] DB schema: tp_config + tp_dispatch_log tables (migration 0021 applied)
- [x] Seed: 4 strategies seeded (A1, A3, B1, S109-001) — all DISARMED by default
- [x] server/tpDb.ts: getAllTpConfigs, armStrategy, disarmStrategy, setTpWebhookUrl, setNotes, getRecentTpDispatches, getTpDispatchStats
- [x] server/tpDispatch.ts: dispatchToTradersPost() with 3-gate safety system (DISARMED / FROZEN / SAFETY_HALTED / PRE_LIVE_GATE_BLOCKED)
- [x] server/tpRouter.ts: tRPC procedures — getConfigs, armStrategy, disarmStrategy, setWebhookUrl, setNotes, getDispatchLog, getDispatchStats
- [x] server/routers.ts: tpRouter registered under tp namespace
- [x] server/monitor/paperTradeEngine.ts: processBar() return type extended with signalFired, signalModel, signalDirection, signalEntry, signalStop, signalTarget
- [x] server/nexusRoutes.ts: TradersPost dispatch hook wired after processBar() — non-blocking setImmediate
- [x] client/src/pages/TradersPost.tsx: full management dashboard — ARM/DISARM controls, webhook URL config, operator notes, dispatch log, per-strategy stats, architecture reference
- [x] client/src/App.tsx: /traderspost route registered
- [x] client/src/components/OrionLayout.tsx: TradersPost nav item added to EXECUTION group
- [x] server/tp.test.ts: 17 new vitest tests — all 95 tests pass (0 failures)

## Sprint 113b — Home Page Paper Trading + RUN DEMO Animation

- [x] Fix Paper Trading panel: pull real stats from DB (total trades, win rate, P&L per model, open trades)
- [x] Rebuild RUN DEMO: 14-stage sequential pipeline animation showing bar arriving → criteria checks → final_approved → trade fires
- [x] RUN DEMO: each stage lights up with pass/fail colour as it evaluates
- [x] RUN DEMO: final stage shows trade card (model, direction, entry, stop, target) when approved

## Sprint 113c — Home Page Redesign (Command Centre Summary)

- [x] Add getPaperSummaryStats DB helper: today/week/month P&L, win rate, trade count — provenance=PAPER only
- [x] Add paper.summaryStats tRPC procedure
- [x] Redesign Home.tsx: market state strip (regime, session, ADE, ARI, TVL, circuit breaker)
- [x] Home.tsx: P&L panels — Today / This Week / This Month with win rate, trade count, per-model breakdown
- [x] Home.tsx: open trade card (if any trade is currently OPEN)
- [x] Home.tsx: keep pipeline orb + RUN DEMO but make it secondary below the summary
- [x] RUN DEMO: animate with stage labels and final trade-fire card

## Sprint 113d — P&L Panel Trade Log

- [ ] Replace per-model summary rows in P&L panels with per-trade rows: date, entry time/price, exit time/price, final P&L
- [ ] getPaperSummaryStats: include full trade list per bucket (openedAt, closedAt, entryPrice, exitPrice, pnl, model, direction)

## Sprint 113e — Risk Override
- [ ] Add editable risk input on home page P&L section — default $800, user can change it and all trade rows update
- [ ] Risk override persists in localStorage
- [ ] Show R-multiple (P&L / risk) for each trade alongside the risk amount

## Sprint 114 — Unified Portfolio Architecture (All 6 Strategies via ADE Ranking)

- [x] Define ProposalCandidate interface in shared/types.ts (model, direction, entry, stop, target, adeScore, riskDollars, contracts, sessionOk, regimeOk)
- [x] Extend barEvaluator.ts to evaluate S109-001 eligibility (VWAP deviation + RSI + OV inventory) and return s109Eligible + s109Signal
- [x] Refactor paperTradeEngine.processBar: collect all 6 proposals, rank by ADE score, apply ARI+TVL gates, open single top-ranked trade
- [x] Remove the separate S109-001 setImmediate block in nexusRoutes.ts (S109-001 now flows through processBar)
- [x] Wire tpDispatch to the single final-approved strategy from processBar result
- [x] Remove PRE_LIVE_GATE and FROZEN guards from S109-001 in tpDispatch.ts and tp_config
- [x] Update TradersPost dashboard: show all 6 strategies in unified portfolio view
- [x] Update home page P&L panels: include S109-001 trades (now in paper_trades, not wf_live_trades)
- [x] Write/update vitest tests covering unified ranking, ARI gate, single-strategy rule
- [x] TypeScript: 0 errors after all changes

## Sprint 115 — Atlas Permanent Research Directive: Gap Discovery Engine

- [x] Create gap_discovery_reports table in schema (weekly gap reports, gap candidates, priority scores)
- [x] Create gap_candidates table (impact, confidence, effort, benefit, risk_reduction, priority, status)
- [x] Write gapDiscoveryEngine.ts: autonomous analysis of atlas_memory, paper_trades, monitor_evaluations, strategy_registry
- [x] Implement 12 gap analysis dimensions (market regimes, model coverage, losing trade concentration, etc.)
- [x] Implement autonomous question framework (10 questions evaluated per weekly run)
- [x] Write gapDiscoveryRouter.ts: tRPC procedures for gap report, candidates, recommendations
- [x] Create DARWIN Gap Discovery scheduled job (weekly, Sunday 18:30 ET via /api/scheduled/atlas-gap-analysis)
- [x] Build Gap Discovery dashboard page (top 10 gaps, research opportunities, engineering improvements)
- [ ] Weekly Gap Report PDF generation (auto-produced every Sunday) — deferred to Sprint 116
- [x] Add Gap Discovery to sidebar navigation under PORTFOLIO section

## Sprint 114A — Unified Execution Control & Single TradersPost Route

- [x] Audit Sprint 113/114 per-strategy webhook architecture and answer Part 6 questions
- [x] Add portfolio_execution_config table (singleton: PAPER_ONLY/APEX_EVAL_ACTIVE/HALTED)
- [x] Add portfolio_strategy_controls table (per-strategy ENABLED/PAUSED/RETIRED/FAULTED)
- [x] Seed portfolio_execution_config (id=1, PAPER_ONLY, APEX_50K_EVAL) and all 6 strategies ENABLED
- [x] Write portfolioExecDb.ts: getPortfolioExecConfig, setExecutionState, setPortfolioWebhookUrl, getAllStrategyControls, setStrategyStatus, recordStrategyProposal, updateLastDispatch
- [x] Rewrite tpDispatch.ts: single unified webhook, gate order (idempotency → exec state → webhook URL → safety → dispatch), payload includes selected_strategy_id
- [x] Rewrite tpRouter.ts: getPortfolioConfig, setWebhookUrl, activateApex, haltPortfolio, resumePaper, getStrategyControls, setStrategyStatus, getDispatchLog, getDispatchStats
- [x] Redesign TradersPost.tsx: Portfolio Execution panel (state, webhook, activate/halt/resume), Strategy Eligibility panel (6 strategies with PAUSE/ENABLE controls), Dispatch Log
- [x] Remove per-strategy ARM/DISARM from dashboard (replaced by single ACTIVATE APEX button)
- [x] TypeScript: 0 errors after all changes
- [x] 14 new Sprint 114A vitest tests (execution state transitions, gate logic, strategy controls, single webhook)
- [x] 115/115 tests pass

## Sprint 116 — DARWIN Daily Research Reports + GitHub Knowledge Archive (completed 2026-07-15)

- [x] Create darwin_daily_reports table in schema (migration 0024)
- [x] Write darwinDailyReport.ts: 10-section LLM-powered report generator (Executive Summary, Market Regime, Portfolio Performance, Model Health, Behaviour Library, Market Law Validation, DARWIN Pipeline, Gap Discovery, Risk & Execution, Tomorrow's Priorities)
- [x] Write darwinGitArchive.ts: commit DARWIN-YYYY-MM-DD.md to SFGrowth/Project-Atlas/research/daily/YYYY/MM/ via gh CLI
- [x] Write darwinDailyReportRouter.ts: tRPC procedures (getReports, getReport, runReport, getStats)
- [x] Wire darwinDailyReportRouter into appRouter in routers.ts
- [x] Register /api/scheduled/darwin-daily-report endpoint in scheduledJobs.ts (17:30 ET weekdays)
- [x] Build DarwinDailyReport.tsx dashboard page (report list, stats, full Markdown viewer with syntax highlighting)
- [x] Add DARWIN Daily Reports nav item to OrionLayout.tsx (PORTFOLIO section)
- [x] Add /darwin-daily-reports route to App.tsx
- [x] Write darwinDailyReport.test.ts — 22 tests covering date derivation, GitHub paths, Markdown structure
- [x] TypeScript: 0 errors · 152/152 tests pass
- [ ] Update weekly gap report to aggregate 7 daily DARWIN reports (weekly integration) — deferred to Sprint 117

## Sprint 117 — Atlas Unified Portfolio Pine Script (completed 2026-07-15)

- [x] Audit ADE scoring rules (barEvaluator.ts, paperTradeEngine.ts) for exact Pine parity
- [x] Write tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine (450+ lines, all 6 strategies, ADE selection, chart visualisation, drift guard, webhook)
- [x] Pine: ADE-parity selection hierarchy (VWAP deviation scoring for S109, ADX for A1/A3, fixed scores for SB1/ORB-1/B1)
- [x] Pine: single-active-strategy rule (no entry while portfolio position open)
- [x] Pine: chart visualisation — entry/exit markers, strategy labels, trade lines, R/R boxes
- [x] Pine: debug table (eligibility, scores, rejection reasons)
- [x] Pine: deterministic event IDs, no repainting, confirmed-bar logic
- [x] Pine: full JSON webhook payload with strategy_id, score, regime, reason, rule_hash
- [x] Pine: all supported events (entry, exit, stop, target, cancel, flatten)
- [x] Write README.md, WEBHOOK_SCHEMA.md, ADE_PARITY_SPEC.md, CHANGELOG.md, strategy_manifest.json
- [x] Schema: add 13 pine_metadata fields to strategy_registry (migration 0025)
- [x] Seed pine_metadata for all 6 strategies in strategy_registry
- [x] Write server/pineStatusRouter.ts: getPortfolioStatus, updateParityStatus, toggleWebhook, recordSignal, getManifest
- [x] Wire pineStatusRouter into appRouter in routers.ts
- [x] Build client/src/pages/PortfolioPineStatus.tsx — parity dashboard with drift detection, strategy table, manifest info
- [x] Add Code2 icon and Portfolio Pine Status nav item to OrionLayout.tsx (PORTFOLIO section)
- [x] Add /portfolio-pine-status route to App.tsx
- [x] Write server/pineStatus.test.ts — 33 tests covering ADE scoring, proposal selection, drift detection, webhook validation, manifest invariants, parity status derivation
- [x] TypeScript: 0 errors · 185/185 tests pass (11 test files)
- [ ] Commit Pine files to SFGrowth/Project-Atlas/tradingview/atlas-unified-portfolio/ — deferred (GitHub push pending)

## Sprint 118 — Production-Grade Durable Dispatch Queue (started 2026-07-15)

- [ ] Audit tpDispatch.ts and portfolioExecDb.ts
- [ ] Schema: portfolio_dispatch_outbox table
- [ ] Schema: dispatch_incidents table
- [ ] Apply migration via webdev_execute_sql
- [ ] Write server/dispatchWorker.ts
- [ ] Write server/dispatchQueue.ts
- [ ] Write server/dispatchValidator.ts
- [ ] Create POST /api/portfolio/dispatch endpoint
- [ ] Write server/reconciliationEngine.ts
- [ ] Register TRADERSPOST_WEBHOOK_URL_PAPER and TRADERSPOST_WEBHOOK_URL_LIVE as secrets
- [ ] Build client/src/pages/PortfolioExecution.tsx
- [ ] Add Portfolio Execution nav item to OrionLayout.tsx
- [ ] Add /portfolio-execution route to App.tsx
- [ ] Write WEBHOOK_SETUP.md, DELIVERY_RELIABILITY.md, SECURITY.md
- [ ] Write server/dispatch.test.ts: 20+ tests
- [ ] TypeScript: 0 errors after all changes
- [ ] Checkpoint and GitHub push

## Sprint 117 — DARWIN Research Pipeline & Portfolio Gap Governance

- [ ] Schema: darwin_pipeline_stage_history, darwin_portfolio_gaps tables; extend darwin_candidates with all 12 stage status columns
- [ ] Backend: darwinPipelineDb.ts — candidate CRUD, stage progression, promotion engine, gap analysis helpers
- [ ] Backend: darwinRouter.ts — tRPC procedures for research centre
- [ ] Backend: Seed RC-001, RC-002, RC-003, DARWIN-S109-001 with current evidence
- [ ] Frontend: DARWIN Research Centre page — pipeline dashboard, candidate cards, 12-stage progression
- [ ] Frontend: Portfolio Gap Analysis panel — Top 10 gaps, coverage score, capital impact
- [ ] Frontend: Weekly DARWIN Report viewer
- [ ] Tests + TypeScript check + checkpoint

## Sprint 117 — DARWIN Research Pipeline & Portfolio Gap Governance

- [x] Schema: darwin_portfolio_gaps table (gap_rank, capital impact, health lift, research status)
- [x] Schema: darwin_pipeline_stage_history table (immutable audit log)
- [x] Backend: darwinPipelineDb.ts — getCandidatePipeline, getPortfolioGaps, getPipelineStats, seedPortfolioGaps, logStageTransition, getStageHistory
- [x] Backend: tRPC researchCentre router — candidatePipeline, portfolioGaps, pipelineStats, stageHistory, seedPortfolioGaps
- [x] Seed: RC-001 (CHOPPY_RANGE_MEAN_REVERSION), RC-002 (TRANSITIONAL_BREAKOUT_FADE), RC-003 (LUNCH_COMPRESSION_BREAKOUT), DARWIN-S109-001
- [x] Seed: 10 portfolio gaps with capital impact, correlation improvement, health lift estimates
- [x] Frontend: DarwinResearchCentre.tsx — 12-stage pipeline dashboard, candidate cards, gap analysis, stats header
- [x] Nav: Research Centre link added to PORTFOLIO group in OrionLayout.tsx
- [x] TypeScript: 0 errors


## Sprint 116 — Atlas Canonical Truth & Institutional Governance

- [ ] Part 1: Complete canonical audit — map every dashboard field to its DB source
- [ ] Part 2: Strategy lifecycle reconciliation — A1, A2, A3, B1, SB1, ORB-1, DARWIN-S109-001
- [ ] Part 3: Schema + DB fixes — correct all canonical inconsistencies
- [ ] Part 4: Executive Report Validation Engine (canonicalValidator.ts)
- [ ] Part 5: Strategy metric validation — verify all published stats from canonical dataset
- [ ] Part 6: Portfolio validation — coverage, diversification, correlation, health all from DB
- [ ] Part 7: Execution validation — trace every stage TV→Webhook→Memory→ADE→Dispatch→TP
- [ ] Part 8: A2 decision — wire into pipeline OR formally retire
- [ ] Part 9: ORB-1 validation — verify all stats before Apex deployment
- [ ] Part 10: DARWIN-S109-001 true lifecycle determination and registry update
- [ ] Part 11: GitHub institutional memory — automated commits for all report types
- [ ] Part 12: Executive report automation — Morning/Daily/Weekly/Monthly with email
- [ ] Part 13: DARWIN continues operating during sprint
- [ ] Part 14: Atlas Canonical Certification Report — CERTIFIED or NOT CERTIFIED


## Sprint 116 Phase 7-9 — Canonical Health Dashboard + Certification
- [x] Phase 7: canonicalHealth tRPC router added to routers.ts (runValidation + summary + generateCertificationReport)
- [x] Phase 7: CanonicalHealthPanel component built (status pill, critical/warning counts, run time, findings table, cert report button)
- [x] Phase 7: Panel added to Health.tsx page with full findings drill-down
- [x] Phase 7: A2 visible in ExecutivePortfolio strategy list (HISTORICAL_VALIDATION stage + purple badge)
- [x] Phase 7: Canonical Health status pill added to Home.tsx System Health panel
- [x] Phase 8: GitHub institutional memory — archiveCanonicalReportToGitHub added to darwinGitArchive.ts
- [x] Phase 8: Executive report automation — canonical self-validation gate wired in morning brief, daily intelligence, and weekly review handlers
- [x] Phase 8: A2 added to eligibleModels in morning brief (RC-A03, SB1, ORB-1, A2(PAPER)) and Portfolio Eligibility table
- [x] Phase 9: generateCertificationReport mutation — runs validator, builds markdown, archives to GitHub, returns result with GitHub URL
- [x] Phase 9: ExecutivePortfolio portfolio health updated — historicalValidationModels count, HISTORICAL_VALIDATION stage group, A2 needsAttention cleared
- [x] Phase 9: TypeScript clean (0 errors), 223 tests passing
- [x] Phase 9: Checkpoint saved + published

## Email Delivery System — Sprint 116 Extension
- [x] report_delivery_log table created in database (full audit trail schema)
- [x] Resend SDK installed (resend@6.17.2)
- [x] RESEND_API_KEY stored as secret (validated via test send)
- [x] atlasEmailService.ts built — sendExecutiveReport, sendCriticalAlert, retryFailedDeliveries, buildExecutiveEmailHtml
- [x] HTML email templates for all 7 report types (MORNING_BRIEF, DAILY_INTELLIGENCE, WEEKLY_REVIEW, MONTHLY_REVIEW, CRITICAL_ALERT, CANONICAL_ALERT, EXECUTION_HALT)
- [x] Email delivery wired into morning brief, daily intelligence, and weekly review scheduled job handlers
- [x] Canonical self-validation gate sends CANONICAL_ALERT email on failure
- [x] GitHub archive → email pipeline: commit SHA and report URL included in every email
- [x] Delivery audit trail: every send attempt recorded in report_delivery_log
- [x] Retry logic: failed deliveries retried up to 3 times with exponential backoff
- [x] Exhausted retries trigger Manus owner notification
- [x] All cron jobs confirmed registered (atlas-heartbeat, atlas-morning-brief, atlas-daily-intelligence, atlas-weekly-review, atlas-concordance, arp1-weekly-review, arp1-daily-brief)
- [x] End-to-end test: 3/3 test emails delivered to admin@sfgrowthmanagement.com (msgIds confirmed)
- [x] TypeScript: 0 errors | Tests: 225/225 passing

## Execution Validation Week — Operational Directive
- [ ] Store Atlas Operational Directive in darwin_permanent_directives table (type: OPERATIONAL_DIRECTIVE)
- [ ] Build end-of-day review with all 10 mandated sections (System Health, Portfolio Health, Canonical Integrity, Research Progress, Paper Trading Performance, Execution Quality, DARWIN Discoveries, Portfolio Gaps, Critical Issues, Recommended Actions)
- [ ] Wire 10-section end-of-day review into daily review scheduler (replace/extend existing daily review)
- [ ] Build end-of-week Operational Certification Report generator with READY/NOT READY verdict
- [ ] Wire weekly certification report into weekly review scheduler (Sunday 18:00 ET)
- [ ] Surface directive status banner on Home dashboard (EXECUTION VALIDATION WEEK active)
- [ ] Add Operational Certification status panel to Health page
- [ ] Wire certification report email delivery (WEEKLY_REVIEW type with READY/NOT READY verdict)
- [ ] TypeScript: 0 errors | Tests: 225+ passing | Checkpoint saved

## Sprint 119 — DARWIN Behaviour Discovery Engine v2 (Market Intelligence Engine) [COMPLETE]
- [x] Store Sprint 119 mandate as permanent directive in darwin_permanent_directives
- [x] Schema: behaviour_laws, market_intent_bars, behaviour_clusters, behaviour_cluster_trades, portfolio_coverage_map, counterfactual_analyses, strategy_interaction_analysis, market_memory_events, darwin_daily_questions tables created
- [x] Apply all schema migrations via webdev_execute_sql
- [x] Server: bdeEngine.ts — all 7 subsystems in one file (Market Intent, Clustering, Coverage Map, Counterfactual, Strategy Interaction, Behaviour Laws, Daily Questions)
- [x] Wire Daily DARWIN Questions (10 questions) into daily review handler
- [x] Wire Weekly DARWIN Report into weekly review handler with GitHub archive
- [x] Dashboard: DarwinIntelligence.tsx — Market Intent Engine, Behaviour Laws, Daily Questions, Behaviour Clusters, Market Memory
- [x] Dashboard: DarwinCoverageMap.tsx — Portfolio Coverage Map, Strategy Interaction Analysis, Counterfactual Analysis
- [x] Add DARWIN Intelligence + Coverage Map nav links to OrionLayout sidebar
- [x] Routes registered in App.tsx (/darwin-intelligence, /darwin-coverage-map)
- [x] TypeScript: 0 errors | Tests: 224/225 passing (1 external API timeout, not a code defect)

## Sprint 120 — Atlas Market Data Architecture Design [DESIGN-ONLY]

- [x] Add Sprint 120 items to todo.md
- [x] Create /docs/architecture/market-data/ directory
- [x] Write MARKET_DATA_ARCHITECTURE.md (master overview)
- [x] Write CURRENT_STATE.md (current TradingView M-16 flow)
- [x] Write TARGET_STATE.md (DataBento target architecture)
- [x] Write DATABENTO_INTEGRATION_DESIGN.md
- [x] Write MARKET_EVENT_CONTRACTS.md
- [x] Write SYMBOL_AND_ROLL_SPEC.md
- [x] Write BAR_BUILDER_SPEC.md
- [x] Write EVENT_TRANSPORT_DESIGN.md
- [x] Write STORAGE_DESIGN.md
- [x] Write LIVE_CHART_DESIGN.md
- [x] Write TRADE_ANNOTATION_SPEC.md
- [x] Write REPLAY_ARCHITECTURE.md
- [x] Write FAILOVER_AND_RECOVERY.md
- [x] Write TRADINGVIEW_MIGRATION_PLAN.md
- [x] Write SECURITY_DESIGN.md
- [x] Write OBSERVABILITY_PLAN.md
- [x] Write CAPACITY_AND_COST_MODEL.md
- [x] Write TESTING_AND_CERTIFICATION_PLAN.md
- [x] Write IMPLEMENTATION_ROADMAP.md
- [x] Write ADR-001 through ADR-012 (12 Architecture Decision Records)
- [x] Render 7 Mermaid architecture and sequence diagrams
- [x] Store Sprint 120 mandate in darwin_research_memory table
- [x] Checkpoint and deliver all documents

## Sprint 121 — DataBento Infrastructure (No Live Connection)

- [x] Scaffold server/market-data/ directory structure
- [x] Write shared/types/market-events.ts (all AtlasMarketEvent interfaces)
- [x] Implement server/market-data/dbn-parser.ts (DBN binary record parser)
- [x] Implement server/market-data/event-normalizer.ts (MBP-1 → AtlasTradeEvent/AtlasQuoteEvent)
- [x] Implement server/market-data/symbol-registry.ts (MNQ instrument spec, SymbolMappingMsg)
- [x] Implement server/market-data/databento-client.ts (TCP + auth + subscription — disabled by default)
- [x] Implement server/market-data/event-bus.ts (in-process EventEmitter, typed pub/sub)
- [x] Implement server/market-data/feed-health.ts (6-state machine)
- [x] Implement server/market-data/gap-detector.ts (sequence gap monitoring)
- [x] Add atlas_ticks, atlas_quotes, atlas_bars_1m tables to drizzle/schema.ts
- [x] Add atlas_symbol_registry, atlas_contract_rolls tables to drizzle/schema.ts
- [x] Add atlas_chart_annotations table to drizzle/schema.ts
- [x] Apply migration SQL via webdev_execute_sql (6 tables created)
- [x] Write unit tests: market-data.test.ts — 261 tests, 261 passing
- [x] Store DATABENTO_API_KEY as server secret
- [x] Store Orion Architecture Review Directive in Atlas Memory (ORION-DIRECTIVE-001)
- [x] Write docs/architecture/market-data/ORION_ARCHITECTURE_DIRECTIVE.md
- [x] Checkpoint Sprint 121

## Sprint 121A — Behaviour Engine Foundation (Architecture Only)

- [x] Store Sprint 121A mandate in Atlas Memory
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_ENGINE_ARCHITECTURE.md
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_REGISTRY_SCHEMA.md
- [x] Write docs/architecture/behaviour-engine/CANONICAL_BEHAVIOUR_SPECS.md (12 behaviours, full classification rules)
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_EVENT_CONTRACTS.md (5 event types, TypeScript interfaces)
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_CONFIDENCE_MODEL.md (7-dimension model, calibration)
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_LIFECYCLE.md (7 states, promotion rules)
- [x] Write docs/architecture/behaviour-engine/STRATEGY_INTEGRATION_PLAN.md (A1/A2/A3/B1/SB1/ORB-1 DNA + migration sequence)
- [x] Write docs/architecture/behaviour-engine/ADE_INTEGRATION.md (7 new ADE dimensions, Intelligence Layer)
- [x] Write docs/architecture/behaviour-engine/REPLAY_INTEGRATION.md (DecisionReplayRecord, deterministic replay)
- [x] Write docs/architecture/behaviour-engine/BEHAVIOUR_ENGINE_ROADMAP.md (9 phases, Sprint 122–130+)
- [x] Apply database schema migration — 8 Behaviour Registry tables created
- [x] Seed 12 canonical behaviour definitions into atlas_behaviour_definitions
- [x] Seed 12 performance stats rows into atlas_behaviour_performance_stats
- [x] Checkpoint and deliver Sprint 121A

## Sprint 122 — Atlas Decision Pipeline Audit

- [x] Read all decision pipeline source files (nexusRoutes.ts, barEvaluator.ts, paperTradeEngine.ts, dispatchWorker.ts, wfDb.ts)
- [x] Map complete pipeline architecture (Path A M-16 direct + Path B server-side monitor)
- [x] Extract all ADE scoring formulas from source (A1=ADX, A3=ADX*0.95, SB1=50, ORB-1=45, B1=1.0, S109=abs(dev)/atr*100)
- [x] Extract all dispatch execution gates from source (5 gates: expiry, HALTED, PAPER_ONLY, webhook URL, safety state)
- [x] Identify and classify all 7 pipeline gaps (GAP-001 through GAP-007)
- [x] Write docs/architecture/SPRINT-122-ATLAS-DECISION-AUDIT.md (8 sections, 7 gaps, 5 priority actions)
- [x] Store audit findings in Atlas Memory (SPRINT-122-AUDIT-001)
- [x] Push Sprint 122 to GitHub

## Sprint 122B — Behaviour Engine Shadow Mode Implementation

- [x] Read all 4 architecture specification documents
- [x] Implement server/behaviour-engine/types.ts
- [x] Implement server/behaviour-engine/classifier-registry.ts
- [x] Implement all 12 classifiers (B-001 through B-012)
- [x] Implement server/behaviour-engine/evidence-aggregator.ts
- [x] Implement server/behaviour-engine/confidence-calculator.ts
- [x] Implement server/behaviour-engine/behaviour-state-manager.ts
- [x] Implement server/behaviour-engine/behaviour-event-bus.ts
- [x] Implement server/behaviour-engine/behaviour-persistence.ts
- [x] Implement server/behaviour-engine/behaviour-engine.ts (main orchestrator)
- [x] Implement server/behaviour-engine/index.ts (singleton entry point)
- [x] Wire shadow mode into nexusRoutes.ts (setImmediate + try/catch isolation)
- [x] Add behaviourEngine tRPC router to routers.ts (6 procedures)
- [x] Build client/src/pages/BehaviourEngine.tsx (5-tab dashboard)
- [x] Add /behaviour-engine route to App.tsx
- [x] Write docs/architecture/SPRINT-122B-BEHAVIOUR-ENGINE-VALIDATION.md
- [x] TypeScript: 0 errors confirmed
- [x] Push Sprint 122B to GitHub
- [x] Checkpoint Sprint 122B

## Sprint 123A — Databento Live Data Adapter (Gate G4 Staging Validation)

### Sprint 123A.1–123A.3 — Implementation [COMPLETE]
- [x] Implement Databento Python feed adapter (services/databento-feed/)
- [x] Implement bridge server WebSocket layer
- [x] Implement TypeScript market-data ingestion pipeline
- [x] Implement bar lifecycle: developing → provisional → confirmed
- [x] Implement 1m and 5m persistence
- [x] Implement parity evaluation (Databento shadow vs TradingView)
- [x] Implement SSE reconnect with cursor replay
- [x] Implement chart-authority readiness check (7 gates)
- [x] Write 447 Gate G1–G4 Vitest tests — 447/447 passing
- [x] Write 143 Python pytest tests — 143/143 passing
- [x] TypeScript compilation: 0 errors
- [x] Frontend production build: PASS
- [x] Implementation SHA: 0f770762654c067998cf7e8adc984eb5a06e4b8b

### Sprint 123A.4 — Gate G4 Staging Preparation [COMPLETE — PENDING LIVE VALIDATION]
- [x] Write staging provisioning runbook (docs/runbooks/SPRINT_123A4_STAGING_PROVISIONING_RUNBOOK.md)
- [x] Harden staging_session_protocol.sh (check_secret, redact, DATABASE_URL, non-zero exit)
- [x] Harden chart_authority_activation_readiness.sh (same hardening + credential quality checks)
- [x] Write run_gate_g4_staging_validation.sh (master wrapper, 12 steps, stops on blocking failure)
- [x] Write SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md (21-section evidence template)
- [x] Add evidence/ to .gitignore
- [x] Staging tooling SHA: f86d82495b3004c90b359a22c010d3821ceb18c8
- [x] Confirm 447/447 Vitest, 143/143 pytest, 0 TSC errors, build PASS in sandbox
- [x] Identify full repository failure accounting (4 files, 27 failures — all pre-existing, none Gate-targeted)
- [x] Identify infrastructure constraints: no live GLBX.MDP3 entitlement, live.databento.com unreachable from sandbox
- [x] Write infrastructure constraint report (docs/reports/SPRINT_123A4_GATE_G4_INFRASTRUCTURE_CONSTRAINT_AND_HANDOFF.md)
- [x] Write interim automated validation results (docs/reports/SPRINT_123A4_GATE_G4_AUTOMATED_VALIDATION_RESULTS.md)
- [x] Update operator handoff to v2.0 with full 17-step protocol
- [x] Add Sprint 123A section to todo.md

### Sprint 123A.4 — Gate G4 Live Validation [BLOCKED — PENDING OPERATOR EXECUTION]
- [ ] Operator provisions staging host with DNS access to live.databento.com
- [ ] Operator activates live GLBX.MDP3 entitlement on Databento account (contact Databento support)
- [ ] Run preflight: bash scripts/run_gate_g4_staging_validation.sh --preflight-only
- [ ] Run full live shadow session (>=500 eligible 1-min comparisons)
- [ ] Capture latency percentiles for all 8 pipeline stages
- [ ] Verify bar continuity >=99%, unresolved gaps = 0
- [ ] Verify parity thresholds (mismatch <=2%, DB_ONLY <=5%, TV_ONLY <=1%)
- [ ] Run Playwright CB-001 to CB-020 — all must pass
- [ ] Prove SSE reconnect 14-step procedure in live environment
- [ ] Run chart-authority readiness check (all 7 gates)
- [ ] Run staging-only failover test
- [ ] Run final regression (447/447, 143/143, 0 TSC, build pass)
- [ ] Run final secret scan — 0 credential exposures
- [ ] Complete SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS.md
- [ ] Phil provides written Gate G4 approval

### Sprint 123A.5 — Chart Authority Activation [NOT STARTED — REQUIRES GATE G4 APPROVAL]
- [ ] DO NOT BEGIN until Gate G4 written approval received from Phil

## Sprint 123A.8 — Canonical Backtest Regeneration and Strategy Evidence Lock [COMPLETE]
### Gate G8 — Canonical Backtest Regeneration
- [x] Create sprint branch `sprint/123a-8-canonical-backtest-regeneration` from G7 final lock SHA `17360ad6f638ddafa791274a455483e3b936fd4b`
- [x] Download canonical Databento GLBX.MDP3 historical data (902,065 1m bars, 2024-01-01 to 2026-07-20, $0.00 cost)
- [x] Build 5m canonical feature dataset (180,414 bars, quality gate PASS, SHA-256: c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623)
- [x] Verify frozen TypeScript contract (git blob SHA: 6549df15ed8cc8e351d82e8dc647bb9c75f0dd69, all 5 strategies v1.0.0 DATABENTO)
- [x] Export shared canonical contract (docs/architecture/canonical_strategy_contract.json)
- [x] Define versioned split manifest v1.0.0 (Train: 2024-01-01 to 2025-03-31 | Val: 2025-04-01 to 2025-09-30 | OOS: 2025-10-01 to 2026-07-20)
- [x] Implement portfolio-level ADE backtest runner (full execution model: commission $5 RT, next-bar-close, single active strategy, no pyramiding)
- [x] Apply roll-window policy RWP-001 (3-day window, 10 roll dates, 18,162 bars excluded)
- [x] Execute canonical backtests (roll-excluded primary, roll-inclusive secondary)
- [x] Prove deterministic reproducibility (Run 1 SHA = Run 2 SHA = 670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22)
- [x] Run cost/slippage sensitivity matrix (20 scenarios)
- [x] Run walk-forward validation (5 folds, 2 of 5 profitable)
- [x] Leakage audit: LOOKAHEAD=NONE, TARGET=NONE, OOS_CONTAMINATION=NONE
- [x] Classify strategies: A1=RESEARCH_FAIL, A3=NO_TRADES, SB1=RESEARCH_FAIL, ORB-1=RESEARCH_FAIL, B1=RESEARCH_CAUTION
- [x] Create monitoring baselines (all 5 strategies, provisional_status=FINAL)
- [x] Write 156 G8 tests (G8-01 through G8-35) — all 156 pass
- [x] Full regression: 35 test files pass, 3 pre-existing DB failures unchanged, 1,066 tests pass
- [x] COMMIT-1: implementation (9f2466e)
- [x] COMMIT-2: evidence (a613ab5)
- [x] Push to GitHub: remote SHA a613ab56f80e04d918ca5cd084ee97d4716cf2d9
- [x] Write Gate G8 evidence report (docs/architecture/SPRINT_123A8_GATE_G8_EVIDENCE.md)
- [x] Write Sprint 123A.8 handoff (docs/architecture/SPRINT_123A8_HANDOFF.md)
- [x] Update todo.md

### Sprint 123A.8 — Key Results
- OOS portfolio: 859 trades, PF=0.9844, expectancy=-$3.34/trade, max DD=-$18,130, Sharpe=-0.2539
- B1 is the only strategy with positive OOS PF (1.24) — highest-value next DARWIN experiment
- DARWIN_DECISION_AUTHORITY: DISABLED | DARWIN_EXECUTION_AUTHORITY: DISABLED
- No automatic promotions, demotions, retirements, or capital reallocations
- All strategy statuses, risk parameters, and execution authorities unchanged from G7 baseline

### Sprint 123A.9 — DARWIN Research Cycle [NOT STARTED]
- [ ] Investigate B1's OOS edge: regime dependence, sub-period stability, transferability
- [ ] Investigate A1 ADX-trend regime filter alignment with current MNQ volatility regime
- [ ] Investigate ORB-1 opening range definition and breakout confirmation criteria
- [ ] DO NOT create new strategies until B1 investigation confirms stable edge
