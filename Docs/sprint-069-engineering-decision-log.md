# Engineering Decision Log & Critical Self Review
## Sprint 069: M-07 Atlas Decision Engine (ADE)
**Date:** 2026-07-10
**Author:** Manus AI
**Version:** v1.0.0-alpha.5

---

## 1. Executive Summary

This document serves as the permanent engineering record for Sprint 069, satisfying Atlas Engineering Rules 11 and 17. It details the architectural decisions, assumptions, and critical self-review findings for the implementation of **M-07 (Atlas Decision Engine)**.

M-07 is the central intelligence node of Atlas. It receives up to three `TradeProposal` objects (from A1, A3, B1), calculates a 7-component Edge Score for each, ranks them deterministically, and selects a single winner to pass to the Risk Intelligence (ARI) layer.

---

## 2. Engineering Decisions (Rule 11)

### 2.1 Edge Score Architecture (C1–C7)
**Decision:** The Edge Score is implemented as a 100-point deterministic evaluation function (`f_calculate_edge_score`), evaluating 7 distinct components (C1–C7).
**Why:** To satisfy the APS requirement for a quantifiable, deterministic confidence metric that abstracts model-specific logic into a universal ranking system.
**APS Reference:** Section 4.2 (Edge Score Components).
**Assumptions:** 
- The Market State Object (MSO) contains all required fields (e.g., `trend_strength`, `volcomp_ratio`).
- Historical Win Rate (C6) and Production Reliability (C7) are hardcoded per the Sprint 062 ADE specification, as Pine Script cannot dynamically query historical performance across multiple assets.

### 2.2 Deterministic Tie-Breaking
**Decision:** In the event of an Edge Score tie, the selection defaults to the model with the highest historical Production Reliability (C7), followed by hardcoded hierarchy (A1 > A3 > B1).
**Why:** Atlas must be 100% deterministic. A random or arbitrary selection would violate the Final Engineering Principle.
**APS Reference:** Section 4.3 (Candidate Ranking).

### 2.3 DecisionReport UDT Structure
**Decision:** The `DecisionReport` UDT is designed to contain not only the winning proposal but also the full Edge Score breakdown and ranking strings for all candidates.
**Why:** To provide maximum observability for the Web Command Centre (Track B) and the Atlas Brain. The decision rationale must be fully transparent.
**APS Reference:** Section 4.4 (Observability Output).

---

## 3. Critical Self Review (Rule 17)

Per Rule 17, a rigorous attempt was made to find logic errors, edge cases, and state transition failures in M-07.

### 3.1 Edge Case: No Valid Proposals
**Finding:** If all models return `has_signal = false`, the ADE correctly returns a `DecisionReport` with `has_candidate = false` and `model_id = "NONE"`.
**Risk:** Low. The system safely passes an empty proposal to ARI, which will naturally reject it.

### 3.2 Edge Case: MVC Strength (C5) for B1 Model
**Finding:** The B1 model does not strictly require MVC alignment. However, C5 (MVC Strength) awards up to 15 points based on MVC status. If B1 triggers without an MVC, it is severely penalised in the Edge Score.
**Risk:** Medium. B1 may consistently lose to A1/A3 if they have MVC alignment, even if B1 is the superior setup.
**Mitigation:** Documented as a known limitation. Future sprints may require a model-specific weighting modifier for C5.

### 3.3 State Failure: MSO Dependency
**Finding:** The `f_calculate_edge_score` function relies heavily on the `MarketState` object (MSO). If M-03 fails to populate a field (e.g., `volcomp_ratio` is `na`), the score calculation will yield `na`, causing the model to be disqualified.
**Risk:** High. Pine Script math with `na` propagates `na`.
**Mitigation:** Implemented `nz()` wrapping on all MSO field accesses within the scoring function to ensure a valid integer/float is always returned.

### 3.4 Logic Error: Trend Alignment (C1) Direction Matching
**Finding:** C1 awards 20 points if the proposal direction matches the macro trend. The logic `(prop.dir == 1 and mso.trend_dir == 1) or (prop.dir == -1 and mso.trend_dir == -1)` correctly handles LONG and SHORT. However, if `mso.trend_dir == 0` (ranging), neither gets points.
**Risk:** Low. This is the intended behaviour (ranging markets should not award trend alignment points).

---

## 4. Discrepancies Requiring Approval (Rule 12)

The following discrepancies from the APS were identified during implementation:

| ID | Module | Discrepancy | Severity | Recommendation |
|:---|:-------|:------------|:---------|:---------------|
| **D-069-01** | M-07 | C6 (Historical Win Rate) and C7 (Production Reliability) are hardcoded constants. | Medium | **Approve hardcoding.** Pine Script cannot dynamically query external databases for live performance metrics. |
| **D-069-02** | M-07 | The `DecisionReport` UDT exceeds the 10-field limit for Pine Script tuple returns if unpacked directly. | Low | **Approve UDT return.** The function returns the UDT object itself, not a tuple, avoiding the limitation. |

---
*End of Document*
