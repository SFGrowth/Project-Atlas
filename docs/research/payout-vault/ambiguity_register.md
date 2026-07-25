# Payout Vault — Ambiguity Register v1.0.0
**Sprint:** 123A.9 | **Status:** INTAKE_DRAFT | **Date:** 2026-07-25

This register documents every ambiguity, contradiction, and under-specification found in the Payout Vault source material. Each entry is assigned a unique identifier, a severity level, a description of the ambiguity, the competing interpretations, the resolution strategy, and the downstream impact on detector design.

**Severity levels:**
- **BLOCKING:** The detector cannot be built without resolving this ambiguity.
- **HIGH:** The ambiguity materially affects trade count, entry price, or stop placement.
- **MEDIUM:** The ambiguity affects setup filtering or confirmation logic.
- **LOW:** The ambiguity affects labelling or documentation only.

---

## AMB-01 — CSD Confirmation Window (Maximum Wait)
**Severity:** BLOCKING  
**Affected rules:** R-18  
**Description:** The source material states that CSD must occur after inducement is swept, but never specifies how many bars after the sweep the confirmation must arrive. A confirmation that arrives 50 bars later is conceptually different from one that arrives 1–3 bars later, but both satisfy the written rule.  
**Competing interpretations:**
- Interpretation A: CSD must be confirmed on the sweep candle itself or the immediately following candle (1–2 bar window).
- Interpretation B: CSD must be confirmed within a session (e.g., within the same trading day).
- Interpretation C: CSD is valid at any point after the sweep as long as the inducement level has not been re-established.

**Resolution strategy:** Pre-register three window variants (1 bar, 3 bars, 10 bars) and test each independently. Report results separately. Do not merge results.  
**Downstream impact:** Directly determines trade count and entry timing. HIGH impact on all metrics.

---

## AMB-02 — CSD Terminology: CSD vs CISD
**Severity:** LOW  
**Affected concepts:** CD-07  
**Description:** The source uses "CSD" in most lessons and the glossary, but uses "CISD" in at least two chart images (images 2 and 19). The glossary defines only "CSD." No lesson explicitly defines "CISD" as a separate concept.  
**Competing interpretations:**
- Interpretation A: CSD and CISD are synonyms. CISD is an older or informal variant of the same term.
- Interpretation B: CISD is a specific sub-type of CSD (e.g., a CSD that occurs inside a specific structure context).

**Resolution strategy:** Treat as synonyms in this research. Flag for Tier 2 clarification. Use "CSD" as the canonical term throughout all detector code.  
**Downstream impact:** Documentation and labelling only. No impact on detector logic.

---

## AMB-03 — DOL: Level vs Zone
**Severity:** MEDIUM  
**Affected rules:** R-02, R-05  
**Description:** Lesson 02a defines DOL as "the HTF level/zone price is being drawn toward." The word "zone" implies a range, but the model's trade management (3R fix with a scalar target) implies a single price level. The visual examples show DOL as a single horizontal line.  
**Competing interpretations:**
- Interpretation A: DOL is a scalar price (the exact price of the prior swing extreme).
- Interpretation B: DOL is a zone defined by the body of the prior swing candle or a cluster of candles near the extreme.

**Resolution strategy:** Implement DOL as a scalar price (the exact prior swing extreme) for the initial detector. Record the zone interpretation as a future variant to test.  
**Downstream impact:** Affects DOL detection and target calculation. Medium impact.

---

## AMB-04 — Inducement Sweep: Wick vs Close
**Severity:** HIGH  
**Affected rules:** R-10  
**Description:** The source says price "gets run" through the inducement level, but does not specify whether the sweep requires a candle close through the level or only a wick through the level.  
**Competing interpretations:**
- Interpretation A: Sweep is confirmed when any bar's low (bullish setup) or high (bearish setup) trades through the inducement level, regardless of close.
- Interpretation B: Sweep is confirmed only when a candle closes through the inducement level.

**Resolution strategy:** Pre-register both variants. Interpretation A (wick through) is more consistent with the course's liquidity-mechanics framing (stops are triggered at price, not at close). Implement Interpretation A as the primary variant.  
**Downstream impact:** Affects sweep detection. High impact on trade count.

---

## AMB-05 — CSD 50% Rule: Exact Boundary Handling
**Severity:** MEDIUM  
**Affected rules:** R-13  
**Description:** The source states "body close above 50% of the sweep candle." It does not specify whether a close exactly at the 50% midpoint qualifies.  
**Competing interpretations:**
- Interpretation A: Close strictly above 50% (close > midpoint).
- Interpretation B: Close at or above 50% (close ≥ midpoint).

**Resolution strategy:** Implement as strict greater-than (close > midpoint) to avoid boundary ambiguity. Document this decision explicitly in the detector code.  
**Downstream impact:** Affects a small number of edge-case bars. Low practical impact.

---

## AMB-06 — No-Wick Candle: Quantitative Threshold
**Severity:** HIGH  
**Affected concepts:** CD-09g  
**Description:** The source defines a no-wick candle as "a candle with no wick on the relevant side." In practice, futures candles almost never have exactly zero wick. The course does not provide a quantitative threshold (e.g., wick < 5% of body, or wick < 1 tick).  
**Competing interpretations:**
- Interpretation A: Strict zero wick (wick = 0 ticks).
- Interpretation B: De minimis wick (wick ≤ N% of candle range, where N is unspecified).
- Interpretation C: No-wick candle is a qualitative label for strong displacement, not a strict binary rule.

**Resolution strategy:** The no-wick candle concept is used in the course as a contextual marker for liquidity pool edges, not as a primary entry condition. Flag as UNRESOLVED for now. Do not include in the initial detector prototype. Revisit if Tier 2 material provides a threshold.  
**Downstream impact:** Affects DOL/liquidity pool edge detection. Medium impact if included.

---

## AMB-07 — Stop Placement: "Just Beyond" Buffer
**Severity:** HIGH  
**Affected rules:** R-21  
**Description:** The source says stop is placed "just beyond the sweep point." No tick count, ATR multiple, or percentage is specified.  
**Competing interpretations:**
- Interpretation A: Stop = swept inducement level − 1 tick (minimum buffer).
- Interpretation B: Stop = swept inducement level − N ticks (e.g., 2–5 ticks for MNQ).
- Interpretation C: Stop = swept inducement level − ATR-based buffer.

**Resolution strategy:** Pre-register two variants for MNQ: (A) 1 tick beyond and (B) 4 ticks beyond (approximately 1 MNQ point). Report results separately.  
**Downstream impact:** Directly affects risk amount and 3R target. High impact on all P&L metrics.

---

## AMB-08 — SMT Lookback Window and Tolerance
**Severity:** MEDIUM  
**Affected rules:** R-26  
**Description:** The source does not specify how many bars to look back when checking whether the correlated instrument (MES) failed to confirm the new extreme. It also does not specify a price tolerance (e.g., MES can be within N ticks of its prior extreme and still qualify as "failing to confirm").  
**Competing interpretations:**
- Interpretation A: SMT is checked on the exact same bar as the inducement sweep.
- Interpretation B: SMT is checked within a window of ±N bars around the inducement sweep.
- Interpretation C: SMT is checked within the same session.

**Resolution strategy:** Pre-register a ±3 bar window as the primary variant. Document that SMT is an optional filter and its absence does not invalidate a setup.  
**Downstream impact:** Affects SMT filter hit rate. Medium impact on setup count when SMT is used.

---

## AMB-09 — HTF and LTF Exact Timeframes
**Severity:** BLOCKING  
**Affected concepts:** CD-02  
**Description:** The course does not specify exact timeframes. Visual examples suggest 4h as HTF, but the LTF is not specified. For MNQ research, the timeframe pairing must be pre-registered before any detector is built.  
**Resolution strategy:** Pre-register the following pairing for MNQ research: HTF = 1h bar, LTF = 5m bar. This is consistent with the Atlas Nexus canonical 5m dataset and the 1h aggregation available from it. Document this as a research-specific choice, not a course rule.  
**Downstream impact:** BLOCKING — must be resolved before any detector is implemented.

---

## AMB-10 — FVG Entry Type 2: Fill Definition
**Severity:** MEDIUM  
**Affected rules:** R-20  
**Description:** The source says Entry Type 2 is "a retracement into the FVG." It does not specify how deep into the FVG price must retrace, or whether a partial fill (wick into FVG) qualifies vs a body close into the FVG.  
**Competing interpretations:**
- Interpretation A: Entry triggers when price (low for bearish, high for bullish) touches the FVG boundary.
- Interpretation B: Entry triggers when price closes into the FVG.
- Interpretation C: Entry triggers at the midpoint of the FVG.

**Resolution strategy:** Implement Entry Type 2 as a limit order at the FVG midpoint for the initial prototype. Document as a research choice.  
**Downstream impact:** Affects Entry Type 2 fill rate and entry price. Medium impact.

---

## AMB-11 — Q2 Quadrant Definition
**Severity:** LOW (for Tier 1 research)  
**Affected concepts:** CD-13  
**Description:** Q2 appears only in the glossary with no lesson explaining it. It is likely a Tier 2 concept.  
**Resolution strategy:** Exclude from all Tier 1 detector prototypes. Flag for Tier 2 intake.  
**Downstream impact:** None for Tier 1 research.

---

## AMB-12 — Duplicate Images: Intentional vs Accidental
**Severity:** LOW  
**Description:** Three pairs of images appear visually identical (images 7/8, 16/17, 19/20). It is unclear whether these are intentional duplicates (e.g., used in different lessons) or accidental duplicates in the archive.  
**Resolution strategy:** Treat as duplicates in the visual example labels dataset. Count each unique concept once.  
**Downstream impact:** Documentation only.

---

## Summary Table

| ID | Description | Severity | Status |
|---|---|---|---|
| AMB-01 | CSD confirmation window (max wait) | BLOCKING | UNRESOLVED |
| AMB-02 | CSD vs CISD terminology | LOW | RESOLVED (synonyms) |
| AMB-03 | DOL level vs zone | MEDIUM | RESOLVED (scalar) |
| AMB-04 | Inducement sweep: wick vs close | HIGH | RESOLVED (wick) |
| AMB-05 | CSD 50% boundary handling | MEDIUM | RESOLVED (strict >) |
| AMB-06 | No-wick candle threshold | HIGH | UNRESOLVED (deferred) |
| AMB-07 | Stop buffer "just beyond" | HIGH | PRE-REGISTERED (2 variants) |
| AMB-08 | SMT lookback window | MEDIUM | PRE-REGISTERED (±3 bars) |
| AMB-09 | HTF/LTF exact timeframes | BLOCKING | RESOLVED (1h/5m for MNQ) |
| AMB-10 | FVG Entry Type 2 fill definition | MEDIUM | PRE-REGISTERED (midpoint) |
| AMB-11 | Q2 definition | LOW | DEFERRED (Tier 2) |
| AMB-12 | Duplicate images | LOW | RESOLVED (deduplicated) |

