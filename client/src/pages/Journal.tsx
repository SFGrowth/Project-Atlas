import { trpc } from "@/lib/trpc";
import { HudPanel, DataRow, PageWrapper, SectionHeader, EmptyState, fmtDate } from "@/components/HudComponents";

export default function JournalPage() {
  const { data: days } = trpc.journal.days.useQuery({}, { refetchInterval: 60000 });
  const { data: trades } = trpc.paper.recentTrades.useQuery({ limit: 200 }, { refetchInterval: 30000 });
  const closedTrades = trades?.filter(t => t.status === "CLOSED") ?? [];
  const wins = closedTrades.filter(t => parseFloat(t.pnl ?? "0") > 0).length;
  const losses = closedTrades.filter(t => parseFloat(t.pnl ?? "0") < 0).length;
  const totalPnl = closedTrades.reduce((s, t) => s + parseFloat(t.pnl ?? "0"), 0);
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "—";
  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader title="Trading Journal" subtitle="Paper trading performance log — ATLAS_MNQ_PAPER" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          {[
            { label: "Total Trades", value: closedTrades.length, cls: "data-value-lg glow-blue font-['Orbitron']" },
            { label: "Win Rate", value: winRate !== "—" ? `${winRate}%` : "—", cls: `data-value-lg font-['Orbitron'] ${parseFloat(winRate) >= 50 ? "pnl-positive" : "pnl-negative"}` },
            { label: "Total P&L", value: closedTrades.length > 0 ? `$${totalPnl.toFixed(2)}` : "—", cls: `data-value-lg font-['Orbitron'] ${totalPnl >= 0 ? "pnl-positive" : "pnl-negative"}` },
            { label: "W / L", value: `${wins} / ${losses}`, cls: "data-value-lg glow-cyan font-['Orbitron']" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="hud-panel p-4 text-center">
              <div className="data-label mb-2">{label}</div>
              <div className={cls}>{value}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <HudPanel title="Daily Journal">
            {!days || days.length === 0 ? <EmptyState message="No journal entries yet" /> : (
              <div className="overflow-auto" style={{ maxHeight: "400px" }}>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[var(--hud-border)]">
                    {["Date", "Trades", "P&L", "R", "Win%"].map(h => <th key={h} className="text-left py-2 px-2 data-label font-normal">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {days.map(d => (
                      <tr key={d.id} className="border-b border-[oklch(0.18_0.05_220/0.3)] hover:bg-[oklch(0.18_0.05_220/0.3)]">
                        <td className="py-1.5 px-2 text-[var(--arc-cyan)]">{fmtDate(d.tradeDate)}</td>
                        <td className="py-1.5 px-2 data-value">{d.totalTrades}</td>
                        <td className={`py-1.5 px-2 ${parseFloat(d.dailyPnl) >= 0 ? "pnl-positive" : "pnl-negative"}`}>${parseFloat(d.dailyPnl).toFixed(2)}</td>
                        <td className={`py-1.5 px-2 ${parseFloat(d.dailyR) >= 0 ? "pnl-positive" : "pnl-negative"}`}>{parseFloat(d.dailyR).toFixed(2)}R</td>
                        <td className="py-1.5 px-2 data-value">{d.winRate ? `${parseFloat(d.winRate).toFixed(0)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HudPanel>
          <HudPanel title="Trade Log">
            {closedTrades.length === 0 ? <EmptyState message="No closed trades yet" /> : (
              <div className="overflow-auto" style={{ maxHeight: "400px" }}>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-[var(--hud-border)]">
                    {["Model", "Dir", "Entry", "Exit", "P&L", "R", "Reason"].map(h => <th key={h} className="text-left py-2 px-2 data-label font-normal">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {closedTrades.map(t => (
                      <tr key={t.id} className="border-b border-[oklch(0.18_0.05_220/0.3)] hover:bg-[oklch(0.18_0.05_220/0.3)]">
                        <td className="py-1.5 px-2 text-[var(--arc-blue)]">{t.model ?? "—"}</td>
                        <td className="py-1.5 px-2"><span className={`status-badge ${t.direction === "LONG" ? "status-live" : "status-error"}`}>{t.direction}</span></td>
                        <td className="py-1.5 px-2 data-value">{t.entry ? parseFloat(t.entry).toFixed(2) : "—"}</td>
                        <td className="py-1.5 px-2 data-value">{t.exitPrice ? parseFloat(t.exitPrice).toFixed(2) : "—"}</td>
                        <td className={`py-1.5 px-2 ${parseFloat(t.pnl ?? "0") >= 0 ? "pnl-positive" : "pnl-negative"}`}>${parseFloat(t.pnl ?? "0").toFixed(2)}</td>
                        <td className={`py-1.5 px-2 ${parseFloat(t.currentR ?? "0") >= 0 ? "pnl-positive" : "pnl-negative"}`}>{parseFloat(t.currentR ?? "0").toFixed(2)}R</td>
                        <td className="py-1.5 px-2 text-[var(--color-muted-foreground)]">{t.exitReason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </HudPanel>
        </div>
      </div>
    </PageWrapper>
  );
}
