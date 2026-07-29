# PV-EXP-004 — Prospective Validation Plan
## Monday Exclusion Filter (F2): Prospective Test

**Prepared by:** DARWIN Research Engine
**Sprint:** 123A.12 (Final Reconciliation)
**Plan commit SHA:** f70e31e1afd45f226c04af631bf62fa62091b20d
**Status:** PLAN FROZEN — awaiting Phil's approval to open experiment

---

## AUTHORITY BOUNDARIES (FROZEN)

DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
STRATEGY_STATUS_CHANGES: 0
CAPITAL_REALLOCATIONS: 0

Do not begin collection. Do not apply F2 to any live, paper or shadow strategy.
Do not implement M1–M4. Do not change capital allocation.

---

## 1. Background

PV-EXP-003 identified that excluding Monday trades from the Payout Vault setup
produces a positive improvement in expectancy. This was classified as:

**RETROSPECTIVE_DISCOVERY + INTERNAL_TEMPORAL_VALIDATION**

The Monday exclusion was discovered and tested on the same 152-trade historical
population (Oct 2025 – Jul 2026). The 60/40 chronological split provides internal
temporal validation only — not prospective validation.

**Corrected PV-EXP-003 numbers (post G12 final reconciliation):**

| Metric | Baseline (152 trades) | F2 Filtered (118 trades) |
|---|---|---|
| Expectancy | $12.32/trade | $24.79/trade |
| Profit Factor | 1.30 | 1.60 |
| Win Rate | 30.9% | 33.1% |
| Monday trades excluded | — | 34 |

**Monday performance (corrected):**
| Metric | Value |
|---|---|
| Monday N | 34 |
| Monday total net P&L | $-1052.16 |
| Monday expectancy | $-30.95/trade |
| Monday profit factor | 0.38 |

---

## 2. Frozen Parameters

The following parameters are frozen before any prospective trade collection begins.
No parameter may change after this plan is committed.

| Parameter | Value | Source |
|---|---|---|
| Filter rule | Exclude Monday trades | PV-EXP-003 F2 |
| Timezone | UTC | Canonical dataset |
| Eligible sessions | ASIA, AFTER, LONDON, NY | All non-Monday sessions |
| Detector | payout_vault_detector.py | SHA: 946b806fb563d4ef... |
| Entry model | Unchanged from PV-EXP-002 | PV-EXP-002 configuration |
| Exit model | Unchanged from PV-EXP-002 | PV-EXP-002 configuration |
| Slippage | 2 ticks adverse | PV-EXP-002 convention |
| Commission | $1.24 RT | PV-EXP-002 convention |
| Minimum sample | 50 filled non-Monday trades | Statistical power |
| Maximum collection | 80 filled non-Monday trades | Overfitting guard |
| Primary metric | Expectancy (net USD/trade) | Consistent with PV-EXP-002 |

---

## 3. Experiment Type Clarification

**IMPORTANT: This experiment is a NON-INFERIORITY TEST, not a positive-edge test.**

The primary acceptance gate is:

> Bootstrap 95% CI lower bound > −$10

This gate does **NOT** prove positive expectancy. It only establishes that the
filtered strategy is non-inferior against a −$10/trade threshold.

If the goal is to validate a **positive edge**, the correct primary gate is:

> Bootstrap 95% CI lower bound > $0

PV-EXP-004 is explicitly labelled:

**NON_INFERIORITY_TEST_AGAINST_MINUS_10_DOLLARS**

Do not interpret a PASS as proof of positive expectancy. A separate positive-edge
test would require the CI lower bound to exceed $0.

---

## 4. Success Gates

| Gate | Criterion | Type |
|---|---|---|
| G1 — Sample size | ≥ 50 filled non-Monday trades | Minimum power |
| G2 — Bootstrap CI | 95% CI lower bound > −$10 | Non-inferiority |
| G3 — Permutation p | p < 0.10 (one-tailed) | Significance |
| G4 — Profit factor | PF > 1.0 | Basic profitability |

PV-EXP-004 PASSES if ALL gates pass.
PV-EXP-004 FAILS (RESEARCH_FAIL) if ANY gate fails.

**Note:** A PASS at G2 (CI lower bound > −$10) does not prove positive expectancy.
To validate positive edge, a separate experiment with gate CI lower bound > $0 is required.

---

## 5. Failure Criteria

PV-EXP-004 is terminated and classified RESEARCH_FAIL if:
- Bootstrap 95% CI lower bound ≤ −$10 at any interim check after 50 trades
- Permutation p ≥ 0.10 at final analysis
- Profit factor ≤ 1.0 at final analysis
- Any parameter change is detected after plan commitment

---

## 6. No-Parameter-Change Rule

Once this plan is committed to GitHub, no parameter may be changed:
- The Monday exclusion rule is fixed (UTC weekday = 0)
- The detector is frozen at SHA: 946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec
- The entry/exit model is frozen at PV-EXP-002 configuration
- The execution costs are frozen at 2 ticks + $1.24 RT

Any parameter change invalidates the prospective validation and requires a new
pre-registered experiment.

---

## 7. Collection Protocol

1. Continue running the Payout Vault detector on live MNQ 5-minute data
2. Record every filled trade with full metadata (session, weekday, direction, P&L)
3. Exclude Monday trades from the prospective sample
4. Conduct interim analysis after 50 non-Monday filled trades
5. Conduct final analysis after 80 non-Monday filled trades (or at 50 if gates are clearly met/failed)
6. Do not apply the filter to live trading until PV-EXP-004 PASSES all gates

---

## 8. Artefact Lock

| Artefact | SHA-256 |
|---|---|
| pv_exp_003_canonical_baseline_pnl_ledger.json | (generated this sprint) |
| pv_exp_003_adjustment_ranking.json | (generated this sprint) |
| pv_exp_003_temporal_validation.json | (generated this sprint) |

*This plan is pre-registered. No changes permitted after GitHub commit.*
