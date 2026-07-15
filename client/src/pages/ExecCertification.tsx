import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  CheckCircle2, XCircle, Clock, SkipForward,
  Activity, BarChart2, FileText, Play, Square,
} from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    PASS:        { label: "PASS",        className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    FAIL:        { label: "FAIL",        className: "bg-red-500/20 text-red-400 border-red-500/30" },
    SKIP:        { label: "SKIP",        className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
    PENDING:     { label: "PENDING",     className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    IN_PROGRESS: { label: "IN PROGRESS", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    ABORTED:     { label: "ABORTED",     className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-500/20 text-slate-400" };
  return <Badge variant="outline" className={`text-xs font-mono ${s.className}`}>{s.label}</Badge>;
}

function stageIcon(status: string) {
  if (status === "PASS")    return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === "FAIL")    return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === "SKIP")    return <SkipForward className="w-4 h-4 text-slate-400" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

function ts(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

const EXEC_CRITERIA = [
  { id: 1, label: "Strategy remains frozen",               desc: "No parameter changes to S109-001 since Sprint 109 freeze" },
  { id: 2, label: "Execution chain 100% reliable",         desc: "All 15 certification stages PASS in PRE_LIVE_GATE run" },
  { id: 3, label: "Live behaviour consistent with S110",   desc: "Live WR ≥65%, PF ≥2.0 over ≥20 trades" },
  { id: 4, label: "Promotion gate requirements achieved",  desc: "All 6 Walk-Forward promotion gates pass" },
  { id: 5, label: "No unresolved operational defects",     desc: "Safety state: NOT HALTED, no open alerts" },
  { id: 6, label: "Every trade fully auditable",           desc: "All trades in wf_live_trades with entry, exit, outcome, PnL" },
  { id: 7, label: "Dashboard reflects true account state", desc: "Walk-Forward and Apex Evaluation pages in sync" },
];

export default function ExecCertification() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("pipeline");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const { data: latestRun, isLoading: loadingRun } = trpc.execCert.getLatestRun.useQuery();
  const { data: runHistory } = trpc.execCert.getRunHistory.useQuery({ limit: 20 });
  const { data: safetyData, isLoading: loadingSafety } = trpc.execCert.getSafetyState.useQuery();
  const { data: safetyLog } = trpc.execCert.getSafetyLog.useQuery({ limit: 50 });
  const { data: stages } = trpc.execCert.getStageDefinitions.useQuery();
  const { data: selectedRun } = trpc.execCert.getRunById.useQuery(
    { runId: selectedRunId! },
    { enabled: selectedRunId !== null }
  );

  const startRun = trpc.execCert.startRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Certification run started — Run ID: ${data.runId}`);
      utils.execCert.getLatestRun.invalidate();
      utils.execCert.getRunHistory.invalidate();
    },
  });

  const recordStage = trpc.execCert.recordStage.useMutation({
    onSuccess: () => { utils.execCert.getLatestRun.invalidate(); },
  });

  const abortRun = trpc.execCert.abortRun.useMutation({
    onSuccess: () => {
      toast.info("Run aborted");
      utils.execCert.getLatestRun.invalidate();
      utils.execCert.getRunHistory.invalidate();
    },
  });

  const acknowledgeHalt = trpc.execCert.acknowledgeHalt.useMutation({
    onSuccess: () => {
      toast.info("Halt acknowledged");
      utils.execCert.getSafetyState.invalidate();
      utils.execCert.getSafetyLog.invalidate();
    },
  });

  const clearHalt = trpc.execCert.clearHalt.useMutation({
    onSuccess: () => {
      toast.success("Halt cleared — trading resumed");
      utils.execCert.getSafetyState.invalidate();
      utils.execCert.getSafetyLog.invalidate();
    },
  });

  const triggerHaltMut = trpc.execCert.triggerHalt.useMutation({
    onSuccess: () => {
      toast.warning("Manual halt triggered");
      utils.execCert.getSafetyState.invalidate();
      utils.execCert.getSafetyLog.invalidate();
    },
  });

  const safety = safetyData?.state;
  const config = safetyData?.config;
  const currentRun = selectedRunId ? selectedRun : latestRun;
  const isInProgress = currentRun?.run?.overallStatus === "IN_PROGRESS";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            Execution Certification
          </h1>
          <p className="text-slate-400 text-sm mt-1">Sprint 112 Parts 8–10 — Pre-live gate for DARWIN-S109-001</p>
        </div>
        {safety?.isHalted ? (
          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
            <ShieldX className="w-3 h-3 mr-1" /> HALTED
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <ShieldCheck className="w-3 h-3 mr-1" /> TRADING ACTIVE
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Latest Run</p>
            {loadingRun ? <Skeleton className="h-6 w-24" /> :
              latestRun ? statusBadge(latestRun.run.overallStatus) :
              <span className="text-slate-500 text-sm">No runs yet</span>}
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Stages Passed</p>
            {loadingRun ? <Skeleton className="h-6 w-16" /> :
              <span className="text-2xl font-bold text-emerald-400">{latestRun?.run.stagesPassed ?? "—"}<span className="text-slate-500 text-sm">/15</span></span>}
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Daily Loss</p>
            {loadingSafety ? <Skeleton className="h-6 w-16" /> :
              <span className="text-2xl font-bold text-amber-400">${parseFloat(safety?.dailyLossAmount ?? "0").toFixed(0)}<span className="text-slate-500 text-sm">/${config?.dailyLossLockoutAmount}</span></span>}
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-4">
            <p className="text-xs text-slate-400 mb-1">Consecutive Losses</p>
            {loadingSafety ? <Skeleton className="h-6 w-16" /> :
              <span className={`text-2xl font-bold ${(safety?.consecutiveLosses ?? 0) >= (config?.consecutiveLossLimit ?? 3) ? "text-red-400" : "text-white"}`}>
                {safety?.consecutiveLosses ?? 0}<span className="text-slate-500 text-sm">/{config?.consecutiveLossLimit}</span>
              </span>}
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="pipeline"><Activity className="w-4 h-4 mr-1" />Pipeline</TabsTrigger>
          <TabsTrigger value="safety"><ShieldAlert className="w-4 h-4 mr-1" />Safety</TabsTrigger>
          <TabsTrigger value="criteria"><BarChart2 className="w-4 h-4 mr-1" />Criteria</TabsTrigger>
          <TabsTrigger value="history"><FileText className="w-4 h-4 mr-1" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">15-Stage Certification Pipeline</h2>
            {user && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-slate-600 text-slate-300"
                  onClick={() => startRun.mutate({ runType: "DRY_RUN" })}
                  disabled={startRun.isPending || isInProgress}>
                  <Play className="w-3 h-3 mr-1" />Dry Run
                </Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => startRun.mutate({ runType: "PRE_LIVE_GATE" })}
                  disabled={startRun.isPending || isInProgress}>
                  <Shield className="w-3 h-3 mr-1" />Pre-Live Gate
                </Button>
                {isInProgress && latestRun && (
                  <Button size="sm" variant="outline" className="border-red-600 text-red-400"
                    onClick={() => abortRun.mutate({ runId: latestRun.run.id })}
                    disabled={abortRun.isPending}>
                    <Square className="w-3 h-3 mr-1" />Abort
                  </Button>
                )}
              </div>
            )}
          </div>

          {loadingRun ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !currentRun ? (
            <Card className="bg-slate-900 border-slate-700">
              <CardContent className="p-8 text-center">
                <Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No certification runs yet. Start a Dry Run to test the pipeline.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700 text-xs text-slate-400">
                <span>Run #{currentRun.run.id}</span>
                <span className="text-slate-600">·</span>
                <span>{currentRun.run.runType}</span>
                <span className="text-slate-600">·</span>
                <span>{ts(currentRun.run.startedAt)}</span>
                <div className="ml-auto">{statusBadge(currentRun.run.overallStatus)}</div>
              </div>
              {(stages ?? []).map(stageDef => {
                const result = currentRun.stages.find(s => s.stageNumber === stageDef.number);
                const status = result?.status ?? "PENDING";
                return (
                  <div key={stageDef.number} className={`flex items-start gap-3 p-3 rounded-lg border ${
                    status === "PASS" ? "bg-emerald-950/30 border-emerald-800/30" :
                    status === "FAIL" ? "bg-red-950/30 border-red-800/30" :
                    "bg-slate-900 border-slate-700"
                  }`}>
                    <div className="flex items-center gap-2 min-w-[2rem]">
                      <span className="text-xs text-slate-500 font-mono w-4 text-right">{stageDef.number}</span>
                      {stageIcon(status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{stageDef.name}</span>
                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{stageDef.type}</Badge>
                        {result?.latencyMs != null && <span className="text-xs text-slate-500">{result.latencyMs}ms</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{stageDef.successCriteria}</p>
                      {result?.errorMessage && <p className="text-xs text-red-400 mt-1 font-mono">{result.errorMessage}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {statusBadge(status)}
                      {user && isInProgress && status === "PENDING" && stageDef.type === "MANUAL" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-emerald-600 text-emerald-400"
                            onClick={() => recordStage.mutate({ runId: currentRun.run.id, stageNumber: stageDef.number, status: "PASS" })}>Pass</Button>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-red-600 text-red-400"
                            onClick={() => recordStage.mutate({ runId: currentRun.run.id, stageNumber: stageDef.number, status: "FAIL" })}>Fail</Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="safety" className="space-y-4 mt-4">
          <h2 className="text-lg font-semibold text-white">Apex Account Safety Lockout</h2>
          {loadingSafety ? <Skeleton className="h-32 w-full" /> : (
            <Card className={`border ${safety?.isHalted ? "bg-red-950/30 border-red-800/50" : "bg-slate-900 border-slate-700"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {safety?.isHalted
                    ? <><ShieldX className="w-5 h-5 text-red-400" /><span className="text-red-400">TRADING HALTED</span></>
                    : <><ShieldCheck className="w-5 h-5 text-emerald-400" /><span className="text-emerald-400">TRADING ACTIVE</span></>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {safety?.isHalted && (
                  <div className="space-y-2">
                    {safety.haltDetails && <p className="text-sm text-slate-300">{safety.haltDetails}</p>}
                    <p className="text-xs text-slate-500">Halted at: {ts(safety.haltedAt)}</p>
                    {user && (
                      <div className="flex gap-2 pt-2">
                        {!safety.acknowledgedBy && (
                          <Button size="sm" variant="outline" className="border-amber-600 text-amber-400"
                            onClick={() => acknowledgeHalt.mutate({})} disabled={acknowledgeHalt.isPending}>Acknowledge</Button>
                        )}
                        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600"
                          onClick={() => clearHalt.mutate({})} disabled={clearHalt.isPending}>Clear &amp; Resume</Button>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                  {[
                    { label: "Daily Loss Lockout",          value: `$${parseFloat(safety?.dailyLossAmount ?? "0").toFixed(0)} / $${config?.dailyLossLockoutAmount}`, warn: parseFloat(safety?.dailyLossAmount ?? "0") >= (config?.dailyLossLockoutAmount ?? 1350) },
                    { label: "Consecutive Loss Protection", value: `${safety?.consecutiveLosses ?? 0} / ${config?.consecutiveLossLimit}`, warn: (safety?.consecutiveLosses ?? 0) >= (config?.consecutiveLossLimit ?? 3) },
                    { label: "Execution Anomaly",           value: "Manual trigger only", warn: safety?.haltReason === "EXECUTION_ANOMALY" },
                    { label: "Webhook Failure",             value: "Auto-detected",       warn: safety?.haltReason === "WEBHOOK_FAILURE" },
                    { label: "Data Integrity Failure",      value: "Auto-detected",       warn: safety?.haltReason === "DATA_INTEGRITY_FAILURE" },
                    { label: "Drift Suspension",            value: "From WF dashboard",   warn: safety?.haltReason === "DRIFT_SUSPENSION" },
                  ].map(c => (
                    <div key={c.label} className={`flex items-center justify-between p-2 rounded border ${c.warn ? "bg-red-950/30 border-red-800/30" : "bg-slate-800 border-slate-700"}`}>
                      <span className="text-xs text-slate-300">{c.label}</span>
                      <span className={`text-xs font-mono ${c.warn ? "text-red-400" : "text-slate-400"}`}>{c.value}</span>
                    </div>
                  ))}
                </div>
                {user && !safety?.isHalted && (
                  <div className="pt-2 border-t border-slate-700">
                    <Button size="sm" variant="outline" className="border-red-600 text-red-400"
                      onClick={() => triggerHaltMut.mutate({ reason: "EXECUTION_ANOMALY", details: "Manual operator halt" })}
                      disabled={triggerHaltMut.isPending}>
                      <ShieldX className="w-3 h-3 mr-1" />Manual Halt
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Safety Event Log</CardTitle></CardHeader>
            <CardContent>
              {!safetyLog || safetyLog.length === 0 ? (
                <p className="text-slate-500 text-sm">No events recorded yet.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {safetyLog.map(e => (
                    <div key={e.id} className="flex items-start gap-2 text-xs py-1 border-b border-slate-800">
                      <span className="text-slate-500 font-mono shrink-0">{ts(e.timestampMs)}</span>
                      <Badge variant="outline" className="text-xs shrink-0 border-slate-600 text-slate-400">{e.eventType}</Badge>
                      <span className="text-slate-400 truncate">{e.details}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="criteria" className="space-y-4 mt-4">
          <h2 className="text-lg font-semibold text-white">Executive Success Criteria (Part 10)</h2>
          <p className="text-slate-400 text-sm">The Apex Evaluation is successful only if ALL 7 criteria are met.</p>
          <div className="space-y-3">
            {EXEC_CRITERIA.map(c => {
              const met = (c.id === 2 && latestRun?.run.overallStatus === "PASS" && latestRun.run.runType === "PRE_LIVE_GATE")
                       || (c.id === 5 && !safety?.isHalted);
              return (
                <div key={c.id} className={`flex items-start gap-3 p-4 rounded-lg border ${met ? "bg-emerald-950/30 border-emerald-800/30" : "bg-slate-900 border-slate-700"}`}>
                  <div className="mt-0.5">
                    {met ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Clock className="w-5 h-5 text-amber-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{c.id}. {c.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{c.desc}</p>
                  </div>
                  {met
                    ? <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">MET</Badge>
                    : <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">PENDING</Badge>}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <h2 className="text-lg font-semibold text-white">Certification Run History</h2>
          {!runHistory || runHistory.length === 0 ? (
            <Card className="bg-slate-900 border-slate-700">
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No runs recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {runHistory.map(run => (
                <div key={run.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedRunId === run.id ? "bg-slate-700 border-slate-500" : "bg-slate-900 border-slate-700 hover:bg-slate-800"}`}
                  onClick={() => setSelectedRunId(run.id === selectedRunId ? null : run.id)}>
                  <span className="text-xs text-slate-500 font-mono w-8">#{run.id}</span>
                  <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{run.runType}</Badge>
                  {statusBadge(run.overallStatus)}
                  <span className="text-xs text-slate-400">{ts(run.startedAt)}</span>
                  <span className="ml-auto text-xs text-slate-500">{run.stagesPassed}/15 passed · {run.stagesFailed} failed</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
