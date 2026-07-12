/**
 * Replay Engine — upgraded for Sprint 090
 * Two tabs: Pipeline Report Replay (existing) + TIE Sequence Replay (new)
 */
import { HudPanel, DataRow, StateBadge, SignalBadge, ApprovalBadge, PassFailBadge, ModelCard, PageWrapper, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Activity, ChevronRight, GitBranch } from "lucide-react";
import { useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(v: string | number | null, dp = 2) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dp);
}
function fmtTime(ts: string | number | null) {
  if (!ts) return "—";
  return new Date(typeof ts === "number" ? ts : ts).toLocaleString();
}
function statusColour(s: string) {
  const map: Record<string, string> = {
    active: "oklch(0.65 0.22 145)",
    completed: "oklch(0.55 0.1 220)",
    failed: "oklch(0.65 0.22 25)",
    expired: "oklch(0.45 0.05 220)",
  };
  return map[s] ?? "oklch(0.55 0.1 220)";
}

// ─── TIE Sequence Replay ──────────────────────────────────────────────────────
function TIEReplayPanel() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: sequences, isLoading } = trpc.tie.recentSequences.useQuery({ limit: 100 });
  const selected = sequences?.find((s) => s.id === selectedId);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "320px 1fr" }}>
      {/* Sequence list */}
      <div
        style={{
          background: "oklch(0.09 0.04 220)",
          border: "1px solid oklch(0.22 0.08 220 / 0.5)",
          borderRadius: 6,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            color: "var(--arc-blue)",
            fontWeight: 600,
          }}
        >
          SEQUENCE HISTORY
        </div>
        {isLoading ? (
          <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>LOADING…</div>
        ) : !sequences?.length ? (
          <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO SEQUENCES YET</div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sequences.map((seq) => (
              <div
                key={seq.id}
                onClick={() => setSelectedId(seq.id)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderBottom: "1px solid oklch(0.16 0.05 220 / 0.3)",
                  background: selectedId === seq.id ? "oklch(0.14 0.06 220)" : "transparent",
                  borderLeft: `2px solid ${selectedId === seq.id ? "var(--arc-blue)" : "transparent"}`,
                  transition: "all 0.12s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: selectedId === seq.id ? "var(--arc-blue)" : "oklch(0.75 0.1 220)" }}>
                    {seq.label ?? seq.sequenceType}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 3,
                      border: `1px solid ${statusColour(seq.completionStatus)}`,
                      color: statusColour(seq.completionStatus),
                    }}
                  >
                    {seq.completionStatus.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                  {fmtTime(seq.startTime)} · {seq.durationBars ? `${seq.durationBars}b` : "ongoing"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sequence detail */}
      {!selectedId ? (
        <div
          style={{
            background: "oklch(0.09 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.5)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <GitBranch size={28} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 10px" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>SELECT A SEQUENCE TO REPLAY</div>
          </div>
        </div>
      ) : selected ? (
        <div
          style={{
            background: "oklch(0.09 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.5)",
            borderRadius: 6,
            padding: 16,
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.1em", marginBottom: 4 }}>
              {selected.label ?? selected.sequenceType}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
              ID: {selected.sequenceId} · Started: {fmtTime(selected.startTime)}
            </div>
          </div>

          {/* Data grid */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3" style={{ marginBottom: 16 }}>
            {[
              ["SEQUENCE TYPE", selected.sequenceType],
              ["STATUS", selected.completionStatus.toUpperCase()],
              ["SESSION", selected.session ?? "—"],
              ["REGIME", selected.regime ?? "—"],
              ["DOMINANT TREND", selected.dominantTrend ?? "—"],
              ["VOLATILITY PROFILE", selected.volatilityProfile ?? "—"],
              ["DURATION", selected.durationBars ? `${selected.durationBars} bars` : "ongoing"],
              ["CONFIDENCE", selected.confidence ? `${fmtNum(selected.confidence, 1)}%` : "—"],
              ["EXPERIENCE SCORE", selected.experienceScore ? fmtNum(selected.experienceScore, 1) : "—"],
              ["EXPECTED OUTCOME", selected.expectedOutcome ?? "—"],
              ["EXPECTED R", selected.expectedR ? `${fmtNum(selected.expectedR, 2)}R` : "—"],
              ["MARKET STRUCTURE", selected.marketStructure ?? "—"],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: "oklch(0.11 0.04 220)",
                  border: "1px solid oklch(0.22 0.08 220 / 0.4)",
                  borderRadius: 4,
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.8 0.12 220)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Behaviour story */}
          {selected.behaviourStory && (
            <div
              style={{
                background: "oklch(0.11 0.04 220)",
                border: "1px solid oklch(0.22 0.08 220 / 0.4)",
                borderRadius: 4,
                padding: "12px 14px",
                marginBottom: 12,
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em", marginBottom: 6 }}>BEHAVIOUR STORY</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.7 0.1 220)", lineHeight: 1.6 }}>{selected.behaviourStory}</div>
            </div>
          )}

          {/* Sequence ID */}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.35 0.05 220)", marginTop: 8 }}>
            SEQ ID: {selected.sequenceId} · DB ID: {selected.id} · Created: {fmtTime(selected.createdAt)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Pipeline Report Replay (original) ───────────────────────────────────────
function PipelineReplayPanel() {
  const { data: reports } = trpc.nexus.recentReports.useQuery({ limit: 200 }, { refetchInterval: 30000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail } = trpc.nexus.reportById.useQuery({ id: selectedId ?? "" }, { enabled: !!selectedId });
  const p = detail?.payload as any ?? null;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "320px 1fr" }}>
      <HudPanel title="Report History">
        {!reports || reports.length === 0 ? <EmptyState message="No reports stored" /> : (
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReplayPage() {
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="Replay Engine" subtitle="Step through historical pipeline reports and TIE behavioural sequences" />
        <Tabs defaultValue="pipeline">
          <TabsList
            style={{
              background: "oklch(0.11 0.04 220)",
              border: "1px solid oklch(0.22 0.08 220 / 0.5)",
              borderRadius: 6,
              padding: 4,
              marginBottom: 16,
            }}
          >
            <TabsTrigger value="pipeline" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
              <Activity size={11} />
              PIPELINE REPORTS
            </TabsTrigger>
            <TabsTrigger value="sequences" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
              <GitBranch size={11} />
              TIE SEQUENCES
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline">
            <PipelineReplayPanel />
          </TabsContent>
          <TabsContent value="sequences">
            <TIEReplayPanel />
          </TabsContent>
        </Tabs>
      </div>
    </PageWrapper>
  );
}
