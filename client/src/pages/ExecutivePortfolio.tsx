/**
 * Sprint 104A — Executive Portfolio Intelligence Dashboard
 * Every Sprint 103 insight surfaced as a live widget.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock,
  Target, BarChart3, Shield, Zap, Brain, Activity, ChevronRight,
  Trophy, AlertCircle, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, Settings, Info, Star
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPnl(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtR(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}R`;
}

function pnlColor(n: number | null | undefined): string {
  if (n == null) return "text-[var(--color-muted-foreground)]";
  return n >= 0 ? "text-[var(--arc-green)]" : "text-[var(--danger-red)]";
}

function stageBadge(stage: string) {
  const map: Record<string, { label: string; color: string }> = {
    PRODUCTION: { label: "PRODUCTION", color: "bg-[var(--arc-green)]/20 text-[var(--arc-green)] border-[var(--arc-green)]/40" },
    PAPER: { label: "PAPER TRADING", color: "bg-[var(--arc-cyan)]/20 text-[var(--arc-cyan)] border-[var(--arc-cyan)]/40" },
    FORWARD_VALIDATION: { label: "FORWARD VALIDATION", color: "bg-[var(--stark-gold)]/20 text-[var(--stark-gold)] border-[var(--stark-gold)]/40" },
    CANDIDATE: { label: "CANDIDATE", color: "bg-[oklch(0.65_0.18_280)]/20 text-[oklch(0.65_0.18_280)] border-[oklch(0.65_0.18_280)]/40" },
    HYPOTHESIS: { label: "HYPOTHESIS", color: "bg-[oklch(0.55_0.12_260)]/20 text-[oklch(0.55_0.12_260)] border-[oklch(0.55_0.12_260)]/40" },
    REJECTED: { label: "REJECTED", color: "bg-[var(--danger-red)]/20 text-[var(--danger-red)] border-[var(--danger-red)]/40" },
    ARCHIVED: { label: "ARCHIVED", color: "bg-[oklch(0.35_0.04_220)]/20 text-[oklch(0.55_0.04_220)] border-[oklch(0.45_0.04_220)]/40" },
  };
  const s = map[stage] ?? { label: stage, color: "bg-[var(--hud-border)]/20 text-[var(--color-muted-foreground)]" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${s.color}`}>{s.label}</span>;
}

function pcsBar(score: number | null | undefined) {
  const val = score ?? 0;
  const color = val >= 80 ? "var(--arc-green)" : val >= 70 ? "var(--stark-gold)" : val >= 60 ? "var(--arc-cyan)" : "var(--danger-red)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.18_0.04_220)]">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, val)}%`, background: color, boxShadow: `0 0 6px ${color}40` }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color }}>{val.toFixed(1)}</span>
    </div>
  );
}

function confidenceBar(score: number | null | undefined) {
  const val = score ?? 0;
  const color = val >= 80 ? "var(--arc-green)" : val >= 60 ? "var(--stark-gold)" : val >= 40 ? "var(--arc-cyan)" : "var(--danger-red)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.18_0.04_220)]">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, val)}%`, background: color, boxShadow: `0 0 6px ${color}40` }} />
      </div>
      <span className="text-xs font-mono font-bold" style={{ color }}>{val.toFixed(0)}%</span>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] uppercase">{label}</span>
      <span className="text-sm font-mono font-bold">{value}</span>
      {sub && <span className="text-[9px] text-[var(--color-muted-foreground)]">{sub}</span>}
    </div>
  );
}

function PeriodStats({ stats, risk }: {
  stats: {
    trades: number; wins: number; losses: number; winRate: number; profitFactor: number;
    netPnlDollar: number; netPnlR: number; grossProfit: number; grossLoss: number;
    avgWin: number; avgLoss: number; largestWin: number; largestLoss: number;
    maxDrawdown: number; avgHoldTimeMin: number; longTrades: number; shortTrades: number;
    currentWinStreak: number; currentLoseStreak: number;
  } | null | undefined;
  risk: number;
}) {
  if (!stats || stats.trades === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-[var(--color-muted-foreground)] text-xs">
        No trades in this period
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-3">
      <StatCell label="Trades" value={<span className="text-[var(--arc-cyan)]">{stats.trades}</span>} sub={`${stats.longTrades}L / ${stats.shortTrades}S`} />
      <StatCell label="Win / Loss" value={<span className="text-[var(--arc-cyan)]">{stats.wins} / {stats.losses}</span>} />
      <StatCell label="Win Rate" value={<span className={stats.winRate >= 55 ? "text-[var(--arc-green)]" : stats.winRate >= 45 ? "text-[var(--stark-gold)]" : "text-[var(--danger-red)]"}>{fmtPct(stats.winRate)}</span>} />
      <StatCell label="Profit Factor" value={<span className={stats.profitFactor >= 1.5 ? "text-[var(--arc-green)]" : stats.profitFactor >= 1.0 ? "text-[var(--stark-gold)]" : "text-[var(--danger-red)]"}>{fmt(stats.profitFactor)}</span>} />
      <StatCell label="Net P&L" value={<span className={pnlColor(stats.netPnlDollar)}>{fmtPnl(stats.netPnlDollar)}</span>} sub={fmtR(stats.netPnlR)} />
      <StatCell label="Max Drawdown" value={<span className={pnlColor(stats.maxDrawdown)}>{fmtPnl(stats.maxDrawdown)}</span>} />
      <StatCell label="Gross Profit" value={<span className="text-[var(--arc-green)]">{fmtPnl(stats.grossProfit)}</span>} />
      <StatCell label="Gross Loss" value={<span className="text-[var(--danger-red)]">{fmtPnl(stats.grossLoss)}</span>} />
      <StatCell label="Avg Win" value={<span className="text-[var(--arc-green)]">{fmtPnl(stats.avgWin)}</span>} />
      <StatCell label="Avg Loss" value={<span className="text-[var(--danger-red)]">{fmtPnl(stats.avgLoss)}</span>} />
      <StatCell label="Largest Win" value={<span className="text-[var(--arc-green)]">{fmtPnl(stats.largestWin)}</span>} />
      <StatCell label="Largest Loss" value={<span className="text-[var(--danger-red)]">{fmtPnl(stats.largestLoss)}</span>} />
      <StatCell label="Win Streak" value={<span className="text-[var(--arc-green)]">{stats.currentWinStreak}</span>} sub="current" />
      <StatCell label="Lose Streak" value={<span className="text-[var(--danger-red)]">{stats.currentLoseStreak}</span>} sub="current" />
      <StatCell label="Avg Hold" value={<span className="text-[var(--arc-cyan)]">{stats.avgHoldTimeMin.toFixed(0)}m</span>} />
    </div>
  );
}

// ── Strategy Card ─────────────────────────────────────────────────────────────

function StrategyCard({
  strategy,
  performance,
  riskPerTrade,
  isLoading,
}: {
  strategy: {
    strategyId: string; name: string; stage: string; regime: string | null;
    session: string | null; pcsScore: number | null; confidenceScore: number | null;
    recommendation: string | null; certificationGatesPassed: number | null;
    certificationGatesTotal: number | null; historicalWinRate: number | null;
    historicalProfitFactor: number | null; historicalMaxDrawdown: number | null;
    historicalTradeCount: number | null; historicalNetPnl: number | null;
    largestWinStreak: number | null; largestLoseStreak: number | null;
    paperTradingStartDate: number | null; paperTradingTargetDays: number | null;
    notes: string | null; rejectionReason: string | null;
  };
  performance: {
    last24h: Record<string, number>; last7d: Record<string, number>;
    last30d: Record<string, number>; allTime: Record<string, number>;
    totalTradesInDB: number;
  } | null | undefined;
  riskPerTrade: number;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("24h");

  const isRejected = strategy.stage === "REJECTED" || strategy.stage === "ARCHIVED";
  const isProduction = strategy.stage === "PRODUCTION";
  const isPaper = strategy.stage === "PAPER";

  // Promotion countdown for paper models
  const promotionDaysLeft = useMemo(() => {
    if (!isPaper || !strategy.paperTradingStartDate || !strategy.paperTradingTargetDays) return null;
    const elapsed = (Date.now() - strategy.paperTradingStartDate) / 86400000;
    return Math.max(0, strategy.paperTradingTargetDays - elapsed);
  }, [isPaper, strategy.paperTradingStartDate, strategy.paperTradingTargetDays]);

  const gatesPassed = strategy.certificationGatesPassed ?? 0;
  const gatesTotal = strategy.certificationGatesTotal ?? 8;
  const certPct = gatesTotal > 0 ? (gatesPassed / gatesTotal) * 100 : 0;

  const borderColor = isProduction ? "var(--arc-green)" :
    isPaper ? "var(--arc-cyan)" :
    strategy.stage === "CANDIDATE" ? "oklch(0.65 0.18 280)" :
    strategy.stage === "HYPOTHESIS" ? "oklch(0.55 0.12 260)" :
    isRejected ? "var(--danger-red)" : "var(--hud-border)";

  const currentStats = performance?.[activeTab === "24h" ? "last24h" : activeTab === "7d" ? "last7d" : activeTab === "30d" ? "last30d" : "allTime"] as Record<string, number> | undefined;

  return (
    <div
      className="rounded-lg border transition-all duration-300"
      style={{
        background: "oklch(0.12 0.04 220 / 0.8)",
        borderColor,
        boxShadow: expanded ? `0 0 20px ${borderColor}20` : `0 0 8px ${borderColor}10`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-['Orbitron'] text-sm font-bold tracking-wider" style={{ color: borderColor }}>
              {strategy.strategyId}
            </span>
            {stageBadge(strategy.stage)}
            {strategy.regime && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--hud-border)] text-[var(--color-muted-foreground)]">
                {strategy.regime}
              </span>
            )}
          </div>
          <span className="text-xs text-[var(--color-muted-foreground)] truncate">{strategy.name}</span>
          {strategy.session && (
            <span className="text-[9px] text-[var(--arc-blue)]">{strategy.session}</span>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 ml-4 shrink-0">
          {strategy.pcsScore !== null && (
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">PCS</div>
              <div className="text-lg font-['Orbitron'] font-bold" style={{ color: borderColor }}>
                {strategy.pcsScore.toFixed(1)}
              </div>
            </div>
          )}
          {performance && performance.totalTradesInDB > 0 && (
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">LIVE TRADES</div>
              <div className="text-lg font-['Orbitron'] font-bold text-[var(--arc-cyan)]">
                {performance.totalTradesInDB}
              </div>
            </div>
          )}
          <ChevronRight
            size={16}
            className="text-[var(--color-muted-foreground)] transition-transform duration-200"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          />
        </div>
      </div>

      {/* PCS + Confidence bars */}
      <div className="px-4 pb-2 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">PCS SCORE</div>
          {pcsBar(strategy.pcsScore)}
        </div>
        <div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">CONFIDENCE</div>
          {confidenceBar(strategy.confidenceScore)}
        </div>
      </div>

      {/* Certification gates */}
      {!isRejected && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">CERTIFICATION GATES</span>
            <span className="text-[9px] font-mono text-[var(--arc-cyan)]">{gatesPassed}/{gatesTotal}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: gatesTotal }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-1.5 rounded-full"
                style={{
                  background: i < gatesPassed ? "var(--arc-green)" : "oklch(0.18 0.04 220)",
                  boxShadow: i < gatesPassed ? "0 0 4px var(--arc-green)60" : "none",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Promotion countdown for paper models */}
      {isPaper && promotionDaysLeft !== null && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Clock size={12} className="text-[var(--stark-gold)]" />
          <span className="text-[10px] text-[var(--stark-gold)]">
            {promotionDaysLeft <= 0 ? "PROMOTION ELIGIBLE" : `${Math.ceil(promotionDaysLeft)} days to promotion eligibility`}
          </span>
        </div>
      )}

      {/* Recommendation */}
      {strategy.recommendation && (
        <div className="mx-4 mb-3 px-3 py-2 rounded border border-[var(--hud-border)] bg-[oklch(0.10_0.03_220)]">
          <span className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed">{strategy.recommendation}</span>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--hud-border)]">
          {/* Historical stats */}
          <div className="p-4">
            <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-3">HISTORICAL BACKTEST RESULTS</div>
            <div className="grid grid-cols-4 gap-3">
              <StatCell label="Trades" value={<span className="text-[var(--arc-cyan)]">{strategy.historicalTradeCount ?? "—"}</span>} />
              <StatCell label="Win Rate" value={<span className={strategy.historicalWinRate && strategy.historicalWinRate >= 55 ? "text-[var(--arc-green)]" : "text-[var(--stark-gold)]"}>{fmtPct(strategy.historicalWinRate)}</span>} />
              <StatCell label="Profit Factor" value={<span className={strategy.historicalProfitFactor && strategy.historicalProfitFactor >= 1.5 ? "text-[var(--arc-green)]" : "text-[var(--stark-gold)]"}>{fmt(strategy.historicalProfitFactor)}</span>} />
              <StatCell label="Net P&L" value={<span className={pnlColor(strategy.historicalNetPnl)}>{fmtPnl(strategy.historicalNetPnl)}</span>} sub="at base risk" />
              <StatCell label="Max Drawdown" value={<span className={pnlColor(strategy.historicalMaxDrawdown)}>{fmtPnl(strategy.historicalMaxDrawdown)}</span>} />
              <StatCell label="Win Streak" value={<span className="text-[var(--arc-green)]">{strategy.largestWinStreak ?? "—"}</span>} sub="largest" />
              <StatCell label="Lose Streak" value={<span className="text-[var(--danger-red)]">{strategy.largestLoseStreak ?? "—"}</span>} sub="largest" />
              <StatCell label="Risk/Trade" value={<span className="text-[var(--arc-cyan)]">${riskPerTrade}</span>} sub="selected profile" />
            </div>
          </div>

          {/* Live performance */}
          {!isRejected && (
            <div className="border-t border-[var(--hud-border)]">
              <div className="p-4 pb-2">
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-3">LIVE PERFORMANCE</div>
                <div className="flex gap-1 mb-3">
                  {["24h", "7d", "30d", "All"].map(t => (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t === "All" ? "allTime" : t)}
                      className="px-2 py-1 text-[9px] rounded font-mono tracking-widest transition-all"
                      style={{
                        background: activeTab === (t === "All" ? "allTime" : t) ? "var(--arc-cyan)" : "transparent",
                        color: activeTab === (t === "All" ? "allTime" : t) ? "oklch(0.08 0.02 220)" : "var(--color-muted-foreground)",
                        border: `1px solid ${activeTab === (t === "All" ? "allTime" : t) ? "var(--arc-cyan)" : "var(--hud-border)"}`,
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {isLoading ? (
                  <div className="text-xs text-[var(--color-muted-foreground)] py-4 text-center">Loading…</div>
                ) : (
                  <PeriodStats stats={currentStats as Parameters<typeof PeriodStats>[0]["stats"]} risk={riskPerTrade} />
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {strategy.notes && (
            <div className="border-t border-[var(--hud-border)] p-4">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-2">TECHNICAL NOTES</div>
              <p className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed">{strategy.notes}</p>
            </div>
          )}
          {strategy.rejectionReason && (
            <div className="border-t border-[var(--hud-border)] p-4">
              <div className="text-[9px] text-[var(--danger-red)] tracking-widest mb-2">REJECTION REASON</div>
              <p className="text-[10px] text-[var(--danger-red)]/80 leading-relaxed">{strategy.rejectionReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Gap Coverage Map ──────────────────────────────────────────────────────────

type GapItem = {
  category: string; description: string; frequency: string; coverage: number;
  severity: string; currentModels: string[]; currentCandidates: string[];
  researchPriority: number; expectedPcsImprovement: number;
  estimatedResearchHours: number; probabilityOfSuccess: number; notes: string;
};

function GapCoverageMap({ gaps }: { gaps: GapItem[] }) {
  const severityColor = (s: string) => {
    if (s === "CRITICAL") return "var(--danger-red)";
    if (s === "HIGH") return "oklch(0.75 0.22 30)";
    if (s === "MODERATE") return "var(--stark-gold)";
    if (s === "LOW") return "var(--arc-cyan)";
    return "var(--arc-green)";
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {gaps.sort((a, b) => a.researchPriority - b.researchPriority).map(gap => {
        const color = severityColor(gap.severity);
        return (
          <div
            key={gap.category}
            className="rounded-lg border p-4"
            style={{ borderColor: color + "40", background: "oklch(0.10 0.03 220 / 0.8)" }}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-[var(--arc-cyan)]">{gap.category}</span>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-widest"
                    style={{ background: color + "20", color, border: `1px solid ${color}40` }}
                  >
                    {gap.severity}
                  </span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">Priority #{gap.researchPriority}</span>
                </div>
                <div className="text-[10px] text-[var(--color-muted-foreground)]">{gap.description} — {gap.frequency}</div>
              </div>
              <div className="text-right ml-4 shrink-0">
                <div className="text-[9px] text-[var(--color-muted-foreground)]">COVERAGE</div>
                <div className="text-xl font-['Orbitron'] font-bold" style={{ color }}>{gap.coverage}%</div>
              </div>
            </div>

            {/* Coverage bar */}
            <div className="h-1.5 rounded-full bg-[oklch(0.18_0.04_220)] mb-3">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${gap.coverage}%`, background: color, boxShadow: `0 0 6px ${color}40` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-[10px]">
              <div>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">ACTIVE MODELS</div>
                {gap.currentModels.length > 0
                  ? gap.currentModels.map(m => <div key={m} className="text-[var(--arc-green)]">{m}</div>)
                  : <div className="text-[var(--danger-red)]">None</div>}
              </div>
              <div>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">CANDIDATES</div>
                {gap.currentCandidates.length > 0
                  ? gap.currentCandidates.map(c => <div key={c} className="text-[var(--stark-gold)] truncate">{c}</div>)
                  : <div className="text-[var(--color-muted-foreground)]">None</div>}
              </div>
              <div>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">RESEARCH</div>
                <div className="text-[var(--arc-cyan)]">+{gap.expectedPcsImprovement} PCS</div>
                <div className="text-[var(--color-muted-foreground)]">{gap.estimatedResearchHours}h est.</div>
                <div className="text-[var(--stark-gold)]">{gap.probabilityOfSuccess}% P(success)</div>
              </div>
            </div>

            <div className="mt-2 text-[9px] text-[var(--color-muted-foreground)] italic">{gap.notes}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Portfolio Projections ─────────────────────────────────────────────────────

function PortfolioProjections({ projections, riskPerTrade }: {
  projections: Array<{ action: string; pcs: number; change: number; timeline: string }>;
  riskPerTrade: number;
}) {
  return (
    <div className="space-y-2">
      {projections.map((p, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg border"
          style={{
            borderColor: i === 0 ? "var(--hud-border)" : "var(--arc-green)/30",
            background: i === 0 ? "oklch(0.10 0.03 220)" : "oklch(0.12 0.04 220 / 0.5)",
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-['Orbitron'] text-sm font-bold"
            style={{
              background: i === 0 ? "oklch(0.18 0.04 220)" : "var(--arc-green)/20",
              color: i === 0 ? "var(--color-muted-foreground)" : "var(--arc-green)",
              border: `1px solid ${i === 0 ? "var(--hud-border)" : "var(--arc-green)/40"}`,
            }}
          >
            {p.pcs.toFixed(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[var(--arc-cyan)] truncate">{p.action}</div>
            <div className="text-[9px] text-[var(--color-muted-foreground)]">{p.timeline}</div>
          </div>
          {p.change > 0 && (
            <div className="text-right shrink-0">
              <div className="text-xs font-bold text-[var(--arc-green)]">+{p.change.toFixed(1)} PCS</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Risk Profile Selector ─────────────────────────────────────────────────────

function RiskProfileSelector({
  profiles,
  selectedProfileId,
  customRisk,
  onSelect,
  onCustomChange,
  onApplyCustom,
}: {
  profiles: Array<{ profileId: string; label: string; riskPerTrade: number; isDefault: boolean }>;
  selectedProfileId: string;
  customRisk: string;
  onSelect: (id: string, risk: number) => void;
  onCustomChange: (v: string) => void;
  onApplyCustom: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[9px] tracking-widest text-[var(--color-muted-foreground)]">RISK PROFILE</span>
      {profiles.map(p => (
        <button
          key={p.profileId}
          onClick={() => onSelect(p.profileId, p.riskPerTrade)}
          className="px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-widest transition-all"
          style={{
            background: selectedProfileId === p.profileId ? "var(--arc-cyan)" : "transparent",
            color: selectedProfileId === p.profileId ? "oklch(0.08 0.02 220)" : "var(--arc-cyan)",
            border: `1px solid ${selectedProfileId === p.profileId ? "var(--arc-cyan)" : "var(--hud-border)"}`,
          }}
        >
          {p.label} ${p.riskPerTrade.toLocaleString()}
        </button>
      ))}
      {selectedProfileId === "CUSTOM" && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-muted-foreground)]">$</span>
          <Input
            type="number"
            value={customRisk}
            onChange={e => onCustomChange(e.target.value)}
            className="w-24 h-7 text-xs font-mono"
            style={{ background: "oklch(0.12 0.04 220)", borderColor: "var(--hud-border)" }}
          />
          <Button
            size="sm"
            onClick={onApplyCustom}
            className="h-7 text-[9px] px-2"
            style={{ background: "var(--arc-cyan)", color: "oklch(0.08 0.02 220)" }}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ExecutivePortfolio() {
  const [selectedProfileId, setSelectedProfileId] = useState("PROP_EVAL");
  const [riskPerTrade, setRiskPerTrade] = useState(450);
  const [customRisk, setCustomRisk] = useState("450");
  const [activeSection, setActiveSection] = useState("models");
  const [stageFilter, setStageFilter] = useState("ALL");

  const { data: profiles } = trpc.executive.riskProfiles.useQuery(undefined, { refetchInterval: 60000 });
  const { data: registry, isLoading: registryLoading } = trpc.executive.strategyRegistry.useQuery(undefined, { refetchInterval: 30000 });
  const { data: portfolio, isLoading: portfolioLoading } = trpc.executive.portfolioOverview.useQuery({ riskPerTrade }, { refetchInterval: 30000 });
  const { data: gaps } = trpc.executive.gapCoverage.useQuery(undefined, { refetchInterval: 60000 });
  const { data: projections } = trpc.executive.portfolioProjections.useQuery(undefined, { refetchInterval: 60000 });
  const { data: riskAnalytics } = trpc.executive.riskAnalytics.useQuery({ riskPerTrade }, { refetchInterval: 30000 });
  const { data: liveFeed } = trpc.executive.liveFeed.useQuery({ limit: 20 }, { refetchInterval: 15000 });
  const { data: homeStats } = trpc.executive.homeStats.useQuery(undefined, { refetchInterval: 30000 });

  const updateCustomRisk = trpc.executive.updateCustomRisk.useMutation();
  const utils = trpc.useUtils();

  const handleProfileSelect = (id: string, risk: number) => {
    setSelectedProfileId(id);
    setRiskPerTrade(risk);
  };

  const handleApplyCustom = async () => {
    const v = parseFloat(customRisk);
    if (isNaN(v) || v < 1) return;
    await updateCustomRisk.mutateAsync({ riskPerTrade: v });
    setRiskPerTrade(v);
    utils.executive.riskAnalytics.invalidate();
    utils.executive.portfolioOverview.invalidate();
  };

  // Per-strategy performance queries (batch)
  const strategyIds = registry?.map(s => s.strategyId) ?? [];

  // Filter strategies by stage
  const filteredStrategies = useMemo(() => {
    if (!registry) return [];
    if (stageFilter === "ALL") return registry;
    if (stageFilter === "ACTIVE") return registry.filter(s => s.stage === "PRODUCTION" || s.stage === "PAPER");
    if (stageFilter === "RESEARCH") return registry.filter(s => s.stage === "CANDIDATE" || s.stage === "HYPOTHESIS");
    if (stageFilter === "REJECTED") return registry.filter(s => s.stage === "REJECTED" || s.stage === "ARCHIVED");
    return registry.filter(s => s.stage === stageFilter);
  }, [registry, stageFilter]);

  const stageGroups = useMemo(() => {
    if (!filteredStrategies) return {};
    return {
      PRODUCTION: filteredStrategies.filter(s => s.stage === "PRODUCTION"),
      PAPER: filteredStrategies.filter(s => s.stage === "PAPER"),
      CANDIDATE: filteredStrategies.filter(s => s.stage === "CANDIDATE"),
      HYPOTHESIS: filteredStrategies.filter(s => s.stage === "HYPOTHESIS"),
      REJECTED: filteredStrategies.filter(s => s.stage === "REJECTED" || s.stage === "ARCHIVED"),
    };
  }, [filteredStrategies]);

  const pcs = homeStats?.portfolioPcs ?? 66.1;
  const pcsTarget = homeStats?.portfolioPcsTarget ?? 80.0;
  const pcsColor = pcs >= 80 ? "var(--arc-green)" : pcs >= 70 ? "var(--stark-gold)" : "var(--arc-cyan)";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--color-background)" }}>
      {/* ── Header ── */}
      <div
        className="shrink-0 px-6 py-4 border-b"
        style={{ borderColor: "var(--hud-border)", background: "oklch(0.10 0.04 220 / 0.95)" }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="font-['Orbitron'] text-lg font-bold tracking-wider text-[var(--arc-cyan)]">
                EXECUTIVE PORTFOLIO INTELLIGENCE
              </span>
              {homeStats?.pipelineHealthy ? (
                <span className="flex items-center gap-1 text-[9px] text-[var(--arc-green)] border border-[var(--arc-green)]/40 px-2 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--arc-green)] animate-pulse" />
                  LIVE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] text-[var(--stark-gold)] border border-[var(--stark-gold)]/40 px-2 py-0.5 rounded">
                  <AlertTriangle size={10} />
                  PIPELINE SILENT
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              Sprint 104A — If Atlas knows it, the owner is already looking at it
            </div>
          </div>

          {/* Portfolio KPIs */}
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">PORTFOLIO PCS</div>
              <div className="text-2xl font-['Orbitron'] font-bold" style={{ color: pcsColor }}>
                {pcs.toFixed(1)}
                <span className="text-sm text-[var(--color-muted-foreground)] ml-1">/ {pcsTarget}</span>
              </div>
              <div className="w-full h-1 rounded-full bg-[oklch(0.18_0.04_220)] mt-1">
                <div className="h-full rounded-full" style={{ width: `${(pcs / 100) * 100}%`, background: pcsColor }} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">PORTFOLIO PF</div>
              <div className="text-2xl font-['Orbitron'] font-bold text-[var(--arc-green)]">
                {homeStats?.portfolioPf.toFixed(3) ?? "1.708"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">ALL-TIME P&L</div>
              <div className="text-2xl font-['Orbitron'] font-bold text-[var(--arc-green)]">
                {fmtPnl((homeStats?.portfolioNetPnl ?? 5212) * (riskPerTrade / 800))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">WIN RATE</div>
              <div className="text-2xl font-['Orbitron'] font-bold text-[var(--arc-cyan)]">
                {homeStats?.portfolioWr.toFixed(1) ?? "60.0"}%
              </div>
            </div>
          </div>
        </div>

        {/* Risk Profile Selector */}
        <div className="mt-3 pt-3 border-t border-[var(--hud-border)]">
          <RiskProfileSelector
            profiles={profiles ?? [
              { profileId: "PROP_EVAL", label: "Prop Evaluation", riskPerTrade: 450, isDefault: true },
              { profileId: "LIVE", label: "Live Trading", riskPerTrade: 1650, isDefault: false },
              { profileId: "CUSTOM", label: "Custom", riskPerTrade: parseFloat(customRisk) || 450, isDefault: false },
            ]}
            selectedProfileId={selectedProfileId}
            customRisk={customRisk}
            onSelect={handleProfileSelect}
            onCustomChange={setCustomRisk}
            onApplyCustom={handleApplyCustom}
          />
        </div>
      </div>

      {/* ── Section Nav ── */}
      <div
        className="shrink-0 flex items-center gap-1 px-6 py-2 border-b overflow-x-auto"
        style={{ borderColor: "var(--hud-border)", background: "oklch(0.09 0.03 220 / 0.9)" }}
      >
        {[
          { id: "models", label: "MODELS", icon: BarChart3 },
          { id: "portfolio", label: "PORTFOLIO", icon: Target },
          { id: "gaps", label: "GAP ANALYSIS", icon: AlertCircle },
          { id: "risk", label: "RISK ANALYTICS", icon: Shield },
          { id: "feed", label: "LIVE FEED", icon: Activity },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-bold tracking-widest transition-all whitespace-nowrap"
            style={{
              background: activeSection === s.id ? "var(--arc-cyan)" : "transparent",
              color: activeSection === s.id ? "oklch(0.08 0.02 220)" : "var(--color-muted-foreground)",
              border: `1px solid ${activeSection === s.id ? "var(--arc-cyan)" : "transparent"}`,
            }}
          >
            <s.icon size={11} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-6 py-4">

        {/* ── MODELS SECTION ── */}
        {activeSection === "models" && (
          <div>
            {/* Stage filter */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">FILTER</span>
              {["ALL", "ACTIVE", "PRODUCTION", "PAPER", "RESEARCH", "REJECTED"].map(f => (
                <button
                  key={f}
                  onClick={() => setStageFilter(f)}
                  className="px-2 py-1 text-[9px] rounded font-mono tracking-widest transition-all"
                  style={{
                    background: stageFilter === f ? "oklch(0.65 0.18 280)" : "transparent",
                    color: stageFilter === f ? "white" : "var(--color-muted-foreground)",
                    border: `1px solid ${stageFilter === f ? "oklch(0.65 0.18 280)" : "var(--hud-border)"}`,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Production */}
            {stageGroups.PRODUCTION && stageGroups.PRODUCTION.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={14} className="text-[var(--arc-green)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[var(--arc-green)]">PRODUCTION — ATS v2.0 (Frozen)</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{stageGroups.PRODUCTION.length} models</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageGroups.PRODUCTION.map(s => (
                    <StrategyCardWithPerf key={s.strategyId} strategy={s} riskPerTrade={riskPerTrade} />
                  ))}
                </div>
              </div>
            )}

            {/* Paper Trading */}
            {stageGroups.PAPER && stageGroups.PAPER.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={14} className="text-[var(--arc-cyan)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[var(--arc-cyan)]">PAPER TRADING — Forward Validation</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{stageGroups.PAPER.length} models</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageGroups.PAPER.map(s => (
                    <StrategyCardWithPerf key={s.strategyId} strategy={s} riskPerTrade={riskPerTrade} />
                  ))}
                </div>
              </div>
            )}

            {/* Candidates */}
            {stageGroups.CANDIDATE && stageGroups.CANDIDATE.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Brain size={14} className="text-[oklch(0.65_0.18_280)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[oklch(0.65_0.18_280)]">CANDIDATES — In Research</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{stageGroups.CANDIDATE.length} models</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageGroups.CANDIDATE.map(s => (
                    <StrategyCardWithPerf key={s.strategyId} strategy={s} riskPerTrade={riskPerTrade} />
                  ))}
                </div>
              </div>
            )}

            {/* Hypotheses */}
            {stageGroups.HYPOTHESIS && stageGroups.HYPOTHESIS.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={14} className="text-[oklch(0.55_0.12_260)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[oklch(0.55_0.12_260)]">HYPOTHESES — Unvalidated</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{stageGroups.HYPOTHESIS.length} models</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageGroups.HYPOTHESIS.map(s => (
                    <StrategyCardWithPerf key={s.strategyId} strategy={s} riskPerTrade={riskPerTrade} />
                  ))}
                </div>
              </div>
            )}

            {/* Rejected / Archived */}
            {stageGroups.REJECTED && stageGroups.REJECTED.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-[var(--danger-red)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[var(--danger-red)]">REJECTED / ARCHIVED — Permanent Record</span>
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">{stageGroups.REJECTED.length} models</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {stageGroups.REJECTED.map(s => (
                    <StrategyCardWithPerf key={s.strategyId} strategy={s} riskPerTrade={riskPerTrade} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PORTFOLIO SECTION ── */}
        {activeSection === "portfolio" && portfolio && (
          <div className="grid grid-cols-1 gap-4">
            {/* Top KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Portfolio PCS", value: portfolio.pcs.toFixed(1), sub: `Target: ${portfolio.targetPcs}`, color: pcsColor },
                { label: "Profit Factor", value: portfolio.profitFactor.toFixed(3), sub: "All-time", color: "var(--arc-green)" },
                { label: "Win Rate", value: `${portfolio.winRate.toFixed(1)}%`, sub: "All-time", color: "var(--arc-cyan)" },
                { label: "Net P&L", value: fmtPnl(portfolio.scaledPnl), sub: `at $${riskPerTrade}/trade`, color: portfolio.scaledPnl >= 0 ? "var(--arc-green)" : "var(--danger-red)" },
                { label: "Max Drawdown", value: fmtPnl(portfolio.scaledDD), sub: `at $${riskPerTrade}/trade`, color: "var(--danger-red)" },
                { label: "Total Trades", value: portfolio.tradeCount.toString(), sub: "All-time", color: "var(--arc-cyan)" },
                { label: "Active Models", value: portfolio.activeModels.toString(), sub: "Production", color: "var(--arc-green)" },
                { label: "Paper Models", value: portfolio.paperModels.toString(), sub: "Forward validation", color: "var(--arc-cyan)" },
              ].map(k => (
                <div key={k.label} className="rounded-lg border border-[var(--hud-border)] p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                  <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-1">{k.label}</div>
                  <div className="text-xl font-['Orbitron'] font-bold" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-[9px] text-[var(--color-muted-foreground)] mt-1">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {portfolio.strongest && (
                <div className="rounded-lg border border-[var(--arc-green)]/40 p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy size={14} className="text-[var(--arc-green)]" />
                    <span className="text-[10px] font-bold tracking-widest text-[var(--arc-green)]">STRONGEST MODEL</span>
                  </div>
                  <div className="text-sm font-bold text-[var(--arc-cyan)]">{portfolio.strongest.strategyId}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">PCS {portfolio.strongest.pcsScore.toFixed(1)}</div>
                </div>
              )}
              {portfolio.needsAttention && (
                <div className="rounded-lg border border-[var(--stark-gold)]/40 p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} className="text-[var(--stark-gold)]" />
                    <span className="text-[10px] font-bold tracking-widest text-[var(--stark-gold)]">NEEDS ATTENTION</span>
                  </div>
                  <div className="text-sm font-bold text-[var(--arc-cyan)]">{portfolio.needsAttention.strategyId}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{portfolio.needsAttention.reason}</div>
                </div>
              )}
              {portfolio.promotionCandidate && (
                <div className="rounded-lg border border-[var(--arc-cyan)]/40 p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight size={14} className="text-[var(--arc-cyan)]" />
                    <span className="text-[10px] font-bold tracking-widest text-[var(--arc-cyan)]">PROMOTION CANDIDATE</span>
                  </div>
                  <div className="text-sm font-bold text-[var(--arc-cyan)]">{portfolio.promotionCandidate.strategyId}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">{portfolio.promotionCandidate.gatesPassed}/8 gates passed</div>
                </div>
              )}
              <div className="rounded-lg border border-[var(--hud-border)] p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} className="text-[var(--arc-blue)]" />
                  <span className="text-[10px] font-bold tracking-widest text-[var(--arc-blue)]">CURRENT REGIME</span>
                </div>
                <div className="text-sm font-bold text-[var(--arc-cyan)]">{portfolio.currentRegime ?? "—"}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">{portfolio.currentSession ?? "—"}</div>
              </div>
            </div>

            {/* Model Rankings */}
            <div className="rounded-lg border border-[var(--hud-border)] p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
              <div className="text-[10px] font-bold tracking-widest text-[var(--arc-cyan)] mb-3">MODEL RANKINGS BY PCS</div>
              <div className="space-y-2">
                {portfolio.rankings.map((r, i) => (
                  <div key={r.strategyId} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-[var(--color-muted-foreground)] w-5">#{i + 1}</span>
                    <span className="text-xs font-bold text-[var(--arc-cyan)] w-16">{r.strategyId}</span>
                    {stageBadge(r.stage)}
                    <div className="flex-1">{pcsBar(r.pcsScore)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Portfolio Projections */}
            <div className="rounded-lg border border-[var(--hud-border)] p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
              <div className="text-[10px] font-bold tracking-widest text-[var(--arc-cyan)] mb-3">PORTFOLIO PCS PROJECTION ROADMAP</div>
              <PortfolioProjections projections={portfolio.projections} riskPerTrade={riskPerTrade} />
            </div>
          </div>
        )}

        {/* ── GAP ANALYSIS SECTION ── */}
        {activeSection === "gaps" && gaps && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-[var(--danger-red)]/40 p-3" style={{ background: "oklch(0.10 0.03 220)" }}>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">CRITICAL GAPS</div>
                <div className="text-2xl font-['Orbitron'] font-bold text-[var(--danger-red)]">
                  {(gaps as GapItem[]).filter(g => g.severity === "CRITICAL").length}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--stark-gold)]/40 p-3" style={{ background: "oklch(0.10 0.03 220)" }}>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">HIGH GAPS</div>
                <div className="text-2xl font-['Orbitron'] font-bold text-[var(--stark-gold)]">
                  {(gaps as GapItem[]).filter(g => g.severity === "HIGH").length}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--arc-green)]/40 p-3" style={{ background: "oklch(0.10 0.03 220)" }}>
                <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest">COVERED</div>
                <div className="text-2xl font-['Orbitron'] font-bold text-[var(--arc-green)]">
                  {(gaps as GapItem[]).filter(g => g.severity === "COVERED").length}
                </div>
              </div>
            </div>
            <GapCoverageMap gaps={gaps as GapItem[]} />
          </div>
        )}

        {/* ── RISK ANALYTICS SECTION ── */}
        {activeSection === "risk" && riskAnalytics && (
          <div className="space-y-3">
            <div className="text-xs text-[var(--color-muted-foreground)] mb-2">
              All projections calculated at <span className="text-[var(--arc-cyan)] font-bold">${riskPerTrade.toLocaleString()}/trade</span>. Change the risk profile above to recalculate instantly.
            </div>
            {riskAnalytics.map(s => (
              <div key={s.strategyId} className="rounded-lg border border-[var(--hud-border)] p-4" style={{ background: "oklch(0.10 0.03 220)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-['Orbitron'] text-sm font-bold text-[var(--arc-cyan)]">{s.strategyId}</span>
                    {stageBadge(s.stage)}
                    <span className="text-[9px] text-[var(--color-muted-foreground)]">{s.historicalTrades} hist. trades</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-[var(--color-muted-foreground)]">MC PASS RATE</div>
                    <div className="text-sm font-bold text-[var(--arc-green)]">{s.mcPassRate.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCell label="Expectancy/Trade" value={<span className={pnlColor(s.expectancy)}>{fmtPnl(s.expectancy)}</span>} />
                  <StatCell label="Expected Daily" value={<span className={pnlColor(s.expectedDailyPnl)}>{fmtPnl(s.expectedDailyPnl)}</span>} sub={`${s.tradesPerDay.toFixed(1)} trades/day`} />
                  <StatCell label="Expected Weekly" value={<span className={pnlColor(s.expectedWeeklyPnl)}>{fmtPnl(s.expectedWeeklyPnl)}</span>} />
                  <StatCell label="Expected Monthly" value={<span className={pnlColor(s.expectedMonthlyPnl)}>{fmtPnl(s.expectedMonthlyPnl)}</span>} />
                  <StatCell label="Expected Annual" value={<span className={pnlColor(s.expectedAnnualPnl)}>{fmtPnl(s.expectedAnnualPnl)}</span>} />
                  <StatCell label="Max Drawdown" value={<span className={pnlColor(s.scaledMaxDrawdown)}>{fmtPnl(s.scaledMaxDrawdown)}</span>} />
                  <StatCell label="RoMaD" value={<span className="text-[var(--arc-cyan)]">{s.roMaD.toFixed(2)}x</span>} sub="Return / Max DD" />
                  <StatCell label="Win Rate" value={<span className="text-[var(--arc-cyan)]">{s.historicalWr.toFixed(1)}%</span>} sub="historical" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LIVE FEED SECTION ── */}
        {activeSection === "feed" && (
          <div className="space-y-2">
            <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-widest mb-3">
              LIVE INTELLIGENCE FEED — auto-refreshing every 15s
            </div>
            {liveFeed && liveFeed.length > 0 ? liveFeed.map((e, i) => {
              const color = e.severity === "CRITICAL" ? "var(--danger-red)" :
                e.severity === "WARNING" ? "var(--stark-gold)" :
                e.type === "DARWIN" ? "oklch(0.65 0.18 280)" :
                e.type === "BAR" ? "var(--arc-cyan)" : "var(--arc-blue)";
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded border"
                  style={{ borderColor: color + "30", background: "oklch(0.10 0.03 220 / 0.8)" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-bold tracking-widest" style={{ color }}>{e.type}</span>
                      <span className="text-[9px] text-[var(--color-muted-foreground)]">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">{e.message}</div>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-8 text-[var(--color-muted-foreground)] text-xs">
                No recent activity. Waiting for pipeline events…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Strategy Card with per-strategy performance query ─────────────────────────

function StrategyCardWithPerf({
  strategy,
  riskPerTrade,
}: {
  strategy: {
    strategyId: string; name: string; stage: string; regime: string | null;
    session: string | null; pcsScore: number | null; confidenceScore: number | null;
    recommendation: string | null; certificationGatesPassed: number | null;
    certificationGatesTotal: number | null; historicalWinRate: number | null;
    historicalProfitFactor: number | null; historicalMaxDrawdown: number | null;
    historicalTradeCount: number | null; historicalNetPnl: number | null;
    largestWinStreak: number | null; largestLoseStreak: number | null;
    paperTradingStartDate: number | null; paperTradingTargetDays: number | null;
    notes: string | null; rejectionReason: string | null;
  };
  riskPerTrade: number;
}) {
  const { data: performance, isLoading } = trpc.executive.strategyPerformance.useQuery(
    { strategyId: strategy.strategyId, riskPerTrade },
    { refetchInterval: 30000 }
  );

  return (
    <StrategyCard
      strategy={strategy}
      performance={performance}
      riskPerTrade={riskPerTrade}
      isLoading={isLoading}
    />
  );
}
