# APEX 50K EVALUATION — EXECUTION WORKFLOW
## DARWIN-S109-001 | VWAP_ALIGNED_CONTINUATION | Sprint 112

**Version:** 1.0
**Date:** 2026-07-15
**Status:** OPERATIONAL PLAN — Pending account activation
**Hypothesis:** DARWIN-S109-001 — FROZEN, no optimisation permitted

---

## Part 2 — Complete Execution Workflow

### Pipeline Architecture

```
TradingView (M-16 Pine Script)
        │
        │  5-min bar close (RTH only, 09:30–16:00 ET)
        │  Payload: OHLCV + indicators (VWAP, RSI, ATR, EMA9/21, ADX)
        │  Method: HTTPS POST webhook
        │
        ▼
Atlas Webhook Endpoint
        │  POST /api/webhook/observe/:token
        │  Auth: ATLAS_WEBHOOK_TOKEN (64-char hex)
        │  Validation: schema, timeframe=5, idempotency
        │
        ▼
Atlas Signal Engine (nexusRoutes.ts)
        │
        ├── normalisePayload() — extract flat fields from nested M-16 JSON
        ├── atlasMemoryDb.ts — store bar in atlas_memory table
        ├── Monitor hook — session report, system health
        ├── Live Learning hook — model evaluation
        │
        └── S109-001 Walk-Forward Engine (wfDb.ts)
                │
                ├── EXIT CHECK: if open trade → evaluate stop/target/time-stop
                │     Stop:      entry ± 1.0×ATR14 → loss = -$450
                │     Target:    entry ± 2.0×ATR14 → gain = +$900
                │     Time-stop: 16 bars (80 min) → close at market
                │
                └── ENTRY CHECK: if no open trade → evaluate all 3 filters
                      Filter 1: OV Inventory Aligned
                        LONG:  overnight_inventory = LONG
                        SHORT: overnight_inventory = SHORT
                      Filter 2: VWAP Slope Aligned
                        LONG:  3-bar VWAP slope > 0
                        SHORT: 3-bar VWAP slope < 0
                      Filter 3: RSI Confirmation
                        LONG:  RSI ∈ [40, 70]
                        SHORT: RSI ∈ [30, 60]
                      Entry:  close crosses VWAP (deviation 0.05–0.5×ATR)
                      → Record to wf_live_trades (paper)
                      → [APEX] Manual execution in Tradovate
        │
        ▼
Apex Evaluation Account (Tradovate)
        │
        │  Manual execution mirrors Atlas signal exactly:
        │  - Same direction (LONG/SHORT)
        │  - Same entry price (market order at bar close)
        │  - Same stop (1.0×ATR14 from entry)
        │  - Same target (2.0×ATR14 from entry)
        │  - Same time-stop (16 bars = 80 minutes)
        │  - Same risk ($450 = 1 MNQ contract)
        │
        ▼
Atlas Apex Comparison Engine (apexDb.ts)
        │
        │  Manual trade entry after each Tradovate execution:
        │  - Entry price, stop, target, direction
        │  - Actual fill price, slippage
        │  - Exit price, exit reason, P&L
        │
        └── Live comparison vs wf_live_trades
              - Entry difference
              - Exit difference
              - Fill difference / slippage
              - P&L difference
              - Holding time difference
              - Outcome difference (W/L)
```

---

## Part 2A — Stage-by-Stage Verification

### Stage 1: TradingView → Atlas Webhook

**Verification checklist:**
- [ ] M-16 Pine Script alert is active on MNQ1! 5-minute chart
- [ ] Alert fires on bar close (not bar open)
- [ ] Webhook URL: `https://atlasdash-j7nzp34b.manus.space/api/webhook/observe/{token}`
- [ ] Payload contains: OHLCV, VWAP, RSI, ATR14, EMA9, EMA21, ADX, overnight_inventory, session
- [ ] Atlas Nexus receives bar within 5 seconds of bar close
- [ ] Bar stored in `atlas_memory` table with correct timestamp

**Execution risk:** TradingView alert delay (0–3 seconds typical). Use bar-close alerts, not real-time.

### Stage 2: Atlas Signal Engine

**Verification checklist:**
- [ ] `normalisePayload()` correctly extracts all S109-001 filter fields
- [ ] `overnight_inventory` field present and correctly classified (LONG/SHORT/NEUTRAL)
- [ ] `vwap_slope_3bar` computed from last 3 VWAP values
- [ ] RSI value present and in expected range (0–100)
- [ ] ATR14 present and non-zero
- [ ] Signal evaluation fires within 1 second of bar receipt

**Execution risk:** Missing fields in payload → signal skipped. Monitor `wf_live_trades.filter_values` JSON for null fields.

### Stage 3: S109-001 Filter Evaluation

**Verification checklist:**
- [ ] All 3 filters evaluated on every RTH bar
- [ ] Filter results logged in `wf_live_trades.filter_values` JSON
- [ ] Entry signal logged with: bar_time, direction, entry_price, stop_price, target_price
- [ ] No double-entry (max 1 open trade at a time enforced)

**Execution risk:** VWAP slope calculation uses last 3 bars from `atlas_memory`. If bars are missing (gap), slope may be incorrect. Gap detection is active.

### Stage 4: Manual Execution in Tradovate

**Verification checklist:**
- [ ] Tradovate account connected to Apex 50K Evaluation
- [ ] MNQ contract loaded (front month)
- [ ] Order type: Market (at bar close)
- [ ] Bracket order: Stop = entry ± 1.0×ATR14, Target = entry ± 2.0×ATR14
- [ ] Position size: 1 MNQ contract
- [ ] Time-stop: manual close at 16-bar mark if neither stop nor target hit

**Execution risk:** Manual execution introduces latency (5–30 seconds). Entry price will differ from Atlas signal price. This slippage is expected and will be tracked.

### Stage 5: Trade Recording in Atlas

**After each Tradovate execution:**
1. Open Atlas Nexus → Apex Evaluation page
2. Click "Record Apex Trade"
3. Enter: direction, actual entry price, stop price, target price, contracts
4. System auto-matches to the corresponding `wf_live_trades` record
5. On trade close: enter actual exit price, exit reason, P&L

**Execution risk:** Human error in manual entry. Double-check entry/exit prices against Tradovate trade history before recording.

---

## Part 2B — Execution Risks Summary

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| TradingView alert delay | Medium | Low | Bar-close alerts, 5s tolerance |
| Missing payload fields | Low | High | Monitor filter_values JSON daily |
| Manual execution latency | High | Low | Expected slippage tracked, <0.5 pts typical |
| Wrong contract month | Low | High | Verify front month before session |
| Bracket order error | Low | High | Pre-set bracket template in Tradovate |
| Time-stop missed | Medium | Medium | Set calendar reminder at entry time +80min |
| Double-entry | Very Low | High | Atlas enforces 1-trade-at-a-time |
| Apex rule breach | Very Low | Critical | Never exceed 1 MNQ contract |

---

## Part 3 — Live Comparison Framework

### Comparison Metrics (per trade)

| Metric | Atlas WF | Apex Execution | Difference | Flag Threshold |
|---|---|---|---|---|
| Entry Price | Signal bar close | Actual fill | Slippage | >2 ticks (>0.5 pts) |
| Stop Price | Entry ± 1.0×ATR | Bracket stop | Difference | >1 tick |
| Target Price | Entry ± 2.0×ATR | Bracket target | Difference | >1 tick |
| Exit Price | Stop/target/time | Actual fill | Slippage | >2 ticks |
| P&L | Theoretical | Actual | Execution drag | >$25/trade |
| Holding Time | Bar count | Minutes | Difference | >5 bars |
| Outcome | W/L | W/L | Match | Any mismatch |

### Divergence Classification

| Type | Definition | Action |
|---|---|---|
| EXPECTED_SLIPPAGE | Entry/exit within 2 ticks | Log, no action |
| ELEVATED_SLIPPAGE | Entry/exit 2–5 ticks | Investigate market conditions |
| EXECUTION_ERROR | Wrong direction, wrong size | Immediate review |
| OUTCOME_DIVERGENCE | Atlas W but Apex L (or vice versa) | Investigate stop placement |
| MISSING_TRADE | Atlas signal fired but no Apex trade | Mandatory explanation |
| EXTRA_TRADE | Apex trade with no Atlas signal | CRITICAL — rule violation |

### Aggregate Comparison (cumulative)

After every 10 trades, compute:
- Atlas cumulative WR vs Apex cumulative WR
- Atlas cumulative PF vs Apex cumulative PF
- Atlas cumulative P&L vs Apex cumulative P&L
- Average slippage per trade
- Outcome match rate (% of trades with same W/L result)

**Acceptable divergence:** Apex WR within ±5pp of Atlas WR, Apex PF within ±0.5 of Atlas PF.
**Investigation trigger:** Apex WR deviates >10pp from Atlas WR over 20+ trades.

---

## Validation Rules (Part 5 — Mandatory)

1. **No manual intervention.** Every S109-001 signal must be executed.
2. **No discretionary trades.** No trades outside S109-001 signals.
3. **No skipping signals.** If Atlas fires, Apex executes. No exceptions.
4. **No adding trades.** 1 contract per signal. No scaling in.
5. **No changing risk.** $450/trade throughout the evaluation.
6. **No optimisation.** Filters, stops, targets are frozen.
7. **Every signal treated identically.** No cherry-picking.

**If the strategy fails:**
- Do not modify the strategy.
- Document the failure in the Atlas Apex Comparison log.
- Investigate execution vs signal divergence.
- Report to Sprint 113 for analysis.

---

*Document version 1.0 — Sprint 112 — 2026-07-15*
