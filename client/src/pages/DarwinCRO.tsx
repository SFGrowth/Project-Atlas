/**
 * DARWIN CRO Dashboard — Sprint 101
 * Chief Research Officer autonomous research orchestration interface.
 * 10 panels: Stats, Research Queue, Promotion Gates, Rejection Registry,
 * Work Log, CRO Reports, Portfolio Gaps, ERV Chart, Manual Enqueue, Trigger Controls.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  FlaskConical, RefreshCw, Play, AlertTriangle, CheckCircle2,
  Clock, TrendingUp, XCircle, ChevronRight, BarChart3,
  Layers, Brain, Target, Zap, Archive,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtNum(v: string | number | null | undefined, dp = 1) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(dp);
}

const STAGE_COLOURS: Record<string, string> = {
  OBSERVATION: "oklch(0.55 0.15 260)",
  EVIDENCE: "oklch(0.55 0.18 200)",
  REPLAY: "oklch(0.55 0.18 170)",
  BACKTEST: "oklch(0.60 0.18 140)",
  WALK_FORWARD: "oklch(0.60 0.18 100)",
  MONTE_CARLO: "oklch(0.60 0.18 60)",
  PAPER: "oklch(0.60 0.18 30)",
  FORWARD_VALIDATION: "oklch(0.60 0.18 10)",
  PRODUCTION_CANDIDATE: "oklch(0.70 0.20 140)",
  REJECTED: "oklch(0.45 0.12 15)",
  ARCHIVED: "oklch(0.40 0.05 220)",
};

function StageBadge({ stage }: { stage: string }) {
  const colour = STAGE_COLOURS[stage] ?? "oklch(0.45 0.08 220)";
  return (
    <span style={{
      background: colour + "22",
      border: `1px solid ${colour}`,
      color: colour,
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      letterSpacing: "0.08em",
      padding: "2px 6px",
      borderRadius: 3,
      whiteSpace: "nowrap",
    }}>
      {stage.replace(/_/g, " ")}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const col = status === "ACTIVE" ? "var(--arc-green)" : status === "COMPLETED" ? "oklch(0.55 0.18 200)" : status === "REJECTED" ? "oklch(0.55 0.15 15)" : "oklch(0.45 0.08 220)";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, display: "inline-block", marginRight: 5 }} />;
}

// ─── Panel 1: Stats Overview ──────────────────────────────────────────────────

function StatsPanel() {
  const { data: stats, isLoading } = trpc.darwin.croDashboardStats.useQuery();

  if (isLoading) return <div className="hud-panel p-4 text-xs text-[var(--color-muted-foreground)] font-mono">LOADING STATS…</div>;
  if (!stats) return <div className="hud-panel p-4 text-xs text-[var(--color-muted-foreground)] font-mono">NO DATA</div>;

  const tiles = [
    { label: "ACTIVE QUEUE", value: stats.activeQueueSize, icon: FlaskConical, colour: "var(--arc-blue)" },
    { label: "TOTAL WORK ITEMS", value: stats.totalWorkItems, icon: Brain, colour: "oklch(0.65 0.18 200)" },
    { label: "TOTAL PROMOTED", value: stats.totalPromotions, icon: TrendingUp, colour: "var(--arc-green)" },
    { label: "TOTAL REJECTED", value: stats.totalRejections, icon: XCircle, colour: "oklch(0.55 0.15 15)" },
    { label: "STAGE BUCKETS", value: stats.stageDistribution.length, icon: Zap, colour: "oklch(0.65 0.18 60)" },
    { label: "REGIME COVERAGE", value: `${fmtNum(stats.regimeCoverageScore, 0)}%`, icon: Layers, colour: "oklch(0.65 0.18 140)" },
    { label: "SESSION COVERAGE", value: `${fmtNum(stats.sessionCoverageScore, 0)}%`, icon: Target, colour: "oklch(0.65 0.18 100)" },
    { label: "LAST REPORT", value: stats.latestReport ? fmtTs(new Date(stats.latestReport.reportDate).toISOString()) : "—", icon: Clock, colour: "oklch(0.55 0.08 220)" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="hud-panel p-3 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <t.icon size={12} style={{ color: t.colour }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)" }}>{t.label}</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: t.colour, lineHeight: 1.1 }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel 2: Research Queue ──────────────────────────────────────────────────

function ResearchQueuePanel() {
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const { data: queue, isLoading } = trpc.darwin.croResearchQueue.useQuery({ status: statusFilter === "ALL" ? undefined : statusFilter, limit: 50 });
  const utils = trpc.useUtils();
  const rejectMutation = trpc.darwin.rejectResearch.useMutation({
    onSuccess: () => {
      utils.darwin.croResearchQueue.invalidate();
      utils.darwin.croDashboardStats.invalidate();
      toast.success("Research rejected — moved to rejection registry.");
    },
  });

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>RESEARCH QUEUE</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL</SelectItem>
            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
            <SelectItem value="IN_PROGRESS">IN PROGRESS</SelectItem>
            <SelectItem value="COMPLETED">COMPLETED</SelectItem>
            <SelectItem value="REJECTED">REJECTED</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">LOADING…</div>
      ) : !queue?.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO ITEMS IN QUEUE</div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
                {["RANK", "HYPOTHESIS", "STAGE", "ERV", "EVIDENCE", "CONFIDENCE", "ORIGIN", "STATUS", ""].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "var(--color-muted-foreground)", letterSpacing: "0.08em", fontSize: 9, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.researchId} style={{ borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)" }}>
                  <td style={{ padding: "5px 8px", color: "var(--arc-blue)", fontWeight: 700 }}>{r.priority ?? "—"}</td>
                  <td style={{ padding: "5px 8px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-foreground)" }} title={r.hypothesis}>{r.hypothesis}</td>
                  <td style={{ padding: "5px 8px" }}><StageBadge stage={r.currentStage} /></td>
                  <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 60)", fontWeight: 600 }}>{fmtNum(r.expectedResearchValue, 2)}</td>
                  <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 140)" }}>{fmtNum(r.evidenceScore, 1)}</td>
                  <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 200)" }}>{fmtNum(r.confidence, 1)}%</td>
                  <td style={{ padding: "5px 8px", color: "var(--color-muted-foreground)" }}>{r.origin}</td>
                  <td style={{ padding: "5px 8px" }}><StatusDot status={r.status} /><span style={{ color: "var(--color-muted-foreground)" }}>{r.status}</span></td>
                  <td style={{ padding: "5px 8px" }}>
                    {r.status === "ACTIVE" && (
                      <button
                        onClick={() => rejectMutation.mutate({ researchId: r.researchId, reason: "Manual rejection from CRO Dashboard" })}
                        style={{ background: "transparent", border: "1px solid oklch(0.45 0.12 15)", color: "oklch(0.55 0.15 15)", padding: "2px 6px", fontSize: 9, cursor: "pointer", borderRadius: 3 }}
                        title="Reject"
                      >
                        REJECT
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Panel 3: Promotion Gates ─────────────────────────────────────────────────

function PromotionGatesPanel() {
  const { data: gates, isLoading } = trpc.darwin.croPromotionGates.useQuery({ limit: 20 });

  const GATE_ICONS: Record<string, React.ElementType> = {
    PASS: CheckCircle2,
    FAIL: XCircle,
    PENDING: Clock,
    OVERRIDE: AlertTriangle,
  };

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>PROMOTION GATES</span>
      {isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">LOADING…</div>
      ) : !gates?.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO GATE EVENTS YET — GATES WILL APPEAR AS RESEARCH ADVANCES THROUGH STAGES</div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
                {["RESEARCH ID", "FROM", "TO", "RESULT", "EVIDENCE", "CONFIDENCE", "NOTES", "DATE"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "var(--color-muted-foreground)", letterSpacing: "0.08em", fontSize: 9, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gates.map((g, i) => {
                    const Icon = GATE_ICONS[g.decision] ?? Clock;
                    const col = g.decision === "PROMOTED" ? "var(--arc-green)" : g.decision === "BLOCKED" ? "oklch(0.55 0.15 15)" : "oklch(0.55 0.12 60)";
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)" }}>
                        <td style={{ padding: "5px 8px", color: "var(--arc-blue)", fontSize: 9 }}>{g.researchId.slice(0, 12)}…</td>
                        <td style={{ padding: "5px 8px" }}><StageBadge stage={g.fromStage} /></td>
                        <td style={{ padding: "5px 8px" }}><StageBadge stage={g.toStage} /></td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: col }}>
                            <Icon size={11} />{g.decision}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 140)" }}>{fmtNum(g.evidenceScore, 1)}</td>
                        <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 200)" }}>{fmtNum(g.confidenceScore, 1)}%</td>
                        <td style={{ padding: "5px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-muted-foreground)" }} title={g.decisionRationale ?? ""}>{g.decisionRationale ?? "—"}</td>
                        <td style={{ padding: "5px 8px", color: "var(--color-muted-foreground)" }}>{fmtTs(g.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Panel 4: Rejection Registry ─────────────────────────────────────────────

function RejectionRegistryPanel() {
  const { data: rejections, isLoading } = trpc.darwin.croRejectionRegistry.useQuery({ limit: 30 });

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "oklch(0.55 0.15 15)" }}>REJECTION REGISTRY</span>
      {isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">LOADING…</div>
      ) : !rejections?.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO REJECTIONS YET — ALL RESEARCH IS ACTIVE</div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
                {["HYPOTHESIS", "REASON", "CODE", "STAGE AT REJECTION", "EVIDENCE", "LESSON LEARNED", "DATE"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", color: "var(--color-muted-foreground)", letterSpacing: "0.08em", fontSize: 9, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rejections.map((r) => (
                <tr key={r.rejectionId} style={{ borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)" }}>
                  <td style={{ padding: "5px 8px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-foreground)" }} title={r.hypothesisSummary}>{r.hypothesisSummary}</td>
                  <td style={{ padding: "5px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "oklch(0.55 0.15 15)" }} title={r.rejectionReason}>{r.rejectionReason}</td>
                  <td style={{ padding: "5px 8px", color: "var(--color-muted-foreground)" }}>{r.reasonCode ?? "—"}</td>
                  <td style={{ padding: "5px 8px" }}><StageBadge stage={r.rejectionStage} /></td>
                  <td style={{ padding: "5px 8px", color: "oklch(0.65 0.18 140)" }}>{fmtNum(r.evidenceAtRejection, 1)}</td>
                  <td style={{ padding: "5px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "oklch(0.55 0.18 200)" }} title={r.lessonLearned ?? ""}>{r.lessonLearned ?? "—"}</td>
                  <td style={{ padding: "5px 8px", color: "var(--color-muted-foreground)" }}>{fmtTs(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Panel 5: Work Log ────────────────────────────────────────────────────────

function WorkLogPanel() {
  const { data: log, isLoading } = trpc.darwin.croWorkLog.useQuery({ limit: 50 });

  const ACTION_COLOURS: Record<string, string> = {
    ENQUEUE: "var(--arc-blue)",
    PRIORITISE: "oklch(0.65 0.18 200)",
    PROMOTE: "var(--arc-green)",
    REJECT: "oklch(0.55 0.15 15)",
    REPLAY: "oklch(0.65 0.18 60)",
    REPORT: "oklch(0.65 0.18 140)",
    ANALYSE: "oklch(0.65 0.18 260)",
    SCAN: "oklch(0.55 0.12 220)",
    DAILY_WORK: "oklch(0.65 0.18 200)",
    WEEKLY_REPORT: "oklch(0.65 0.18 140)",
  };

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>AUTONOMOUS WORK LOG</span>
      {isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">LOADING…</div>
      ) : !log?.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO WORK LOG ENTRIES YET — DARWIN CRO WILL LOG ACTIVITY AFTER FIRST DAILY RUN</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
          {log.map((entry) => {
            const col = ACTION_COLOURS[entry.workType] ?? "var(--color-muted-foreground)";
            return (
              <div key={entry.workId} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", whiteSpace: "nowrap", minWidth: 110 }}>{fmtTs(entry.createdAt)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: col, fontWeight: 700, minWidth: 80, whiteSpace: "nowrap" }}>{entry.workType}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)", flex: 1 }}>{entry.description}</span>
                {entry.targetResearchId && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", whiteSpace: "nowrap" }}>{(entry.targetResearchId as string).slice(0, 10)}…</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Panel 6: CRO Reports ─────────────────────────────────────────────────────

function CroReportsPanel() {
  const { data: reports, isLoading } = trpc.darwin.croCroReports.useQuery({ limit: 10 });
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>CRO WEEKLY REPORTS</span>
      {isLoading ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">LOADING…</div>
      ) : !reports?.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO CRO REPORTS YET — FIRST REPORT GENERATES SUNDAY 20:00 ET</div>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.reportId} className="hud-panel" style={{ padding: "10px 14px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === r.reportId ? null : r.reportId)}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--arc-blue)", fontWeight: 700 }}>{fmtTs(r.createdAt)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{fmtTs(r.createdAt)}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.18 140)" }}>PORTFOLIO SCORE: {fmtNum(r.portfolioImprovementScore, 1)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.18 200)" }}>REGIME: {fmtNum(r.regimeCoverageScore, 0)}%</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.18 100)" }}>SESSION: {fmtNum(r.sessionCoverageScore, 0)}%</span>
                <ChevronRight size={12} style={{ color: "var(--color-muted-foreground)", transform: expanded === r.reportId ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </div>
              {expanded === r.reportId && r.fullReportMarkdown && (
                <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)", lineHeight: 1.7, borderTop: "1px solid oklch(0.22 0.08 220 / 0.4)", paddingTop: 10, whiteSpace: "pre-wrap" }}>
                  {r.fullReportMarkdown}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel 7: Portfolio Gaps ──────────────────────────────────────────────────

function PortfolioGapsPanel() {
  const { data: stats } = trpc.darwin.croDashboardStats.useQuery();

  const REGIMES = ["TRENDING_BULL", "TRENDING_BEAR", "RANGE", "VOLATILE", "TRANSITION"];
  const SESSIONS = ["AM_OPEN", "AM_DRIVE", "LUNCH", "PM_DRIVE", "PM_CLOSE", "OV"];

  const covered_regimes: string[] = (stats as any)?.coveredRegimes ?? [];
  const covered_sessions: string[] = (stats as any)?.coveredSessions ?? [];

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>PORTFOLIO COVERAGE GAPS</span>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 8 }}>REGIME COVERAGE</div>
          <div className="flex flex-col gap-1">
            {REGIMES.map(r => {
              const covered = covered_regimes.includes(r);
              return (
                <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: covered ? "var(--arc-green)" : "oklch(0.55 0.15 15)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: covered ? "var(--color-foreground)" : "oklch(0.55 0.15 15)" }}>{r.replace(/_/g, " ")}</span>
                  {!covered && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.15 15)" }}>GAP</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 8 }}>SESSION COVERAGE</div>
          <div className="flex flex-col gap-1">
            {SESSIONS.map(s => {
              const covered = covered_sessions.includes(s);
              return (
                <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: covered ? "var(--arc-green)" : "oklch(0.55 0.15 15)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: covered ? "var(--color-foreground)" : "oklch(0.55 0.15 15)" }}>{s.replace(/_/g, " ")}</span>
                  {!covered && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.15 15)" }}>GAP</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Panel 8: ERV Chart ───────────────────────────────────────────────────────

function ERVChartPanel() {
  const { data: queue } = trpc.darwin.croResearchQueue.useQuery({ status: "ACTIVE", limit: 20 });

  const sorted = useMemo(() => {
    if (!queue) return [];
    return [...queue].sort((a, b) => Number(b.expectedResearchValue) - Number(a.expectedResearchValue)).slice(0, 10);
  }, [queue]);

  const maxERV = sorted.length ? Math.max(...sorted.map(r => Number(r.expectedResearchValue))) : 1;

  return (
    <div className="hud-panel p-4 flex flex-col gap-3">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>EXPECTED RESEARCH VALUE — TOP 10</span>
      {!sorted.length ? (
        <div className="text-xs text-[var(--color-muted-foreground)] font-mono py-4 text-center">NO ACTIVE RESEARCH — QUEUE EMPTY</div>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((r, i) => {
            const erv = Number(r.expectedResearchValue);
            const pct = maxERV > 0 ? (erv / maxERV) * 100 : 0;
            const col = i === 0 ? "var(--arc-blue)" : i < 3 ? "oklch(0.65 0.18 200)" : "oklch(0.55 0.12 220)";
            return (
              <div key={r.researchId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: col, minWidth: 16, textAlign: "right" }}>#{i + 1}</span>
                <div style={{ flex: 1, height: 16, background: "oklch(0.14 0.04 220)", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: col, opacity: 0.7, transition: "width 0.3s ease" }} />
                  <span style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "90%" }}>
                    {r.hypothesis.slice(0, 60)}{r.hypothesis.length > 60 ? "…" : ""}
                  </span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: col, minWidth: 40, textAlign: "right", fontWeight: 700 }}>{fmtNum(erv, 2)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Panel 9: Manual Enqueue ──────────────────────────────────────────────────

function ManualEnqueuePanel() {
  const [hypothesis, setHypothesis] = useState("");
  const [behaviourClass, setBehaviourClass] = useState("");
  const [targetRegimes, setTargetRegimes] = useState("");
  const [targetSessions, setTargetSessions] = useState("");
  const [noveltyScore, setNoveltyScore] = useState("50");
  const utils = trpc.useUtils();

  const enqueue = trpc.darwin.enqueueResearch.useMutation({
    onSuccess: (data) => {
      toast.success(`Research enqueued — ID: ${data.researchId}`);
      setHypothesis("");
      setBehaviourClass("");
      setTargetRegimes("");
      setTargetSessions("");
      setNoveltyScore("50");
      utils.darwin.croResearchQueue.invalidate();
      utils.darwin.croDashboardStats.invalidate();
    },
    onError: (err) => {
      toast.error(`Enqueue failed: ${err.message}`);
    },
  });

  return (
    <div className="hud-panel p-4 flex flex-col gap-4">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>MANUAL RESEARCH ENQUEUE</span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>HYPOTHESIS *</Label>
          <Textarea
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            placeholder="Describe the research hypothesis in detail…"
            rows={3}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)", color: "var(--color-foreground)" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>BEHAVIOUR CLASS</Label>
          <Input
            value={behaviourClass}
            onChange={e => setBehaviourClass(e.target.value)}
            placeholder="e.g. MOMENTUM_CONTINUATION"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)", color: "var(--color-foreground)" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>TARGET REGIMES (comma-separated)</Label>
          <Input
            value={targetRegimes}
            onChange={e => setTargetRegimes(e.target.value)}
            placeholder="e.g. TRENDING_BULL,TRENDING_BEAR"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)", color: "var(--color-foreground)" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>TARGET SESSIONS (comma-separated)</Label>
          <Input
            value={targetSessions}
            onChange={e => setTargetSessions(e.target.value)}
            placeholder="e.g. AM_OPEN,AM_DRIVE"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)", color: "var(--color-foreground)" }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)" }}>NOVELTY SCORE (0–100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={noveltyScore}
            onChange={e => setNoveltyScore(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.6)", color: "var(--color-foreground)" }}
          />
        </div>
      </div>
      <Button
        onClick={() => {
          if (!hypothesis.trim()) return;
          enqueue.mutate({
            hypothesis: hypothesis.trim(),
            behaviourClass: behaviourClass.trim() || undefined,
            targetRegimes: targetRegimes.trim() || undefined,
            targetSessions: targetSessions.trim() || undefined,
            noveltyScore: noveltyScore ? Number(noveltyScore) : undefined,
          });
        }}
        disabled={!hypothesis.trim() || enqueue.isPending}
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", background: "oklch(0.18 0.08 220)", border: "1px solid var(--arc-blue)", color: "var(--arc-blue)", alignSelf: "flex-start" }}
      >
        {enqueue.isPending ? "ENQUEUEING…" : "ENQUEUE RESEARCH"}
      </Button>
    </div>
  );
}

// ─── Panel 10: Trigger Controls ───────────────────────────────────────────────

function TriggerControlsPanel() {
  const utils = trpc.useUtils();

  const triggerDaily = trpc.darwin.triggerCroDaily.useMutation({
    onSuccess: (data) => {
      const r = data.result as any;
      toast.success(`CRO Daily Work Complete — ${r?.itemsProcessed ?? 0} items processed, ${r?.promotions ?? 0} promotions, ${r?.newEnqueued ?? 0} new enqueued`);
      utils.darwin.croResearchQueue.invalidate();
      utils.darwin.croDashboardStats.invalidate();
      utils.darwin.croWorkLog.invalidate();
    },
    onError: (err) => toast.error(`Daily work failed: ${err.message}`),
  });

  const triggerReport = trpc.darwin.triggerCroReport.useMutation({
    onSuccess: (data) => {
      toast.success(`CRO Report Generated — ID: ${data.reportId}`);
      utils.darwin.croCroReports.invalidate();
    },
    onError: (err) => toast.error(`Report generation failed: ${err.message}`),
  });

  return (
    <div className="hud-panel p-4 flex flex-col gap-4">
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>TRIGGER CONTROLS</span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="hud-panel p-4 flex flex-col gap-3">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)", fontWeight: 600 }}>DAILY AUTONOMOUS WORK</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
            Runs the full CRO daily cycle: scan for new candidates, re-prioritise queue by ERV, advance promotion gates, enqueue from behaviour library and market laws, log all actions.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
            Scheduled: <span style={{ color: "oklch(0.65 0.18 60)" }}>22:00 UTC weekdays</span>
          </div>
          <Button
            onClick={() => triggerDaily.mutate()}
            disabled={triggerDaily.isPending}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", background: "oklch(0.14 0.06 220)", border: "1px solid var(--arc-blue)", color: "var(--arc-blue)", alignSelf: "flex-start" }}
          >
            <Play size={11} className="mr-2" />
            {triggerDaily.isPending ? "RUNNING…" : "RUN NOW"}
          </Button>
        </div>
        <div className="hud-panel p-4 flex flex-col gap-3">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-foreground)", fontWeight: 600 }}>WEEKLY CRO REPORT</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
            Generates the weekly Chief Research Officer report: portfolio coverage analysis, research velocity, top candidates, regime/session gaps, and strategic recommendations.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
            Scheduled: <span style={{ color: "oklch(0.65 0.18 60)" }}>Sunday 00:00 UTC</span>
          </div>
          <Button
            onClick={() => triggerReport.mutate()}
            disabled={triggerReport.isPending}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", background: "oklch(0.14 0.06 220)", border: "1px solid oklch(0.65 0.18 140)", color: "oklch(0.65 0.18 140)", alignSelf: "flex-start" }}
          >
            <BarChart3 size={11} className="mr-2" />
            {triggerReport.isPending ? "GENERATING…" : "GENERATE REPORT"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DarwinCROPage() {
  const [activeTab, setActiveTab] = useState("queue");

  return (
    <div style={{ padding: "20px 24px", minHeight: "100vh", background: "var(--hud-bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid var(--arc-blue)", display: "flex", alignItems: "center", justifyContent: "center", background: "oklch(0.12 0.06 220)" }}>
          <FlaskConical size={16} style={{ color: "var(--arc-blue)" }} />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.15em", color: "var(--arc-blue)" }}>DARWIN CRO</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)" }}>CHIEF RESEARCH OFFICER — AUTONOMOUS RESEARCH ORCHESTRATION ENGINE — SPRINT 101</div>
        </div>
      </div>

      {/* Stats Overview — always visible */}
      <div style={{ marginBottom: 20 }}>
        <StatsPanel />
      </div>

      {/* Tabbed panels */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList style={{ background: "oklch(0.12 0.04 220)", border: "1px solid oklch(0.22 0.08 220 / 0.4)", marginBottom: 16 }}>
          {[
            { value: "queue", label: "RESEARCH QUEUE" },
            { value: "gates", label: "PROMOTION GATES" },
            { value: "rejections", label: "REJECTION REGISTRY" },
            { value: "worklog", label: "WORK LOG" },
            { value: "reports", label: "CRO REPORTS" },
            { value: "gaps", label: "PORTFOLIO GAPS" },
            { value: "erv", label: "ERV CHART" },
            { value: "enqueue", label: "MANUAL ENQUEUE" },
            { value: "triggers", label: "TRIGGER CONTROLS" },
          ].map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em" }}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="queue"><ResearchQueuePanel /></TabsContent>
        <TabsContent value="gates"><PromotionGatesPanel /></TabsContent>
        <TabsContent value="rejections"><RejectionRegistryPanel /></TabsContent>
        <TabsContent value="worklog"><WorkLogPanel /></TabsContent>
        <TabsContent value="reports"><CroReportsPanel /></TabsContent>
        <TabsContent value="gaps"><PortfolioGapsPanel /></TabsContent>
        <TabsContent value="erv"><ERVChartPanel /></TabsContent>
        <TabsContent value="enqueue"><ManualEnqueuePanel /></TabsContent>
        <TabsContent value="triggers"><TriggerControlsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
