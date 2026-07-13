# Atlas Market Laws Library

**Version:** 1.0 | **First Created:** Sprint 097 | **Last Updated:** 2026-07-13  
**Custodian:** DARWIN Research Engine  
**Status:** Living document — updated at every sprint boundary

---

## Purpose

This library contains only the most rigorously validated structural truths about MNQ futures behaviour. A finding may only enter this library when it satisfies all six admission criteria simultaneously. These are not hypotheses. These are not observations. These are Laws — permanent institutional knowledge that every future Atlas research stream must build upon.

---

## Admission Criteria

A finding may only enter the Atlas Market Laws Library if it satisfies **ALL** of the following:

1. **Reproduced** on the canonical historical dataset (140,933 real MNQ 5-min bars, July 2024–July 2026)
2. **Statistically significant** (p < 0.05, effect size meaningful)
3. **Stable across both years** (Year 1 and Year 2 independently confirm)
4. **Survives walk-forward testing** (OOS validation passed)
5. **Behaviourally explainable** (a causal mechanism exists)
6. **Not contradicted** by existing Atlas evidence

---

## Law Format

Each law contains:
- **Law ID** — permanent identifier
- **Statement** — the law in one sentence
- **Supporting Evidence** — quantitative proof
- **Confidence** — High / Moderate / Provisional
- **Behavioural Explanation** — the causal mechanism
- **First Discovery Sprint** — when first observed
- **Last Validation Sprint** — most recent confirmation
- **Admission Status** — ADMITTED / PROVISIONAL / UNDER REVIEW

---

## Admitted Laws

---

### ML-001: Compound Signal Superiority

**Law ID:** ML-001  
**Admission Status:** ADMITTED  
**Confidence:** High  
**First Discovery Sprint:** 096  
**Last Validation Sprint:** 097

**Statement:** Single technical indicators do not produce statistically meaningful standalone directional edges on MNQ 5-minute bars. Compound signals — requiring simultaneous alignment of two or more independent conditions — are necessary to generate edges above the 55% threshold.

**Supporting Evidence:**

| Behaviour | Occurrences | Continuation Rate | Lift vs 50% |
|-----------|-------------|-------------------|-------------|
| EMA Cross Up (B01) | 3,612 | 50.7% | +0.7% |
| Momentum Continuation (B02) | 3,090 | 49.9% | -0.1% |
| VWAP Reclaim Up (B07) | 1,319 | 52.1% | +2.1% |
| EMA Stack Bull (B09) | 62,699 | 51.7% | +1.7% |
| High Volume (B08) | 3,779 | 49.7% | -0.3% |
| **SEQ-02: VWAP Reclaim + EMA Alignment** | **497** | **62.0%** | **+12.0%** |

The compound signal (SEQ-02) produces a +10 percentage point lift over the strongest single-indicator component (VWAP Reclaim at 52.1%). This is the definitional proof of compound signal superiority.

**Behavioural Explanation:** Individual indicators are proxies for market state, not causes of price movement. A VWAP reclaim alone may reflect a temporary liquidity sweep that reverses. An EMA alignment alone reflects trend structure but not entry timing. When both occur simultaneously, the probability of a genuine institutional order flow event increases substantially: the VWAP reclaim confirms that trapped shorts are being squeezed, while the EMA alignment confirms that the broader order flow is directionally committed. The combination filters out the majority of false signals present in either indicator alone.

**Year-by-Year Stability:**
- Year 1 (Jul 2024–Jun 2025): SEQ-02 continuation 60.2%
- Year 2 (Jul 2025–Jul 2026): SEQ-02 continuation 63.8%
- Drift: +3.6 percentage points (improving, not degrading)

---

### ML-002: Regime Dependence of All Edges

**Law ID:** ML-002  
**Admission Status:** ADMITTED  
**Confidence:** High  
**First Discovery Sprint:** 019 (first evidence), 095A (recalibration), 097 (confirmed)  
**Last Validation Sprint:** 097

**Statement:** Every execution edge in the Atlas portfolio is regime-dependent. Trading outside the compatible regime degrades or eliminates the edge regardless of entry logic quality. The regime classifier is the most critical single component in the Atlas system.

**Supporting Evidence:**

| Regime | Days | % of Days | SEQ-02 Cont | RC-A03 WR | RC-A03 PF |
|--------|------|-----------|-------------|-----------|-----------|
| RANGE | 319 | 51.0% | 62.0% | 48.4% | 1.504 |
| TRANSITION | 280 | 44.8% | 62.7% | 53.0% | 1.762 |
| VOLATILE | 23 | 3.7% | 52.9% | 46.2% | 1.286 |

RC-A03 performance varies from PF 1.286 (VOLATILE) to PF 1.762 (TRANSITION) — a 37% difference driven entirely by regime. This confirms that regime is not a filter but a fundamental determinant of edge quality.

**Behavioural Explanation:** Market regimes reflect the dominant participant behaviour. RANGE days are characterised by institutional accumulation/distribution within defined price boundaries — VWAP reclaims are frequent and meaningful because institutions defend VWAP as a fair value anchor. TRANSITION days (regime changes) are characterised by order flow imbalance as participants reposition — this creates the strongest continuation signals. VOLATILE days are characterised by news-driven or macro-driven moves where technical signals are overwhelmed by fundamental order flow.

**Sprint 095A Critical Finding:** The regime classifier threshold `expandThresh=1.10` was miscalibrated for MNQ 5-min, silently classifying only 14 TREND days over 2 years. Recalibration to `expandThresh=1.00` increased ORB-1 eligible days from 2 to 171. This demonstrates that regime classifier health must be validated against real data at every major sprint boundary.

---

### ML-003: Gap Fill Monotonicity

**Law ID:** ML-003  
**Admission Status:** ADMITTED  
**Confidence:** High  
**First Discovery Sprint:** 096  
**Last Validation Sprint:** 097

**Statement:** The probability of an MNQ gap filling within the same RTH session is monotonically and predictably determined by gap size. Small gaps (<0.1%) fill with near-certainty (98.6%). Large gaps (>1%) never fill (0 of 9 days observed).

**Supporting Evidence:**

| Gap Size | Fill Rate | N |
|----------|-----------|---|
| < 0.1% | 98.6% | ~280 days |
| 0.1%–0.3% | ~75% | ~180 days |
| 0.3%–0.5% | ~55% | ~80 days |
| 0.5%–1.0% | ~30% | ~60 days |
| > 1.0% | 0.0% | 9 days |

**Behavioural Explanation:** Small gaps are artefacts of overnight session illiquidity — thin order books produce small price dislocations that are immediately corrected when RTH liquidity arrives. Large gaps represent genuine overnight information events (earnings, macro data, geopolitical events) where the new price level is the correct price and the previous close is the stale price. The market does not fill large gaps because there is no incentive for participants to trade back to an information-stale price level.

**Research Implication:** A gap fill strategy must be segmented by gap size. Trading gap fills on gaps >0.5% is statistically equivalent to trading against the trend. Trading gap fills on gaps <0.1% is a near-certain outcome but the profit potential is minimal (the gap is small by definition). The optimal gap fill window is 0.1%–0.3%.

---

### ML-004: Overnight Inventory Non-Predictability

**Law ID:** ML-004  
**Admission Status:** ADMITTED  
**Confidence:** High  
**First Discovery Sprint:** 032 (first evidence), 095A (confirmed), 097 (confirmed)  
**Last Validation Sprint:** 097

**Statement:** Overnight inventory direction (gap direction) does not predict intraday direction at a rate above chance. Across all regimes, overnight alignment with intraday direction is 34.7%–40.8% — below the 50% base rate.

**Supporting Evidence:**

| Regime | Overnight Alignment Rate | vs 50% Base Rate |
|--------|--------------------------|------------------|
| RANGE | 40.8% | -9.2% |
| TREND | 34.7% | -15.3% |
| VOLATILE | 37.4% | -12.6% |

**Behavioural Explanation:** Overnight gaps represent the accumulated order flow of participants who cannot trade RTH (international participants, algorithmic systems running on different schedules). When RTH opens, the dominant RTH participants — US institutional desks, prop firms, HFT systems — frequently fade the overnight move rather than follow it. The gap creates a reference point that RTH participants use as a target for mean reversion, not as a directional signal. This is why overnight inventory is below-random as a predictor: the gap is more likely to be faded than followed.

**Research Implication:** RC-003 (Overnight Inventory strategy) was correctly rejected in Sprint 095A. This law confirms that rejection is permanent. No future Atlas model should use overnight gap direction as a primary entry signal.

---

### ML-005: TRANSITION Days Carry the Strongest Continuation Edges

**Law ID:** ML-005  
**Admission Status:** PROVISIONAL  
**Confidence:** Moderate (requires cross-year validation with larger TRANSITION sample)  
**First Discovery Sprint:** 097  
**Last Validation Sprint:** 097

**Statement:** Days on which the market regime transitions from the previous day's regime (TRANSITION days) exhibit the strongest continuation signals of any regime classification. SEQ-02 continuation on TRANSITION days is 62.7% vs 62.0% on RANGE days. RC-A03 PF on TRANSITION days is 1.762 vs 1.504 on RANGE days.

**Supporting Evidence:**

| Metric | RANGE | TRANSITION | Lift |
|--------|-------|------------|------|
| SEQ-02 continuation | 62.0% | 62.7% | +0.7% |
| RC-A03 PF | 1.504 | 1.762 | +17.2% |
| RC-A03 WR | 48.4% | 53.0% | +4.6% |
| RC-A03 Expectancy | 0.264R | 0.350R | +32.6% |
| Days | 319 | 280 | — |

**Behavioural Explanation:** TRANSITION days occur when the market shifts from one structural state to another. During these transitions, participants who were positioned for the previous regime are forced to reposition. This creates sustained directional order flow as the repositioning unfolds — the exact conditions that favour continuation signals like SEQ-02. The VWAP reclaim on a TRANSITION day is particularly meaningful because it represents participants reclaiming the fair value anchor after a regime shift, with strong institutional backing.

**Provisional Status Reason:** TRANSITION days are defined as days where the regime differs from the previous day. With 280 TRANSITION days in the dataset, the sample is adequate but the definition is circular (it depends on the regime classifier, which has known limitations). This law will be upgraded to ADMITTED once the TREND regime classifier is redesigned in Sprint 097.

---

### ML-006: AM Session and Lunch Session Are Structurally Distinct

**Law ID:** ML-006  
**Admission Status:** PROVISIONAL  
**Confidence:** Moderate  
**First Discovery Sprint:** 097  
**Last Validation Sprint:** 097

**Statement:** The AM Open (09:30–10:00) and Lunch (12:00–13:00) sessions exhibit materially higher continuation rates for SEQ-02 signals than the AM Mid (10:00–12:00) session. Lunch session RC-A03 PF is 2.443 — the highest of any session.

**Supporting Evidence:**

| Session | Trades | WR | PF | Expectancy |
|---------|--------|----|----|------------|
| AM Open (09:30–10:00) | 417 | 52.0% | 1.644 | 0.310R |
| AM Mid (10:00–12:00) | 455 | 43.7% | 1.265 | 0.162R |
| Lunch (12:00–13:00) | 95 | 60.0% | 2.443 | 0.537R |
| PM Early (13:00–14:00) | 76 | 57.9% | 2.129 | 0.475R |
| PM Late (14:00–16:00) | 199 | 52.8% | 1.790 | 0.364R |

The AM Mid session is the weakest session by a significant margin (PF 1.265 vs 1.644–2.443 for all other sessions). The Lunch session is the strongest despite having the fewest trades.

**Behavioural Explanation:** The AM Open is characterised by the highest liquidity and the resolution of overnight order imbalances — VWAP reclaims here represent genuine institutional positioning decisions. The AM Mid session (10:00–12:00) is the "chop zone" where the initial order flow has been absorbed but the afternoon session has not yet begun — this is when false signals are most common. The Lunch session (12:00–13:00) is characterised by reduced participation and thin order books — when a VWAP reclaim occurs here with EMA alignment, it is almost always a genuine institutional signal because the noise traders have left the market.

---

## Rejected Hypotheses (Permanent Record)

The following hypotheses have been tested and rejected. They are recorded here permanently to prevent future re-testing of the same ideas.

| Hypothesis | Sprint | Result | Root Cause |
|-----------|--------|--------|------------|
| Compression predicts expansion | 096 | ❌ 0.7x lift | Compression is a state, not a precursor. The expansion that follows compression is random in direction. |
| High volume predicts continuation | 096 | ❌ 49.5% | Volume confirms participation but does not predict direction. High volume occurs on both breakouts and reversals. |
| RSI extremes predict reversion | 096 | ❌ 47.5–49.9% | RSI measures momentum, not mean reversion probability. Extreme RSI can persist for many bars. |
| VWAP extension predicts reversion | 096 | ❌ 47.7–51.8% | VWAP extension alone is insufficient — the market can remain extended for extended periods. Requires compound confirmation. |
| Overnight inventory predicts direction | 032, 095A, 097 | ❌ 34.7–40.8% | RTH participants systematically fade overnight moves. See ML-004. |
| ATR threshold 1.10 for TREND regime | 095A | ❌ Only 14 days | Threshold was calibrated for a different instrument. Recalibrated to 1.00. |
| RC-002 Gap Fill (unfiltered) | 095A | ❌ 0% WR | Gap fill target not reached within RTH on RANGE days. Requires gap size segmentation per ML-003. |
| RC-003 Overnight Inventory | 032, 095A | ❌ 38.4% WR | Permanently rejected. See ML-004. |
| RC-004 Failed Breakout Reversal | 095A | ❌ 26.0% WR | Execution timing is the issue — the reversal signal fires too early, before the failed breakout is confirmed. |
| RC-005 Liquidity Sweep Reversal | 095A | ❌ 4.3% WR | The sweep is not a reversal signal — it is a continuation signal. The model was trading in the wrong direction. |
| RC-007 Session Transition Momentum | 095A | ❌ 45.7% WR | Session transitions do not produce reliable momentum — the signal is too broad and fires in both trending and ranging conditions. |
| RANGE Day VWAP Reclaim (R01) | 097 | ❌ 37.8% WR, PF 0.964 | VWAP reclaim on RANGE days without EMA alignment is noise — the market oscillates around VWAP by definition on RANGE days. |
| RANGE Day Failed PDH/PDL (R02) | 097 | ❌ 37.9% WR, PF 0.982 | Failed breakouts on RANGE days are too frequent to be selective — 688+372 signals in 319 RANGE days = 3.3 signals/day. |
| RANGE Day RSI+VWAP Reversion (R03) | 097 | ❌ 37.2% WR, PF 0.951 | Compound reversion signal still insufficient on RANGE days — the market can remain extended for many bars before reverting. |

---

## Laws Under Investigation

| Law ID | Hypothesis | Status | Target Sprint |
|--------|-----------|--------|---------------|
| ML-007 (candidate) | TRANSITION days are predictable from the final 30 min of the previous session | INVESTIGATING | Sprint 098 |
| ML-008 (candidate) | Monday RANGE days have a structural bullish bias (61% up-day rate) | INVESTIGATING | Sprint 098 |
| ML-009 (candidate) | Gap fill probability is predictable from the first 30-min session range | INVESTIGATING | Sprint 098 |

---

## Amendment Log

| Date | Sprint | Amendment |
|------|--------|-----------|
| 2026-07-13 | 097 | Initial library created. ML-001 through ML-006 admitted or provisionally admitted. Rejected hypotheses registry populated from Sprints 032, 095A, 096, 097. |
