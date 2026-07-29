# PV-EXP-003 Regression Report
## Sprint 123A.12

**Date:** 2026-07-29  
**Branch:** sprint/123a-12-pv-exp-003-loss-autopsy

---

## Artefact Manifest

| Artefact | SHA (first 16 chars) | Status |
|---|---|---|
| PV_EXP_003_LOSS_AUTOPSY_CONTRACT.md | pre-registration | ✓ |
| PV_EXP_003_CONFIGURATION.json | pre-registration | ✓ |
| pv_exp_003_analysis_engine.py | implementation | ✓ |
| PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json | `38905b50269400a0` | ✓ |
| PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json | `d1aac4866cb48bf2` | ✓ |
| PV_EXP_003_LOSS_DECOMPOSITION.json | `0824d9e85717027d` | ✓ |
| PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json | `a048558d7aaed113` | ✓ |
| PV_EXP_003_ENTRY_FILTER_RESULTS.json | `e824734b91c2863e` | ✓ |
| PV_EXP_003_STOP_PLACEMENT_RESULTS.json | `7a1d6970779c72e5` | ✓ |
| PV_EXP_003_EARLY_EXIT_RESULTS.json | `0aece8246542629e` | ✓ |
| PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json | `2e59e13b12d89120` | ✓ |
| PV_EXP_003_TEMPORAL_VALIDATION.json | `00543739fad0b1df` | ✓ |
| PV_EXP_003_ADJUSTMENT_RANKING.json | `a5f6d0552f6b4e19` | ✓ |
| PV_EXP_003_RESULTS_REPORT.md | results | ✓ |
| PV_EXP_003_REGRESSION_REPORT.md | this file | ✓ |

**Total artefacts:** 15

---

## Reproducibility Check

| Check | Result |
|---|---|
| INPUT_HASH_MATCH | TRUE |
| FEATURE_LOOKAHEAD_VIOLATIONS | 0 |
| TOTAL_CLASSIFIED_LOSERS | 105 |
| UNCLASSIFIED_LOSERS | 0 |
| LOSS_CLASS_ACCOUNTING_RECONCILES | TRUE |
| PARAMETER_CHANGED_AFTER_VALIDATION | FALSE |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
| LIVE_TRADES_INITIATED | 0 |

---

## Locked Input SHAs

| Input | SHA (first 16 chars) |
|---|---|
| PV_EXP_002_OUTCOME_LEDGER.json | `741e153ee454d2b0` |
| DETECTOR_CANONICAL_EVENT_LEDGER.json | `9240cbb16f5cd293` |
| mnq_5m_features.parquet | `c970675391b97095` |

---

## Key Numerical Results

| Metric | Value |
|---|---|
| Baseline expectancy | +$12.32/trade |
| Baseline profit factor | 1.27 |
| Best filter (F2) expectancy | +$24.79/trade |
| Best filter (F2) profit factor | 1.56 |
| Validation (F2 applied) expectancy | +$44.60/trade |
| Validation (F2 applied) profit factor | 1.88 |
| Best management (M4) expectancy | +$27.39/trade |
| Best management (M4) profit factor | 1.78 |
| Total losers classified | 105/105 |
| Preventable/medium losses | 60/105 (57.1%) |

---

## Pre-Existing Test Failures (Not Sprint-Introduced)

Two tests in the full regression suite were failing before this sprint (at G10 baseline). These are self-referential tests that scan their own test files and are not related to sprint work.

---

## Authority Boundaries Confirmed

- DARWIN_PROCESSBAR_CALLS: 0
- DARWIN_POSTBARAUTOMATION_CALLS: 0
- DARWIN_TRADERSPOST_CALLS: 0
- DARWIN_TRADOVATE_CALLS: 0
- LIVE_TRADES_INITIATED: 0
- STRATEGY_STATUS_CHANGES: 0
- CAPITAL_REALLOCATIONS: 0

---

*Generated: 2026-07-29 | Atlas Nexus DARWIN Research Protocol | Sprint 123A.12*
