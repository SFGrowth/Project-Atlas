import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime, fmtTime } from "@/components/HudComponents";

export default function BrainPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb, isLoading: dbLoading } = trpc.nexus.latestReport.useQuery(undefined, { staleTime: 0, refetchOnMount: true, refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Atlas Brain View" subtitle="Pipeline reasoning and decision rationale" />
        {!p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
              <div className="hud-header"><span className="hud-header-dot" />Brain View — Full Rationale</div>
              <div className="flex-1 p-4">
                <div className="text-sm text-[var(--arc-cyan)] leading-loose font-['JetBrains_Mono'] min-h-[80px] glow-cyan jarvis-flicker">
                  {p.brain_view ?? <span className="text-[var(--color-muted-foreground)] italic">No brain view data</span>}
                </div>
              </div>
            </div>
            <HudPanel title="Pipeline Context">
              <DataRow label="Master State" value={<StateBadge value={p.master_state} />} />
              <DataRow label="Symbol" value={<span className="data-value glow-cyan font-['Orbitron']">{p.symbol}</span>} />
              <DataRow label="Timeframe" value={p.timeframe ? `${p.timeframe}m` : "—"} />
              <DataRow label="Bar Time" value={fmtTime(p.bar_time)} />
              <DataRow label="Bar Index" value={p.bar_index} />
              <DataRow label="Pipeline Run" value={<span className="text-[var(--arc-blue)] text-xs">{p.pipeline_run_id?.slice(-12)}</span>} />
              <DataRow label="Received" value={fmtDateTime(latestReport?.receivedAt)} />
            </HudPanel>
            <HudPanel title="Decision Summary">
              <DataRow label="ADE Decision" value={<SignalBadge value={p.ade_decision} />} />
              <DataRow label="ARI Approval" value={<ApprovalBadge value={p.ari_approved} />} />
              <DataRow label="TVL Status" value={<PassFailBadge value={p.tvl_status} />} />
              <DataRow label="Candidate Model" value={p.ade_candidate_model ?? "—"} />
              <DataRow label="Edge Score" value={fmt(p.ade_edge_score)} />
              <DataRow label="Confidence" value={fmt(p.ade_confidence)} />
              <DataRow label="Rank Order" value={p.ade_rank_order ?? "—"} />
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
