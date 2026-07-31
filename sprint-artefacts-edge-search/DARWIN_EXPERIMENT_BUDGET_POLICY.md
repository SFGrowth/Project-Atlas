# DARWIN Experiment Budget Policy

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Budget Limits

| Parameter | Value | Notes |
|---|---|---|
| MAX_NEW_HYPOTHESES_PER_HOUR | 3 | Hard limit; queue excess |
| MAX_NEW_HYPOTHESES_PER_DAY | 25 | Hard limit; queue excess |
| MAX_ACTIVE_EXPERIMENTS | 10 | Hard limit; queue new until slot opens |
| MAX_VARIANTS_PER_HYPOTHESIS | 1 | No A/B variants in first experiment |
| MAX_PARAMETERS_PER_INITIAL_HYPOTHESIS | 6 | Including context parameters |
| MAX_FEATURES_PER_HYPOTHESIS | 4 | Including regime and session |
| MAX_INTERACTION_DEPTH | 2 | No three-way interactions |
| MAX_AUTOMATIC_REFINEMENT_DEPTH | 2 | After 2 failed refinements: REJECTED or HUMAN_REVIEW |
| MINIMUM_SAMPLE_DISCOVERY | 50 | Minimum occurrences in discovery period |
| MINIMUM_INDEPENDENT_SESSIONS | 5 | Minimum independent trading sessions |
| MAX_ACTIVE_RULES | 25 | Wave 1 initial limit |
| MAX_RESEARCH_SHARE_PER_FAMILY | 20% | Of daily hypotheses |
| MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK | 5 | Starvation prevention |

---

## 2. Budget Enforcement

All budget limits are enforced at hypothesis creation time. If any limit would be exceeded, the hypothesis is queued and not created until capacity is available.

Required counters:

```
UNREGISTERED_EXPERIMENTS=0
POST_HOC_PARAMETER_CHANGES=0
RUNAWAY_RESEARCH_LOOPS=0
EXPERIMENT_BUDGET_BREACHES=0
```

---

## 3. Parameter Freezing

Parameters are frozen at pre-registration. After data is examined:

- Thresholds may not be changed.
- Forward horizons may not be added or removed.
- Session scope may not be narrowed.
- Regime scope may not be narrowed.
- Direction may not be changed.

Any change to frozen parameters requires:

1. Parent experiment marked COMPLETE.
2. Finding persisted to research memory.
3. Explicit evidence-based reason documented.
4. New pre-registration with new HYPOTHESIS_ID.
5. New experiment ID.
6. Family K count updated.
7. Parent record preserved and immutable.

---

## 4. Refinement Governance

A refinement is permitted when:

- The original result is INCONCLUSIVE.
- The reason is evidence-based (see DARWIN_REFLECT_RETRY_GOVERNANCE.md).
- Only one major dimension changes.
- A new experiment ID is created.
- K tracking is updated.
- The parent finding remains immutable.

Maximum: MAX_AUTOMATIC_REFINEMENT_DEPTH=2.

After two unsuccessful refinements: STATUS=REJECTED_OR_HUMAN_REVIEW.

---

## 5. Budget Change Governance

Budget limits may not be increased without Phil's written approval. The following changes require approval:

- Increasing MAX_NEW_HYPOTHESES_PER_DAY above 25.
- Increasing MAX_ACTIVE_EXPERIMENTS above 10.
- Increasing MAX_ACTIVE_RULES above 25.
- Enabling ungoverned search.
- Enabling paid microstructure datasets.
