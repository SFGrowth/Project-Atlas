/**
 * Sprint 105 — DARWIN Discovery Dashboard
 * Live DARWIN research status, behaviour library, market laws, and live validation
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, BookOpen, Scale, FlaskConical, TrendingUp, AlertCircle } from "lucide-react";

const GOVERNANCE_COLOR: Record<string, string> = {
  HYPOTHESIS: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  INVESTIGATING: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  VALIDATED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  PROMOTED: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
  ARCHIVED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export default function DarwinDiscovery() {
  const { data, isLoading } = trpc.executive.darwinDiscovery.useQuery(undefined, { refetchInterval: 60000 });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            DARWIN Discovery Engine
          </h1>
          <p className="text-slate-400 text-sm mt-1">Autonomous research status — Market Laws, Behaviour Library, Candidate Pipeline</p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-slate-400 text-xs">Live Validation Bars</div>
            <div className="text-white font-bold text-xl">{data.liveValidation.totalBars}</div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : data ? (
        <>
          {/* ML-001 Live Validation */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Scale className="w-4 h-4 text-blue-400" />
                ML-001 Live Validation — Compound Signal Superiority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Total Live Bars</div>
                  <div className="text-white font-bold text-2xl">{data.liveValidation.totalBars}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Compound Signal Bars</div>
                  <div className="text-emerald-400 font-bold text-2xl">{data.liveValidation.compoundSignalBars}</div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Signal Rate</div>
                  <div className="text-white font-bold text-2xl">{data.liveValidation.ml001LiveSupport}%</div>
                  <div className="text-slate-500 text-xs mt-1">of bars have ≥1 eligible model</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Market Laws */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Scale className="w-4 h-4 text-yellow-400" />
                Market Laws ({data.marketLaws.length} Admitted)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.marketLaws.map((law) => (
                  <div key={law.lawId} className="p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">{law.lawId}</span>
                        <span className="text-white text-sm font-medium">{law.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${Number(law.confidenceScore) >= 85 ? 'text-emerald-400' : Number(law.confidenceScore) >= 70 ? 'text-yellow-400' : 'text-orange-400'}`}>
                          {Number(law.confidenceScore).toFixed(0)}%
                        </span>
                        <Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                          {law.admissionStatus}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-emerald-400">✓ {law.liveObservationsConsistent ?? 0} consistent</span>
                      <span className="text-red-400">✗ {law.liveObservationsContradicting ?? 0} contradicting</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Behaviour Library */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                Behaviour Library ({data.behaviourLibrary.length} Behaviours)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                      <th className="text-left pb-2 pr-4">Behaviour</th>
                      <th className="text-right pb-2 pr-4">Observations</th>
                      <th className="text-right pb-2 pr-4">Continuation Rate</th>
                      <th className="text-left pb-2">Signal Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.behaviourLibrary.map((b) => {
                      const rate = b.continuationRate ? Number(b.continuationRate) : null;
                      const quality = rate === null ? "NO DATA"
                        : rate >= 0.7 ? "STRONG SIGNAL"
                        : rate >= 0.5 ? "MODERATE"
                        : rate >= 0.3 ? "WEAK"
                        : "COUNTER-SIGNAL";
                      const qualityColor = rate === null ? "text-slate-500"
                        : rate >= 0.7 ? "text-emerald-400"
                        : rate >= 0.5 ? "text-yellow-400"
                        : rate >= 0.3 ? "text-orange-400"
                        : "text-red-400";
                      return (
                        <tr key={b.behaviourId} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="py-2 pr-4">
                            <div className="text-white text-sm">{b.behaviourName}</div>
                            <div className="text-slate-500 text-xs font-mono">{b.behaviourId}</div>
                          </td>
                          <td className="py-2 pr-4 text-right text-slate-300">{b.totalObservations ?? 0}</td>
                          <td className="py-2 pr-4 text-right">
                            <span className={`font-medium ${qualityColor}`}>
                              {rate !== null ? (rate * 100).toFixed(1) + "%" : "—"}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={`text-xs font-medium ${qualityColor}`}>{quality}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* DARWIN Candidates */}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-purple-400" />
                DARWIN Hypothesis Candidates ({data.darwinCandidates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.darwinCandidates.length === 0 ? (
                <div className="flex items-center gap-2 text-slate-500 py-4">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">No active candidates. DARWIN will register new hypotheses from live bar observations.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.darwinCandidates.map((c) => (
                    <div key={c.candidateId} className="p-3 bg-slate-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-xs font-mono bg-slate-700 px-2 py-0.5 rounded">{c.candidateId}</span>
                          <span className="text-white text-sm font-medium">{c.behaviourClass}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.confidence !== null && (
                            <span className={`text-sm font-bold ${Number(c.confidence) >= 70 ? 'text-emerald-400' : Number(c.confidence) >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {Number(c.confidence).toFixed(1)}%
                            </span>
                          )}
                          <Badge className={`text-xs ${GOVERNANCE_COLOR[c.governanceStage ?? 'HYPOTHESIS']}`}>
                            {c.governanceStage}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-slate-400 text-xs">{c.behaviourDescription}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>Occurrences: {c.occurrenceCount ?? "—"}</span>
                        <span>Est. WR: {c.estimatedWinRate ? (Number(c.estimatedWinRate) * 100).toFixed(0) + "%" : "—"}</span>
                        <span>Est. PF: {c.estimatedPf ? Number(c.estimatedPf).toFixed(2) : "—"}</span>
                        <span>Est. PCS: {c.estimatedPcs ? Number(c.estimatedPcs).toFixed(1) : "—"}</span>
                      </div>
                      {c.supportingRegimes && (
                        <div className="mt-1 text-xs text-slate-500">
                          Regimes: {c.supportingRegimes} | Sessions: {c.supportingSessions}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-slate-500 text-center py-12">No DARWIN data available</div>
      )}
    </div>
  );
}
