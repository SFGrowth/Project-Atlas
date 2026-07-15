/**
 * Arp1CommandCentre.tsx — ARP-1 Atlas Autonomous Research Program 1
 * Unified command centre for all 7 programs (A–G).
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity, Brain, BarChart3, GitBranch, TrendingUp,
  FileText, Bell, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Clock, Zap, Target, Shield
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    DEGRADED: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    OFFLINE: "bg-red-500/20 text-red-400 border-red-500/30",
    COMPLETE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    PENDING: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}>
      {status}
    </span>
  );
}

function ProgramIcon({ program }: { program: string }) {
  const icons: Record<string, React.ReactNode> = {
    A: <Activity className="w-4 h-4" />,
    B: <Brain className="w-4 h-4" />,
    C: <BarChart3 className="w-4 h-4" />,
    D: <GitBranch className="w-4 h-4" />,
    E: <TrendingUp className="w-4 h-4" />,
    F: <FileText className="w-4 h-4" />,
    G: <Bell className="w-4 h-4" />,
  };
  return <>{icons[program] ?? <Zap className="w-4 h-4" />}</>;
}

// ─── Program A: Live Operations ───────────────────────────────────────────────

function ProgramA() {
  const { data: ops, isLoading } = trpc.arp1.getLiveOpsStatus.useQuery(undefined, { refetchInterval: 30_000 });

  if (isLoading) return <div className="space-y-2">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  const allActive = ops?.every(p => p.status === "ACTIVE");
  const degraded = ops?.filter(p => p.status === "DEGRADED").length ?? 0;
  const offline = ops?.filter(p => p.status === "OFFLINE").length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
        {allActive ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        ) : offline > 0 ? (
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        )}
        <div>
          <p className="text-sm font-medium text-slate-200">
            {allActive ? "All systems operational" : `${degraded} degraded, ${offline} offline`}
          </p>
          <p className="text-xs text-slate-500">{ops?.length ?? 0} processes monitored</p>
        </div>
      </div>
      <div className="space-y-2">
        {ops?.map((proc) => (
          <div key={proc.processName} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${proc.status === "ACTIVE" ? "bg-emerald-400" : proc.status === "DEGRADED" ? "bg-amber-400" : "bg-red-400"}`} />
              <div>
                <p className="text-sm font-medium text-slate-200">{proc.processName}</p>
                <p className="text-xs text-slate-500">{proc.details}</p>
              </div>
            </div>
            <StatusBadge status={proc.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Program B: Continuous Discovery ─────────────────────────────────────────

function ProgramB() {
  const { data: stats } = trpc.arp1.getDiscoveryStats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: events, isLoading } = trpc.arp1.getDiscoveryEvents.useQuery({ limit: 20 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Behaviour Matches", value: stats?.behaviour_matches ?? 0, icon: <Brain className="w-4 h-4 text-violet-400" /> },
          { label: "Candidates Generated", value: stats?.candidates_generated ?? 0, icon: <Target className="w-4 h-4 text-blue-400" /> },
          { label: "ML Updates", value: stats?.ml_updates ?? 0, icon: <Zap className="w-4 h-4 text-amber-400" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-center">
            <div className="flex justify-center mb-1">{icon}</div>
            <p className="text-lg font-bold text-slate-100">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {isLoading ? (
          Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : events?.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No discovery events yet — engine fires on every webhook bar</div>
        ) : (
          events?.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between px-3 py-2 rounded bg-slate-800/20 border border-slate-700/20 text-xs">
              <span className="text-slate-300 font-medium">{ev.eventType}</span>
              <span className="text-slate-500">{ev.description ? String(ev.description).slice(0, 60) : ""}</span>
              <span className="text-slate-600">{new Date(ev.createdAt).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Program D: Model Lifecycle ───────────────────────────────────────────────

const STATES = ["DISCOVERY","RESEARCH","HISTORICAL_VALIDATION","OUT_OF_SAMPLE","WALK_FORWARD","PAPER_TRADING","PRODUCTION","REVIEW","RETIREMENT"] as const;
type ModelState = typeof STATES[number];

const STATE_COLORS: Record<ModelState, string> = {
  DISCOVERY: "bg-slate-500/20 text-slate-400",
  RESEARCH: "bg-blue-500/20 text-blue-400",
  HISTORICAL_VALIDATION: "bg-violet-500/20 text-violet-400",
  OUT_OF_SAMPLE: "bg-purple-500/20 text-purple-400",
  WALK_FORWARD: "bg-amber-500/20 text-amber-400",
  PAPER_TRADING: "bg-cyan-500/20 text-cyan-400",
  PRODUCTION: "bg-emerald-500/20 text-emerald-400",
  REVIEW: "bg-orange-500/20 text-orange-400",
  RETIREMENT: "bg-red-500/20 text-red-400",
};

function ProgramD() {
  const utils = trpc.useUtils();
  const { data: models, isLoading } = trpc.arp1.getAllModels.useQuery();
  const { data: stats } = trpc.arp1.getLifecycleStats.useQuery();
  const [transitionTarget, setTransitionTarget] = useState<Record<string, ModelState>>({});

  const transition = trpc.arp1.transitionModel.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`${vars.modelId} → ${vars.newState}`);
      utils.arp1.getAllModels.invalidate();
      utils.arp1.getLifecycleStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total", value: stats?.total_models ?? 0 },
          { label: "Production", value: stats?.in_production ?? 0 },
          { label: "Walk-Fwd", value: stats?.walk_forward ?? 0 },
          { label: "Research", value: stats?.in_research ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="p-2 rounded bg-slate-800/30 border border-slate-700/30 text-center">
            <p className="text-base font-bold text-slate-100">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : (
          models?.map((m) => (
            <div key={m.modelId} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <div>
                <p className="text-sm font-medium text-slate-200">{m.modelId}</p>
                <p className="text-xs text-slate-500">{m.modelName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATE_COLORS[m.currentState as ModelState] ?? "bg-slate-500/20 text-slate-400"}`}>
                  {m.currentState}
                </span>
                <Select
                  value={transitionTarget[m.modelId] ?? ""}
                  onValueChange={(v) => setTransitionTarget(prev => ({ ...prev, [m.modelId]: v as ModelState }))}
                >
                  <SelectTrigger className="h-7 w-36 text-xs bg-slate-800 border-slate-600">
                    <SelectValue placeholder="Transition…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.filter(s => s !== m.currentState).map(s => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!transitionTarget[m.modelId] || transition.isPending}
                  onClick={() => {
                    const ns = transitionTarget[m.modelId];
                    if (ns) transition.mutate({ modelId: m.modelId, newState: ns });
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Program E: Portfolio Intelligence ───────────────────────────────────────

function ProgramE() {
  const { data: pi, isLoading } = trpc.arp1.getLatestPortfolioIntelligence.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: history } = trpc.arp1.getPortfolioIntelligenceHistory.useQuery({ limit: 10 });

  if (isLoading) return <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  if (!pi) return (
    <div className="text-center py-12 text-slate-500 text-sm">
      <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
      Portfolio intelligence updates at PM_CLOSE each session
    </div>
  );

  const portfolioPf = pi.portfolioPf ? parseFloat(String(pi.portfolioPf)).toFixed(2) : "—";
  const portfolioWr = pi.portfolioWr ? (parseFloat(String(pi.portfolioWr)) * 100).toFixed(1) + "%" : "—";
  const maxDd = pi.portfolioMaxDd ? `$${parseFloat(String(pi.portfolioMaxDd)).toFixed(0)}` : "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Portfolio PF", value: portfolioPf, color: "text-emerald-400" },
          { label: "Win Rate", value: portfolioWr, color: "text-blue-400" },
          { label: "Max Drawdown", value: maxDd, color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      {pi.regimeCoverage && (
        <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <p className="text-xs text-slate-500 mb-1">Regime Coverage</p>
          <p className="text-sm text-slate-300">{String(pi.regimeCoverage)}</p>
        </div>
      )}
      {history && history.length > 1 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Recent History</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.slice(1).map((h) => (
              <div key={h.id} className="flex justify-between text-xs px-2 py-1 rounded bg-slate-800/20">
                <span className="text-slate-500">{new Date(h.sessionDate).toLocaleDateString()}</span>
                <span className="text-slate-400">PF {h.portfolioPf ? parseFloat(String(h.portfolioPf)).toFixed(2) : "—"}</span>
                <span className="text-slate-400">WR {h.portfolioWr ? (parseFloat(String(h.portfolioWr)) * 100).toFixed(1) + "%" : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Program F: Weekly Review ─────────────────────────────────────────────────

function ProgramF() {
  const { data: review, isLoading } = trpc.arp1.getLatestWeeklyReview.useQuery();
  const { data: history } = trpc.arp1.getWeeklyReviewHistory.useQuery({ limit: 8 });

  if (isLoading) return <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {!review ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Weekly review runs every Sunday at 18:00 ET
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">Week of {String(review.weekStartDate)}</p>
            <StatusBadge status={review.status} />
          </div>
          {review.whatDidAtlasLearn && (
            <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <p className="text-xs text-slate-500 mb-1">What Did Atlas Learn</p>
              <p className="text-sm text-slate-300">{review.whatDidAtlasLearn}</p>
            </div>
          )}
          {review.whatImproved && (
            <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-700/30">
              <p className="text-xs text-emerald-500 mb-1">Improved</p>
              <p className="text-sm text-slate-300">{review.whatImproved}</p>
            </div>
          )}
          {review.fullReport && (
            <details className="group">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">Full Report ▸</summary>
              <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-48 overflow-y-auto font-mono">
                {review.fullReport}
              </pre>
            </details>
          )}
        </div>
      )}
      {history && history.length > 1 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Review History</p>
          <div className="space-y-1">
            {history.slice(1).map((r) => (
              <div key={r.id} className="flex justify-between text-xs px-2 py-1 rounded bg-slate-800/20">
                <span className="text-slate-500">Week of {String(r.weekStartDate)}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Program G: Daily Brief ───────────────────────────────────────────────────

function ProgramG() {
  const { data: brief, isLoading } = trpc.arp1.getLatestDailyBrief.useQuery(undefined, { refetchInterval: 300_000 });
  const { data: history } = trpc.arp1.getDailyBriefHistory.useQuery({ limit: 7 });

  if (isLoading) return <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {!brief ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Daily brief runs every weekday at 08:00 ET
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">{String(brief.briefDate)}</p>
            <div className="flex items-center gap-2">
              {brief.operatingNormally ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Nominal</span>
              ) : (
                <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Alert</span>
              )}
              <StatusBadge status={brief.status} />
            </div>
          </div>
          {brief.criticalAlerts && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/30">
              <p className="text-xs text-red-400 mb-1">Critical Alerts</p>
              <p className="text-sm text-slate-300">{brief.criticalAlerts}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: "Walk-Forward", value: brief.walkForwardStatus },
              { label: "Paper Trading", value: brief.paperTradingStatus },
              { label: "Production", value: brief.productionStatus },
              { label: "Active Specialists", value: brief.activeSpecialists },
            ].filter(r => r.value).map(({ label, value }) => (
              <div key={label} className="p-2 rounded bg-slate-800/30 border border-slate-700/30">
                <p className="text-slate-500">{label}</p>
                <p className="text-slate-300">{value}</p>
              </div>
            ))}
          </div>
          {brief.fullBrief && (
            <details className="group">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">Full Brief ▸</summary>
              <pre className="mt-2 text-xs text-slate-400 whitespace-pre-wrap bg-slate-900/50 rounded p-3 max-h-48 overflow-y-auto font-mono">
                {brief.fullBrief}
              </pre>
            </details>
          )}
        </div>
      )}
      {history && history.length > 1 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Brief History</p>
          <div className="space-y-1">
            {history.slice(1).map((b) => (
              <div key={b.id} className="flex justify-between text-xs px-2 py-1 rounded bg-slate-800/20">
                <span className="text-slate-500">{String(b.briefDate)}</span>
                <span className={b.operatingNormally ? "text-emerald-400" : "text-red-400"}>
                  {b.operatingNormally ? "Nominal" : "Alert"}
                </span>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PROGRAMS = [
  { id: "A", label: "Live Ops", description: "Operations continuity" },
  { id: "B", label: "Discovery", description: "Continuous research" },
  { id: "C", label: "Coverage", description: "Portfolio coverage" },
  { id: "D", label: "Lifecycle", description: "Model state machine" },
  { id: "E", label: "Intelligence", description: "Portfolio analytics" },
  { id: "F", label: "Review", description: "Weekly self-review" },
  { id: "G", label: "Brief", description: "Daily owner brief" },
];

export default function Arp1CommandCentre() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: ops } = trpc.arp1.getLiveOpsStatus.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: lcStats } = trpc.arp1.getLifecycleStats.useQuery();
  const { data: discoveryStats } = trpc.arp1.getDiscoveryStats.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: latestBrief } = trpc.arp1.getLatestDailyBrief.useQuery();

  const allActive = ops?.every(p => p.status === "ACTIVE") ?? false;
  const degradedCount = ops?.filter(p => p.status !== "ACTIVE").length ?? 0;

  function handleRefresh() {
    utils.arp1.getLiveOpsStatus.invalidate();
    utils.arp1.getDiscoveryStats.invalidate();
    utils.arp1.getLatestPortfolioIntelligence.invalidate();
    utils.arp1.getLatestDailyBrief.invalidate();
    toast.success("ARP-1 data refreshed");
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Brain className="w-6 h-6 text-violet-400" />
            ARP-1 Command Centre
          </h1>
          <p className="text-sm text-slate-500 mt-1">Atlas Autonomous Research Program — 7 continuous programs running 24/5</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${
            allActive
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/10 text-amber-400 border-amber-500/30"
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${allActive ? "bg-emerald-400" : "bg-amber-400"}`} />
            {allActive ? "All Systems Nominal" : `${degradedCount} System${degradedCount !== 1 ? "s" : ""} Degraded`}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Program Status Grid */}
      <div className="grid grid-cols-7 gap-2">
        {PROGRAMS.map((prog) => {
          const opsEntry = ops?.find(p => p.processName.toLowerCase().includes(prog.label.toLowerCase()));
          const status = opsEntry?.status ?? "ACTIVE";
          return (
            <button
              key={prog.id}
              onClick={() => setActiveTab(prog.id.toLowerCase())}
              className={`p-3 rounded-lg border text-center transition-all hover:border-violet-500/50 ${
                activeTab === prog.id.toLowerCase()
                  ? "bg-violet-500/10 border-violet-500/40"
                  : "bg-slate-800/30 border-slate-700/30"
              }`}
            >
              <div className="flex justify-center mb-1 text-slate-400">
                <ProgramIcon program={prog.id} />
              </div>
              <p className="text-xs font-bold text-slate-200">{prog.id}</p>
              <p className="text-xs text-slate-500">{prog.label}</p>
              <div className={`mt-1.5 w-2 h-2 rounded-full mx-auto ${
                status === "ACTIVE" ? "bg-emerald-400" : status === "DEGRADED" ? "bg-amber-400" : "bg-red-400"
              }`} />
            </button>
          );
        })}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Models Tracked",
            value: lcStats?.total_models ?? "—",
            sub: `${lcStats?.in_production ?? 0} production`,
            icon: <GitBranch className="w-4 h-4 text-emerald-400" />,
          },
          {
            label: "Discovery Events",
            value: discoveryStats?.behaviour_matches ?? "—",
            sub: `${discoveryStats?.candidates_generated ?? 0} candidates`,
            icon: <Brain className="w-4 h-4 text-violet-400" />,
          },
          {
            label: "Processes Active",
            value: `${ops?.filter(p => p.status === "ACTIVE").length ?? 0}/${ops?.length ?? 8}`,
            sub: allActive ? "All nominal" : `${degradedCount} need attention`,
            icon: <Activity className="w-4 h-4 text-blue-400" />,
          },
          {
            label: "Latest Brief",
            value: latestBrief ? String(latestBrief.briefDate) : "None",
            sub: latestBrief?.operatingNormally ? "Nominal" : "Alert",
            icon: <Bell className="w-4 h-4 text-amber-400" />,
          },
        ].map(({ label, value, sub, icon }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500">{label}</p>
                {icon}
              </div>
              <p className="text-xl font-bold text-slate-100">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Program Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50 border border-slate-700/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          {PROGRAMS.map(p => (
            <TabsTrigger key={p.id} value={p.id.toLowerCase()} className="text-xs">
              <span className="flex items-center gap-1">
                <ProgramIcon program={p.id} />
                {p.id}: {p.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Program A: Live Operations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProgramA />
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-amber-400" />
                  Program D: Model Lifecycle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProgramD />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="a" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Program A — Live Operations Continuity
              </CardTitle>
              <p className="text-xs text-slate-500">Real-time monitoring of all Atlas OS processes</p>
            </CardHeader>
            <CardContent><ProgramA /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="b" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-5 h-5 text-violet-400" />
                Program B — Continuous Discovery Engine
              </CardTitle>
              <p className="text-xs text-slate-500">Fires on every 5-min MNQ bar — behaviour matching, candidate generation, ML updates</p>
            </CardHeader>
            <CardContent><ProgramB /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="c" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Program C — Portfolio Coverage Tracker
              </CardTitle>
              <p className="text-xs text-slate-500">Regime coverage, session coverage, model diversity analysis</p>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500 text-sm">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Coverage analysis updates at PM_CLOSE each session
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="d" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-amber-400" />
                Program D — Model Lifecycle State Machine
              </CardTitle>
              <p className="text-xs text-slate-500">Auto-promotion rules active — transition models through the research pipeline</p>
            </CardHeader>
            <CardContent><ProgramD /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="e" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                Program E — Portfolio Intelligence Engine
              </CardTitle>
              <p className="text-xs text-slate-500">PF, WR, DD, correlation, diversification score, regime coverage — updated at PM_CLOSE</p>
            </CardHeader>
            <CardContent><ProgramE /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="f" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Program F — Weekly Self-Review
              </CardTitle>
              <p className="text-xs text-slate-500">Auto-generated every Sunday at 18:00 ET — what Atlas learned, what improved, what deteriorated</p>
            </CardHeader>
            <CardContent><ProgramF /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="g" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                Program G — Daily Owner Brief
              </CardTitle>
              <p className="text-xs text-slate-500">Auto-generated every weekday at 08:00 ET — operational status, portfolio snapshot, critical alerts</p>
            </CardHeader>
            <CardContent><ProgramG /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
