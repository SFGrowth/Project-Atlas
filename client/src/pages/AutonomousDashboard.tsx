/**
 * AutonomousDashboard.tsx — Atlas Sprint 099 Permanent Owner Dashboard
 *
 * The central command interface for the Atlas autonomous trading OS.
 * Shows real-time system health, live data feed status, market laws,
 * pipeline health events, candle gaps, and research queue.
 *
 * Design: dark terminal aesthetic consistent with Atlas Nexus.
 * Auto-refreshes every 30 seconds.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useEffect, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 0) return "never";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m ago`;
  return `${m}m ago`;
}

function formatBarTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " ET";
}

function HealthScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
    score >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  const label = score >= 80 ? "HEALTHY" : score >= 60 ? "DEGRADED" : "CRITICAL";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-red-400"} animate-pulse`} />
      {label} {score.toFixed(0)}/100
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    INFO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    WARNING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${map[severity] ?? map.INFO}`}>
      {severity}
    </span>
  );
}

function RegimeBadge({ regime }: { regime: string | null }) {
  if (!regime) return <span className="text-[var(--color-muted-foreground)] font-mono text-xs">—</span>;
  const map: Record<string, string> = {
    RANGE: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    TRANSITION: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    VOLATILE: "bg-red-500/20 text-red-300 border-red-500/30",
    TREND: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold border ${map[regime] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
      {regime}
    </span>
  );
}

function AdmissionBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ADMITTED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    PROVISIONAL: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    UNDER_REVIEW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${map[status] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>
      {status}
    </span>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function SystemHealthPanel() {
  const { data, isLoading, refetch } = trpc.autonomous.systemHealth.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const triggerHeartbeat = trpc.autonomous.triggerHeartbeat.useMutation({
    onSuccess: (result) => {
      toast.success(`Heartbeat: ${result.status} — silence ${formatDuration(result.silenceMs)}`);
      refetch();
    },
    onError: (e) => toast.error(`Heartbeat failed: ${e.message}`),
  });

  const triggerBrief = trpc.autonomous.triggerMorningBrief.useMutation({
    onSuccess: (result) => {
      toast.success(`Morning Brief generated: ${result.briefId}`);
      refetch();
    },
    onError: (e) => toast.error(`Brief failed: ${e.message}`),
  });

  if (isLoading) {
    return (
      <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">SYSTEM HEALTH</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const silenceMs = data.silenceMs;
  const feedStatus = silenceMs < 0 ? "NO DATA" : silenceMs < 10 * 60000 ? "LIVE" : silenceMs < 60 * 60000 ? "STALE" : "SILENT";
  const feedColor = feedStatus === "LIVE" ? "text-emerald-400" : feedStatus === "STALE" ? "text-amber-400" : "text-red-400";

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">SYSTEM HEALTH</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs font-mono"
            onClick={() => triggerHeartbeat.mutate()}
            disabled={triggerHeartbeat.isPending}
          >
            {triggerHeartbeat.isPending ? "CHECKING…" : "HEARTBEAT"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs font-mono"
            onClick={() => triggerBrief.mutate()}
            disabled={triggerBrief.isPending}
          >
            {triggerBrief.isPending ? "GENERATING…" : "BRIEF"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health score */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--color-muted-foreground)]">OVERALL HEALTH</span>
          <HealthScoreBadge score={data.healthScore} />
        </div>

        <Separator className="bg-[var(--color-border)]" />

        {/* Live feed status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">FEED STATUS</p>
            <p className={`text-sm font-mono font-bold ${feedColor}`}>{feedStatus}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">LAST BAR</p>
            <p className="text-sm font-mono text-[var(--color-foreground)]">
              {data.lastBarTime ? formatDuration(Date.now() - data.lastBarTime) : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">ATLAS MEMORY</p>
            <p className="text-sm font-mono text-[var(--color-foreground)]">{data.totalBars.toLocaleString()} bars</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">OPEN GAPS</p>
            <p className={`text-sm font-mono font-bold ${data.openGaps > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {data.openGaps}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">CURRENT REGIME</p>
            <RegimeBadge regime={data.currentRegime} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">SESSION</p>
            <p className="text-sm font-mono text-[var(--color-foreground)]">{data.currentSession ?? "—"}</p>
          </div>
        </div>

        {/* Last bar timestamp */}
        {data.lastBarTime && (
          <>
            <Separator className="bg-[var(--color-border)]" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">LAST BAR TIME</span>
              <span className="text-xs font-mono text-[var(--color-foreground)]">{formatBarTime(data.lastBarTime)}</span>
            </div>
          </>
        )}

        {/* Owner actions */}
        {data.latestBrief?.ownerActionsRequired && data.latestBrief.ownerActionsRequired !== "None" && (
          <>
            <Separator className="bg-[var(--color-border)]" />
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-[10px] font-mono text-amber-400 tracking-wider mb-1">⚠ OWNER ACTION REQUIRED</p>
              <p className="text-xs font-mono text-amber-300">{data.latestBrief.ownerActionsRequired}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MarketLawsPanel() {
  const { data, isLoading } = trpc.autonomous.marketLaws.useQuery(undefined, {
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">ATLAS MARKET LAWS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">
          ATLAS MARKET LAWS ({data?.length ?? 0})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data ?? []).map((law) => (
          <div
            key={law.lawId}
            className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold text-[var(--arc-blue)]">{law.lawId}</span>
                <AdmissionBadge status={law.admissionStatus} />
              </div>
              <p className="text-xs font-mono text-[var(--color-foreground)] truncate">{law.title}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-mono font-bold text-[var(--color-foreground)]">
                {law.confidenceScore ? `${parseFloat(law.confidenceScore).toFixed(1)}%` : "—"}
              </p>
              <p className="text-[10px] font-mono text-[var(--color-muted-foreground)]">confidence</p>
            </div>
          </div>
        ))}
        {(!data || data.length === 0) && (
          <p className="text-xs font-mono text-[var(--color-muted-foreground)] text-center py-4">No market laws seeded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineHealthPanel() {
  const { data, isLoading } = trpc.autonomous.recentHealthEvents.useQuery(
    { limit: 15 },
    { refetchInterval: 30000 }
  );

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">PIPELINE HEALTH EVENTS</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs font-mono text-emerald-400">✓ No pipeline health events</p>
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] mt-1">All systems nominal</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg bg-[var(--color-muted)]/20">
                <SeverityBadge severity={event.severity} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-[var(--color-foreground)] leading-snug">{event.description}</p>
                  <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] mt-0.5">
                    {new Date(event.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} ET
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CandleGapsPanel() {
  const { data, isLoading } = trpc.autonomous.recentGaps.useQuery(
    { limit: 10 },
    { refetchInterval: 60000 }
  );

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">CANDLE GAP LOG</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs font-mono text-emerald-400">✓ No gaps detected</p>
            <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] mt-1">Candle stream is continuous</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(data ?? []).map((gap) => (
              <div key={gap.id} className="p-2.5 rounded-lg bg-[var(--color-muted)]/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-mono font-bold ${gap.isRthGap ? "text-red-400" : "text-amber-400"}`}>
                    {gap.isRthGap ? "RTH GAP" : "OVERNIGHT GAP"}
                  </span>
                  <span className={`text-[10px] font-mono ${gap.recovered ? "text-emerald-400" : "text-amber-400"}`}>
                    {gap.recovered ? "RECOVERED" : "OPEN"}
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--color-foreground)]">
                  {gap.missingBars} missing bar{gap.missingBars !== 1 ? "s" : ""} — {gap.gapDurationMinutes ? `${parseFloat(gap.gapDurationMinutes).toFixed(0)} min` : "?"}
                </p>
                <p className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
                  {gap.causeClassification?.replace(/_/g, " ")}
                </p>
                <p className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
                  {formatBarTime(gap.gapStartTime)} → {gap.gapEndTime ? formatBarTime(gap.gapEndTime) : "ongoing"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResearchQueuePanel() {
  const sprint100Queue = [
    { priority: 1, action: "RC-A03 refinement: exclude AM Mid, max 2 trades/day, exclude VOLATILE", status: "ACTIVE", expectedPCS: "72–78" },
    { priority: 2, action: "Gap fill strategy: 0.1%–0.3% gaps only, time exit 11:00 ET", status: "QUEUED", expectedPCS: "TBD" },
    { priority: 3, action: "Monday RANGE bias full backtest (R04, PF 1.375, 81 trades)", status: "QUEUED", expectedPCS: "TBD" },
    { priority: 4, action: "Regime classifier redesign: RANGE / TRANSITION / VOLATILE (retire TREND)", status: "QUEUED", expectedPCS: "N/A" },
    { priority: 5, action: "Lunch session RC-A03 variant: Lunch-only signal, tighter parameters", status: "QUEUED", expectedPCS: "TBD" },
  ];

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">SPRINT 100 RESEARCH QUEUE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sprint100Queue.map((item) => (
          <div key={item.priority} className="flex items-start gap-3 p-2.5 rounded-lg bg-[var(--color-muted)]/20">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--arc-blue)]/20 text-[var(--arc-blue)] text-[10px] font-mono font-bold flex items-center justify-center">
              {item.priority}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-[var(--color-foreground)] leading-snug">{item.action}</p>
              <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] mt-0.5">Expected PCS: {item.expectedPCS}</p>
            </div>
            <span className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              item.status === "ACTIVE"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
            }`}>
              {item.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActiveModelsPanel() {
  const models = [
    { id: "RC-A03", name: "VWAP Reclaim + EMA Alignment", pcs: 59.3, pf: 1.587, wr: 50.1, trades: 1242, status: "RESEARCH", gatesPassed: "7/10" },
    { id: "SB1", name: "Session Breakout v1", pcs: 71.2, pf: 1.62, wr: 51.8, trades: 847, status: "PAPER", gatesPassed: "10/10" },
    { id: "ORB-1", name: "Opening Range Breakout", pcs: 70.5, pf: 1.58, wr: 52.1, trades: 623, status: "PAPER", gatesPassed: "10/10" },
    { id: "A1", name: "Atlas Model A1", pcs: 68.4, pf: 1.54, wr: 50.9, trades: 1105, status: "PAPER", gatesPassed: "10/10" },
    { id: "A3", name: "Atlas Model A3", pcs: 65.1, pf: 1.49, wr: 49.7, trades: 892, status: "PAPER", gatesPassed: "9/10" },
    { id: "B1", name: "Atlas Model B1", pcs: 63.8, pf: 1.46, wr: 48.9, trades: 734, status: "PAPER", gatesPassed: "9/10" },
  ];

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">ACTIVE MODELS</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {models.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--color-muted)]/20 hover:bg-[var(--color-muted)]/40 transition-colors">
            <div className="shrink-0 w-14">
              <span className="text-xs font-mono font-bold text-[var(--arc-blue)]">{m.id}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-[var(--color-foreground)] truncate">{m.name}</p>
              <p className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
                PF {m.pf.toFixed(2)} · WR {m.wr.toFixed(1)}% · {m.trades.toLocaleString()} trades · Gates {m.gatesPassed}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-mono font-bold text-[var(--color-foreground)]">{m.pcs.toFixed(1)}</p>
              <p className="text-[10px] font-mono text-[var(--color-muted-foreground)]">PCS</p>
            </div>
            <span className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              m.status === "PAPER"
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            }`}>
              {m.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DarwinPhilosophyPanel() {
  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-mono tracking-widest text-[var(--color-muted-foreground)]">DARWIN STANDING DIRECTIVE</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <blockquote className="border-l-2 border-[var(--arc-blue)] pl-3">
          <p className="text-xs font-mono text-[var(--color-foreground)] leading-relaxed italic">
            "DARWIN is not rewarded for finding strategies. DARWIN is rewarded for discovering truth."
          </p>
        </blockquote>
        <p className="text-[11px] font-mono text-[var(--color-muted-foreground)] leading-relaxed">
          A rejected hypothesis is just as valuable as a certified strategy if it prevents Atlas from wasting future research.
          The purpose of DARWIN is to reduce uncertainty through evidence.
        </p>
        <Separator className="bg-[var(--color-border)]" />
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-wider">SPRINT-END STANDING QUESTIONS</p>
          {[
            "What did DARWIN learn that it did not know before?",
            "What surprised DARWIN the most?",
            "What single discovery has the highest probability of becoming Atlas' next certified production model?",
            "What previous Atlas belief was proven wrong?",
            "If DARWIN had another two years of data tomorrow, what would it investigate first?",
          ].map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 text-[10px] font-mono text-[var(--arc-blue)] font-bold mt-0.5">{i + 1}.</span>
              <p className="text-[11px] font-mono text-[var(--color-foreground)]">{q}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function AutonomousDashboard() {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLastRefresh(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-card)]/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-mono font-bold tracking-widest text-[var(--color-foreground)]">
              ATLAS NEXUS — AUTONOMOUS OPERATIONS CENTRE
            </span>
            <Badge variant="outline" className="text-[10px] font-mono text-[var(--arc-blue)] border-[var(--arc-blue)]/30">
              SPRINT 099
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-[var(--color-muted-foreground)]">
              REFRESHED {lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

        {/* Row 1: System Health + Active Models */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SystemHealthPanel />
          <ActiveModelsPanel />
        </div>

        {/* Row 2: Market Laws + Pipeline Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MarketLawsPanel />
          <PipelineHealthPanel />
        </div>

        {/* Row 3: Candle Gaps + Research Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CandleGapsPanel />
          <ResearchQueuePanel />
        </div>

        {/* Row 4: DARWIN Philosophy */}
        <DarwinPhilosophyPanel />

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] tracking-widest">
            ATLAS NEXUS v2.0 — SPRINT 099 — AUTONOMOUS OPERATIONS ENGINE ACTIVE — 14 SCHEDULED JOBS REGISTERED
          </p>
          <p className="text-[10px] font-mono text-[var(--color-muted-foreground)] mt-1">
            DARWIN IS NOT REWARDED FOR FINDING STRATEGIES. DARWIN IS REWARDED FOR DISCOVERING TRUTH.
          </p>
        </div>
      </div>
    </div>
  );
}
