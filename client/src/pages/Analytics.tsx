/**
 * Performance Analytics — Atlas Nexus
 * Data-driven from paper_trades DB only. No mock data.
 * Charts: Equity Curve, Daily P&L, Win/Loss Distribution, Model Breakdown.
 */
import { trpc } from "@/lib/trpc";
import { HudPanel, PageWrapper, OverviewStrip, SectionHeader, EmptyState, fmtCurrency } from "@/components/HudComponents";
import { useNexusSSE } from "@/hooks/useNexusSSE";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { useState } from "react";

// ─── Colour palette ───────────────────────────────────────────────────────────

const ARC_BLUE = "#00d4ff";
const ARC_CYAN = "#00ffff";
const STARK_GOLD = "#f5a623";
const DANGER_RED = "#ff3b3b";
const SUCCESS_GREEN = "#00ff88";

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function HudTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: "oklch(0.12 0.06 220)", border: "1px solid oklch(0.3 0.12 220 / 0.6)", padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 11 }}>
      <div style={{ color: "var(--arc-blue)", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.value >= 0 ? SUCCESS_GREEN : DANGER_RED }}>
          {p.name}: {p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = ARC_BLUE }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="hud-panel hud-panel-br p-4 flex flex-col gap-1">
      <span className="data-label">{label}</span>
      <span className="font-bold font-['Orbitron'] text-lg" style={{ color, textShadow: `0 0 12px ${color}` }}>{value}</span>
      {sub && <span className="text-[10px] text-[var(--color-muted-foreground)]">{sub}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const { sseStatus, backendStatus, dataFreshness, latestReport } = useNexusSSE();
  const { data: statsData } = trpc.nexus.stats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: analytics, isLoading } = trpc.analytics.summary.useQuery(
    { account: "ATLAS_MNQ_PAPER" },
    { refetchInterval: 30000 }
  );

  const reportCount = statsData?.totalReports ?? 0;
  const p = latestReport?.payload ?? null;

  const stats = analytics?.stats ?? null;
  const equityCurve = analytics?.equityCurve ?? [];
  const dailyPnl = analytics?.dailyPnl ?? [];

  // Format equity curve dates for display
  const equityChartData = equityCurve.map((pt, i) => ({
    ...pt,
    label: pt.date ? new Date(pt.date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }) : `T${i + 1}`,
  }));

  const dailyChartData = dailyPnl.map((pt) => ({
    ...pt,
    label: new Date(pt.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
  }));

  const hasData = stats !== null && stats.totalTrades > 0;

  return (
    <PageWrapper>
      <OverviewStrip payload={p} sseStatus={sseStatus} backendStatus={backendStatus} dataFreshness={dataFreshness} reportCount={reportCount} />
      <div className="p-4 space-y-4">
        <SectionHeader title="PERFORMANCE ANALYTICS" subtitle="Paper trading results — sourced exclusively from paper_trades database" />

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--arc-blue)] border-t-transparent animate-spin" />
              <span className="text-xs tracking-widest text-[var(--color-muted-foreground)] font-['JetBrains_Mono']">LOADING ANALYTICS…</span>
            </div>
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="hud-panel hud-panel-br p-8">
            <EmptyState message="No closed paper trades yet — analytics will populate as trades complete" />
          </div>
        )}

        {!isLoading && hasData && stats && (
          <>
            {/* ── Key Stats Strip ─────────────────────────────────────────── */}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <StatCard
                label="Total Trades"
                value={String(stats.totalTrades)}
                sub={`${stats.wins}W / ${stats.losses}L`}
                color={ARC_BLUE}
              />
              <StatCard
                label="Win Rate"
                value={`${(stats.winRate * 100).toFixed(1)}%`}
                sub={`${stats.wins} winners`}
                color={stats.winRate >= 0.5 ? SUCCESS_GREEN : DANGER_RED}
              />
              <StatCard
                label="Total P&L"
                value={fmtCurrency(stats.totalPnl)}
                sub="paper account"
                color={stats.totalPnl >= 0 ? SUCCESS_GREEN : DANGER_RED}
              />
              <StatCard
                label="Avg R"
                value={`${stats.avgR >= 0 ? "+" : ""}${stats.avgR.toFixed(2)}R`}
                sub="per trade"
                color={stats.avgR >= 0 ? ARC_CYAN : DANGER_RED}
              />
              <StatCard
                label="Profit Factor"
                value={stats.profitFactor >= 999 ? "∞" : stats.profitFactor.toFixed(2)}
                sub="gross win / gross loss"
                color={stats.profitFactor >= 1.5 ? SUCCESS_GREEN : stats.profitFactor >= 1 ? STARK_GOLD : DANGER_RED}
              />
              <StatCard
                label="Max Drawdown"
                value={`$${stats.maxDrawdown.toFixed(2)}`}
                sub="peak-to-trough"
                color={DANGER_RED}
              />
              <StatCard
                label="Gross Win"
                value={`$${stats.grossWin.toFixed(2)}`}
                sub="total winners"
                color={SUCCESS_GREEN}
              />
              <StatCard
                label="Gross Loss"
                value={`$${stats.grossLoss.toFixed(2)}`}
                sub="total losers"
                color={DANGER_RED}
              />
            </div>

            {/* ── Equity Curve ─────────────────────────────────────────────── */}
            <HudPanel title="Equity Curve — Cumulative P&L">
              {equityChartData.length < 2 ? (
                <EmptyState message="Need at least 2 closed trades to render equity curve" />
              ) : (
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.06 220 / 0.3)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "oklch(0.55 0.08 220)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                        axisLine={{ stroke: "oklch(0.3 0.08 220)" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "oklch(0.55 0.08 220)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                        axisLine={{ stroke: "oklch(0.3 0.08 220)" }}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                        width={60}
                      />
                      <Tooltip content={<HudTooltip />} />
                      <ReferenceLine y={0} stroke="oklch(0.5 0.1 220 / 0.5)" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="cumPnl"
                        name="Cumulative P&L"
                        stroke={ARC_BLUE}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: ARC_BLUE, stroke: "oklch(0.1 0.04 220)" }}
                        style={{ filter: `drop-shadow(0 0 4px ${ARC_BLUE})` }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </HudPanel>

            {/* ── Daily P&L ─────────────────────────────────────────────────── */}
            <HudPanel title="Daily P&L — Bar Chart">
              {dailyChartData.length === 0 ? (
                <EmptyState message="No daily P&L data yet" />
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.06 220 / 0.3)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "oklch(0.55 0.08 220)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                        axisLine={{ stroke: "oklch(0.3 0.08 220)" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "oklch(0.55 0.08 220)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                        axisLine={{ stroke: "oklch(0.3 0.08 220)" }}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                        width={60}
                      />
                      <Tooltip content={<HudTooltip />} />
                      <ReferenceLine y={0} stroke="oklch(0.5 0.1 220 / 0.5)" />
                      <Bar dataKey="pnl" name="Daily P&L" radius={[2, 2, 0, 0]}>
                        {dailyChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? SUCCESS_GREEN : DANGER_RED} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </HudPanel>

            {/* ── Model Breakdown ───────────────────────────────────────────── */}
            {stats.modelBreakdown.length > 0 && (
              <HudPanel title="Model Breakdown — Win/Loss by Strategy">
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  {stats.modelBreakdown.map((m) => {
                    const total = m.wins + m.losses;
                    const wr = total > 0 ? (m.wins / total) * 100 : 0;
                    return (
                      <div key={m.model} className="hud-panel p-3 space-y-2" style={{ border: "1px solid oklch(0.25 0.1 220 / 0.5)" }}>
                        <div className="text-[var(--arc-blue)] font-bold text-xs tracking-widest font-['Orbitron']">{m.model}</div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-muted-foreground)]">Win Rate</span>
                          <span style={{ color: wr >= 50 ? SUCCESS_GREEN : DANGER_RED }}>{wr.toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-muted-foreground)]">W / L</span>
                          <span><span style={{ color: SUCCESS_GREEN }}>{m.wins}</span> / <span style={{ color: DANGER_RED }}>{m.losses}</span></span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--color-muted-foreground)]">Net P&L</span>
                          <span style={{ color: m.pnl >= 0 ? SUCCESS_GREEN : DANGER_RED }}>${m.pnl.toFixed(2)}</span>
                        </div>
                        {/* Win rate bar */}
                        <div className="w-full h-1 rounded-full" style={{ background: "oklch(0.2 0.06 220)" }}>
                          <div className="h-1 rounded-full" style={{ width: `${wr}%`, background: wr >= 50 ? SUCCESS_GREEN : DANGER_RED, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </HudPanel>
            )}

            {/* ── Trade Log ─────────────────────────────────────────────────── */}
            <HudPanel title="Recent Closed Trades">
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-['JetBrains_Mono']">
                  <thead>
                    <tr className="border-b border-[oklch(0.22_0.06_220/0.4)]">
                      {["Model", "Dir", "P&L", "R", "Exit", "Closed"].map((h) => (
                        <th key={h} className="text-left py-2 pr-4 text-[var(--color-muted-foreground)] font-normal tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics?.trades ?? []).slice().reverse().slice(0, 20).map((t) => {
                      const pnl = parseFloat(t.pnl ?? "0");
                      const r = parseFloat(t.currentR ?? "0");
                      return (
                        <tr key={t.id} className="border-b border-[oklch(0.18_0.04_220/0.3)] hover:bg-[oklch(0.14_0.06_220/0.3)]">
                          <td className="py-2 pr-4 text-[var(--arc-blue)]">{t.model ?? "—"}</td>
                          <td className="py-2 pr-4" style={{ color: t.direction === "LONG" ? SUCCESS_GREEN : DANGER_RED }}>{t.direction ?? "—"}</td>
                          <td className="py-2 pr-4" style={{ color: pnl >= 0 ? SUCCESS_GREEN : DANGER_RED }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</td>
                          <td className="py-2 pr-4" style={{ color: r >= 0 ? ARC_CYAN : DANGER_RED }}>{r >= 0 ? "+" : ""}{r.toFixed(2)}R</td>
                          <td className="py-2 pr-4 text-[var(--color-muted-foreground)]">{t.exitReason ?? "—"}</td>
                          <td className="py-2 pr-4 text-[var(--color-muted-foreground)]">
                            {t.closedAt ? new Date(t.closedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </HudPanel>
          </>
        )}
      </div>
    </PageWrapper>
  );
}
