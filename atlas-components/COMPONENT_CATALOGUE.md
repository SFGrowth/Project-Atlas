# Atlas Execution Component Library

## Purpose
This catalogue is the central repository for all independently validated components in Project Atlas. 

Atlas does not build complete strategies as monolithic blocks. Instead, Atlas discovers, validates, and catalogues **components** (e.g., Regime Filters, Entry Triggers, Momentum Confirmations). 

Execution models (strategies) are then constructed by combining these validated components.

---

## Component Taxonomy

Components are classified into the following categories:

### 1. Market Regime Components (C-REG)
Components that classify the current market environment (e.g., Trend, Range, Compression, Expansion).

### 2. Structural Components (C-STR)
Components that identify market structure (e.g., Break of Structure, Change of Character, Swing Highs/Lows).

### 3. Momentum & Pressure Components (C-MOM)
Components that measure directional commitment and strength (e.g., Strong Close, Volume Expansion).

### 4. Location Components (C-LOC)
Components that define value areas and key levels (e.g., VWAP Deviation, Premium/Discount, Support/Resistance).

### 5. Liquidity Components (C-LIQ)
Components that identify liquidity pools and stop runs (e.g., Liquidity Sweeps, Equal Highs/Lows).

### 6. Entry Trigger Components (C-TRG)
Components that define the specific entry mechanic (e.g., Pullback Continuation, Breakout, Mean Reversion).

---

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

## Experimental Components (Pending Validation)

The following components are currently undergoing Stream D validation and are **not yet approved** for use in Stream B Strategy Assembly.

- **C-TRG-001: Pullback Continuation** (Failed baseline in Sprint 021, pending refinement)
- **C-LIQ-001: Liquidity Sweep** (Failed baseline in Sprint 021, pending refinement)
- **C-TRG-002: Breakout Continuation** (Failed baseline in Sprint 021, pending refinement)
- **C-TRG-003: Mean Reversion** (Failed baseline in Sprint 021, pending refinement)

---

## Rejected Components (Do Not Use)

The following components have been rigorously tested and definitively proven to lack statistical edge. They must not be used in Strategy Assembly.

- **Daily 200 EMA Location (H-B005):** Fading extensions and trading bounces at the Daily 200 EMA both failed completely (Sprint 022). The market treats the level as liquidity, not structure.

---

*Note: A component only enters this catalogue after completing the 12-step Research Workflow and demonstrating a statistically robust edge across the 12 Atlas robustness metrics.*
