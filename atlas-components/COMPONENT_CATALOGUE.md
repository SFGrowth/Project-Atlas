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

## Trusted Execution Models

The following execution models have passed both Stream D validation and Stream B independent stress testing. They are approved for use in Stream C (Capital Intelligence).

### Atlas Execution Model A1
- **Structural Component:** C-STR-001 (Volatility Expansion)
- **Trigger Component:** C-TRG-001 (Depth-Constrained Pullback)
- **Timeframe:** 5-minute MNQ
- **Risk/Reward:** 1:2 (Stop = 1.0 ATR, Target = 2.0 ATR)
- **Performance:** PF 1.387, Net +$3,231, Max DD -$516, 286 trades (2-year MNQ)
- **Validation:** Survived 4-tick slippage, parameter neighbourhood shifts, 100% quarterly stability, and Monte Carlo sequence risk (Sprint 025).
- **Characterisation:** Full operational parameters mapped in `research/atlas-model-a1-specification.md` (Sprint 026). Edge concentrated in Tue-Thu, 13:00-16:00 ET.
- **Status:** Trusted & Characterised

---

## Validated Components

The following components have successfully passed Stream D validation and are available for use in Stream B Strategy Assembly.

### Structural Components

#### C-STR-001: Volatility Expansion
- **Description:** Identifies periods of sudden, significant volatility expansion relative to a longer baseline, indicating genuine directional participation.
- **Validated Definition:** `ATR(5) / ATR(5)[20 bars ago] > 1.8`
- **Evidence:** When combined with a depth-constrained pullback, improved PF from 1.020 to 1.387 on 2-year MNQ 5-min (Sprint 024).
- **Status:** Validated

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

#### C-TRG-001: Depth-Constrained Pullback
- **Description:** A pullback to the EMA21 in a trending environment, constrained by depth to ensure sufficient discount without structural invalidation.
- **Validated Definition:** EMA9/21/50 trend stack alignment. Price touches/crosses EMA21. Distance from the recent 10-bar swing extreme to current close is between `0.5 and 1.2 * ATR(14)`.
- **Evidence:** When interacting with Volatility Expansion (C-STR-001), produced PF 1.387 and Max DD -$516 on 2-year MNQ 5-min (Sprint 024).
- **Status:** Validated

---

## Experimental Components (Pending Validation)

The following components are currently undergoing Stream D validation and are **not yet approved** for use in Stream B Strategy Assembly.

### Trigger Candidates
- **C-TRG-002: Liquidity Sweep Entry** (Failed interaction testing in Sprint 023, requires redefinition)
- **C-TRG-003: Breakout Continuation** (Failed interaction testing in Sprint 023, requires redefinition)
- **C-TRG-004: Mean Reversion** (Failed interaction testing in Sprint 023, requires redefinition)

---

## Rejected Components (Do Not Use)

The following components have been rigorously tested and definitively proven to lack statistical edge. They must not be used in Strategy Assembly.

- **External Strategy: Casper SMC First Candle Value:** The 15-minute Opening Range Value Area (70% volume profile) has zero predictive power as a structural boundary for the remainder of the session (Sprint 030). Both failed breakouts (mean reversion) and confirmed breakout pullbacks (continuation) produced negative expectancy (PF 0.779 and 0.718).
- **Momentum Continuation (Model A2 Candidate):** Entering immediately after 3-4 consecutive strong closes in a high-ADX environment failed completely (Sprint 029). Enters "in the air" without structural support; highly vulnerable to routine micro-pullbacks even in strong trends. Best PF 1.034.
- **Daily 200 EMA Location (H-B005):** Fading extensions and trading bounces at the Daily 200 EMA both failed completely (Sprint 022). The market treats the level as liquidity, not structure.
- **Sprint 023 Interactions (H-B006 to H-B009):** Liquidity Sweep + High Tradeability, Pullback + Volatility Expansion, Mean Reversion + Low Trend Strength, and Breakout + Volatility Compression all failed to produce a tradable edge (PF > 1.20). Pullback + Volatility Expansion performed best (PF 1.023) but is insufficient for live execution.

---

*Note: A component only enters this catalogue after completing the 12-step Research Workflow and demonstrating a statistically robust edge across the 12 Atlas robustness metrics.*
