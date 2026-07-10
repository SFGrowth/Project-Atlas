import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, PageWrapper, SectionHeader, EmptyState, fmt } from "@/components/HudComponents";

export default function ADEPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb, isLoading: dbLoading } = trpc.nexus.latestReport.useQuery(undefined, { staleTime: 0, refetchOnMount: true, refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="ADE — Atlas Decision Engine" subtitle="Candidate model selection, edge scoring, and ranking" />
        {dbLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 rounded bg-[oklch(0.12_0.04_220)] border border-[oklch(0.22_0.06_220/0.3)] animate-pulse" />)}</div>
        ) : !p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <HudPanel title="Decision Output">
              <DataRow label="Decision" value={<SignalBadge value={p.ade_decision} />} />
              <DataRow label="Candidate Model" value={<span className="data-value glow-cyan font-['Orbitron']">{p.ade_candidate_model ?? "—"}</span>} />
              <DataRow label="Edge Score" value={
                <span className={`data-value-lg font-['Orbitron'] ${(p.ade_edge_score ?? 0) > 0.7 ? "glow-cyan" : ""}`}>{fmt(p.ade_edge_score)}</span>
              } />
              <DataRow label="Confidence" value={fmt(p.ade_confidence)} />
              <DataRow label="Rank Order" value={p.ade_rank_order ?? "—"} />
            </HudPanel>
            <HudPanel title="Model Scores">
              {[
                { label: "A1", model: p.model_a1 },
                { label: "A3", model: p.model_a3 },
                { label: "B1", model: p.model_b1 },
              ].map(({ label, model }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-[oklch(0.22_0.06_220/0.3)]">
                  <span className="text-[var(--arc-blue)] font-bold font-['Orbitron'] text-xs tracking-widest">{label}</span>
                  <SignalBadge value={model?.signal_direction} />
                  <span className="data-value">{fmt(model?.edge_score)}</span>
                  <span className="text-[var(--color-muted-foreground)] text-xs">R{model?.rank ?? "—"}</span>
                </div>
              ))}
            </HudPanel>
            <HudPanel title="Edge Score Gauge" className="col-span-2">
              <div className="py-4">
                <div className="flex items-center gap-4 mb-2">
                  <span className="data-label">Edge Score</span>
                  <span className="data-value-lg glow-cyan font-['Orbitron']">{fmt(p.ade_edge_score)}</span>
                </div>
                <div className="w-full h-3 rounded-full bg-[oklch(0.15_0.05_220)]" style={{ border: "1px solid var(--hud-border)" }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (p.ade_edge_score ?? 0) * 100)}%`,
                      background: "linear-gradient(90deg, var(--arc-blue), var(--arc-cyan))",
                      boxShadow: "0 0 8px var(--arc-cyan)"
                    }} />
                </div>
                <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)] mt-1">
                  <span>0.0 — NO EDGE</span><span>0.5 — MODERATE</span><span>1.0 — STRONG</span>
                </div>
              </div>
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
