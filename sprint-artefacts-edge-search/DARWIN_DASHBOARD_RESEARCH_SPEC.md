# DARWIN Dashboard Research Specification

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Required Dashboard Panels

All panels read from the live database. No hardcoded evidence is permitted.

| Panel | Data Source | Description |
|---|---|---|
| LIVE OBSERVATIONS | darwin_observations | Real-time live observations from active rules |
| COMPLETE RESEARCH UNIVERSE | darwin_research_coverage_registry | All 24 families with status and coverage |
| FAMILY COVERAGE | darwin_research_coverage_registry | Coverage heatmap by family |
| ACTIVE RULES | darwin_rule_library WHERE status='ACTIVE' | Currently active rules |
| INACTIVE RULES | darwin_rule_library WHERE status='INACTIVE' | Defined but not yet activated |
| DATA-BLOCKED RULES | darwin_rule_library WHERE status='BLOCKED' | Rules blocked by data unavailability |
| HYPOTHESIS QUEUE | darwin_hypotheses WHERE status='QUEUED' | Hypotheses waiting to be tested |
| ACTIVE EXPERIMENTS | darwin_experiments WHERE status='RUNNING' | Currently running experiments |
| REJECTED HYPOTHESES | darwin_hypotheses WHERE status='REJECTED' | Rejected findings with reasons |
| INCONCLUSIVE HYPOTHESES | darwin_hypotheses WHERE status='INCONCLUSIVE' | Inconclusive findings with next steps |
| PROMISING FINDINGS | darwin_hypotheses WHERE status='PROMISING' | Promising findings with metrics |
| SUPPORTED FINDINGS | darwin_hypotheses WHERE status='SUPPORTED' | Supported findings (requires Phil approval) |
| REFINEMENT TREE | darwin_hypotheses with parent links | Hypothesis refinement chains |
| WINNER/LOSER ANALYSIS | darwin_experiments.results_json | Winner/loser feature differences |
| NEGATIVE EDGES | darwin_hypotheses WHERE edge_direction='NEGATIVE' | Negative edge and no-trade findings |
| EDGE DECAY | darwin_edge_decay_monitor | Rolling performance for PROMISING+ findings |
| RESEARCH MEMORY | darwin_research_memory | All memory records with lookup history |
| DAILY RESEARCH REPORT | darwin_daily_hypothesis_queue | Latest daily queue and report |
| RESEARCH STARVATION | darwin_research_coverage_registry | Families not researched in >14 days |
| COMPUTE BUDGET | darwin_experiment_budget_log | Daily hypothesis and experiment counts |

---

## 2. Per-Hypothesis Display Fields

Each hypothesis displayed on the dashboard must show:

| Field | Source |
|---|---|
| HYPOTHESIS_ID | darwin_hypotheses.hypothesis_id |
| FAMILY | darwin_hypotheses.hypothesis_family |
| RULE_ID | darwin_hypotheses.rule_id |
| STATUS | darwin_hypotheses.status |
| PRIORITY | darwin_hypotheses.priority_level |
| SOURCE_OBSERVATIONS | darwin_hypotheses.source_observation_ids |
| CONDITION | darwin_hypotheses.trigger_condition (truncated) |
| CONTEXT | darwin_hypotheses.context_condition (truncated) |
| OUTCOME | darwin_hypotheses.outcome_definition (truncated) |
| SAMPLE_SIZE | darwin_experiments.sample_size (latest) |
| EXPECTANCY | darwin_experiments.expectancy (latest) |
| PROFIT_FACTOR | darwin_experiments.profit_factor (latest) |
| RAW_P_VALUE | darwin_experiments.raw_p_value (latest) |
| ADJUSTED_P_VALUE | darwin_experiments.bh_adjusted_p_value (latest) |
| VALIDATION_STATUS | darwin_experiments.stage (latest) |
| NEXT_REQUIRED_TEST | Computed from current stage |
| PARENT_HYPOTHESIS | darwin_hypotheses.parent_hypothesis_id |
| MEMORY_MATCH | darwin_hypotheses.prior_memory_match_ids |
| CREATED_AT | darwin_hypotheses.created_at |

---

## 3. Dashboard Invariants

```
HARDCODED_DASHBOARD_EVIDENCE=0
ALL_PANELS_DATABASE_BACKED=TRUE
DASHBOARD_RESEARCH_VIEWS_ACTIVE=FALSE (pre-deployment)
```

Dashboard panels are activated as part of the post-soak deployment sequence (step 14).
