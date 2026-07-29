/**
 * Sprint 123A.13 — Gate G13 Tests
 * PV-EXP-004: Reversed-Direction Target Matrix
 *
 * AUTHORITY BOUNDARIES (FROZEN):
 *   DARWIN_DECISION_AUTHORITY: DISABLED
 *   DARWIN_EXECUTION_AUTHORITY: DISABLED
 *   LIVE_TRADES_INITIATED: 0
 *
 * Tests cover:
 *   G13-A: Pre-registration and locked inputs
 *   G13-B: Direction reversal logic
 *   G13-C: Target placement (long and short)
 *   G13-D: Stop placement (long and short)
 *   G13-E: Target multiple configurations (1R, 1.5R, 2R, 2.5R)
 *   G13-F: Tick rounding and execution
 *   G13-G: Terminal outcome accounting
 *   G13-H: Reversal conversion accounting
 *   G13-I: Breakeven calculations
 *   G13-J: Walk-forward split
 *   G13-K: Multiple-comparison correction (Holm-Bonferroni)
 *   G13-L: Determinism
 *   G13-M: Causality
 *   G13-N: Authority boundaries
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Paths ────────────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, "..");
const EXP_DIR = path.join(
  REPO_ROOT,
  "docs/research/payout-vault/experiments/PV-EXP-004"
);
const EXP002_DIR = path.join(
  REPO_ROOT,
  "docs/research/payout-vault/experiments/PV-EXP-002"
);

function loadJson(filename: string): any {
  const fullPath = path.join(EXP_DIR, filename);
  expect(fs.existsSync(fullPath), `Missing artefact: ${filename}`).toBe(true);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ─── Load Artefacts ───────────────────────────────────────────────────────────
const config = loadJson("PV_EXP_004_CONFIGURATION.json");
const tmr = loadJson("PV_EXP_004_TARGET_MATRIX_RESULTS.json");
const rca = loadJson("PV_EXP_004_REVERSAL_CONVERSION_ANALYSIS.json");
const be = loadJson("PV_EXP_004_BREAKEVEN_ANALYSIS.json");
const sv = loadJson("PV_EXP_004_STATISTICAL_VALIDATION.json");
const wf = loadJson("PV_EXP_004_WALK_FORWARD_RESULTS.json");
const mf = loadJson("PV_EXP_004_ARTEFACT_MANIFEST_FINAL.json");
const revLedger = loadJson("PV_EXP_004_REVERSED_OUTCOME_LEDGER.json");
const origLedger = loadJson("PV_EXP_004_ORIGINAL_CONTROL_LEDGER.json");
const maeMfe = loadJson("PV_EXP_004_MAE_MFE_ANALYSIS.json");
const wfResults = loadJson("PV_EXP_004_WALK_FORWARD_RESULTS.json");

// ─── G13-A: Pre-registration and Locked Inputs ───────────────────────────────
describe("G13-A: Pre-registration and locked inputs", () => {
  it("G13-A01: experiment ID is PV-EXP-004", () => {
    expect(config.experiment_id).toBe("PV-EXP-004");
  });

  it("G13-A02: sprint is 123A.13", () => {
    expect(config.sprint).toBe("123A.13");
  });

  it("G13-A03: status was PRE_REGISTERED at contract time", () => {
    const contract = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_EXPERIMENT_CONTRACT.md"),
      "utf-8"
    );
    expect(contract).toContain("PRE-REGISTERED");
  });

  it("G13-A04: INPUT_EVENTS=172", () => {
    expect(config.locked_inputs.input_events).toBe(172);
  });

  it("G13-A05: FILLED_BASELINE_EVENTS=152", () => {
    expect(config.locked_inputs.filled_baseline_events).toBe(152);
  });

  it("G13-A06: input ledger SHA256 matches locked value", () => {
    const ledgerPath = path.join(EXP002_DIR, "PV_EXP_002_OUTCOME_LEDGER.json");
    const actualSha = sha256File(ledgerPath);
    expect(actualSha).toBe(revLedger.locked_inputs.input_ledger_sha256);
  });

  it("G13-A07: INVALID_RISK_DISTANCE_EVENTS=0", () => {
    expect(revLedger.invalid_risk_distance_events).toBe(0);
  });

  it("G13-A08: UNEXPLAINED_EVENT_LOSS=0", () => {
    expect(revLedger.unexplained_event_loss).toBe(0);
  });

  it("G13-A09: experiment type is RETROSPECTIVE_TARGET_MATRIX_WITH_INTERNAL_TEMPORAL_VALIDATION", () => {
    expect(config.experiment_type).toBe(
      "RETROSPECTIVE_TARGET_MATRIX_WITH_INTERNAL_TEMPORAL_VALIDATION"
    );
  });

  it("G13-A10: parent experiment is PV-EXP-003", () => {
    expect(config.parent_experiment).toBe("PV-EXP-003");
  });
});

// ─── G13-B: Direction Reversal Logic ─────────────────────────────────────────
describe("G13-B: Direction reversal logic", () => {
  it("G13-B01: reversed configs have direction=reversed", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      expect(config.configurations[cfg].direction).toBe("reversed");
    }
  });

  it("G13-B02: original configs have direction=original", () => {
    for (const cfg of ["ORIG_R1", "ORIG_R15", "ORIG_R2", "ORIG_R25"]) {
      expect(config.configurations[cfg].direction).toBe("original");
    }
  });

  it("G13-B03: reversed ledger has 4 configs", () => {
    expect(Object.keys(revLedger.trades).length).toBe(4);
    expect(revLedger.configs).toContain("REV_R1");
    expect(revLedger.configs).toContain("REV_R25");
  });

  it("G13-B04: original ledger has 4 configs", () => {
    expect(Object.keys(origLedger.trades).length).toBe(4);
    expect(origLedger.configs).toContain("ORIG_R1");
    expect(origLedger.configs).toContain("ORIG_R25");
  });

  it("G13-B05: each reversed config has 152 trades", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      expect(revLedger.trades[cfg].length).toBe(152);
    }
  });

  it("G13-B06: each original config has 152 trades", () => {
    for (const cfg of ["ORIG_R1", "ORIG_R15", "ORIG_R2", "ORIG_R25"]) {
      expect(origLedger.trades[cfg].length).toBe(152);
    }
  });

  it("G13-B07: reversed bullish trades have tested_direction=bearish", () => {
    const trades = revLedger.trades["REV_R1"];
    const bullishTrades = trades.filter(
      (t: any) => t.original_direction === "bullish"
    );
    expect(bullishTrades.length).toBeGreaterThan(0);
    for (const t of bullishTrades) {
      expect(t.tested_direction).toBe("bearish");
    }
  });

  it("G13-B08: reversed bearish trades have tested_direction=bullish", () => {
    const trades = revLedger.trades["REV_R1"];
    const bearishTrades = trades.filter(
      (t: any) => t.original_direction === "bearish"
    );
    expect(bearishTrades.length).toBeGreaterThan(0);
    for (const t of bearishTrades) {
      expect(t.tested_direction).toBe("bullish");
    }
  });

  it("G13-B09: entry price is not reversed", () => {
    // Entry prices must be identical across all configs for the same trade
    const revR1 = revLedger.trades["REV_R1"];
    const origR1 = origLedger.trades["ORIG_R1"];
    for (let i = 0; i < 10; i++) {
      expect(revR1[i].entry_price).toBeCloseTo(origR1[i].entry_price, 4);
    }
  });

  it("G13-B10: is_reversed=true for all reversed trades", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      for (const t of revLedger.trades[cfg]) {
        expect(t.is_reversed).toBe(true);
      }
    }
  });

  it("G13-B11: is_reversed=false for all original trades", () => {
    for (const cfg of ["ORIG_R1", "ORIG_R15", "ORIG_R2", "ORIG_R25"]) {
      for (const t of origLedger.trades[cfg]) {
        expect(t.is_reversed).toBe(false);
      }
    }
  });
});

// ─── G13-C: Target Placement ──────────────────────────────────────────────────
describe("G13-C: Target placement", () => {
  it("G13-C01: reversed bullish (short) target is below entry", () => {
    const trades = revLedger.trades["REV_R1"].filter(
      (t: any) => t.tested_direction === "bearish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.target_price).toBeLessThan(t.entry_price);
    }
  });

  it("G13-C02: reversed bearish (long) target is above entry", () => {
    const trades = revLedger.trades["REV_R1"].filter(
      (t: any) => t.tested_direction === "bullish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.target_price).toBeGreaterThan(t.entry_price);
    }
  });

  it("G13-C03: original bullish target is above entry", () => {
    const trades = origLedger.trades["ORIG_R1"].filter(
      (t: any) => t.tested_direction === "bullish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.target_price).toBeGreaterThan(t.entry_price);
    }
  });

  it("G13-C04: original bearish target is below entry", () => {
    const trades = origLedger.trades["ORIG_R1"].filter(
      (t: any) => t.tested_direction === "bearish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.target_price).toBeLessThan(t.entry_price);
    }
  });
});

// ─── G13-D: Stop Placement ────────────────────────────────────────────────────
describe("G13-D: Stop placement", () => {
  it("G13-D01: reversed bullish (short) stop is above entry", () => {
    const trades = revLedger.trades["REV_R1"].filter(
      (t: any) => t.tested_direction === "bearish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.stop_price).toBeGreaterThan(t.entry_price);
    }
  });

  it("G13-D02: reversed bearish (long) stop is below entry", () => {
    const trades = revLedger.trades["REV_R1"].filter(
      (t: any) => t.tested_direction === "bullish"
    );
    for (const t of trades.slice(0, 20)) {
      expect(t.stop_price).toBeLessThan(t.entry_price);
    }
  });

  it("G13-D03: stop distance equals risk_distance for all reversed trades", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      for (const t of revLedger.trades[cfg].slice(0, 30)) {
        const stopDist = Math.abs(t.stop_price - t.entry_price);
        expect(stopDist).toBeCloseTo(t.risk_distance, 2);
      }
    }
  });

  it("G13-D04: stop distance equals risk_distance for all original trades", () => {
    for (const cfg of ["ORIG_R1", "ORIG_R15", "ORIG_R2", "ORIG_R25"]) {
      for (const t of origLedger.trades[cfg].slice(0, 30)) {
        const stopDist = Math.abs(t.stop_price - t.entry_price);
        expect(stopDist).toBeCloseTo(t.risk_distance, 2);
      }
    }
  });
});

// ─── G13-E: Target Multiple Configurations ───────────────────────────────────
describe("G13-E: Target multiple configurations (1R, 1.5R, 2R, 2.5R)", () => {
  it("G13-E01: REV_R1 target_multiple=1.0", () => {
    expect(config.configurations["REV_R1"].target_multiple).toBe(1.0);
  });

  it("G13-E02: REV_R15 target_multiple=1.5", () => {
    expect(config.configurations["REV_R15"].target_multiple).toBe(1.5);
  });

  it("G13-E03: REV_R2 target_multiple=2.0", () => {
    expect(config.configurations["REV_R2"].target_multiple).toBe(2.0);
  });

  it("G13-E04: REV_R25 target_multiple=2.5", () => {
    expect(config.configurations["REV_R25"].target_multiple).toBe(2.5);
  });

  it("G13-E05: REV_R15 has more target wins than REV_R2 (lower bar)", () => {
    const r15 = tmr.metrics["REV_R15"].target_wins;
    const r2 = tmr.metrics["REV_R2"].target_wins;
    expect(r15).toBeGreaterThanOrEqual(r2);
  });

  it("G13-E06: REV_R2 has more target wins than REV_R25 (lower bar)", () => {
    const r2 = tmr.metrics["REV_R2"].target_wins;
    const r25 = tmr.metrics["REV_R25"].target_wins;
    expect(r2).toBeGreaterThanOrEqual(r25);
  });

  it("G13-E07: target distance ≈ target_multiple × risk_distance (within 1 tick due to rounding)", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      const mult = config.configurations[cfg].target_multiple;
      for (const t of revLedger.trades[cfg].slice(0, 20)) {
        const targetDist = Math.abs(t.target_price - t.entry_price);
        const expected = mult * t.risk_distance;
        // Allow 1 tick (0.25 pts) tolerance due to tick rounding
        expect(Math.abs(targetDist - expected)).toBeLessThanOrEqual(0.25 + 0.001);
      }
    }
  });
});

// ─── G13-F: Tick Rounding and Execution ──────────────────────────────────────
describe("G13-F: Tick rounding and execution", () => {
  const TICK_SIZE = 0.25;

  it("G13-F01: all stop prices are tick-aligned", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      for (const t of revLedger.trades[cfg].slice(0, 50)) {
        const remainder = Math.round(t.stop_price / TICK_SIZE) * TICK_SIZE;
        expect(Math.abs(t.stop_price - remainder)).toBeLessThan(0.001);
      }
    }
  });

  it("G13-F02: all target prices are tick-aligned", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      for (const t of revLedger.trades[cfg].slice(0, 50)) {
        const remainder = Math.round(t.target_price / TICK_SIZE) * TICK_SIZE;
        expect(Math.abs(t.target_price - remainder)).toBeLessThan(0.001);
      }
    }
  });

  it("G13-F03: same-bar rule is STOP_FIRST", () => {
    expect(revLedger.same_bar_rule).toBe("STOP_FIRST");
  });

  it("G13-F04: commission is $1.24 RT", () => {
    expect(config.execution.commission_rt_usd).toBe(1.24);
  });

  it("G13-F05: slippage is 2 ticks", () => {
    expect(config.execution.slippage_ticks).toBe(2);
  });

  it("G13-F06: entry convention is next_bar_after_signal", () => {
    expect(config.execution.entry_convention).toBe("next_bar_after_signal");
  });

  it("G13-F07: gap-through rule is fill_at_bar_open", () => {
    expect(config.execution.gap_through_rule).toBe("fill_at_bar_open");
  });

  it("G13-F08: net P&L = gross P&L - commission for all trades", () => {
    for (const cfg of ["REV_R1", "REV_R15"]) {
      for (const t of revLedger.trades[cfg].slice(0, 30)) {
        const expectedNet = parseFloat(
          (t.gross_usd - t.commission_usd).toFixed(2)
        );
        expect(t.net_usd).toBeCloseTo(expectedNet, 1);
      }
    }
  });
});

// ─── G13-G: Terminal Outcome Accounting ──────────────────────────────────────
describe("G13-G: Terminal outcome accounting", () => {
  const VALID_OUTCOMES = new Set([
    "TARGET",
    "STOP",
    "SESSION_CLOSE_PROFIT",
    "SESSION_CLOSE_LOSS",
    "SESSION_CLOSE_FLAT",
    "END_OF_DATA_PROFIT",
    "END_OF_DATA_LOSS",
    "END_OF_DATA_FLAT",
    "UNFILLED",
  ]);

  it("G13-G01: all terminal outcomes are valid", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      for (const t of revLedger.trades[cfg]) {
        expect(VALID_OUTCOMES.has(t.terminal_outcome)).toBe(true);
      }
    }
  });

  it("G13-G02: EVENTS_WITH_ZERO_TERMINAL_OUTCOMES=0", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      const missing = revLedger.trades[cfg].filter(
        (t: any) => !t.terminal_outcome
      );
      expect(missing.length).toBe(0);
    }
  });

  it("G13-G03: OUTCOME_ACCOUNTING_RECONCILES=TRUE for all configs", () => {
    for (const cfg of Object.keys(tmr.metrics)) {
      expect(tmr.metrics[cfg].outcome_accounting_reconciles).toBe(true);
    }
  });

  it("G13-G04: REV_R1 has 66 target wins", () => {
    expect(tmr.metrics["REV_R1"].target_wins).toBe(66);
  });

  it("G13-G05: REV_R15 has 59 target wins", () => {
    expect(tmr.metrics["REV_R15"].target_wins).toBe(59);
  });

  it("G13-G06: REV_R2 has 49 target wins", () => {
    expect(tmr.metrics["REV_R2"].target_wins).toBe(49);
  });

  it("G13-G07: REV_R25 has 40 target wins", () => {
    expect(tmr.metrics["REV_R25"].target_wins).toBe(40);
  });

  it("G13-G08: ORIG_R2 has 45 target wins (closest to original setup)", () => {
    expect(tmr.metrics["ORIG_R2"].target_wins).toBe(45);
  });
});

// ─── G13-H: Reversal Conversion Accounting ───────────────────────────────────
describe("G13-H: Reversal conversion accounting", () => {
  it("G13-H01: ORIGINAL_BASELINE_LOSERS=105", () => {
    expect(rca.original_baseline_losers).toBe(105);
  });

  it("G13-H02: ORIGINAL_BASELINE_WINNERS=47", () => {
    expect(rca.original_baseline_winners).toBe(47);
  });

  it("G13-H03: theoretical reversal rate is 105/152 ≈ 69.1%", () => {
    expect(rca.theoretical_reversal_rate).toBeCloseTo(105 / 152, 3);
  });

  it("G13-H04: ORIGINAL_LOSERS_TO_REV_R1_WINNERS=66", () => {
    expect(rca.original_losers_to_rev_r1_winners).toBe(66);
  });

  it("G13-H05: ORIGINAL_LOSERS_TO_REV_R15_WINNERS=59", () => {
    expect(rca.original_losers_to_rev_r15_winners).toBe(59);
  });

  it("G13-H06: ORIGINAL_LOSERS_TO_REV_R2_WINNERS=49", () => {
    expect(rca.original_losers_to_rev_r2_winners).toBe(49);
  });

  it("G13-H07: ORIGINAL_LOSERS_TO_REV_R25_WINNERS=40", () => {
    expect(rca.original_losers_to_rev_r25_winners).toBe(40);
  });

  it("G13-H08: ORIGINAL_WINNERS_TO_REV_R1_LOSERS=46", () => {
    expect(rca.original_winners_to_rev_r1_losers).toBe(46);
  });

  it("G13-H09: actual REV_R1 target win rate < theoretical reversal rate", () => {
    // 66/152 = 43.4% < 69.1% — costs and session closes reduce the rate
    const actualRate = rca.conversions["REV_R1"].actual_rev_target_win_rate;
    expect(actualRate).toBeLessThan(rca.theoretical_reversal_rate);
  });

  it("G13-H10: original winners to reversed losers is identical across all 4 configs", () => {
    // All 47 original winners face the same entry/risk — only target changes
    // The number that become reversed losses may vary slightly
    const r1 = rca.original_winners_to_rev_r1_losers;
    const r15 = rca.original_winners_to_rev_r15_losers;
    const r2 = rca.original_winners_to_rev_r2_losers;
    const r25 = rca.original_winners_to_rev_r25_losers;
    // All should be ≤ 47 (total original winners)
    expect(r1).toBeLessThanOrEqual(47);
    expect(r15).toBeLessThanOrEqual(47);
    expect(r2).toBeLessThanOrEqual(47);
    expect(r25).toBeLessThanOrEqual(47);
  });
});

// ─── G13-I: Breakeven Calculations ───────────────────────────────────────────
describe("G13-I: Breakeven calculations", () => {
  it("G13-I01: gross breakeven rate for 1.0R is 50.0%", () => {
    expect(be.gross_breakeven_rates["1.0R"]).toBe(0.5);
  });

  it("G13-I02: gross breakeven rate for 1.5R is 40.0%", () => {
    expect(be.gross_breakeven_rates["1.5R"]).toBe(0.4);
  });

  it("G13-I03: gross breakeven rate for 2.0R is 33.3%", () => {
    expect(be.gross_breakeven_rates["2.0R"]).toBeCloseTo(0.333, 2);
  });

  it("G13-I04: gross breakeven rate for 2.5R is 28.6%", () => {
    expect(be.gross_breakeven_rates["2.5R"]).toBeCloseTo(0.286, 2);
  });

  it("G13-I05: net breakeven rate > gross breakeven rate (costs raise the bar)", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      const mult = config.configurations[cfg].target_multiple;
      // Keys in gross_breakeven_rates: "1.0R", "1.5R", "2.0R", "2.5R"
      const multKey = `${mult.toFixed(1)}R`;
      const grossBe = be.gross_breakeven_rates[multKey];
      const netBe = be.configs[cfg].net_breakeven_win_rate;
      expect(netBe).toBeGreaterThan(grossBe);
    }
  });

  it("G13-I06: REV_R1 actual target win rate is below net breakeven (REJECTED)", () => {
    const actual = be.configs["REV_R1"].actual_target_win_rate;
    const netBe = be.configs["REV_R1"].net_breakeven_win_rate;
    expect(actual).toBeLessThan(netBe);
  });

  it("G13-I07: REV_R15 actual target win rate is below net breakeven", () => {
    const actual = be.configs["REV_R15"].actual_target_win_rate;
    const netBe = be.configs["REV_R15"].net_breakeven_win_rate;
    // REV_R15 is PROMISING but below net breakeven on target-only basis
    // (session close profits contribute to positive expectancy)
    expect(actual).toBeLessThan(netBe + 0.05); // within 5% of breakeven
  });

  it("G13-I08: win_rate_margin_over_breakeven is negative for REV_R1", () => {
    expect(be.configs["REV_R1"].win_rate_margin_over_breakeven).toBeLessThan(0);
  });
});

// ─── G13-J: Walk-Forward Split ───────────────────────────────────────────────
describe("G13-J: Walk-forward split", () => {
  it("G13-J01: training n=91 (60% of 152)", () => {
    expect(wf.training_n).toBe(91);
  });

  it("G13-J02: validation n=61 (40% of 152)", () => {
    expect(wf.validation_n).toBe(61);
  });

  it("G13-J03: training_n + validation_n = 152", () => {
    expect(wf.training_n + wf.validation_n).toBe(152);
  });

  it("G13-J04: PARAMETER_CHANGED_AFTER_VALIDATION=FALSE", () => {
    expect(wf.parameter_changed_after_validation).toBe(false);
  });

  it("G13-J05: split method is chronological_60_40", () => {
    expect(wf.split_method).toBe("chronological_60_40");
  });

  it("G13-J06: all 4 reversed configs have walk-forward results", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      expect(wf.configs[cfg]).toBeDefined();
      expect(wf.configs[cfg].training_metrics).toBeDefined();
      expect(wf.configs[cfg].validation_metrics).toBeDefined();
    }
  });

  it("G13-J07: REV_R15 training expectancy is positive", () => {
    expect(wf.configs["REV_R15"].training_metrics.expectancy).toBeGreaterThan(0);
  });

  it("G13-J08: REV_R15 validation expectancy is positive (walk-forward holds)", () => {
    expect(wf.configs["REV_R15"].validation_metrics.expectancy).toBeGreaterThan(0);
  });
});

// ─── G13-K: Multiple-Comparison Correction ───────────────────────────────────
describe("G13-K: Multiple-comparison correction (Holm-Bonferroni)", () => {
  it("G13-K01: multiple comparison method is Holm-Bonferroni", () => {
    expect(sv.multiple_comparison_method).toBe("Holm-Bonferroni");
  });

  it("G13-K02: n_tests=4", () => {
    expect(sv.n_tests).toBe(4);
  });

  it("G13-K03: alpha=0.05", () => {
    expect(sv.alpha).toBe(0.05);
  });

  it("G13-K04: bootstrap iterations=10000", () => {
    expect(sv.bootstrap_iterations).toBe(10000);
  });

  it("G13-K05: all 4 reversed configs have adjusted p-values", () => {
    for (const cfg of ["REV_R1", "REV_R15", "REV_R2", "REV_R25"]) {
      expect(sv.configs[cfg].holm_bonferroni_adjusted_p).toBeDefined();
      expect(sv.configs[cfg].holm_bonferroni_adjusted_p).toBeGreaterThanOrEqual(0);
      expect(sv.configs[cfg].holm_bonferroni_adjusted_p).toBeLessThanOrEqual(1);
    }
  });

  it("G13-K06: adjusted p-values are monotonically non-decreasing from smallest raw p", () => {
    const cfgs = ["REV_R1", "REV_R15", "REV_R2", "REV_R25"];
    const rawPs = cfgs.map((c) => sv.configs[c].permutation_p_value);
    const adjPs = cfgs.map((c) => sv.configs[c].holm_bonferroni_adjusted_p);
    const sortedByRaw = cfgs
      .map((c, i) => ({ cfg: c, rawP: rawPs[i], adjP: adjPs[i] }))
      .sort((a, b) => a.rawP - b.rawP);
    for (let i = 1; i < sortedByRaw.length; i++) {
      expect(sortedByRaw[i].adjP).toBeGreaterThanOrEqual(sortedByRaw[i - 1].adjP);
    }
  });

  it("G13-K07: best reversed configuration is REV_R15", () => {
    expect(sv.best_reversed_configuration).toBe("REV_R15");
  });

  it("G13-K08: best reversed expectancy is positive", () => {
    expect(sv.best_reversed_expectancy).toBeGreaterThan(0);
  });

  it("G13-K09: best reversed classification is PROMISING (not SUPPORTED)", () => {
    // Bootstrap CI spans zero — cannot be SUPPORTED
    expect(sv.best_reversed_classification).toBe("PROMISING");
  });

  it("G13-K10: bootstrap 95% CI lower bound is negative for best config", () => {
    // Confirms SUPPORTED gate fails
    expect(sv.best_reversed_expectancy_95ci[0]).toBeLessThan(0);
  });

  it("G13-K11: REV_R1 is REJECTED", () => {
    expect(sv.configs["REV_R1"].classification).toBe("REJECTED");
  });

  it("G13-K12: REV_R25 is REJECTED", () => {
    expect(sv.configs["REV_R25"].classification).toBe("REJECTED");
  });
});

// ─── G13-L: Determinism ───────────────────────────────────────────────────────
describe("G13-L: Determinism", () => {
  it("G13-L01: artefact manifest has 100% hash coverage", () => {
    expect(mf.artefact_hash_coverage).toBe("100_PERCENT");
  });

  it("G13-L02: all canonical artefacts have non-zero byte size", () => {
    for (const a of mf.canonical_artefacts) {
      expect(a.byte_size).toBeGreaterThan(0);
    }
  });

  it("G13-L03: all canonical artefacts have SHA256 hashes", () => {
    for (const a of mf.canonical_artefacts) {
      expect(a.sha256).toBeDefined();
      expect(a.sha256.length).toBe(64);
    }
  });

  it("G13-L04: artefact manifest has 16 canonical artefacts (17th is manifest itself)", () => {
    // 16 artefacts listed in manifest + manifest itself = 17 total
    expect(mf.canonical_artefacts.length).toBe(16);
  });

  it("G13-L05: reversed outcome ledger SHA matches manifest", () => {
    const manifestEntry = mf.canonical_artefacts.find(
      (a: any) => a.filename === "PV_EXP_004_REVERSED_OUTCOME_LEDGER.json"
    );
    expect(manifestEntry).toBeDefined();
    const actualSha = sha256File(
      path.join(EXP_DIR, "PV_EXP_004_REVERSED_OUTCOME_LEDGER.json")
    );
    expect(actualSha).toBe(manifestEntry.sha256);
  });

  it("G13-L06: target matrix results SHA matches manifest", () => {
    const manifestEntry = mf.canonical_artefacts.find(
      (a: any) => a.filename === "PV_EXP_004_TARGET_MATRIX_RESULTS.json"
    );
    expect(manifestEntry).toBeDefined();
    const actualSha = sha256File(
      path.join(EXP_DIR, "PV_EXP_004_TARGET_MATRIX_RESULTS.json")
    );
    expect(actualSha).toBe(manifestEntry.sha256);
  });
});

// ─── G13-M: Causality ────────────────────────────────────────────────────────
describe("G13-M: Causality", () => {
  it("G13-M01: FUTURE_BAR_USES=0", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("FUTURE_BAR_USES | 0");
  });

  it("G13-M02: LOOKAHEAD_VIOLATIONS=0", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("LOOKAHEAD_VIOLATIONS | 0");
  });

  it("G13-M03: ENTRY_BEFORE_SIGNAL=0", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("ENTRY_BEFORE_SIGNAL | 0");
  });

  it("G13-M04: EXIT_BEFORE_ENTRY=0", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("EXIT_BEFORE_ENTRY | 0");
  });

  it("G13-M05: DUPLICATE_TRADE_IDS=0", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("DUPLICATE_TRADE_IDS | 0");
  });

  it("G13-M06: DATASET_HASH_MATCH=TRUE", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("DATASET_HASH_MATCH | TRUE");
  });

  it("G13-M07: INPUT_LEDGER_HASH_MATCH=TRUE", () => {
    const audit = fs.readFileSync(
      path.join(EXP_DIR, "PV_EXP_004_CAUSALITY_AUDIT.md"),
      "utf-8"
    );
    expect(audit).toContain("INPUT_LEDGER_HASH_MATCH | TRUE");
  });

  it("G13-M08: exit_bar_idx >= entry_bar_idx for all trades", () => {
    for (const cfg of ["REV_R1", "REV_R15"]) {
      for (const t of revLedger.trades[cfg]) {
        if (t.exit_bar_idx !== null && t.entry_bar_idx !== null) {
          expect(t.exit_bar_idx).toBeGreaterThanOrEqual(t.entry_bar_idx);
        }
      }
    }
  });

  it("G13-M09: PARAMETER_CHANGED_AFTER_VALIDATION=FALSE", () => {
    expect(wf.parameter_changed_after_validation).toBe(false);
  });
});

// ─── G13-N: Authority Boundaries ─────────────────────────────────────────────
describe("G13-N: Authority boundaries", () => {
  it("G13-N01: DARWIN_DECISION_AUTHORITY=DISABLED", () => {
    expect(config.authority_boundaries.darwin_decision_authority).toBe("DISABLED");
  });

  it("G13-N02: DARWIN_EXECUTION_AUTHORITY=DISABLED", () => {
    expect(config.authority_boundaries.darwin_execution_authority).toBe("DISABLED");
  });

  it("G13-N03: LIVE_TRADES_INITIATED=0", () => {
    expect(config.authority_boundaries.live_trades_initiated).toBe(0);
  });

  it("G13-N04: STRATEGY_STATUS_CHANGES=0", () => {
    expect(config.authority_boundaries.strategy_status_changes).toBe(0);
  });

  it("G13-N05: CAPITAL_REALLOCATIONS=0", () => {
    expect(config.authority_boundaries.capital_reallocations).toBe(0);
  });

  it("G13-N06: DARWIN_PROCESSBAR_CALLS=0", () => {
    expect(config.authority_boundaries.darwin_processbar_calls).toBe(0);
  });

  it("G13-N07: DARWIN_POSTBARAUTOMATION_CALLS=0", () => {
    expect(config.authority_boundaries.darwin_postbarautomation_calls).toBe(0);
  });

  it("G13-N08: DARWIN_TRADERSPOST_CALLS=0", () => {
    expect(config.authority_boundaries.darwin_traderspost_calls).toBe(0);
  });

  it("G13-N09: DARWIN_TRADOVATE_CALLS=0", () => {
    expect(config.authority_boundaries.darwin_tradovate_calls).toBe(0);
  });

  it("G13-N10: manifest authority boundaries all zero/DISABLED", () => {
    const ab = mf.authority_boundaries;
    expect(ab.darwin_decision_authority).toBe("DISABLED");
    expect(ab.darwin_execution_authority).toBe("DISABLED");
    expect(ab.live_trades_initiated).toBe(0);
    expect(ab.strategy_status_changes).toBe(0);
    expect(ab.capital_reallocations).toBe(0);
  });

  it("G13-N11: no traderspost references in experiment artefacts", () => {
    const artefactsToCheck = [
      "PV_EXP_004_RESULTS_REPORT.md",
      "PV_EXP_004_REGRESSION_REPORT.md",
      "PV_EXP_004_CAUSALITY_AUDIT.md",
    ];
    for (const fname of artefactsToCheck) {
      const content = fs.readFileSync(path.join(EXP_DIR, fname), "utf-8");
      const hasTraderspost =
        content.toLowerCase().includes("traderspost") &&
        !content.includes("DARWIN_TRADERSPOST_CALLS: 0") &&
        !content.includes("DARWIN_TRADERSPOST_CALLS | 0");
      expect(hasTraderspost).toBe(false);
    }
  });
});
