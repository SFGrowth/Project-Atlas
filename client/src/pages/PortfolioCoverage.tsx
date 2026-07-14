/**
 * Sprint 105 — Portfolio Coverage Map
 * Live regime distribution, coverage analysis, and candidate pipeline
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, XCircle, TrendingUp, Activity, Target } from "lucide-react";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-400/10 border-red-400/30",
  HIGH: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  MODERATE: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  COVERED: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const STAGE_COLOR: Record<string, string> = {
  PRODUCTION: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  PAPER: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  CANDIDATE: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  HYPOTHESIS: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
  ARCHIVED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export default function PortfolioCoverage() {
  const { data: coverage, isLoading: covLoading } = trpc.executive.portfolioCoverage.useQuery(undefined, { refetchInterval: 30000 });
  const { data: registry, isLoading: regLoading } = trpc.executive.candidateRegistry.useQuery(undefined, { refetchInterval: 60000 });

  const isLoading = covLoading || regLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Coverage Map</h1>
          <p className="text-slate-400 text-sm mt-1">Live regime distribution vs strategy coverage — Sprint 105</p>
        </div>
        {coverage && (
          <div className={`px-4 py-2 rounded-lg border text-sm font-semibold ${SEVERITY_COLOR[coverage.portfolioGapSeverity ?? 'CRITICAL']}`}>
            Gap Severity: {coverage.portfolioGapSeverity}
          </div>
        )}
      </div>

      {/* Coverage Summary */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : coverage ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Live Bars</div>
              <div className="text-3xl font-bold text-white">{coverage.totalBars}</div>
              <div className="text-slate-500 text-xs mt-1">From atlas_memory</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Covered Bars</div>
              <div className="text-3xl font-bold text-emerald-400">{coverage.coveredBars}</div>
              <div className="text-slate-500 text-xs mt-1">{coverage.coveragePct?.toFixed(1)}% of live data</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Uncovered Bars</div>
              <div className="text-3xl font-bold text-red-400">{coverage.uncoveredBars}</div>
              <div className="text-slate-500 text-xs mt-1">{coverage.totalBars > 0 ? (100 - (coverage.coveragePct ?? 0)).toFixed(1) : 0}% gap</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-4">
              <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Coverage %</div>
              <div className="text-3xl font-bold text-white">{coverage.coveragePct?.toFixed(1)}%</div>
              <Progress value={coverage.coveragePct ?? 0} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Regime Coverage Grid */}
      {coverage && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Live Regime Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {coverage.coverage.map((row) => (
                <div key={row.regime} className="flex items-center gap-4">
                  <div className="w-32 flex-shrink-0">
                    <div className="text-white text-sm font-medium">{row.regime}</div>
                    <div className="text-slate-500 text-xs">{row.bars} bars</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Progress
                        value={row.pct}
                        className="flex-1 h-3"
                      />
                      <span className="text-slate-400 text-xs w-12 text-right">{row.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-48 flex-shrink-0">
                    {row.covered ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 text-xs">{(row.models as string[]).join(", ")}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-red-400" />
                          <span className="text-red-400 text-xs font-medium">NO COVERAGE</span>
                        </div>
                        {(row as { candidates?: string[] }).candidates?.map((c: string) => (
                          <div key={c} className="text-purple-400 text-xs ml-4">→ {c}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regime Distribution Detail */}
      {coverage?.regimeDistribution && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Raw Regime Distribution (Live Bars)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(coverage.regimeDistribution)
                .sort(([, a], [, b]) => Number(b) - Number(a))
                .map(([regime, cnt]) => (
                  <div key={regime} className="bg-slate-800 rounded-lg p-3">
                    <div className="text-slate-400 text-xs truncate">{regime || "NULL"}</div>
                    <div className="text-white font-bold text-xl">{cnt}</div>
                    <div className="text-slate-500 text-xs">
                      {coverage.totalBars > 0 ? (Number(cnt) / coverage.totalBars * 100).toFixed(1) : 0}%
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategy Pipeline */}
      {registry && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Production & Paper */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Active Strategies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...registry.production, ...registry.paper].map((s) => (
                  <div key={s.strategyId} className="flex items-center justify-between p-2 bg-slate-800 rounded-lg">
                    <div>
                      <div className="text-white text-sm font-medium">{s.strategyId}</div>
                      <div className="text-slate-400 text-xs">{s.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-xs">PCS {s.pcsScore ?? "—"}</span>
                      <Badge className={`text-xs ${STAGE_COLOR[s.stage ?? 'HYPOTHESIS']}`}>
                        {s.stage}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Candidates & Hypotheses */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Target className="w-4 h-4 text-yellow-400" />
                Research Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[...registry.candidates, ...registry.hypotheses].map((s) => (
                  <div key={s.strategyId} className="p-2 bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="text-white text-sm font-medium">{s.strategyId}</div>
                      <Badge className={`text-xs ${STAGE_COLOR[s.stage ?? 'HYPOTHESIS']}`}>
                        {s.stage}
                      </Badge>
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">{s.name}</div>
                    <div className="text-slate-500 text-xs mt-1 line-clamp-2">{s.recommendation}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* DARWIN Candidates */}
      {registry?.darwinCandidates && registry.darwinCandidates.length > 0 && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-purple-400" />
              DARWIN Hypothesis Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-700">
                    <th className="text-left pb-2 pr-4">Candidate ID</th>
                    <th className="text-left pb-2 pr-4">Class</th>
                    <th className="text-right pb-2 pr-4">Confidence</th>
                    <th className="text-right pb-2 pr-4">Est. PCS</th>
                    <th className="text-right pb-2 pr-4">Occurrences</th>
                    <th className="text-left pb-2">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.darwinCandidates.map((c) => (
                    <tr key={c.candidateId} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-2 pr-4 text-white font-mono text-xs">{c.candidateId}</td>
                      <td className="py-2 pr-4 text-slate-300 text-xs">{c.behaviourClass}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={`text-xs font-medium ${Number(c.confidence ?? 0) >= 70 ? 'text-emerald-400' : Number(c.confidence ?? 0) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {c.confidence ? Number(c.confidence).toFixed(1) : "—"}%
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-300 text-xs">{c.estimatedPcs ? Number(c.estimatedPcs).toFixed(1) : "—"}</td>
                      <td className="py-2 pr-4 text-right text-slate-300 text-xs">{c.occurrenceCount ?? "—"}</td>
                      <td className="py-2">
                        <Badge className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                          {c.governanceStage}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Market Laws */}
      {registry?.marketLaws && (
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Market Laws ({registry.marketLaws.length} Admitted)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {registry.marketLaws.map((law) => (
                <div key={law.lawId} className="p-3 bg-slate-800 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs font-mono">{law.lawId}</span>
                    <span className={`text-xs font-bold ${Number(law.confidenceScore) >= 85 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {Number(law.confidenceScore).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-white text-sm">{law.title}</div>
                  <div className="text-slate-500 text-xs mt-1">
                    Live: {law.liveObservationsConsistent ?? 0} consistent / {law.liveObservationsContradicting ?? 0} contradicting
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
