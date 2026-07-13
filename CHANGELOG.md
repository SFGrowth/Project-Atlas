# Changelog

All notable changes to Project Atlas will be documented in this file.

The format is based on clear version history rather than informal memory. Every production-relevant change should be recorded here.

## [Unreleased]

## [0.16.0] - 2026-07-13 (Sprint 095A — M-16 Deployment)

### Changed

- **M-16 Pine Script** (`pine-script/core/atlas_ard_observer_m16.pine`) — v1.2.0 → v1.2.1. Two calibration fixes deployed per Sprint 095A Part 8 action item:
  1. `expandThresh` recalibrated from **1.20 → 1.00** for MNQ 5-min (`is_exp_val = volcomp_val > 1.00`). The old 1.20 threshold caused `volatility_state` and `compression_state` to report `EXPANDING` on only ~2% of trading days. Recalibration to 1.00 (F1-optimal across 625 trading days) correctly classifies ~14% of days as EXPANDING, consistent with the ORB-1 eligibility threshold already deployed in v1.2.0.
  2. `regime_classification` JSON field **closing quote bug fixed**. Missing `"` before the trailing comma produced malformed JSON on every webhook payload, causing server-side JSON parsers to reject or misparse the regime field on every bar since v1.0.0.
- **M-16 status table** — Row 9 now displays calibrated threshold alongside ATR expansion ratio. Row 10 added for `Vol State`. Table expanded from 14 to 15 rows.
- **M-16 heartbeat label** — Now includes `vol_state_val` for at-a-glance volatility state on chart.
- **M-16 script header** — Full embedded change log added (v1.0.0 through v1.2.1).

### Fixed

- **M-16 `sb1_eligible` indentation** — Normalised to consistent 4-space indent (cosmetic only).
- **M-16 `active_models_str`** — Reformatted to multi-line for readability (no behavioural change).

### Deployment Impact

- Webhook payload format: **unchanged**. All existing fields present with identical names and types. No database migration required.
- `volatility_state = "EXPANDING"` will now fire on ~14% of bars (up from ~2%).
- `orb1_eligible = true` will now appear on ~27% of RTH bars (up from ~0.3%).
- Existing TradingView alerts: **unchanged**. Alert fires on every confirmed bar close as before.

## [0.15.0] - 2026-07-10 (Sprint 077)

### Added
- **Performance Analytics page** (`/analytics`) — data-driven from `paper_trades` DB only. Equity curve (cumulative P&L line chart), daily P&L bar chart, model breakdown (win rate, W/L, net P&L per model), trade log (last 20 closed trades). No mock data.
- **`analytics.summary` tRPC procedure** — server-side aggregation of all analytics stats (total trades, win rate, avg R, profit factor, max drawdown, gross win/loss, equity curve, daily P&L, model breakdown).
- **`getAnalyticsData()` DB helper** — computes all analytics from `paper_trades` table in a single server-side pass.
- **`fmtField()` and `fmtCurrency()` helpers** in `HudComponents.tsx` — return "DATA UNAVAILABLE" for null/undefined critical fields.
- **TradingView alert configuration document** (`Docs/tradingview-alert-configuration.md`) — complete setup guide with exact webhook URL, M-15 settings, backend rejection rules, and security checklist.
- **Sprint 077 Engineering Log** (`Docs/sprint-077-engineering-log.md`).

### Changed
- **M-15 Pine Script** (`atlas_observability_webhook.pine`) — added `i_webhook_secret` input, `webhook_secret` field (Layer 2 auth), and `pipeline_run_id` field to the JSON payload. Updated endpoint comment to reflect the correct webhook URL format.
- **Backend timeframe validation** — `nexusRoutes.ts` now validates `metadata.timeframe === "5"` (5-minute bars). Payloads with any other timeframe are rejected with HTTP 422.
- **Notification deduplication** — `nexusRoutes.ts` now tracks last notification time per type with per-type cooldown windows (ARI_REJECTION: 5 min, CIRCUIT_BREAKER: 30 min, WEBHOOK_FAILURE: 1 hr, TV_DISCONNECTED: 2 hr). Trade notifications always fire.
- **Startup grace period** — `WEBHOOK_FAILURE` and `TV_DISCONNECTED` monitoring intervals skip checks for the first 10 minutes after server startup to prevent false-positive alerts.
- **Analytics nav item** added to INTELLIGENCE group in sidebar (LineChart icon, `/analytics` route).

### Tests
- Added 2 new timeframe validation tests to `nexusRoutes.test.ts`.
- **Total: 17/17 tests pass.** TypeScript: 0 errors.

## [0.14.0] - 2026-07-10 (Sprint 075)

### Added
- Comprehensive Failure Isolation Test Suite (`test_sprint075.py`) covering 23 edge cases.
- `slowapi` rate limiting to the Atlas Nexus backend (configurable via `ATLAS_RATE_LIMIT`).
- Bearer token authentication to the Atlas Nexus webhook endpoint.
- Connection state machine to the Atlas Nexus frontend (SSE, Backend, Data Freshness).
- Automatic catch-up mechanism for the frontend to fetch the latest report upon connection.

### Fixed
- Resolved 14 compilation warnings in M-15 (`atlas_observability_webhook.pine`) caused by shadowed variables and unused parameters.
- Fixed idempotency race conditions in the backend by performing a DB lookup before insertion, gracefully returning `DUPLICATE_IGNORED`.
- Fixed SSE memory leaks by implementing bounded queues and aggressive dead-client cleanup.

### Added

- Permanent Atlas foundation documentation:
  - `ATLAS.md`
  - `ENGINEERING.md`
  - `ROADMAP.md`
  - `CHANGELOG.md`
  - `CODING_STANDARDS.md`
- Project mission clarified: Atlas exists to maximise the probability of passing and scaling prop firm evaluations while preserving capital.
- Project identity clarified: Atlas assesses; it does not predict.
- Feature admission questions documented.
- Engineering requirements documented.
- Roadmap phases documented.
- Coding standards documented.

### Changed

- Atlas is now explicitly governed as a professional software project rather than a generic TradingView indicator.
- Repository principle clarified: the GitHub repository is the source of truth.

### Security

- Execution boundary clarified: Atlas begins as observer-only and should not connect to live execution before validation.

## [0.10.0] - 2026-07-10

### Added

- All 10 Pine Script core modules (M-00 through M-09) compiled and saved in TradingView Pine Editor.
  - M-00: Atlas Configuration (atlas_config.pine) — system-wide constants and configuration table
  - M-01: Atlas Utilities (atlas_utils.pine) — shared utility functions (EMA, ATR, session detection, FIFO queues)
  - M-02: Atlas State Manager (atlas_state_manager.pine) — persistent state machine for session, risk, and trade tracking
  - M-03: Atlas Market State Engine (atlas_market_state_engine.pine) — MarketState UDT builder with EMA, ATR, ADX, volume, overnight analysis
  - M-04: Atlas Model A1 (atlas_model_a1.pine) — AM Session Trend Continuation model
  - M-05: Atlas Model A3 (atlas_model_a3.pine) — Overnight Range Breakout model
  - M-06: Atlas Model B1 (atlas_model_b1.pine) — MVC-003 Apex Combination model
  - M-07: Atlas Decision Engine (atlas_decision_engine.pine) — multi-model candidate evaluation and winner selection
  - M-08: Atlas Risk Intelligence (atlas_risk_intelligence.pine) — position sizing, risk multipliers, capital allocation
  - M-09: Atlas TVL (atlas_tvl.pine) — Trade Verification Layer with 18-rule safety barrier

### Fixed (Pine Script v5 Compatibility)

- `math.mod` replaced with `%` operator (not available in Pine Script v5)
- Unused function parameters resolved by adding no-op expressions to satisfy compiler
- `library()` declaration converted to `indicator()` for stateful modules (Pine Script libraries cannot modify global `var` variables in exported functions)
- `ta.adx()` replaced with `ta.dmi()` destructuring syntax
- Multi-line ternary expressions and `.new()` constructor calls joined to single lines
- Nested function definitions moved to global scope
- `TradeProposal.new()` named arguments converted to positional arguments

### Notes

Sprint 072 objective: compile and verify all foundation modules before building M-10 Execution Engine.
All modules verified running on ATLAS chart (MNQ1! 5m, chart ID: cDPu6HGG).

## [0.11.0] - 2026-07-10

### Added

**Module M-10: `atlas_execution_engine.pine`** — The Execution & Order Lifecycle Engine. This module is the sole execution authority in the Atlas system. It receives verified `ApprovedTrade` objects from M-09 (TVL) and manages the complete lifecycle of every trade from approval through archival. Compiled and saved in TradingView on the first injection attempt (679 lines, zero compilation errors).

**Position UDT** — A comprehensive `Position` type containing: `trade_id`, `signal_id`, `model_id`, `status`, `direction`, `entry_price`, `stop_price`, `target_price`, `contracts`, `risk_amount`, `r_multiple`, `entry_time`, `exit_time`, `current_pnl`, `mfe` (Maximum Favourable Excursion), `mae` (Maximum Adverse Excursion), `exit_reason`, `bars_in_trade`, `entry_fill_price`, `exit_fill_price`.

**Deterministic Order State Machine** — Eight states with validated transitions: `NONE → PENDING → SUBMITTED → ACKNOWLEDGED → FILLED → ACTIVE → PARTIAL_EXIT → CLOSED → ARCHIVED`. The `f_is_valid_transition()` gate enforces all legal transitions and silently rejects illegal ones. Every state change is logged to the observability event log.

**Position Lifecycle Functions** — Five pure functions:
- `f_activate_trade()` — Creates a `Position` from an `ApprovedTrade`, sets status to `PENDING`
- `f_fill_position()` — Transitions through `SUBMITTED → ACKNOWLEDGED → FILLED → ACTIVE` on entry bar
- `f_update_position()` — Updates MFE, MAE, current P&L, and `bars_in_trade` every bar while `ACTIVE`
- `f_close_position()` — Closes position with exit reason (STOP_HIT, TARGET_HIT, MANUAL_CLOSE, TIME_EXIT)
- `f_archive_position()` — Transitions `CLOSED → ARCHIVED` on the bar following closure

**Observability Event Generation** — Every state transition generates: Atlas Brain update (position status label on chart), Observatory event (rolling 6-entry event log table), Decision timeline entry (timestamped state change), Mission Control update (daily P&L, trade count, win rate).

**Engineering Mode Debug Table** — Displays current position details (Trade ID, Signal ID, Model, Status, Direction, Entry/Stop/Target prices, Current R, Current P&L, MFE/MAE, Bars In Trade, Exit Reason), session statistics (Daily P&L, Daily Trades), and all-time statistics (Win Rate, Profit Factor, Total P&L).

**Simulation Mode** — Input `i_sim_trade` triggers a synthetic `ApprovedTrade` for standalone verification without requiring M-09 output.

### Architecture Notes

M-10 is a standalone `indicator()`. In production (M-14 `atlas_core`), the `Position` UDT and lifecycle logic will be inlined directly. Three critical constraints are enforced: (1) no market evaluation, (2) no decision modification, (3) no duplicate orders via the `f_is_valid_transition()` gate.

---

## [0.13.0] - 2026-07-10

### Added

**Module M-15: `atlas_observability_webhook.pine`** — The Observability Webhook layer. This indicator script (824 lines) serialises the complete internal state of the Atlas pipeline into a structured JSON payload and fires it via TradingView's `alert()` function on `barstate.isconfirmed`. Successfully injected, compiled with 0 errors (14 warnings), and saved to the live chart.

**Atlas Nexus MVP** — A standalone, full-stack observability dashboard for monitoring the Atlas pipeline in real time.
- **Backend:** FastAPI (Python) server with SQLite persistence. Features a `POST /webhook` endpoint to ingest M-15 payloads, and a `GET /events` Server-Sent Events (SSE) stream for live client updates.
- **Frontend:** A high-density React/Vanilla JS dashboard inspired by Bloomberg terminals. Renders 8 critical panels in real time: Overview Strip, Market Structure, Position State, Model Evaluations (A1/A3/B1), Atlas Brain View (human-readable reasoning), Decision Engine (ADE), Risk Intelligence (ARI), Trade Verification (TVL), and a scrolling Decision Timeline.
- **Integration:** Successfully tested end-to-end. The backend receives JSON payloads, persists them, and pushes updates instantly to the frontend UI via SSE.

### Architecture Notes

M-15 acts as the final stage of the Atlas Kernel pipeline. It strictly isolates webhook generation from trading logic—if any upstream pipeline stage fails, the webhook is suppressed. The Atlas Nexus MVP provides the critical off-chart visibility required to monitor the deterministic 14-stage pipeline without relying solely on TradingView's limited chart UI.

---

## [0.12.0] - 2026-07-10

### Added

**Module M-14: `atlas_core.pine`** — The Atlas Kernel. The master orchestration layer of the entire Atlas operating system. 1,264 lines. Zero compilation errors. Zero warnings. Compiled and saved in TradingView on the ATLAS chart (MNQ1! 5m, chart ID: cDPu6HGG).

**14-Stage Deterministic Pipeline** — Executed in strict order on every completed bar:
1. Configuration Update
2. State Manager Refresh
3. Market State Engine (M-03 inline)
4. Model A1 Evaluation (M-04 inline)
5. Model A3 Evaluation (M-05 inline)
6. Model B1 Evaluation (M-06 inline)
7. Atlas Decision Engine (M-07 inline)
8. Atlas Risk Intelligence (M-08 inline)
9. Trade Verification Layer (M-09 inline)
10. Execution Engine (M-10 inline)
11. Observatory Event Generation
12. Atlas Brain Update
13. Mission Control Update
14. Heartbeat

**PipelineReport UDT** — One immutable record per completed bar (35 fields): identity, stage results, market state summary, decision summary, risk summary, TVL summary, execution summary, performance metrics, statistics.

**KernelState UDT** — Persistent kernel health: pipeline run count, heartbeat count, avg/worst pipeline time, total state changes, total signals generated, total trades approved/rejected.

**Fail-Safe Architecture** — Any stage failure stops the pipeline immediately. No partial execution. No webhook generation on failure. Observatory error event generated. Atlas Brain explanation displayed.

**Engineering Mode Debug Table** — 22-row, 3-column table: kernel identity, pipeline stage status, market state, model results, ADE decision, ARI risk, TVL verification, execution state, position details, performance metrics, state changes, event log, heartbeat.

**Observatory Pipeline Report** — 10-row table: pipeline run count, market state, ADE candidate, ARI approval, TVL status, execution state, position P&L, event log, heartbeat.

**Heartbeat Label** — Generated on every bar with kernel version, sprint, pipeline run count, and timestamp.

### Fixed (Pine Script v5 compatibility — discovered during Sprint 073 injection)

- `if ... then ...` single-line syntax converted to proper `if\n    statement` block syntax (Pine Script v5 does not support inline `then`)
- `table.cell(..., colspan=N)` — `colspan` is a Pine Script v6-only parameter; removed from all 15 occurrences
- `str.tostring(time, "HH:mm:ss", "America/New_York")` — 3-argument timezone form not supported in v5; reduced to 2-argument form

### Architecture Notes

M-14 is the production execution script. All upstream modules (M-02, M-04, M-05, M-06, M-10) are inlined directly because Pine Script libraries cannot modify global `var` variables in exported functions. M-01, M-03, M-07, M-08, M-09 are pure function libraries and are also inlined for performance and to avoid library import overhead. The Kernel contains no trading logic — it only orchestrates.

---

## [0.0.0] - 2026-07-04

### Added

- GitHub repository created.
- Visual Studio Code configured.
- `atlas-observer` folder created.
- First Pine source file created.
- Development workflow established.
- Project Atlas created in ChatGPT.
- Origin and Constitution document created.

### Notes

This version represents Sprint 0: the birth and constitutional foundation of Project Atlas.

## Versioning Notes

Atlas should use semantic versioning where practical:

```text
MAJOR.MINOR.PATCH
```

Suggested interpretation:

- `MAJOR`: architectural or production-breaking changes
- `MINOR`: new validated modules or capabilities
- `PATCH`: fixes, clarifications, small improvements

Pine Script modules may have their own version numbers, but production-relevant changes should still be reflected here.
