# Atlas Market Inefficiency Discovery
## Sprint 031: Behaviour Before Strategy

**Date:** 2026-07-08  
**Research Stream:** D — Component Intelligence  
**Objective:** Discover persistent, measurable market behaviours from which execution models can later be engineered.  

---

## 1. The Behavioural Philosophy

Atlas no longer searches for strategies. Atlas searches for persistent market behaviours. Execution models are engineered only after a behavioural edge has been objectively demonstrated.

This document catalogues the strongest theoretical market inefficiencies in MNQ/NQ futures, derived from first principles. Each hypothesis attempts to answer one question: *"If this market behaviour truly exists, what execution model would exploit it most effectively?"*

---

## 2. Ranked Behavioural Hypothesis Catalogue

The following behaviours are ranked by their expected research value — a combination of theoretical robustness, objective measurability, and immunity to curve-fitting.

### Rank 1: Overnight Inventory Imbalance Resolution
**Hypothesis:** When the overnight session (Globex) establishes a significant directional inventory imbalance, the regular trading hours (RTH) session will exhibit a predictable response (either continuation or mean reversion) based on the opening price relative to the previous day's value area.
- **Why it exists:** Overnight participants are often trapped when RTH liquidity enters the market. If the open is outside value, late overnight participants must cover, driving price rapidly in the opposite direction (inventory correction).
- **Participants creating it:** Globex retail/algorithmic traders vs RTH institutional volume.
- **Measurable variables:** Globex net delta/range, RTH open relative to prior day VWAP/Value Area.
- **Falsification:** If RTH directional moves show zero correlation to the Globex net directional range.
- **Implementation complexity:** Medium (requires session splitting and prior-day reference levels).
- **Overfitting risk:** Low. The behaviour is rooted in structural market mechanics (margin and margin calls), not arbitrary indicators.

### Rank 2: Volatility Contraction → Expansion Asymmetry
**Hypothesis:** Periods of extreme volatility contraction (compression) do not resolve randomly; the direction of the subsequent expansion is statistically skewed toward the prevailing higher-timeframe trend.
- **Why it exists:** Contraction represents institutional accumulation/distribution. Institutions do not accumulate against the macroeconomic trend; they absorb liquidity within it before initiating the next impulse.
- **Participants creating it:** Institutional passive limit orders absorbing retail market orders.
- **Measurable variables:** ATR ratio (short-term vs long-term), ADX of the higher timeframe, direction of the breakout bar.
- **Falsification:** If breakouts from compression zones resolve 50/50 long/short regardless of the higher timeframe trend.
- **Implementation complexity:** Low (Atlas already possesses C-REG-001 Volatility Compression).
- **Overfitting risk:** Low. Volatility cycles are a fundamental property of auction markets.

### Rank 3: Session Transition Liquidity Sweeps
**Hypothesis:** The transition between major liquidity sessions (e.g., European close / US midday) predictably sweeps the structural extremes established in the preceding session before reversing.
- **Why it exists:** Session extremes represent concentrated pools of stop-loss orders. As one participant group exits (Europe) and another dominates (US PM), algorithms target these liquidity pools to fill large orders without slippage.
- **Participants creating it:** Algorithmic market makers and institutional execution algos.
- **Measurable variables:** European session High/Low, time of day (11:30–13:00 ET), price penetration depth, subsequent reversal velocity.
- **Falsification:** If price penetration of session extremes results in continuation >50% of the time.
- **Implementation complexity:** High (requires precise structural peak identification and session timing).
- **Overfitting risk:** Medium. Time-of-day effects can shift due to macroeconomic calendar changes (e.g., FOMC days).

### Rank 4: Trend Exhaustion vs. Pullback Depth
**Hypothesis:** In an established trend, the probability of continuation is inversely proportional to the depth of the pullback relative to the Average True Range (ATR). Beyond a specific ATR threshold, the structure transitions from a pullback to a reversal.
- **Why it exists:** Shallow pullbacks indicate aggressive institutional accumulation (buying at market). Deep pullbacks indicate institutional absence or active distribution.
- **Participants creating it:** Trend-following funds vs mean-reversion algorithms.
- **Measurable variables:** ADX, pullback depth in ATR multiples, swing high/low distance.
- **Falsification:** If continuation success rates are identical across all pullback depths (e.g., 0.5 ATR pullbacks succeed as often as 3.0 ATR pullbacks).
- **Implementation complexity:** Medium (requires swing state tracking).
- **Overfitting risk:** Medium. The exact ATR threshold is susceptible to curve-fitting if not tested across multiple regimes.

### Rank 5: Opening Range Breakout Failure (Trap)
**Hypothesis:** The initial breakout of the first 30-minute Opening Range is statistically more likely to fail and reverse than to continue, especially when the breakout occurs on declining volume.
- **Why it exists:** The opening 30 minutes establishes the boundaries of retail participation. Institutional players allow the breakout to trigger retail momentum algorithms, providing the necessary liquidity for institutions to build positions in the opposite direction.
- **Participants creating it:** Retail breakout traders vs institutional absorption.
- **Measurable variables:** 30-min High/Low, breakout penetration depth, volume delta on the breakout bar, close price relative to the OR boundary.
- **Falsification:** If OR breakouts result in sustained trend days >50% of the time.
- **Implementation complexity:** Medium.
- **Overfitting risk:** High. ORB strategies are notoriously curve-fitted to specific timeframes (e.g., 5-min vs 15-min vs 30-min).

---

## 3. Required Datasets for Validation

To validate these behavioural hypotheses without curve-fitting, Atlas requires:
1. **High-Resolution Intraday Data:** 1-minute or tick data for precise volume profile and liquidity sweep measurement. (Currently available: MNQ 1-min and 5-min).
2. **Extended History:** Minimum 5 years to capture multiple macroeconomic regimes (zero interest rates vs high interest rates, quantitative easing vs tightening).
3. **Out-of-Sample Partition:** A strictly isolated dataset (e.g., Year 3) that is never touched during the hypothesis testing phase.

---

## 4. Research Roadmap & Recommendation

Atlas should transition immediately from testing execution strategies to testing market behaviours. 

### The Recommendation
Atlas should begin with **Rank 1: Overnight Inventory Imbalance Resolution**.

**Why?**
1. It is entirely independent of Model A1. Model A1 operates in the PM session (13:00–16:00 ET). The overnight inventory correction operates in the AM session (09:30–11:00 ET).
2. If validated, it provides a perfect portfolio complement to Model A1, smoothing the equity curve by generating edge in the morning session while Model A1 generates edge in the afternoon.
3. It is structurally sound. Margin requirements and overnight liquidity constraints are permanent features of the futures market.

### Next Steps for Sprint 032
1. Do not build an execution model.
2. Build a behavioural measurement harness.
3. Measure the overnight net directional range (Globex Open to RTH Open).
4. Measure the RTH directional movement (RTH Open to 12:00 ET).
5. Calculate the correlation coefficient between the two variables.
6. Determine if an exploitable asymmetry exists. 

If the behaviour is proven to exist, *then* Atlas will engineer the execution model to exploit it.
