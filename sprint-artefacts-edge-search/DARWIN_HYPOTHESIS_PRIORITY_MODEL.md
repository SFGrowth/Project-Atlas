# DARWIN Hypothesis Priority Model

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

The priority model ranks hypotheses for testing. High priority means worthy of testing, not profitable. The model prevents DARWIN from spending all research budget on one family or one type of hypothesis.

---

## 2. Priority Dimensions

| Dimension | Weight | Description |
|---|---|---|
| NOVELTY | 10 | How different is this from existing memory? (0=duplicate, 10=entirely new) |
| MARKET_MECHANISM_PLAUSIBILITY | 15 | How plausible is the causal explanation? (0=no rationale, 15=strong mechanism) |
| EXPECTED_SAMPLE_SIZE | 10 | Estimated occurrences in discovery dataset (0=<10, 10=500+) |
| DATA_QUALITY | 8 | Quality and completeness of required data (0=unavailable, 8=complete) |
| EXECUTION_FEASIBILITY | 8 | Is the signal practically executable? (0=impossible, 8=trivially executable) |
| RESEARCH_MEMORY_SIMILARITY | 5 | Penalise if similar hypothesis was recently tested (0=tested last week, 5=never tested) |
| FALSE_DISCOVERY_BURDEN | 8 | How many tests in this family already? (0=family K>20, 8=K=1) |
| COMPLEMENTARITY | 7 | Does this fill a gap in current portfolio coverage? (0=duplicates existing, 7=unique regime) |
| LIVE_RECURRENCE | 10 | Has this condition appeared repeatedly in live data recently? (0=never, 10=multiple sessions) |
| POTENTIAL_MOVE_SIZE | 8 | Expected move relative to round-trip cost (0=cost-dominated, 8=5× cost) |
| ESTIMATED_COST_TO_SIGNAL_RATIO | 5 | Lower cost relative to signal = higher score |
| COMPUTE_COST | 3 | Penalise computationally expensive hypotheses |
| FAMILY_RESEARCH_STARVATION | 5 | Boost families not researched in >14 days |
| DATA_AVAILABILITY | 5 | All required features available and validated |
| PROSPECTIVE_TESTABILITY | 3 | Can this be observed prospectively in live data? |

**Total maximum score: 110 (normalised to 100)**

---

## 3. Priority Levels

| Level | Score Range | Meaning |
|---|---|---|
| LOW | 0–39 | Defer; test only if no higher-priority hypotheses exist |
| MEDIUM | 40–59 | Queue for testing in normal rotation |
| HIGH | 60–79 | Prioritise; test within current research cycle |
| CRITICAL_REVIEW | 80–100 | Immediate testing; live recurrence or portfolio gap |

---

## 4. Automatic Rejection Before Scoring

The following conditions result in automatic rejection before priority scoring:

| Condition | Rejection Reason |
|---|---|
| condition_signature matches existing memory | DUPLICATE_RESEARCH |
| Estimated sample < MINIMUM_SAMPLE_DISCOVERY (50) | INSUFFICIENT_SAMPLE |
| Required data unavailable | DATA_UNAVAILABLE |
| Trigger requires future information | CAUSALITY_VIOLATION |
| Move < round-trip cost at 50th-percentile ATR | COST_DOMINATED |
| No mechanism rationale provided | NO_MECHANISM |
| Features > MAX_FEATURES_PER_HYPOTHESIS (4) | COMPLEXITY_LIMIT |
| Family K > MAX_VARIANTS_PER_HYPOTHESIS (1) without parent finding | BUDGET_LIMIT |

---

## 5. Family Starvation Prevention

If a Wave-1 family has not had a hypothesis tested in the last 14 days, its FAMILY_RESEARCH_STARVATION score is set to 5 (maximum), boosting all hypotheses from that family. The scheduler must ensure MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK=5 is maintained.

---

## 6. Budget Controls

| Control | Value |
|---|---|
| MAX_NEW_HYPOTHESES_PER_HOUR | 3 |
| MAX_NEW_HYPOTHESES_PER_DAY | 25 |
| MAX_ACTIVE_EXPERIMENTS | 10 |
| MAX_RESEARCH_SHARE_PER_FAMILY | 20% |

If any limit is reached, new hypotheses are queued and not created until capacity is available.
