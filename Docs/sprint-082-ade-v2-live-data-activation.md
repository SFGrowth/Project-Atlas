# Sprint 082 — ADE v2 Live Data Activation
## Engineering Log & Activation Report

**Sprint:** 082  
**Status:** COMPLETE  
**Date:** 2026-07-11  
**Author:** Atlas Nexus Engineering  
**Checkpoint:** Pending (post-documentation)

---

## 1. Sprint Objective

Sprint 082 activated the full ADE v2 (Atlas Decision Engine version 2.0) live data path — from the M-15 TradingView Pine Script webhook through the backend normalisation layer, into the database, and out to the React dashboard. The sprint also resolved a blocking defect in the Self-Learning Framework (SLF) that prevented `ade_trade_records` from being populated.

---

## 2. Completed Work

### 2.1 M-15 Pine Script — ADE v2 Payload Expansion

The M-15 observability webhook (`atlas_observability_webhook.pine`) was expanded with the full set of ADE v2 fields required for live data wiring. The following fields were added to the `ade_decision` JSON block:

| Field | Type | Description |
|---|---|---|
| `norm_score` | float | Normalised ADE score (0–100) |
| `raw_score` | integer | Raw dimension sum |
| `raw_max` | integer | Maximum possible raw score for this model |
| `candidate_status` | string | `CANDIDATE`, `BELOW_THRESHOLD`, or `NO_CANDIDATE` |
| `tie_break_result` | string | `NONE`, `PF_TIEBREAK`, or `EXPECTANCY_TIEBREAK` |
| `model_ranking` | object | Per-model EAR data (A1, A3, B1) with rank, norm_score, raw_score |
| `candidate_direction` | integer | 1 = LONG, -1 = SHORT, 0 = FLAT |

The Edge Attribution Report (EAR) is now transmitted on every bar for the winning model, enabling the ADE page to display all 17 dimension scores in real time.

**Payload size verification:** 3,769 characters (well within the 8,000-character TradingView webhook limit).

### 2.2 Backend Normalisation — nexusRoutes.ts

The `normalisePayload()` function in `nexusRoutes.ts` was updated to extract all new ADE v2 fields from the nested M-15 JSON structure and flatten them into the pipeline report payload:

| Normalised Field | Source Path | Description |
|---|---|---|
| `ade_norm_score` | `ade_decision.norm_score` | Normalised score (0–100) |
| `ade_raw_score` | `ade_decision.raw_score` | Raw dimension sum |
| `ade_raw_max` | `ade_decision.raw_max` | Model-specific maximum |
| `ade_candidate_status` | `ade_decision.candidate_status` | Candidate classification |
| `ade_tie_break_result` | `ade_decision.tie_break_result` | Tie-break outcome |
| `ade_candidate_direction` | `ade_decision.candidate_direction` | Direction integer |
| `model_a1_v2` | `ade_decision.model_ranking.a1` | A1 EAR object |
| `model_a3_v2` | `ade_decision.model_ranking.a3` | A3 EAR object |
| `model_b1_v2` | `ade_decision.model_ranking.b1` | B1 EAR object |
| `ade_v2` | Constructed from winner EAR | Full 17-dimension EAR for winning model |

### 2.3 ADE Page — Live Data Wiring

The `ModelRankingPanel` component in `ADE.tsx` was updated to consume the new `model_a1_v2`, `model_a3_v2`, and `model_b1_v2` fields from `trpc.nexus.latestReport`. Each model card now displays:

- Normalised score (0–100) with colour-coded confidence tier
- Raw score / raw max ratio
- Candidate status badge
- Rank position

The `EdgeAttributionPanel` displays all 17 dimension scores from `ade_v2` when the winning model has an active EAR.

### 2.4 Data Freshness States

The `useNexusSSE` hook and `HudComponents.tsx` were extended with five data freshness states:

| State | Condition | Colour |
|---|---|---|
| `LIVE` | Last webhook < 10 minutes ago | Green |
| `STALE` | Last webhook 10–30 minutes ago | Yellow |
| `DEGRADED` | Last webhook 30–60 minutes ago | Orange |
| `OFFLINE` | Last webhook > 60 minutes ago | Red |
| `DATA_INVALID` | Payload failed validation | Red |

### 2.5 Certification Page — Dynamic Status

The `/certification` page was updated to derive its status dynamically from live trade counts in `ade_trade_records`:

| Status | Condition |
|---|---|
| `PAPER VALIDATION — AWAITING` | 0 trades recorded |
| `PAPER VALIDATION — ACTIVE` | 1–29 trades |
| `PAPER VALIDATION — 50% COMPLETE` | 30–49 trades |
| `SLF REPORT READY` | ≥ 50 trades |

Progress bars for each model (A1, A3, B1) update live from `certification.tradeStats`.

---

## 3. SLF Defect Root Cause Analysis

### 3.1 Problem Statement

After Sprint 081 implementation, the `ade_trade_records` table remained empty despite paper trade open and close webhooks being sent. The `certification.tradeStats` endpoint consistently returned `[]`.

### 3.2 Root Causes Identified

Three independent defects were found in `processPaperTrading()` in `nexusRoutes.ts`:

**Defect 1 — Direction field mismatch (Critical)**

The `adeDecision` variable held the model name (`"A1"`) rather than the trade direction. This was being cast directly as `"LONG" | "SHORT"`, storing `"A1"` as the direction in `paper_trades`. While this did not prevent the trade from opening, it corrupted the direction field and would have caused incorrect P&L calculations.

```typescript
// Before (broken):
const direction = adeDecision as "LONG" | "SHORT"; // adeDecision = "A1"

// After (fixed):
const dirInt = Number(payload.ade_candidate_direction ?? pos?.direction ?? 0);
const direction: "LONG" | "SHORT" = dirInt === -1 ? "SHORT" : "LONG";
```

**Defect 2 — Position state field name mismatch (Critical)**

The M-15 Pine Script sends `position_state.entry_price`, `position_state.stop_price`, and `position_state.target_price`. The backend was reading `pos.entry`, `pos.stop`, and `pos.target` — fields that do not exist in the Pine Script payload. As a result, paper trades were opened with `stop = null` and `target = null`.

```typescript
// Before (broken):
const entry = Number(pos?.entry ?? mkt?.vwap ?? 0);
const stop = Number(pos?.stop ?? ari?.stop_price ?? 0);
const target = Number(pos?.target ?? ari?.target_price ?? 0);

// After (fixed):
const entry = Number(pos?.entry_price ?? pos?.entry ?? mkt?.vwap ?? 0);
const stop = Number(pos?.stop_price ?? pos?.stop ?? ari?.stop_price ?? 0);
const target = Number(pos?.target_price ?? pos?.target ?? ari?.target_price ?? 0);
```

**Defect 3 — Close detection strategy mismatch (Critical — direct cause of SLF failure)**

The backend detected trade closure by checking whether the current VWAP price crossed the stored stop or target. Because stop and target were `null` (Defect 2), this check never fired. More fundamentally, the strategy was incorrect: the M-15 Pine Script is the authoritative source of trade closure. When a position closes, the Pine Script transitions the position state to `ARCHIVED` and sets `exit_reason` to `"TARGET_HIT"` or `"STOP_HIT"`.

The fix adds a primary ARCHIVED-based close detection path, with the price-based check retained as a fallback for test webhooks:

```typescript
// Primary: Pine Script reports position as ARCHIVED with an exit reason
if (posStatus === "ARCHIVED" && posExitReason && posExitReason !== "NONE") {
  shouldClose = true;
  exitReason = posExitReason;
  if (!isNaN(posCurrentPnl) && posCurrentPnl !== 0) finalPnlOverride = posCurrentPnl;
  if (!isNaN(posCurrentR) && posCurrentR !== 0) finalROverride = posCurrentR;
}

// Fallback: price-based detection
if (!shouldClose) { /* ... stop/target price crossing ... */ }
```

### 3.3 Verification

After applying all three fixes:

1. Open webhook sent with `position_state.status = "FILLED"`, `entry_price = 21350`, `stop_price = 21320`, `target_price = 21410`, `candidate_direction = 1`.
2. Paper trade opened with `direction = "LONG"`, `entry = 21350`, `stop = 21320`, `target = 21410`.
3. Close webhook sent with `position_state.status = "ARCHIVED"`, `exit_reason = "TARGET_HIT"`, `current_pnl = 1200`.
4. `certification.tradeStats` returned `[{model: "A1", count: 1}]` — SLF record confirmed.

---

## 4. Webhook Schema Verification

The following table documents the complete M-15 → Backend field mapping as verified in Sprint 082:

### 4.1 Metadata Block

| Pine Script Field | Normalised Field | Notes |
|---|---|---|
| `metadata.ticker` | `symbol` | Always `"MNQ1!"` |
| `metadata.timeframe` | `timeframe` | Always `"5"` |
| `metadata.event_id` | `event_id` | Unique per bar |
| `metadata.timestamp_utc` | `timestamp_utc`, `bar_time` | ISO 8601 UTC |
| `metadata.bar_index` | `bar_index` | Integer |
| `metadata.chart_id` | `chart_id` | TradingView chart ID |

### 4.2 Market State Block

| Pine Script Field | Normalised Field | Notes |
|---|---|---|
| `market_state.session` | `master_state` | Session name |
| `market_state.ema_structure` | `trend` | `"BULL"` / `"BEAR"` / `"NEUTRAL"` |
| `market_state.adx14` | `adx` | Float |
| `market_state.atr14` | `atr` | Float |
| `market_state.ema9` | `ema9` | Float |
| `market_state.ema21` | `ema21` | Float |
| `market_state.vwap` | `vwap` | Float |
| `market_state.rsi14` | `rsi` | Float |

### 4.3 ADE Decision Block (v2)

| Pine Script Field | Normalised Field | Notes |
|---|---|---|
| `ade_decision.candidate_model` | `ade_candidate_model` | `"A1"`, `"A3"`, `"B1"`, or `null` |
| `ade_decision.candidate_direction` | `ade_candidate_direction` | Integer: 1, -1, or 0 |
| `ade_decision.norm_score` | `ade_norm_score` | Float 0–100 |
| `ade_decision.raw_score` | `ade_raw_score` | Integer |
| `ade_decision.raw_max` | `ade_raw_max` | Integer (A1=144, A3=141, B1=129) |
| `ade_decision.candidate_status` | `ade_candidate_status` | `CANDIDATE` / `BELOW_THRESHOLD` / `NO_CANDIDATE` |
| `ade_decision.tie_break_result` | `ade_tie_break_result` | `NONE` / `PF_TIEBREAK` / `EXPECTANCY_TIEBREAK` |
| `ade_decision.model_ranking.a1` | `model_a1_v2` | EAR object |
| `ade_decision.model_ranking.a3` | `model_a3_v2` | EAR object |
| `ade_decision.model_ranking.b1` | `model_b1_v2` | EAR object |

### 4.4 Position State Block

| Pine Script Field | Normalised Field | Notes |
|---|---|---|
| `position_state.status` | `pos.status` | `NONE` / `FILLED` / `ACTIVE` / `ARCHIVED` |
| `position_state.entry_price` | `entry_price` | Float |
| `position_state.stop_price` | `stop_price` | Float |
| `position_state.target_price` | `target_price` | Float |
| `position_state.current_pnl` | `unrealized_pnl` | Float |
| `position_state.exit_reason` | `pos.exit_reason` | `null` / `TARGET_HIT` / `STOP_HIT` |
| `position_state.direction` | Used in paper trading | Integer: 1, -1, or 0 |

---

## 5. ADE v2 Model Raw Maxima Reference

| Model | Raw Maximum | Threshold (60 norm) | Raw Threshold |
|---|---|---|---|
| A1 | 144 | 60 | 86 |
| A3 | 141 | 60 | 85 |
| B1 | 129 | 60 | 77 |

---

## 6. Self-Learning Framework Schema

Each `ade_trade_records` row captures 22 fields per closed paper trade:

| Field | Type | Description |
|---|---|---|
| `trade_id` | string | Foreign key to `paper_trades.id` |
| `model` | string | `A1`, `A3`, or `B1` |
| `ade_version` | string | `2.0.0` |
| `outcome` | string | `WIN`, `LOSS`, or `BREAKEVEN` |
| `r_multiple` | decimal | Final R multiple |
| `pnl` | decimal | Final P&L in USD |
| `norm_score` | decimal | ADE normalised score at entry |
| `confidence` | string | `HIGH`, `MEDIUM`, or `LOW` |
| `d_ms01`–`d_ms05` | decimal | Market structure dimension scores |
| `d_eq01`–`d_eq03` | decimal | Equity/risk dimension scores |
| `d_tc01`–`d_tc02` | decimal | Trade condition dimension scores |
| `d_si01`–`d_si03` | decimal | Session/instrument dimension scores |
| `d_cr01`–`d_cr02` | decimal | Correlation dimension scores |
| `raw_score` | decimal | Raw dimension sum |
| `raw_max` | decimal | Model-specific maximum |
| `session` | string | Market session at entry |
| `adx14` | decimal | ADX at entry |
| `atr14` | decimal | ATR at entry |
| `opened_at` | datetime | Trade open timestamp |
| `closed_at` | datetime | Trade close timestamp |

---

## 7. Sprint 082 Test Results

| Test | Result | Notes |
|---|---|---|
| Vitest suite (17 tests) | ✅ PASS | All 17 tests passing |
| TypeScript compilation | ✅ PASS | 0 errors |
| SLF open webhook | ✅ PASS | Paper trade opened with correct entry/stop/target/direction |
| SLF close webhook (ARCHIVED) | ✅ PASS | `ade_trade_records` record inserted |
| `certification.tradeStats` | ✅ PASS | Returns `[{model: "A1", count: 1}]` |
| ADE page live data | ✅ PASS | ModelRankingPanel and EdgeAttributionPanel wired to live data |
| Data freshness states | ✅ PASS | LIVE/STALE/DEGRADED/OFFLINE/DATA_INVALID all functional |
| Certification dynamic status | ✅ PASS | Status updates from DB trade counts |

---

## 8. Outstanding Items for Future Sprints

- **Sprint 083:** Mission Control dense 3-column layout (per ANOS specification)
- **Sprint 084:** Dependency Graph (React Flow DAG) + Time Travel Replay Engine
- **SLF Calibration:** Requires minimum 50 paper trades before ADE weight recalibration analysis can begin. Current count: 1 (test trade). Live accumulation begins when TradingView market opens Sunday 6PM ET.

---

## 9. Production Deployment Notes

- **Production URL:** https://atlasdash-j7nzp34b.manus.space
- **Hosting mode:** Reserved (Always-On)
- **TradingView alert:** Active on MNQ1! 5m chart (cDPu6HGG), webhook URL configured
- **Market resumes:** Sunday 6PM ET — live ADE v2 data will begin flowing immediately

---

*Document generated: 2026-07-11 | Sprint 082 Engineering Log*
