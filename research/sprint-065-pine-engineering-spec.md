# Atlas Pine Script Engineering Specification v1.0

**Sprint:** 065  
**Date:** 9 July 2026  
**Author:** Manus AI  
**Status:** Frozen — implements APS v1.0 exactly  
**Source of Truth:** `research/atlas-production-specification-v1.0.md`

> **Governing Principle:** APS defines the behaviour. Pine Script implements the behaviour. No engineering decision may modify the validated scientific specification.

---

## SECTION 1 — MODULE ARCHITECTURE

Atlas is not a Pine Script strategy. It is a **production trading operating system** implemented in Pine Script v5. The codebase is structured into 14 distinct modules, each with a single, clearly defined responsibility.

### 1.1 Module Registry

| Module ID | Name | Type | Responsibility |
|---|---|---|---|
| `M-00` | `atlas_config` | Script (Input) | All user-configurable parameters. Single source of truth for all inputs. |
| `M-01` | `atlas_utils` | Library | Pure utility functions: time helpers, math, string formatting, validation. No state. |
| `M-02` | `atlas_state_manager` | Library | Manages all persistent `var` declarations, daily resets, and rolling statistics. |
| `M-03` | `atlas_market_state_engine` | Library | Computes the 56-field `MarketState` UDT on every bar. |
| `M-04` | `atlas_model_a1` | Library | Model A1 entry/exit logic. Consumes `MarketState`, returns `TradeProposal`. |
| `M-05` | `atlas_model_a3` | Library | Model A3 entry/exit logic. Consumes `MarketState`, returns `TradeProposal`. |
| `M-06` | `atlas_model_b1` | Library | Model B1 entry/exit logic. Consumes `MarketState`, returns `TradeProposal`. |
| `M-07` | `atlas_decision_engine` | Library | Edge Score calculation and model ranking. Returns `CandidateModel`. |
| `M-08` | `atlas_risk_engine` | Library | 8 ARI capital protection rules. Returns `ApprovedTrade` or `na`. |
| `M-09` | `atlas_verification_engine` | Library | 27 Pine-native TVL rules. Returns `VerifiedSignal` or `na`. |
| `M-10` | `atlas_json_builder` | Library | Constructs the webhook JSON payload string from `VerifiedSignal`. |
| `M-11` | `atlas_alert_manager` | Library | Fires `alert()` calls and manages alert deduplication. |
| `M-12` | `atlas_observatory` | Library | Records all decisions to Pine Script labels/tables for Observatory export. |
| `M-13` | `atlas_debug_dashboard` | Library | Renders the engineering mode debug table on the chart. Disabled in production. |
| `M-14` | `atlas_core` | Main Script | Orchestrates all modules in the correct execution sequence. |

### 1.2 Module Dependency Graph

```
atlas_config ──────────────────────────────────────────────────────┐
                                                                    │
atlas_utils ──────────────────────────────────────────────────────┐│
                                                                   ││
atlas_state_manager ──────────────────────────────────────────────┐││
                                                                   │││
atlas_market_state_engine ─────────────────────────────────────┐  │││
                                                                │  │││
atlas_model_a1 ─────────────────────────────────────────────┐  │  │││
atlas_model_a3 ─────────────────────────────────────────────┤  │  │││
atlas_model_b1 ─────────────────────────────────────────────┘  │  │││
                                                                │  │││
atlas_decision_engine ──────────────────────────────────────┐  │  │││
atlas_risk_engine ──────────────────────────────────────────┤  │  │││
atlas_verification_engine ──────────────────────────────────┤  │  │││
                                                            │  │  │││
atlas_json_builder ─────────────────────────────────────┐  │  │  │││
atlas_alert_manager ────────────────────────────────────┤  │  │  │││
atlas_observatory ──────────────────────────────────────┤  │  │  │││
atlas_debug_dashboard ──────────────────────────────────┘  │  │  │││
                                                            │  │  │││
atlas_core ─────────────────────────────────────────────────────────
```

---

## SECTION 2 — USER DEFINED TYPES (UDTs)

All data structures in Atlas are defined as Pine Script v5 User Defined Types. UDTs are passed between modules as immutable value objects. No module may modify a UDT created by another module.

### 2.1 `MarketState`
*Created by:* `M-03 atlas_market_state_engine`  
*Consumed by:* `M-04`, `M-05`, `M-06`, `M-07`, `M-08`, `M-09`, `M-13`

```pine
type MarketState
    // --- Temporal ---
    int     ts_utc              // Bar close timestamp (Unix ms)
    string  session             // "PRE_MARKET" | "AM_OPEN" | "AM_SESSION" | "MID_SESSION" | "PM_SESSION" | "AFTER_HOURS" | "OVERNIGHT"
    bool    is_rth              // true if within 09:30–16:00 ET
    bool    is_am_session       // true if 09:30–11:59 ET
    bool    is_pm_session       // true if 14:00–15:59 ET
    bool    is_overnight        // true if 18:00–09:00 ET
    int     hour_et             // Hour in ET (0–23)
    int     minute_et           // Minute (0–59)
    int     day_of_week         // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

    // --- Price ---
    float   close               // Current bar close
    float   high                // Current bar high
    float   low                 // Current bar low
    float   open                // Current bar open
    float   volume              // Current bar volume

    // --- Trend ---
    float   ema9                // 9-period EMA
    float   ema21               // 21-period EMA
    float   ema50               // 50-period EMA
    string  ema_structure       // "BULL_ALIGNED" | "BEAR_ALIGNED" | "MIXED"
    bool    ema_bull            // EMA9 > EMA21 > EMA50
    bool    ema_bear            // EMA9 < EMA21 < EMA50

    // --- Volatility ---
    float   atr14               // 14-period ATR
    float   atr5                // 5-period ATR
    float   adx14               // 14-period ADX
    float   volcomp_ratio       // ATR(5) / ATR(5)[20]
    bool    is_compressed       // volcomp_ratio < 0.80
    bool    is_expanding        // volcomp_ratio > 1.30
    bool    adx_trending        // adx14 >= 25
    string  volatility_state    // "LOW" | "TRENDING" | "HIGH"

    // --- Overnight ---
    float   ov_range_pts        // Overnight session range in points
    float   ov_range_vs_atr14   // ov_range_pts / atr14
    int     ov_direction        // 1=Bullish, -1=Bearish, 0=Neutral
    float   ov_close            // Overnight session close price
    float   ov_open             // Overnight session open price

    // --- Participation (MVC-003) ---
    float   rel_txn             // Relative transaction volume (current / 20-bar avg)
    float   rel_vol_20          // Relative volume (current / 20-bar avg)
    bool    participation_surge // rel_txn >= 1.33

    // --- MVC States ---
    bool    mvc_003_active      // MVC-003: rel_txn>=1.33 AND ov_range_vs_atr14>=10.85 AND ov_direction==1

    // --- Day Statistics ---
    float   day_open            // Day session open price
    float   day_high            // Day session high so far
    float   day_low             // Day session low so far
    float   day_range_vs_atr14  // (day_high - day_low) / atr14
```

### 2.2 `TradeProposal`
*Created by:* `M-04`, `M-05`, `M-06`  
*Consumed by:* `M-07`

```pine
type TradeProposal
    string  model_id            // "A1" | "A3" | "B1"
    bool    has_signal          // true if model generates a valid entry signal
    int     direction           // 1=LONG, -1=SHORT
    float   entry_price         // Proposed entry price (bar close)
    float   stop_price          // Proposed stop price
    float   target_price        // Proposed target price
    float   risk_pts            // abs(entry_price - stop_price)
    float   rr_ratio            // abs(target_price - entry_price) / risk_pts
    string  signal_basis        // Human-readable description of the entry condition
    string  rejection_reason    // Populated if has_signal == false
```

### 2.3 `CandidateModel`
*Created by:* `M-07 atlas_decision_engine`  
*Consumed by:* `M-08`

```pine
type CandidateModel
    bool    has_candidate       // false if no model scored >= 60
    string  model_id            // Winning model ID
    float   edge_score          // Final Edge Score (0–100)
    float   score_c1            // Market Alignment component
    float   score_c2            // Historical Expectancy component
    float   score_c3            // Regime Match component
    float   score_c4            // Session Match component
    float   score_c5            // MVC Strength component
    float   score_c6            // Behaviour Confidence component
    float   score_c7            // Production Reliability component
    TradeProposal proposal      // The winning TradeProposal
    string  rejection_reason    // Populated if has_candidate == false
```

### 2.4 `ApprovedTrade`
*Created by:* `M-08 atlas_risk_engine`  
*Consumed by:* `M-09`

```pine
type ApprovedTrade
    bool    is_approved         // false if ARI rejects
    string  model_id
    float   edge_score
    int     direction
    float   entry_price
    float   stop_price
    float   target_price
    float   risk_pts
    float   rr_ratio
    int     contracts           // ARI-approved contract count
    float   actual_risk         // contracts * risk_pts * point_value
    float   risk_multiplier     // ARI risk multiplier applied
    string  ari_rule_applied    // Which ARI rule modified or rejected (e.g., "R4_CAUTION")
    string  rejection_reason    // Populated if is_approved == false
    string  signal_id           // Unique ID: model_id + "-" + str(ts_utc)
```

### 2.5 `VerifiedSignal`
*Created by:* `M-09 atlas_verification_engine`  
*Consumed by:* `M-10`, `M-11`, `M-12`

```pine
type VerifiedSignal
    bool    is_verified         // false if TVL rejects
    string  tvl_status          // "VERIFIED" | "REJECTED" | "DELAYED" | "EMERGENCY_BLOCK"
    string  rejection_code      // TVL rejection code (e.g., "TVL-C3-01")
    string  rejection_reason
    ApprovedTrade trade         // The approved trade (populated even if rejected, for logging)
```

### 2.6 `RiskState`
*Created by:* `M-02 atlas_state_manager`  
*Consumed by:* `M-08`, `M-09`

```pine
type RiskState
    float   daily_pnl           // Cumulative P&L for current trading day
    int     daily_trade_count   // Number of completed trades today
    int     consecutive_losses  // Current streak of consecutive losses
    int     consecutive_wins    // Current streak of consecutive wins
    float   risk_multiplier     // Current active risk multiplier (0.25–2.0)
    bool    circuit_breaker     // true = all trading halted
    bool    active_position     // true = a position is currently open
    float   equity_peak         // All-time highest equity value
    float   current_drawdown    // equity_peak - current_equity
    float   base_risk           // Current base risk per trade ($)
    int     pause_until_bar     // Bar index after which trading resumes (after 3 consec losses)
```

### 2.7 `SessionState`
*Created by:* `M-02 atlas_state_manager`  
*Consumed by:* `M-03`, `M-04`, `M-05`, `M-06`

```pine
type SessionState
    bool    is_new_day          // true on first RTH bar of the day
    bool    is_new_session      // true on first bar of any session transition
    int     current_day_bar     // Bar count within current trading day
    float   day_open_price      // Opening price of the current RTH session
    float   ov_session_high     // Overnight session high
    float   ov_session_low      // Overnight session low
    float   ov_session_open     // Overnight session open
    float   ov_session_close    // Overnight session close (= RTH open)
    int     ov_session_direction // 1=Bullish, -1=Bearish, 0=Neutral
```

### 2.8 `DailyStatistics`
*Created by:* `M-02 atlas_state_manager`  
*Consumed by:* `M-07`, `M-12`, `M-13`

```pine
type DailyStatistics
    int     total_trades        // All-time completed trades
    int     total_wins
    int     total_losses
    float   all_time_pnl
    float   gross_wins
    float   gross_losses
    float   profit_factor       // gross_wins / gross_losses
    float   win_rate            // total_wins / total_trades
    float   avg_win
    float   avg_loss
    float   expectancy          // (win_rate * avg_win) - ((1-win_rate) * avg_loss)
    // Rolling 20-trade window for drift detection
    float   rolling_pf_20       // Profit Factor over last 20 trades
    float   rolling_wr_20       // Win Rate over last 20 trades
```

### 2.9 `ObservatoryRecord`
*Created by:* `M-12 atlas_observatory`  
*Consumed by:* External webhook (Observatory service)

```pine
type ObservatoryRecord
    string  record_type         // "ADE_EVAL" | "ARI_DECISION" | "TVL_VERIFY" | "TRADE_ENTRY" | "TRADE_EXIT"
    int     ts_utc
    string  model_id
    float   edge_score
    string  ari_decision        // "APPROVED" | "REJECTED"
    string  tvl_status
    float   entry_price
    float   exit_price
    float   pnl
    float   r_multiple
    string  exit_reason         // "TARGET" | "STOP" | "TIME_EXIT" | "MANUAL"
    int     bars_held
    string  json_payload        // Full JSON string for external logging
```

### 2.10 `PortfolioState`
*Created by:* `M-02 atlas_state_manager`  
*Consumed by:* `M-07`, `M-13`

```pine
type PortfolioState
    // Per-model statistics
    int     a1_trades
    float   a1_pf
    float   a1_wr
    int     a3_trades
    float   a3_pf
    float   a3_wr
    int     b1_trades
    float   b1_pf
    float   b1_wr
    // Portfolio-level
    float   portfolio_pf
    float   portfolio_wr
    float   max_drawdown
    float   sharpe_ratio        // Approximated from daily P&L series
```

---

## SECTION 3 — PERSISTENT VARIABLES

All persistent state in Atlas is managed exclusively by `M-02 atlas_state_manager`. No other module may declare `var` variables.

### 3.1 Core State Variables

```pine
// --- Risk & Position State ---
var float   v_daily_pnl             = 0.0
var int     v_daily_trade_count     = 0
var int     v_consecutive_losses    = 0
var int     v_consecutive_wins      = 0
var float   v_risk_multiplier       = 1.0
var bool    v_circuit_breaker       = false
var bool    v_active_position       = false
var float   v_equity_peak           = strategy.initial_capital
var float   v_base_risk             = 800.0  // Overridden by config

// --- Session State ---
var float   v_ov_session_high       = na
var float   v_ov_session_low        = na
var float   v_ov_session_open       = na
var float   v_ov_session_close      = na
var int     v_ov_session_direction  = 0
var float   v_day_open_price        = na
var int     v_current_day_bar       = 0
var int     v_pause_until_bar       = 0

// --- Performance Statistics ---
var int     v_total_trades          = 0
var int     v_total_wins            = 0
var float   v_gross_wins            = 0.0
var float   v_gross_losses          = 0.0
var float   v_max_drawdown          = 0.0

// --- Duplicate Prevention ---
var string  v_last_signal_id        = ""
var int     v_last_signal_bar       = 0

// --- Per-Model Counters ---
var int     v_a1_trades = 0
var float   v_a1_gross_wins = 0.0
var float   v_a1_gross_losses = 0.0
var int     v_a3_trades = 0
var float   v_a3_gross_wins = 0.0
var float   v_a3_gross_losses = 0.0
var int     v_b1_trades = 0
var float   v_b1_gross_wins = 0.0
var float   v_b1_gross_losses = 0.0
```

### 3.2 Rolling Arrays

```pine
// Rolling 20-trade P&L history for drift detection
var array<float> v_rolling_pnl = array.new<float>(0)  // Max size: 20

// Trade history for Observatory export
var array<string> v_trade_history = array.new<string>(0)  // Max size: 50, FIFO
```

### 3.3 Daily Reset Logic

The State Manager performs a daily reset on the first bar of each new RTH session (09:30 ET). The reset is triggered by the condition:

```pine
bool is_new_rth_day = (hour == 9 and minute == 30) and (hour[1] != 9 or minute[1] != 30)
```

On `is_new_rth_day == true`, the following variables are reset:
- `v_daily_pnl = 0.0`
- `v_daily_trade_count = 0`
- `v_current_day_bar = 0`
- `v_day_open_price = close`

The following variables are **NOT** reset daily (they persist across sessions):
- `v_consecutive_losses`, `v_consecutive_wins`, `v_circuit_breaker`, `v_equity_peak`, `v_base_risk`, all performance statistics.

### 3.4 Consecutive Loss Tracking

```pine
// Called by State Manager after every trade exit
update_consecutive_losses(bool trade_was_win) =>
    if trade_was_win
        v_consecutive_losses := 0
        v_consecutive_wins   := v_consecutive_wins + 1
    else
        v_consecutive_wins   := 0
        v_consecutive_losses := v_consecutive_losses + 1
        if v_consecutive_losses >= 3
            v_pause_until_bar := bar_index + 24  // Pause for ~2 hours (24 × 5-min bars)
```

---

## SECTION 4 — EXECUTION FLOW

The following is the exact, mandatory execution sequence for every completed 5-minute candle. The sequence is enforced in `M-14 atlas_core`. No step may be omitted or reordered.

### 4.1 Complete Bar Execution Sequence

```
ON EVERY BAR CLOSE (barstate.isconfirmed == true):

STEP 1: UPDATE STATE MANAGER
  atlas_state_manager.update(close, strategy.openprofit, strategy.netprofit, bar_index)
  → Updates: v_daily_pnl, v_active_position, v_equity_peak, v_current_day_bar
  → Performs: daily reset check, overnight session boundary detection

STEP 2: BUILD MARKET STATE OBJECT
  MarketState mso = atlas_market_state_engine.compute()
  → Calculates: all 56 fields of the MarketState UDT
  → Reads: v_ov_session_high/low/open/close/direction (from State Manager)
  → Output: immutable MarketState object

STEP 3: RUN MODEL A1
  TradeProposal p_a1 = atlas_model_a1.evaluate(mso)
  → Checks: session, day_of_week, EMA alignment, pullback depth, ADX
  → Output: TradeProposal (has_signal=true/false)

STEP 4: RUN MODEL A3
  TradeProposal p_a3 = atlas_model_a3.evaluate(mso)
  → Checks: overnight session, VolComp, expansion, EMA direction, ADX
  → Output: TradeProposal (has_signal=true/false)

STEP 5: RUN MODEL B1
  TradeProposal p_b1 = atlas_model_b1.evaluate(mso)
  → Checks: AM session, MVC-003 state, ADX
  → Output: TradeProposal (has_signal=true/false)

STEP 6: CALCULATE EDGE SCORES
  CandidateModel candidate = atlas_decision_engine.rank([p_a1, p_a3, p_b1], mso)
  → Calculates: 7-component Edge Score for each model with has_signal=true
  → Applies: 60-point threshold filter
  → Output: CandidateModel (has_candidate=true/false)

STEP 7: RUN ARI
  ApprovedTrade approved = atlas_risk_engine.evaluate(candidate, risk_state)
  → Checks: 8 capital protection rules in sequence
  → Calculates: contracts, actual_risk, risk_multiplier
  → Output: ApprovedTrade (is_approved=true/false)

STEP 8: RUN TVL
  VerifiedSignal signal = atlas_verification_engine.verify(approved, mso)
  → Checks: 27 Pine-native TVL rules
  → Output: VerifiedSignal (tvl_status: VERIFIED/REJECTED/DELAYED/EMERGENCY_BLOCK)

STEP 9: GENERATE JSON
  string json = atlas_json_builder.build(signal)
  → Constructs: webhook payload string from VerifiedSignal
  → Only executes if signal.tvl_status == "VERIFIED"

STEP 10: FIRE ALERT
  atlas_alert_manager.fire(signal, json)
  → Checks: duplicate prevention (v_last_signal_id, v_last_signal_bar)
  → Fires: alert(json, alert.freq_once_per_bar_close)
  → Updates: v_last_signal_id, v_last_signal_bar

STEP 11: EXECUTE STRATEGY ORDER
  (Only if signal.tvl_status == "VERIFIED")
  strategy.entry(...)
  strategy.exit(...)

STEP 12: UPDATE OBSERVATORY
  atlas_observatory.record(signal, mso, risk_state, daily_stats)
  → Appends: ObservatoryRecord to v_trade_history array
  → Renders: Observatory label on chart (if debug mode active)

STEP 13: UPDATE DEBUG DASHBOARD
  (Only if i_debug_mode == true)
  atlas_debug_dashboard.render(mso, candidate, approved, signal, risk_state, daily_stats)
  → Renders: debug table on chart
```

---

## SECTION 5 — MEMORY OPTIMISATION

TradingView enforces strict limits on Pine Script execution. Atlas must remain within these limits at all times.

### 5.1 TradingView Limits Reference

| Resource | TradingView Limit | Atlas Budget |
|---|---|---|
| Script execution time | 500ms per bar | < 200ms target |
| `var` array total elements | ~10,000 | < 2,000 |
| Series calculations | ~1,000 per script | < 400 |
| String length (alert) | 4,096 characters | < 3,000 |
| Labels per chart | 500 | < 100 |
| Lines per chart | 500 | < 50 |

### 5.2 Array Management Rules

All rolling arrays use a **fixed-size FIFO pattern**:
```pine
// Correct pattern — enforced in State Manager
array.push(v_rolling_pnl, new_value)
if array.size(v_rolling_pnl) > 20
    array.shift(v_rolling_pnl)  // Remove oldest element
```

### 5.3 Calculation Optimisation Rules

1. **Indicator calculations are performed once** in `M-03 atlas_market_state_engine` and stored in the `MarketState` UDT. No module may recalculate ATR, ADX, or EMAs independently.
2. **Session flags are boolean** — no string comparisons in hot paths. Use `mso.is_am_session` not `mso.session == "AM_SESSION"`.
3. **MVC states are pre-computed** in the MSE. Model modules read `mso.mvc_003_active` directly.
4. **Debug rendering is fully conditional** — all `atlas_debug_dashboard` code is wrapped in `if i_debug_mode` to prevent execution in production.
5. **Observatory labels are limited to 50** — the `v_trade_history` array enforces a maximum of 50 entries with FIFO eviction.

---

## SECTION 6 — DEBUG FRAMEWORK

The Atlas Debug Dashboard (`M-13`) provides complete system observability without placing trades. It is activated by the `i_debug_mode` input parameter.

### 6.1 Debug Table Layout

The debug table is rendered in the top-right corner of the chart. It contains 4 panels:

**Panel A: Market State**

| Field | Value |
|---|---|
| Session | AM_SESSION |
| EMA Structure | BULL_ALIGNED |
| ADX | 32.4 |
| VolComp Ratio | 0.74 |
| OV Direction | BULLISH |
| OV Range/ATR | 12.3 |
| Rel Txn | 1.45 |
| MVC-003 | ✓ ACTIVE |

**Panel B: ADE Scores**

| Model | Score | Status |
|---|---|---|
| A1 | 45.2 | BELOW THRESHOLD |
| A3 | 22.0 | NO SIGNAL |
| B1 | 87.4 | ✓ CANDIDATE |

**Panel C: ARI / TVL Status**

| Field | Value |
|---|---|
| ARI Decision | APPROVED |
| ARI Rule | R7_COMPOUND |
| Risk Multiplier | 1.1x |
| Contracts | 2 |
| TVL Status | VERIFIED |
| Signal ID | B1-1718029300 |

**Panel D: JSON Preview**

```
{"action":"buy","ticker":"MNQ1!","model_id":"B1",
"signal_id":"B1-1718029300","edge_score":87.4,
"contracts":2,"entry_price":20150.25,
"stop_price":20120.00,"target_price":20240.75}
```

### 6.2 Debug Mode Guarantees

When `i_debug_mode == true`:
- The debug table is rendered on every bar.
- All module outputs are logged as chart labels.
- **No trades are placed** — `strategy.entry()` is wrapped in `if not i_debug_mode`.
- **No alerts are fired** — `alert()` is wrapped in `if not i_debug_mode`.

---

## SECTION 7 — TESTING FRAMEWORK

Each module has a corresponding test suite. Tests are implemented as separate Pine Script indicator scripts that import the library module and verify its outputs against known inputs.

### 7.1 Test Suite Registry

| Test ID | Module Tested | Test Type | Pass Criterion |
|---|---|---|---|
| `T-MSE-01` | Market State Engine | Session classification | All 7 session types correctly identified for known timestamps |
| `T-MSE-02` | Market State Engine | Indicator values | EMA, ADX, ATR values match Python research engine for 10 known dates |
| `T-MSE-03` | Market State Engine | MVC-003 state | MVC-003 activates on exactly the same bars as the Python FAE engine |
| `T-A1-01` | Model A1 | Signal generation | A1 generates N=286 trades over 2024–2026 (matches Python baseline) |
| `T-A1-02` | Model A1 | PF validation | A1 PF = 1.387 ± 0.05 |
| `T-A3-01` | Model A3 | Signal generation | A3 generates N=55 trades over 2024–2026 |
| `T-A3-02` | Model A3 | PF validation | A3 PF = 1.566 ± 0.05 |
| `T-B1-01` | Model B1 | Signal generation | B1 generates N=134 trades over 2024–2026 |
| `T-B1-02` | Model B1 | PF validation | B1 PF = 2.231 ± 0.05 |
| `T-ADE-01` | Decision Engine | Edge Score range | All Edge Scores are in range [0, 100] |
| `T-ADE-02` | Decision Engine | Threshold | No model with score < 60 is ever selected as Candidate |
| `T-ADE-03` | Decision Engine | Tie-breaking | Tie-breaking correctly selects by C7, then C2 |
| `T-ARI-01` | Risk Engine | Daily loss limit | System halts after daily P&L <= -$2,000 |
| `T-ARI-02` | Risk Engine | Consecutive losses | Risk multiplier = 0.5x after 2 consecutive losses |
| `T-ARI-03` | Risk Engine | Circuit breaker | All signals rejected when circuit_breaker = true |
| `T-ARI-04` | Risk Engine | Position block | No signal approved when active_position = true |
| `T-TVL-01` | Verification Engine | Barstate guard | No signal fires on historical bars (barstate.isrealtime = false) |
| `T-TVL-02` | Verification Engine | Duplicate prevention | Identical signal_id within 60 seconds is blocked |
| `T-TVL-03` | Verification Engine | RR validation | Signal with RR < 1.5 is rejected |
| `T-JSON-01` | JSON Builder | Schema validation | All required fields present in every generated payload |
| `T-JSON-02` | JSON Builder | Length | Payload length never exceeds 3,000 characters |
| `T-DAILY-01` | State Manager | Daily reset | v_daily_pnl resets to 0 on first bar of each RTH session |
| `T-SESSION-01` | State Manager | Session transitions | Overnight session boundaries correctly detected |

---

## SECTION 8 — IMPLEMENTATION ROADMAP

The Pine Script implementation is broken into 11 engineering sprints. Each sprint has a single deliverable and a clear acceptance criterion.

| Sprint | Module(s) | Deliverable | Acceptance Criterion |
|---|---|---|---|
| **066** | `M-00`, `M-01`, `M-02` | Core Framework: Config, Utils, State Manager | All `var` declarations compile. Daily reset logic verified by T-DAILY-01. |
| **067** | `M-03` | Market State Engine | T-MSE-01, T-MSE-02, T-MSE-03 all pass. |
| **068** | `M-04`, `M-05`, `M-06` | Execution Models A1, A3, B1 | T-A1-01/02, T-A3-01/02, T-B1-01/02 all pass. Trade counts match Python baseline. |
| **069** | `M-07` | Atlas Decision Engine | T-ADE-01/02/03 all pass. |
| **070** | `M-08` | Atlas Risk Intelligence | T-ARI-01/02/03/04 all pass. |
| **071** | `M-09` | Trade Verification Layer | T-TVL-01/02/03 all pass. |
| **072** | `M-10`, `M-11` | JSON Builder & Alert Manager | T-JSON-01/02 all pass. |
| **073** | `M-12`, `M-13` | Observatory & Debug Dashboard | Debug table renders correctly. Observatory records all 5 record types. |
| **074** | `M-14` | Core Orchestrator | Full end-to-end backtest. Portfolio PF matches ATS v2.1 baseline (PF = 1.76 ± 0.05). |
| **075** | All | Paper Trading | 2-week live paper trade session. Zero unintended trades. All fills logged to Observatory. |
| **076** | All | Live Deployment | Prop firm + Live account activation. ARI limits confirmed active. |

---

## SECTION 9 — CONFIGURATION PARAMETERS

All user-configurable parameters are defined in `M-00 atlas_config` as Pine Script `input.*` declarations. No hardcoded values are permitted in any other module.

```pine
// === ACCOUNT CONFIGURATION ===
i_account_type    = input.string("LIVE", "Account Type", options=["LIVE", "PROP"])
i_base_risk       = input.float(800.0, "Base Risk ($)", minval=100, maxval=5000, step=100)
i_max_contracts   = input.int(10, "Max Contracts", minval=1, maxval=10)

// === DAILY LIMITS ===
i_daily_loss_limit_live = input.float(-2000.0, "Daily Loss Limit — Live ($)")
i_daily_loss_limit_prop = input.float(-1500.0, "Daily Loss Limit — Prop ($)")
i_max_daily_trades      = input.int(3, "Max Daily Trades", minval=1, maxval=10)

// === MODEL TOGGLES ===
i_enable_a1 = input.bool(true, "Enable Model A1")
i_enable_a3 = input.bool(true, "Enable Model A3")
i_enable_b1 = input.bool(true, "Enable Model B1")

// === ADE CONFIGURATION ===
i_edge_score_threshold = input.float(60.0, "Edge Score Threshold", minval=50, maxval=90)

// === DEBUG ===
i_debug_mode = input.bool(false, "Engineering Debug Mode")
i_show_signals = input.bool(true, "Show Signal Labels on Chart")
```
