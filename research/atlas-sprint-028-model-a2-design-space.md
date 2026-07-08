# Sprint 028: Model A2 Design Space Survey

**Date:** 2026-07-08
**Research Stream:** B — Execution Intelligence
**Objective:** Discover, evaluate, and rank candidate execution concepts from first principles to serve as Model A2—a strategy specifically designed for established, high-ADX trending environments.

---

## 1. The Design Space: Established Trends

Model A1 is a trend-initiation model that fails during mature trends (ADX > 30). The objective of Model A2 is to capture edge in these exact environments.

In an established trend, the market behaviour fundamentally changes:
1. Pullbacks become shallower or non-existent.
2. Momentum (velocity) becomes the dominant force over structure (depth).
3. Mean reversion forces weaken; continuation probability exceeds reversal probability.

The design space for Model A2 must exploit these specific characteristics.

---

## 2. Candidate Execution Concepts

Five distinct execution concepts were evaluated from first principles.

### Candidate 1: Momentum Continuation (Strong Close Ratio)
**1. Market Behaviour Exploited:** In a strong trend, the dominant side consistently closes bars near the extreme of the candle.
**2. Theoretical Justification:** A high ratio of strong closes in the direction of the trend indicates persistent institutional buying/selling pressure without significant absorption.
**3. Success Conditions:** High ADX, steep EMA slope, uninterrupted order flow.
**4. Failure Conditions:** Volatility expansion leading to climax (blow-off top); structural exhaustion.
**5. Measurable Variables:** ADX > 30; Close relative to High/Low (e.g., Close in top 25% of bar range); consecutive directional bars.
**6. Expected Robustness Rank:** **#1**

### Candidate 2: Breakout Continuation (Micro-Consolidation Break)
**1. Market Behaviour Exploited:** Strong trends often pause in tight, low-volatility ranges before resuming the primary direction.
**2. Theoretical Justification:** A micro-consolidation represents a brief equilibrium where late retail participants take profit and institutions accumulate before the next leg. The breakout confirms resumption.
**3. Success Conditions:** High ADX, brief volatility contraction (e.g., inside bars or tight 3-bar range), breakout in trend direction.
**4. Failure Conditions:** False breakouts (liquidity sweeps) preceding a deeper structural pullback or reversal.
**5. Measurable Variables:** ADX > 30; short-term ATR contraction; Close > recent N-bar High.
**6. Expected Robustness Rank:** **#2**

### Candidate 3: Shallow Pullback Continuation (EMA9/EMA21 Touch)
**1. Market Behaviour Exploited:** In mature trends, price rarely pulls back deeply. It rides short-term moving averages.
**2. Theoretical Justification:** The EMA9 or EMA21 acts as dynamic support/resistance in high-velocity trends. A touch and immediate rejection confirms trend persistence.
**3. Success Conditions:** High ADX, steep EMA slope, price remains above EMA50.
**4. Failure Conditions:** The touch is the beginning of a deeper structural correction or reversal.
**5. Measurable Variables:** ADX > 30; distance from EMA9/21; bar close direction relative to touch.
**6. Expected Robustness Rank:** **#3**

### Candidate 4: Donchian Channel Breakout (New Extremes)
**1. Market Behaviour Exploited:** A trend is defined by a sequence of higher highs or lower lows.
**2. Theoretical Justification:** Buying the highest high of the last N periods guarantees participation in the trend.
**3. Success Conditions:** High ADX, low volatility expansion prior to breakout.
**4. Failure Conditions:** Buying the absolute top of an exhausted trend; high susceptibility to mean reversion.
**5. Measurable Variables:** ADX > 30; Close > Donchian Upper Band (N-periods).
**6. Expected Robustness Rank:** **#4**

### Candidate 5: Opening Range Continuation
**1. Market Behaviour Exploited:** The first hour of trading often establishes the directional bias for the day.
**2. Theoretical Justification:** A breakout of the opening range in the direction of the higher-timeframe trend captures the day's primary liquidity flow.
**3. Success Conditions:** High daily ADX, strong opening volume.
**4. Failure Conditions:** Choppy, range-bound days where the opening range is a false boundary.
**5. Measurable Variables:** Daily ADX > 30; Time = 10:30 ET; Close > 9:30-10:30 High.
**6. Expected Robustness Rank:** **#5** (Highly time-dependent, less adaptable to intraday regime shifts).

---

## 3. Recommended Model A2 Candidate: Momentum Continuation

**Recommendation:** Candidate 1 (Momentum Continuation via Strong Close Ratio) is selected as the primary candidate for Model A2.

### Why Momentum Continuation?
1. **First Principles Alignment:** In a high-ADX environment, momentum is the defining characteristic. A strong close ratio directly measures this momentum.
2. **Complementary to Model A1:** Model A1 requires a pullback (depth). Momentum Continuation explicitly avoids waiting for depth, entering when velocity is highest.
3. **Robustness:** It relies on the internal structure of the bars (close vs high/low) rather than arbitrary price levels or moving averages, making it less susceptible to curve-fitting.

### Test Specification
**Regime Filter:**
* ADX(14) > 30 (Initial threshold, subject to testing)
* EMA9 > EMA21 > EMA50 (Trend alignment)

**Execution Trigger:**
* A sequence of N bars (e.g., 3 bars) where the Close is in the top 25% of the bar range (for Longs).
* No volatility climax (e.g., current bar range < 2.0 * ATR).

**Validation Criteria:**
* Profit Factor > 1.20
* Positive expectancy across both Year 1 and Year 2.
* Trade count > 100 over the 2-year dataset.
* Drawdown compatible with prop firm limits.

---

## 4. Next Steps

1. Build the test harness for the Momentum Continuation concept.
2. Run a parameter sweep across ADX thresholds, sequence lengths (N bars), and close ratio thresholds.
3. Attempt to falsify the hypothesis before accepting it. If Momentum Continuation fails, proceed to Candidate 2 (Breakout Continuation).
