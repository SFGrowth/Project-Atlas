import { trpc } from "@/lib/trpc";
import { useNexusSSE } from "@/hooks/useNexusSSE";
import { HudPanel, DataRow, PageWrapper, SectionHeader, EmptyState, fmtDateTime } from "@/components/HudComponents";

export default function HealthPage() {
  const { sseStatus, backendStatus, dataFreshness, sseClients } = useNexusSSE();
  const { data: events } = trpc.health.events.useQuery({ limit: 200 }, { refetchInterval: 15000 });
  const { data: lastWebhook } = trpc.health.lastWebhook.useQuery(undefined, { refetchInterval: 15000 });
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const sevClass = (s: string) => (s === "ERROR" || s === "CRITICAL") ? "status-error" : (s === "WARN" || s === "WARNING") ? "status-warn" : "status-ok";
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="System Health" subtitle="Backend health, SSE connectivity, and webhook monitoring" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {[
            { label: "SSE Stream", status: sseStatus, ok: sseStatus === "CONNECTED", warn: sseStatus === "CONNECTING" },
            { label: "Backend API", status: backendStatus, ok: backendStatus === "OK", warn: false },
            { label: "Data Freshness", status: dataFreshness, ok: dataFreshness === "LIVE", warn: dataFreshness === "UNKNOWN" },
          ].map(({ label, status, ok, warn }) => (
            <div key={label} className="hud-panel p-4 text-center">
              <div className="data-label mb-2">{label}</div>
              <div className={`w-4 h-4 rounded-full mx-auto mb-2 ${ok ? "bg-[var(--arc-cyan)]" : warn ? "bg-[var(--stark-gold)]" : "bg-[var(--danger-red)]"}`}
                style={{ boxShadow: ok ? "0 0 12px var(--arc-cyan)" : warn ? "0 0 12px var(--stark-gold)" : "0 0 12px var(--danger-red)" }} />
              <span className={`status-badge ${ok ? "status-live" : warn ? "status-warn" : "status-error"}`}>{status}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <HudPanel title="System Metrics">
            <DataRow label="SSE Clients" value={sseClients} />
            <DataRow label="Total Reports" value={stats?.totalReports ?? "—"} />
            <DataRow label="Last Report" value={fmtDateTime(stats?.lastReceivedAt)} />
            <DataRow label="Last Webhook" value={fmtDateTime(lastWebhook?.ts)} />
            <DataRow label="Webhook Type" value={lastWebhook?.eventType ?? "—"} />
          </HudPanel>
          <HudPanel title="Health Event Log">
            {!events || events.length === 0 ? <EmptyState message="No health events" /> : (
              <div className="overflow-auto" style={{ maxHeight: "300px" }}>
                {events.map(e => (
                  <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-[oklch(0.18_0.05_220/0.3)]">
                    <span className={`status-badge ${sevClass(e.severity)} mt-0.5 shrink-0`}>{e.severity}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-[var(--arc-blue)]">{e.eventType}</div>
                      <div className="text-[10px] text-[var(--color-muted-foreground)] truncate">{e.message}</div>
                    </div>
                    <span className="text-[9px] text-[var(--color-muted-foreground)] shrink-0">{fmtDateTime(e.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
