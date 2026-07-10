import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, PageWrapper, SectionHeader, EmptyState, fmt } from "@/components/HudComponents";

function ModelDetailCard({ label, model }: { label: string; model: any }) {
  const dir = model?.signal_direction?.toUpperCase();
  const borderColor = dir === "LONG" || dir === "BUY" ? "var(--arc-cyan)" : dir === "SHORT" || dir === "SELL" ? "var(--danger-red)" : "var(--hud-border)";
  return (
    <div className="hud-panel p-4" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="text-lg font-bold tracking-[0.3em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue mb-3">{label}</div>
      <DataRow label="Signal Direction" value={<SignalBadge value={model?.signal_direction} />} />
      <DataRow label="Edge Score" value={
        <span className={`data-value-lg font-['Orbitron'] ${(model?.edge_score ?? 0) > 0.7 ? "glow-cyan" : ""}`}>{fmt(model?.edge_score)}</span>
      } />
      <DataRow label="Confidence" value={fmt(model?.confidence)} />
      <DataRow label="Rank" value={model?.rank ?? "—"} />
      <div className="mt-3 pt-2 border-t border-[var(--hud-border)]">
        <div className="data-label mb-1">Signal Basis</div>
        <div className="text-xs text-[var(--arc-cyan)] font-['JetBrains_Mono'] leading-relaxed">{model?.signal_basis ?? "—"}</div>
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb, isLoading: dbLoading } = trpc.nexus.latestReport.useQuery(undefined, { staleTime: 0, refetchOnMount: true, refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Model Evaluations" subtitle="A1, A3, B1 — signal direction, edge score, and signal basis" />
        {!p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <ModelDetailCard label="A1" model={p.model_a1} />
            <ModelDetailCard label="A3" model={p.model_a3} />
            <ModelDetailCard label="B1" model={p.model_b1} />
            <HudPanel title="Model Consensus" className="col-span-3">
              <div className="grid grid-cols-4 gap-4 py-2">
                {["LONG", "SHORT", "NO_TRADE"].map((dir) => {
                  const count = [p.model_a1, p.model_a3, p.model_b1].filter(m => m?.signal_direction?.toUpperCase() === dir).length;
                  return (
                    <div key={dir} className="text-center">
                      <div className="data-label mb-1">{dir}</div>
                      <div className={`text-2xl font-bold font-['Orbitron'] ${dir === "LONG" ? "pnl-positive" : dir === "SHORT" ? "pnl-negative" : "data-value"}`}>{count}</div>
                    </div>
                  );
                })}
                <div className="text-center">
                  <div className="data-label mb-1">Avg Edge</div>
                  <div className="text-2xl font-bold font-['Orbitron'] glow-cyan">
                    {fmt([p.model_a1?.edge_score, p.model_a3?.edge_score, p.model_b1?.edge_score].filter(Boolean).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)! / 3)}
                  </div>
                </div>
              </div>
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
