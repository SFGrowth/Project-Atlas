/**
 * Daily Review — Latest autonomous daily review report + searchable archive.
 * Reports are generated automatically at 4:30 PM ET by the Atlas scheduler.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarCheck, TrendingUp, TrendingDown, Activity, AlertCircle,
  CheckCircle, Search, ChevronRight, BarChart2, Cpu, Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradingSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  largestWinner: number;
  largestLoser: number;
  noTradeReason: string | null;
}

interface ModelActivity {
  [key: string]: {
    signalsGenerated: number;
    tradesApproved: number;
    tradesRejected: number;
    avgEdgeScore: number | null;
    avgRas: number | null;
    avgConfidence: string | null;
    avgHoldingTimeMs: number | null;
  };
}

interface RegimeSummary {
  marketRegime: string | null;
  sessionBehaviour: string | null;
  trendStrength: string | null;
  volatilityRegime: string | null;
  chopState: string | null;
  atrExpansion: number | null;
  newsEnvironment: string | null;
  topRejectionReason: string | null;
  rasDistribution: { activated: number; marginal: number; suppressed: number };
}

interface DecisionReview {
  tradesTaken: string[];
  tradesRejected: string[];
  largestMissedOpportunity: string | null;
  largestFalseActivation: string | null;
  largestFalseSuppression: string | null;
  suggestedResearchItems: string[];
}

interface SystemHealth {
  dbStatus: string;
  dashboardStatus: string;
  lastHeartbeat: string | null;
  errorCount: number;
  recentErrors: { type: string; message: string; ts: string }[];
}

interface PerformanceTracking {
  [window: string]: {
    allStats?: { count: number; wr: number; pf: number; expectancy: number; netPnl: number; maxDd: number };
    sb1Stats?: { count: number; wr: number; pf: number; expectancy: number; netPnl: number; maxDd: number };
    sb1AvgRas?: number;
  };
}

interface DailyReviewReport {
  reviewDate: string;
  generatedAt: string;
  tradingSummary: TradingSummary;
  modelActivity: ModelActivity;
  regimeSummary: RegimeSummary;
  decisionReview: DecisionReview;
  systemHealth: SystemHealth;
  performanceTracking: PerformanceTracking;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null) return "—";
  return v.toFixed(dec);
}

function fmtPnl(v: number | null | undefined): React.ReactElement {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const cls = v >= 0 ? "text-emerald-400" : "text-red-400";
  return <span className={cls}>{v >= 0 ? "+" : ""}${v.toFixed(2)}</span>;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// ─── Section Components ───────────────────────────────────────────────────────

function HudPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hud-panel hud-panel-br">
      <div className="hud-header"><span className="hud-header-dot" />{title}</div>
      <div className="p-3 space-y-2">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2 py-0.5">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-foreground)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function StatBadge({ value, positive }: { value: string; positive?: boolean }) {
  const color = positive === undefined ? "var(--arc-blue)" : positive ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)";
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: 600 }}>{value}</span>;
}

function TradingSummaryPanel({ s }: { s: TradingSummary }) {
  if (s.totalTrades === 0 && s.noTradeReason) {
    return (
      <HudPanel title="Trading Summary">
        <div className="flex items-center gap-2 py-2">
          <AlertCircle size={14} style={{ color: "oklch(0.75 0.18 60)", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.75 0.18 60)" }}>{s.noTradeReason}</span>
        </div>
      </HudPanel>
    );
  }
  return (
    <HudPanel title="Trading Summary">
      <DataRow label="Total Trades" value={<StatBadge value={String(s.totalTrades)} />} />
      <DataRow label="Wins / Losses" value={<span><span className="text-emerald-400">{s.winningTrades}W</span> / <span className="text-red-400">{s.losingTrades}L</span></span>} />
      <DataRow label="Win Rate" value={<StatBadge value={`${(s.winRate * 100).toFixed(1)}%`} positive={s.winRate >= 0.45} />} />
      <DataRow label="Net P&L" value={fmtPnl(s.netPnl)} />
      <DataRow label="Gross Profit" value={<span className="text-emerald-400">+${s.grossProfit.toFixed(2)}</span>} />
      <DataRow label="Gross Loss" value={<span className="text-red-400">-${s.grossLoss.toFixed(2)}</span>} />
      <DataRow label="Profit Factor" value={<StatBadge value={s.profitFactor.toFixed(3)} positive={s.profitFactor >= 1.3} />} />
      <DataRow label="Expectancy" value={<StatBadge value={`$${s.expectancy.toFixed(2)}`} positive={s.expectancy >= 0} />} />
      <DataRow label="Largest Winner" value={<span className="text-emerald-400">+${s.largestWinner.toFixed(2)}</span>} />
      <DataRow label="Largest Loser" value={<span className="text-red-400">-${Math.abs(s.largestLoser).toFixed(2)}</span>} />
    </HudPanel>
  );
}

function ModelActivityPanel({ m }: { m: ModelActivity }) {
  const models = Object.entries(m);
  if (models.length === 0) {
    return <HudPanel title="Model Activity"><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>No model activity</span></HudPanel>;
  }
  return (
    <HudPanel title="Model Activity">
      {models.map(([name, data]) => (
        <div key={name} className="space-y-1 pb-2 border-b last:border-0" style={{ borderColor: "oklch(0.18 0.06 220 / 0.4)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--arc-cyan)", letterSpacing: "0.1em", fontWeight: 600 }}>{name}</div>
          <DataRow label="Signals" value={String(data.signalsGenerated)} />
          <DataRow label="Approved / Rejected" value={<span><span className="text-emerald-400">{data.tradesApproved}</span> / <span className="text-red-400">{data.tradesRejected}</span></span>} />
          {data.avgEdgeScore != null && <DataRow label="Avg Edge Score" value={fmt(data.avgEdgeScore)} />}
          {data.avgRas != null && <DataRow label="Avg RAS" value={<span style={{ color: "var(--arc-cyan)" }}>{fmt(data.avgRas, 1)}</span>} />}
          {data.avgHoldingTimeMs != null && <DataRow label="Avg Hold Time" value={fmtMs(data.avgHoldingTimeMs)} />}
        </div>
      ))}
    </HudPanel>
  );
}

function RegimeSummaryPanel({ r }: { r: RegimeSummary }) {
  const { rasDistribution: d } = r;
  const total = d.activated + d.marginal + d.suppressed;
  return (
    <HudPanel title="Regime Summary">
      <DataRow label="Market Regime" value={r.marketRegime ?? "—"} />
      <DataRow label="Session" value={r.sessionBehaviour ?? "—"} />
      <DataRow label="Trend Strength" value={r.trendStrength ?? "—"} />
      <DataRow label="Volatility" value={r.volatilityRegime ?? "—"} />
      <DataRow label="CHOP State" value={r.chopState ?? "—"} />
      <DataRow label="ATR Expansion" value={r.atrExpansion != null ? `${r.atrExpansion.toFixed(2)}×` : "—"} />
      <DataRow label="News Environment" value={r.newsEnvironment ?? "—"} />
      {total > 0 && (
        <div className="pt-1">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em", marginBottom: 4 }}>RAS DISTRIBUTION</div>
          <div className="flex gap-2">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.65 0.22 145)" }}>{d.activated} ACT</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.75 0.18 60)" }}>{d.marginal} MAR</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.55 0.22 25)" }}>{d.suppressed} SUP</span>
          </div>
        </div>
      )}
    </HudPanel>
  );
}

function DecisionReviewPanel({ d }: { d: DecisionReview }) {
  return (
    <HudPanel title="Decision Review">
      {d.tradesTaken.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.22 145)", letterSpacing: "0.08em", marginBottom: 2 }}>TRADES TAKEN</div>
          {d.tradesTaken.map((t, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", paddingLeft: 8 }}>· {t}</div>)}
        </div>
      )}
      {d.tradesRejected.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.22 25)", letterSpacing: "0.08em", marginBottom: 2 }}>TRADES REJECTED</div>
          {d.tradesRejected.map((t, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", paddingLeft: 8 }}>· {t}</div>)}
        </div>
      )}
      {d.largestMissedOpportunity && <DataRow label="Largest Missed" value={<span className="text-yellow-400 text-xs">{d.largestMissedOpportunity}</span>} />}
      {d.largestFalseActivation && <DataRow label="False Activation" value={<span className="text-red-400 text-xs">{d.largestFalseActivation}</span>} />}
      {d.largestFalseSuppression && <DataRow label="False Suppression" value={<span className="text-orange-400 text-xs">{d.largestFalseSuppression}</span>} />}
      {d.suggestedResearchItems.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--arc-cyan)", letterSpacing: "0.08em", marginBottom: 2 }}>RESEARCH ITEMS</div>
          {d.suggestedResearchItems.map((item, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", paddingLeft: 8 }}>· {item}</div>)}
        </div>
      )}
    </HudPanel>
  );
}

function SystemHealthPanel({ h }: { h: SystemHealth }) {
  const statusColor = (s: string) => s === "OK" || s === "CONNECTED" ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)";
  return (
    <HudPanel title="System Health">
      <DataRow label="Database" value={<span style={{ color: statusColor(h.dbStatus) }}>{h.dbStatus}</span>} />
      <DataRow label="Dashboard" value={<span style={{ color: statusColor(h.dashboardStatus) }}>{h.dashboardStatus}</span>} />
      <DataRow label="Last Heartbeat" value={h.lastHeartbeat ? fmtTime(h.lastHeartbeat) : "—"} />
      <DataRow label="Errors" value={<span style={{ color: h.errorCount > 0 ? "oklch(0.55 0.22 25)" : "oklch(0.65 0.22 145)" }}>{h.errorCount}</span>} />
      {h.recentErrors.length > 0 && (
        <div className="pt-1 space-y-1">
          {h.recentErrors.slice(0, 3).map((e, i) => (
            <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.22 25)", paddingLeft: 8 }}>
              [{e.type}] {e.message.slice(0, 60)}
            </div>
          ))}
        </div>
      )}
    </HudPanel>
  );
}

function PerformanceTable({ p }: { p: PerformanceTracking }) {
  const windows = ["7D", "30D", "90D", "LIFETIME"];
  return (
    <div className="hud-panel hud-panel-br">
      <div className="hud-header"><span className="hud-header-dot" />Rolling Performance</div>
      <div className="overflow-auto p-3">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Window", "Trades", "Win Rate", "PF", "Expectancy", "Net P&L", "Max DD", "Avg RAS"].map((h) => (
                <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em", textAlign: "left", padding: "4px 8px", borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => {
              const d = p[w];
              const s = d?.sb1Stats ?? d?.allStats;
              return (
                <tr key={w} style={{ borderBottom: "1px solid oklch(0.18 0.06 220 / 0.2)" }}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--arc-cyan)", padding: "5px 8px", fontWeight: 600 }}>{w}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)", padding: "5px 8px" }}>{s?.count ?? "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: s?.wr != null && s.wr >= 0.45 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>{s?.wr != null ? `${(s.wr * 100).toFixed(1)}%` : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: s?.pf != null && s.pf >= 2.0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>{s?.pf != null ? s.pf.toFixed(3) : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: s?.expectancy != null && s.expectancy >= 0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>{s?.expectancy != null ? `$${s.expectancy.toFixed(2)}` : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: s?.netPnl != null && s.netPnl >= 0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>{s?.netPnl != null ? `$${s.netPnl.toFixed(0)}` : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: "var(--color-muted-foreground)" }}>{s?.maxDd != null ? `$${s.maxDd.toFixed(0)}` : "—"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 8px", color: "var(--arc-cyan)" }}>{d?.sb1AvgRas != null ? d.sb1AvgRas.toFixed(1) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Report View ─────────────────────────────────────────────────────────────

function ReportView({ report, date }: { report: DailyReviewReport; date: string }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 hud-panel hud-panel-br">
        <CalendarCheck size={16} style={{ color: "var(--arc-cyan)" }} />
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--arc-cyan)", letterSpacing: "0.1em" }}>
            ATLAS DAILY REVIEW — {date}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
            Generated {new Date(report.generatedAt).toLocaleString()} · Autonomous report
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {report.tradingSummary.totalTrades > 0 ? (
            <>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: report.tradingSummary.netPnl >= 0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)", fontWeight: 700 }}>
                {report.tradingSummary.netPnl >= 0 ? "+" : ""}${report.tradingSummary.netPnl.toFixed(2)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
                {report.tradingSummary.totalTrades} trade{report.tradingSummary.totalTrades !== 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>NO TRADES</span>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <TradingSummaryPanel s={report.tradingSummary} />
        <RegimeSummaryPanel r={report.regimeSummary} />
        <SystemHealthPanel h={report.systemHealth} />
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <ModelActivityPanel m={report.modelActivity} />
        <DecisionReviewPanel d={report.decisionReview} />
      </div>
      <PerformanceTable p={report.performanceTracking} />
    </div>
  );
}

// ─── Archive List ─────────────────────────────────────────────────────────────

function ArchiveList({ onSelect, selectedDate }: { onSelect: (date: string) => void; selectedDate: string | null }) {
  const [search, setSearch] = useState("");
  const { data: reviews } = trpc.dailyReview.list.useQuery({ limit: 60 });

  const filtered = (reviews ?? []).filter((r) =>
    !search || r.reviewDate.includes(search)
  );

  return (
    <div className="hud-panel hud-panel-br h-full">
      <div className="hud-header"><span className="hud-header-dot" />Archive</div>
      <div className="p-3">
        <div className="relative mb-3">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted-foreground)" }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search date (YYYY-MM-DD)…"
            className="pl-7 h-7 text-xs"
            style={{ fontFamily: "var(--font-mono)", background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)" }}
          />
        </div>
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", padding: "8px 0" }}>No reviews found</div>
          ) : filtered.map((r) => {
            const pnl = r.netPnl != null ? parseFloat(r.netPnl) : null;
            const trades = r.totalTrades ?? 0;
            const isSelected = selectedDate === r.reviewDate;
            return (
              <button
                key={r.reviewDate}
                onClick={() => onSelect(r.reviewDate)}
                className="w-full flex items-center justify-between p-2 rounded transition-all"
                style={{
                  background: isSelected ? "oklch(0.14 0.06 220)" : "transparent",
                  border: isSelected ? "1px solid var(--arc-blue)" : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck size={11} style={{ color: isSelected ? "var(--arc-blue)" : "var(--color-muted-foreground)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isSelected ? "var(--arc-blue)" : "var(--color-foreground)" }}>{r.reviewDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  {trades > 0 && pnl != null && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: pnl >= 0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>
                      {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                    </span>
                  )}
                  {trades === 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>NO TRADES</span>}
                  <ChevronRight size={11} style={{ color: "var(--color-muted-foreground)" }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DailyReviewPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("latest");

  const { data: latest, isLoading: latestLoading } = trpc.dailyReview.latest.useQuery(undefined, { refetchInterval: 60000 });
  const { data: selectedReview } = trpc.dailyReview.byDate.useQuery(
    { date: selectedDate! },
    { enabled: !!selectedDate }
  );

  const displayReport = selectedDate && selectedReview
    ? (selectedReview.reportJson as DailyReviewReport | null)
    : (latest?.reportJson as DailyReviewReport | null);

  const displayDate = selectedDate ?? latest?.reviewDate ?? null;

  return (
    <div className="p-4 space-y-4" style={{ background: "var(--hud-bg)", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarCheck size={18} style={{ color: "var(--arc-cyan)" }} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-cyan)" }}>DAILY REVIEW</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>
            AUTONOMOUS DAILY REPORT · GENERATED 4:30 PM ET · PERMANENT ARCHIVE
          </div>
        </div>
        {latest && (
          <div className="ml-auto flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>Latest:</span>
            <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{latest.reviewDate}</Badge>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList style={{ background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
          <TabsTrigger value="latest" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>Latest Report</TabsTrigger>
          <TabsTrigger value="archive" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>Archive</TabsTrigger>
        </TabsList>

        <TabsContent value="latest" className="mt-4">
          {latestLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : !displayReport ? (
            <div className="hud-panel hud-panel-br p-8 text-center">
              <CalendarCheck size={32} style={{ color: "var(--color-muted-foreground)", margin: "0 auto 12px" }} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-muted-foreground)" }}>
                No daily review generated yet
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.4 0.06 220)", marginTop: 8 }}>
                The first report will be generated automatically at 4:30 PM ET on the next trading day.
              </div>
            </div>
          ) : (
            <ReportView report={displayReport} date={displayDate!} />
          )}
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: "280px 1fr" }}>
            <ArchiveList
              onSelect={(date) => {
                setSelectedDate(date);
                setActiveTab("latest");
              }}
              selectedDate={selectedDate}
            />
            <div>
              {!displayReport ? (
                <div className="hud-panel hud-panel-br p-8 text-center">
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>
                    Select a date from the archive to view its report
                  </div>
                </div>
              ) : (
                <ReportView report={displayReport} date={displayDate!} />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
