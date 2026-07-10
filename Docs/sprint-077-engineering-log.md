# Sprint 077 Engineering Log — Atlas Nexus Live Connection & Analytics
**Date:** 2026-07-10 | **Status:** COMPLETE | **Version:** v0.15.0

---

## Objectives

Sprint 077 focused on three goals:
1. Connect the Atlas Nexus dashboard to the live TradingView M-15 Pine Script via webhook
2. Harden the backend with additional validation, notification deduplication, and grace periods
3. Add a data-driven Performance Analytics page sourced exclusively from the `paper_trades` database

---

## Phase 1 — Production URL Confirmation

**Production URL confirmed:** `https://atlasdash-j7nzp34b.manus.space`

The Atlas Nexus WebDev project is hosted on Manus Autoscale infrastructure. The production domain is permanent and stable. A **Reserved (Always-On) hosting upgrade** is required to keep the SSE server alive between TradingView's 5-minute webhook intervals — the user must manually upgrade via the Manus Management UI (Dashboard → Upgrade to Reserved).

---

## Phase 2 — M-15 Pine Script Hardening

**File modified:** `/home/ubuntu/Project-Atlas/pine-script/core/atlas_observability_webhook.pine`

### Changes made to M-15:

| Change | Description |
|---|---|
| Added `i_webhook_secret` input | String input in `GRP_OBS` group — user pastes `ATLAS_WEBHOOK_TOKEN` here |
| Added `webhook_secret` field | JSON payload field — value of `i_webhook_secret` — provides Layer 2 auth |
| Added `pipeline_run_id` field | JSON payload field — same value as `idempotency_key` — pipeline run identifier |
| Updated endpoint comment | Changed from `/api/v1/webhook/observe` to `/api/webhook/observe/<TOKEN>` |

### Security model:
TradingView cannot send custom HTTP headers. The dual-layer auth approach provides equivalent security:
- **Layer 1:** Secret path segment in the webhook URL (`/api/webhook/observe/<TOKEN>`)
- **Layer 2:** `webhook_secret` field in the JSON payload body

Both layers must match `ATLAS_WEBHOOK_TOKEN`. If either fails, the request is rejected with HTTP 403/404.

### TradingView alert configuration document:
Written to `/home/ubuntu/Project-Atlas/Docs/tradingview-alert-configuration.md` — complete setup guide with exact webhook URL format, M-15 settings, alert condition, backend rejection rules, and security checklist.

---

## Phase 3 — Backend Hardening

**File modified:** `/home/ubuntu/atlas-nexus/server/nexusRoutes.ts`

### 1. Timeframe Validation

Added check in `validatePayload()`:
```typescript
if (String(body.timeframe) !== "5") return `Invalid timeframe: expected "5" (5-minute), got "${body.timeframe}"`;
```

The M-15 Pine Script sends `timeframe: "5"` (5-minute bars). Any payload with a different timeframe is rejected with HTTP 422.

**Test added:** `returns 422 when timeframe is not 5` and `returns 201 when timeframe is "5" (string)` — both pass.

### 2. Notification Deduplication

Added `notifLastSent: Map<string, number>` tracking last notification time per type, with per-type cooldown windows:

| Notification Type | Cooldown |
|---|---|
| `ARI_REJECTION` | 5 minutes |
| `CIRCUIT_BREAKER` | 30 minutes |
| `WEBHOOK_FAILURE` | 1 hour |
| `TV_DISCONNECTED` | 2 hours |
| `TRADE_OPENED`, `TRADE_CLOSED`, `TARGET_HIT`, `STOP_HIT` | 0 (always send) |
| `ATLAS_ONLINE`, `SYSTEM_OFFLINE` | 0 (always send) |

This prevents notification spam when ARI rejects multiple consecutive signals or the circuit breaker fires repeatedly.

### 3. Grace Periods

Added `serverStartedAt: number` and `STARTUP_GRACE_PERIOD_MS = 10 * 60 * 1000` (10 minutes).

Both the `WEBHOOK_FAILURE` and `TV_DISCONNECTED` monitoring intervals now skip their checks for the first 10 minutes after server startup. This prevents false-positive alerts when the server restarts before the first TradingView bar close arrives.

Additionally, `tvDisconnectNotified` is now reset to `false` on every successful webhook receipt, ensuring the escalation timer restarts cleanly after a reconnection.

### 4. DATA UNAVAILABLE Labels

Added `fmtField()` and `fmtCurrency()` helpers to `HudComponents.tsx`:

```typescript
export function fmtField(v: string | number | null | undefined, critical = false): string {
  if (v === null || v === undefined || v === "") {
    return critical ? "DATA UNAVAILABLE" : "—";
  }
  return String(v);
}
```

When `critical = true`, null/undefined values display "DATA UNAVAILABLE" instead of a dash. This is used for fields that must have a value when the pipeline is active.

---

## Phase 4 — Performance Analytics Page

**New file:** `/home/ubuntu/atlas-nexus/client/src/pages/Analytics.tsx`

**New tRPC procedure:** `analytics.summary` in `server/routers.ts`

**New DB helper:** `getAnalyticsData()` in `server/db.ts`

**Route added:** `/analytics` in `client/src/App.tsx`

**Nav item added:** `Analytics` (LineChart icon) in INTELLIGENCE group in `OrionLayout.tsx`

### Analytics page features:

| Feature | Description |
|---|---|
| Key Stats Strip | Total trades, win rate, total P&L, avg R, profit factor, max drawdown, gross win/loss |
| Equity Curve | Recharts LineChart — cumulative P&L over time, arc reactor blue line with glow |
| Daily P&L Bar Chart | Recharts BarChart — green/red bars per trading day |
| Model Breakdown | Per-model win rate, W/L count, net P&L, win rate progress bar |
| Trade Log | Last 20 closed trades table with model, direction, P&L, R, exit reason, date |
| Empty State | "No closed paper trades yet" message when no data exists |

**Data source:** Exclusively from `paper_trades` table via tRPC. No mock data. All charts and stats are computed server-side in `getAnalyticsData()` and returned as a single tRPC query.

---

## Test Results

| Suite | Tests | Status |
|---|---|---|
| `server/auth.logout.test.ts` | 1 | ✅ PASS |
| `server/nexusRoutes.test.ts` | 16 | ✅ PASS |
| **Total** | **17** | **✅ ALL PASS** |

**TypeScript:** 0 errors

---

## Files Changed

| File | Change |
|---|---|
| `server/nexusRoutes.ts` | Timeframe validation, notification deduplication, grace periods, tvDisconnect reset |
| `server/nexusRoutes.test.ts` | +2 timeframe validation tests (total: 17 tests) |
| `server/db.ts` | Added `getAnalyticsData()` helper |
| `server/routers.ts` | Added `analytics.summary` tRPC procedure |
| `client/src/components/HudComponents.tsx` | Added `fmtField()` and `fmtCurrency()` helpers |
| `client/src/pages/Analytics.tsx` | **NEW** — Performance Analytics page |
| `client/src/App.tsx` | Added `/analytics` route |
| `client/src/components/OrionLayout.tsx` | Added Analytics nav item (INTELLIGENCE group) |
| `Project-Atlas/pine-script/core/atlas_observability_webhook.pine` | Added `i_webhook_secret`, `webhook_secret`, `pipeline_run_id` |
| `Project-Atlas/Docs/tradingview-alert-configuration.md` | **NEW** — TradingView setup guide |

---

## Engineering Decisions

### ED-077-01: Timeframe as string "5" not integer
The M-15 Pine Script sends `timeframe` as the string `"5"` (TradingView's native format for 5-minute charts). The backend validation uses `String(body.timeframe) !== "5"` to handle both string and numeric inputs safely. The shared `PipelineReportPayload` type already declares `timeframe: string`.

### ED-077-02: In-memory notification deduplication
Notification deduplication is implemented via an in-memory `Map<string, number>` rather than a database query. This is intentional: the cooldown windows are short (5–120 minutes), and the map is reset on server restart. A server restart is an acceptable reason to re-send notifications (e.g., ATLAS_ONLINE fires on every startup). For longer-term deduplication, a DB-backed approach would be needed.

### ED-077-03: 10-minute startup grace period
The grace period was set to 10 minutes (not 5) to account for TradingView's alert warm-up time and any network latency on first connection. The M-15 fires once per 5-minute bar close, so the first webhook may arrive up to 10 minutes after server start.

### ED-077-04: Analytics data computed server-side
All equity curve, daily P&L, and aggregate stats are computed in `getAnalyticsData()` on the server rather than in the React component. This keeps the frontend thin and ensures the computation is consistent regardless of client timezone.

---

## Next Steps (Sprint 078)

1. **TradingView live connection** — User must configure the M-15 alert with the webhook URL and paste `ATLAS_WEBHOOK_TOKEN` into the Pine Script settings
2. **Reserved hosting upgrade** — User must upgrade from Autoscale to Reserved via Manus Management UI
3. **First live report verification** — Confirm the dashboard receives and displays a live pipeline report
4. **Paper trading activation** — Confirm paper trades open/close correctly from live pipeline data

---

*Sprint 077 Engineering Log | Atlas Nexus v0.15.0 | 2026-07-10*
