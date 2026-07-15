/**
 * TradersPost.tsx — Sprint 114A: Unified Portfolio Execution Dashboard
 *
 * Architecture:
 *   - ONE TradersPost webhook for the entire Atlas portfolio
 *   - ONE master execution state: PAPER_ONLY | APEX_EVAL_ACTIVE | HALTED
 *   - Per-strategy ENABLED/PAUSED/RETIRED/FAULTED controls (proposal gate)
 *   - No daily re-arming required
 *
 * Layout:
 *   Top: Portfolio Execution (state, webhook, safety, last dispatch)
 *   Left: Strategy Eligibility (6 strategy status + ADE scores)
 *   Right: Dispatch Log
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Pause,
  Play,
  RefreshCw,
  Send,
  Shield,
  ShieldOff,
  XCircle,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExecState = "PAPER_ONLY" | "APEX_EVAL_ACTIVE" | "HALTED";
type StrategyStatus = "ENABLED" | "PAUSED" | "RETIRED" | "FAULTED";

type PortfolioConfig = {
  id: number;
  executionState: ExecState;
  webhookUrl: string | null;
  accountLabel: string | null;
  ticker: string;
  quantity: number;
  riskDollars: string;
  activatedAt: number | null;
  activatedByOwner: boolean;
  haltReason: string | null;
  haltedAt: number | null;
  lastApprovedModel: string | null;
  lastDispatchAt: number | null;
  lastDispatchStatus: string | null;
  lastTpResponse: string | null;
  updatedAt: Date;
};

type StrategyControl = {
  id: number;
  strategyId: string;
  strategyStatus: StrategyStatus;
  pauseReason: string | null;
  lastProposalAt: number | null;
  lastSelectedAt: number | null;
  lastAdeScore: string | null;
  lastDirection: string | null;
  lastNoTradeReason: string | null;
};

type TpDispatch = {
  id: number;
  strategyId: string;
  direction: string;
  entryPrice: string | null;
  stopPrice: string | null;
  targetPrice: string | null;
  status: string;
  httpStatus: number | null;
  errorMessage: string | null;
  dispatchedAt: Date;
  barTimeMs: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateColor(state: ExecState): string {
  if (state === "APEX_EVAL_ACTIVE") return "oklch(0.55 0.22 145)";
  if (state === "HALTED") return "oklch(0.60 0.22 30)";
  return "oklch(0.55 0.15 220)";
}

function stateLabel(state: ExecState): string {
  if (state === "APEX_EVAL_ACTIVE") return "APEX EVAL ACTIVE";
  if (state === "HALTED") return "HALTED";
  return "PAPER ONLY";
}

function strategyStatusColor(s: StrategyStatus): string {
  if (s === "ENABLED") return "oklch(0.55 0.22 145)";
  if (s === "PAUSED") return "oklch(0.60 0.18 50)";
  if (s === "FAULTED") return "oklch(0.60 0.22 30)";
  return "oklch(0.40 0.05 220)"; // RETIRED
}

function fmtTs(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

// ─── Portfolio Execution Panel ────────────────────────────────────────────────

function PortfolioExecutionPanel({
  config,
  onRefresh,
}: {
  config: PortfolioConfig;
  onRefresh: () => void;
}) {
  const [webhookInput, setWebhookInput] = useState(config.webhookUrl ?? "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [haltReason, setHaltReason] = useState("");
  const [showHaltInput, setShowHaltInput] = useState(false);
  const [confirmApex, setConfirmApex] = useState(false);

  const setUrlMutation = trpc.tp.setWebhookUrl.useMutation({
    onSuccess: () => {
      toast.success("Portfolio webhook URL updated");
      setEditingUrl(false);
      onRefresh();
    },
    onError: (err: { message: string }) => toast.error(`URL save failed: ${err.message}`),
  });

  const activateMutation = trpc.tp.activateApex.useMutation({
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      setConfirmApex(false);
      onRefresh();
    },
    onError: (err: { message: string }) => toast.error(`Activation failed: ${err.message}`),
  });

  const haltMutation = trpc.tp.haltPortfolio.useMutation({
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      setShowHaltInput(false);
      setHaltReason("");
      onRefresh();
    },
    onError: (err: { message: string }) => toast.error(`Halt failed: ${err.message}`),
  });

  const resumeMutation = trpc.tp.resumePaper.useMutation({
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      onRefresh();
    },
    onError: (err: { message: string }) => toast.error(`Resume failed: ${err.message}`),
  });

  const sc = stateColor(config.executionState);
  const isApex = config.executionState === "APEX_EVAL_ACTIVE";
  const isHalted = config.executionState === "HALTED";
  const isPaper = config.executionState === "PAPER_ONLY";

  return (
    <div style={{
      background: "oklch(0.10 0.04 220)",
      border: `1px solid ${sc}40`,
      borderRadius: 8, padding: "18px 20px", marginBottom: 24,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: sc, boxShadow: `0 0 10px ${sc}`,
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 2 }}>
            PORTFOLIO EXECUTION STATE
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: sc, letterSpacing: "0.08em" }}>
            {stateLabel(config.executionState)}
          </div>
          {isHalted && config.haltReason && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.65 0.18 30)", marginTop: 2 }}>
              Halt reason: {config.haltReason}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {isPaper && !confirmApex && (
            <button
              onClick={() => setConfirmApex(true)}
              disabled={!config.webhookUrl}
              title={!config.webhookUrl ? "Set webhook URL first" : "Activate Apex 50K Evaluation — requires owner confirmation"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                padding: "7px 14px", borderRadius: 4, cursor: config.webhookUrl ? "pointer" : "not-allowed",
                background: config.webhookUrl ? "oklch(0.16 0.08 145)" : "oklch(0.12 0.04 220)",
                border: `1px solid ${config.webhookUrl ? "oklch(0.40 0.18 145)" : "oklch(0.25 0.05 220)"}`,
                color: config.webhookUrl ? "oklch(0.75 0.18 145)" : "var(--color-muted-foreground)",
                opacity: config.webhookUrl ? 1 : 0.5,
                transition: "all 0.15s ease",
              }}
            >
              <Zap size={11} /> ACTIVATE APEX
            </button>
          )}

          {isPaper && confirmApex && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.75 0.18 50)" }}>Confirm live dispatch?</span>
              <button
                onClick={() => activateMutation.mutate({ ownerConfirmed: true })}
                disabled={activateMutation.isPending}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 10px", borderRadius: 4, cursor: "pointer",
                  background: "oklch(0.18 0.10 145)", border: "1px solid oklch(0.45 0.20 145)",
                  color: "oklch(0.80 0.20 145)",
                }}
              >
                {activateMutation.isPending ? "…" : "YES — ACTIVATE"}
              </button>
              <button
                onClick={() => setConfirmApex(false)}
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 10px", borderRadius: 4, cursor: "pointer",
                  background: "oklch(0.14 0.04 220)", border: "1px solid oklch(0.30 0.06 220)",
                  color: "var(--color-muted-foreground)",
                }}
              >
                CANCEL
              </button>
            </div>
          )}

          {isApex && (
            <button
              onClick={() => setShowHaltInput(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                padding: "7px 14px", borderRadius: 4, cursor: "pointer",
                background: "oklch(0.16 0.10 30)", border: "1px solid oklch(0.40 0.20 30)",
                color: "oklch(0.75 0.20 30)", transition: "all 0.15s ease",
              }}
            >
              <ShieldOff size={11} /> EMERGENCY HALT
            </button>
          )}

          {isHalted && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                padding: "7px 14px", borderRadius: 4, cursor: "pointer",
                background: "oklch(0.14 0.06 220)", border: "1px solid oklch(0.35 0.10 220)",
                color: "oklch(0.70 0.10 220)", transition: "all 0.15s ease",
              }}
            >
              <Play size={11} /> RESUME PAPER
            </button>
          )}
        </div>
      </div>

      {/* Halt input */}
      {showHaltInput && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", marginBottom: 16,
          background: "oklch(0.12 0.08 30 / 0.4)", border: "1px solid oklch(0.35 0.15 30 / 0.5)",
          borderRadius: 6, padding: "10px 12px",
        }}>
          <AlertTriangle size={12} style={{ color: "oklch(0.65 0.20 30)", flexShrink: 0 }} />
          <Input
            value={haltReason}
            onChange={(e) => setHaltReason(e.target.value)}
            placeholder="Halt reason (required)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, flex: 1 }}
          />
          <button
            onClick={() => haltMutation.mutate({ reason: haltReason })}
            disabled={haltMutation.isPending || !haltReason.trim()}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 12px", borderRadius: 4, cursor: "pointer",
              background: "oklch(0.18 0.12 30)", border: "1px solid oklch(0.45 0.22 30)",
              color: "oklch(0.80 0.22 30)",
            }}
          >
            {haltMutation.isPending ? "…" : "HALT"}
          </button>
          <button
            onClick={() => { setShowHaltInput(false); setHaltReason(""); }}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 10px", borderRadius: 4, cursor: "pointer",
              background: "oklch(0.14 0.04 220)", border: "1px solid oklch(0.28 0.06 220)",
              color: "var(--color-muted-foreground)",
            }}
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { label: "ACCOUNT ROUTE", value: config.accountLabel ?? "APEX_50K_EVAL" },
          { label: "LAST APPROVED MODEL", value: config.lastApprovedModel ?? "—" },
          { label: "LAST DISPATCH", value: fmtTs(config.lastDispatchAt) },
          { label: "LAST TP STATUS", value: config.lastDispatchStatus ?? "—" },
          { label: "TICKER", value: config.ticker },
          { label: "RISK / TRADE", value: `$${config.riskDollars}` },
        ].map((item) => (
          <div key={item.label} style={{
            background: "oklch(0.08 0.03 220)", border: "1px solid oklch(0.20 0.06 220 / 0.5)",
            borderRadius: 6, padding: "8px 12px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 4 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "oklch(0.80 0.08 220)" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Webhook URL */}
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 6 }}>
          TRADERSPOST WEBHOOK URL (single endpoint for all strategies)
        </div>
        {editingUrl ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Input
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://traderspost.io/trading/webhook/..."
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, flex: 1 }}
            />
            <Button size="sm" onClick={() => setUrlMutation.mutate({ webhookUrl: webhookInput })} disabled={setUrlMutation.isPending || !webhookInput}>
              {setUrlMutation.isPending ? "…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingUrl(false); setWebhookInput(config.webhookUrl ?? ""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              flex: 1, fontFamily: "var(--font-mono)", fontSize: 11,
              color: config.webhookUrl ? "oklch(0.75 0.08 220)" : "var(--color-muted-foreground)",
              background: "oklch(0.08 0.03 220)", border: "1px solid oklch(0.20 0.06 220 / 0.6)",
              borderRadius: 4, padding: "6px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {config.webhookUrl ?? "— not configured —"}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditingUrl(true)}>Edit</Button>
          </div>
        )}
        {!config.webhookUrl && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
            <AlertTriangle size={10} style={{ color: "oklch(0.65 0.18 50)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.65 0.18 50)" }}>
              Apex activation is blocked until a webhook URL is configured
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Strategy Eligibility Panel ───────────────────────────────────────────────

function StrategyEligibilityPanel({
  controls,
  onRefresh,
}: {
  controls: StrategyControl[];
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const setStatusMutation = trpc.tp.setStrategyStatus.useMutation({
    onSuccess: (data: { message: string }) => {
      toast.success(data.message);
      onRefresh();
    },
    onError: (err: { message: string }) => toast.error(`Status update failed: ${err.message}`),
  });

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 12 }}>
        STRATEGY ELIGIBILITY
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {controls.map((ctrl) => {
          const sc = strategyStatusColor(ctrl.strategyStatus);
          const isExpanded = expandedId === ctrl.strategyId;
          return (
            <div key={ctrl.strategyId} style={{
              background: "oklch(0.10 0.04 220)",
              border: `1px solid ${ctrl.strategyStatus === "ENABLED" ? "oklch(0.28 0.10 145 / 0.5)" : "oklch(0.22 0.06 220 / 0.5)"}`,
              borderRadius: 8, overflow: "hidden",
            }}>
              {/* Row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: sc, boxShadow: ctrl.strategyStatus === "ENABLED" ? `0 0 6px ${sc}` : "none",
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--arc-blue)", letterSpacing: "0.08em" }}>
                      {ctrl.strategyId}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
                      color: sc, border: `1px solid ${sc}`, borderRadius: 3, padding: "1px 5px",
                    }}>
                      {ctrl.strategyStatus}
                    </span>
                    {ctrl.lastAdeScore && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>
                        ADE: {parseFloat(ctrl.lastAdeScore).toFixed(1)}
                      </span>
                    )}
                  </div>
                  {ctrl.lastNoTradeReason && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "oklch(0.50 0.08 220)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ctrl.lastNoTradeReason}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {ctrl.strategyStatus === "ENABLED" ? (
                    <button
                      onClick={() => setStatusMutation.mutate({ strategyId: ctrl.strategyId as "A1" | "A3" | "B1" | "SB1" | "ORB-1" | "S109-001", status: "PAUSED", reason: "Manual pause" })}
                      disabled={setStatusMutation.isPending}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
                        padding: "4px 8px", borderRadius: 3, cursor: "pointer",
                        background: "oklch(0.14 0.06 50)", border: "1px solid oklch(0.35 0.14 50)",
                        color: "oklch(0.70 0.16 50)", transition: "all 0.15s ease",
                      }}
                    >
                      <Pause size={8} /> PAUSE
                    </button>
                  ) : ctrl.strategyStatus === "PAUSED" || ctrl.strategyStatus === "FAULTED" ? (
                    <button
                      onClick={() => setStatusMutation.mutate({ strategyId: ctrl.strategyId as "A1" | "A3" | "B1" | "SB1" | "ORB-1" | "S109-001", status: "ENABLED" })}
                      disabled={setStatusMutation.isPending}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
                        padding: "4px 8px", borderRadius: 3, cursor: "pointer",
                        background: "oklch(0.14 0.06 145)", border: "1px solid oklch(0.35 0.14 145)",
                        color: "oklch(0.70 0.16 145)", transition: "all 0.15s ease",
                      }}
                    >
                      <Play size={8} /> ENABLE
                    </button>
                  ) : null}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : ctrl.strategyId)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-muted-foreground)", padding: 2 }}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  borderTop: "1px solid oklch(0.20 0.06 220 / 0.4)",
                  padding: "10px 14px",
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
                }}>
                  {[
                    { label: "LAST PROPOSAL", value: fmtTs(ctrl.lastProposalAt) },
                    { label: "LAST SELECTED", value: fmtTs(ctrl.lastSelectedAt) },
                    { label: "LAST ADE SCORE", value: ctrl.lastAdeScore ? parseFloat(ctrl.lastAdeScore).toFixed(2) : "—" },
                    { label: "LAST DIRECTION", value: ctrl.lastDirection ?? "—" },
                    { label: "PAUSE REASON", value: ctrl.pauseReason ?? "—" },
                    { label: "NO-TRADE REASON", value: ctrl.lastNoTradeReason ?? "—" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", color: "var(--color-muted-foreground)", marginBottom: 2 }}>
                        {item.label}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.70 0.06 220)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dispatch Log ─────────────────────────────────────────────────────────────

function DispatchRow({ d }: { d: TpDispatch }) {
  const isOk = d.status === "DISPATCHED";
  const isPaper = d.status === "DISARMED" && (d.errorMessage?.includes("PAPER_ONLY") ?? false);
  const statusColor = isOk
    ? "oklch(0.55 0.22 145)"
    : isPaper
    ? "oklch(0.50 0.10 220)"
    : d.status === "SAFETY_HALTED"
    ? "oklch(0.60 0.22 30)"
    : "oklch(0.50 0.08 220)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 70px 55px 1fr 90px 50px",
      gap: 6, alignItems: "center",
      padding: "6px 12px",
      borderBottom: "1px solid oklch(0.18 0.06 220 / 0.4)",
      fontFamily: "var(--font-mono)", fontSize: 10,
    }}>
      <div style={{ color: "var(--color-muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {new Date(d.dispatchedAt).toLocaleTimeString()}
      </div>
      <div style={{ color: "var(--arc-blue)", fontWeight: 600 }}>{d.strategyId}</div>
      <div style={{ color: d.direction === "LONG" ? "oklch(0.65 0.22 145)" : "oklch(0.65 0.22 30)", fontWeight: 600 }}>
        {d.direction}
      </div>
      <div style={{ color: "oklch(0.60 0.06 220)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {d.entryPrice ? `@ ${parseFloat(d.entryPrice).toFixed(2)}` : ""}
        {d.errorMessage && !isOk ? ` — ${d.errorMessage}` : ""}
      </div>
      <div style={{ color: statusColor, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isPaper ? "PAPER_ONLY" : d.status}
      </div>
      <div style={{ color: "var(--color-muted-foreground)" }}>{d.httpStatus ?? "—"}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradersPost() {
  const utils = trpc.useUtils();

  const portfolioQuery = trpc.tp.getPortfolioConfig.useQuery(undefined, { refetchInterval: 15_000 });
  const strategyControlsQuery = trpc.tp.getStrategyControls.useQuery(undefined, { refetchInterval: 30_000 });
  const dispatchLogQuery = trpc.tp.getDispatchLog.useQuery({ limit: 50 }, { refetchInterval: 15_000 });
  const statsQuery = trpc.tp.getDispatchStats.useQuery(undefined, { refetchInterval: 30_000 });

  const handleRefresh = () => {
    utils.tp.getPortfolioConfig.invalidate();
    utils.tp.getStrategyControls.invalidate();
    utils.tp.getDispatchLog.invalidate();
    utils.tp.getDispatchStats.invalidate();
  };

  const config = portfolioQuery.data as PortfolioConfig | null | undefined;
  const controls = (strategyControlsQuery.data ?? []) as StrategyControl[];
  const dispatches = (dispatchLogQuery.data ?? []) as TpDispatch[];
  const stats = (statsQuery.data ?? []) as Array<{
    strategyId: string; total: number; dispatched: number;
    safetyHalted: number; preLiveGateBlocked: number; disarmed: number;
    frozen: number; duplicateSkipped: number; errors: number;
    lastDispatchedAt: string | null; lastStatus: string | null;
  }>;

  const totalDispatches = stats.reduce((s, r) => s + r.total, 0);
  const totalOk = stats.reduce((s, r) => s + r.dispatched, 0);
  const totalFailed = stats.reduce((s, r) => s + r.errors, 0);
  const enabledCount = controls.filter((c) => c.strategyStatus === "ENABLED").length;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Send size={18} style={{ color: "var(--arc-blue)" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-blue)", margin: 0 }}>
              TRADERSPOST
            </h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", border: "1px solid oklch(0.30 0.05 220)", borderRadius: 3, padding: "2px 6px" }}>
              SPRINT 114A
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", letterSpacing: "0.05em" }}>
            One portfolio · One webhook · One execution state · Six strategies via ADE ranking
          </div>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
            padding: "6px 12px", borderRadius: 4, cursor: "pointer",
            background: "oklch(0.14 0.06 220)", border: "1px solid oklch(0.30 0.08 220 / 0.6)",
            color: "var(--color-muted-foreground)", transition: "all 0.15s ease",
          }}
        >
          <RefreshCw size={11} /> REFRESH
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "STRATEGIES ENABLED", value: enabledCount, color: enabledCount === 6 ? "oklch(0.55 0.22 145)" : "oklch(0.60 0.18 50)" },
          { label: "TOTAL DISPATCHES", value: totalDispatches, color: "var(--arc-blue)" },
          { label: "DISPATCHED OK", value: totalOk, color: "oklch(0.55 0.22 145)" },
          { label: "ERRORS", value: totalFailed, color: totalFailed > 0 ? "oklch(0.55 0.22 30)" : "var(--color-muted-foreground)" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "oklch(0.10 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.6)",
            borderRadius: 8, padding: "14px 16px",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>
              {portfolioQuery.isLoading || statsQuery.isLoading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Portfolio Execution Panel */}
      {portfolioQuery.isLoading ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", padding: 16 }}>Loading portfolio config…</div>
      ) : config ? (
        <PortfolioExecutionPanel config={config} onRefresh={handleRefresh} />
      ) : (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "oklch(0.60 0.18 30)", padding: 16 }}>
          Portfolio execution config not found — database may need seeding.
        </div>
      )}

      {/* Safety notice */}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: "oklch(0.12 0.06 220 / 0.5)", border: "1px solid oklch(0.30 0.10 220 / 0.4)",
        borderRadius: 6, padding: "10px 14px", marginBottom: 24,
      }}>
        <Shield size={13} style={{ color: "var(--arc-blue)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
          <strong style={{ color: "oklch(0.75 0.10 220)" }}>Safety gates active on every dispatch:</strong>{" "}
          Single-active-position rule · Safety engine lockout · Idempotency (no duplicate orders) · ADE arbitration (highest-scoring eligible strategy only).
          Individual strategies may be PAUSED to exclude them from ADE proposals without halting the portfolio.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: Strategy Eligibility */}
        <div>
          {strategyControlsQuery.isLoading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>Loading strategy controls…</div>
          ) : (
            <StrategyEligibilityPanel controls={controls} onRefresh={handleRefresh} />
          )}

          {/* Per-strategy dispatch stats */}
          {stats.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 10 }}>
                DISPATCH STATS BY STRATEGY
              </div>
              <div style={{
                background: "oklch(0.10 0.04 220)",
                border: "1px solid oklch(0.22 0.08 220 / 0.6)",
                borderRadius: 8, overflow: "hidden",
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "80px 50px 60px 60px 60px",
                  gap: 8, padding: "8px 12px",
                  borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)",
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)",
                }}>
                  <div>STRATEGY</div><div>TOTAL</div><div>DISPATCHED</div><div>ERRORS</div><div>BYPASSED</div>
                </div>
                {stats.map((s) => (
                  <div key={s.strategyId} style={{
                    display: "grid", gridTemplateColumns: "80px 50px 60px 60px 60px",
                    gap: 8, padding: "7px 12px",
                    borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                  }}>
                    <div style={{ color: "var(--arc-blue)", fontWeight: 600 }}>{s.strategyId}</div>
                    <div style={{ color: "oklch(0.75 0.08 220)" }}>{s.total}</div>
                    <div style={{ color: "oklch(0.65 0.18 145)" }}>{s.dispatched}</div>
                    <div style={{ color: s.errors > 0 ? "oklch(0.65 0.18 30)" : "var(--color-muted-foreground)" }}>{s.errors}</div>
                    <div style={{ color: "var(--color-muted-foreground)" }}>{s.disarmed + s.safetyHalted}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Dispatch Log */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 12 }}>
            DISPATCH LOG (LAST 50)
          </div>
          <div style={{
            background: "oklch(0.10 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.6)",
            borderRadius: 8, overflow: "hidden",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "90px 70px 55px 1fr 90px 50px",
              gap: 6, padding: "8px 12px",
              borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)",
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)",
            }}>
              <div>TIME</div><div>STRATEGY</div><div>DIR</div><div>PRICES / REASON</div><div>STATUS</div><div>HTTP</div>
            </div>
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {dispatchLogQuery.isLoading ? (
                <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>Loading…</div>
              ) : dispatches.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <Send size={20} style={{ color: "var(--color-muted-foreground)", margin: "0 auto 8px" }} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>No dispatches yet</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.40 0.05 220)", marginTop: 4 }}>
                    Activate Apex and wait for the next qualifying ADE signal
                  </div>
                </div>
              ) : (
                dispatches.map((d) => <DispatchRow key={d.id} d={d} />)
              )}
            </div>
          </div>

          {/* Architecture note */}
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: "oklch(0.09 0.03 220)",
            border: "1px solid oklch(0.20 0.06 220 / 0.4)",
            borderRadius: 6,
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-muted-foreground)", marginBottom: 8 }}>
              DISPATCH ARCHITECTURE — SPRINT 114A
            </div>
            {[
              ["Signal source", "M-16 Pine Script → Atlas Memory webhook → paperTradeEngine.processBar()"],
              ["ADE ranking", "All 6 ENABLED strategies submit proposals; highest ADE score wins"],
              ["Dispatch gate", "APEX_EVAL_ACTIVE + webhook URL + safety lockout + idempotency"],
              ["Payload", "{ ticker, action, price, quantity } + atlas.selected_strategy_id"],
              ["Per-model trace", "strategy_id in tp_dispatch_log preserves per-model reporting"],
              ["Daily arming", "Not required — state persists until owner halts or safety triggers"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--arc-blue)", flexShrink: 0, minWidth: 90 }}>{k}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
