/**
 * WalkForward.tsx — Sprint 111 Live Walk-Forward Validation Dashboard
 * DARWIN-S109-001 (VWAP_ALIGNED_CONTINUATION)
 *
 * Shows: promotion gate progress, live vs benchmark comparison,
 * drift alerts, trade log, session history, daily reports.
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown,
  Target, Shield, XCircle, BarChart3, Zap, RefreshCw,
} from "lucide-react";
import { useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const str = abs.toFixed(decimals);
  return n < 0 ? `-$${str}` : `$${str}`;
}

function fmtPct(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return `${(Number(n) * 100).toFixed(decimals)}%`;
}

function fmtNum(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return Number(n).toFixed(decimals);
}

function GateCheck({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      {pass
        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-[var(--arc-red)] flex-shrink-0" />}
      <span className={`text-xs font-['JetBrains_Mono'] ${pass ? "text-emerald-400" : "text-[var(--color-muted-foreground)]"}`}>
        {label}
      </span>
    </div>
  );
}

function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] tracking-widest uppercase">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`text-2xl font-bold font-['JetBrains_Mono'] ${color ?? "text-[var(--color-foreground)]"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--color-muted-foreground)]">{sub}</div>}
    </div>
  );
}

function DeltaBadge({ live, bench, higherIsBetter = true }: { live: number; bench: number; higherIsBetter?: boolean }) {
  const delta = live - bench;
  const good = higherIsBetter ? delta >= 0 : delta <= 0;
  return (
    <span className={`text-xs font-['JetBrains_Mono'] ml-1 ${good ? "text-emerald-400" : "text-amber-400"}`}>
      {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
    </span>
  );
}

// ─── Promotion Gate Card ──────────────────────────────────────────────────────

function PromotionGateCard({ stats }: { stats: any }) {
  if (!stats) return null;

  const statusColor: Record<string, string> = {
    PENDING: "text-[var(--color-muted-foreground)]",
    IN_PROGRESS: "text-amber-400",
    PASSED: "text-emerald-400",
    FAILED: "text-[var(--arc-red)]",
    SUSPENDED: "text-amber-500",
  };

  const statusLabel: Record<string, string> = {
    PENDING: "PENDING — Awaiting trades",
    IN_PROGRESS: "IN PROGRESS",
    PASSED: "PASSED — Ready for paper trading",
    FAILED: "FAILED — Return to research",
    SUSPENDED: "SUSPENDED — Drift detected",
  };

  const checks = stats.promotionChecks ?? {};
  const gateStatus = stats.promotionGateStatus ?? "PENDING";

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-['JetBrains_Mono'] tracking-widest text-[var(--color-muted-foreground)] uppercase flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Promotion Gate — DARWIN-S109-001
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-lg font-bold font-['JetBrains_Mono'] mb-4 ${statusColor[gateStatus] ?? "text-white"}`}>
          {statusLabel[gateStatus] ?? gateStatus}
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <GateCheck pass={checks.minTrades} label={`≥20 trades (${stats.totalTrades ?? 0}/20)`} />
            <GateCheck pass={checks.minDays} label={`≥30 calendar days (${stats.calendarDaysElapsed ?? 0}/30)`} />
            <GateCheck pass={checks.minWinRate} label={`Live WR ≥65% (${fmtPct(stats.winRate)})`} />
          </div>
          <div>
            <GateCheck pass={checks.minPf} label={`Live PF ≥2.0 (${fmtNum(stats.pf)})`} />
            <GateCheck pass={checks.noDrift} label="No critical drift alerts" />
            <GateCheck pass={checks.pipelineIntegrity} label="Pipeline integrity OK" />
          </div>
        </div>

        {gateStatus === "PASSED" && (
          <div className="mt-4 p-3 bg-emerald-950/30 border border-emerald-800/40 rounded text-xs text-emerald-300 font-['JetBrains_Mono']">
            ✓ All gates passed. DARWIN-S109-001 is eligible for promotion to LIVE PAPER TRADING.
          </div>
        )}
        {gateStatus === "SUSPENDED" && (
          <div className="mt-4 p-3 bg-amber-950/30 border border-amber-800/40 rounded text-xs text-amber-300 font-['JetBrains_Mono']">
            ⚠ Walk-forward suspended due to critical drift. Resolve alerts before resuming.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Live vs Benchmark Comparison ────────────────────────────────────────────

function BenchmarkComparison({ stats, benchmark }: { stats: any; benchmark: any }) {
  if (!stats || !benchmark) return null;

  const rows = [
    { label: "Win Rate", live: fmtPct(stats.winRate), bench: fmtPct(benchmark.winRate), liveN: Number(stats.winRate), benchN: Number(benchmark.winRate), higherBetter: true },
    { label: "Profit Factor", live: fmtNum(stats.pf), bench: fmtNum(benchmark.pf), liveN: Number(stats.pf), benchN: Number(benchmark.pf), higherBetter: true },
    { label: "Max Drawdown", live: fmt$(stats.maxDd), bench: fmt$(benchmark.maxDd), liveN: Number(stats.maxDd), benchN: Number(benchmark.maxDd), higherBetter: false },
    { label: "Total PnL", live: fmt$(stats.totalPnl), bench: "—", liveN: Number(stats.totalPnl), benchN: 0, higherBetter: true },
    { label: "Avg Win", live: fmt$(stats.avgWin), bench: "—", liveN: 0, benchN: 0, higherBetter: true },
    { label: "Avg Loss", live: fmt$(stats.avgLoss), bench: "—", liveN: 0, benchN: 0, higherBetter: false },
    { label: "Avg Hold (bars)", live: fmtNum(stats.avgHoldingBars, 1), bench: "—", liveN: 0, benchN: 0, higherBetter: true },
  ];

  return (
    <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-['JetBrains_Mono'] tracking-widest text-[var(--color-muted-foreground)] uppercase flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Live vs Benchmark (Sprint 110 OOS)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-['JetBrains_Mono']">
            <thead>
              <tr className="text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
                <th className="text-left py-2 pr-4">Metric</th>
                <th className="text-right py-2 pr-4">Live</th>
                <th className="text-right py-2">Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const hasDelta = row.benchN !== 0 && row.liveN !== 0;
                const good = hasDelta ? (row.higherBetter ? row.liveN >= row.benchN : row.liveN <= row.benchN) : true;
                return (
                  <tr key={row.label} className="border-b border-[var(--color-border)]/30">
                    <td className="py-2 pr-4 text-[var(--color-muted-foreground)]">{row.label}</td>
                    <td className={`py-2 pr-4 text-right font-bold ${hasDelta ? (good ? "text-emerald-400" : "text-amber-400") : "text-[var(--color-foreground)]"}`}>
                      {row.live}
                    </td>
                    <td className="py-2 text-right text-[var(--color-muted-foreground)]">{row.bench}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono']">
          Benchmark: WR {fmtPct(benchmark.winRate)} | PF {fmtNum(benchmark.pf)} | Max DD ${benchmark.maxDd} | Sprint 110 OOS (n=351)
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Drift Alerts ─────────────────────────────────────────────────────────────

function DriftAlertsPanel({ alerts }: { alerts: any[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 bg-emerald-950/20 border border-emerald-800/30 rounded text-xs text-emerald-400 font-['JetBrains_Mono']">
        <CheckCircle2 className="w-4 h-4" />
        No active drift alerts — behaviour within expected range.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`p-3 rounded border text-xs font-['JetBrains_Mono'] ${
            alert.severity === "CRITICAL"
              ? "bg-red-950/30 border-red-800/40 text-red-300"
              : "bg-amber-950/30 border-amber-800/40 text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span className="font-bold">{alert.alertType}</span>
            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${alert.severity === "CRITICAL" ? "border-red-600 text-red-400" : "border-amber-600 text-amber-400"}`}>
              {alert.severity}
            </Badge>
          </div>
          <div className="text-[var(--color-muted-foreground)] mt-1">{alert.description}</div>
          {alert.benchmarkValue && (
            <div className="mt-1 opacity-70">
              Benchmark: {alert.benchmarkValue} → Live: {alert.liveValue} ({alert.deviationPct}%)
            </div>
          )}
          <div className="mt-1 opacity-50">{new Date(alert.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Trade Log ────────────────────────────────────────────────────────────────

function TradeLogTable({ trades }: { trades: any[] }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] p-4 text-center">
        No trades recorded yet. Waiting for live signals from the webhook pipeline.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-['JetBrains_Mono']">
        <thead>
          <tr className="text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
            <th className="text-left py-2 pr-3">Date</th>
            <th className="text-left py-2 pr-3">Time (ET)</th>
            <th className="text-left py-2 pr-3">Dir</th>
            <th className="text-right py-2 pr-3">Entry</th>
            <th className="text-right py-2 pr-3">Stop</th>
            <th className="text-right py-2 pr-3">Target</th>
            <th className="text-right py-2 pr-3">Exit</th>
            <th className="text-left py-2 pr-3">Reason</th>
            <th className="text-right py-2 pr-3">PnL $</th>
            <th className="text-right py-2 pr-3">R</th>
            <th className="text-left py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const isWin = t.outcome === "WIN";
            const isLoss = t.outcome === "LOSS";
            const isOpen = t.status === "OPEN";
            return (
              <tr key={t.id} className="border-b border-[var(--color-border)]/30 hover:bg-[var(--color-accent)]/5">
                <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">{t.tradeDate?.toString().slice(0, 10)}</td>
                <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">{t.barTimeEt?.slice(11, 16) ?? "—"}</td>
                <td className="py-2 pr-3">
                  <span className={t.direction === "LONG" ? "text-emerald-400" : "text-[var(--arc-red)]"}>
                    {t.direction === "LONG" ? "▲ L" : "▼ S"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">{t.entryPrice ? Number(t.entryPrice).toFixed(2) : "—"}</td>
                <td className="py-2 pr-3 text-right text-[var(--arc-red)]">{t.stopPrice ? Number(t.stopPrice).toFixed(2) : "—"}</td>
                <td className="py-2 pr-3 text-right text-emerald-400">{t.targetPrice ? Number(t.targetPrice).toFixed(2) : "—"}</td>
                <td className="py-2 pr-3 text-right">{t.exitPrice ? Number(t.exitPrice).toFixed(2) : "—"}</td>
                <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">{t.exitReason ?? "—"}</td>
                <td className={`py-2 pr-3 text-right font-bold ${isWin ? "text-emerald-400" : isLoss ? "text-[var(--arc-red)]" : "text-[var(--color-foreground)]"}`}>
                  {t.pnlDollar != null ? fmt$(Number(t.pnlDollar)) : "—"}
                </td>
                <td className={`py-2 pr-3 text-right ${isWin ? "text-emerald-400" : isLoss ? "text-[var(--arc-red)]" : "text-[var(--color-foreground)]"}`}>
                  {t.pnlR != null ? Number(t.pnlR).toFixed(2) + "R" : "—"}
                </td>
                <td className="py-2">
                  {isOpen
                    ? <Badge variant="outline" className="text-[10px] border-amber-600 text-amber-400">OPEN</Badge>
                    : isWin
                    ? <Badge variant="outline" className="text-[10px] border-emerald-600 text-emerald-400">WIN</Badge>
                    : isLoss
                    ? <Badge variant="outline" className="text-[10px] border-red-600 text-red-400">LOSS</Badge>
                    : <Badge variant="outline" className="text-[10px]">BE</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Session History ──────────────────────────────────────────────────────────

function SessionHistoryTable({ sessions }: { sessions: any[] }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] p-4 text-center">
        No sessions recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-['JetBrains_Mono']">
        <thead>
          <tr className="text-[var(--color-muted-foreground)] border-b border-[var(--color-border)]">
            <th className="text-left py-2 pr-3">#</th>
            <th className="text-left py-2 pr-3">Date</th>
            <th className="text-right py-2 pr-3">Bars</th>
            <th className="text-right py-2 pr-3">Signals</th>
            <th className="text-right py-2 pr-3">Trades</th>
            <th className="text-right py-2 pr-3">W/L</th>
            <th className="text-right py-2 pr-3">PnL</th>
            <th className="text-right py-2 pr-3">Cum WR</th>
            <th className="text-right py-2 pr-3">Cum PF</th>
            <th className="text-left py-2">Gate</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id} className="border-b border-[var(--color-border)]/30">
              <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">{s.sessionNumber}</td>
              <td className="py-2 pr-3">{s.sessionDate?.toString().slice(0, 10)}</td>
              <td className="py-2 pr-3 text-right">{s.barsReceived}/{s.barsExpected}</td>
              <td className="py-2 pr-3 text-right">{s.signalsEvaluated ?? 0}</td>
              <td className="py-2 pr-3 text-right">{s.tradesOpened ?? 0}</td>
              <td className="py-2 pr-3 text-right">
                <span className="text-emerald-400">{s.wins ?? 0}</span>
                <span className="text-[var(--color-muted-foreground)]">/</span>
                <span className="text-[var(--arc-red)]">{s.losses ?? 0}</span>
              </td>
              <td className={`py-2 pr-3 text-right ${Number(s.sessionPnl) >= 0 ? "text-emerald-400" : "text-[var(--arc-red)]"}`}>
                {fmt$(Number(s.sessionPnl))}
              </td>
              <td className="py-2 pr-3 text-right">{s.cumWinRate ? fmtPct(Number(s.cumWinRate)) : "—"}</td>
              <td className="py-2 pr-3 text-right">{s.cumPf ? fmtNum(Number(s.cumPf)) : "—"}</td>
              <td className="py-2">
                <Badge variant="outline" className={`text-[10px] ${
                  s.promotionGateStatus === "PASSED" ? "border-emerald-600 text-emerald-400" :
                  s.promotionGateStatus === "IN_PROGRESS" ? "border-amber-600 text-amber-400" :
                  s.promotionGateStatus === "SUSPENDED" ? "border-red-600 text-red-400" :
                  "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
                }`}>
                  {s.promotionGateStatus ?? "PENDING"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WalkForwardPage() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.wf.getStats.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: benchmark } = trpc.wf.getBenchmark.useQuery();
  const { data: openTrade } = trpc.wf.getOpenTrade.useQuery(undefined, { refetchInterval: 15_000 });
  const { data: recentTrades } = trpc.wf.getRecentTrades.useQuery({ limit: 100 }, { refetchInterval: 30_000 });
  const { data: sessions } = trpc.wf.getRecentSessions.useQuery({ limit: 30 }, { refetchInterval: 60_000 });
  const { data: activeDrifts } = trpc.wf.getActiveDriftAlerts.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: recentDrifts } = trpc.wf.getRecentDriftAlerts.useQuery({ limit: 20 }, { refetchInterval: 60_000 });
  const { data: latestReport } = trpc.wf.getLatestDailyReport.useQuery(undefined, { refetchInterval: 60_000 });

  const hasCriticalDrift = useMemo(() =>
    (activeDrifts ?? []).some((a: any) => a.severity === "CRITICAL"),
    [activeDrifts]
  );

  const pnlColor = stats && Number(stats.totalPnl) >= 0 ? "text-emerald-400" : "text-[var(--arc-red)]";

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-['JetBrains_Mono'] tracking-widest text-[var(--color-foreground)] uppercase">
            Walk-Forward Validation
          </h1>
          <p className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] mt-1">
            DARWIN-S109-001 · VWAP_ALIGNED_CONTINUATION · Sprint 111 · Hypothesis frozen — no optimisation
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasCriticalDrift && (
            <div className="flex items-center gap-1 px-3 py-1 bg-red-950/40 border border-red-700/50 rounded text-xs text-red-300 font-['JetBrains_Mono']">
              <AlertTriangle className="w-3 h-3" />
              CRITICAL DRIFT
            </div>
          )}
          {openTrade && (
            <div className="flex items-center gap-1 px-3 py-1 bg-amber-950/40 border border-amber-700/50 rounded text-xs text-amber-300 font-['JetBrains_Mono'] animate-pulse">
              <Activity className="w-3 h-3" />
              TRADE OPEN
            </div>
          )}
          <button
            onClick={() => refetchStats()}
            className="p-2 rounded border border-[var(--color-border)] hover:bg-[var(--color-accent)]/10 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-[var(--color-muted-foreground)]" />
          </button>
        </div>
      </div>

      {/* KPI Row */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Trades" value={String(stats?.totalTrades ?? 0)} sub={`${stats?.wins ?? 0}W / ${stats?.losses ?? 0}L`} icon={Target} />
          <StatCard label="Win Rate" value={fmtPct(stats?.winRate)} sub={`Bench: ${fmtPct(benchmark?.winRate)}`} color={stats && Number(stats.winRate) >= (benchmark?.minLiveWinRate ?? 0.65) ? "text-emerald-400" : "text-amber-400"} icon={TrendingUp} />
          <StatCard label="Profit Factor" value={fmtNum(stats?.pf)} sub={`Bench: ${fmtNum(benchmark?.pf)}`} color={stats && Number(stats.pf) >= (benchmark?.minLivePf ?? 2.0) ? "text-emerald-400" : "text-amber-400"} icon={BarChart3} />
          <StatCard label="Total PnL" value={fmt$(stats?.totalPnl)} sub="$450/trade risk" color={pnlColor} icon={Activity} />
          <StatCard label="Max DD" value={fmt$(stats?.maxDd)} sub={`Bench: $${benchmark?.maxDd ?? 685}`} color={stats && Number(stats.maxDd) <= (benchmark?.maxDd ?? 685) * 2 ? "text-emerald-400" : "text-amber-400"} icon={TrendingDown} />
          <StatCard label="Calendar Days" value={String(stats?.calendarDaysElapsed ?? 0)} sub="Min: 30 days" icon={Clock} />
          <StatCard label="Drift Alerts" value={String((activeDrifts ?? []).length)} sub={hasCriticalDrift ? "CRITICAL" : "All clear"} color={hasCriticalDrift ? "text-[var(--arc-red)]" : (activeDrifts ?? []).length > 0 ? "text-amber-400" : "text-emerald-400"} icon={AlertTriangle} />
        </div>
      )}

      {/* Open Trade Banner */}
      {openTrade && (
        <div className="p-4 bg-amber-950/20 border border-amber-700/40 rounded-lg">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1 text-xs font-['JetBrains_Mono']">
              <span className="text-amber-400 font-bold">OPEN TRADE</span>
              <span className="text-[var(--color-muted-foreground)] ml-3">
                {openTrade.direction} @ {Number(openTrade.entryPrice ?? 0).toFixed(2)} |
                Stop {Number(openTrade.stopPrice ?? 0).toFixed(2)} |
                Target {Number(openTrade.targetPrice ?? 0).toFixed(2)} |
                {openTrade.barTimeEt}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Promotion Gate */}
        <div className="lg:col-span-1">
          <PromotionGateCard stats={stats} />
        </div>

        {/* Benchmark Comparison */}
        <div className="lg:col-span-2">
          <BenchmarkComparison stats={stats} benchmark={benchmark} />
        </div>
      </div>

      {/* Drift Alerts */}
      {(activeDrifts ?? []).length > 0 && (
        <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-['JetBrains_Mono'] tracking-widest text-[var(--color-muted-foreground)] uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Active Drift Alerts ({(activeDrifts ?? []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DriftAlertsPanel alerts={activeDrifts ?? []} />
          </CardContent>
        </Card>
      )}

      {/* Tabs: Trades / Sessions / Reports / Drift History */}
      <Tabs defaultValue="trades" className="space-y-4">
        <TabsList className="bg-[var(--color-card)] border border-[var(--color-border)]">
          <TabsTrigger value="trades" className="text-xs font-['JetBrains_Mono']">
            Trade Log ({recentTrades?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs font-['JetBrains_Mono']">
            Sessions ({sessions?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="drift" className="text-xs font-['JetBrains_Mono']">
            Drift History
          </TabsTrigger>
          <TabsTrigger value="report" className="text-xs font-['JetBrains_Mono']">
            Latest Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trades">
          <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
            <CardContent className="pt-4">
              <TradeLogTable trades={recentTrades ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
            <CardContent className="pt-4">
              <SessionHistoryTable sessions={sessions ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift">
          <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
            <CardContent className="pt-4">
              {(recentDrifts ?? []).length === 0 ? (
                <div className="flex items-center gap-2 p-4 text-xs text-emerald-400 font-['JetBrains_Mono']">
                  <CheckCircle2 className="w-4 h-4" />
                  No drift alerts recorded. Behaviour within expected range.
                </div>
              ) : (
                <DriftAlertsPanel alerts={recentDrifts ?? []} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report">
          <Card className="bg-[var(--color-card)] border-[var(--color-border)]">
            <CardContent className="pt-4">
              {!latestReport ? (
                <div className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] p-4 text-center">
                  No daily reports generated yet. Reports are auto-generated after each RTH session close.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Report Date" value={latestReport.reportDate?.toString().slice(0, 10) ?? "—"} icon={Clock} />
                    <StatCard label="Session #" value={String(latestReport.sessionNumber)} icon={Activity} />
                    <StatCard label="Pipeline" value={latestReport.pipelineHealth ?? "—"} color={latestReport.pipelineHealth === "OK" ? "text-emerald-400" : "text-amber-400"} icon={Zap} />
                    <StatCard label="Drift" value={latestReport.driftDetected ? `${latestReport.driftAlertCount} alerts` : "None"} color={latestReport.driftDetected ? "text-amber-400" : "text-emerald-400"} icon={AlertTriangle} />
                  </div>
                  {latestReport.reportJson && (
                    <div className="mt-4">
                      <div className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] mb-2">Raw Report JSON</div>
                      <pre className="text-xs font-['JetBrains_Mono'] bg-black/30 p-3 rounded overflow-x-auto text-[var(--color-muted-foreground)] max-h-64">
                        {JSON.stringify(JSON.parse(latestReport.reportJson), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-xs text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] text-center pt-2">
        DARWIN-S109-001 · Frozen hypothesis · No optimisation permitted · Sprint 111 Walk-Forward Protocol
      </div>
    </div>
  );
}
