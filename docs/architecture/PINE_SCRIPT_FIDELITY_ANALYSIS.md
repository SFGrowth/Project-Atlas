# Pine Script Fidelity Analysis — Sprint 123A.7

> **Architecture correction (Sprint 123A.7 Gate G7 — fifth withhold):**  
> `PINE_SCRIPT_STATUS=NON_CANONICAL_LEGACY_REFERENCE`  
> `TRADINGVIEW_MARKET_DATA_ROLE=NONE`  
> `TRADINGVIEW_CHART_ROLE=NONE`  
> `TRADINGVIEW_AUTOMATION_ROLE=NONE`  
> `DATABENTO_MNQ_DATA_AUTHORITY=CANONICAL`  
> `TYPESCRIPT_STRATEGY_ENGINE=CANONICAL`  
>
> Gate G5 approved Databento chart authority. Pine Script is **not** the canonical strategy  
> implementation, **not** a market data source, **not** a chart source, and **not** an active  
> automation trigger. Databento is the permanent canonical MNQ data source for all Atlas  
> operations. The TypeScript strategy engine is the canonical strategy source.  
> **The canonical backtest fidelity target is `TYPESCRIPT_BACKTEST_FIDELITY`, not Pine Script.**  
> This document is retained as historical reference only. Pine Script fidelity is retired as a Gate criterion.

**Source file:** `tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine`  
**Pine Script version:** 6  
**Strategy version:** 1.0.2  
**Build date:** 2026-07-15  
**Rule hash:** `ATLAS-PORT-117-2026-07-15`

---

## Canonical Strategy Definitions (from Pine Script source)

### Global Parameters

| Parameter | Pine Script Value | Notes |
|-----------|------------------|-------|
| Commission | `strategy.commission.cash_per_contract` = $0.62 | Per contract round-trip |
| Tick value | `i_tick_value` = $0.50 default | MNQ tick value |
| Tick size | `i_tick_size` = 0.25 pts default | MNQ tick size |
| Max risk/trade | `i_risk_per_trade` = $450.00 default | Apex 50K |
| Execution | `calc_on_every_tick=false` | Bar-close only |
| Position sizing | `strategy.fixed`, default_qty=1 | Overridden by risk calc |
| Pyramiding | Not set (default=0) | No pyramiding |
| Currency | USD | |
| RTH session | `0930-1600` | New York time |
| AM Open | `0930-1000` | New York time |
| AM Mid | `1000-1100` | New York time |

### Indicators

| Indicator | Formula | Length |
|-----------|---------|--------|
| ATR | `ta.atr(14)` | 14 |
| ADX | `ta.dmi(14, 14)` — Wilder | 14 |
| RSI | `ta.rsi(close, 14)` | 14 |
| VWAP | `ta.vwap(hlc3)` | Daily reset |
| EMA9 | `ta.ema(close, 9)` | 9 |
| EMA9 slope | `ema9 - ema9[1]` | 1-bar diff |

### Regime Classification

| Regime | Condition |
|--------|-----------|
| TRENDING | `adxVal >= 25.0` (i_adx_thresh default) |
| VOLATILE | `atr > ta.sma(atr, 20) * 1.2` |
| OV_LONG | `ema9Slope > 0 AND close > vwapVal` |
| OV_SHORT | `ema9Slope < 0 AND close < vwapVal` |

---

## Strategy A1 — EMA15 Momentum (Pine Script canonical)

**Entry conditions:**
- LONG: `isTrending AND isRTH AND diPlus > diMinus`
- SHORT: `isTrending AND isRTH AND diMinus > diPlus`
- Score: `adxVal` (ADX value)
- Execution: bar-close confirmed (`barstate.isconfirmed`)
- No position open (`strategy.position_size == 0`)

**Stop:** `close ± atr * 2.0`  
**Target:** `stop_distance * 2.0` (2:1 R:R)  
**Session:** RTH only (0930-1600 NY)  
**Regime:** TRENDING (ADX ≥ 25)  
**Direction filter:** DI+ vs DI- crossover  
**Pyramiding:** None  
**Position sizing:** `floor($450 / (atr*2.0/0.25 * $0.50))` contracts, min 1  

**Note on name:** The Pine Script calls this "A1" but the entry logic is ADX/DMI-based momentum, not EMA15. The Python backtest runner was named "EMA15 Momentum" based on an assumption. The canonical entry uses DMI directional indicators, not EMA15 crossovers.

---

## Strategy A3 — Multi-Session EMA15 (Pine Script canonical)

**Entry conditions:**
- LONG: `isTrending AND isRTH AND diPlus > diMinus`
- SHORT: `isTrending AND isRTH AND diMinus > diPlus`
- Score: `adxVal * 0.95` (5% haircut vs A1)
- Execution: bar-close confirmed
- No position open

**Stop:** `close ± atr * 2.0`  
**Target:** `stop_distance * 2.0` (2:1 R:R)  
**Session:** RTH only  
**Regime:** TRENDING (ADX ≥ 25)  
**Direction filter:** DI+ vs DI-  

**Key difference from A1:** Score is 5% lower. A3 only wins the ADE selection when A1 is not eligible (e.g., A1 disabled) or when A3's score somehow exceeds A1's (impossible with same conditions — A3 is a fallback to A1 in the same regime).

**Note:** In practice, A3 can never win over A1 when both are enabled and conditions are identical, since A3 score = A1 score * 0.95. A3 only fires when A1 is disabled.

---

## Strategy SB1 — Scalp Breakout (Pine Script canonical)

**Entry conditions:**
- LONG: `isTrending AND isAMMid AND ema9Slope > 0`
- SHORT: `isTrending AND isAMMid AND ema9Slope < 0`
- Score: 50.0 (fixed)
- Execution: bar-close confirmed
- No position open

**Stop:** `close ± atr * 1.5`  
**Target:** `stop_distance * 2.5` (2.5:1 R:R)  
**Session:** AM Mid only (1000-1100 NY)  
**Regime:** TRENDING (ADX ≥ 25)  
**Direction filter:** EMA9 slope (not EMA15)  
**Pyramiding:** None  

**Note:** The Python backtest runner used "scalp breakout" logic that may not match this. The canonical entry uses EMA9 slope as the RAS (Relative Alignment Score) proxy, not a price breakout.

---

## Strategy ORB-1 — Opening Range Breakout (Pine Script canonical)

**Entry conditions:**
- LONG: `isVolatile AND isAMOpen AND isRTH AND close > open`
- SHORT: `isVolatile AND isAMOpen AND isRTH AND close < open`
- Score: 45.0 (fixed)
- Execution: bar-close confirmed
- No position open

**Stop:** `close ± atr * 1.8`  
**Target:** `stop_distance * 2.0` (2:1 R:R)  
**Session:** AM Open only (0930-1000 NY)  
**Regime:** VOLATILE (`atr > sma(atr,20) * 1.2`)  
**Direction filter:** `close > open` (bullish bar) / `close < open` (bearish bar)  
**Pyramiding:** None  

**Note:** The Python backtest runner used a different ORB formation window (first 30 minutes of RTH). The canonical entry fires on any bar during AM Open (0930-1000) where ATR > 1.2 × 20-bar ATR SMA AND the bar is directional (close vs open). This is significantly different from a traditional ORB that waits for the first 30-minute range to form.

---

## Strategy B1 — Multi-Session B-Pattern (Pine Script canonical)

**Entry conditions:**
- LONG: `isRTH AND close > vwapVal`
- SHORT: `isRTH AND close < vwapVal`
- Score: 1.0 (fallback — only wins if nothing else eligible)
- Execution: bar-close confirmed
- No position open

**Stop:** `close ± atr * 2.0`  
**Target:** `stop_distance * 1.5` (1.5:1 R:R)  
**Session:** RTH only  
**Regime:** Any (no ADX filter)  
**Direction filter:** Price vs VWAP  
**Pyramiding:** None  

**Note:** The Python backtest runner used "B-pattern" entry logic. The canonical B1 is simply a VWAP directional trade with a 1.5:1 R:R. This is a fallback strategy that fires when no other strategy is eligible.

---

## ADE Selection Hierarchy

The portfolio uses an ADE (Autonomous Decision Engine) selection model. Only ONE strategy fires per bar:

1. A1 score = ADX value (highest when trending strongly)
2. A3 score = ADX × 0.95 (always below A1)
3. SB1 score = 50.0 (fixed — wins when ADX < 50 and AM Mid)
4. ORB-1 score = 45.0 (fixed — wins when ADX < 45 and AM Open)
5. S109-001 score = |VWAP dev| / ATR × 100 (variable)
6. B1 score = 1.0 (fallback — only fires when nothing else eligible)

**Critical implication for backtests:** The Python backtest runners tested each strategy independently (not as a portfolio). This means:
- A1 and A3 were tested as if they could both fire on the same bar (impossible in live)
- B1 was tested as if it could fire on any RTH bar (in live it only fires when A1/A3/SB1/ORB-1/S109 are all ineligible)
- The portfolio selection logic was NOT replicated in the Python runners

This is a **MAJOR fidelity divergence** for all strategies.

---

## Fidelity Status Summary

| Strategy | Fidelity | Primary Divergence |
|---------|----------|-------------------|
| A1 | **DIVERGENT** | (1) Entry uses DMI not EMA15; (2) Not tested as portfolio (ADE selection not replicated) |
| A3 | **DIVERGENT** | (1) Same as A1; (2) A3 can never fire when A1 enabled — Python runner tested it independently |
| B1 | **DIVERGENT** | (1) Entry uses VWAP direction not B-pattern; (2) B1 is fallback-only in live — Python runner tested it as primary |
| SB1 | **DIVERGENT** | (1) Entry uses EMA9 slope not price breakout; (2) Not tested as portfolio |
| ORB-1 | **DIVERGENT** | (1) Entry uses volatile-bar direction not ORB formation window; (2) Not tested as portfolio |

**All 5 strategies are DIVERGENT.** The Python backtest runners did not replicate the Pine Script logic.

**Implication:** No strategy can receive a final historical judgement until the Python runners are corrected to match the Pine Script canonical definitions.

---

## Required Corrections to Python Backtest Runners

### A1 Correction
- Replace EMA15 cross logic with: `ADX >= 25 AND DI+ > DI-` (long) / `ADX >= 25 AND DI- > DI+` (short)
- Session: RTH only (0930-1600 NY)
- Stop: ATR × 2.0, Target: ATR × 4.0 (2:1 R:R)
- Commission: $0.62/contract (not $2.00)
- Add ADE selection: A1 only fires if no higher-scoring strategy is eligible

### A3 Correction
- Same entry logic as A1 but with ADE score = ADX × 0.95
- A3 only fires when A1 is disabled OR when A3 score > all other eligible strategies
- In practice: A3 fires only when A1 is disabled

### SB1 Correction
- Replace breakout logic with: `ADX >= 25 AND isAMMid AND EMA9_slope > 0` (long) / `< 0` (short)
- Session: AM Mid only (1000-1100 NY)
- Stop: ATR × 1.5, Target: ATR × 3.75 (2.5:1 R:R)
- Add ADE selection: SB1 fires when score=50 > all other eligible strategies

### ORB-1 Correction
- Replace ORB formation logic with: `ATR > SMA(ATR,20)*1.2 AND isAMOpen AND close > open` (long)
- Session: AM Open only (0930-1000 NY)
- Regime: VOLATILE (ATR > 1.2 × 20-bar ATR SMA), not just any ATR level
- Stop: ATR × 1.8, Target: ATR × 3.6 (2:1 R:R)
- Add ADE selection: ORB-1 fires when score=45 > all other eligible strategies

### B1 Correction
- Replace B-pattern with: `isRTH AND close > VWAP` (long) / `close < VWAP` (short)
- B1 is fallback-only: fires ONLY when A1/A3/SB1/ORB-1/S109 are all ineligible
- Stop: ATR × 2.0, Target: ATR × 3.0 (1.5:1 R:R)

### Commission Correction
- Pine Script uses $0.62/contract (cash_per_contract)
- Python runners used $2.00/round-trip
- Correct value: $0.62 × 2 = $1.24/round-trip (not $2.00)
- This affects all strategies — lower commission will improve all results slightly

---

## Pine Script File SHA

```
sha256: d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb
```
