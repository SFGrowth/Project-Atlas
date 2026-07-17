# Atlas Current State Architecture

**Document type:** Current State Assessment  
**Sprint:** 120  
**Status:** DESIGN — Verified Against Production Code  
**Date:** 2026-07-17  
**Source of truth:** `/server/nexusRoutes.ts`, `/server/monitor/paperTradeEngine.ts`, `/drizzle/schema.ts`

---

## Overview

This document describes the exact production architecture of Atlas as it exists at the start of Sprint 120. Every claim in this document is verified against the production codebase. This baseline is the foundation from which the target DataBento architecture is designed.

---

## Current Production Flow

The current system is built around a single data source: TradingView Pine Script M-16. All market data, indicator calculations, strategy evaluations, and ADE decisions originate inside TradingView's servers and are delivered to Atlas via a single HTTPS webhook on every confirmed 5-minute bar close.

```
TradingView Chart (MNQ1!, 5-minute)
        ↓
Pine Script M-16 executes on bar close
  ├── Calculates all indicators (ATR, ADX, RSI, VWAP, EMAs)
  ├── Evaluates all strategy models (A1, A3, B1, SB1, ORB-1)
  ├── Runs ADE v2 scoring and candidate selection
  ├── Runs ARI risk approval
  ├── Runs TVL verification
  └── Constructs JSON webhook payload
        ↓
TradingView Alert fires HTTPS POST
        ↓
POST /api/webhook/observe/:token
  ├── Layer 1: path token authentication
  ├── Layer 2: payload webhook_secret field
  ├── normalisePayload() — flattens nested Pine JSON
  ├── validatePayload() — schema and field validation
  ├── Idempotency check (idempotency_key unique constraint)
  └── insertPipelineReport() → pipeline_reports table
        ↓
atlas_memory insert (via /api/atlas-memory endpoint)
        ↓
barEvaluator.evaluate()
        ↓
processBar() → paperTradeEngine.ts
        ↓
ADE decision → ARI approval → TVL check
        ↓
tpDispatch.ts → TradersPost webhook
        ↓
Broker execution (Tradovate via TradersPost)
```

---

## M-16 Payload Schema

The Pine Script M-16 webhook sends a nested JSON payload. The `normalisePayload()` function in `nexusRoutes.ts` flattens this into the canonical Atlas format.

### Required Fields (after normalisation)

| Field | Type | Description |
|---|---|---|
| `schema_version` | string | Always `"1.0.0"` |
| `payload_type` | string | Always `"OBSERVABILITY"` |
| `event_id` | string | Unique event identifier |
| `idempotency_key` | string | Deduplication key |
| `pipeline_run_id` | string | Pipeline run identifier |
| `timestamp_utc` | string | ISO 8601 UTC timestamp of bar close |
| `bar_time` | string | Bar open time (same as timestamp_utc after normalisation) |
| `bar_index` | number | TradingView bar index |
| `chart_id` | string | TradingView chart identifier |
| `symbol` | string | Always `"MNQ1!"` |
| `timeframe` | string | Always `"5"` (5-minute bars) |
| `master_state` | string | Session name from Pine Script |

### Nested Payload Structure (Pine Script M-16 raw format)

The raw Pine Script payload contains nested objects that `normalisePayload()` flattens:

```
{
  metadata: {
    schema_version, payload_type, event_id, idempotency_key,
    pipeline_run_id, timestamp_utc, bar_index, chart_id, symbol, timeframe
  },
  market_state: {
    session,           // → master_state
    adx14,            // → adx
    atr14, atr5,      // → atr
    ema9, ema21, ema50, ema200,
    ema_structure,    // → trend
    vwap,
    rsi14,            // → rsi
    rel_vol           // → volume_ratio
  },
  ade: {
    decision, candidate_model, edge_score, norm_score,
    raw_score, raw_max, confidence, rank_order,
    candidate_status, candidate_direction, tie_break_result, version
  },
  ade_v2: {
    // 17 confidence dimensions with scores and weights
  },
  ari: {
    approved, approved_risk, daily_pnl, drawdown,
    consecutive_losses, consecutive_wins, circuit_breaker,
    profile_id, profile_name, execution_mode, account_type,
    execution_armed, configured_risk, estimated_risk,
    stop_distance_points, risk_per_contract, point_value,
    maximum_contracts, contracts
  },
  tvl: {
    status, execution_permission, blocking_rule
  },
  models: {
    a1: { direction, reward_to_risk, signal_basis },
    a3: { direction, reward_to_risk, signal_basis },
    b1: { direction, reward_to_risk, signal_basis }
  },
  position_state: {
    trade_id, entry_price, stop_price, target_price,
    current_pnl, bars_in_trade
  },
  reasoning: {
    action_summary, market_state_summary
  }
}
```

### Validation Rules

- `schema_version` must equal `"1.0.0"`
- `payload_type` must equal `"OBSERVABILITY"`
- `symbol` must equal `"MNQ1!"`
- `timeframe` must equal `"5"`
- All required fields must be non-null and non-empty

---

## Current Webhook Endpoint

| Property | Value |
|---|---|
| Method | `POST` |
| Path | `/api/webhook/observe/:token` |
| Authentication | Dual-layer: path token + payload `webhook_secret` field |
| Content-Type | `application/json` |
| Idempotency | `idempotency_key` unique constraint in `pipeline_reports` table |
| Response (success) | `201 { status: "accepted", id, idempotency_key, ingestion_latency_ms, sse_clients_reached }` |
| Response (duplicate) | `200 { status: "DUPLICATE_IGNORED", id, idempotency_key }` |
| Response (auth failure) | `403` or `404` |
| Response (validation failure) | `422 { error: "..." }` |

---

## Current Bar Timestamp Conventions

- All bar timestamps are stored as UTC Unix milliseconds in the `bar_time` column of `atlas_memory`
- The `bar_time_et` column stores the Eastern Time string representation for display
- The `session` column stores the Pine Script session name (e.g., `"AM_OPEN"`, `"PM_CORE"`, `"ETH"`)
- The `is_rth` boolean indicates whether the bar falls within Regular Trading Hours
- The `day_of_week` and `hour_et` columns are derived from the bar timestamp for session analysis

---

## Current Symbol Format

| Context | Symbol | Description |
|---|---|---|
| TradingView chart | `MNQ1!` | TradingView continuous front-month symbol |
| Webhook payload | `MNQ1!` | Hardcoded in Pine Script and validated by Atlas |
| atlas_memory | `MNQ1!` | Stored as received from webhook |
| TradersPost | Configured per strategy | Resolved in `tpDispatch.ts` |
| Broker (Tradovate) | `MNQM5`, `MNQU5` etc. | Raw contract symbol, managed by TradersPost |

Atlas currently has no symbol registry. The contract month, expiry, and roll dates are managed entirely by TradingView's continuous contract mechanism. Atlas is unaware of which physical contract is active.

---

## Current processBar() Input Contract

The `processBar()` function in `paperTradeEngine.ts` receives a `BarData` object populated from the `atlas_memory` table. The full interface is:

```typescript
export interface BarData {
  id: number;
  barTime: number | null;          // UTC milliseconds
  barTimeEt: string | null;        // Eastern Time string
  session: string | null;          // Session name from Pine Script
  isRth: boolean | null;           // Regular Trading Hours flag
  open: string | null;             // Decimal string
  high: string | null;             // Decimal string
  low: string | null;              // Decimal string
  close: string | null;            // Decimal string
  volume: number | null;
  adx: string | null;              // ADX(14) from Pine Script
  regimeClassification: string | null; // e.g. "BULL_TRENDING"
  a1Eligible: boolean | null;      // A1 eligibility from Pine Script
  a3Eligible: boolean | null;      // A3 eligibility from Pine Script
  b1Eligible: boolean | null;      // B1 eligibility from Pine Script
  sb1Eligible: boolean | null;     // SB1 eligibility from Pine Script
  activeModels: string | null;     // Comma-separated active model IDs
  atr: string | null;              // ATR(14) from Pine Script
  atr5: string | null;             // ATR(5) from Pine Script
  pipelineRunId: string | null;
  vwap?: string | null;            // VWAP from Pine Script
  rsi?: string | null;             // RSI(14) from Pine Script
  trendDirection?: string | null;  // EMA structure trend
  ema9Slope?: string | null;       // EMA(9) slope
}
```

**Critical observation:** All indicator values in `BarData` originate from Pine Script calculations inside TradingView. Atlas does not independently calculate any indicator. If Pine Script produces an incorrect value, Atlas has no way to detect or correct it.

---

## Current Indicator Calculations

All indicators are calculated by Pine Script M-16 inside TradingView. Atlas receives them as pre-computed values in the webhook payload. The current indicator set includes:

| Indicator | Pine Script Source | Atlas Field |
|---|---|---|
| ATR(14) | `ta.atr(14)` | `atr` |
| ATR(5) | `ta.atr(5)` | `atr5` |
| ADX(14) | `ta.adx(14)` | `adx` |
| RSI(14) | `ta.rsi(close, 14)` | `rsi` |
| VWAP | `ta.vwap` | `vwap` |
| EMA(9) | `ta.ema(close, 9)` | `ema9` |
| EMA(21) | `ta.ema(close, 21)` | `ema21` |
| EMA(50) | `ta.ema(close, 50)` | `ema50` |
| EMA(200) | `ta.ema(close, 200)` | `ema200` |
| EMA(9) slope | Derived | `ema9_slope` |
| EMA(21) slope | Derived | `ema21_slope` |
| EMA(50) slope | Derived | `ema50_slope` |
| EMA alignment | Derived | `ema_alignment` |
| Trend direction | EMA structure | `trend_direction` |
| Volatility state | ATR percentile | `volatility_state` |
| Compression state | ATR expansion | `compression_state` |
| Regime classification | Combined | `regime_classification` |
| VWAP distance | Derived | `dist_vwap` |
| ATR expansion | Derived | `atr_expansion` |
| ATR percentile | Derived | `atr_percentile` |
| Choppiness | `ta.chop` | `chop` |

---

## Current Market-State Storage

The `atlas_memory` table is the primary market-state store. It contains one row per confirmed 5-minute bar. The table schema includes:

- **Identity:** `memory_id`, `event_id`, `idempotency_key`, `schema_version`, `atlas_version`, `symbol`, `timeframe`, `bar_index`, `pipeline_run_id`
- **Timestamp:** `bar_time` (UTC ms), `bar_time_et`, `session`, `day_of_week`, `hour_et`, `is_rth`
- **OHLCV:** `open`, `high`, `low`, `close`, `volume`
- **Core Indicators:** `atr`, `atr5`, `atr_expansion`, `atr_percentile`, `adx`, `adx_trending`, `chop`, `rsi`, `vwap`, `dist_vwap`
- **EMAs:** `ema9`, `ema21`, `ema50`, `ema200`, `ema9_slope`, `ema21_slope`, `ema50_slope`, `ema_alignment`, `trend_direction`
- **Regime:** `volatility_state`, `compression_state`, `regime_classification`
- **Previous Day Structure:** `prev_day_high`, `prev_day_low`, `prev_day_close`, `prev_day_range`, `prev_day_range_atr`, `overnight_gap`, `price_vs_prev_day`
- **Model Eligibility:** `a1_eligible`, `a3_eligible`, `b1_eligible`, `sb1_eligible`, `active_models`
- **SB1 RAS:** `sb1_ras`, `sb1_ras_activated`
- **Pipeline Health:** `pipeline_health`, `obs_count`, `error_count`, `module_version`, `sprint`
- **Server Metadata:** `received_at`, `raw_payload`

---

## Current Strategy State

Strategy state is distributed across several tables:

| Table | Purpose |
|---|---|
| `atlas_memory` | Per-bar market state and model eligibility |
| `paper_trades` | Open and closed paper trade positions |
| `sb1_paper_trades` | SB1-specific paper trade records |
| `monitor_evaluations` | Per-bar strategy evaluation records |
| `strategy_registry` | Strategy metadata and lifecycle stage |
| `arp1_model_lifecycle` | ARP-1 model lifecycle progression |
| `portfolio_execution_config` | Master execution state (PAPER_ONLY/APEX_EVAL_ACTIVE/etc.) |
| `portfolio_strategy_controls` | Per-strategy ENABLED/PAUSED/RETIRED/FAULTED status |
| `tp_dispatch_log` | TradersPost dispatch audit log |

---

## Current Dashboard Market-Data Sources

The dashboard receives market data through two channels:

**1. SSE (Server-Sent Events):** The `/api/events` endpoint streams `pipeline_report` events to all connected dashboard clients on every accepted webhook. This is the primary real-time channel. The dashboard receives the full normalised payload immediately after each bar close.

**2. tRPC queries:** All historical data, paper trade records, strategy state, and system health are fetched via tRPC procedures. These are polled or invalidated on demand.

The dashboard has **no live chart**. It displays the last received bar's OHLCV data and indicators as static values. There is no candlestick chart, no intrabar price updates, and no tick data.

---

## Current Execution Records

Execution records are stored in:

| Table | Content |
|---|---|
| `tp_dispatch_log` | Every TradersPost dispatch attempt with status, HTTP response, and error |
| `wf_live_trades` | Live trade records (when execution is armed) |
| `paper_trades` | Paper trade positions with entry, exit, MFE, MAE, R-multiple |
| `sb1_paper_trades` | SB1-specific paper trade records |
| `report_delivery_log` | Email delivery audit trail |

---

## Current Feed-Monitoring Logic

Feed monitoring is implemented in `nexusRoutes.ts` with the following logic:

- `lastWebhookAt` tracks the timestamp of the most recent accepted webhook
- A polling interval checks every 10 minutes whether a webhook has been received during market hours
- If no webhook is received for more than 15 minutes during market hours, a `WEBHOOK_FAILURE` notification is sent and a health event is recorded
- If no webhook is received for more than 45 minutes, a `TV_DISCONNECTED` escalation is sent
- Both notifications have cooldown windows to prevent repeated alerts
- The `webhookFailureNotified` and `tvDisconnectNotified` flags reset on every successful webhook receipt

**Gap:** The current monitoring only detects complete silence. It cannot detect partial failures such as slow delivery, missing bars within a session, or indicator calculation errors in Pine Script.

---

## Current Gaps and Dependencies

The following gaps and dependencies are addressed by the target architecture:

| Gap | Impact | Target Architecture Solution |
|---|---|---|
| Single point of failure: TradingView | Any TradingView outage silences the entire pipeline | DataBento as primary feed, M-16 as fallback |
| No independent indicator calculation | Atlas cannot verify Pine Script values | Atlas-owned Feature Engine with canonical implementations |
| No live tick or quote data | No intrabar price action, no spread monitoring | DataBento MBP-1 provides every trade and BBO update |
| No live dashboard chart | Dashboard shows only last bar close | TradingView Lightweight Charts with developing-bar updates |
| No historical data access | DARWIN cannot query raw tick history | DataBento historical API + tiered storage |
| No symbol registry | Atlas unaware of active contract, expiry, roll | Symbol registry with volume-based roll management |
| No replay capability | Cannot replay historical sessions for research | Replay engine using stored Atlas events |
| Indicators calculated in Pine Script | Cannot use same indicators in backtesting | Canonical Feature Library shared across live/historical/replay |
| No feed health metrics | Cannot measure latency, gap rate, or message rate | Feed health monitor with metrics and alerting |
| No contract roll visibility | Roll gaps appear as price jumps in data | Contract roll handler with gap annotation |

---

## Current Architecture Diagram

```mermaid
graph TD
    TV[TradingView<br/>Pine Script M-16<br/>MNQ1! 5-min] -->|HTTPS POST on bar close| WH[POST /api/webhook/observe/:token<br/>Dual-layer auth + validation]
    WH -->|normalisePayload| NP[Normalised Payload]
    NP -->|validatePayload| VP[Validated Payload]
    VP -->|idempotency check| IC[pipeline_reports table]
    IC -->|insert| AM[atlas_memory table]
    AM -->|barEvaluator| BE[barEvaluator.evaluate]
    BE -->|processBar| PB[processBar]
    PB -->|ADE scoring| ADE[ADE Portfolio Selection]
    ADE -->|ARI approval| ARI[ARI Risk Intelligence]
    ARI -->|TVL check| TVL[TVL Verification]
    TVL -->|dispatch| TP[tpDispatch.ts]
    TP -->|webhook| TPOST[TradersPost]
    TPOST -->|order| BROKER[Tradovate Broker]
    IC -->|SSE broadcast| SSE[/api/events SSE]
    SSE -->|event stream| DASH[Dashboard Browser]
    AM -->|tRPC queries| TRPC[tRPC Procedures]
    TRPC -->|data| DASH
```

*Diagram rendered in `/docs/architecture/market-data/diagrams/current-state.png`*

---

## Summary Assessment

The current architecture is functional and has operated reliably for live paper trading across multiple strategies. However, it has a fundamental architectural constraint: **Atlas is entirely dependent on TradingView for market data, indicator calculation, and strategy signal generation.** Atlas is a consumer of TradingView's output, not an independent market data processor.

The target architecture inverts this relationship. Atlas becomes the primary market data processor, with TradingView retained as an independent validation and fallback feed. This transition must be executed carefully to preserve the reliability and correctness of the existing execution pipeline.
