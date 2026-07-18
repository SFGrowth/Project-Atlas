# Sprint 123 — Live Candlestick Chart

**Date:** 2026-07-18  
**Sprint:** 123  
**Status:** COMPLETE  
**Author:** DARWIN / Manus

---

## Objective

Implement a live MNQ1! 5-minute candlestick chart on the Atlas Nexus dashboard, seeded from `atlas_memory` historical data and updated in real-time via SSE events.

---

## Architecture

### Server-Side Changes

#### 1. `server/nexusRoutes.ts` — Three new SSE events

| Event | Trigger | Payload |
|---|---|---|
| `atlas_bar_confirmed` | After successful `insertAtlasMemory` | `{ time (Unix sec), open, high, low, close, volume, vwap, ema9, ema21, session, regime }` |
| `atlas_bar_developing` | After every `pipeline_report` webhook | `{ time (Unix sec), open, high, low, close, master_state, receivedAt }` |
| `atlas_feed_health` | After every confirmed bar | `{ status: "LIVE", lastBarTime (ms), lastBarTimeIso }` |

**Constitutional note:** `atlas_bar_confirmed` fires only after a successful idempotent insert — never on duplicates. This preserves the Atlas Memory immutability guarantee.

#### 2. `server/routers.ts` — `nexus.getRecentBars` tRPC procedure

- Returns last N bars (default 200) from `atlas_memory` in ascending time order
- Output format: `{ time (Unix seconds), open, high, low, close, volume, vwap, ema9, ema21, session, regime }`
- Lightweight Charts requires Unix seconds (not milliseconds) — conversion applied at query layer

### Client-Side Changes

#### 3. `client/src/components/LiveChart.tsx` — New component

**Data flow:**
1. **Seed:** `trpc.nexus.getRecentBars.useQuery({ limit: 200 })` — loads historical bars on mount
2. **Confirmed bars:** SSE `atlas_bar_confirmed` → `series.update()` — adds each new closed candle
3. **Developing bar:** SSE `atlas_bar_developing` → `series.update()` — shows current open candle (only if newer than last confirmed)
4. **Feed health:** SSE `atlas_feed_health` + 30s tick → status badge (LIVE / DELAYED / OFFLINE)

**Overlays (toggleable):**
- VWAP — arc-cyan line
- EMA9 — gold dashed line  
- EMA21 — purple dashed line

**Feed health thresholds:**
- LIVE: last bar < 6 minutes ago
- DELAYED: last bar 6–30 minutes ago
- OFFLINE: last bar > 30 minutes ago

#### 4. `client/src/pages/Home.tsx` — Chart inserted as Row 4

Placed between the P&L Summary row and the Pipeline Orb row.

---

## Lightweight Charts Installation

`lightweight-charts` v5.0.7 was manually extracted from npm tarball into `node_modules/` due to a pnpm store corruption issue in the sandbox environment. The package.json dependency entry was added manually. The library is fully functional — all chart APIs (createChart, CandlestickSeries, LineSeries, setData, update) are available.

---

## Testing Notes

- TypeScript: 0 new errors introduced (pre-existing errors in other files unaffected)
- Chart renders with "NO CONFIRMED BARS IN ATLAS MEMORY" placeholder when DB is empty
- Feed health badge shows UNKNOWN until first SSE event arrives
- Overlay toggles (VWAP / EMA9 / EMA21) work independently
- Developing bar is suppressed if its timestamp ≤ last confirmed bar (prevents stale bar display)

---

## Next Steps

- Sprint 124: Add volume histogram sub-chart below candlestick
- Sprint 125: Add session background shading (PRE / RTH / PM_CLOSE)
- Sprint 126: Add trade entry/exit markers on chart from paper trade log
