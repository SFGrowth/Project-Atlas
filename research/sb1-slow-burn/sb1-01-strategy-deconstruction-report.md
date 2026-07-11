# ATLAS SB1 — Strategy Deconstruction Report
**Classification:** Internal Research  
**Author:** Manus AI  
**Date:** July 2026  
**Sprint:** SB1 Phase 1  
**Script:** `$132k CHOP Filter — Trend Momentum Rider v4 [Manus]`  
**Archive:** `archive/sb1_original_132k_slow_burn_UNMODIFIED.pine` (751 lines, SHA preserved)  
**Status:** DECONSTRUCTION COMPLETE — Proceeding to Baseline Reproduction

---

## 1. Core Market Behaviour Hypothesis

The strategy is built around a single, clearly stated hypothesis:

> *When price grinds slowly along a Fast EMA with small candle bodies for N consecutive bars, it represents a genuine directional persistence phase — not a volatile spike or whipsaw. Entering during this quiet grind phase, close to the EMA, captures the continuation of an established trend at its lowest-risk entry point.*

This is the "Slow Burn" behaviour: not the initial breakout, not the sprint away from the EMA, but the quiet consolidation-continuation phase where price is digesting the prior move and preparing for the next leg.

The strategy explicitly rejects entries during:
- Volatile, high-body-size candles (sprints)
- Choppy, ranging markets (CHOP Index > 61.8)
- Overextended price action (far from EMA)
- Known low-quality time windows (14:xx, 16:xx, seasonal chop months)

---

## 2. Complete Rule Inventory

### 2.1 Core Signal Logic

**Instrument:** MNQ (Micro E-mini NASDAQ-100 Futures), 5-Minute Timeframe  
**EMA:** Single Fast EMA, default length 15  
**Entry Signal:**
- Long: N consecutive bars (default 4) closing **above** the Fast EMA
- Short: N consecutive bars (default 4) closing **below** the Fast EMA
- EMA crossover must have occurred within the last 8 bars (Cross Recency filter)

**Exit Signal (Primary — EMA Break Exit):**
- Long: M consecutive bars (default 2) closing **below** the Fast EMA
- Short: M consecutive bars (default 2) closing **above** the Fast EMA
- Minimum hold: 0 bars before EMA exit can fire (configurable, default 0)

### 2.2 Filter Stack (Active by Default)

| # | Filter | Default | Logic |
|---|---|---|---|
| 1 | VWAP Direction | ON | Long only above VWAP; Short only below VWAP |
| 2 | CHOP Index | ON | Block entry when CHOP(14) > 61.8 |
| 3 | ADX Confirmation | ON | CHOP block requires ADX < 20 to confirm (dual gate) |
| 4 | Slow-Burn Grind | ON | All candle bodies in last 4 bars ≤ 5.0× ATR; Close within 3.0× ATR of EMA |
| 5 | EMA Cross Recency | ON | Entry only if EMA crossover within last 8 bars |
| 6 | Block 14:xx | ON | No new entries during 14:00 hour EST |
| 7 | Block 16:xx | ON | No new entries during 16:00 hour EST |
| 8 | Seasonal Chop (Jul/Dec) | ON | VIX < 20 required in July/December |
| 9 | Seasonal Whipsaw (Jul/Dec) | ON | EMA crosses < 3 in last 20 bars, July/December only |
| 10 | Skip Open 30 min | ON | No entries before 10:00 AM EST |
| 11 | Monday Extra Skip | ON | Extra 60 min skip on Mondays (no entries before 10:30 AM) |
| 12 | Seasonal Chop Month | ON | Block 11:xx and 12:xx entries in July and December only |

**Filters OFF by Default (available but disabled):**
- ADX Chop Filter (standalone)
- EMA Whipsaw Filter (standalone)
- Overextended Move Filter
- Close Range Confirmation
- Volume Filter
- Block 11:xx (all months)
- Block 12:xx (all months)

### 2.3 Exit Stack

| Exit Type | Trigger | Priority |
|---|---|---|
| **Early Loss Stop** | Open loss ≥ $900 within first 1 bar | Highest — fires first |
| **Exhaustion Exit** | Overextension (≥2.5× ATR) + Volume spike (≥2.0× avg) + Reversal candle (≥1.5× prev body), min profit $500, after 11:00 AM | High |
| **Trailing Stop** | MFE ≥ $1,500 AND bars in trade ≥ 12: lock $800 profit | High |
| **Time Stop** | Still in loss after 12 bars (60 min) | Medium |
| **EMA Break Exit** | M=2 consecutive bars on wrong side of EMA | Primary (default) |

### 2.4 Risk Management

| Parameter | Value |
|---|---|
| Risk Per Trade | $850 |
| Max Contracts Cap | 99 (effectively disabled) |
| Max Daily Losses | 2 |
| ATR Length (for sizing) | 29 |
| Commission | $0.62/contract |
| Slippage | 1 tick |

**Contract Sizing:** Dynamic ATR-based. Contracts = floor($850 / (ATR × $2.00)). This is equivalent to the Atlas dollar-risk formula with $850 risk.

---

## 3. Identified Market Behaviour

The strategy is attempting to capture **Directional Persistence** — the tendency of trending markets to continue in the same direction for multiple consecutive bars after a regime change. The specific behaviour targeted is:

**Slow Burn Directional Persistence:** After a trend establishes itself (EMA crossover), price often enters a grinding phase where it makes small, consistent progress in the trend direction without large volatile candles. This phase is characterised by:
- Small candle bodies (≤5× ATR)
- Price staying close to the EMA (≤3× ATR distance)
- Consistent closes on the same side of the EMA for 4+ bars
- Low CHOP Index (trending, not ranging)

This behaviour is distinct from:
- Initial breakout momentum (large candles, price far from EMA)
- Trend exhaustion (overextension, volume spikes)
- Choppy/ranging markets (CHOP > 61.8, frequent EMA crossings)

---

## 4. Parameter Sensitivity Assessment (Pre-Backtest)

Based on the rule inventory, the following parameters are likely to be most sensitive:

| Parameter | Sensitivity | Reason |
|---|---|---|
| `entry_bars` (4) | **High** | Core signal — changing from 4 to 3 or 5 will materially change trade count and quality |
| `slow_burn_atr` (5.0) | **High** | Defines "slow burn" — too tight rejects good trades, too loose allows volatile entries |
| `chop_threshold` (61.8) | **Medium** | Fibonacci level — well-established, but sensitivity should be tested |
| `slow_burn_prox_atr` (3.0) | **Medium** | EMA proximity gate — affects how many trades are filtered |
| `cross_lookback` (8) | **Medium** | Prevents late entries — affects trade count significantly |
| `exhaust_atr_mult` (2.5) | **Medium** | Exhaustion exit trigger — affects winner capture |
| `trail_mfe_trigger` (1500) | **Low-Medium** | Only affects large winners |
| `fast_ema_len` (15) | **Low** | EMA length — likely stable plateau around 12–18 |

---

## 5. Potential Edge Sources

Based on the rule structure, the following are the most likely genuine edge sources (to be validated in Phase 3):

1. **CHOP Filter** — blocking entries in ranging markets is the most structurally sound filter. The Choppiness Index is a well-established technical indicator with genuine predictive value for trend persistence.

2. **Slow-Burn Grind Filter** — the small candle body requirement is a novel and potentially powerful filter. It specifically targets the low-volatility continuation phase, which may have higher directional persistence than high-volatility entries.

3. **Exhaustion Exit** — the three-condition exhaustion exit (overextension + volume spike + reversal candle) is a sophisticated exit that may capture a genuine market microstructure behaviour.

4. **Seasonal Chop Protection** — the July/December filter is data-driven and addresses a known seasonal pattern in NASDAQ futures.

---

## 6. Potential Risks and Concerns

1. **Optimisation Risk (HIGH):** The strategy has 40+ parameters. The filter stack, time blocks, and exit parameters show signs of extensive in-sample optimisation. The seasonal filters (July/December) in particular are highly specific to the 2-year backtest period and may not generalise.

2. **Look-Ahead Risk (LOW):** The strategy uses standard indicators (EMA, VWAP, CHOP, ATR, ADX) with no look-ahead bias. The `barstate.islast` usage is confined to the info table display only.

3. **Repainting Risk (LOW):** No repainting indicators detected. All signals are based on closed bar values.

4. **Regime Dependency (MEDIUM):** The strategy is explicitly designed for trending markets. If the 2-year backtest period was predominantly trending, out-of-sample performance in ranging markets may be significantly worse.

5. **Parameter Plateau (UNKNOWN):** Whether the current parameter values sit on a stable plateau or a sharp peak is unknown until sensitivity analysis is completed.

---

## 7. Research Questions

The following questions will be answered in subsequent research phases:

1. What is the baseline performance without any filters (raw EMA crossover system)?
2. What is the marginal contribution of each filter to net P&L?
3. Which sessions (RTH, Overnight, After-Hours) contribute the most to performance?
4. Does the Slow-Burn Grind Filter genuinely improve performance, or is it curve-fitted?
5. What is the walk-forward performance across 12 sequential windows?
6. Does the strategy add value to the existing Atlas portfolio (correlation with A1, A3, B1)?
7. Does the strategy meet the Atlas acceptance criteria (PF ≥ 1.30, positive OOS)?

---

## 8. Archive Confirmation

| Item | Status |
|---|---|
| Original script archived (UNMODIFIED) | ✅ `archive/sb1_original_132k_slow_burn_UNMODIFIED.pine` |
| Research copy created | ✅ `sb1_research_copy.pine` |
| Line count verified | ✅ 751 lines |
| No modifications made to original | ✅ Confirmed |

---

*Proceeding to Phase 2: Baseline Reproduction Report*
