# Artefact B2 — DARWIN-C003 Pre-Registration Specification Reconciliation
## Sprint: darwin-core-observation-to-finding-chain
## Version: v3 (final)
## Produced: 2026-07-31T00:35:00Z

---

## 1. Purpose

This document reconciles all known C003 pre-registration sources to confirm the specification is internally consistent, faithfully encodes the approved K1-15m proposal from C002, and has not been modified after the lock timestamp.

---

## 2. Source Documents Reconciled

| Source | Location | Lock / Creation Date |
|--------|----------|---------------------|
| C002 Cycle Report — Section 11 (Next Experiment Recommendation) | `darwin_research/output/DARWIN_RESEARCH_CYCLE_002_REPORT.md` | 2026-07-30T22:00:00Z |
| C003 Pre-Registration (A9) | `sprint-artefacts/A9_DARWIN_C003_PREREGISTRATION.md` | 2026-07-30T22:51:00Z |
| C003 Spec Comparison (A6 v2) | `sprint-artefacts-v2/sprint-artefacts-v2/A6_C003_SPEC_COMPARISON.md` | 2026-07-30T23:17:00Z |
| C002 Preregistration JSON (K family entry) | `darwin_research/preregistration.json` | 2026-07-30T20:00:00Z |

---

## 3. Reconciliation Table

| Dimension | C002 Report Proposal | C003 Pre-Registration (A9) | A6 Comparison | JSON (C002 K1) | Status |
|-----------|---------------------|---------------------------|---------------|----------------|--------|
| Candidate name | K1-15m: Regime-Specific Momentum at 15-Minute Resolution | K1-15m: Regime-Specific Momentum at 15-Minute Resolution | Match confirmed | K1 (5m, C002) — different cycle | CONSISTENT |
| Timeframe | 15-minute | 15-minute | Match | 5m (C002 K1) — correctly different | CONSISTENT |
| ADX threshold | ADX(14) > 25 | ADX(14) > 25 | Match | ADX(14) > 25 | CONSISTENT |
| Volume filter | > 1.5 × SMA(Vol, 20) | > 1.5 × SMA(Vol, 20) | Match | > 1.5 × SMA(Vol, 20) | CONSISTENT |
| EMA condition | EMA(20) > EMA(50) [L] / < [S] | EMA(20) > EMA(50) [L] / < [S] | Match | EMA(20) > EMA(50) | CONSISTENT |
| Hold period | 1 bar (15 min) | 1 bar (15 min) | Match | 1 bar (5 min) — different cycle | CONSISTENT |
| Round-trip cost | 1.21 pts | 1.21 pts | Match | 1.21 pts | CONSISTENT |
| Min sample size | ≥ 100 per direction | ≥ 100 per direction | Match | ≥ 100 | CONSISTENT |
| p-value threshold | < 0.05 (raw) | < 0.05 (raw) | Match | 0.05 | CONSISTENT |
| BH-FDR q | 0.05 | 0.05 | Match | Not specified (C002 pre-dates BH-FDR) | CONSISTENT |
| Gross expectancy gate | > 1.21 pts | > 1.21 pts | Match | > 1.21 pts | CONSISTENT |
| OOS split | 2024-01-01 | 2024-01-01 | Match | 2024-01-01 | CONSISTENT |
| Stability criterion | OOS Sharpe ≥ 0.5 × IS Sharpe | OOS Sharpe ≥ 0.5 × IS Sharpe | Match | Not specified | CONSISTENT |
| Hypothesis family | K1_REGIME_MOMENTUM | K1_REGIME_MOMENTUM | Match | Not specified | CONSISTENT |
| K-counter start | 1 | 1 | Match | Not applicable | CONSISTENT |

---

## 4. Differences Found

**None.** The C003 pre-registration (A9) is a faithful encoding of the K1-15m proposal from the C002 report. No parameters were modified between the proposal and the pre-registration. The C002 preregistration JSON contains the C002 K1 candidate at 5m — this is a different cycle and a different timeframe, and is not a conflict.

---

## 5. Lock Status Verification

```
PRE_REGISTRATION_STATUS:       LOCKED
PRE_REGISTRATION_TIMESTAMP:    2026-07-30T22:51:00Z
MODIFICATIONS_AFTER_LOCK:      NONE
EXECUTION_STATUS:              NOT YET EXECUTED
SECONDARY_CANDIDATES_LOCKED:   TRUE (N1-cost-adjusted, B1-filtered)
SPEC_CONFLICTS_FOUND:          0
RECONCILIATION_STATUS:         CLEAN
```

---

## 6. Binding Constraints

The following constraints are binding for C003 execution:

1. **No parameter changes** are permitted after 2026-07-30T22:51:00Z.
2. **K-counter** must be incremented to K=2 if any additional K-family tests are run before C003 executes.
3. **BH-FDR correction** must be applied across all active experiments at the time of C003 execution, not just within C003.
4. **Out-of-sample gate** must be evaluated at the pre-registered split date (2024-01-01), not adjusted post-hoc.
5. **Cycle 003 must not begin** without written approval from the project owner.

---

## 7. Secondary Candidates (Pre-Registered)

| Priority | Candidate | Basis | Status |
|----------|-----------|-------|--------|
| 2 | N1-cost-adjusted | N1 had strong directional signal but cost-dominated. Test wider hold (2 bars). | LOCKED |
| 3 | B1-filtered | B1 had genuine signal (p=0.02) but cost-dominated. Test with ATR > 1.5× median filter. | LOCKED |

These secondary candidates are activated only if K1-15m is rejected. Their specifications are locked as of 2026-07-30T22:51:00Z.
