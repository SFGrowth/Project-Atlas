import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  GitBranch,
  Hash,
  Info,
  RefreshCw,
  Shield,
  Webhook,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parityBadge(status: string) {
  switch (status) {
    case "VALIDATED":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
          <CheckCircle2 className="w-3 h-3" />
          VALIDATED
        </Badge>
      );
    case "PENDING_VALIDATION":
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
          <Clock className="w-3 h-3" />
          PENDING
        </Badge>
      );
    case "DRIFT_DETECTED":
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 gap-1">
          <AlertTriangle className="w-3 h-3" />
          DRIFT
        </Badge>
      );
    case "SUSPENDED":
      return (
        <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 gap-1">
          <Shield className="w-3 h-3" />
          SUSPENDED
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30">
          NOT CONFIGURED
        </Badge>
      );
  }
}

function portfolioParityBanner(status: string) {
  switch (status) {
    case "VALIDATED":
      return (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Portfolio Parity: VALIDATED</p>
            <p className="text-xs text-emerald-400/70">All 6 strategies are validated against the server-side ADE engine.</p>
          </div>
        </div>
      );
    case "PENDING_VALIDATION":
      return (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Clock className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">Portfolio Parity: PENDING VALIDATION</p>
            <p className="text-xs text-amber-400/70">
              Run the parity validation procedure (see ADE_PARITY_SPEC.md) to confirm Pine and server rules match.
            </p>
          </div>
        </div>
      );
    case "DRIFT_DETECTED":
      return (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">DRIFT DETECTED — Pine rules are stale</p>
            <p className="text-xs text-red-400/70">
              The rule hash in the Pine script does not match the current server-side rules. Update the Pine script immediately.
            </p>
          </div>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-3 rounded-lg border border-slate-500/30 bg-slate-500/10 px-4 py-3">
          <Info className="w-5 h-5 text-slate-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-400">Portfolio Parity: NOT CONFIGURED</p>
            <p className="text-xs text-slate-400/70">No Pine strategies are configured yet.</p>
          </div>
        </div>
      );
  }
}

function fmtTs(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtScore(score: string | null) {
  if (!score) return "—";
  return parseFloat(score).toFixed(1);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortfolioPineStatus() {
  const utils = trpc.useUtils();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: status, isLoading, error } = trpc.pineStatus.getPortfolioStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data: manifest } = trpc.pineStatus.getManifest.useQuery();

  const updateParity = trpc.pineStatus.updateParityStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.strategyId} parity status updated to ${result.parityStatus}`);
      utils.pineStatus.getPortfolioStatus.invalidate();
      setUpdatingId(null);
    },
    onError: (err) => {
      toast.error(`Failed to update parity: ${err.message}`);
      setUpdatingId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        Failed to load Pine status: {error?.message ?? "Unknown error"}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Code2 className="w-6 h-6 text-cyan-400" />
              Portfolio Pine Status
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Atlas Unified Portfolio Pine Script — ADE parity tracking and drift detection
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => utils.pineStatus.getPortfolioStatus.invalidate()}
            className="gap-2 border-slate-700 text-slate-300 hover:text-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Parity Banner */}
        {portfolioParityBanner(status.portfolioParityStatus)}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 mb-1">Script Version</p>
              <p className="text-lg font-mono font-bold text-cyan-400">v{status.scriptVersion}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 mb-1">Strategies Enabled</p>
              <p className="text-lg font-bold text-slate-100">{status.strategiesEnabled} / 6</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 mb-1">Validated</p>
              <p className="text-lg font-bold text-emerald-400">{status.strategiesValidated}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-400 mb-1">Drift Detected</p>
              <p className={`text-lg font-bold ${status.strategiesDriftDetected > 0 ? "text-red-400" : "text-slate-500"}`}>
                {status.strategiesDriftDetected}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Manifest Info */}
        {manifest && (
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-cyan-400" />
                Script Manifest
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Script Name</p>
                  <p className="font-mono text-slate-200 text-xs">{manifest.scriptName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">ADE Version</p>
                  <p className="font-mono text-slate-200 text-xs">{manifest.adeVersion}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Portfolio Version</p>
                  <p className="font-mono text-slate-200 text-xs">{manifest.portfolioVersion}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Build Date</p>
                  <p className="font-mono text-slate-200 text-xs">{manifest.buildDate}</p>
                </div>
              </div>
              <Separator className="bg-slate-800" />
              <div className="flex items-start gap-2">
                <Hash className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Rule Hash</p>
                  <p className="font-mono text-xs text-slate-300">{manifest.ruleHash}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(manifest.invariants).map(([key, val]) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className={`text-xs font-mono ${val ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}
                  >
                    {val ? "✓" : "✗"} {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Strategy Table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Strategy Parity Status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs">Strategy</TableHead>
                  <TableHead className="text-slate-400 text-xs">Parity</TableHead>
                  <TableHead className="text-slate-400 text-xs">Version</TableHead>
                  <TableHead className="text-slate-400 text-xs">Webhook</TableHead>
                  <TableHead className="text-slate-400 text-xs">Last Signal</TableHead>
                  <TableHead className="text-slate-400 text-xs">Score</TableHead>
                  <TableHead className="text-slate-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.strategies.map((s) => (
                  <TableRow key={s.strategyId} className="border-slate-800 hover:bg-slate-800/30">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {s.pineChartColour && (
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.pineChartColour }}
                          />
                        )}
                        <div>
                          <p className="font-mono text-sm font-semibold text-slate-100">
                            {s.strategyId}
                          </p>
                          <p className="text-xs text-slate-500">{s.stage}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{parityBadge(s.pineParityStatus)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-slate-400">
                        {s.pineVersion ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Webhook
                          className={`w-3 h-3 ${s.pineWebhookEnabled ? "text-emerald-400" : "text-slate-600"}`}
                        />
                        <span className="text-xs text-slate-400">
                          {s.pineWebhookEnabled ? "ON" : "OFF"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs text-slate-300">{fmtTs(s.pineLastSignalAt)}</p>
                        {s.pineLastSignalDirection && (
                          <Badge
                            variant="outline"
                            className={`text-xs mt-0.5 ${
                              s.pineLastSignalDirection === "LONG"
                                ? "border-emerald-500/30 text-emerald-400"
                                : "border-red-500/30 text-red-400"
                            }`}
                          >
                            {s.pineLastSignalDirection}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-cyan-400">
                        {fmtScore(s.pineLastSignalScore)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {s.pineParityStatus !== "VALIDATED" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                disabled={updatingId === s.strategyId}
                                onClick={() => {
                                  setUpdatingId(s.strategyId);
                                  updateParity.mutate({
                                    strategyId: s.strategyId,
                                    parityStatus: "VALIDATED",
                                  });
                                }}
                              >
                                {updatingId === s.strategyId ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  "Mark Validated"
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Mark this strategy as parity-validated after running the fixture test</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {s.pineParityStatus === "VALIDATED" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                disabled={updatingId === s.strategyId}
                                onClick={() => {
                                  setUpdatingId(s.strategyId);
                                  updateParity.mutate({
                                    strategyId: s.strategyId,
                                    parityStatus: "PENDING_VALIDATION",
                                  });
                                }}
                              >
                                Reset
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Reset to PENDING_VALIDATION (e.g. after a rule change)</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Known Gaps */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Known Parity Gaps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {status.strategies
              .filter((s) => s.pineEnabled && s.pineKnownGaps)
              .map((s) => (
                <div key={s.strategyId} className="flex items-start gap-3">
                  {s.pineChartColour && (
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: s.pineChartColour }}
                    />
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-300">{s.strategyId}</p>
                    <p className="text-xs text-slate-500">{s.pineKnownGaps}</p>
                  </div>
                </div>
              ))}
            <Separator className="bg-slate-800" />
            <p className="text-xs text-slate-500">
              These gaps are acceptable because the server is the authoritative decision engine.
              Pine divergences are caught by the server's independent ADE evaluation.
            </p>
          </CardContent>
        </Card>

        {/* Last Activity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Webhook className="w-4 h-4 text-cyan-400" />
                <p className="text-xs font-semibold text-slate-300">Last Webhook Received</p>
              </div>
              <p className="text-sm text-slate-200">{fmtTs(status.lastWebhookAt)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <p className="text-xs font-semibold text-slate-300">Last Signal</p>
              </div>
              <p className="text-sm text-slate-200">{fmtTs(status.lastSignalAt)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
