# Sprint 083 — Dollar-Risk Position Sizing
## Engineering Documentation

**Sprint:** 083  
**Date:** 2026-07-11  
**Author:** Atlas Engineering  
**Status:** COMPLETE — Awaiting Sunday market open for live dry-run validation

---

## 1. Objective

Replace the legacy multiplier-based contract sizing formula in M-14 (`atlas_core.pine`) and M-15 (`atlas_observability_webhook.pine`) with a deterministic dollar-risk formula. The new formula derives contract count directly from the stop distance in points, the instrument point value, and a configured dollar risk budget. This eliminates the ambiguity of the previous `i_base_risk × multiplier` approach and makes the risk budget explicit, auditable, and directly comparable across all four execution profiles.

---

## 2. Architecture Decision — Single Script vs. Four Isolated Builds

The Sprint 083 spec originally proposed four physically isolated Pine Script builds (one per profile). After review, this was simplified to a single script with a configurable `ATLAS EXECUTION PROFILE` Settings group. The rationale is as follows.

The physical isolation concern is valid for simultaneous multi-account deployment. However, Atlas currently operates only one active profile (ATLAS PAPER — $100 RISK — SIMULATION ONLY). The four-build approach introduces maintenance overhead without providing safety benefit at this stage. When Apex evaluation and live accounts are activated in a future deployment sprint, the correct procedure is to duplicate the TradingView layout, change the Dollar Risk input, and create a new alert pointing to a dedicated TradersPost strategy. This achieves the same physical isolation without maintaining four separate Pine Script files.

The four profile build files generated during this sprint (`/pine-script/profiles/`) are retained in the repository as reference templates for that future deployment step.

---

## 3. Formula Specification

### 3.1 Core Formula

```
stop_distance_points  = |entry_price − stop_price|
risk_per_contract     = stop_distance_points × point_value
raw_contracts         = floor(dollar_risk / risk_per_contract)
contracts             = min(raw_contracts, max_contracts)
estimated_risk        = contracts × risk_per_contract
```

**Invariant:** `estimated_risk ≤ configured_risk` is guaranteed by `floor()`. A belt-and-suspenders assertion is included in the code.

**Rejection path:** If `contracts < 1`, the trade is rejected with reason `RISK_TOO_SMALL_FOR_ONE_CONTRACT`. This occurs when the stop distance is so wide that even one contract would cost more than the configured dollar risk budget.

### 3.2 ARI Multiplier Interaction

The ARI multiplier (caution / compound) adjusts the **effective dollar risk budget**, not the stop distance. This is the correct behaviour: the stop is set by the model's edge logic and must not be compressed to fit a budget.

```
effective_dollar_risk = i_dollar_risk × current_mult
```

Where `current_mult` is:
- `i_ari_caution_mult` (< 1.0) after 2+ consecutive losses
- `i_ari_compound_mult` (> 1.0) after 3+ consecutive wins
- `1.0` otherwise

---

## 4. Contract-Sizing Test Matrix

The following table validates the formula across representative stop distances for each execution profile. Point value for MNQ is **$2.00 per point**.

| Profile | Dollar Risk | Stop Distance (pts) | Risk/Contract | Raw Contracts | Max Contracts | **Contracts** | Est. Risk | Within Budget |
|---|---|---|---|---|---|---|---|---|
| PAPER | $100 | 8.00 | $16.00 | 6 | 5 | **5** | $80.00 | ✓ |
| PAPER | $100 | 10.00 | $20.00 | 5 | 5 | **5** | $100.00 | ✓ |
| PAPER | $100 | 12.00 | $24.00 | 4 | 5 | **4** | $96.00 | ✓ |
| PAPER | $100 | 15.00 | $30.00 | 3 | 5 | **3** | $90.00 | ✓ |
| PAPER | $100 | 20.00 | $40.00 | 2 | 5 | **2** | $80.00 | ✓ |
| PAPER | $100 | 25.00 | $50.00 | 2 | 5 | **2** | $100.00 | ✓ |
| PAPER | $100 | 30.00 | $60.00 | 1 | 5 | **1** | $60.00 | ✓ |
| PAPER | $100 | 55.00 | $110.00 | 0 | 5 | **REJECT** | — | RISK_TOO_SMALL |
| APEX EVAL | $900 | 8.00 | $16.00 | 56 | 5 | **5** | $80.00 | ✓ |
| APEX EVAL | $900 | 10.00 | $20.00 | 45 | 5 | **5** | $100.00 | ✓ |
| APEX EVAL | $900 | 20.00 | $40.00 | 22 | 5 | **5** | $200.00 | ✓ |
| APEX EVAL | $900 | 90.00 | $180.00 | 5 | 5 | **5** | $900.00 | ✓ |
| APEX EVAL | $900 | 100.00 | $200.00 | 4 | 5 | **4** | $800.00 | ✓ |
| APEX FUNDED | $450 | 10.00 | $20.00 | 22 | 5 | **5** | $100.00 | ✓ |
| APEX FUNDED | $450 | 50.00 | $100.00 | 4 | 5 | **4** | $400.00 | ✓ |
| LIVE | $1,650 | 10.00 | $20.00 | 82 | 5 | **5** | $100.00 | ✓ |
| LIVE | $1,650 | 165.00 | $330.00 | 5 | 5 | **5** | $1,650.00 | ✓ |
| LIVE | $1,650 | 200.00 | $400.00 | 4 | 5 | **4** | $1,600.00 | ✓ |

**Key observations:**

The `max_contracts = 5` cap is the binding constraint for APEX EVAL, APEX FUNDED, and LIVE profiles at typical MNQ stop distances (8–30 points). For the PAPER profile at $100, the formula becomes the binding constraint at wider stops. The rejection threshold for PAPER is any stop wider than 50 points (50 × $2.00 = $100.00 exactly allows 1 contract; 51 points would reject).

---

## 5. ATLAS EXECUTION PROFILE Settings Group

Both M-14 and M-15 now include the following Settings group, replacing the legacy `Account Configuration` and `GRP_KERN` groups respectively.

| Input | Variable | Default | Description |
|---|---|---|---|
| Profile Name | `i_profile_name` | "ATLAS PAPER — MNQ" | Human-readable label shown in chart banner |
| Execution Mode | `i_execution_mode` | "PAPER" | PAPER / EVALUATION / FUNDED / LIVE |
| Account Type | `i_account_type` | "PAPER" | PAPER / PROP / LIVE |
| Dollar Risk Per Trade | `i_dollar_risk` | 100 | Maximum dollar risk budget per trade |
| Instrument Point Value | `i_point_value` | 2.0 | $/point (MNQ = $2.00, NQ = $20.00) |
| Maximum Contracts | `i_max_contracts` | 5 | Hard ceiling on contract count |
| Daily Loss Limit | `i_daily_loss_limit` | -500 | Account-level daily loss limit |
| Profile ID | `i_profile_id` | "ATLAS_PAPER_MNQ" | Machine-readable identifier for webhook |
| Execution Armed | `i_execution_armed` | false | Safety gate for non-PAPER modes |

---

## 6. Chart Safety Banner

M-14 now renders a permanent label in the top-right of the chart on every bar. The banner displays:

```
[ATLAS PAPER — MNQ]  MODE: PAPER  RISK: $100  MAX: 5c  DEST: SIMULATION  STATUS: SIMULATION
```

For PAPER mode, the banner is teal. For non-PAPER modes, the banner is red when ARMED and yellow when DISARMED. The banner cannot be disabled — it is a permanent safety indicator.

---

## 7. Webhook Payload Changes (M-15)

The `ari_decision` JSON block in M-15 now includes the following additional fields:

| Field | Type | Example |
|---|---|---|
| `profile_id` | string | `"ATLAS_PAPER_MNQ"` |
| `profile_name` | string | `"ATLAS PAPER — MNQ"` |
| `execution_mode` | string | `"PAPER"` |
| `account_type` | string | `"PAPER"` |
| `execution_armed` | bool | `false` |
| `configured_risk_dollars` | float | `100.0` |
| `estimated_risk_dollars` | float | `80.0` |
| `risk_difference_dollars` | float | `20.0` |
| `stop_distance_points` | float | `10.0` |
| `risk_per_contract` | float | `20.0` |
| `point_value` | float | `2.0` |
| `maximum_contracts` | int | `5` |
| `contracts` | int | `4` |

These fields are extracted by `normalisePayload()` in `nexusRoutes.ts` and stored in the pipeline report payload. They are surfaced on the Execution Profiles page in Atlas Nexus.

---

## 8. Nexus Execution Profiles Page (Part 10)

A new page at `/execution-profiles` was added to Atlas Nexus. The page is accessible from the EXECUTION section of the sidebar under "Exec Profiles".

The page displays all four profiles as cards with the following information:

- **Active profile (ATLAS PAPER):** Live data from the latest webhook including last signal, ARI approval, TVL status, circuit breaker state, daily P&L, drawdown, and the full sizing calculation breakdown (stop distance, risk per contract, contracts, estimated risk, remaining budget).
- **Inactive profiles:** Static configuration only (configured risk, max contracts, daily limit, point value, preview contract count at current ATR). Includes activation instructions.

A deployment rule banner at the top of the page states the current authorised mode. The formula reference block shows the full sizing formula for operator verification.

---

## 9. Bug Fixes

### 9.1 Double Rejection Increment (M-14)

The ARI block previously incremented `v_trades_rejected` twice when a trade was rejected by the sizing formula: once inside the `if calc_contracts < 1` block and once in the outer `if not ari_approved` guard. The outer guard was removed.

### 9.2 Duplicate `t_preview` Declaration (M-15)

The Sprint 083 edit appended a new 24-row `t_preview` declaration without removing the original 20-row declaration. The duplicate was removed. Pine Script does not allow two `var` declarations of the same name.

---

## 10. Dry-Run Validation Plan

The following validation steps are scheduled for the next trading session (Sunday 6PM ET):

| Step | Method | Pass Criterion |
|---|---|---|
| Formula fires on first signal | Observe webhook payload | `ari_decision.contracts ≥ 1` |
| Stop distance matches chart | Compare `stop_distance_points` to chart stop | ±0.25 points tolerance |
| Estimated risk ≤ configured risk | Check `estimated_risk_dollars ≤ configured_risk_dollars` | Must be true on every bar |
| Profile ID in payload | Check `ari_decision.profile_id` | `"ATLAS_PAPER_MNQ"` |
| Chart banner visible | Visual inspection | Teal banner, correct values |
| Nexus Exec Profiles page shows live data | Navigate to `/execution-profiles` | PAPER card shows live sizing |
| RISK_TOO_SMALL rejection | Widen stop manually in test | `ari_rejection = "RISK_TOO_SMALL_FOR_ONE_CONTRACT"` |

---

## 11. Files Modified

| File | Change |
|---|---|
| `pine-script/core/atlas_core.pine` | ATLAS EXECUTION PROFILE inputs, dollar-risk formula, chart banner, double-rejection bug fix |
| `pine-script/core/atlas_observability_webhook.pine` | ATLAS EXECUTION PROFILE inputs, ARI sizing block, JSON payload fields, duplicate t_preview fix |
| `pine-script/profiles/atlas_paper_mnq.pine` | New — PAPER profile reference build |
| `pine-script/profiles/atlas_apex50_eval_mnq.pine` | New — APEX 50K EVAL reference build |
| `pine-script/profiles/atlas_apex50_funded_mnq.pine` | New — APEX 50K FUNDED reference build |
| `pine-script/profiles/atlas_live_mnq.pine` | New — LIVE reference build |
| `server/nexusRoutes.ts` | `normalisePayload()` — 13 new profile/sizing fields extracted |
| `client/src/pages/ExecutionProfiles.tsx` | New — Execution Profiles page |
| `client/src/App.tsx` | Route `/execution-profiles` added |
| `client/src/components/OrionLayout.tsx` | "Exec Profiles" nav item added to EXECUTION group |

---

## 12. Critical Self-Review

**What could go wrong in live trading:**

The `RISK_TOO_SMALL_FOR_ONE_CONTRACT` rejection is the most likely failure mode for the PAPER profile at $100. MNQ A1 stops are typically 8–15 points (risk $16–$30 per contract), so 1–6 contracts are always available. However, if a wide-stop bar fires (e.g., during high volatility with a 55-point stop), the trade will be silently rejected. This is correct behaviour — the system must not exceed the configured risk budget — but the operator should monitor the ARI rejection log for this reason code.

**What has not been tested:**

The ARI multiplier interaction (caution/compound) has not been exercised in live conditions with the new formula. The multiplier reduces or increases `effective_dollar_risk`, which changes the contract count. A caution multiplier of 0.5 on a $100 PAPER profile with a 20-point stop would yield `floor(50 / 40) = 1` contract instead of 2. This is correct and expected.

**Deployment sequence for future profiles:**

When activating APEX EVAL, the operator must: (1) duplicate the TradingView layout, (2) change `i_dollar_risk` to 900, `i_execution_mode` to EVALUATION, `i_profile_id` to ATLAS_APEX50_EVAL_MNQ, and `i_execution_armed` to true, (3) create a new TradingView alert pointing to the dedicated TradersPost strategy, (4) document the activation in Version Governance, and (5) run the dry-run validation checklist above before allowing live orders.
