# Atlas Engineering Decision Log
**Sprint:** 070
**Module:** M-08 Atlas Risk Intelligence (ARI)
**Date:** 2026-07-10

## 1. Module Overview
M-08 `atlas_risk_intelligence` serves as the capital allocation authority in the Atlas system. It evaluates the winning `CandidateModel` against the strict risk parameters defined in `RiskState`, calculating the final position size (contracts) and enforcing all halts, pauses, and circuit breakers.

## 2. Engineering Decisions (Rule 11)

### 2.1 Decision: Stateless Implementation
**Rationale:** The APS and Pine Engineering Spec mandate that M-02 is the sole owner of persistent state. M-08 was implemented as a pure, stateless functional block. It consumes the `RiskState` snapshot from M-02, evaluates it against the `CandidateModel`, and returns an `ApprovedTrade` and a `RiskDecision` tuple.
**APS Section:** 5.1 (ARI Rules)
**Assumptions:** M-02 correctly manages and updates `consecutive_losses`, `circuit_breaker`, and `risk_multiplier`.

### 2.2 Decision: Risk Budget Enforcement
**Rationale:** The daily loss limit (R3) prevents trading *after* the limit is breached. However, a new trade could theoretically breach the limit if it loses. A `f_check_risk_budget` function was implemented to project the potential loss of the proposed trade and reject it if `(daily_pnl - proposed_risk) >= limit`.
**APS Section:** 5.2 (Capital Protection)
**Limitations:** Assumes zero slippage. In highly volatile markets, the actual loss could exceed the projected `proposed_risk`.

### 2.3 Decision: Contract Calculation Floor/Ceiling
**Rationale:** The contract calculation uses `math.floor(target_risk_dollars / (risk_pts * point_value))`. To ensure valid inputs to the execution engine, the result is clamped between `1` and `max_contracts`.
**APS Section:** 5.3 (Position Sizing)
**Assumptions:** The `base_risk` is sufficiently large to afford at least 1 contract for all valid `risk_pts` distances.

## 3. Critical Self Review (Rule 17)

### Finding 1: Multiplier Application Separation
**Issue:** M-08 uses the `risk_multiplier` provided by M-02, but the APS specifies that ARI *applies* the multiplier.
**Resolution:** M-02 tracks the consecutive loss/win streaks and updates the multiplier state. M-08 correctly consumes this state and applies it to the `target_risk_dollars` calculation. This separation of concerns is architecturally sound and prevents state mutation in M-08.

### Finding 2: Session End Block (R8)
**Issue:** The session end block was hardcoded to 15:45 ET.
**Resolution:** This matches the standard RTH session close buffer. It was implemented using `hour()` and `minute()` functions locked to the `"America/New_York"` timezone to ensure deterministic behaviour regardless of the user's local timezone.

### Finding 3: Missing Extended Rules
**Issue:** The APS TVL specification mentions 18 rules, but only 8 core rules (R1-R8) and the budget check were explicitly implemented in the evaluation engine.
**Resolution:** The remaining rules (e.g., duplicate signal prevention, RR validation) are defined as TVL (Trade Verification Layer) responsibilities in the Pine Engineering Spec (Sprint 071). They will be implemented in M-09.

## 4. Discrepancies (Rule 12)

| ID | Description | Recommendation |
|:---|:------------|:---------------|
| **D-070-01** | The `RiskDecision` UDT is returned as a tuple of primitives rather than an object. | **Approve.** This is a known Pine Script v5 limitation for library exports and matches the pattern established in M-07. |
| **D-070-02** | R8 (Session End) is hardcoded to 15:45 ET. | **Approve.** This ensures the system does not enter new positions in the final 15 minutes of RTH, preventing forced liquidations by the broker. |
