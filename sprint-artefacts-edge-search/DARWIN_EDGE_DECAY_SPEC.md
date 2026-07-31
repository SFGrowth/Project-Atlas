# DARWIN Edge Decay Specification

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

For every PROMISING or higher finding, DARWIN tracks rolling performance metrics to detect edge decay before it causes significant losses. Historical rejection is not permanent when materially new data appears. Retesting must be versioned and governed.

---

## 2. Tracked Metrics

For each PROMISING+ hypothesis, the `darwin_edge_decay_monitor` table records rolling windows:

| Metric | Description |
|---|---|
| rolling_expectancy | Net expectancy per trade after costs (rolling 60-day window) |
| rolling_win_rate | Win rate (rolling 60-day window) |
| rolling_profit_factor | Gross profit / gross loss (rolling 60-day window) |
| signal_frequency | Signals per trading day (rolling 30-day window) |
| mfe_avg | Average maximum favourable excursion (rolling 60-day window) |
| mae_avg | Average maximum adverse excursion (rolling 60-day window) |
| regime_mix | Distribution of regimes at signal time (rolling 60-day window) |
| session_mix | Distribution of sessions at signal time (rolling 60-day window) |
| cost_drift | Change in effective round-trip cost (rolling 30-day window) |
| slippage_drift | Change in realised slippage (rolling 30-day window) |
| ci_lower | 5th percentile bootstrap CI on rolling expectancy |
| ci_upper | 95th percentile bootstrap CI on rolling expectancy |
| prediction_interval_breaches | Count of rolling windows outside the prediction interval |

---

## 3. Decay Status Transitions

| Status | Condition |
|---|---|
| STABLE | All metrics within prediction interval; no material change |
| WATCH | One metric outside prediction interval; no action required |
| DEGRADED | Rolling expectancy < 0 OR two or more metrics outside prediction interval |
| RETIRED | Rolling expectancy persistently < 0 for 20+ trading days |

---

## 4. Notification Triggers

Phil is notified via Telegram when:

| Trigger | Message |
|---|---|
| Rolling expectancy turns negative | "EDGE DECAY ALERT: {hypothesis_id} rolling expectancy negative" |
| Signal frequency changes > 50% | "EDGE DECAY ALERT: {hypothesis_id} signal frequency changed materially" |
| Regime dependence changes | "EDGE DECAY ALERT: {hypothesis_id} regime mix shifted" |
| Costs invalidate the edge | "EDGE DECAY ALERT: {hypothesis_id} cost drift exceeds edge" |
| Confidence materially weakens | "EDGE DECAY ALERT: {hypothesis_id} CI lower bound crossed zero" |
| Shadow results diverge | "EDGE DECAY ALERT: {hypothesis_id} live shadow diverging from historical" |

**No automatic trading changes are made.** All notifications are informational only.

---

## 5. Retest Governance

When a REJECTED finding receives materially new evidence:

1. A new hypothesis is created with a new HYPOTHESIS_ID.
2. The parent_finding_id references the original rejected finding.
3. The reason for retesting is documented in mechanism_rationale.
4. The new hypothesis goes through the full pre-registration and validation pipeline.
5. The original rejected finding remains immutable.

Retesting must be versioned and governed. DARWIN must not repeat a failed research path unless new evidence materially changes the hypothesis.

---

## 6. Edge Emergence

DARWIN monitors for:

- Previously rejected conditions that now show positive expectancy in live data.
- Regime shifts that may activate dormant edges.
- New structural market changes (e.g. contract roll, volatility regime change).

Edge emergence is detected by the live observation engine and triggers a new hypothesis creation (source=F: Research Memory).
