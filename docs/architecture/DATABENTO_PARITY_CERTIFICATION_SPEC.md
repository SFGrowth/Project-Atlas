# Databento Parity Certification Specification (Revision 2)
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18 (Revision 2: Corrections 1, 7, 8 applied — authoritative threshold unified to 99.0%; availability gates and max exclusion rate added; RTH/ETH union, barOpenTs, zero-volume, feature_agreement aggregation, RSI/ADX/session/regime parity defined)  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`  
**Gate reference:** Gate G4 (Parity Certification), Gate G6A (Optional Learning Authority Activation)

---

## Purpose

This specification defines the exact criteria, formulas, tolerances, exclusion rules, and reporting requirements for certifying that Databento-sourced bars are sufficiently accurate to be trusted as the canonical market data source for Atlas Nexus.

**Authoritative threshold:** All composite parity scores and individual metric thresholds in this document are the single authoritative source. The Gate Matrix (`SPRINT_123A_GATE_MATRIX.md`) references this document by revision number and does not restate thresholds independently. Where any other document states a different threshold, this document takes precedence.

---

## Section 1 — Evaluation Window

**Gate G4 minimum duration:** 5 consecutive trading days during which the Databento feed was active in `DATABENTO_SHADOW` mode.

**Gate G6A minimum duration:** 20 consecutive trading days.

**Maximum gap tolerance:** No more than 2 consecutive days of feed unavailability within the evaluation window. If a gap exceeds 2 consecutive days, the evaluation window restarts from zero.

**Excluded periods:** The evaluation window must not include a contract roll boundary. If a roll occurs during the window, the window restarts from the day after the roll.

**Session coverage:** The evaluation window must include at least one full RTH session and at least one full ETH session.

---

## Section 2 — Interval Coverage

**Definition:** The proportion of expected 1-minute intervals within the evaluation window for which a Databento bar exists in `atlas_bars_1m`.

**RTH/ETH interval union:** The denominator is the union of all RTH and ETH intervals during the evaluation window. RTH is defined as 09:30–16:00 ET. ETH is defined as 18:00 ET (previous day) to 09:29 ET. The CME maintenance window (16:00–17:00 ET) is excluded from the denominator. Intervals during confirmed scheduled closures (holidays, emergency halts) are excluded from the denominator.

**Formula:**

```
interval_coverage = available_intervals / expected_intervals
```

Where `expected_intervals` is the count of 1-minute intervals in the RTH/ETH union for the evaluation window, excluding maintenance windows and scheduled closures. `available_intervals` is the count of intervals for which a Databento bar exists (of any `barType`).

**Pass threshold:** `interval_coverage ≥ 0.990` (99.0%)

**Availability gate:** If `interval_coverage < 0.990`, Gate G4 fails regardless of all other metrics. Source outages that cause missing intervals are counted in the denominator and must not be excluded without separate blocking availability metrics (see Section 7).

---

## Section 3 — Timestamp Agreement

**Definition:** The proportion of matched bar pairs where the Databento `barOpenTs` agrees with the TradingView bar open timestamp within the defined tolerance.

**barOpenTs comparison:** The Databento `barOpenTs` is the UTC nanosecond timestamp of the 1-minute window boundary (i.e., the floor of `ts_event` to the minute). The TradingView bar open timestamp is the Unix timestamp of the bar open as received in the webhook payload, converted to UTC nanoseconds. Both are compared in UTC. The tolerance is ±1 second (1,000,000,000 nanoseconds).

**Formula:**

```
timestamp_agreement = matching_timestamps / total_matched_pairs
```

Where `matching_timestamps` is the count of pairs where `|databento_barOpenTs - tradingview_barOpenTs| ≤ 1,000,000,000 ns`.

**Pass threshold:** `timestamp_agreement ≥ 0.999` (99.9%)

**Anomaly flag:** Timestamp disagreements exceeding 5 seconds are flagged as anomalies, logged separately, and escalated regardless of the overall score.

---

## Section 4 — OHLC Tick Tolerances

Each OHLC field is compared independently. MNQ tick size is 0.25 index points.

| Field | Tolerance | Rationale |
|---|---|---|
| Open | ±1 tick (0.25 pts) | First trade price; minor rounding differences expected |
| High | ±1 tick (0.25 pts) | Max trade price within window |
| Low | ±1 tick (0.25 pts) | Min trade price within window |
| Close | ±1 tick (0.25 pts) | Last trade price; minor rounding differences expected |

**Per-field agreement formula:**

```
field_agreement = matching_field_pairs / total_matched_pairs
```

Where `matching_field_pairs` is the count of pairs where `|databento_field - tradingview_field| ≤ 0.25` (1 tick).

**Pass threshold (each field independently):** `field_agreement ≥ 0.990` (99.0%)

All four fields must pass independently. A bar where any single OHLC field disagrees beyond tolerance is counted as a discrepancy for that field. Disagreements exceeding 10 ticks in any field are flagged as anomalies and escalated immediately.

---

## Section 5 — Volume Comparison

**Definition:** The proportion of matched bar pairs where the Databento volume agrees with the TradingView volume within the defined tolerance.

**Zero-volume comparison:** Zero-volume bars require special handling. A Databento bar with zero volume is only considered a match for a TradingView zero-volume bar if the Databento `ohlcv-1m` record for the same interval also shows zero volume. A zero-volume Databento bar without `ohlcv-1m` confirmation is treated as `UNRESOLVED` and excluded from the volume comparison denominator (but counted in the availability denominator per Section 7).

**Tolerance:** ±5% of TradingView volume, or ±10 contracts (whichever is larger). This accommodates the difference between trade-aggregated volume and bar-reported volume.

**Formula:**

```
volume_agreement = matching_volume_pairs / total_matched_pairs
```

Where `matching_volume_pairs` is the count of pairs where `|databento_volume - tradingview_volume| / max(tradingview_volume, 1) ≤ 0.05` OR `|databento_volume - tradingview_volume| ≤ 10`.

**Pass threshold:** `volume_agreement ≥ 0.950` (95.0%)

---

## Section 6 — Feature Agreement

**Definition:** The proportion of matched bar pairs where computed features agree within tolerance.

**Feature agreement aggregation:** Feature agreement is computed per feature, then aggregated as the arithmetic mean of all per-feature agreement rates. A feature is included in the aggregation only if it is computed for ≥90% of bars in the evaluation window (i.e., features that require a minimum lookback period may be excluded for the first N bars of the evaluation window). The aggregated `feature_agreement` score is the arithmetic mean of all included per-feature rates.

**Features required for Gate G4 (implementation certification):**

| Feature | Tolerance | Lookback | Notes |
|---|---|---|---|
| VWAP | ±2 ticks (0.50 pts) | Session start | Computed from OHLCV; minor floating-point differences expected |
| EMA9 | ±1 tick (0.25 pts) | ≥9 bars | Exponential moving average of close |
| EMA21 | ±1 tick (0.25 pts) | ≥21 bars | Exponential moving average of close |
| ATR14 | ±2 ticks (0.50 pts) | ≥14 bars | Average True Range |

**Additional features required for Gate G6A (Learning Authority Activation):**

| Feature | Tolerance | Lookback | Notes |
|---|---|---|---|
| RSI14 | ±2.0 RSI points | ≥14 bars | Relative Strength Index |
| ADX14 | ±2.0 ADX points | ≥14 bars | Average Directional Index |
| Session | Exact match | N/A | RTH / ETH / OVERNIGHT classification |
| Regime | Exact match | N/A | TRENDING / RANGING / VOLATILE classification |

**Formula:**

```
feature_agreement = (1/N) × Σ(per_feature_agreement_i)
```

Where N is the count of features included in the aggregation for the evaluation window.

**Pass threshold (Gate G4):** `feature_agreement ≥ 0.990` (99.0%), computed over the 4 Gate G4 features.

**Pass threshold (Gate G6A):** Each of the 8 features (4 Gate G4 + RSI14, ADX14, Session, Regime) must individually pass `≥ 0.990` (99.0%).

---

## Section 7 — Availability Gates and Maximum Exclusion Rate

Source outages must not disappear from the denominator. This section defines separate blocking availability metrics that prevent parity scores from being inflated by excluding outage periods.

**Availability metrics — all three are blocking for Gate G4:**

| Metric | Formula | Pass threshold |
|---|---|---|
| Feed availability | `available_intervals / expected_intervals` | ≥ 99.0% |
| Maximum exclusion rate | `excluded_intervals / expected_intervals` | ≤ 2.0% |
| Unresolved bar rate | `unresolved_bars / expected_intervals` | ≤ 0.5% |

Where `excluded_intervals` is the count of intervals excluded from parity calculations for any reason other than scheduled closures and maintenance windows.

**Exclusion categories and their treatment:**

| Exclusion category | In denominator? | In parity numerator? | Notes |
|---|---|---|---|
| Contract roll boundary | Yes | No | Excluded from parity; counted in availability denominator |
| Scheduled closure (holiday) | No | No | Excluded from both |
| CME maintenance window | No | No | Excluded from both |
| Feed outage (unplanned) | Yes | No | Counted in denominator; reduces availability score |
| Synthetic no-trade bar (confirmed by ohlcv-1m) | Yes | Yes | Included in parity; must match TradingView zero-volume bar |
| Unresolved bar | Yes | No | Counted in denominator; reduces availability score |

**Maximum exclusion rate:** The total proportion of expected intervals excluded from parity calculations (for any reason other than scheduled closures and maintenance windows) must not exceed 2.0%. If the exclusion rate exceeds 2.0%, Gate G4 fails regardless of the parity composite score.

---

## Section 8 — Roll Handling

During a contract roll, the following rules apply.

The roll boundary is defined as the 5-minute window containing the `SymbolMappingMsg` record. All 1-minute bars within this 5-minute window are excluded from parity calculations. The exclusion is logged with `exclusionReason = CONTRACT_ROLL`.

After the roll, parity comparison resumes using the new contract's bars. The TradingView continuous contract is expected to seamlessly continue; the Databento new contract bars are matched against TradingView bars by timestamp.

The parity monitor must verify that the Contract Roll Manager detected the roll at the correct time and that post-roll Databento bars use the new contract's raw symbol and `instrument_id`. Roll handling failures are escalated immediately and block Gate G4.

---

## Section 9 — Synthetic and Unresolved Bar Handling

**Synthetic no-trade bars** (`barType = SYNTHETIC_NO_TRADE_BAR`) are included in parity calculations only when confirmed by a Databento `ohlcv-1m` record showing zero volume. A confirmed synthetic bar is compared against the TradingView bar for the same interval. If TradingView also shows zero volume, the bar is counted as a match. If TradingView shows non-zero volume, the bar is counted as a discrepancy and escalated.

**Unresolved bars** (`barType = UNRESOLVED`) are excluded from parity calculations but counted in the availability denominator. An unresolved bar that is later resolved by Historical API backfill is reclassified and included in parity calculations from the next daily report.

**Synthetic bar feature contamination:** Features computed from synthetic bars must not be used in the feature agreement calculation. If a synthetic bar falls within the lookback window of a feature, the feature value for the bar immediately following the synthetic bar is excluded from the feature agreement calculation. This prevents synthetic OHLCV values from contaminating feature computations.

---

## Section 10 — Composite Formula and Weights

The composite parity score is computed as a weighted average of the individual metric scores.

| Component | Weight | Metric |
|---|---|---|
| Interval coverage | 0.20 | `interval_coverage` |
| Timestamp agreement | 0.10 | `timestamp_agreement` |
| Open agreement | 0.10 | `open_agreement` |
| High agreement | 0.10 | `high_agreement` |
| Low agreement | 0.10 | `low_agreement` |
| Close agreement | 0.10 | `close_agreement` |
| Volume agreement | 0.10 | `volume_agreement` |
| Feature agreement | 0.20 | `feature_agreement` |
| **Total** | **1.00** | — |

**Formula:**

```
composite_score = 0.20 × interval_coverage
               + 0.10 × timestamp_agreement
               + 0.10 × open_agreement
               + 0.10 × high_agreement
               + 0.10 × low_agreement
               + 0.10 × close_agreement
               + 0.10 × volume_agreement
               + 0.20 × feature_agreement
```

**Gate G4 pass condition:** `composite_score ≥ 0.990` AND all individual metrics pass their thresholds AND all three availability gates pass AND no anomaly flags in the evaluation window.

**Gate G6A pass condition:** `composite_score ≥ 0.990` AND all individual metrics pass their thresholds AND all three availability gates pass AND all 8 features individually pass `≥ 0.990` AND the evaluation window spans ≥20 trading days.

---

## Section 11 — Pass Thresholds Summary

All thresholds in this table are the authoritative source. The Gate Matrix references this document by revision number and does not restate these values.

| Metric | Gate G4 threshold | Gate G6A threshold |
|---|---|---|
| Interval coverage | ≥ 99.0% | ≥ 99.0% |
| Timestamp agreement | ≥ 99.9% | ≥ 99.9% |
| Open agreement | ≥ 99.0% | ≥ 99.0% |
| High agreement | ≥ 99.0% | ≥ 99.0% |
| Low agreement | ≥ 99.0% | ≥ 99.0% |
| Close agreement | ≥ 99.0% | ≥ 99.0% |
| Volume agreement | ≥ 95.0% | ≥ 95.0% |
| Feature agreement (VWAP, EMA9, EMA21, ATR14) | ≥ 99.0% | ≥ 99.0% |
| Feature agreement (RSI14, ADX14, Session, Regime) | N/A | ≥ 99.0% each |
| Composite score | ≥ 99.0% | ≥ 99.0% |
| Feed availability | ≥ 99.0% | ≥ 99.0% |
| Maximum exclusion rate | ≤ 2.0% | ≤ 2.0% |
| Unresolved bar rate | ≤ 0.5% | ≤ 0.5% |
| Evaluation window | ≥ 5 trading days | ≥ 20 trading days |

---

## Section 12 — Daily Report Format

The parity monitor produces a daily report at 17:30 ET (after RTH close). The report is stored in `atlas_parity_reports` and committed to `docs/evidence/parity/PARITY-{YYYY-MM-DD}.md`.

**Required fields in each daily report:**

| Field | Type | Description |
|---|---|---|
| `reportDate` | `YYYY-MM-DD` | Date of the report (ET) |
| `evaluationWindowDays` | integer | Number of trading days in the rolling evaluation window |
| `expectedIntervals` | integer | Total expected 1-minute intervals (RTH/ETH union, excl. maintenance and closures) |
| `availableIntervals` | integer | Intervals with a Databento bar |
| `excludedIntervals` | integer | Intervals excluded from parity (with breakdown by category) |
| `unresolvedIntervals` | integer | Intervals with `UNRESOLVED` bars |
| `intervalCoverage` | float | `available_intervals / expected_intervals` |
| `exclusionRate` | float | `excluded_intervals / expected_intervals` |
| `unresolvedRate` | float | `unresolved_intervals / expected_intervals` |
| `feedAvailability` | float | Availability gate metric |
| `timestampAgreement` | float | Proportion of matched pairs within ±1s |
| `openAgreement` | float | Proportion within ±1 tick |
| `highAgreement` | float | Proportion within ±1 tick |
| `lowAgreement` | float | Proportion within ±1 tick |
| `closeAgreement` | float | Proportion within ±1 tick |
| `volumeAgreement` | float | Proportion within ±5% or ±10 contracts |
| `featureAgreement` | float | Arithmetic mean of per-feature agreements |
| `featureBreakdown` | object | Per-feature agreement rates (VWAP, EMA9, EMA21, ATR14, and G6A features when available) |
| `compositeScore` | float | Weighted composite per Section 10 |
| `gate4Pass` | boolean | True if all Gate G4 thresholds met for this day |
| `gate6aPass` | boolean | True if all Gate G6A thresholds met (requires 20-day window) |
| `availabilityGatePass` | boolean | True if all three availability gates pass |
| `discrepancyCount` | integer | Total bar pairs with any discrepancy |
| `discrepancyBreakdown` | object | Discrepancy counts by field and category |
| `anomalyFlags` | array | List of anomaly events (timestamp > 5s, OHLC > 10 ticks, synthetic mismatch) |
| `rollEvents` | array | Contract roll events in this day |
| `syntheticBars` | array | Synthetic no-trade bars in this day |
| `unresolvedBars` | array | Unresolved bars in this day |
| `cumulativeComposite` | float | Rolling composite score over the full evaluation window |
| `notes` | string | Any additional anomalies or manual exclusions |

---

## Section 13 — Evidence Requirements

**Before Gate G4 can be approved:**

1. `docs/evidence/parity/PARITY-{date}.md` — daily report files for each day in the evaluation window (≥5 files)
2. `docs/evidence/PARITY-SUMMARY.md` — human-readable summary of the evaluation window
3. `docs/evidence/PARITY-ANOMALIES.md` — list of all anomalies, discrepancies, and manual exclusions
4. `docs/evidence/TEST-INT-001-result.md` — confirmed Databento symbol for MNQ front-month
5. `docs/evidence/TEST-INT-002-result.md` — confirmed live connection and record receipt

**Before Gate G6A can be approved:**

6. `docs/evidence/parity/PARITY-{date}.md` — daily report files for ≥20 consecutive trading days
7. `docs/evidence/BEHAVIOUR-AGREEMENT-SUMMARY.md` — behaviour agreement analysis per `BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md`
8. `docs/evidence/FEATURE-PARITY-RSI-ADX-SESSION-REGIME.md` — per-feature agreement for RSI14, ADX14, Session, and Regime
