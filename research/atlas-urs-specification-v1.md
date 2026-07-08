# Uncertainty Reduction Score (URS) Specification v1.0
**Date:** 2026-07-08
**Sprint:** 035

## 1. Purpose

The Uncertainty Reduction Score (URS) is a new permanent Atlas research metric. Its purpose is to quantify how much uncertainty a proposed execution model or behavioural hypothesis removes before entry.

URS is **not a trading signal**. It is an objective research metric used during the design and validation phases to evaluate whether a hypothesis is structurally sound enough to warrant backtesting. If a hypothesis has a low URS, it will fail the backtest because it leaves too much market noise unresolved.

## 2. Scoring Methodology

The URS is calculated across the six dimensions of uncertainty defined in the Atlas Uncertainty Framework. A hypothesis receives points in each category only if it applies a mathematically precise, statistically validated constraint that reduces that specific form of uncertainty.

**Maximum Score: 100 points**
**Minimum Threshold for Backtesting: 60 points**

### 2.1 Regime Uncertainty (Max: 20 points)
- **20 pts:** Applies a mathematically precise, empirically validated regime filter (e.g., ADX > 30, ATR ratio ≤ 0.7) that isolates a specific market state.
- **10 pts:** Applies a broad or loosely defined regime filter.
- **0 pts:** Unconditional; executes in any market regime.

### 2.2 Volatility Uncertainty (Max: 20 points)
- **20 pts:** Requires a measurable expansion or contraction in volatility relative to a defined historical baseline (e.g., `ATR(5) > 1.8 × ATR(5)[20]`).
- **10 pts:** Uses a static volatility threshold (e.g., ATR > 10).
- **0 pts:** Unconditional; ignores volatility state.

### 2.3 Structural Uncertainty (Max: 20 points)
- **20 pts:** Anchors the setup to a precise structural event with defined boundaries (e.g., a pullback depth constrained strictly between 0.5 and 1.2 ATR).
- **10 pts:** Uses a broad structural concept (e.g., "touching the EMA21" without depth constraints).
- **0 pts:** Relies on arbitrary retail levels (e.g., Daily 200 EMA) or executes "in the air" without structural context.

### 2.4 Trend Uncertainty (Max: 15 points)
- **15 pts:** Requires multi-timeframe or multi-indicator directional alignment (e.g., EMA9/21/50 stack).
- **5 pts:** Requires single-indicator directional alignment.
- **0 pts:** Unconditional or counter-trend without structural justification.

### 2.5 Session Uncertainty (Max: 10 points)
- **10 pts:** Restricts execution to statistically validated sessions and days (e.g., PM session only, excluding Fridays).
- **0 pts:** Executes unconditionally across all RTH hours and days.

### 2.6 Execution Uncertainty (Max: 15 points)
- **15 pts:** Entry is tied to a specific structural anchor that provides a highly asymmetrical, protected location for the stop loss.
- **0 pts:** Stop loss is placed arbitrarily or in the middle of market noise (e.g., entering purely on momentum continuation).

## 3. Evaluation Examples

### Example A: Atlas Execution Model A1 (Validated)
- Regime: ADX < 30 (20 pts)
- Volatility: `ATR(5) > 1.8 × ATR(5)[20]` (20 pts)
- Structural: Depth 0.5–1.2 ATR (20 pts)
- Trend: EMA Stack Alignment (15 pts)
- Session: PM Session, Tue-Thu (10 pts)
- Execution: Anchored to pullback extreme (15 pts)
- **Total URS: 100/100** (Exceptional uncertainty reduction, aligns with PF 1.387 result).

### Example B: Unconditional Pullback (Rejected Sprint 021)
- Regime: None (0 pts)
- Volatility: None (0 pts)
- Structural: Broad EMA touch (10 pts)
- Trend: Single EMA slope (5 pts)
- Session: All RTH (0 pts)
- Execution: Anchored (15 pts)
- **Total URS: 30/100** (Failed minimum threshold; explains the PF ~ 1.0 result).

### Example C: Momentum Continuation (Rejected Sprint 029)
- Regime: ADX > 30 (20 pts)
- Volatility: None (0 pts)
- Structural: "In the air" (0 pts)
- Trend: Strong closes (15 pts)
- Session: All RTH (0 pts)
- Execution: No structural anchor for stop (0 pts)
- **Total URS: 35/100** (Failed minimum threshold; explains the stop-out frequency).

## 4. Implementation in Research Workflow

Effective immediately, the URS calculation is inserted into the formal Atlas Research Workflow.

Before any execution model or complex behavioural hypothesis is subjected to a computationally expensive backtest, the researcher must calculate its theoretical URS. If the score is below 60, the hypothesis is structurally deficient. The researcher must return to the design phase and introduce precise constraints to reduce the remaining uncertainty before proceeding to validation.
