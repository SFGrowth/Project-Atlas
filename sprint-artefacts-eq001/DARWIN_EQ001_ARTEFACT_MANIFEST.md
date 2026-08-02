# DARWIN-EQ001-VALIDATION-001 — Artefact Manifest

**Experiment ID:** DARWIN-EQ001-VALIDATION-001  
**Branch:** sprint/darwin-eq001-validation  
**Pre-registration SHA:** 8079fd37e984d8b8eb33b8f709e8a197f1ae7485  
**Generated:** 2026-08-02T04:30:00Z  

---

## Artefact Inventory

| # | Filename | Type | Status | Description |
|---|----------|------|--------|-------------|
| 1 | DARWIN_EQ001_VALIDATION_PREREGISTRATION.md | Pre-registration | COMPLETE | Parameters frozen before data download. SHA: 8079fd37 |
| 2 | DARWIN_EQ001_VALIDATION_RESULTS.json | Results data | COMPLETE | Full JSON with all subgroup statistics, BH-FDR, bootstrap CI, yearly, neighbourhood, cost sensitivity |
| 3 | DARWIN_EQ001_VALIDATION_REPORT.md | Validation report | COMPLETE | Full narrative report with executive summary, data description, results, explanations, classification |
| 4 | DARWIN_EQ001_SUBGROUP_RANKING.md | Subgroup ranking | COMPLETE | All subgroups ranked by mean net P&L, next research path recommendation |
| 5 | DARWIN_EQ001_COST_ROBUSTNESS_REPORT.md | Cost/robustness | COMPLETE | Cost decomposition, neighbourhood check, year-by-year stability, false positive analysis |
| 6 | DARWIN_EQ001_ARTEFACT_MANIFEST.md | Manifest | COMPLETE | This file |

---

## Data Artefact

| Field | Value |
|-------|-------|
| File | data/historical/mnq_ohlcv1m_2019_2026.dbn |
| Source | Databento GLBX.MDP3 ohlcv-1m |
| Symbol | MNQ.c.0 (continuous) |
| Size | 49.2 MB |
| Raw rows | 2,529,781 |
| Date range | 2019-05-06 to 2026-07-30 |
| Cost | $0.00 (covered by existing subscription) |
| Tracked in git | No (binary, in .gitignore) |

---

## Implementation Artefact

| File | Description |
|------|-------------|
| scripts/validate_eq001_fast.py | Vectorised validation script (52 seconds runtime) |
| scripts/validate_eq001.py | Original validation script (killed — too slow) |

---

## Experiment Summary

| Metric | Value |
|--------|-------|
| Total signals | 68,744 |
| Subgroups tested | 48 |
| PROMISING_STRONG | 0 |
| PROMISING | 0 |
| NEGATIVE_EDGE | 48 |
| BH-FDR rejections | 48 (all negative) |
| Strategy created | FALSE |
| Parameters changed post-data | 0 |
| Authority boundaries violated | 0 |

---

## Final Classification

```
EXPERIMENT_ID                  = DARWIN-EQ001-VALIDATION-001
RULE_EQ001_CLASSIFICATION      = NEGATIVE_EDGE
STRATEGY_SPECIFICATION_CREATED = FALSE
RULE_STATUS_CHANGE_REQUIRED    = BLOCKED (requires Phil approval)
RESEARCH_FAMILY_EQ_STATUS      = NEGATIVE_EVIDENCE_CONFIRMED
REPEAT_THIS_EXPERIMENT         = FALSE
NEXT_EXPERIMENT                = DARWIN-MOM-EQ-001 (momentum continuation)
DARWIN_EXECUTION_AUTHORITY     = DISABLED
LIVE_TRADES_INITIATED          = 0
PAPER_TRADES_INITIATED         = 0
MAIN_MERGE_PERFORMED           = FALSE
```

---

## Commit Chain

| Event | SHA | Branch |
|-------|-----|--------|
| Pre-registration | 8079fd37 | sprint/darwin-eq001-validation |
| Final evidence | TBD (pending push) | sprint/darwin-eq001-validation |

---

## Pending Actions (Require Phil Approval)

1. **Block RULE-EQ-001, RULE-EQ-002, RULE-EQ-003** in staging database (UPDATE darwin_rule_library SET status='BLOCKED' WHERE family='EQ')
2. **Pre-register DARWIN-MOM-EQ-001** on a new branch before examining momentum-continuation data
3. **Push branch to GitHub** (blocked by expired cloud computer token — requires token refresh)
