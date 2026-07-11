// ============================================================================
// EXECUTION PROFILES — Sprint 083 Part 10
// ============================================================================
// Read-only dashboard showing all four Atlas execution profiles.
// Data is derived from the latest pipeline report (ari_decision fields).
// No risk values are editable here — changes must be made in the correct
// isolated TradingView layout and documented in Version Governance.
// ============================================================================

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Clock, Lock, Shield, TrendingUp, XCircle } from "lucide-react";

// ── Static profile definitions ────────────────────────────────────────────────
// These match the four TradingView layouts described in Sprint 083 spec.
// Risk values shown here are the CONFIGURED defaults — live values come from
// the latest webhook payload via ari_decision.configured_risk_dollars.
const PROFILE_DEFINITIONS = [
  {
    id:           "ATLAS_PAPER_MNQ",
    name:         "ATLAS PAPER — MNQ",
    mode:         "PAPER",
    defaultRisk:  800,
    maxContracts: 5,
    dailyLimit:   -500,
    pointValue:   2.0,
    description:  "Simulation only. No real orders. Currently the only authorised execution mode.",
    active:       true,
    accentClass:  "border-teal-500/40 bg-teal-950/20",
    badgeClass:   "bg-teal-900/60 text-teal-300 border-teal-600/40",
    statusLabel:  "SIMULATION",
  },
  {
    id:           "ATLAS_APEX50_EVAL_MNQ",
    name:         "ATLAS APEX 50K EVAL — MNQ",
    mode:         "EVALUATION",
    defaultRisk:  900,
    maxContracts: 5,
    dailyLimit:   -2000,
    pointValue:   2.0,
    description:  "Apex 50K evaluation account. Dedicated TradersPost strategy. DISARMED until deployment sprint approved.",
    active:       false,
    accentClass:  "border-orange-500/30 bg-orange-950/10",
    badgeClass:   "bg-orange-900/40 text-orange-300 border-orange-600/30",
    statusLabel:  "DISARMED",
  },
  {
    id:           "ATLAS_APEX50_FUNDED_MNQ",
    name:         "ATLAS APEX 50K FUNDED — MNQ",
    mode:         "FUNDED",
    defaultRisk:  450,
    maxContracts: 5,
    dailyLimit:   -1500,
    pointValue:   2.0,
    description:  "Apex 50K funded account. Dedicated TradersPost strategy. DISARMED until deployment sprint approved.",
    active:       false,
    accentClass:  "border-yellow-500/30 bg-yellow-950/10",
    badgeClass:   "bg-yellow-900/40 text-yellow-300 border-yellow-600/30",
    statusLabel:  "DISARMED",
  },
  {
    id:           "ATLAS_LIVE_MNQ",
    name:         "ATLAS LIVE — MNQ",
    mode:         "LIVE",
    defaultRisk:  1650,
    maxContracts: 5,
    dailyLimit:   -3000,
    pointValue:   2.0,
    description:  "Live Tradovate account via TradersPost. DISARMED until deployment sprint approved.",
    active:       false,
    accentClass:  "border-red-500/30 bg-red-950/10",
    badgeClass:   "bg-red-900/40 text-red-300 border-red-600/30",
    statusLabel:  "DISARMED",
  },
] as const;

// ── Helper: derive contract count from stop distance ─────────────────────────
function calcContracts(dollarRisk: number, stopPts: number, pointValue: number, maxC: number): number {
  if (stopPts <= 0 || pointValue <= 0) return 0;
  const riskPerC = stopPts * pointValue;
  return Math.min(Math.floor(dollarRisk / riskPerC), maxC);
}

// ── Freshness badge ───────────────────────────────────────────────────────────
function FreshnessBadge({ receivedAt }: { receivedAt: string | null }) {
  if (!receivedAt) return <Badge variant="outline" className="text-xs text-muted-foreground">NO DATA</Badge>;
  const ageMs = Date.now() - new Date(receivedAt).getTime();
  const ageMins = ageMs / 60000;
  if (ageMins < 5)  return <Badge className="bg-emerald-900/60 text-emerald-300 border-emerald-600/40 text-xs">LIVE</Badge>;
  if (ageMins < 30) return <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-600/30 text-xs">STALE</Badge>;
  return <Badge className="bg-red-900/40 text-red-300 border-red-600/30 text-xs">OFFLINE</Badge>;
}

// ── Single profile card ───────────────────────────────────────────────────────
interface ProfileCardProps {
  profile: typeof PROFILE_DEFINITIONS[number];
  livePayload: Record<string, unknown> | null;
  receivedAt: string | null;
}

function ProfileCard({ profile, livePayload, receivedAt }: ProfileCardProps) {
  // Extract live values from payload if this is the active profile
  const payloadProfileId = livePayload?.ari_profile_id as string | undefined;
  const isLiveProfile = payloadProfileId === profile.id;

  const configuredRisk   = isLiveProfile ? Number(livePayload?.ari_configured_risk ?? profile.defaultRisk) : profile.defaultRisk;
  const estimatedRisk    = isLiveProfile ? Number(livePayload?.ari_estimated_risk ?? 0) : 0;
  const stopDistPts      = isLiveProfile ? Number(livePayload?.ari_stop_distance_points ?? 0) : 0;
  const riskPerC         = isLiveProfile ? Number(livePayload?.ari_risk_per_contract ?? 0) : 0;
  const contracts        = isLiveProfile ? Number(livePayload?.ari_contracts ?? 0) : 0;
  const maxContracts     = isLiveProfile ? Number(livePayload?.ari_maximum_contracts ?? profile.maxContracts) : profile.maxContracts;
  const execMode         = isLiveProfile ? String(livePayload?.ari_execution_mode ?? profile.mode) : profile.mode;
  const execArmed        = isLiveProfile ? Boolean(livePayload?.ari_execution_armed) : profile.mode === "PAPER";
  const ariApproval      = isLiveProfile ? String(livePayload?.ari_approved ?? "—") : "—";
  const ariRejection     = isLiveProfile ? String(livePayload?.ari_circuit_breaker ?? "—") : "—";
  const dailyPnl         = isLiveProfile ? Number(livePayload?.ari_daily_pnl ?? 0) : 0;
  const drawdown         = isLiveProfile ? Number(livePayload?.ari_drawdown ?? 0) : 0;
  const tvlStatus        = isLiveProfile ? String(livePayload?.tvl_status ?? "—") : "—";
  const lastSignal       = isLiveProfile ? String(livePayload?.ade_decision ?? "—") : "—";

  // Compute a preview contract count from ATR (if available) for non-active profiles
  const atr = Number(livePayload?.atr ?? 0);
  const previewContracts = atr > 0 ? calcContracts(profile.defaultRisk, atr, profile.pointValue, profile.maxContracts) : null;

  const armedState = profile.mode === "PAPER" ? "SIMULATION" : (execArmed ? "ARMED" : "DISARMED");
  const armedColor = profile.mode === "PAPER"
    ? "text-teal-400"
    : execArmed
      ? "text-red-400"
      : "text-yellow-400";

  return (
    <Card className={`border ${profile.accentClass} transition-all duration-200`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-mono font-semibold text-foreground leading-tight">
              {profile.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{profile.description}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge className={`text-xs font-mono ${profile.badgeClass}`}>{execMode}</Badge>
            <span className={`text-xs font-mono font-bold ${armedColor}`}>{armedState}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Risk Configuration Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded bg-background/40 border border-border/30 p-2 text-center">
            <div className="text-xs text-muted-foreground mb-0.5">Configured Risk</div>
            <div className="text-sm font-mono font-semibold text-foreground">${configuredRisk.toFixed(0)}</div>
          </div>
          <div className="rounded bg-background/40 border border-border/30 p-2 text-center">
            <div className="text-xs text-muted-foreground mb-0.5">Max Contracts</div>
            <div className="text-sm font-mono font-semibold text-foreground">{maxContracts}c</div>
          </div>
          <div className="rounded bg-background/40 border border-border/30 p-2 text-center">
            <div className="text-xs text-muted-foreground mb-0.5">Daily Limit</div>
            <div className="text-sm font-mono font-semibold text-red-400">${profile.dailyLimit.toFixed(0)}</div>
          </div>
        </div>

        <Separator className="opacity-20" />

        {/* Live data section — only shown when this profile is active */}
        {isLiveProfile ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <FreshnessBadge receivedAt={receivedAt} />
              <span className="text-xs text-muted-foreground font-mono">
                {receivedAt ? new Date(receivedAt).toLocaleTimeString() : "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Last Signal</span>
                <span className={lastSignal !== "NO_TRADE" && lastSignal !== "—" ? "text-emerald-400" : "text-muted-foreground"}>{lastSignal}</span>
              </div>
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">ARI</span>
                <span className={ariApproval === "APPROVED" ? "text-emerald-400" : ariApproval === "REJECTED" ? "text-red-400" : "text-muted-foreground"}>{ariApproval}</span>
              </div>
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">TVL</span>
                <span className={tvlStatus === "PASS" ? "text-emerald-400" : tvlStatus === "FAIL" ? "text-red-400" : "text-muted-foreground"}>{tvlStatus}</span>
              </div>
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Circuit Breaker</span>
                <span className={ariRejection === "OPEN" ? "text-red-400" : "text-emerald-400"}>{ariRejection}</span>
              </div>
            </div>

            {/* Dollar-risk sizing detail */}
            {stopDistPts > 0 && (
              <div className="rounded border border-border/20 bg-background/20 p-2 space-y-1">
                <div className="text-xs text-muted-foreground font-mono mb-1">Last Sizing Calculation</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
                  <span className="text-muted-foreground">Stop Distance</span>
                  <span className="text-foreground text-right">{stopDistPts.toFixed(2)} pts</span>
                  <span className="text-muted-foreground">Risk / Contract</span>
                  <span className="text-foreground text-right">${riskPerC.toFixed(2)}</span>
                  <span className="text-muted-foreground">Contracts</span>
                  <span className="text-foreground text-right font-bold">{contracts}c</span>
                  <span className="text-muted-foreground">Est. Risk</span>
                  <span className={`text-right font-bold ${estimatedRisk <= configuredRisk ? "text-emerald-400" : "text-red-400"}`}>
                    ${estimatedRisk.toFixed(2)}
                  </span>
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-right text-muted-foreground">${(configuredRisk - estimatedRisk).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Daily stats */}
            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Daily P&amp;L</span>
                <span className={dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}>${dailyPnl.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center rounded bg-background/30 px-2 py-1">
                <span className="text-muted-foreground">Drawdown</span>
                <span className={drawdown >= -100 ? "text-foreground" : "text-red-400"}>${drawdown.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Inactive profile — show static configuration only */
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock size={11} />
              <span>Not the active TradingView profile. No live data.</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
              <div className="flex justify-between items-center rounded bg-background/20 px-2 py-1 opacity-60">
                <span className="text-muted-foreground">Point Value</span>
                <span className="text-foreground">${profile.pointValue.toFixed(2)}/pt</span>
              </div>
              {previewContracts !== null && atr > 0 && (
                <div className="flex justify-between items-center rounded bg-background/20 px-2 py-1 opacity-60">
                  <span className="text-muted-foreground">Preview @ ATR</span>
                  <span className="text-foreground">{previewContracts}c</span>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground/60 font-mono leading-relaxed">
              To activate: duplicate TradingView layout → set Dollar Risk to ${profile.defaultRisk} in Settings → create new alert with dedicated webhook URL → document in Version Governance.
            </div>
          </div>
        )}

        {/* Profile ID footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-mono text-muted-foreground/50">{profile.id}</span>
          {profile.active ? (
            <div className="flex items-center gap-1 text-[10px] text-teal-400/70 font-mono">
              <CheckCircle2 size={10} />
              <span>ACTIVE PROFILE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40 font-mono">
              <Clock size={10} />
              <span>FUTURE DEPLOYMENT</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExecutionProfilesPage() {
  const { data: latestReport, isLoading } = trpc.nexus.latestReport.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const { data: paperTrade } = trpc.paper.openTrade.useQuery({ account: "ATLAS_MNQ_PAPER" }, {
    refetchInterval: 15000,
  });
  const { data: analytics } = trpc.analytics.summary.useQuery({ account: "ATLAS_MNQ_PAPER" });

  const payload = latestReport?.payload as Record<string, unknown> | null ?? null;
  const receivedAt = latestReport?.receivedAt ?? null;

  // Freshness state
  const ageMs = receivedAt ? Date.now() - new Date(receivedAt).getTime() : Infinity;
  const isStale = ageMs > 30 * 60 * 1000;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold font-mono text-foreground tracking-tight">
            Execution Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sprint 083 — Dollar-risk position sizing. Four physically isolated profiles. One active at a time.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FreshnessBadge receivedAt={receivedAt} />
          {isStale && (
            <div className="flex items-center gap-1 text-xs text-yellow-400">
              <AlertTriangle size={12} />
              <span>No recent data</span>
            </div>
          )}
        </div>
      </div>

      {/* Deployment Rule Banner */}
      <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 px-4 py-3 flex items-start gap-3">
        <Shield size={16} className="text-teal-400 mt-0.5 shrink-0" />
        <div className="text-sm text-teal-200/80 leading-relaxed">
          <span className="font-semibold text-teal-300">Current Deployment Rule (Sprint 083):</span>{" "}
          Only <span className="font-mono font-semibold">ATLAS PAPER — $800 RISK — SIMULATION ONLY</span> is authorised.
          The $900 evaluation, $450 funded, and $1,650 live profiles are prepared but remain{" "}
          <span className="font-semibold text-yellow-300">DISARMED</span> until their deployment sprint is formally approved.
        </div>
      </div>

      {/* Formula Reference */}
      <div className="rounded-lg border border-border/30 bg-background/30 px-4 py-3">
        <div className="text-xs font-mono text-muted-foreground space-y-0.5">
          <div className="text-foreground/70 font-semibold mb-1">Position Sizing Formula (Sprint 083)</div>
          <div>stop_distance_points = |entry_price − stop_price|</div>
          <div>risk_per_contract = stop_distance_points × point_value ($2.00 for MNQ)</div>
          <div>raw_contracts = floor(dollar_risk ÷ risk_per_contract)</div>
          <div>contracts = min(raw_contracts, max_contracts) — reject if &lt; 1 (RISK_TOO_SMALL_FOR_ONE_CONTRACT)</div>
          <div>estimated_risk = contracts × risk_per_contract ≤ configured_risk ✓</div>
        </div>
      </div>

      {/* Profile Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROFILE_DEFINITIONS.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              livePayload={payload}
              receivedAt={receivedAt}
            />
          ))}
        </div>
      )}

      {/* Paper Trading Summary */}
      <div className="rounded-lg border border-border/30 bg-background/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-teal-400" />
          <span className="text-sm font-semibold text-foreground">Paper Trading — Current Session</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded bg-background/40 border border-border/20 p-2">
            <div className="text-muted-foreground mb-0.5">Open Trade</div>
            <div className={`font-semibold ${paperTrade ? "text-emerald-400" : "text-muted-foreground"}`}>
              {paperTrade ? `${paperTrade.model} ${paperTrade.direction}` : "NONE"}
            </div>
          </div>
          <div className="rounded bg-background/40 border border-border/20 p-2">
            <div className="text-muted-foreground mb-0.5">Unrealised P&amp;L</div>
            <div className={`font-semibold ${Number(paperTrade?.currentR ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {paperTrade ? `${Number(paperTrade.currentR ?? 0).toFixed(2)}R` : "—"}
            </div>
          </div>
          <div className="rounded bg-background/40 border border-border/20 p-2">
            <div className="text-muted-foreground mb-0.5">Total Trades</div>
            <div className="font-semibold text-foreground">
              {analytics?.stats ? String(analytics.stats.totalTrades ?? "—") : "—"}
            </div>
          </div>
          <div className="rounded bg-background/40 border border-border/20 p-2">
            <div className="text-muted-foreground mb-0.5">Win Rate</div>
            <div className="font-semibold text-foreground">
              {analytics?.stats?.winRate ? `${Number(analytics.stats.winRate).toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Governance Note */}
      <div className="rounded-lg border border-border/20 bg-background/10 px-4 py-3 flex items-start gap-3">
        <XCircle size={14} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground/70">Atlas Nexus does not change Pine Script risk values.</span>{" "}
          Risk changes must be made deliberately in the correct isolated TradingView layout and documented in Version Governance.
          For the first 6–12 months, physical separation is preferred over central configuration.
        </p>
      </div>
    </div>
  );
}
