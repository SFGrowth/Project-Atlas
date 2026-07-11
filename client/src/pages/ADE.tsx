import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, PageWrapper, SectionHeader, EmptyState, fmt } from "@/components/HudComponents";
import type { AdeV2EAR } from "@/../../shared/pipelineTypes";

// ─── Dimension metadata ───────────────────────────────────────────────────────
const DIM_META: Record<string, { label: string; group: string; max: number; desc: string }> = {
  ms01: { label: "Trend Quality",        group: "Market Structure",   max: 20, desc: "EMA alignment + close position vs EMA9/21" },
  ms02: { label: "ADX Regime",           group: "Market Structure",   max: 18, desc: "ADX14 directional strength" },
  ms03: { label: "Volatility Expansion", group: "Market Structure",   max: 14, desc: "ATR14 vs 20-bar average" },
  ms04: { label: "Structure Integrity",  group: "Market Structure",   max: 12, desc: "No structural fractures in the setup bar" },
  ms05: { label: "Compression Quality",  group: "Market Structure",   max: 12, desc: "Overnight range compression (A3 only)" },
  eq01: { label: "Pullback Depth",       group: "Execution Quality",  max: 15, desc: "Retracement depth vs ATR14 (A1 only)" },
  eq02: { label: "Liquidity Clearance",  group: "Execution Quality",  max: 15, desc: "Target distance vs day range" },
  eq03: { label: "Risk Distance",        group: "Execution Quality",  max: 12, desc: "Stop distance vs ATR14" },
  tc01: { label: "Session Quality",      group: "Temporal Context",   max: 10, desc: "AM/PM/OV session premium" },
  tc02: { label: "Day of Week",          group: "Temporal Context",   max: 6,  desc: "Mon/Fri penalty; Tue–Thu neutral" },
  cr01: { label: "Consec. Loss Penalty", group: "Capital & Risk",     max: -15, desc: "−5 per consecutive loss" },
  cr02: { label: "Drawdown Penalty",     group: "Capital & Risk",     max: -20, desc: "Scales with daily drawdown vs limit" },
  si01: { label: "Historical Reliability",group: "System Intelligence",max: 10, desc: "Validated PF and MC pass rate" },
  si02: { label: "Live Stability",       group: "System Intelligence", max: 7,  desc: "Paper trade win rate vs backtest" },
  si03: { label: "Observatory Confidence",group: "System Intelligence",max: 5, desc: "Pipeline data freshness and quality" },
};

function EdgeAttributionPanel({ ear }: { ear: AdeV2EAR }) {
  const dims = [
    { key: "ms01", val: ear.d_ms01 }, { key: "ms02", val: ear.d_ms02 },
    { key: "ms03", val: ear.d_ms03 }, { key: "ms04", val: ear.d_ms04 },
    { key: "ms05", val: ear.d_ms05 ?? 0 }, { key: "eq01", val: ear.d_eq01 ?? 0 },
    { key: "eq02", val: ear.d_eq02 }, { key: "eq03", val: ear.d_eq03 },
    { key: "tc01", val: ear.d_tc01 }, { key: "tc02", val: ear.d_tc02 },
    { key: "cr01", val: ear.d_cr01 ?? 0 }, { key: "cr02", val: ear.d_cr02 ?? 0 },
    { key: "si01", val: ear.d_si01 }, { key: "si02", val: ear.d_si02 },
    { key: "si03", val: ear.d_si03 },
  ].filter(d => d.val !== 0 || DIM_META[d.key]?.max < 0);

  const positive = dims.filter(d => d.val > 0).sort((a, b) => b.val - a.val).slice(0, 6);
  const negative = dims.filter(d => d.val < 0).sort((a, b) => a.val - b.val);

  const normPct = Math.min(100, Math.max(0, ear.norm_score));
  const confidenceColor = ear.confidence_tier === "HIGH" ? "var(--arc-cyan)" : ear.confidence_tier === "MEDIUM" ? "oklch(0.8 0.18 80)" : "oklch(0.65 0.18 30)";

  return (
    <div className="space-y-3">
      {/* Score header */}
      <div className="flex items-center gap-6 p-3 rounded" style={{ background: "oklch(0.10 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
        <div>
          <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] mb-1">NORMALISED SCORE</div>
          <div className="text-2xl font-bold font-['Orbitron']" style={{ color: "var(--arc-cyan)" }}>{ear.norm_score.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] mb-1">RAW</div>
          <div className="text-lg font-bold font-['Orbitron']" style={{ color: "var(--arc-blue)" }}>{ear.raw_score.toFixed(0)} / {ear.raw_max}</div>
        </div>
        <div>
          <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] mb-1">CONFIDENCE</div>
          <div className="text-sm font-bold font-['Orbitron']" style={{ color: confidenceColor }}>{ear.confidence_tier}</div>
        </div>
        <div className="flex-1">
          <div className="w-full h-2 rounded-full bg-[oklch(0.15_0.05_220)] mt-4">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${normPct}%`, background: `linear-gradient(90deg, var(--arc-blue), ${confidenceColor})`, boxShadow: `0 0 6px ${confidenceColor}` }} />
          </div>
          <div className="flex justify-between text-[8px] text-[var(--color-muted-foreground)] mt-1">
            <span>0</span><span>60 THRESHOLD</span><span>80 HIGH</span><span>100</span>
          </div>
        </div>
      </div>

      {/* Positive contributors */}
      {positive.length > 0 && (
        <div>
          <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] mb-2">TOP CONTRIBUTORS</div>
          <div className="space-y-1">
            {positive.map(({ key, val }) => {
              const meta = DIM_META[key];
              const pct = meta ? (val / meta.max) * 100 : 0;
              return (
                <div key={key} className="flex items-center gap-2 py-1">
                  <div className="w-16 text-[9px] font-['Orbitron'] tracking-widest" style={{ color: "var(--arc-blue)" }}>{key.toUpperCase()}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px]" style={{ color: "var(--color-foreground)" }}>{meta?.label ?? key}</span>
                      <span className="text-[10px] font-bold" style={{ color: "var(--arc-cyan)" }}>+{val.toFixed(1)} / {meta?.max}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-[oklch(0.15_0.05_220)]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--arc-cyan)", boxShadow: "0 0 4px var(--arc-cyan)" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Penalties */}
      {negative.length > 0 && (
        <div>
          <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)] mb-2">ACTIVE PENALTIES</div>
          <div className="space-y-1">
            {negative.map(({ key, val }) => {
              const meta = DIM_META[key];
              return (
                <div key={key} className="flex items-center gap-2 py-1">
                  <div className="w-16 text-[9px] font-['Orbitron'] tracking-widest" style={{ color: "oklch(0.65 0.18 30)" }}>{key.toUpperCase()}</div>
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: "var(--color-foreground)" }}>{meta?.label ?? key}</span>
                    <span className="text-[10px] font-bold" style={{ color: "oklch(0.65 0.18 30)" }}>{val.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRankingPanel({ p }: { p: any }) {
  // Prefer ADE v2 model ranking data (norm_score 0-100) over legacy v1 data
  const models = [
    { id: "A1", data: p.model_a1_v2 ?? p.model_a1 },
    { id: "A3", data: p.model_a3_v2 ?? p.model_a3 },
    { id: "B1", data: p.model_b1_v2 ?? p.model_b1 },
  ].filter(m => m.data);

  // Sort by norm_score (v2) or edge_score*100 (v1) descending
  const ranked = [...models].sort((a, b) => {
    const scoreA = a.data?.norm_score ?? (a.data?.edge_score ?? 0) * 100;
    const scoreB = b.data?.norm_score ?? (b.data?.edge_score ?? 0) * 100;
    return scoreB - scoreA;
  });
  const winner = p.ade_candidate_model;
  const threshold = p.ade_v2 ? 60 : 60; // ADE v2 threshold is 60

  return (
    <div className="space-y-2">
      {ranked.map(({ id, data }, idx) => {
        const isWinner = id === winner;
        // Use norm_score (0-100) if available, else fall back to edge_score*100
        const normScore = data?.norm_score ?? (data?.edge_score ?? 0) * 100;
        const confidence = data?.confidence ?? (normScore >= 80 ? "HIGH" : normScore >= 65 ? "MEDIUM" : "LOW");
        const confColor = confidence === "HIGH" ? "var(--arc-cyan)" : confidence === "MEDIUM" ? "oklch(0.8 0.18 80)" : "oklch(0.65 0.18 30)";
        const aboveThreshold = normScore >= threshold;
        return (
          <div key={id} className="p-3 rounded" style={{
            background: isWinner ? "oklch(0.12 0.06 220)" : "oklch(0.09 0.03 220)",
            border: `1px solid ${isWinner ? "var(--arc-blue)" : "oklch(0.22 0.06 220 / 0.3)"}`,
            boxShadow: isWinner ? "0 0 12px oklch(0.65 0.22 220 / 0.2)" : "none",
          }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xs font-bold font-['Orbitron'] w-5 text-center" style={{ color: "var(--color-muted-foreground)" }}>#{idx + 1}</div>
              <div className="text-sm font-bold font-['Orbitron']" style={{ color: isWinner ? "var(--arc-cyan)" : "var(--arc-blue)" }}>{id}</div>
              {isWinner && <span className="text-[8px] tracking-widest px-1.5 py-0.5 rounded" style={{ background: "oklch(0.65 0.22 220 / 0.2)", color: "var(--arc-cyan)", border: "1px solid var(--arc-cyan)" }}>SELECTED</span>}
              {!isWinner && !aboveThreshold && <span className="text-[8px] tracking-widest px-1.5 py-0.5 rounded" style={{ background: "oklch(0.15 0.05 30 / 0.3)", color: "oklch(0.65 0.18 30)", border: "1px solid oklch(0.65 0.18 30 / 0.4)" }}>BELOW THRESHOLD</span>}
              <div className="flex-1" />
              <div className="text-xs font-bold font-['Orbitron']" style={{ color: confColor }}>{confidence}</div>
              <div className="text-sm font-bold font-['Orbitron']" style={{ color: isWinner ? "var(--arc-cyan)" : "var(--color-foreground)" }}>{normScore.toFixed(1)}</div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[oklch(0.15_0.05_220)]">
              {/* Threshold marker at 60% */}
              <div className="relative w-full h-full">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, normScore)}%`, background: isWinner ? "linear-gradient(90deg, var(--arc-blue), var(--arc-cyan))" : "oklch(0.45 0.1 220)", boxShadow: isWinner ? "0 0 6px var(--arc-cyan)" : "none" }} />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-[9px]" style={{ color: "var(--color-muted-foreground)" }}>Signal: <span style={{ color: "var(--arc-blue)" }}>{data?.signal_direction ?? "—"}</span></span>
              {data?.raw_score !== undefined && (
                <span className="text-[9px]" style={{ color: "var(--color-muted-foreground)" }}>Raw: <span style={{ color: "var(--arc-blue)" }}>{data.raw_score.toFixed(0)}/{data.raw_max?.toFixed(0) ?? "—"}</span></span>
              )}
            </div>
          </div>
        );
      })}
      {ranked.length === 0 && <div className="text-[var(--color-muted-foreground)] text-xs text-center py-4">No model evaluations available</div>}
    </div>
  );
}

export default function ADEPage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb, isLoading: dbLoading } = trpc.nexus.latestReport.useQuery(undefined, { staleTime: 0, refetchOnMount: true, refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  const ear: AdeV2EAR | null = p?.ade_v2 ?? null;

  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="ADE v2 — Atlas Decision Engine" subtitle="17-dimension continuous confidence ranking engine (Sprint 081)" />
        {dbLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 rounded bg-[oklch(0.12_0.04_220)] border border-[oklch(0.22_0.06_220/0.3)] animate-pulse" />)}</div>
        ) : !p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="space-y-4">
            {/* Row 1: Decision Output + Model Ranking */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <HudPanel title="Decision Output">
                <DataRow label="Decision" value={<SignalBadge value={p.ade_decision} />} />
                <DataRow label="Candidate Model" value={<span className="data-value glow-cyan font-['Orbitron']">{p.ade_candidate_model ?? "—"}</span>} />
                <DataRow label="Edge Score" value={
                  <span className={`data-value-lg font-['Orbitron'] ${(p.ade_edge_score ?? 0) > 0.7 ? "glow-cyan" : ""}`}>{fmt(p.ade_edge_score)}</span>
                } />
                <DataRow label="Confidence" value={
                  <span className="font-bold font-['Orbitron'] text-xs" style={{
                    color: p.ade_confidence === "HIGH" ? "var(--arc-cyan)" : p.ade_confidence === "MEDIUM" ? "oklch(0.8 0.18 80)" : "oklch(0.65 0.18 30)"
                  }}>{p.ade_confidence ?? "—"}</span>
                } />
                <DataRow label="ADE Version" value={<span className="text-[var(--color-muted-foreground)] text-xs">{p.ade_v2?.version ?? "v1 (legacy)"}</span>} />
                <DataRow label="Rank Order" value={p.ade_rank_order ?? "—"} />
              </HudPanel>
              <HudPanel title="Model Ranking">
                <ModelRankingPanel p={p} />
              </HudPanel>
            </div>

            {/* Row 2: Edge Attribution Record (full width) */}
            {ear ? (
              <HudPanel title={`Edge Attribution Record — ${ear.model} ${ear.direction ?? ""}`}>
                <EdgeAttributionPanel ear={ear} />
              </HudPanel>
            ) : (
              <HudPanel title="Edge Attribution Record">
                <div className="py-6 text-center">
                  <div className="text-[var(--color-muted-foreground)] text-xs mb-2">No EAR data in this payload</div>
                  <div className="text-[9px] tracking-widest text-[var(--color-muted-foreground)]">EAR requires M-14 Sprint 081 build or later</div>
                </div>
              </HudPanel>
            )}

            {/* Row 3: Legacy Edge Score Gauge */}
            <HudPanel title="Edge Score Gauge (Normalised 0–100)">
              <div className="py-2">
                <div className="flex items-center gap-4 mb-2">
                  <span className="data-label">Score</span>
                  <span className="data-value-lg glow-cyan font-['Orbitron']">{ear ? ear.norm_score.toFixed(1) : fmt(p.ade_edge_score)}</span>
                </div>
                <div className="w-full h-3 rounded-full bg-[oklch(0.15_0.05_220)]" style={{ border: "1px solid var(--hud-border)" }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${ear ? Math.min(100, ear.norm_score) : Math.min(100, (p.ade_edge_score ?? 0) * 100)}%`,
                      background: "linear-gradient(90deg, var(--arc-blue), var(--arc-cyan))",
                      boxShadow: "0 0 8px var(--arc-cyan)"
                    }} />
                </div>
                <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)] mt-1">
                  <span>0 — NO EDGE</span><span>60 — THRESHOLD</span><span>80 — HIGH</span><span>100 — PERFECT</span>
                </div>
              </div>
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
