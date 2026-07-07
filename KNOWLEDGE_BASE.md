# Atlas Knowledge Base

**The primary output of Atlas is knowledge. Code simply implements validated knowledge.**

This document is the institutional memory of Project Atlas. Every completed experiment creates a permanent research record here. Future hypotheses must build upon this evidence rather than repeating work already completed.

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
