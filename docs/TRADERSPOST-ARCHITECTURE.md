# TradersPost Multi-Strategy Integration — Architecture Design

**Date:** 2026-07-15  
**Status:** APPROVED DESIGN — Implementation Sprint  
**Prerequisite:** Part 1 Audit complete (TRADERSPOST-AUDIT-PART1.md)

---

## Part 2 — Dual-Pipeline Separation Principle

The Atlas execution architecture operates on a strict dual-pipeline model. Pipeline A (observability) and Pipeline B (execution) must remain completely independent. No modification to M-16, no shared state between pipelines, no cross-contamination.

### Pipeline A — Observability (Unchanged)

```
TradingView M-16 Pine Script
  → POST /api/webhook/atlas-memory/:token  (every 5-min MNQ bar)
  → nexusRoutes.ts: stores bar in atlas_memory
  → barEvaluator.ts: evaluates A1/A3/B1/SB1/ORB-1 eligibility
  → paperTradeEngine.ts: single-active-strategy rule → paper trade opens
  → wfDb.ts: S109-001 signal evaluation → wf_live_trades
  → arp1Db.ts: discovery events, portfolio intelligence
  → SSE broadcast to dashboard
```

**M-16 is never modified. Pipeline A is never interrupted.**

### Pipeline B — Execution (New)

```
nexusRoutes.ts (inside atlas-memory webhook handler)
  → After paperTradeEngine selects winning model
  → tpDispatch.ts: checks arm state, safety, PRE_LIVE_GATE
  → If all gates pass: POST to TradersPost webhook URL
  → tp_dispatch_log: records attempt, response, idempotency_key
  → SSE broadcast: "tp_dispatch" event to dashboard
```

Pipeline B fires **only after** Pipeline A has completed its evaluation. It is a non-blocking `setImmediate` hook, identical in pattern to the existing WF and ARP-1 hooks.

---

## Part 3 — Governance Preservation

Every governance rule from the original Atlas system is preserved and extended.

### Rule 1 — Single-Active-Strategy Rule

The existing `paperTradeEngine.ts` enforces priority order A1 > A3 > SB1 > ORB-1 > B1. TradersPost dispatch fires **only for the model that was actually selected** by the paper trade engine. If A1 is eligible and A3 is also eligible, only A1 fires — both in the paper trade engine and in TradersPost.

Implementation: `tpDispatch.ts` receives `{ selectedModel, direction, entry, stop, target }` from the paper trade engine result. It does not independently re-evaluate eligibility.

### Rule 2 — Safety Lockout

The `apex_safety_state` singleton is checked before every TradersPost dispatch. If `isHalted === true`, dispatch is skipped and the skip is logged to `tp_dispatch_log` with `status = "SAFETY_HALTED"`.

### Rule 3 — PRE_LIVE_GATE

For any account in `EVALUATION`, `FUNDED`, or `LIVE` mode, the 15-stage execution certification must have passed. The `tp_config` table stores `preLiveGateRequired` per strategy. If `preLiveGateRequired === true` and the gate has not passed, dispatch is blocked with `status = "PRE_LIVE_GATE_BLOCKED"`.

### Rule 4 — S109-001 Frozen by Default

ATLAS-S109-001-TRADERSPOST is registered in `tp_config` with `armed = false` and `frozenUntilOwnerApproval = true`. No code path can arm it without an explicit database update by the owner. The dashboard shows it as FROZEN with a red badge.

### Rule 5 — Idempotency

Every TradersPost dispatch carries a unique idempotency key: `TP_{model}_{barTimeMs}_{direction}`. This key is stored in `tp_dispatch_log`. Before dispatch, the table is queried for an existing record with the same key. If found, dispatch is skipped with `status = "DUPLICATE_SKIPPED"`.

### Rule 6 — Additive Only

TradersPost integration adds a new non-blocking hook to the existing webhook pipeline. It does not replace, modify, or wrap any existing code path. The paper trade engine continues to run independently. The WF engine continues to run independently. TradersPost is purely additive.

---

## Part 4 — Implementation Specification

### Database Schema

**New table: `tp_config`** — one row per TradersPost strategy

| Column | Type | Description |
|---|---|---|
| `id` | int PK | Auto-increment |
| `strategyId` | varchar(32) | e.g., "A1", "A3", "B1", "S109-001" |
| `strategyName` | varchar(64) | e.g., "ATLAS-A1-TRADERSPOST" |
| `webhookUrl` | varchar(512) | TradersPost webhook URL (encrypted at rest) |
| `armed` | boolean | false = DISARMED, true = ARMED |
| `frozenUntilOwnerApproval` | boolean | S109-001 only: cannot be armed without DB update |
| `accountMode` | varchar(16) | PAPER / EVALUATION / FUNDED / LIVE |
| `preLiveGateRequired` | boolean | true for EVALUATION/FUNDED/LIVE |
| `ticker` | varchar(16) | "MNQ1!" |
| `quantity` | int | Number of contracts |
| `riskDollars` | decimal | Dollar risk per trade |
| `notes` | text | Operator notes |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**New table: `tp_dispatch_log`** — immutable record of every dispatch attempt

| Column | Type | Description |
|---|---|---|
| `id` | int PK | Auto-increment |
| `idempotencyKey` | varchar(128) | `TP_{model}_{barTimeMs}_{direction}` |
| `strategyId` | varchar(32) | A1 / A3 / B1 / S109-001 |
| `barTimeMs` | bigint | Bar timestamp (UTC ms) |
| `direction` | varchar(8) | LONG / SHORT |
| `entryPrice` | decimal | Signal entry price |
| `stopPrice` | decimal | Signal stop price |
| `targetPrice` | decimal | Signal target price |
| `status` | varchar(32) | DISPATCHED / SAFETY_HALTED / PRE_LIVE_GATE_BLOCKED / DISARMED / DUPLICATE_SKIPPED / ERROR |
| `httpStatus` | int | TradersPost HTTP response code |
| `responseBody` | text | TradersPost response JSON |
| `errorMessage` | text | Error details if status=ERROR |
| `atlasMemoryBarId` | int | FK to atlas_memory.id |
| `pipelineRunId` | varchar(128) | Pipeline run ID from M-16 |
| `dispatchedAt` | timestamp | When dispatch was attempted |

### New Files

| File | Purpose |
|---|---|
| `server/tpDb.ts` | Database helpers: `getTpConfig`, `upsertTpConfig`, `logDispatch`, `getDispatchLog`, `getDispatchStats` |
| `server/tpRouter.ts` | tRPC procedures: `getConfig`, `updateConfig`, `armStrategy`, `disarmStrategy`, `getLog`, `getStats` |
| `server/tpDispatch.ts` | Core dispatch engine: `dispatchTradersPost(model, direction, entry, stop, target, barTimeMs, pipelineRunId)` |

### Modified Files

| File | Change |
|---|---|
| `server/nexusRoutes.ts` | Add `setImmediate` hook after `paperTradeEngine.processBar()` result — if signal fired, call `tpDispatch.ts` |
| `server/routers.ts` | Register `tpRouter` as `tp` namespace |
| `drizzle/schema.ts` | Add `tp_config` and `tp_dispatch_log` tables |
| `client/src/App.tsx` | Add `/traderspost` route |
| `client/src/components/OrionLayout.tsx` | Add "TradersPost" nav entry under EXECUTION group |

### TradersPost Payload Specification

All 4 strategies use the same payload schema:

```json
{
  "ticker": "MNQ1!",
  "action": "buy",
  "sentiment": "bullish",
  "quantity": 1,
  "stopLoss": {
    "type": "stop",
    "value": 21000.00
  },
  "takeProfit": {
    "type": "limit",
    "value": 21100.00
  },
  "passthrough": {
    "atlas_strategy_id": "A1",
    "atlas_idempotency_key": "TP_A1_1752614400000_LONG",
    "atlas_bar_time": "2026-07-15T14:00:00Z",
    "atlas_pipeline_run_id": "PR_20260715_001",
    "atlas_version": "1.0.0"
  }
}
```

**Direction mapping:**
- `LONG` → `action: "buy"`, `sentiment: "bullish"`
- `SHORT` → `action: "sell"`, `sentiment: "bearish"`

**Exit signals** (sent when paper trade closes):
- Stop hit → `action: "sell"` (for LONG) or `action: "buy"` (for SHORT) with `closePosition: true`
- Target hit → same
- Time stop → same

### Dispatch Logic (tpDispatch.ts)

```typescript
export async function dispatchTradersPost(params: {
  model: "A1" | "A3" | "B1" | "S109-001";
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  barTimeMs: number;
  atlasMemoryBarId: number;
  pipelineRunId: string;
}): Promise<void> {
  const idempotencyKey = `TP_${params.model}_${params.barTimeMs}_${params.direction}`;

  // 1. Idempotency check
  const existing = await getDispatchByKey(idempotencyKey);
  if (existing) {
    await logDispatch({ ...params, idempotencyKey, status: "DUPLICATE_SKIPPED" });
    return;
  }

  // 2. Load config
  const config = await getTpConfig(params.model);
  if (!config || !config.armed) {
    await logDispatch({ ...params, idempotencyKey, status: "DISARMED" });
    return;
  }

  // 3. Safety lockout check
  const safety = await getSafetyState();
  if (safety?.isHalted) {
    await logDispatch({ ...params, idempotencyKey, status: "SAFETY_HALTED" });
    return;
  }

  // 4. PRE_LIVE_GATE check
  if (config.preLiveGateRequired) {
    const certPassed = await isPreLiveGatePassed();
    if (!certPassed) {
      await logDispatch({ ...params, idempotencyKey, status: "PRE_LIVE_GATE_BLOCKED" });
      return;
    }
  }

  // 5. Build payload and dispatch
  const payload = buildTpPayload(params, config);
  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.text();
    await logDispatch({ ...params, idempotencyKey, status: "DISPATCHED", httpStatus: response.status, responseBody });
  } catch (err) {
    await logDispatch({ ...params, idempotencyKey, status: "ERROR", errorMessage: String(err) });
  }
}
```

### nexusRoutes.ts Hook

The hook fires inside the `atlas-memory` webhook handler, after `processBar()` returns a result with `signalFired === true`:

```typescript
// ── TradersPost Dispatch (non-blocking, additive) ─────────────────────────
if (processBarResult.signalFired && processBarResult.signalModel) {
  setImmediate(async () => {
    try {
      const { dispatchTradersPost } = await import("./tpDispatch");
      await dispatchTradersPost({
        model: processBarResult.signalModel as "A1" | "A3" | "B1",
        direction: processBarResult.signalDirection as "LONG" | "SHORT",
        entryPrice: processBarResult.entryPrice,
        stopPrice: processBarResult.stopPrice,
        targetPrice: processBarResult.targetPrice,
        barTimeMs,
        atlasMemoryBarId: monitorBarId,
        pipelineRunId: mem.pipelineRunId ?? "",
      });
    } catch (tpErr) {
      console.error("[TP-DISPATCH] Error:", tpErr);
    }
  });
}
```

### TradingView Alert Inventory (Part 7)

| Script | Chart | Condition | Frequency | Webhook Destination | Environment | Status |
|---|---|---|---|---|---|---|
| M-16 (Atlas Memory Observer) | MNQ1! 5-min | Every confirmed bar close | Every 5 min (RTH + OV) | Atlas `/api/webhook/atlas-memory/:token` | PRODUCTION | ACTIVE |
| ATLAS-A1-TRADERSPOST | N/A | Server-side (no Pine alert needed) | On A1 signal | TradersPost A1 strategy URL | DISARMED | PENDING |
| ATLAS-A3-TRADERSPOST | N/A | Server-side (no Pine alert needed) | On A3 signal | TradersPost A3 strategy URL | DISARMED | PENDING |
| ATLAS-B1-TRADERSPOST | N/A | Server-side (no Pine alert needed) | On B1 signal | TradersPost B1 strategy URL | DISARMED | PENDING |
| ATLAS-S109-001-TRADERSPOST | N/A | Server-side (no Pine alert needed) | On S109-001 signal | TradersPost S109-001 strategy URL | FROZEN | PENDING |

**Key insight:** No new TradingView alerts are required. TradersPost dispatch is triggered server-side by the Atlas webhook pipeline. M-16 remains the only TradingView script.

---

## Owner Actions Required

Before the implementation sprint can arm any TradersPost strategy, the owner must:

1. **Create 4 TradersPost strategies** in the TradersPost dashboard:
   - ATLAS-A1-TRADERSPOST (connected to Apex 50K paper account)
   - ATLAS-A3-TRADERSPOST (connected to Apex 50K paper account)
   - ATLAS-B1-TRADERSPOST (connected to Apex 50K paper account)
   - ATLAS-S109-001-TRADERSPOST (connected to Apex 50K paper account, DISARMED)

2. **Copy the 4 webhook URLs** from TradersPost and provide them as secrets:
   - `TP_WEBHOOK_URL_A1`
   - `TP_WEBHOOK_URL_A3`
   - `TP_WEBHOOK_URL_B1`
   - `TP_WEBHOOK_URL_S109`

3. **Confirm account routing** — which Apex account each strategy connects to.

4. **Confirm initial arm state** — all 4 DISARMED by default (recommended).

---

*Architecture design complete 2026-07-15 — Ready for implementation sprint.*
