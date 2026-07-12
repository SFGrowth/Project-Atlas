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
- [ ] Register Heartbeat cron via `manus-heartbeat create` (4:30 PM ET = 20:30 UTC, 6-field: `0 30 20 * * 1-5`)
- [ ] Persist task_uid to `atlas_scheduled_jobs` table

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
