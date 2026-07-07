# Atlas Component Catalogue

## Purpose
This catalogue is the central repository for all independently validated components in Project Atlas. 

Atlas does not build complete strategies as monolithic blocks. Instead, Atlas discovers, validates, and catalogues **components** (e.g., Regime Filters, Entry Triggers, Momentum Confirmations). 

Execution models (strategies) are then constructed by combining these validated components.

## 1. Regime Components (Stream A)

These components classify the market environment and filter out low-expectancy noise.

### C-REG-001: Volatility Compression
- **Description:** Identifies periods of volatility contraction relative to recent history.
- **Validated Definition:** `ATR(14) / ATR(100) <= 0.7`
- **Evidence:** Reduced drawdown by $14,071 and improved PF from 0.95 to 1.222 on 2-year MNQ (Sprint 019).
- **Status:** Validated (Part of Regime Engine v1.0)
- **Known Limitations:** The 0.7 threshold is highly restrictive, passing only 0.7% of all bars (Sprint 021).

### C-REG-002: VWAP Deviation
- **Description:** Ensures price is within a reasonable distance from VWAP, avoiding over-extended entries.
- **Validated Definition:** `Distance from VWAP <= 1.5 * ATR(14)`
- **Evidence:** Reduced drawdown by $9,952 on 2-year MNQ (Sprint 019).
- **Status:** Validated (Part of Regime Engine v1.0)

## 2. Execution Components (Stream B)

These components define specific market events that can trigger an entry when combined with appropriate Regime and Guardian conditions.

*(No components currently validated. Sprint 021 rejected Pullback, Liquidity Sweep, Breakout, and Mean Reversion as standalone unconditional edges.)*

## 3. Capital Components (Stream C)

These components manage risk, position sizing, and account health.

*(No components currently validated. Guardian v0.2 requires redesign to incorporate account-state inputs.)*

---

*Note: A component only enters this catalogue after completing the 9-step Research Cycle and demonstrating a statistically robust edge across the 12 Atlas robustness metrics.*
