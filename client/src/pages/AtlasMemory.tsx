/**
 * Atlas Memory — Sprint 089A Dashboard
 * Permanent, immutable record of every confirmed 5-minute MNQ candle.
 * Constitutional basis: Atlas Constitution v1.0 — Law 5 + Atlas Memory Amendment.
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffect, useRef, useState } from "react";

// ── Regime colour mapping ─────────────────────────────────────────────────────
function regimeBadge(regime: string | null | undefined) {
  if (!regime) return <Badge variant="outline" className="text-xs">—</Badge>;
  const r = regime.toUpperCase();
  if (r.includes("TRENDING_BULL")) return <Badge className="bg-emerald-600 text-white text-xs">{regime}</Badge>;
  if (r.includes("TRENDING_BEAR")) return <Badge className="bg-red-600 text-white text-xs">{regime}</Badge>;
  if (r.includes("TRENDING")) return <Badge className="bg-blue-600 text-white text-xs">{regime}</Badge>;
  if (r.includes("COMPRESS") || r.includes("CHOP")) return <Badge className="bg-amber-600 text-white text-xs">{regime}</Badge>;
  if (r.includes("VOLATILE")) return <Badge className="bg-purple-600 text-white text-xs">{regime}</Badge>;
  return <Badge variant="secondary" className="text-xs">{regime}</Badge>;
}

function sessionBadge(session: string | null | undefined) {
  if (!session) return <span className="text-muted-foreground text-xs">—</span>;
  const s = session.toUpperCase();
  if (s === "RTH") return <Badge className="bg-sky-600 text-white text-xs">RTH</Badge>;
  if (s === "OV" || s === "OVERNIGHT") return <Badge className="bg-indigo-700 text-white text-xs">OV</Badge>;
  if (s === "PRE") return <Badge className="bg-orange-500 text-white text-xs">PRE</Badge>;
  if (s === "POST") return <Badge className="bg-slate-500 text-white text-xs">POST</Badge>;
  return <Badge variant="outline" className="text-xs">{session}</Badge>;
}

function healthBadge(health: string | null | undefined) {
  if (!health || health === "OK") return <Badge className="bg-emerald-700 text-white text-xs">OK</Badge>;
  if (health === "WARN") return <Badge className="bg-amber-500 text-white text-xs">WARN</Badge>;
  return <Badge className="bg-red-600 text-white text-xs">{health}</Badge>;
}

function fmt(v: string | null | undefined, decimals = 2) {
  if (v == null) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toFixed(decimals);
}

function fmtTime(barTime: number | null | undefined) {
  if (!barTime) return "—";
  return new Date(barTime).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

// ── Live SSE hook ─────────────────────────────────────────────────────────────
function useAtlasMemorySSE(onEvent: (data: Record<string, unknown>) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;
  useEffect(() => {
    const es = new EventSource("/api/events");
    const handler = (e: MessageEvent) => {
      try { cbRef.current(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    es.addEventListener("atlas_memory", handler);
    return () => { es.removeEventListener("atlas_memory", handler); es.close(); };
  }, []);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AtlasMemoryPage() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.atlasMemory.stats.useQuery();
  const { data: rows, isLoading: rowsLoading, refetch: refetchRows } = trpc.atlasMemory.recent.useQuery({ limit: 100 });
  const { data: regimeDist } = trpc.atlasMemory.regimeDistribution.useQuery({ limit: 288 });

  const [liveCount, setLiveCount] = useState(0);

  useAtlasMemorySSE(() => {
    setLiveCount((c) => c + 1);
    refetchStats();
    refetchRows();
  });

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atlas Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sprint 089A — Permanent, immutable record of every confirmed 5-minute MNQ candle.
            <span className="ml-2 italic opacity-60">
              "Every market observation becomes permanent Atlas memory."
            </span>
          </p>
        </div>
        {liveCount > 0 && (
          <Badge className="bg-emerald-600 text-white animate-pulse">
            +{liveCount} live
          </Badge>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Total Memories</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-bold tabular-nums">{stats?.total?.toLocaleString() ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">all-time candles</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Today</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-bold tabular-nums">{stats?.todayCount?.toLocaleString() ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">candles today</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Latest Close</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-bold tabular-nums">{stats?.latestClose ? parseFloat(stats.latestClose).toFixed(2) : "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">{stats?.latestBarTime ? fmtTime(stats.latestBarTime) : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Latest Regime</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="mt-1">{regimeBadge(stats?.latestRegime)}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  {stats?.latestSession ? sessionBadge(stats.latestSession) : "—"}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Regime Distribution */}
      {regimeDist && regimeDist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Regime Distribution (last 288 bars ≈ 1 day)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {regimeDist
                .sort((a, b) => Number(b.count) - Number(a.count))
                .map((r) => (
                  <div key={r.regimeClassification ?? "null"} className="flex items-center gap-1.5">
                    {regimeBadge(r.regimeClassification)}
                    <span className="text-xs text-muted-foreground">{Number(r.count)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Memory Stream Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Memory Stream — Last 100 Bars</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rowsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No memories yet. Waiting for the first confirmed 5-minute candle from M-16.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Bar Time</TableHead>
                    <TableHead className="text-xs">Session</TableHead>
                    <TableHead className="text-xs text-right">Close</TableHead>
                    <TableHead className="text-xs text-right">ATR</TableHead>
                    <TableHead className="text-xs text-right">ADX</TableHead>
                    <TableHead className="text-xs text-right">CHOP</TableHead>
                    <TableHead className="text-xs">Regime</TableHead>
                    <TableHead className="text-xs">EMA</TableHead>
                    <TableHead className="text-xs">Models</TableHead>
                    <TableHead className="text-xs">Health</TableHead>
                    <TableHead className="text-xs">Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="text-xs">
                      <TableCell className="font-mono whitespace-nowrap">{fmtTime(r.barTime)}</TableCell>
                      <TableCell>{sessionBadge(r.session)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.close)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.atr)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.adx)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.chop)}</TableCell>
                      <TableCell>{regimeBadge(r.regimeClassification)}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${r.emaAlignment === "BULL" ? "text-emerald-500" : r.emaAlignment === "BEAR" ? "text-red-500" : "text-muted-foreground"}`}>
                          {r.emaAlignment ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.activeModels ? (
                          <span className="font-mono text-sky-400">{r.activeModels}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{healthBadge(r.pipelineHealth)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">{r.atlasVersion ?? r.schemaVersion ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Constitutional footnote */}
      <p className="text-xs text-muted-foreground text-center pb-2">
        Atlas Constitution v1.0 — Law 5 + Atlas Memory Amendment ·
        Sprint 089A · Schema v1.1.0 · Records are permanent and immutable
      </p>
    </div>
  );
}
