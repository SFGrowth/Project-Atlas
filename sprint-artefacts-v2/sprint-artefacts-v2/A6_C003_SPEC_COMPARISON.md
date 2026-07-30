# Artefact A6 — DARWIN-C003 Pre-Registration Spec Comparison
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2
## Produced: 2026-07-30T23:17:00Z

---

## Purpose

This document compares the C003 pre-registration (A9 from the prior sprint delivery)
against the K1-15m proposal from the DARWIN-C002 Cycle Report. The purpose is to
confirm that the pre-registration faithfully encodes the approved proposal without
modification, and to document any differences.

---

## Source Documents

| Document | Location | Lock Date |
|----------|----------|-----------|
| C003 Pre-Registration | `sprint-artefacts/A9_DARWIN_C003_PREREGISTRATION.md` | 2026-07-30T22:51:00Z |
| K1-15m Proposal | `darwin_research/output/DARWIN_RESEARCH_CYCLE_002_REPORT.md` (Section 11) | 2026-07-30T22:00:00Z |

---

## Comparison Table

| Dimension | C002 Report Proposal | C003 Pre-Registration | Match |
|-----------|---------------------|----------------------|-------|
| Candidate name | K1-15m: Regime-Specific Momentum at 15-Minute Resolution | K1-15m: Regime-Specific Momentum at 15-Minute Resolution | ✓ |
| Timeframe | 15-minute MNQ bars | 15-minute MNQ bars | ✓ |
| Entry signal — ADX | ADX(14) > 25 | ADX(14) > 25 | ✓ |
| Entry signal — Volume | Volume > 1.5 × SMA(Volume, 20) | Volume > 1.5 × SMA(Volume, 20) | ✓ |
| Entry signal — EMA | EMA(20) > EMA(50) [long] / EMA(20) < EMA(50) [short] | EMA(20) > EMA(50) [long] / EMA(20) < EMA(50) [short] | ✓ |
| Hold period | 1 bar (15 minutes) | 1 bar (15 minutes) | ✓ |
| Exit | Close of next 15m bar | Close of next 15m bar | ✓ |
| Round-trip cost | 1.21 pts | 1.21 pts | ✓ |
| Minimum sample size | ≥ 100 per direction | ≥ 100 per direction | ✓ |
| p-value threshold | < 0.05 (raw) | < 0.05 (raw) | ✓ |
| BH-FDR q | 0.05 | 0.05 | ✓ |
| Gross expectancy gate | > 1.21 pts | > 1.21 pts | ✓ |
| OOS split date | 2024-01-01 | 2024-01-01 | ✓ |
| Stability criterion | OOS Sharpe ≥ 0.5 × IS Sharpe | OOS Sharpe ≥ 0.5 × IS Sharpe | ✓ |
| Hypothesis family | K1_REGIME_MOMENTUM | K1_REGIME_MOMENTUM | ✓ |
| K-counter start | 1 (first test in family) | 1 (first test in family) | ✓ |
| Data source | Canonical Databento MNQ | Canonical Databento MNQ | ✓ |
| Direction | Long and short tested separately | Long and short tested separately | ✓ |

---

## Differences

**None.** The C003 pre-registration is a faithful encoding of the K1-15m proposal
from the C002 report. No parameters were modified between the proposal and the
pre-registration.

---

## Pre-Registration Lock Status

```
PRE_REGISTRATION_STATUS:    LOCKED
PRE_REGISTRATION_TIMESTAMP: 2026-07-30T22:51:00Z
MODIFICATIONS_PERMITTED:    FALSE (after lock timestamp)
EXECUTION_STATUS:           NOT YET EXECUTED (pending next research session)
```

---

## Secondary Candidates (Pre-Registered)

The following secondary candidates are pre-registered in priority order for C003,
to be tested only if K1-15m is rejected:

| Priority | Candidate | Basis |
|----------|-----------|-------|
| 2 | N1-cost-adjusted | N1 (overnight gap) had strong directional signal but was cost-dominated. Test with wider hold period (2 bars) to reduce cost per unit of expectancy. |
| 3 | B1-filtered | B1 (mean reversion) had genuine signal (p=0.02) but was cost-dominated. Test with volatility filter (ATR > 1.5× median) to select higher-magnitude reversions. |

These secondary candidates are locked as of 2026-07-30T22:51:00Z. No modifications
are permitted after the lock timestamp.
