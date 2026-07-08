# Atlas Market Behaviour Model v1.0 & Opportunity Map
**Date:** 2026-07-08
**Sprint:** 034 (Meta-Analysis I)

This document formalises Atlas's current understanding of how the MNQ futures market actually behaves, based exclusively on the empirical evidence gathered in the first 33 research sprints.

---

## Part 1: Atlas Market Behaviour Model v1.0

Based on everything Atlas has learned, this is our current theory of MNQ market behaviour.

### 1. The Market is a Regime-Switching Mechanism
The market does not have a single personality. It oscillates between distinct regimes (compression vs expansion, low ADX vs high ADX). An execution model that is highly profitable in one regime will almost certainly bleed capital in another. **There is no universal trading strategy.** Profitability is achieved by matching specific execution models to their compatible regimes and standing aside when conditions mismatch.

### 2. Time of Day is a Structural Filter
The market behaves fundamentally differently depending on the session.
- **The AM Session (09:30–12:00 ET):** Characterised by erratic price discovery, inventory correction, and liquidity sweeps. Clean structural trend-initiation setups rarely survive this session.
- **The PM Session (13:00–16:00 ET):** Characterised by directional continuation. Institutional order flow consolidates and drives price smoothly. This is the optimal environment for depth-constrained pullbacks (Model A1).
- **The Overnight Session (18:00–09:30 ET):** Characterised by genuine accumulation. Without the noise of RTH retail participants, volatility compression in the overnight session reliably resolves in the direction of the higher-timeframe trend.

### 3. Retail "Levels" are Institutional Liquidity
Arbitrary levels widely used by retail traders (e.g., Daily 200 EMA, 15-minute Value Area) do not act as structural support or resistance in intraday MNQ trading. The data proves that institutional algorithms frequently sweep these levels to trigger retail stop-loss orders before reversing, or simply slice through them during high-momentum impulses. **Edge is found in price action structure (depth, compression, expansion), not static lines on a chart.**

### 4. Precision is Required for Survival
Broad, discretionary concepts (e.g., "trade the pullback") fail when tested objectively. The market is too noisy. To survive, an execution model must be mathematically precise. A pullback must be constrained by depth (0.5 to 1.2 ATR) to ensure it represents a genuine discount without signalling a trend reversal. Volatility expansion must be quantified (1.8x over 20 bars) to separate institutional participation from random spikes.

### 5. Momentum Without Structure is a Trap
Entering a trade purely because price is moving fast (Momentum Continuation) has negative expectancy. The MNQ market is characterised by micro-pullbacks. Entering "in the air" without a structural anchor (like an EMA touch after a defined pullback, or a breakout from a defined compression zone) leaves the stop-loss highly vulnerable to routine market noise.

---

## Part 2: Atlas Opportunity Map

This section identifies where Atlas believes genuine statistical edge is most likely to exist going forward, ranking future research opportunities by expected value.

### The Five Highest-Confidence Market Truths
1. **Regime Dependence:** Every execution edge is conditional on the market regime (ADX, ATR).
2. **Session Asymmetry:** The PM session strongly favours trend initiation; the AM session does not.
3. **Overnight Accumulation:** Volatility compression during the overnight session reliably resolves with the higher-timeframe trend.
4. **Structural Anchoring:** Entries must be tied to a specific structural event (pullback depth, compression breakout) to survive.
5. **The Failure of Static Levels:** Retail moving averages and arbitrary value areas possess zero predictive power intraday.

### The Five Highest-Priority Unanswered Questions
1. **The High-ADX Gap:** What execution structure successfully captures continuation in an already established, high-ADX trend during RTH?
2. **The AM Session Puzzle:** Is there a statistically robust way to exploit the erratic price discovery and liquidity sweeps of the AM session?
3. **Overnight Execution:** Can the validated Volatility Contraction Asymmetry be translated into a complete, profitable execution model (Model A3) for the overnight session?
4. **Exit Optimisation:** Model A1 uses a static 2.0 ATR target. Can dynamic exits (e.g., trailing stops based on volatility or structural breaks) increase the payoff ratio without degrading the win rate?
5. **Cross-Market Validation:** Do the behaviours validated in MNQ (Model A1, Contraction Asymmetry) hold true in related markets like ES (S&P 500) or RTY (Russell 2000)?

### Recommended Research Roadmap (Next 10 Hypotheses)
The immediate objective is to build a complete portfolio of execution models that covers all major market regimes and sessions.

1. **Model A3 Engineering:** Develop an execution model based on the validated Volatility Contraction Asymmetry (Overnight / High ADX).
2. **Model A2 Discovery (Attempt 3):** Test Breakout Continuation (micro-consolidation break) for high-ADX RTH trends.
3. **AM Session Liquidity Sweeps:** Investigate whether session transition sweeps (e.g., sweeping the European high/low between 11:30 and 13:00 ET) provide a measurable edge.
4. **Dynamic Exits for Model A1:** Test ATR-trailing stops and structural-break exits against the static 2.0 ATR target.
5. **Cross-Market Validation:** Run Model A1 against 2 years of ES data.
6. **Opening Range Breakout Failure (Trap):** Test the hypothesis that initial 30-min ORB breakouts are more likely to fail than continue.
7. **Trend Exhaustion vs. Pullback Depth:** Quantify the exact ATR depth at which a pullback transitions into a structural reversal.
8. **Volume Delta Divergence:** Investigate whether volume delta divergence at structural extremes predicts reversals.
9. **Day-of-Week Seasonality:** Deep dive into why Model A1 fails on Fridays and whether a specific Friday-only behaviour exists.
10. **AI Discovery Engine (Stream E) Pilot:** Run the first unsupervised clustering experiment on the 2-year dataset to identify hidden multi-dimensional relationships.
