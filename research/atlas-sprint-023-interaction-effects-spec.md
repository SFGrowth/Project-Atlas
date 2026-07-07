# Atlas Research Specification: Sprint 023 — Interaction Effects

## 1. Context and Objective

**Research Stream:** B — Execution Intelligence
**Sprint:** 023
**Status:** Planned

In Sprint 021, four execution triggers (Pullback, Liquidity Sweep, Breakout, Mean Reversion) were tested unconditionally as standalone strategies. All four failed to produce a statistical edge. In Sprint 022, the Daily 200 EMA was tested unconditionally. It also failed.

The core insight from these failures is that **a trigger should never be expected to produce an edge by itself**. Market participants respond to context, not merely to static reference levels or isolated events. 

The objective of Sprint 023 is to pivot Stream B research away from discovering a "perfect trigger" and toward investigating **interaction effects** between Structural Components (environment) and Trigger Components (events).

## 2. Research Question

Does combining a specific Trigger Component with a specific Structural Component create a statistically robust execution model that neither component could achieve alone?

## 3. Hypotheses (Interaction Effects)

This sprint will test four specific interaction hypotheses:

**H-B006 (Liquidity Sweep + Regime):** 
A Liquidity Sweep (C-TRG-002) becomes profitable (PF > 1.20) only when executed during a High Tradeability regime (e.g., high relative volume or ATR expansion).

**H-B007 (Pullback + Volatility):** 
A Pullback Continuation (C-TRG-001) produces a statistical edge only when it occurs immediately following a Volatility Expansion event.

**H-B008 (Mean Reversion + Trend Strength):** 
A Mean Reversion trigger (C-TRG-004) produces a statistical edge only during periods of Low Trend Strength (e.g., ADX < 20 or flat EMA slope).

**H-B009 (Breakout + Compression):** 
A Breakout Continuation (C-TRG-003) produces a statistical edge only when it immediately follows a period of Volatility Compression (C-REG-001).

## 4. Experimental Design

**Dataset:** 2-year MNQ 5-minute dataset (`MNQ_5min_full.csv`).
**Methodology:** 
For each hypothesis, we will run a controlled A/B test:
- **Experiment A (Baseline):** The trigger executed unconditionally (re-verifying Sprint 021 baseline).
- **Experiment B (Interaction):** The trigger executed *only* when the specified Structural Component condition is met.

**Test Harness:**
A Python script (`atlas_sprint_023_interactions.py`) will be built to define the four structural states and the four trigger events, running the intersection matrix across the 2-year dataset.

## 5. Success Criteria

To validate an interaction effect, the combination must demonstrate:
- Minimum 100 trades for statistical significance.
- Profit Factor > 1.20 in Experiment B.
- A statistically significant improvement in Profit Factor and Drawdown compared to Experiment A.
- Favourable performance across the 12 Atlas robustness metrics.

## 6. Architectural Output

If an interaction effect is validated, it proves the Atlas architectural thesis: execution models (strategies) are combinations of validated components. The successful combination will be recorded in the Knowledge Base and become the foundation for Atlas's first complete execution model.
