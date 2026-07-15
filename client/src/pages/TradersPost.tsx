/**
 * TradersPost.tsx — Sprint 113 TradersPost Multi-Strategy Dispatch Dashboard
 *
 * Provides full operator control over the 4 TradersPost strategy webhooks:
 *   A1, A3, B1, S109-001
 *
 * Features:
 *   - Strategy ARM / DISARM controls with safety gates
 *   - Webhook URL configuration per strategy
 *   - Dispatch log (last 50 dispatches with status badges)
 *   - Dispatch stats per strategy
 *   - Operator notes per strategy
 *   - Frozen / PRE_LIVE_GATE status indicators
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Lock,
  RefreshCw,
  Send,
  Shield,
  ShieldOff,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TpConfig = {
  strategyId: string;
  strategyName: string;
  webhookUrl: string | null;
  armed: boolean;
  frozenUntilOwnerApproval: boolean;
  notes: string | null;
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

// ─── Strategy Card ────────────────────────────────────────────────────────────

function StrategyCard({ config, onRefresh }: { config: TpConfig; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [webhookInput, setWebhookInput] = useState(config.webhookUrl ?? "");
  const [notesInput, setNotesInput] = useState(config.notes ?? "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  const armMutation = trpc.tp.armStrategy.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onRefresh();
    },
    onError: (err) => toast.error(`ARM failed: ${err.message}`),
  });

  const disarmMutation = trpc.tp.disarmStrategy.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      onRefresh();
    },
    onError: (err) => toast.error(`DISARM failed: ${err.message}`),
  });

  const setUrlMutation = trpc.tp.setWebhookUrl.useMutation({
    onSuccess: () => {
      toast.success(`Webhook URL saved for ${config.strategyId}`);
      setEditingUrl(false);
      onRefresh();
    },
    onError: (err) => toast.error(`URL save failed: ${err.message}`),
  });

  const setNotesMutation = trpc.tp.setNotes.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      setEditingNotes(false);
      onRefresh();
    },
    onError: (err) => toast.error(`Notes save failed: ${err.message}`),
  });

  const strategyId = config.strategyId as "A1" | "A3" | "B1" | "S109-001";

  const statusColor = config.armed
    ? "oklch(0.55 0.22 145)"  // green
    : "oklch(0.55 0.15 30)";  // amber

  const frozenColor = "oklch(0.55 0.22 30)"; // orange

  return (
    <div
      style={{
        background: "oklch(0.10 0.04 220)",
        border: `1px solid ${config.armed ? "oklch(0.30 0.12 145 / 0.6)" : "oklch(0.22 0.08 220 / 0.6)"}`,
        borderRadius: 8,
        overflow: "hidden",
        transition: "border-color 0.2s ease",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        {/* Status indicator */}
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: config.armed ? statusColor : "oklch(0.35 0.05 220)",
          boxShadow: config.armed ? `0 0 8px ${statusColor}` : "none",
          flexShrink: 0,
        }} />

        {/* Strategy ID */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "var(--arc-blue)" }}>
            {config.strategyId}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", letterSpacing: "0.05em" }}>
            {config.strategyName}
          </div>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {config.frozenUntilOwnerApproval && (
            <span style={{
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
              color: frozenColor, border: `1px solid ${frozenColor}`, borderRadius: 4,
              padding: "2px 6px",
            }}>
              <Lock size={9} /> FROZEN
            </span>
          )}
          <span style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em",
            color: config.armed ? statusColor : "var(--color-muted-foreground)",
            border: `1px solid ${config.armed ? statusColor : "oklch(0.30 0.05 220)"}`,
            borderRadius: 4, padding: "2px 6px",
          }}>
            {config.armed ? <><Shield size={9} /> ARMED</> : <><ShieldOff size={9} /> DISARMED</>}
          </span>
        </div>

        {/* ARM / DISARM button */}
        {config.armed ? (
          <button
            onClick={() => disarmMutation.mutate({ strategyId })}
            disabled={disarmMutation.isPending}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 4, cursor: "pointer",
              background: "oklch(0.18 0.08 30)", border: "1px solid oklch(0.45 0.18 30)",
              color: "oklch(0.75 0.18 30)", transition: "all 0.15s ease",
            }}
          >
            {disarmMutation.isPending ? "…" : "DISARM"}
          </button>
        ) : (
          <button
            onClick={() => armMutation.mutate({ strategyId })}
            disabled={armMutation.isPending || config.frozenUntilOwnerApproval || !config.webhookUrl}
            title={
              config.frozenUntilOwnerApproval ? "Frozen — PRE_LIVE_GATE approval required" :
              !config.webhookUrl ? "Set webhook URL first" : undefined
            }
            style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
              padding: "5px 12px", borderRadius: 4, cursor: (config.frozenUntilOwnerApproval || !config.webhookUrl) ? "not-allowed" : "pointer",
              background: (config.frozenUntilOwnerApproval || !config.webhookUrl) ? "oklch(0.14 0.04 220)" : "oklch(0.18 0.08 145)",
              border: `1px solid ${(config.frozenUntilOwnerApproval || !config.webhookUrl) ? "oklch(0.30 0.05 220)" : "oklch(0.45 0.18 145)"}`,
              color: (config.frozenUntilOwnerApproval || !config.webhookUrl) ? "var(--color-muted-foreground)" : "oklch(0.75 0.18 145)",
              transition: "all 0.15s ease",
              opacity: (config.frozenUntilOwnerApproval || !config.webhookUrl) ? 0.5 : 1,
            }}
          >
            {armMutation.isPending ? "…" : "ARM"}
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-muted-foreground)", padding: 4 }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>



      {/* Expanded section */}
      {expanded && (
        <div style={{ borderTop: "1px solid oklch(0.22 0.08 220 / 0.4)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Webhook URL */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-muted-foreground)", marginBottom: 6 }}>
              WEBHOOK URL
            </div>
            {editingUrl ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder="https://traderspost.io/trading/webhook/..."
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11, flex: 1 }}
                />
                <Button
                  size="sm"
                  onClick={() => setUrlMutation.mutate({ strategyId, webhookUrl: webhookInput })}
                  disabled={setUrlMutation.isPending || !webhookInput}
                >
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
                  {config.webhookUrl ?? "— not set —"}
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingUrl(true)}>
                  Edit
                </Button>
              </div>
            )}
            {!config.webhookUrl && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                <AlertTriangle size={10} style={{ color: "oklch(0.65 0.18 50)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.65 0.18 50)" }}>
                  ARM is blocked until a webhook URL is set
                </span>
              </div>
            )}
          </div>

          {/* Frozen warning */}
          {config.frozenUntilOwnerApproval && (
            <div style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              background: "oklch(0.14 0.08 30 / 0.4)", border: "1px solid oklch(0.35 0.15 30 / 0.5)",
              borderRadius: 6, padding: "10px 12px",
            }}>
              <Lock size={12} style={{ color: "oklch(0.65 0.18 30)", flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "oklch(0.75 0.18 30)", marginBottom: 2 }}>
                  FROZEN — PRE_LIVE_GATE APPROVAL REQUIRED
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)" }}>
                  This strategy requires a passing PRE_LIVE_GATE certification run before it can be armed.
                  Complete the Exec Certification process to unlock.
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-muted-foreground)", marginBottom: 6 }}>
              OPERATOR NOTES
            </div>
            {editingNotes ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={3}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    size="sm"
                    onClick={() => setNotesMutation.mutate({ strategyId, notes: notesInput })}
                    disabled={setNotesMutation.isPending}
                  >
                    {setNotesMutation.isPending ? "…" : "Save Notes"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingNotes(false); setNotesInput(config.notes ?? ""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{
                  flex: 1, fontFamily: "var(--font-mono)", fontSize: 11,
                  color: config.notes ? "oklch(0.75 0.08 220)" : "var(--color-muted-foreground)",
                  background: "oklch(0.08 0.03 220)", border: "1px solid oklch(0.20 0.06 220 / 0.6)",
                  borderRadius: 4, padding: "8px 10px", minHeight: 40, whiteSpace: "pre-wrap",
                }}>
                  {config.notes ?? "— no notes —"}
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditingNotes(true)}>
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Log Row ─────────────────────────────────────────────────────────

function DispatchRow({ d }: { d: TpDispatch }) {
  const isOk = d.status === "OK";
  const isBypass = d.status === "BYPASSED";
  const statusColor = isOk
    ? "oklch(0.55 0.22 145)"
    : isBypass
    ? "oklch(0.55 0.15 220)"
    : "oklch(0.55 0.22 30)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 70px 70px 1fr 60px 60px",
      gap: 8, alignItems: "center",
      padding: "7px 12px",
      borderBottom: "1px solid oklch(0.18 0.06 220 / 0.4)",
      fontFamily: "var(--font-mono)", fontSize: 10,
    }}>
      <div style={{ color: "var(--color-muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {new Date(d.dispatchedAt).toLocaleTimeString()}
      </div>
      <div style={{ color: "var(--arc-blue)", fontWeight: 600 }}>{d.strategyId}</div>
      <div style={{
        color: d.direction === "LONG" ? "oklch(0.65 0.22 145)" : "oklch(0.65 0.22 30)",
        fontWeight: 600,
      }}>
        {d.direction}
      </div>
      <div style={{ color: "oklch(0.65 0.08 220)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {d.entryPrice ? `@ ${parseFloat(d.entryPrice).toFixed(2)}` : ""}
        {d.stopPrice ? ` SL ${parseFloat(d.stopPrice).toFixed(2)}` : ""}
        {d.targetPrice ? ` TP ${parseFloat(d.targetPrice).toFixed(2)}` : ""}
        {d.errorMessage ? ` — ${d.errorMessage}` : ""}
      </div>
      <div style={{ color: statusColor, fontWeight: 600 }}>{d.status}</div>
      <div style={{ color: "var(--color-muted-foreground)" }}>{d.httpStatus ?? "—"}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TradersPost() {
  const utils = trpc.useUtils();

  const configsQuery = trpc.tp.getConfigs.useQuery(undefined, { refetchInterval: 30_000 });
  const dispatchLogQuery = trpc.tp.getDispatchLog.useQuery({ limit: 50 }, { refetchInterval: 15_000 });
  const statsQuery = trpc.tp.getDispatchStats.useQuery(undefined, { refetchInterval: 30_000 });

  const handleRefresh = () => {
    utils.tp.getConfigs.invalidate();
    utils.tp.getDispatchLog.invalidate();
    utils.tp.getDispatchStats.invalidate();
  };

  const configs = (configsQuery.data ?? []) as unknown as TpConfig[];
  const dispatches = (dispatchLogQuery.data ?? []) as unknown as TpDispatch[];
  const stats = (statsQuery.data ?? []) as unknown as Array<{ strategyId: string; total: number; dispatched: number; safetyHalted: number; preLiveGateBlocked: number; disarmed: number; frozen: number; duplicateSkipped: number; errors: number; lastDispatchedAt: string | null; lastStatus: string | null }>;

  const armedCount = configs.filter((c) => c.armed).length;
  const totalDispatches = stats.reduce((s, r) => s + r.total, 0);
  const totalOk = stats.reduce((s, r) => s + r.dispatched, 0);
  const totalFailed = stats.reduce((s, r) => s + r.errors, 0);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Send size={18} style={{ color: "var(--arc-blue)" }} />
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", color: "var(--arc-blue)", margin: 0 }}>
              TRADERSPOST
            </h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", border: "1px solid oklch(0.30 0.05 220)", borderRadius: 3, padding: "2px 6px" }}>
              SPRINT 114
            </span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", letterSpacing: "0.05em" }}>
            Unified ADE portfolio dispatch — A1 · A3 · B1 · SB1 · ORB-1 · S109-001
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
          <RefreshCw size={11} />
          REFRESH
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "ARMED", value: armedCount, color: armedCount > 0 ? "oklch(0.55 0.22 145)" : "var(--color-muted-foreground)" },
          { label: "TOTAL DISPATCHES", value: totalDispatches, color: "var(--arc-blue)" },
          { label: "OK", value: totalOk, color: "oklch(0.55 0.22 145)" },
          { label: "FAILED", value: totalFailed, color: totalFailed > 0 ? "oklch(0.55 0.22 30)" : "var(--color-muted-foreground)" },
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
              {configsQuery.isLoading || statsQuery.isLoading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Safety notice */}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: "oklch(0.12 0.06 220 / 0.5)", border: "1px solid oklch(0.30 0.10 220 / 0.4)",
        borderRadius: 6, padding: "10px 14px", marginBottom: 24,
      }}>
        <Shield size={13} style={{ color: "var(--arc-blue)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-muted-foreground)", lineHeight: 1.6 }}>
          <strong style={{ color: "oklch(0.75 0.10 220)" }}>Safety gates active on all dispatches:</strong>{" "}
          Single-active-strategy rule · Safety lockout check · Armed gate (DISARMED = silent bypass).
          All 6 strategies compete through the unified ADE ranking — only the highest-scoring eligible strategy dispatches per bar.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left column: Strategy cards */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 12 }}>
            STRATEGY CONTROLS
          </div>
          {configsQuery.isLoading ? (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)", padding: 16 }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {configs.map((config) => (
                <StrategyCard key={config.strategyId} config={config} onRefresh={handleRefresh} />
              ))}
            </div>
          )}

          {/* Per-strategy stats */}
          {stats.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 10 }}>
                DISPATCH STATS
              </div>
              <div style={{
                background: "oklch(0.10 0.04 220)",
                border: "1px solid oklch(0.22 0.08 220 / 0.6)",
                borderRadius: 8, overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "80px 60px 60px 60px 60px",
                  gap: 8, padding: "8px 12px",
                  borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)",
                  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)",
                }}>
                  <div>STRATEGY</div>
                  <div>TOTAL</div>
                  <div>OK</div>
                  <div>FAILED</div>
                  <div>BYPASS</div>
                </div>
                {stats.map((s) => (
                  <div key={s.strategyId} style={{
                    display: "grid", gridTemplateColumns: "80px 60px 60px 60px 60px",
                    gap: 8, padding: "7px 12px",
                    borderBottom: "1px solid oklch(0.18 0.06 220 / 0.3)",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                  }}>
                    <div style={{ color: "var(--arc-blue)", fontWeight: 600 }}>{s.strategyId}</div>
                    <div style={{ color: "oklch(0.75 0.08 220)" }}>{s.total}</div>
                    <div style={{ color: "oklch(0.65 0.18 145)" }}>{s.dispatched}</div>
                    <div style={{ color: s.errors > 0 ? "oklch(0.65 0.18 30)" : "var(--color-muted-foreground)" }}>{s.errors}</div>
                    <div style={{ color: "var(--color-muted-foreground)" }}>{s.disarmed + s.frozen + s.safetyHalted + s.preLiveGateBlocked}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Dispatch log */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.15em", color: "var(--color-muted-foreground)", marginBottom: 12 }}>
            DISPATCH LOG (LAST 50)
          </div>
          <div style={{
            background: "oklch(0.10 0.04 220)",
            border: "1px solid oklch(0.22 0.08 220 / 0.6)",
            borderRadius: 8, overflow: "hidden",
          }}>
            {/* Log header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "90px 70px 70px 1fr 60px 60px",
              gap: 8, padding: "8px 12px",
              borderBottom: "1px solid oklch(0.22 0.08 220 / 0.4)",
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-muted-foreground)",
            }}>
              <div>TIME</div>
              <div>STRATEGY</div>
              <div>DIR</div>
              <div>PRICES</div>
              <div>STATUS</div>
              <div>HTTP</div>
            </div>

            {/* Log rows */}
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {dispatchLogQuery.isLoading ? (
                <div style={{ padding: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>Loading…</div>
              ) : dispatches.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <Send size={20} style={{ color: "var(--color-muted-foreground)", margin: "0 auto 8px" }} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-muted-foreground)" }}>
                    No dispatches yet
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "oklch(0.40 0.05 220)", marginTop: 4 }}>
                    ARM a strategy and wait for the next qualifying signal
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
              DISPATCH ARCHITECTURE
            </div>
            {[
              ["Signal source", "paperTradeEngine.processBar() — same signal that opens paper trade"],
              ["Trigger", "signalFired && signalModel && signalDirection (non-blocking setImmediate)"],
              ["Gate 1", "Strategy must be ARMED in tp_config"],
              ["Gate 2", "Safety lockout: no active halt/lockout in execution_cert_runs"],
              ["Gate 3", "S109-001 requires passing PRE_LIVE_GATE run"],
              ["Payload", "{ ticker, action, price, quantity:1 } → TradersPost webhook"],
              ["Logging", "Every attempt logged to tp_dispatch_log (OK / FAILED / BYPASSED)"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--arc-blue)", flexShrink: 0, minWidth: 80 }}>{k}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-muted-foreground)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
