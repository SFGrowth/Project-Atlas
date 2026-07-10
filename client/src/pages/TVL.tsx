import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, PassFailBadge, CheckRow, PageWrapper, SectionHeader, EmptyState } from "@/components/HudComponents";

export default function TVLPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  const allPass = p?.tvl_checks?.every((c: any) => c.passed) ?? false;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="TVL — Trade Verification Layer" subtitle="5-check gate controlling execution permission" />
        {!p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <HudPanel title="Verification Summary">
              <DataRow label="TVL Status" value={<PassFailBadge value={p.tvl_status} />} />
              <DataRow label="Execution" value={
                <span className={`status-badge ${p.tvl_execution_permitted ? "status-live" : "status-error"}`}>
                  {p.tvl_execution_permitted ? "PERMITTED" : "BLOCKED"}
                </span>
              } />
              {p.tvl_blocking_rule && (
                <div className="mt-2 p-2 rounded" style={{ background: "oklch(0.18 0.08 25 / 0.3)", border: "1px solid var(--danger-red)" }}>
                  <div className="text-[9px] text-[var(--color-muted-foreground)] mb-1">BLOCKING RULE</div>
                  <div className="text-xs text-[var(--danger-red)] font-['JetBrains_Mono']">{p.tvl_blocking_rule}</div>
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-[var(--hud-border)]">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${allPass ? "bg-[var(--arc-cyan)]" : "bg-[var(--danger-red)]"}`}
                    style={{ boxShadow: allPass ? "0 0 8px var(--arc-cyan)" : "0 0 8px var(--danger-red)" }} />
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {p.tvl_checks?.filter((c: any) => c.passed).length ?? 0} / {p.tvl_checks?.length ?? 5} checks passed
                  </span>
                </div>
              </div>
            </HudPanel>
            <HudPanel title="Verification Checks">
              {p.tvl_checks && p.tvl_checks.length > 0
                ? <div className="space-y-1">{p.tvl_checks.map((c: any, i: number) => <CheckRow key={i} check={c} />)}</div>
                : <EmptyState message="No checks in payload" />}
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
