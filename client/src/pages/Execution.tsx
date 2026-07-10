import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, ApprovalBadge, PassFailBadge, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";

export default function ExecutionPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: openTrade } = trpc.paper.openTrade.useQuery({});
  const { data: latestFromDb } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Execution" subtitle="Paper trading execution state — no broker connection" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <HudPanel title="Execution Gate">
            <DataRow label="ADE Decision" value={<SignalBadge value={p?.ade_decision} />} />
            <DataRow label="ARI Approval" value={<ApprovalBadge value={p?.ari_approved} />} />
            <DataRow label="TVL Status" value={<PassFailBadge value={p?.tvl_status} />} />
            <DataRow label="Execution" value={
              <span className={`status-badge ${p?.tvl_execution_permitted ? "status-live" : "status-error"}`}>
                {p?.tvl_execution_permitted ? "PERMITTED" : "BLOCKED"}
              </span>
            } />
            <DataRow label="Circuit Breaker" value={
              <span className={`status-badge ${p?.ari_circuit_breaker === "OPEN" ? "status-error" : "status-live"}`}>
                {p?.ari_circuit_breaker ?? "—"}
              </span>
            } />
          </HudPanel>
          <HudPanel title="Open Paper Trade">
            {!openTrade ? (
              <EmptyState message="No open paper trade" />
            ) : (
              <>
                <DataRow label="Trade ID" value={<span className="text-[var(--arc-blue)] text-xs">{openTrade.id.slice(-8)}</span>} />
                <DataRow label="Direction" value={<SignalBadge value={openTrade.direction} />} />
                <DataRow label="Model" value={openTrade.model ?? "—"} />
                <DataRow label="Entry" value={<span className="data-value glow-cyan">{openTrade.entry ?? "—"}</span>} />
                <DataRow label="Stop" value={<span className="pnl-negative">{openTrade.stop ?? "—"}</span>} />
                <DataRow label="Target" value={<span className="pnl-positive">{openTrade.target ?? "—"}</span>} />
                <DataRow label="Unrealized P&L" value={
                  <span className={parseFloat(openTrade.pnl ?? "0") >= 0 ? "pnl-positive" : "pnl-negative"}>
                    ${openTrade.pnl ? parseFloat(openTrade.pnl).toFixed(2) : "0.00"}
                  </span>
                } />
                <DataRow label="Current R" value={openTrade.currentR ?? "—"} />
                <DataRow label="Opened" value={fmtDateTime(openTrade.openedAt)} />
              </>
            )}
          </HudPanel>
          <HudPanel title="Execution Mode" className="col-span-2">
            <div className="flex items-center gap-4 py-3">
              <div className="w-4 h-4 rounded-full bg-[var(--stark-gold)] animate-pulse" style={{ boxShadow: "0 0 12px var(--stark-gold)" }} />
              <div>
                <div className="text-sm font-bold text-[var(--stark-gold)] tracking-widest font-['Orbitron']">PAPER TRADING MODE</div>
                <div className="text-xs text-[var(--color-muted-foreground)] mt-1">No real orders. Simulated execution only. Account: ATLAS_MNQ_PAPER</div>
              </div>
            </div>
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
