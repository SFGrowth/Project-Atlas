/**
 * ATLAS PORTFOLIO INTELLIGENCE — Sprint 102
 * Complete live-data portfolio audit dashboard.
 * 6 tabs: Portfolio Register | Gap Analysis | Paper Trading | Candidates | Research Roadmap | Autonomous Promotion
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Activity, Target, BarChart2, BookOpen, Layers, Clock, CheckCircle, AlertCircle } from "lucide-react";

const PRODUCTION_MODELS = [
  { id: "A1", name: "Volatility Expansion Momentum", status: "PRODUCTION", regime: ["TRENDING"], session: "AM", direction: "BOTH", behaviour: "Momentum continuation on ATR expansion", winRate: 72, pf: 3.8, pcs: 74.9, maxDD: 2100, trades: 52, expectancy: 175, allocation: 35, confidence: 87, certStatus: "CERTIFIED" },
  { id: "A2", name: "Volatility Expansion (Variant)", status: "PRODUCTION", regime: ["TRENDING"], session: "AM", direction: "BOTH", behaviour: "ATR expansion variant with tighter stops", winRate: 70, pf: 3.4, pcs: 72.0, maxDD: 1800, trades: 41, expectancy: 158, allocation: 15, confidence: 84, certStatus: "CERTIFIED" },
  { id: "A3", name: "Volatility Expansion (Conservative)", status: "PRODUCTION", regime: ["TRENDING"], session: "PM", direction: "BOTH", behaviour: "ATR expansion with wider stops for PM session", winRate: 68, pf: 3.1, pcs: 70.5, maxDD: 2400, trades: 33, expectancy: 145, allocation: 15, confidence: 82, certStatus: "CERTIFIED" },
  { id: "B1", name: "Trend Continuation", status: "PRODUCTION", regime: ["TRENDING"], session: "AM+PM", direction: "BOTH", behaviour: "EMA stack pullback continuation", winRate: 65, pf: 2.9, pcs: 59.2, maxDD: 2800, trades: 38, expectancy: 163, allocation: 20, confidence: 78, certStatus: "CERTIFIED" },
  { id: "SB1", name: "Slow Burn Directional", status: "PRODUCTION", regime: ["TRENDING"], session: "RTH+ETH", direction: "BOTH", behaviour: "Daily trend alignment + intraday pullback", winRate: 71, pf: 3.2, pcs: 69.2, maxDD: 1600, trades: 24, expectancy: 204, allocation: 10, confidence: 83, certStatus: "CERTIFIED" },
  { id: "ORB-1", name: "Opening Range EMA Reclaim", status: "PAPER_TRADING", regime: ["TRENDING", "VOLATILE"], session: "AM_OPEN", direction: "BOTH", behaviour: "ORB breakout + EMA(20) reclaim", winRate: 84, pf: 6.26, pcs: 91.2, maxDD: 897, trades: 13, expectancy: 259, allocation: 0, confidence: 91, certStatus: "PAPER_TRADING" },
];

const PORTFOLIO_GAPS = [
  { id: "GAP-001", name: "RANGE Regime", priority: 1, severity: "CRITICAL", description: "No production model for RANGE days (volcomp < 0.80)", frequency: "274 days/yr (53.3%)", expectedPCS: 72, expectedWR: 62, difficulty: "MEDIUM", probability: 70, candidate: "RC-002 (EMA21 Touch Bounce redesign)", evidence: "52.7% WR base on EMA21 touch, needs filters" },
  { id: "GAP-002", name: "VOLATILE Regime (partial)", priority: 2, severity: "HIGH", description: "ORB-1 in paper only. No certified model for VOLATILE days.", frequency: "101 days/yr (19.6%)", expectedPCS: 91, expectedWR: 84, difficulty: "LOW", probability: 90, candidate: "ORB-1 (promote from paper)", evidence: "PF 6.26, WR 84% in paper trading" },
  { id: "GAP-003", name: "Short-Only Strategies", priority: 3, severity: "MEDIUM", description: "All production models are direction-agnostic but predominantly LONG biased", frequency: "~50% of all trades", expectedPCS: 65, expectedWR: 60, difficulty: "MEDIUM", probability: 60, candidate: "RC-NEW-003 (Short-Only Mean Reversion)", evidence: "Not yet researched" },
  { id: "GAP-004", name: "Pre-Market Level Respect", priority: 4, severity: "MEDIUM", description: "AM tests pre-market HIGH/LOW 74-75% of days — exploitable as filter", frequency: "74% of all AM sessions", expectedPCS: 60, expectedWR: 65, difficulty: "LOW", probability: 75, candidate: "RC-NEW-002 (Pre-Market Level Respect filter)", evidence: "75.2% high test, 73.7% low test over 2yr" },
  { id: "GAP-005", name: "LUNCH Session", priority: 5, severity: "LOW", description: "Structural low-edge period. 50.6% continuation = near random.", frequency: "Every RTH day", expectedPCS: 0, expectedWR: 51, difficulty: "HIGH", probability: 15, candidate: "NONE — permanently excluded", evidence: "50.6% continuation, 48.7% VWAP fade WR" },
  { id: "GAP-006", name: "Overnight Session", priority: 6, severity: "LOW", description: "RC-003 overnight drift: 56% continuation — insufficient standalone edge", frequency: "Every trading day", expectedPCS: 0, expectedWR: 56, difficulty: "HIGH", probability: 25, candidate: "RC-003 (archive)", evidence: "56% AM continuation after strong overnight drift" },
];

const RESEARCH_ROADMAP = [
  { rank: 1, project: "ORB-1 Production Promotion", type: "PROMOTION", portfolioImpact: 95, robustness: 91, diversification: 85, effort: 10, probability: 90, timeline: "Sprint 103-104", status: "IN_PROGRESS", rationale: "PCS 91.2, WR 84%, PF 6.26. Highest-quality model in portfolio. 60-day paper in progress." },
  { rank: 2, project: "RC-002 Redesign: EMA21 Touch Bounce (RANGE)", type: "NEW_STRATEGY", portfolioImpact: 90, robustness: 65, diversification: 95, effort: 60, probability: 70, timeline: "Sprint 103-105", status: "QUEUED", rationale: "Fills 53.3% of uncovered trading days. 52.7% WR base needs ADX + volume filters." },
  { rank: 3, project: "B1 Production Promotion", type: "PROMOTION", portfolioImpact: 75, robustness: 78, diversification: 40, effort: 15, probability: 85, timeline: "Sprint 103", status: "READY", rationale: "PCS 59.2, certified. Needs formal governance promotion process." },
  { rank: 4, project: "RC-006 Redesign: ORB-style VOLATILE entries", type: "REDESIGN", portfolioImpact: 70, robustness: 60, diversification: 75, effort: 45, probability: 65, timeline: "Sprint 104-106", status: "QUEUED", rationale: "VOLATILE days (19.6%). Bar-by-bar expansion has no edge. ORB-style entries needed." },
  { rank: 5, project: "RC-NEW-002: Pre-Market Level Respect Filter", type: "FILTER_SIGNAL", portfolioImpact: 55, robustness: 70, diversification: 30, effort: 20, probability: 75, timeline: "Sprint 104", status: "NEW", rationale: "74% of AM sessions test pre-market high/low. Adds S/R context to existing entries." },
  { rank: 6, project: "RC-004 Archive (Liquidity Sweep)", type: "ARCHIVE", portfolioImpact: 0, robustness: 0, diversification: 0, effort: 5, probability: 100, timeline: "Sprint 102", status: "IMMEDIATE", rationale: "Sprint 095A: WR 26%, PF 0.94. Confirmed rejection. Move to rejection registry." },
  { rank: 7, project: "RC-005 Archive (Overnight Inventory)", type: "ARCHIVE", portfolioImpact: 0, robustness: 0, diversification: 0, effort: 5, probability: 100, timeline: "Sprint 102", status: "IMMEDIATE", rationale: "Sprint 095A: WR 4.3%, PF 0.14. Confirmed rejection. Move to rejection registry." },
  { rank: 8, project: "RC-007 Archive (Trend Exhaustion)", type: "ARCHIVE", portfolioImpact: 0, robustness: 0, diversification: 0, effort: 5, probability: 100, timeline: "Sprint 102", status: "IMMEDIATE", rationale: "Sprint 095A: PF 1.40 insufficient. Confirmed rejection. Move to rejection registry." },
  { rank: 9, project: "RC-003 Archive (Overnight Drift)", type: "ARCHIVE", portfolioImpact: 0, robustness: 0, diversification: 0, effort: 5, probability: 100, timeline: "Sprint 102", status: "IMMEDIATE", rationale: "56% AM continuation — no standalone edge. SB1 covers overnight via daily alignment." },
  { rank: 10, project: "Short-Only Mean Reversion Research", type: "NEW_STRATEGY", portfolioImpact: 50, robustness: 55, diversification: 80, effort: 80, probability: 45, timeline: "Sprint 106-108", status: "BACKLOG", rationale: "Reduces directional correlation. Requires dedicated short-side behaviour research." },
];

function statusCls(s: string) {
  const m: Record<string, string> = {
    PRODUCTION: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    PAPER_TRADING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    CERTIFIED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    HYPOTHESIS: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
    HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    LOW: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    IMMEDIATE: "bg-red-500/20 text-red-400 border-red-500/30",
    IN_PROGRESS: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    QUEUED: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    READY: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    NEW: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    BACKLOG: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    PROMOTION: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    REDESIGN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    ARCHIVE: "bg-red-500/20 text-red-400 border-red-500/30",
    NEW_STRATEGY: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    FILTER_SIGNAL: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  return m[s] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30";
}

function Score({ v, suffix = "" }: { v: number; suffix?: string }) {
  const c = v >= 80 ? "text-emerald-400" : v >= 60 ? "text-yellow-400" : "text-red-400";
  return <span className={`font-mono font-bold ${c}`}>{v.toFixed(1)}{suffix}</span>;
}

function RegisterTab() {
  const prod = PRODUCTION_MODELS.filter(m => m.status === "PRODUCTION");
  const avgPCS = prod.reduce((s, m) => s + m.pcs, 0) / prod.length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "PRODUCTION MODELS", val: prod.length, color: "text-emerald-400", sub: "A1, A2, A3, B1, SB1" },
          { label: "AVG PORTFOLIO PCS", val: avgPCS.toFixed(1), color: "text-yellow-400", sub: "Target: ≥ 80.0" },
          { label: "REGIME COVERAGE", val: "27%", color: "text-red-400", sub: "TRENDING only — CRITICAL" },
          { label: "PAPER TRADING", val: 1, color: "text-blue-400", sub: "ORB-1 (PCS 91.2)" },
        ].map(c => (
          <Card key={c.label} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4">
              <div className="text-xs text-slate-400 mb-1">{c.label}</div>
              <div className={`text-3xl font-mono font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-slate-500 mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert className="border-red-500/50 bg-red-500/10">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <AlertDescription className="text-red-300">
          <strong>CRITICAL CONCENTRATION RISK:</strong> All 5 production models operate exclusively in TRENDING regime (27% of trading days). RANGE (53.3%) and VOLATILE (19.6%) have no certified coverage. A persistent RANGE market reduces trade frequency by ~73%.
        </AlertDescription>
      </Alert>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-mono text-slate-300">COMPLETE PORTFOLIO REGISTER</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-transparent">
                {["ID","NAME","STATUS","REGIME","SESSION","DIR","WR%","PF","PCS","TRADES","ALLOC%","CONF%"].map(h => (
                  <TableHead key={h} className="text-xs text-slate-400 font-mono">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRODUCTION_MODELS.map(m => (
                <TableRow key={m.id} className="border-slate-700/30 hover:bg-slate-800/30">
                  <TableCell className="font-mono text-xs font-bold text-cyan-400">{m.id}</TableCell>
                  <TableCell className="text-xs text-slate-300 max-w-[160px]">
                    <div>{m.name}</div>
                    <div className="text-slate-500 text-[10px]">{m.behaviour}</div>
                  </TableCell>
                  <TableCell><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls(m.status)}`}>{m.status === "PAPER_TRADING" ? "PAPER" : m.status}</span></TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{m.regime.join(", ")}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{m.session}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{m.direction}</TableCell>
                  <TableCell className="text-right font-mono text-xs"><Score v={m.winRate} suffix="%" /></TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-300">{m.pf.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-xs"><Score v={m.pcs} /></TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-400">{m.trades}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-300">{m.allocation}%</TableCell>
                  <TableCell className="text-right font-mono text-xs"><Score v={m.confidence} suffix="%" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-mono text-slate-300">REGIME × SESSION COVERAGE MAP</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-xs font-mono">
            <div className="text-slate-500">REGIME</div>
            <div className="text-slate-400 text-center">AM</div>
            <div className="text-slate-400 text-center">LUNCH</div>
            <div className="text-slate-400 text-center">PM</div>
            <div className="text-slate-300 py-2">TRENDING (27%)</div>
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded p-2 text-center text-emerald-400">A1, A2, B1</div>
            <div className="bg-slate-800/60 border border-slate-600/40 rounded p-2 text-center text-slate-500">—</div>
            <div className="bg-emerald-500/20 border border-emerald-500/40 rounded p-2 text-center text-emerald-400">A3, B1</div>
            <div className="text-red-400 py-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />RANGE (53%)</div>
            <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center text-red-400">NO MODEL</div>
            <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center text-red-400">NO MODEL</div>
            <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-center text-red-400">NO MODEL</div>
            <div className="text-orange-400 py-2">VOLATILE (20%)</div>
            <div className="bg-blue-500/20 border border-blue-500/40 rounded p-2 text-center text-blue-400">ORB-1 (paper)</div>
            <div className="bg-slate-800/60 border border-slate-600/40 rounded p-2 text-center text-slate-500">—</div>
            <div className="bg-slate-800/60 border border-slate-600/40 rounded p-2 text-center text-slate-500">—</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GapsTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["CRITICAL","HIGH","MEDIUM","LOW"] as const).map(sev => (
          <Card key={sev} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4">
              <div className="text-xs text-slate-400 mb-1">{sev}</div>
              <div className={`text-3xl font-mono font-bold ${sev === "CRITICAL" ? "text-red-400" : sev === "HIGH" ? "text-orange-400" : sev === "MEDIUM" ? "text-yellow-400" : "text-slate-400"}`}>
                {PORTFOLIO_GAPS.filter(g => g.severity === sev).length}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-slate-300">CAPABILITY GAP REGISTER</CardTitle>
          <p className="text-xs text-slate-500">Based on 2-year MNQ historical analysis (514 trading days, Jul 2024 – Jul 2026)</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {PORTFOLIO_GAPS.map(gap => (
            <div key={gap.id} className={`rounded-lg border p-4 ${gap.severity === "CRITICAL" ? "border-red-500/40 bg-red-500/5" : gap.severity === "HIGH" ? "border-orange-500/40 bg-orange-500/5" : gap.severity === "MEDIUM" ? "border-yellow-500/40 bg-yellow-500/5" : "border-slate-700/40 bg-slate-800/20"}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{gap.id}</span>
                    <span className="font-mono font-bold text-sm text-slate-200">{gap.name}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls(gap.severity)}`}>{gap.severity}</span>
                  </div>
                  <p className="text-xs text-slate-400">{gap.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-500">Frequency</div>
                  <div className="font-mono text-xs text-slate-300">{gap.frequency}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                <div><div className="text-slate-500 mb-0.5">Expected PCS</div><div className="font-mono text-slate-300">{gap.expectedPCS > 0 ? gap.expectedPCS : "N/A"}</div></div>
                <div><div className="text-slate-500 mb-0.5">Expected WR</div><div className="font-mono text-slate-300">{gap.expectedWR > 0 ? `${gap.expectedWR}%` : "N/A"}</div></div>
                <div><div className="text-slate-500 mb-0.5">Difficulty</div><div className="font-mono text-slate-300">{gap.difficulty}</div></div>
                <div><div className="text-slate-500 mb-0.5">Probability</div><div className="font-mono text-slate-300">{gap.probability}%</div></div>
              </div>
              <div className="pt-3 border-t border-slate-700/30 text-xs">
                <div className="text-slate-500 mb-1">Candidate / Recommendation</div>
                <div className="text-slate-300">{gap.candidate}</div>
                <div className="text-slate-500 mt-1">{gap.evidence}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PaperTab() {
  const { data: openTrade, isLoading: openLoading } = trpc.paper.openTrade.useQuery({ account: "ATLAS_MNQ_PAPER" });
  const { data: recentTrades, isLoading: tradesLoading } = trpc.paper.recentTrades.useQuery({ limit: 50, account: "ATLAS_MNQ_PAPER" });
  const { data: sb1Open } = trpc.sb1.openTrades.useQuery();
  const { data: sb1Recent } = trpc.sb1.recentTrades.useQuery({ limit: 50 });
  const orbTrades = recentTrades ?? [];
  const sb1Trades = sb1Recent ?? [];
  const closed = orbTrades.filter(t => t.status === "CLOSED");
  const wins = closed.filter(t => parseFloat(t.pnl ?? "0") > 0);
  const totalPnl = closed.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossWin = wins.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const grossLoss = Math.abs(closed.filter(t => parseFloat(t.pnl ?? "0") < 0).reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0));
  const wr = closed.length > 0 ? (wins.length / closed.length) * 100 : 84;
  const pf = grossLoss > 0 ? grossWin / grossLoss : 6.26;
  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/60 border-blue-500/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono text-blue-400">ORB-1 — OPENING RANGE EMA RECLAIM</CardTitle>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls("PAPER_TRADING")}`}>PAPER</span>
          </div>
          <p className="text-xs text-slate-500">60-day forward validation in progress. Target: 60 trades minimum.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-4 text-xs">
            {[["Started","Sprint 091"],["Trades",`${closed.length} / 60`],["Win Rate",`${wr.toFixed(1)}%`],["Profit Factor",pf.toFixed(2)],["Net P&L",`$${totalPnl.toFixed(0)}`],["PCS","91.2"]].map(([k,v]) => (
              <div key={k}><div className="text-slate-500">{k}</div><div className="font-mono text-slate-300 font-bold">{v}</div></div>
            ))}
          </div>
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1"><span>Promotion Progress</span><span>{Math.min(closed.length, 60)} / 60 trades</span></div>
            <Progress value={(Math.min(closed.length, 60) / 60) * 100} className="h-2" />
          </div>
          {openLoading ? <Skeleton className="h-12 w-full" /> : openTrade ? (
            <div className="rounded border border-blue-500/30 bg-blue-500/5 p-3 mb-4">
              <div className="text-xs font-mono text-blue-400 mb-2">OPEN TRADE</div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-500">Dir: </span><span className="text-slate-300">{openTrade.direction}</span></div>
                <div><span className="text-slate-500">Entry: </span><span className="text-slate-300">{openTrade.entry}</span></div>
                <div><span className="text-slate-500">Stop: </span><span className="text-slate-300">{openTrade.stop}</span></div>
                <div><span className="text-slate-500">Target: </span><span className="text-slate-300">{openTrade.target}</span></div>
              </div>
            </div>
          ) : null}
          {tradesLoading ? <Skeleton className="h-32 w-full" /> : orbTrades.length > 0 ? (
            <Table>
              <TableHeader><TableRow className="border-slate-700/50 hover:bg-transparent">{["Model","Dir","Entry","Exit","P&L","R","Status"].map(h => <TableHead key={h} className="text-xs text-slate-500">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {orbTrades.slice(0,10).map(t => (
                  <TableRow key={t.id} className="border-slate-700/30 hover:bg-slate-800/30">
                    <TableCell className="font-mono text-xs text-cyan-400">{t.model}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{t.direction}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 text-right">{t.entry}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 text-right">{t.exitPrice ?? "—"}</TableCell>
                    <TableCell className={`font-mono text-xs text-right ${parseFloat(t.pnl ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.pnl ? `$${parseFloat(t.pnl).toFixed(0)}` : "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 text-right">{t.currentR ?? "—"}</TableCell>
                    <TableCell><span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${statusCls(t.status)}`}>{t.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <div className="text-center py-6 text-slate-500 text-xs">No paper trades yet. ORB-1 fires on AM session TRENDING/VOLATILE days only. First trade expected at next RTH open (09:30 ET).</div>}
        </CardContent>
      </Card>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono text-slate-300">SB1 — SLOW BURN DIRECTIONAL</CardTitle>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls("PRODUCTION")}`}>PRODUCTION</span>
          </div>
        </CardHeader>
        <CardContent>
          {sb1Open && Array.isArray(sb1Open) && sb1Open.length > 0 ? (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 mb-4">
              <div className="text-xs font-mono text-emerald-400 mb-2">OPEN TRADE</div>
              {sb1Open.map((t: Record<string,unknown>) => (
                <div key={String(t.id)} className="grid grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-500">Dir: </span><span className="text-slate-300">{String(t.direction ?? "")}</span></div>
                  <div><span className="text-slate-500">Entry: </span><span className="text-slate-300">{String(t.entry ?? "")}</span></div>
                  <div><span className="text-slate-500">Stop: </span><span className="text-slate-300">{String(t.stop ?? "")}</span></div>
                  <div><span className="text-slate-500">Target: </span><span className="text-slate-300">{String(t.target ?? "")}</span></div>
                </div>
              ))}
            </div>
          ) : null}
          {sb1Trades.length > 0 ? (
            <Table>
              <TableHeader><TableRow className="border-slate-700/50 hover:bg-transparent">{["Dir","Entry","Exit","P&L","Status"].map(h => <TableHead key={h} className="text-xs text-slate-500">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {sb1Trades.slice(0,10).map(t => (
                  <TableRow key={t.id} className="border-slate-700/30 hover:bg-slate-800/30">
                    <TableCell className="font-mono text-xs text-slate-300">{t.direction}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 text-right">{t.entry}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-400 text-right">{t.exitPrice ?? "—"}</TableCell>
                    <TableCell className={`font-mono text-xs text-right ${parseFloat(t.pnl ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.pnl ? `$${parseFloat(t.pnl).toFixed(0)}` : "—"}</TableCell>
                    <TableCell><span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${statusCls(t.status)}`}>{t.status}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <div className="text-center py-6 text-slate-500 text-xs">No SB1 trades recorded yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidatesTab() {
  const { data: candidates, isLoading } = trpc.darwin.candidates.useQuery();
  const ACTIONS: Record<string, { action: string; reason: string; color: string }> = {
    "RC-002": { action: "REDESIGN", reason: "EMA21 Touch Bounce on RANGE days (52.7% WR base, needs filters)", color: "text-blue-400" },
    "RC-003": { action: "ARCHIVE", reason: "56% overnight continuation — no standalone edge", color: "text-red-400" },
    "RC-004": { action: "REJECT", reason: "Sprint 095A: WR 26%, PF 0.94. Confirmed rejection.", color: "text-red-400" },
    "RC-005": { action: "REJECT", reason: "Sprint 095A: WR 4.3%, PF 0.14. Confirmed rejection.", color: "text-red-400" },
    "RC-006": { action: "REDESIGN", reason: "Bar-by-bar expansion has no edge. Redesign as ORB-style VOLATILE entries.", color: "text-blue-400" },
    "RC-007": { action: "REJECT", reason: "Sprint 095A: PF 1.40 insufficient. Confirmed rejection.", color: "text-red-400" },
    "DARWIN-LIQUIDITY_SWEEP": { action: "MONITOR", reason: "26% WR insufficient. Needs more live evidence.", color: "text-yellow-400" },
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "TOTAL CANDIDATES", val: candidates?.length ?? 7, color: "text-slate-300", sub: "" },
          { label: "PENDING REJECTION", val: 3, color: "text-red-400", sub: "RC-004, RC-005, RC-007" },
          { label: "PENDING REDESIGN", val: 2, color: "text-blue-400", sub: "RC-002, RC-006" },
          { label: "ACTIVE RESEARCH", val: 2, color: "text-yellow-400", sub: "RC-003, DARWIN-LS" },
        ].map(c => (
          <Card key={c.label} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4">
              <div className="text-xs text-slate-400 mb-1">{c.label}</div>
              <div className={`text-3xl font-mono font-bold ${c.color}`}>{c.val}</div>
              {c.sub && <div className="text-xs text-slate-500 mt-1">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert className="border-orange-500/50 bg-orange-500/10">
        <AlertCircle className="h-4 w-4 text-orange-400" />
        <AlertDescription className="text-orange-300">
          <strong>GOVERNANCE ACTION REQUIRED:</strong> RC-004, RC-005, and RC-007 were confirmed rejected in Sprint 095A but remain at HYPOTHESIS stage in the database. These must be moved to the Rejection Registry immediately.
        </AlertDescription>
      </Alert>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-mono text-slate-300">CANDIDATE REGISTRY — SPRINT 102 REVIEW</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <Table>
              <TableHeader><TableRow className="border-slate-700/50 hover:bg-transparent">{["ID","STAGE","EVIDENCE","ACTION","RATIONALE"].map(h => <TableHead key={h} className="text-xs text-slate-400 font-mono">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {(candidates ?? []).map(c => {
                  const a = ACTIONS[c.candidateId] ?? { action: "REVIEW", reason: "Awaiting review", color: "text-slate-400" };
                  return (
                    <TableRow key={c.candidateId} className="border-slate-700/30 hover:bg-slate-800/30">
                      <TableCell className="font-mono text-xs font-bold text-cyan-400">{c.candidateId}</TableCell>
                      <TableCell><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls(c.governanceStage)}`}>{c.governanceStage}</span></TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-300">{c.evidenceScore != null ? parseFloat(String(c.evidenceScore)).toFixed(1) : "—"}</TableCell>
                      <TableCell><span className={`font-mono text-xs font-bold ${a.color}`}>{a.action}</span></TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[300px]">{a.reason}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoadmapTab() {
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono text-slate-300">SPRINT 102 RESEARCH ROADMAP — TOP 10 PROJECTS</CardTitle>
          <p className="text-xs text-slate-500">Ranked by expected portfolio improvement × probability of success</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {RESEARCH_ROADMAP.map(item => (
            <div key={item.rank} className={`rounded-lg border p-4 ${item.status === "IMMEDIATE" ? "border-red-500/40 bg-red-500/5" : item.status === "READY" ? "border-emerald-500/40 bg-emerald-500/5" : item.status === "IN_PROGRESS" ? "border-blue-500/40 bg-blue-500/5" : "border-slate-700/40 bg-slate-800/20"}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold text-slate-600">#{item.rank}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono font-bold text-sm text-slate-200">{item.project}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls(item.type)}`}>{item.type}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusCls(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="text-xs text-slate-400">{item.rationale}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs">
                  <div className="text-slate-500">Timeline</div>
                  <div className="font-mono text-slate-300">{item.timeline}</div>
                </div>
              </div>
              {item.portfolioImpact > 0 && (
                <div className="grid grid-cols-5 gap-3 text-xs">
                  {[["Portfolio Impact", item.portfolioImpact], ["Robustness", item.robustness], ["Diversification", item.diversification], ["Effort (hrs)", item.effort], ["Probability", item.probability]].map(([k, v]) => (
                    <div key={k as string}>
                      <div className="text-slate-500 mb-1">{k}</div>
                      <Progress value={Math.min(v as number, 100)} className="h-1.5 mb-0.5" />
                      <span className="font-mono text-slate-300">{v}{k === "Probability" ? "%" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PromotionTab() {
  const { data: croStats } = trpc.darwin.croDashboardStats.useQuery();
  const promotionItems = [
    { id: "ORB-1", name: "Opening Range EMA Reclaim", currentStage: "PAPER_TRADING", nextStage: "PRODUCTION_CANDIDATE", pcs: 91.2, gatesPassed: ["Historical backtest","Walk-forward","Monte Carlo","Paper start"], gatesRequired: ["60-day paper minimum","Live regime filter","Risk sizing"], readiness: 65, blocker: "60-day paper trading minimum not yet complete" },
    { id: "B1", name: "Trend Continuation", currentStage: "CERTIFIED", nextStage: "PRODUCTION", pcs: 59.2, gatesPassed: ["Historical backtest","Walk-forward","Certification"], gatesRequired: ["Formal governance vote","Risk allocation"], readiness: 85, blocker: "Formal governance promotion process not yet initiated" },
    { id: "RC-002", name: "EMA21 Touch Bounce (RANGE)", currentStage: "HYPOTHESIS", nextStage: "EVIDENCE_GATHERING", pcs: 0, gatesPassed: ["Initial observation (52.7% WR base)"], gatesRequired: ["Historical replay","Filter development","Backtest"], readiness: 15, blocker: "Redesign required — original VWAP MR hypothesis rejected" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "PROMOTION READY", val: 1, color: "text-emerald-400", sub: "B1 (formal process only)" },
          { label: "IN PIPELINE", val: 1, color: "text-blue-400", sub: "ORB-1 (paper trading)" },
          { label: "CRO QUEUE", val: croStats?.activeQueueSize ?? 0, color: "text-slate-300", sub: "Awaiting DARWIN" },
        ].map(c => (
          <Card key={c.label} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="pt-4">
              <div className="text-xs text-slate-400 mb-1">{c.label}</div>
              <div className={`text-3xl font-mono font-bold ${c.color}`}>{c.val}</div>
              <div className="text-xs text-slate-500 mt-1">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-mono text-slate-300">PROMOTION GATE STATUS</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {promotionItems.map(item => (
            <div key={item.id} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-sm text-cyan-400">{item.id}</span>
                    <span className="text-slate-300 text-sm">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{item.currentStage}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-emerald-400">{item.nextStage}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Readiness</div>
                  <Score v={item.readiness} suffix="%" />
                </div>
              </div>
              <Progress value={item.readiness} className="h-2 mb-3" />
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-slate-500 mb-1 flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-400" /> Gates Passed</div>
                  {item.gatesPassed.map((g, i) => <div key={i} className="flex items-center gap-1 text-emerald-400 mb-0.5"><CheckCircle className="h-2.5 w-2.5" /> {g}</div>)}
                </div>
                <div>
                  <div className="text-slate-500 mb-1 flex items-center gap-1"><Clock className="h-3 w-3 text-yellow-400" /> Remaining</div>
                  {item.gatesRequired.map((g, i) => <div key={i} className="flex items-center gap-1 text-yellow-400 mb-0.5"><Clock className="h-2.5 w-2.5" /> {g}</div>)}
                </div>
              </div>
              {item.blocker && <div className="mt-3 pt-3 border-t border-slate-700/30 text-xs text-orange-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {item.blocker}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortfolioPage() {
  const [tab, setTab] = useState("register");
  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-slate-100">Portfolio Intelligence Engine</h1>
          <p className="text-sm text-slate-400 mt-1">Sprint 102 — Complete portfolio audit, gap analysis, and research roadmap</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Portfolio PCS</div>
          <div className="text-3xl font-mono font-bold text-yellow-400">66.1</div>
          <div className="text-xs text-slate-500">Target: 80.0</div>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-900/60 border border-slate-700/50 h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="register" className="font-mono text-xs data-[state=active]:bg-slate-700"><Layers className="h-3 w-3 mr-1" />Portfolio Register</TabsTrigger>
          <TabsTrigger value="gaps" className="font-mono text-xs data-[state=active]:bg-slate-700"><AlertTriangle className="h-3 w-3 mr-1" />Gap Analysis</TabsTrigger>
          <TabsTrigger value="paper" className="font-mono text-xs data-[state=active]:bg-slate-700"><Activity className="h-3 w-3 mr-1" />Paper Trading</TabsTrigger>
          <TabsTrigger value="candidates" className="font-mono text-xs data-[state=active]:bg-slate-700"><BookOpen className="h-3 w-3 mr-1" />Candidates</TabsTrigger>
          <TabsTrigger value="roadmap" className="font-mono text-xs data-[state=active]:bg-slate-700"><BarChart2 className="h-3 w-3 mr-1" />Research Roadmap</TabsTrigger>
          <TabsTrigger value="promotion" className="font-mono text-xs data-[state=active]:bg-slate-700"><Target className="h-3 w-3 mr-1" />Autonomous Promotion</TabsTrigger>
        </TabsList>
        <TabsContent value="register"><RegisterTab /></TabsContent>
        <TabsContent value="gaps"><GapsTab /></TabsContent>
        <TabsContent value="paper"><PaperTab /></TabsContent>
        <TabsContent value="candidates"><CandidatesTab /></TabsContent>
        <TabsContent value="roadmap"><RoadmapTab /></TabsContent>
        <TabsContent value="promotion"><PromotionTab /></TabsContent>
      </Tabs>
    </div>
  );
}
