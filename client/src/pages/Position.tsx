import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";

export default function PositionPage() {
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
        <SectionHeader title="Position State" subtitle="Open position tracking from pipeline and paper trading engine" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <HudPanel title="Pipeline Position State">
            <DataRow label="Trade ID" value={<span className="text-[var(--arc-blue)] text-xs">{p?.trade_id ?? "—"}</span>} />
            <DataRow label="Entry Price" value={fmt(p?.entry_price)} />
            <DataRow label="Stop Price" value={<span className="pnl-negative">{fmt(p?.stop_price)}</span>} />
            <DataRow label="Target Price" value={<span className="pnl-positive">{fmt(p?.target_price)}</span>} />
            <DataRow label="Unrealized P&L" value={
              <span className={p?.unrealized_pnl != null ? (p.unrealized_pnl >= 0 ? "pnl-positive" : "pnl-negative") : "data-value"}>
                {p?.unrealized_pnl != null ? `$${fmt(p.unrealized_pnl)}` : "—"}
              </span>
            } />
            <DataRow label="MFE" value={fmt(p?.mfe)} />
            <DataRow label="MAE" value={fmt(p?.mae)} />
            <DataRow label="Bars in Trade" value={p?.bars_in_trade ?? "—"} />
          </HudPanel>
          <HudPanel title="Paper Trade Position">
            {!openTrade ? (
              <EmptyState message="No open paper trade" />
            ) : (
              <>
                <DataRow label="Direction" value={<SignalBadge value={openTrade.direction} />} />
                <DataRow label="Model" value={openTrade.model ?? "—"} />
                <DataRow label="Entry" value={<span className="data-value glow-cyan">{openTrade.entry ?? "—"}</span>} />
                <DataRow label="Stop" value={<span className="pnl-negative">{openTrade.stop ?? "—"}</span>} />
                <DataRow label="Target" value={<span className="pnl-positive">{openTrade.target ?? "—"}</span>} />
                <DataRow label="P&L" value={
                  <span className={parseFloat(openTrade.pnl ?? "0") >= 0 ? "pnl-positive" : "pnl-negative"}>
                    ${openTrade.pnl ? parseFloat(openTrade.pnl).toFixed(2) : "0.00"}
                  </span>
                } />
                <DataRow label="Current R" value={openTrade.currentR ?? "—"} />
                <DataRow label="MFE" value={openTrade.mfe ?? "—"} />
                <DataRow label="MAE" value={openTrade.mae ?? "—"} />
                <DataRow label="Opened" value={fmtDateTime(openTrade.openedAt)} />
              </>
            )}
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
