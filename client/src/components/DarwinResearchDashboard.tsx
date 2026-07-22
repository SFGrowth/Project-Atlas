/**
 * DARWIN Research Dashboard — Sprint 123A.6 / Gate G6A
 *
 * Displays:
 *   - DARWIN authority status and G6A gate state
 *   - Observation pipeline health
 *   - Candidate registry (hypothesis lifecycle)
 *   - Shadow signals (research-only, never transmitted)
 *   - Experiment results (A-D)
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 * This dashboard is read-only. No actions here affect live trading.
 */

import React, { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DarwinAuthorityStatus {
  authorityMode: string;
  gateG6aEnabled: boolean;
  observationPipelineActive: boolean;
  researchOnly: boolean;
  processBarCalled: false;
  postBarAutomationCalled: false;
  tradersPostSent: false;
  tradovateOrderSubmitted: false;
}

interface ObservationHealth {
  totalObservations: number;
  observationsLast24h: number;
  observationsLast1h: number;
  pendingLabels: number;
  completedLabels: number;
  lastObservationAt: number | null;
  pipelineStatus: 'ACTIVE' | 'IDLE' | 'ERROR' | 'DISABLED';
  schedulerStatus: {
    runningJobs: number;
    queuedJobs: number;
    totalJobsRun: number;
    totalJobsFailed: number;
    liveChartAffected: false;
    healthy: boolean;
  };
}

interface CandidateRecord {
  candidateId: string;
  name: string;
  version: number;
  status: 'HYPOTHESIS' | 'VALIDATING' | 'VALIDATED' | 'REJECTED' | 'PROMOTED' | 'ARCHIVED';
  initialConfidence: string;
  discoverySampleSize: number;
  promotionRequiresPhilApproval: boolean;
  canAutoReactivate: boolean;
  isMarkedDuplicate: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ShadowSignal {
  signalId: string;
  candidateId: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  theoreticalEntry: string;
  theoreticalStop: string;
  theoreticalTarget: string;
  confidence: string;
  researchOnlyLabel: string;
  processBarCalled: false;
  postBarAutomationCalled: false;
  tradersPostSent: false;
  tradovateOrderSubmitted: false;
}

interface ExperimentResult {
  experimentId: string;
  name: string;
  occurrences: number;
  labelledOutcomes?: number;
  winRate?: number;
  profitFactor?: number;
  effectSize?: number;
  pValue?: number;
  stabilityScore?: number;
  passedGates: boolean;
  gateFailures: string[];
  finding?: string;
  executedAt: number;
}

interface DarwinDashboardData {
  authorityStatus: DarwinAuthorityStatus;
  observationHealth: ObservationHealth;
  candidates: CandidateRecord[];
  recentShadowSignals: ShadowSignal[];
  experimentResults: ExperimentResult[];
  lastUpdated: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string; variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = ({
  status,
  variant = 'neutral',
}) => {
  const colours = {
    success: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
    warning: 'bg-amber-900/40 text-amber-300 border border-amber-700',
    error: 'bg-red-900/40 text-red-300 border border-red-700',
    info: 'bg-blue-900/40 text-blue-300 border border-blue-700',
    neutral: 'bg-slate-800 text-slate-300 border border-slate-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${colours[variant]}`}>
      {status}
    </span>
  );
};

// ─── Authority status panel ───────────────────────────────────────────────────

const AuthorityStatusPanel: React.FC<{ status: DarwinAuthorityStatus }> = ({ status }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">DARWIN Authority Status</h3>
      <StatusBadge
        status={status.authorityMode}
        variant={status.authorityMode === 'DATABENTO_LEARNING_AUTHORITY' ? 'success' : 'warning'}
      />
    </div>
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status.gateG6aEnabled ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <span className="text-slate-400">Gate G6A</span>
        <span className="text-slate-200 font-mono">{status.gateG6aEnabled ? 'ENABLED' : 'DISABLED'}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status.observationPipelineActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <span className="text-slate-400">Observation Pipeline</span>
        <span className="text-slate-200 font-mono">{status.observationPipelineActive ? 'ACTIVE' : 'IDLE'}</span>
      </div>
    </div>
    {/* Authority boundary proof */}
    <div className="mt-3 pt-3 border-t border-slate-700">
      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Authority Boundaries (Permanent)</p>
      <div className="grid grid-cols-2 gap-1 text-xs font-mono">
        {[
          { label: 'processBar called', value: status.processBarCalled },
          { label: 'postBarAutomation called', value: status.postBarAutomationCalled },
          { label: 'tradersPost sent', value: status.tradersPostSent },
          { label: 'tradovate order submitted', value: status.tradovateOrderSubmitted },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-400">{label}:</span>
            <span className="text-emerald-300">false</span>
          </div>
        ))}
      </div>
    </div>
    <div className="mt-2 px-2 py-1 bg-amber-950/30 border border-amber-800/50 rounded text-xs text-amber-400 font-mono">
      RESEARCH ONLY — NO LIVE EXECUTION
    </div>
  </div>
);

// ─── Observation health panel ─────────────────────────────────────────────────

const ObservationHealthPanel: React.FC<{ health: ObservationHealth }> = ({ health }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Observation Pipeline</h3>
      <StatusBadge
        status={health.pipelineStatus}
        variant={health.pipelineStatus === 'ACTIVE' ? 'success' : health.pipelineStatus === 'ERROR' ? 'error' : 'neutral'}
      />
    </div>
    <div className="grid grid-cols-3 gap-3 text-center mb-3">
      {[
        { label: 'Total Observations', value: health.totalObservations.toLocaleString() },
        { label: 'Last 24h', value: health.observationsLast24h.toLocaleString() },
        { label: 'Pending Labels', value: health.pendingLabels.toLocaleString() },
      ].map(({ label, value }) => (
        <div key={label} className="bg-slate-800 rounded p-2">
          <div className="text-lg font-mono font-bold text-slate-100">{value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        </div>
      ))}
    </div>
    <div className="text-xs text-slate-500">
      Scheduler: {health.schedulerStatus.runningJobs} running / {health.schedulerStatus.queuedJobs} queued
      {' · '}
      <span className={health.schedulerStatus.healthy ? 'text-emerald-400' : 'text-red-400'}>
        {health.schedulerStatus.healthy ? 'HEALTHY' : 'DEGRADED'}
      </span>
      {' · '}
      <span className="text-emerald-400">liveChartAffected=false</span>
    </div>
  </div>
);

// ─── Candidate registry panel ─────────────────────────────────────────────────

const CandidateRegistryPanel: React.FC<{ candidates: CandidateRecord[] }> = ({ candidates }) => {
  const statusVariant = (s: string) => {
    if (s === 'VALIDATED' || s === 'PROMOTED') return 'success';
    if (s === 'VALIDATING') return 'info';
    if (s === 'REJECTED' || s === 'ARCHIVED') return 'error';
    return 'neutral';
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Candidate Registry</h3>
        <span className="text-xs text-slate-500">{candidates.length} candidates</span>
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No candidates yet. Waiting for sufficient observation data.</p>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.candidateId} className="bg-slate-800 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-200">{c.name}</span>
                <StatusBadge status={c.status} variant={statusVariant(c.status)} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>v{c.version}</span>
                <span>n={c.discoverySampleSize}</span>
                <span>conf={parseFloat(c.initialConfidence).toFixed(2)}</span>
                {c.promotionRequiresPhilApproval && (
                  <span className="text-amber-400">Requires Phil approval</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Experiment results panel ─────────────────────────────────────────────────

const ExperimentResultsPanel: React.FC<{ results: ExperimentResult[] }> = ({ results }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
    <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3">Experiment Results</h3>
    {results.length === 0 ? (
      <p className="text-xs text-slate-500 italic">No experiments run yet.</p>
    ) : (
      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.experimentId} className="bg-slate-800 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-200">{r.name}</span>
              <StatusBadge
                status={r.passedGates ? 'GATES PASS' : 'GATES FAIL'}
                variant={r.passedGates ? 'success' : 'error'}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
              <div><span className="text-slate-500">Occurrences:</span> <span className="text-slate-200 font-mono">{r.occurrences}</span></div>
              {r.winRate !== undefined && (
                <div><span className="text-slate-500">Win rate:</span> <span className="text-slate-200 font-mono">{(r.winRate * 100).toFixed(1)}%</span></div>
              )}
              {r.effectSize !== undefined && (
                <div><span className="text-slate-500">Effect size:</span> <span className="text-slate-200 font-mono">{r.effectSize.toFixed(3)}</span></div>
              )}
            </div>
            {r.gateFailures.length > 0 && (
              <div className="space-y-1">
                {r.gateFailures.map((f, i) => (
                  <div key={i} className="text-xs text-amber-400 bg-amber-950/20 rounded px-2 py-1">{f}</div>
                ))}
              </div>
            )}
            {r.finding && (
              <div className="mt-1 text-xs text-emerald-400 font-mono">{r.finding}</div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Shadow signals panel ─────────────────────────────────────────────────────

const ShadowSignalsPanel: React.FC<{ signals: ShadowSignal[] }> = ({ signals }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Shadow Signals</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{signals.length} recent</span>
        <StatusBadge status="RESEARCH ONLY" variant="warning" />
      </div>
    </div>
    {signals.length === 0 ? (
      <p className="text-xs text-slate-500 italic">No shadow signals generated yet.</p>
    ) : (
      <div className="space-y-2">
        {signals.slice(0, 10).map((s) => (
          <div key={s.signalId} className="bg-slate-800 rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-slate-300">
                {new Date(s.timestamp).toISOString().slice(11, 19)} UTC
              </span>
              <StatusBadge
                status={s.direction}
                variant={s.direction === 'LONG' ? 'success' : 'error'}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-slate-500">Entry:</span> <span className="text-slate-200 font-mono">{parseFloat(s.theoreticalEntry).toFixed(2)}</span></div>
              <div><span className="text-slate-500">Stop:</span> <span className="text-slate-200 font-mono">{parseFloat(s.theoreticalStop).toFixed(2)}</span></div>
              <div><span className="text-slate-500">Target:</span> <span className="text-slate-200 font-mono">{parseFloat(s.theoreticalTarget).toFixed(2)}</span></div>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <span className="text-emerald-400 font-mono">processBar=false</span>
              <span className="text-emerald-400 font-mono">tradovate=false</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Main dashboard ───────────────────────────────────────────────────────────

const DarwinResearchDashboard: React.FC = () => {
  const [data, setData] = useState<DarwinDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/darwin/research-dashboard', {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Loading DARWIN research data...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-red-950/30 border border-red-800 rounded-lg">
        <p className="text-red-400 text-sm font-mono">DARWIN dashboard error: {error || 'No data'}</p>
        <p className="text-slate-500 text-xs mt-1">Live chart pipeline is unaffected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="darwin-research-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-100">DARWIN Research Engine</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sprint 123A.6 / Gate G6A — Shadow Learning Mode
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">
            Last updated: {lastRefresh?.toISOString().slice(11, 19)} UTC
          </div>
          <div className="text-xs text-amber-400 font-mono mt-0.5">
            RESEARCH ONLY — NO LIVE EXECUTION
          </div>
        </div>
      </div>

      {/* Authority status */}
      <AuthorityStatusPanel status={data.authorityStatus} />

      {/* Observation health + scheduler */}
      <ObservationHealthPanel health={data.observationHealth} />

      {/* Experiment results */}
      <ExperimentResultsPanel results={data.experimentResults} />

      {/* Candidate registry */}
      <CandidateRegistryPanel candidates={data.candidates} />

      {/* Shadow signals */}
      <ShadowSignalsPanel signals={data.recentShadowSignals} />
    </div>
  );
};

export default DarwinResearchDashboard;
