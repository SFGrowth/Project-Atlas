/**
 * Atlas Certification Framework — Sprint 081
 *
 * Displays the ADE v2 version governance log, certification status for each
 * model, and the Self-Learning Framework trade record accumulation progress.
 */
import { trpc } from "@/lib/trpc";
import { PageWrapper, HudPanel, DataRow, SectionHeader, EmptyState, fmt, fmtDateTime } from "@/components/HudComponents";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GovernanceRecord {
  id: number;
  version: string;
  sprintNumber: number;
  changeType: string;
  description: string;
  tradesAnalysed: number | null;
  pfBefore: string | null;
  pfAfter: string | null;
  mcPassRateBefore: string | null;
  mcPassRateAfter: string | null;
  approvedBy: string;
  createdAt: string;
}

interface TradeRecord {
  id: number;
  tradeId: string;
  model: string;
  adeVersion: string;
  outcome: string;
  rMultiple: string | null;
  pnl: string | null;
  normScore: string | null;
  confidence: string | null;
  session: string | null;
  openedAt: string;
  closedAt: string;
}

// ─── Certification Status Card ────────────────────────────────────────────────

function CertCard({ model, threshold, description, rawMax }: {
  model: string;
  threshold: number;
  description: string;
  rawMax: number;
}) {
  return (
    <div className="hud-panel hud-panel-br p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[var(--arc-blue)] font-bold text-sm tracking-widest font-['Orbitron'] glow-blue">{model}</div>
        <span className="status-badge status-ok">ADE v2.0.0</span>
      </div>
      <p className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed mb-3">{description}</p>
      <div className="space-y-1">
        <DataRow label="Promotion Threshold" value={<span className="data-value text-[var(--stark-gold)]">{threshold} / 100 norm pts</span>} />
        <DataRow label="Raw Score Max" value={<span className="data-value">{rawMax} pts</span>} />
        <DataRow label="SLF Trigger" value={<span className="data-value text-[10px]">50 closed trades</span>} />
        <DataRow label="Certification Status" value={<span className="status-badge status-live">ACTIVE — PAPER</span>} />
      </div>
    </div>
  );
}

// ─── Governance Log Entry ─────────────────────────────────────────────────────

function GovernanceEntry({ record }: { record: GovernanceRecord }) {
  const typeColor = record.changeType === "INITIAL" ? "var(--arc-blue)"
    : record.changeType === "WEIGHT_CHANGE" ? "var(--stark-gold)"
    : record.changeType === "BUGFIX" ? "var(--danger-red)"
    : "var(--arc-cyan)";

  return (
    <div className="border border-[var(--hud-border)] rounded p-3 mb-3" style={{ background: "oklch(0.10 0.03 220 / 0.5)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="font-['Orbitron'] text-sm font-bold" style={{ color: "var(--arc-blue)" }}>v{record.version}</span>
          <span className="text-[9px] tracking-widest px-2 py-0.5 rounded border" style={{ color: typeColor, borderColor: typeColor }}>{record.changeType}</span>
          <span className="text-[9px] text-[var(--color-muted-foreground)]">Sprint {record.sprintNumber}</span>
        </div>
        <span className="text-[9px] text-[var(--color-muted-foreground)]">{fmtDateTime(record.createdAt)}</span>
      </div>
      <p className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed mb-2 line-clamp-3">{record.description}</p>
      {record.tradesAnalysed != null && (
        <div className="flex gap-4 text-[9px] text-[var(--color-muted-foreground)]">
          <span>Trades: <span className="text-[var(--arc-cyan)]">{record.tradesAnalysed}</span></span>
          {record.pfBefore && <span>PF Before: <span className="text-[var(--arc-cyan)]">{parseFloat(record.pfBefore).toFixed(3)}</span></span>}
          {record.pfAfter && <span>PF After: <span className="text-[var(--arc-cyan)]">{parseFloat(record.pfAfter).toFixed(3)}</span></span>}
          {record.mcPassRateBefore && <span>MC Pass: <span className="text-[var(--arc-cyan)]">{(parseFloat(record.mcPassRateBefore) * 100).toFixed(1)}%</span></span>}
        </div>
      )}
      <div className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">Approved by: <span className="text-[var(--arc-blue)]">{record.approvedBy}</span></div>
    </div>
  );
}

// ─── SLF Progress Bar ─────────────────────────────────────────────────────────

function SLFProgress({ model, count }: { model: string; count: number }) {
  const target = 50;
  const pct = Math.min(100, (count / target) * 100);
  const color = pct >= 100 ? "var(--arc-blue)" : pct >= 60 ? "var(--stark-gold)" : "var(--danger-red)";
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="data-label font-['Orbitron'] text-[10px]">{model}</span>
        <span className="data-value text-[10px]">{count} / {target} trades</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "oklch(0.18 0.04 220)" }}>
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      {pct >= 100 && (
        <div className="text-[9px] text-[var(--arc-blue)] mt-1 glow-blue">▶ SLF CORRELATION REPORT READY</div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CertificationPage() {
  const { data: governance, isLoading: govLoading } = trpc.certification.governance.useQuery();
  const { data: tradeStats, isLoading: statsLoading } = trpc.certification.tradeStats.useQuery();

  const a1Count = tradeStats?.find(s => s.model === "A1")?.count ?? 0;
  const a3Count = tradeStats?.find(s => s.model === "A3")?.count ?? 0;
  const b1Count = tradeStats?.find(s => s.model === "B1")?.count ?? 0;

  return (
    <PageWrapper>
      <div className="p-4">
        <SectionHeader
          title="Atlas Certification Framework"
          subtitle="ADE v2 version governance, model certification status, and Self-Learning Framework progress"
        />

        {/* Model Certification Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <CertCard
            model="MODEL A1"
            threshold={60}
            description="Depth-constrained pullback. ADX < 30, NY AM session 09:30–11:00 ET. 1:2 RR. Raw max 144 pts. Validated PF 1.387 (N=286)."
            rawMax={144}
          />
          <CertCard
            model="MODEL A3"
            threshold={60}
            description="Overnight compression breakout. 20:00–06:00 ET. 1:2.5 RR. Compression quality dimension active (MS-05). Raw max 141 pts. Validated PF 1.633 (N=60)."
            rawMax={141}
          />
          <CertCard
            model="MODEL B1"
            threshold={60}
            description="Flag continuation. ADX > 45, Late PM 14:00–16:00 ET. 1:2 RR. Raw max 129 pts. Validated PF 1.354 (N=252)."
            rawMax={129}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* ADE v2 Dimension Reference */}
          <HudPanel title="ADE v2 — Dimension Registry">
            <div className="space-y-0.5 text-[10px]">
              {[
                { id: "MS-01", name: "Trend Quality", max: 20, group: "Market Structure" },
                { id: "MS-02", name: "ADX Regime", max: 18, group: "Market Structure" },
                { id: "MS-03", name: "Volatility Expansion", max: 14, group: "Market Structure" },
                { id: "MS-04", name: "Market Structure Integrity", max: 12, group: "Market Structure" },
                { id: "MS-05", name: "Compression Quality (A3)", max: 12, group: "Market Structure" },
                { id: "EQ-01", name: "Pullback Depth (A1)", max: 15, group: "Execution Quality" },
                { id: "EQ-02", name: "Liquidity Clearance", max: 15, group: "Execution Quality" },
                { id: "EQ-03", name: "Risk Distance", max: 12, group: "Execution Quality" },
                { id: "TC-01", name: "Session Quality", max: 10, group: "Temporal Context" },
                { id: "TC-02", name: "Day-of-Week", max: 6, group: "Temporal Context" },
                { id: "SI-01", name: "Historical Reliability", max: 10, group: "System Intelligence" },
                { id: "SI-02", name: "Live Stability", max: 7, group: "System Intelligence" },
                { id: "SI-03", name: "Observatory Confidence", max: 5, group: "System Intelligence" },
                { id: "CR-01", name: "Consecutive Loss Penalty", max: -15, group: "Capital & Risk" },
                { id: "CR-02", name: "Daily Drawdown Penalty", max: -20, group: "Capital & Risk" },
              ].map(d => (
                <div key={d.id} className="flex items-center justify-between py-0.5 border-b border-[oklch(0.22_0.06_220/0.2)]">
                  <span className="text-[var(--arc-blue)] font-['Orbitron'] w-14">{d.id}</span>
                  <span className="text-[var(--color-muted-foreground)] flex-1 px-2">{d.name}</span>
                  <span className={d.max < 0 ? "pnl-negative" : "data-value"}>{d.max > 0 ? `+${d.max}` : d.max} pts</span>
                </div>
              ))}
            </div>
          </HudPanel>

          {/* SLF Progress */}
          <div className="flex flex-col gap-4">
            <HudPanel title="Self-Learning Framework — Trade Accumulation">
              <p className="text-[10px] text-[var(--color-muted-foreground)] mb-4 leading-relaxed">
                The SLF generates a Dimension Correlation Report after every 50 closed paper trades per model.
                Reports identify which ADE v2 dimensions are empirically predictive in live conditions.
                No weights change automatically — all adjustments require a formal research sprint.
              </p>
              {statsLoading ? (
                <div className="text-[10px] text-[var(--color-muted-foreground)] text-center py-4">Loading trade records…</div>
              ) : (
                <>
                  <SLFProgress model="A1" count={a1Count} />
                  <SLFProgress model="A3" count={a3Count} />
                  <SLFProgress model="B1" count={b1Count} />
                </>
              )}
              <div className="mt-3 pt-2 border-t border-[var(--hud-border)] text-[9px] text-[var(--color-muted-foreground)]">
                Total closed paper trades: <span className="text-[var(--arc-cyan)]">{a1Count + a3Count + b1Count}</span>
              </div>
            </HudPanel>

            <HudPanel title="ADE Version Governance — Summary">
              <DataRow label="Current Version" value={<span className="data-value font-['Orbitron'] text-[var(--arc-blue)] glow-blue">v2.0.0</span>} />
              <DataRow label="Sprint" value={<span className="data-value">081</span>} />
              <DataRow label="Baseline PF" value={<span className="data-value">1.708 (ATS v2.0 portfolio)</span>} />
              <DataRow label="Baseline MC Pass" value={<span className="data-value">88.7% (Apex 50K)</span>} />
              <DataRow label="Dimensions" value={<span className="data-value">17 (15 positive + 2 penalty)</span>} />
              <DataRow label="Next SLF Report" value={<span className="data-value text-[var(--stark-gold)]">After 50 trades / model</span>} />
              <DataRow label="Weight Change Requires" value={<span className="data-value text-[10px]">Formal sprint + OOS validation</span>} />
            </HudPanel>
          </div>
        </div>

        {/* Version Governance Log */}
        <HudPanel title="ADE Version Governance Log — Immutable Audit Trail">
          {govLoading ? (
            <EmptyState message="Loading governance records…" />
          ) : !governance || governance.length === 0 ? (
            <EmptyState message="No governance records found" />
          ) : (
            <div className="max-h-[500px] overflow-y-auto pr-1">
              {governance.map(record => (
                <GovernanceEntry key={record.id} record={record} />
              ))}
            </div>
          )}
        </HudPanel>
      </div>
    </PageWrapper>
  );
}
