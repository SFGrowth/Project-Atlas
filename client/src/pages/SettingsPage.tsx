import { HudPanel, DataRow, PageWrapper, SectionHeader } from "@/components/HudComponents";

export default function SettingsPage() {
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="Settings" subtitle="Atlas Nexus configuration and integration settings" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <HudPanel title="Webhook Configuration">
            <DataRow label="Endpoint" value={<span className="text-[var(--arc-cyan)] text-xs font-['JetBrains_Mono']">/api/webhook/observe/:token</span>} />
            <DataRow label="Method" value="POST" />
            <DataRow label="Content-Type" value="application/json" />
            <DataRow label="Auth Layer 1" value="Secret path segment" />
            <DataRow label="Auth Layer 2" value="webhook_secret in payload" />
            <DataRow label="Schema Version" value="1.0.0" />
            <DataRow label="Symbol" value="MNQ1!" />
            <DataRow label="Payload Type" value="OBSERVABILITY" />
          </HudPanel>
          <HudPanel title="Paper Trading">
            <DataRow label="Account" value="ATLAS_MNQ_PAPER" />
            <DataRow label="Symbol" value="MNQ1!" />
            <DataRow label="Contracts" value="1" />
            <DataRow label="Tick Value" value="$2.00" />
            <DataRow label="Mode" value={<span className="status-badge status-warn">PAPER ONLY</span>} />
            <DataRow label="Broker" value={<span className="text-[var(--color-muted-foreground)]">None — simulated</span>} />
          </HudPanel>
          <HudPanel title="System Information">
            <DataRow label="Version" value="1.0.0" />
            <DataRow label="Stack" value="React 19 + Express + tRPC" />
            <DataRow label="Database" value="MySQL (Drizzle ORM)" />
            <DataRow label="SSE" value="Server-Sent Events" />
            <DataRow label="Pipeline" value="TradingView M-15 → Nexus" />
          </HudPanel>
          <HudPanel title="TradingView Alert Setup">
            <div className="space-y-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              <div>
                <div className="text-[var(--arc-blue)] mb-1">Step 1 — Alert URL</div>
                <div className="font-['JetBrains_Mono'] text-[var(--arc-cyan)] bg-[oklch(0.12_0.04_220)] p-2 rounded">https://your-domain/api/webhook/observe/YOUR_TOKEN</div>
              </div>
              <div>
                <div className="text-[var(--arc-blue)] mb-1">Step 2 — Alert Message</div>
                <div className="font-['JetBrains_Mono'] text-[var(--arc-cyan)] bg-[oklch(0.12_0.04_220)] p-2 rounded">Include webhook_secret field in M-15 alert() JSON</div>
              </div>
              <div>
                <div className="text-[var(--arc-blue)] mb-1">Step 3 — Frequency</div>
                <div>Set to "Once Per Bar Close" on the 5m chart</div>
              </div>
            </div>
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
