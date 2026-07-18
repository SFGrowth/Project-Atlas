# Databento Parity Certification Specification (Revision 5)
**Document type:** Authoritative Parity Specification  
**Sprint:** 123A  
**Revision:** 5  
**Status:** PENDING APPROVAL — Gate G0  
**Date:** 2026-07-18 (Revision 5: Correction 4 — Section A normalised composite formula with deterministic example; Revision 4: Correction 7 — MNQ parity units; Correction 8 — feed availability; Correction 3 — barOpenTsMs; Revision 3: Correction 5 applied — separated into Section A and Section B; Revision 2: unified threshold to 99.0%)  
**Authoritative source for:** All parity thresholds referenced in `SPRINT_123A_GATE_MATRIX.md`

> **This document is the sole authoritative source for all parity thresholds and certification criteria. No other document may restate these thresholds. The Gate Matrix references this document by revision number only.**

---

## Overview

Parity certification for Sprint 123A has two distinct and independent components.

**Section A — Databento Internal 1-Minute Feed Quality** measures the quality of the Databento pipeline itself: are 1-minute bars being constructed correctly, completely, and without errors? These metrics are measured entirely within the Databento pipeline (`atlas_bars_1m`). They do not compare against TradingView.

**Section B — TradingView vs Databento 5-Minute Cross-Feed Parity** measures agreement between TradingView's 5-minute bars (the current production authority, stored in `atlas_canonical_bars`) and Databento's derived 5-minute bars (`atlas_bars_5m`). This is the cross-feed comparison that certifies Databento is producing equivalent data to TradingView before Chart Authority is activated.

**Both Section A and Section B must pass before `DATABENTO_CHART_AUTHORITY` activation (Gate G4).** A Databento 1-minute bar is never directly compared with a TradingView 5-minute bar.

---

## Section A — Databento Internal 1-Minute Feed Quality

### A.1 Measurement Source

All Section A metrics are measured from `atlas_bars_1m`. This table is owned exclusively by the bar builder (`server/market-data/bar-builder.ts`). No TradingView data is involved in Section A.

### A.2 Evaluation Window

The evaluation window for Gate G4 is **5 consecutive trading days** during which Databento was active in `DATABENTO_SHADOW` mode. The window excludes the CME maintenance period (16:00–17:00 ET daily) and any periods where `MARKET_DATA_AUTHORITY` was not `DATABENTO_SHADOW` or higher.

### A.3 Section A Metrics

| Metric ID | Metric | Threshold | Gate |
|---|---|---|---|
| A-001 | **1-min interval coverage** | ≥ 99.0% of expected RTH/ETH intervals have a bar in `atlas_bars_1m` | G4 |
| A-002 | **Unresolved 1-min rate** | ≤ 0.5% of bars have `reconciliationStatus = UNRESOLVED` | G4 |
| A-003 | **Synthetic 1-min rate** | ≤ 1.0% of bars have `barType = SYNTHETIC` | G4 |
| A-004 | **Official ohlcv-1m reconciliation rate** | ≥ 99.0% of bars have `reconciliationStatus = MATCHED` | G4 |
| A-005 | **Duplicate 1-min rate** | ≤ 0.1% duplicate `(instrumentId, barOpenTsMs)` pairs | G4 |
| A-006 | **Out-of-order 1-min rate** | ≤ 0.1% of bars received out of order | G4 |
| A-007 | **Historical recovery rate** | ≥ 95.0% of UNRESOLVED bars recovered within 30 minutes via Historical API | G4 |
| A-008 | **Feed availability** | ≥ 99.0% of RTH/ETH minutes satisfy the feed-availability definition (see Section A.9) | G4 |
| A-009 | **Trade-active-minute rate** | Informational only — not a gate metric | — |

### A.4 MNQ Tick Size and Units

All OHLCV price comparisons use the following unit definitions:

| Unit | Definition |
|---|---|
| 1 tick | 0.25 index points |
| 1 index point | 4 ticks |
| Minimum price increment | 0.25 index points |
| Dollar value of 1 tick | $0.50 per contract |
| Dollar value of 1 index point | $2.00 per contract |

All tolerance thresholds in this document that reference "ticks" use this definition. "0.25 ticks" is not a valid unit — the minimum unit is 1 tick (0.25 index points). OHLC tolerances of 1 tick mean the two sources may differ by at most 0.25 index points.

### A.5 Section A Availability Gates

All three availability gates must pass before Section A metrics are evaluated:

| Gate | Condition |
|---|---|
| AA-1 | Feed availability (A-008) ≥ 99.0% |
| AA-2 | Maximum exclusion rate ≤ 2.0% of total expected intervals |
| AA-3 | Unresolved bar rate (A-002) ≤ 0.5% |

If any availability gate fails, Section A certification fails regardless of other metric values.

### A.6 RTH/ETH Interval Union for Section A

The denominator for Section A interval coverage is the union of all RTH and ETH 1-minute intervals during the evaluation window.

- **RTH:** 09:30–16:00 ET
- **ETH:** 18:00 ET (previous calendar day) to 09:29 ET
- **CME maintenance window excluded:** 16:00–17:00 ET daily
- **Scheduled closures excluded:** Confirmed exchange holidays and emergency halts

### A.7 Section A Exclusion Policy

| Category | In denominator? | In parity numerator? |
|---|---|---|
| CME maintenance window | No | No |
| Scheduled closure (holiday, emergency halt) | No | No |
| Feed outage (unplanned) | Yes | No |
| Unresolved bar | Yes | No |

### A.8 Section A Composite Score

The Section A composite score is the arithmetic mean of all Section A metric pass rates, where each metric is normalised to the range `[0.0, 1.0]` before averaging. This ensures that metrics with different threshold directions ("≥ threshold" vs "≤ threshold") contribute equally to the composite.

**Normalisation rule:**

| Metric direction | Normalised value |
|---|---|
| `≥ threshold` (e.g., A-001: coverage ≥ 99.0%) | `min(actual / threshold, 1.0)` |
| `≤ threshold` (e.g., A-002: unresolved ≤ 0.5%) | `min(threshold / actual, 1.0)` if `actual > 0`; `1.0` if `actual = 0` |

A normalised value of `1.0` means the metric exactly meets or exceeds its threshold. A value below `1.0` means the metric is below threshold.

**Composite formula:**

```
section_a_composite = (1/8) × (
  norm(A001) + norm(A002) + norm(A003) + norm(A004) +
  norm(A005) + norm(A006) + norm(A007) + norm(A008)
)
```

**Deterministic example:**

Given the following hypothetical metric values:

| Metric | Threshold | Actual | Direction | Normalised |
|---|---|---|---|---|
| A-001 | ≥ 99.0% | 99.5% | ≥ | `min(99.5/99.0, 1.0) = 1.0` |
| A-002 | ≤ 0.5% | 0.3% | ≤ | `min(0.5/0.3, 1.0) = 1.0` |
| A-003 | ≤ 1.0% | 0.8% | ≤ | `min(1.0/0.8, 1.0) = 1.0` |
| A-004 | ≥ 99.0% | 98.5% | ≥ | `min(98.5/99.0, 1.0) = 0.9949` |
| A-005 | ≤ 0.1% | 0.05% | ≤ | `min(0.1/0.05, 1.0) = 1.0` |
| A-006 | ≤ 0.1% | 0.0% | ≤ | `1.0` (actual = 0) |
| A-007 | ≥ 95.0% | 96.0% | ≥ | `min(96.0/95.0, 1.0) = 1.0` |
| A-008 | ≥ 99.0% | 99.2% | ≥ | `min(99.2/99.0, 1.0) = 1.0` |

`section_a_composite = (1/8) × (1.0 + 1.0 + 1.0 + 0.9949 + 1.0 + 1.0 + 1.0 + 1.0) = 0.9994 = 99.94%`

In this example, A-004 fails its individual threshold (98.5% < 99.0%). Despite the composite score being 99.94%, **Gate G4 fails** because A-004 did not individually pass. All metrics must individually pass their thresholds. A composite score ≥ 99.0% with any individual metric below threshold does not constitute a pass.

### A.9 Feed Availability Definition

A RTH/ETH minute is considered **feed-available** if the Atlas Databento pipeline received at least one record (trade, quote, or heartbeat) from the Databento live feed during that minute. A minute is considered **feed-unavailable** if:

- The TCP connection to Databento was not established for the full minute, **or**
- The Python feed service was not running for the full minute, **or**
- The WebSocket bridge was not connected for the full minute.

Feed availability (A-008) is the ratio of feed-available minutes to total expected RTH/ETH minutes in the evaluation window, after excluding the CME maintenance window and scheduled closures.

A minute with zero trades but a heartbeat record is considered feed-available. A minute with zero records of any kind is feed-unavailable.

---

## Section B — TradingView vs Databento 5-Minute Cross-Feed Parity

### B.1 Compared Sources

| Source | Table | Owner | Bar type |
|---|---|---|---|
| TradingView 5-min bars | `atlas_canonical_bars` | Canonical router (TradingView path) | Production authority |
| Databento-derived 5-min bars | `atlas_bars_5m` | Five-min aggregator | Shadow comparison |

Section B compares these two sources at the 5-minute level. **A Databento 1-minute bar is never directly compared with a TradingView 5-minute bar.** The five-min aggregator produces `atlas_bars_5m` by aggregating 5 confirmed and reconciled 1-minute bars from `atlas_bars_1m`.

### B.2 5-Minute Denominator

The denominator for all Section B interval coverage metrics is the set of expected 5-minute intervals within the RTH/ETH union during the evaluation window.

- **RTH:** 09:30–16:00 ET
- **ETH:** 18:00 ET (previous calendar day) to 09:29 ET
- **CME maintenance window excluded:** 16:00–17:00 ET daily
- **5-minute interval:** A 5-minute interval is included in the denominator if both sources were active during that interval. Intervals where either source was unavailable are excluded from both numerator and denominator.

### B.3 barOpenTsMs Definition

`barOpenTsMs` is the UTC **millisecond** timestamp of the 5-minute window boundary. It is defined as the floor of the first trade's `ts_event` (converted from nanoseconds to milliseconds at the feed-adapter boundary) to the nearest 5-minute boundary, expressed in UTC milliseconds. Two bars from different sources are considered the same interval if and only if their `barOpenTsMs` values are identical.

The raw Databento nanosecond value (`tsEventNs`) is preserved separately in `atlas_ticks` but is never used as a canonical identifier.

### B.4 Gate G4 Metrics (Core OHLCV + VWAP + EMA + ATR)

| Metric ID | Metric | Threshold | Gate |
|---|---|---|---|
| B-001 | **5-min interval coverage** | ≥ 99.0% of expected 5-min intervals have a Databento bar in `atlas_bars_5m` | G4 |
| B-002 | **barOpenTsMs agreement** | ≥ 99.9% of matched intervals have identical `barOpenTsMs` (UTC ms) | G4 |
| B-003 | **Open agreement** | ≥ 99.0% of matched intervals agree within 1 tick (0.25 index points) | G4 |
| B-004 | **High agreement** | ≥ 99.0% of matched intervals agree within 1 tick (0.25 index points) | G4 |
| B-005 | **Low agreement** | ≥ 99.0% of matched intervals agree within 1 tick (0.25 index points) | G4 |
| B-006 | **Close agreement** | ≥ 99.0% of matched intervals agree within 1 tick (0.25 index points) | G4 |
| B-007 | **Volume agreement** | ≥ 95.0% of matched intervals agree within 2.0% (dimensionless ratio) | G4 |
| B-008 | **VWAP agreement** | ≥ 99.0% of matched intervals agree within 2 ticks (0.50 index points) | G4 |
| B-009 | **EMA9 agreement** | ≥ 99.0% of matched intervals agree within 0.01% | G4 |
| B-010 | **EMA21 agreement** | ≥ 99.0% of matched intervals agree within 0.01% | G4 |
| B-011 | **ATR14 agreement** | ≥ 99.0% of matched intervals agree within 0.01% | G4 |

### B.5 Gate G6A Metrics (Extended Features — Optional)

These metrics are only required for Gate G6A (optional Learning Authority activation). They are not required for Gate G4.

| Metric ID | Metric | Threshold | Gate |
|---|---|---|---|
| B-012 | **RSI14 agreement** | ≥ 99.0% of matched intervals agree within 0.1 RSI units | G6A |
| B-013 | **ADX14 agreement** | ≥ 99.0% of matched intervals agree within 0.1 ADX units | G6A |
| B-014 | **Session agreement** | ≥ 99.0% of matched intervals have identical session classification | G6A |
| B-015 | **Regime agreement** | ≥ 99.0% of matched intervals have identical regime classification | G6A |

### B.6 Feature Agreement Aggregation

The feature agreement score is the arithmetic mean of all applicable per-feature agreement rates. A feature is excluded from the aggregation if it has fewer than 90% coverage in the evaluation window (i.e., features that require a minimum lookback period may be excluded for the first N bars of the evaluation window). Excluded features are listed in the daily parity report.

### B.7 Zero-Volume Bar Handling

A 5-minute bar with zero volume in the Databento source requires confirmation from the official Databento `ohlcv-1m` records for all five constituent 1-minute intervals. If all five 1-minute records also show zero volume, the bar is treated as a valid zero-volume bar and included in the comparison. If the official records are unavailable or show non-zero volume, the bar is classified as `UNRESOLVED` and excluded from the Section B denominator.

### B.8 Section B Availability Gates

All three availability gates must pass before Section B metrics are evaluated:

| Gate | Condition |
|---|---|
| BA-1 | 5-min interval coverage (B-001) ≥ 99.0% |
| BA-2 | Maximum exclusion rate ≤ 2.0% of total expected 5-min intervals |
| BA-3 | Unresolved bar rate ≤ 0.5% of total expected 5-min intervals |

### B.9 Section B Exclusion Policy

| Category | In denominator? | In parity numerator? |
|---|---|---|
| CME maintenance window | No | No |
| Scheduled closure (holiday, emergency halt) | No | No |
| Contract roll transition intervals | Yes | No |
| Synthetic bars (`barType = SYNTHETIC`) | Yes | Yes (if confirmed by ohlcv-1m) |
| Intervals where `containsUnresolvedMinutes = true` | Yes | No |
| Intervals where either source was unavailable | No | No |

### B.10 Section B Composite Score

The Section B composite score is the arithmetic mean of all Gate G4 metric pass rates (B-001 through B-011). All metrics must individually pass their thresholds. A composite score ≥ 99.0% with any individual metric below threshold does not constitute a pass.

The composite formula:

```
section_b_composite = (1/11) × (B001 + B002 + B003 + B004 + B005 + B006 + B007 + B008 + B009 + B010 + B011)
```

Note: B-002 (`barOpenTsMs`) has an individual threshold of 99.9% but is weighted equally in the composite. A composite score ≥ 99.0% does not waive the 99.9% individual threshold for B-002.

---

## Section C — Evaluation Window

### C.1 Gate G4 Window

The evaluation window for Gate G4 is **5 consecutive trading days** during which:
- `MARKET_DATA_AUTHORITY = DATABENTO_SHADOW`
- No declared exchange halts occurred that affected more than 10% of the expected intervals
- The Python feed service was active for ≥ 99.0% of the window

The 5-day window must be consecutive. A day is excluded from the window if feed availability (A-008) was below 95.0% for that day. If a day is excluded, the window resets and must be restarted.

### C.2 Gate G6A Window

The evaluation window for Gate G6A is **20 consecutive trading days** meeting the same conditions as Gate G4.

---

## Section D — Daily Parity Report Format

The parity monitor produces a daily report at 17:30 ET. The report is stored in `atlas_parity_reports` and committed to `docs/evidence/parity/PARITY-{YYYY-MM-DD}.md`.

```
ATLAS PARITY REPORT — {YYYY-MM-DD}
Authority mode: {MARKET_DATA_AUTHORITY}
Evaluation day: {N} of 5 (Gate G4 window)

SECTION A — DATABENTO 1-MIN FEED QUALITY
  A-001 1-min interval coverage:   {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  A-002 Unresolved 1-min rate:      {value}% (threshold: ≤0.5%)  [{PASS|FAIL}]
  A-003 Synthetic 1-min rate:       {value}% (threshold: ≤1.0%)  [{PASS|FAIL}]
  A-004 ohlcv-1m reconciliation:   {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  A-005 Duplicate rate:             {value}% (threshold: ≤0.1%)  [{PASS|FAIL}]
  A-006 Out-of-order rate:          {value}% (threshold: ≤0.1%)  [{PASS|FAIL}]
  A-007 Historical recovery rate:   {value}% (threshold: ≥95.0%) [{PASS|FAIL}]
  A-008 Feed availability:          {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  Section A composite:              {value}% [{PASS|FAIL}]
  Exclusions: {N} intervals excluded ({categories})

SECTION B — TRADINGVIEW vs DATABENTO 5-MIN PARITY
  B-001 5-min interval coverage:   {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-002 barOpenTsMs agreement:      {value}% (threshold: ≥99.9%) [{PASS|FAIL}]
  B-003 Open agreement:             {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-004 High agreement:             {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-005 Low agreement:              {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-006 Close agreement:            {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-007 Volume agreement:           {value}% (threshold: ≥95.0%) [{PASS|FAIL}]
  B-008 VWAP agreement:             {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-009 EMA9 agreement:             {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-010 EMA21 agreement:            {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  B-011 ATR14 agreement:            {value}% (threshold: ≥99.0%) [{PASS|FAIL}]
  Section B composite:              {value}% [{PASS|FAIL}]
  Exclusions: {N} intervals excluded ({categories})

GATE G4 STATUS: {PASS|FAIL|PENDING}
  Days passed: {N} of 5 required consecutive days
  Note: Both Section A and Section B must pass for a day to count.
```

---

## Section E — Gate G4 Pass Conditions

Gate G4 passes when **all** of the following are true:

1. Section A availability gates AA-1, AA-2, AA-3 all pass.
2. All Section A metrics (A-001 through A-008) individually pass their thresholds.
3. Section A composite score ≥ 99.0%.
4. Section B availability gates BA-1, BA-2, BA-3 all pass.
5. All Section B Gate G4 metrics (B-001 through B-011) individually pass their thresholds.
6. Section B composite score ≥ 99.0%.
7. Conditions 1–6 are satisfied for **5 consecutive trading days**.
8. Phil reviews the 5-day parity report and approves in writing.

No individual metric may be waived. If any metric fails on any day, the 5-day window resets.

---

## Section F — Gate G6A Pass Conditions (Optional)

Gate G6A passes when **all** of the following are true:

1. Gate G4 has been passed.
2. All Gate G4 conditions continue to be satisfied.
3. All Section B Gate G6A metrics (B-012 through B-015) individually pass their thresholds.
4. Conditions 1–3 are satisfied for **20 consecutive trading days**.
5. Phil explicitly approves `DATABENTO_LEARNING_AUTHORITY` activation in writing.

---

## Section G — Roll Handling

During a contract roll transition, the intervals containing the roll are excluded from Section B metrics. Roll handling is defined in `DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md`. The parity report must identify all roll exclusions by date and interval.

---

## Section H — Pass Threshold Summary

All thresholds in this table are the authoritative source. The Gate Matrix references this document by revision number and does not restate these values.

| Metric | Section | Gate G4 threshold | Gate G6A threshold |
|---|---|---|---|
| 1-min interval coverage | A | ≥ 99.0% | ≥ 99.0% |
| Unresolved 1-min rate | A | ≤ 0.5% | ≤ 0.5% |
| Synthetic 1-min rate | A | ≤ 1.0% | ≤ 1.0% |
| ohlcv-1m reconciliation rate | A | ≥ 99.0% | ≥ 99.0% |
| Duplicate rate | A | ≤ 0.1% | ≤ 0.1% |
| Out-of-order rate | A | ≤ 0.1% | ≤ 0.1% |
| Historical recovery rate | A | ≥ 95.0% | ≥ 95.0% |
| Feed availability | A | ≥ 99.0% | ≥ 99.0% |
| Section A composite | A | ≥ 99.0% | ≥ 99.0% |
| 5-min interval coverage | B | ≥ 99.0% | ≥ 99.0% |
| barOpenTsMs agreement | B | ≥ 99.9% | ≥ 99.9% |
| Open agreement | B | ≥ 99.0% | ≥ 99.0% |
| High agreement | B | ≥ 99.0% | ≥ 99.0% |
| Low agreement | B | ≥ 99.0% | ≥ 99.0% |
| Close agreement | B | ≥ 99.0% | ≥ 99.0% |
| Volume agreement | B | ≥ 95.0% | ≥ 95.0% |
| VWAP agreement | B | ≥ 99.0% | ≥ 99.0% |
| EMA9 agreement | B | ≥ 99.0% | ≥ 99.0% |
| EMA21 agreement | B | ≥ 99.0% | ≥ 99.0% |
| ATR14 agreement | B | ≥ 99.0% | ≥ 99.0% |
| Section B composite | B | ≥ 99.0% | ≥ 99.0% |
| RSI14 agreement | B | N/A | ≥ 99.0% |
| ADX14 agreement | B | N/A | ≥ 99.0% |
| Session agreement | B | N/A | ≥ 99.0% |
| Regime agreement | B | N/A | ≥ 99.0% |
| Max exclusion rate | A+B | ≤ 2.0% | ≤ 2.0% |
| Evaluation window | — | ≥ 5 trading days | ≥ 20 trading days |

---

## Section I — Revision History

| Revision | Date | Changes |
|---|---|---|
| Rev 1 | 2026-07-18 | Initial version |
| Rev 2 | 2026-07-18 | Unified threshold to 99.0%; added availability gates; max exclusion rate; RTH/ETH union; barOpenTs; zero-volume; feature agreement aggregation; RSI/ADX/Session/Regime as G6A requirements |
| Rev 3 | 2026-07-18 | Correction 5: separated into Section A (Databento 1-min feed quality, measured from atlas_bars_1m only) and Section B (TradingView vs Databento 5-min cross-feed parity, comparing atlas_canonical_bars vs atlas_bars_5m); defined 5-min denominator explicitly; clarified that 1-min bars are never directly compared with TradingView 5-min bars; both sections must pass for Gate G4 |
| Rev 4 | 2026-07-18 | Correction 3: renamed `barOpenTs` to `barOpenTsMs` throughout; added timestamp unit standard reference. Correction 7: added MNQ tick size and units table (Section A.4); corrected OHLC tolerances from "0.25 ticks" to "1 tick (0.25 index points)"; corrected VWAP tolerance from "0.5 ticks" to "2 ticks (0.50 index points)". Correction 8: added explicit feed availability definition (Section A.9); added A-009 informational trade-active-minute metric |
