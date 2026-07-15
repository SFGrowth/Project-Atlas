/**
 * DARWIN Daily Research Reports — Sprint 116
 *
 * Dashboard for browsing DARWIN's autonomous daily research reports.
 * Shows report list, stats, and full Markdown content for each report.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, GitBranch, Play, RefreshCw, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Clock, BarChart2, BookOpen, Dna,
  ChevronRight, ExternalLink, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ── Markdown renderer (simple, no external dep) ──────────────────────────────

function MarkdownView({ content }: { content: string }) {
  // Convert Markdown to basic HTML-like structure using React
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.08em", marginBottom: 12, marginTop: 20, borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)", paddingBottom: 8 }}>
          {line.slice(2)}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "oklch(0.75 0.15 220)", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "oklch(0.65 0.1 220)", letterSpacing: "0.1em", marginBottom: 6, marginTop: 12, textTransform: "uppercase" }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("---")) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid oklch(0.22 0.08 220 / 0.4)", margin: "12px 0" }} />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 8 }}>
          <span style={{ color: "var(--arc-blue)", flexShrink: 0, marginTop: 2 }}>›</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.75 0.06 220)", lineHeight: 1.6 }}>
            {renderInline(line.slice(2))}
          </span>
        </div>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} style={{ borderLeft: "2px solid var(--arc-blue)", paddingLeft: 12, margin: "8px 0", fontStyle: "italic", color: "oklch(0.65 0.08 220)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.startsWith("```")) {
      // Code block — collect until closing ```
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} style={{ background: "oklch(0.07 0.03 220)", border: "1px solid oklch(0.2 0.06 220 / 0.5)", borderRadius: 4, padding: "10px 14px", margin: "8px 0", overflowX: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.8 0.1 220)", lineHeight: 1.6 }}>
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
    } else {
      elements.push(
        <p key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "oklch(0.75 0.06 220)", lineHeight: 1.7, marginBottom: 6 }}>
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <div style={{ padding: "4px 0" }}>{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} style={{ color: "oklch(0.88 0.1 220)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={idx} style={{ background: "oklch(0.12 0.05 220)", padding: "1px 5px", borderRadius: 3, fontSize: 11, color: "oklch(0.8 0.15 220)", fontFamily: "var(--font-mono)" }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className="hud-panel hud-panel-br p-4" style={{ minWidth: 120 }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} style={{ color: color ?? "var(--arc-blue)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: color ?? "var(--arc-blue)", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Report row ───────────────────────────────────────────────────────────────

function ReportRow({ report, isSelected, onClick }: {
  report: {
    id: number;
    reportDate: string;
    tradesAnalysed: number;
    newBehavioursFound: number;
    behavioursConfirmed: number;
    modelsDegrading: number;
    githubCommitStatus: string | null;
    githubCommitSha: string | null;
    githubCommitUrl: string | null;
    generationDurationMs: number | null;
  };
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: isSelected ? "oklch(0.14 0.06 220)" : "transparent",
        border: "none",
        borderLeft: isSelected ? "2px solid var(--arc-blue)" : "2px solid transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.11 0.04 220)"; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      <FileText size={13} style={{ color: isSelected ? "var(--arc-blue)" : "oklch(0.5 0.06 220)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? "var(--arc-blue)" : "oklch(0.75 0.06 220)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {report.reportDate}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2 }}>
          {report.tradesAnalysed} trades · {report.newBehavioursFound} new behaviours
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        {report.githubCommitStatus === "SUCCESS" ? (
          <CheckCircle size={11} style={{ color: "oklch(0.65 0.15 145)" }} />
        ) : report.githubCommitStatus === "FAILED" ? (
          <XCircle size={11} style={{ color: "oklch(0.65 0.2 25)" }} />
        ) : (
          <Clock size={11} style={{ color: "oklch(0.55 0.1 60)" }} />
        )}
        {report.modelsDegrading > 0 && (
          <TrendingDown size={11} style={{ color: "oklch(0.65 0.2 25)" }} />
        )}
      </div>
      <ChevronRight size={12} style={{ color: "oklch(0.4 0.06 220)", flexShrink: 0 }} />
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DarwinDailyReportPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const { data: stats, isLoading: statsLoading } = trpc.darwinReports.getStats.useQuery();
  const { data: listData, isLoading: listLoading, refetch: refetchList } = trpc.darwinReports.getReports.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const { data: reportDetail, isLoading: reportLoading } = trpc.darwinReports.getReport.useQuery(
    { reportDate: selectedDate ?? undefined },
    { enabled: selectedDate !== null }
  );
  const { data: latestReport, isLoading: latestLoading } = trpc.darwinReports.getReport.useQuery(
    {},
    { enabled: selectedDate === null }
  );

  const runMutation = trpc.darwinReports.runReport.useMutation({
    onSuccess: (result) => {
      toast.success(`DARWIN Daily Report generated for ${result.reportDate}`, {
        description: result.githubSuccess
          ? `GitHub commit: ${result.githubCommitSha?.slice(0, 8)}`
          : `GitHub archive failed: ${result.githubError ?? "unknown"}`,
      });
      refetchList();
      setSelectedDate(result.reportDate);
    },
    onError: (err) => {
      toast.error("Report generation failed", { description: err.message });
    },
  });

  const activeReport = selectedDate ? reportDetail : latestReport;
  const isActiveLoading = selectedDate ? reportLoading : latestLoading;

  const totalReports = listData?.total ?? 0;
  const totalPages = Math.ceil(totalReports / PAGE_SIZE);

  return (
    <div style={{ padding: "24px 28px", minHeight: "100vh", background: "var(--hud-bg)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Dna size={18} style={{ color: "var(--arc-blue)" }} />
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.1em", margin: 0 }}>
                DARWIN DAILY REPORTS
              </h1>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", margin: 0, letterSpacing: "0.05em" }}>
              Autonomous daily research cycle · 10-section analysis · GitHub knowledge archive
            </p>
          </div>
          <Button
            onClick={() => runMutation.mutate({})}
            disabled={runMutation.isPending}
            size="sm"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em" }}
          >
            {runMutation.isPending ? (
              <><RefreshCw size={13} className="mr-2 animate-spin" />GENERATING…</>
            ) : (
              <><Play size={13} className="mr-2" />RUN TODAY'S REPORT</>
            )}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 24 }}>
        {statsLoading ? (
          Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : stats ? (
          <>
            <StatCard label="Total Reports" value={stats.totalReports} icon={FileText} />
            <StatCard label="Trades Analysed" value={stats.totalTradesAnalysed} icon={BarChart2} />
            <StatCard label="Behaviours Found" value={stats.totalBehavioursFound} icon={BookOpen} color="oklch(0.65 0.15 145)" />
            <StatCard label="Confirmed" value={stats.totalBehavioursConfirmed} icon={CheckCircle} color="oklch(0.65 0.15 145)" />
            <StatCard label="Rejected" value={stats.totalBehavioursRejected} icon={XCircle} color="oklch(0.65 0.2 25)" />
            <StatCard label="GitHub Success" value={stats.githubSuccessCount} sub={`${stats.githubFailedCount} failed`} icon={GitBranch} color="oklch(0.65 0.15 145)" />
            <StatCard label="Avg Gen Time" value={`${(stats.avgGenerationMs / 1000).toFixed(1)}s`} icon={Clock} />
          </>
        ) : null}
      </div>

      {/* Main content: list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>
        {/* Report list */}
        <div className="hud-panel hud-panel-br" style={{ overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", textTransform: "uppercase" }}>
              Report Archive
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.5 0.06 220)" }}>
              {totalReports} total
            </span>
          </div>

          {listLoading ? (
            <div style={{ padding: 14 }}>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 mb-2" />)}
            </div>
          ) : listData?.reports.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center" }}>
              <FileText size={24} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 8px" }} />
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>No reports yet</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.4 0.04 220)", marginTop: 4 }}>Click RUN TODAY'S REPORT to generate the first one</p>
            </div>
          ) : (
            <ScrollArea style={{ height: 520 }}>
              {/* Latest report option */}
              <button
                onClick={() => setSelectedDate(null)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: selectedDate === null ? "oklch(0.14 0.06 220)" : "transparent",
                  border: "none",
                  borderLeft: selectedDate === null ? "2px solid oklch(0.65 0.15 145)" : "2px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <TrendingUp size={13} style={{ color: selectedDate === null ? "oklch(0.65 0.15 145)" : "oklch(0.5 0.06 220)", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: selectedDate === null ? 600 : 400, color: selectedDate === null ? "oklch(0.65 0.15 145)" : "oklch(0.65 0.06 220)" }}>
                  Latest Report
                </span>
              </button>
              <Separator style={{ background: "oklch(0.22 0.08 220 / 0.3)" }} />
              {listData?.reports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  isSelected={selectedDate === r.reportDate}
                  onClick={() => setSelectedDate(r.reportDate)}
                />
              ))}
            </ScrollArea>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid oklch(0.22 0.08 220 / 0.4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                ← Prev
              </Button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
                {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                Next →
              </Button>
            </div>
          )}
        </div>

        {/* Report detail */}
        <div className="hud-panel hud-panel-br" style={{ overflow: "hidden" }}>
          {isActiveLoading ? (
            <div style={{ padding: 24 }}>
              <Skeleton className="h-8 w-64 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-4 w-5/6 mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : !activeReport ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Dna size={32} style={{ color: "oklch(0.35 0.06 220)", margin: "0 auto 12px" }} />
              <p style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "oklch(0.5 0.06 220)", letterSpacing: "0.08em" }}>NO REPORTS GENERATED YET</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", marginTop: 8 }}>
                DARWIN generates daily research reports automatically at 17:30 ET on weekdays.<br />
                Click "RUN TODAY'S REPORT" to generate the first report immediately.
              </p>
            </div>
          ) : (
            <>
              {/* Report header */}
              <div style={{ padding: "14px 18px", borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileText size={15} style={{ color: "var(--arc-blue)" }} />
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.08em" }}>
                      DARWIN DAILY REPORT — {activeReport.reportDate}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* GitHub commit badge */}
                    {activeReport.githubCommitStatus === "SUCCESS" && activeReport.githubCommitUrl ? (
                      <a
                        href={activeReport.githubCommitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 5, textDecoration: "none" }}
                      >
                        <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", borderColor: "oklch(0.65 0.15 145)", color: "oklch(0.65 0.15 145)", gap: 4 }}>
                          <GitBranch size={9} />
                          {activeReport.githubCommitSha?.slice(0, 8)}
                          <ExternalLink size={8} />
                        </Badge>
                      </a>
                    ) : activeReport.githubCommitStatus === "FAILED" ? (
                      <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", borderColor: "oklch(0.65 0.2 25)", color: "oklch(0.65 0.2 25)", gap: 4 }}>
                        <AlertTriangle size={9} />
                        GITHUB FAILED
                      </Badge>
                    ) : (
                      <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", borderColor: "oklch(0.55 0.1 60)", color: "oklch(0.55 0.1 60)", gap: 4 }}>
                        <Clock size={9} />
                        PENDING ARCHIVE
                      </Badge>
                    )}
                    {/* Stats badges */}
                    <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", gap: 4 }}>
                      <BarChart2 size={9} />
                      {activeReport.tradesAnalysed} trades
                    </Badge>
                    <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", borderColor: "oklch(0.65 0.15 145)", color: "oklch(0.65 0.15 145)", gap: 4 }}>
                      <BookOpen size={9} />
                      {activeReport.newBehavioursFound} new
                    </Badge>
                    {activeReport.modelsDegrading > 0 && (
                      <Badge variant="outline" style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", borderColor: "oklch(0.65 0.2 25)", color: "oklch(0.65 0.2 25)", gap: 4 }}>
                        <TrendingDown size={9} />
                        {activeReport.modelsDegrading} degrading
                      </Badge>
                    )}
                    {activeReport.generationDurationMs && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                        {(activeReport.generationDurationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Markdown content */}
              <ScrollArea style={{ height: "calc(100vh - 340px)", minHeight: 400 }}>
                <div style={{ padding: "16px 20px" }}>
                  <MarkdownView content={activeReport.reportMarkdown} />
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
