# PV-EXP-003 — Regression Report (Corrected)
## Sprint 123A.12 — Gate G12 Correction Sprint

**Date:** 2026-07-29  
**Branch:** sprint/123a-12-pv-exp-003-loss-autopsy  
**Status:** CORRECTED — supersedes original Sprint 123A.12 regression report

---

## Regression Summary

| Check | Result |
|---|---|
| INPUT_HASH_MATCH | TRUE |
| UNEXPLAINED_EVENT_LOSS | 0 |
| DUPLICATE_TRADE_IDS | 0 |
| LOSS_CLASS_ACCOUNTING_RECONCILES | TRUE |
| PREVENTABILITY_ACCOUNTING_RECONCILES | TRUE |
| F2_ACCOUNTING_RECONCILES | TRUE |
| TIME_BUCKET_AUDIT_PASS | TRUE |
| STOP_ENGINE_AUDIT_PASS | TRUE |
| FEATURE_LOOKAHEAD_VIOLATIONS | 0 |
| FUTURE_STRUCTURE_USES | 0 |
| PARAMETER_CHANGED_AFTER_VALIDATION | FALSE |
| DARWIN_DECISION_AUTHORITY | DISABLED |
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

## Artefact Manifest (Corrected)

### Unchanged (locked inputs — not affected by corrections)

| Artefact | SHA (first 16 chars) |
|---|---|
| PV_EXP_003_LOSS_AUTOPSY_CONTRACT.md | pre-registration |
| PV_EXP_003_CONFIGURATION.json | pre-registration |
| pv_exp_003_analysis_engine.py | original engine |
| PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json | `38905b50269400a0` |
| PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json | `d1aac4866cb48bf2` |
| PV_EXP_003_LOSS_DECOMPOSITION.json | `0824d9e85717027d` |
| PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json | `a048558d7aaed113` |

### New (correction artefacts)

| Artefact | SHA (first 16 chars) | Correction |
|---|---|---|
| PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json | `6a2e7a94ac871790` | HIGH+MEDIUM=73 (was 60) |
| PV_EXP_003_TIME_BUCKET_AUDIT.json | `a2e2e6ca567e44ce` | UTC session labels, F1=65 (was 0) |
| PV_EXP_003_F2_TRADE_RECONCILIATION.json | `f23a6020cbcaf1ff` | train=72 (was 55), total=118 |
| PV_EXP_003_STOP_ENGINE_AUDIT.json | `d3515f0baa2e94dd` | Bar simulation, distinct outcomes |
| PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json | `842b7caeb6c9ce98` | All REJECTED after costs |
| PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json | `1591397fdd9576a4` | M1 winner_reduction corrected |
| PV_EXP_003_TEMPORAL_VALIDATION.json | `6d97e760f313a5c3` | Evidence class added |
| PV_EXP_003_ADJUSTMENT_RANKING.json | `b95d039dd2bd7ab5` | Corrected rankings |
| PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md | — | NEW |
| pv_exp_003_g12_correction_engine.py | — | NEW |

---

## Key Numerical Results (Corrected)

| Metric | Original | Corrected |
|---|---|---|
| Baseline expectancy | +$12.32/trade | +$12.32/trade (unchanged) |
| Baseline profit factor | 1.27 | 1.27 (unchanged) |
| HIGH+MEDIUM preventability | 60 (57.1%) | 73 (69.5238%) |
| F2 training retained | ~55 | 72 |
| F2 validation retained | 46 | 46 (unchanged) |
| F2 total retained | ~101 | 118 |
| F2 expectancy | +$24.79/trade | +$24.79/trade (unchanged) |
| F2 profit factor | 1.56 | 1.56 (unchanged) |
| F1 retained | 0 (error) | 65 |
| E5 classification | PROMISING | REJECTED |
| E6 classification | OVERFIT_RISK | REJECTED |
| M1 winner_reduction | 0 (error) | 26 (break-even exits) |
| M4 expectancy | +$27.39 | +$31.06 (bar simulation) |
| SUPPORTED adjustments | F2 only | F2, M1, M4 |

---

## Corrections Verified

| Correction | Verified |
|---|---|
| Preventability arithmetic (HIGH+MEDIUM=73) | ✓ |
| Session labels from UTC (F1=65, F3=51) | ✓ |
| F2 training retained = 72 (not 55) | ✓ |
| Stop engine bar simulation (distinct S2–S7 outcomes) | ✓ |
| Early exit costs applied (all REJECTED) | ✓ |
| M1 break-even cost included | ✓ |
| M2/M3 partial exit costs applied | ✓ |
| M4 causal-only structure (FUTURE_STRUCTURE_USES=0) | ✓ |
| M1 winner_reduction contradiction resolved | ✓ |
| Evidence classification stated | ✓ |
| PV-EXP-004 prospective plan written | ✓ |

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

*Generated: 2026-07-29 | Atlas Nexus DARWIN Research Protocol | Sprint 123A.12 Correction*
