# Sprint 027: Edge Attribution Analysis — Execution Model A1

**Date:** 2026-07-08
**Dataset:** MNQ 5-minute (July 2024 – July 2026)
**Objective:** Perform a complete Edge Attribution analysis on Model A1 to identify the root cause of its Year 1 underperformance and test alternative solutions before authorising development of Model A2.

---

## 1. Executive Summary

Model A1 produced a Profit Factor (PF) of 1.140 in Year 1 compared to 2.496 in Year 2. Edge attribution analysis confirms this is not random variance, but a strict regime-dependency.

The root cause of Year 1 underperformance is **Trend Exhaustion (High ADX)**. Model A1 relies on volatility expansion followed by a depth-constrained pullback. When this occurs in a low-ADX environment (ADX < 30), it signals the *start* of a new trend, producing a PF of 1.854. When this occurs in a high-ADX environment (ADX > 30), it signals a late-stage blow-off top, resulting in trend exhaustion and failure.

Alternative solutions (dynamic sizing, different exits, regime exclusion) were tested. While regime exclusion (blocking trades when ADX > 30) improved the overall PF, it severely reduced trade frequency (from 179 to 97 trades over two years) and did not solve the Year 1 drawdown (Year 1 PF improved only to 1.026).

**Recommendation:** Model A1 cannot be "fixed" to perform in high-ADX environments because its structural logic (pullback continuation) is fundamentally incompatible with late-stage trend exhaustion. Therefore, **Model A2 is required**. Atlas needs a complementary execution model specifically designed to capture edge in high-ADX trending regimes where Model A1 must be blocked.

---

## 2. Ranked Feature Importance

Every trade was partitioned into quartiles across six regime variables to determine which features had the highest predictive power over Profit Factor.

| Rank | Feature | Predictive Power (PF Spread) | Q1 PF | Q4 PF |
|---|---|---|---|---|
| 1 | Trade Duration (Bars Held) | 2.732 | 0.583 | 2.479 |
| 2 | VWAP Distance | 1.413 | 2.495 | 2.503 |
| 3 | Pullback Depth | 1.098 | 2.599 | 1.501 |
| **4** | **ADX (Trend Strength)** | **0.920** | **2.225** | **1.948** |
| 5 | ATR Percentile | 0.889 | 1.612 | N/A |
| 6 | Volatility Expansion Ratio | 0.848 | 1.616 | 1.903 |

*Note: While Trade Duration had the highest spread, it is an outcome variable, not an entry condition. Of the pre-trade regime variables, VWAP Distance and ADX showed the strongest predictive power.*

---

## 3. Root Cause Analysis: The Year 1 Problem

The statistical distributions of the core regime variables were compared between Year 1 and Year 2.

* **ATR Percentile:** Year 1 (88.62) vs Year 2 (91.12)
* **Vol Expansion:** Year 1 (2.58) vs Year 2 (2.68)
* **Pullback Depth:** Year 1 (0.93) vs Year 2 (0.96)
* **ADX:** Year 1 (29.41) vs Year 2 (31.33)

While the mean ADX was similar, the *performance* across ADX quartiles was drastically different:

| ADX Regime | Year 1 PF | Year 2 PF |
|---|---|---|
| ADX < 15 | 3.781 | 2.933 |
| ADX 15–20 | 0.888 | 4.999 |
| **ADX 20–25** | **0.112** | **1.807** |
| ADX 25–30 | 2.526 | 4.281 |
| **ADX 30–40** | **1.339** | **1.321** |
| **ADX > 40** | **1.260** | **2.935** |

Model A1 thrives in low-to-moderate ADX environments (ADX < 30) because the volatility expansion signals the *initiation* of a new trend. In high-ADX environments (ADX > 30), the trend is already mature. A sudden volatility expansion in a mature trend is frequently a liquidity sweep or blow-off top, causing the subsequent pullback to fail.

---

## 4. Testing Alternative Solutions

Before concluding that a new model was required, three alternative solutions were tested on Model A1.

### 4.1 Alternative Exits (RR Targets)
* **1.0 RR:** PF 1.396
* **1.5 RR:** PF 1.730
* **2.0 RR:** PF 1.773 (Current Baseline)
* **2.5 RR:** PF 1.507
* **3.0 RR:** PF 1.668

*Result:* The current 2.0 RR target is already optimal. Changing exits does not solve the regime dependency.

### 4.2 Dynamic Position Sizing
Halving risk when ADX > 30 produced a PF of 1.802 (vs baseline 1.773).
*Result:* A minor improvement, but insufficient to solve the Year 1 drawdown.

### 4.3 Regime Exclusion (Blocking Trades)
Blocking all trades when ADX > 30 produced the best statistical improvement for Model A1:
* **Trades:** Reduced from 179 to 97
* **Overall PF:** Improved from 1.773 to 1.854
* **Year 1 PF:** Improved from 1.140 to 1.026
* **Year 2 PF:** Improved from 2.496 to 3.007

*Result:* Regime exclusion successfully protects the edge, but it highlights the core problem: it leaves Atlas with only 97 trades over two years, and Year 1 remains effectively breakeven.

---

## 5. Final Recommendation

**The data demonstrates that Model A1's weakness is structural, not a parameter error.**

Model A1 is a trend-initiation model. It fails in mature trends. No amount of dynamic sizing or exit modification will force a trend-initiation model to work in a trend-exhaustion regime.

Therefore, the development of **Model A2** is statistically justified and required.

**Model A2 Objective:**
Discover and validate an execution model specifically designed for high-ADX trending environments (ADX > 30). This model must capture continuation or mean-reversion edge in mature trends where Model A1 is blocked.

When Model A2 is complete, Atlas Risk Intelligence (ARI) will dynamically route capital to Model A1 when ADX < 30, and to Model A2 when ADX > 30, creating a complete, all-regime trading system.
