# DARWIN Reflect-Retry Governance

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

When an experiment returns INCONCLUSIVE, DARWIN must classify the reason and determine whether a single governed refinement is warranted. This prevents both premature abandonment of valid signals and runaway parameter mining.

---

## 2. INCONCLUSIVE Reason Classification

| Code | Reason | Permitted Refinement |
|---|---|---|
| INSUFFICIENT_SAMPLE | Sample size below minimum | Extend discovery period (if more data available) |
| HIGH_VARIANCE | Wide confidence intervals | Increase minimum sample requirement |
| WEAK_EFFECT | Effect exists but below cost threshold | Reduce cost assumption if justified; otherwise REJECT |
| REGIME_DEPENDENT | Signal only works in one regime | Restrict to that regime (new pre-registration) |
| DIRECTION_DEPENDENT | Signal only works in one direction | Restrict to that direction (new pre-registration) |
| SESSION_DEPENDENT | Signal only works in one session | Restrict to that session (new pre-registration) |
| COST_DOMINATED | Move exists but is smaller than round-trip cost | REJECT (no refinement permitted) |
| ENTRY_TIMING_FAILURE | Signal is valid but entry timing is poor | Adjust entry timing (new pre-registration) |
| EXIT_TIMING_FAILURE | Entry is valid but exit timing is poor | Adjust exit (new pre-registration, after entry frozen) |
| DATA_QUALITY_LIMITATION | Data gaps or quality issues | Improve data quality; retest |
| NO_MEANINGFUL_RELATIONSHIP | No evidence of any relationship | REJECT |

---

## 3. Refinement Rules

A refinement is permitted when ALL of:

1. The reason is evidence-based (documented in experiment results).
2. Only one major dimension changes.
3. A new experiment ID is created.
4. Family K count is updated.
5. The parent finding remains immutable.
6. The refinement depth counter is incremented.

**MAX_AUTOMATIC_REFINEMENT_DEPTH=2**

After two unsuccessful refinements: STATUS=REJECTED_OR_HUMAN_REVIEW.

DARWIN may not create a third automatic refinement. Human review (Phil) is required.

---

## 4. Prohibited Refinements

The following refinements are never permitted:

- Changing frozen parameters after viewing results.
- Narrowing session scope based on which session performed best.
- Narrowing regime scope based on which regime performed best.
- Changing direction based on which direction performed best.
- Adding features to improve a failing hypothesis.
- Changing forward horizons after observing which horizon performs best.

All of the above are POST_HOC_PARAMETER_CHANGES and constitute a governance violation.

---

## 5. Counters

```
POST_HOC_PARAMETER_CHANGES=0
RUNAWAY_RESEARCH_LOOPS=0
MAX_AUTOMATIC_REFINEMENT_DEPTH=2
```
