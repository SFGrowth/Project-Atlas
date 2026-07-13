import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stageColor: Record<string, string> = {
  HYPOTHESIS: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  PATTERN_DETECTION: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  STATISTICAL_VALIDATION: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  HISTORICAL_VALIDATION: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  PAPER_TRADING: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  PRODUCTION: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
};

const classIcon: Record<string, string> = {
  MEAN_REVERSION: "↩",
  MOMENTUM: "→",
  VOLATILITY: "⚡",
  OVERNIGHT: "🌙",
  OPENING_RANGE: "🎯",
  MICROSTRUCTURE: "🔬",
  REGIME_TRANSITION: "⟳",
  SEASONAL: "📅",
};

function pct(v: string | null | undefined) {
  if (!v) return "—";
  return `${parseFloat(v).toFixed(1)}%`;
}
function num(v: string | null | undefined, dp = 2) {
  if (!v) return "—";
  return parseFloat(v).toFixed(dp);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <Card className="bg-[#0d1117] border-[#1e2a3a]">
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-2xl font-bold font-mono ${accent ?? "text-slate-100"}`}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

type DarwinCandidate = {
  candidateId: string;
  behaviourClass: string | null;
  behaviourDescription: string | null;
  governanceStage: string;
  occurrenceCount: number | null;
  confidence: string | null;
  statisticalSignificance: string | null;
  estimatedWinRate: string | null;
  estimatedPf: string | null;
  estimatedPcs: string | null;
  estimatedCorrelation: string | null;
  evidenceScore: string | null;
  humanExplanation: string | null;
  researchPriority: number | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

function CandidateCard({ c }: { c: DarwinCandidate }) {
  const conf = parseFloat(c.confidence ?? "0");
  const stage = c.governanceStage ?? "HYPOTHESIS";
  return (
    <Card className="bg-[#0d1117] border-[#1e2a3a] hover:border-[#2a3f5a] transition-colors">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{classIcon[c.behaviourClass ?? ""] ?? "◆"}</span>
              <span className="font-mono text-xs text-slate-400">{c.candidateId}</span>
            </div>
            <p className="text-sm text-slate-200 font-medium leading-snug">{c.behaviourDescription}</p>
          </div>
          <Badge className={`text-[10px] shrink-0 border ${stageColor[stage] ?? "bg-slate-700 text-slate-300"}`}>
            {stage.replace(/_/g, " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Confidence bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Confidence</span>
            <span className="text-slate-300 font-mono">{conf.toFixed(1)}%</span>
          </div>
          <Progress value={conf} className="h-1.5 bg-[#1e2a3a]" />
        </div>
        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Occurrences</p>
            <p className="text-sm font-mono text-slate-200 font-semibold">{c.occurrenceCount ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Est. WR</p>
            <p className="text-sm font-mono text-emerald-400 font-semibold">{pct(c.estimatedWinRate)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Est. PF</p>
            <p className="text-sm font-mono text-sky-400 font-semibold">{num(c.estimatedPf)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">PCS</p>
            <p className="text-sm font-mono text-violet-400 font-semibold">{num(c.estimatedPcs, 0)}</p>
          </div>
        </div>
        {/* Human explanation */}
        {c.humanExplanation && (
          <p className="text-xs text-slate-400 leading-relaxed border-t border-[#1e2a3a] pt-2">
            {c.humanExplanation}
          </p>
        )}
        {/* Priority badge */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-600">Priority #{c.researchPriority ?? "—"} · {c.behaviourClass}</span>
          <span className="text-[10px] text-slate-600">Sig: {num(c.statisticalSignificance, 4)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Darwin() {
  const [activeTab, setActiveTab] = useState("overview");

  const statsQ = trpc.darwin.stats.useQuery(undefined, { refetchInterval: 30_000 });
  const candidatesQ = trpc.darwin.candidates.useQuery(undefined, { refetchInterval: 60_000 });
  const backtestsQ = trpc.darwin.backtests.useQuery({}, { refetchInterval: 60_000 });
  const reportsQ = trpc.darwin.weeklyReports.useQuery(undefined, { refetchInterval: 60_000 });
  const selfEvalQ = trpc.darwin.selfEval.useQuery(undefined, { refetchInterval: 60_000 });
  const engineStatusQ = trpc.darwin.engineStatus.useQuery(undefined, { refetchInterval: 15_000 });
  const latestBriefingQ = trpc.darwin.latestBriefing.useQuery(undefined, { refetchInterval: 60_000 });
  const researchMemoryQ = trpc.darwin.researchMemory.useQuery({ limit: 10 }, { refetchInterval: 120_000 });

  const hourlyMut = trpc.darwin.triggerHourly.useMutation({
    onSuccess: () => { toast.success("Hourly analysis triggered"); engineStatusQ.refetch(); },
    onError: () => toast.error("Hourly analysis failed"),
  });
  const dailyMut = trpc.darwin.triggerDaily.useMutation({
    onSuccess: () => { toast.success("Daily review triggered"); engineStatusQ.refetch(); },
    onError: () => toast.error("Daily review failed"),
  });
  const weeklyMut = trpc.darwin.triggerWeekly.useMutation({
    onSuccess: () => { toast.success("Weekly briefing triggered"); latestBriefingQ.refetch(); },
    onError: () => toast.error("Weekly briefing failed"),
  });
  const ingestMut = trpc.darwin.ingestHistorical.useMutation({
    onSuccess: () => { toast.success("Historical ingestion started"); statsQ.refetch(); },
    onError: () => toast.error("Historical ingestion failed"),
  });

  const triggerMut = trpc.darwin.triggerAnalysis.useMutation({
    onSuccess: (data) => {
      toast.success(`DARWIN analysis complete — ${data.candidatesGenerated} new, ${data.candidatesUpdated} updated`);
      statsQ.refetch();
      candidatesQ.refetch();
    },
    onError: () => toast.error("DARWIN analysis failed"),
  });

  const reportMut = trpc.darwin.generateWeeklyReport.useMutation({
    onSuccess: (data) => {
      toast.success(`Weekly report generated: ${data.reportId}`);
      reportsQ.refetch();
    },
    onError: () => toast.error("Report generation failed"),
  });

  const stats = statsQ.data;
  const candidates = candidatesQ.data ?? [];
  const backtests = backtestsQ.data ?? [];
  const reports = reportsQ.data ?? [];
  const selfEvals = selfEvalQ.data ?? [];

  const topCandidates = [...candidates].sort((a, b) => (a.researchPriority ?? 99) - (b.researchPriority ?? 99)).slice(0, 6);
  const productionCandidates = candidates.filter(c => c.governanceStage === "PRODUCTION");
  const paperCandidates = candidates.filter(c => c.governanceStage === "PAPER_TRADING");
  const hypothesisCandidates = candidates.filter(c => c.governanceStage === "HYPOTHESIS" || c.governanceStage === "PATTERN_DETECTION");

  return (
    <div className="min-h-screen bg-[#070b11] text-slate-100">
      {/* Header */}
      <div className="border-b border-[#1e2a3a] bg-[#0a0f18]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-bold">D</div>
            <div>
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">Project DARWIN</h1>
              <p className="text-xs text-slate-500">Autonomous Quantitative Research Engine · v{stats?.darwinVersion ?? "1.0.0"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px]">
              {stats?.atlasMemoryObservations ?? 0} observations
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-[#1e2a3a] text-slate-300 hover:bg-[#1e2a3a]"
              onClick={() => reportMut.mutate()}
              disabled={reportMut.isPending}
            >
              {reportMut.isPending ? "Generating…" : "Weekly Report"}
            </Button>
            <Button
              size="sm"
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => triggerMut.mutate()}
              disabled={triggerMut.isPending}
            >
              {triggerMut.isPending ? "Analysing…" : "▶ Run Analysis"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats row */}
        {statsQ.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 bg-[#0d1117]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Candidates" value={stats?.totalCandidates ?? 0} accent="text-violet-300" />
            <StatCard label="Backtests Run" value={stats?.totalBacktests ?? 0} accent="text-sky-300" />
            <StatCard label="Weekly Reports" value={stats?.totalWeeklyReports ?? 0} accent="text-teal-300" />
            <StatCard label="Portfolio Health" value={`${stats?.portfolioHealthScore ?? 74}/100`} accent="text-emerald-300" />
            <StatCard label="Coverage Score" value={`${stats?.coverageScore ?? 28.6}%`} sub="of 14 behaviours" accent="text-orange-300" />
            <StatCard label="Self-Evals" value={stats?.totalSelfEvals ?? 0} accent="text-slate-300" />
          </div>
        )}

        {/* Stage pipeline bar */}
        {stats?.candidatesByStage && (
          <Card className="bg-[#0d1117] border-[#1e2a3a]">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 uppercase tracking-widest mr-2">Pipeline</span>
                {Object.entries(stats.candidatesByStage).map(([stage, count]) => (
                  <Badge key={stage} className={`text-[10px] border ${stageColor[stage] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
                    {stage.replace(/_/g, " ")} · {count as number}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#0d1117] border border-[#1e2a3a] flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-[#1e2a3a]">Overview</TabsTrigger>
            <TabsTrigger value="candidates" className="text-xs data-[state=active]:bg-[#1e2a3a]">
              Candidates {candidates.length > 0 && <span className="ml-1 text-violet-400">({candidates.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="backtests" className="text-xs data-[state=active]:bg-[#1e2a3a]">
              Backtests {backtests.length > 0 && <span className="ml-1 text-sky-400">({backtests.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-xs data-[state=active]:bg-[#1e2a3a]">Weekly Reports</TabsTrigger>
            <TabsTrigger value="self-eval" className="text-xs data-[state=active]:bg-[#1e2a3a]">Self-Evaluation</TabsTrigger>
            <TabsTrigger value="autonomous" className="text-xs data-[state=active]:bg-[#1e2a3a] text-violet-400">⚙ Autonomous</TabsTrigger>
            <TabsTrigger value="memory" className="text-xs data-[state=active]:bg-[#1e2a3a]">Research Memory</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top candidates */}
              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Top Research Candidates</h3>
                {candidatesQ.isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 bg-[#0d1117]" />)
                ) : topCandidates.length === 0 ? (
                  <Card className="bg-[#0d1117] border-[#1e2a3a]">
                    <CardContent className="py-10 text-center">
                      <p className="text-slate-500 text-sm">No candidates yet. Run DARWIN analysis to discover patterns.</p>
                      <Button
                        size="sm"
                        className="mt-3 text-xs bg-violet-600 hover:bg-violet-700"
                        onClick={() => triggerMut.mutate()}
                        disabled={triggerMut.isPending}
                      >
                        {triggerMut.isPending ? "Analysing…" : "▶ Run First Analysis"}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  topCandidates.map(c => <CandidateCard key={c.candidateId} c={c as DarwinCandidate} />)
                )}
              </div>

              {/* Right column — pipeline summary */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pipeline Summary</h3>
                <Card className="bg-[#0d1117] border-[#1e2a3a]">
                  <CardContent className="pt-4 pb-4 px-4 space-y-3">
                    {[
                      { label: "Production", count: productionCandidates.length, color: "text-emerald-400" },
                      { label: "Paper Trading", count: paperCandidates.length, color: "text-teal-400" },
                      { label: "Hypothesis / Detection", count: hypothesisCandidates.length, color: "text-blue-400" },
                      { label: "Total", count: candidates.length, color: "text-slate-300" },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{row.label}</span>
                        <span className={`text-sm font-mono font-bold ${row.color}`}>{row.count}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Coverage map mini */}
                <Card className="bg-[#0d1117] border-[#1e2a3a]">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-xs text-slate-400 uppercase tracking-widest">Coverage Map</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5">
                      {[
                        { name: "Trend Continuation", covered: true },
                        { name: "Momentum Breakout", covered: true },
                        { name: "Volatility Expansion", covered: true },
                        { name: "Scalp / Microstructure", covered: true },
                        { name: "Mean Reversion", covered: false, priority: 1 },
                        { name: "Range Fade", covered: false, priority: 2 },
                        { name: "Overnight Drift", covered: false, priority: 3 },
                        { name: "Opening Range Breakout", covered: false, priority: 4 },
                        { name: "Regime Transition", covered: false, priority: 5 },
                        { name: "Seasonal / Day-of-Week", covered: false, priority: 6 },
                      ].map(b => (
                        <div key={b.name} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${b.covered ? "bg-emerald-500" : "bg-slate-700"}`} />
                          <span className={`text-[11px] ${b.covered ? "text-slate-300" : "text-slate-600"}`}>{b.name}</span>
                          {!b.covered && b.priority && b.priority <= 3 && (
                            <Badge className="text-[9px] bg-orange-500/20 text-orange-400 border-orange-500/30 ml-auto">P{b.priority}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Constitutional principle */}
                <Card className="bg-gradient-to-br from-violet-900/20 to-blue-900/20 border-violet-500/20">
                  <CardContent className="py-3 px-4">
                    <p className="text-[11px] text-violet-300 italic leading-relaxed">
                      "DARWIN may recommend. DARWIN may discover. DARWIN may learn. DARWIN may NEVER bypass certification. Evidence always governs promotion."
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* CANDIDATES */}
          <TabsContent value="candidates" className="mt-4">
            {candidatesQ.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 bg-[#0d1117]" />)}
              </div>
            ) : candidates.length === 0 ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-16 text-center">
                  <p className="text-slate-500">No research candidates yet.</p>
                  <p className="text-slate-600 text-sm mt-1">Run DARWIN analysis to begin autonomous pattern discovery.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {candidates.map(c => <CandidateCard key={c.candidateId} c={c as DarwinCandidate} />)}
              </div>
            )}
          </TabsContent>

          {/* BACKTESTS */}
          <TabsContent value="backtests" className="mt-4">
            {backtestsQ.isLoading ? (
              <Skeleton className="h-64 bg-[#0d1117]" />
            ) : backtests.length === 0 ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-16 text-center">
                  <p className="text-slate-500">No backtests yet. DARWIN will generate backtests automatically when patterns are detected.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e2a3a] text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-2 pr-4">Candidate</th>
                      <th className="text-left py-2 pr-4">Stage</th>
                      <th className="text-right py-2 pr-4">Trades</th>
                      <th className="text-right py-2 pr-4">Win Rate</th>
                      <th className="text-right py-2 pr-4">PF</th>
                      <th className="text-right py-2 pr-4">Net Profit</th>
                      <th className="text-right py-2 pr-4">Max DD</th>
                      <th className="text-right py-2">Robustness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtests.map(bt => (
                      <tr key={bt.backtestId} className="border-b border-[#1e2a3a]/50 hover:bg-[#0d1117]">
                        <td className="py-2 pr-4 font-mono text-slate-300">{bt.candidateId}</td>
                        <td className="py-2 pr-4">
                          <Badge className={`text-[9px] border ${stageColor[bt.stage ?? ""] ?? "bg-slate-700 text-slate-300 border-slate-600"}`}>
                            {bt.stage?.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-300 font-mono">{bt.totalTrades ?? 0}</td>
                        <td className="py-2 pr-4 text-right font-mono text-emerald-400">{pct(bt.winRate)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-sky-400">{num(bt.profitFactor)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-slate-200">${num(bt.netProfit, 0)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-red-400">−${Math.abs(parseFloat(bt.maxDrawdown ?? "0")).toFixed(0)}</td>
                        <td className="py-2 text-right font-mono text-violet-400">{num(bt.robustnessScore, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* WEEKLY REPORTS */}
          <TabsContent value="reports" className="mt-4 space-y-3">
            {reportsQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 bg-[#0d1117]" />)
            ) : reports.length === 0 ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-16 text-center">
                  <p className="text-slate-500">No weekly reports yet.</p>
                  <Button
                    size="sm"
                    className="mt-3 text-xs bg-violet-600 hover:bg-violet-700"
                    onClick={() => reportMut.mutate()}
                    disabled={reportMut.isPending}
                  >
                    {reportMut.isPending ? "Generating…" : "Generate First Report"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              reports.map(r => (
                <Card key={r.reportId} className="bg-[#0d1117] border-[#1e2a3a]">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-slate-400">{r.reportId}</span>
                        <p className="text-sm text-slate-200 font-medium mt-0.5">
                          Week of {r.weekStart instanceof Date ? r.weekStart.toLocaleDateString() : String(r.weekStart)}
                        </p>
                      </div>
                      <div className="flex gap-3 text-right">
                        <div>
                          <p className="text-[10px] text-slate-500">Portfolio Health</p>
                          <p className="text-sm font-mono text-emerald-400 font-bold">{num(r.portfolioHealthScore, 0)}/100</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">Coverage</p>
                          <p className="text-sm font-mono text-orange-400 font-bold">{pct(r.coverageScore)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">New Obs.</p>
                          <p className="text-sm font-mono text-sky-400 font-bold">{r.newObservations}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  {r.fullReportMarkdown && (
                    <CardContent className="px-4 pb-4">
                      <details className="group">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">
                          View full report ▸
                        </summary>
                        <pre className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto border border-[#1e2a3a] rounded p-3 bg-[#070b11]">
                          {r.fullReportMarkdown}
                        </pre>
                      </details>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          {/* AUTONOMOUS ENGINE */}
          <TabsContent value="autonomous" className="mt-4 space-y-4">
            {/* Engine status banner */}
            {engineStatusQ.isLoading ? (
              <Skeleton className="h-24 bg-[#0d1117]" />
            ) : (
              <Card className={`border ${engineStatusQ.data?.engineStatus === 'OPERATIONAL' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-orange-950/20 border-orange-500/30'}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${engineStatusQ.data?.engineStatus === 'OPERATIONAL' ? 'bg-emerald-400 animate-pulse' : 'bg-orange-400'}`} />
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          DARWIN Autonomous Engine — {engineStatusQ.data?.engineStatus ?? 'UNKNOWN'}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {engineStatusQ.data?.atlasMemorySize ?? 0} total observations · {engineStatusQ.data?.queue?.pending ?? 0} jobs pending · {engineStatusQ.data?.totalCandidates ?? 0} candidates
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="text-xs border-[#1e2a3a] text-slate-300 hover:bg-[#1e2a3a]" onClick={() => hourlyMut.mutate()} disabled={hourlyMut.isPending}>
                        {hourlyMut.isPending ? '...' : '▶ Hourly'}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs border-[#1e2a3a] text-slate-300 hover:bg-[#1e2a3a]" onClick={() => dailyMut.mutate()} disabled={dailyMut.isPending}>
                        {dailyMut.isPending ? '...' : '▶ Daily Review'}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs border-[#1e2a3a] text-slate-300 hover:bg-[#1e2a3a]" onClick={() => weeklyMut.mutate()} disabled={weeklyMut.isPending}>
                        {weeklyMut.isPending ? '...' : '▶ Weekly Briefing'}
                      </Button>
                      <Button size="sm" className="text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={() => ingestMut.mutate()} disabled={ingestMut.isPending}>
                        {ingestMut.isPending ? 'Ingesting...' : '⟳ Ingest Historical'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Latest Executive Briefing */}
            {latestBriefingQ.data ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs text-slate-400 uppercase tracking-widest">Latest Executive Briefing</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase">Portfolio Health</p>
                      <p className="text-xl font-mono font-bold text-emerald-400">{parseFloat(latestBriefingQ.data.portfolioHealthScore ?? '0').toFixed(0)}/100</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase">Coverage</p>
                      <p className="text-xl font-mono font-bold text-orange-400">{parseFloat(latestBriefingQ.data.portfolioCoverageScore ?? '0').toFixed(0)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase">DARWIN Health</p>
                      <p className="text-xl font-mono font-bold text-violet-400">{parseFloat(latestBriefingQ.data.darwinHealthScore ?? '0').toFixed(0)}/100</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase">Promotion Ready</p>
                      <p className="text-xl font-mono font-bold text-sky-400">{latestBriefingQ.data.promotionCandidates ?? 0}</p>
                    </div>
                  </div>
                  {latestBriefingQ.data.highestConfidenceDiscovery && (
                    <div className="border-t border-[#1e2a3a] pt-3">
                      <p className="text-xs text-slate-500">Highest confidence discovery: <span className="text-slate-200 font-medium">{latestBriefingQ.data.highestConfidenceDiscovery}</span></p>
                      <p className="text-xs text-slate-500 mt-1">Priority research: <span className="text-orange-300">{latestBriefingQ.data.highestPriorityResearch}</span></p>
                    </div>
                  )}
                  {latestBriefingQ.data.fullBriefingMarkdown && (
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300">View full briefing ▸</summary>
                      <pre className="mt-2 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto border border-[#1e2a3a] rounded p-3 bg-[#070b11]">
                        {latestBriefingQ.data.fullBriefingMarkdown}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500 text-sm">No executive briefing yet. Trigger a weekly briefing to generate one.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* RESEARCH MEMORY */}
          <TabsContent value="memory" className="mt-4 space-y-3">
            {researchMemoryQ.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 bg-[#0d1117]" />)
            ) : (researchMemoryQ.data ?? []).length === 0 ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-16 text-center">
                  <p className="text-slate-500">No research memory entries yet. DARWIN records lessons learned from every rejected or deferred hypothesis.</p>
                </CardContent>
              </Card>
            ) : (
              (researchMemoryQ.data ?? []).map((m: any) => (
                <Card key={m.memoryId} className="bg-[#0d1117] border-[#1e2a3a]">
                  <CardContent className="py-4 px-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-200">{m.behaviourClass ?? 'Unknown'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{m.hypothesisDescription}</p>
                      </div>
                      <Badge className={`text-[10px] shrink-0 border ${
                        m.finalOutcome === 'CERTIFIED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        m.finalOutcome === 'REJECTED' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                        'bg-slate-700 text-slate-400 border-slate-600'
                      }`}>{m.finalOutcome}</Badge>
                    </div>
                    {m.lessonsLearned && (
                      <p className="text-xs text-slate-500 border-t border-[#1e2a3a] pt-2">
                        <span className="text-slate-400 font-medium">Lesson: </span>{m.lessonsLearned}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* SELF-EVALUATION */}
          <TabsContent value="self-eval" className="mt-4 space-y-3">
            {selfEvalQ.isLoading ? (
              <Skeleton className="h-48 bg-[#0d1117]" />
            ) : selfEvals.length === 0 ? (
              <Card className="bg-[#0d1117] border-[#1e2a3a]">
                <CardContent className="py-16 text-center">
                  <p className="text-slate-500">No self-evaluation records yet. DARWIN evaluates itself after each weekly report.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e2a3a] text-slate-500 uppercase tracking-wider">
                      <th className="text-left py-2 pr-4">Period</th>
                      <th className="text-right py-2 pr-4">Quality Score</th>
                      <th className="text-right py-2 pr-4">Prediction Acc.</th>
                      <th className="text-right py-2 pr-4">Research Eff.</th>
                      <th className="text-right py-2 pr-4">Discovery Rate</th>
                      <th className="text-right py-2">Observations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selfEvals.map(e => (
                      <tr key={e.evalId} className="border-b border-[#1e2a3a]/50 hover:bg-[#0d1117]">
                        <td className="py-2 pr-4 font-mono text-slate-400">{new Date(e.periodEnd).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-right font-mono text-violet-400 font-bold">{num(e.qualityScore, 1)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-emerald-400">{pct(e.predictionAccuracy)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-sky-400">{pct(e.researchEfficiency)}</td>
                        <td className="py-2 pr-4 text-right font-mono text-teal-400">{num(e.discoveryRate, 2)}/day</td>
                        <td className="py-2 text-right font-mono text-slate-300">{(e as unknown as { observationsAnalysed: number }).observationsAnalysed ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
