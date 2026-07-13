import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

function statusColor(status: string | null | undefined) {
  if (!status) return "secondary";
  if (status === "PASS" || status === "CERTIFIED") return "default";
  if (status === "FAIL" || status === "REJECTED") return "destructive";
  return "secondary";
}

function formatTs(ts: number | string | null | undefined) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "string" ? ts : ts);
  return d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour12: false });
}

export default function LiveLearningDashboard() {
  const { data: todaySession, refetch: refetchToday } = trpc.liveLearning.getTodaySession.useQuery();
  const { data: sessions } = trpc.liveLearning.getSessions.useQuery();
  const { data: behaviours } = trpc.liveLearning.getBehaviourLibrary.useQuery();
  const { data: recentCerts } = trpc.liveLearning.getRecentCertifications.useQuery({ limit: 20 });
  const { data: recentGaps } = trpc.liveLearning.getRecentGaps.useQuery({ limit: 10 });
  const { data: laws } = trpc.liveLearning.getMarketLaws.useQuery();

  const runCert = trpc.liveLearning.runSessionCertification.useMutation({
    onSuccess: (result) => {
      toast.success(`Session certification complete — ${result.certificationStatus}`);
      refetchToday();
    },
    onError: (err) => toast.error(`Certification failed: ${err.message}`),
  });

  // Compute certification progress from sessions
  const certifiedSessions = sessions?.filter((s) => s.certificationStatus === "CERTIFIED").length ?? 0;
  const totalSessions = sessions?.length ?? 0;
  const certProgress = `${certifiedSessions} / 5 sessions certified`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Learning Certification</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sprint 100A — Atlas must earn the right to return to strategy discovery
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runCert.mutate()}
          disabled={runCert.isPending}
        >
          {runCert.isPending ? "Running…" : "Run Session Cert"}
        </Button>
      </div>

      {/* Certification Gate Progress */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-amber-400 uppercase tracking-wider">
            Certification Gate — 5 Consecutive RTH Sessions Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">{certProgress}</div>
            <Badge variant={certifiedSessions >= 5 ? "default" : "secondary"}>
              {certifiedSessions >= 5 ? "CERTIFIED ✓" : "IN PROGRESS"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Each session must pass all 15 gates: candle count ≥ 72, latency ≤ 2000ms, gap rate ≤ 5%,
            duplicate rate = 0%, Behaviour Library updated, Market Laws validated, DARWIN Research Memory written,
            Portfolio Intelligence updated, and more.
          </p>
        </CardContent>
      </Card>

      {/* Today's Session */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Today's Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySession ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Date</span>
                  <span className="text-sm font-mono">{todaySession.sessionDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={statusColor(todaySession.certificationStatus)}>
                    {todaySession.certificationStatus ?? "PENDING"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Candles Received</span>
                  <span className="text-sm font-mono">{todaySession.receivedCandles ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Candles Expected</span>
                  <span className="text-sm font-mono">{todaySession.expectedCandles ?? 78}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Missing Candles</span>
                  <span className="text-sm font-mono">{todaySession.missingCandles ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Avg Latency</span>
                  <span className="text-sm font-mono">
                    {todaySession.avgLatencyMs ? `${todaySession.avgLatencyMs}ms` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gates Passed</span>
                  <span className="text-sm font-mono">
                    {todaySession.gateResults
                      ? (() => { try { const g = JSON.parse(todaySession.gateResults); const vals = Object.values(g); return `${vals.filter(Boolean).length} / ${vals.length}`; } catch { return "0 / 15"; } })()
                      : "0 / 15"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No session data for today. Waiting for live bars.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Session History */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Session History</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions && sessions.length > 0 ? (
              <div className="space-y-1">
                {sessions.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{s.sessionDate}</span>
                    <span className="font-mono">{s.receivedCandles ?? 0} bars</span>
                    <Badge variant={statusColor(s.certificationStatus)} className="text-xs py-0">
                      {s.certificationStatus ?? "PENDING"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No session history yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Market Laws */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Atlas Market Laws — Live Confidence Scores</CardTitle>
        </CardHeader>
        <CardContent>
          {laws && laws.length > 0 ? (
            <div className="space-y-2">
              {laws.map((law) => (
                <div key={law.id} className="flex items-start gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{law.lawId}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{law.title}</p>
                    <p className="text-xs text-muted-foreground">{law.statement}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">
                      {law.confidenceScore != null ? `${Number(law.confidenceScore).toFixed(1)}%` : "—"}
                    </div>
                    <Badge variant={statusColor(law.admissionStatus)} className="text-xs py-0">
                      {law.admissionStatus ?? "PROVISIONAL"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Market Laws not loaded.</p>
          )}
        </CardContent>
      </Card>

      {/* Behaviour Library */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Behaviour Library — Live Observations</CardTitle>
        </CardHeader>
        <CardContent>
          {behaviours && behaviours.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 pr-3 font-medium text-muted-foreground">Behaviour</th>
                    <th className="text-right py-1 pr-3 font-medium text-muted-foreground">Historical Rate</th>
                    <th className="text-right py-1 pr-3 font-medium text-muted-foreground">Live Rate</th>
                    <th className="text-right py-1 pr-3 font-medium text-muted-foreground">Observations</th>
                    <th className="text-right py-1 font-medium text-muted-foreground">Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {behaviours.map((b) => {
                    const contRate = Number(b.continuationRate ?? 0);
                    const total = b.totalObservations ?? 0;
                    return (
                      <tr key={b.id} className="border-b border-border/50">
                        <td className="py-1 pr-3 font-mono">{b.behaviourId}</td>
                        <td className="py-1 pr-3 text-right">{(contRate * 100).toFixed(1)}%</td>
                        <td className="py-1 pr-3 text-right">
                          {b.continuationCount} / {b.reversalCount}
                        </td>
                        <td className="py-1 pr-3 text-right">{total}</td>
                        <td className="py-1 text-right font-mono text-muted-foreground">
                          {b.lastObservedAt ? formatTs(b.lastObservedAt) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Behaviour Library loading…</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Candle Certifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Candle Certifications</CardTitle>
          </CardHeader>
          <CardContent>
            {recentCerts && recentCerts.length > 0 ? (
              <div className="space-y-1">
                {recentCerts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{formatTs(c.actualBarTime ?? c.expectedBarTime)}</span>
                    <span className="font-mono">{c.ingestionLatencyMs ?? 0}ms</span>
                    <Badge variant={statusColor(c.status)} className="text-xs py-0">
                      {c.status ?? "PENDING"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No certifications yet. Waiting for live bars.</p>
            )}
          </CardContent>
        </Card>

        {/* Gap Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gap Detection Log</CardTitle>
          </CardHeader>
          <CardContent>
            {recentGaps && recentGaps.length > 0 ? (
              <div className="space-y-1">
                {recentGaps.map((g) => (
                  <div key={g.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{formatTs(g.gapStartTime)}</span>
                    <span className="font-mono">{g.missingBars ?? 0} bars</span>
                    <Badge variant={g.recovered ? "default" : "destructive"} className="text-xs py-0">
                      {g.recovered ? "RECOVERED" : "OPEN"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm font-medium text-green-400">No gaps detected</p>
                <p className="text-xs text-muted-foreground mt-1">Feed continuity is clean</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* M-16 Fix Notice */}
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-red-400 uppercase tracking-wider">
            ⚠ Critical: M-16 Pine Script Alert Misconfiguration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The M-16 Pine Script is currently firing in clusters of 3 bars at irregular intervals, not on every 5-minute
            bar. The entire Monday July 13 RTH session produced zero candles in Atlas Memory. The Live Learning
            Certification cannot be earned until this is fixed.
          </p>
          <p className="text-sm font-medium mt-2">
            Required fix: In TradingView, edit the M-16 alert and set the condition to fire on <strong>every bar close</strong>,
            not on condition changes. The webhook payload must be sent unconditionally on every 5-minute close.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
