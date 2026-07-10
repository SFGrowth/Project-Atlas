import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, StateBadge, SignalBadge, ApprovalBadge, PageWrapper, SectionHeader, EmptyState, fmtDateTime } from "@/components/HudComponents";

export default function TimelinePage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: reports } = trpc.nexus.recentReports.useQuery({ limit: 100 }, { refetchInterval: 10000 });
  const { data: latestFromDb } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Decision Timeline" subtitle="Scrolling event log of historical pipeline ticks" />
        <HudPanel title={`Pipeline Events (${reports?.length ?? 0})`}>
          {!reports || reports.length === 0 ? <EmptyState message="No pipeline events yet" /> : (
            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--hud-border)]">
                    {["Received", "Bar Time", "Master State", "ADE Decision", "ARI Approval", "TVL", "Pipeline Run"].map(h => (
                      <th key={h} className="text-left py-2 px-2 data-label font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="border-b border-[oklch(0.18_0.05_220/0.3)] hover:bg-[oklch(0.18_0.05_220/0.3)] transition-colors">
                      <td className="py-1.5 px-2 text-[var(--arc-cyan)]">{fmtDateTime(r.receivedAt)}</td>
                      <td className="py-1.5 px-2 text-[var(--color-muted-foreground)]">{r.barTime ? new Date(r.barTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="py-1.5 px-2"><StateBadge value={r.masterState} /></td>
                      <td className="py-1.5 px-2"><SignalBadge value={(r.payload as any)?.ade_decision} /></td>
                      <td className="py-1.5 px-2"><ApprovalBadge value={(r.payload as any)?.ari_approved} /></td>
                      <td className="py-1.5 px-2">
                        <span className={`status-badge ${(r.payload as any)?.tvl_status === "PASS" ? "status-live" : "status-error"}`}>
                          {(r.payload as any)?.tvl_status ?? "—"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-[var(--arc-blue)] font-['JetBrains_Mono']">{r.pipelineRunId?.slice(-8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HudPanel>
      </div>
    </PageWrapper>
  );
}
