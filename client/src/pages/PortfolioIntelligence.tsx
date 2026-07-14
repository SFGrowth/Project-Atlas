import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Shield,
  Activity,
  RefreshCw,
  DollarSign,
  Percent,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netPnlDollar: number;
  netPnlR: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  maxDrawdown: number;
  avgHoldTimeMin: number;
  longTrades: number;
  shortTrades: number;
  currentWinStreak: number;
  currentLoseStreak: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODELS = ["A1", "A3", "B1", "SB1", "ORB-1"] as const;
const RISK_PROFILES = [
  { label: "Prop $450", value: 450 },
  { label: "Live $1,650", value: 1650 },
  { label: "Custom", value: 0 },
];

function pnlColor(v: number) {
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-slate-400";
}

function pnlBg(v: number) {
  if (v > 0) return "bg-emerald-500/10 border-emerald-500/20";
  if (v < 0) return "bg-red-500/10 border-red-500/20";
  return "bg-slate-500/10 border-slate-500/20";
}

function fmt$(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtR(v: number) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}R`;
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, colorClass }: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  colorClass?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
        <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${colorClass ?? "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Period Stats Row ─────────────────────────────────────────────────────────

function PeriodRow({ label, stats, risk }: { label: string; stats: ModelStats; risk: number }) {
  return (
    <div className={`grid grid-cols-6 gap-2 p-3 rounded-lg border ${pnlBg(stats.netPnlDollar)} text-sm`}>
      <div className="font-medium text-slate-300">{label}</div>
      <div className="text-center text-slate-400">{stats.trades}</div>
      <div className="text-center text-slate-300">{fmtPct(stats.winRate)}</div>
      <div className={`text-center font-mono font-semibold ${pnlColor(stats.netPnlDollar)}`}>{fmt$(stats.netPnlDollar)}</div>
      <div className={`text-center font-mono ${pnlColor(stats.netPnlR)}`}>{fmtR(stats.netPnlR)}</div>
      <div className="text-center text-slate-400">{stats.profitFactor === 999 ? "∞" : stats.profitFactor.toFixed(2)}</div>
    </div>
  );
}

// ─── Model Detail Panel ───────────────────────────────────────────────────────

function ModelDetail({ model, stats, risk }: { model: string; stats: ModelStats; risk: number }) {
  const hasData = stats.trades > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <span className="text-blue-400 font-bold text-sm">{model}</span>
          </div>
          <div>
            <div className="text-slate-100 font-semibold">{model} Strategy</div>
            <div className="text-xs text-slate-500">PAPER provenance · MNQ1!</div>
          </div>
        </div>
        <Badge variant="outline" className={hasData ? "border-emerald-500/30 text-emerald-400" : "border-slate-600 text-slate-500"}>
          {hasData ? `${stats.trades} trades` : "No trades"}
        </Badge>
      </div>

      {!hasData ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          No PAPER provenance trades recorded for {model} yet.
        </div>
      ) : (
        <>
          {/* P&L Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Net P&L" value={fmt$(stats.netPnlDollar)} sub={fmtR(stats.netPnlR)} colorClass={pnlColor(stats.netPnlDollar)} icon={DollarSign} />
            <StatCard label="Win Rate" value={fmtPct(stats.winRate)} sub={`${stats.wins}W / ${stats.losses}L`} colorClass={stats.winRate >= 50 ? "text-emerald-400" : "text-red-400"} icon={Percent} />
            <StatCard label="Profit Factor" value={stats.profitFactor === 999 ? "∞" : stats.profitFactor.toFixed(2)} sub={`GP: ${fmt$(stats.grossProfit)}`} colorClass={stats.profitFactor >= 1.5 ? "text-emerald-400" : stats.profitFactor >= 1 ? "text-yellow-400" : "text-red-400"} icon={BarChart3} />
            <StatCard label="Max Drawdown" value={fmt$(stats.maxDrawdown)} sub="peak-to-trough" colorClass="text-red-400" icon={TrendingDown} />
          </div>

          {/* Trade Quality */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Avg Win" value={fmt$(stats.avgWin)} colorClass="text-emerald-400" icon={TrendingUp} />
            <StatCard label="Avg Loss" value={fmt$(stats.avgLoss)} colorClass="text-red-400" icon={TrendingDown} />
            <StatCard label="Largest Win" value={fmt$(stats.largestWin)} colorClass="text-emerald-400" icon={Target} />
            <StatCard label="Largest Loss" value={fmt$(stats.largestLoss)} colorClass="text-red-400" icon={Shield} />
          </div>

          {/* Execution */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Avg Hold Time" value={`${stats.avgHoldTimeMin.toFixed(0)}m`} icon={Clock} />
            <StatCard label="Long / Short" value={`${stats.longTrades} / ${stats.shortTrades}`} icon={Activity} />
            <StatCard label="Win Streak" value={`${stats.currentWinStreak}`} colorClass={stats.currentWinStreak > 0 ? "text-emerald-400" : "text-slate-400"} />
            <StatCard label="Lose Streak" value={`${stats.currentLoseStreak}`} colorClass={stats.currentLoseStreak > 0 ? "text-red-400" : "text-slate-400"} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PortfolioIntelligence() {
  const [riskProfile, setRiskProfile] = useState(450);
  const [customRisk, setCustomRisk] = useState(450);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [isCustom, setIsCustom] = useState(false);

  const effectiveRisk = isCustom ? customRisk : riskProfile;

  const { data, isLoading, refetch, dataUpdatedAt } = trpc.executive.portfolioIntelligence.useQuery(
    { strategyId: selectedModel, riskPerTrade: effectiveRisk },
    { refetchInterval: 30000 }
  );

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Portfolio Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            PAPER provenance only · BACKTEST/TEST/CONTAMINATED excluded · Updated {lastUpdated}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Risk Profile Selector */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-400 font-medium uppercase tracking-wide">Risk Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {RISK_PROFILES.map(p => (
              <button
                key={p.label}
                onClick={() => {
                  if (p.value === 0) {
                    setIsCustom(true);
                  } else {
                    setIsCustom(false);
                    setRiskProfile(p.value);
                  }
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  (p.value === 0 ? isCustom : !isCustom && riskProfile === p.value)
                    ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                    : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
            {isCustom && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-sm">$</span>
                <input
                  type="number"
                  value={customRisk}
                  onChange={e => setCustomRisk(Number(e.target.value))}
                  className="w-24 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 text-sm font-mono"
                  min={1}
                  max={10000}
                />
                <span className="text-slate-500 text-xs">per trade</span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-2">
            Risk profile scales R-multiple calculations. P&L in dollars reflects actual recorded trade results.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 bg-slate-800/50" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500">No portfolio data available.</div>
      ) : (
        <>
          {/* Portfolio Overview */}
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Portfolio Overview
                <Badge variant="outline" className="ml-auto border-slate-600 text-slate-500 text-xs">
                  {data.totalTradesInDB} total trades
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-6 gap-2 text-xs text-slate-500 uppercase tracking-wide px-3 pb-1">
                <div>Period</div>
                <div className="text-center">Trades</div>
                <div className="text-center">Win Rate</div>
                <div className="text-center">Net P&L</div>
                <div className="text-center">Net R</div>
                <div className="text-center">PF</div>
              </div>
              <PeriodRow label="24h" stats={data.last24h} risk={effectiveRisk} />
              <PeriodRow label="7d" stats={data.last7d} risk={effectiveRisk} />
              <PeriodRow label="30d" stats={data.last30d} risk={effectiveRisk} />
              <PeriodRow label="All-time" stats={data.allTime} risk={effectiveRisk} />
            </CardContent>
          </Card>

          {/* Per-Model Detail */}
          <Card className="bg-slate-900/50 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Per-Strategy Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="A1" onValueChange={v => setSelectedModel(v === "ALL" ? undefined : v)}>
                <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-4">
                  <TabsTrigger value="A1" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">A1</TabsTrigger>
                  <TabsTrigger value="A3" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">A3</TabsTrigger>
                  <TabsTrigger value="B1" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">B1</TabsTrigger>
                  <TabsTrigger value="SB1" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">SB1</TabsTrigger>
                  <TabsTrigger value="ORB-1" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">ORB-1</TabsTrigger>
                </TabsList>

                {MODELS.map(model => (
                  <TabsContent key={model} value={model}>
                    <ModelDetail
                      model={model}
                      stats={data.perModel[model] ?? {
                        trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
                        netPnlDollar: 0, netPnlR: 0, grossProfit: 0, grossLoss: 0,
                        avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
                        maxDrawdown: 0, avgHoldTimeMin: 0, longTrades: 0, shortTrades: 0,
                        currentWinStreak: 0, currentLoseStreak: 0,
                      }}
                      risk={effectiveRisk}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Provenance Note */}
          <div className="text-xs text-slate-600 text-center">
            {data.provenanceNote} · Risk profile: ${effectiveRisk}/trade
          </div>
        </>
      )}
    </div>
  );
}
