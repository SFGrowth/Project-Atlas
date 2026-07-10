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
