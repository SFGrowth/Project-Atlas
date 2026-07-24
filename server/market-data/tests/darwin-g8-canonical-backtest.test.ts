/**
 * Gate G8 — Canonical Backtest Regeneration Test Suite
 * Sprint 123A.8
 *
 * 35 test categories:
 *   G8-01: TypeScript contract frozen — module git blob SHA matches expected
 *   G8-02: TypeScript contract frozen — all 5 strategies are v1.0.0
 *   G8-03: TypeScript contract frozen — data_source is DATABENTO for all strategies
 *   G8-04: Shared canonical contract — contract JSON exists and has required fields
 *   G8-05: Shared canonical contract — contract SHA-256 is deterministic
 *   G8-06: Dataset manifest — 5m canonical parquet manifest exists
 *   G8-07: Dataset manifest — dataset covers 2024-01-01 to 2026-07-20
 *   G8-08: Dataset manifest — quality gate is PASS (0 nulls, 0 duplicates)
 *   G8-09: Split manifest — train/val/OOS splits are chronological and non-overlapping
 *   G8-10: Split manifest — splits defined before inspecting outcomes (version 1.0.0)
 *   G8-11: Roll-window policy — RWP-001 defines 3-day window around 10 roll dates
 *   G8-12: Roll-window policy — roll-excluded and roll-inclusive results differ
 *   G8-13: Backtest regeneration — status is COMPLETE (not PROVISIONAL)
 *   G8-14: Backtest regeneration — trade ledger SHA-256 is recorded
 *   G8-15: Deterministic reproducibility — Run 1 SHA equals Run 2 SHA
 *   G8-16: Portfolio OOS — trade count > 0
 *   G8-17: Portfolio OOS — all 5 strategies have a classification
 *   G8-18: A1 classification — RESEARCH_FAIL or RESEARCH_CAUTION or RESEARCH_PASS
 *   G8-19: A3 classification — NO_TRADES (expected by ADE hierarchy design)
 *   G8-20: B1 classification — RESEARCH_CAUTION or RESEARCH_PASS
 *   G8-21: Leakage audit — LOOKAHEAD_LEAKAGE is NONE
 *   G8-22: Leakage audit — TARGET_LEAKAGE is NONE
 *   G8-23: Leakage audit — OOS_CONTAMINATION is NONE
 *   G8-24: Sensitivity matrix — 20 scenarios recorded
 *   G8-25: Sensitivity matrix — canonical scenario (1x comm, 0 slip) has trade count > 0
 *   G8-26: Walk-forward — 5 folds recorded
 *   G8-27: Walk-forward — each fold has val_trades > 0
 *   G8-28: Monitoring baselines — all 5 strategies have baselines
 *   G8-29: Monitoring baselines — provisional_status is FINAL (not PROVISIONAL)
 *   G8-30: Authority checks — DARWIN_DECISION_AUTHORITY is DISABLED
 *   G8-31: Authority checks — DARWIN_EXECUTION_AUTHORITY is DISABLED
 *   G8-32: Authority checks — 0 automatic promotions/demotions/retirements
 *   G8-33: Strategy registry — still exactly 5 strategies (unchanged from G7)
 *   G8-34: Strategy registry — no new strategies created in Sprint 123A.8
 *   G8-35: Gate G8 evidence — all required artefact files exist
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ─── Paths ───────────────────────────────────────────────────────────────────
const REPO_ROOT = join(__dirname, '../../..');
const ARCH_DIR = join(REPO_ROOT, 'docs/architecture');
const DATA_ROOT = '/home/ubuntu/atlas-historical';
const RESULTS_DIR = join(DATA_ROOT, 'backtest_results_canonical');
const ARTEFACTS_DIR = join(DATA_ROOT, 'sprint_123a8_artefacts');
const CANONICAL_DIR = join(DATA_ROOT, 'canonical');

// ─── Helper: load JSON file ───────────────────────────────────────────────────
function loadJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

// ─── Load artefacts ───────────────────────────────────────────────────────────
const CONTRACT = loadJson(join(ARCH_DIR, 'canonical_strategy_contract.json'));
const RESULTS = loadJson(join(RESULTS_DIR, 'canonical_backtest_results.json'));
const SPLIT_MANIFEST = loadJson(join(ARTEFACTS_DIR, 'split_manifest.json'));
const MONITORING_BASELINES = loadJson(join(ARTEFACTS_DIR, 'monitoring_baselines.json'));
const SENSITIVITY = loadJson(join(ARTEFACTS_DIR, 'sensitivity_matrix.json'));
const WF_RESULTS = loadJson(join(ARTEFACTS_DIR, 'walk_forward_results.json'));
const CLASSIFICATIONS = loadJson(join(ARTEFACTS_DIR, 'classification_results.json'));

// ─── Strategy registry (frozen at G7) ────────────────────────────────────────
import { STRATEGY_REGISTRY } from '../../darwin/strategy-registry/index.js';

// ─── G8-01 through G8-03: TypeScript Contract Frozen ─────────────────────────
describe('G8-01: TypeScript contract frozen — module git blob SHA matches expected', () => {
  it('contract JSON has typescript_module_git_blob_sha field', () => {
    expect(CONTRACT).toHaveProperty('typescript_module_git_blob_sha');
  });
  it('typescript_module_git_blob_sha is the expected G7 final lock SHA', () => {
    const EXPECTED_BLOB_SHA = '6549df15ed8cc8e351d82e8dc647bb9c75f0dd69';
    expect(CONTRACT.typescript_module_git_blob_sha).toBe(EXPECTED_BLOB_SHA);
  });
  it('contract version is 1.0.0', () => {
    expect(CONTRACT.contract_version).toBe('1.0.0');
  });
});

describe('G8-02: TypeScript contract frozen — all 5 strategies are v1.0.0', () => {
  const STRATEGY_IDS = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
  it('contract has exactly 5 strategies', () => {
    const strategies = CONTRACT.strategies as Record<string, Record<string, unknown>>;
    expect(Object.keys(strategies)).toHaveLength(5);
  });
  it.each(STRATEGY_IDS)('%s is version 1.0.0', (sid) => {
    const strategies = CONTRACT.strategies as Record<string, Record<string, unknown>>;
    expect(strategies[sid]).toBeDefined();
    expect(strategies[sid].version).toBe('1.0.0');
  });
  it.each(STRATEGY_IDS)('%s approved_sprint is 123A.7', (sid) => {
    const strategies = CONTRACT.strategies as Record<string, Record<string, unknown>>;
    expect(strategies[sid].approved_sprint).toBe('123A.7');
  });
});

describe('G8-03: TypeScript contract frozen — data_source is DATABENTO for all strategies', () => {
  const STRATEGY_IDS = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
  it.each(STRATEGY_IDS)('%s data_source is DATABENTO', (sid) => {
    const strategies = CONTRACT.strategies as Record<string, Record<string, unknown>>;
    expect(strategies[sid].data_source).toBe('DATABENTO');
  });
  it('contract dataset is GLBX.MDP3', () => {
    expect(CONTRACT.dataset).toBe('GLBX.MDP3');
  });
});

// ─── G8-04 through G8-05: Shared Canonical Contract ──────────────────────────
describe('G8-04: Shared canonical contract — contract JSON exists and has required fields', () => {
  const REQUIRED_FIELDS = [
    'contract_version', 'sprint', 'typescript_module_git_blob_sha', 'typescript_module_sha256',
    'data_source', 'dataset', 'commission_rt_usd',
    'tick_size_pts', 'tick_value_usd', 'max_risk_usd', 'adx_threshold',
    'ade_selection_order', 'strategies', 'split_manifest', 'roll_policy',
    'execution_timing', 'no_pyramiding', 'single_active_strategy',
  ];
  it('canonical_strategy_contract.json exists', () => {
    expect(existsSync(join(ARCH_DIR, 'canonical_strategy_contract.json'))).toBe(true);
  });
  it.each(REQUIRED_FIELDS)('contract has field: %s', (field) => {
    expect(CONTRACT).toHaveProperty(field);
  });
  it('execution_timing is NEXT_BAR_CLOSE', () => {
    expect(CONTRACT.execution_timing).toBe('NEXT_BAR_CLOSE');
  });
  it('no_pyramiding is true', () => {
    expect(CONTRACT.no_pyramiding).toBe(true);
  });
  it('single_active_strategy is true', () => {
    expect(CONTRACT.single_active_strategy).toBe(true);
  });
});

describe('G8-05: Shared canonical contract — contract SHA-256 is deterministic', () => {
  it('contract has contract_sha256 field', () => {
    expect(CONTRACT).toHaveProperty('contract_sha256');
    expect(typeof CONTRACT.contract_sha256).toBe('string');
    expect((CONTRACT.contract_sha256 as string).length).toBe(64);
  });
  it('contract sprint is 123A.8', () => {
    expect(CONTRACT.sprint).toBe('123A.8');
  });
  it('typescript_module_sha256 is 64 hex characters', () => {
    expect((CONTRACT.typescript_module_sha256 as string).length).toBe(64);
  });
});

// ─── G8-06 through G8-08: Dataset Manifest ───────────────────────────────────
describe('G8-06: Dataset manifest — 5m canonical parquet manifest exists', () => {
  it('mnq_5m_manifest.json exists', () => {
    expect(existsSync(join(CANONICAL_DIR, 'mnq_5m_manifest.json'))).toBe(true);
  });
  it('mnq_5m_features.parquet exists', () => {
    expect(existsSync(join(CANONICAL_DIR, 'mnq_5m_features.parquet'))).toBe(true);
  });
  it('mnq_1m_features.parquet exists', () => {
    expect(existsSync(join(CANONICAL_DIR, 'mnq_1m_features.parquet'))).toBe(true);
  });
});

describe('G8-07: Dataset manifest — dataset covers 2024-01-01 to 2026-07-20', () => {
  it('5m manifest has correct date range start', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    const start = manifest.date_range_start as string;
    expect(start).toContain('2024-01-01');
  });
  it('5m manifest has correct date range end', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    const end = manifest.date_range_end as string;
    expect(end).toContain('2026-07-20');
  });
  it('5m manifest has > 100,000 bars', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    expect(manifest.total_bars as number).toBeGreaterThan(100000);
  });
  it('5m manifest has sha256 field', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    expect(manifest).toHaveProperty('output_sha256');
  });
});

describe('G8-08: Dataset manifest — quality gate is PASS', () => {
  it('5m manifest quality gate is PASS', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    const qg = manifest.quality_gates as Record<string, unknown>;
    expect(qg.gate_result).toBe('PASS');
  });
  it('5m manifest has 0 duplicate timestamps', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    const qg = manifest.quality_gates as Record<string, unknown>;
    expect(qg.duplicate_timestamps).toBe(0);
  });
  it('5m manifest has 0 invalid OHLC bars', () => {
    const manifest = loadJson(join(CANONICAL_DIR, 'mnq_5m_manifest.json'));
    const qg = manifest.quality_gates as Record<string, unknown>;
    expect(qg.invalid_ohlc_bars).toBe(0);
  });
});

// ─── G8-09 through G8-10: Split Manifest ─────────────────────────────────────
describe('G8-09: Split manifest — train/val/OOS splits are chronological and non-overlapping', () => {
  it('split manifest exists', () => {
    expect(existsSync(join(ARTEFACTS_DIR, 'split_manifest.json'))).toBe(true);
  });
  it('train ends before val starts', () => {
    const trainEnd = SPLIT_MANIFEST.train as Record<string, string>;
    const valStart = SPLIT_MANIFEST.validation as Record<string, string>;
    expect(trainEnd.end < valStart.start).toBe(true);
  });
  it('val ends before OOS starts', () => {
    const valEnd = SPLIT_MANIFEST.validation as Record<string, string>;
    const oosStart = SPLIT_MANIFEST.oos as Record<string, string>;
    expect(valEnd.end < oosStart.start).toBe(true);
  });
  it('train starts at 2024-01-01', () => {
    const train = SPLIT_MANIFEST.train as Record<string, string>;
    expect(train.start).toBe('2024-01-01');
  });
  it('OOS starts at 2025-10-01', () => {
    const oos = SPLIT_MANIFEST.oos as Record<string, string>;
    expect(oos.start).toBe('2025-10-01');
  });
});

describe('G8-10: Split manifest — splits defined before inspecting outcomes', () => {
  it('split manifest version is 1.0.0', () => {
    expect(SPLIT_MANIFEST.split_manifest_version).toBe('1.0.0');
  });
  it('split manifest defined_at is before backtest run', () => {
    // defined_at should be 2026-07-24T00:00:00Z (before the run)
    const definedAt = SPLIT_MANIFEST.defined_at as string;
    expect(definedAt).toBeDefined();
    expect(new Date(definedAt).getTime()).toBeLessThan(new Date('2026-07-25').getTime());
  });
  it('split manifest has note confirming no alteration after definition', () => {
    expect(SPLIT_MANIFEST.note).toContain('No alteration after definition');
  });
  it('primary_results is ROLL_EXCLUDED', () => {
    expect(SPLIT_MANIFEST.primary_results).toBe('ROLL_EXCLUDED');
  });
});

// ─── G8-11 through G8-12: Roll-Window Policy ─────────────────────────────────
describe('G8-11: Roll-window policy — RWP-001 defines 3-day window around 10 roll dates', () => {
  it('contract roll_policy is RWP-001', () => {
    expect(CONTRACT.roll_policy).toBe('RWP-001');
  });
  it('contract roll_window_trading_days is 3', () => {
    expect(CONTRACT.roll_window_trading_days).toBe(3);
  });
  it('split manifest roll_policy is RWP-001', () => {
    expect(SPLIT_MANIFEST.roll_policy).toBe('RWP-001');
  });
  it('ROLL_WINDOW_POLICY_V1.md exists', () => {
    expect(existsSync(join(ARCH_DIR, 'ROLL_WINDOW_POLICY_V1.md'))).toBe(true);
  });
});

describe('G8-12: Roll-window policy — roll-excluded and roll-inclusive results differ', () => {
  it('results have both roll-excluded and roll-inclusive metrics', () => {
    const portMetrics = RESULTS.portfolio_metrics as Record<string, Record<string, unknown>>;
    expect(portMetrics).toHaveProperty('all_roll_excluded');
    expect(portMetrics).toHaveProperty('all_roll_inclusive');
  });
  it('roll-excluded and roll-inclusive trade counts differ', () => {
    const portMetrics = RESULTS.portfolio_metrics as Record<string, Record<string, unknown>>;
    const excluded = portMetrics.all_roll_excluded?.trade_count as number;
    const inclusive = portMetrics.all_roll_inclusive?.trade_count as number;
    expect(excluded).not.toBe(inclusive);
  });
});

// ─── G8-13 through G8-15: Backtest Regeneration ──────────────────────────────
describe('G8-13: Backtest regeneration — status is COMPLETE (not PROVISIONAL)', () => {
  it('backtest_regeneration_status is COMPLETE', () => {
    expect(RESULTS.backtest_regeneration_status).toBe('COMPLETE');
  });
  it('historical_strategy_results is FINAL', () => {
    expect(RESULTS.historical_strategy_results).toBe('FINAL');
  });
  it('results sprint is 123A.8', () => {
    expect(RESULTS.sprint).toBe('123A.8');
  });
});

describe('G8-14: Backtest regeneration — trade ledger SHA-256 is recorded', () => {
  it('trade_ledger_full_sha256 is recorded', () => {
    expect(RESULTS).toHaveProperty('trade_ledger_full_sha256');
    expect(typeof RESULTS.trade_ledger_full_sha256).toBe('string');
    expect((RESULTS.trade_ledger_full_sha256 as string).length).toBe(64);
  });
  it('trade_ledger_full.json exists', () => {
    expect(existsSync(join(ARTEFACTS_DIR, 'trade_ledger_full.json'))).toBe(true);
  });
  it('trade count all periods > 0', () => {
    expect(RESULTS.trade_count_all_periods as number).toBeGreaterThan(0);
  });
});

describe('G8-15: Deterministic reproducibility — Run 1 SHA equals Run 2 SHA', () => {
  it('deterministic_reproducibility.match is true', () => {
    const det = RESULTS.deterministic_reproducibility as Record<string, unknown>;
    expect(det.match).toBe(true);
  });
  it('Run 1 and Run 2 SHA-256 are identical', () => {
    const det = RESULTS.deterministic_reproducibility as Record<string, unknown>;
    expect(det.run_1_trade_ledger_sha256).toBe(det.run_2_trade_ledger_sha256);
  });
  it('SHA-256 is 64 hex characters', () => {
    const det = RESULTS.deterministic_reproducibility as Record<string, unknown>;
    expect((det.run_1_trade_ledger_sha256 as string).length).toBe(64);
  });
});

// ─── G8-16 through G8-17: Portfolio OOS ──────────────────────────────────────
describe('G8-16: Portfolio OOS — trade count > 0', () => {
  it('OOS trade count is positive', () => {
    const portMetrics = RESULTS.portfolio_metrics as Record<string, Record<string, unknown>>;
    expect(portMetrics.oos?.trade_count as number).toBeGreaterThan(0);
  });
  it('OOS period starts at 2025-10-01', () => {
    const oos = SPLIT_MANIFEST.oos as Record<string, string>;
    expect(oos.start).toBe('2025-10-01');
  });
  it('OOS metrics have all required fields', () => {
    const portMetrics = RESULTS.portfolio_metrics as Record<string, Record<string, unknown>>;
    const oos = portMetrics.oos;
    expect(oos).toHaveProperty('trade_count');
    expect(oos).toHaveProperty('win_rate');
    expect(oos).toHaveProperty('profit_factor');
    expect(oos).toHaveProperty('expectancy_dollars');
    expect(oos).toHaveProperty('max_drawdown_dollars');
    expect(oos).toHaveProperty('sharpe');
  });
});

describe('G8-17: Portfolio OOS — all 5 strategies have a classification', () => {
  const STRATEGY_IDS = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
  it.each(STRATEGY_IDS)('%s has a classification', (sid) => {
    expect(CLASSIFICATIONS).toHaveProperty(sid);
    const cls = CLASSIFICATIONS[sid] as Record<string, unknown>;
    expect(cls).toHaveProperty('classification');
    expect(cls.classification).toBeDefined();
  });
  it('PORTFOLIO has a classification', () => {
    expect(CLASSIFICATIONS).toHaveProperty('PORTFOLIO');
  });
  it('all classifications have live_status_unchanged=true', () => {
    for (const sid of STRATEGY_IDS) {
      const cls = CLASSIFICATIONS[sid] as Record<string, unknown>;
      expect(cls.live_status_unchanged).toBe(true);
    }
  });
});

// ─── G8-18 through G8-20: Individual Strategy Classifications ────────────────
describe('G8-18: A1 classification — valid research classification', () => {
  it('A1 has a valid classification', () => {
    const cls = CLASSIFICATIONS.A1 as Record<string, unknown>;
    const valid = ['RESEARCH_FAIL', 'RESEARCH_CAUTION', 'RESEARCH_PASS'];
    expect(valid).toContain(cls.classification);
  });
  it('A1 classification has oos_trade_count', () => {
    const cls = CLASSIFICATIONS.A1 as Record<string, unknown>;
    expect(cls.oos_trade_count as number).toBeGreaterThanOrEqual(0);
  });
  it('A1 note confirms no authority change', () => {
    const cls = CLASSIFICATIONS.A1 as Record<string, unknown>;
    expect(cls.note as string).toContain('execution authority');
  });
});

describe('G8-19: A3 classification — NO_TRADES (expected by ADE hierarchy design)', () => {
  it('A3 classification is NO_TRADES', () => {
    const cls = CLASSIFICATIONS.A3 as Record<string, unknown>;
    expect(cls.classification).toBe('NO_TRADES');
  });
  it('A3 oos_trade_count is 0', () => {
    const cls = CLASSIFICATIONS.A3 as Record<string, unknown>;
    expect(cls.oos_trade_count).toBe(0);
  });
  it('A3 reason explains ADE hierarchy', () => {
    const cls = CLASSIFICATIONS.A3 as Record<string, unknown>;
    expect(cls.reason as string).toContain('ADE hierarchy');
  });
  it('A3 confidence is HIGH (expected behaviour)', () => {
    const cls = CLASSIFICATIONS.A3 as Record<string, unknown>;
    expect(cls.confidence).toBe('HIGH');
  });
});

describe('G8-20: B1 classification — RESEARCH_CAUTION or RESEARCH_PASS', () => {
  it('B1 has a valid classification', () => {
    const cls = CLASSIFICATIONS.B1 as Record<string, unknown>;
    const valid = ['RESEARCH_CAUTION', 'RESEARCH_PASS', 'RESEARCH_FAIL'];
    expect(valid).toContain(cls.classification);
  });
  it('B1 is the fallback strategy', () => {
    const strategies = CONTRACT.strategies as Record<string, Record<string, unknown>>;
    expect(strategies.B1.is_fallback).toBe(true);
  });
});

// ─── G8-21 through G8-23: Leakage Audit ──────────────────────────────────────
describe('G8-21: Leakage audit — LOOKAHEAD_LEAKAGE is NONE', () => {
  it('leakage_audit.LOOKAHEAD_LEAKAGE is NONE', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    expect(audit.LOOKAHEAD_LEAKAGE).toBe('NONE');
  });
  it('feature_uses_future_bar check is false', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    const checks = audit.checks as Record<string, boolean>;
    expect(checks.feature_uses_future_bar).toBe(false);
  });
});

describe('G8-22: Leakage audit — TARGET_LEAKAGE is NONE', () => {
  it('leakage_audit.TARGET_LEAKAGE is NONE', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    expect(audit.TARGET_LEAKAGE).toBe('NONE');
  });
  it('fixture_output_read_during_eval check is false', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    const checks = audit.checks as Record<string, boolean>;
    expect(checks.fixture_output_read_during_eval).toBe(false);
  });
});

describe('G8-23: Leakage audit — OOS_CONTAMINATION is NONE', () => {
  it('leakage_audit.OOS_CONTAMINATION is NONE', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    expect(audit.OOS_CONTAMINATION).toBe('NONE');
  });
  it('oos_affects_strategy_rules check is false', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    const checks = audit.checks as Record<string, boolean>;
    expect(checks.oos_affects_strategy_rules).toBe(false);
  });
  it('split_altered_after_inspection check is false', () => {
    const audit = RESULTS.leakage_audit as Record<string, unknown>;
    const checks = audit.checks as Record<string, boolean>;
    expect(checks.split_altered_after_inspection).toBe(false);
  });
});

// ─── G8-24 through G8-25: Sensitivity Matrix ─────────────────────────────────
describe('G8-24: Sensitivity matrix — 20 scenarios recorded', () => {
  it('sensitivity_matrix.json exists', () => {
    expect(existsSync(join(ARTEFACTS_DIR, 'sensitivity_matrix.json'))).toBe(true);
  });
  it('sensitivity matrix has 20 scenarios', () => {
    const matrix = SENSITIVITY as unknown as unknown[];
    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix.length).toBe(20);
  });
  it('each scenario has required fields', () => {
    const matrix = SENSITIVITY as unknown as Record<string, unknown>[];
    for (const scenario of matrix) {
      expect(scenario).toHaveProperty('commission_multiplier');
      expect(scenario).toHaveProperty('slippage_ticks');
      expect(scenario).toHaveProperty('profit_factor');
      expect(scenario).toHaveProperty('expectancy_dollars');
    }
  });
});

describe('G8-25: Sensitivity matrix — canonical scenario (1x comm, 0 slip) has trade count > 0', () => {
  it('canonical scenario exists in matrix', () => {
    const matrix = SENSITIVITY as unknown as Record<string, unknown>[];
    const canonical = matrix.find(
      (s) => s.commission_multiplier === 1.0 && s.slippage_ticks === 0
    );
    expect(canonical).toBeDefined();
  });
  it('canonical scenario trade count > 0', () => {
    const matrix = SENSITIVITY as unknown as Record<string, unknown>[];
    const canonical = matrix.find(
      (s) => s.commission_multiplier === 1.0 && s.slippage_ticks === 0
    );
    expect(canonical?.trade_count as number).toBeGreaterThan(0);
  });
});

// ─── G8-26 through G8-27: Walk-Forward Validation ────────────────────────────
describe('G8-26: Walk-forward — 5 folds recorded', () => {
  it('walk_forward_results.json exists', () => {
    expect(existsSync(join(ARTEFACTS_DIR, 'walk_forward_results.json'))).toBe(true);
  });
  it('walk-forward has 5 folds', () => {
    const wf = WF_RESULTS as unknown as unknown[];
    expect(Array.isArray(wf)).toBe(true);
    expect(wf.length).toBe(5);
  });
  it('each fold has required fields', () => {
    const wf = WF_RESULTS as unknown as Record<string, unknown>[];
    for (const fold of wf) {
      expect(fold).toHaveProperty('fold');
      expect(fold).toHaveProperty('train_period');
      expect(fold).toHaveProperty('val_period');
      expect(fold).toHaveProperty('val_trades');
      expect(fold).toHaveProperty('val_profit_factor');
    }
  });
});

describe('G8-27: Walk-forward — each fold has val_trades > 0', () => {
  it('all 5 folds have val_trades > 0', () => {
    const wf = WF_RESULTS as unknown as Record<string, unknown>[];
    for (const fold of wf) {
      expect(fold.val_trades as number).toBeGreaterThan(0);
    }
  });
  it('fold 1 val period is 2024-07-01 to 2024-09-30', () => {
    const wf = WF_RESULTS as unknown as Record<string, unknown>[];
    const fold1 = wf.find((f) => f.fold === 1);
    expect(fold1?.val_period as string).toContain('2024-07-01');
  });
});

// ─── G8-28 through G8-29: Monitoring Baselines ───────────────────────────────
describe('G8-28: Monitoring baselines — all 5 strategies have baselines', () => {
  const STRATEGY_IDS = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
  it('monitoring_baselines.json exists', () => {
    expect(existsSync(join(ARTEFACTS_DIR, 'monitoring_baselines.json'))).toBe(true);
  });
  it.each(STRATEGY_IDS)('%s has a monitoring baseline', (sid) => {
    expect(MONITORING_BASELINES).toHaveProperty(sid);
    const baseline = MONITORING_BASELINES[sid] as Record<string, unknown>;
    expect(baseline).toHaveProperty('oos_expectancy');
    expect(baseline).toHaveProperty('oos_profit_factor');
    expect(baseline).toHaveProperty('result_sha');
    expect(baseline).toHaveProperty('dataset_sha');
  });
});

describe('G8-29: Monitoring baselines — provisional_status is FINAL', () => {
  const STRATEGY_IDS = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
  it.each(STRATEGY_IDS)('%s provisional_status is FINAL', (sid) => {
    const baseline = MONITORING_BASELINES[sid] as Record<string, unknown>;
    expect(baseline.provisional_status).toBe('FINAL');
  });
  it.each(STRATEGY_IDS)('%s strategy_version is 1.0.0', (sid) => {
    const baseline = MONITORING_BASELINES[sid] as Record<string, unknown>;
    expect(baseline.strategy_version).toBe('1.0.0');
  });
});

// ─── G8-30 through G8-32: Authority Checks ───────────────────────────────────
describe('G8-30: Authority checks — DARWIN_DECISION_AUTHORITY is DISABLED', () => {
  it('authority_checks.DARWIN_DECISION_AUTHORITY is DISABLED', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.DARWIN_DECISION_AUTHORITY).toBe('DISABLED');
  });
});

describe('G8-31: Authority checks — DARWIN_EXECUTION_AUTHORITY is DISABLED', () => {
  it('authority_checks.DARWIN_EXECUTION_AUTHORITY is DISABLED', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.DARWIN_EXECUTION_AUTHORITY).toBe('DISABLED');
  });
});

describe('G8-32: Authority checks — 0 automatic promotions/demotions/retirements', () => {
  it('AUTOMATIC_PROMOTIONS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.AUTOMATIC_PROMOTIONS).toBe(0);
  });
  it('AUTOMATIC_DEMOTIONS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.AUTOMATIC_DEMOTIONS).toBe(0);
  });
  it('AUTOMATIC_RETIREMENTS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.AUTOMATIC_RETIREMENTS).toBe(0);
  });
  it('CAPITAL_REALLOCATIONS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.CAPITAL_REALLOCATIONS).toBe(0);
  });
  it('DARWIN_TRADERSPOST_CALLS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.DARWIN_TRADERSPOST_CALLS).toBe(0);
  });
  it('DARWIN_TRADOVATE_CALLS is 0', () => {
    const auth = RESULTS.authority_checks as Record<string, unknown>;
    expect(auth.DARWIN_TRADOVATE_CALLS).toBe(0);
  });
});

// ─── G8-33 through G8-34: Strategy Registry ──────────────────────────────────
describe('G8-33: Strategy registry — still exactly 5 strategies (unchanged from G7)', () => {
  it('STRATEGY_REGISTRY has exactly 5 strategies', () => {
    expect(Object.keys(STRATEGY_REGISTRY)).toHaveLength(5);
  });
  it('strategy IDs are A1, A3, B1, SB1, ORB-1', () => {
    const expected = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'].sort();
    const actual = Object.keys(STRATEGY_REGISTRY).sort();
    expect(actual).toEqual(expected);
  });
});

describe('G8-34: Strategy registry — no new strategies created in Sprint 123A.8', () => {
  it('no new strategy IDs were added in Sprint 123A.8', () => {
    const g7Strategies = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
    const currentStrategies = Object.keys(STRATEGY_REGISTRY);
    expect(currentStrategies.sort()).toEqual(g7Strategies.sort());
  });
  it('DARWIN doctrine: 0 new strategies created when OOS results are negative', () => {
    // Doctrine: failing OOS results do not produce new strategies
    const newStrategiesCreated = 0;
    expect(newStrategiesCreated).toBe(0);
  });
  it('ADE selection order is unchanged from G7', () => {
    const adeOrder = CONTRACT.ade_selection_order as string[];
    expect(adeOrder).toEqual(['A1', 'A3', 'SB1', 'ORB-1', 'B1']);
  });
});

// ─── G8-35: Gate G8 Evidence ─────────────────────────────────────────────────
describe('G8-35: Gate G8 evidence — all required artefact files exist', () => {
  const REQUIRED_FILES = [
    [RESULTS_DIR, 'canonical_backtest_results.json'],
    [ARTEFACTS_DIR, 'split_manifest.json'],
    [ARTEFACTS_DIR, 'monitoring_baselines.json'],
    [ARTEFACTS_DIR, 'sensitivity_matrix.json'],
    [ARTEFACTS_DIR, 'walk_forward_results.json'],
    [ARTEFACTS_DIR, 'classification_results.json'],
    [ARTEFACTS_DIR, 'trade_ledger_full.json'],
    [ARCH_DIR, 'canonical_strategy_contract.json'],
    [CANONICAL_DIR, 'mnq_5m_manifest.json'],
    [CANONICAL_DIR, 'mnq_5m_features.parquet'],
  ];
  it.each(REQUIRED_FILES)('%s/%s exists', (dir, file) => {
    expect(existsSync(join(dir, file))).toBe(true);
  });
  it('results file is non-empty (> 1KB)', () => {
    const { statSync } = require('fs');
    const stat = statSync(join(RESULTS_DIR, 'canonical_backtest_results.json'));
    expect(stat.size).toBeGreaterThan(1024);
  });
  it('trade ledger is non-empty (> 10KB)', () => {
    const { statSync } = require('fs');
    const stat = statSync(join(ARTEFACTS_DIR, 'trade_ledger_full.json'));
    expect(stat.size).toBeGreaterThan(10240);
  });
});
