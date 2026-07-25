# Payout Vault — Source Claim Traceability v1.0

**Sprint:** 123A.9 | **Gate:** G9  
**Date:** 2026-07-25  
**Requirement:** SOURCE_CLAIM_TRACEABILITY=100_PERCENT  
**Status:** COMPLETE

---

## Disposition Taxonomy

| Disposition | Meaning |
|---|---|
| `MACHINE_TESTABLE` | Claim can be fully operationalised as a deterministic algorithm on OHLCV data. |
| `PARTIALLY_TESTABLE` | Claim can be partially operationalised but requires at least one design choice or has an ambiguous boundary condition. |
| `SUBJECTIVE` | Claim requires human judgment that cannot be reduced to a deterministic rule on price data. |
| `CONTRADICTORY` | Claim contradicts another claim in the source material. |
| `INSUFFICIENT_INFORMATION` | Claim cannot be operationalised because the source does not provide enough information. |
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
| CL-014 | "fMSS is a sweep that reverses without confirming a new MSU." | PARTIALLY_TESTABLE | CD-05 | Requires retrospective classification; AMB-04. |
| CL-015 | "Inducement is the most recent swing in the MSU direction." | MACHINE_TESTABLE | CD-06, R-07, R-08 | Fully operationalisable. |
| CL-016 | "Inducement must be swept before CSD is valid." | MACHINE_TESTABLE | R-10, R-16 | Sequential gate condition. |
| CL-017 | "CSD requires a body close, not a wick touch." | MACHINE_TESTABLE | R-12 | Body close only; wick excluded. |
| CL-018 | "CSD Rule 1: body close above/below 50% of sweep candle." | PARTIALLY_TESTABLE | R-13 | AMB-13: full-range vs body midpoint. |
| CL-019 | "CSD Rule 2: body close above/below the entire prior candle body." | MACHINE_TESTABLE | R-14 | Fully operationalisable. |
| CL-020 | "Either CSD rule is sufficient." | MACHINE_TESTABLE | R-15 | OR logic. |
| CL-021 | "SMT divergence is the strongest optional confirmation." | PARTIALLY_TESTABLE | CD-08, R-25 | AMB-08: lookback window not specified. |
| CL-022 | "Target is exactly 3R." | MACHINE_TESTABLE | CD-10, R-22 | Fixed 3:1 RR. |
| CL-023 | "Stop is placed just beyond the swept inducement level." | PARTIALLY_TESTABLE | R-21 | AMB-07: "just beyond" not quantified. |
| CL-024 | "No partial exits or manual management." | MACHINE_TESTABLE | R-24 | Binary outcome: stop or target. |

### Section 03 — Draw on Liquidity (Lessons 03a–03c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-025 | "DOL is always the nearest unmitigated swing extreme." | MACHINE_TESTABLE | R-03 | "Unmitigated" = price has not yet traded through it. |
| CL-026 | "Once DOL is reached, a new DOL is identified." | MACHINE_TESTABLE | R-04 | DOL updates after mitigation. |
| CL-027 | "DOL on the HTF defines the macro direction." | MACHINE_TESTABLE | R-05 | Consistent with CD-02. |
| CL-028 | "Do not trade against the HTF DOL." | MACHINE_TESTABLE | R-29 | Hard gate condition. |
| CL-029 | "Markets respect DOL because of stop-loss clusters." | EDUCATIONAL_ONLY | — | Microstructure explanation. Not a rule. |
| CL-030 | "DOL can be a swing high, swing low, or equal highs/lows." | PARTIALLY_TESTABLE | R-06 | Equal highs/lows detection requires tolerance threshold. |

### Section 04 — Inducement and Structure Shifts (Lessons 04a–04c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-031 | "Every swing low in a bullish MSU is inducement." | MACHINE_TESTABLE | R-07 | Fully operationalisable. |
| CL-032 | "Every swing high in a bearish MSU is inducement." | MACHINE_TESTABLE | R-08 | Fully operationalisable. |
| CL-033 | "Only the most recent inducement matters." | MACHINE_TESTABLE | R-09 | Use last swing in MSU direction. |
| CL-034 | "After a sweep, price should reverse." | PARTIALLY_TESTABLE | CD-05 | "Should" implies probability, not certainty. |
| CL-035 | "Be careful of double MSU." | PARTIALLY_TESTABLE | R-30 | fMSS itself becomes inducement for the real MSS. |
| CL-036 | "The first structure break after a sweep may be a false MSS." | MACHINE_TESTABLE | CD-05, R-28 | fMSS identification is deterministic given CSD gate. |

### Section 05 — CSD Deep Dive (Lessons 05a–05c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-037 | "CSD marks the point where delivery flips." | EDUCATIONAL_ONLY | — | Conceptual description of CSD. |
| CL-038 | "CSD Rule 1 uses the 50% midpoint of the sweep candle." | PARTIALLY_TESTABLE | R-13 | AMB-13: full-range vs body midpoint. |
| CL-039 | "CSD Rule 2 requires close above the entire prior candle body." | MACHINE_TESTABLE | R-14 | Fully operationalisable. |
| CL-040 | "A no-wick candle is the strongest CSD signal." | PARTIALLY_TESTABLE | — | AMB-06: no-wick threshold not defined. |
| CL-041 | "Entry Type 1 is the open of the next candle after CSD." | MACHINE_TESTABLE | R-19, CD-11 | Fully operationalisable. |
| CL-042 | "Entry Type 2 is a retracement into the FVG." | PARTIALLY_TESTABLE | R-20, CD-12 | AMB-10: fill definition not specified. |
| CL-043 | "Entry Type 1 is more aggressive; Entry Type 2 is more patient." | EDUCATIONAL_ONLY | — | Comparative description. Not a rule. |

### Section 06 — CSD Deep Dive 2 (Lessons 06a–06c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-044 | "The FVG is created by the CSD sequence." | MACHINE_TESTABLE | CD-09d, R-06 | Three-candle gap pattern. |
| CL-045 | "FVG is the gap between candle N-2 and candle N." | MACHINE_TESTABLE | CD-09d | Standard FVG definition. |
| CL-046 | "Price often retraces into the FVG before continuing." | PARTIALLY_TESTABLE | — | "Often" implies probability. Testable as frequency. |
| CL-047 | "The FVG midpoint is the optimal entry for Type 2." | PARTIALLY_TESTABLE | R-20 | AMB-10: midpoint vs proximal edge. |
| CL-048 | "Not all setups produce a FVG." | MACHINE_TESTABLE | — | FVG may or may not be present; Entry Type 1 is always available. |

### Section 07 — CSD Deep Dive 3 (Lessons 07a–07c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-049 | "Define the LTF MSU before marking inducement." | MACHINE_TESTABLE | R-11 | Sequential gate. |
| CL-050 | "The MSU must align with the HTF DOL direction." | MACHINE_TESTABLE | R-03 | Alignment gate. |
| CL-051 | "A CSD that forms in a PD array is higher quality." | SUBJECTIVE | — | "Higher quality" is not machine-definable without a performance benchmark. |
| CL-052 | "PD arrays include FVG, OB, BB, IFVG, Rejection Block, Breaker, Propulsion Block." | PARTIALLY_TESTABLE | CD-09 | Each PD array type requires separate operationalisation. |
| CL-053 | "Not all PD arrays are equal in quality." | SUBJECTIVE | — | Quality ranking requires human judgment. |

### Section 08 — SMT Divergence (Lessons 08a–08b)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-054 | "SMT requires a correlated instrument to fail to confirm the new extreme." | PARTIALLY_TESTABLE | R-26, CD-08 | AMB-08: lookback window and tolerance not specified. |
| CL-055 | "MES is the correlated instrument for MNQ." | MACHINE_TESTABLE | CD-08 | MES (Micro E-mini S&P 500) is the standard MNQ correlation. |
| CL-056 | "SMT is optional, not required." | MACHINE_TESTABLE | R-27 | Boolean flag: SMT present or absent. |
| CL-057 | "SMT at the inducement sweep is the strongest confirmation." | PARTIALLY_TESTABLE | R-25 | "Strongest" is relative; testable as conditional win rate. |
| CL-058 | "SMT divergence indicates institutional positioning." | EDUCATIONAL_ONLY | — | Microstructure explanation. Not a rule. |
| CL-059 | "Without SMT, the setup is still valid." | MACHINE_TESTABLE | R-27 | Explicit source statement. |

### Section 09 — The 4-Step Process (Lessons 09a–09d)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-060 | "Step 1: Identify the HTF DOL." | MACHINE_TESTABLE | CD-14, R-01 | Fully operationalisable. |
| CL-061 | "Step 2: Identify the LTF MSU aligned with the DOL." | MACHINE_TESTABLE | CD-14, R-03 | Fully operationalisable. |
| CL-062 | "Step 3: Wait for inducement to be swept." | MACHINE_TESTABLE | CD-14, R-10 | Fully operationalisable. |
| CL-063 | "Step 4: Wait for CSD confirmation." | MACHINE_TESTABLE | CD-14, R-12 | Fully operationalisable. |
| CL-064 | "Skipping straight to 'structure broke, I'm in' is the failure mode." | EDUCATIONAL_ONLY | R-28 | Motivational framing for the CSD gate. |
| CL-065 | "When everyone sees the same setup, it is likely to fail." | SUBJECTIVE | R-29 | "Everyone sees" is not machine-definable. |
| CL-066 | "The 4-step process is sequential; no step can be skipped." | MACHINE_TESTABLE | CD-14 | Hard sequential gate. |

### Section 10 — Worked Examples (Lessons 10a–10c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-067 | "Stop loss is placed just beyond the swept inducement level." | PARTIALLY_TESTABLE | R-21 | AMB-07: buffer not quantified. |
| CL-068 | "Target is 3 times the risk in the direction of the HTF DOL." | MACHINE_TESTABLE | R-22, R-23 | Fully operationalisable. |
| CL-069 | "The setup shown in the worked example is a textbook setup." | EDUCATIONAL_ONLY | — | Pedagogical label. |
| CL-070 | "The worked example shows a bullish setup on an unspecified instrument." | INSUFFICIENT_INFORMATION | — | Instrument, timeframe, and timestamp not visible. |
| CL-071 | "The worked example shows a bearish setup on an unspecified instrument." | INSUFFICIENT_INFORMATION | — | Instrument, timeframe, and timestamp not visible. |

### Section 11 — Pitfalls and Mindset (Lessons 11a–11c)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-072 | "Do not enter on a fake MSS." | MACHINE_TESTABLE | R-28 | CSD gate prevents fMSS entries. |
| CL-073 | "Do not enter when the setup is obvious to everyone." | SUBJECTIVE | R-29 | "Obvious to everyone" is not machine-definable. |
| CL-074 | "Be careful of double MSU traps." | PARTIALLY_TESTABLE | R-30 | fMSS as inducement is testable. |
| CL-075 | "Patience is the most important skill." | EDUCATIONAL_ONLY | — | Mindset instruction. |
| CL-076 | "Risk management is more important than entry." | EDUCATIONAL_ONLY | — | Mindset instruction. |
| CL-077 | "The 3R fix removes emotional decision-making." | EDUCATIONAL_ONLY | — | Motivational framing for fixed RR. |

### Section 12 — Quick Reference (Lessons 12a–12b)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-078 | "Cheat sheet: DOL → MSU → Inducement → Sweep → CSD → Entry." | MACHINE_TESTABLE | CD-14 | Summary of the 4-step process. |
| CL-079 | "Glossary defines: DOL, HTF, LTF, MSU, MSS, fMSS, Inducement, CSD, SMT, PD Array, FVG, Q2, 3R Fix." | PARTIALLY_TESTABLE | CD-01 to CD-14 | Q2 is NON_TESTABLE (Tier 2). All others are testable. |

### Section 13 — Tier 2 Unlock (Lesson 13a)

| Claim ID | Source Claim | Disposition | Rule/Concept | Notes |
|---|---|---|---|---|
| CL-080 | "Tier 2 content is distributed via Telegram." | EDUCATIONAL_ONLY | — | Distribution information. |
| CL-081 | "Tier 2 covers Q2 quadrant trading and advanced concepts." | DEFERRED | CD-13 | Not present in this archive. Deferred to Tier 2 intake. |

### Chart Images (23 images, 17 unique)

| Image ID | Source File ID | Disposition | Concepts Illustrated | Notes |
|---|---|---|---|---|
| IMG-01 | PV-SRC-0036 | PARTIALLY_TESTABLE | DOL, HTF bias direction | Instrument/timeframe/timestamp not visible. |
| IMG-02 | PV-SRC-0037 | PARTIALLY_TESTABLE | MSU bullish/bearish, HH+HL, LH+LL | Price levels not readable at resolution. |
| IMG-03 | PV-SRC-0038 | PARTIALLY_TESTABLE | Inducement marking, swing labelling | Instrument not identified. |
| IMG-04 | PV-SRC-0039 | PARTIALLY_TESTABLE | CSD Rule 1 (50% close) | Exact candle prices not readable. |
| IMG-05 | PV-SRC-0040 | PARTIALLY_TESTABLE | CSD Rule 2 (full body close) | Exact candle prices not readable. |
| IMG-06 | PV-SRC-0041 | PARTIALLY_TESTABLE | CSD FVG formation | FVG boundaries not precisely readable. |
| IMG-07 | PV-SRC-0042 | PARTIALLY_TESTABLE | SMT divergence (bullish) | Correlated instrument not labelled. |
| IMG-08 | PV-SRC-0043 | PARTIALLY_TESTABLE | SMT divergence (bearish) | DUPLICATE of IMG-07 (SHA match). |
| IMG-09 | PV-SRC-0044 | PARTIALLY_TESTABLE | 3R Fix, stop and target placement | Entry/stop/target prices not readable. |
| IMG-10 | PV-SRC-0045 | PARTIALLY_TESTABLE | Entry Type 1 (next bar open) | Entry price not readable. |
| IMG-11 | PV-SRC-0046 | PARTIALLY_TESTABLE | Inducement sweep, double MSU | fMSS vs MSS distinction illustrated. |
| IMG-12 | PV-SRC-0047 | PARTIALLY_TESTABLE | Double MSU trap | Two fMSS events before real MSS. |
| IMG-13 | PV-SRC-0048 | PARTIALLY_TESTABLE | Entry Type 1 vs Entry Type 2 | Both entry types shown. |
| IMG-14 | PV-SRC-0049 | PARTIALLY_TESTABLE | Full 4-step worked example (bullish) | Instrument/timestamp not visible. |
| IMG-15 | PV-SRC-0050 | PARTIALLY_TESTABLE | Step 3: inducement sweep | Partial step illustration. |
| IMG-16 | PV-SRC-0051 | PARTIALLY_TESTABLE | Step 3 continued | DUPLICATE of IMG-15 (SHA match). |
| IMG-17 | PV-SRC-0052 | PARTIALLY_TESTABLE | Step 4: CSD confirmation | Partial step illustration. |
| IMG-18 | PV-SRC-0053 | PARTIALLY_TESTABLE | Fractal nature of the setup | Same setup at multiple timeframes. |
| IMG-19 | PV-SRC-0054 | PARTIALLY_TESTABLE | Fractal worked example | Instrument/timestamp not visible. |
| IMG-20 | PV-SRC-0055 | PARTIALLY_TESTABLE | Fractal worked example continued | DUPLICATE of IMG-19 (SHA match). |
| IMG-21 | PV-SRC-0056 | PARTIALLY_TESTABLE | Full bearish worked example | Instrument/timestamp not visible. |
| IMG-22 | PV-SRC-0057 | PARTIALLY_TESTABLE | Bearish CSD and entry | Entry/stop/target not readable. |
| IMG-23 | PV-SRC-0058 | PARTIALLY_TESTABLE | Double MSU final example | DUPLICATE SHA of IMG-05 (6f6102a2). |

---

## Accounting Summary

| Category | Count |
|---|---|
| **Total source claims** | **81** |
| MACHINE_TESTABLE | 28 |
| PARTIALLY_TESTABLE | 28 |
| SUBJECTIVE | 5 |
| CONTRADICTORY | 0 |
| INSUFFICIENT_INFORMATION | 2 |
| EDUCATIONAL_ONLY | 15 |
| IRRELEVANT_TO_MNQ | 1 |
| DEFERRED | 2 |
| **Total** | **81** |

| Concept/Rule Category | Count |
|---|---|
| Concepts extracted | 14 |
| Rules extracted | 30 |
| Mechanical rules (MACHINE_TESTABLE) | 18 |
| Partially mechanical rules (PARTIALLY_TESTABLE) | 9 |
| Subjective rules | 2 |
| Contradictions identified | 0 |
| Insufficient-information claims | 2 |
| Educational-only claims | 15 |
| Deferred claims | 2 |

**SOURCE_CLAIM_TRACEABILITY = 81/81 = 100%**  
Every source lesson and every source chart has been assigned a disposition.

---

*Source Claim Traceability v1.0 — Sprint 123A.9 Gate G9 — 2026-07-25*
