# Atlas Research Review v1.0
**Date:** 2026-07-08
**Sprint:** 034 (Meta-Analysis I)

This document is a comprehensive synthesis of the first 33 research sprints in Project Atlas. It evaluates all accepted and rejected hypotheses, execution models, and behavioural studies to identify the underlying themes that govern the MNQ futures market.

---

## 1. The Evidence Inventory

Atlas has tested 10 major hypotheses across 33 sprints. The results fall into three categories:

### 1.1 Validated Components & Models
- **C-STR-001 (Volatility Expansion):** Validated. Current ATR(5) > 1.8 × ATR(5) from 20 bars ago.
- **C-TRG-001 (Depth-Constrained Pullback):** Validated. EMA21 touch where depth from swing extreme is 0.5 to 1.2 ATR(14).
- **Atlas Execution Model A1:** Validated (PF 1.387). A combination of C-STR-001 and C-TRG-001. Survived all stress tests (Sprint 025).
- **Volatility Contraction → Expansion Asymmetry:** Validated (Sprint 033). Compression breakouts resolve in the direction of the higher-timeframe trend 57.4% of the time, heavily skewed to the overnight session.

### 1.2 Rejected Execution Concepts
- **Unconditional Triggers (Sprint 021):** Pullbacks, Liquidity Sweeps, Breakouts, and Mean Reversions all failed when traded unconditionally during RTH.
- **Trigger/Structure Interactions (Sprint 023):** Four combinations (e.g., Liquidity Sweep + High Tradeability) failed, demonstrating that broad structural filters cannot save imprecise trigger definitions.
- **Daily 200 EMA (Sprint 022):** Failed completely. Fading extensions and trading bounces both resulted in negative expectancy. The market treats the D200 EMA as liquidity, not structure.
- **Momentum Continuation (Sprint 029):** Failed. Entering purely on a sequence of strong closes (without a structural anchor) is destroyed by routine micro-pullbacks.
- **Casper SMC First Candle Value (Sprint 030):** Failed. The 15-minute Value Area has zero predictive power as a structural boundary for the remainder of the session.

### 1.3 Rejected Behavioural Hypotheses
- **Overnight Inventory Imbalance (Sprint 032):** Failed. The Globex net directional range explains less than 2% of the variance in the RTH morning direction. The relationship is unstable year-over-year.

---

## 2. Meta-Analysis: The Underlying Themes

Synthesising these 33 sprints reveals several profound truths about the MNQ market.

### 2.1 What Consistently Fails
**1. Unanchored Entries:** Every strategy that enters "in the air" (e.g., Momentum Continuation, simple EMA touches without depth constraints) fails. The MNQ market is too noisy. Entries must be anchored to a specific structural event (a defined pullback depth or a compression breakout) to provide a logical placement for a tight stop loss.
**2. Arbitrary Levels:** The Daily 200 EMA and the 15-minute Value Area failed because they are arbitrary lines on a chart. Institutional order flow does not respect these levels as hard boundaries; it frequently sweeps them for liquidity.
**3. The AM Session for Trend Continuation:** Model A1 (trend initiation) has a negative expectancy in the AM session. The morning is characterised by liquidity sweeps, inventory corrections, and erratic price discovery. Clean structural setups rarely form before midday.

### 2.2 What Consistently Succeeds
**1. Precision over Broad Filters:** Sprint 023 (broad filters) failed. Sprint 024 (precise definitions) succeeded. A "Pullback" is too vague. A "1-leg pullback touching EMA21 with a depth of 0.5–1.2 ATR" is a testable, exploitable behaviour.
**2. The PM Session for Trend Initiation:** Model A1 generates 90% of its edge between 13:00 and 16:00 ET. The PM session is where institutional order flow consolidates and continues the directional bias established earlier in the day.
**3. The Overnight Session for Accumulation:** Volatility compression breakouts skew heavily with the trend during the overnight session (58.7%), but invert during RTH (39.0%). The overnight session represents genuine accumulation; RTH compression breakouts are often liquidity traps.

### 2.3 The Role of Market Regimes
The most important finding of the first 33 sprints is that **every execution model is regime-dependent**.
- Model A1 performs exceptionally well in low-ADX environments (catching the start of a trend) but fails in high-ADX environments (buying the top of an exhausted trend).
- Volatility Contraction Asymmetry performs best in high-ADX environments (trend continuation).

This confirms the core thesis of Atlas Trading System v1.0: a complete trading system cannot rely on a single execution model. It requires a portfolio of models, dynamically managed by Atlas Risk Intelligence (ARI) based on the current regime.

---

## 3. The Path Forward

The research has definitively eliminated "indicator combinations" and "arbitrary levels" from the design space. Atlas now knows that edge exists only at the intersection of precise structural events (e.g., depth-constrained pullbacks, volatility compression) and specific market regimes (e.g., low ADX / PM session, high ADX / overnight session).

The next phase of Atlas is portfolio engineering: building the models that fill the regime gaps identified in this review.
