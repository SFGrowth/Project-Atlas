import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, ApprovalBadge, PageWrapper, SectionHeader, EmptyState, fmt } from "@/components/HudComponents";

export default function ARIPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  const cbOpen = p?.ari_circuit_breaker === "OPEN";
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="ARI — Atlas Risk Intelligence" subtitle="Risk approval, daily P&L, drawdown, and circuit breaker" />
        {!p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {cbOpen && (
              <div className="hud-panel p-4 col-span-2" style={{ border: "2px solid var(--danger-red)", boxShadow: "0 0 24px oklch(0.55 0.22 25 / 0.4)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-[var(--danger-red)] animate-pulse" style={{ boxShadow: "0 0 12px var(--danger-red)" }} />
                  <span className="text-[var(--danger-red)] font-bold tracking-widest font-['Orbitron'] text-sm">CIRCUIT BREAKER OPEN — ALL TRADING HALTED</span>
                </div>
              </div>
            )}
            <HudPanel title="Risk Decision">
              <DataRow label="Approval" value={<ApprovalBadge value={p.ari_approved} />} />
              <DataRow label="Approved Risk" value={p.ari_approved_risk != null ? <span className="data-value-lg glow-cyan font-['Orbitron']">${fmt(p.ari_approved_risk)}</span> : "—"} />
              <DataRow label="Circuit Breaker" value={
                <span className={`status-badge ${cbOpen ? "status-error" : "status-live"}`}>{p.ari_circuit_breaker ?? "—"}</span>
              } />
            </HudPanel>
            <HudPanel title="Session P&L">
              <DataRow label="Daily P&L" value={
                <span className={`data-value-lg font-['Orbitron'] ${p.ari_daily_pnl != null ? (p.ari_daily_pnl >= 0 ? "pnl-positive" : "pnl-negative") : ""}`}>
                  {p.ari_daily_pnl != null ? `$${fmt(p.ari_daily_pnl)}` : "—"}
                </span>
              } />
              <DataRow label="Drawdown" value={
                <span className={`data-value ${(p.ari_drawdown ?? 0) < -500 ? "pnl-negative" : ""}`}>{fmt(p.ari_drawdown)}</span>
              } />
              <DataRow label="Consec. Losses" value={
                <span className={`data-value ${(p.ari_consecutive_losses ?? 0) >= 3 ? "pnl-negative" : ""}`}>{p.ari_consecutive_losses ?? "—"}</span>
              } />
              <DataRow label="Consec. Wins" value={
                <span className={`data-value ${(p.ari_consecutive_wins ?? 0) >= 3 ? "pnl-positive" : ""}`}>{p.ari_consecutive_wins ?? "—"}</span>
              } />
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
