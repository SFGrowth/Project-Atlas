# Sprint 122 — Atlas Decision Pipeline Audit

**Classification:** Engineering Audit — Read-Only  
**Sprint:** 122  
**Date:** 2026-07-18  
**Author:** DARWIN Research Engine / Atlas Nexus  
**Status:** COMPLETE — Zero production code changes

---

## Executive Summary

This audit is a complete, verified engineering examination of every stage in the Atlas decision pipeline — from TradingView M-16 webhook ingestion through to TradersPost dispatch. Every finding is sourced directly from the production codebase. No assumptions are made. No architecture documents are cited as evidence.

**The pipeline operates across two distinct execution paths** that share the same ingestion endpoint but diverge immediately after bar storage:

1. **Path A — M-16 Direct Pipeline** (`processPaperTrading`): Consumes the Pine Script ADE/ARI/TVL decisions directly from the webhook payload. This path trusts M-16's decision-making entirely.

2. **Path B — Server-Side Monitor Pipeline** (`barEvaluator → processBar`): Triggered by the bar-observation endpoint (`/webhook/bar-observation/:token`). Independently re-evaluates eligibility from `atlas_memory` data, runs its own ADE proposal ranking, and enqueues approved signals into the durable dispatch queue.

**Only Path B connects to the durable dispatch queue and TradersPost.** Path A manages the `ATLAS_MNQ_PAPER` paper trade account and is the primary display source for the dashboard. This architectural split is the most significant finding of this audit.

---

## Section 1 — Pipeline Architecture Map

The complete decision pipeline from bar arrival to broker dispatch:

```
TradingView M-16 (Pine Script)
         │
         ▼
POST /api/webhook/observe/:token          ← Layer 1 auth: secret path token
         │                                ← Layer 2 auth: webhook_secret in body
         │
normalisePayload()                        ← Flattens nested Pine payload to flat struct
validatePayload()                         ← Schema version, symbol, timeframe gates
idempotency check                         ← Rejects duplicate pipeline_run_id
         │
insertPipelineReport()                    ← Persists to atlas_pipeline_reports
broadcastSSE("pipeline_report")           ← Pushes to all SSE dashboard clients
         │
         ├──► processPaperTrading()        ← PATH A: M-16 direct pipeline
         │         │
         │    ADE/ARI/TVL from payload
         │    → open/update/close ATLAS_MNQ_PAPER trade
         │    → insert ade_trade_records on close
         │    → broadcastSSE("trade_closed")
         │    → notifications (TARGET_HIT, STOP_HIT)
         │
         └──► (bar-observation endpoint)  ← PATH B: Server-side monitor pipeline
                   │
              POST /api/webhook/bar-observation/:token
              → insert into atlas_memory
              → evaluate(barRow)           ← barEvaluator.ts
              → processBar(barRow, eval)   ← paperTradeEngine.ts
                    │
               ADE Proposal Ranking
               → open ATLAS_MONITOR_PAPER trade
               → enqueueDispatch()         ← portfolio_dispatch_outbox
                    │
              dispatchWorker.ts (1s poll)
              → signal expiry gate
              → executionState gate (HALTED/PAPER_ONLY/APEX_EVAL_ACTIVE/LIVE)
              → webhook URL gate
              → safety state gate (execCertDb)
              → HTTP POST to TradersPost
```

---

## Section 2 — Stage-by-Stage Decision Variables

### Stage 0 — Webhook Authentication

Two independent authentication layers are enforced before any payload processing occurs.

| Layer | Check | Failure Response |
|---|---|---|
| Path token | `req.params.token` must equal `ATLAS_WEBHOOK_TOKEN` (constant-time comparison) | HTTP 404 — disguised as "Not found" |
| Payload secret | `body.webhook_secret` must equal `ATLAS_WEBHOOK_TOKEN` (constant-time comparison) | HTTP 403 — "Invalid or missing webhook_secret" |
| Content-Type | Must be `application/json` | HTTP 415 |

Both comparisons use `safeEqual()` — a bitwise XOR constant-time function that prevents timing attacks. The token is never logged.

### Stage 1 — Payload Validation

`validatePayload()` enforces the following hard gates before any processing:

| Field | Required Value | Failure |
|---|---|---|
| `schema_version` | `"1.0.0"` | HTTP 422 |
| `payload_type` | `"OBSERVABILITY"` | HTTP 422 |
| `symbol` | `"MNQ1!"` | HTTP 422 |
| `timeframe` | `"5"` | HTTP 422 |
| All REQUIRED_FIELDS | Non-null, non-empty | HTTP 422 |

**REQUIRED_FIELDS list** (verified from source, line 298–302 of nexusRoutes.ts):
`schema_version`, `payload_type`, `event_id`, `idempotency_key`, `pipeline_run_id`, `timestamp_utc`, `bar_time`, `bar_index`, `chart_id`, `symbol`, `timeframe`, `master_state`

### Stage 2 — Idempotency

Before any DB write, `getPipelineReportByIdempotencyKey(idempotencyKey)` is called. If a matching record exists, the webhook returns HTTP 200 with `status: "DUPLICATE_IGNORED"` and no further processing occurs. This prevents double-execution from TradingView retries.

### Stage 3 — Path A: M-16 Direct Pipeline (processPaperTrading)

This path reads ADE, ARI, and TVL decisions directly from the Pine Script payload. It does **not** independently evaluate market conditions.

**Gate to open a new trade** (line 551 of nexusRoutes.ts):
```
adeDecision !== "NO_TRADE"
AND ariApproval === "APPROVED"
AND tvlStatus === "PASS"
AND no open trade in ATLAS_MNQ_PAPER account
```

**ADE Decision** (`ade.decision`): Derived from `ade_decision.has_candidate`. If `has_candidate` is true, the value is `ade_decision.candidate_model` (e.g., `"A1"`). Otherwise `"NO_TRADE"`.

**ARI Approval** (`ari.approval`): `ari_decision.approved === true` → `"APPROVED"`, otherwise `"REJECTED"`.

**TVL Status** (`tvl.status`): `tvl_decision.status` — must equal `"PASS"`.

**Direction** (line 554): `ade_candidate_direction` integer: `1` → `LONG`, `-1` → `SHORT`, `0` → defaults to `LONG`.

**Entry/Stop/Target** (line 561–563): Extracted from `position_state.entry_price`, `position_state.stop_price`, `position_state.target_price`. Falls back to `market_structure.vwap` for entry if position_state is empty.

**Trade close trigger** (line 428): Primary close is `position_state.status === "ARCHIVED"` with a non-null `exit_reason`. Secondary fallback is price-based stop/target detection using `market_structure.vwap` as current price.

**ARI Rejection Notification**: If `ariApproval !== "APPROVED"` and `adeDecision !== "NO_TRADE"`, a notification fires with 5-minute cooldown. Circuit breaker open fires with 30-minute cooldown.

### Stage 4 — Path B: Server-Side Monitor Pipeline (barEvaluator → processBar)

This path independently re-evaluates every bar from `atlas_memory` data. It does not trust the Pine Script ADE decision.

#### barEvaluator.ts — Eligibility Evaluation

Each model's eligibility is evaluated independently:

| Model | Primary Source | Server-Side Cross-Check |
|---|---|---|
| A1 | `atlas_memory.a1_eligible` (Pine flag) | Regime must contain "TRENDING" + `isRth === true` |
| A3 | `atlas_memory.a3_eligible` (Pine flag) | Regime must contain "TRENDING" + `isRth === true` |
| B1 | `atlas_memory.b1_eligible` (Pine flag) | None — trusts Pine flag entirely |
| SB1 | `atlas_memory.sb1_eligible` (Pine flag) | Regime must contain "TRENDING" + session must be "AM_MID" |
| ORB-1 | **No Pine flag** — computed entirely server-side | Regime must be "VOLATILE" + session must be "AM_OPEN" + `isRth === true` |
| S109-001 | Computed server-side via `evaluateS109001Signal()` | See Section 3 |

**Integrity gates** (barEvaluator.ts lines 244–296): A bar is rejected from signal generation if:
- Any OHLCV value is zero or negative
- High < Low
- High < Open or High < Close
- Low > Open or Low > Close
- Gap detected (previous bar > 7.5 minutes ago)
- Duplicate bar_time detected

#### paperTradeEngine.ts — ADE Proposal Ranking

The ADE ranking is a **score-sort-select** algorithm. All eligible models submit proposals; the highest score wins.

**Pre-ranking gates** (line 529):
```
hasOpenPosition() === false
AND evaluation.integrityOk === true
AND barClose > 1000   ← DEF-001: rejects implausible MNQ prices
```

**Scoring function** (lines 543–612):

| Model | ADE Score Formula | Notes |
|---|---|---|
| A1 | `adx` (raw ADX value) | Typically 20–60 for trending markets |
| A3 | `adx * 0.95` | 5% penalty vs A1 — same regime, lower priority |
| SB1 | `50` (fixed constant) | No dynamic scoring — always 50 |
| ORB-1 | `45` (fixed constant) | No dynamic scoring — always 45 |
| B1 | `1.0` (fixed constant) | Lowest priority — baseline fallback |
| S109-001 | `abs(vwapDeviation) / atr14 * 100` | Dynamic — VWAP deviation in ATR units × 100 |

**Winner selection**: `proposals.sort((a, b) => b.adeScore - a.adeScore)` → `proposals[0]` wins.

**Signal derivation** (lines 90–127): When Pine Script entry/stop/target are not available in `atlas_memory`, the monitor uses ATR-based estimates:
- Entry: `bar.close`
- Stop: `close ± (atr * 1.5)`
- Target: `close ± (atr * 3.0)` (2R)
- Direction: from `regimeClassification` — `BULL` → LONG, `BEAR` → SHORT, else LONG

**Position sizing**: `floor(DEFAULT_RISK / (stopDistance * MNQ_POINT_VALUE))` where `DEFAULT_RISK = $450` (prop evaluation profile) and `MNQ_POINT_VALUE = $2`.

---

## Section 3 — S109-001 Signal Logic (Frozen)

S109-001 (VWAP_ALIGNED_CONTINUATION) is a frozen DARWIN hypothesis. Its parameters are immutable — no optimisation is permitted.

**Frozen parameters** (wfDb.ts lines 7–10):
- Entry: VWAP deviation > 0.5×ATR14
- Stop: 2.5×ATR14
- Target: 2.0×ATR14
- Time stop: 10 bars
- Session: RTH only

**Evaluation logic** (wfDb.ts lines 462–524):

```
Gate 1: session === "RTH"                    ← rejects all non-RTH bars
Gate 2: abs(close - vwap) >= 0.5 * atr14    ← VWAP deviation threshold
Direction: close > vwap → LONG; close < vwap → SHORT

Filter 1 (OV Inventory): direction must align with ovInventory
  LONG requires ovInventory === "LONG"
  SHORT requires ovInventory === "SHORT"

Filter 2 (VWAP Slope): direction must align with vwapSlope3Bar
  LONG requires vwapSlope3Bar > 0
  SHORT requires vwapSlope3Bar < 0

Filter 3 (RSI): direction must align with rsi14
  LONG requires rsi14 > 50
  SHORT requires rsi14 < 50

All three filters must pass → hasSignal = true
```

**Critical data mapping issue** (barEvaluator.ts lines 330–348): The `ovInventory` proxy is derived from `atlas_memory.trendDirection` (BULLISH/BEARISH/NEUTRAL), not a true overnight inventory field. The `vwapSlope3Bar` is mapped from `atlas_memory.ema9Slope`. The `session` field is passed as `bar.session` (e.g., "AM_OPEN", "AM_MID") but the S109-001 gate requires `"RTH"` — this means **S109-001 will never fire through the monitor pipeline** because the session values from M-16 are granular (AM_OPEN, AM_MID, PM) and never equal the string `"RTH"`.

**Benchmark** (frozen from Sprint 110): WR 75.3%, PF 4.985, Expectancy $97.1/trade at $450 risk.

---

## Section 4 — Dispatch Execution Gates

After `processBar()` selects a winner and enqueues it into `portfolio_dispatch_outbox`, the `dispatchWorker` applies five independent gates before sending to TradersPost.

| Gate | Condition | Outcome on Failure |
|---|---|---|
| Signal Expiry | `now - barTimeMs > SIGNAL_EXPIRY_MS` | Marks FAILED, logs DELIVERY_TIMEOUT incident |
| Execution State: HALTED | `execConfig.executionState === "HALTED"` | Marks FAILED, logs SAFETY_HALTED |
| Execution State: PAPER_ONLY | `execConfig.executionState === "PAPER_ONLY"` | Marks FAILED, logs DISARMED |
| Webhook URL | `TRADERSPOST_WEBHOOK_URL_PAPER` not in env | Marks FAILED, logs SECRET_MISSING incident |
| Safety State | `execCertDb.getSafetyState().isHalted === true` | Sets portfolio to HALTED, marks FAILED |

**Execution states** (from `portfolio_execution_config` table):
- `HALTED` — all dispatch blocked
- `PAPER_ONLY` — dispatch silently discarded (DISARMED)
- `APEX_EVAL_ACTIVE` — uses `TRADERSPOST_WEBHOOK_URL_PAPER`
- `LIVE` — uses `TRADERSPOST_WEBHOOK_URL_LIVE`

**Retry policy**: Exponential backoff — 2s, 5s, 15s, 30s, 60s, 120s, 300s. After `maxAttempts` exhausted, logs RETRY_EXHAUSTED incident and notifies owner.

**Webhook URL security**: The URL is read exclusively from environment variables. It is never stored in the database and never visible to the browser or any API endpoint.

---

## Section 5 — Confirmed Gaps and Defects

### GAP-001: S109-001 Session Gate Mismatch (CRITICAL — Silent Failure)

**Location**: `barEvaluator.ts` line 466 + `wfDb.ts` line 466  
**Finding**: `evaluateS109001Signal()` gates on `session === "RTH"`. However, `atlas_memory.session` stores granular M-16 session values: `AM_OPEN`, `AM_MID`, `PM`, `OV`, `PRE`, `POST`. The string `"RTH"` is never stored in `atlas_memory.session`. Therefore S109-001 will **always return `NOT_RTH`** when evaluated through the monitor pipeline, regardless of the actual session.  
**Impact**: S109-001 signals are silently suppressed in the monitor pipeline. The paper trade engine never generates an S109-001 signal. The WF live trade system (which uses a separate evaluation path) may or may not be affected depending on how it maps session values.  
**Severity**: Critical — a strategy with a 75.3% win-rate benchmark is completely dark in the monitor.

### GAP-002: Dual-Pipeline Trade Accounting (ARCHITECTURAL)

**Location**: `nexusRoutes.ts` lines 380–613 (Path A) and lines 1040–1131 (Path B)  
**Finding**: Two separate paper trade accounts exist simultaneously:
- `ATLAS_MNQ_PAPER` — managed by Path A (M-16 direct), displayed on the main dashboard
- `ATLAS_MONITOR_PAPER` — managed by Path B (server-side monitor), feeds the dispatch queue

These accounts use different eligibility logic, different scoring, and different entry/stop/target sources. A trade can be open in one account but not the other. The dashboard displays `ATLAS_MNQ_PAPER` trades as the primary view, but only `ATLAS_MONITOR_PAPER` trades generate real TradersPost dispatch signals.  
**Impact**: Dashboard P&L and trade history may not reflect the actual signals being sent to the broker.  
**Severity**: Architectural — not a bug per se, but a significant source of confusion and potential divergence.

### GAP-003: ORB-1 Has No Pine Flag (OBSERVATION)

**Location**: `barEvaluator.ts` lines 200–223  
**Finding**: Unlike A1, A3, B1, and SB1 — which all have corresponding `atlas_memory` columns (`a1_eligible`, `a3_eligible`, etc.) — ORB-1 has no Pine Script eligibility flag. Its eligibility is computed entirely server-side from `regimeClassification` and `session`. This means ORB-1 eligibility in the monitor pipeline may diverge from Pine Script's internal ORB-1 evaluation.  
**Severity**: Low — the server-side logic is clear and intentional, but it creates a documentation gap.

### GAP-004: SB1 ADE Score is a Fixed Constant (OBSERVATION)

**Location**: `paperTradeEngine.ts` line 557  
**Finding**: SB1 receives a fixed ADE score of `50`. This means SB1 will always lose to A1 or A3 when ADX > 52.6 (because A3 score = ADX × 0.95, so A3 beats SB1 when ADX > 52.6). In strong trending markets (ADX > 52), SB1 is structurally suppressed even when its specific conditions (AM_MID + RAS) are met.  
**Severity**: Low — may be intentional, but worth reviewing against SB1's intended role.

### GAP-005: B1 ADE Score is Effectively Zero (OBSERVATION)

**Location**: `paperTradeEngine.ts` line 569  
**Finding**: B1 receives a fixed ADE score of `1.0`. This is lower than every other model's minimum score. B1 will only win if it is the **sole** eligible model. In practice, B1 is a last-resort fallback with no competitive scoring.  
**Severity**: Low — may be intentional as a "baseline" model.

### GAP-006: Direction Default is Always LONG (OBSERVATION)

**Location**: `paperTradeEngine.ts` lines 100–107  
**Finding**: `deriveSignal()` determines direction from `regimeClassification`. If the regime contains "BULL" → LONG, "BEAR" → SHORT. For all other regimes (CHOPPY, VOLATILE, RANGING, UNKNOWN), direction defaults to LONG. This means models like B1 (which has no regime requirement) and ORB-1 (VOLATILE regime) will always generate LONG signals in non-directional regimes.  
**Severity**: Medium — ORB-1 in a VOLATILE regime without a directional bias will always be LONG, which may not reflect the actual breakout direction.

### GAP-007: S109-001 ADE Score Can Exceed 100 (OBSERVATION)

**Location**: `paperTradeEngine.ts` line 608  
**Finding**: S109-001 ADE score = `abs(vwapDeviation) / atr14 * 100`. If VWAP deviation is 1.5× ATR, the score is 150. If deviation is 2× ATR, score is 200. This means S109-001 can easily outrank A1 (max ~60 in strong trend) in high-deviation conditions, even though S109-001 is a mean-reversion strategy and A1 is a trend-following strategy. The two strategies have opposing market views but use the same scoring scale.  
**Severity**: Medium — in high-deviation conditions, S109-001 may systematically win the ADE ranking over trend-following models, which may or may not be the intended behaviour.

---

## Section 6 — Data Flow Verification

### M-16 Payload → atlas_memory Mapping

The bar-observation endpoint (`/webhook/bar-observation/:token`) stores bars in `atlas_memory`. The following fields are used by the monitor pipeline:

| atlas_memory Column | Used By | Purpose |
|---|---|---|
| `close` | paperTradeEngine | Entry price, direction derivation |
| `high`, `low` | paperTradeEngine | MFE/MAE update, exit detection |
| `atr` | paperTradeEngine, barEvaluator | Stop/target sizing, S109-001 |
| `atr5` | paperTradeEngine | Available but not used in scoring |
| `adx` | paperTradeEngine | A1 and A3 ADE score |
| `regime_classification` | barEvaluator, paperTradeEngine | Model eligibility, direction |
| `session` | barEvaluator, S109-001 | Session gates |
| `is_rth` | barEvaluator | RTH-only model gates |
| `a1_eligible` | barEvaluator | A1 primary eligibility source |
| `a3_eligible` | barEvaluator | A3 primary eligibility source |
| `b1_eligible` | barEvaluator | B1 primary eligibility source |
| `sb1_eligible` | barEvaluator | SB1 primary eligibility source |
| `vwap` | S109-001 | VWAP deviation calculation |
| `rsi` | S109-001 | RSI filter |
| `trend_direction` | S109-001 | OV inventory proxy |
| `ema9_slope` | S109-001 | VWAP slope proxy |

### ADE v2 EAR (Evidence-Adjusted Ranking) Fields

When M-16 sends ADE v2 payloads, the following per-model scoring dimensions are extracted and stored in `ade_trade_records`:

| Dimension Code | Category | Description |
|---|---|---|
| `d_ms01`–`d_ms05` | Market Structure | Regime, trend, volatility, session, ADX |
| `d_eq01`–`d_eq03` | Execution Quality | Spread, volume, time-of-day |
| `d_tc01`–`d_tc02` | Technical Confirmation | EMA structure, VWAP alignment |
| `d_si01`–`d_si03` | Signal Integrity | Candle pattern, bar quality |
| `d_cr01`–`d_cr02` | Correlation/Risk | Portfolio correlation, ARI risk |

These dimensions are stored for post-trade analysis but are **not used by the server-side monitor pipeline**. The monitor uses its own simplified scoring (Section 2, Stage 4).

---

## Section 7 — Notification and Alerting Inventory

All notifications go through `sendNotification()` with deduplication cooldowns:

| Event | Cooldown | Trigger |
|---|---|---|
| `ARI_REJECTION` | 5 minutes | ADE selected a model but ARI rejected it |
| `CIRCUIT_BREAKER` | 30 minutes | ARI circuit breaker is OPEN |
| `TRADE_OPENED` | 0 (always) | New paper trade opened |
| `TRADE_CLOSED` | 0 (always) | Paper trade closed |
| `TARGET_HIT` | 0 (always) | Trade closed at target |
| `STOP_HIT` | 0 (always) | Trade stopped out |
| `WEBHOOK_FAILURE` | 1 hour | No webhook for >15 min during market hours |
| `TV_DISCONNECTED` | 2 hours | No webhook for >45 min during market hours |
| `ATLAS_ONLINE` | 0 (always) | Server startup (8s delay) |
| `SYSTEM_OFFLINE` | 0 (always) | Server shutdown (SIGTERM/SIGINT) |

Market hours definition (line 631): UTC 14:00–21:00, Monday–Friday (09:30–16:00 ET).

---

## Section 8 — Priority Action Items

The following items are ranked by severity and actionability. None require production code changes to validate — all can be confirmed from this audit.

### P1 — Fix S109-001 Session Gate (GAP-001)

**Action**: In `barEvaluator.ts`, before calling `evaluateS109001Signal()`, map the granular session value to `"RTH"` for all RTH sessions (AM_OPEN, AM_MID, PM, PM_CLOSE). Alternatively, modify `evaluateS109001Signal()` to accept the granular session values and treat any non-OV/PRE/POST session as RTH.

**Expected outcome**: S109-001 signals will begin appearing in the monitor pipeline. Given the 75.3% win-rate benchmark, this is the highest-value fix available.

**Risk**: Low — the fix is a session string mapping. The frozen S109-001 logic itself is not changed.

### P2 — Reconcile Dual-Pipeline Accounts (GAP-002)

**Action**: Document the intended relationship between `ATLAS_MNQ_PAPER` (Path A) and `ATLAS_MONITOR_PAPER` (Path B). Determine whether the dashboard should display Path B trades (the ones that actually drive dispatch) as the primary view, or whether both should be shown with clear labelling.

**Expected outcome**: Eliminates confusion between dashboard P&L and actual broker signals.

**Risk**: Medium — requires dashboard UI changes.

### P3 — Review ORB-1 Direction Logic (GAP-006)

**Action**: Add directional logic to `deriveSignal()` for ORB-1. ORB-1 in a VOLATILE regime should derive direction from the opening range breakout direction (above/below the opening range), not default to LONG. This requires adding an opening range high/low to `atlas_memory` or deriving direction from the first bar's close vs. open.

**Expected outcome**: ORB-1 signals reflect the actual breakout direction.

**Risk**: Medium — requires new data fields.

### P4 — Review S109-001 ADE Score Scale (GAP-007)

**Action**: Consider capping the S109-001 ADE score at 100 or normalising all scores to the same scale. Alternatively, document that S109-001 is intended to win in high-deviation conditions and that this is the desired behaviour.

**Expected outcome**: Prevents S109-001 from systematically outranking trend-following models in high-deviation conditions if that is not the intended behaviour.

**Risk**: Low — scoring change only.

### P5 — Add SB1 Dynamic Scoring (GAP-004)

**Action**: Replace the fixed SB1 score of `50` with a dynamic score based on the RAS activation strength or the AM_MID session quality metric. This would allow SB1 to compete on merit rather than a fixed constant.

**Expected outcome**: SB1 wins the ADE ranking when its specific conditions are strongest, not just when ADX is below 52.6.

**Risk**: Low — scoring change only.

---

## Appendix A — File Reference Map

| File | Role | Lines of Interest |
|---|---|---|
| `server/nexusRoutes.ts` | Webhook ingestion, Path A paper trading, SSE | 65–294 (normalise), 298–325 (validate), 380–613 (Path A), 700–793 (webhook handler), 887–1131 (Path B dispatch) |
| `server/monitor/barEvaluator.ts` | Model eligibility evaluation, integrity checks | 83–305 (eligibility), 235–305 (integrity), 309–420 (evaluate()) |
| `server/monitor/paperTradeEngine.ts` | ADE proposal ranking, trade lifecycle | 83–127 (deriveSignal), 148–176 (hasOpenPosition), 421–644 (processBar) |
| `server/dispatchWorker.ts` | Durable dispatch queue processor | 71–382 (processOutboxRow), 386–398 (startDispatchWorker) |
| `server/wfDb.ts` | S109-001 frozen signal logic, WF statistics | 462–524 (evaluateS109001Signal), 530–569 (evaluateOpenTradeExit) |
| `drizzle/schema.ts` | All table definitions | atlas_memory, paper_trades, sb1_paper_trades, monitor_evaluations, portfolio_dispatch_outbox |

---

## Appendix B — Scoring Comparison Table

For a bar with ADX = 40, ATR = 8.0, VWAP deviation = 6.0 (0.75× ATR):

| Model | Score | Wins if sole eligible | Wins vs A1 (ADX=40) |
|---|---|---|---|
| A1 | 40.0 | Yes | — |
| A3 | 38.0 | Yes | No (loses to A1) |
| S109-001 | 75.0 | Yes | **Yes** (beats A1) |
| SB1 | 50.0 | Yes | **Yes** (beats A1) |
| ORB-1 | 45.0 | Yes | **Yes** (beats A1) |
| B1 | 1.0 | Yes | No |

For a bar with ADX = 60 (strong trend):

| Model | Score | Wins vs A1 (ADX=60) |
|---|---|---|
| A1 | 60.0 | — |
| A3 | 57.0 | No |
| S109-001 | 75.0 | **Yes** (if deviation = 0.75× ATR) |
| SB1 | 50.0 | No |
| ORB-1 | 45.0 | No |
| B1 | 1.0 | No |

**Key insight**: S109-001 is the only model with a dynamic score that can exceed A1 in strong trending conditions. In a trending market with moderate VWAP deviation, S109-001 will systematically outrank A1 — even though S109-001 is a mean-reversion strategy and A1 is a trend-following strategy. This is the most significant scoring design question identified in this audit.

---

*Audit complete. All findings sourced directly from production codebase. Zero production code changes made.*
