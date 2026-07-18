/**
 * Atlas Behaviour Engine Dashboard
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Shadow-mode monitoring panel for the 12 canonical market behaviours.
 * Shows active instances, confidence levels, lifecycle state, performance stats,
 * and provides a replay trigger for the most recent trading week.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BehaviourInstance {
  instanceId: string;
  behaviourId: string;
  behaviourName?: string;
  lifecycleState: string;
  confidence: number;
  probability: number;
  regime?: string;
  session?: string;
  firstDetectedAt?: number;
  lastUpdatedAt?: number;
  evidenceCount?: number;
}

interface PerformanceStat {
  behaviour_id: string;
  behaviour_name?: string;
  total_instances?: number;
  confirmed_instances?: number;
  win_rate?: string | number;
  avg_confidence?: string | number;
  avg_r_multiple?: string | number;
}

interface BehaviourDefinition {
  behaviour_id: string;
  name: string;
  category: string;
  description?: string;
  primary_strategy?: string;
  min_sample_size?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LIFECYCLE_COLOURS: Record<string, string> = {
  DETECTING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ACTIVE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CONFIRMED: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  UPDATING: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  EXPIRING: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  EXPIRED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
};

const CATEGORY_COLOURS: Record<string, string> = {
  TREND: "text-emerald-400",
  REVERSAL: "text-red-400",
  BREAKOUT: "text-blue-400",
  COMPRESSION: "text-purple-400",
  SESSION: "text-yellow-400",
  VOLATILITY: "text-orange-400",
};

function confidenceBar(value: number) {
  const pct = Math.round(value);
  const colour = pct >= 75 ? "bg-emerald-500" : pct >= 55 ? "bg-yellow-500" : "bg-red-500";
  return { pct, colour };
}

function formatTs(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InstanceCard({ inst }: { inst: BehaviourInstance }) {
  const { pct, colour } = confidenceBar(inst.confidence);
  const stateClass = LIFECYCLE_COLOURS[inst.lifecycleState] ?? "bg-gray-500/20 text-gray-400";

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3 hover:bg-white/8 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white font-['JetBrains_Mono']">
            {inst.behaviourName ?? inst.behaviourId}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 font-['JetBrains_Mono']">
            {inst.instanceId.slice(0, 16)}…
          </p>
        </div>
        <Badge variant="outline" className={`text-xs shrink-0 ${stateClass}`}>
          {inst.lifecycleState}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>Confidence</span>
          <span className="font-['JetBrains_Mono']">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full ${colour} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-400">
        {inst.regime && (
          <span>Regime: <span className="text-white">{inst.regime}</span></span>
        )}
        {inst.session && (
          <span>Session: <span className="text-white">{inst.session}</span></span>
        )}
        {inst.firstDetectedAt && (
          <span>Detected: <span className="text-white">{formatTs(inst.firstDetectedAt)}</span></span>
        )}
      </div>
    </div>
  );
}

function StatRow({ stat }: { stat: PerformanceStat }) {
  const winRate = parseFloat(String(stat.win_rate ?? "0"));
  const avgConf = parseFloat(String(stat.avg_confidence ?? "0"));
  const avgR = parseFloat(String(stat.avg_r_multiple ?? "0"));

  return (
    <div className="grid grid-cols-6 gap-2 py-2 text-xs border-b border-white/5 last:border-0">
      <div className="col-span-2 font-['JetBrains_Mono'] text-white truncate">
        {stat.behaviour_name ?? stat.behaviour_id}
      </div>
      <div className="text-center text-gray-300 font-['JetBrains_Mono']">
        {stat.total_instances ?? 0}
      </div>
      <div className="text-center text-gray-300 font-['JetBrains_Mono']">
        {stat.confirmed_instances ?? 0}
      </div>
      <div className={`text-center font-['JetBrains_Mono'] ${winRate >= 55 ? "text-emerald-400" : winRate >= 45 ? "text-yellow-400" : "text-red-400"}`}>
        {winRate > 0 ? `${winRate.toFixed(1)}%` : "—"}
      </div>
      <div className={`text-center font-['JetBrains_Mono'] ${avgR >= 1 ? "text-emerald-400" : avgR >= 0 ? "text-yellow-400" : "text-red-400"}`}>
        {avgR !== 0 ? `${avgR.toFixed(2)}R` : "—"}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BehaviourEnginePage() {
  const [replayBars, setReplayBars] = useState(288); // ~1 trading week of 5-min bars

  const { data: activeInstances, isLoading: loadingActive, refetch: refetchActive } =
    trpc.behaviourEngine.getActiveInstances.useQuery({ symbol: "MNQ1!" }, { refetchInterval: 30_000 });

  const { data: recentInstances, isLoading: loadingRecent, refetch: refetchRecent } =
    trpc.behaviourEngine.getRecentInstances.useQuery({ limit: 50 }, { refetchInterval: 60_000 });

  const { data: perfStats, isLoading: loadingStats } =
    trpc.behaviourEngine.getPerformanceStats.useQuery(undefined, { refetchInterval: 120_000 });

  const { data: definitions, isLoading: loadingDefs } =
    trpc.behaviourEngine.getDefinitions.useQuery();

  const replayMutation = trpc.behaviourEngine.triggerReplay.useMutation({
    onSuccess: (result) => {
      toast.success(`Replay complete — ${(result as { processed: number }).processed} bars processed`);
      refetchActive();
      refetchRecent();
    },
    onError: (err) => {
      toast.error(`Replay failed: ${err.message}`);
    },
  });

  const activeList = (activeInstances ?? []) as BehaviourInstance[];
  const recentList = (recentInstances ?? []) as BehaviourInstance[];
  const statsList = (perfStats ?? []) as PerformanceStat[];
  const defsList = (definitions ?? []) as BehaviourDefinition[];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-['JetBrains_Mono']">
            BEHAVIOUR ENGINE
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Shadow mode · 12 canonical market behaviours · ORION-DIRECTIVE-001
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
            SHADOW MODE
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="text-xs font-['JetBrains_Mono'] border-white/20 hover:bg-white/10"
            onClick={() => { refetchActive(); refetchRecent(); }}
          >
            REFRESH
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 font-['JetBrains_Mono']">ACTIVE INSTANCES</p>
            <p className="text-3xl font-bold text-white font-['JetBrains_Mono'] mt-1">
              {loadingActive ? <Skeleton className="h-8 w-12" /> : activeList.length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 font-['JetBrains_Mono']">RECENT (50)</p>
            <p className="text-3xl font-bold text-white font-['JetBrains_Mono'] mt-1">
              {loadingRecent ? <Skeleton className="h-8 w-12" /> : recentList.length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 font-['JetBrains_Mono']">BEHAVIOURS DEFINED</p>
            <p className="text-3xl font-bold text-white font-['JetBrains_Mono'] mt-1">
              {loadingDefs ? <Skeleton className="h-8 w-12" /> : defsList.length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-gray-400 font-['JetBrains_Mono']">CONFIRMED INSTANCES</p>
            <p className="text-3xl font-bold text-emerald-400 font-['JetBrains_Mono'] mt-1">
              {loadingRecent ? <Skeleton className="h-8 w-12" /> :
                recentList.filter((i) => i.lifecycleState === "CONFIRMED").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="active" className="text-xs font-['JetBrains_Mono']">ACTIVE</TabsTrigger>
          <TabsTrigger value="recent" className="text-xs font-['JetBrains_Mono']">RECENT</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs font-['JetBrains_Mono']">PERFORMANCE</TabsTrigger>
          <TabsTrigger value="library" className="text-xs font-['JetBrains_Mono']">BEHAVIOUR LIBRARY</TabsTrigger>
          <TabsTrigger value="replay" className="text-xs font-['JetBrains_Mono']">REPLAY</TabsTrigger>
        </TabsList>

        {/* Active Instances */}
        <TabsContent value="active">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-['JetBrains_Mono'] text-gray-300">
                LIVE ACTIVE INSTANCES — MNQ1!
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActive ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : activeList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-['JetBrains_Mono'] text-sm">
                  No active behaviour instances detected.
                  <br />
                  <span className="text-xs text-gray-600 mt-2 block">
                    The engine runs in shadow mode — instances appear after the next webhook bar arrives.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeList.map((inst) => (
                    <InstanceCard key={inst.instanceId} inst={inst} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Instances */}
        <TabsContent value="recent">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-['JetBrains_Mono'] text-gray-300">
                RECENT INSTANCES (LAST 50)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRecent ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : recentList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-['JetBrains_Mono'] text-sm">
                  No instances recorded yet. Run a replay to seed the registry.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentList.map((inst) => (
                    <InstanceCard key={inst.instanceId} inst={inst} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Stats */}
        <TabsContent value="performance">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-['JetBrains_Mono'] text-gray-300">
                BEHAVIOUR PERFORMANCE STATISTICS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-6 gap-2 py-2 text-xs text-gray-500 font-['JetBrains_Mono'] border-b border-white/10 mb-1">
                    <div className="col-span-2">BEHAVIOUR</div>
                    <div className="text-center">TOTAL</div>
                    <div className="text-center">CONFIRMED</div>
                    <div className="text-center">WIN RATE</div>
                    <div className="text-center">AVG R</div>
                  </div>
                  {statsList.length === 0 ? (
                    <p className="text-center py-8 text-gray-500 text-sm font-['JetBrains_Mono']">
                      No performance data yet. Run a replay to populate stats.
                    </p>
                  ) : (
                    statsList.map((stat) => (
                      <StatRow key={stat.behaviour_id} stat={stat} />
                    ))
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Behaviour Library */}
        <TabsContent value="library">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-['JetBrains_Mono'] text-gray-300">
                CANONICAL BEHAVIOUR LIBRARY — 12 BEHAVIOURS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDefs ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {defsList.map((def) => (
                    <div
                      key={def.behaviour_id}
                      className="flex items-start gap-4 p-3 rounded-lg border border-white/5 bg-white/3 hover:bg-white/6 transition-colors"
                    >
                      <div className="shrink-0 w-24">
                        <span className={`text-xs font-bold font-['JetBrains_Mono'] ${CATEGORY_COLOURS[def.category] ?? "text-gray-400"}`}>
                          {def.category}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white font-['JetBrains_Mono']">
                          {def.name}
                        </p>
                        {def.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{def.description}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500 font-['JetBrains_Mono']">{def.behaviour_id}</p>
                        {def.primary_strategy && (
                          <Badge variant="outline" className="text-xs mt-1 border-white/10 text-gray-400">
                            {def.primary_strategy}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Replay Tool */}
        <TabsContent value="replay">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-['JetBrains_Mono'] text-gray-300">
                BEHAVIOUR ENGINE REPLAY TOOL
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-300 font-['JetBrains_Mono']">
                <p className="font-bold mb-1">SHADOW MODE — REPLAY ONLY</p>
                <p className="text-xs text-yellow-400/70">
                  Replays historical bars from atlas_memory through the Behaviour Engine classifiers.
                  Results are written to the Behaviour Registry. No execution pipeline is affected.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-gray-400 font-['JetBrains_Mono']">
                  LOOKBACK BARS (5-MIN)
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={50}
                    max={500}
                    step={50}
                    value={replayBars}
                    onChange={(e) => setReplayBars(Number(e.target.value))}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-white font-['JetBrains_Mono'] text-sm w-24 text-right">
                    {replayBars} bars
                    <span className="block text-xs text-gray-500">
                      (~{Math.round(replayBars / 78)} trading days)
                    </span>
                  </span>
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400 font-['JetBrains_Mono']">
                  <p>Source: <span className="text-white">atlas_memory</span></p>
                  <p>Symbol: <span className="text-white">MNQ1!</span></p>
                  <p>Classifiers: <span className="text-white">12 active</span></p>
                </div>
                <Button
                  onClick={() => replayMutation.mutate({ lookbackBars: replayBars })}
                  disabled={replayMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-['JetBrains_Mono'] text-xs"
                >
                  {replayMutation.isPending ? "REPLAYING…" : `RUN REPLAY (${replayBars} BARS)`}
                </Button>
              </div>

              {replayMutation.isSuccess && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400 font-['JetBrains_Mono']">
                  ✓ Replay complete — {(replayMutation.data as { processed: number }).processed} bars processed.
                  Switch to the Active or Recent tab to view results.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
