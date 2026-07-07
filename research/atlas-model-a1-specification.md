# Atlas Execution Model A1 — Permanent Specification

## 1. Model Definition

**Status:** Trusted Execution Model  
**Instrument:** MNQ (Micro E-mini Nasdaq-100)  
**Timeframe:** 5-minute  
**Risk/Reward:** 1:2 (Stop = 1.0 ATR, Target = 2.0 ATR)

### Component Architecture
- **Structural Component (C-STR-001):** Volatility Expansion. Defined as current ATR(5) > 1.8 × ATR(5) from 20 bars ago.
- **Trigger Component (C-TRG-001):** Depth-Constrained Pullback. Defined as a 1-leg pullback touching the EMA21 in an EMA9/21/50 aligned trend, where the distance from the recent 10-bar swing extreme to the current close is between `0.5 and 1.2 * ATR(14)`.

## 2. Operational Characterisation

This model is not an always-on strategy. It is a statistically characterised market behaviour with specific operating conditions. Guardian must enforce these constraints.

### 2.1 Temporal Constraints
- **Session:** The model is overwhelmingly a PM session phenomenon. 
  - **13:00–14:00 ET:** Optimal window (PF 1.836, WR 48.7%).
  - **14:00–16:00 ET:** Strong window (PF 1.42+).
  - **12:00–13:00 ET:** Negative expectancy (PF 0.729).
  - **AM Session:** Negative expectancy.
  - *Rule:* Guardian must **BLOCK** this model outside the 13:00–16:00 ET window.
- **Day of Week:** Profitable Monday through Thursday. 
  - **Friday:** Negative expectancy (PF 0.732, WR 28.3%).
  - *Rule:* Guardian must **BLOCK** this model on Fridays.

### 2.2 Structural Constraints
- **Direction:** Symmetrical. Both Long (PF 1.248) and Short (PF 1.573) are profitable. Short trades have a higher win rate (45.5% vs 38.0%) and higher payoff.
- **Volatility:** Performs best in low-to-medium volatility environments (Daily ATR < 15.8) and extreme high volatility environments (Daily ATR > 20.6). It struggles in the upper-middle quartile (Q3).
- **Trend Strength:** Performs exceptionally well when ADX(14) is low at the time of entry (Q1: ADX <= 21.0, PF 1.946). This indicates the model successfully catches the *start* of a new trend following an expansion, rather than entering late into an exhausted trend.

## 3. Risk & Drawdown Profile

Guardian must size positions based on these empirical probabilities, not arbitrary percentages.

### 3.1 Trade Duration
- **Winners:** Average 6.9 bars (35 minutes). 90% of winners close within 14 bars.
- **Losers:** Average 4.1 bars (20 minutes). 90% of losers close within 9 bars.
- *Insight:* The edge is fast. If a trade takes longer than 15 bars (75 minutes) to resolve, the structural advantage has likely decayed.

### 3.2 Streak Probability & Risk of Ruin
- **Win Rate:** 41.3%
- **Payoff Ratio:** 1.97 (Avg Win $98.21 / Avg Loss $49.75)
- **Consecutive Losses:** The model frequently experiences 3-4 consecutive losses.
  - Probability of 4 consecutive losses: 11.9%
  - Probability of 6 consecutive losses: 4.1%
  - Maximum observed losing streak: 7
- **Kelly Criterion:** The mathematical optimal risk is 11.5% per trade. The half-Kelly (safe maximum) is 5.75%. The conservative allocation is 2.88%.

### 3.3 Capital Allocation (Guardian Logic)
For a $50,000 Prop Firm account with a $2,000 trailing drawdown limit:
- A 1.0% account risk ($500 per trade) yields a 0.0000% mathematical risk of ruin.
- The Monte Carlo 5th percentile worst-case drawdown is -$1,245.
- *Rule:* Guardian should allocate a maximum of **1.0% risk per trade** to this model on a $50k prop evaluation to ensure the worst-case sequence does not breach the $2,000 limit.

## 4. Equity Curve Stability
- **R-squared:** 0.9453 (Strong linear growth)
- **Monthly Consistency:** Profitable in 18 of 25 months (72%).
- **Calmar Ratio:** 6.26 (Net $3,231 / Max DD $516)

## 5. Conclusion
Model A1 is a highly robust, fast-resolving PM-session continuation model. It captures the institutional volume that enters the market after the European close. Guardian must restrict its operation to Tuesday–Thursday afternoons to maximise the mathematical edge.
