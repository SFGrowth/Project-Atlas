import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import type { PipelineReportPayload } from "../../../shared/pipelineTypes";
import { OverviewStrip, HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, ModelCard, CheckRow, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime, fmtTime } from "@/components/HudComponents";

export default function ObservatoryPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  // Fall back to most recent DB report if SSE hasn't delivered the catch-up event yet
  const { data: recentReports } = trpc.nexus.recentReports.useQuery({ limit: 1 }, { refetchInterval: 15000 });
  const p = (latestReport?.payload ?? recentReports?.[0]?.payload ?? null) as PipelineReportPayload | null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Observatory" subtitle="Live pipeline state — all modules at a glance" />
        {!p ? <EmptyState message="Awaiting first pipeline report…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <HudPanel title="Market Structure">
              <DataRow label="Trend" value={<SignalBadge value={p.trend} />} />
              <DataRow label="ADX" value={fmt(p.adx)} />
              <DataRow label="ATR" value={fmt(p.atr)} />
              <DataRow label="EMA 9" value={fmt(p.ema9)} />
              <DataRow label="EMA 21" value={fmt(p.ema21)} />
              <DataRow label="EMA 50" value={fmt(p.ema50)} />
              <DataRow label="VWAP" value={fmt(p.vwap)} />
              <DataRow label="RSI" value={fmt(p.rsi)} />
              <DataRow label="Volume Ratio" value={fmt(p.volume_ratio)} />
            </HudPanel>
            <HudPanel title="ADE — Atlas Decision Engine">
              <DataRow label="Decision" value={<SignalBadge value={p.ade_decision} />} />
              <DataRow label="Candidate Model" value={p.ade_candidate_model ?? "—"} />
              <DataRow label="Edge Score" value={fmt(p.ade_edge_score)} />
              <DataRow label="Confidence" value={p.ade_confidence ?? "—"} />
              <DataRow label="Rank Order" value={p.ade_rank_order ?? "—"} />
            </HudPanel>
            <HudPanel title="ARI — Atlas Risk Intelligence">
              <DataRow label="Approval" value={<ApprovalBadge value={p.ari_approved} />} />
              <DataRow label="Approved Risk" value={p.ari_approved_risk ? `$${fmt(p.ari_approved_risk)}` : "—"} />
              <DataRow label="Daily P&L" value={<span className={p.ari_daily_pnl != null ? (p.ari_daily_pnl >= 0 ? "pnl-positive" : "pnl-negative") : "data-value"}>{p.ari_daily_pnl != null ? `$${fmt(p.ari_daily_pnl)}` : "—"}</span>} />
              <DataRow label="Drawdown" value={fmt(p.ari_drawdown)} />
              <DataRow label="Consec. Losses" value={p.ari_consecutive_losses ?? "—"} />
              <DataRow label="Consec. Wins" value={p.ari_consecutive_wins ?? "—"} />
              <DataRow label="Circuit Breaker" value={<span className={`status-badge ${p.ari_circuit_breaker === "OPEN" ? "status-error" : "status-live"}`}>{p.ari_circuit_breaker ?? "—"}</span>} />
            </HudPanel>
            <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
              <div className="hud-header"><span className="hud-header-dot" />Model Evaluations</div>
              <div className="flex-1 p-3"><div className="grid grid-cols-3 gap-3"><ModelCard label="A1" model={p.model_a1} /><ModelCard label="A3" model={p.model_a3} /><ModelCard label="B1" model={p.model_b1} /></div></div>
            </div>
            <HudPanel title="TVL — Trade Verification Layer">
              <DataRow label="Status" value={<PassFailBadge value={p.tvl_status} />} />
              <DataRow label="Execution" value={<span className={`status-badge ${p.tvl_execution_permitted ? "status-live" : "status-error"}`}>{p.tvl_execution_permitted ? "PERMITTED" : "BLOCKED"}</span>} />
              {p.tvl_blocking_rule && <DataRow label="Blocking Rule" value={<span className="text-[var(--danger-red)] text-xs">{p.tvl_blocking_rule}</span>} />}
              <div className="mt-2 space-y-1">{p.tvl_checks?.map((c, i) => <CheckRow key={i} check={c} />) ?? <EmptyState message="No checks" />}</div>
            </HudPanel>
            <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 4" }}>
              <div className="hud-header"><span className="hud-header-dot" />Atlas Brain View</div>
              <div className="flex-1 p-3">
                <div className="text-xs text-[var(--arc-cyan)] leading-relaxed font-['JetBrains_Mono'] min-h-[48px]">{p.brain_view ? <span className="glow-cyan jarvis-flicker">{p.brain_view}</span> : <span className="text-[var(--color-muted-foreground)] italic">No brain view data</span>}</div>
                <div className="mt-3 pt-2 border-t border-[var(--hud-border)] flex gap-6 text-[10px] text-[var(--color-muted-foreground)]">
                  <span><span className="text-[var(--arc-blue)]">Bar Time</span> {fmtTime(p.bar_time)}</span>
                  <span><span className="text-[var(--arc-blue)]">Bar Index</span> {p.bar_index}</span>
                  <span><span className="text-[var(--arc-blue)]">Pipeline Run</span> {p.pipeline_run_id?.slice(-12)}</span>
                  <span><span className="text-[var(--arc-blue)]">Received</span> {fmtDateTime(latestReport?.receivedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
