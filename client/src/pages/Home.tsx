import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import {
  OverviewStrip,
  HudPanel,
  DataRow,
  StateBadge,
  SignalBadge,
  ApprovalBadge,
  PassFailBadge,
  PageWrapper,
  fmt,
  fmtTime,
} from "@/components/HudComponents";
import PipelineOrb from "@/components/PipelineOrb";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TradeRow {
  id: string;
  model: string;
  direction: string;
  date: string | null;
  entryTime: string | null;
  exitTime: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  pnl: number;
  riskDollars?: number | null;
  contracts?: number | null;
}
interface BucketStats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  winRate: number | null;
  models: { model: string; trades: number; wins: number; pnl: number; winRate: number | null }[];
  tradeList?: TradeRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pnlClass(v: number) {
  return v > 0 ? "pnl-positive" : v < 0 ? "pnl-negative" : "data-value";
}
function pnlStr(v: number) {
  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
}

// ─── P&L Bucket Panel ─────────────────────────────────────────────────────────
function PnlBucket({ label, data, riskOverride }: { label: string; data: BucketStats | undefined; riskOverride: number }) {
  if (!data) {
    return (
      <div className="hud-panel hud-panel-br flex flex-col gap-2 p-3">
        <div className="hud-header text-xs"><span className="hud-header-dot" />{label}</div>
        <div className="text-[var(--color-muted-foreground)] text-xs text-center py-4">No data</div>
      </div>
    );
  }
  const { trades, wins, losses, pnl, winRate, models } = data;
  const NY = 'America/New_York';
  const fmtT = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: NY }) : '—';
  const fmtD = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: NY }) : '—';
  const fmtP = (p: number | null) => p != null ? p.toFixed(2) : '—';
  const fmtR = (tradePnl: number) => {
    if (!riskOverride) return '—';
    const r = tradePnl / riskOverride;
    return `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
  };
  return (
    <div className="hud-panel hud-panel-br flex flex-col gap-0">
      <div className="hud-header"><span className="hud-header-dot" />{label}</div>
      <div className="p-3 flex flex-col gap-2">
        {/* Main stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className={`text-lg font-bold font-['Orbitron'] ${pnlClass(pnl)}`} style={{ textShadow: pnl > 0 ? "0 0 8px #4ade80" : pnl < 0 ? "0 0 8px #f87171" : "none" }}>
              {trades > 0 ? pnlStr(pnl) : "—"}
            </div>
            <div className="text-[10px] text-[var(--color-muted-foreground)] tracking-wider mt-0.5">P&L</div>
          </div>
          <div>
            <div className="text-lg font-bold font-['Orbitron'] text-[var(--arc-cyan)]" style={{ textShadow: "0 0 6px var(--arc-cyan)" }}>
              {trades > 0 ? `${winRate?.toFixed(0) ?? "—"}%` : "—"}
            </div>
            <div className="text-[10px] text-[var(--color-muted-foreground)] tracking-wider mt-0.5">WIN RATE</div>
          </div>
          <div>
            <div className="text-lg font-bold font-['Orbitron'] text-[var(--arc-blue)]">
              {trades}
            </div>
            <div className="text-[10px] text-[var(--color-muted-foreground)] tracking-wider mt-0.5">TRADES</div>
          </div>
        </div>
        {/* W/L bar */}
        {trades > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-green-400">{wins}W</span>
            <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.18_0.06_220)] overflow-hidden">
              <div
                className="h-full rounded-full bg-green-400"
                style={{ width: `${(wins / trades) * 100}%`, boxShadow: "0 0 4px #4ade80" }}
              />
            </div>
            <span className="text-red-400">{losses}L</span>
          </div>
        )}
        {/* Per-model breakdown with individual trade rows */}
        {models.length > 0 && data.tradeList && (
          <div className="border-t border-[oklch(0.22_0.06_220/0.4)] pt-2 space-y-3">
            {models.map((m) => {
              const modelTrades = (data.tradeList ?? []).filter((t) => t.model === m.model);
              return (
                <div key={m.model}>
                  {/* Model summary header */}
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--arc-blue)]">{m.model}</span>
                      <span className="text-[var(--color-muted-foreground)]">{m.trades}t</span>
                      {m.winRate !== null && (
                        <span className="text-[var(--arc-cyan)]">{m.winRate.toFixed(0)}%</span>
                      )}
                    </div>
                    <span className={`font-mono font-bold ${pnlClass(m.pnl)}`}>{pnlStr(m.pnl)}</span>
                  </div>
                  {/* Individual trade rows */}
                  {modelTrades.length > 0 && (
                    <div className="space-y-1">
                      {modelTrades.map((tr) => {
                        const isWin = tr.pnl > 0;
                        const dirColor = tr.direction === 'LONG' ? '#4ade80' : '#f87171';
                        return (
                          <div key={tr.id} className="grid items-center py-1 px-1 rounded bg-[oklch(0.12_0.04_220/0.4)] border border-[oklch(0.18_0.04_220/0.3)]" style={{ gridTemplateColumns: '14px 56px 44px 44px 1fr 52px 60px' }}>
                            <span style={{ color: dirColor, fontSize: 10 }}>{tr.direction === 'LONG' ? '▲' : '▼'}</span>
                            <span className="text-[var(--color-muted-foreground)] text-xs">{fmtD(tr.entryTime)}</span>
                            <span className="font-mono text-[var(--arc-cyan)] text-xs">{fmtT(tr.entryTime)}</span>
                            <span className="font-mono text-[var(--color-muted-foreground)] text-xs">{fmtT(tr.exitTime)}</span>
                            <span className="font-mono text-xs truncate">
                              <span className="text-[var(--arc-cyan)]">{fmtP(tr.entryPrice)}</span>
                              <span className="text-[var(--color-muted-foreground)] mx-1">→</span>
                              <span className="text-[var(--color-muted-foreground)]">{fmtP(tr.exitPrice)}</span>
                            </span>
                            <span className="font-mono text-xs text-orange-400 text-right">${riskOverride}</span>
                            <div className="flex flex-col items-end">
                              <span className={`font-mono font-bold text-xs ${isWin ? 'text-green-400' : 'text-red-400'}`}
                                style={{ textShadow: isWin ? '0 0 4px #4ade80' : '0 0 4px #f87171' }}>
                                {pnlStr(tr.pnl)}
                              </span>
                              <span className={`font-mono text-[10px] ${isWin ? 'text-green-300' : 'text-red-300'}`}>{fmtR(tr.pnl)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {trades === 0 && (
          <div className="text-[var(--color-muted-foreground)] text-xs text-center py-2">No trades this period</div>
        )}
      </div>
    </div>
  );
}

// ─── Open Trade Card ──────────────────────────────────────────────────────────
function OpenTradeCard({ trade }: { trade: { model: string | null; direction: string | null; entry: string | null; stop: string | null; target: string | null; riskDollars: string | null; openedAt: string } | null }) {
  if (!trade) return null;
  const dirColor = trade.direction === "LONG" ? "#4ade80" : "#f87171";
  const dirGlow = trade.direction === "LONG" ? "0 0 8px #4ade80" : "0 0 8px #f87171";
  return (
    <div className="hud-panel hud-panel-br border border-[oklch(0.55_0.22_145/0.4)]" style={{ boxShadow: "0 0 16px oklch(0.55 0.22 145 / 0.15)" }}>
      <div className="hud-header">
        <span className="hud-header-dot" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
        OPEN TRADE — LIVE
        <span className="ml-2 text-[9px] font-mono text-green-400 animate-pulse">●</span>
      </div>
      <div className="p-3 grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold font-['Orbitron'] text-[var(--arc-blue)]">{trade.model ?? "—"}</div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-wider">MODEL</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold font-['Orbitron']" style={{ color: dirColor, textShadow: dirGlow }}>{trade.direction ?? "—"}</div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-wider">DIRECTION</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold font-['Orbitron'] text-[var(--arc-cyan)]">{trade.entry ?? "—"}</div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-wider">ENTRY</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold font-['Orbitron'] text-[var(--stark-gold)]">{trade.riskDollars ? `$${parseFloat(trade.riskDollars).toFixed(0)}` : "—"}</div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-wider">RISK</div>
        </div>
      </div>
      <div className="px-3 pb-3 grid grid-cols-2 gap-2 text-[10px]">
        <div className="flex justify-between border border-[oklch(0.22_0.06_220/0.3)] rounded px-2 py-1">
          <span className="text-[var(--color-muted-foreground)]">STOP</span>
          <span className="text-red-400 font-mono">{trade.stop ?? "—"}</span>
        </div>
        <div className="flex justify-between border border-[oklch(0.22_0.06_220/0.3)] rounded px-2 py-1">
          <span className="text-[var(--color-muted-foreground)]">TARGET</span>
          <span className="text-green-400 font-mono">{trade.target ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Orb Live Wrapper ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PipelineOrbLive({ payload, animStage, animRunId }: { payload: any; animStage: number | null; animRunId: string | null }) {
  const p = payload;
  let stages = 0;
  let failed: number | null = null;

  if (animStage !== null) {
    // Demo / live-animation mode: use animated stage count
    stages = animStage;
  } else if (p) {
    stages = 1;
    if (p.master_state) stages = 2;
    if (stages >= 2 && (p.market_regime || p.session)) stages = 3;
    if (stages >= 3 && p.a1_signal !== undefined) stages = 4;
    if (stages >= 4 && p.a3_signal !== undefined) stages = 5;
    if (stages >= 5 && p.b1_signal !== undefined) stages = 6;
    if (stages >= 6 && p.ade_decision) stages = 7;
    if (stages >= 7 && p.ari_approved !== undefined) stages = 8;
    if (stages >= 8 && p.tvl_status) stages = 9;
    if (stages >= 9 && p.ari_contracts !== undefined) stages = 10;
    if (stages >= 10 && p.pipeline_run_id) stages = 11;
    if (stages >= 11 && p.brain_view !== undefined) stages = 12;
    if (stages >= 12 && p.bar_time) stages = 13;
    if (stages >= 13) stages = 14;
    if (stages >= 8 && p.ari_approved === false && p.ari_rejection) failed = 8;
    if (failed === null && stages >= 9 && p.tvl_status === "FAIL") failed = 9;
    if (failed === null && stages >= 7 && p.ade_decision === "NO_TRADE") failed = 7;
  }

  const tradeApproved =
    animStage === 14 ||
    (p?.ari_approved === true &&
      p?.tvl_status === "PASS" &&
      (p?.ade_decision === "LONG" || p?.ade_decision === "SHORT"));

  const runId = animRunId ?? p?.pipeline_run_id ?? null;

  return (
    <PipelineOrb
      stagesPassed={stages}
      failedStage={failed}
      running={stages > 0 && stages < 14 && failed === null}
      tradeApproved={tradeApproved}
      lastRun={runId}
      size={480}
    />
  );
}

// ─── ArcReactor ───────────────────────────────────────────────────────────────
function ArcReactor({ size = 80 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-[var(--arc-blue)] opacity-20 animate-ping" style={{ animationDuration: "3s" }} />
      <div className="absolute rounded-full border border-[var(--arc-cyan)] opacity-15 animate-ping" style={{ inset: size * 0.1, animationDuration: "2s", animationDelay: "0.5s" }} />
      <div className="rounded-full border-2 border-[var(--arc-blue)] flex items-center justify-center"
        style={{ width: size, height: size, boxShadow: "0 0 24px var(--arc-blue), 0 0 48px oklch(0.72 0.22 210 / 0.3), inset 0 0 16px oklch(0.72 0.22 210 / 0.2)" }}>
        <div className="rounded-full border border-[var(--arc-cyan)] flex items-center justify-center"
          style={{ width: size * 0.5, height: size * 0.5, boxShadow: "0 0 12px var(--arc-cyan)" }}>
          <div className="rounded-full bg-[var(--arc-blue)]"
            style={{ width: size * 0.2, height: size * 0.2, boxShadow: "0 0 12px var(--arc-blue), 0 0 24px var(--arc-blue)" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Home Component ──────────────────────────────────────────────────────
export default function Home() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: summaryStats } = trpc.paper.summaryStats.useQuery({}, { refetchInterval: 60000 });
  const { data: initialReport } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });

  // Risk override — persisted in localStorage, default $800
  const [riskOverride, setRiskOverride] = useState<number>(() => {
    const saved = localStorage.getItem('atlas_risk_override');
    return saved ? parseInt(saved, 10) || 800 : 800;
  });
  const [riskInput, setRiskInput] = useState<string>(() => {
    const saved = localStorage.getItem('atlas_risk_override');
    return saved ?? '800';
  });
  useEffect(() => {
    localStorage.setItem('atlas_risk_override', String(riskOverride));
  }, [riskOverride]);

  // Clock tick
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Demo / live animation mode ─────────────────────────────────────────────
  // animStage: null = show live payload state; 0..14 = animated progression
  const [animStage, setAnimStage] = useState<number | null>(null);
  const [animRunId, setAnimRunId] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const demoTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // When a new real pipeline report arrives, animate the orb from 0→14
  const lastReportId = useRef<string | null>(null);
  const liveReport = latestReport ?? initialReport;
  useEffect(() => {
    if (!liveReport?.id || liveReport.id === lastReportId.current) return;
    if (isDemo) return; // don't interrupt demo
    lastReportId.current = liveReport.id;
    // Animate live progression
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
    const DELAYS = [0, 180, 260, 340, 420, 500, 580, 780, 1050, 1350, 1580, 1780, 1960, 2180, 2500];
    DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => {
        setAnimStage(i);
        if (i === 14) setAnimRunId(liveReport.id);
      }, delay);
      demoTimers.current.push(t);
    });
    // After animation settle, return to static live state
    const reset = setTimeout(() => {
      setAnimStage(null);
      setAnimRunId(null);
    }, 8000);
    demoTimers.current.push(reset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveReport?.id]);

  const runDemo = () => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
    setIsDemo(true);
    setAnimStage(0);
    setAnimRunId(null);
    const DELAYS = [0, 280, 380, 480, 580, 680, 780, 1020, 1380, 1720, 1980, 2200, 2420, 2680, 3050];
    DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => {
        setAnimStage(i);
        if (i === 14) setAnimRunId(`demo-${Date.now()}`);
      }, delay);
      demoTimers.current.push(t);
    });
    const reset = setTimeout(() => {
      setAnimStage(null);
      setAnimRunId(null);
      setIsDemo(false);
    }, 7500);
    demoTimers.current.push(reset);
  };

  const now = new Date();
  const NY_TZ = "America/New_York";
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: NY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "2-digit", timeZone: NY_TZ });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = latestReport?.payload ?? (initialReport?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;

  // Suppress unused tick warning
  void tick;

  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />

      <div className="p-4 flex flex-col gap-4">

        {/* ── Row 1: Identity + Market State + System Health ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "220px 1fr 260px" }}>

          {/* Identity */}
          <div className="hud-panel hud-panel-br flex flex-col items-center justify-center py-6 gap-3">
            <ArcReactor size={80} />
            <div className="text-center">
              <div className="text-xl font-bold tracking-[0.3em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue">ORION</div>
              <div className="text-[9px] tracking-[0.2em] text-[var(--color-muted-foreground)] mt-0.5">QUANTITATIVE TRADING OS</div>
              <div className="text-[9px] tracking-[0.15em] text-[var(--arc-cyan)] mt-1 glow-cyan">ATLAS NEXUS v1.0</div>
            </div>
            <div className="text-center">
              <div className="text-[var(--arc-cyan)] font-bold text-2xl font-['Orbitron'] tracking-widest glow-cyan" style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
              <div className="text-[9px] tracking-[0.08em] text-[var(--color-muted-foreground)] mt-0.5">{dateStr}</div>
            </div>
          </div>

          {/* Market State — the main command-centre summary */}
          <div className="hud-panel hud-panel-br flex flex-col">
            <div className="hud-header"><span className="hud-header-dot" />Market State</div>
            <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-0 flex-1">
              <div>
                <DataRow label="Master State" value={<StateBadge value={p?.master_state} />} />
                <DataRow label="Market Regime" value={p?.market_regime ? <span className="data-value text-[var(--arc-cyan)]">{p.market_regime}</span> : "—"} />
                <DataRow label="Session" value={p?.session ? <span className="data-value">{p.session}</span> : "—"} />
                <DataRow label="Symbol" value={<span className="data-value glow-cyan font-['Orbitron'] text-[var(--arc-cyan)]">{p?.symbol ?? "—"}</span>} />
                <DataRow label="Bar Time" value={<span className="text-[var(--arc-cyan)] text-xs">{fmtTime(p?.bar_time)}</span>} />
              </div>
              <div>
                <DataRow label="ADE Decision" value={<SignalBadge value={p?.ade_decision} />} />
                <DataRow label="ARI Approval" value={<ApprovalBadge value={p?.ari_approved} />} />
                <DataRow label="TVL Status" value={<PassFailBadge value={p?.tvl_status} />} />
                <DataRow label="Circuit Breaker" value={
                  p?.ari_circuit_breaker
                    ? <span className={`status-badge ${p.ari_circuit_breaker === "OPEN" ? "status-error" : "status-live"}`}>{p.ari_circuit_breaker}</span>
                    : <span className="text-[var(--color-muted-foreground)]">—</span>
                } />
                <DataRow label="Pipeline Run" value={<span className="text-[var(--arc-blue)] text-xs">{p?.pipeline_run_id?.slice(-8) ?? "—"}</span>} />
              </div>
            </div>
            {/* Indicator strip */}
            {p && (
              <div className="px-3 pb-3 pt-1 border-t border-[var(--hud-border)] grid grid-cols-6 gap-2 text-[10px] text-[var(--color-muted-foreground)]">
                <div><span className="text-[var(--arc-blue)]">ADX </span>{fmt(p.adx)}</div>
                <div><span className="text-[var(--arc-blue)]">RSI </span>{fmt(p.rsi)}</div>
                <div><span className="text-[var(--arc-blue)]">ATR </span>{fmt(p.atr)}</div>
                <div><span className="text-[var(--arc-blue)]">EMA9 </span>{fmt(p.ema9)}</div>
                <div><span className="text-[var(--arc-blue)]">EMA21 </span>{fmt(p.ema21)}</div>
                <div><span className="text-[var(--arc-blue)]">VWAP </span>{fmt(p.vwap)}</div>
              </div>
            )}
            {!p && (
              <div className="px-3 pb-3 text-[var(--color-muted-foreground)] text-xs italic">Awaiting pipeline signal…</div>
            )}
          </div>

          {/* System Health */}
          <HudPanel title="System Health">
            <div className="space-y-0 py-1">
              {[
                { label: "SSE Stream", status: sseStatus, ok: sseStatus === "CONNECTED", warn: sseStatus === "CONNECTING" },
                { label: "Backend API", status: backendStatus, ok: backendStatus === "OK", warn: false },
                { label: "Data Freshness", status: dataFreshness, ok: dataFreshness === "LIVE", warn: dataFreshness === "UNKNOWN" },
              ].map(({ label, status, ok, warn }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-[oklch(0.22_0.06_220/0.3)]">
                  <span className="data-label">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${ok ? "bg-[var(--arc-cyan)]" : warn ? "bg-[var(--stark-gold)]" : "bg-[var(--danger-red)]"}`}
                      style={{ boxShadow: ok ? "0 0 6px var(--arc-cyan)" : warn ? "0 0 6px var(--stark-gold)" : "0 0 6px var(--danger-red)" }} />
                    <span className={`status-badge ${ok ? "status-live" : warn ? "status-warn" : "status-error"}`}>{status}</span>
                  </div>
                </div>
              ))}
              <DataRow label="Total Reports" value={<span className="data-value-lg glow-blue font-['Orbitron']">{reportCount}</span>} />
              <DataRow label="Last Bar" value={<span className="text-xs text-[var(--arc-cyan)]">{fmtTime(p?.bar_time)}</span>} />
            </div>
          </HudPanel>
        </div>

        {/* ── Row 2: Open Trade (if any) ── */}
        {summaryStats?.open && <OpenTradeCard trade={summaryStats.open} />}

        {/* ── Row 3: P&L Summary — Today / Week / Month / All-Time ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] tracking-[0.2em] text-[var(--color-muted-foreground)] font-mono uppercase">Paper Trading Performance — PAPER provenance only</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-muted-foreground)] font-mono tracking-wider">RISK $</span>
              <input
                type="number"
                min={1}
                step={50}
                value={riskInput}
                onChange={(e) => setRiskInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(riskInput, 10);
                  if (v > 0) setRiskOverride(v);
                  else setRiskInput(String(riskOverride));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(riskInput, 10);
                    if (v > 0) setRiskOverride(v);
                    else setRiskInput(String(riskOverride));
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-20 h-7 px-2 text-xs font-mono text-[var(--arc-cyan)] bg-[oklch(0.12_0.05_220/0.8)] border border-[oklch(0.35_0.12_220/0.6)] rounded focus:outline-none focus:border-[var(--arc-cyan)] text-right"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <PnlBucket label="Today" data={summaryStats?.today} riskOverride={riskOverride} />
            <PnlBucket label="This Week" data={summaryStats?.week} riskOverride={riskOverride} />
            <PnlBucket label="This Month" data={summaryStats?.month} riskOverride={riskOverride} />
            <PnlBucket label="All Time" data={summaryStats?.allTime} riskOverride={riskOverride} />
          </div>
        </div>

        {/* ── Row 4: Pipeline Orb — full width ── */}
        <div className="hud-panel hud-panel-br flex flex-col">
          <div className="hud-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="flex items-center gap-2">
              <span className="hud-header-dot" />
              ORION Pipeline — 14-Stage Execution Sequence
              {animStage !== null && !isDemo && (
                <span className="text-[9px] font-mono text-[var(--arc-cyan)] animate-pulse ml-2">● LIVE SIGNAL</span>
              )}
            </div>
            <button
              onClick={runDemo}
              disabled={animStage !== null}
              className="text-[10px] font-mono tracking-widest px-3 py-1 rounded border transition-all mr-1"
              style={{
                borderColor: animStage !== null ? "oklch(0.35 0.08 220)" : "var(--arc-cyan)",
                color: animStage !== null ? "oklch(0.45 0.08 220)" : "var(--arc-cyan)",
                background: "transparent",
                cursor: animStage !== null ? "not-allowed" : "pointer",
                boxShadow: animStage !== null ? "none" : "0 0 8px oklch(0.72 0.22 210 / 0.3)",
              }}
            >
              {animStage !== null ? (isDemo ? "DEMO RUNNING…" : "SIGNAL ACTIVE…") : "▶ RUN DEMO"}
            </button>
          </div>
          {/* Stage progress bar */}
          {animStage !== null && (
            <div className="px-4 pt-2">
              <div className="flex items-center gap-1">
                {Array.from({ length: 14 }, (_, i) => {
                  const stageNum = i + 1;
                  const passed = animStage >= stageNum;
                  const active = animStage === stageNum - 1;
                  return (
                    <div
                      key={stageNum}
                      className="flex-1 h-1.5 rounded-sm transition-all duration-300"
                      style={{
                        background: passed ? "#4ade80" : active ? "#fb923c" : "oklch(0.18 0.06 220)",
                        boxShadow: passed ? "0 0 4px #4ade80" : active ? "0 0 4px #fb923c" : "none",
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[8px] font-mono text-[var(--color-muted-foreground)] mt-0.5 px-0.5">
                <span>CFG</span><span>STA</span><span>MKT</span><span>A1</span><span>A3</span><span>B1</span>
                <span>ADE</span><span>ARI</span><span>TVL</span><span>EXE</span><span>OBS</span><span>BRN</span><span>MIS</span><span>HBT</span>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center py-4 gap-2">
            <PipelineOrbLive payload={p} animStage={animStage} animRunId={animRunId} />
          </div>
          {/* Trade fired card */}
          {animStage === 14 && (
            <div className="mx-4 mb-4 p-3 rounded border border-green-500/40 bg-green-950/20 text-center"
              style={{ boxShadow: "0 0 20px oklch(0.55 0.22 145 / 0.2)" }}>
              <div className="text-green-400 font-bold font-['Orbitron'] tracking-widest text-sm glow-green">
                ✓ TRADE APPROVED — ALL 14 STAGES PASSED
              </div>
              <div className="text-[10px] text-[var(--color-muted-foreground)] mt-1">
                {isDemo ? "Demo simulation complete" : `Pipeline run ${animRunId?.slice(-8) ?? ""} — paper trade opened`}
              </div>
            </div>
          )}
        </div>

        {/* ── All-Models Combined Summary ── */}
        {summaryStats && summaryStats.allTime.trades > 0 && (() => {
          const allModels = summaryStats.allTime.models;
          const allTrades = summaryStats.allTime.tradeList ?? [];
          const NY = 'America/New_York';
          const fmtT = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: NY }) : '—';
          const fmtD = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: NY }) : '—';
          const fmtP = (p: number | null) => p != null ? p.toFixed(2) : '—';
          const fmtR = (tradePnl: number) => {
            if (!riskOverride) return '—';
            const r = tradePnl / riskOverride;
            return `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
          };
          return (
            <div className="hud-panel hud-panel-br">
              <div className="hud-header"><span className="hud-header-dot" />ALL-MODELS COMBINED SUMMARY</div>
              <div className="p-3">
                {/* Model summary cards */}
                <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  {allModels.map((m) => (
                    <div key={m.model} className="flex items-center justify-between px-3 py-2 rounded bg-[oklch(0.14_0.05_220/0.5)] border border-[oklch(0.22_0.06_220/0.3)]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[var(--arc-blue)] text-sm">{m.model}</span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">{m.trades}t</span>
                        {m.winRate !== null && <span className="text-xs text-[var(--arc-cyan)]">{m.winRate.toFixed(0)}%</span>}
                      </div>
                      <span className={`font-mono font-bold text-sm ${m.pnl > 0 ? 'text-green-400' : m.pnl < 0 ? 'text-red-400' : 'data-value'}`}
                        style={{ textShadow: m.pnl > 0 ? '0 0 6px #4ade80' : m.pnl < 0 ? '0 0 6px #f87171' : 'none' }}>
                        {m.pnl > 0 ? '+' : ''}{m.pnl.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Full trade log table */}
                <div className="border-t border-[oklch(0.22_0.06_220/0.4)] pt-3">
                  <div className="grid text-[10px] text-[var(--color-muted-foreground)] tracking-wider pb-2 px-2" style={{ gridTemplateColumns: '44px 16px 68px 50px 50px 1fr 56px 70px 68px' }}>
                    <span>MODEL</span>
                    <span></span>
                    <span>DATE</span>
                    <span>ENTRY</span>
                    <span>EXIT</span>
                    <span>PRICE IN→OUT</span>
                    <span className="text-right text-orange-400">RISK</span>
                    <span className="text-right">P&L</span>
                    <span className="text-right text-[var(--arc-cyan)]">R-MULT</span>
                  </div>
                  {allTrades.map((tr) => {
                    const isWin = tr.pnl > 0;
                    const dirColor = tr.direction === 'LONG' ? '#4ade80' : '#f87171';
                    const rMult = fmtR(tr.pnl);
                    return (
                      <div key={tr.id} className="grid items-center py-1.5 px-2 rounded mb-1 bg-[oklch(0.12_0.04_220/0.4)] border border-[oklch(0.18_0.04_220/0.3)]"
                        style={{ gridTemplateColumns: '44px 16px 68px 50px 50px 1fr 56px 70px 68px' }}>
                        <span className="font-mono font-bold text-[var(--arc-blue)] text-xs">{tr.model}</span>
                        <span style={{ color: dirColor, fontSize: 11 }}>{tr.direction === 'LONG' ? '▲' : '▼'}</span>
                        <span className="text-[var(--color-muted-foreground)] text-xs">{fmtD(tr.entryTime)}</span>
                        <span className="font-mono text-[var(--arc-cyan)] text-xs">{fmtT(tr.entryTime)}</span>
                        <span className="font-mono text-[var(--color-muted-foreground)] text-xs">{fmtT(tr.exitTime)}</span>
                        <span className="font-mono text-xs truncate">
                          <span className="text-[var(--arc-cyan)]">{fmtP(tr.entryPrice)}</span>
                          <span className="text-[var(--color-muted-foreground)] mx-1">→</span>
                          <span className="text-[var(--color-muted-foreground)]">{fmtP(tr.exitPrice)}</span>
                        </span>
                        <span className="text-right font-mono text-xs text-orange-400">${riskOverride}</span>
                        <span className={`text-right font-mono font-bold text-xs ${isWin ? 'text-green-400' : 'text-red-400'}`}
                          style={{ textShadow: isWin ? '0 0 4px #4ade80' : '0 0 4px #f87171' }}>
                          {isWin ? '+' : ''}{tr.pnl.toFixed(2)}
                        </span>
                        <span className={`text-right font-mono text-xs ${isWin ? 'text-green-300' : 'text-red-300'}`}>{rMult}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </PageWrapper>
  );
}
