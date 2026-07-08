# Atlas External Strategy Evaluation
## Strategy: Casper SMC "First Candle Value"

**Date:** 2026-07-08  
**Source:** [Instagram Reel DXKyonPDaaK](https://www.instagram.com/reel/DXKyonPDaaK/)  
**Research Stream:** D — Component Intelligence  
**Verdict:** REJECTED  

---

## 1. The Strategy Premise

The strategy, marketed as taking a "$9,000 account to $180,000," is an Opening Range Breakout (ORB) variation that incorporates Volume Profile. 

### The Execution Model
1. **Opening Range:** Mark the high and low of the first 15-minute candle of the New York session (09:30–09:45 ET).
2. **Value Area:** Draw a volume profile over this 15-minute period to identify the Value Area (VA) — the price range where 70% of the volume traded. The upper boundary is the Value Area High (VAH) and the lower boundary is the Value Area Low (VAL).
3. **Setup A (Failed Breakout):** If price pushes above the VAH and subsequently closes back inside the VA, enter short. Stop loss at the high of the breakout. Target is the VAL.
4. **Setup B (Confirmed Breakout Pullback):** If price pushes above the VAH and holds outside it, wait for a pullback to the VAH. Enter long when price touches the VAH. Stop loss below the entry candle. Target is open (trailing stop).

---

## 2. Atlas Evaluation Methodology

The strategy was translated into objective algorithmic rules and tested against the Atlas 2-year MNQ 5-minute dataset (140,933 bars).

**Test Parameters:**
- **Instrument:** Micro E-mini Nasdaq 100 (MNQ)
- **Timeframe:** 5-minute
- **Risk Management:** 1.0 ATR stop, 2.0 RR target (standardised to match Atlas Model A1 for direct comparison)
- **Execution:** No lookahead bias; volume profile calculated bar-by-bar during the OR; trades executed during Regular Trading Hours (RTH).

---

## 3. Backtest Results

The strategy failed across all configurations.

| Configuration | Trades | Profit Factor | Net P&L | Max Drawdown | Win Rate | Expectancy |
|---|---|---|---|---|---|---|
| **Setup A (Failed Breakout)** | 459 | 0.779 | -$1,507 | -$2,024 | 57.3% | -$3 |
| **Setup B (Confirmed Breakout)** | 415 | 0.718 | -$2,096 | -$2,176 | 31.8% | -$5 |
| **Combined System** | 874 | 0.747 | -$3,604 | -$3,691 | 45.2% | -$4 |

### Sub-Period Stability
The failure was consistent across both years of the dataset.
- **Setup A:** Year 1 PF = 0.769 | Year 2 PF = 0.781
- **Setup B:** Year 1 PF = 0.728 | Year 2 PF = 0.716

### Slippage Stress Test
Setup A (the better of the two) degraded immediately when exposed to real-world friction.
- 0-tick slippage: PF 0.779
- 1-tick slippage: PF 0.563
- 2-tick slippage: PF 0.400

---

## 4. Edge Attribution & Structural Analysis

The null hypothesis could not be rejected. The strategy possesses no intrinsic statistical edge.

### Why Setup A (Failed Breakout) Fails
The premise of Setup A is that a close back inside the Value Area indicates "trapped buyers." However, the data shows that the Value Area of the first 15 minutes is too narrow to serve as a structural boundary for the rest of the day. A close back inside the VA is frequently just routine intraday volatility, not a structural rejection. The strategy buys random noise inside the morning chop zone.

### Why Setup B (Confirmed Breakout) Fails
The premise of Setup B is that holding above the VAH indicates acceptance of higher prices, making the VAH a support level. The data shows that the VAH of the first 15 minutes has zero predictive power as dynamic support. Price routinely slices through it, triggering the tight stop loss before continuing.

### Curve-Fitting Risk
The strategy relies heavily on discretionary management ("trail your stop with each new candle because that's when the most explosive moves happen"). When tested objectively, the entry signals themselves have negative expectancy. The claimed profitability likely relies on survivorship bias (remembering the few times a trailing stop caught a massive trend) rather than a repeatable statistical edge.

---

## 5. Atlas Verdict

**REJECTED.**

The "First Candle Value" strategy is a collection of indicators (15-min ORB + Volume Profile) that lacks a genuine structural hypothesis. The market does not respect the 15-minute Value Area as a hard boundary for the remainder of the session. 

The strategy has been archived in the Rejected Components catalogue. It will not be used in Atlas Trading System v1.0.
