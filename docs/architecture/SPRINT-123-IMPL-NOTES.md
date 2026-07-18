# Sprint 123 — Implementation Notes (Active Session)

## Status: IN PROGRESS

## What's Done
- tsconfig.json: added "target": "ES2020" (fixes BigInt + Map iteration TS errors)
- package.json: vite-plugin-manus-runtime already at 0.0.59 (correct)
- pnpm install: works, no null bytes in lockfile
- Build: passes (21s)
- Tests: 204/221 pass (17 fail = DB unavailable in sandbox, expected)

## What Needs Doing

### 1. behaviourEngine sub-router (fixes BehaviourEngine.tsx TS errors)
Add to appRouter in server/routers.ts before `executive: executiveRouter` (line 1368):
```
  behaviourEngine: router({
    getActiveInstances: publicProcedure
      .input(z.object({ symbol: z.string().optional() }))
      .query(async ({ input }) => {
        const { behaviourEngine } = await import("./behaviour-engine/index.js");
        return behaviourEngine.getStateManager().getActiveInstances(input.symbol);
      }),
    getRecentInstances: publicProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) return [];
        // query atlas_behaviour_instances ordered by last_updated_at desc
        ...
      }),
    getPerformanceStats: publicProcedure.query(async () => { ... }),
    getDefinitions: publicProcedure.query(async () => { ... }),
    triggerReplay: publicProcedure.input(z.object({ bars: z.number().default(288) })).mutation(async ({ input }) => { ... }),
  }),
```

NOTE: behaviourEngine.getStateManager() may not exist — need to check behaviour-engine.ts
The BehaviourEngine class has processBar() but no getStateManager() exposed.
The BehaviourStateManager is private inside BehaviourEngine.
Need to either expose it or query the DB directly.

### 2. nexus.getRecentBars tRPC procedure
Add to nexus router (ends at line 790 in routers.ts, before atlasMemory router):
- Returns last N bars from atlas_memory in ascending time order
- barTime converted to Unix seconds (divide by 1000)
- Fields: time, open, high, low, close, volume, vwap, ema9, ema21, session, regime

### 3. SSE events in nexusRoutes.ts
**atlas_bar_confirmed** — after successful insertAtlasMemory (line ~1039, after broadcastSSE("atlas_memory",...)):
```js
broadcastSSE("atlas_bar_confirmed", {
  time: Math.floor(barTimeMs / 1000),
  open: Number(mem.open), high: Number(mem.high), low: Number(mem.low), close: Number(mem.close),
  volume: mem.volume != null ? Number(mem.volume) : 0,
  vwap: mem.vwap != null ? Number(mem.vwap) : null,
  ema9: mem.ema9 != null ? Number(mem.ema9) : null,
  ema21: mem.ema21 != null ? Number(mem.ema21) : null,
  session: mem.session, regime: mem.regimeClassification,
});
broadcastSSE("atlas_feed_health", {
  status: "LIVE", lastBarTime: barTimeMs, lastBarTimeIso: new Date(barTimeMs).toISOString()
});
```

**atlas_bar_developing** — after broadcastSSE("pipeline_report",...) (line ~786):
```js
const barTimeDevMs = barTime ? new Date(barTime).getTime() : null;
if (barTimeDevMs && !isNaN(barTimeDevMs)) {
  broadcastSSE("atlas_bar_developing", {
    time: Math.floor(barTimeDevMs / 1000),
    open: body.open != null ? Number(body.open) : null,
    high: body.high != null ? Number(body.high) : null,
    low: body.low != null ? Number(body.low) : null,
    close: body.close != null ? Number(body.close) : null,
    master_state: masterState,
    receivedAt: new Date().toISOString(),
  });
}
```

### 4. lightweight-charts installation
```
cd /home/ubuntu/atlas-nexus && pnpm add lightweight-charts@5
```

### 5. LiveChart.tsx
Location: client/src/components/LiveChart.tsx
- Uses lightweight-charts v5 createChart + CandlestickSeries
- Seeds from trpc.nexus.getRecentBars.useQuery({ limit: 200 })
- SSE: atlas_bar_confirmed → series.update()
- SSE: atlas_bar_developing → series.update() (only if newer than last confirmed)
- SSE: atlas_feed_health → status badge
- Overlays: VWAP (arc-cyan), EMA9 (gold dashed), EMA21 (purple dashed)
- Feed health thresholds: LIVE <6min, DELAYED 6-30min, OFFLINE >30min

### 6. Home.tsx insertion
Insert <LiveChart /> as Row 4 between P&L Summary row and Pipeline Orb row.

## Key File Locations
- server/routers.ts: line 1368 = `executive: executiveRouter` (add behaviourEngine before this)
- server/routers.ts: line 790 = end of nexus router (add getRecentBars inside nexus before closing)
- server/nexusRoutes.ts: line ~786 = after pipeline_report broadcastSSE (add atlas_bar_developing)
- server/nexusRoutes.ts: line ~1039 = after atlas_memory broadcastSSE (add atlas_bar_confirmed + atlas_feed_health)
- client/src/pages/Home.tsx: find P&L row and Pipeline Orb row to insert LiveChart between them

## Schema Notes
- atlasMemory.barTime = bigint milliseconds
- Lightweight Charts needs Unix SECONDS → divide by 1000
- atlasMemory columns: open, high, low, close, volume, vwap, ema9, ema21, session, regimeClassification
