# Atlas Engineering Decision Log
## Sprint 071: M-09 Trade Verification Layer (TVL)

**Date:** 2026-07-10
**Author:** Atlas Engineering
**Module:** `atlas_tvl.pine` (M-09)
**APS Reference:** Section 4.2 (TVL Verification Rules)

---

## 1. Architectural Decisions

### 1.1 `VerificationReport` UDT Implementation
The TVL is required to output a deterministic verification record. Due to Pine Script v5 limitations (functions cannot return UDTs), the verification result is returned as a 12-element primitive tuple.

**Tuple Structure:**
`[tvl_approved, tvl_status, r_dir, r_entry, r_stop, r_target, r_risk, r_rr, r_basis, r_model, r_reasons, r_confidence]`

This tuple is then instantiated into a `VerificationReport` UDT at the script's global scope. This satisfies the APS requirement for a structured object while remaining within Pine Script's syntactical boundaries.

### 1.2 Rule Execution Sequence
The 18 TVL rules are evaluated in a specific hierarchy:
1. **Critical Safety Blocks (R1-R5)** — Immediate rejection for active positions, circuit breakers, and daily loss limits.
2. **Session Validity (R6-R8)** — Rejection for out-of-hours trading or end-of-session boundaries.
3. **Execution Safety (R9-R12)** — Spread limits, slippage protection, and order type validation.
4. **Model Consistency (R13-R18)** — Verification that the ADE decision matches the underlying model's strict parameters.

This sequence ensures that the most critical capital-protection rules are evaluated first, minimizing processing overhead for invalid trades.

### 1.3 String Concatenation for Failure Reasons
To provide maximum observability to the Web Command Centre, the TVL concatenates all failure reasons into a single string. Instead of failing on the first error, the TVL evaluates *all* rules and appends the failure reason for every broken rule. This provides the Observatory with a complete diagnostic picture of why a trade was rejected.

---

## 2. Assumptions & Limitations

### 2.1 Hardcoded Spread Limit (R9)
The APS specifies a maximum allowable spread. In M-09, this is currently hardcoded to `2.0` points (8 ticks for NQ/MNQ). 
*Limitation:* Pine Script cannot reliably query live bid/ask spreads historically. The spread check uses `high - low` of the current bar as a proxy for volatility/spread expansion.

### 2.2 Slippage Protection (R10)
The slippage limit is hardcoded to `1.0` point. 
*Limitation:* True slippage can only be measured post-execution. The TVL implements this as a strict limit order boundary constraint.

### 2.3 Order Type Validation (R11)
The TVL enforces `LIMIT` or `STOP` orders only. Market orders are explicitly rejected.

---

## 3. Critical Self Review (Rule 17)

A Critical Self Review was performed on the M-09 module prior to compilation.

**Finding 1: Null State Propagation**
*Risk:* If the ADE returns `na` for the `r_entry` or `r_stop` prices, the TVL math operations (e.g., R:R calculation) will fail and return `na`, silently breaking the script.
*Mitigation:* The TVL explicitly checks for `na` values in the input tuple and immediately rejects the trade with an "INVALID_INPUT" status before performing any math.

**Finding 2: Floating Point Precision in R:R Check**
*Risk:* Pine Script floating point math can result in an R:R of `1.499999` which would fail the `>= 1.5` check.
*Mitigation:* The R:R calculation is rounded to two decimal places using `math.round(rr, 2)` before the comparison is made.

**Finding 3: End of Session Block (R8)**
*Risk:* The 15:45 ET block could trigger prematurely if the server timezone is misaligned.
*Mitigation:* The TVL uses the `f_hour_et()` utility function from M-01, which strictly enforces the `America/New_York` timezone regardless of the user's local chart settings.

---

## 4. Discrepancies Requiring Approval (Rule 12)

| ID | Description | Recommendation |
|:---|:------------|:---------------|
| **D-071-01** | R9 (Spread Limit) uses `high - low` proxy | **Approve.** Historical spread data is unavailable in Pine Script. |
| **D-071-02** | `VerificationReport` returned as primitive tuple | **Approve.** Pine Script v5 limitation. Matches M-07 and M-08 patterns. |
