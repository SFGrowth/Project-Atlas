import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, ModelCard, CheckRow, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";

export default function ReportsPage() {
  const { data: reports } = trpc.nexus.recentReports.useQuery({ limit: 200 }, { refetchInterval: 15000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail } = trpc.nexus.reportById.useQuery({ id: selectedId ?? "" }, { enabled: !!selectedId });
  const p = detail?.payload as any ?? null;
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="Reports" subtitle="Full pipeline report archive with payload inspection" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "360px 1fr" }}>
          <HudPanel title={`Reports (${reports?.length ?? 0})`}>
            {!reports || reports.length === 0 ? <EmptyState message="No reports stored" /> : (
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
                {reports.map((r) => (
                  <div key={r.id} onClick={() => setSelectedId(r.id)}
                    className={`p-2 mb-1 rounded cursor-pointer transition-all ${selectedId === r.id ? "bg-[oklch(0.22_0.08_210/0.6)]" : "hover:bg-[oklch(0.18_0.05_220/0.3)]"}`}
                    style={{ border: selectedId === r.id ? "1px solid var(--arc-blue)" : "1px solid transparent" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[var(--arc-cyan)] text-[10px]">{fmtDateTime(r.receivedAt)}</span>
                      <StateBadge value={r.masterState} />
                    </div>
                    <div className="flex items-center gap-2">
                      <SignalBadge value={(r.payload as any)?.ade_decision} />
                      <ApprovalBadge value={(r.payload as any)?.ari_approved} />
                      <span className="text-[9px] text-[var(--color-muted-foreground)]">{r.pipelineRunId?.slice(-6)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>
          {!selectedId ? (
            <div className="hud-panel flex items-center justify-center"><EmptyState message="Select a report to inspect" /></div>
          ) : !p ? (
            <div className="hud-panel flex items-center justify-center"><EmptyState message="Loading…" /></div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <HudPanel title="Pipeline Context">
                  <DataRow label="Master State" value={<StateBadge value={p.master_state} />} />
                  <DataRow label="Symbol" value={p.symbol} /><DataRow label="Timeframe" value={p.timeframe} />
                  <DataRow label="Bar Time" value={fmtDateTime(p.bar_time)} />
                  <DataRow label="Pipeline Run" value={<span className="text-[var(--arc-blue)] text-xs">{p.pipeline_run_id}</span>} />
                  <DataRow label="Event ID" value={<span className="text-[var(--arc-blue)] text-xs">{p.event_id}</span>} />
                </HudPanel>
                <HudPanel title="Decision">
                  <DataRow label="ADE" value={<SignalBadge value={p.ade_decision} />} />
                  <DataRow label="ARI" value={<ApprovalBadge value={p.ari_approved} />} />
                  <DataRow label="TVL" value={<PassFailBadge value={p.tvl_status} />} />
                  <DataRow label="Candidate" value={p.ade_candidate_model ?? "—"} />
                  <DataRow label="Edge Score" value={fmt(p.ade_edge_score)} />
                  <DataRow label="Risk" value={p.ari_approved_risk ? `$${fmt(p.ari_approved_risk)}` : "—"} />
                </HudPanel>
                <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
                  <div className="hud-header"><span className="hud-header-dot" />Model Evaluations</div>
                  <div className="flex-1 p-3"><div className="grid grid-cols-3 gap-3"><ModelCard label="A1" model={p.model_a1} /><ModelCard label="A3" model={p.model_a3} /><ModelCard label="B1" model={p.model_b1} /></div></div>
                </div>
                <HudPanel title="TVL Checks" className="col-span-2">
                  {p.tvl_checks?.map((c: any, i: number) => <CheckRow key={i} check={c} />) ?? <EmptyState message="No checks" />}
                </HudPanel>
                <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
                  <div className="hud-header"><span className="hud-header-dot" />Brain View</div>
                  <div className="flex-1 p-3 text-xs text-[var(--arc-cyan)] font-['JetBrains_Mono'] leading-relaxed">{p.brain_view ?? "—"}</div>
                </div>
                <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
                  <div className="hud-header"><span className="hud-header-dot" />Raw Payload</div>
                  <div className="flex-1 p-3"><pre className="text-[10px] text-[var(--color-muted-foreground)] font-['JetBrains_Mono'] overflow-auto" style={{ maxHeight: "300px" }}>{JSON.stringify(p, null, 2)}</pre></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
