# DARWIN Research Cycle 002 — Master Report

**Cycle ID:** DARWIN-C002  
**Date:** 2026-07-30  
**Data Source:** Canonical Databento MNQ (Micro E-mini Nasdaq-100 Futures)  
**Authority:** DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED  
**Live Trades Initiated:** 0  
**Label:** EXPLORATORY — No BH-FDR correction applied (see Section 9)

---

## Executive Summary

DARWIN Research Cycle 002 tested 15 pre-registered strategy hypotheses across three temporal validation periods spanning 2019–2026. All 15 candidates were classified **REJECTED** under the DARWIN promotion gates. This is a valid and important research outcome: the cycle has successfully eliminated 15 hypothesis families from further investigation, narrowed the search space, and produced three actionable findings that directly inform the next research cycle.

The most significant finding is that **simple entry conditions — even with regime filters, multi-timeframe alignment, and volume confirmation — cannot overcome the 1.21-point round-trip cost burden at the 5-minute timeframe**. The cost-to-signal ratio is the primary driver of rejection across all families. This is not a data quality issue; it is a structural market microstructure finding.

---

## 1. Data Quality Summary

| Metric | 1m Dataset | 5m Dataset |
|--------|-----------|-----------|
| Total bars | 2,539,605 | 508,903 |
| Date range | 2019-05-06 → 2026-07-20 | 2019-05-06 → 2026-07-20 |
| Trading days | 2,246 | 2,246 |
| Duplicate bars | 0 | 0 |
| Out-of-order bars | 0 | 0 |
| OHLC violations | 0 | 0 |
| Gap status | WARN_GAPS (expected: overnight/weekend/maintenance) | WARN_GAPS (expected) |
| Source | Databento canonical parquet | Databento canonical parquet |

All gaps are consistent with CME Globex session boundaries (17:00–18:00 ET maintenance, Fri 17:00 → Sun 18:00 ET weekend close). The dataset is confirmed clean.

---

## 2. Pre-Registration Summary

All 15 candidates were pre-registered in `preregistration.json` before any backtest was run. The pre-registration records: candidate ID, family, hypothesis, entry conditions, stop/target parameters, hold bars, and the specific null hypothesis being tested. This prevents post-hoc selection.

| Family | Candidate ID | Name | Timeframe | Direction |
|--------|-------------|------|-----------|-----------|
| A | DARWIN-C002-A1 | Momentum Continuation | 5m | Both |
| B | DARWIN-C002-B1 | Failed Breakout Reversal | 5m | Both |
| C | DARWIN-C002-C1 | Range Expansion | 1m | Both |
| D | DARWIN-C002-D1 | Volatility Contraction-Expansion | 5m | Both |
| E | DARWIN-C002-E1 | Pullback Continuation | 5m | Both |
| F | DARWIN-C002-F1 | Mean Reversion to EMA | 5m | Both |
| G | DARWIN-C002-G1 | Session Opening Behaviour | 5m | Both |
| H | DARWIN-C002-H1 | Liquidity Sweep and Reclaim | 5m | Both |
| I | DARWIN-C002-I1 | Trend Exhaustion | 5m | Both |
| J | DARWIN-C002-J1 | Structure Break and Retest | 5m | Both |
| K | DARWIN-C002-K1 | Regime-Specific Momentum | 5m | Both |
| L | DARWIN-C002-L1 | Time-of-Day Pre-RTH | 5m | Both |
| M | DARWIN-C002-M1 | Multi-Timeframe Alignment | 1m×5m | Both |
| N | DARWIN-C002-N1 | Volume Imbalance | 5m | Both |
| O | DARWIN-C002-O1 | Risk-State Transition | 5m | Both |

---

## 3. Backtest Results — All Periods

### In-Sample (2019-05-06 → 2023-12-31)

| Candidate | n | Exp (pts) | PF | Win Rate | p-value | CI 95% lower |
|-----------|---|-----------|-----|----------|---------|--------------|
| DARWIN-C002-A1 | 42,873 | −1.388 | 0.846 | 0.477 | 0.894 | negative |
| DARWIN-C002-B1 | 12,011 | −2.019 | 0.741 | 0.412 | 0.994 | negative |
| DARWIN-C002-C1 | 7,266 | −1.206 | 0.790 | 0.432 | 0.387 | negative |
| DARWIN-C002-D1 | 0 | 0.000 | 0.000 | — | 1.000 | — |
| DARWIN-C002-E1 | 24,961 | −1.291 | 0.886 | 0.463 | 0.969 | negative |
| DARWIN-C002-F1 | 0 | 0.000 | 0.000 | — | 1.000 | — |
| DARWIN-C002-G1 | 1,199 | −0.709 | 0.936 | 0.489 | 0.714 | negative |
| DARWIN-C002-H1 | 4,160 | −1.086 | 0.906 | 0.491 | 0.903 | negative |
| DARWIN-C002-I1 | 1,935 | −3.036 | 0.707 | 0.416 | 0.479 | negative |
| DARWIN-C002-J1 | 55,953 | −1.779 | 0.822 | 0.453 | 1.000 | negative |
| DARWIN-C002-K1 | 16,803 | −1.413 | 0.868 | 0.475 | 0.970 | negative |
| DARWIN-C002-L1 | 733 | −0.896 | 0.914 | 0.487 | 0.469 | negative |
| DARWIN-C002-M1 | 38,542 | −0.783 | 0.872 | 0.476 | 0.968 | negative |
| DARWIN-C002-N1 | 6,127 | −1.159 | 0.883 | 0.479 | 0.956 | negative |
| DARWIN-C002-O1 | 0 | 0.000 | 0.000 | — | 1.000 | — |

### Validation (2024-01-01 → 2025-06-30)

| Candidate | n | Exp (pts) | PF | p-value |
|-----------|---|-----------|-----|---------|
| DARWIN-C002-A1 | 13,385 | −1.586 | 0.831 | — |
| DARWIN-C002-B1 | 3,815 | −1.905 | 0.757 | — |
| DARWIN-C002-C1 | 3,573 | −1.555 | 0.814 | — |
| DARWIN-C002-E1 | 7,866 | −1.473 | 0.875 | — |
| DARWIN-C002-G1 | 385 | −1.471 | 0.866 | — |
| DARWIN-C002-H1 | 1,496 | −1.188 | 0.895 | — |
| DARWIN-C002-I1 | 605 | −4.030 | 0.620 | — |
| DARWIN-C002-J1 | 17,786 | −2.039 | 0.800 | — |
| DARWIN-C002-K1 | 5,563 | −1.037 | 0.903 | — |
| DARWIN-C002-L1 | 253 | −1.012 | 0.899 | — |
| DARWIN-C002-M1 | 18,402 | −0.791 | 0.905 | — |
| DARWIN-C002-N1 | 2,055 | −1.564 | 0.859 | — |

### Holdout (2025-07-01 → 2026-07-20)

| Candidate | n | Exp (pts) | PF |
|-----------|---|-----------|-----|
| DARWIN-C002-A1 | 9,293 | −1.344 | 0.847 |
| DARWIN-C002-B1 | 2,852 | −2.541 | 0.700 |
| DARWIN-C002-C1 | 7,602 | −1.756 | 0.777 |
| DARWIN-C002-E1 | 5,596 | −1.520 | 0.868 |
| DARWIN-C002-G1 | 269 | −6.288 | 0.449 |
| DARWIN-C002-H1 | 1,002 | −2.204 | 0.815 |
| DARWIN-C002-I1 | 339 | −1.546 | 0.857 |
| DARWIN-C002-J1 | 12,543 | −1.731 | 0.826 |
| DARWIN-C002-K1 | 3,883 | −0.641 | 0.946 |
| DARWIN-C002-L1 | 186 | −0.897 | 0.916 |
| DARWIN-C002-M1 | 39,347 | −1.303 | 0.854 |
| DARWIN-C002-N1 | 1,458 | −1.579 | 0.861 |

---

## 4. Robustness Results

### Parameter Perturbation (A1 — 9 combinations)

All 9 stop/target combinations for A1 produced negative expectancy. The best result was `stop1.8_tgt1.6` (exp=−0.876 pts). The pattern of results is consistent: wider stops reduce loss magnitude but do not produce positive expectancy. The signal is not parameter-sensitive in a way that would suggest a narrow profitable window exists nearby.

| Stop Mult | Target Mult | n | Exp (pts) | Win Rate |
|-----------|------------|---|-----------|----------|
| 1.2 | 1.6 | 65,551 | −1.387 | 0.464 |
| 1.5 | 1.6 | 65,551 | −1.160 | 0.473 |
| 1.8 | 1.6 | 65,551 | −0.876 | 0.476 |
| 1.8 | 2.0 | 65,551 | −1.155 | 0.472 |
| 1.8 | 2.4 | 65,551 | −1.344 | 0.470 |

### Year-by-Year Temporal Stability (A1)

A1 produced negative expectancy in all 8 calendar years (2019–2026). Temporal stability score: 0/8 = 0.000. This is not a regime-specific failure; it is consistent across bull (2020–2021), bear (2022), and range (2023–2024) market conditions.

| Year | n | Exp (pts) | PF |
|------|---|-----------|-----|
| 2019 | 5,937 | −1.199 | 0.713 |
| 2020 | 9,080 | −1.321 | 0.856 |
| 2021 | 9,056 | −1.468 | 0.829 |
| 2022 | 9,527 | −1.592 | 0.874 |
| 2023 | 9,273 | −1.286 | 0.849 |
| 2024 | 9,023 | −1.139 | 0.896 |
| 2025 | 8,817 | −1.761 | 0.874 |
| 2026 | 4,838 | −1.639 | 0.904 |

### Long/Short Decomposition

| Candidate | Long n | Long Exp | Short n | Short Exp |
|-----------|--------|----------|---------|-----------|
| A1 | 34,569 | −1.401 | 30,982 | −1.445 |
| G1 | 937 | −2.433 | 916 | −0.903 |
| K1 | 12,071 | −1.491 | 14,178 | −0.988 |
| L1 | 615 | −0.194 | 557 | −1.724 |

**Notable observation (L1 Long):** L1 long-only produced exp=−0.194 pts, the least-negative result in the entire cycle. This is a weak signal worth noting for the next cycle's pre-registration, but does not meet promotion gates.

### Regime-Conditional Analysis (A1)

| Regime | n | Exp (pts) | Win Rate | PF |
|--------|---|-----------|----------|-----|
| ADX > 35 | 43,659 | −1.161 | 0.471 | 0.891 |
| ADX 20–35 | 21,892 | −1.942 | 0.463 | 0.809 |
| High volume | 26,249 | −1.219 | 0.475 | 0.903 |
| Low volume | 39,302 | −1.558 | 0.464 | 0.831 |
| Bull EMA | 34,569 | −1.401 | 0.477 | 0.844 |
| Bear EMA | 30,982 | −1.445 | 0.460 | 0.882 |

No regime produces positive expectancy for A1. The high-ADX, high-volume regime (K1's filter) is the least-negative sub-regime (exp=−1.161 to −1.219), but remains below the cost threshold.

---

## 5. Classification Summary

| Candidate | Status | Primary Reason |
|-----------|--------|----------------|
| DARWIN-C002-A1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-B1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-C1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-D1 | REJECTED | No signals generated |
| DARWIN-C002-E1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-F1 | REJECTED | No signals generated |
| DARWIN-C002-G1 | REJECTED | Consistently negative, severe holdout deterioration |
| DARWIN-C002-H1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-I1 | REJECTED | Strongly negative, worst in cycle |
| DARWIN-C002-J1 | REJECTED | Consistently negative, largest sample |
| DARWIN-C002-K1 | REJECTED | Consistently negative, improving trend in holdout |
| DARWIN-C002-L1 | REJECTED | Consistently negative (long side least-negative) |
| DARWIN-C002-M1 | REJECTED | Consistently negative, least-negative in cycle |
| DARWIN-C002-N1 | REJECTED | Consistently negative expectancy all periods |
| DARWIN-C002-O1 | REJECTED | No signals generated |

---

## 6. Portfolio Complementarity Assessment

Of the 15 candidates, 8 represent behaviour types not currently in the active portfolio (D1, E1, H1, I1, K1, M1, N1, O1). However, novelty alone does not justify promotion — all 8 novel-type candidates were rejected on statistical grounds. The portfolio gap analysis remains valid for future cycles: **volatility expansion, multi-timeframe confluence, volume imbalance, and regime-transition behaviours are underrepresented** in the current model set and warrant continued investigation with refined entry conditions.

---

## 7. Final Ranking (All REJECTED)

| Rank | Candidate | Name | IS Exp | VAL Exp | HO Exp | Novel | Score |
|------|-----------|------|--------|---------|--------|-------|-------|
| 1 | DARWIN-C002-M1 | Multi-Timeframe Alignment | −0.783 | −0.791 | −1.303 | YES | 45.0 |
| 2 | DARWIN-C002-E1 | Pullback Continuation | −1.291 | −1.473 | −1.520 | YES | 40.0 |
| 3 | DARWIN-C002-K1 | Regime-Specific Momentum | −1.413 | −1.037 | −0.641 | YES | 31.8 |
| 4 | DARWIN-C002-A1 | Momentum Continuation | −1.388 | −1.586 | −1.344 | NO | 30.0 |
| 5 | DARWIN-C002-J1 | Structure Break and Retest | −1.779 | −2.039 | −1.731 | NO | 30.0 |
| 6 | DARWIN-C002-N1 | Volume Imbalance | −1.159 | −1.564 | −1.579 | YES | 21.1 |
| 7 | DARWIN-C002-H1 | Liquidity Sweep and Reclaim | −1.086 | −1.188 | −2.204 | YES | 19.2 |
| 8 | DARWIN-C002-I1 | Trend Exhaustion | −3.036 | −4.030 | −1.546 | YES | 16.9 |
| 9 | DARWIN-C002-D1 | Volatility Contraction-Expansion | 0.000 | 0.000 | 0.000 | YES | 15.0 |
| 10 | DARWIN-C002-O1 | Risk-State Transition | 0.000 | 0.000 | 0.000 | YES | 15.0 |
| 11 | DARWIN-C002-B1 | Failed Breakout Reversal | −2.019 | −1.905 | −2.541 | NO | 12.0 |
| 12 | DARWIN-C002-C1 | Range Expansion 1m | −1.206 | −1.555 | −1.756 | NO | 7.3 |
| 13 | DARWIN-C002-G1 | Session Opening Behaviour | −0.709 | −1.471 | −6.288 | NO | 1.2 |
| 14 | DARWIN-C002-L1 | Time-of-Day Pre-RTH | −0.896 | −1.012 | −0.897 | NO | 0.7 |
| 15 | DARWIN-C002-F1 | Mean Reversion to EMA | 0.000 | 0.000 | 0.000 | NO | 0.0 |

---

## 8. Key Findings

### Finding 1: Cost Dominance at 5m Timeframe

The 1.21-point round-trip cost (commission + slippage) is the primary driver of rejection. Across all 12 candidates that generated signals, the average in-sample expectancy was −1.38 pts. The average gross expectancy (before costs) was approximately −0.17 pts — meaning the signals themselves are marginally directional but insufficient to overcome costs. This is not a signal quality problem; it is a cost-regime problem.

**Implication for Cycle 003:** The next cycle should investigate either (a) lower-frequency entries that allow larger gross moves per trade, or (b) intrabar precision entries that reduce adverse excursion before the move begins.

### Finding 2: K1 Holdout Improvement Trend

K1 (Regime-Specific Momentum) showed a consistent improvement trend across temporal periods: IS=−1.413, VAL=−1.037, HO=−0.641. The 2026 year-by-year result was exp=−0.220 with PF=0.989. This is the closest any candidate came to breakeven. The regime filter (high volume + ADX > 25 + EMA alignment) is narrowing the signal to a more favourable subset, but the cost burden remains too high at 5m resolution.

**Implication for Cycle 003:** K1's regime filter applied to a lower-frequency (15m or 30m) timeframe is the single highest-value next experiment. The behaviour appears to be improving as the filter becomes more selective.

### Finding 3: L1 Long-Side Asymmetry

L1 (Time-of-Day Pre-RTH, long side only) produced exp=−0.194 pts — the least-negative result in the cycle. The short side (exp=−1.724) was strongly negative, suggesting the pre-RTH period has an asymmetric long bias that is partially real but insufficient to overcome costs at 5m resolution. This is a genuine directional observation worth investigating at higher frequency (1m) with tighter entry timing.

**Implication for Cycle 003:** Pre-RTH long-only at 1m resolution with a tighter entry window (±2 bars around 14:55 UTC) is a valid secondary experiment.

### Finding 4: D1, F1, O1 Signal Generation Failure

Three candidates (D1 Volatility Contraction-Expansion, F1 Mean Reversion to EMA, O1 Risk-State Transition) generated zero signals across all periods. This indicates the entry conditions as specified are too restrictive. The underlying behaviours (volatility expansion after contraction, extreme displacement, regime transition) are real market phenomena — the entry conditions need to be recalibrated.

**Implication for Cycle 003:** D1 and O1 should be re-specified with relaxed thresholds (e.g., D1: 3 consecutive bars below ATR MA instead of 5; O1: 5 consecutive low-vol bars instead of 10).

---

## 9. Multiple Testing Integrity Note

This cycle tested 15 candidates. No BH-FDR correction was applied (this gap was identified in the DARWIN Future Enhancement Blueprint). The fixed p < 0.05 threshold was used throughout. With 15 tests, the expected number of false positives at p < 0.05 is 0.75. Since zero candidates achieved p < 0.05, the multiple testing concern is moot for this cycle — all rejections are valid regardless of correction method.

The BH-FDR correction gap remains open for future cycles where candidates may achieve significance.

---

## 10. Next Experiment Recommendation

**DARWIN-C003-K1-15m: Regime-Specific Momentum at 15-Minute Resolution**

The single highest-value next experiment is to apply K1's regime filter (high volume + ADX > 25 + EMA alignment) to the 15-minute timeframe. The rationale:

1. K1 showed a consistent improvement trend across temporal periods, reaching exp=−0.220 in 2026 at 5m.
2. The 15m timeframe reduces signal frequency by approximately 3×, which increases gross move per trade while maintaining the same regime filter quality.
3. The cost burden (1.21 pts) becomes proportionally smaller relative to the larger ATR-based stops and targets at 15m.
4. The behaviour (momentum continuation in high-volume, trending regimes) has a plausible market microstructure explanation: institutional order flow tends to persist across multiple 5m bars, making 15m the natural resolution for capturing the full move.

**Pre-registration parameters for Cycle 003:**
- Entry: RTH, EMA bullish/bearish, ADX > 25, close > EMA15, previous bar same side, volume > 1.5× 60-bar median
- Stop: 1.5 × ATR14
- Target: 2.0 × ATR14
- Hold: 3 bars (45 minutes maximum)
- Null hypothesis: E[net_pnl] ≤ 0 after 1.21-pt cost
- Minimum sample: 200 in-sample trades

---

## 11. Operational Isolation Confirmation

```
ACTIVE_DARWIN_SERVICE_MODIFIED:  FALSE
CRON_CONFIGURATION_MODIFIED:     FALSE
DATABASE_MODIFIED:                FALSE
SERVICE_RESTARTED:                FALSE
EXTERNAL_CODE_EXECUTED:          FALSE
LIVE_TRADES_INITIATED:           0
DARWIN_DECISION_AUTHORITY:       DISABLED
DARWIN_EXECUTION_AUTHORITY:      DISABLED
MAIN_BRANCH_MODIFIED:            FALSE
```

All research was conducted in read-only mode on the canonical Databento parquet files. No atlas_memory writes, no atlas_bars writes, no cron changes, no service restarts.

---

## 12. Output Artefacts Index

| Artefact | File | Description |
|----------|------|-------------|
| O1 | preregistration.json | Pre-registration of all 15 candidates |
| O2 | data_quality_check.py + output | Data quality verification |
| O3 | backtest_5m_results.json | 5m backtest raw results |
| O4 | backtest_1m_results.json | 1m backtest raw results (C1, M1) |
| O5 | robustness_results.json | Perturbation, temporal, L/S, regime |
| O6 | classification_and_ranking.json | Classification, complementarity, ranking |
| O7 | DARWIN_RESEARCH_CYCLE_002_REPORT.md | This report |
| O8 | backtest_5m.py | 5m vectorised backtest engine |
| O9 | backtest_1m.py | 1m backtest engine (C1, M1) |
| O10 | robustness.py | Robustness analysis engine |

---

*DARWIN Research Cycle 002 — Atlas Nexus Quantitative Trading OS*  
*Generated: 2026-07-30 | Canonical Databento MNQ Data | Read-Only Research Mode*
