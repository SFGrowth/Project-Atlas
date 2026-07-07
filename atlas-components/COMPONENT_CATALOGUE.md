# Atlas Execution Component Library

## Purpose
This catalogue is the central repository for all independently validated components in Project Atlas. 

Atlas does not build complete strategies as monolithic blocks. Instead, Atlas discovers, validates, and catalogues **components**. Execution models (strategies) are then constructed by combining these validated components to investigate interaction effects.

---

## Component Taxonomy

Atlas categorises components into two fundamental types. A strategy is built by combining multiple Structural Components with one or more Trigger Components.

### 1. Structural Components
These describe the **environment**. They classify market conditions, define context, and filter out low-expectancy noise.

- **Market Regime (C-REG):** Classifies the current environment (e.g., Trend, Range, Compression, Expansion).
- **Market Structure (C-STR):** Identifies structural states (e.g., Break of Structure, Change of Character, Swing Highs/Lows).
- **Momentum & Pressure (C-MOM):** Measures directional commitment and strength (e.g., Strong Close, Volume Expansion).
- **Location & Value (C-LOC):** Defines value areas and key levels (e.g., VWAP Deviation, Premium/Discount, Support/Resistance).
- **Liquidity Context (C-LIQ):** Identifies liquidity pools and stop runs (e.g., Liquidity Sweeps, Equal Highs/Lows).

### 2. Trigger Components
These describe the **event**. They define the specific mechanical entry signal. A trigger should never be expected to produce an edge by itself.

- **Entry Triggers (C-TRG):** The specific mechanical entry signal (e.g., Pullback, Breakout, Mean Reversion, Opening Range Break).

---

## Validated Components

The following components have successfully passed Stream D validation and are available for use in Stream B Strategy Assembly.

### Structural Components

#### C-REG-001: Volatility Compression
- **Description:** Identifies periods of volatility contraction relative to recent history.
- **Validated Definition:** `ATR(14) / ATR(100) <= 0.7`
- **Evidence:** Reduced drawdown by $14,071 and improved PF from 0.95 to 1.222 on 2-year MNQ (Sprint 019).
- **Status:** Validated (Part of Regime Engine v1.0)
- **Known Limitations:** The 0.7 threshold is highly restrictive, passing only 0.7% of all bars (Sprint 021).

#### C-LOC-001: VWAP Deviation (formerly C-REG-002)
- **Description:** Ensures price is within a reasonable distance from VWAP, avoiding over-extended entries.
- **Validated Definition:** `Distance from VWAP <= 1.5 * ATR(14)`
- **Evidence:** Reduced drawdown by $9,952 on 2-year MNQ (Sprint 019).
- **Status:** Validated (Part of Regime Engine v1.0)

### Trigger Components

*(No trigger components currently validated. Sprint 021 rejected Pullback, Liquidity Sweep, Breakout, and Mean Reversion as standalone unconditional edges. They must now be tested for interaction effects with Structural Components.)*

---

## Experimental Components (Pending Validation)

The following components are currently undergoing Stream D validation and are **not yet approved** for use in Stream B Strategy Assembly.

### Trigger Candidates
- **C-TRG-001: Pullback Continuation** (Failed baseline in Sprint 021, pending interaction testing)
- **C-TRG-002: Liquidity Sweep Entry** (Failed baseline in Sprint 021, pending interaction testing)
- **C-TRG-003: Breakout Continuation** (Failed baseline in Sprint 021, pending interaction testing)
- **C-TRG-004: Mean Reversion** (Failed baseline in Sprint 021, pending interaction testing)

---

## Rejected Components (Do Not Use)

The following components have been rigorously tested and definitively proven to lack statistical edge. They must not be used in Strategy Assembly.

- **Daily 200 EMA Location (H-B005):** Fading extensions and trading bounces at the Daily 200 EMA both failed completely (Sprint 022). The market treats the level as liquidity, not structure.

---

*Note: A component only enters this catalogue after completing the 12-step Research Workflow and demonstrating a statistically robust edge across the 12 Atlas robustness metrics.*
