/**
 * GapDiscovery.tsx — Sprint 115: Atlas Permanent Research Directive
 *
 * Gap Discovery Engine dashboard.
 *
 * Panels:
 *   1. Header — last run timestamp, estimated portfolio improvement, recommended priority
 *   2. Gap Stats — open / investigating / resolved / deferred counts
 *   3. Top Portfolio Gaps — ranked list with impact/confidence/effort badges
 *   4. Research Opportunities — top research candidates
 *   5. Engineering & Dashboard Improvements — top engineering + dashboard gaps
 *   6. Autonomous Questions — 10 questions Atlas asks itself
 *   7. Run Analysis button (manual trigger)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Clock, Cpu, Database, FlaskConical,
  LayoutDashboard, RefreshCw, SearchCode, TrendingUp, XCircle, Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GapFinding {
  dimension: string;
  title: string;
  description: string;
  evidence: string;
  impactScore: string | number;
  confidenceScore: string | number;
  effortEstimate: string;
  expectedBenefit: string;
  expectedRiskReduction: string;
  relatedStrategyId?: string;
  relatedSprintId?: string;
}

interface AutonomousQuestion {
  question: string;
  answer: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  actionable: boolean;
  relatedGapDimension?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function impactColor(score: number): string {
  if (score >= 8.5) return "oklch(0.65 0.22 25)";   // red
  if (score >= 7.0) return "oklch(0.72 0.18 55)";   // amber
  if (score >= 5.0) return "oklch(0.72 0.18 145)";  // green
  return "oklch(0.55 0.08 220)";                     // muted
}

function effortColor(effort: string): string {
  switch (effort) {
    case "LOW": return "oklch(0.72 0.18 145)";
    case "MEDIUM": return "oklch(0.72 0.18 55)";
    case "HIGH": return "oklch(0.65 0.22 25)";
    case "SPRINT": return "oklch(0.65 0.22 280)";
    default: return "oklch(0.55 0.08 220)";
  }
}

function confidenceColor(score: number): string {
  if (score >= 8.0) return "oklch(0.72 0.18 145)";
  if (score >= 6.0) return "oklch(0.72 0.18 55)";
  return "oklch(0.65 0.22 25)";
}

function dimensionIcon(dimension: string) {
  const map: Record<string, React.ReactNode> = {
    REGIME_COVERAGE: <TrendingUp size={12} />,
    UNDERPERFORMING_MODEL: <AlertTriangle size={12} />,
    DATA_QUALITY: <Database size={12} />,
    EXECUTION_BOTTLENECK: <Zap size={12} />,
    DASHBOARD_BLIND_SPOT: <LayoutDashboard size={12} />,
    RISK_ALLOCATION: <AlertTriangle size={12} />,
    RESEARCH_BOTTLENECK: <FlaskConical size={12} />,
    CORRELATION_WEAKNESS: <Cpu size={12} />,
    MARKET_BEHAVIOUR: <TrendingUp size={12} />,
    LOW_CONFIDENCE_LAW: <SearchCode size={12} />,
    BEHAVIOUR_LIBRARY: <SearchCode size={12} />,
    SEQUENCE_LIBRARY: <SearchCode size={12} />,
  };
  return map[dimension] ?? <SearchCode size={12} />;
}

function GapCard({ gap, rank }: { gap: GapFinding; rank: number }) {
  const impact = parseFloat(String(gap.impactScore));
  const confidence = parseFloat(String(gap.confidenceScore));
  return (
    <div
      style={{
        background: "oklch(0.10 0.04 220)",
        border: "1px solid oklch(0.20 0.08 220 / 0.6)",
        borderLeft: `3px solid ${impactColor(impact)}`,
        borderRadius: 6,
        padding: "12px 16px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.45 0.08 220)", minWidth: 20 }}>#{rank}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: impactColor(impact), display: "flex", alignItems: "center", gap: 3 }}>
              {dimensionIcon(gap.dimension)}
              {gap.dimension.replace(/_/g, " ")}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: impactColor(impact), background: `${impactColor(impact)}22`, padding: "1px 6px", borderRadius: 3 }}>
              IMPACT {impact.toFixed(1)}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: confidenceColor(confidence), background: `${confidenceColor(confidence)}22`, padding: "1px 6px", borderRadius: 3 }}>
              CONF {confidence.toFixed(1)}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: effortColor(gap.effortEstimate), background: `${effortColor(gap.effortEstimate)}22`, padding: "1px 6px", borderRadius: 3 }}>
              {gap.effortEstimate}
            </span>
            {gap.relatedStrategyId && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.22 220)", background: "oklch(0.65 0.22 220 / 0.15)", padding: "1px 6px", borderRadius: 3 }}>
                {gap.relatedStrategyId}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.88 0.06 220)", fontWeight: 600, marginBottom: 4 }}>
            {gap.title}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.60 0.06 220)", lineHeight: 1.5, marginBottom: 4 }}>
            {gap.description}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", marginBottom: 2 }}>
            <span style={{ color: "oklch(0.55 0.08 220)" }}>EVIDENCE: </span>{gap.evidence}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.72 0.18 145)", marginBottom: 2 }}>
            <span style={{ color: "oklch(0.55 0.08 220)" }}>BENEFIT: </span>{gap.expectedBenefit}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.18 55)" }}>
            <span style={{ color: "oklch(0.55 0.08 220)" }}>RISK REDUCTION: </span>{gap.expectedRiskReduction}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ qa, index }: { qa: AutonomousQuestion; index: number }) {
  const confColor = qa.confidence === "HIGH" ? "oklch(0.72 0.18 145)" : qa.confidence === "MEDIUM" ? "oklch(0.72 0.18 55)" : "oklch(0.65 0.22 25)";
  return (
    <div
      style={{
        background: "oklch(0.10 0.04 220)",
        border: "1px solid oklch(0.20 0.08 220 / 0.6)",
        borderLeft: `3px solid ${confColor}`,
        borderRadius: 6,
        padding: "12px 16px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.45 0.08 220)" }}>Q{index + 1}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: confColor, background: `${confColor}22`, padding: "1px 6px", borderRadius: 3 }}>
          {qa.confidence}
        </span>
        {qa.actionable && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.65 0.22 220)", background: "oklch(0.65 0.22 220 / 0.15)", padding: "1px 6px", borderRadius: 3 }}>
            ACTIONABLE
          </span>
        )}
        {qa.relatedGapDimension && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.55 0.08 220)", padding: "1px 6px" }}>
            → {qa.relatedGapDimension.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--arc-blue)", fontWeight: 600, marginBottom: 6, fontStyle: "italic" }}>
        "{qa.question}"
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.72 0.06 220)", lineHeight: 1.6 }}>
        {qa.answer}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GapDiscovery() {
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const { data: report, isLoading: reportLoading, refetch: refetchReport } = trpc.gaps.getLatestReport.useQuery();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.gaps.getGapStats.useQuery();
  const { data: questions, isLoading: questionsLoading } = trpc.gaps.getAutonomousQuestions.useQuery();
  const runAnalysis = trpc.gaps.runAnalysis.useMutation({
    onSuccess: (data) => {
      toast.success(`Gap analysis complete: ${data.findingsCount} gaps identified`);
      refetchReport();
      refetchStats();
      setRunningAnalysis(false);
    },
    onError: (err) => {
      toast.error(`Analysis failed: ${err.message}`);
      setRunningAnalysis(false);
    },
  });

  const handleRunAnalysis = () => {
    setRunningAnalysis(true);
    runAnalysis.mutate();
  };

  const portfolioGaps: GapFinding[] = report?.top10PortfolioGaps ?? [];
  const researchOpps: GapFinding[] = report?.top10ResearchOpps ?? [];
  const engineeringImprovements: GapFinding[] = report?.topEngineeringImprovements ?? [];
  const dashboardImprovements: GapFinding[] = report?.topDashboardImprovements ?? [];
  const autonomousQs: AutonomousQuestion[] = (questions ?? []) as AutonomousQuestion[];

  const lastRunDate = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleString()
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--hud-bg)", padding: "24px 32px" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <SearchCode size={20} style={{ color: "var(--arc-blue)" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-blue)", margin: 0 }}>
              GAP DISCOVERY ENGINE
            </h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", letterSpacing: "0.1em" }}>SPRINT 115</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.55 0.08 220)", letterSpacing: "0.08em" }}>
            ATLAS PERMANENT RESEARCH DIRECTIVE — AUTONOMOUS PORTFOLIO GAP ANALYSIS
          </div>
          {lastRunDate && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              LAST RUN: {lastRunDate}
              {report?.generationDurationMs && (
                <span style={{ marginLeft: 8 }}>· {report.generationDurationMs}ms</span>
              )}
            </div>
          )}
        </div>
        <Button
          onClick={handleRunAnalysis}
          disabled={runningAnalysis}
          style={{
            background: runningAnalysis ? "oklch(0.14 0.06 220)" : "oklch(0.18 0.08 220)",
            border: "1px solid var(--arc-blue)",
            color: "var(--arc-blue)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
          }}
        >
          <RefreshCw size={12} style={{ marginRight: 6, animation: runningAnalysis ? "spin 1s linear infinite" : "none" }} />
          {runningAnalysis ? "ANALYSING…" : "RUN ANALYSIS"}
        </Button>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "OPEN GAPS", value: stats?.open ?? "—", color: "oklch(0.65 0.22 25)", icon: <AlertTriangle size={14} /> },
          { label: "INVESTIGATING", value: stats?.investigating ?? "—", color: "oklch(0.72 0.18 55)", icon: <SearchCode size={14} /> },
          { label: "RESOLVED", value: stats?.resolved ?? "—", color: "oklch(0.72 0.18 145)", icon: <CheckCircle2 size={14} /> },
          { label: "DEFERRED", value: stats?.deferred ?? "—", color: "oklch(0.55 0.08 220)", icon: <Clock size={14} /> },
          { label: "TOTAL", value: stats?.total ?? "—", color: "var(--arc-blue)", icon: <Database size={14} /> },
          {
            label: "EST. IMPROVEMENT",
            value: report?.estimatedPortfolioImprovementPct
              ? `${parseFloat(report.estimatedPortfolioImprovementPct).toFixed(1)}%`
              : "—",
            color: "oklch(0.72 0.18 145)",
            icon: <TrendingUp size={14} />,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "oklch(0.10 0.04 220)",
              border: "1px solid oklch(0.20 0.08 220 / 0.6)",
              borderRadius: 6,
              padding: "12px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: stat.color }}>
              {stat.icon}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em" }}>{stat.label}</span>
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: stat.color }}>
              {statsLoading || reportLoading ? <Skeleton className="h-7 w-12" /> : stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Recommended Next Priority ── */}
      {report?.recommendedNextPriority && (
        <div
          style={{
            background: "oklch(0.10 0.04 220)",
            border: "1px solid oklch(0.65 0.22 220 / 0.4)",
            borderLeft: "3px solid var(--arc-blue)",
            borderRadius: 6,
            padding: "10px 16px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <Zap size={14} style={{ color: "var(--arc-blue)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", letterSpacing: "0.1em", marginBottom: 2 }}>
              RECOMMENDED NEXT PRIORITY
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.88 0.06 220)" }}>
              {report.recommendedNextPriority}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="portfolio">
        <TabsList style={{ background: "oklch(0.10 0.04 220)", border: "1px solid oklch(0.20 0.08 220 / 0.6)", marginBottom: 16 }}>
          <TabsTrigger value="portfolio" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
            PORTFOLIO GAPS ({portfolioGaps.length})
          </TabsTrigger>
          <TabsTrigger value="research" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
            RESEARCH OPPS ({researchOpps.length})
          </TabsTrigger>
          <TabsTrigger value="engineering" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
            ENGINEERING ({engineeringImprovements.length + dashboardImprovements.length})
          </TabsTrigger>
          <TabsTrigger value="questions" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em" }}>
            AUTONOMOUS Q&A ({autonomousQs.length})
          </TabsTrigger>
        </TabsList>

        {/* Portfolio Gaps */}
        <TabsContent value="portfolio">
          {reportLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : portfolioGaps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.45 0.08 220)" }}>
              <CheckCircle2 size={32} style={{ margin: "0 auto 12px", color: "oklch(0.72 0.18 145)" }} />
              No portfolio gaps identified. Run analysis to generate findings.
            </div>
          ) : (
            portfolioGaps.map((gap, i) => <GapCard key={i} gap={gap} rank={i + 1} />)
          )}
        </TabsContent>

        {/* Research Opportunities */}
        <TabsContent value="research">
          {reportLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : researchOpps.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.45 0.08 220)" }}>
              <CheckCircle2 size={32} style={{ margin: "0 auto 12px", color: "oklch(0.72 0.18 145)" }} />
              No research opportunities identified. Run analysis to generate findings.
            </div>
          ) : (
            researchOpps.map((gap, i) => <GapCard key={i} gap={gap} rank={i + 1} />)
          )}
        </TabsContent>

        {/* Engineering & Dashboard Improvements */}
        <TabsContent value="engineering">
          {reportLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <>
              {engineeringImprovements.length > 0 && (
                <>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", letterSpacing: "0.12em", marginBottom: 8 }}>
                    ENGINEERING IMPROVEMENTS
                  </div>
                  {engineeringImprovements.map((gap, i) => <GapCard key={i} gap={gap} rank={i + 1} />)}
                </>
              )}
              {dashboardImprovements.length > 0 && (
                <>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", letterSpacing: "0.12em", marginBottom: 8, marginTop: 16 }}>
                    DASHBOARD IMPROVEMENTS
                  </div>
                  {dashboardImprovements.map((gap, i) => <GapCard key={i} gap={gap} rank={i + 1} />)}
                </>
              )}
              {engineeringImprovements.length === 0 && dashboardImprovements.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.45 0.08 220)" }}>
                  <CheckCircle2 size={32} style={{ margin: "0 auto 12px", color: "oklch(0.72 0.18 145)" }} />
                  No engineering improvements identified. Run analysis to generate findings.
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Autonomous Q&A */}
        <TabsContent value="questions">
          {questionsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : autonomousQs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.45 0.08 220)" }}>
              <SearchCode size={32} style={{ margin: "0 auto 12px", color: "oklch(0.45 0.08 220)" }} />
              No autonomous questions answered yet. Run analysis to generate insights.
            </div>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.45 0.08 220)", letterSpacing: "0.12em", marginBottom: 12 }}>
                ATLAS ASKS ITSELF — 10 AUTONOMOUS QUESTIONS
              </div>
              {autonomousQs.map((qa, i) => <QuestionCard key={i} qa={qa} index={i} />)}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Principle Footer ── */}
      <div
        style={{
          marginTop: 32,
          padding: "12px 16px",
          background: "oklch(0.08 0.04 220)",
          border: "1px solid oklch(0.18 0.08 220 / 0.4)",
          borderRadius: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "oklch(0.40 0.08 220)",
          letterSpacing: "0.08em",
          textAlign: "center",
        }}
      >
        "ATLAS MUST NEVER STOP ASKING: WHAT IS THE WEAKEST PART OF MYSELF?" — ATLAS PERMANENT RESEARCH DIRECTIVE, SPRINT 115
      </div>
    </div>
  );
}
