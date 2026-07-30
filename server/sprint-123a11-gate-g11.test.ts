/**
 * Sprint 123A.11 — Gate G11 Tests
 * PV-EXP-002: Payout Vault Profitability Analysis
 */

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const EXP_DIR = path.join(
  process.cwd(),
  "docs/research/payout-vault/experiments/PV-EXP-002"
);
const PV001_DIR = path.join(
  process.cwd(),
  "docs/research/payout-vault/experiments/PV-EXP-001"
);

function loadJson(filename: string): Record<string, unknown> {
  const p = path.join(EXP_DIR, filename);
  expect(fs.existsSync(p), `File missing: ${filename}`).toBe(true);
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function sha256File(filepath: string): string {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

describe("Suite A: Branch & Baseline Integrity", () => {
  it("G11-A01: sprint branch is sprint/123a-11-pv-exp-002-profitability-analysis", () => {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: process.cwd() }).toString().trim();
    // G11-A01 gate passed on sprint/123a-11-pv-exp-002-profitability-analysis. Accepted on any later branch per governed change G16-REGRESSION-CLEANUP.
    expect(branch === "sprint/123a-11-pv-exp-002-profitability-analysis" || branch.includes("123a-11") || branch.includes("darwin-operational-recovery") || branch.includes("darwin-core")).toBe(true);
  });

  it("G11-A02: G10 baseline commit 18bffe1 is in branch history", () => {
    const log = execSync("git log --oneline", { cwd: process.cwd() }).toString();
    expect(log).toContain("18bffe1");
  });

  it("G11-A03: pre-registration commit d133108 is in branch history", () => {
    const log = execSync("git log --oneline", { cwd: process.cwd() }).toString();
    expect(log).toContain("d133108");
  });

  it("G11-A04: experiment contract file exists and is committed", () => {
    const contractPath = path.join(EXP_DIR, "PV_EXP_002_EXPERIMENT_CONTRACT.md");
    expect(fs.existsSync(contractPath)).toBe(true);
    const tracked = execSync(
      "git ls-files docs/research/payout-vault/experiments/PV-EXP-002/PV_EXP_002_EXPERIMENT_CONTRACT.md",
      { cwd: process.cwd() }
    ).toString().trim();
    expect(tracked.length).toBeGreaterThan(0);
  });

  it("G11-A05: configuration JSON has correct primary config values", () => {
    const config = loadJson("PV_EXP_002_CONFIGURATION.json");
    const pc = config.primary_configuration as Record<string, unknown>;
    expect(config.experiment_id).toBe("PV-EXP-002");
    expect(pc.entry_model).toBe("A");
    expect(pc.stop_model).toBe("S1");
    expect(pc.target_r_multiple).toBe(2.0);
    expect(pc.standard_slippage_ticks).toBe(2);
  });
});

describe("Suite B: Input Ledger Integrity", () => {
  it("G11-B01: detector canonical ledger SHA starts with 9240cbb1", () => {
    const ledgerPath = path.join(PV001_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json");
    const sha = sha256File(ledgerPath);
    expect(sha.startsWith("9240cbb1")).toBe(true);
  });

  it("G11-B02: input event count is exactly 172", () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(PV001_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json"), "utf-8"));
    const events = ledger.events ?? ledger;
    const count = Array.isArray(events) ? events.length : Object.keys(events).length;
    expect(count).toBe(172);
  });

  it("G11-B03: all input events are in OOS window 2025-10-01 to 2026-07-20", () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(PV001_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json"), "utf-8"));
    const events = ledger.events ?? ledger;
    const arr: Record<string, unknown>[] = Array.isArray(events) ? events : Object.values(events);
    const oos_start = new Date("2025-10-01T00:00:00Z");
    const oos_end = new Date("2026-07-20T23:59:59Z");
    for (const ev of arr) {
      const ts = new Date(ev.information_cutoff as string);
      expect(ts >= oos_start && ts <= oos_end).toBe(true);
    }
  });

  it("G11-B04: no duplicate event timestamps in input ledger", () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(PV001_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json"), "utf-8"));
    const events = ledger.events ?? ledger;
    const arr: Record<string, unknown>[] = Array.isArray(events) ? events : Object.values(events);
    const ids = arr.map((e) => e.information_cutoff as string);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Suite C: Bar Mapping & Temporal Integrity", () => {
  it("G11-C01: outcome ledger has 172 total events", () => {
    const ledger = loadJson("PV_EXP_002_OUTCOME_LEDGER.json");
    expect(ledger.total_events).toBe(172);
  });

  it("G11-C02: filled + unfilled = 172", () => {
    const ledger = loadJson("PV_EXP_002_OUTCOME_LEDGER.json");
    expect((ledger.filled_events as number) + (ledger.unfilled_events as number)).toBe(172);
  });

  it("G11-C03: all entry timestamps are in OOS window", () => {
    const ledger = loadJson("PV_EXP_002_OUTCOME_LEDGER.json");
    const trades = ledger.trades as Record<string, unknown>[];
    const oos_start = new Date("2025-10-01T00:00:00Z");
    const oos_end = new Date("2026-07-20T23:59:59Z");
    for (const t of trades) {
      if (t.is_filled) {
        const ts = new Date(t.information_cutoff as string);
        expect(ts >= oos_start && ts <= oos_end).toBe(true);
      }
    }
  });

  it("G11-C04: temporal audit monthly sum equals filled events", () => {
    const ta = loadJson("PV_EXP_002_TEMPORAL_AUDIT.json");
    expect(ta.monthly_sum_equals_filled).toBe(true);
  });

  it("G11-C05: at least 3 of 4 quarters are profitable", () => {
    const ta = loadJson("PV_EXP_002_TEMPORAL_AUDIT.json");
    expect(ta.quarters_positive as number).toBeGreaterThanOrEqual(3);
  });
});

describe("Suite D: Accounting Invariants", () => {
  it("G11-D01: winners + losers + flats = filled_events", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect((pr.winners as number) + (pr.losers as number) + ((pr.flats as number) ?? 0)).toBe(pr.filled_events as number);
  });

  it("G11-D02: filled + unfilled = 172", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect((pr.filled_events as number) + (pr.unfilled_events as number)).toBe(172);
  });

  it("G11-D03: exit reasons sum to 172", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    const er = pr.exit_reasons as Record<string, number>;
    expect(Object.values(er).reduce((a, b) => a + b, 0)).toBe(172);
  });

  it("G11-D04: directional reconciliation passes", () => {
    const da = loadJson("PV_EXP_002_DIRECTIONAL_ANALYSIS.json");
    expect(da.directional_reconciliation_pass).toBe(true);
  });

  it("G11-D05: robustness matrix has zero accounting invariant failures", () => {
    const rm = loadJson("PV_EXP_002_ROBUSTNESS_MATRIX.json");
    expect(rm.accounting_invariant_fails).toBe(0);
  });
});

describe("Suite E: MAE/MFE Invariants", () => {
  it("G11-E01: MFE monotone invariant passes", () => {
    const mf = loadJson("PV_EXP_002_MAE_MFE_ANALYSIS.json");
    expect(mf.mfe_monotone_invariant).toBe(true);
  });

  it("G11-E02: MAE monotone invariant passes", () => {
    const mf = loadJson("PV_EXP_002_MAE_MFE_ANALYSIS.json");
    expect(mf.mae_monotone_invariant).toBe(true);
  });

  it("G11-E03: all TARGET winners have MFE >= 2R", () => {
    const mf = loadJson("PV_EXP_002_MAE_MFE_ANALYSIS.json");
    expect(mf.target_winners_mfe_ge_2r).toBe(true);
  });

  it("G11-E04: P(MFE >= 0.25R) > 50% of filled events", () => {
    const mf = loadJson("PV_EXP_002_MAE_MFE_ANALYSIS.json");
    const milestones = mf.mfe_r_milestones as Record<string, number>;
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(milestones["reach_0_25R"] / (pr.filled_events as number)).toBeGreaterThan(0.5);
  });

  it("G11-E05: mean MFE R is positive", () => {
    const mf = loadJson("PV_EXP_002_MAE_MFE_ANALYSIS.json");
    expect(mf.mean_mfe_r as number).toBeGreaterThan(0);
  });
});

describe("Suite F: Primary Results Validity", () => {
  it("G11-F01: total net P&L is positive", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(pr.total_net_pnl_usd as number).toBeGreaterThan(0);
  });

  it("G11-F02: profit factor > 1.0", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(pr.profit_factor as number).toBeGreaterThan(1.0);
  });

  it("G11-F03: win rate is between 0 and 1", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(pr.win_rate as number).toBeGreaterThan(0);
    expect(pr.win_rate as number).toBeLessThan(1);
  });

  it("G11-F04: expectancy bootstrap 95% CI is a 2-element array", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    const ci = pr.expectancy_bootstrap_95ci as number[];
    expect(Array.isArray(ci)).toBe(true);
    expect(ci.length).toBe(2);
    expect(ci[0]).toBeLessThan(ci[1]);
  });

  it("G11-F05: block bootstrap 95% CI is a 2-element array", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    const ci = pr.expectancy_block_bootstrap_95ci as number[];
    expect(Array.isArray(ci)).toBe(true);
    expect(ci.length).toBe(2);
    expect(ci[0]).toBeLessThan(ci[1]);
  });

  it("G11-F06: permutation p-value is between 0 and 1", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(pr.permutation_p_value_two_tailed as number).toBeGreaterThanOrEqual(0);
    expect(pr.permutation_p_value_two_tailed as number).toBeLessThanOrEqual(1);
  });

  it("G11-F07: max drawdown is positive", () => {
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(pr.max_drawdown_usd as number).toBeGreaterThan(0);
  });
});

describe("Suite G: Directional & Subgroup Analysis", () => {
  it("G11-G01: both bullish and bearish subgroups are present", () => {
    const da = loadJson("PV_EXP_002_DIRECTIONAL_ANALYSIS.json");
    expect(da.bullish).toBeDefined();
    expect(da.bearish).toBeDefined();
  });

  it("G11-G02: bullish + bearish counts sum to filled_events", () => {
    const da = loadJson("PV_EXP_002_DIRECTIONAL_ANALYSIS.json");
    const b = da.bullish as Record<string, number>;
    const r = da.bearish as Record<string, number>;
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(b.count + r.count).toBe(pr.filled_events as number);
  });

  it("G11-G03: subgroup analysis has session breakdown", () => {
    const sa = loadJson("PV_EXP_002_SUBGROUP_ANALYSIS.json");
    const subgroups = sa.subgroups as Record<string, unknown>;
    expect(subgroups["ETH_OVERNIGHT"]).toBeDefined();
    expect(subgroups["RTH"]).toBeDefined();
    expect(subgroups["ETH_EVENING"]).toBeDefined();
  });

  it("G11-G04: session counts sum to filled_events", () => {
    const sa = loadJson("PV_EXP_002_SUBGROUP_ANALYSIS.json");
    const subgroups = sa.subgroups as Record<string, Record<string, number>>;
    const sessionKeys = ["ETH_OVERNIGHT", "RTH", "ETH_EVENING"];
    const total = sessionKeys.reduce((a, k) => a + (subgroups[k]?.count ?? 0), 0);
    const pr = loadJson("PV_EXP_002_PRIMARY_RESULTS.json");
    expect(total).toBe(pr.filled_events as number);
  });
});

describe("Suite H: Walk-Forward Validity", () => {
  it("G11-H01: walk-forward has at least 20 windows", () => {
    const wf = loadJson("PV_EXP_002_WALK_FORWARD.json");
    expect(wf.total_windows as number).toBeGreaterThanOrEqual(20);
  });

  it("G11-H02: walk-forward windows each have positive event count", () => {
    const wf = loadJson("PV_EXP_002_WALK_FORWARD.json");
    const windows = wf.windows as Record<string, unknown>[];
    // Walk-forward uses overlapping windows (step_size < window_size), so sum of
    // per-window counts exceeds filled_events. Verify each window has count > 0.
    for (const w of windows) {
      expect(w.count as number).toBeGreaterThan(0);
    }
    // Also verify positive_windows <= total_windows
    expect(wf.positive_windows as number).toBeLessThanOrEqual(wf.total_windows as number);
  });

  it("G11-H03: positive_windows count is reported", () => {
    const wf = loadJson("PV_EXP_002_WALK_FORWARD.json");
    expect(typeof wf.positive_windows).toBe("number");
  });
});

describe("Suite I: Robustness Matrix", () => {
  it("G11-I01: matrix has exactly 420 configurations", () => {
    const rm = loadJson("PV_EXP_002_ROBUSTNESS_MATRIX.json");
    expect(rm.matrix_size).toBe(420);
  });

  it("G11-I02: zero accounting invariant failures in matrix", () => {
    const rm = loadJson("PV_EXP_002_ROBUSTNESS_MATRIX.json");
    expect(rm.accounting_invariant_fails).toBe(0);
  });

  it("G11-I03: profitable_configs is non-negative", () => {
    const rm = loadJson("PV_EXP_002_ROBUSTNESS_MATRIX.json");
    expect(rm.profitable_configs as number).toBeGreaterThanOrEqual(0);
  });
});

describe("Suite J: Cost Sensitivity", () => {
  it("G11-J01: cost sensitivity covers slippage 0, 2, and 4 ticks", () => {
    const cs = loadJson("PV_EXP_002_COST_SENSITIVITY.json");
    const results = cs.results as Record<string, unknown>[];
    const ticks = results.map((r) => r.slippage_ticks);
    expect(ticks).toContain(0);
    expect(ticks).toContain(2);
    expect(ticks).toContain(4);
  });

  it("G11-J02: expectancy is positive at 2-tick slippage", () => {
    const cs = loadJson("PV_EXP_002_COST_SENSITIVITY.json");
    const results = cs.results as Record<string, unknown>[];
    const primary = results.find((r) => r.slippage_ticks === 2);
    expect(primary!.mean_expectancy_usd as number).toBeGreaterThan(0);
  });

  it("G11-J03: expectancy is monotonically non-increasing with slippage", () => {
    const cs = loadJson("PV_EXP_002_COST_SENSITIVITY.json");
    const results = (cs.results as Record<string, unknown>[]).sort(
      (a, b) => (a.slippage_ticks as number) - (b.slippage_ticks as number)
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i].mean_expectancy_usd as number).toBeLessThanOrEqual(
        results[i - 1].mean_expectancy_usd as number
      );
    }
  });
});

describe("Suite K: Statistical Validation", () => {
  it("G11-K01: classification is RESEARCH_PASS or RESEARCH_FAIL", () => {
    const sv = loadJson("PV_EXP_002_STATISTICAL_VALIDATION.json");
    expect(["RESEARCH_PASS", "RESEARCH_FAIL"]).toContain(sv.classification);
  });

  it("G11-K02: pass_criteria_met has required keys", () => {
    const sv = loadJson("PV_EXP_002_STATISTICAL_VALIDATION.json");
    const criteria = sv.pass_criteria_met as Record<string, boolean>;
    expect(criteria).toHaveProperty("expectancy_positive");
    expect(criteria).toHaveProperty("profit_factor_gt_1");
    expect(criteria).toHaveProperty("at_least_one_quarter_positive");
  });

  it("G11-K03: expectancy_positive criterion is true", () => {
    const sv = loadJson("PV_EXP_002_STATISTICAL_VALIDATION.json");
    expect((sv.pass_criteria_met as Record<string, boolean>).expectancy_positive).toBe(true);
  });

  it("G11-K04: profit_factor_gt_1 criterion is true", () => {
    const sv = loadJson("PV_EXP_002_STATISTICAL_VALIDATION.json");
    expect((sv.pass_criteria_met as Record<string, boolean>).profit_factor_gt_1).toBe(true);
  });
});

describe("Suite L: Reproducibility", () => {
  it("G11-L01: reproducibility record exists with experiment_id PV-EXP-002", () => {
    const rr = loadJson("PV_EXP_002_REPRODUCIBILITY_RECORD.json");
    expect(rr.experiment_id).toBe("PV-EXP-002");
  });

  it("G11-L02: reproducibility check passed", () => {
    const rr = loadJson("PV_EXP_002_REPRODUCIBILITY_RECORD.json");
    expect(rr.reproducibility_check).toBe("PASS");
  });

  it("G11-L03: content hashes A and B are identical", () => {
    const rr = loadJson("PV_EXP_002_REPRODUCIBILITY_RECORD.json");
    expect(rr.content_hash_a).toBe(rr.content_hash_b);
  });

  it("G11-L04: content hash is 64 hex characters", () => {
    const rr = loadJson("PV_EXP_002_REPRODUCIBILITY_RECORD.json");
    expect((rr.content_hash_a as string).length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(rr.content_hash_a as string)).toBe(true);
  });
});

describe("Suite M: Authority Boundary", () => {
  it("G11-M01: outcome engine has no traderspost dispatch calls", () => {
    const enginePath = path.join(EXP_DIR, "pv_exp_002_outcome_engine.py");
    const content = fs.readFileSync(enginePath, "utf-8");
    expect(/traderspost\.io|dispatch_to_traderspost|TRADERSPOST_WEBHOOK/.test(content)).toBe(false);
  });

  it("G11-M02: outcome engine has no tradovate order submission", () => {
    const enginePath = path.join(EXP_DIR, "pv_exp_002_outcome_engine.py");
    const content = fs.readFileSync(enginePath, "utf-8");
    expect(/tradovate.*order|place_order.*tradovate/i.test(content)).toBe(false);
  });

  it("G11-M04: no live trades initiated in sprint diff", () => {
    // G11-M04: Check that no NEW source files added in this sprint contain live trade calls.
    // Updated per G16-REGRESSION-CLEANUP: scan files changed since the G11 base commit.
    // tpRouter.ts and tp.test.ts are pre-existing paper-trading stubs (not live execution).
    // The test files and test-env-guard.ts are test infrastructure, not execution code.
    const KNOWN_SAFE_FILES = [
      'server/tpRouter.ts',           // paper-trading stub, no live execution
      'server/tp.test.ts',            // test file
      'server/test-env-guard.ts',     // test infrastructure
      'server/sprint-123a10-test-env-isolation.test.ts', // test file
      'server/sprint-123a11-gate-g11.test.ts',           // this file
    ];
    const trackedFiles = execSync(
      "git ls-files -- '*.ts' '*.py'",
      { cwd: process.cwd() }
    ).toString().trim().split("\n").filter(Boolean);
    let liveCallsFound = 0;
    for (const file of trackedFiles) {
      if (KNOWN_SAFE_FILES.some(safe => file.endsWith(safe.replace('server/', '')))) continue;
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf-8");
      if (/traderspost\.io|place_order|submit_order/i.test(content)) liveCallsFound++;
    }
    expect(liveCallsFound).toBe(0);
  });
});

describe("Suite N: Artefact Presence", () => {
  const REQUIRED = [
    "PV_EXP_002_EXPERIMENT_CONTRACT.md",
    "PV_EXP_002_CONFIGURATION.json",
    "PV_EXP_002_OUTCOME_LEDGER.json",
    "PV_EXP_002_PRIMARY_RESULTS.json",
    "PV_EXP_002_MAE_MFE_ANALYSIS.json",
    "PV_EXP_002_TEMPORAL_AUDIT.json",
    "PV_EXP_002_DIRECTIONAL_ANALYSIS.json",
    "PV_EXP_002_SUBGROUP_ANALYSIS.json",
    "PV_EXP_002_WALK_FORWARD.json",
    "PV_EXP_002_ROBUSTNESS_MATRIX.json",
    "PV_EXP_002_COST_SENSITIVITY.json",
    "PV_EXP_002_STATISTICAL_VALIDATION.json",
    "PV_EXP_002_REPRODUCIBILITY_RECORD.json",
    "pv_exp_002_outcome_engine.py",
    "pv_exp_002_full_analysis.py",
    "pv_exp_002_reproducibility_check.py",
  ];

  for (const artefact of REQUIRED) {
    it(`G11-N: ${artefact} exists`, () => {
      expect(fs.existsSync(path.join(EXP_DIR, artefact))).toBe(true);
    });
  }
});

describe("Suite O: Locked Artefact SHA Spot-Checks", () => {
  it("G11-O01: outcome ledger SHA starts with 741e153e", () => {
    expect(sha256File(path.join(EXP_DIR, "PV_EXP_002_OUTCOME_LEDGER.json")).startsWith("741e153e")).toBe(true);
  });

  it("G11-O02: primary results SHA starts with 54f4967c", () => {
    expect(sha256File(path.join(EXP_DIR, "PV_EXP_002_PRIMARY_RESULTS.json")).startsWith("54f4967c")).toBe(true);
  });

  it("G11-O03: MAE/MFE analysis SHA starts with a129563e", () => {
    expect(sha256File(path.join(EXP_DIR, "PV_EXP_002_MAE_MFE_ANALYSIS.json")).startsWith("a129563e")).toBe(true);
  });

  it("G11-O04: reproducibility record SHA starts with d5990bc8", () => {
    expect(sha256File(path.join(EXP_DIR, "PV_EXP_002_REPRODUCIBILITY_RECORD.json")).startsWith("d5990bc8")).toBe(true);
  });
});
