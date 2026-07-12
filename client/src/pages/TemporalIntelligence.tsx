/**
 * Temporal Intelligence Engine (TIE) — Sprint 090
 * 9-panel dashboard: Active Sequences, Sequence Library, Clusters,
 * Experience Score, Oracle Predictions, Research Candidates,
 * Behaviour Story, Stats, and Manual Process trigger.
 */
import OrionLayout from "@/components/OrionLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BookOpen,
  Brain,
  ChevronRight,
  GitBranch,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
  Telescope,
} from "lucide-react";
import { useState } from "react";

// ─── Colour helpers ───────────────────────────────────────────────────────────
const REGIME_COLOUR: Record<string, string> = {
  TRENDING: "oklch(0.65 0.22 145)",
  COMPRESSED: "oklch(0.65 0.18 55)",
  CHOPPY: "oklch(0.65 0.18 30)",
  VOLATILE: "oklch(0.65 0.22 25)",
  TRANSITIONING: "oklch(0.65 0.15 280)",
};
const STATUS_COLOUR: Record<string, string> = {
  active: "oklch(0.65 0.22 145)",
  completed: "oklch(0.55 0.1 220)",
  failed: "oklch(0.65 0.22 25)",
  expired: "oklch(0.45 0.05 220)",
  candidate: "oklch(0.65 0.18 55)",
  under_review: "oklch(0.65 0.15 280)",
  certified: "oklch(0.65 0.22 145)",
  rejected: "oklch(0.65 0.22 25)",
  pending: "oklch(0.65 0.18 55)",
  resolved: "oklch(0.65 0.22 145)",
  expired_pred: "oklch(0.45 0.05 220)",
};

function statusBadge(status: string, label?: string) {
  const colour = STATUS_COLOUR[status] ?? "oklch(0.55 0.1 220)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 3,
        fontSize: 10,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        fontWeight: 600,
        border: `1px solid ${colour}`,
        color: colour,
        background: `${colour.replace(")", " / 0.12)")}`,
      }}
    >
      {(label ?? status).toUpperCase()}
    </span>
  );
}

function regimeBadge(regime: string | null) {
  if (!regime) return null;
  const colour = REGIME_COLOUR[regime] ?? "oklch(0.55 0.1 220)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 3,
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        border: `1px solid ${colour}`,
        color: colour,
        background: `${colour.replace(")", " / 0.1)")}`,
      }}
    >
      {regime}
    </span>
  );
}

function fmtTime(ts: string | number | null) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  return d.toLocaleString();
}

function fmtNum(v: string | number | null, dp = 2) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(dp);
}

// ─── Sub-panels ───────────────────────────────────────────────────────────────

function StatsPanel() {
  const { data: stats, isLoading } = trpc.tie.stats.useQuery();
  const { data: xp, isLoading: xpLoading } = trpc.tie.experienceScore.useQuery();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {[
        { label: "TOTAL SEQUENCES", value: isLoading ? "…" : stats?.totalSequences ?? 0, icon: GitBranch },
        { label: "ACTIVE NOW", value: isLoading ? "…" : stats?.activeSequences ?? 0, icon: Activity },
        { label: "LIBRARY SIZE", value: isLoading ? "…" : stats?.librarySize ?? 0, icon: BookOpen },
        { label: "CLUSTERS", value: isLoading ? "…" : stats?.clusterCount ?? 0, icon: Layers },
        { label: "CANDIDATES", value: isLoading ? "…" : stats?.candidateCount ?? 0, icon: Telescope },
      ].map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          style={{
            background: "oklch(0.11 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.6)",
            borderRadius: 6,
            padding: "14px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Icon size={12} style={{ color: "var(--arc-blue)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)" }}>{label}</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--arc-blue)" }}>{value}</div>
        </div>
      ))}

      {/* Experience Score */}
      {xp && (
        <div
          style={{
            gridColumn: "1 / -1",
            background: "oklch(0.11 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.6)",
            borderRadius: 6,
            padding: "14px 16px",
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 4 }}>EXPERIENCE SCORE</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--arc-blue)" }}>
              {xpLoading ? "…" : fmtNum(xp.score, 1)}
            </div>
          </div>
          {[
            ["SEQUENCE TYPE", xp.sequenceType],
            ["LABEL", xp.label],
            ["MATCHED CLUSTER", xp.matchedCluster],
            ["SIMILARITY", xp.similarityPct ? `${fmtNum(xp.similarityPct, 1)}%` : null],
            ["EXPECTED OUTCOME", xp.expectedOutcome],
            ["EXPECTED R", xp.expectedR ? `${fmtNum(xp.expectedR, 2)}R` : null],
            ["EXPECTED DURATION", xp.expectedDurationBars ? `${xp.expectedDurationBars}b` : null],
          ].filter(([, v]) => v !== null && v !== undefined && v !== "").map(([label, value]) => (
            <div key={label as string}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "oklch(0.75 0.12 220)" }}>{value}</div>
            </div>
          ))}
          {xp.behaviourStory && (
            <div style={{ flexBasis: "100%", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.65 0.1 220)", marginTop: 4 }}>
              {xp.behaviourStory}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveSequencesPanel() {
  const { data, isLoading } = trpc.tie.activeSequences.useQuery({ limit: 10 });

  if (isLoading) return <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>SCANNING SEQUENCES…</div>;
  if (!data?.length) return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <GitBranch size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO ACTIVE SEQUENCES — AWAITING MARKET DATA</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((seq) => (
        <div
          key={seq.id}
          style={{
            background: "oklch(0.11 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.5)",
            borderRadius: 6,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--arc-blue)" }}>{seq.label ?? seq.sequenceType}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginLeft: 8 }}>#{seq.sequenceId.slice(0, 12)}</span>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {statusBadge(seq.completionStatus)}
              {regimeBadge(seq.regime)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              ["SESSION", seq.session],
              ["TREND", seq.dominantTrend],
              ["VOLATILITY", seq.volatilityProfile],
              ["DURATION", seq.durationBars ? `${seq.durationBars} bars` : null],
              ["CONFIDENCE", seq.confidence ? `${fmtNum(seq.confidence, 1)}%` : null],
              ["EXP SCORE", seq.experienceScore ? fmtNum(seq.experienceScore, 1) : null],
              ["EXPECTED R", seq.expectedR ? `${fmtNum(seq.expectedR, 2)}R` : null],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.75 0.12 220)" }}>{value}</div>
              </div>
            ))}
          </div>
          {seq.behaviourStory && (
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.6 0.08 220)", lineHeight: 1.5, borderTop: "1px solid oklch(0.18 0.06 220)", paddingTop: 8 }}>
              {seq.behaviourStory}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RecentSequencesPanel() {
  const { data, isLoading } = trpc.tie.recentSequences.useQuery({ limit: 20 });

  if (isLoading) return <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>LOADING…</div>;
  if (!data?.length) return <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO SEQUENCES IN DATABASE YET</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid oklch(0.22 0.08 220 / 0.5)" }}>
            {["TYPE", "LABEL", "SESSION", "REGIME", "DURATION", "STATUS", "CONF", "EXP SCORE", "STARTED"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-muted-foreground)", fontSize: 9, letterSpacing: "0.1em", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((seq) => (
            <tr key={seq.id} style={{ borderBottom: "1px solid oklch(0.16 0.05 220 / 0.4)" }}>
              <td style={{ padding: "8px 12px", color: "var(--arc-blue)" }}>{seq.sequenceType}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.75 0.12 220)" }}>{seq.label ?? "—"}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{seq.session ?? "—"}</td>
              <td style={{ padding: "8px 12px" }}>{regimeBadge(seq.regime)}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{seq.durationBars ? `${seq.durationBars}b` : "—"}</td>
              <td style={{ padding: "8px 12px" }}>{statusBadge(seq.completionStatus)}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{seq.confidence ? `${fmtNum(seq.confidence, 1)}%` : "—"}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{seq.experienceScore ? fmtNum(seq.experienceScore, 1) : "—"}</td>
              <td style={{ padding: "8px 12px", color: "oklch(0.5 0.06 220)" }}>{fmtTime(seq.startTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LibraryPanel() {
  const { data, isLoading } = trpc.tie.library.useQuery();

  if (isLoading) return <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>LOADING LIBRARY…</div>;
  if (!data?.length) return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <BookOpen size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>SEQUENCE LIBRARY IS EMPTY — PATTERNS ACCUMULATE AFTER MARKET SESSIONS</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((entry) => (
        <div
          key={entry.id}
          style={{
            background: "oklch(0.11 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.5)",
            borderRadius: 6,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--arc-blue)" }}>{entry.displayName ?? entry.sequenceType}</span>
              {entry.description && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2 }}>{entry.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {statusBadge(entry.researchStatus ?? "candidate")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              ["OCCURRENCES", entry.occurrences],
              ["WIN RATE", entry.winRate ? `${fmtNum(entry.winRate, 1)}%` : null],
              ["AVG R", entry.avgR ? `${fmtNum(entry.avgR, 2)}R` : null],
              ["AVG DURATION", entry.avgDurationBars ? `${fmtNum(entry.avgDurationBars, 1)} bars` : null],
              ["ORACLE ACCURACY", entry.oraclePredictionAccuracy ? `${fmtNum(entry.oraclePredictionAccuracy, 1)}%` : null],
              ["FIRST SEEN", entry.firstObserved ? fmtTime(entry.firstObserved) : null],
              ["LAST SEEN", entry.lastObserved ? fmtTime(entry.lastObserved) : null],
            ].filter(([, v]) => v !== null && v !== undefined).map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.75 0.12 220)" }}>{value}</div>
              </div>
            ))}
          </div>
          {entry.constitutionalNote && (
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.65 0.18 55)", borderTop: "1px solid oklch(0.18 0.06 220)", paddingTop: 8 }}>
              ⚠ {entry.constitutionalNote}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ClustersPanel() {
  const { data, isLoading } = trpc.tie.clusters.useQuery();

  if (isLoading) return <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>LOADING CLUSTERS…</div>;
  if (!data?.length) return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <Layers size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO CLUSTERS FORMED YET — REQUIRES MINIMUM SEQUENCE VOLUME</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {data.map((cluster) => (
        <div
          key={cluster.id}
          style={{
            background: "oklch(0.11 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.5)",
            borderRadius: 6,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--arc-blue)", marginBottom: 4 }}>{cluster.clusterName}</div>
          {cluster.description && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginBottom: 8 }}>{cluster.description}</div>}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {[
              ["OCCURRENCES", cluster.occurrences],
              ["AVG PF", cluster.avgPf ? fmtNum(cluster.avgPf, 2) : null],
              ["AVG DURATION", cluster.avgDurationBars ? `${fmtNum(cluster.avgDurationBars, 1)}b` : null],
              ["CONFIDENCE", cluster.confidence ? `${fmtNum(cluster.confidence, 1)}%` : null],
              ["REGIME", cluster.dominantRegime],
              ["SESSION", cluster.dominantSession],
            ].filter(([, v]) => v !== null && v !== undefined).map(([label, value]) => (
              <div key={label as string}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.75 0.12 220)" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OraclePredictionsPanel() {
  const [status, setStatus] = useState<"pending" | "resolved" | "expired" | "all">("all");
  const { data, isLoading } = trpc.tie.oraclePredictions.useQuery({ status, limit: 20 });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["all", "pending", "resolved", "expired"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: `1px solid ${status === s ? "var(--arc-blue)" : "oklch(0.22 0.08 220 / 0.5)"}`,
              background: status === s ? "oklch(0.14 0.06 220)" : "transparent",
              color: status === s ? "var(--arc-blue)" : "var(--color-muted-foreground)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>LOADING…</div>
      ) : !data?.length ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <Target size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO ORACLE PREDICTIONS YET</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.22 0.08 220 / 0.5)" }}>
                {["PREDICTION ID", "OUTCOME", "PREDICTED R", "CONF", "ACTUAL OUTCOME", "ACTUAL R", "ERROR", "STATUS", "PREDICTED AT"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-muted-foreground)", fontSize: 9, letterSpacing: "0.1em", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid oklch(0.16 0.05 220 / 0.4)" }}>
                  <td style={{ padding: "8px 12px", color: "var(--arc-blue)" }}>{p.predictionId.slice(0, 12)}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.75 0.12 220)" }}>{p.predictedOutcome ?? "—"}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{p.predictedR ? `${fmtNum(p.predictedR, 2)}R` : "—"}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{p.predictedConfidence ? `${fmtNum(p.predictedConfidence, 1)}%` : "—"}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{p.actualOutcome ?? "—"}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{p.actualR ? `${fmtNum(p.actualR, 2)}R` : "—"}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.65 0.1 220)" }}>{p.predictionError ? fmtNum(p.predictionError, 3) : "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{statusBadge(p.status)}</td>
                  <td style={{ padding: "8px 12px", color: "oklch(0.5 0.06 220)" }}>{fmtTime(p.predictedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResearchCandidatesPanel() {
  const [status, setStatus] = useState<"candidate" | "under_review" | "certified" | "rejected" | "all">("all");
  const { data, isLoading } = trpc.tie.researchCandidates.useQuery({ status, limit: 20 });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["all", "candidate", "under_review", "certified", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            style={{
              padding: "4px 12px",
              borderRadius: 4,
              border: `1px solid ${status === s ? "var(--arc-blue)" : "oklch(0.22 0.08 220 / 0.5)"}`,
              background: status === s ? "oklch(0.14 0.06 220)" : "transparent",
              color: status === s ? "var(--arc-blue)" : "var(--color-muted-foreground)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            {s.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 12, padding: 16 }}>LOADING…</div>
      ) : !data?.length ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <Sparkles size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>NO RESEARCH CANDIDATES YET — AUTONOMOUS DISCOVERY RUNS WEEKLY</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.map((c) => (
            <div
              key={c.id}
              style={{
                background: "oklch(0.11 0.04 220)",
                border: "1px solid oklch(0.22 0.08 220 / 0.5)",
                borderRadius: 6,
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--arc-blue)" }}>{c.candidateId.slice(0, 16)}</span>
                  {c.behaviouralSignature && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2 }}>{c.behaviouralSignature}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {statusBadge(c.certificationStatus)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  ["OCCURRENCES", c.occurrenceCount],
                  ["EVIDENCE SCORE", c.evidenceScore ? fmtNum(c.evidenceScore, 2) : null],
                  ["STAT CONFIDENCE", c.statisticalConfidence ? `${fmtNum(c.statisticalConfidence, 1)}%` : null],
                  ["PRIORITY", c.researchPriority],
                  ["DISCOVERED BY", c.discoveredBy],
                  ["FIRST SEEN", c.firstSeen ? fmtTime(c.firstSeen) : null],
                ].filter(([, v]) => v !== null && v !== undefined).map(([label, value]) => (
                  <div key={label as string}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.75 0.12 220)" }}>{value}</div>
                  </div>
                ))}
              </div>
              {c.notes && <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.6 0.08 220)", borderTop: "1px solid oklch(0.18 0.06 220)", paddingTop: 8 }}>{c.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemporalIntelligencePage() {
  const utils = trpc.useUtils();
  const processMutation = trpc.tie.process.useMutation({
    onSuccess: () => {
      utils.tie.stats.invalidate();
      utils.tie.activeSequences.invalidate();
      utils.tie.recentSequences.invalidate();
      utils.tie.library.invalidate();
      utils.tie.clusters.invalidate();
      utils.tie.researchCandidates.invalidate();
      utils.tie.experienceScore.invalidate();
    },
  });

  return (
    <OrionLayout>
      <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <GitBranch size={20} style={{ color: "var(--arc-blue)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-blue)" }}>
                TEMPORAL INTELLIGENCE ENGINE
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>
                SPRINT 090 · SEQUENCE REASONING · BEHAVIOURAL PATTERN LIBRARY
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              border: "1px solid var(--arc-blue)",
              color: "var(--arc-blue)",
              background: "transparent",
            }}
          >
            <RefreshCw size={12} style={{ marginRight: 6, animation: processMutation.isPending ? "spin 1s linear infinite" : "none" }} />
            {processMutation.isPending ? "PROCESSING…" : "RUN TIE ENGINE"}
          </Button>
        </div>

        {/* Stats row */}
        <div style={{ marginBottom: 20 }}>
          <StatsPanel />
        </div>

        {/* Tabbed panels */}
        <Tabs defaultValue="active">
          <TabsList
            style={{
              background: "oklch(0.11 0.04 220)",
              border: "1px solid oklch(0.22 0.08 220 / 0.5)",
              borderRadius: 6,
              padding: 4,
              marginBottom: 16,
              display: "flex",
              flexWrap: "wrap",
              height: "auto",
            }}
          >
            {[
              { value: "active", label: "ACTIVE SEQUENCES", icon: Activity },
              { value: "recent", label: "RECENT SEQUENCES", icon: GitBranch },
              { value: "library", label: "SEQUENCE LIBRARY", icon: BookOpen },
              { value: "clusters", label: "CLUSTERS", icon: Layers },
              { value: "oracle", label: "ORACLE PREDICTIONS", icon: Brain },
              { value: "research", label: "RESEARCH CANDIDATES", icon: Sparkles },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon size={11} />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div
            style={{
              background: "oklch(0.09 0.04 220)",
              border: "1px solid oklch(0.22 0.08 220 / 0.5)",
              borderRadius: 6,
              padding: 16,
            }}
          >
            <TabsContent value="active"><ActiveSequencesPanel /></TabsContent>
            <TabsContent value="recent"><RecentSequencesPanel /></TabsContent>
            <TabsContent value="library"><LibraryPanel /></TabsContent>
            <TabsContent value="clusters"><ClustersPanel /></TabsContent>
            <TabsContent value="oracle"><OraclePredictionsPanel /></TabsContent>
            <TabsContent value="research"><ResearchCandidatesPanel /></TabsContent>
          </div>
        </Tabs>

        {/* Constitutional note */}
        <div
          style={{
            marginTop: 20,
            padding: "10px 16px",
            background: "oklch(0.11 0.04 55 / 0.5)",
            border: "1px solid oklch(0.35 0.12 55 / 0.5)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "oklch(0.65 0.12 55)",
            lineHeight: 1.6,
          }}
        >
          <strong>CONSTITUTIONAL CONSTRAINT:</strong> TIE is a passive observer. It detects, classifies, and archives behavioural sequences from Atlas Memory. It does not generate trade signals, modify risk parameters, or override any model. All sequence intelligence feeds the Research Library for human review only.
        </div>
      </div>
    </OrionLayout>
  );
}
