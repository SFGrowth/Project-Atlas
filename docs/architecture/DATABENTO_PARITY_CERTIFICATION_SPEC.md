# Databento Parity Certification Specification
**Document type:** Architecture Reference  
**Sprint:** 123A.4  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`

---

## Purpose

This document defines the exact criteria that must be met before `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY` is activated at Gate G4. It specifies interval coverage, timestamp agreement tolerances, OHLC tick tolerances, volume comparison rules, feature agreement thresholds, behaviour agreement thresholds, excluded periods, roll handling, synthetic and unresolved bar handling, the composite parity formula, and the pass thresholds for each dimension.

The parity monitor (`server/market-data/parity-monitor.ts`) must implement this specification exactly. The daily parity report must include every metric defined here.

---

## Parity Comparison Sources

| Source | Table | Authority Mode |
|---|---|---|
| TradingView 5-min bars | `atlas_canonical_bars` (source = `tradingview`) | `TRADINGVIEW_ONLY` and `DATABENTO_SHADOW` |
| Databento 5-min bars | `atlas_bars_5m` | `DATABENTO_SHADOW` |

Comparison is performed at the 5-minute bar level. 1-minute bars are internal to the Databento pipeline and are not compared against TradingView directly.

---

## 1. Interval Coverage

**Definition:** The fraction of expected 5-minute trading intervals in the evaluation window for which both a TradingView bar and a Databento bar exist.

**Expected intervals:** All 5-minute intervals within regular trading hours (RTH: 09:30–16:00 ET) and extended hours (ETH: 18:00–17:00 ET next day) for MNQ, excluding scheduled exchange closures.

**Calculation:**

```
coverage = matched_intervals / expected_intervals
```

Where `matched_intervals` is the count of intervals for which both sources have a bar (after applying exclusions defined in §8).

**Pass threshold:** ≥ 99.5% coverage over the 5-day evaluation window.

**Failure action:** If coverage < 99.5%, the parity monitor logs each missing interval with the reason (TradingView gap, Databento gap, or both). Gate G4 is blocked until the cause is identified and resolved.

---

## 2. Timestamp Agreement

**Definition:** The fraction of matched intervals where the bar open timestamp from TradingView and Databento agree within the defined tolerance.

**Tolerance:** ±1 second (1000 ms). TradingView webhook timestamps may arrive slightly before or after the bar boundary due to network latency. Databento timestamps are exchange-timestamped and are the reference.

**Calculation:**

```
ts_agreement = intervals_within_tolerance / matched_intervals
```

**Pass threshold:** ≥ 99.9% of matched intervals within ±1 second.

**Failure action:** Intervals outside tolerance are logged with both timestamps and the delta. Systematic offsets (e.g., TradingView consistently 2 seconds late) are documented and may be excluded from scoring if they represent a known, stable, non-data-quality issue — but only with Phil's explicit approval.

---

## 3. OHLC Tick Tolerances

**Definition:** For each matched interval, the absolute difference between TradingView and Databento OHLC values, expressed in MNQ ticks (1 tick = 0.25 index points = $0.50).

**Tolerances:**

| Field | Tolerance | Rationale |
|---|---|---|
| Open | ±1 tick | TradingView open may differ by 1 tick due to first-trade timing |
| High | ±2 ticks | TradingView high may miss a brief spike not captured in the webhook |
| Low | ±2 ticks | Same as High |
| Close | ±1 tick | TradingView close may differ by 1 tick due to last-trade timing |

**Calculation (per field):**

```
ohlc_agreement[field] = intervals_within_tolerance[field] / matched_intervals
```

**Pass thresholds:**

| Field | Threshold |
|---|---|
| Open | ≥ 99.9% within ±1 tick |
| High | ≥ 99.5% within ±2 ticks |
| Low | ≥ 99.5% within ±2 ticks |
| Close | ≥ 99.9% within ±1 tick |

**Failure action:** Intervals outside tolerance are logged with both values and the delta in ticks. Intervals where the difference exceeds 10 ticks in any OHLC field are flagged as anomalies and escalated immediately regardless of the overall score.

---

## 4. Volume Comparison

**Definition:** The fraction of matched intervals where the volume from TradingView and Databento agree within the defined tolerance.

**Tolerance:** ±5% relative difference. TradingView volume may differ from Databento volume due to different trade aggregation methods.

**Calculation:**

```
volume_agreement = intervals_within_tolerance / matched_intervals
where: within_tolerance = abs(tv_volume - db_volume) / db_volume <= 0.05
```

**Pass threshold:** ≥ 95.0% of matched intervals within ±5%.

**Note:** Volume agreement has a lower threshold than OHLC because TradingView's volume calculation method is not identical to Databento's raw trade count. Systematic volume differences are documented and do not block Gate G4 if they are stable and explained.

**Failure action:** Intervals outside tolerance are logged. If the systematic volume difference is > 10%, the cause must be identified before Gate G4.

---

## 5. Feature Agreement

**Definition:** The fraction of matched intervals where derived features computed from TradingView bars and Databento bars agree within defined tolerances.

**Features compared:**

| Feature | Tolerance | Calculation |
|---|---|---|
| VWAP (session) | ±0.5 index points | Cumulative VWAP from session open |
| EMA-9 (close) | ±0.5 index points | 9-period EMA of close |
| EMA-21 (close) | ±0.5 index points | 21-period EMA of close |
| ATR-14 | ±0.25 index points | 14-period ATR |

**Calculation:**

```
feature_agreement[feature] = intervals_within_tolerance[feature] / matched_intervals
```

**Pass thresholds:** ≥ 99.0% for all features.

**Note:** Feature agreement is computed only for features that are currently used by production strategies (A1, A3, B1, SB1, ORB-1). Features not used by any production strategy are computed but do not contribute to the Gate G4 pass/fail decision.

---

## 6. Behaviour Agreement

**Definition:** The fraction of matched intervals where the canonical Behaviour Engine produces the same behaviour classification from TradingView bars and Databento bars.

**Scope:** All 12 canonical classifiers in `server/behaviour-engine/classifiers/`.

**Calculation:**

```
behaviour_agreement = intervals_same_classification / matched_intervals
```

Where `same_classification` means the set of detected behaviour IDs is identical for both sources.

**Pass threshold:** ≥ 95.0% agreement across all 12 classifiers.

**Note:** Behaviour agreement has a lower threshold than OHLC because classifiers may be sensitive to small OHLC differences. Classifiers that show systematic disagreement are documented and investigated. Disagreement does not block Gate G4 if it is explained by documented OHLC differences within tolerance.

**Failure action:** Intervals with disagreement are logged with the specific classifier IDs that differ and the OHLC values from both sources.

---

## 7. Excluded Periods

The following periods are excluded from all parity calculations. Excluded intervals are not counted in `expected_intervals` and do not affect any metric.

| Exclusion | Definition | Reason |
|---|---|---|
| Scheduled exchange closures | CME Globex scheduled maintenance windows and holidays | No trading occurs |
| Contract roll boundary bars | The 5-minute bar immediately before and after a detected contract roll | Bar construction is inherently different at roll boundaries |
| Synthetic no-trade bars | Bars flagged `SYNTHETIC_NO_TRADE_BAR` in `atlas_bars_5m` | TradingView does not generate a bar for no-trade minutes |
| Unresolved bars | Bars flagged `UNRESOLVED` or `containsUnresolvedMinutes=true` | Databento data is incomplete; comparison is not meaningful |
| TradingView webhook gaps | Intervals where the TradingView webhook did not deliver a bar within 30 seconds of the bar boundary | TradingView delivery failure; not a Databento data quality issue |
| Databento feed gaps | Intervals where Databento feed health was not `LIVE` | Databento data is incomplete |

All excluded intervals are logged in `atlas_parity_records` with the exclusion reason. The exclusion log is included in the daily parity report.

---

## 8. Roll Handling

Contract roll bars are excluded from parity scoring (see §7). However, the parity monitor must verify that:

1. The contract roll was detected by the Contract Roll Manager at the correct time
2. The post-roll Databento bars use the new contract's raw symbol and instrument_id
3. The post-roll TradingView bars are consistent with the new contract's price level

Roll verification results are logged in `atlas_contract_rolls` and included in the daily parity report. Roll handling failures are escalated immediately and block Gate G4.

---

## 9. Synthetic and Unresolved Bar Handling

**Synthetic no-trade bars** (`SYNTHETIC_NO_TRADE_BAR`): These bars are generated by the Databento bar builder for confirmed no-trade minutes. TradingView does not generate a bar for these intervals. They are excluded from parity scoring. The parity monitor logs every synthetic bar and verifies that TradingView also has no bar for the same interval. If TradingView has a bar for an interval where Databento generated a synthetic no-trade bar, this is an anomaly and must be escalated.

**Unresolved bars** (`UNRESOLVED`, `containsUnresolvedMinutes=true`): These bars are excluded from parity scoring. The parity monitor logs every unresolved bar. If an unresolved bar is later recovered (via live replay or Historical API), it is re-evaluated and the parity record is updated.

---

## 10. Composite Parity Formula and Pass Thresholds

The composite parity score is a weighted average of all dimension scores. The weights reflect the relative importance of each dimension to production strategy quality.

| Dimension | Weight | Pass Threshold | Blocking? |
|---|---|---|---|
| Interval coverage | 0.20 | ≥ 99.5% | Yes |
| Timestamp agreement | 0.15 | ≥ 99.9% | Yes |
| Open agreement | 0.10 | ≥ 99.9% | Yes |
| High agreement | 0.10 | ≥ 99.5% | Yes |
| Low agreement | 0.10 | ≥ 99.5% | Yes |
| Close agreement | 0.10 | ≥ 99.9% | Yes |
| Volume agreement | 0.05 | ≥ 95.0% | No |
| Feature agreement | 0.10 | ≥ 99.0% | No |
| Behaviour agreement | 0.10 | ≥ 95.0% | No |

**Composite formula:**

```
composite = (coverage × 0.20) + (ts_agreement × 0.15) + (open_agreement × 0.10) +
            (high_agreement × 0.10) + (low_agreement × 0.10) + (close_agreement × 0.10) +
            (volume_agreement × 0.05) + (feature_agreement × 0.10) + (behaviour_agreement × 0.10)
```

**Gate G4 pass criteria:**

1. Composite score ≥ 99.0% over the 5-day evaluation window
2. All blocking dimensions individually meet their pass thresholds
3. No anomaly flags (OHLC difference > 10 ticks, roll handling failure, synthetic bar mismatch) in the 5-day window
4. Zero `containsUnresolvedMinutes` bars dispatched to production consumers in the 5-day window

**If any blocking dimension fails:** Gate G4 is blocked regardless of the composite score. The failing dimension must be investigated and resolved before re-evaluation.

**If only non-blocking dimensions fail:** Gate G4 may proceed at Phil's discretion, with the failure documented and a remediation plan agreed.

---

## 11. Evaluation Window

**Duration:** 5 consecutive trading days (Monday–Friday, excluding CME holidays).

**Start condition:** The 5-day window begins only after all of the following are true:
- `DATABENTO_SHADOW` mode is active
- The Python feed service has been connected for at least 24 hours without interruption
- The parity monitor has been running for at least 24 hours
- No unresolved feed health incidents exist

**Reset condition:** If the Databento feed goes offline for more than 15 minutes during the 5-day window, the window resets. The parity monitor logs the reset reason.

---

## 12. Daily Parity Report Format

The daily parity report is appended to the DARWIN daily GitHub report. It must include:

1. Evaluation date and day number within the 5-day window
2. Total expected intervals
3. Total matched intervals
4. Total excluded intervals (with breakdown by exclusion reason)
5. All dimension scores (raw and weighted)
6. Composite score
7. Pass/fail status for each blocking dimension
8. Overall Gate G4 pass/fail status for this day
9. List of all anomaly flags
10. List of all contract roll events
11. List of all synthetic bars
12. List of all unresolved bars
13. Cumulative 5-day composite score (updated daily)

---

## 13. Evidence Location

All parity records are persisted to `atlas_parity_records`. The daily parity report is committed to `docs/evidence/parity/PARITY-{YYYY-MM-DD}.md`. The Gate G4 certification report is committed to `docs/evidence/GATE-G4-CERTIFICATION.md`.
