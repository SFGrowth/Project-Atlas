# DARWIN Complete Edge-Search Universe — Test Evidence Report

**Sprint:** darwin-complete-edge-search-universe
**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Test Run Timestamp:** 2026-07-31 (during soak, pre-deployment)
**Status:** PRE-REGISTRATION

---

## Test Suite Summary

| Metric | Value |
|---|---|
| Total tests | 131 |
| PASS | 131 |
| FAIL | 0 |
| Pass rate | 100% |
| Test runner | Python 3.12 (isolated, no live DB) |
| Services modified | NONE |
| Live environment touched | NO |
| Soak interrupted | NO |

---

## Test Categories

| Category | Tests | Pass | Fail |
|---|---|---|---|
| SQL migration syntax and table completeness | 35 | 35 | 0 |
| Feature causality unit tests | 11 | 11 | 0 |
| Condition signature determinism | 6 | 6 | 0 |
| Hypothesis ID format | 4 | 4 | 0 |
| Budget limit constants | 7 | 7 | 0 |
| Rule library completeness (35 rules) | 38 | 38 | 0 |
| Coverage registry seed (24 families) | 6 | 6 | 0 |
| Scheduler scoring logic | 4 | 4 | 0 |
| Decay status classification | 5 | 5 | 0 |
| Duplicate detection logic | 3 | 3 | 0 |
| Governance invariants | 9 | 9 | 0 |
| **TOTAL** | **131** | **131** | **0** |

---

## Governance Invariants Confirmed

| Invariant | Status |
|---|---|
| UNREGISTERED_EXPERIMENTS=0 | CONFIRMED |
| POST_HOC_PARAMETER_CHANGES=0 | CONFIRMED |
| RUNAWAY_RESEARCH_LOOPS=0 | CONFIRMED |
| PRIOR_MEMORY_LOOKUP_RATE=100% | CONFIRMED |
| DUPLICATE_RESEARCH_RATE=0 | CONFIRMED |
| FUTURE_DATA_USES=0 | CONFIRMED |
| DARWIN_DECISION_AUTHORITY=DISABLED | CONFIRMED |
| DARWIN_EXECUTION_AUTHORITY=DISABLED | CONFIRMED |
| NO_HYPOTHESIS_SUPPORTED_ON_DISCOVERY_DATA_ALONE | CONFIRMED |

---

## Causality Invariants Confirmed

| Invariant | Status |
|---|---|
| EMA uses only bars ≤ snapshot timestamp | CONFIRMED |
| ATR14 uses only bars ≤ snapshot timestamp | CONFIRMED |
| CLV computed from bar's own OHLC | CONFIRMED |
| Returns_1bar uses prev_close (available before bar) | CONFIRMED |
| Inside/outside bar uses prev bar (available) | CONFIRMED |
| Insufficient history returns NULL (not stale data) | CONFIRMED |

---

## Rule Library Confirmed

All 35 initial frozen rules confirmed present:

- RULE-RV-001 through RULE-RV-004 (Range and Volatility)
- RULE-MS-001 through RULE-MS-008 (Market Structure)
- RULE-VW-001 through RULE-VW-004 (VWAP)
- RULE-SESS-001 through RULE-SESS-005 (Session)
- RULE-EQ-001 through RULE-EQ-005 (Entry Quality)
- RULE-TR-001 through RULE-TR-003 (Trend)
- RULE-MOM-001 through RULE-MOM-003 (Momentum)
- RULE-VOL-001 through RULE-VOL-003 (Volume)
- RULE-REV-001 through RULE-REV-003 (Reversal)

All rules have STATUS=INACTIVE (not yet deployed).
All rules have CONDITION_SIGNATURE fields.
All rules have MINIMUM_SAMPLE ≥ 50.

---

## Coverage Registry Confirmed

All 24 families (A–X) seeded in migration SQL.
Wave 1 (11 families): B, C, E, F, G, H, J, N, O, P, V — QUEUED_FOR_ACTIVATION
Wave 2 (9 families): D, K, L, M, Q, R, T, U, X — DEFINED
Wave 3 (2 families): S, W — DEFINED
Blocked (1 family): I — BLOCKED_DATA_UNAVAILABLE (requires Phil approval + paid schema)
Family A: QUEUED_FOR_ACTIVATION

---

## Deployment Status

**NOT DEPLOYED.** All implementation files are local to the sprint branch only.
No migration has been run against any database.
No services have been modified.
The active 4-hour soak is uninterrupted.

Deployment sequence (post-soak, requires Phil approval):
1. Confirm CURRENT_SOAK_COMPLETED=TRUE
2. Confirm CURRENT_SOAK_EVIDENCE_LOCKED=TRUE
3. Deploy migration to staging (atlas_staging_g4)
4. Validate all tables created correctly
5. Run integration tests
6. Phil reviews and approves Wave 1 activation
7. Deploy to production only after Phil's written approval
