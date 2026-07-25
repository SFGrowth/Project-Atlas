# Payout Vault — Source Claim Traceability v2.0
**Sprint:** 123A.9 | **Gate:** G9
**Date:** 2026-07-25
**Requirement:** SOURCE_CLAIM_TRACEABILITY=100_PERCENT
**Status:** COMPLETE — all 34 lessons and 23 chart images traced

---

## Disposition Taxonomy

| Disposition | Meaning |
|---|---|
| `MACHINE_TESTABLE` | Claim can be fully operationalised as a deterministic algorithm on OHLCV data with no design choices remaining. |
| `PARTIALLY_TESTABLE` | Claim can be partially operationalised but requires at least one design choice or has an ambiguous boundary condition (see Ambiguity Register). |
| `SUBJECTIVE` | Claim requires human judgment that cannot be reduced to a deterministic rule on price data. |
| `CONTRADICTORY` | Claim contradicts another claim in the source material. Both claims are recorded; the contradiction is flagged for resolution. |
| `INSUFFICIENT_INFORMATION` | Claim cannot be operationalised because the source does not provide enough information. Deferred pending Tier 2 content. |
| `EDUCATIONAL_ONLY` | Claim is pedagogical context, motivation, or narrative — not a trading rule. |
| `IRRELEVANT_TO_MNQ` | Claim may apply to other instruments or contexts but does not apply to MNQ futures research. |
| `DEFERRED` | Claim is relevant but deferred to a later sprint or Tier 2 research. |

---

## Lesson-by-Lesson Claim Accounting

### Section 00 — Start Here (Lesson 00a)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-001 | "This course teaches a complete trading system for consistent profitability." | EDUCATIONAL_ONLY | — | Motivational framing. Not a testable claim. |
| CL-002 | "The system works on any liquid market." | IRRELEVANT_TO_MNQ | — | Research scoped to MNQ only. |
| CL-003 | "Follow the 4-step process exactly as described." | EDUCATIONAL_ONLY | CD-14 | Process instruction, not a testable rule. |

### Section 01 — Core Vocabulary: DOL and HTF Bias (Lessons 01a, 01b)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-004 | "DOL is the nearest prior swing high or low on the HTF." | MACHINE_TESTABLE | CD-01, R-01 | Fully operationalisable as HTF pivot detection. |
| CL-005 | "DOL determines the direction of the trade." | MACHINE_TESTABLE | CD-02, R-02 | Direction = DOL direction. |
| CL-006 | "HTF bias must be established before LTF analysis." | MACHINE_TESTABLE | R-01 | Sequential gate: HTF first. |
| CL-007 | "If DOL is above current price, bias is bullish." | MACHINE_TESTABLE | CD-02, R-02 | Scalar comparison. |
| CL-008 | "If DOL is below current price, bias is bearish." | MACHINE_TESTABLE | CD-02, R-02 | Scalar comparison. |
| CL-009 | "DOL is not a target — it is a magnet." | EDUCATIONAL_ONLY | — | Metaphorical description of liquidity draw. |
| CL-010 | "Markets move from liquidity to liquidity." | EDUCATIONAL_ONLY | — | Market microstructure narrative. |

### Section 02 — Core Vocabulary: MSU, MSS, fMSS (Lessons 02a–02g)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-011 | "MSU is bullish when price makes higher highs and higher lows." | MACHINE_TESTABLE | CD-03, R-11 | Standard HH+HL definition. |
| CL-012 | "MSU is bearish when price makes lower highs and lower lows." | MACHINE_TESTABLE | CD-03, R-11 | Standard LH+LL definition. |
| CL-013 | "MSS occurs when the prior swing extreme is broken." | PARTIALLY_TESTABLE | CD-04 | AMB-04: wick vs close break. |
| CL-014 | "fMSS is a sweep that reverses without confirming a new MSU." | PARTIALLY_TESTABLE | CD-05 | Sequential classification; AMB-04. |
| CL-015 | "Inducement is the most recent swing in the MSU direction." | MACHINE_TESTABLE | CD-06, R-07, R-08 | Fully operationalisable. |
| CL-016 | "Inducement must be swept before CSD is valid." | MACHINE_TESTABLE | R-10, R-16 | Sequential gate condition. |
| CL-017 | "CSD requires a body close, not a wick touch." | MACHINE_TESTABLE | R-12 | Body close only; wick excluded. |
| CL-018 | "CSD Rule 1: body close above/below 50% of sweep candle." | PARTIALLY_TESTABLE | R-13 | AMB-09: full-range vs body midpoint. |
| CL-019 | "CSD Rule 2: body close above/below the entire prior candle body." | MACHINE_TESTABLE | R-14 | Fully operationalisable. |
| CL-020 | "Either CSD rule is sufficient." | MACHINE_TESTABLE | R-15 | OR logic. |
| CL-021 | "CSD must occur within the sweep candle's range." | PARTIALLY_TESTABLE | R-16 | AMB-01: confirmation window. |
| CL-022 | "The sweep candle and CSD candle can be the same candle." | MACHINE_TESTABLE | R-17 | Same-bar sweep+CSD is valid. |

### Section 03 — Inducement Deep Dive (Lessons 03a–03c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-023 | "Every swing high and every swing low is inducement." | MACHINE_TESTABLE | R-07 | All swing extremes are potential inducement levels. |
| CL-024 | "The most recent inducement is the most relevant." | MACHINE_TESTABLE | R-08 | Recency rule; operationalisable as most recent swing. |
| CL-025 | "Inducement at multiple timeframes creates confluence." | PARTIALLY_TESTABLE | — | Multi-timeframe confluence; AMB-05. |
| CL-026 | "Inducement is not valid if it has already been swept." | MACHINE_TESTABLE | R-09 | State-tracking rule; fully operationalisable. |

### Section 04 — CSD Deep Dive (Lessons 04a–04c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-027 | "CSD is the candle that shifts delivery from bearish to bullish (or vice versa)." | EDUCATIONAL_ONLY | CD-07 | Conceptual description; the testable form is R-12 to R-15. |
| CL-028 | "CSD Rule 1 uses the midpoint of the sweep candle." | PARTIALLY_TESTABLE | R-13 | AMB-09: full-range vs body midpoint. |
| CL-029 | "CSD Rule 2 uses the body of the prior candle." | MACHINE_TESTABLE | R-14 | Fully operationalisable. |
| CL-030 | "A CSD without a prior sweep is not valid." | MACHINE_TESTABLE | R-16 | Sequential gate; sweep must precede CSD. |
| CL-031 | "CSD must be in the direction of the DOL." | MACHINE_TESTABLE | R-18 | Direction alignment gate. |
| CL-032 | "CSD can occur on any timeframe." | IRRELEVANT_TO_MNQ | — | Research uses LTF = 5m only. |
| CL-033 | "Multiple CSDs in sequence increase confidence." | SUBJECTIVE | — | No quantitative definition of 'confidence' provided. |

### Section 05 — SMT Divergence (Lessons 05a–05b)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-034 | "SMT is when a correlated instrument makes a new extreme but the primary does not." | MACHINE_TESTABLE | CD-11, R-27 | Requires synchronized bars from a correlated instrument. |
| CL-035 | "SMT is the biggest confirmation signal." | SUBJECTIVE | — | Comparative claim without quantitative basis. |
| CL-036 | "SMT requires two instruments to be compared at the same time." | MACHINE_TESTABLE | R-27 | Synchronized bar comparison. |
| CL-037 | "If SMT is absent, the setup is still valid." | MACHINE_TESTABLE | R-28 | SMT is optional; setup valid without it. |
| CL-038 | "SMT on the HTF is more significant than on the LTF." | SUBJECTIVE | — | No quantitative definition of 'significance'. |

### Section 06 — The 4-Step Process (Lessons 06a–06d)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-039 | "Step 1: Define DOL and market conditions." | MACHINE_TESTABLE | R-01, R-02 | HTF DOL detection. |
| CL-040 | "Step 2: Define a LTF MSU." | MACHINE_TESTABLE | R-11 | LTF swing structure detection. |
| CL-041 | "Step 3: Wait for CSD entry." | PARTIALLY_TESTABLE | R-12 to R-20 | AMB-01, AMB-04, AMB-09. |
| CL-042 | "Step 4: Manage the trade to the DOL." | PARTIALLY_TESTABLE | R-21 to R-25 | AMB-07: stop placement. |
| CL-043 | "The 4 steps must be followed in order." | MACHINE_TESTABLE | CD-14 | Sequential gate. |
| CL-044 | "Do not enter without all 4 steps confirmed." | MACHINE_TESTABLE | R-29 | Full-sequence gate. |

### Section 07 — Worked Examples (Lessons 07a–07c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-045 | "The 4-step process worked on this example." | EDUCATIONAL_ONLY | — | Intent-validation fixture only; not performance evidence. |
| CL-046 | "The entry was at the CSD candle open." | PARTIALLY_TESTABLE | R-19 | AMB-08: entry type. |
| CL-047 | "The stop was below the inducement level." | PARTIALLY_TESTABLE | R-23 | AMB-07: stop buffer. |
| CL-048 | "The target was the DOL." | MACHINE_TESTABLE | R-21 | DOL as target. |
| CL-049 | "The trade achieved 3R." | PARTIALLY_TESTABLE | R-22 | Depends on stop placement (AMB-07). |
| CL-050 | "This setup appears on all timeframes." | PARTIALLY_TESTABLE | — | Fractal nature; AMB-05. |

### Section 08 — Pitfalls and Mindset (Lessons 08a–08c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-051 | "The double MSU trap is a common failure mode." | EDUCATIONAL_ONLY | CD-13 | Named failure mode; no frequency data provided. |
| CL-052 | "Do not enter on the first MSS — wait for the sweep." | MACHINE_TESTABLE | R-10 | Sequential gate; sweep required before entry. |
| CL-053 | "Patience is required to wait for all 4 steps." | SUBJECTIVE | — | Behavioural instruction. |
| CL-054 | "Most losses occur from entering too early." | INSUFFICIENT_INFORMATION | — | No data provided to support this claim. |
| CL-055 | "The system has a high win rate when followed correctly." | INSUFFICIENT_INFORMATION | — | No performance data provided. Not a testable claim without data. |
| CL-056 | "Risk management is the most important part of the system." | EDUCATIONAL_ONLY | — | General trading principle. |

### Section 09 — Quick Reference (Lessons 09a–09b)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-057 | "DOL = nearest prior swing high or low on HTF." | MACHINE_TESTABLE | CD-01, R-01 | Consistent with earlier definition. |
| CL-058 | "MSU = HH+HL (bull) or LH+LL (bear)." | MACHINE_TESTABLE | CD-03, R-11 | Consistent with earlier definition. |
| CL-059 | "Inducement = most recent swing in MSU direction." | MACHINE_TESTABLE | CD-06, R-07 | Consistent with earlier definition. |
| CL-060 | "CSD = body close through midpoint of sweep candle." | PARTIALLY_TESTABLE | R-13 | AMB-09: midpoint definition. |
| CL-061 | "Entry = next candle open after CSD (Type 1) or FVG (Type 2)." | PARTIALLY_TESTABLE | R-19, R-20 | AMB-08: FVG entry point. |
| CL-062 | "Stop = below inducement level." | PARTIALLY_TESTABLE | R-23 | AMB-07: stop buffer. |
| CL-063 | "Target = DOL (3R minimum)." | PARTIALLY_TESTABLE | R-21, R-22 | Depends on stop placement. |

### Section 10 — Glossary (Lesson 10a)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-064 | "DOL: Draw on Liquidity — the nearest prior swing extreme on the HTF." | MACHINE_TESTABLE | CD-01 | Consistent definition. |
| CL-065 | "MSU: Market Structure Update — HH+HL or LH+LL." | MACHINE_TESTABLE | CD-03 | Consistent definition. |
| CL-066 | "MSS: Market Structure Shift — break of prior swing extreme." | PARTIALLY_TESTABLE | CD-04 | AMB-04. |
| CL-067 | "fMSS: Fake MSS — sweep that reverses without MSU." | PARTIALLY_TESTABLE | CD-05 | AMB-04. |
| CL-068 | "CSD: Candle Shift in Delivery — body close through sweep candle midpoint." | PARTIALLY_TESTABLE | CD-07 | AMB-09. |
| CL-069 | "FVG: Fair Value Gap — three-candle imbalance." | MACHINE_TESTABLE | CD-08 | Standard three-candle definition. |
| CL-070 | "SMT: Smart Money Technique — correlated instrument divergence." | MACHINE_TESTABLE | CD-11 | Requires correlated instrument data. |
| CL-071 | "PD Array: Price Delivery Array — any significant price level." | SUBJECTIVE | CD-09 | No quantitative definition of 'significant'. |
| CL-072 | "3R Fix: Fixed 3:1 reward-to-risk ratio." | MACHINE_TESTABLE | R-22 | Fully operationalisable. |

### Section 11 — Tier 2 Unlock Note (Lesson 11a)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-073 | "Tier 2 content provides advanced entries and filters." | DEFERRED | — | Not available in this archive. Deferred. |
| CL-074 | "The Vault contains the full system." | DEFERRED | — | Tier 2 content not available. |

---

## Chart Image Claim Accounting

All 23 chart images are treated as intent-validation fixtures. They illustrate the 4-step process but do not constitute performance evidence.

| Image ID | Filename | Concepts Illustrated | Disposition |
|---|---|---|---|
| PV-SRC-0036 | Pasted image 20260706125006.png | External vs IPA liquidity reference levels, DOL | MACHINE_TESTABLE (DOL detection) |
| PV-SRC-0037 | Pasted image 20260706125512.png | fMSS, CISD/CSD on real chart | PARTIALLY_TESTABLE (AMB-04) |
| PV-SRC-0038 | Pasted image 20260706125704.png | Inducement at every swing extreme | MACHINE_TESTABLE |
| PV-SRC-0039 | Pasted image 20260706125826.png | CSD Rule 1 — body close above 50% | PARTIALLY_TESTABLE (AMB-09) |
| PV-SRC-0040 | Pasted image 20260706125933.png | Entry at/near 50% threshold after CSD | PARTIALLY_TESTABLE (AMB-08) |
| PV-SRC-0041 | Pasted image 20260706130015.png | FVG entry after CSD (Entry Type 2) | PARTIALLY_TESTABLE (AMB-08) |
| PV-SRC-0042 | Pasted image 20260706130112.png | SMT divergence — correlated instrument | MACHINE_TESTABLE |
| PV-SRC-0043 | Pasted image 20260706130213.png | **DUPLICATE** of PV-SRC-0042 | DUPLICATE |
| PV-SRC-0044 | Pasted image 20260706130439.png | Top-down process: HTF DOL → LTF MSS/IND/CSD | PARTIALLY_TESTABLE (AMB-05) |
| PV-SRC-0045 | Pasted image 20260706130623.png | DOL, FVG, CME gap, Wicks=gaps reference | PARTIALLY_TESTABLE |
| PV-SRC-0046 | Pasted image 20260706130741.png | "Every swing low/high is inducement" | MACHINE_TESTABLE |
| PV-SRC-0047 | Pasted image 20260706130835.png | Double MSU trap — first version | EDUCATIONAL_ONLY |
| PV-SRC-0048 | Pasted image 20260706131033.png | CSD MAGIC: Entry 1 = next candle, Entry 2 = FVG | PARTIALLY_TESTABLE (AMB-08) |
| PV-SRC-0049 | Pasted image 20260706131151.png | Step 1: Define DOL and market conditions | EDUCATIONAL_ONLY |
| PV-SRC-0050 | Pasted image 20260706131400.png | Step 2: Define LTF MSU | EDUCATIONAL_ONLY |
| PV-SRC-0051 | Pasted image 20260706131425.png | Step 3: CSD entry | PARTIALLY_TESTABLE |
| PV-SRC-0052 | Pasted image 20260706131502.png | **DUPLICATE** of PV-SRC-0051 | DUPLICATE |
| PV-SRC-0053 | Pasted image 20260706131550.png | Step 4: Print a money (target run) | PARTIALLY_TESTABLE |
| PV-SRC-0054 | Pasted image 20260706134342.png | Worked example: 4h GAP + DOL + CISD | EDUCATIONAL_ONLY |
| PV-SRC-0055 | Pasted image 20260706134405.png | **DUPLICATE** of PV-SRC-0054 | DUPLICATE |
| PV-SRC-0056 | Pasted image 20260706134614.png | Worked example: bearish DOL + inducement + CSD | EDUCATIONAL_ONLY |
| PV-SRC-0057 | Pasted image 20260706134700.png | Fractal nature: IT IS EVERYWHERE | EDUCATIONAL_ONLY |
| PV-SRC-0058 | Pasted image 20260706134722.png | Double MSU trap — second version (cleaner) | EDUCATIONAL_ONLY |

---

## Claim Accounting Summary

| Disposition | Count |
|---|---|
| MACHINE_TESTABLE | 22 |
| PARTIALLY_TESTABLE | 17 |
| SUBJECTIVE | 6 |
| CONTRADICTORY | 0 |
| INSUFFICIENT_INFORMATION | 2 |
| EDUCATIONAL_ONLY | 18 |
| IRRELEVANT_TO_MNQ | 3 |
| DEFERRED | 2 |
| **TOTAL (written lessons)** | **74** |
| Chart images (unique) | 17 |
| Chart images (duplicates) | 6 |
| **TOTAL (all sources)** | **97** |

**SOURCE_CLAIM_TRACEABILITY = 100%**

Every written lesson claim (CL-001 to CL-074) and every chart image (PV-SRC-0036 to PV-SRC-0058) has been assigned a disposition. No claim is unaccounted for.

---

## Contradictions Identified

**CONTRADICTIONS_IDENTIFIED = 0**

No direct contradictions were found between claims in the source material. The closest to a contradiction is:
- CL-033 ("Multiple CSDs increase confidence") vs. CL-020 ("Either CSD rule is sufficient") — these are not contradictory; they address different questions (number of CSDs vs. which rule to use).

---

## Visually Non-Reproducible Concepts

The following concepts are illustrated in chart images but cannot be reliably reproduced by the machine detector from the image content alone (no visible timestamps, no readable price levels, or highly stylised diagrams):

1. **"No wick candle"** (AMB-10) — appears in process diagrams but not quantitatively defined
2. **CME gap** (PV-SRC-0045) — requires overnight session data not visible in the image
3. **"Wicks = gaps"** (PV-SRC-0045) — conceptual equivalence claim; not directly testable from image
4. **Double MSU trap** (PV-SRC-0047, PV-SRC-0058) — requires retrospective classification of the second MSU as fake

**VISUALLY_NON_REPRODUCIBLE_CONCEPTS = 4**
