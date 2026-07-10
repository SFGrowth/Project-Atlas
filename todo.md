# Atlas Nexus — Project TODO

## Database & Schema
- [x] Add pipeline_reports table to drizzle/schema.ts
- [x] Generate and apply migration SQL

## Backend
- [x] POST /api/webhook/observe/:token — Dual-layer auth (secret path + payload field), schema validation, idempotency, DB insert, SSE broadcast
- [x] GET /api/events — SSE stream with heartbeat, catch-up on reconnect, bounded per-client queue
- [x] GET /api/v1/health — health check endpoint
- [x] GET /api/v1/stats — stats endpoint (report counts, last received)
- [x] GET /api/v1/reports — list recent reports
- [x] tRPC procedures for reports list and stats (for frontend)
- [x] Vitest tests for webhook validation and idempotency — 15/15 pass

## Frontend — Design & Layout
- [x] JARVIS/Stark Industries theme in index.css (arc reactor blue, hex grid, scanlines)
- [x] Google Fonts: JetBrains Mono + Rajdhani + Orbitron
- [x] Full-screen JARVIS dashboard layout (no sidebar needed — all panels visible)
- [x] Main dashboard page wired to SSE via useNexusSSE hook

## Frontend — Panels
- [x] Overview Strip: Master State, Symbol, ADE Decision, ARI Approval, TVL Status, report count, health indicators (SSE: CONNECTED/CONNECTING/ERROR; Backend: OK/DEGRADED; Data: LIVE/STALE)
- [x] Market Structure panel: Trend, ADX, ATR, EMA9/21/50, VWAP, RSI, Volume Ratio
- [x] Model Evaluations panel: A1, A3, B1 cards with signal direction, edge score, signal basis
- [x] ADE panel: candidate model, edge score, confidence, ranking order
- [x] ARI panel: approved risk, daily P&L, drawdown, consecutive losses/wins, circuit breaker
- [x] TVL panel: 5 verification checks, blocking rule, execution permission
- [x] Decision Timeline: scrolling event log with timestamp, master state, ADE decision, ARI approval

## Delivery
- [x] Secrets: ATLAS_WEBHOOK_TOKEN — 64-char hex, stored securely, never committed
- [x] Checkpoint saved and publish instructions delivered
