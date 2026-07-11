import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, PageWrapper, fmt, fmtDateTime, fmtTime } from "@/components/HudComponents";
import { useEffect, useState } from "react";

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

export default function Home() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: recentTrades } = trpc.paper.recentTrades.useQuery({ limit: 5 });
  // Fetch latest report via tRPC on mount so the dashboard shows data immediately
  // (SSE catchup is async and may arrive after first render)
  const { data: initialReport } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const NY_TZ = "America/New_York";
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: NY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "2-digit", timeZone: NY_TZ });

  // SSE latestReport takes priority (live updates); fall back to tRPC-fetched initial report
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = latestReport?.payload ?? (initialReport?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;

  const closedTrades = recentTrades?.filter((t) => t.status === "CLOSED") ?? [];
  const wins = closedTrades.filter((t) => parseFloat(t.pnl ?? "0") > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : "—";
  const totalPnl = closedTrades.reduce((sum, t) => sum + parseFloat(t.pnl ?? "0"), 0);

  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        {/* Identity Panel */}
        <div className="hud-panel hud-panel-br flex flex-col items-center justify-center py-8 gap-4">
          <ArcReactor size={100} />
          <div className="text-center">
            <div className="text-2xl font-bold tracking-[0.3em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue">ORION</div>
            <div className="text-xs tracking-[0.2em] text-[var(--color-muted-foreground)] mt-1">QUANTITATIVE TRADING OS</div>
            <div className="text-[10px] tracking-[0.15em] text-[var(--arc-cyan)] mt-2 glow-cyan">ATLAS NEXUS v1.0</div>
          </div>
          <div className="text-center mt-2">
            <div className="text-[var(--arc-cyan)] font-bold text-3xl font-['Orbitron'] tracking-widest glow-cyan" style={{ fontVariantNumeric: "tabular-nums" }}>{timeStr}</div>
            <div className="text-[10px] tracking-[0.1em] text-[var(--color-muted-foreground)] mt-1">{dateStr}</div>
          </div>
        </div>
        {/* Live Pipeline Status */}
        <HudPanel title="Live Pipeline Status">
          <DataRow label="Master State" value={<StateBadge value={p?.master_state} />} />
          <DataRow label="Symbol" value={<span className="data-value glow-cyan font-['Orbitron']">{p?.symbol ?? "—"}</span>} />
          <DataRow label="Timeframe" value={p?.timeframe ? `${p.timeframe}m` : "—"} />
          <DataRow label="ADE Decision" value={<SignalBadge value={p?.ade_decision} />} />
          <DataRow label="ARI Approval" value={<ApprovalBadge value={p?.ari_approved} />} />
          <DataRow label="TVL Status" value={<PassFailBadge value={p?.tvl_status} />} />
          <DataRow label="Circuit Breaker" value={
            p?.ari_circuit_breaker
              ? <span className={`status-badge ${p.ari_circuit_breaker === "OPEN" ? "status-error" : "status-live"}`}>{p.ari_circuit_breaker}</span>
              : <span className="text-[var(--color-muted-foreground)]">—</span>
          } />
          <DataRow label="Last Bar" value={<span className="text-[var(--arc-cyan)] text-xs">{fmtTime(p?.bar_time)}</span>} />
          <DataRow label="Pipeline Run" value={<span className="text-[var(--arc-blue)] text-xs">{p?.pipeline_run_id?.slice(-8) ?? "—"}</span>} />
        </HudPanel>
        {/* System Health */}
        <HudPanel title="System Health">
          <div className="space-y-1 py-1">
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
            <DataRow label="Last Received" value={<span className="text-xs text-[var(--arc-cyan)]">{fmtDateTime(stats?.lastReceivedAt)}</span>} />
          </div>
        </HudPanel>
        {/* Brain View */}
        <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
          <div className="hud-header"><span className="hud-header-dot" />Atlas Brain View</div>
          <div className="flex-1 p-3">
            <div className="text-xs text-[var(--arc-cyan)] leading-relaxed font-['JetBrains_Mono'] min-h-[60px]">
              {p?.brain_view
                ? <span className="glow-cyan jarvis-flicker">{p.brain_view}</span>
                : <span className="text-[var(--color-muted-foreground)] italic">Awaiting pipeline signal…</span>}
            </div>
            {p && (
              <div className="mt-3 pt-2 border-t border-[var(--hud-border)] grid grid-cols-3 gap-4 text-[10px] text-[var(--color-muted-foreground)]">
                <div><span className="text-[var(--arc-blue)]">ADX</span> {fmt(p.adx)}</div>
                <div><span className="text-[var(--arc-blue)]">RSI</span> {fmt(p.rsi)}</div>
                <div><span className="text-[var(--arc-blue)]">ATR</span> {fmt(p.atr)}</div>
                <div><span className="text-[var(--arc-blue)]">EMA9</span> {fmt(p.ema9)}</div>
                <div><span className="text-[var(--arc-blue)]">EMA21</span> {fmt(p.ema21)}</div>
                <div><span className="text-[var(--arc-blue)]">VWAP</span> {fmt(p.vwap)}</div>
              </div>
            )}
          </div>
        </div>
        {/* Paper Trading Summary */}
        <HudPanel title="Paper Trading">
          <DataRow label="Win Rate" value={<span className={winRate !== "—" ? "pnl-positive" : "data-value"}>{winRate !== "—" ? `${winRate}%` : "—"}</span>} />
          <DataRow label="Total P&L" value={<span className={totalPnl >= 0 ? "pnl-positive" : "pnl-negative"}>{closedTrades.length > 0 ? `$${totalPnl.toFixed(2)}` : "—"}</span>} />
          <DataRow label="Trades (5)" value={closedTrades.length} />
          {closedTrades.slice(0, 3).map((t) => (
            <div key={t.id} className="flex items-center justify-between py-1 border-b border-[oklch(0.22_0.06_220/0.3)] text-[10px]">
              <span className="text-[var(--color-muted-foreground)]">{t.model ?? "—"}</span>
              <span className={parseFloat(t.pnl ?? "0") >= 0 ? "pnl-positive" : "pnl-negative"}>
                {t.pnl ? `$${parseFloat(t.pnl).toFixed(2)}` : "—"}
              </span>
            </div>
          ))}
          {closedTrades.length === 0 && <div className="text-[var(--color-muted-foreground)] text-xs text-center py-3">No trades yet</div>}
        </HudPanel>
      </div>
    </PageWrapper>
  );
}
