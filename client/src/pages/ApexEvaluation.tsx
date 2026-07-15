import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtPnl(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function statusColor(status: string): string {
  switch (status) {
    case "PROMOTION_ELIGIBLE": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "IN_PROGRESS": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "AWAITING_TRADES": return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    case "FAILED": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

function divergenceColor(flag: string): string {
  switch (flag) {
    case "NONE": return "text-zinc-500";
    case "EXPECTED_SLIPPAGE": return "text-blue-400";
    case "ELEVATED_SLIPPAGE": return "text-amber-400";
    case "OUTCOME_DIVERGENCE": return "text-red-400";
    case "EXECUTION_ERROR": return "text-red-500 font-bold";
    default: return "text-zinc-400";
  }
}

// ── Record Trade Dialog ───────────────────────────────────────────────────────

function RecordTradeDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tradeDate: new Date().toISOString().slice(0, 10),
    direction: "LONG" as "LONG" | "SHORT",
    apexEntryPrice: "",
    apexStopPrice: "",
    apexTargetPrice: "",
    atlasEntryPrice: "",
    atlasStopPrice: "",
    atlasTargetPrice: "",
    atlasAtr14: "",
  });

  const recordMutation = trpc.apex.recordTrade.useMutation({
    onSuccess: () => {
      toast.success("Trade recorded — Apex trade logged successfully.");
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    recordMutation.mutate({
      tradeDate: form.tradeDate,
      direction: form.direction,
      apexEntryPrice: parseFloat(form.apexEntryPrice),
      apexStopPrice: parseFloat(form.apexStopPrice),
      apexTargetPrice: parseFloat(form.apexTargetPrice),
      atlasEntryPrice: form.atlasEntryPrice ? parseFloat(form.atlasEntryPrice) : undefined,
      atlasStopPrice: form.atlasStopPrice ? parseFloat(form.atlasStopPrice) : undefined,
      atlasTargetPrice: form.atlasTargetPrice ? parseFloat(form.atlasTargetPrice) : undefined,
      atlasAtr14: form.atlasAtr14 ? parseFloat(form.atlasAtr14) : undefined,
    });
  };

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
          + Record Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Record Apex Trade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Trade Date</Label>
              <Input value={form.tradeDate} onChange={f("tradeDate")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Direction</Label>
              <Select value={form.direction} onValueChange={(v) => setForm(p => ({ ...p, direction: v as "LONG" | "SHORT" }))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="LONG" className="text-emerald-400">LONG</SelectItem>
                  <SelectItem value="SHORT" className="text-red-400">SHORT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-zinc-700" />
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Apex Execution Prices</p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Entry</Label>
              <Input placeholder="e.g. 21450.50" value={form.apexEntryPrice} onChange={f("apexEntryPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Stop</Label>
              <Input placeholder="e.g. 21400.00" value={form.apexStopPrice} onChange={f("apexStopPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Target</Label>
              <Input placeholder="e.g. 21550.00" value={form.apexTargetPrice} onChange={f("apexTargetPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
          </div>

          <Separator className="bg-zinc-700" />
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Atlas Signal Prices (optional)</p>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Entry</Label>
              <Input placeholder="signal" value={form.atlasEntryPrice} onChange={f("atlasEntryPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Stop</Label>
              <Input placeholder="signal" value={form.atlasStopPrice} onChange={f("atlasStopPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Target</Label>
              <Input placeholder="signal" value={form.atlasTargetPrice} onChange={f("atlasTargetPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">ATR14</Label>
              <Input placeholder="pts" value={form.atlasAtr14} onChange={f("atlasAtr14")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={recordMutation.isPending || !form.apexEntryPrice || !form.apexStopPrice || !form.apexTargetPrice}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {recordMutation.isPending ? "Recording…" : "Record Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Close Trade Dialog ────────────────────────────────────────────────────────

function CloseTradeDialog({ tradeId, onSuccess }: { tradeId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    apexExitPrice: "",
    apexExitReason: "TARGET" as "TARGET" | "STOP" | "TIME_STOP" | "MANUAL",
    apexPnl: "",
    apexHoldingBars: "",
    divergenceNotes: "",
  });

  const closeMutation = trpc.apex.closeTrade.useMutation({
    onSuccess: (data) => {
      const msg = `Divergence: ${data.divergenceFlag}. P&L diff: ${fmtPnl(data.pnlDifference ?? null)}`;
      if (data.isWin) toast.success(`Win recorded ✓ — ${msg}`);
      else toast.error(`Loss recorded — ${msg}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs border-zinc-600 text-zinc-300 hover:bg-zinc-700">
          Close
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Close Apex Trade #{tradeId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Exit Price</Label>
              <Input placeholder="e.g. 21550.00" value={form.apexExitPrice} onChange={f("apexExitPrice")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Exit Reason</Label>
              <Select value={form.apexExitReason} onValueChange={(v) => setForm(p => ({ ...p, apexExitReason: v as typeof form.apexExitReason }))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="TARGET" className="text-emerald-400">TARGET</SelectItem>
                  <SelectItem value="STOP" className="text-red-400">STOP</SelectItem>
                  <SelectItem value="TIME_STOP" className="text-amber-400">TIME STOP</SelectItem>
                  <SelectItem value="MANUAL" className="text-zinc-400">MANUAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-zinc-400 text-xs">Actual P&L ($)</Label>
              <Input placeholder="e.g. 900 or -450" value={form.apexPnl} onChange={f("apexPnl")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Holding Bars</Label>
              <Input placeholder="e.g. 8" value={form.apexHoldingBars} onChange={f("apexHoldingBars")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-zinc-400 text-xs">Divergence Notes (optional)</Label>
            <Input placeholder="Any execution issues?" value={form.divergenceNotes} onChange={f("divergenceNotes")} className="bg-zinc-800 border-zinc-700 text-zinc-100 mt-1" />
          </div>
          <Button
            onClick={() => closeMutation.mutate({
              id: tradeId,
              apexExitPrice: parseFloat(form.apexExitPrice),
              apexExitReason: form.apexExitReason,
              apexPnl: parseFloat(form.apexPnl),
              apexHoldingBars: form.apexHoldingBars ? parseInt(form.apexHoldingBars) : undefined,
              divergenceNotes: form.divergenceNotes || undefined,
            })}
            disabled={closeMutation.isPending || !form.apexExitPrice || !form.apexPnl}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {closeMutation.isPending ? "Closing…" : "Close Trade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ApexEvaluation() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.apex.getDashboardData.useQuery();

  const refresh = () => utils.apex.getDashboardData.invalidate();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64 bg-zinc-800" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 bg-zinc-800 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 bg-zinc-800 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  const { stats, openTrade, latestSnapshot, recentTrades, snapshotHistory, benchmark, apexRules, gates, promotionStatus } = data;

  const gatesList = [
    { key: "minTrades", label: "Min 20 Trades", value: `${gates.minTrades.current}/20`, passed: gates.minTrades.passed },
    { key: "winRate", label: "WR ≥ 65%", value: fmtPct(gates.winRate.current), passed: gates.winRate.passed },
    { key: "profitFactor", label: "PF ≥ 2.0", value: fmt(gates.profitFactor.current, 2), passed: gates.profitFactor.passed },
    { key: "noCriticalDrift", label: "No Critical Drift", value: gates.noCriticalDrift.current === 0 ? "Clean" : `${gates.noCriticalDrift.current} flags`, passed: gates.noCriticalDrift.passed },
    { key: "outcomeMatch", label: "Outcome Match ≥ 90%", value: fmtPct(gates.outcomeMatch.current), passed: gates.outcomeMatch.passed },
  ];

  const passedGates = gatesList.filter(g => g.passed).length;
  const totalGates = gatesList.length;

  return (
    <div className="p-6 space-y-6 min-h-screen bg-zinc-950 text-zinc-100">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Apex 50K Evaluation</h1>
          <p className="text-sm text-zinc-500 mt-0.5">DARWIN-S109-001 · VWAP_ALIGNED_CONTINUATION · Frozen Hypothesis v1.0</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${statusColor(promotionStatus)} border text-xs px-3 py-1`}>
            {promotionStatus.replace(/_/g, " ")}
          </Badge>
          <RecordTradeDialog onSuccess={refresh} />
        </div>
      </div>

      {/* Open Trade Alert */}
      {openTrade && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-300 font-medium text-sm">
                Open Trade #{openTrade.id} · {openTrade.direction} @ ${parseFloat(openTrade.apexEntryPrice?.toString() ?? "0").toFixed(2)}
              </span>
              <span className="text-zinc-500 text-xs">
                Stop: ${parseFloat(openTrade.apexStopPrice?.toString() ?? "0").toFixed(2)} · Target: ${parseFloat(openTrade.apexTargetPrice?.toString() ?? "0").toFixed(2)}
              </span>
            </div>
            <CloseTradeDialog tradeId={openTrade.id} onSuccess={refresh} />
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Win Rate",
            value: stats.totalTrades > 0 ? fmtPct(stats.winRate) : "—",
            sub: `Benchmark: ${benchmark.winRate}%`,
            color: stats.totalTrades > 0 && stats.winRate >= benchmark.winRate ? "text-emerald-400" : stats.totalTrades > 0 ? "text-amber-400" : "text-zinc-400",
          },
          {
            label: "Profit Factor",
            value: stats.totalTrades > 0 ? fmt(stats.profitFactor, 2) : "—",
            sub: `Benchmark: ${benchmark.profitFactor}`,
            color: stats.totalTrades > 0 && stats.profitFactor >= benchmark.profitFactor ? "text-emerald-400" : stats.totalTrades > 0 ? "text-amber-400" : "text-zinc-400",
          },
          {
            label: "Total P&L",
            value: stats.totalTrades > 0 ? fmtPnl(stats.totalPnl) : "—",
            sub: `${stats.wins}W / ${stats.losses}L`,
            color: stats.totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Pass Progress",
            value: latestSnapshot ? fmtPct(parseFloat(latestSnapshot.passProgress?.toString() ?? "0")) : "—",
            sub: `Target: $${apexRules.profitTarget.toLocaleString()}`,
            color: latestSnapshot && parseFloat(latestSnapshot.passProgress?.toString() ?? "0") >= 100 ? "text-emerald-400" : "text-zinc-400",
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Apex Account Status */}
      {latestSnapshot && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Apex Account Status — {fmtDate(latestSnapshot.snapshotDate?.toString())}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Balance", value: `$${parseFloat(latestSnapshot.currentBalance?.toString() ?? "0").toLocaleString()}` },
                { label: "Peak Balance", value: `$${parseFloat(latestSnapshot.peakBalance?.toString() ?? "0").toLocaleString()}` },
                { label: "Trailing Threshold", value: `$${parseFloat(latestSnapshot.trailingThreshold?.toString() ?? "0").toLocaleString()}` },
                { label: "Remaining DD Buffer", value: `$${parseFloat(latestSnapshot.remainingTrailingDd?.toString() ?? "0").toLocaleString()}`, highlight: parseFloat(latestSnapshot.remainingTrailingDd?.toString() ?? "0") < 800 },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-xs text-zinc-500">{item.label}</p>
                  <p className={`text-lg font-semibold mt-0.5 ${(item as any).highlight ? "text-red-400" : "text-zinc-100"}`}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Pass Progress</span>
                <span>{fmtPct(parseFloat(latestSnapshot.passProgress?.toString() ?? "0"))} of $3,000 target</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, parseFloat(latestSnapshot.passProgress?.toString() ?? "0"))}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Promotion Gate */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Promotion Gate</CardTitle>
              <span className="text-xs text-zinc-500">{passedGates}/{totalGates} passed</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {gatesList.map(gate => (
              <div key={gate.key} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={gate.passed ? "text-emerald-400" : "text-zinc-600"}>
                    {gate.passed ? "✓" : "○"}
                  </span>
                  <span className="text-xs text-zinc-400">{gate.label}</span>
                </div>
                <span className={`text-xs font-mono ${gate.passed ? "text-emerald-400" : "text-zinc-500"}`}>
                  {gate.value}
                </span>
              </div>
            ))}

            <div className="pt-2">
              <div className="w-full bg-zinc-800 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(passedGates / totalGates) * 100}%` }}
                />
              </div>
            </div>

            {promotionStatus === "PROMOTION_ELIGIBLE" && (
              <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-400 text-center">
                All gates passed — eligible for Paper Trading promotion
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live vs Benchmark */}
        <Card className="bg-zinc-900 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-zinc-400 uppercase tracking-wider">Live vs Benchmark (Sprint 110 OOS)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left text-zinc-500 pb-2 font-normal">Metric</th>
                    <th className="text-right text-zinc-500 pb-2 font-normal">Benchmark</th>
                    <th className="text-right text-zinc-500 pb-2 font-normal">Live</th>
                    <th className="text-right text-zinc-500 pb-2 font-normal">Δ</th>
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {[
                    {
                      metric: "Win Rate",
                      bench: `${benchmark.winRate}%`,
                      live: stats.totalTrades > 0 ? fmtPct(stats.winRate) : "—",
                      delta: stats.totalTrades > 0 ? stats.winRate - benchmark.winRate : null,
                      unit: "pp",
                    },
                    {
                      metric: "Profit Factor",
                      bench: fmt(benchmark.profitFactor, 2),
                      live: stats.totalTrades > 0 ? fmt(stats.profitFactor, 2) : "—",
                      delta: stats.totalTrades > 0 ? stats.profitFactor - benchmark.profitFactor : null,
                      unit: "",
                    },
                    {
                      metric: "Avg Win",
                      bench: `$${benchmark.riskPerTrade * 2}`,
                      live: stats.wins > 0 ? `$${fmt(stats.avgWin, 0)}` : "—",
                      delta: stats.wins > 0 ? stats.avgWin - benchmark.riskPerTrade * 2 : null,
                      unit: "$",
                    },
                    {
                      metric: "Avg Loss",
                      bench: `$${benchmark.riskPerTrade}`,
                      live: stats.losses > 0 ? `$${fmt(stats.avgLoss, 0)}` : "—",
                      delta: stats.losses > 0 ? -(stats.avgLoss - benchmark.riskPerTrade) : null,
                      unit: "$",
                    },
                    {
                      metric: "Outcome Match",
                      bench: "100%",
                      live: stats.totalTrades > 0 ? fmtPct(stats.outcomeMatchRate) : "—",
                      delta: stats.totalTrades > 0 ? stats.outcomeMatchRate - 100 : null,
                      unit: "pp",
                    },
                    {
                      metric: "Avg Slippage",
                      bench: "0 pts",
                      live: stats.totalTrades > 0 ? `${fmt(stats.avgSlippage, 2)} pts` : "—",
                      delta: null,
                      unit: "",
                    },
                  ].map(row => (
                    <tr key={row.metric} className="border-b border-zinc-800/50">
                      <td className="py-2 text-zinc-400">{row.metric}</td>
                      <td className="py-2 text-right text-zinc-300 font-mono">{row.bench}</td>
                      <td className="py-2 text-right text-zinc-100 font-mono">{row.live}</td>
                      <td className={`py-2 text-right font-mono ${row.delta == null ? "text-zinc-600" : row.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {row.delta == null ? "—" : `${row.delta >= 0 ? "+" : ""}${fmt(row.delta, 1)}${row.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Trades / Snapshots */}
      <Tabs defaultValue="trades">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="trades" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Trade Log ({stats.totalTrades})
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Account Snapshots
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-zinc-100">
            Validation Rules
          </TabsTrigger>
        </TabsList>

        {/* Trade Log */}
        <TabsContent value="trades">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              {recentTrades.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <p className="text-lg">No trades recorded yet</p>
                  <p className="text-sm mt-1">Record your first Apex trade after executing in Tradovate</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["#", "Date", "Dir", "Apex Entry", "Apex Exit", "P&L", "Reason", "Slippage", "Divergence", ""].map(h => (
                          <th key={h} className="text-left text-zinc-500 pb-2 font-normal pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentTrades.map((t: any) => (
                        <tr key={t.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2 text-zinc-500 pr-3">{t.id}</td>
                          <td className="py-2 text-zinc-400 pr-3">{fmtDate(t.tradeDate?.toString())}</td>
                          <td className={`py-2 font-medium pr-3 ${t.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</td>
                          <td className="py-2 text-zinc-300 font-mono pr-3">${parseFloat(t.apexEntryPrice?.toString() ?? "0").toFixed(2)}</td>
                          <td className="py-2 text-zinc-300 font-mono pr-3">
                            {t.apexExitPrice ? `$${parseFloat(t.apexExitPrice.toString()).toFixed(2)}` : <span className="text-amber-400">OPEN</span>}
                          </td>
                          <td className={`py-2 font-mono font-medium pr-3 ${t.apexPnl == null ? "text-zinc-500" : parseFloat(t.apexPnl.toString()) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {t.apexPnl != null ? fmtPnl(parseFloat(t.apexPnl.toString())) : "—"}
                          </td>
                          <td className="py-2 text-zinc-500 pr-3">{t.apexExitReason ?? "—"}</td>
                          <td className="py-2 text-zinc-500 font-mono pr-3">
                            {t.exitSlippagePts != null ? `${parseFloat(t.exitSlippagePts.toString()).toFixed(2)}pts` : "—"}
                          </td>
                          <td className={`py-2 pr-3 ${divergenceColor(t.divergenceFlag ?? "NONE")}`}>
                            {t.divergenceFlag ?? "—"}
                          </td>
                          <td className="py-2">
                            {t.status === "OPEN" && (
                              <CloseTradeDialog tradeId={t.id} onSuccess={refresh} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Snapshots */}
        <TabsContent value="snapshots">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              {snapshotHistory.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <p className="text-lg">No snapshots recorded yet</p>
                  <p className="text-sm mt-1">Enter daily account snapshots from your Tradovate dashboard</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Date", "Balance", "Peak", "Threshold", "DD Buffer", "Daily P&L", "Progress", "Status"].map(h => (
                          <th key={h} className="text-left text-zinc-500 pb-2 font-normal pr-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotHistory.map((s: any) => (
                        <tr key={s.id} className="border-b border-zinc-800/50">
                          <td className="py-2 text-zinc-400 pr-3">{fmtDate(s.snapshotDate?.toString())}</td>
                          <td className="py-2 text-zinc-100 font-mono pr-3">${parseFloat(s.currentBalance?.toString() ?? "0").toLocaleString()}</td>
                          <td className="py-2 text-zinc-300 font-mono pr-3">${parseFloat(s.peakBalance?.toString() ?? "0").toLocaleString()}</td>
                          <td className="py-2 text-zinc-300 font-mono pr-3">${parseFloat(s.trailingThreshold?.toString() ?? "0").toLocaleString()}</td>
                          <td className={`py-2 font-mono pr-3 ${parseFloat(s.remainingTrailingDd?.toString() ?? "0") < 800 ? "text-red-400" : "text-zinc-300"}`}>
                            ${parseFloat(s.remainingTrailingDd?.toString() ?? "0").toLocaleString()}
                          </td>
                          <td className={`py-2 font-mono pr-3 ${parseFloat(s.dailyPnl?.toString() ?? "0") >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {fmtPnl(parseFloat(s.dailyPnl?.toString() ?? "0"))}
                          </td>
                          <td className="py-2 text-zinc-400 pr-3">{fmtPct(parseFloat(s.passProgress?.toString() ?? "0"))}</td>
                          <td className="py-2">
                            <Badge className={`${statusColor(s.evaluationStatus)} border text-xs`}>{s.evaluationStatus}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Rules */}
        <TabsContent value="rules">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Apex 50K Evaluation Rules</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Profit Target", value: "$3,000" },
                      { label: "Trailing Drawdown", value: "$2,000 (intraday)" },
                      { label: "Max Contracts", value: "6 (using 1)" },
                      { label: "Daily Loss Limit", value: "None" },
                      { label: "Minimum Days", value: "None" },
                      { label: "Access Period", value: "30 calendar days" },
                      { label: "Consistency Rule", value: "Not applied in Evaluation" },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between text-xs py-1.5 border-b border-zinc-800">
                        <span className="text-zinc-500">{r.label}</span>
                        <span className="text-zinc-300 font-mono">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-3">Validation Protocol (Mandatory)</h3>
                  <div className="space-y-1.5">
                    {[
                      "Every S109-001 signal must be executed — no skipping",
                      "No discretionary trades outside S109-001 signals",
                      "No parameter changes — hypothesis is frozen",
                      "1 MNQ contract per signal — no scaling in",
                      "$450 risk per trade — no changes",
                      "Every signal treated identically — no cherry-picking",
                      "Record every trade in Atlas immediately after execution",
                      "Daily snapshot from Tradovate after each RTH session",
                    ].map((rule, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                        <span className="text-zinc-600 mt-0.5">—</span>
                        <span>{rule}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded">
                    <p className="text-xs text-amber-400 font-medium">Daily Protection Protocol</p>
                    <div className="mt-2 space-y-1 text-xs text-zinc-400">
                      <p>1 loss → Continue normally (22.5% of DD used)</p>
                      <p>2 losses → Increase vigilance, confirm filters</p>
                      <p>3 losses → Mandatory review before next trade</p>
                      <p className="text-red-400">4 losses → STOP — investigate before continuing</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
