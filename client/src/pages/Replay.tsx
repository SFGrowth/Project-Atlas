import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, ModelCard, CheckRow, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";

export default function ReplayPage() {
  const { data: reports } = trpc.nexus.recentReports.useQuery({ limit: 200 }, { refetchInterval: 30000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail } = trpc.nexus.reportById.useQuery({ id: selectedId ?? "" }, { enabled: !!selectedId });
  const p = detail?.payload as any ?? null;
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="Replay Engine" subtitle="Step through historical pipeline reports" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "320px 1fr" }}>
          <HudPanel title="Report History">
            {!reports || reports.length === 0 ? <EmptyState message="No reports stored" /> : (
              <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
                {reports.map((r) => (
                  <div key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`p-2 mb-1 rounded cursor-pointer transition-all ${selectedId === r.id ? "bg-[oklch(0.22_0.08_210/0.6)]" : "hover:bg-[oklch(0.18_0.05_220/0.3)]"}`}
                    style={{ border: selectedId === r.id ? "1px solid var(--arc-blue)" : "1px solid transparent" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[var(--arc-cyan)] text-[10px]">{fmtDateTime(r.receivedAt)}</span>
                      <StateBadge value={r.masterState} />
                    </div>
                    <div className="flex items-center gap-2">
                      <SignalBadge value={(r.payload as any)?.ade_decision} />
                      <ApprovalBadge value={(r.payload as any)?.ari_approved} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>
          {!selectedId ? (
            <div className="hud-panel flex items-center justify-center"><EmptyState message="Select a report to replay" /></div>
          ) : !p ? (
            <div className="hud-panel flex items-center justify-center"><EmptyState message="Loading…" /></div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", alignContent: "start" }}>
              <HudPanel title="Market Structure">
                <DataRow label="Trend" value={<SignalBadge value={p.trend} />} />
                <DataRow label="ADX" value={fmt(p.adx)} /><DataRow label="RSI" value={fmt(p.rsi)} />
                <DataRow label="EMA9" value={fmt(p.ema9)} /><DataRow label="VWAP" value={fmt(p.vwap)} />
              </HudPanel>
              <HudPanel title="Decision">
                <DataRow label="ADE" value={<SignalBadge value={p.ade_decision} />} />
                <DataRow label="ARI" value={<ApprovalBadge value={p.ari_approved} />} />
                <DataRow label="TVL" value={<PassFailBadge value={p.tvl_status} />} />
                <DataRow label="Model" value={p.ade_candidate_model ?? "—"} />
                <DataRow label="Edge" value={fmt(p.ade_edge_score)} />
              </HudPanel>
              <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
                <div className="hud-header"><span className="hud-header-dot" />Model Evaluations</div>
                <div className="flex-1 p-3"><div className="grid grid-cols-3 gap-3"><ModelCard label="A1" model={p.model_a1} /><ModelCard label="A3" model={p.model_a3} /><ModelCard label="B1" model={p.model_b1} /></div></div>
              </div>
              <div className="hud-panel hud-panel-br flex flex-col" style={{ gridColumn: "1 / 3" }}>
                <div className="hud-header"><span className="hud-header-dot" />Brain View</div>
                <div className="flex-1 p-3 text-xs text-[var(--arc-cyan)] font-['JetBrains_Mono'] leading-relaxed">{p.brain_view ?? "—"}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
