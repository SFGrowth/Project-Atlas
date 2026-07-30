# Research: GitHub MNQ Autonomous Engine Discovery
## Branch: research/github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Status:** COMPLETE — READ-ONLY RESEARCH

---

## Purpose

This research surveyed the public GitHub ecosystem for autonomous MNQ trading engines and autonomous quantitative research systems. The goal was to assess the landscape, identify transferable patterns, and validate DARWIN's architectural novelty.

## Constraints

This research was conducted under strict read-only constraints:
- No operational systems were modified
- No repositories were cloned or executed
- No live databases were queried
- No cron or service configuration was changed
- This branch was created only after all research was complete
- This branch must NOT be merged into main

## Contents

### Artefacts (A1–A11)

| File | Description |
|------|-------------|
| A1_search_query_log.md | All 12 search queries and 16 URLs inspected |
| A2_candidate_repository_inventory.md | Full inventory of 11 candidates across 3 tiers |
| A3_architecture_comparison_matrix.md | 10-dimension comparison of all candidates vs DARWIN |
| A4_mnq_evidence_assessment.md | Per-repository MNQ instrument evidence |
| A5_autonomous_research_classification.md | Fully/Partially/Execution-Only classification |
| A6_code_level_architecture_notes.md | Detailed code-level notes for top 5 candidates |
| A7_gap_analysis_darwin_differentiation.md | 7-dimension gap analysis vs public ecosystem |
| A8_transferable_patterns.md | 5 transferable patterns with implementation notes |
| A9_excluded_candidates_log.md | 13 excluded candidates with exclusion reasons |
| A10_research_constraints_compliance_log.md | Constraint compliance verification |
| A11_research_summary_and_recommendations.md | Executive summary and prioritised recommendations |

### Report

`report/GITHUB_MNQ_AUTONOMOUS_ENGINE_DISCOVERY_REPORT.md` — Full 19-section research report.

## Central Finding

**No public repository combines live-observation-triggered research with MNQ/CME futures native data.** The public ecosystem contains execution systems that trade MNQ (but have no research loop) and research systems that generate hypotheses autonomously (but operate on equities). Atlas Nexus DARWIN occupies a unique architectural position at the intersection of these two classes.

## Top Candidates

| Repository | Classification | Key Relevance |
|-----------|---------------|---------------|
| pixelwhiz/tasty-schwab-trader-BE | Execution-Only | MNQ + Databento (same data stack as DARWIN) |
| OnePunchMonk/AgentQuant | Fully Autonomous | ReAct loop, reflect-retry, SQLite memory |
| microsoft/RD-Agent | Fully Autonomous | R→D loop, NeurIPS 2025, factor-model co-opt |
| augiemazza/varrd | Fully Autonomous | K-tracking, Bonferroni, NQ CME futures |
| rmbell09-lang/tradesight | Partially Autonomous | Multi-stage lifecycle, evidence gates |
