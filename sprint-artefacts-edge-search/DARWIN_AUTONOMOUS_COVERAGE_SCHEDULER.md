# DARWIN Autonomous Coverage Scheduler

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

The autonomous coverage scheduler governs which research families and rules are researched each cycle. It prevents permanent focus on one family, ensures broad coverage, and enforces all budget controls.

---

## 2. Scheduling Algorithm

Each DARWIN hourly cycle, the scheduler:

1. Queries the coverage registry for all ACTIVE or QUEUED_FOR_ACTIVATION families.
2. Computes a scheduling score for each family using the dimensions below.
3. Selects the highest-scoring family not exceeding MAX_RESEARCH_SHARE_PER_FAMILY.
4. Within the selected family, selects the highest-priority rule not yet tested in this cycle.
5. Checks research memory for duplicate condition signatures.
6. If no duplicate: creates a pre-registered hypothesis and queues it.
7. If duplicate: marks as DUPLICATE_RESEARCH and moves to next rule.
8. Enforces all budget limits before creating any hypothesis.

---

## 3. Family Scheduling Score

| Dimension | Weight | Description |
|---|---|---|
| Days since last researched | 30 | Older = higher score (starvation prevention) |
| Untested rules in family | 20 | More untested rules = higher score |
| Live recurrence events | 20 | Recent live observations from this family |
| Data availability | 15 | All required data present |
| Expected sample size | 10 | Higher expected samples = higher score |
| Compute cost | 5 | Lower compute = higher score |

---

## 4. Controls

| Control | Value |
|---|---|
| MAX_RESEARCH_SHARE_PER_FAMILY | 20% of daily hypotheses |
| MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK | 5 |
| HIGH_PRIORITY_UNTESTED_FAMILY_AGE_LIMIT_DAYS | 14 |
| RESEARCH_STARVATION_EVENTS | 0 (hard limit) |

If a Wave-1 family has not been researched in 14 days, it is escalated to CRITICAL priority and the next available hypothesis slot is allocated to it.

---

## 5. Approval Gates

The scheduler operates autonomously within approved families and frozen rules. Phil's written approval is required before:

- Adding a new external data source
- Increasing research budgets above initial limits
- Enabling paid microstructure datasets (Family I)
- Changing promotion thresholds
- Enabling ungoverned search
- Activating paper trading
- Activating live trading

---

## 6. Wave Activation Schedule

| Wave | Families | Activation |
|---|---|---|
| Wave 1 | B, C, E, F, G, H, J, N, O, P, V | Post-soak deployment |
| Wave 2 | D, K, L, M, Q, R, T, U, X | After 7-day Wave-1 review |
| Wave 3 | S, W | After multiple PROMISING findings exist |
| Blocked | I | Requires Phil approval + paid schema |

---

## 7. 7-Day Review

After seven market days, DARWIN produces `DARWIN_EDGE_SEARCH_7_DAY_REVIEW.md` reporting:

- Hypotheses created (by family)
- Family distribution vs MAX_RESEARCH_SHARE_PER_FAMILY
- Duplicate prevention rate
- Experiments completed
- Rejection rate, inconclusive rate, promising rate, supported rate
- Compute cost
- False-discovery burden (BH-FDR corrections applied)
- Operational stability
- Research-starvation events
- Family coverage
- Notification volume
- Memory lookup performance

---

## 8. Cron Integration

The scheduler is invoked by the existing DARWIN hourly cron job:

```
DARWIN Hourly: Every hour, Mon–Fri 00:00–22:00 UTC + Sun 22:00–23:59 UTC
```

The scheduler respects `isDarwinHourlyActive()` (CME maintenance window and weekend close awareness) and does not run during the 17:00–18:00 ET maintenance window.
