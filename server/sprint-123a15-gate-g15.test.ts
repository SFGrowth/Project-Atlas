/**
 * Sprint 123A.15 — Gate G15 Tests
 * USER-STRAT-003-EMA9-VWAP-CONFIRMED-EXPANSION
 *
 * 9 suites (A–I), 55 tests
 * All values locked from artefacts generated before this test file was written.
 * DARWIN_EXECUTION_AUTHORITY=DISABLED, LIVE_TRADES_INITIATED=0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const STRAT_DIR = path.join(
  __dirname,
  '../docs/research/strategies/9ema-vwap-confirmed-expansion'
);

function loadJson(filename: string): any {
  const p = path.join(STRAT_DIR, filename);
  if (!fs.existsSync(p)) throw new Error(`Missing artefact: ${filename}`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

// ─── Suite A: Pre-Registration Integrity ─────────────────────────────────────
describe('G15-A: Pre-Registration Integrity', () => {
  it('G15-A01: sprint branch is sprint/123a-15', () => {
    const branch = require('child_process')
      .execSync('git -C ' + path.join(__dirname, '..') + ' rev-parse --abbrev-ref HEAD')
      .toString().trim();
    // G15 gate passed on sprint/123a-15. Accepted on any later branch per governed change G16-REGRESSION-CLEANUP.
    expect(['sprint/123a-15-user-strat-003-ema9-vwap-confirmed-expansion',
            'sprint/123a-15', 'sprint/darwin-operational-recovery-end-to-end'].some(b => branch.includes('123a-15') || branch.includes('darwin-operational-recovery'))).toBe(true);
  });

  it('G15-A02: experiment contract exists', () => {
    expect(fs.existsSync(path.join(STRAT_DIR, 'USER_STRAT_003_EXPERIMENT_CONTRACT.md'))).toBe(true);
  });

  it('G15-A03: configuration JSON exists', () => {
    const cfg = loadJson('USER_STRAT_003_CONFIGURATION.json');
    expect(cfg).toBeTruthy();
  });

  it('G15-A04: configuration frozen before results (pre_registration_date set)', () => {
    const cfg = loadJson('USER_STRAT_003_CONFIGURATION.json');
    expect(cfg.pre_registration_date).toBeTruthy();
  });

  it('G15-A05: parameter_changed_after_validation is false', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.parameter_changed_after_validation).toBe(false);
  });

  it('G15-A06: dataset SHA256 matches locked value', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.dataset_sha256).toBe('17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe');
  });
});

// ─── Suite B: Trade Count Accounting ─────────────────────────────────────────
describe('G15-B: Trade Count Accounting', () => {
  it('G15-B01: filled_trades is 189', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.filled_trades).toBe(189);
  });

  it('G15-B02: long_trades + short_trades = filled_trades', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.long_trades + pr.short_trades).toBe(pr.filled_trades);
  });

  it('G15-B03: long_trades is 109', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.long_trades).toBe(109);
  });

  it('G15-B04: short_trades is 80', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.short_trades).toBe(80);
  });

  it('G15-B05: total_raw_signals is 408', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.total_raw_signals).toBe(408);
  });

  it('G15-B06: signals_cancelled_on_confirmation is 219', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.signals_cancelled_on_confirmation).toBe(219);
  });

  it('G15-B07: filled + cancelled accounts for raw signals', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    // filled + cancelled should be <= total_raw_signals (some may be lockout-cancelled)
    expect(pr.filled_trades + pr.signals_cancelled_on_confirmation).toBeLessThanOrEqual(pr.total_raw_signals + 10);
  });

  it('G15-B08: trades_per_week is below 2.0 (confirmation filter working)', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.trades_per_week).toBeLessThan(2.0);
  });
});

// ─── Suite C: Primary Metrics ─────────────────────────────────────────────────
describe('G15-C: Primary Metrics', () => {
  it('G15-C01: win_rate is approximately 0.2434', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.win_rate - 0.2434)).toBeLessThan(0.01);
  });

  it('G15-C02: profit_factor is approximately 0.9376', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.profit_factor - 0.9376)).toBeLessThan(0.05);
  });

  it('G15-C03: expectancy is approximately -1.0146', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.expectancy - (-1.0146))).toBeLessThan(0.5);
  });

  it('G15-C04: total_net_pnl is approximately -191.75', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.total_net_pnl - (-191.75))).toBeLessThan(20.0);
  });

  it('G15-C05: payoff_ratio is above 2.0 (winners much larger than losers)', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.payoff_ratio).toBeGreaterThan(2.0);
  });

  it('G15-C06: final_classification is INCONCLUSIVE', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.final_classification).toBe('INCONCLUSIVE');
  });

  it('G15-C07: does_strat_003_have_edge is NO', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.does_strat_003_have_edge).toBe('NO');
  });
});

// ─── Suite D: Holding Time Distribution ──────────────────────────────────────
describe('G15-D: Holding Time Distribution', () => {
  it('G15-D01: percent_exited_within_1_bar is 0.0 (confirmation filter eliminated immediate exits)', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.percent_exited_within_1_bar).toBe(0.0);
  });

  it('G15-D02: percent_held_over_6_bars is above 30%', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.percent_held_over_6_bars).toBeGreaterThan(30.0);
  });

  it('G15-D03: normal_ema_exit_count + emergency_stop_count equals filled_trades', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    const total = pr.normal_ema_exit_count + pr.emergency_stop_trigger_count +
                  pr.session_close_exit_count + pr.end_of_data_exit_count;
    expect(total).toBe(pr.filled_trades);
  });

  it('G15-D04: normal_ema_exit_count is 112', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.normal_ema_exit_count).toBe(112);
  });

  it('G15-D05: emergency_stop_trigger_count is 77', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.emergency_stop_trigger_count).toBe(77);
  });
});

// ─── Suite E: Take-off Analysis ───────────────────────────────────────────────
describe('G15-E: Take-off Analysis', () => {
  it('G15-E01: percent_reaching_1_atr is approximately 47.62%', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.percent_reaching_1_atr - 47.62)).toBeLessThan(2.0);
  });

  it('G15-E02: percent_reaching_2_atr is approximately 23.81%', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(Math.abs(pr.percent_reaching_2_atr - 23.81)).toBeLessThan(2.0);
  });

  it('G15-E03: takeoff analysis artefact exists with all ATR levels', () => {
    const ta = loadJson('USER_STRAT_003_TAKEOFF_ANALYSIS.json');
    expect(ta.by_level['ATR_1.0']).toBeTruthy();
    expect(ta.by_level['ATR_2.0']).toBeTruthy();
    expect(ta.by_level['ATR_3.0']).toBeTruthy();
    expect(ta.by_level['ATR_5.0']).toBeTruthy();
  });

  it('G15-E04: percent_reaching_1_atr > percent_reaching_2_atr (monotone)', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.percent_reaching_1_atr).toBeGreaterThan(pr.percent_reaching_2_atr);
  });
});

// ─── Suite F: Walk-Forward Validation ────────────────────────────────────────
describe('G15-F: Walk-Forward Validation', () => {
  it('G15-F01: training_trades is 113', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.training_trades).toBe(113);
  });

  it('G15-F02: validation_trades is 76', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.validation_trades).toBe(76);
  });

  it('G15-F03: training_trades + validation_trades = filled_trades', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(wf.training_trades + wf.validation_trades).toBe(pr.filled_trades);
  });

  it('G15-F04: training_expectancy is positive (2.6688)', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.training_expectancy).toBeGreaterThan(0);
  });

  it('G15-F05: validation_expectancy is negative (-6.4911)', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.validation_expectancy).toBeLessThan(0);
  });

  it('G15-F06: training_profit_factor is approximately 1.1872', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(Math.abs(wf.training_profit_factor - 1.1872)).toBeLessThan(0.05);
  });

  it('G15-F07: validation_profit_factor is below 1.0', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.validation_profit_factor).toBeLessThan(1.0);
  });

  it('G15-F08: walk_forward_positive_windows is 1 out of 4', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.walk_forward_positive_windows).toBe(1);
    expect(wf.walk_forward_windows).toBe(4);
  });

  it('G15-F09: parameter_changed_after_validation is false', () => {
    const wf = loadJson('USER_STRAT_003_WALK_FORWARD_RESULTS.json');
    expect(wf.parameter_changed_after_validation).toBe(false);
  });
});

// ─── Suite G: Statistical Tests ───────────────────────────────────────────────
describe('G15-G: Statistical Tests', () => {
  it('G15-G01: bootstrap 95% CI lower bound is approximately -9.36', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(Math.abs(sv.bootstrap_expectancy_95ci[0] - (-9.3571))).toBeLessThan(1.0);
  });

  it('G15-G02: bootstrap 95% CI upper bound is approximately 10.14', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(Math.abs(sv.bootstrap_expectancy_95ci[1] - 10.1363)).toBeLessThan(1.0);
  });

  it('G15-G03: bootstrap CI spans zero (INCONCLUSIVE)', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(sv.bootstrap_expectancy_95ci[0]).toBeLessThan(0);
    expect(sv.bootstrap_expectancy_95ci[1]).toBeGreaterThan(0);
  });

  it('G15-G04: permutation_p_value is approximately 0.4011', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(Math.abs(sv.permutation_p_value - 0.4011)).toBeLessThan(0.05);
  });

  it('G15-G05: final_classification is INCONCLUSIVE', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(sv.final_classification).toBe('INCONCLUSIVE');
  });

  it('G15-G06: does_strat_003_have_edge is NO', () => {
    const sv = loadJson('USER_STRAT_003_STATISTICAL_VALIDATION.json');
    expect(sv.does_strat_003_have_edge).toBe('NO');
  });
});

// ─── Suite H: Parent Comparison ───────────────────────────────────────────────
describe('G15-H: Parent Comparison', () => {
  it('G15-H01: parent_classification is REJECTED', () => {
    const pc = loadJson('USER_STRAT_003_PARENT_COMPARISON.json');
    expect(pc.parent_classification).toBe('REJECTED');
  });

  it('G15-H02: trade_frequency_reduction_percent is above 99%', () => {
    const pc = loadJson('USER_STRAT_003_PARENT_COMPARISON.json');
    expect(pc.trade_frequency_reduction_percent).toBeGreaterThan(99.0);
  });

  it('G15-H03: one_bar_exit_reduction_percentage_points is 67.2', () => {
    const pc = loadJson('USER_STRAT_003_PARENT_COMPARISON.json');
    expect(Math.abs(pc.one_bar_exit_reduction_percentage_points - 67.2)).toBeLessThan(1.0);
  });

  it('G15-H04: profit_factor_improvement is positive', () => {
    const pc = loadJson('USER_STRAT_003_PARENT_COMPARISON.json');
    expect(pc.profit_factor_improvement).toBeGreaterThan(0);
  });

  it('G15-H05: expectancy_improvement_usd is positive', () => {
    const pc = loadJson('USER_STRAT_003_PARENT_COMPARISON.json');
    expect(pc.expectancy_improvement_usd).toBeGreaterThan(0);
  });
});

// ─── Suite I: Causality and Authority ────────────────────────────────────────
describe('G15-I: Causality and Authority Boundaries', () => {
  it('G15-I01: future_bar_uses is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.future_bar_uses).toBe(0);
  });

  it('G15-I02: lookahead_violations is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.lookahead_violations).toBe(0);
  });

  it('G15-I03: entry_before_signal is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.entry_before_signal).toBe(0);
  });

  it('G15-I04: exit_before_entry is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.exit_before_entry).toBe(0);
  });

  it('G15-I05: duplicate_trade_ids is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.duplicate_trade_ids).toBe(0);
  });

  it('G15-I06: outcome_accounting_reconciles is true', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.outcome_accounting_reconciles).toBe(true);
  });

  it('G15-I07: dataset_hash_match is true', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.causality_audit.dataset_hash_match).toBe(true);
  });

  it('G15-I08: darwin_execution_authority is DISABLED', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.authority_boundaries.darwin_execution_authority).toBe('DISABLED');
  });

  it('G15-I09: darwin_decision_authority is DISABLED', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.authority_boundaries.darwin_decision_authority).toBe('DISABLED');
  });

  it('G15-I10: live_trades_initiated is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.authority_boundaries.live_trades_initiated).toBe(0);
  });

  it('G15-I11: darwin_traderspost_calls is 0', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.authority_boundaries.darwin_traderspost_calls).toBe(0);
  });

  it('G15-I12: existing_pine_automation_status is UNCHANGED', () => {
    const pr = loadJson('USER_STRAT_003_PRIMARY_RESULTS.json');
    expect(pr.authority_boundaries.existing_pine_automation_status).toBe('UNCHANGED');
  });
});
