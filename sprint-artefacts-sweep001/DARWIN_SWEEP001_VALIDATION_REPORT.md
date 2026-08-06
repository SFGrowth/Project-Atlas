# DARWIN-SWEEP-001 — Validation Report

**Status:** COMPLETE  
**Result:** NEGATIVE_EDGE CONFIRMED (17/18 combinations) / 1 INCONCLUSIVE  
**Pre-registration SHA:** a3c6303d5d8c535d8567c35d413abcc5ce51aac6  
**Run date:** 2026-08-06  
**Experiment ID:** DARWIN-SWEEP-001

---

## Executive Summary

Entering in the direction of a liquidity sweep reclaim (fading the sweep of a prior RTH session high or low) on MNQ 5m bars is a **confirmed negative edge**. 17 of 18 pre-registered combinations returned NEGATIVE_EDGE; 1 returned INCONCLUSIVE (the borderline 0.3× tolerance, 15-bar hold, BASE cost case with p=0.148).

**Win rates range from 41.3% to 46.8%** — consistently below 50% across all tolerances, exits, and cost scenarios. The sweep-reclaim pattern does not produce a mean-reversion edge on a fixed-hold basis.

---

## Data

| Field | Value |
|-------|-------|
| Source | `mnq_5m_full_2019_2026.parquet` |
| Bars | 500,588 (after prior-session warmup) |
| Date range | 2019-05-06 to 2026-07-20 |
| Databento cost | $0.00 (already downloaded) |

---

## Signal Counts

| Tolerance | Sweep-High Signals | Sweep-Low Signals | Total |
|-----------|-------------------|-------------------|-------|
| 0.3× ATR14 | 3,837 | 2,996 | 6,833 |
| 0.5× ATR14 | 5,466 | 4,322 | 9,788 |
| 0.75× ATR14 | 6,652 | 5,318 | 11,970 |

---

## Full Results Table

| Tolerance | Exit | Hold | Cost | n | Mean Net (pts) | Win Rate | p-value | Classification |
|-----------|------|------|------|---|----------------|----------|---------|----------------|
| 0.3× | 1 | 5 bars | BASE | 6,833 | **−1.94** | 44.4% | <0.0001 | NEGATIVE_EDGE |
| 0.3× | 1 | 5 bars | STRESSED | 6,833 | **−2.56** | 42.7% | <0.0001 | NEGATIVE_EDGE |
| 0.3× | 1 | 5 bars | SEVERE | 6,833 | **−3.18** | 41.3% | <0.0001 | NEGATIVE_EDGE |
| 0.3× | 2 | 15 bars | BASE | 6,833 | **−1.07** | 46.8% | 0.1483 | **INCONCLUSIVE** |
| 0.3× | 2 | 15 bars | STRESSED | 6,833 | **−1.69** | 45.7% | 0.0224 | NEGATIVE_EDGE |
| 0.3× | 2 | 15 bars | SEVERE | 6,833 | **−2.31** | 44.8% | 0.0018 | NEGATIVE_EDGE |
| 0.5× | 1 | 5 bars | BASE | 9,788 | **−2.09** | 44.4% | <0.0001 | NEGATIVE_EDGE |
| 0.5× | 1 | 5 bars | STRESSED | 9,788 | **−2.71** | 42.6% | <0.0001 | NEGATIVE_EDGE |
| 0.5× | 1 | 5 bars | SEVERE | 9,788 | **−3.33** | 41.3% | <0.0001 | NEGATIVE_EDGE |
| 0.5× | 2 | 15 bars | BASE | 9,788 | **−1.46** | 46.6% | 0.0193 | NEGATIVE_EDGE |
| 0.5× | 2 | 15 bars | STRESSED | 9,788 | **−2.08** | 45.5% | 0.0009 | NEGATIVE_EDGE |
| 0.5× | 2 | 15 bars | SEVERE | 9,788 | **−2.70** | 44.8% | <0.0001 | NEGATIVE_EDGE |
| 0.75× | 1 | 5 bars | BASE | 11,970 | **−1.95** | 44.5% | <0.0001 | NEGATIVE_EDGE |
| 0.75× | 1 | 5 bars | STRESSED | 11,970 | **−2.57** | 42.8% | <0.0001 | NEGATIVE_EDGE |
| 0.75× | 1 | 5 bars | SEVERE | 11,970 | **−3.19** | 41.4% | <0.0001 | NEGATIVE_EDGE |
| 0.75× | 2 | 15 bars | BASE | 11,970 | **−1.34** | 46.5% | 0.0199 | NEGATIVE_EDGE |
| 0.75× | 2 | 15 bars | STRESSED | 11,970 | **−1.96** | 45.4% | 0.0007 | NEGATIVE_EDGE |
| 0.75× | 2 | 15 bars | SEVERE | 11,970 | **−2.58** | 44.7% | <0.0001 | NEGATIVE_EDGE |

---

## Key Observations

### 1. Win rates are consistently below 50%

Across all 18 combinations, win rates range from **41.3% to 46.8%**. The pattern does not produce a majority of winning trades in any configuration.

### 2. The one INCONCLUSIVE result is not actionable

The only non-NEGATIVE_EDGE result (0.3× tolerance, 15-bar hold, BASE cost, p=0.148) is borderline. The mean net return is still **−1.07 points per trade** — negative. It is INCONCLUSIVE only because the p-value does not cross 0.05, not because there is evidence of a positive edge. Under STRESSED and SEVERE costs, the same combination is NEGATIVE_EDGE.

### 3. The sweep-reclaim mechanism does not work as hypothesised

The competing explanation #2 was correct:

> *The pattern is noise. The reclaim is coincidental. The apparent reversal is just mean reversion to the session range that would occur regardless of the sweep.*

The data shows that after a sweep-reclaim, price is more likely to continue in the sweep direction (or chop) than to reverse cleanly. The stop-hunt narrative does not translate into a tradeable fixed-hold edge on MNQ 5m bars.

### 4. Consistency across tolerances

The result is stable across all three pre-registered tolerance variants (0.3×, 0.5×, 0.75× ATR14). This is not a parameter-sensitive artefact.

---

## DARWIN Doctrine Compliance

| Check | Status |
|-------|--------|
| Pre-registration before data examination | ✅ SHA a3c6303 committed first |
| Parameters frozen before run | ✅ No post-hoc changes |
| Honest reporting of negative result | ✅ |
| No strategy created from negative evidence | ✅ |
| Neighbourhood check passed | ✅ All 3 tolerances tested |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
| Live/paper trades initiated | 0 |
| Main merge | NOT PERFORMED |

---

## Research Family Status

**SWEEP research family:** NEGATIVE_EVIDENCE for simple fixed-hold sweep-reclaim on prior RTH session levels.

This does not permanently close the SWEEP family. A more refined hypothesis could test:
- Sweeps of **intraday** swing highs/lows (not just prior session levels)
- Sweeps with **volume confirmation** (absorption on the sweep bar)
- Sweeps in specific **time windows** (e.g., first 30 minutes of RTH only)

Any such refinement requires a new pre-registration.

---

## Next Recommended Experiment

Per DARWIN doctrine step 13:

> **DARWIN-VWAP-001:** Test whether MNQ 5m price that closes more than 1.5 ATR from VWAP and then closes back inside 0.5 ATR of VWAP on the next bar produces a mean-reversion edge. VWAP is a more dynamic anchor than session levels and is widely used by institutional participants as a fair-value reference. The reclaim of VWAP after an extended deviation has a plausible causal mechanism distinct from the session-level sweep.

Requires a new pre-registration before any data is examined.

---

## Authority Boundaries

```
DARWIN_DECISION_AUTHORITY  = DISABLED
DARWIN_EXECUTION_AUTHORITY = DISABLED
LIVE_TRADES_INITIATED      = 0
PAPER_TRADES_INITIATED     = 0
MAIN_MERGE_PERFORMED       = FALSE
CYCLE_003_RUN              = FALSE
```
