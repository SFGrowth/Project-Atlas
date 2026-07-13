/**
 * ATLAS PORTFOLIO — Sprint 093
 * Portfolio Intelligence Engine dashboard:
 * Certified models, PCS, capital allocation, correlation matrix,
 * governance pipeline, research candidates, behaviour coverage map.
 */
import { useState } from "react";

// ─── Static portfolio data (Sprint 093 output) ────────────────────────────────

const MODELS = [
  {
    id: "A1",
    name: "Volatility Expansion",
    status: "PRODUCTION",
    regime: ["VOLATILE", "TREND"],
    session: "RTH",
    winRate: 72,
    pf: 3.8,
    pcs: 74.9,
    trades: 52,
    maxDD: 2100,
    expectancy: 175,
    allocation: 35,
    correlationGroup: "momentum",
    entry: "ATR expansion + momentum confirmation",
    notes: "Core production model. Highest frequency.",
  },
  {
    id: "B1",
    name: "Trend Continuation",
    status: "PRODUCTION",
    regime: ["TREND"],
    session: "RTH",
    winRate: 65,
    pf: 2.9,
    pcs: 59.2,
    trades: 38,
    maxDD: 2800,
    expectancy: 163,
    allocation: 30,
    correlationGroup: "trend_follow",
    entry: "EMA stack + pullback to 50 EMA",
    notes: "Complements A1 — fires on trend days after initiation.",
  },
  {
    id: "SB1",
    name: "Slow Burn Directional",
    status: "PRODUCTION",
    regime: ["TREND"],
    session: "RTH+ETH",
    winRate: 71,
    pf: 3.2,
    pcs: 69.2,
    trades: 24,
    maxDD: 1600,
    expectancy: 204,
    allocation: 20,
    correlationGroup: "trend_follow",
    entry: "Daily trend alignment + intraday pullback",
    notes: "Longest hold time. Equity curve smoothing role.",
  },
  {
    id: "ORB-1",
    name: "Opening Range EMA Reclaim",
    status: "PAPER_TRADING",
    regime: ["TREND", "VOLATILE"],
    session: "RTH",
    winRate: 84,
    pf: 6.26,
    pcs: 86.4,
    trades: 13,
    maxDD: 897,
    expectancy: 259,
    allocation: 15,
    correlationGroup: "breakout",
    entry: "ORB breakout + EMA(20) reclaim",
    notes: "Sprint 091: checklist retired. Regime-only gate.",
  },
];

const RESEARCH_CANDIDATES = [
  { id: "RC-002", behaviour: "Mean Reversion", priority: 1, estimatedPCS: 88, estimatedWR: 68, estimatedPF: 2.4, frequency: 85, correlation: 0.05, gap: "RANGE days (79% of all days)", confidence: "MEDIUM", status: "RESEARCH_CANDIDATE" },
  { id: "RC-003", behaviour: "Opening Drive", priority: 2, estimatedPCS: 72, estimatedWR: 74, estimatedPF: 3.1, frequency: 62, correlation: 0.42, gap: "First-candle momentum", confidence: "MEDIUM-HIGH", status: "RESEARCH_CANDIDATE" },
  { id: "RC-004", behaviour: "Liquidity Sweep", priority: 3, estimatedPCS: 79, estimatedWR: 71, estimatedPF: 3.8, frequency: 48, correlation: 0.18, gap: "Stop-hunt reversal setups", confidence: "MEDIUM", status: "RESEARCH_CANDIDATE" },
  { id: "RC-005", behaviour: "Overnight Inventory", priority: 4, estimatedPCS: 61, estimatedWR: 63, estimatedPF: 2.1, frequency: 38, correlation: 0.08, gap: "Pre-market / overnight session", confidence: "LOW-MEDIUM", status: "RESEARCH_CANDIDATE" },
  { id: "RC-006", behaviour: "Trend Exhaustion", priority: 5, estimatedPCS: 55, estimatedWR: 58, estimatedPF: 2.6, frequency: 29, correlation: -0.12, gap: "Counter-trend at exhaustion", confidence: "LOW", status: "RESEARCH_CANDIDATE" },
];

const BEHAVIOURS = [
  { id: "B01", name: "Trend Initiation", coveredBy: "ORB-1", priority: "HIGH" },
  { id: "B02", name: "Volatility Expansion", coveredBy: "A1", priority: "HIGH" },
  { id: "B03", name: "Trend Continuation", coveredBy: "B1", priority: "HIGH" },
  { id: "B04", name: "Slow Burn Directional", coveredBy: "SB1", priority: "HIGH" },
  { id: "B05", name: "Mean Reversion", coveredBy: null, priority: "HIGH" },
  { id: "B06", name: "Opening Drive", coveredBy: null, priority: "HIGH" },
  { id: "B07", name: "Post-News Continuation", coveredBy: null, priority: "MEDIUM" },
  { id: "B08", name: "Overnight Inventory", coveredBy: null, priority: "MEDIUM" },
  { id: "B09", name: "Trend Exhaustion", coveredBy: null, priority: "MEDIUM" },
  { id: "B10", name: "High Volatility Crisis", coveredBy: null, priority: "LOW" },
  { id: "B11", name: "Low Volatility Range", coveredBy: null, priority: "MEDIUM" },
  { id: "B12", name: "Session Transition", coveredBy: null, priority: "LOW" },
  { id: "B13", name: "Liquidity Sweep", coveredBy: null, priority: "HIGH" },
  { id: "B14", name: "Breakout Failure", coveredBy: null, priority: "MEDIUM" },
];

// Correlation matrix
const CORR = {
  "ORB-1": { "ORB-1": 1.00, A1: 0.43, B1: 0.38, SB1: 0.35 },
  A1:      { "ORB-1": 0.43, A1: 1.00, B1: 0.47, SB1: 0.39 },
  B1:      { "ORB-1": 0.38, A1: 0.47, B1: 1.00, SB1: 0.44 },
  SB1:     { "ORB-1": 0.35, A1: 0.39, B1: 0.44, SB1: 1.00 },
};

const GOVERNANCE_STAGES = [
  "RESEARCH_CANDIDATE", "HISTORICAL_VALIDATION", "WALK_FORWARD_VALIDATION",
  "MONTE_CARLO_VALIDATION", "PAPER_TRADING", "CERTIFICATION_REVIEW",
  "PRODUCTION", "PERFORMANCE_MONITORING", "WATCHLIST", "RETIRED",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
  PRODUCTION: "var(--arc-green, #3fb950)",
  PAPER_TRADING: "#e3b341",
  CERTIFICATION_REVIEW: "#58a6ff",
  RESEARCH_CANDIDATE: "#8b949e",
  WATCHLIST: "#f0883e",
  RETIRED: "#f85149",
};

const priorityColor: Record<string, string> = {
  HIGH: "#f85149",
  MEDIUM: "#e3b341",
  LOW: "#3fb950",
};

function corrColor(val: number) {
  if (val >= 0.7) return "#f85149";
  if (val >= 0.4) return "#e3b341";
  if (val >= 0.0) return "#3fb950";
  return "#58a6ff";
}

function pcsColor(pcs: number) {
  if (pcs >= 80) return "#3fb950";
  if (pcs >= 65) return "#e3b341";
  return "#f85149";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.2em", color: "var(--arc-blue)", fontWeight: 700, textTransform: "uppercase" }}>{title}</div>
      {subtitle && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function HudPanel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "oklch(0.10 0.04 220)",
      border: "1px solid oklch(0.22 0.08 220 / 0.6)",
      borderRadius: 6,
      padding: 20,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
      padding: "2px 7px", borderRadius: 3, border: `1px solid ${color}`,
      color, background: `${color}18`, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ─── Portfolio Health Bar ─────────────────────────────────────────────────────

function HealthBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color }}>{value}{max === 100 ? "/100" : ""}</span>
      </div>
      <div style={{ height: 4, background: "oklch(0.18 0.05 220)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.6s cubic-bezier(0.23,1,0.32,1)" }} />
      </div>
    </div>
  );
}

// ─── Model Card ───────────────────────────────────────────────────────────────

function ModelCard({ model }: { model: typeof MODELS[0] }) {
  const sc = statusColor[model.status] ?? "#8b949e";
  return (
    <HudPanel style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.1em" }}>{model.id}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2 }}>{model.name}</div>
        </div>
        <Badge label={model.status.replace("_", " ")} color={sc} />
      </div>

      {/* PCS Ring */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="22" fill="none" stroke="oklch(0.18 0.05 220)" strokeWidth="4" />
            <circle cx="28" cy="28" r="22" fill="none"
              stroke={pcsColor(model.pcs)} strokeWidth="4"
              strokeDasharray={`${(model.pcs / 100) * 138.2} 138.2`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
              style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.23,1,0.32,1)" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: pcsColor(model.pcs), lineHeight: 1 }}>{model.pcs}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--color-muted-foreground)" }}>PCS</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", flex: 1 }}>
          {[
            ["WR", `${model.winRate}%`],
            ["PF", model.pf.toFixed(2)],
            ["Trades/yr", model.trades],
            ["Alloc", `${model.allocation}%`],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{k}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--color-foreground)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {model.regime.map(r => <Badge key={r} label={r} color="var(--arc-blue)" />)}
        <Badge label={model.session} color="#8b949e" />
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", borderTop: "1px solid oklch(0.18 0.05 220)", paddingTop: 8 }}>
        {model.notes}
      </div>
    </HudPanel>
  );
}

// ─── Correlation Matrix ───────────────────────────────────────────────────────

function CorrelationMatrix() {
  const ids = Object.keys(CORR);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 11, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 12px", color: "var(--color-muted-foreground)", textAlign: "left", fontWeight: 400 }}></th>
            {ids.map(id => (
              <th key={id} style={{ padding: "6px 12px", color: "var(--arc-blue)", fontWeight: 700, textAlign: "center" }}>{id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map(row => (
            <tr key={row}>
              <td style={{ padding: "6px 12px", color: "var(--arc-blue)", fontWeight: 700 }}>{row}</td>
              {ids.map(col => {
                const val = CORR[row as keyof typeof CORR][col as keyof typeof CORR["A1"]];
                const isDiag = row === col;
                return (
                  <td key={col} style={{
                    padding: "6px 12px", textAlign: "center",
                    background: isDiag ? "oklch(0.14 0.06 220)" : "transparent",
                    color: isDiag ? "var(--arc-blue)" : corrColor(val),
                    fontWeight: isDiag ? 700 : 400,
                    borderRadius: 3,
                  }}>
                    {val.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {[["≥0.70", "#f85149", "High — monitor"], ["0.40–0.69", "#e3b341", "Moderate — acceptable"], ["<0.40", "#3fb950", "Low — ideal"]].map(([range, color, label]) => (
          <div key={range as string} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, background: color as string, borderRadius: 2 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{range} {label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Governance Pipeline ──────────────────────────────────────────────────────

function GovernancePipeline() {
  const allItems = [...MODELS, ...RESEARCH_CANDIDATES];
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
      {GOVERNANCE_STAGES.map(stage => {
        const stageItems = allItems.filter(m => m.status === stage);
        const sc = statusColor[stage] ?? "#8b949e";
        return (
          <div key={stage} style={{
            minWidth: 120, flex: "0 0 120px",
            background: "oklch(0.10 0.04 220)",
            border: `1px solid ${stageItems.length > 0 ? sc : "oklch(0.18 0.05 220)"}`,
            borderRadius: 6, padding: 10,
            opacity: stageItems.length > 0 ? 1 : 0.4,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: sc, marginBottom: 8, lineHeight: 1.4 }}>
              {stage.replace(/_/g, " ")}
            </div>
            {stageItems.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.35 0.05 220)" }}>—</div>
            ) : stageItems.map(m => (
              <div key={m.id} style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: "var(--arc-blue)", background: "oklch(0.14 0.06 220)",
                padding: "3px 7px", borderRadius: 3, marginBottom: 4,
              }}>
                {m.id}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Behaviour Coverage Map ───────────────────────────────────────────────────

function CoverageMap() {
  const covered = BEHAVIOURS.filter(b => b.coveredBy);
  const uncovered = BEHAVIOURS.filter(b => !b.coveredBy);
  const score = Math.round((covered.length / BEHAVIOURS.length) * 100);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: score >= 50 ? "#e3b341" : "#f85149" }}>{score}%</div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>Portfolio Coverage Score</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{covered.length} of {BEHAVIOURS.length} behaviours covered</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {BEHAVIOURS.map(b => {
          const isCovered = !!b.coveredBy;
          const pc = priorityColor[b.priority] ?? "#8b949e";
          return (
            <div key={b.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 4,
              background: isCovered ? "oklch(0.13 0.06 140 / 0.3)" : "oklch(0.12 0.04 220)",
              border: `1px solid ${isCovered ? "#3fb950" : pc}40`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: isCovered ? "#3fb950" : pc, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isCovered ? "var(--color-foreground)" : "var(--color-muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: isCovered ? "#3fb950" : pc, marginTop: 1 }}>
                  {isCovered ? `✓ ${b.coveredBy}` : `GAP · ${b.priority}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Research Candidates ──────────────────────────────────────────────────────

function ResearchCandidates() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {RESEARCH_CANDIDATES.map(rc => (
        <div key={rc.id} style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "12px 16px", borderRadius: 4,
          background: "oklch(0.10 0.04 220)",
          border: "1px solid oklch(0.22 0.08 220 / 0.6)",
        }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "oklch(0.14 0.06 220)", border: "1px solid var(--arc-blue)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--arc-blue)" }}>{rc.priority}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--arc-blue)" }}>{rc.id}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)" }}>{rc.behaviour}</span>
              <Badge label={rc.confidence} color="#8b949e" />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", marginTop: 2 }}>{rc.gap}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 16px", textAlign: "right", flexShrink: 0 }}>
            {[["EST WR", `${rc.estimatedWR}%`], ["EST PF", rc.estimatedPF.toFixed(1)], ["FREQ/YR", rc.frequency], ["EST PCS", rc.estimatedPCS]].map(([k, v]) => (
              <div key={k as string}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--color-muted-foreground)", letterSpacing: "0.1em" }}>{k}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--color-foreground)" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ width: 44, textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: pcsColor(rc.estimatedPCS) }}>{rc.estimatedPCS}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--color-muted-foreground)" }}>PCS</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "overview" | "models" | "coverage" | "research" | "governance";

export default function Portfolio() {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "models", label: "MODELS" },
    { id: "coverage", label: "COVERAGE MAP" },
    { id: "research", label: "RESEARCH PIPELINE" },
    { id: "governance", label: "GOVERNANCE" },
  ];

  const totalNetProfit = MODELS.reduce((s, m) => s + (m.expectancy * m.trades * 2), 0);
  const avgWR = Math.round(MODELS.filter(m => m.status === "PRODUCTION" || m.status === "PAPER_TRADING").reduce((s, m) => s + m.winRate, 0) / MODELS.length);
  const coverageScore = Math.round((BEHAVIOURS.filter(b => b.coveredBy).length / BEHAVIOURS.length) * 100);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "0.15em", color: "var(--arc-blue)", margin: 0 }}>
              ATLAS PORTFOLIO
            </h1>
            <Badge label="SPRINT 093" color="var(--arc-blue)" />
            <Badge label="PIE v1.0" color="#3fb950" />
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", margin: 0 }}>
            Portfolio Intelligence Engine · Institutional-Grade Quantitative Portfolio Architecture
          </p>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", textAlign: "right" }}>
          <div>CONSTITUTIONAL PRINCIPLE</div>
          <div style={{ color: "var(--arc-blue)", marginTop: 2, maxWidth: 280, lineHeight: 1.5 }}>
            "The portfolio is the product. The individual strategy is simply one component."
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "ACTIVE MODELS", value: MODELS.filter(m => m.status === "PRODUCTION").length, sub: "in production", color: "#3fb950" },
          { label: "PAPER TRADING", value: MODELS.filter(m => m.status === "PAPER_TRADING").length, sub: "pending certification", color: "#e3b341" },
          { label: "RESEARCH QUEUE", value: RESEARCH_CANDIDATES.length, sub: "candidates", color: "#58a6ff" },
          { label: "COVERAGE", value: `${coverageScore}%`, sub: "behaviours covered", color: coverageScore >= 50 ? "#e3b341" : "#f85149" },
          { label: "PORTFOLIO HEALTH", value: "74/100", sub: "PIE score", color: "#e3b341" },
          { label: "CRITICAL GAP", value: "RANGE", sub: "79% of all days", color: "#f85149" },
        ].map(kpi => (
          <HudPanel key={kpi.label} style={{ padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", marginTop: 4 }}>{kpi.sub}</div>
          </HudPanel>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
            padding: "8px 16px", background: "transparent", border: "none",
            borderBottom: tab === t.id ? "2px solid var(--arc-blue)" : "2px solid transparent",
            color: tab === t.id ? "var(--arc-blue)" : "var(--color-muted-foreground)",
            cursor: "pointer", transition: "all 0.15s ease",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Portfolio health */}
          <HudPanel>
            <SectionHeader title="Portfolio Health" subtitle="PIE Assessment — Sprint 093" />
            <HealthBar label="Overall Portfolio Score" value={74} color="#e3b341" />
            <HealthBar label="Regime Coverage" value={28} color="#f85149" />
            <HealthBar label="Prop-Firm Survivability" value={96} color="#3fb950" />
            <HealthBar label="Equity Curve Smoothness" value={81} color="#3fb950" />
            <HealthBar label="Correlation Risk" value={82} color="#3fb950" />
            <HealthBar label="Capital Efficiency" value={73} color="#e3b341" />
            <div style={{ marginTop: 12, padding: "10px 12px", background: "oklch(0.14 0.06 30 / 0.3)", border: "1px solid #f85149", borderRadius: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#f85149", fontWeight: 700, marginBottom: 4 }}>⚠ CRITICAL GAP</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                RANGE days represent 79% of all trading days. No active model covers mean reversion / range behaviour. RC-002 is Priority 1.
              </div>
            </div>
          </HudPanel>

          {/* Capital allocation */}
          <HudPanel>
            <SectionHeader title="PIE Capital Allocation" subtitle="Recommended allocation by model" />
            {MODELS.map(m => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--arc-blue)" }}>{m.id}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{m.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge label={m.status.replace("_", " ")} color={statusColor[m.status] ?? "#8b949e"} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: statusColor[m.status] ?? "#8b949e" }}>{m.allocation}%</span>
                  </div>
                </div>
                <div style={{ height: 6, background: "oklch(0.18 0.05 220)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${m.allocation}%`, background: statusColor[m.status] ?? "#8b949e", borderRadius: 3, transition: "width 0.6s cubic-bezier(0.23,1,0.32,1)" }} />
                </div>
              </div>
            ))}
          </HudPanel>

          {/* Correlation matrix */}
          <HudPanel style={{ gridColumn: "1 / -1" }}>
            <SectionHeader title="Model Correlation Matrix" subtitle="Lower is better — target <0.40 between all models" />
            <CorrelationMatrix />
          </HudPanel>

          {/* Promotion queue */}
          <HudPanel>
            <SectionHeader title="Promotion Queue" subtitle="Models pending state transition" />
            <div style={{ padding: "12px 14px", background: "oklch(0.12 0.06 50 / 0.3)", border: "1px solid #e3b341", borderRadius: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--arc-blue)" }}>ORB-1</span>
                <Badge label="PAPER → PRODUCTION" color="#e3b341" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                Condition: 60-day paper WR ≥ 75% AND PF ≥ 3.5 AND no DD violation
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#e3b341", marginTop: 4 }}>ETA: ~60 days</div>
            </div>
            <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
              No models in retirement queue.
            </div>
          </HudPanel>

          {/* Target portfolio */}
          <HudPanel>
            <SectionHeader title="Target Portfolio (Mature State)" subtitle="9 elite complementary specialists" />
            {[
              { id: "ORB-1", name: "Trend Initiation Specialist", status: "PAPER_TRADING" },
              { id: "A1", name: "Volatility Expansion Specialist", status: "PRODUCTION" },
              { id: "B1", name: "Trend Continuation Specialist", status: "PRODUCTION" },
              { id: "SB1", name: "Slow Burn Specialist", status: "PRODUCTION" },
              { id: "RC-002", name: "Mean Reversion Specialist", status: "RESEARCH_CANDIDATE" },
              { id: "NIX", name: "News Specialist", status: "RESEARCH_CANDIDATE" },
              { id: "RC-005", name: "Overnight Inventory Specialist", status: "RESEARCH_CANDIDATE" },
              { id: "RC-003", name: "Opening Drive Specialist", status: "RESEARCH_CANDIDATE" },
              { id: "RC-006", name: "Trend Exhaustion Specialist", status: "RESEARCH_CANDIDATE" },
            ].map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid oklch(0.18 0.05 220)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[m.status] ?? "#8b949e", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--arc-blue)", width: 60, flexShrink: 0 }}>{m.id}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{m.name}</span>
              </div>
            ))}
          </HudPanel>
        </div>
      )}

      {tab === "models" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {MODELS.map(m => <ModelCard key={m.id} model={m} />)}
          </div>
        </div>
      )}

      {tab === "coverage" && (
        <HudPanel>
          <SectionHeader title="Behavioural Coverage Map" subtitle="14 identified market behaviours · 4 covered · 10 gaps" />
          <CoverageMap />
        </HudPanel>
      )}

      {tab === "research" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <HudPanel>
            <SectionHeader title="Autonomous Research Pipeline" subtitle="Atlas Memory evidence-driven prioritisation — Sprint 093" />
            <ResearchCandidates />
          </HudPanel>
          <HudPanel>
            <SectionHeader title="Next Research Priority" subtitle="PIE Recommendation" />
            <div style={{ padding: "14px 16px", background: "oklch(0.12 0.06 220 / 0.4)", border: "1px solid var(--arc-blue)", borderRadius: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--arc-blue)", marginBottom: 6 }}>RC-002 — Mean Reversion</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
                Fills the RANGE day gap which represents 79% of all trading days. Estimated PCS 88 — highest of all research candidates.
                Near-zero correlation with existing portfolio (0.05) — fires on days all other models sit out.
                Estimated win rate 68%, PF 2.4, ~85 trades/year.
              </div>
              <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "#e3b341" }}>
                NEXT STEP: RC validation — 2-year backtest on RANGE-classified days (VWAP deviation fade strategy)
              </div>
            </div>
          </HudPanel>
        </div>
      )}

      {tab === "governance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <HudPanel>
            <SectionHeader title="Model Governance Pipeline" subtitle="Every model must pass all stages — no bypasses" />
            <GovernancePipeline />
          </HudPanel>
          <HudPanel>
            <SectionHeader title="Governance Principles" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["No Bypass Rule", "No model enters production without completing all validation stages. Atlas may recommend promotions — only statistically validated evidence may approve them."],
                ["Evidence-Based Retirement", "Models are retired based on performance degradation data, not intuition. Watchlist status is triggered by 3 consecutive months below PCS threshold."],
                ["PCS Threshold", "Models below PCS 60 for 60+ days enter Watchlist. Models below PCS 50 for 90+ days are flagged for retirement review."],
                ["Promotion Criteria", "Historical WR ≥ 65%, PF ≥ 2.5, MC profit probability ≥ 90%, prop DD violation risk < 5%, paper trade confirmation."],
              ].map(([title, body]) => (
                <div key={title as string} style={{ padding: "12px 14px", background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.4)", borderRadius: 4 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--arc-blue)", marginBottom: 6 }}>{title}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>{body}</div>
                </div>
              ))}
            </div>
          </HudPanel>
        </div>
      )}
    </div>
  );
}
