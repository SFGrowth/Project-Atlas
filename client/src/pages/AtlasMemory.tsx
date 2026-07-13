/**
 * Atlas Memory — Sprint 089A / Sprint 091 Dashboard
 * Permanent, immutable record of every confirmed 5-minute MNQ candle.
 * Constitutional basis: Atlas Constitution v1.0 — Law 5 + Atlas Memory Amendment.
 *
 * Sprint 091: Session Coverage Panel — shows RTH/ETH/OV/PRE/POST bar counts
 * confirming that ALL market hours (24/5) are being tracked.
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
import { Clock } from "lucide-react";

// ── Session config ────────────────────────────────────────────────────────────
const SESSION_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  RTH:       { label: "RTH",       color: "text-sky-300",    bg: "bg-sky-900/40 border-sky-700",    description: "Regular Trading Hours (9:30–16:00 ET)" },
  OV:        { label: "Overnight", color: "text-indigo-300", bg: "bg-indigo-900/40 border-indigo-700", description: "Overnight (18:00–9:30 ET)" },
  OVERNIGHT: { label: "Overnight", color: "text-indigo-300", bg: "bg-indigo-900/40 border-indigo-700", description: "Overnight (18:00–9:30 ET)" },
  PRE:       { label: "Pre-Mkt",   color: "text-orange-300", bg: "bg-orange-900/40 border-orange-700", description: "Pre-Market (4:00–9:30 ET)" },
  POST:      { label: "Post-Mkt",  color: "text-slate-300",  bg: "bg-slate-800/60 border-slate-600",  description: "Post-Market (16:00–20:00 ET)" },
  ETH:       { label: "ETH",       color: "text-violet-300", bg: "bg-violet-900/40 border-violet-700", description: "Extended Trading Hours" },
};

function getSessionCfg(session: string | null | undefined) {
  if (!session) return null;
  return SESSION_CONFIG[session.toUpperCase()] ?? null;
}

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
  const cfg = getSessionCfg(session);
  if (cfg) return <Badge className={`text-xs border ${cfg.bg} ${cfg.color}`}>{cfg.label}</Badge>;
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

// ── Session Coverage Panel ────────────────────────────────────────────────────
function SessionCoveragePanel({ limit = 288 }: { limit?: number }) {
  const { data: sessionDist, isLoading } = trpc.atlasMemory.sessionDistribution.useQuery({ limit });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            Session Coverage — All Hours Tracked
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!sessionDist || sessionDist.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            Session Coverage — All Hours Tracked
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No session data yet. Waiting for first candle.</p>
        </CardContent>
      </Card>
    );
  }

  const total = sessionDist.reduce((s, r) => s + Number(r.count), 0);
  const rthCount = sessionDist.find((r) => r.session?.toUpperCase() === "RTH")?.count ?? 0;
  const nonRthCount = total - Number(rthCount);
  const nonRthPct = total > 0 ? ((nonRthCount / total) * 100).toFixed(0) : "0";

  // Merge OV + OVERNIGHT
  const merged: { key: string; count: number }[] = [];
  const seen = new Set<string>();
  for (const r of sessionDist) {
    const key = r.session?.toUpperCase() === "OVERNIGHT" ? "OV" : (r.session?.toUpperCase() ?? "UNKNOWN");
    const existing = merged.find((m) => m.key === key);
    if (existing) {
      existing.count += Number(r.count);
    } else {
      merged.push({ key, count: Number(r.count) });
    }
    seen.add(key);
  }
  merged.sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400" />
            Session Coverage — All Hours Tracked
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-700 text-white text-xs">24/5 ACTIVE</Badge>
            <span className="text-xs text-muted-foreground">
              {nonRthPct}% non-RTH in last {limit} bars
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Every confirmed 5-minute MNQ candle is stored regardless of session.
          RTH, overnight, pre-market and post-market bars are all captured.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {merged.map(({ key, count }) => {
            const cfg = SESSION_CONFIG[key];
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
            const barWidth = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={key} className={`rounded-lg border p-3 ${cfg?.bg ?? "bg-muted/20 border-border"}`}>
                <div className={`text-xs font-semibold mb-0.5 ${cfg?.color ?? "text-muted-foreground"}`}>
                  {cfg?.label ?? key}
                </div>
                <div className="text-2xl font-bold tabular-nums">{count.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mb-2">{pct}% of window</div>
                {/* Mini bar */}
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      background: cfg ? undefined : "#6b7280",
                      backgroundColor: key === "RTH" ? "#0ea5e9"
                        : key === "OV" ? "#6366f1"
                        : key === "PRE" ? "#f97316"
                        : key === "POST" ? "#94a3b8"
                        : key === "ETH" ? "#8b5cf6"
                        : "#6b7280",
                    }}
                  />
                </div>
                {cfg && <div className="text-xs text-muted-foreground/60 mt-1.5 leading-tight">{cfg.description}</div>}
              </div>
            );
          })}
        </div>

        {/* Summary row */}
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            <span className="text-sky-300 font-semibold">{Number(rthCount).toLocaleString()}</span> RTH bars
          </span>
          <span>
            <span className="text-indigo-300 font-semibold">{nonRthCount.toLocaleString()}</span> non-RTH bars
          </span>
          <span>
            <span className="text-white font-semibold">{total.toLocaleString()}</span> total in last {limit} bars
          </span>
          <span className="ml-auto text-emerald-400">
            ✓ No session gate — all bars accepted by server
          </span>
        </div>
      </CardContent>
    </Card>
  );
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Atlas Memory</h1>
            <Badge className="bg-emerald-700 text-white text-xs">ALL HOURS</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Permanent, immutable record of every confirmed 5-minute MNQ candle — RTH, overnight, pre-market and post-market.
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
                <div className="text-xs text-muted-foreground mt-1">all-time candles (all sessions)</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Today</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-3xl font-bold tabular-nums">{stats?.todayCount?.toLocaleString() ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">candles today (all sessions)</div>
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
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Latest Session</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="mt-1">{sessionBadge(stats?.latestSession)}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  {regimeBadge(stats?.latestRegime)}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Session Coverage Panel — Sprint 091 */}
      <SessionCoveragePanel limit={288} />

      {/* Regime Distribution */}
      {regimeDist && regimeDist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Regime Distribution (last 288 bars ≈ 1 day, all sessions)</CardTitle>
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
          <CardTitle className="text-sm">Memory Stream — Last 100 Bars (all sessions)</CardTitle>
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
        Sprint 089A / 091 · Schema v1.1.0 · Records are permanent and immutable · All sessions tracked 24/5
      </p>
    </div>
  );
}
