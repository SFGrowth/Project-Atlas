# Artefact A9 — DARWIN Research Cycle 003 Pre-Registration
## Cycle ID: DARWIN-C003
## Pre-Registration Date: 2026-07-30T22:51:00Z
## Status: PRE-REGISTERED (not yet executed)

---

## Pre-Registration Statement

This document pre-registers the hypotheses, methods, and decision criteria for DARWIN Research Cycle 003 **before any data is examined**. All decisions recorded here are binding. Post-hoc modifications to these criteria are prohibited by the DARWIN doctrine.

---

## Candidate K1-15m: Regime-Specific Momentum at 15-Minute Resolution

### Observation Being Tested

During DARWIN-C002, the K1 composite regime filter (high volume + ADX > 25 + EMA alignment) produced the least-negative gross expectancy (−0.089 pts) among all 15 candidates at the 5-minute timeframe. The holdout period (2024–2026) showed improvement relative to the in-sample period (2019–2023), suggesting the behaviour may be genuine but operating at a coarser timescale than 5 minutes.

### Hypothesis

**H0 (Null):** The 15-minute MNQ close return following a K1 regime signal (ADX > 25, volume > 1.5× 20-bar average, EMA-20 > EMA-50) is drawn from a distribution with mean ≤ 0.

**H1 (Alternative):** The 15-minute MNQ close return following a K1 regime signal is drawn from a distribution with mean > 0 (long-only) or mean < 0 (short-only).

### Entry Conditions (Pre-Registered)

```
Timeframe:         15-minute MNQ bars
Direction:         Long and short tested separately
Entry signal:      Close of 15m bar where ALL of:
                     - ADX(14) > 25
                     - Volume > 1.5 × SMA(Volume, 20)
                     - EMA(20) > EMA(50) [long] or EMA(20) < EMA(50) [short]
Hold period:       1 bar (15 minutes)
Exit:              Close of next 15m bar
Cost:              1.21 pts round-trip (fixed)
```

### Statistical Decision Criteria (Pre-Registered)

| Criterion | Threshold | Notes |
|-----------|-----------|-------|
| Minimum sample size | ≥ 100 per direction | Per DARWIN doctrine |
| p-value threshold | < 0.05 (raw) | Before BH-FDR correction |
| BH-FDR q | 0.05 | Applied across all active experiments |
| Minimum gross expectancy | > 1.21 pts | Must overcome round-trip cost |
| Out-of-sample gate | Split at 2024-01-01 | In-sample: 2019–2023; OOS: 2024–2026 |
| Stability criterion | OOS Sharpe ≥ 0.5 × IS Sharpe | Minimum stability |

### Promotion Gates (Pre-Registered)

A candidate is promoted to HYPOTHESIS_VALIDATED only if ALL of:
1. p-value < 0.05 (raw) AND BH-FDR significant
2. Gross expectancy > 1.21 pts (net positive after cost)
3. Out-of-sample gate passed (OOS Sharpe ≥ 0.5 × IS Sharpe)
4. Sample size ≥ 100 per direction
5. Behaviour present in both 2019–2022 and 2023–2026 sub-periods

### Rejection Criteria (Pre-Registered)

A candidate is rejected if ANY of:
- p-value ≥ 0.05 (raw)
- Gross expectancy ≤ 1.21 pts
- Out-of-sample Sharpe < 0.5 × in-sample Sharpe
- Sample size < 100 per direction

### K-Tracking (Pre-Registered)

```
HYPOTHESIS_FAMILY:    K1_REGIME_MOMENTUM
K_COUNTER_START:      1 (this is the first test in this family)
BONFERRONI_THRESHOLD: 0.05 / K (applied if K > 1 in future cycles)
```

### Data Source

- **In-sample:** `mnq_15m_full_2019_2023.parquet` (to be derived from canonical 5m data)
- **Out-of-sample:** `mnq_15m_full_2024_2026.parquet` (to be derived from canonical 5m data)
- **Source:** Canonical Databento MNQ data on cloud computer at `/home/ubuntu/rc_validation/`

### Expected Timeline

- **Execution:** Next DARWIN research session
- **Pre-registration lock date:** 2026-07-30T22:51:00Z
- **No modifications permitted after this timestamp**

---

## Additional Candidates for C003 (Secondary)

If K1-15m is rejected, the following secondary candidates are pre-registered in priority order:

| Priority | Candidate | Observation |
|----------|-----------|-------------|
| 2 | N1-cost-adjusted | N1 (overnight gap) had strong directional signal but was cost-dominated. Test with wider hold period (2 bars) to reduce cost per unit of expectancy. |
| 3 | B1-filtered | B1 (mean reversion) had genuine signal (p=0.02) but was cost-dominated. Test with volatility filter (ATR > 1.5× median) to select higher-magnitude reversions. |

**PRE_REGISTRATION_STATUS: LOCKED**
**PRE_REGISTRATION_TIMESTAMP: 2026-07-30T22:51:00Z**
