import { useNexusSSE } from "@/hooks/useNexusSSE";
import { trpc } from "@/lib/trpc";
import { OverviewStrip, HudPanel, DataRow, SignalBadge, PageWrapper, SectionHeader, EmptyState, fmt } from "@/components/HudComponents";

export default function MarketStructurePage() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: stats } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: latestFromDb } = trpc.nexus.latestReport.useQuery(undefined, { refetchInterval: 30000 });
  const p = latestReport?.payload ?? (latestFromDb?.payload as any) ?? null;
  const reportCount = stats?.totalReports ?? 0;
  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4">
        <SectionHeader title="Market Structure" subtitle="Real-time market microstructure from M-15 pipeline" />
        {!p ? <EmptyState message="Awaiting pipeline data…" /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <HudPanel title="Trend & Momentum">
              <DataRow label="Trend Direction" value={<SignalBadge value={p.trend} />} />
              <DataRow label="ADX (Strength)" value={
                <span className={`data-value ${(p.adx ?? 0) > 25 ? "glow-cyan" : ""}`}>{fmt(p.adx)}</span>
              } />
              <DataRow label="RSI" value={
                <span className={`data-value ${(p.rsi ?? 50) > 70 ? "pnl-negative" : (p.rsi ?? 50) < 30 ? "pnl-positive" : ""}`}>{fmt(p.rsi)}</span>
              } />
              <DataRow label="Volume Ratio" value={
                <span className={`data-value ${(p.volume_ratio ?? 1) > 1.5 ? "glow-cyan" : ""}`}>{fmt(p.volume_ratio)}</span>
              } />
              <DataRow label="ATR" value={fmt(p.atr)} />
            </HudPanel>
            <HudPanel title="Price Levels">
              <DataRow label="EMA 9" value={<span className="data-value glow-blue">{fmt(p.ema9)}</span>} />
              <DataRow label="EMA 21" value={fmt(p.ema21)} />
              <DataRow label="EMA 50" value={fmt(p.ema50)} />
              <DataRow label="VWAP" value={<span className="data-value glow-cyan">{fmt(p.vwap)}</span>} />
            </HudPanel>
            <HudPanel title="EMA Spread Analysis" className="col-span-2">
              <div className="grid grid-cols-3 gap-4 py-2">
                {[
                  { label: "EMA9 vs EMA21", a: p.ema9, b: p.ema21 },
                  { label: "EMA21 vs EMA50", a: p.ema21, b: p.ema50 },
                  { label: "EMA9 vs VWAP", a: p.ema9, b: p.vwap },
                ].map(({ label, a, b }) => {
                  const spread = a != null && b != null ? a - b : null;
                  return (
                    <div key={label} className="hud-panel p-3 text-center">
                      <div className="data-label mb-1">{label}</div>
                      <div className={`text-lg font-bold font-["Orbitron"] ${spread != null ? (spread > 0 ? "pnl-positive" : "pnl-negative") : "data-value"}`}>
                        {spread != null ? (spread > 0 ? "+" : "") + fmt(spread) : "—"}
                      </div>
                      <div className="text-[9px] text-[var(--color-muted-foreground)] mt-1">
                        {spread != null ? (spread > 0 ? "BULLISH" : "BEARISH") : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </HudPanel>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
