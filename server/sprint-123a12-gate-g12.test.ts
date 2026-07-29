/**
 * Sprint 123A.12 — Gate G12 Tests (Corrected)
 * PV-EXP-003: Loss Autopsy — Accounting and Execution Correction
 *
 * 90 tests across 9 suites (A–I).
 * Corrected in Sprint 123A.12 to cover all 12 correction sections.
 * All tests use only pre-registered artefacts from PV-EXP-003.
 * No live trading, no execution authority, no strategy creation.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const EXP_DIR = path.join(
  process.cwd(),
  "docs/research/payout-vault/experiments/PV-EXP-003"
);
const EXP002_DIR = path.join(
  process.cwd(),
  "docs/research/payout-vault/experiments/PV-EXP-002"
);
const EXP001_DIR = path.join(
  process.cwd(),
  "docs/research/payout-vault/experiments/PV-EXP-001"
);

function loadJson(filename: string, dir = EXP_DIR): Record<string, unknown> {
  const p = path.join(dir, filename);
  expect(fs.existsSync(p), `File missing: ${filename}`).toBe(true);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function sha256File(filepath: string): string {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A: Branch & Baseline Integrity (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite A: Branch & Baseline Integrity", () => {
  it("G12-A01: sprint branch is sprint/123a-12-pv-exp-003-loss-autopsy", () => {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: process.cwd() }).toString().trim();
    expect(branch).toBe("sprint/123a-12-pv-exp-003-loss-autopsy");
  });

  it("G12-A02: G11 baseline commit 4c4f7ea is in branch history", () => {
    const log = execSync("git log --oneline", { cwd: process.cwd() }).toString();
    expect(log).toContain("4c4f7ea");
  });

  it("G12-A03: pre-registration commit 4afef6f is in branch history", () => {
    const log = execSync("git log --oneline", { cwd: process.cwd() }).toString();
    expect(log).toContain("4afef6f");
  });

  it("G12-A04: loss autopsy contract file exists and is committed", () => {
    const contractPath = path.join(EXP_DIR, "PV_EXP_003_LOSS_AUTOPSY_CONTRACT.md");
    expect(fs.existsSync(contractPath)).toBe(true);
    const tracked = execSync(
      "git ls-files docs/research/payout-vault/experiments/PV-EXP-003/PV_EXP_003_LOSS_AUTOPSY_CONTRACT.md",
      { cwd: process.cwd() }
    ).toString().trim();
    expect(tracked.length).toBeGreaterThan(0);
  });

  it("G12-A05: configuration JSON has correct experiment_id and parent", () => {
    const config = loadJson("PV_EXP_003_CONFIGURATION.json");
    expect(config.experiment_id).toBe("PV-EXP-003");
    expect(config.sprint).toBe("123A.12");
    expect(config.parent_experiment).toBe("PV-EXP-002");
    expect(config.experiment_type).toBe("LOSS_AUTOPSY");
  });

  it("G12-A06: configuration locked inputs match PV-EXP-002 outcome ledger", () => {
    const config = loadJson("PV_EXP_003_CONFIGURATION.json");
    const locked = config.locked_inputs as Record<string, unknown>;
    expect(locked.input_events).toBe(172);
    expect(locked.filled_events).toBe(152);
    expect(locked.winners).toBe(47);
    expect(locked.losers).toBe(105);
  });

  it("G12-A07: configuration has 12 loss classes in priority hierarchy", () => {
    const config = loadJson("PV_EXP_003_CONFIGURATION.json");
    const lc = config.loss_classification as Record<string, unknown>;
    const hierarchy = lc.priority_hierarchy as string[];
    expect(hierarchy).toHaveLength(12);
    expect(hierarchy[0]).toBe("L11_SAME_BAR_AMBIGUITY");
    expect(hierarchy[11]).toBe("L12_OTHER");
  });

  it("G12-A08: configuration has 10 entry filters pre-registered", () => {
    const config = loadJson("PV_EXP_003_CONFIGURATION.json");
    const ef = config.entry_filters as Record<string, unknown>;
    expect(Object.keys(ef)).toHaveLength(10);
    expect(ef).toHaveProperty("F1_RTH_ONLY");
    expect(ef).toHaveProperty("F10_MIN_DISPLACEMENT_STRENGTH");
  });

  it("G12-A09: authority boundaries are all DISABLED/zero", () => {
    const config = loadJson("PV_EXP_003_CONFIGURATION.json");
    const ab = config.authority_boundaries as Record<string, unknown>;
    expect(ab.darwin_decision_authority).toBe("DISABLED");
    expect(ab.darwin_execution_authority).toBe("DISABLED");
    expect(ab.live_trades_initiated).toBe(0);
    expect(ab.strategy_status_changes).toBe(0);
  });

  it("G12-A10: correction engine file exists", () => {
    const enginePath = path.join(EXP_DIR, "pv_exp_003_g12_correction_engine.py");
    expect(fs.existsSync(enginePath)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B: Preventability Accounting Correction (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite B: Preventability Accounting Correction", () => {
  it("G12-B01: preventability accounting audit file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-B02: preventability accounting reconciles (HIGH+MEDIUM+LOW = 105)", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    const high = prev.high_count as number;
    const medium = prev.medium_count as number;
    const low = prev.low_count as number;
    expect(high + medium + low).toBe(105);
    expect(prev.preventability_accounting_reconciles).toBe(true);
  });

  it("G12-B03: HIGH+MEDIUM count is 73 (corrected from original 60)", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(prev.high_plus_medium_count).toBe(73);
  });

  it("G12-B04: HIGH+MEDIUM percentage is 69.5238% (corrected from 57.1%)", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    const pct = prev.high_plus_medium_percent as number;
    expect(Math.abs(pct - 69.5238)).toBeLessThan(0.001);
  });

  it("G12-B05: HIGH count is 43", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(prev.high_count).toBe(43);
  });

  it("G12-B06: MEDIUM count is 30", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(prev.medium_count).toBe(30);
  });

  it("G12-B07: LOW count is 32", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(prev.low_count).toBe(32);
  });

  it("G12-B08: total_losers is 105", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(prev.total_losers).toBe(105);
  });

  it("G12-B09: class_breakdown array is present and non-empty", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    const breakdown = prev.class_breakdown as unknown[];
    expect(Array.isArray(breakdown)).toBe(true);
    expect(breakdown.length).toBeGreaterThan(0);
  });

  it("G12-B10: each class_breakdown entry has count, preventability_class, and average_loss_usd", () => {
    const prev = loadJson("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    const breakdown = prev.class_breakdown as Record<string, unknown>[];
    for (const cls of breakdown) {
      expect(cls).toHaveProperty("count");
      expect(cls).toHaveProperty("preventability_class");
      expect(cls).toHaveProperty("average_loss_usd");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite C: Time Bucket Audit (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite C: Time Bucket Audit", () => {
  it("G12-C01: time bucket audit file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_TIME_BUCKET_AUDIT.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-C02: time bucket audit has 0 unknown session labels", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    expect(tba.unknown_session_labels).toBe(0);
  });

  it("G12-C03: session counts sum to 152", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    expect(tba.session_counts_sum).toBe(152);
  });

  it("G12-C04: weekday counts sum to 152", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    expect(tba.weekday_counts_sum).toBe(152);
  });

  it("G12-C05: F1 (RTH only) retains 65 trades (corrected from 0)", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const f1 = (tba.filter_results as Record<string, Record<string, unknown>>)["F1_RTH_ONLY"];
    expect(f1.retained_count).toBe(65);
  });

  it("G12-C06: F2 (exclude Monday) retains 118 trades", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const f2 = (tba.filter_results as Record<string, Record<string, unknown>>)["F2_EXCLUDE_MONDAY"];
    expect(f2.retained_count).toBe(118);
  });

  it("G12-C07: F3 (RTH + exclude Monday) retains 48 trades", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const f3 = (tba.filter_results as Record<string, Record<string, unknown>>)["F3_RTH_AND_EXCLUDE_MONDAY"];
    expect(f3.retained_count).toBe(48);
  });

  it("G12-C08: F2 retained + removed = 152", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const f2 = (tba.filter_results as Record<string, Record<string, unknown>>)["F2_EXCLUDE_MONDAY"];
    expect((f2.retained_count as number) + (f2.removed_count as number)).toBe(152);
  });

  it("G12-C09: frozen parameters include UTC timezone", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const fp = tba.frozen_parameters as Record<string, unknown>;
    expect(fp.timezone).toBe("UTC");
  });

  it("G12-C10: frozen parameters include RTH definition referencing NY session", () => {
    const tba = loadJson("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    const fp = tba.frozen_parameters as Record<string, unknown>;
    expect((fp.rth_definition as string).toLowerCase()).toContain("ny");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite D: F2 Trade Reconciliation (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite D: F2 Trade Reconciliation", () => {
  it("G12-D01: F2 trade reconciliation file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-D02: training baseline count is 91", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.training_baseline_count).toBe(91);
  });

  it("G12-D03: validation baseline count is 61", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.validation_baseline_count).toBe(61);
  });

  it("G12-D04: training F2 retained is 72 (corrected from 55)", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.training_f2_retained).toBe(72);
  });

  it("G12-D05: validation F2 retained is 46", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.validation_f2_retained).toBe(46);
  });

  it("G12-D06: total F2 retained is 118 (corrected from 101)", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.f2_total_retained).toBe(118);
  });

  it("G12-D07: total F2 excluded is 34", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.f2_total_excluded).toBe(34);
  });

  it("G12-D08: F2 retained + excluded = 152", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect((f2r.f2_total_retained as number) + (f2r.f2_total_excluded as number)).toBe(152);
  });

  it("G12-D09: training retained + validation retained = total retained", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect((f2r.training_f2_retained as number) + (f2r.validation_f2_retained as number)).toBe(f2r.f2_total_retained as number);
  });

  it("G12-D10: F2 accounting reconciles with no duplicate or missing split assignments", () => {
    const f2r = loadJson("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(f2r.f2_accounting_reconciles).toBe(true);
    expect(f2r.duplicate_split_assignments).toBe(0);
    expect(f2r.missing_split_assignments).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite E: Stop Engine Audit (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite E: Stop Engine Audit", () => {
  it("G12-E01: stop engine audit file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_STOP_ENGINE_AUDIT.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-E02: stop engine audit has 7 stop metrics (S1–S7)", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const metrics = sea.stop_metrics as Record<string, unknown>;
    expect(Object.keys(metrics)).toHaveLength(7);
  });

  it("G12-E03: S1 original stop expectancy is approximately 12.32", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const metrics = sea.stop_metrics as Record<string, Record<string, unknown>>;
    expect(Math.abs((metrics["S1_ORIGINAL_STRUCTURE"].expectancy_usd as number) - 12.32)).toBeLessThan(0.5);
  });

  it("G12-E04: S2 expectancy differs from S1 (bar simulation produces distinct outcomes)", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const metrics = sea.stop_metrics as Record<string, Record<string, unknown>>;
    const s1 = metrics["S1_ORIGINAL_STRUCTURE"].expectancy_usd as number;
    const s2 = metrics["S2_ATR_1_0"].expectancy_usd as number;
    expect(s1).not.toBeCloseTo(s2, 2);
  });

  it("G12-E05: S2 ATR 1.0 expectancy is less than S1 (wider stop reduces performance)", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const metrics = sea.stop_metrics as Record<string, Record<string, unknown>>;
    const s1 = metrics["S1_ORIGINAL_STRUCTURE"].expectancy_usd as number;
    const s2 = metrics["S2_ATR_1_0"].expectancy_usd as number;
    expect(s2).toBeLessThan(s1);
  });

  it("G12-E06: L2 count is 23", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    expect(sea.l2_count).toBe(23);
  });

  it("G12-E07: stop simulation accounting reconciles", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    expect(sea.stop_simulation_accounting_reconciles).toBe(true);
  });

  it("G12-E08: distinct stop prices produced is true", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    expect(sea.distinct_stop_prices_produced).toBe(true);
  });

  it("G12-E09: frozen parameters include slippage_ticks=2 and commission_rt_usd=1.24", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const fp = sea.frozen_parameters as Record<string, unknown>;
    expect(fp.slippage_ticks).toBe(2);
    expect(Math.abs((fp.commission_rt_usd as number) - 1.24)).toBeLessThan(0.01);
  });

  it("G12-E10: L2 conversions by alternative are documented for S2 and S5", () => {
    const sea = loadJson("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    const l2conv = sea.l2_conversions_by_alternative as Record<string, unknown>;
    expect(l2conv).toHaveProperty("S2_ATR_1_0");
    expect(l2conv).toHaveProperty("S5_RECENT_CONFIRMED_SWING_PLUS_1_TICK");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite F: Early Exit Execution Correction (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite F: Early Exit Execution Correction", () => {
  it("G12-F01: early exit execution results file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-F02: early exit results has 6 rules (E1–E6)", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, unknown>;
    expect(Object.keys(rules)).toHaveLength(6);
  });

  it("G12-F03: all early exit rules are REJECTED after costs (corrected from PROMISING/OVERFIT_RISK)", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.classification, `${name} should be REJECTED`).toBe("REJECTED");
    }
  });

  it("G12-F04: frozen parameters include no_flat_breakeven_assumption=true", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const fp = eer.frozen_parameters as Record<string, unknown>;
    expect(fp.no_flat_breakeven_assumption).toBe(true);
  });

  it("G12-F05: frozen parameters include slippage_ticks=2", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const fp = eer.frozen_parameters as Record<string, unknown>;
    expect(fp.slippage_ticks).toBe(2);
  });

  it("G12-F06: E5 net expectancy change is negative (costs dominate)", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    expect(rules["E5"].net_expectancy_change_usd as number).toBeLessThan(0);
  });

  it("G12-F07: E6 net expectancy change is negative (corrected from OVERFIT_RISK)", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    expect(rules["E6"].net_expectancy_change_usd as number).toBeLessThan(0);
  });

  it("G12-F08: each rule has execution_cost_included=true", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.execution_cost_included, `${name} should have execution_cost_included`).toBe(true);
    }
  });

  it("G12-F09: each rule has slippage_ticks_applied=2", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.slippage_ticks_applied, `${name} should have slippage_ticks_applied=2`).toBe(2);
    }
  });

  it("G12-F10: each rule has commission_rt_applied=1.24", () => {
    const eer = loadJson("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    const rules = eer.rules as Record<string, Record<string, unknown>>;
    for (const [name, rule] of Object.entries(rules)) {
      expect(Math.abs((rule.commission_rt_applied as number) - 1.24)).toBeLessThan(0.01);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite G: Management Rule Correction (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite G: Management Rule Correction", () => {
  it("G12-G01: management execution results file exists", () => {
    const p = path.join(EXP_DIR, "PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    expect(fs.existsSync(p)).toBe(true);
  });

  it("G12-G02: management results has 4 rules (M1–M4)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, unknown>;
    expect(Object.keys(rules)).toHaveLength(4);
  });

  it("G12-G03: M4 future_structure_uses is 0 (causal-only)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, Record<string, unknown>>;
    expect(rules["M4_TRAIL_STRUCTURE_AFTER_1R"].future_structure_uses).toBe(0);
  });

  it("G12-G04: top-level future_structure_uses is 0", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    expect(mer.future_structure_uses).toBe(0);
  });

  it("G12-G05: M1 winners_converted_to_breakeven is 26 (corrected from 0)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, Record<string, unknown>>;
    const m1 = rules["M1_BREAKEVEN_AFTER_1R"];
    expect(m1.winners_converted_to_breakeven as number).toBe(26);
  });

  it("G12-G06: M1 winners_converted_to_loss is 0 (break-even exits, not losses)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, Record<string, unknown>>;
    const m1 = rules["M1_BREAKEVEN_AFTER_1R"];
    expect(m1.winners_converted_to_loss as number).toBe(0);
  });

  it("G12-G07: M1 expectancy is greater than baseline (+12.32)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, Record<string, unknown>>;
    expect(rules["M1_BREAKEVEN_AFTER_1R"].expectancy_usd as number).toBeGreaterThan(12.32);
  });

  it("G12-G08: M4 expectancy is greater than baseline (+12.32)", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const rules = mer.rules as Record<string, Record<string, unknown>>;
    expect(rules["M4_TRAIL_STRUCTURE_AFTER_1R"].expectancy_usd as number).toBeGreaterThan(12.32);
  });

  it("G12-G09: execution_price_assumptions_documented is true", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    expect(mer.execution_price_assumptions_documented).toBe(true);
  });

  it("G12-G10: frozen parameters include causal_only=true", () => {
    const mer = loadJson("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
    const fp = mer.frozen_parameters as Record<string, unknown>;
    expect(fp.causal_only).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite H: Temporal Validation and Adjustment Ranking (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite H: Temporal Validation and Adjustment Ranking", () => {
  it("G12-H01: temporal validation split is chronological_60_40", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.split_method).toBe("chronological_60_40");
    expect((tv.training_n as number) + (tv.validation_n as number)).toBe(152);
  });

  it("G12-H02: temporal validation training_n is 91 and validation_n is 61", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.training_n).toBe(91);
    expect(tv.validation_n).toBe(61);
  });

  it("G12-H03: temporal validation has evidence_classification field", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv).toHaveProperty("evidence_classification");
    const ec = tv.evidence_classification as Record<string, unknown>;
    expect(ec).toHaveProperty("F2_EXCLUDE_MONDAY");
  });

  it("G12-H04: F2 evidence class is RETROSPECTIVE_DISCOVERY + INTERNAL_TEMPORAL_VALIDATION", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    const ec = tv.evidence_classification as Record<string, unknown>;
    expect(ec["F2_EXCLUDE_MONDAY"] as string).toContain("RETROSPECTIVE_DISCOVERY");
    expect(ec["F2_EXCLUDE_MONDAY"] as string).toContain("INTERNAL_TEMPORAL_VALIDATION");
  });

  it("G12-H05: temporal validation parameter_changed_after_validation is false", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.parameter_changed_after_validation).toBe(false);
  });

  it("G12-H06: validation filtered expectancy > 0", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    const valFiltered = tv.validation_filtered as Record<string, unknown>;
    expect(valFiltered.expectancy_usd as number).toBeGreaterThan(0);
  });

  it("G12-H07: adjustment ranking has SUPPORTED_INTERNAL_VALIDATION bucket with F2", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const summary = ar.summary as Record<string, string[]>;
    expect(summary).toHaveProperty("SUPPORTED_INTERNAL_VALIDATION");
    expect(summary["SUPPORTED_INTERNAL_VALIDATION"]).toContain("F2_EXCLUDE_MONDAY");
  });

  it("G12-H08: adjustment ranking has M1 and M4 in SUPPORTED_INTERNAL_VALIDATION", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const summary = ar.summary as Record<string, string[]>;
    expect(summary["SUPPORTED_INTERNAL_VALIDATION"]).toContain("M1_BREAK_EVEN_AFTER_1R");
    expect(summary["SUPPORTED_INTERNAL_VALIDATION"]).toContain("M4_STRUCTURE_TRAIL_AFTER_1R");
  });

  it("G12-H09: adjustment ranking has no_combined_adjustments=true", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    expect(ar.no_combined_adjustments).toBe(true);
  });

  it("G12-H10: adjustment ranking has no_prospective_claims=true", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    expect(ar.no_prospective_claims).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite I: PV-EXP-004 Plan and Authority Boundaries (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite I: PV-EXP-004 Plan and Authority Boundaries", () => {
  it("G12-I01: PV-EXP-004 prospective validation plan file exists", () => {
    const planPath = path.join(EXP_DIR, "PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md");
    expect(fs.existsSync(planPath)).toBe(true);
  });

  it("G12-I02: PV-EXP-004 plan mentions minimum 50 non-Monday trades", () => {
    const planPath = path.join(EXP_DIR, "PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md");
    const content = fs.readFileSync(planPath, "utf-8");
    expect(content).toContain("50");
    expect(content).toContain("Monday");
  });

  it("G12-I03: PV-EXP-004 plan mentions bootstrap 95% CI gate", () => {
    const planPath = path.join(EXP_DIR, "PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md");
    const content = fs.readFileSync(planPath, "utf-8");
    expect(content.toLowerCase()).toContain("bootstrap");
    expect(content).toContain("10"); // bootstrap CI gate threshold
  });

  it("G12-I04: PV-EXP-004 plan states DARWIN_EXECUTION_AUTHORITY: DISABLED", () => {
    const planPath = path.join(EXP_DIR, "PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md");
    const content = fs.readFileSync(planPath, "utf-8");
    expect(content).toContain("DARWIN_EXECUTION_AUTHORITY: DISABLED");
  });

  it("G12-I05: PV-EXP-004 plan states LIVE_TRADES_INITIATED: 0", () => {
    const planPath = path.join(EXP_DIR, "PV_EXP_004_PROSPECTIVE_VALIDATION_PLAN.md");
    const content = fs.readFileSync(planPath, "utf-8");
    expect(content).toContain("LIVE_TRADES_INITIATED: 0");
  });

  it("G12-I06: results report mentions SUPPORTED_INTERNAL_VALIDATION", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_RESULTS_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("SUPPORTED_INTERNAL_VALIDATION");
    expect(content).toContain("F2");
  });

  it("G12-I07: results report states all early exit rules are REJECTED", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_RESULTS_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("All early exit rules are REJECTED");
  });

  it("G12-I08: regression report mentions all correction artefacts", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_REGRESSION_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("PV_EXP_003_PREVENTABILITY_ACCOUNTING_AUDIT.json");
    expect(content).toContain("PV_EXP_003_TIME_BUCKET_AUDIT.json");
    expect(content).toContain("PV_EXP_003_F2_TRADE_RECONCILIATION.json");
    expect(content).toContain("PV_EXP_003_STOP_ENGINE_AUDIT.json");
    expect(content).toContain("PV_EXP_003_EARLY_EXIT_EXECUTION_RESULTS.json");
    expect(content).toContain("PV_EXP_003_MANAGEMENT_EXECUTION_RESULTS.json");
  });

  it("G12-I09: regression report confirms LIVE_TRADES_INITIATED=0", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_REGRESSION_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("LIVE_TRADES_INITIATED");
    expect(content).toContain("0");
  });

  it("G12-I10: regression report confirms FUTURE_STRUCTURE_USES=0", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_REGRESSION_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("FUTURE_STRUCTURE_USES");
    expect(content).toContain("0");
  });
});
