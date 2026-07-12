/**
 * Scheduler — Atlas permanent scheduling service.
 * Shows all registered jobs, their status, last run, next run, and run history.
 */
import React from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)", fontSize: 10 }}>NEVER RUN</span>;
  const color = status === "SUCCESS" ? "oklch(0.65 0.22 145)" : status === "RUNNING" ? "oklch(0.75 0.18 60)" : "oklch(0.55 0.22 25)";
  const icon = status === "SUCCESS" ? <CheckCircle size={11} /> : status === "RUNNING" ? <RefreshCw size={11} /> : <XCircle size={11} />;
  return (
    <span className="flex items-center gap-1" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color, fontWeight: 600 }}>
      {icon} {status}
    </span>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: {
  jobName: string;
  description: string | null;
  cronExpression: string;
  callbackPath: string;
  isEnabled: boolean | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunDurationMs: number | null;
  scheduleCronTaskUid: string | null;
  totalRuns: number | null;
  successfulRuns: number | null;
  failedRuns: number | null;
}}) {
  const generateNow = trpc.dailyReview.generateNow.useMutation({
    onSuccess: () => toast.success("Daily review generated successfully"),
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  const isDaily = job.jobName === "atlas-daily-review";
  const successRate = job.totalRuns && job.totalRuns > 0
    ? ((job.successfulRuns ?? 0) / job.totalRuns * 100).toFixed(0)
    : null;

  return (
    <div className="hud-panel hud-panel-br p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock size={13} style={{ color: "var(--arc-cyan)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--arc-cyan)", letterSpacing: "0.08em" }}>
              {job.jobName}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded`} style={{
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
              background: job.isEnabled ? "oklch(0.65 0.22 145 / 0.15)" : "oklch(0.55 0.22 25 / 0.15)",
              color: job.isEnabled ? "oklch(0.65 0.22 145)" : "oklch(0.55 0.22 25)",
              border: `1px solid ${job.isEnabled ? "oklch(0.65 0.22 145 / 0.4)" : "oklch(0.55 0.22 25 / 0.4)"}`,
            }}>
              {job.isEnabled ? "ENABLED" : "DISABLED"}
            </span>
          </div>
          {job.description && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", marginTop: 2, paddingLeft: 21 }}>
              {job.description}
            </div>
          )}
        </div>
        {isDaily && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateNow.mutate({ date: new Date().toISOString().slice(0, 10) })}
            disabled={generateNow.isPending}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", height: 28 }}
          >
            <Play size={11} className="mr-1" />
            {generateNow.isPending ? "RUNNING…" : "RUN NOW"}
          </Button>
        )}
      </div>

      {/* Schedule info */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 pl-5">
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>CRON</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--arc-blue)" }}>{job.cronExpression}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>ENDPOINT</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-foreground)" }}>{job.callbackPath}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>LAST RUN</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-foreground)" }}>{fmtDateTime(job.lastRunAt)}</div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>NEXT RUN</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--arc-cyan)" }}>Scheduled via Heartbeat</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 pl-5 pt-1 border-t" style={{ borderColor: "oklch(0.22 0.08 220 / 0.3)" }}>
        <div className="flex items-center gap-2">
          <StatusBadge status={job.lastRunStatus} />
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
          Duration: <span style={{ color: "var(--color-foreground)" }}>{fmtDuration(job.lastRunDurationMs)}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
          Runs: <span style={{ color: "var(--color-foreground)" }}>{job.totalRuns ?? 0}</span>
        </div>
        {successRate != null && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
            Success: <span style={{ color: "oklch(0.65 0.22 145)" }}>{successRate}%</span>
          </div>
        )}
        {job.failedRuns != null && job.failedRuns > 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
            Failures: <span style={{ color: "oklch(0.55 0.22 25)" }}>{job.failedRuns}</span>
          </div>
        )}
        {job.scheduleCronTaskUid && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.35 0.06 220)", marginLeft: "auto" }}>
            UID: {job.scheduleCronTaskUid.slice(0, 12)}…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Future Jobs ─────────────────────────────────────────────────────────────

const PLANNED_JOBS = [
  { name: "atlas-weekly-review", description: "Weekly performance summary — Fridays 5:00 PM ET", status: "PLANNED" },
  { name: "atlas-monthly-review", description: "Monthly portfolio health report — 1st of month", status: "PLANNED" },
  { name: "atlas-mc-refresh", description: "Monte Carlo refresh — every 30 days", status: "PLANNED" },
  { name: "atlas-certification-review", description: "Model certification gate check — weekly", status: "PLANNED" },
  { name: "atlas-risk-audit", description: "Portfolio risk audit — monthly", status: "PLANNED" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const { data: jobs, isLoading } = trpc.scheduler.list.useQuery(undefined, { refetchInterval: 30000 });

  return (
    <div className="p-4 space-y-4" style={{ background: "var(--hud-bg)", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Clock size={18} style={{ color: "var(--arc-cyan)" }} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-cyan)" }}>ATLAS SCHEDULER</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.08em" }}>
            PERMANENT SCHEDULING SERVICE · AUTONOMOUS ATLAS OPERATIONS
          </div>
        </div>
        {jobs && (
          <div className="ml-auto flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
              {jobs.filter((j: {isEnabled: boolean | null}) => j.isEnabled).length} active job{jobs.filter((j: {isEnabled: boolean | null}) => j.isEnabled).length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Design philosophy note */}
      <div className="hud-panel hud-panel-br p-3">
        <div className="flex items-start gap-2">
          <AlertCircle size={13} style={{ color: "var(--arc-blue)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
            Atlas continues operating whether you are watching or not. The scheduler is part of the autonomous operating system — not a dashboard feature.
            All jobs run server-side via Heartbeat. The dashboard is an observation interface only.
          </div>
        </div>
      </div>

      {/* Active jobs */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "oklch(0.45 0.08 220)", marginBottom: 12, fontWeight: 600 }}>
          ACTIVE JOBS
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-36 w-full rounded-sm animate-pulse" style={{ background: "oklch(0.14 0.06 220)" }} />)}</div>
        ) : !jobs?.length ? (
          <div className="hud-panel hud-panel-br p-6 text-center">
            <Clock size={28} style={{ color: "var(--color-muted-foreground)", margin: "0 auto 8px" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-muted-foreground)" }}>
              No jobs registered yet
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.4 0.06 220)", marginTop: 6 }}>
              The daily review job will be registered after the first deployment.
              Run: <code style={{ color: "var(--arc-cyan)" }}>manus-heartbeat create --name atlas-daily-review --cron "30 21 * * 1-5"</code>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => <JobCard key={job.jobName} job={{ ...job, lastRunStatus: job.lastRunStatus ?? null, lastRunDurationMs: job.lastRunDurationMs ?? null }} />)}
          </div>
        )}
      </div>

      {/* Planned jobs */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "oklch(0.45 0.08 220)", marginBottom: 12, fontWeight: 600 }}>
          PLANNED JOBS (SPRINT 089+)
        </div>
        <div className="grid gap-2">
          {PLANNED_JOBS.map((job) => (
            <div key={job.name} className="flex items-center gap-3 p-3 hud-panel hud-panel-br opacity-50">
              <Clock size={12} style={{ color: "var(--color-muted-foreground)", flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-foreground)" }}>{job.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{job.description}</div>
              </div>
              <span className="ml-auto px-2 py-0.5" style={{
                fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
                background: "oklch(0.22 0.08 220 / 0.3)",
                color: "var(--color-muted-foreground)",
                border: "1px solid oklch(0.22 0.08 220 / 0.4)",
              }}>
                {job.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
