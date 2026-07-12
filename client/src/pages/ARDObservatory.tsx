import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  BarChart3,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: string | null | undefined, decimals = 2) {
  if (v == null) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toFixed(decimals);
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
function statusColor(status: string) {
  switch (status) {
    case "Observed": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "Investigating": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "Validated": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "Rejected": return "bg-red-500/20 text-red-300 border-red-500/30";
    case "Promoted": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/30";
  }
}

// ─── Observation Stream ───────────────────────────────────────────────────────
function ObservationStream() {
  const { data: obs, isLoading } = trpc.ard.recentObservations.useQuery({ limit: 50 });
  const { data: stats } = trpc.ard.stats.useQuery();
  const { data: gaps } = trpc.ard.missingBars.useQuery({});

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Observations", value: stats?.total?.toLocaleString() ?? "—", icon: <Database className="w-4 h-4" /> },
          { label: "Today's Bars", value: stats?.today?.toLocaleString() ?? "—", icon: <Activity className="w-4 h-4" /> },
          { label: "This Week", value: stats?.thisWeek?.toLocaleString() ?? "—", icon: <Clock className="w-4 h-4" /> },
          { label: "Missing Bars (7d)", value: gaps?.length?.toString() ?? "0", icon: <AlertTriangle className="w-4 h-4" />, warn: (gaps?.length ?? 0) > 0 },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                {s.icon}
                <span className="text-xs">{s.label}</span>
              </div>
              <div className={`text-sm font-mono font-semibold ${s.warn ? "text-amber-400" : "text-slate-100"}`}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Missing bar alerts */}
      {gaps && gaps.length > 0 && (
        <Card className="bg-amber-900/20 border-amber-500/30">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" />
              MISSING BAR GAPS DETECTED (LAST 7 DAYS)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="space-y-1">
              {gaps.slice(0, 5).map((g, i) => (
                <div key={i} className="text-xs font-mono text-amber-300">
                  {fmtTime(g.gapStart.toString())} → {fmtTime(g.gapEnd.toString())} ({g.gapMinutes} min gap)
                </div>
              ))}
              {gaps.length > 5 && (
                <div className="text-xs text-amber-400">+{gaps.length - 5} more gaps</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Observation table */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs text-slate-400">RECENT BAR OBSERVATIONS (M16)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 text-sm">Loading observations...</div>
          ) : !obs || obs.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-slate-500 text-sm mb-2">No observations yet</div>
              <div className="text-slate-600 text-xs max-w-sm mx-auto">
                Add M-16 (atlas_ard_observer_m16.pine) to your MNQ 5-minute chart in TradingView.
                Every confirmed candle will be stored here automatically.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-slate-400 text-xs">Bar Time</TableHead>
                    <TableHead className="text-slate-400 text-xs">Session</TableHead>
                    <TableHead className="text-slate-400 text-xs">Close</TableHead>
                    <TableHead className="text-slate-400 text-xs">ATR</TableHead>
                    <TableHead className="text-slate-400 text-xs">ADX</TableHead>
                    <TableHead className="text-slate-400 text-xs">CHOP</TableHead>
                    <TableHead className="text-slate-400 text-xs">Regime</TableHead>
                    <TableHead className="text-slate-400 text-xs">Vol State</TableHead>
                    <TableHead className="text-slate-400 text-xs">SB1 RAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obs.map((o) => (
                    <TableRow key={o.id} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="text-xs font-mono text-slate-300">{fmtTime(o.barTime)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-xs px-1 py-0 border-slate-600 text-slate-400">
                          {o.session ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-200">{fmt(o.close, 2)}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-300">{fmt(o.atr, 2)}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-300">{fmt(o.adx, 1)}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-300">{fmt(o.chop, 1)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="text-slate-400">{o.regimeClassification ?? "—"}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={`font-mono ${o.volatilityState === "EXPANDING" ? "text-emerald-400" : o.volatilityState === "CONTRACTING" ? "text-red-400" : "text-slate-400"}`}>
                          {o.volatilityState ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {o.sb1Ras != null ? (
                          <span className={parseFloat(String(o.sb1Ras)) >= 45 ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                            {fmt(String(o.sb1Ras), 1)}
                          </span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Research Candidates ──────────────────────────────────────────────────────
function ResearchCandidates() {
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ candidateId: "", title: "", hypothesis: "", direction: "", horizon: "" });
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: candidates, isLoading } = trpc.ard.candidates.useQuery({ status: statusFilter });
  const createMut = trpc.ard.createCandidate.useMutation({
    onSuccess: () => {
      utils.ard.candidates.invalidate();
      setShowForm(false);
      setForm({ candidateId: "", title: "", hypothesis: "", direction: "", horizon: "" });
      toast.success("Research candidate created");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.ard.updateCandidateStatus.useMutation({
    onSuccess: () => {
      utils.ard.candidates.invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const statuses = ["Observed", "Investigating", "Validated", "Rejected", "Promoted"];

  return (
    <div className="space-y-4">
      {/* Filter + Add */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Filter:</span>
        {[undefined, ...statuses].map((s) => (
          <button
            key={s ?? "all"}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              statusFilter === s
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {s ?? "All"}
          </button>
        ))}
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="w-3 h-3 mr-1" />
            New Candidate
          </Button>
        </div>
      </div>

      {/* New candidate form */}
      {showForm && (
        <Card className="bg-slate-800/70 border-cyan-500/30">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs text-cyan-400">NEW RESEARCH CANDIDATE</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="h-7 text-xs bg-slate-900/50 border-slate-600"
                placeholder="Candidate ID (e.g. ARD-001)"
                value={form.candidateId}
                onChange={(e) => setForm({ ...form, candidateId: e.target.value })}
              />
              <Input
                className="h-7 text-xs bg-slate-900/50 border-slate-600"
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <textarea
              className="w-full h-16 text-xs bg-slate-900/50 border border-slate-600 rounded px-2 py-1 text-slate-200 resize-none"
              placeholder="Hypothesis — describe the pattern or precursor you observed..."
              value={form.hypothesis}
              onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                className="h-7 text-xs bg-slate-900/50 border-slate-600"
                placeholder="Direction (LONG / SHORT / BOTH)"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
              />
              <Input
                className="h-7 text-xs bg-slate-900/50 border-slate-600"
                placeholder="Horizon (e.g. 5–15 bars)"
                value={form.horizon}
                onChange={(e) => setForm({ ...form, horizon: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-cyan-600 hover:bg-cyan-500"
                disabled={!form.candidateId || !form.title || !form.hypothesis || createMut.isPending}
                onClick={() => createMut.mutate({
                  candidateId: form.candidateId,
                  title: form.title,
                  hypothesis: form.hypothesis,
                  direction: form.direction || undefined,
                  horizon: form.horizon || undefined,
                })}
              >
                {createMut.isPending ? "Saving..." : "Create Candidate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidates table */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 text-sm">Loading candidates...</div>
          ) : !candidates || candidates.length === 0 ? (
            <div className="p-8 text-center">
              <FlaskConical className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-slate-500 text-sm">No research candidates yet</div>
              <div className="text-slate-600 text-xs mt-1">
                ARD will automatically surface candidates as patterns emerge in the observation stream.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-slate-400 text-xs">ID</TableHead>
                    <TableHead className="text-slate-400 text-xs">Title</TableHead>
                    <TableHead className="text-slate-400 text-xs">Status</TableHead>
                    <TableHead className="text-slate-400 text-xs">Direction</TableHead>
                    <TableHead className="text-slate-400 text-xs">Horizon</TableHead>
                    <TableHead className="text-slate-400 text-xs">Discovered</TableHead>
                    <TableHead className="text-slate-400 text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.id} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="text-xs font-mono text-cyan-400">{c.candidateId}</TableCell>
                      <TableCell className="text-xs text-slate-200 max-w-[200px] truncate" title={c.title}>{c.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs px-1 py-0 ${statusColor(c.status)}`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{c.direction ?? "—"}</TableCell>
                      <TableCell className="text-xs text-slate-400">{c.horizon ?? "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-400">{c.discoveryDate}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {c.status === "Observed" && (
                            <button
                              onClick={() => updateMut.mutate({ candidateId: c.candidateId, status: "Investigating" })}
                              className="text-xs text-yellow-400 hover:text-yellow-300 px-1"
                            >
                              Investigate
                            </button>
                          )}
                          {c.status === "Investigating" && (
                            <>
                              <button
                                onClick={() => updateMut.mutate({ candidateId: c.candidateId, status: "Validated" })}
                                className="text-xs text-emerald-400 hover:text-emerald-300 px-1"
                              >
                                Validate
                              </button>
                              <button
                                onClick={() => updateMut.mutate({ candidateId: c.candidateId, status: "Rejected" })}
                                className="text-xs text-red-400 hover:text-red-300 px-1"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {c.status === "Validated" && (
                            <button
                              onClick={() => updateMut.mutate({ candidateId: c.candidateId, status: "Promoted" })}
                              className="text-xs text-purple-400 hover:text-purple-300 px-1"
                            >
                              Promote
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ORACLE Page ──────────────────────────────────────────────────────────────
function OraclePredictions() {
  const { data: predictions, isLoading } = trpc.oracle.predictions.useQuery({ limit: 50 });
  const { data: pairs } = trpc.oracle.pairs.useQuery({ limit: 100 });

  const resolved = pairs?.filter((p) => p.actualResult != null) ?? [];
  const correct = resolved.filter((p) => p.actualResult === "WIN" && parseFloat(p.expectedWinProb ?? "0") > 0.5).length
    + resolved.filter((p) => p.actualResult === "LOSS" && parseFloat(p.expectedWinProb ?? "1") <= 0.5).length;
  const accuracy = resolved.length > 0 ? (correct / resolved.length * 100).toFixed(1) : null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Predictions", value: predictions?.length?.toString() ?? "0" },
          { label: "Resolved", value: resolved.length.toString() },
          { label: "Prediction Accuracy", value: accuracy ? `${accuracy}%` : "—" },
          { label: "Pending Resolution", value: ((predictions?.length ?? 0) - resolved.length).toString() },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-3">
              <div className="text-xs text-slate-400 mb-1">{s.label}</div>
              <div className="text-sm font-mono font-semibold text-slate-100">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Prediction vs Reality table */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-xs text-slate-400">PREDICTION vs REALITY LOG</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-slate-500 text-sm">Loading predictions...</div>
          ) : !predictions || predictions.length === 0 ? (
            <div className="p-8 text-center">
              <BarChart3 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <div className="text-slate-500 text-sm">No predictions recorded yet</div>
              <div className="text-slate-600 text-xs mt-1">
                ORACLE predictions are recorded automatically at trade entry and resolved at exit.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-slate-400 text-xs">Time</TableHead>
                    <TableHead className="text-slate-400 text-xs">Model</TableHead>
                    <TableHead className="text-slate-400 text-xs">Direction</TableHead>
                    <TableHead className="text-slate-400 text-xs">Win Prob</TableHead>
                    <TableHead className="text-slate-400 text-xs">Expected R</TableHead>
                    <TableHead className="text-slate-400 text-xs">Actual</TableHead>
                    <TableHead className="text-slate-400 text-xs">Actual R</TableHead>
                    <TableHead className="text-slate-400 text-xs">Calibration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs?.map((p, i) => {
                    const winProb = parseFloat(p.expectedWinProb ?? "0");
                    const isCorrect = p.actualResult != null && (
                      (p.actualResult === "WIN" && winProb > 0.5) ||
                      (p.actualResult === "LOSS" && winProb <= 0.5)
                    );
                    return (
                      <TableRow key={i} className="border-slate-700/30 hover:bg-slate-700/20">
                        <TableCell className="text-xs font-mono text-slate-400">{fmtTime(p.predictionTime)}</TableCell>
                        <TableCell className="text-xs text-slate-300">{p.modelId ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {p.direction === "LONG" ? (
                            <span className="text-emerald-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" />LONG</span>
                          ) : p.direction === "SHORT" ? (
                            <span className="text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" />SHORT</span>
                          ) : <Minus className="w-3 h-3 text-slate-500" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-200">
                          {p.expectedWinProb ? `${(winProb * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-300">{fmt(p.expectedR)}R</TableCell>
                        <TableCell className="text-xs">
                          {p.actualResult ? (
                            <span className={p.actualResult === "WIN" ? "text-emerald-400" : "text-red-400"}>
                              {p.actualResult}
                            </span>
                          ) : <span className="text-slate-500">Pending</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {p.actualR ? (
                            <span className={parseFloat(p.actualR) >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {fmt(p.actualR)}R
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.actualResult != null ? (
                            isCorrect ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-red-400" />
                            )
                          ) : <Minus className="w-3 h-3 text-slate-600" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ARDObservatory() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">ARD Observatory</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Autonomous Research Division — every confirmed 5-minute bar observed, stored, and analysed
          </p>
        </div>
        <Badge variant="outline" className="text-xs border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
          RESEARCH ONLY
        </Badge>
      </div>

      {/* Constitution notice */}
      <Card className="bg-slate-800/30 border-slate-700/30">
        <CardContent className="p-3">
          <div className="flex gap-2 items-start">
            <FlaskConical className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-400">
              <span className="text-slate-300 font-medium">ARD Governance: </span>
              ARD is research-only and cannot modify production models or execution logic. Candidates discovered here must pass
              full validation before promotion. ARD has no write access to the live pipeline.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="stream">
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="stream" className="text-xs data-[state=active]:bg-slate-700">
            <Activity className="w-3 h-3 mr-1" />
            Observation Stream
          </TabsTrigger>
          <TabsTrigger value="candidates" className="text-xs data-[state=active]:bg-slate-700">
            <FlaskConical className="w-3 h-3 mr-1" />
            Research Candidates
          </TabsTrigger>
          <TabsTrigger value="oracle" className="text-xs data-[state=active]:bg-slate-700">
            <BarChart3 className="w-3 h-3 mr-1" />
            ORACLE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stream" className="mt-4">
          <ObservationStream />
        </TabsContent>
        <TabsContent value="candidates" className="mt-4">
          <ResearchCandidates />
        </TabsContent>
        <TabsContent value="oracle" className="mt-4">
          <OraclePredictions />
        </TabsContent>
      </Tabs>
    </div>
  );
}
