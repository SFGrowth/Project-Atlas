/**
 * Shared JARVIS/ORION HUD components used across all dashboard pages.
 */
import React from "react";
import type { PipelineReportPayload, VerificationCheck } from "@shared/pipelineTypes";

// ─── Utility Helpers ──────────────────────────────────────────────────────────

export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

/**
 * fmtField — returns "DATA UNAVAILABLE" for null/undefined critical fields.
 * Use for fields that MUST have a value when the pipeline is active.
 * Falls back to a dash for non-critical display fields (use fmt/fmtTime for those).
 */
export function fmtField(v: string | number | null | undefined, critical = false): string {
  if (v === null || v === undefined || v === "") {
    return critical ? "DATA UNAVAILABLE" : "—";
  }
  return String(v);
}

/**
 * fmtCurrency — formats a dollar value, returns "DATA UNAVAILABLE" if null.
 */
export function fmtCurrency(v: number | string | null | undefined, critical = false): string {
  if (v === null || v === undefined || v === "") {
    return critical ? "DATA UNAVAILABLE" : "—";
  }
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return critical ? "DATA UNAVAILABLE" : "—";
  return `$${n.toFixed(2)}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" }); }
  catch { return iso; }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", timeZone: "America/New_York" })} ${d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })}`;
  } catch { return iso ?? "—"; }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "America/New_York" }); }
  catch { return iso; }
}

export function pnlClass(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "—") return "pnl-neutral";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "pnl-neutral";
  return n >= 0 ? "pnl-positive" : "pnl-negative";
}

// ─── HUD Panel ────────────────────────────────────────────────────────────────

export function HudPanel({ title, children, className = "", action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={`hud-panel hud-panel-br flex flex-col ${className}`}>
      <div className="hud-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="hud-header-dot" />
          {title}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1 p-3 overflow-auto">{children}</div>
    </div>
  );
}

// ─── Data Row ─────────────────────────────────────────────────────────────────

export function DataRow({ label, value, valueClass = "data-value" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[oklch(0.22_0.06_220/0.3)]">
      <span className="data-label">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export function SignalBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  const v = value.toUpperCase();
  if (v === "LONG" || v === "BUY") return <span className="status-badge status-live">{value}</span>;
  if (v === "SHORT" || v === "SELL") return <span className="status-badge status-error">{value}</span>;
  return <span className="status-badge status-inactive">{value}</span>;
}

export function StateBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  const v = value.toUpperCase();
  const cls = v.includes("ACTIVE") || v.includes("TRADE") ? "status-active"
    : v.includes("OVERNIGHT") || v.includes("FLAT") ? "status-inactive"
    : v.includes("RISK") || v.includes("HALT") ? "status-error"
    : "status-ok";
  return <span className={`status-badge ${cls}`}>{value}</span>;
}

export function ApprovalBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  return <span className={`status-badge ${value === "APPROVED" ? "status-live" : "status-error"}`}>{value}</span>;
}

export function PassFailBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[var(--color-muted-foreground)]">—</span>;
  return <span className={`status-badge ${value === "PASS" ? "status-live" : "status-error"}`}>{value}</span>;
}

// ─── Check Row ────────────────────────────────────────────────────────────────

export function CheckRow({ check }: { check: VerificationCheck }) {
  return (
    <div className="check-row">
      <span className={check.passed ? "check-pass" : "check-fail"}>{check.passed ? "▶" : "✕"}</span>
      <span className="data-label flex-1">{check.name}</span>
      {check.value && <span className="data-value text-xs">{check.value}</span>}
    </div>
  );
}

// ─── Model Card ───────────────────────────────────────────────────────────────

export function ModelCard({ label, model }: { label: string; model: PipelineReportPayload["model_a1"] }) {
  return (
    <div className="model-card">
      <div className="text-[var(--arc-blue)] font-bold text-xs tracking-widest mb-2 font-['Orbitron']">{label}</div>
      <div className="space-y-1">
        <DataRow label="Signal" value={<SignalBadge value={model?.signal_direction} />} />
        <DataRow label="Edge Score" value={fmt(model?.edge_score)} />
        <DataRow label="Basis" value={model?.signal_basis ?? "—"} />
      </div>
    </div>
  );
}

// ─── Overview Strip ───────────────────────────────────────────────────────────

export function OverviewStrip({ payload, sseStatus, backendStatus, dataFreshness, reportCount }: {
  payload: PipelineReportPayload | null;
  sseStatus: string;
  backendStatus: string;
  dataFreshness: string;
  reportCount: number;
}) {
  const sseClass = sseStatus === "CONNECTED" ? "status-live" : sseStatus === "ERROR" ? "status-error" : "status-warn";
  const beClass = backendStatus === "OK" ? "status-ok" : backendStatus === "DEGRADED" ? "status-warn" : "status-error";
  const dfClass = dataFreshness === "LIVE" ? "status-live"
    : dataFreshness === "STALE" ? "status-stale"
    : dataFreshness === "DEGRADED" ? "status-warn"
    : dataFreshness === "OFFLINE" ? "status-error"
    : dataFreshness === "DATA_INVALID" ? "status-error"
    : "status-inactive";

  return (
    <div className="hud-panel hex-bg" style={{ borderBottom: "2px solid var(--arc-blue)", boxShadow: "0 4px 24px oklch(0.72 0.22 210 / 0.2)", borderRadius: 0 }}>
      <div className="flex items-center gap-6 px-4 py-3 flex-wrap">
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--arc-blue)] flex items-center justify-center" style={{ boxShadow: "0 0 16px var(--arc-blue), inset 0 0 8px oklch(0.72 0.22 210 / 0.3)" }}>
            <div className="w-3 h-3 rounded-full bg-[var(--arc-blue)]" style={{ boxShadow: "0 0 8px var(--arc-blue)" }} />
          </div>
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue">ORION</div>
            <div className="text-[9px] tracking-[0.12em] text-[var(--color-muted-foreground)]">QUANT TRADING OS</div>
          </div>
        </div>

        <div className="w-px h-8 bg-[var(--hud-border)]" />

        <div className="flex flex-col gap-1">
          <span className="data-label">Master State</span>
          <StateBadge value={payload?.master_state} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="data-label">Symbol</span>
          <span className="data-value-lg glow-cyan font-['Orbitron']">{payload?.symbol ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="data-label">ADE Decision</span>
          <SignalBadge value={payload?.ade_decision} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="data-label">ARI Approval</span>
          <ApprovalBadge value={payload?.ari_approved} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="data-label">TVL Status</span>
          <PassFailBadge value={payload?.tvl_status} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="data-label">Reports</span>
          <span className="data-value-lg glow-blue font-['Orbitron']">{reportCount}</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">SSE</span>
            <span className={`status-badge ${sseClass}`}>{sseStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">Backend</span>
            <span className={`status-badge ${beClass}`}>{backendStatus}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="data-label">Data</span>
            <span className={`status-badge ${dfClass}`}>{dataFreshness}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Wrapper ─────────────────────────────────────────────────────────────

export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full hex-bg" style={{ background: "var(--color-background)" }}>
      {children}
    </div>
  );
}

export function PageContent({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex-1 p-4 ${className}`}>{children}</div>;
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message = "No data received yet" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-12 h-12 rounded-full border border-[var(--hud-border)] flex items-center justify-center opacity-40">
        <div className="w-4 h-4 rounded-full border border-[var(--arc-blue)]" />
      </div>
      <span className="text-xs tracking-widest text-[var(--color-muted-foreground)]">{message}</span>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-bold tracking-[0.15em] text-[var(--arc-blue)] font-['Orbitron'] glow-blue">{title}</h1>
      {subtitle && <p className="text-xs tracking-widest text-[var(--color-muted-foreground)] mt-1">{subtitle}</p>}
    </div>
  );
}
