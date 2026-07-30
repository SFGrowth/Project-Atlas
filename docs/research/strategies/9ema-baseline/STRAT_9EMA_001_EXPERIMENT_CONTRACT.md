# STRAT-9EMA-001 — 9EMA Crossover Baseline Experiment Contract
## Pre-Registration Document (committed before any results are computed)
**Sprint:** 123A.14 | **Gate:** G14 | **Date:** 2026-07-30

---

## 1. Research Question

**DOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE?**

Does the 9/21 EMA crossover strategy on MNQ 15-minute bars, filtered by the 50 EMA and 1-hour trend, produce a positive expectancy after realistic execution costs across the available historical dataset?

This is a baseline test only. No optimisation is permitted before the baseline result is computed. The exact rules stated in the source (Instagram @profitwpurpose) are preserved verbatim. Assumptions for unspecified parameters are documented below and locked before execution.

---

## 2. Source Rules (verbatim)

**Source:** https://www.instagram.com/reel/DbV_ta3MWXe/ (@profitwpurpose, verified)
**Extracted:** 2026-07-30

- Chart: 15 minutes
- Trend filter: 1 hour
- EMAs: 9, 21, and 50
- **Long:** 9 EMA crosses above 21 EMA, AND price is above the 50 EMA
- **Short:** 9 EMA crosses below 21 EMA, AND price is below the 50 EMA
- Only take the trade if:
  1. The crossover candle has closed
  2. The price is moving in the same direction as the 1-hour trend
  3. There is enough momentum (avoid flat or sideways markets)

---

## 3. Pre-Registered Assumptions (for unspecified parameters)

| Parameter | Assumption | Rationale |
|---|---|---|
| **Stop placement** | Low of the crossover candle (long) / High of the crossover candle (short) | Most common assumption for EMA crossover strategies; preserves the candle structure |
| **1H trend definition** | Price above 1H 50 EMA = bullish; price below 1H 50 EMA = bearish | Simplest, most common definition; avoids circular dependency on 1H 9/21 cross |
| **Momentum filter** | ADX(14) > 20 on 15m chart | Standard ADX threshold for "trending" vs "flat" market; directly measurable |
| **Session filter** | RTH only (09:30–16:00 ET = 13:30–20:00 UTC) | MNQ primary session; avoids thin overnight markets |
| **Entry price** | Next bar open after crossover candle closes | Standard next-bar-open execution; no same-bar entry |
| **Slippage** | 2 ticks adverse (0.50 pts) per side | Consistent with Atlas Nexus standard cost model |
| **Commission** | $1.24 round-trip | Consistent with Atlas Nexus standard cost model |
| **MNQ tick value** | $0.50 per tick, $2.00 per point | Standard MNQ contract specification |

---

## 4. Three Exit Variants (all tested simultaneously, no cherry-picking)

| Variant | Exit Rule | Rationale |
|---|---|---|
| **EXIT_1R** | Target = 1× stop distance from entry; stop = crossover candle low/high | Symmetric risk-reward |
| **EXIT_2R** | Target = 2× stop distance from entry; stop = crossover candle low/high | Higher R-multiple |
| **EXIT_XO** | Exit on opposite 9/21 EMA crossover (no fixed target); stop = crossover candle low/high | Signal-based exit as implied by the strategy's own logic |

All three variants are tested. The primary variant for the DOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE answer is the one with the highest expectancy, provided it passes the statistical gate. If none pass, the answer is NO.

---

## 5. Dataset

| Field | Value |
|---|---|
| **Source** | Databento GLBX.MDP3 OHLCV-1m, downloaded and processed 2026-07-24 |
| **Canonical file** | `/home/ubuntu/atlas-historical/canonical/mnq_15m_features.parquet` |
| **Canonical SHA256** | `2ead29bdf764d33a7215a80f184e7d03da65fbd802db3b5e5676f3d643683cb2` |
| **Date range** | 2024-01-01 to 2026-07-20 (2.55 years) |
| **Total 15m bars** | 60,138 |
| **1H filter source** | `/home/ubuntu/atlas-historical/canonical/mnq_1m_features.parquet` resampled to 1H at runtime |
| **Instrument** | MNQ continuous (front-month roll) |

**Note on dataset start date:** The canonical dataset starts 2024-01-01 due to the prior sprint's download scope. The mandate specifies MNQ history from 2019-05-06. A full 7-year download is planned for Sprint 123A.15. This baseline test uses the available 2.5-year dataset. The result will be clearly labelled `DATASET_PERIOD: 2024-01-01 to 2026-07-20`.

---

## 6. Train/Test Split

- **Training period:** 2024-01-01 to 2025-04-30 (60% chronological)
- **Validation period:** 2025-05-01 to 2026-07-20 (40% chronological)
- The split is chronological. No data from the validation period is used to select parameters.

---

## 7. Statistical Gates (pre-registered)

A variant PASSES if ALL of the following are true:
1. Bootstrap 95% CI lower bound > −$10 per trade (same gate as PV-EXP-002)
2. Permutation test p-value < 0.10
3. Walk-forward validation period expectancy > 0 (positive in holdout)
4. Minimum 50 trades in the training period

A variant FAILS if any gate is not met. The DOES_THE_SIMPLE_IDEA_HAVE_AN_EDGE answer is YES only if at least one variant passes all four gates.

---

## 8. Execution Authority

- `DARWIN_DECISION_AUTHORITY: DISABLED`
- `DARWIN_EXECUTION_AUTHORITY: DISABLED`
- `LIVE_TRADES_INITIATED: 0`
- This is a historical simulation only. No live or paper trades are initiated.
- No strategy activation, no TradersPost webhooks, no Tradovate orders.

---

## 9. What This Test Does NOT Do

- Does NOT optimise EMA periods, stop placement, or any parameter
- Does NOT filter results by session, weekday, or regime after seeing results
- Does NOT use any data from after 2026-07-20
- Does NOT use any forward-looking features
- Does NOT cherry-pick the best exit variant without reporting all three

---

## 10. Locked Before Execution

This contract is committed to GitHub before any simulation code is run. The SHA of this commit is the pre-registration anchor. Any deviation from these rules after this commit constitutes a protocol violation and must be documented.

**PARAMETER_CHANGED_AFTER_PREREGISTRATION: PROHIBITED**
**LOOKAHEAD_VIOLATIONS: 0 required**
**FUTURE_BAR_USES: 0 required**
