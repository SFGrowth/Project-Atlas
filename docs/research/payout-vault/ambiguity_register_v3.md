# Payout Vault — Ambiguity Register v3.0
**Sprint:** 123A.9 | **Gate:** G9
**Date:** 2026-07-25
**Version:** 3.0 (corrected taxonomy, full alternative sets, parameter-budget policy)
**Requirement:** All ambiguities classified with correct taxonomy; all required alternatives preserved; no OOS-informed selection.

---

## Taxonomy

| Classification | Meaning |
|---|---|
| `SOURCE_EXPLICIT` | The source material provides an unambiguous, explicit definition. No design choice required. |
| `PRIMARY_PRE_REGISTERED_DEFINITION` | The source is ambiguous. One definition is selected as primary before OOS data is examined. This selection is locked and cannot be changed using OOS results. |
| `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | An alternative definition that is retained alongside the primary for sensitivity analysis. Must be tested in the same experiment as the primary. |
| `UNRESOLVED` | The source does not provide sufficient information to make a design choice. Deferred to Tier 2 content or future research. |
| `NON_TESTABLE` | The claim cannot be operationalised on price data regardless of design choice. |

---

## Parameter-Budget Policy

To control overfitting risk, the following limits apply to the Payout Vault research programme:

- **Maximum free parameters:** 7 (primary definitions only)
- **Alternative variants per parameter:** 2–3 (for sensitivity analysis only, not for optimisation)
- **Selection rule:** Primary definitions are selected based on source proximity, simplicity, and prior research precedent — never based on OOS performance
- **Sensitivity analysis:** All alternatives are tested in the same experiment as the primary, with results reported separately
- **Optimisation prohibition:** No parameter may be selected or changed based on OOS results

**Current free parameter count (primary definitions):** 7
1. CSD confirmation window (AMB-01)
2. HTF/LTF timeframe pair (AMB-05)
3. Sweep definition (AMB-04)
4. CSD midpoint rule (AMB-09)
5. Pivot lookback width (AMB-06)
6. Stop buffer (AMB-07)
7. FVG entry point (AMB-08)

---

## Ambiguity Inventory

### AMB-01 — CSD Confirmation Window
**Severity:** HIGH
**Affected rules:** R-12, R-13, R-14, R-15
**Source quote:** "A candle that closes above/below the midpoint of the sweep candle." — Lesson 03a
**Source status:** The source does not specify how many bars after the sweep candle are eligible for CSD confirmation.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | Window = 3 bars | Balances responsiveness with confirmation. Consistent with ICT-style delivery shift literature. Selected before OOS examination. |
| ALTERNATIVE-A | Window = 1 bar | Strictest: only the immediate next bar. |
| ALTERNATIVE-B | Window = 5 bars | Most permissive: allows delayed confirmation. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-02 — MSS vs fMSS: Retrospective Classification
**Severity:** HIGH
**Affected concepts:** CD-04, CD-05
**Source quote:** "A fake MSS sweeps and reverses without confirming a new MSU." — Lesson 02d
**Source status:** The source explicitly states that fMSS is identified by the absence of MSU confirmation after the sweep. This is a sequential, non-retrospective rule.

**Classification:** `SOURCE_EXPLICIT` — fMSS is determined by the absence of a subsequent HH+HL (bullish) or LH+LL (bearish) sequence after the sweep. No design choice required.

---

### AMB-03 — DOL: Scalar Level vs Zone
**Severity:** MEDIUM
**Affected concepts:** CD-01
**Source quote:** "The nearest prior swing high or low on the HTF." — Lesson 01a
**Source status:** The source describes DOL as a specific price level (swing extreme), not a zone.

**Classification:** `SOURCE_EXPLICIT` — DOL is a scalar price level equal to the swing extreme. No design choice required.

---

### AMB-04 — Inducement Sweep: Wick Penetration vs Close-Through
**Severity:** HIGH
**Affected rules:** R-10
**Source quote:** "Price sweeps through the inducement level." — Lesson 02c
**Source status:** "Sweeps through" is ambiguous between wick penetration and close-through.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | Wick penetration (high/low exceeds inducement level) | Consistent with ICT sweep literature. Wick penetration is the more common definition for liquidity sweeps. Selected before OOS examination. |
| ALTERNATIVE-A | Close-through (body close beyond inducement level) | Stricter; requires commitment beyond the wick. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-05 — HTF/LTF Timeframe Pair
**Severity:** HIGH
**Affected concepts:** CD-01, CD-02, CD-03
**Source quote:** "Use a higher timeframe for DOL and a lower timeframe for the MSU and entry." — Lesson 01b
**Source status:** The source does not specify exact timeframes. The course appears to use 15m/5m in worked examples but does not mandate this.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | HTF = 15m, LTF = 5m | Matches the apparent course examples. Consistent with MNQ intraday research. Selected before OOS examination. |
| ALTERNATIVE-A | HTF = 30m, LTF = 5m | Wider HTF context. |
| ALTERNATIVE-B | HTF = 1h, LTF = 15m | Slower, fewer setups. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-06 — Pivot Lookback Width
**Severity:** MEDIUM
**Affected rules:** R-03, R-07
**Source quote:** "The most recent swing high or low." — Lesson 01a
**Source status:** The source does not specify how many bars define a swing pivot.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | Lookback = 3 bars (pivot must be highest/lowest of 3-bar window) | Standard swing pivot definition. Balances sensitivity and noise. Selected before OOS examination. |
| ALTERNATIVE-A | Lookback = 1 bar | Most sensitive; any local extreme qualifies. |
| ALTERNATIVE-B | Lookback = 5 bars | More conservative; fewer but more significant pivots. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-07 — Stop Placement Buffer
**Severity:** HIGH
**Affected rules:** R-23
**Source quote:** "Place stop below the inducement level." — Lesson 07b
**Source status:** The source does not specify a buffer beyond the inducement level.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | 4 ticks (1.0 point) beyond the inducement level | Standard MNQ buffer. Accounts for bid/ask spread and minor slippage. Selected before OOS examination. |
| ALTERNATIVE-A | 1 tick (0.25 point) beyond the inducement level | Minimal buffer; tighter stops. |
| ALTERNATIVE-B | ATR-based buffer (0.5 × ATR-14 of LTF) | Volatility-adaptive; wider in high-volatility regimes. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-08 — FVG Entry Point
**Severity:** MEDIUM
**Affected rules:** R-20
**Source quote:** "Enter at the FVG after CSD confirmation." — Lesson 03c
**Source status:** The source does not specify whether entry is at the proximal edge, midpoint, or on a confirmation candle within the FVG.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | Proximal edge of FVG (nearest edge to current price) | Most conservative entry; smallest risk. Consistent with ICT FVG literature. Selected before OOS examination. |
| ALTERNATIVE-A | Midpoint of FVG | Balanced entry; partial fill risk reduction. |
| ALTERNATIVE-B | Confirmation entry (first bar that closes within FVG) | Requires additional confirmation; fewer fills. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-09 — CSD Midpoint: Full-Range vs Body Midpoint
**Severity:** HIGH
**Affected rules:** R-13
**Source quote:** "Body close above/below 50% of the sweep candle." — Lesson 03a
**Source status:** "50% of the sweep candle" is ambiguous between the full high-to-low range and the open-to-close body range.

**Classification:** `PRIMARY_PRE_REGISTERED_DEFINITION`

| Definition | Value | Rationale |
|---|---|---|
| **PRIMARY** | Full-range midpoint: 50% of (high − low) of sweep candle | More conservative; requires a larger displacement. Consistent with the visual examples in the course. Selected before OOS examination. |
| ALTERNATIVE-A | Body midpoint: 50% of (open − close) of sweep candle | Stricter in terms of body displacement; ignores wicks. |

**Design choice locked:** 2026-07-25, before OOS data examined.

---

### AMB-10 — "No Wick Candle" Definition
**Severity:** MEDIUM
**Affected rules:** R-12 (implied)
**Source quote:** "No wick candle" appears in process step images. — Image PV-SRC-0044 to PV-SRC-0046
**Source status:** The phrase appears in visual process diagrams but is not defined quantitatively in any written lesson.

**Classification:** `UNRESOLVED` — Tier 2 content may clarify. Research will proceed without this filter until a definition is available. If required, a sensitivity test with "body ≥ 80% of full range" will be used as a proxy.

---

## Summary

| AMB ID | Description | Classification | Primary Definition |
|---|---|---|---|
| AMB-01 | CSD confirmation window | PRIMARY_PRE_REGISTERED_DEFINITION | 3 bars |
| AMB-02 | MSS vs fMSS retrospective | SOURCE_EXPLICIT | Sequential non-retrospective |
| AMB-03 | DOL scalar vs zone | SOURCE_EXPLICIT | Scalar level |
| AMB-04 | Sweep: wick vs close | PRIMARY_PRE_REGISTERED_DEFINITION | Wick penetration |
| AMB-05 | HTF/LTF pair | PRIMARY_PRE_REGISTERED_DEFINITION | 15m/5m |
| AMB-06 | Pivot lookback | PRIMARY_PRE_REGISTERED_DEFINITION | 3 bars |
| AMB-07 | Stop buffer | PRIMARY_PRE_REGISTERED_DEFINITION | 4 ticks |
| AMB-08 | FVG entry point | PRIMARY_PRE_REGISTERED_DEFINITION | Proximal edge |
| AMB-09 | CSD midpoint | PRIMARY_PRE_REGISTERED_DEFINITION | Full-range midpoint |
| AMB-10 | No-wick candle | UNRESOLVED | Deferred to Tier 2 |

**AMBIGUITIES_IDENTIFIED:** 10 (AMB-01 through AMB-10)
**SOURCE_EXPLICIT_AMBIGUITIES:** 2 (AMB-02, AMB-03)
**PRIMARY_PRE_REGISTERED_DEFINITIONS:** 7 (AMB-01, AMB-04, AMB-05, AMB-06, AMB-07, AMB-08, AMB-09)
**ALTERNATIVE_PRE_REGISTERED_DEFINITIONS:** 17 entries across 7 parameters (AMB-01: 2, AMB-04: 1, AMB-05: 2, AMB-06: 2, AMB-07: 2, AMB-08: 2, AMB-09: 1)
**UNRESOLVED_AMBIGUITIES:** 1 (AMB-10)
**NON_TESTABLE_AMBIGUITIES:** 0
**ALL_AMBIGUITY_TOTALS_RECONCILE:** TRUE (2 + 7 + 1 + 0 = 10)
**Free parameters (primary definitions):** 7
**Parameter budget remaining:** 0 (budget exhausted — no new free parameters without removing an existing one)
