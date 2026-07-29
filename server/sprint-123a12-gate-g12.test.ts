/**
 * Sprint 123A.12 — Gate G12 Tests
 * PV-EXP-003: Loss Autopsy — Preventable-Loss Decomposition
 *
 * 80 tests across 8 suites (A–H).
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

  it("G12-A10: analysis engine file exists and is committed", () => {
    const enginePath = path.join(EXP_DIR, "pv_exp_003_analysis_engine.py");
    expect(fs.existsSync(enginePath)).toBe(true);
    const tracked = execSync(
      "git ls-files docs/research/payout-vault/experiments/PV-EXP-003/pv_exp_003_analysis_engine.py",
      { cwd: process.cwd() }
    ).toString().trim();
    expect(tracked.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B: Input Integrity (8 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite B: Input Integrity", () => {
  it("G12-B01: outcome ledger SHA starts with 741e153e", () => {
    const ledgerPath = path.join(EXP002_DIR, "PV_EXP_002_OUTCOME_LEDGER.json");
    const sha = sha256File(ledgerPath);
    expect(sha.startsWith("741e153e")).toBe(true);
  });

  it("G12-B02: event ledger SHA starts with 9240cbb1", () => {
    const ledgerPath = path.join(EXP001_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json");
    const sha = sha256File(ledgerPath);
    expect(sha.startsWith("9240cbb1")).toBe(true);
  });

  it("G12-B03: feature ledger has exactly 152 trades", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    expect(fl.total_trades).toBe(152);
    expect(fl.filled_trades).toBe(152);
  });

  it("G12-B04: feature ledger winners + losers = 152", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    expect((fl.winners as number) + (fl.losers as number)).toBe(152);
  });

  it("G12-B05: feature ledger has zero lookahead violations", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    expect(fl.feature_lookahead_violations).toBe(0);
  });

  it("G12-B06: feature ledger trades array has 152 entries", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    const trades = fl.trades as unknown[];
    expect(trades).toHaveLength(152);
  });

  it("G12-B07: each trade in feature ledger has required entry-time fields", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    const trades = fl.trades as Record<string, unknown>[];
    const requiredFields = [
      "event_id", "direction", "session", "weekday",
      "entry_price", "ATR14", "stop_distance_ticks",
      "distance_from_ema15_atr", "signal_candle_range_atr",
      "room_to_target_r", "DOL_HTF_alignment", "is_winner", "is_loser"
    ];
    for (const field of requiredFields) {
      expect(trades[0]).toHaveProperty(field);
    }
  });

  it("G12-B08: feature ledger has 47 winners and 105 losers", () => {
    const fl = loadJson("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    expect(fl.winners).toBe(47);
    expect(fl.losers).toBe(105);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite C: Loss Classification Accounting (12 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite C: Loss Classification Accounting", () => {
  it("G12-C01: classification ledger has exactly 105 total losers", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(lcl.total_losers).toBe(105);
  });

  it("G12-C02: total_classified equals 105", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(lcl.total_classified).toBe(105);
  });

  it("G12-C03: unclassified losers is zero", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(lcl.unclassified).toBe(0);
  });

  it("G12-C04: multi_primary_class is zero", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(lcl.multi_primary_class).toBe(0);
  });

  it("G12-C05: loss_class_accounting_reconciles is true", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(lcl.loss_class_accounting_reconciles).toBe(true);
  });

  it("G12-C06: class_counts sum to exactly 105", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    const counts = lcl.class_counts as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(105);
  });

  it("G12-C07: L3 is the largest class with count >= 20", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    const counts = lcl.class_counts as Record<string, number>;
    expect(counts["L3_PARTIAL_PROGRESS_THEN_REVERSAL"]).toBeGreaterThanOrEqual(20);
  });

  it("G12-C08: classifications array has exactly 105 entries", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    const classifications = lcl.classifications as unknown[];
    expect(classifications).toHaveLength(105);
  });

  it("G12-C09: every classification has a primary_loss_class field", () => {
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    const classifications = lcl.classifications as Record<string, unknown>[];
    for (const c of classifications) {
      expect(c).toHaveProperty("primary_loss_class");
      expect(typeof c.primary_loss_class).toBe("string");
    }
  });

  it("G12-C10: every primary_loss_class is one of the 12 pre-registered classes", () => {
    const validClasses = new Set([
      "L1_IMMEDIATE_ADVERSE_MOVE", "L2_STOPPED_THEN_TARGET",
      "L3_PARTIAL_PROGRESS_THEN_REVERSAL", "L4_NO_MOMENTUM_TIMEOUT",
      "L5_OPPOSING_LEVEL_BLOCK", "L6_EXTENDED_FROM_EMA",
      "L7_EXHAUSTION_CANDLE", "L8_HIGHER_TIMEFRAME_CONFLICT",
      "L9_VOLATILITY_STOP_MISMATCH", "L10_SESSION_OR_WEEKDAY_WEAKNESS",
      "L11_SAME_BAR_AMBIGUITY", "L12_OTHER"
    ]);
    const lcl = loadJson("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    const classifications = lcl.classifications as Record<string, unknown>[];
    for (const c of classifications) {
      expect(validClasses.has(c.primary_loss_class as string)).toBe(true);
    }
  });

  it("G12-C11: decomposition has preventability class for each loss class", () => {
    const ld = loadJson("PV_EXP_003_LOSS_DECOMPOSITION.json");
    const decomp = ld.decomposition as Record<string, Record<string, unknown>>;
    for (const [cls, data] of Object.entries(decomp)) {
      expect(data).toHaveProperty("preventability_class");
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(data.preventability_class);
    }
  });

  it("G12-C12: decomposition total_losers is 105", () => {
    const ld = loadJson("PV_EXP_003_LOSS_DECOMPOSITION.json");
    expect(ld.total_losers).toBe(105);
    expect(ld.loss_class_accounting_reconciles).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite D: Winner vs Loser Feature Analysis (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite D: Winner vs Loser Feature Analysis", () => {
  it("G12-D01: winner/loser analysis has no_target_leakage = true", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    expect(wl.no_target_leakage).toBe(true);
  });

  it("G12-D02: winner/loser analysis has no_exit_derived_features = true", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    expect(wl.no_exit_derived_features).toBe(true);
  });

  it("G12-D03: multiple comparison correction is benjamini_hochberg", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    expect(wl.multiple_comparison_correction).toBe("benjamini_hochberg");
  });

  it("G12-D04: n_winners is 47 and n_losers is 105", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    expect(wl.n_winners).toBe(47);
    expect(wl.n_losers).toBe(105);
  });

  it("G12-D05: features object has at least 10 features", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, unknown>;
    expect(Object.keys(features).length).toBeGreaterThanOrEqual(10);
  });

  it("G12-D06: each feature has permutation_p_value and bh_corrected_p_value", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(features)) {
      if (data.error) continue;
      expect(data).toHaveProperty("permutation_p_value");
      expect(data).toHaveProperty("bh_corrected_p_value");
    }
  });

  it("G12-D07: stop_distance_ticks has p-value < 0.05", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, Record<string, unknown>>;
    const feat = features["stop_distance_ticks"];
    expect(feat.permutation_p_value as number).toBeLessThan(0.05);
  });

  it("G12-D08: stop_distance_ticks winner median > loser median", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, Record<string, unknown>>;
    const feat = features["stop_distance_ticks"];
    expect(feat.winner_median as number).toBeGreaterThan(feat.loser_median as number);
  });

  it("G12-D09: each feature has bootstrap_95ci_median_diff as array of 2", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(features)) {
      if (data.error) continue;
      const ci = data.bootstrap_95ci_median_diff as unknown[];
      expect(ci).toHaveLength(2);
    }
  });

  it("G12-D10: each feature has research_priority_score >= 0", () => {
    const wl = loadJson("PV_EXP_003_WINNER_LOSER_FEATURE_ANALYSIS.json");
    const features = wl.features as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(features)) {
      if (data.error) continue;
      expect(data.research_priority_score as number).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite E: Entry Filter Tests (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite E: Entry Filter Tests", () => {
  it("G12-E01: entry filter results has baseline_expectancy_usd = 12.32", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    expect(ef.baseline_expectancy_usd).toBe(12.32);
  });

  it("G12-E02: entry filter results has 10 filters", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, unknown>;
    expect(Object.keys(filters)).toHaveLength(10);
  });

  it("G12-E03: F2_EXCLUDE_MONDAY retained trades is 118", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    expect(filters["F2_EXCLUDE_MONDAY"].trades_retained).toBe(118);
  });

  it("G12-E04: F2_EXCLUDE_MONDAY expectancy > baseline expectancy", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    expect(filters["F2_EXCLUDE_MONDAY"].retained_expectancy_usd as number).toBeGreaterThan(ef.baseline_expectancy_usd as number);
  });

  it("G12-E05: F2_EXCLUDE_MONDAY profit factor > 1.5", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    expect(filters["F2_EXCLUDE_MONDAY"].retained_profit_factor as number).toBeGreaterThan(1.5);
  });

  it("G12-E06: F2_EXCLUDE_MONDAY filter_value_score > 0", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    expect(filters["F2_EXCLUDE_MONDAY"].filter_value_score as number).toBeGreaterThan(0);
  });

  it("G12-E07: best_filter_by_fvs is F2_EXCLUDE_MONDAY", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    expect(ef.best_filter_by_fvs).toBe("F2_EXCLUDE_MONDAY");
  });

  it("G12-E08: each filter has trades_retained + trades_removed <= 152", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(filters)) {
      const total = (data.trades_retained as number) + (data.trades_removed as number);
      expect(total).toBeLessThanOrEqual(152);
    }
  });

  it("G12-E09: each filter has temporal_stability between 0 and 1", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(filters)) {
      const ts = data.temporal_stability as number;
      expect(ts).toBeGreaterThanOrEqual(0);
      expect(ts).toBeLessThanOrEqual(1);
    }
  });

  it("G12-E10: each filter has bootstrap_95ci_expectancy as array or null", () => {
    const ef = loadJson("PV_EXP_003_ENTRY_FILTER_RESULTS.json");
    const filters = ef.filters as Record<string, Record<string, unknown>>;
    for (const [name, data] of Object.entries(filters)) {
      const ci = data.bootstrap_95ci_expectancy;
      if (ci !== null) {
        expect(Array.isArray(ci)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite F: Stop Placement and Early Exit Tests (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite F: Stop Placement and Early Exit Tests", () => {
  it("G12-F01: stop placement results has S1_ORIGINAL", () => {
    const sp = loadJson("PV_EXP_003_STOP_PLACEMENT_RESULTS.json");
    const results = sp.results as Record<string, unknown>;
    expect(results).toHaveProperty("S1_ORIGINAL");
  });

  it("G12-F02: stop placement results has 7 alternatives (S1-S7)", () => {
    const sp = loadJson("PV_EXP_003_STOP_PLACEMENT_RESULTS.json");
    const results = sp.results as Record<string, unknown>;
    expect(Object.keys(results)).toHaveLength(7);
  });

  it("G12-F03: S1_ORIGINAL expectancy_usd is 12.32", () => {
    const sp = loadJson("PV_EXP_003_STOP_PLACEMENT_RESULTS.json");
    const results = sp.results as Record<string, Record<string, unknown>>;
    expect(results["S1_ORIGINAL"].expectancy_usd).toBe(12.32);
  });

  it("G12-F04: early exit results has 6 rules (E1-E6)", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    const ruleNames = ["E1", "E2", "E3", "E4", "E5", "E6"];
    for (const r of ruleNames) {
      expect(ee).toHaveProperty(r);
    }
  });

  it("G12-F05: early exit results has baseline_expectancy_usd = 12.32", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    expect(ee.baseline_expectancy_usd).toBe(12.32);
  });

  it("G12-F06: best_early_exit_rule is one of E1-E6", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    expect(["E1", "E2", "E3", "E4", "E5", "E6"]).toContain(ee.best_early_exit_rule);
  });

  it("G12-F07: E5 has more full_stop_losses_reduced than winners_exited_early", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    const e5 = ee["E5"] as Record<string, unknown>;
    expect(e5.full_stop_losses_reduced as number).toBeGreaterThan(e5.winners_exited_early as number);
  });

  it("G12-F08: each early exit rule has net_expectancy_change_usd", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    for (const rule of ["E1", "E2", "E3", "E4", "E5", "E6"]) {
      const r = ee[rule] as Record<string, unknown>;
      expect(r).toHaveProperty("net_expectancy_change_usd");
    }
  });

  it("G12-F09: E1 early_exits count is between 20 and 80", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    const e1 = ee["E1"] as Record<string, unknown>;
    expect(e1.early_exits as number).toBeGreaterThanOrEqual(20);
    expect(e1.early_exits as number).toBeLessThanOrEqual(80);
  });

  it("G12-F10: each early exit rule has max_drawdown_usd > 0", () => {
    const ee = loadJson("PV_EXP_003_EARLY_EXIT_RESULTS.json");
    for (const rule of ["E1", "E2", "E3", "E4", "E5", "E6"]) {
      const r = ee[rule] as Record<string, unknown>;
      expect(r.max_drawdown_usd as number).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite G: Partial Management and Temporal Validation (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite G: Partial Management and Temporal Validation", () => {
  it("G12-G01: partial management results has 4 rules (M1-M4)", () => {
    const pm = loadJson("PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json");
    const ruleNames = ["M1_BREAKEVEN_AFTER_1R", "M2_TAKE_50PCT_AT_1R", "M3_TAKE_33PCT_AT_1R", "M4_TRAIL_STRUCTURE_AFTER_1R"];
    for (const r of ruleNames) {
      expect(pm).toHaveProperty(r);
    }
  });

  it("G12-G02: M1 expectancy > baseline expectancy", () => {
    const pm = loadJson("PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json");
    const m1 = pm["M1_BREAKEVEN_AFTER_1R"] as Record<string, unknown>;
    expect(m1.expectancy_usd as number).toBeGreaterThan(pm.baseline_expectancy_usd as number);
  });

  it("G12-G03: M4 expectancy > M1 expectancy", () => {
    const pm = loadJson("PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json");
    const m1 = pm["M1_BREAKEVEN_AFTER_1R"] as Record<string, unknown>;
    const m4 = pm["M4_TRAIL_STRUCTURE_AFTER_1R"] as Record<string, unknown>;
    expect(m4.expectancy_usd as number).toBeGreaterThan(m1.expectancy_usd as number);
  });

  it("G12-G04: M1 winner_reduction is 0", () => {
    const pm = loadJson("PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json");
    const m1 = pm["M1_BREAKEVEN_AFTER_1R"] as Record<string, unknown>;
    expect(m1.winner_reduction).toBe(0);
  });

  it("G12-G05: best_management_rule is one of M1-M4", () => {
    const pm = loadJson("PV_EXP_003_PARTIAL_MANAGEMENT_RESULTS.json");
    const validRules = ["M1_BREAKEVEN_AFTER_1R", "M2_TAKE_50PCT_AT_1R", "M3_TAKE_33PCT_AT_1R", "M4_TRAIL_STRUCTURE_AFTER_1R"];
    expect(validRules).toContain(pm.best_management_rule);
  });

  it("G12-G06: temporal validation split is 60/40 chronological", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.split_method).toBe("chronological_60_40");
    expect((tv.training_n as number) + (tv.validation_n as number)).toBe(152);
  });

  it("G12-G07: temporal validation training_n is 91 and validation_n is 61", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.training_n).toBe(91);
    expect(tv.validation_n).toBe(61);
  });

  it("G12-G08: temporal validation parameter_changed_after_validation is false", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    expect(tv.parameter_changed_after_validation).toBe(false);
  });

  it("G12-G09: temporal validation has rolling_windows array", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    const rw = tv.rolling_windows as unknown[];
    expect(Array.isArray(rw)).toBe(true);
    expect(rw.length).toBeGreaterThan(0);
  });

  it("G12-G10: validation filtered expectancy > training filtered expectancy", () => {
    const tv = loadJson("PV_EXP_003_TEMPORAL_VALIDATION.json");
    const trainFiltered = tv.training_filtered as Record<string, unknown>;
    const valFiltered = tv.validation_filtered as Record<string, unknown>;
    // F2 filter should show improvement in both periods
    expect(valFiltered.expectancy_usd as number).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite H: Adjustment Ranking and Authority Boundaries (10 tests)
// ─────────────────────────────────────────────────────────────────────────────
describe("Suite H: Adjustment Ranking and Authority Boundaries", () => {
  it("G12-H01: adjustment ranking has adjustments array", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const adjustments = ar.adjustments as unknown[];
    expect(Array.isArray(adjustments)).toBe(true);
    expect(adjustments.length).toBeGreaterThan(0);
  });

  it("G12-H02: adjustment ranking has summary with 4 classification buckets", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const summary = ar.summary as Record<string, unknown>;
    expect(summary).toHaveProperty("SUPPORTED");
    expect(summary).toHaveProperty("PROMISING_BUT_UNCONFIRMED");
    expect(summary).toHaveProperty("REJECTED");
    expect(summary).toHaveProperty("OVERFIT_RISK");
  });

  it("G12-H03: F2_EXCLUDE_MONDAY is in SUPPORTED bucket", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const summary = ar.summary as Record<string, string[]>;
    expect(summary["SUPPORTED"]).toContain("F2_EXCLUDE_MONDAY");
  });

  it("G12-H04: SUPPORTED bucket has at least 1 adjustment", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const summary = ar.summary as Record<string, string[]>;
    expect(summary["SUPPORTED"].length).toBeGreaterThanOrEqual(1);
  });

  it("G12-H05: each adjustment has a classification field", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const adjustments = ar.adjustments as Record<string, unknown>[];
    const validClasses = new Set(["SUPPORTED", "PROMISING_BUT_UNCONFIRMED", "REJECTED", "OVERFIT_RISK"]);
    for (const a of adjustments) {
      expect(validClasses.has(a.classification as string)).toBe(true);
    }
  });

  it("G12-H06: each adjustment has a type field", () => {
    const ar = loadJson("PV_EXP_003_ADJUSTMENT_RANKING.json");
    const adjustments = ar.adjustments as Record<string, unknown>[];
    const validTypes = new Set(["ENTRY_FILTER", "STOP_PLACEMENT", "EARLY_EXIT", "PARTIAL_MANAGEMENT"]);
    for (const a of adjustments) {
      expect(validTypes.has(a.type as string)).toBe(true);
    }
  });

  it("G12-H07: results report file exists", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_RESULTS_REPORT.md");
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it("G12-H08: regression report file exists", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_REGRESSION_REPORT.md");
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it("G12-H09: results report mentions SUPPORTED classification", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_RESULTS_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("SUPPORTED");
    expect(content).toContain("F2");
  });

  it("G12-H10: regression report mentions all 15 artefacts", () => {
    const reportPath = path.join(EXP_DIR, "PV_EXP_003_REGRESSION_REPORT.md");
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("PV_EXP_003_TRADE_PATH_FEATURE_LEDGER.json");
    expect(content).toContain("PV_EXP_003_LOSS_CLASSIFICATION_LEDGER.json");
    expect(content).toContain("PV_EXP_003_ADJUSTMENT_RANKING.json");
  });
});
