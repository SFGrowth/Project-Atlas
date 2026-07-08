# Atlas Knowledge Base

**The primary output of Atlas is knowledge. Code simply implements validated knowledge.**

This document is the institutional memory of Project Atlas. Every completed experiment creates a permanent research record here. Future hypotheses must build upon this evidence rather than repeating work already completed.

---

## The Epistemology Principle

Atlas is an epistemology project. It exists to answer one question: "How do we know something is true?" Every research stream exists to reduce uncertainty through evidence. Knowledge is the compounding asset. Everything else—including profit—is simply an application of that knowledge.

Every entry in this Knowledge Base represents a specific instance of converting uncertainty into validated knowledge.

---

## 2026-07-07 | Sprint 018: Thomas Wade Execution Component Validation

**Research Stream:** B — Execution Intelligence  
**Research Question:** Do the discretionary concepts taught by Thomas Wade possess a statistically robust edge when systematised?  
**Hypothesis:** A systematised Thomas Wade strategy (BOS structure, two-leg pullbacks, signal bar quality, EMA location) will produce a Profit Factor > 1.20 over a 2-year MNQ dataset.  
**Experimental Design:** 3,456-combination parameter sweep across 140,933 bars of 5-min MNQ data. Every component tested independently, then combined.  
**Results:** Peak combination achieved PF=1.141, Win Rate=31.4%, Max Drawdown=-$9,903. The strategy performed well in trending regimes (PF=1.286) but collapsed in ranging regimes (PF=0.945).  
**Decision:** **REJECTED** as a standalone execution strategy.  
**Lessons Learned:** 
1. Two-leg pullbacks statistically outperform single-leg pullbacks (reduced drawdown).
2. Tighter stops (0.75 ATR) improve expectancy over wider stops.
3. The core issue is not the entry rules, but the inability to distinguish between trending and ranging regimes before entry.
**Future Research:** Build a Market Regime Engine to filter Ranging regimes before evaluating any execution signal.

---

## 2026-07-07 | Sprint 019: Market Regime Classification

**Research Stream:** A — Market Intelligence  
**Research Question:** Can we objectively classify market regimes to filter out low-expectancy environments before entry?  
**Hypothesis:** Measuring Volatility Compression and VWAP Deviation will improve the Profit Factor of a baseline trend-following strategy by filtering chop.  
**Experimental Design:** 8 independent hypotheses tested (ADX, ATR Expansion, Chop Index, EMA Slope, Swing Efficiency, Volatility Compression, VWAP Deviation, Session Context).  
**Results:** 
- Volatility Compression (ATR ratio ≤ 0.7) improved PF from 0.95 to 1.222 and reduced DD by $14,071.
- VWAP Deviation (≤ 1.5 ATR) improved PF and reduced DD by $9,952.
- ADX, Chop Index, and EMA Slope increased drawdown and were rejected.
**Decision:** **ACCEPTED** (Volatility Compression and VWAP Deviation). Regime Engine v1.0 frozen.  
**Lessons Learned:** Compression and VWAP proximity are highly effective filters for avoiding noise in MNQ futures.  
**Future Research:** Validate the frozen Regime Engine v1.0 on out-of-sample data.

### Component Knowledge Record: Volatility Compression (C-REG-001)
- **Purpose:** Identifies periods of volatility contraction relative to recent history to filter out high-noise, low-expectancy environments.
- **Hypothesis:** Trading only when short-term volatility is compressed relative to long-term volatility reduces drawdown.
- **Statistical Evidence:** Improved PF from 0.95 to 1.222; reduced Max Drawdown by $14,071 on 2-year MNQ data.
- **Confidence Level:** High (In-Sample)
- **Replication Status:** Pending Out-of-Sample Validation
- **Strengths:** Exceptional capital protection; avoids major chop zones.
- **Weaknesses:** Highly restrictive (passes only 0.7% of bars at 0.7 threshold).
- **Suitable Market Regimes:** All (acts as a universal filter).
- **Strategies Using This Component:** None yet (pending Regime Engine v2.0 opportunity density improvements).

### Component Knowledge Record: VWAP Deviation (C-REG-002)
- **Purpose:** Ensures price is within a reasonable distance from VWAP, avoiding over-extended entries.
- **Hypothesis:** Mean reversion forces eventually overwhelm trend continuation when price is too far from VWAP.
- **Statistical Evidence:** Reduced Max Drawdown by $9,952 on 2-year MNQ data.
- **Confidence Level:** High (In-Sample)
- **Replication Status:** Pending Out-of-Sample Validation
- **Strengths:** Prevents buying the top or selling the bottom of over-extended moves.
- **Weaknesses:** May miss the strongest runaway trend days.
- **Suitable Market Regimes:** Trend Continuation.
- **Strategies Using This Component:** None yet.

---

## 2026-07-07 | Sprint 020b: Guardian Contribution Analysis

**Research Stream:** C — Capital Intelligence  
**Research Question:** Does the Guardian Risk Intelligence Engine independently improve the robustness of a validated strategy?  
**Hypothesis:** A strategy filtered by Guardian will outperform the exact same strategy without Guardian.  
**Experimental Design:** Controlled experiment. Experiment A (Validated Strategy, no Guardian) vs Experiment B (Validated Strategy + Guardian enabled). Only one variable changed.  
**Results:** Both experiments produced identical results (PF=0.15, 48 trades). Guardian blocked 0 trades that passed the underlying regime filters.  
**Decision:** **REJECTED** (Guardian currently provides no independent edge).  
**Lessons Learned:** 
1. The execution signal (EMA21 proximity pullback) lacks statistical edge. Validated regime filters are necessary but not sufficient.
2. Guardian is currently acting as a second Regime Engine because it measures the same market characteristics (ATR, VWAP).
**Future Research:** 
1. (Stream B) Research execution entries from first principles (sweeps, breakouts, mean reversion).
2. (Stream C) Redesign Guardian to consume account-state information (consecutive losses, daily drawdown, prop firm limits) so it allocates capital rather than classifying markets.
---

## 2026-07-08 | Sprint 027: Edge Attribution Analysis (Model A1)

**Research Stream:** B — Execution Intelligence  
**Research Question:** What is the root cause of Model A1's underperformance in Year 1, and can it be solved through alternative parameters or regime exclusion?  
**Hypotheses Tested:** Feature importance ranking across trade duration, VWAP distance, pullback depth, ADX, ATR percentile, and volatility expansion. Tested alternative exits, dynamic sizing, and ADX-based regime exclusion.  
**Experimental Design:** Partitioned all historical Model A1 trades by regime variables at entry. Simulated alternative solutions on the full 2-year dataset.  
**Results:** 
- **Root Cause:** Model A1 is a trend-initiation model that fails during late-stage trend exhaustion.
- **Predictive Power:** ADX (Trend Strength) has the highest pre-trade predictive power (PF spread 0.920).
- **Regime Dependency:** In low-ADX environments (ADX < 30), Model A1 produced PF 1.854. In high-ADX environments (ADX > 30), it failed completely.
- **Alternative Solutions:** Blocking trades when ADX > 30 improved PF but starved the system of trades (97 over two years) and did not solve the Year 1 drawdown (Year 1 PF 1.026).  
**Decision:** **MODEL A2 REQUIRED**.  
**Lessons Learned:** Model A1 cannot be "fixed" to perform in high-ADX environments because its structural logic (pullback continuation) is fundamentally incompatible with late-stage trend exhaustion. A complementary execution model is required for high-ADX regimes.  
**Future Research:** Stream B (Execution Intelligence). Discover and validate Model A2 specifically for high-ADX trending environments.

---

## 2026-07-08 | Sprint 026: Execution Model Characterisation (Model A1)

**Research Stream:** B — Execution Intelligence  
**Research Question:** What are the exact operational characteristics and environmental dependencies of Atlas Execution Model A1?  
**Hypotheses Tested:** PM hour decomposition, day of week, monthly consistency, long/short symmetry, volatility/trend quartiles, trade duration, streak probability, and risk of ruin.  
**Experimental Design:** Observational analysis of the 286 trades generated by the frozen Model A1 configuration over the 2-year MNQ dataset.  
**Results:** 
- **Temporal:** The edge exists exclusively between 13:00 and 16:00 ET. The 12:00-13:00 hour and Fridays have negative expectancy.
- **Trend:** Performs best when ADX is low (<=21.0) at entry, indicating it catches the *start* of a trend following expansion.
- **Duration:** Fast resolution. Winners average 35 mins, losers average 20 mins.
- **Risk:** Win rate 41.3%, Payoff 1.97. Max observed losing streak is 7.
- **Stability:** Equity curve R-squared is 0.9453 (highly linear). Profitable in 72% of months.  
**Decision:** **CHARACTERISED**. Permanent specification document created.  
**Lessons Learned:** A validated model is not an always-on strategy. Model A1 is specifically a Tuesday-Thursday afternoon phenomenon.  
**Future Research:** Stream C (Capital Intelligence). Guardian will now be redesigned to consume this specification and allocate capital dynamically.

---

## 2026-07-08 | Sprint 025: Execution Model Validation (Model A1)

**Research Stream:** B — Execution Intelligence  
**Research Question:** Does the frozen Candidate Execution Model A1 survive independent stress testing, or is it a fragile curve-fit anomaly?  
**Hypotheses Tested:** Slippage tolerance, parameter sensitivity (neighbourhood analysis), quarterly stability, session decomposition, long/short symmetry, and Monte Carlo sequence risk.  
**Experimental Design:** Re-run the frozen configuration across 2-year MNQ with injected friction, parameter shifts, and 1,000 sequence shuffles.  
**Results:** 
- The model survived 4 ticks ($2.00) of slippage per trade while remaining profitable (PF 1.251).
- Every parameter in the immediate neighbourhood remained highly profitable (PF > 1.29), proving the edge is broad and robust.
- The model was profitable in 9 out of 9 quarters (100% stability).
- Both Long (PF 1.248) and Short (PF 1.573) sides are profitable.
- Monte Carlo 5th percentile (worst-case) Max Drawdown is -$1,245, safely inside prop firm limits.
- **Key Insight:** The edge is overwhelmingly a PM session phenomenon (258 PM trades vs 28 AM trades).  
**Decision:** **PROMOTED to Atlas Execution Model A1**.  
**Lessons Learned:** A model may be validated, but it is not trusted until it survives independent validation. The robustness of this edge proves that precise definitions of market behaviour create durable edges.  
**Future Research:** Stream C (Capital Intelligence) can now begin. Guardian will be designed to allocate capital to Model A1.

---

## 2026-07-08 | Sprint 024: Component Precision Research (H-B007)

**Research Stream:** B/D — Execution & Component Intelligence  
**Research Question:** Does the weak edge discovered in H-B007 (Pullback + Volatility Expansion) become a robust, tradable edge when the mathematical definitions of the components are refined?  
**Hypotheses Tested:** Pullback structure (1-leg vs 2-leg), depth (ATR constrained), expansion lookback (5, 10, 20), expansion ratio (1.2 to 2.0), and timeframe (5m vs 15m).  
**Experimental Design:** Parameter sweep of 120 configurations on 5-min and 16 on 15-min across 2-year MNQ.  
**Results:** 
- The baseline (Sprint 023) PF was 1.020.
- Refining the pullback to a specific depth (0.5 to 1.2 ATR) eliminates shallow noise and deep reversals.
- Refining the expansion to a 20-bar lookback at a 1.8x ratio isolates genuine institutional participation.
- The 15-minute timeframe starves the model of trades.
- The optimal stable configuration (`legs=1 | depth=0.5-1.2 | lb=20 | ratio=1.8`) achieved **PF 1.387**, Net $3,231, and Max DD -$516 on 286 trades.  
**Decision:** **VALIDATED**.  
**Lessons Learned:** A conceptually correct interaction will fail if the component definitions are mathematically imprecise. Depth constraints and longer volatility baselines separate signal from noise.  
**Future Research:** These validated components (C-STR-001 and C-TRG-001) now form Atlas's first complete execution model. The next step is Stream C (Capital Intelligence) to design position sizing and risk management around this model.

---

## 2026-07-08 | Sprint 023: Interaction Effects (H-B006 to H-B009)

**Research Stream:** B — Execution Intelligence  
**Research Question:** Does combining a specific Trigger Component with a specific Structural Component create a statistically robust execution model that neither component could achieve alone?  
**Hypotheses:** 
- H-B006: Liquidity Sweep + High Tradeability Regime
- H-B007: Pullback Continuation + Volatility Expansion
- H-B008: Mean Reversion + Low Trend Strength
- H-B009: Breakout Continuation + Volatility Compression  
**Experimental Design:** A/B tests across 140,933 bars (2 years). Exp A: Trigger unconditional. Exp B: Trigger + Structural Condition.  
**Results:** 
- **H-B006:** PF improved slightly (0.957 to 0.967) but remained negative.
- **H-B007:** Best performer, but insufficient edge. PF improved from 1.017 to 1.023. Stable across both years, but PF too low for live execution.
- **H-B008:** Starved of trades (87 trades over 2 years). Statistically invalid.
- **H-B009:** PF degraded from 0.986 to 0.942. Compression breakouts on 5-min chart frequently fail.
**Decision:** **ALL HYPOTHESES REJECTED**.  
**Lessons Learned:** While structural filters generally improve Profit Factor and reduce drawdown by restricting trade frequency, these specific definitions of environment and event do not combine to form a tradable edge.  
**Future Research:** The definitions of the components themselves may be flawed. Return to Stream D to refine the mathematical definitions of Market Structure and Momentum before attempting further interaction tests.

---

## 2026-07-08 | Sprint 022: Daily 200 EMA Mean Reversion (H-B005)

**Research Stream:** D — Component Intelligence  
**Research Question:** Does the distance from the Daily 200 EMA possess predictive power for mean reversion or bounce entries in intraday MNQ trading?  
**Hypothesis:** Fading extreme extensions (> 2.0 Daily ATR) or trading bounces near the Daily 200 EMA (< 0.5 Daily ATR) will yield a Profit Factor > 1.20 over a 2-year dataset.  
**Experimental Design:** Tested 16 parameter configurations across 140,933 bars of 5-min MNQ data. Unconditional entries to isolate the location edge.  
**Results:** 
- **Mean Reversion (Fading Extensions):** Failed completely. PF ranged from 0.915 to 0.956. Massive drawdowns (up to -$25,411) because trends frequently extend much further than 3.0 Daily ATR without reverting.
- **Bounce (Trend Continuation):** Failed completely. PF ranged from 0.805 to 1.005. The market treats the D200 EMA as liquidity, slicing through it repeatedly.
**Decision:** **REJECTED** (The Daily 200 EMA provides zero predictive edge for intraday MNQ trading).  
**Lessons Learned:** The retail trading consensus that the Daily 200 EMA is a magic level is statistically false in the MNQ intraday environment.  
**Future Research:** Focus on structural components (BOS/CHOCH) and momentum (strong close ratio) rather than static higher-timeframe moving averages.

---

## 2026-07-07 | Sprint 021: Execution Baseline & Regime Engine Contribution

**Research Stream:** B — Execution Intelligence  
**Research Question:** Do the four candidate execution models (Pullback, Liquidity Sweep, Breakout, Mean Reversion) possess a statistical edge independently of the Regime Engine? Does the frozen Regime Engine v1.0 improve them?  
**Hypothesis:** Each entry type produces PF > 1.20 when traded unconditionally during RTH.  
**Experimental Design:** Dual-experiment framework. Experiment A (Execution only, no Regime Engine) vs Experiment B (Execution + frozen Regime Engine v1.0). Tested on 2-year MNQ dataset.  
**Results:** 
- **Baseline:** All four models failed (PF ~ 1.0, Max DD > $2,800).
- **With Regime Engine:** Liquidity Sweep DD dropped from $2,809 to $794, but PF only reached 1.071. Other models were starved of trades (< 100) because the Regime Engine passed only 0.7% of bars.  
**Decision:** **REJECTED** (All four execution models lack edge; Regime Engine v1.0 is too restrictive).  
**Lessons Learned:** 
1. The simple execution models lack intrinsic edge.
2. The frozen Regime Engine v1.0 (ATR ratio ≤ 0.7) is too restrictive, filtering out 99.3% of the market and starving the system of opportunities.  
**Future Research:** Initiate Stream A research for **Regime Engine v2.0** to discover a classification threshold that balances capital protection with opportunity generation.
