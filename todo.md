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
