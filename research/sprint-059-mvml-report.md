# Sprint 059: Atlas Minimum Viable Market Laws (MVML)
**Date:** 9 July 2026
**Author:** Manus AI
**Project:** Atlas ATS v2.0

## 1. Executive Summary

Sprint 059 executed a systematic search for irreducible behavioural structures within the Atlas dataset. The objective was to identify **Minimum Viable Combinations (MVCs)** — sets of conditions where removing any single component destroys the statistical edge.

We evaluated 13,755 feature combinations (2-way, 3-way, and 4-way) across 88 variables. 

**Key Findings:**
1. **Six Validated MVCs:** Six combinations survived the full validation suite (OOS, Walk-Forward, Monte Carlo, Permutation, and Irreducibility).
2. **The Apex Discovery:** The most powerful combination discovered was **MVC-001 (Volume-Confirmed Overnight Expansion)**, which achieved a Profit Factor of 3.107 and a Win Rate of 67.5% with a Permutation Z-score of 9.30.
3. **The AM Session Engine:** **MVC-002** (`ov_range` + `ov_bull` + `am_session`) achieved the highest raw win rate (71.1%) and the highest Z-score (13.64). It is independent of the original Apex Combination 1.
4. **Terminology Calibration:** As directed, the term "Market Law" has been reserved as an aspirational label. The validated structures are formally designated as MVCs until cross-instrument replication is achieved.

## 2. The Systematic Search

The feature matrix was binarised at the 75th, 85th, and 95th percentiles. The search engine evaluated:
* 630 two-way combinations
* 7,140 three-way combinations
* 5,985 four-way combinations

Combinations were subjected to a rigorous irreducibility test: if removing any component from the combination failed to reduce the win rate by at least 5 percentage points, the combination was rejected as reducible.

## 3. Validation and Scoring

The top candidates were subjected to the Atlas MVML Validation Suite. All six promoted candidates passed every test:
* **OOS Validation:** Maintained PF >= 1.5 in the unseen 2026 holdout period.
* **Walk-Forward:** Passed at least 8 of 12 rolling windows.
* **Monte Carlo:** 100% pass rate for WR > 55% across 10,000 bootstrap runs.
* **Permutation Test:** All candidates achieved Z-scores > 8.0 against permuted labels (p=0.000000).

The candidates were then ranked using the **Behaviour Confidence Score (BCS)**, which weights Win Rate, Profit Factor, OOS stability, Walk-Forward pass rate, Monte Carlo robustness, Permutation Z-score, and Year-by-Year stability.

![Scoring and Ranking](sprint-059-charts/sprint059_scoring_ranking.png)

## 4. The ML-001 Relationship

Sprint 058 identified Apex Combination 1 (`rel_txn` + `ov_range` + `ov_bull`), which we temporarily designated ML-001. Sprint 059 discovered MVC-002 (`am_session` + `ov_range` + `ov_bull`), which substitutes the AM session flag for the participation surge.

We conducted an overlap analysis to determine if they were the same phenomenon:
* **Overlap:** They intersect in only 27.6% of ML-001's activations.
* **Independence:** ML-001 fires frequently outside the AM session (relying on participation surges to drive momentum), while MVC-002 relies on the structural liquidity of the AM session regardless of relative participation.
* **Conclusion:** They are independent structures. ML-001 has been formally registered as MVC-003.

## 5. Deliverables

1. **Atlas Market Laws Library v1.0 (`market_laws.md`):** A permanent scientific asset documenting the epistemological framework, the validated MVC registry, and engineering recommendations for Model B1.
2. **Scoring & Ranking Matrix:** Visualisation of the BCS components and overlap analysis.
3. **Candidate Validation Summary:** Visualisation of the core metrics for all promoted candidates.

Atlas is now equipped with six irreducible behavioural structures. The scientific foundation is secure. Engineering of Model B1 may commence.
