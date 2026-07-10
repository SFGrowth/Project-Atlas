import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useNexusSSE } from "@/hooks/useNexusSSE";
import type { PipelineReportPayload, VerificationCheck } from "@shared/pipelineTypes";

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}`;
  } catch { return iso ?? "—"; }
}

function pnlClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "pnl-neutral";
  return v >= 0 ? "pnl-positive" : "pnl-negative";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HudPanel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`hud-panel hud-panel-br flex flex-col ${className}`}>
      <div className="hud-header">
        <span className="hud-header-dot" />
        {title}
      </div>
      <div className="flex-1 p-3 overflow-auto">{children}</div>
    </div>
  );
}

function DataRow({ label, value, valueClass = "data-value" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[oklch(0.22_0.06_220/0.3)]">
      <span className="data-label">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function SignalBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  const v = value.toUpperCase();
  if (v === "LONG" || v === "BUY") return <span className="status-badge status-live">{value}</span>;
  if (v === "SHORT" || v === "SELL") return <span className="status-badge status-error">{value}</span>;
  return <span className="status-badge status-inactive">{value}</span>;
}

function StateBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  const v = value.toUpperCase();
  const cls = v.includes("ACTIVE") || v.includes("TRADE") ? "status-active"
    : v.includes("OVERNIGHT") || v.includes("FLAT") ? "status-inactive"
    : v.includes("RISK") || v.includes("HALT") ? "status-error"
    : "status-ok";
  return <span className={`status-badge ${cls}`}>{value}</span>;
}

function CheckRow({ check }: { check: VerificationCheck }) {
  return (
    <div className="check-row">
      <span className={check.passed ? "check-pass" : "check-fail"}>
        {check.passed ? "▶" : "✕"}
      </span>
      <span className="data-label flex-1">{check.name}</span>
      {check.value && <span className="data-value text-xs">{check.value}</span>}
    </div>
  );
}

function ModelCard({ label, model }: { label: string; model: PipelineReportPayload["model_a1"] }) {
  return (
    <div className="model-card">
      <div className="text-[var(--arc-blue)] font-bold text-xs tracking-widest mb-2 font-['Orbitron']">{label}</div>
      <div className="space-y-1">
        <DataRow label="Signal" value={<SignalBadge value={model?.signal_direction} />} />
        <DataRow label="Edge Score" value={fmt(model?.edge_score)} />
        <DataRow label="Basis" value={model?.signal_basis ?? "—"} />
      </div>
    </div>
  );
}

// ─── Overview Strip ───────────────────────────────────────────────────────────

function OverviewStrip({ payload, sseStatus, backendStatus, dataFreshness, reportCount }: {
  payload: PipelineReportPayload | null;
  sseStatus: string;
  backendStatus: string;
  dataFreshness: string;
  reportCount: number;
}) {
  const sseClass = sseStatus === "CONNECTED" ? "status-live" : sseStatus === "ERROR" ? "status-error" : "status-warn";
  const beClass = backendStatus === "OK" ? "status-ok" : backendStatus === "DEGRADED" ? "status-warn" : "status-error";
  const dfClass = dataFreshness === "LIVE" ? "status-live" : dataFreshness === "STALE" ? "status-stale" : "status-inactive";

  return (
    <div className="hud-panel hex-bg border-b-0" style={{ borderBottom: "2px solid var(--arc-blue)", boxShadow: "0 4px 24px oklch(0.72 0.22 210 / 0.2)" }}>
      <div className="flex items-center gap-6 px-4 py-3 flex-wrap">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--arc-blue)] flex items-center justify-center" style={{ boxShadow: "0 0 16px var(--arc-blue), inset 0 0 8px oklch(0.72 0.22 210 / 0.3)" }}>
            <div className="w-3 h-3 rounded-full bg-[var(--arc-blue)]" style={{ boxShadow: "0 0 8px var(--arc-blue)" }} />
          </div>
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue">ATLAS NEXUS</div>
            <div className="text-[9px] tracking-[0.15em] text-[var(--color-muted-foreground)]">JARVIS PIPELINE OBSERVABILITY</div>
          </div>
        </div>

        <div className="w-px h-8 bg-[var(--hud-border)]" />

        {/* Master State */}
        <div className="flex flex-col gap-1">
          <span className="data-label">Master State</span>
          <StateBadge value={payload?.master_state} />
        </div>

        {/* Symbol */}
        <div className="flex flex-col gap-1">
          <span className="data-label">Symbol</span>
          <span className="data-value-lg glow-cyan font-['Orbitron']">{payload?.symbol ?? "—"}</span>
        </div>

        {/* ADE Decision */}
        <div className="flex flex-col gap-1">
          <span className="data-label">ADE Decision</span>
          <SignalBadge value={payload?.ade_decision} />
        </div>

        {/* ARI Approval */}
        <div className="flex flex-col gap-1">
          <span className="data-label">ARI Approval</span>
          {payload?.ari_approved
            ? <span className={`status-badge ${payload.ari_approved === "APPROVED" ? "status-live" : "status-error"}`}>{payload.ari_approved}</span>
            : <span className="text-[var(--color-muted-foreground)] text-xs">—</span>}
        </div>

        {/* TVL Status */}
        <div className="flex flex-col gap-1">
          <span className="data-label">TVL Status</span>
          {payload?.tvl_status
            ? <span className={`status-badge ${payload.tvl_status === "PASS" ? "status-live" : "status-error"}`}>{payload.tvl_status}</span>
            : <span className="text-[var(--color-muted-foreground)] text-xs">—</span>}
        </div>

        {/* Reports */}
        <div className="flex flex-col gap-1">
          <span className="data-label">Reports (24h)</span>
          <span className="data-value-lg glow-blue font-['Orbitron']">{reportCount}</span>
        </div>

        <div className="flex-1" />

        {/* Health Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">SSE</span>
            <span className={`status-badge ${sseClass}`}>{sseStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">Backend</span>
            <span className={`status-badge ${beClass}`}>{backendStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">Data</span>
            <span className={`status-badge ${dfClass}`}>{dataFreshness}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Market Structure Panel ───────────────────────────────────────────────────

function MarketStructurePanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="Market Structure">
      <DataRow label="Trend" value={<StateBadge value={p?.trend} />} />
      <DataRow label="ADX" value={fmt(p?.adx)} />
      <DataRow label="ATR" value={fmt(p?.atr)} />
      <DataRow label="EMA 9" value={fmt(p?.ema9)} />
      <DataRow label="EMA 21" value={fmt(p?.ema21)} />
      <DataRow label="EMA 50" value={fmt(p?.ema50)} />
      <DataRow label="VWAP" value={fmt(p?.vwap)} />
      <DataRow label="RSI" value={
        <span className={p?.rsi !== null && p?.rsi !== undefined ? (p.rsi > 70 ? "pnl-negative" : p.rsi < 30 ? "pnl-positive" : "data-value") : "data-value"}>
          {fmt(p?.rsi)}
        </span>
      } />
      <DataRow label="Volume Ratio" value={fmt(p?.volume_ratio)} />
    </HudPanel>
  );
}

// ─── Position State Panel ─────────────────────────────────────────────────────

function PositionStatePanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="Position State">
      <DataRow label="Trade ID" value={<span className="text-[10px] text-[var(--arc-cyan)] truncate max-w-[120px]">{p?.trade_id ?? "—"}</span>} />
      <DataRow label="Entry" value={fmt(p?.entry_price)} />
      <DataRow label="Stop" value={<span className="pnl-negative">{fmt(p?.stop_price)}</span>} />
      <DataRow label="Target" value={<span className="pnl-positive">{fmt(p?.target_price)}</span>} />
      <DataRow label="Unrealized P&L" value={<span className={pnlClass(p?.unrealized_pnl)}>{fmt(p?.unrealized_pnl)}</span>} />
      <DataRow label="MFE" value={<span className="pnl-positive">{fmt(p?.mfe)}</span>} />
      <DataRow label="MAE" value={<span className="pnl-negative">{fmt(p?.mae)}</span>} />
      <DataRow label="Bars in Trade" value={fmt(p?.bars_in_trade, 0)} />
    </HudPanel>
  );
}

// ─── Model Evaluations Panel ──────────────────────────────────────────────────

function ModelEvaluationsPanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="Model Evaluations">
      <div className="grid grid-cols-3 gap-2">
        <ModelCard label="A1" model={p?.model_a1} />
        <ModelCard label="A3" model={p?.model_a3} />
        <ModelCard label="B1" model={p?.model_b1} />
      </div>
    </HudPanel>
  );
}

// ─── ADE Panel ────────────────────────────────────────────────────────────────

function ADEPanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="ADE — Atlas Decision Engine">
      <DataRow label="Decision" value={<SignalBadge value={p?.ade_decision} />} />
      <DataRow label="Candidate Model" value={<span className="data-value text-[var(--stark-gold)] glow-gold">{p?.ade_candidate_model ?? "—"}</span>} />
      <DataRow label="Edge Score" value={fmt(p?.ade_edge_score)} />
      <DataRow label="Confidence" value={fmtPct(p?.ade_confidence)} />
      <DataRow label="Rank Order" value={p?.ade_rank_order ?? "—"} />
    </HudPanel>
  );
}

// ─── ARI Panel ────────────────────────────────────────────────────────────────

function ARIPanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="ARI — Atlas Risk Intelligence">
      <DataRow label="Approval" value={
        p?.ari_approved
          ? <span className={`status-badge ${p.ari_approved === "APPROVED" ? "status-live" : "status-error"}`}>{p.ari_approved}</span>
          : <span className="text-[var(--color-muted-foreground)]">—</span>
      } />
      <DataRow label="Approved Risk" value={fmt(p?.ari_approved_risk)} />
      <DataRow label="Daily P&L" value={<span className={pnlClass(p?.ari_daily_pnl)}>{fmt(p?.ari_daily_pnl)}</span>} />
      <DataRow label="Drawdown" value={<span className="pnl-negative">{fmt(p?.ari_drawdown)}</span>} />
      <DataRow label="Consec. Losses" value={<span className={p?.ari_consecutive_losses ? "pnl-negative" : "data-value"}>{p?.ari_consecutive_losses ?? "—"}</span>} />
      <DataRow label="Consec. Wins" value={<span className={p?.ari_consecutive_wins ? "pnl-positive" : "data-value"}>{p?.ari_consecutive_wins ?? "—"}</span>} />
      <DataRow label="Circuit Breaker" value={
        p?.ari_circuit_breaker
          ? <span className={`status-badge ${p.ari_circuit_breaker === "OPEN" ? "status-error" : "status-live"}`}>{p.ari_circuit_breaker}</span>
          : <span className="text-[var(--color-muted-foreground)]">—</span>
      } />
    </HudPanel>
  );
}

// ─── TVL Panel ────────────────────────────────────────────────────────────────

function TVLPanel({ p }: { p: PipelineReportPayload | null }) {
  const checks: VerificationCheck[] = p?.tvl_checks ?? [];
  return (
    <HudPanel title="TVL — Trade Verification Layer">
      <div className="flex items-center justify-between mb-2">
        <span className="data-label">Status</span>
        {p?.tvl_status
          ? <span className={`status-badge ${p.tvl_status === "PASS" ? "status-live" : "status-error"}`}>{p.tvl_status}</span>
          : <span className="text-[var(--color-muted-foreground)]">—</span>}
      </div>
      <div className="mb-2">
        {checks.length > 0
          ? checks.map((c, i) => <CheckRow key={i} check={c} />)
          : <div className="text-[var(--color-muted-foreground)] text-xs text-center py-2">No checks received</div>}
      </div>
      <DataRow label="Blocking Rule" value={<span className="text-[var(--danger-red)] text-xs">{p?.tvl_blocking_rule ?? "—"}</span>} />
      <DataRow label="Execution" value={
        p?.tvl_execution_permitted !== null && p?.tvl_execution_permitted !== undefined
          ? <span className={`status-badge ${p.tvl_execution_permitted ? "status-live" : "status-error"}`}>{p.tvl_execution_permitted ? "PERMITTED" : "BLOCKED"}</span>
          : <span className="text-[var(--color-muted-foreground)]">—</span>
      } />
    </HudPanel>
  );
}

// ─── Brain View Panel ─────────────────────────────────────────────────────────

function BrainViewPanel({ p }: { p: PipelineReportPayload | null }) {
  return (
    <HudPanel title="Atlas Brain View">
      <div className="text-xs text-[var(--arc-cyan)] leading-relaxed font-['JetBrains_Mono'] min-h-[60px]">
        {p?.brain_view
          ? <span className="glow-cyan jarvis-flicker">{p.brain_view}</span>
          : <span className="text-[var(--color-muted-foreground)] italic">Awaiting pipeline signal…</span>}
      </div>
      {p && (
        <div className="mt-2 pt-2 border-t border-[var(--hud-border)] flex items-center gap-4 text-[10px] text-[var(--color-muted-foreground)]">
          <span>BAR: {fmtTime(p.bar_time)}</span>
          <span>TF: {p.timeframe}m</span>
          <span>RUN: <span className="text-[var(--arc-blue)]">{p.pipeline_run_id?.slice(-8) ?? "—"}</span></span>
        </div>
      )}
    </HudPanel>
  );
}

// ─── Decision Timeline ────────────────────────────────────────────────────────

interface TimelineEntry {
  id: string;
  receivedAt: string;
  barTime?: string | null;
  symbol?: string | null;
  masterState?: string | null;
  payload: PipelineReportPayload;
}

function DecisionTimeline({ entries }: { entries: TimelineEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  return (
    <HudPanel title="Decision Timeline" className="flex flex-col">
      {/* Header row */}
      <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 px-3 py-2 text-[9px] tracking-widest uppercase text-[var(--color-muted-foreground)] border-b border-[var(--hud-border)] bg-[oklch(0.72_0.22_210/0.05)]">
        <span>Timestamp</span>
        <span>Master State</span>
        <span>ADE Decision</span>
        <span>ARI Approval</span>
      </div>
      <div ref={scrollRef} className="overflow-y-auto flex-1" style={{ maxHeight: "220px" }}>
        {entries.length === 0 ? (
          <div className="text-center text-[var(--color-muted-foreground)] text-xs py-6">
            No pipeline events received yet
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="timeline-entry">
              <span className="text-[var(--arc-blue)] font-mono">{fmtDateTime(e.receivedAt)}</span>
              <StateBadge value={e.masterState} />
              <SignalBadge value={e.payload?.ade_decision} />
              {e.payload?.ari_approved
                ? <span className={`status-badge text-[9px] ${e.payload.ari_approved === "APPROVED" ? "status-live" : "status-error"}`}>{e.payload.ari_approved}</span>
                : <span className="text-[var(--color-muted-foreground)]">—</span>}
            </div>
          ))
        )}
      </div>
    </HudPanel>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);

  // Load initial reports from tRPC
  const { data: recentReports } = trpc.nexus.recentReports.useQuery({ limit: 50 });
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });

  // Seed timeline from DB on load
  useEffect(() => {
    if (recentReports && recentReports.length > 0) {
      setTimelineEntries(
        recentReports.map((r) => ({
          id: r.id,
          receivedAt: r.receivedAt,
          barTime: r.barTime,
          symbol: r.symbol,
          masterState: r.masterState,
          payload: r.payload as PipelineReportPayload,
        }))
      );
    }
  }, [recentReports]);

  // Prepend new live reports to timeline
  useEffect(() => {
    if (!latestReport) return;
    setTimelineEntries((prev) => {
      if (prev.length > 0 && prev[0].id === latestReport.id) return prev;
      const newEntry: TimelineEntry = {
        id: latestReport.id,
        receivedAt: latestReport.receivedAt,
        barTime: latestReport.payload.bar_time,
        symbol: latestReport.payload.symbol,
        masterState: latestReport.payload.master_state,
        payload: latestReport.payload,
      };
      return [newEntry, ...prev].slice(0, 200);
    });
  }, [latestReport]);

  const p = latestReport?.payload ?? null;
  const reportCount = stats?.totalReports ?? 0;

  return (
    <div className="min-h-screen flex flex-col hex-bg" style={{ background: "var(--color-background)" }}>
      {/* Overview Strip */}
      <OverviewStrip
        payload={p}
        sseStatus={sseStatus}
        backendStatus={backendStatus}
        dataFreshness={dataFreshness}
        reportCount={reportCount}
      />

      {/* Main Grid */}
      <div className="flex-1 p-3 grid gap-3" style={{
        gridTemplateColumns: "280px 1fr 1fr 280px",
        gridTemplateRows: "auto auto auto",
      }}>
        {/* Col 1: Market Structure + Position State */}
        <div className="flex flex-col gap-3">
          <MarketStructurePanel p={p} />
          <PositionStatePanel p={p} />
        </div>

        {/* Col 2: Model Evaluations + ADE */}
        <div className="flex flex-col gap-3">
          <ModelEvaluationsPanel p={p} />
          <ADEPanel p={p} />
          <BrainViewPanel p={p} />
        </div>

        {/* Col 3: ARI + TVL */}
        <div className="flex flex-col gap-3">
          <ARIPanel p={p} />
          <TVLPanel p={p} />
        </div>

        {/* Col 4: Stark ID + System Info */}
        <div className="flex flex-col gap-3">
          <StarkIDPanel p={p} sseStatus={sseStatus} reportCount={reportCount} />
        </div>

        {/* Bottom: Decision Timeline — full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <DecisionTimeline entries={timelineEntries} />
        </div>
      </div>
    </div>
  );
}

// ─── Stark ID / System Info Panel ────────────────────────────────────────────

function StarkIDPanel({ p, sseStatus, reportCount }: { p: PipelineReportPayload | null; sseStatus: string; reportCount: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "2-digit" });

  return (
    <div className="hud-panel hud-panel-br flex flex-col gap-0">
      <div className="hud-header">
        <span className="hud-header-dot" />
        Stark Industries
      </div>

      {/* Arc Reactor */}
      <div className="flex flex-col items-center py-6 gap-3">
        <div className="relative">
          {/* Outer rings */}
          <div className="absolute inset-0 rounded-full border border-[var(--arc-blue)] opacity-30 animate-ping" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-2 rounded-full border border-[var(--arc-cyan)] opacity-20 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
          {/* Main reactor */}
          <div className="w-20 h-20 rounded-full border-2 border-[var(--arc-blue)] flex items-center justify-center"
            style={{ boxShadow: "0 0 24px var(--arc-blue), 0 0 48px oklch(0.72 0.22 210 / 0.3), inset 0 0 16px oklch(0.72 0.22 210 / 0.2)" }}>
            <div className="w-10 h-10 rounded-full border border-[var(--arc-cyan)] flex items-center justify-center"
              style={{ boxShadow: "0 0 12px var(--arc-cyan)" }}>
              <div className="w-4 h-4 rounded-full bg-[var(--arc-blue)]"
                style={{ boxShadow: "0 0 12px var(--arc-blue), 0 0 24px var(--arc-blue)" }} />
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-[var(--arc-blue)] font-bold tracking-[0.25em] text-sm font-['Orbitron'] glow-blue">J.A.R.V.I.S.</div>
          <div className="text-[9px] tracking-[0.12em] text-[var(--color-muted-foreground)] mt-1">JUST A RATHER VERY INTELLIGENT SYSTEM</div>
        </div>
      </div>

      <div className="hud-divider mx-3" />

      {/* Clock */}
      <div className="px-3 py-2 text-center">
        <div className="text-[var(--arc-cyan)] font-bold text-2xl font-['Orbitron'] tracking-widest glow-cyan" style={{ fontVariantNumeric: "tabular-nums" }}>
          {timeStr}
        </div>
        <div className="text-[9px] tracking-[0.1em] text-[var(--color-muted-foreground)] mt-1">{dateStr}</div>
      </div>

      <div className="hud-divider mx-3" />

      {/* System stats */}
      <div className="px-3 pb-3 space-y-1">
        <DataRow label="System Status" value={
          <span className={`status-badge ${sseStatus === "CONNECTED" ? "status-live" : "status-error"}`}>
            {sseStatus === "CONNECTED" ? "ONLINE" : "OFFLINE"}
          </span>
        } />
        <DataRow label="Pipeline" value={<span className="text-[var(--arc-blue)]">{p?.pipeline_run_id?.slice(-8) ?? "—"}</span>} />
        <DataRow label="Timeframe" value={p?.timeframe ? `${p.timeframe}m` : "—"} />
        <DataRow label="Bar Index" value={p?.bar_index ?? "—"} />
        <DataRow label="Total Reports" value={<span className="data-value-lg glow-blue font-['Orbitron'] text-sm">{reportCount}</span>} />
        <DataRow label="Last Bar" value={<span className="text-[var(--arc-cyan)] text-xs">{fmtTime(p?.bar_time)}</span>} />
      </div>
    </div>
  );
}
