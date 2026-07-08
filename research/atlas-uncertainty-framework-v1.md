# Atlas Uncertainty Framework v1.0
**Date:** 2026-07-08
**Sprint:** 035

## 1. Introduction

The Atlas Theory of Edge v1.0 establishes that trading edge emerges only when market uncertainty is measurably reduced. To engineer this edge, Atlas must first be able to classify and measure the specific types of uncertainty present in the market.

This document provides a formal taxonomy of the six primary sources of uncertainty in the MNQ futures market. Every future execution model must demonstrate how it reduces uncertainty across these dimensions.

## 2. The Taxonomy of Uncertainty

### 2.1 Regime Uncertainty
**Definition:** Uncertainty regarding the current macroeconomic or intraday market state.
- **High Uncertainty:** The market is transitioning between states, or is locked in directionless chop. Price action is erratic and mean-reverting.
- **Reduced Uncertainty:** The market is in a clearly defined state (e.g., a strong directional trend or a tight compression zone).
- **Atlas Mechanism for Reduction:** Market Regime Engine (e.g., ADX thresholds, Volatility Compression filters).

### 2.2 Volatility Uncertainty
**Definition:** Uncertainty regarding the nature of current price movement (genuine participation vs. random noise).
- **High Uncertainty:** Volatility is randomly oscillating. Spikes in price are quickly reversed, indicating a lack of sustained institutional participation.
- **Reduced Uncertainty:** Volatility is expanding or contracting in a measurable, sustained manner relative to a historical baseline.
- **Atlas Mechanism for Reduction:** Volatility Expansion constraints (e.g., `ATR(5) > 1.8 × ATR(5)[20]`) or Compression constraints.

### 2.3 Structural Uncertainty
**Definition:** Uncertainty regarding the boundaries of price action and the locations where probability is genuinely skewed.
- **High Uncertainty:** Price is moving "in the air" without respecting any defined structural logic, or is interacting with arbitrary retail levels (e.g., Daily 200 EMA) that institutional algorithms frequently sweep.
- **Reduced Uncertainty:** Price is interacting with a mathematically precise structural event, such as a depth-constrained pullback or a volatility compression boundary.
- **Atlas Mechanism for Reduction:** Depth constraints (e.g., `0.5–1.2 ATR`), VWAP proximity filters.

### 2.4 Trend Uncertainty
**Definition:** Uncertainty regarding the dominant institutional directional bias.
- **High Uncertainty:** Multiple timeframes are in conflict, moving averages are tangled, and higher highs/lower lows are not cleanly established.
- **Reduced Uncertainty:** Clear alignment across multiple timeframes and structural indicators.
- **Atlas Mechanism for Reduction:** Moving average stacks (e.g., EMA9/21/50 alignment), ADX direction.

### 2.5 Session Uncertainty
**Definition:** Uncertainty derived from the historical behaviour of specific times of day or days of the week.
- **High Uncertainty:** Trading during the AM price discovery phase (09:30–12:00 ET) or on Fridays, where institutional flow is frequently obscured by inventory correction and liquidity sweeps.
- **Reduced Uncertainty:** Trading during the PM session (13:00–16:00 ET) where directional continuation is statistically dominant, or during the overnight session where compression breakouts are highly reliable.
- **Atlas Mechanism for Reduction:** Hard time-of-day and day-of-week operational constraints.

### 2.6 Execution Uncertainty
**Definition:** Uncertainty regarding the mechanical validity of the trade entry and exit.
- **High Uncertainty:** Entering a trade without a logical, structurally protected location for the stop loss (e.g., entering purely on momentum continuation).
- **Reduced Uncertainty:** Entering at a specific structural anchor that provides a highly asymmetrical risk/reward ratio and a clear invalidation point.
- **Atlas Mechanism for Reduction:** Precise trigger definitions (e.g., C-TRG-001) that anchor the entry to a specific event.

## 3. Application

No single execution model can reduce all six forms of uncertainty perfectly. However, the Atlas evidence base demonstrates that edge only emerges when multiple dimensions are reduced simultaneously. 

Future execution models will be evaluated based on their ability to systematically reduce these uncertainties before risking capital.
