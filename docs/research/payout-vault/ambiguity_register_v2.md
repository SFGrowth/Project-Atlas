# Payout Vault — Ambiguity Register v2.0

**Sprint:** 123A.9 | **Gate:** G9 | **Version:** 2.0  
**Date:** 2026-07-25  
**Status:** CORRECTED — replaces v1.0 which incorrectly described arbitrary parameter choices as resolved source truth.

---

## Classification Taxonomy

Every ambiguity is classified using one of the following dispositions:

| Disposition | Meaning |
|---|---|
| `SOURCE_EXPLICIT` | The source material provides an unambiguous, machine-implementable definition. No design choice required. |
| `PRIMARY_PRE_REGISTERED_DEFINITION` | The source is ambiguous. A primary definition has been pre-registered before any OOS data is examined. This is the default variant used in all experiments unless otherwise specified. |
| `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | An alternative to the primary definition, pre-registered alongside it. Results under this alternative will be reported separately. Alternatives are never selected based on OOS outcomes. |
| `UNRESOLVED` | The ambiguity cannot be resolved from source material alone and no pre-registration has been made. Research is blocked until resolved. |
| `NON_TESTABLE` | The ambiguity concerns a concept that cannot be operationalised for quantitative testing on MNQ data. |

---

## Parameter-Budget Policy

To limit overfitting risk from parameter search, the following budget applies:

- **Maximum primary variants per ambiguity:** 1
- **Maximum alternative variants per ambiguity:** 3
- **Maximum total parameter combinations in any single experiment:** 12
- **Selection rule:** Primary definitions are chosen based on source proximity, simplicity, and prior literature — never based on OOS performance.
- **Reporting rule:** All registered alternatives must be reported in the final research output, regardless of whether they outperform the primary.
- **Prohibition:** No ambiguity may be resolved by examining OOS data (2025-10-01 to 2026-07-20) before the primary definition is locked.

---

## AMB-01 — CSD Confirmation Window

**Severity:** HIGH  
**Affected rules:** R-18  
**Source quote:** "Once either condition is met, delivery has changed state." — Lesson 02d  
**Source status:** The source does not specify a maximum number of bars to wait after the inducement sweep before CSD must occur.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| csd-window-1 | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 1 bar | Strictest: CSD must occur on the very next bar after sweep. |
| csd-window-3 | `PRIMARY_PRE_REGISTERED_DEFINITION` | 3 bars | Balances strictness with practical price-action timing. Pre-registered as primary. |
| csd-window-5 | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 5 bars | More permissive; allows for slower delivery sequences. |

**Downstream impact:** Directly affects setup count. Higher window = more setups but potentially lower signal quality.

---

## AMB-02 — CSD vs CISD Terminology

**Severity:** LOW  
**Source status:** The source uses both "CSD" and "CISD" in different lessons.  
**Classification:** `SOURCE_EXPLICIT` — Both terms refer to the same concept (Candle Structure Delivery / Change in State of Delivery). The terms are synonymous within this course. No design choice required.

---

## AMB-03 — DOL: Scalar Level vs Zone

**Severity:** MEDIUM  
**Affected concepts:** CD-01  
**Source quote:** "The nearest prior swing high or low on the HTF." — Lesson 01a  
**Source status:** The source describes DOL as a specific price level (swing extreme), not a zone.  
**Classification:** `SOURCE_EXPLICIT` — DOL is a scalar price level equal to the swing extreme. No design choice required.

---

## AMB-04 — Inducement Sweep: Wick Penetration vs Close-Through

**Severity:** HIGH  
**Affected rules:** R-10  
**Source quote:** "Price sweeps through the inducement level." — Lesson 02c  
**Source status:** "Sweeps through" is ambiguous between wick penetration and close-through.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| sweep-wick | `PRIMARY_PRE_REGISTERED_DEFINITION` | Wick penetrates beyond inducement level | More common in SMC literature; wick sweeps are the typical stop-hunt mechanism. |
| sweep-close | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | Close beyond inducement level | Stricter definition; reduces false sweeps. |

**Downstream impact:** Wick-based sweeps will produce more setups than close-based sweeps. Both must be reported.

---

## AMB-05 — CSD 50% Boundary: Strict vs Inclusive

**Severity:** MEDIUM  
**Affected rules:** R-13  
**Source quote:** "Body close above 50% of the inducement/sweep candle." — Lesson 05a  
**Source status:** "Above 50%" does not specify whether close exactly at 50% qualifies.  
**Classification:** `SOURCE_EXPLICIT` — "Above" in English implies strict greater-than. Close exactly at 50% does not qualify. No design choice required.

---

## AMB-06 — No-Wick Candle: Exact Quantitative Threshold

**Severity:** HIGH  
**Affected concepts:** CD-07  
**Source quote:** "A candle with little to no wick." — Lesson 02d  
**Source status:** No quantitative threshold is provided for what constitutes "little to no wick."  
**Classification:** `UNRESOLVED` — Cannot be resolved from source material. Pre-registration required before implementation.

**Proposed resolution (pending approval):** Define "no-wick" as a candle where the total wick length (upper + lower) is ≤ 20% of the total candle range (high − low). This is a research-specific choice, not a source rule.

---

## AMB-07 — Stop Buffer: "Just Beyond" Quantification

**Severity:** HIGH  
**Affected rules:** R-21  
**Source quote:** "Invalidation set just beyond the sweep point." — Lesson 10a  
**Source status:** No tick count, ATR multiple, or percentage is specified.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| stop-1tick | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 1 tick beyond swept level | Minimum buffer; tightest stop. |
| stop-4tick | `PRIMARY_PRE_REGISTERED_DEFINITION` | 4 ticks (1 MNQ point) beyond swept level | Practical MNQ buffer; approximately 1 full point. Pre-registered as primary. |
| stop-atr | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | ATR(14) × 0.25 beyond swept level | Volatility-adaptive; adjusts to market conditions. |

**Downstream impact:** Stop distance directly determines risk amount and 3R target distance. All three variants must be reported.

---

## AMB-08 — SMT Lookback Window and Tolerance

**Severity:** MEDIUM  
**Affected rules:** R-26  
**Source status:** No lookback window or price tolerance specified for SMT divergence check.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| smt-window-3 | `PRIMARY_PRE_REGISTERED_DEFINITION` | ±3 bars around sweep bar | Practical window capturing near-simultaneous divergence. Pre-registered as primary. |
| smt-window-1 | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | Same bar only | Strictest: divergence must occur on the exact sweep bar. |
| smt-window-5 | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | ±5 bars | More permissive; captures slower divergence. |

**Downstream impact:** Affects SMT filter hit rate. SMT is optional and does not block a setup.

---

## AMB-09 — HTF/LTF Exact Timeframe Pairs

**Severity:** BLOCKING  
**Affected concepts:** CD-02  
**Source status:** The source does not specify exact timeframes. Visual examples suggest higher-timeframe context but do not label specific bar sizes.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| 15m/5m | `PRIMARY_PRE_REGISTERED_DEFINITION` | HTF=15m, LTF=5m | Consistent with Atlas Nexus canonical 5m dataset and 15m aggregation. Pre-registered as primary. |
| 30m/5m | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | HTF=30m, LTF=5m | Wider HTF context; fewer DOL updates. |
| 1h/15m | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | HTF=1h, LTF=15m | Higher-timeframe pair; fewer but potentially higher-quality setups. |

**Downstream impact:** BLOCKING — must be resolved before any detector is implemented. Primary (15m/5m) is pre-registered and used in all Tier 1 experiments.

---

## AMB-10 — FVG Entry Type 2: Fill Definition

**Severity:** MEDIUM  
**Affected rules:** R-20  
**Source quote:** "A retracement into the FVG." — Lesson 05c  
**Source status:** Does not specify how deep into the FVG price must retrace, or whether wick or close qualifies.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| fvg-midpoint | `PRIMARY_PRE_REGISTERED_DEFINITION` | Limit order at FVG midpoint | Mechanical and unambiguous; standard SMC convention. Pre-registered as primary. |
| fvg-proximal | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | Limit order at FVG proximal edge | Most aggressive fill; highest fill rate but worst average entry. |
| fvg-confirmation | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | Entry on close back above/below FVG after wick entry | Most conservative; confirms price rejected from FVG. |

**Downstream impact:** Affects Entry Type 2 fill rate and entry price. All three variants must be reported.

---

## AMB-11 — Q2 Quadrant Definition

**Severity:** LOW (Tier 1 research)  
**Source status:** Q2 appears only in the glossary. No lesson explains it. Likely a Tier 2 concept.  
**Classification:** `NON_TESTABLE` — Cannot be operationalised for Tier 1 research. Excluded from all Tier 1 detector prototypes. Flagged for Tier 2 intake.

---

## AMB-12 — Duplicate Images: Intentional vs Accidental

**Severity:** LOW  
**Source status:** Three image pairs have identical SHA-256 hashes (images 7/8, 16/17, 19/20 in timestamp order).  
**Classification:** `SOURCE_EXPLICIT` — SHA-256 identity confirms exact duplicates. Treated as duplicates in the visual example dataset. Each unique concept counted once.

---

## AMB-13 — CSD Midpoint: Full-Range vs Body Midpoint

**Severity:** MEDIUM  
**Affected rules:** R-13  
**Source quote:** "Body close above 50% of the inducement/sweep candle." — Lesson 05a  
**Source status:** "50% of the candle" could mean 50% of the full range (high−low) or 50% of the body (open−close).

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| csd-50pct-full-range | `PRIMARY_PRE_REGISTERED_DEFINITION` | 50% of full candle range (high−low) | More conservative; larger threshold to clear. Pre-registered as primary. |
| csd-50pct-body | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 50% of candle body (open−close) | Easier to clear; more setups but potentially lower quality. |

**Downstream impact:** Affects CSD confirmation rate. Full-range midpoint is harder to clear than body midpoint.

---

## AMB-14 — Pivot Width for MSU Detection

**Severity:** MEDIUM  
**Affected concepts:** CD-03  
**Source status:** The source does not specify how many bars on each side of a pivot are required to confirm a swing high or low.

**Classification:**

| Variant | Disposition | Value | Rationale |
|---|---|---|---|
| pivot-3bar | `PRIMARY_PRE_REGISTERED_DEFINITION` | 3 bars each side | Standard pivot detection width; balances sensitivity and noise. Pre-registered as primary. |
| pivot-1bar | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 1 bar each side | Most sensitive; detects minor swings. |
| pivot-5bar | `ALTERNATIVE_PRE_REGISTERED_DEFINITION` | 5 bars each side | Most conservative; only major swings. |

**Downstream impact:** Affects MSU identification and inducement labelling. Wider pivot = fewer but more significant swings.

---

## Summary Table

| ID | Description | Severity | Classification | Primary Value |
|---|---|---|---|---|
| AMB-01 | CSD confirmation window | HIGH | PRIMARY_PRE_REGISTERED_DEFINITION | 3 bars |
| AMB-02 | CSD vs CISD terminology | LOW | SOURCE_EXPLICIT | Synonyms |
| AMB-03 | DOL scalar vs zone | MEDIUM | SOURCE_EXPLICIT | Scalar |
| AMB-04 | Sweep: wick vs close | HIGH | PRIMARY_PRE_REGISTERED_DEFINITION | Wick penetration |
| AMB-05 | CSD 50% boundary strict vs inclusive | MEDIUM | SOURCE_EXPLICIT | Strict > |
| AMB-06 | No-wick candle threshold | HIGH | UNRESOLVED | Pending |
| AMB-07 | Stop buffer "just beyond" | HIGH | PRIMARY_PRE_REGISTERED_DEFINITION | 4 ticks |
| AMB-08 | SMT lookback window | MEDIUM | PRIMARY_PRE_REGISTERED_DEFINITION | ±3 bars |
| AMB-09 | HTF/LTF timeframe pairs | BLOCKING | PRIMARY_PRE_REGISTERED_DEFINITION | 15m/5m |
| AMB-10 | FVG Entry Type 2 fill | MEDIUM | PRIMARY_PRE_REGISTERED_DEFINITION | FVG midpoint |
| AMB-11 | Q2 quadrant definition | LOW | NON_TESTABLE | Excluded (Tier 2) |
| AMB-12 | Duplicate images | LOW | SOURCE_EXPLICIT | Deduplicated |
| AMB-13 | CSD midpoint: full-range vs body | MEDIUM | PRIMARY_PRE_REGISTERED_DEFINITION | Full range |
| AMB-14 | Pivot width for MSU detection | MEDIUM | PRIMARY_PRE_REGISTERED_DEFINITION | 3 bars |

**Counts:** SOURCE_EXPLICIT=4 | PRIMARY_PRE_REGISTERED=8 | UNRESOLVED=1 | NON_TESTABLE=1  
**Blocking ambiguities resolved:** AMB-09 (HTF/LTF) — pre-registered as 15m/5m  
**Blocking ambiguities unresolved:** AMB-06 (no-wick threshold) — does not block Tier 1 experiments as no-wick is not a required gate condition

---

*Ambiguity Register v2.0 — Sprint 123A.9 Gate G9 — 2026-07-25*
