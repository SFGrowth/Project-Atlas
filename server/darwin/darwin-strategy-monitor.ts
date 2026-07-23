/**
 * DARWIN Strategy Monitor — Sprint 123A.7
 *
 * Continuous strategy monitoring with rolling metrics and lifecycle recommendations.
 * Runs as an isolated service — failures do not affect the live chart pipeline.
 *
 * Authority: DATABENTO_LEARNING_AUTHORITY (shadow mode)
 * - This service NEVER calls processBar
 * - This service NEVER calls postBarAutomation
 * - This service NEVER generates live trade signals
 * - All recommendations are ADVISORY ONLY — require human approval
 *
 * Lifecycle rules: DARWIN_LIFECYCLE_RULES.md
 * Monitoring contract: DARWIN_STRATEGY_MONITORING_CONTRACT.md
 */

import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';
import { isDarwinObservationPermitted } from '../market-data/darwin-authority.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StrategyId = 'A1' | 'A3' | 'B1' | 'SB1' | 'ORB-1';

export type LifecycleStatus =
  | 'PAPER_TRADING'
  | 'CANDIDATE'
  | 'PROMOTED'
  | 'WATCH'
  | 'DEMOTION_REVIEW'
  | 'RETIRED';

export type MonitoringRecommendation =
  | 'NO_ACTION'
  | 'WATCH_CLOSELY'
  | 'DEMOTION_REVIEW'
  | 'RETIRE'
  | 'PROMOTE_CANDIDATE';

export interface RollingMetrics {
  strategyId: StrategyId;
  windowDays: number;
  nTrades: number;
  winRate: number;
  expectancyPts: number;
  netPnlDollars: number;
  profitFactor: number;
  sharpeAnnualised: number;
  maxDrawdownDollars: number;
  maxLossStreak: number;
  rollWindowTrades: number;
  rollExcludedTrades: number;
  rollExcludedExpectancy: number;
  computedAt: Date;
}

export interface LifecycleRecommendation {
  strategyId: StrategyId;
  currentStatus: LifecycleStatus;
  recommendation: MonitoringRecommendation;
  reason: string;
  triggeredRules: string[];
  metrics: RollingMetrics;
  requiresHumanApproval: boolean;
  computedAt: Date;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MONITORING_WINDOWS = [30, 60, 90] as const; // days

// Lifecycle thresholds (from DARWIN_LIFECYCLE_RULES.md)
const DEMOTION_THRESHOLDS = {
  minExpectancy: -5.0,        // pts — below this triggers demotion review
  minWinRate: 0.25,           // 25% — below this triggers watch
  maxLossStreak: 15,          // consecutive losses — triggers watch
  maxDrawdown: -15_000,       // dollars — triggers demotion review
  minProfitFactor: 0.85,      // below this triggers watch
  minTrades30d: 10,           // fewer trades = insufficient sample
};

const PROMOTION_THRESHOLDS = {
  minExpectancy: 5.0,         // pts — above this is candidate for promotion
  minWinRate: 0.35,           // 35% — minimum for promotion candidate
  minProfitFactor: 1.10,      // above this is candidate
  minSharpe: 0.5,             // minimum Sharpe for promotion
  minTrades: 50,              // minimum sample for promotion
};

// ─── Strategy Registry ───────────────────────────────────────────────────────

export interface StrategyRegistryEntry {
  status: LifecycleStatus;
  since: string;
  name: string;
  description: string;
  fidelity: 'EXACT' | 'DIVERGENT_CORRECTED' | 'DIVERGENT' | 'UNKNOWN';
  demotionThresholds: {
    maxConsecutiveLosses: number;
    minWinRate: number;
    minExpectancyPts: number;
    maxDrawdownDollars: number;
  };
}

export const STRATEGY_REGISTRY: Record<StrategyId, StrategyRegistryEntry> = {
  A1: {
    status: 'PAPER_TRADING',
    since: '2026-07-22',
    name: 'Atlas A1 — DMI Trend',
    description: 'DMI DI+/DI- crossover entry, ADE portfolio selection',
    fidelity: 'DIVERGENT_CORRECTED',
    demotionThresholds: { maxConsecutiveLosses: 12, minWinRate: 0.25, minExpectancyPts: -5.0, maxDrawdownDollars: -15_000 },
  },
  A3: {
    status: 'PAPER_TRADING',
    since: '2026-07-22',
    name: 'Atlas A3 — DMI Reduced',
    description: 'DMI entry with 0.95x score multiplier — fires 0 trades when A1 enabled',
    fidelity: 'DIVERGENT_CORRECTED',
    demotionThresholds: { maxConsecutiveLosses: 12, minWinRate: 0.25, minExpectancyPts: -5.0, maxDrawdownDollars: -15_000 },
  },
  B1: {
    status: 'PAPER_TRADING',
    since: '2026-07-22',
    name: 'Atlas B1 — VWAP Fallback',
    description: 'VWAP direction fallback — fires only when all other strategies ineligible',
    fidelity: 'DIVERGENT_CORRECTED',
    demotionThresholds: { maxConsecutiveLosses: 10, minWinRate: 0.30, minExpectancyPts: -3.0, maxDrawdownDollars: -12_000 },
  },
  SB1: {
    status: 'PAPER_TRADING',
    since: '2026-07-22',
    name: 'Atlas SB1 — EMA9 Slope AM Mid',
    description: 'EMA9 slope entry, AM Mid session only (1000-1100 NY)',
    fidelity: 'DIVERGENT_CORRECTED',
    demotionThresholds: { maxConsecutiveLosses: 10, minWinRate: 0.28, minExpectancyPts: -4.0, maxDrawdownDollars: -10_000 },
  },
  'ORB-1': {
    status: 'PAPER_TRADING',
    since: '2026-07-22',
    name: 'Atlas ORB-1 — Volatile Bar Direction',
    description: 'Volatile bar direction entry (close vs open), AM Open session',
    fidelity: 'DIVERGENT_CORRECTED',
    demotionThresholds: { maxConsecutiveLosses: 12, minWinRate: 0.28, minExpectancyPts: -4.0, maxDrawdownDollars: -12_000 },
  },
};

// ─── Rolling Metrics Computation ─────────────────────────────────────────────

export async function computeRollingMetrics(
  strategyId: StrategyId,
  windowDays: number
): Promise<RollingMetrics> {
  // Authority check — this is research-only
  if (!isDarwinObservationPermitted()) {
    throw new Error('DARWIN authority check failed for strategy-monitor');
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartMs = windowStart.getTime();

  // Query canonical backtest results from the database
  // In production: would query live paper trade records
  // In Sprint 123A.7: uses canonical backtest results as proxy
  let trades: Array<{
    pnl_pts: number;
    pnl_dollars: number;
    entry_date: string;
    is_roll_window: boolean;
  }> = [];

  try {
    // Try to get paper trade records first
    const drizzleDb = await getDb();
    if (!drizzleDb) throw new Error('DB not available');
    const [paperTrades] = await drizzleDb.execute(
      sql`SELECT pnl_pts, pnl_dollars, entry_date, is_roll_window
       FROM paper_trades
       WHERE strategy_id = ${strategyId} AND entry_ts_ms >= ${windowStartMs}
       ORDER BY entry_ts_ms ASC`
    ) as any[][];

    if (paperTrades && paperTrades.length > 0) {
      trades = paperTrades;
    }
  } catch {
    // Paper trades table may not have data yet — use empty set
    trades = [];
  }

  if (trades.length === 0) {
    return {
      strategyId,
      windowDays,
      nTrades: 0,
      winRate: 0,
      expectancyPts: 0,
      netPnlDollars: 0,
      profitFactor: 0,
      sharpeAnnualised: 0,
      maxDrawdownDollars: 0,
      maxLossStreak: 0,
      rollWindowTrades: 0,
      rollExcludedTrades: 0,
      rollExcludedExpectancy: 0,
      computedAt: new Date(),
    };
  }

  // Compute metrics
  const wins = trades.filter(t => t.pnl_pts > 0);
  const losses = trades.filter(t => t.pnl_pts <= 0);
  const rollWindow = trades.filter(t => t.is_roll_window);
  const rollExcluded = trades.filter(t => !t.is_roll_window);

  const winRate = wins.length / trades.length;
  const expectancyPts = trades.reduce((s, t) => s + t.pnl_pts, 0) / trades.length;
  const netPnlDollars = trades.reduce((s, t) => s + t.pnl_dollars, 0);

  const grossWin = wins.reduce((s, t) => s + t.pnl_dollars, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_dollars, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // Drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let running = 0;
  for (const t of trades) {
    running += t.pnl_dollars;
    if (running > peak) peak = running;
    const dd = running - peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // Max loss streak
  let maxStreak = 0;
  let streak = 0;
  for (const t of trades) {
    if (t.pnl_pts <= 0) {
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }
  }

  // Daily PnL for Sharpe
  const dailyPnl: Record<string, number> = {};
  for (const t of trades) {
    const d = t.entry_date.toString().split('T')[0];
    dailyPnl[d] = (dailyPnl[d] || 0) + t.pnl_dollars;
  }
  const dailyValues = Object.values(dailyPnl);
  const meanDaily = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length;
  const stdDaily = Math.sqrt(
    dailyValues.reduce((s, v) => s + Math.pow(v - meanDaily, 2), 0) / dailyValues.length
  );
  const sharpe = stdDaily > 0 ? (meanDaily / stdDaily) * Math.sqrt(252) : 0;

  const rollExcludedExpectancy = rollExcluded.length > 0
    ? rollExcluded.reduce((s, t) => s + t.pnl_pts, 0) / rollExcluded.length
    : 0;

  return {
    strategyId,
    windowDays,
    nTrades: trades.length,
    winRate,
    expectancyPts,
    netPnlDollars,
    profitFactor,
    sharpeAnnualised: sharpe,
    maxDrawdownDollars: maxDrawdown,
    maxLossStreak: maxStreak,
    rollWindowTrades: rollWindow.length,
    rollExcludedTrades: rollExcluded.length,
    rollExcludedExpectancy,
    computedAt: new Date(),
  };
}

// ─── Lifecycle Recommendation Engine ─────────────────────────────────────────

export function computeLifecycleRecommendation(
  metrics: RollingMetrics,
  currentStatus: LifecycleStatus
): LifecycleRecommendation {
  const triggeredRules: string[] = [];
  let recommendation: MonitoringRecommendation = 'NO_ACTION';
  let reason = 'All metrics within acceptable bounds.';

  // Insufficient sample — no action
  if (metrics.nTrades < DEMOTION_THRESHOLDS.minTrades30d) {
    return {
      strategyId: metrics.strategyId,
      currentStatus,
      recommendation: 'NO_ACTION',
      reason: `Insufficient sample: ${metrics.nTrades} trades in ${metrics.windowDays}d window (minimum ${DEMOTION_THRESHOLDS.minTrades30d}).`,
      triggeredRules: ['INSUFFICIENT_SAMPLE'],
      metrics,
      requiresHumanApproval: false,
      computedAt: new Date(),
    };
  }

  // Check demotion triggers
  if (metrics.rollExcludedExpectancy < DEMOTION_THRESHOLDS.minExpectancy) {
    triggeredRules.push(`EXPECTANCY_BELOW_THRESHOLD: ${metrics.rollExcludedExpectancy.toFixed(2)} pts < ${DEMOTION_THRESHOLDS.minExpectancy} pts`);
    recommendation = 'DEMOTION_REVIEW';
  }

  if (metrics.maxDrawdownDollars < DEMOTION_THRESHOLDS.maxDrawdown) {
    triggeredRules.push(`DRAWDOWN_EXCEEDED: $${metrics.maxDrawdownDollars.toFixed(0)} < $${DEMOTION_THRESHOLDS.maxDrawdown}`);
    recommendation = 'DEMOTION_REVIEW';
  }

  if (metrics.winRate < DEMOTION_THRESHOLDS.minWinRate) {
    triggeredRules.push(`WIN_RATE_BELOW_THRESHOLD: ${(metrics.winRate * 100).toFixed(1)}% < ${(DEMOTION_THRESHOLDS.minWinRate * 100).toFixed(0)}%`);
    if (recommendation === 'NO_ACTION') recommendation = 'WATCH_CLOSELY';
  }

  if (metrics.maxLossStreak >= DEMOTION_THRESHOLDS.maxLossStreak) {
    triggeredRules.push(`MAX_LOSS_STREAK: ${metrics.maxLossStreak} >= ${DEMOTION_THRESHOLDS.maxLossStreak}`);
    if (recommendation === 'NO_ACTION') recommendation = 'WATCH_CLOSELY';
  }

  if (metrics.profitFactor < DEMOTION_THRESHOLDS.minProfitFactor) {
    triggeredRules.push(`PROFIT_FACTOR_BELOW_THRESHOLD: ${metrics.profitFactor.toFixed(3)} < ${DEMOTION_THRESHOLDS.minProfitFactor}`);
    if (recommendation === 'NO_ACTION') recommendation = 'WATCH_CLOSELY';
  }

  // Check promotion triggers (only for PAPER_TRADING status)
  if (currentStatus === 'PAPER_TRADING' &&
      metrics.rollExcludedExpectancy >= PROMOTION_THRESHOLDS.minExpectancy &&
      metrics.winRate >= PROMOTION_THRESHOLDS.minWinRate &&
      metrics.profitFactor >= PROMOTION_THRESHOLDS.minProfitFactor &&
      metrics.sharpeAnnualised >= PROMOTION_THRESHOLDS.minSharpe &&
      metrics.nTrades >= PROMOTION_THRESHOLDS.minTrades) {
    triggeredRules.push('PROMOTION_CANDIDATE: All promotion thresholds met');
    recommendation = 'PROMOTE_CANDIDATE';
  }

  // Build reason string
  if (triggeredRules.length > 0) {
    reason = triggeredRules.join('; ');
  }

  // Retire only if demotion review has been active for 30+ days (not automated)
  // Retirement requires human approval

  return {
    strategyId: metrics.strategyId,
    currentStatus,
    recommendation,
    reason,
    triggeredRules,
    metrics,
    requiresHumanApproval: recommendation !== 'NO_ACTION',
    computedAt: new Date(),
  };
}

// ─── Monitor All Strategies ───────────────────────────────────────────────────

export async function monitorAllStrategies(windowDays: number = 30): Promise<{
  recommendations: LifecycleRecommendation[];
  summary: string;
  computedAt: Date;
  liveChartAffected: false;
}> {
  if (!isDarwinObservationPermitted()) {
    throw new Error('DARWIN authority check failed');
  }

  const strategies = Object.keys(STRATEGY_REGISTRY) as StrategyId[];
  const recommendations: LifecycleRecommendation[] = [];

  for (const strategyId of strategies) {
    const metrics = await computeRollingMetrics(strategyId, windowDays);
    const status = STRATEGY_REGISTRY[strategyId].status;
    const rec = computeLifecycleRecommendation(metrics, status);
    recommendations.push(rec);
  }

  const actionRequired = recommendations.filter(r => r.recommendation !== 'NO_ACTION');
  const summary = actionRequired.length === 0
    ? `All ${strategies.length} strategies within acceptable bounds (${windowDays}d window).`
    : `${actionRequired.length}/${strategies.length} strategies require attention: ${actionRequired.map(r => `${r.strategyId}→${r.recommendation}`).join(', ')}`;

  return {
    recommendations,
    summary,
    computedAt: new Date(),
    liveChartAffected: false as const,
  };
}

// ─── Portfolio Gap Registry Update ───────────────────────────────────────────

export interface PortfolioGap {
  /** Format: GAP-NNN (3-digit zero-padded) */
  gapId: string;
  /** Human-readable description of the gap */
  description: string;
  /** Research priority — HIGH must be addressed before new strategies are created */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Lifecycle status — only CLOSED gaps are resolved */
  status: 'OPEN' | 'IN_RESEARCH' | 'IN_PROGRESS' | 'CLOSED' | 'DEFERRED';
  /** ISO date string when gap was identified */
  identifiedAt: string;
  /** Sprint in which the gap was identified */
  identifiedInSprint?: string;
  /** Experiment IDs that have attempted to address this gap */
  experimentIds?: string[];
  /** Experiment outcome summary */
  experimentOutcome?: string;
  /** Additional research notes */
  researchNotes?: string;
  /** Sprint in which the gap was closed (required when status === 'CLOSED') */
  closedInSprint?: string;
}

/** Validate a PortfolioGap record against schema constraints */
export function validatePortfolioGap(gap: PortfolioGap): string[] {
  const errors: string[] = [];
  if (!/^GAP-\d{3}$/.test(gap.gapId)) {
    errors.push(`gapId '${gap.gapId}' must match GAP-NNN format`);
  }
  if (!gap.description || gap.description.trim().length < 10) {
    errors.push('description must be at least 10 characters');
  }
  if (!gap.identifiedAt || !/^\d{4}-\d{2}-\d{2}$/.test(gap.identifiedAt)) {
    errors.push(`identifiedAt '${gap.identifiedAt}' must be ISO date YYYY-MM-DD`);
  }
  if (gap.status === 'CLOSED' && !gap.closedInSprint) {
    errors.push('closedInSprint is required when status is CLOSED');
  }
  return errors;
}

/** Assert all gaps in the registry are valid — throws on first failure */
export function assertRegistryValid(): void {
  const allErrors: string[] = [];
  for (const gap of PORTFOLIO_GAP_REGISTRY) {
    const errors = validatePortfolioGap(gap);
    if (errors.length > 0) {
      allErrors.push(`${gap.gapId}: ${errors.join(', ')}`);
    }
  }
  if (allErrors.length > 0) {
    throw new Error(`Portfolio gap registry validation failed:\n${allErrors.join('\n')}`);
  }
}

export const PORTFOLIO_GAP_REGISTRY: PortfolioGap[] = [
  {
    gapId: 'GAP-001',
    description: 'No strategy covers overnight sessions (ETH/OVERNIGHT) — 35% of all bars unaddressed',
    priority: 'HIGH',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-G'],
    experimentOutcome: 'EXP-G FAIL: overnight directional bias p=0.346, d=0.007. No edge with simple direction test.',
    researchNotes: 'Overnight session has distinct microstructure. Requires deeper regime analysis beyond simple directional bias.',
  },
  {
    gapId: 'GAP-002',
    description: 'No strategy covers low-volatility (CHOP) regime — CHOP_IS_NOISE confirmed across 2 experiments',
    priority: 'HIGH',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-D', 'EXP-H'],
    experimentOutcome: 'EXP-D CONFIRMED_NO_EDGE (Sprint 123A.6). EXP-H FAIL: CHOP mean-reversion p=0.817, d=-0.002.',
    researchNotes: 'CHOP_IS_NOISE confirmed. This gap may be permanently unaddressable.',
  },
  {
    gapId: 'GAP-003',
    description: 'Roll-window performance is materially negative for all strategies — no roll-specific strategy exists',
    priority: 'HIGH',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-I'],
    experimentOutcome: 'EXP-I FAIL: roll-window fade p=0.656, d=0.004. RWP-001 v1.1 implemented (CME trading days).',
    researchNotes: 'Roll-window exclusion is the correct response. A dedicated roll-fade strategy requires a real roll calendar.',
  },
  {
    gapId: 'GAP-004',
    description: 'No strategy covers PM session (1300-1600 NY) specifically — 25% of RTH bars unaddressed',
    priority: 'MEDIUM',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-J'],
    experimentOutcome: 'EXP-J FAIL: PM momentum p=0.023 (fails Bonferroni 0.0071), d=-0.032. Negative d suggests mean-reversion.',
    researchNotes: 'PM session may exhibit mean-reversion. Worth testing a fade strategy rather than momentum.',
  },
  {
    gapId: 'GAP-005',
    description: 'A3 fires 0 trades — ADE selection makes it permanently inactive when A1 is enabled',
    priority: 'HIGH',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-K'],
    experimentOutcome: 'EXP-K FAIL: A3 DMI divergence entry p=0.971, d=-0.001. No unique edge even with independent entry.',
    researchNotes: 'A3 retirement recommended. Requires Phil approval. Replace with a strategy with a unique regime or entry condition.',
  },
  {
    gapId: 'GAP-006',
    description: 'B1 is fallback-only — fires when all other strategies are ineligible; near-zero expectancy',
    priority: 'MEDIUM',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-L'],
    experimentOutcome: 'EXP-L FAIL: VWAP reclaim standalone p=0.891, d=0.002. B1 has no edge as a standalone strategy.',
    researchNotes: 'B1 may need to be retired or fundamentally redesigned.',
  },
  {
    gapId: 'GAP-007',
    description: 'No strategy covers macro event days (FOMC, CPI, NFP) — high-volatility outliers unaddressed',
    priority: 'MEDIUM',
    status: 'IN_RESEARCH',
    identifiedAt: '2026-07-23',
    identifiedInSprint: '123A.7',
    experimentIds: ['EXP-M'],
    experimentOutcome: 'EXP-M FAIL: macro ATR proxy p=0.030 (fails Bonferroni), d=-0.167. Real FOMC/CPI/NFP calendar required.',
    researchNotes: 'Highest-priority next experiment. Use real macro event calendar, not ATR proxy.',
  },
];

export function getOpenGaps(): PortfolioGap[] {
  return PORTFOLIO_GAP_REGISTRY.filter(g => g.status === 'OPEN');
}
export function getHighPriorityGaps(): PortfolioGap[] {
  return PORTFOLIO_GAP_REGISTRY.filter(g => g.priority === 'HIGH' && g.status === 'OPEN');
}
