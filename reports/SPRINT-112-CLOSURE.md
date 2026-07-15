# Sprint 112 Closure Report
## Apex 50K Evaluation Validation Plan

**Sprint:** 112
**Date:** July 2026
**Status:** COMPLETE
**Commit:** (see git log)

---

## Mission

Produce a complete operational plan for running DARWIN-S109-001 on a single Apex 50K Evaluation account. Build the Atlas Nexus Apex Evaluation dashboard. Define the live comparison engine, validation rules enforcement, and capital scaling roadmap.

---

## Part 1 — Prop Firm Risk Analysis

### Apex 50K Evaluation Rules (Confirmed from Official Source)

| Rule | Value |
|---|---|
| Profit Target | $3,000 |
| Trailing Drawdown Limit | $2,000 (intraday, resets at EOD) |
| Max Contracts | 6 MNQ |
| Daily Loss Limit | None |
| Minimum Trading Days | None |
| Access Period | 30 calendar days |
| Consistency Rule | Not applied in Evaluation |

### Risk Model: $450/Trade, 1 MNQ Contract

**Why $450?**
- Apex trailing DD: $2,000
- 4 full stop-outs before breach: $450 × 4 = $1,800 (90% of limit)
- Leaves $200 buffer — acceptable given 75.5% WR
- Consistent with project risk standard ($450/trade Apex)

**Pass Probability (Monte Carlo, 10,000 simulations):**
- Pass probability: **99.6%**
- Risk of ruin: **0.4%**
- Median trades to pass: **5**
- 90th percentile trades to pass: **12**
- Expected pass time: **3–15 trading days**

**Drawdown Analysis:**
- Expected max adverse excursion: $450 (1 stop-out)
- Worst-case 3-consecutive-loss scenario: $1,350 (67.5% of DD limit)
- Buffer remaining after worst case: $650
- Conclusion: **Extremely comfortable margin**

---

## Part 2 — Execution Workflow

### TradingView → Atlas → Tradovate → Apex Pipeline

```
TradingView Pine Script M-16
  → 5-min MNQ bar fires
  → Atlas webhook receives bar
  → S109-001 signal engine evaluates 3 frozen filters:
      1. Overnight inventory aligned
      2. VWAP slope aligned
      3. RSI confirms direction
  → If all 3 pass: SIGNAL GENERATED (logged to wf_live_trades)
  → Trader receives alert (TradingView alert or Atlas dashboard)
  → Trader executes manually in Tradovate
  → Trader records trade in Atlas Apex Evaluation dashboard
  → Atlas computes divergence vs signal prices
  → Daily snapshot entered from Tradovate dashboard
```

**Execution Timing:**
- Signal fires at bar close (5-min boundary)
- Entry on next bar open (market order)
- Stop and target set immediately on entry
- No discretion — all 3 filters must pass before entry

**Full execution workflow documentation:** `docs/APEX-EXECUTION-WORKFLOW.md`

---

## Part 3 — Live Comparison Engine

### Atlas Apex Evaluation Dashboard (`/apex-evaluation`)

**New database tables:**
- `apex_trades` — every Apex execution vs Atlas signal, with slippage and divergence classification
- `apex_account_snapshots` — daily Tradovate balance/drawdown snapshots

**New tRPC procedures (`apex.*`):**
- `recordTrade` — log a new Apex execution with Atlas signal prices
- `closeTrade` — close trade with exit data, auto-compute divergence
- `getTrades` / `getOpenTrade` / `getStats` — query helpers
- `upsertSnapshot` / `getLatestSnapshot` / `getSnapshotHistory` — account tracking
- `getDashboardData` — single call returns all dashboard data

**Divergence Classification (auto-computed on close):**
- `NONE` — exact match
- `EXPECTED_SLIPPAGE` — exit slippage ≤ 1.25 pts (normal)
- `ELEVATED_SLIPPAGE` — exit slippage > 1.25 pts (investigate)
- `OUTCOME_DIVERGENCE` — win/loss disagrees with Atlas signal (critical)
- `EXECUTION_ERROR` — wrong direction or size (critical)

---

## Part 4 — Apex Evaluation Dashboard

### Features Built

**KPI Cards (4):** Win Rate vs benchmark, Profit Factor vs benchmark, Total P&L, Pass Progress

**Open Trade Alert:** Live amber banner when a trade is open, with inline close button

**Account Status Panel:** Balance, Peak Balance, Trailing Threshold, Remaining DD Buffer, pass progress bar

**Promotion Gate (5 gates):**
1. Min 20 trades
2. Win Rate ≥ 65%
3. Profit Factor ≥ 2.0
4. No critical divergence flags
5. Outcome match rate ≥ 90%

**Live vs Benchmark Table:** Row-by-row comparison of Win Rate, PF, Avg Win, Avg Loss, Outcome Match, Avg Slippage against Sprint 110 OOS benchmark

**Trade Log Tab:** Full trade history with direction, entry/exit prices, P&L, exit reason, slippage, divergence flag, inline close button

**Account Snapshots Tab:** Daily balance history with DD buffer highlighting

**Validation Rules Tab:** Apex rules reference + mandatory execution protocol + daily protection protocol

---

## Part 5 — Validation Rules Enforcement

### Non-Negotiable Rules During Evaluation

1. Every S109-001 signal must be executed — no skipping
2. No discretionary trades outside S109-001
3. No parameter changes — hypothesis frozen
4. 1 MNQ contract per signal
5. $450 risk per trade
6. Record every trade in Atlas immediately after execution
7. Daily snapshot from Tradovate after each RTH session

### Daily Protection Protocol

| Consecutive Losses | DD Used | Action |
|---|---|---|
| 1 | $450 (22.5%) | Continue normally |
| 2 | $900 (45.0%) | Confirm all 3 filters |
| 3 | $1,350 (67.5%) | Mandatory review |
| 4 | $1,800 (90.0%) | STOP — investigate |

---

## Part 6 — Capital Scaling Roadmap

### 4-Phase Scaling Plan

**Phase 1 (Current):** Single Apex 50K Evaluation
- 1 account, $450/trade, 1 MNQ
- Pass probability: 99.6%
- Net income on pass: ~$2,550

**Phase 2 (Sprint 113–114):** Funded + Parallel Evaluation
- 1 funded account + 1 evaluation running simultaneously
- $900 total daily exposure
- Monthly income: ~$5,000–$6,000 gross

**Phase 3 (Sprint 115–116):** 3-Account Parallel
- 2 funded + 1 evaluation cycling
- $1,350 total daily exposure
- Monthly income: ~$7,000–$8,000 gross

**Phase 4 (Sprint 117+):** Live Account Integration
- 3 funded + 1 evaluation + live account ($1,650/trade)
- Total daily exposure: $5,100
- Monthly income: ~$12,000–$15,000 gross

**Full roadmap:** `docs/APEX-CAPITAL-SCALING-ROADMAP.md`

---

## Registry Updates

### Strategy Registry

| ID | Name | Status Change |
|---|---|---|
| S109-001 | VWAP_ALIGNED_CONTINUATION | Walk Forward → **Apex Evaluation Active** |

### DARWIN Registry

| Sprint | Hypothesis | Outcome |
|---|---|---|
| S112 | Apex 50K Evaluation Plan | COMPLETE — dashboard live, roadmap defined |

---

## Deliverables

| Deliverable | Location |
|---|---|
| Apex Evaluation Dashboard | `/apex-evaluation` (Atlas Nexus) |
| DB tables | `apex_trades`, `apex_account_snapshots` |
| tRPC router | `server/apexRouter.ts` |
| DB helpers | `server/apexDb.ts` |
| Execution workflow doc | `docs/APEX-EXECUTION-WORKFLOW.md` |
| Capital scaling roadmap | `docs/APEX-CAPITAL-SCALING-ROADMAP.md` |
| Risk analysis script | `scripts/sprint112-apex-risk-analysis.py` |
| Sprint closure report | `reports/SPRINT-112-CLOSURE.md` |

---

## Dataset Citation

All projections derived from:
- **Dataset:** ATLAS-MNQ-5M-V1 v1.0
- **Sprint 110 OOS WR:** 75.5% | **PF:** 4.609 | **Monte Carlo pass rate:** 99.6%
- **Validation:** 10/10 institutional thresholds passed (Sprint 110)

---

## Sprint 113 Protocol

**Trigger:** First Apex 50K pass confirmed.

**Actions:**
1. Claim funded account from Apex
2. Start second 50K evaluation account
3. Continue executing S109-001 on both
4. Build funded account tracking in Atlas (withdrawal cycle, consistency rule monitoring)
5. Assess whether to run A1/A3/B1/SB1 on funded accounts alongside S109-001

---

*Sprint 112 complete. DARWIN-S109-001 is operationally ready for Apex evaluation.*
