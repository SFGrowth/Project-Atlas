/**
 * SB1 Observatory — Regime Activation Score diagnostics, paper trade log,
 * activation/suppression reasons, and regime fingerprints.
 */
import React from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Target, TrendingUp, TrendingDown, Activity, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtPnl(v: string | number | null | undefined): React.ReactElement {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return <span className="text-muted-foreground">—</span>;
  const cls = n >= 0 ? "text-emerald-400" : "text-red-400";
  return <span className={cls}>{n >= 0 ? "+" : ""}${n.toFixed(2)}</span>;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── RAS Gauge ───────────────────────────────────────────────────────────────

function RasGauge({ ras, activated }: { ras: number | null; activated: boolean }) {
  const score = ras ?? 0;
  const color = score >= 45 ? "oklch(0.65 0.22 145)" : score >= 30 ? "oklch(0.75 0.18 60)" : "oklch(0.55 0.22 25)";
  const label = score >= 45 ? "ACTIVATED" : score >= 30 ? "MARGINAL" : "SUPPRESSED";

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      {/* Arc gauge */}
      <div className="relative" style={{ width: 160, height: 90 }}>
        <svg viewBox="0 0 160 90" style={{ width: "100%", height: "100%" }}>
          {/* Background arc */}
          <path
            d="M 15 80 A 65 65 0 0 1 145 80"
            fill="none"
            stroke="oklch(0.22 0.08 220)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Value arc */}
          <path
            d="M 15 80 A 65 65 0 0 1 145 80"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 204} 204`}
            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "stroke-dasharray 0.6s cubic-bezier(0.23,1,0.32,1)" }}
          />
          {/* Threshold marker at 45 */}
          <line
            x1="80" y1="16"
            x2="80" y2="26"
            stroke="oklch(0.65 0.22 60)"
            strokeWidth="2"
            transform="rotate(-18, 80, 80)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
            {ras != null ? Math.round(score) : "—"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--color-muted-foreground)" }}>RAS</span>
        </div>
      </div>
      <div
        className="px-3 py-1 text-xs font-bold tracking-widest"
        style={{
          fontFamily: "var(--font-mono)",
          border: `1px solid ${color}`,
          color,
          background: `${color}18`,
          boxShadow: `0 0 8px ${color}40`,
        }}
      >
        {label}
      </div>
      {activated && (
        <div className="flex items-center gap-1 text-xs" style={{ color: "oklch(0.65 0.22 145)" }}>
          <CheckCircle size={12} />
          <span style={{ fontFamily: "var(--font-mono)" }}>SB1 ELIGIBLE</span>
        </div>
      )}
    </div>
  );
}

// ─── Component Score Bar ─────────────────────────────────────────────────────

function ComponentBar({ label, value, max, description }: { label: string; value: number | null; max: number; description: string }) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 70 ? "oklch(0.65 0.22 145)" : pct >= 40 ? "oklch(0.75 0.18 60)" : "oklch(0.55 0.22 25)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, fontWeight: 600 }}>
          {value != null ? value.toFixed(2) : "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "oklch(0.18 0.06 220)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}60` }}
        />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.4 0.06 220)" }}>{description}</div>
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="hud-panel hud-panel-br p-4 flex flex-col gap-1">
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)" }}>{title}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: color ?? "var(--arc-blue)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>{sub}</div>}
    </div>
  );
}

// ─── Certification Gate ───────────────────────────────────────────────────────

function CertGate({ label, current, target, unit = "", pass }: { label: string; current: number | null; target: number; unit?: string; pass: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded" style={{ background: "oklch(0.12 0.04 220)" }}>
      <div style={{ flexShrink: 0 }}>
        {pass
          ? <CheckCircle size={14} style={{ color: "oklch(0.65 0.22 145)" }} />
          : <XCircle size={14} style={{ color: "oklch(0.55 0.22 25)" }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: pass ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)", fontWeight: 600 }}>
          {current != null ? `${current.toFixed(2)}${unit}` : "—"} <span style={{ color: "var(--color-muted-foreground)", fontWeight: 400 }}>/ {target}{unit}</span>
        </div>
      </div>
      <Progress value={current != null ? Math.min(100, (current / target) * 100) : 0} className="w-16 h-1" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SB1ObservatoryPage() {
  const { data: latestRas, isLoading: rasLoading } = trpc.sb1.latestRas.useQuery(undefined, { refetchInterval: 15000 });
  const { data: recentTrades, isLoading: tradesLoading } = trpc.sb1.recentTrades.useQuery({ limit: 20 });
  const { data: stats } = trpc.sb1.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: certStatus } = trpc.sb1.certificationStatus.useQuery(undefined, { refetchInterval: 60000 });
  const { data: recentRejections } = trpc.sb1.recentRejections.useQuery({ limit: 10 });

  const ras = latestRas?.ras != null ? parseFloat(latestRas.ras) : null;
  const activated = latestRas?.rasActivated ?? false;

  // Feature component scores from latest snapshot
  const features = latestRas ? {
    pdRangeAtr: latestRas.featurePdRangeAtr != null ? parseFloat(latestRas.featurePdRangeAtr) : null,
    pdPosition: latestRas.featurePdPosition != null ? parseFloat(latestRas.featurePdPosition) : null,
    overnightGap: latestRas.featureOvernightGap != null ? parseFloat(latestRas.featureOvernightGap) : null,
    chop: latestRas.featureChop != null ? parseFloat(latestRas.featureChop) : null,
    atrExpansion: latestRas.featureAtrExpansion != null ? parseFloat(latestRas.featureAtrExpansion) : null,
    vwapDist: latestRas.featureVwapDist != null ? parseFloat(latestRas.featureVwapDist) : null,
    emaSlope: latestRas.featureEmaSlope != null ? parseFloat(latestRas.featureEmaSlope) : null,
    emaDist: latestRas.featureEmaDist != null ? parseFloat(latestRas.featureEmaDist) : null,
    trendPers: latestRas.featureTrendPers != null ? parseFloat(latestRas.featureTrendPers) : null,
  } : null;

  // Certification thresholds
  const certGates = [
    { label: "Trades (need ≥60)", current: stats?.trades ?? null, target: 60, pass: (stats?.trades ?? 0) >= 60 },
    { label: "Win Rate (need ≥45%)", current: stats?.wr != null ? stats.wr * 100 : null, target: 45, unit: "%", pass: (stats?.wr ?? 0) >= 0.45 },
    { label: "Profit Factor (need ≥2.0)", current: stats?.pf ?? null, target: 2.0, pass: (stats?.pf ?? 0) >= 2.0 },
    { label: "Max Drawdown (need ≤$2,000)", current: stats?.maxDd != null ? Math.abs(stats.maxDd) : null, target: 2000, unit: "", pass: stats?.maxDd != null && Math.abs(stats.maxDd) <= 2000 },
  ];

  return (
    <div className="p-4 space-y-4" style={{ background: "var(--hud-bg)", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Target size={18} style={{ color: "var(--arc-cyan)" }} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-cyan)" }}>SB1 OBSERVATORY</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>
            REGIME ACTIVATION SCORE · PAPER TRADING · CERTIFICATION PROGRESS
          </div>
        </div>
        {latestRas && (
          <div className="ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
            Last update: {fmtDateTime(latestRas.createdAt)}
          </div>
        )}
      </div>

      {/* Top row: RAS gauge + component scores + certification gates */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "200px 1fr 280px" }}>
        {/* RAS Gauge */}
        <div className="hud-panel hud-panel-br flex flex-col items-center justify-center">
          {rasLoading ? (
            <Skeleton className="w-32 h-32 rounded-full" />
          ) : (
            <RasGauge ras={ras} activated={activated} />
          )}
          {latestRas?.activationReason && (
            <div className="px-3 pb-3 text-center">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>
                {latestRas.activationReason}
              </div>
            </div>
          )}
        </div>

        {/* Component Scores */}
        <div className="hud-panel hud-panel-br p-4">
          <div className="hud-header mb-3"><span className="hud-header-dot" />Regime Feature Components</div>
          {!features ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>
              Awaiting first RAS snapshot from TradingView…
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <ComponentBar label="PD RANGE / ATR" value={features.pdRangeAtr} max={20} description="Prior day range relative to ATR — directional context" />
              <ComponentBar label="PD POSITION" value={features.pdPosition != null ? features.pdPosition * 100 : null} max={100} description="Where price sits in prior day range (0=bottom, 100=top)" />
              <ComponentBar label="OVERNIGHT GAP" value={features.overnightGap != null ? Math.abs(features.overnightGap) * 100 : null} max={3} description="Gap magnitude relative to ATR" />
              <ComponentBar label="CHOP INDEX (inv)" value={features.chop != null ? 100 - features.chop : null} max={100} description="Inverted CHOP — higher = more directional" />
              <ComponentBar label="ATR EXPANSION" value={features.atrExpansion} max={2} description="Current ATR vs 20-bar mean — volatility expansion" />
              <ComponentBar label="VWAP DISTANCE" value={features.vwapDist} max={3} description="Distance from VWAP in ATR units" />
              <ComponentBar label="EMA SLOPE" value={features.emaSlope != null ? Math.abs(features.emaSlope) * 1000 : null} max={5} description="EMA 21 slope magnitude" />
              <ComponentBar label="TREND PERSISTENCE" value={features.trendPers != null ? features.trendPers * 100 : null} max={100} description="% of last 10 bars in same direction" />
            </div>
          )}
        </div>

        {/* Certification Gates */}
        <div className="hud-panel hud-panel-br p-4">
          <div className="hud-header mb-3"><span className="hud-header-dot" />Forward Validation Gates</div>
          <div className="space-y-2">
            {certGates.map((g) => (
              <CertGate key={g.label} {...g} />
            ))}
          </div>
          {certStatus && (
            <div className="mt-3 pt-3 border-t border-[oklch(0.22_0.08_220_/_0.4)]">
              <div className="flex items-center gap-2">
                {certStatus.certState === "PRODUCTION_READY"
                  ? <CheckCircle size={14} style={{ color: "oklch(0.65 0.22 145)" }} />
                  : <AlertCircle size={14} style={{ color: "oklch(0.75 0.18 60)" }} />}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: certStatus.certState === "PRODUCTION_READY" ? "oklch(0.65 0.22 145)" : "oklch(0.75 0.18 60)" }}>
                  {certStatus.certState === "PRODUCTION_READY" ? "CERTIFICATION PASSED" : certStatus.certState}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-6 gap-3">
          <StatsCard title="TOTAL TRADES" value={String(stats.trades)} sub="forward test" />
          <StatsCard title="WIN RATE" value={`${(stats.wr * 100).toFixed(1)}%`} sub="target ≥45%" color={stats.wr >= 0.45 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)"} />
          <StatsCard title="PROFIT FACTOR" value={stats.pf.toFixed(3)} sub="target ≥2.0" color={stats.pf >= 2.0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)"} />
          <StatsCard title="NET P&L" value={`$${stats.netPnl.toFixed(0)}`} sub="paper account" color={stats.netPnl >= 0 ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)"} />
          <StatsCard title="EXPECTANCY" value={`$${stats.expectancy.toFixed(2)}`} sub="per trade" />
          <StatsCard title="AVG RAS" value={stats.avgRas.toFixed(1)} sub="activated trades" color="var(--arc-cyan)" />
        </div>
      )}

      {/* Bottom row: paper trade log + rejected signals */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 380px" }}>
        {/* Paper Trade Log */}
        <div className="hud-panel hud-panel-br">
          <div className="hud-header"><span className="hud-header-dot" />Paper Trade Log (Last 20)</div>
          <div className="overflow-auto">
            {tradesLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : !recentTrades?.length ? (
              <div className="p-6 text-center" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>
                No paper trades yet — forward validation begins when first RAS-activated signal arrives
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow style={{ borderColor: "oklch(0.22 0.08 220 / 0.4)" }}>
                    {["Opened", "Dir", "Entry", "Exit", "P&L", "R", "RAS", "Status", "Exit Reason"].map((h) => (
                      <TableHead key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTrades.map((t) => (
                    <TableRow key={t.id} style={{ borderColor: "oklch(0.18 0.06 220 / 0.3)" }}>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmtDateTime(t.openedAt)}</TableCell>
                      <TableCell>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: t.direction === "LONG" ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)", fontWeight: 600 }}>
                          {t.direction === "LONG" ? <TrendingUp size={12} className="inline mr-1" /> : <TrendingDown size={12} className="inline mr-1" />}
                          {t.direction}
                        </span>
                      </TableCell>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmt(t.entry)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{fmt(t.exitPrice)}</TableCell>
                      <TableCell>{fmtPnl(t.pnl)}</TableCell>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{t.rMultiple != null ? `${parseFloat(t.rMultiple).toFixed(2)}R` : "—"}</TableCell>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--arc-cyan)" }}>{t.ras != null ? parseFloat(t.ras).toFixed(0) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "CLOSED" ? "outline" : "default"} style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.exitReason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Rejected Signals */}
        <div className="hud-panel hud-panel-br">
          <div className="hud-header"><span className="hud-header-dot" />Recent Suppressed Signals</div>
          {!recentRejections?.length ? (
            <div className="p-4 text-center" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>
              No rejected signals logged
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "oklch(0.18 0.06 220 / 0.3)" }}>
              {recentRejections.map((r) => (
                <div key={r.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle size={12} style={{ color: "oklch(0.55 0.22 25)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: r.direction === "LONG" ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)" }}>
                        {r.direction}
                      </span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                      {fmtDateTime(r.createdAt)}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.22 25)" }}>
                    RAS {r.ras != null ? parseFloat(r.ras).toFixed(0) : "—"} — {r.rejectionReason}
                  </div>
                  {r.featureChop != null && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                      CHOP {parseFloat(r.featureChop).toFixed(1)} · ATR×{r.featureAtrExpansion != null ? parseFloat(r.featureAtrExpansion).toFixed(2) : "—"} · VWAP {r.featureVwapDist != null ? parseFloat(r.featureVwapDist).toFixed(2) : "—"}σ
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
