# DARWIN Edge-Search Sprint — Artefact Manifest

**Sprint:** darwin-complete-edge-search-universe  
**Branch:** sprint/darwin-complete-edge-search-universe  
**Pre-registration SHA:** ebbb199b519fcfc985482e025de3cc045b59dfcd  
**Date:** 2026-07-31  

---

## Specification Artefacts (9)

| # | File | Description | Status |
|---|------|-------------|--------|
| S1 | DARWIN_COMPLETE_EDGE_UNIVERSE_ARCHITECTURE.md | Master architecture document | COMPLETE |
| S2 | DARWIN_RESEARCH_UNIVERSE_CATALOGUE.json | 24-family formal catalogue | COMPLETE |
| S3 | DARWIN_RESEARCH_COVERAGE_REGISTRY.md | Coverage registry with dashboard metrics | COMPLETE |
| S4 | DARWIN_FEATURE_STORE_SCHEMA.md | Canonical feature store schema | COMPLETE |
| S5 | DARWIN_FEATURE_CAUSALITY_SPEC.md | Causality validation rules | COMPLETE |
| S6 | DARWIN_HYPOTHESIS_TEMPLATE_SPEC.md | Hypothesis template with example | COMPLETE |
| S7 | DARWIN_HYPOTHESIS_PRIORITY_MODEL.md | 15-dimension priority scoring | COMPLETE |
| S8 | DARWIN_AUTONOMOUS_COVERAGE_SCHEDULER.md | Governed scheduler specification | COMPLETE |
| S9 | DARWIN_COMPLETE_RULE_LIBRARY.md | 38 frozen rules with all fields | COMPLETE |

## Governance Artefacts (9)

| # | File | Description | Status |
|---|------|-------------|--------|
| G1 | DARWIN_EXPERIMENT_BUDGET_POLICY.md | Budget enforcement policy | COMPLETE |
| G2 | DARWIN_VALIDATION_PIPELINE.md | 5-stage validation pipeline | COMPLETE |
| G3 | DARWIN_REFLECT_RETRY_GOVERNANCE.md | Reflect-retry governance | COMPLETE |
| G4 | DARWIN_WINNER_LOSER_LEARNING_SPEC.md | Winner/loser learning spec | COMPLETE |
| G5 | DARWIN_NEGATIVE_EDGE_POLICY.md | Negative edge policy | COMPLETE |
| G6 | DARWIN_EDGE_DECAY_SPEC.md | Edge decay specification | COMPLETE |
| G7 | DARWIN_RESEARCH_MEMORY_POLICY.md | Research memory policy | COMPLETE |
| G8 | DARWIN_DAILY_RESEARCH_QUEUE_SPEC.md | Daily queue specification | COMPLETE |
| G9 | DARWIN_DASHBOARD_RESEARCH_SPEC.md | Dashboard specification | COMPLETE |

## Implementation Files (7)

| # | File | Description | Status |
|---|------|-------------|--------|
| I1 | server/darwin/feature-store/featureSnapshotService.ts | Feature store service | COMPLETE |
| I2 | server/darwin/hypothesis-engine/hypothesisEngine.ts | Hypothesis engine | COMPLETE |
| I3 | server/darwin/coverage-registry/coverageRegistryService.ts | Coverage registry service | COMPLETE |
| I4 | server/darwin/scheduler/autonomousCoverageScheduler.ts | Autonomous scheduler | COMPLETE |
| I5 | server/darwin/edge-decay/edgeDecayMonitor.ts | Edge decay monitor | COMPLETE |
| I6 | server/darwin/daily-queue/dailyQueueGenerator.ts | Daily queue generator | COMPLETE |
| I7 | drizzle/edgeSearchSchema.ts | Drizzle schema extension | COMPLETE |

## Migration Files (2)

| # | File | Description | Status |
|---|------|-------------|--------|
| M1 | migrations/edge-search/001_darwin_edge_search_schema.sql | Schema + 24 family seeds | APPLIED |
| M2 | migrations/edge-search/002_seed_rule_library.sql | 38 rule seeds | APPLIED |

## Evidence Artefacts (5)

| # | File | Description | Status |
|---|------|-------------|--------|
| E1 | DARWIN_COMPLETE_EDGE_SEARCH_TEST_REPORT.md | 131/131 test evidence | COMPLETE |
| E2 | test_edge_search_schema.py | Test suite source | COMPLETE |
| E3 | scripts/run_wave1_research_batch.py | Research batch script | COMPLETE |
| E4 | WAVE1_RESEARCH_BATCH_RESULTS.json | Raw batch results | COMPLETE |
| E5 | WAVE1_RESEARCH_BATCH_RANKED_RESULTS.md | Ranked results with decisions | COMPLETE |

## Deployment Evidence (2)

| # | File | Description | Status |
|---|------|-------------|--------|
| D1 | STAGING_DEPLOYMENT_EVIDENCE.md | Full deployment evidence | COMPLETE |
| D2 | EDGE_SEARCH_ARTEFACT_MANIFEST.md | This manifest | COMPLETE |

---

## Summary Counters

| Counter | Value |
|---------|-------|
| Total artefacts | 34 |
| Specification artefacts | 9 |
| Governance artefacts | 9 |
| Implementation files | 7 |
| Migration files | 2 |
| Evidence artefacts | 5 |
| Deployment evidence | 2 |
| Test results | 131/131 PASS |
| Rules seeded | 38 |
| Rules activated (Wave 1) | 3 |
| Rules blocked (negative edge) | 2 |
| Rules pending more data | 6 |
| TypeScript errors | 0 |
| Future data uses | 0 |
| Unregistered experiments | 0 |
| Main branch merges | 0 |

---

## Release Gate Status

| Gate | Status |
|------|--------|
| Pre-registration SHA recorded | PASS — ebbb199 |
| All specification artefacts complete | PASS |
| Test suite 131/131 | PASS |
| Migration applied to staging | PASS |
| Wave 1 rules activated with evidence | PASS |
| No live/paper trading activated | PASS |
| No main merge | PASS |
| Autonomous GitHub archival proof | PENDING — 2026-07-31T22:00:00Z |
