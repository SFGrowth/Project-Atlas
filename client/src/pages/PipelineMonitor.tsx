/**
 * PipelineMonitor.tsx — Sprint 104C Live Operational Dashboard
 *
 * Displays continuously:
 *   - Current market regime, session, last valid bar, pipeline health
 *   - Eligibility state of every model (A1, A3, B1, SB1, ORB-1) with exact reason
 *   - Open paper trades with entry/stop/target/risk/MFE/MAE
 *   - Recently closed paper trades with P&L in dollars and R
 *   - 24h / 7d / 30d performance
 *   - LLC 5-session certification progress
 *   - Recent evaluation log (last 20 bars)
 *   - Session reports
 *
 * Auto-refreshes every 5 seconds.
 */

import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Colour helpers ───────────────────────────────────────────────────────────

const REGIME_COLOR: Record<string, string> = {
  TRENDING_BULL: "oklch(0.75 0.18 150)",
  TRENDING_BEAR: "oklch(0.65 0.18 25)",
  TRENDING: "oklch(0.75 0.18 150)",
  VOLATILE: "oklch(0.75 0.18 25)",
  CHOPPY: "oklch(0.6 0.08 220)",
  RANGING: "oklch(0.6 0.08 220)",
  TRANSITIONAL: "oklch(0.65 0.12 60)",
  COMPRESSED: "oklch(0.6 0.08 280)",
  UNKNOWN: "oklch(0.45 0.05 220)",
};

function regimeColor(r: string | null | undefined) {
  if (!r) return REGIME_COLOR.UNKNOWN;
  return REGIME_COLOR[r] ?? REGIME_COLOR.UNKNOWN;
}

function sessionLabel(s: string | null | undefined) {
  if (!s) return "—";
  const m: Record<string, string> = {
    OV: "OVERNIGHT", PRE: "PRE-MARKET", AM_OPEN: "AM OPEN (09:30)", AM_MID: "AM MID (10:00)",
    PM: "PM SESSION", POST: "POST-MARKET", RTH: "RTH",
  };
  return m[s.toUpperCase()] ?? s;
}

function fmtMs(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function fmtDt(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function pnlColor(v: number) {
  if (v > 0) return "oklch(0.75 0.18 150)";
  if (v < 0) return "oklch(0.65 0.18 25)";
  return "oklch(0.6 0.08 220)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[9px] font-bold tracking-widest text-[var(--arc-cyan)]">{title}</span>
      {badge && <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: "var(--arc-cyan)20", color: "var(--arc-cyan)" }}>{badge}</span>}
      <div className="flex-1 h-px" style={{ background: "var(--arc-cyan)20" }} />
    </div>
  );
}

function ModelPill({ model, eligible, reason }: { model: string; eligible: boolean | null; reason: string | null }) {
  const bg = eligible ? "oklch(0.14 0.08 150 / 0.6)" : "oklch(0.10 0.03 220 / 0.5)";
  const border = eligible ? "oklch(0.45 0.18 150 / 0.5)" : "oklch(0.25 0.03 220 / 0.4)";
  const color = eligible ? "oklch(0.80 0.18 150)" : "oklch(0.50 0.05 220)";
  return (
    <div className="rounded p-2.5" style={{ background: bg, border: `1px solid ${border}` }} title={reason ?? ""}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold tracking-wider" style={{ color }}>{model}</span>
        <span className="text-[8px] font-bold" style={{ color }}>
          {eligible ? "✓ ELIGIBLE" : "✗ INELIGIBLE"}
        </span>
      </div>
      {reason && (
        <div className="text-[8px] leading-tight" style={{ color: "oklch(0.50 0.05 220)" }}>
          {reason.length > 55 ? reason.slice(0, 55) + "…" : reason}
        </div>
      )}
    </div>
  );
}

function LlcDots({ completed, total = 5 }: { completed: number; total?: number }) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold transition-all"
          style={{
            background: i < completed ? "oklch(0.16 0.18 150 / 0.7)" : "oklch(0.10 0.03 220 / 0.5)",
            border: `1px solid ${i < completed ? "oklch(0.55 0.18 150 / 0.6)" : "oklch(0.28 0.03 220 / 0.4)"}`,
            color: i < completed ? "oklch(0.82 0.18 150)" : "oklch(0.38 0.05 220)",
          }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PipelineMonitor() {
  const [now, setNow] = useState(Date.now());

  // Tick every second for the "last bar age" display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: monitor, dataUpdatedAt } = trpc.executive.monitorStatus.useQuery(
    undefined, { refetchInterval: 5000 }
  );

  const { data: perf } = trpc.executive.strategyPerformance.useQuery(
    { riskPerTrade: 450 }, { refetchInterval: 30000 }
  );

  const { data: recentTrades } = trpc.executive.recentClosedTrades.useQuery(
    { limit: 10 }, { refetchInterval: 15000 }
  );

  const eval_ = monitor?.latestEvaluation;
  const llc = monitor?.llcProgress;
  const openTrades = monitor?.openTrades;
  const sessionReports = monitor?.recentSessionReports ?? [];

  const lastBarAge = eval_?.evaluatedAt ? Math.floor((now - eval_.evaluatedAt) / 1000) : null;
  const pipelineOk = lastBarAge !== null && lastBarAge < 600; // within 10 min

  return (
    <div className="min-h-screen p-4 space-y-4 font-['JetBrains_Mono']" style={{ background: "oklch(0.07 0.02 220)" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-widest text-[var(--arc-cyan)]">ATLAS PIPELINE MONITOR</h1>
          <p className="text-[9px] text-[var(--color-muted-foreground)] mt-0.5">
            Autonomous 5-min bar evaluation · All models · Live Learning Certification
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${pipelineOk ? "animate-pulse" : ""}`}
              style={{ background: pipelineOk ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }} />
            <span className="text-[9px]" style={{ color: pipelineOk ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
              {pipelineOk ? "PIPELINE LIVE" : "PIPELINE STALE"}
            </span>
          </div>
          <span className="text-[9px] text-[var(--color-muted-foreground)]">
            Updated {dataUpdatedAt ? fmtMs(dataUpdatedAt) : "—"}
          </span>
        </div>
      </div>

      {/* ── Row 1: Market State + Pipeline Health ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Regime */}
        <div className="rounded border p-3" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <div className="text-[8px] text-[var(--color-muted-foreground)] tracking-widest mb-1">REGIME</div>
          <div className="text-sm font-bold" style={{ color: regimeColor(eval_?.regime) }}>
            {eval_?.regime ?? "WAITING…"}
          </div>
        </div>
        {/* Session */}
        <div className="rounded border p-3" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <div className="text-[8px] text-[var(--color-muted-foreground)] tracking-widest mb-1">SESSION</div>
          <div className="text-sm font-bold text-white">{sessionLabel(eval_?.session)}</div>
          <div className="text-[8px] mt-0.5" style={{ color: eval_?.isRth ? "var(--arc-cyan)" : "oklch(0.45 0.05 220)" }}>
            {eval_?.isRth ? "RTH" : "NON-RTH"}
          </div>
        </div>
        {/* Last Bar */}
        <div className="rounded border p-3" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <div className="text-[8px] text-[var(--color-muted-foreground)] tracking-widest mb-1">LAST BAR</div>
          <div className="text-sm font-bold text-white font-mono">
            {eval_?.barTimeEt ? eval_.barTimeEt.replace("T", " ").slice(0, 16) : "—"}
          </div>
          {lastBarAge !== null && (
            <div className="text-[8px] mt-0.5" style={{ color: lastBarAge < 360 ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
              {lastBarAge < 60 ? `${lastBarAge}s ago` : `${Math.floor(lastBarAge / 60)}m ago`}
            </div>
          )}
        </div>
        {/* ADX */}
        <div className="rounded border p-3" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <div className="text-[8px] text-[var(--color-muted-foreground)] tracking-widest mb-1">ADX</div>
          <div className="text-sm font-bold" style={{ color: (eval_?.adx ?? 0) >= 25 ? "oklch(0.75 0.18 150)" : "oklch(0.6 0.08 220)" }}>
            {eval_?.adx?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[8px] mt-0.5 text-[var(--color-muted-foreground)]">
            {(eval_?.adx ?? 0) >= 25 ? "TRENDING" : (eval_?.adx ?? 0) >= 20 ? "BORDERLINE" : "WEAK"}
          </div>
        </div>
      </div>

      {/* ── Row 2: Model Eligibility Grid ── */}
      <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
        <SectionHeader title="MODEL ELIGIBILITY — CURRENT BAR" badge={eval_?.barTimeEt?.slice(11, 16) ?? "WAITING"} />
        {eval_ ? (
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(eval_.models).map(([model, info]) => (
              <ModelPill
                key={model}
                model={model}
                eligible={(info as any).eligible}
                reason={(info as any).reason}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[var(--color-muted-foreground)] text-xs">
            Waiting for first bar evaluation…
          </div>
        )}

        {/* Integrity status */}
        {eval_ && (
          <div className="mt-3 flex items-center gap-4 text-[9px]">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: eval_.integrityOk ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }} />
              <span style={{ color: eval_.integrityOk ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
                {eval_.integrityOk ? "INTEGRITY OK" : "INTEGRITY FAIL"}
              </span>
            </div>
            {eval_.gapDetected && (
              <span style={{ color: "oklch(0.65 0.18 25)" }}>⚠ GAP: {eval_.gapMinutes}min</span>
            )}
            {eval_.duplicateDetected && (
              <span style={{ color: "oklch(0.65 0.18 25)" }}>⚠ DUPLICATE BAR</span>
            )}
            {eval_.integrityNotes && (
              <span style={{ color: "oklch(0.6 0.12 60)" }}>{eval_.integrityNotes}</span>
            )}
            {eval_.signalModel && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ background: "oklch(0.15 0.12 60 / 0.5)", border: "1px solid oklch(0.6 0.18 60 / 0.4)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--stark-gold)" }} />
                <span style={{ color: "var(--stark-gold)" }}>
                  SIGNAL: {eval_.signalModel} {eval_.signalDirection}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Row 3: Open Positions + LLC Progress ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

        {/* Open Positions */}
        <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <SectionHeader title="OPEN POSITIONS" />
          {(() => {
            const all = openTrades && !Array.isArray(openTrades)
              ? [...(openTrades.standard ?? []), ...(openTrades.sb1 ?? [])]
              : [];
            if (all.length === 0) {
              return <div className="text-[10px] text-[var(--color-muted-foreground)] py-4 text-center">No open positions</div>;
            }
            return all.map((t) => (
              <div key={t.id} className="rounded p-3 mb-2" style={{ background: "oklch(0.12 0.04 220 / 0.6)", border: "1px solid oklch(0.3 0.04 220 / 0.4)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold" style={{ color: "var(--stark-gold)" }}>{t.model}</span>
                  <span className="text-[9px] font-bold" style={{ color: t.direction === "LONG" ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
                    {t.direction}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[9px]">
                  <div><span className="text-[var(--color-muted-foreground)]">ENTRY </span><span className="text-white font-mono">{t.entry.toFixed(2)}</span></div>
                  <div><span className="text-[var(--color-muted-foreground)]">STOP </span><span className="font-mono" style={{ color: "oklch(0.65 0.18 25)" }}>{t.stop.toFixed(2)}</span></div>
                  <div><span className="text-[var(--color-muted-foreground)]">TARGET </span><span className="font-mono" style={{ color: "oklch(0.75 0.18 150)" }}>{t.target.toFixed(2)}</span></div>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[9px]">
                  <span style={{ color: "var(--arc-cyan)" }}>RISK ${t.riskDollars}</span>
                  <span className="text-[var(--color-muted-foreground)]">opened {fmtMs(t.openedAt)}</span>
                </div>
              </div>
            ));
          })()}
        </div>

        {/* LLC Progress */}
        <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <SectionHeader title="LIVE LEARNING CERTIFICATION" />
          {llc ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <LlcDots completed={llc.sessionsCompleted} />
                <div>
                  <div className="text-xs font-bold" style={{ color: llc.currentStatus === "CERTIFIED" ? "oklch(0.82 0.18 150)" : "var(--arc-cyan)" }}>
                    {llc.currentStatus === "CERTIFIED" ? "✓ CERTIFIED" : `${llc.sessionsCompleted}/5 CLEAN SESSIONS`}
                  </div>
                  <div className="text-[8px] text-[var(--color-muted-foreground)] mt-0.5">
                    {llc.windowId ?? "No window started"}
                  </div>
                </div>
              </div>

              {/* Session list */}
              {llc.sessions && llc.sessions.length > 0 && (
                <div className="space-y-1">
                  {(llc.sessions as any[]).map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-[9px] py-1 border-b" style={{ borderColor: "oklch(0.2 0.03 220 / 0.4)" }}>
                      <span className="w-4 text-center font-bold" style={{ color: "var(--arc-cyan)" }}>S{s.sessionNumber}</span>
                      <span className="text-[var(--color-muted-foreground)]">
                        {s.sessionDate instanceof Date ? s.sessionDate.toISOString().slice(0, 10) : String(s.sessionDate ?? "—")}
                      </span>
                      <span className="font-bold" style={{
                        color: s.certificationStatus === "CLEAN" ? "oklch(0.75 0.18 150)" :
                          s.certificationStatus === "CONTAMINATED" ? "oklch(0.65 0.18 25)" : "oklch(0.6 0.12 60)"
                      }}>
                        {s.certificationStatus}
                      </span>
                      <span className="text-[var(--color-muted-foreground)]">{s.barsReceived}/{s.barsExpected} bars</span>
                      <span style={{ color: pnlColor(Number(s.sessionPnl ?? 0)) }}>
                        ${Number(s.sessionPnl ?? 0).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--color-muted-foreground)] py-4 text-center">
              LLC not started — awaiting first complete RTH session
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Performance ── */}
      {perf && (
        <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <SectionHeader title="PERFORMANCE SUMMARY" />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "24H", data: perf.last24h },
              { label: "7D", data: perf.last7d },
              { label: "30D", data: perf.last30d },
            ].map(({ label, data }) => (
              <div key={label} className="rounded p-3" style={{ background: "oklch(0.12 0.04 220 / 0.5)", border: "1px solid oklch(0.25 0.04 220 / 0.4)" }}>
                <div className="text-[8px] text-[var(--color-muted-foreground)] tracking-widest mb-2">{label}</div>
                <div className="text-sm font-bold" style={{ color: pnlColor(data?.netPnlDollar ?? 0) }}>
                  ${(data?.netPnlDollar ?? 0).toFixed(0)}
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1.5 text-[8px]">
                  <div><span className="text-[var(--color-muted-foreground)]">Trades </span><span className="text-white">{data?.trades ?? 0}</span></div>
                  <div><span className="text-[var(--color-muted-foreground)]">WR </span><span className="text-white">{((data?.winRate ?? 0) * 100).toFixed(0)}%</span></div>
                  <div><span className="text-[var(--color-muted-foreground)]">PF </span><span className="text-white">{(data?.profitFactor ?? 0).toFixed(2)}</span></div>
                  <div><span className="text-[var(--color-muted-foreground)]">Avg R </span><span className="text-white">{(data?.netPnlR ?? 0).toFixed(2)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 5: Recent Evaluation Log ── */}
      <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
        <SectionHeader title="RECENT EVALUATION LOG" badge="LAST 20 BARS" />
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "oklch(0.2 0.03 220 / 0.5)" }}>
                {["BAR TIME", "SESSION", "REGIME", "ADX", "A1", "A3", "B1", "SB1", "ORB-1", "INTEGRITY", "SIGNAL"].map(h => (
                  <th key={h} className="text-left py-1.5 pr-3 font-bold tracking-widest text-[var(--color-muted-foreground)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(monitor?.recentEvaluations ?? []).map((e: any, i: number) => (
                <tr key={i} className="border-b" style={{ borderColor: "oklch(0.15 0.03 220 / 0.3)" }}>
                  <td className="py-1.5 pr-3 font-mono text-white">{e.barTimeEt?.slice(11, 16) ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-[var(--color-muted-foreground)]">{e.session ?? "—"}</td>
                  <td className="py-1.5 pr-3 font-bold" style={{ color: regimeColor(e.regime) }}>{e.regime ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-white">{e.adx?.toFixed(1) ?? "—"}</td>
                  {["a1Eligible","a3Eligible","b1Eligible","sb1Eligible","orb1Eligible"].map(k => (
                    <td key={k} className="py-1.5 pr-3">
                      <span style={{ color: (e as any)[k] ? "oklch(0.75 0.18 150)" : "oklch(0.35 0.05 220)" }}>
                        {(e as any)[k] ? "✓" : "✗"}
                      </span>
                    </td>
                  ))}
                  <td className="py-1.5 pr-3">
                    <span style={{ color: e.integrityOk ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
                      {e.integrityOk ? "OK" : "FAIL"}
                    </span>
                    {e.gapDetected && <span style={{ color: "oklch(0.65 0.18 25)" }}> GAP</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    {e.signalModel ? (
                      <span className="font-bold" style={{ color: "var(--stark-gold)" }}>{e.signalModel}</span>
                    ) : (
                      <span style={{ color: "oklch(0.4 0.05 220)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!monitor?.recentEvaluations || monitor.recentEvaluations.length === 0) && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-[var(--color-muted-foreground)]">
                    No evaluations yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Row 6: Recently Closed Trades ── */}
      {recentTrades && recentTrades.length > 0 && (
        <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <SectionHeader title="RECENTLY CLOSED TRADES" />
          <div className="overflow-x-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "oklch(0.2 0.03 220 / 0.5)" }}>
                  {["MODEL","DIR","ENTRY","EXIT","REASON","P&L $","P&L R","MFE","MAE","CLOSED"].map(h => (
                    <th key={h} className="text-left py-1.5 pr-3 font-bold tracking-widest text-[var(--color-muted-foreground)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "oklch(0.15 0.03 220 / 0.3)" }}>
                    <td className="py-1.5 pr-3 font-bold" style={{ color: "var(--stark-gold)" }}>{t.model}</td>
                    <td className="py-1.5 pr-3" style={{ color: t.direction === "LONG" ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>{t.direction}</td>
                    <td className="py-1.5 pr-3 font-mono text-white">{t.entry.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 font-mono text-white">{t.exitPrice?.toFixed(2) ?? "—"}</td>
                    <td className="py-1.5 pr-3" style={{ color: t.exitReason === "TARGET_HIT" ? "oklch(0.75 0.18 150)" : "oklch(0.65 0.18 25)" }}>
                      {t.exitReason === "TARGET_HIT" ? "TARGET" : t.exitReason === "STOP_HIT" ? "STOP" : t.exitReason ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3 font-bold" style={{ color: pnlColor(t.pnlDollars ?? 0) }}>
                      {t.pnlDollars !== null ? `$${t.pnlDollars.toFixed(0)}` : "—"}
                    </td>
                    <td className="py-1.5 pr-3" style={{ color: pnlColor(t.rMultiple ?? 0) }}>
                      {t.rMultiple !== null ? `${t.rMultiple.toFixed(2)}R` : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-white">{t.mfe !== null ? `$${t.mfe.toFixed(0)}` : "—"}</td>
                    <td className="py-1.5 pr-3 text-white">{t.mae !== null ? `$${t.mae.toFixed(0)}` : "—"}</td>
                    <td className="py-1.5 pr-3 text-[var(--color-muted-foreground)]">{fmtDt(t.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 7: Session Reports ── */}
      {sessionReports.length > 0 && (
        <div className="rounded border p-4" style={{ borderColor: "var(--arc-cyan)25", background: "oklch(0.09 0.03 220 / 0.8)" }}>
          <SectionHeader title="SESSION REPORTS" />
          <div className="space-y-2">
            {sessionReports.map((r: any, i: number) => (
              <div key={i} className="rounded p-3" style={{ background: "oklch(0.12 0.04 220 / 0.5)", border: "1px solid oklch(0.25 0.04 220 / 0.4)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-white">{r.sessionDate}</span>
                  <span className="text-[9px] font-bold" style={{
                    color: r.certificationStatus === "CLEAN" ? "oklch(0.75 0.18 150)" :
                      r.certificationStatus === "CONTAMINATED" ? "oklch(0.65 0.18 25)" : "oklch(0.6 0.12 60)"
                  }}>
                    {r.certificationStatus}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-[9px]">
                  <span><span className="text-[var(--color-muted-foreground)]">Bars </span><span className="text-white">{r.barsReceived}/{r.barsExpected}</span></span>
                  <span><span className="text-[var(--color-muted-foreground)]">P&L </span><span style={{ color: pnlColor(r.sessionPnl) }}>${r.sessionPnl?.toFixed(0) ?? 0}</span></span>
                  <span><span className="text-[var(--color-muted-foreground)]">Status </span><span style={{ color: r.status === "CLEAN" ? "oklch(0.75 0.18 150)" : "oklch(0.6 0.08 220)" }}>{r.status}</span></span>
                </div>
                {r.ownerActionRequired && (
                  <div className="mt-1.5 text-[8px] p-1.5 rounded" style={{ background: "oklch(0.12 0.08 25 / 0.5)", color: "oklch(0.65 0.18 25)" }}>
                    ⚠ {r.ownerActionRequired}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
