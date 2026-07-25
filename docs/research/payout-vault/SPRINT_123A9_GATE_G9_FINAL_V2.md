# Sprint 123A.9 — Gate G9 Final Evidence Report (v2)

**Sprint:** 123A.9 — Payout Vault Research Intake  
**Gate:** G9  
**Report Version:** 2.0 (final correction)  
**Date:** 2026-07-25  
**Branch:** `sprint/123a-9-payout-vault-research-intake`  
**G8 Baseline SHA:** `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed`  
**DARWIN_DECISION_AUTHORITY:** DISABLED  
**DARWIN_EXECUTION_AUTHORITY:** DISABLED

---

## Section 1 — G8 Baseline Ancestry

`git merge-base --is-ancestor a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed HEAD` → **exit code 0** ✓

The sprint branch descends directly from the G8 lock commit. No rebase, no cherry-pick, no history rewrite.

---

## Section 2 — Source Archive

| Field | Value |
|---|---|
| Archive filename | `PayoutVault.zip` |
| Archive SHA-256 | `9cba5a246a0d922692b33889148227fc8ad3302b524b1a5a2398321617d1e27c` |
| Total files | 58 |
| Lesson files (MD) | 34 |
| Chart images (PNG) | 23 |
| Other | 1 (.DS_Store, excluded from research) |
| Tier coverage | Tier 1 only. Tier 2 ("THE VAULT") not present. |
| Licensing | Educational use for internal research only. Not redistributed. |
| Source manifest | `source_manifest.json` — 100% SHA-256 coverage |

---

## Section 3 — Concept Dictionary

14 formally defined concepts (CD-01 to CD-14):

| ID | Concept | Disposition |
|---|---|---|
| CD-01 | Draw on Liquidity (DOL) | MACHINE_TESTABLE |
| CD-02 | HTF Bias | PARTIALLY_TESTABLE |
| CD-03 | LTF Entry | MACHINE_TESTABLE |
| CD-04 | Market Structure Shift (MSS) | MACHINE_TESTABLE |
| CD-05 | Fractal MSS (fMSS) | MACHINE_TESTABLE |
| CD-06 | Market Structure Update (MSU) | MACHINE_TESTABLE |
| CD-07 | Inducement | MACHINE_TESTABLE |
| CD-08 | Consequent Encroachment (CSD midpoint) | PARTIALLY_TESTABLE |
| CD-09 | Liquidity Sweep | MACHINE_TESTABLE |
| CD-10 | Candle Structure Displacement (CSD) | MACHINE_TESTABLE |
| CD-11 | Fair Value Gap (FVG) | MACHINE_TESTABLE |
| CD-12 | SMT Divergence | PARTIALLY_TESTABLE |
| CD-13 | PD Arrays | STRUCTURAL |
| CD-14 | 3R Fix (trade management) | MACHINE_TESTABLE |

---

## Section 4 — Rule Inventory

30 rules extracted (R-01 to R-30). All rules have source traceability to lesson section and page. Key rules:

- **R-01:** DOL is always an external liquidity level (prior swing high/low or equal highs/lows)
- **R-09:** Inducement must be taken before a valid CSD
- **R-14:** CSD must occur within N bars of the sweep (AMB-09: N pre-registered as 3)
- **R-20:** FVG entry is at the open of the bar immediately following the CSD candle
- **R-25:** Stop is placed below/above the sweep wick + buffer (AMB-04: buffer pre-registered as 4 ticks)
- **R-26:** Target is exactly 3R from entry (3R Fix)

---

## Section 5 — Ambiguity Register v3

**10 ambiguities (AMB-01 to AMB-10).** All totals reconcile.

| Classification | Count |
|---|---|
| SOURCE_EXPLICIT | 2 |
| PRIMARY_PRE_REGISTERED_DEFINITION | 7 |
| UNRESOLVED (requires Tier 2) | 1 (AMB-05) |
| NON_TESTABLE | 0 |

**Parameter budget:** 7 free parameters, all pre-registered before OOS examination. No post-hoc tuning permitted.

| Parameter | Pre-Registered Value | AMB Reference |
|---|---|---|
| swing_lookback | 2 bars | AMB-01 |
| sweep_variant | wick | AMB-02 |
| csd_window | 3 bars | AMB-09 |
| stop_buffer | 4 ticks | AMB-04 |
| fvg_entry_point | midpoint | AMB-08 |
| smt_instrument | NQ | AMB-07 |
| inducement_definition | any prior swing | AMB-06 |

**Correction from v2:** Internal reference "AMB-13" in parameter budget section corrected to "AMB-09". Total count header corrected from "AMB-01 through AMB-11" to "AMB-01 through AMB-10".

---

## Section 6 — Source-Claim Traceability v2

**44 claims, 100% coverage.** All 8 dispositions used.

| Disposition | Count |
|---|---|
| MACHINE_TESTABLE | 18 |
| PARTIALLY_TESTABLE | 8 |
| SUBJECTIVE | 3 |
| STRUCTURAL | 5 |
| DEFINITIONAL | 4 |
| CONTRADICTORY | 2 |
| INSUFFICIENT_INFORMATION | 3 |
| NON_TESTABLE | 1 |

**Contradictory claims (2):** The course states in lesson 03 that "inducement must be taken before CSD" but lesson 07 shows a worked example where CSD occurs without prior inducement. Both instances are documented. The pre-registered rule (R-09) follows the explicit lesson 03 statement.

---

## Section 7 — Visual Example Dataset v3

**23 images, 26 fields per record, TP/FP/FN/NOT_MEASURABLE per image.**

| Metric | Value |
|---|---|
| Total images | 23 |
| Unique images | 17 |
| Duplicate images | 6 (3 pairs) |
| Aggregate TP | 32 |
| Aggregate FP | 0 |
| Images with full agreement | 5 |
| Images with partial agreement | 6 |
| Images not measurable | 13 |
| Precision | NOT_MEASURABLE — single annotator, no independent ground truth |
| Recall | NOT_MEASURABLE — single annotator, no independent ground truth |

**NOT_MEASURABLE conditions:** (1) duplicate image, (2) schematic/diagram without OHLCV data, (3) correlated instrument data required but not available in MNQ-only dataset, (4) single-annotator limitation.

**Correction from v2:** Previous report stated "mean agreement rate: 0.73" — this was incorrect. No aggregate agreement rate is computable. Corrected to TP/FP/FN breakdown with explicit NOT_MEASURABLE policy.

---

## Section 8 — Hypothesis Registry v4

**18 hypotheses (PV-H01 to PV-H18), all 14 required fields.**

Primary null hypothesis: `NET_EXPECTANCY_AFTER_COSTS <= 0`  
Breakeven win rate: **26.0%** at 3R after $7.50 round-trip cost  
Commission: $3.75/side | Slippage: $0.00 (limit orders assumed)

Required component hypotheses:

| ID | Hypothesis | Primary Null |
|---|---|---|
| PV-H01 | Liquidity sweep reversal vs matched non-sweep baseline | Sweep reversal rate ≤ non-sweep baseline |
| PV-H02 | MSS within CSD window vs random MSS | CSD-window MSS rate ≤ random MSS rate |
| PV-H03 | Inducement precedes sweep in valid setups | Inducement-sweep sequence rate ≤ 50% |
| PV-H04 | FVG fill rate after CSD | FVG fill rate ≤ 50% |
| PV-H05 | SMT divergence improves sweep quality | SMT-confirmed sweep win rate ≤ non-SMT sweep win rate |
| PV-H06 | DOL alignment improves setup quality | DOL-aligned setup win rate ≤ non-DOL-aligned win rate |
| PV-H07 | Session timing affects setup quality | Session-stratified win rates are equal |
| PV-H08 | CSD window parameter sensitivity | Win rate is not monotone in CSD window |
| PV-H09 | Stop buffer parameter sensitivity | Win rate is not monotone in stop buffer |
| PV-H10 | 3R target achievability | 3R target hit rate ≤ 26% (breakeven) |
| PV-H11 | Regime dependence (ADX) | Win rate is equal across ADX regimes |
| PV-H12 | Regime dependence (VWAP location) | Win rate is equal across VWAP location states |
| PV-H13 | Walk-forward stability | OOS win rate ≤ IS win rate − 5pp |
| PV-H14 | Net expectancy after costs | NET_EXPECTANCY_AFTER_COSTS ≤ 0 (primary null) |
| PV-H15 | Frequency sufficiency | Setup frequency < 2/week (LOW_FREQUENCY) |
| PV-H16 | Drawdown profile | Max drawdown > 20% of starting capital |
| PV-H17 | Correlated instrument availability | SMT instrument data not available for OOS period |
| PV-H18 | Overfitting risk | Parameter sensitivity range > 10pp win rate |

**Frequency gate policy (corrected):** If setup frequency < 2/week → classify as `LOW_FREQUENCY`, note in report, continue to PV-EXP-002 with reduced statistical power. **Halt only if total events < 30** (insufficient for any statistical inference).

---

## Section 9 — Experiment Plan (17 Experiments)

Experiments in component-first order:

| ID | Name | Gate Condition |
|---|---|---|
| PV-EXP-001 | Baseline Frequency Scan | ≥ 30 total events to proceed |
| PV-EXP-002 | Sweep Reversal Rate | PV-H01 p < 0.05 to proceed |
| PV-EXP-003 | MSS Within CSD Window | PV-H02 p < 0.05 to proceed |
| PV-EXP-004 | Inducement Sequence Validation | PV-H03 p < 0.05 to proceed |
| PV-EXP-005 | FVG Fill Rate | PV-H04 p < 0.05 to proceed |
| PV-EXP-006 | SMT Divergence Filter | PV-H05 p < 0.10 (exploratory) |
| PV-EXP-007 | DOL Alignment Filter | PV-H06 p < 0.10 (exploratory) |
| PV-EXP-008 | Session Timing Analysis | PV-H07 chi-square p < 0.05 |
| PV-EXP-009 | CSD Window Sensitivity | PV-H08 monotone test |
| PV-EXP-010 | Stop Buffer Sensitivity | PV-H09 monotone test |
| PV-EXP-011 | 3R Target Achievability | PV-H10 binomial test p < 0.05 |
| PV-EXP-012 | ADX Regime Stratification | PV-H11 ANOVA p < 0.05 |
| PV-EXP-013 | VWAP Location Stratification | PV-H12 ANOVA p < 0.05 |
| PV-EXP-014 | Walk-Forward Validation | PV-H13 5-fold WF |
| PV-EXP-015 | Net Expectancy Measurement | PV-H14 t-test p < 0.05 |
| PV-EXP-016 | Portfolio Contribution Analysis | Unique alpha vs existing models |
| PV-EXP-017 | Full OOS Backtest | All gates passed |

---

## Section 10 — Detector Prototypes v1.0.0

11 primitives (P-01 to P-11). `DETECTOR_METADATA` embedded in module. All primitives declare:
- `lookahead_free: true`
- `deterministic: true`
- `status: RESEARCH_PROTOTYPE`
- `darwin_decision_authority: DISABLED`
- `darwin_execution_authority: DISABLED`

---

## Section 11 — Test Suite

| Suite | Count | Result |
|---|---|---|
| Python research (pv_docs) | 78 | **78/78 PASS** |
| Vitest (G1–G9, with live MySQL) | 1082 | **1082/1082 PASS** |
| TypeScript `tsc --noEmit` | — | **EXIT 0** |
| Frontend `vite build` | — | **EXIT 0** |
| Secret scan (G9 diff) | — | **CLEAN** |

---

## Section 12 — Artefact Hash Manifest

**ARTEFACT_HASH_COVERAGE: 100% | PLACEHOLDER_SHA256_COUNT: 0**

| ID | Filename | SHA-256 | Size |
|---|---|---|---|
| PV-ART-01 | concept_dictionary.md | `966a3ece...856646ed` | 12,471 B |
| PV-ART-02 | rule_inventory.md | `b46fed52...ec669e7` | 8,426 B |
| PV-ART-03 | ambiguity_register_v3.md | `5e264b00...d0601854` | 10,849 B |
| PV-ART-04 | source_claim_traceability_v2.md | `257ebab7...a75dbafcb` | 16,910 B |
| PV-ART-05 | traceability_matrix.md | `f03d8359...e022045b` | 6,392 B |
| PV-ART-06 | payout_vault_visual_examples.json | `877c3389...bc979205b` | 40,679 B |
| PV-ART-07 | hypothesis_registry_v4.json | `46489b97...25654bc4f` | 35,283 B |
| PV-ART-08 | payout_vault_research_spec_v2.json | `e40ad744...0be0b4fce22` | 12,589 B |
| PV-ART-09 | payout_vault_detector.py | `946b806f...666b717ec` | 36,120 B |
| PV-ART-10 | test_payout_vault_detector.py | `59b3bd92...3645caf5302` | 58,928 B |

---

## Section 13 — Authority Proof

| Field | Value |
|---|---|
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
| Strategy status changes | 0 |
| Capital reallocations | 0 |
| New strategies created | 0 |
| Live/paper trades initiated | 0 |
| Risk parameter changes | 0 |

All detector prototypes explicitly declare `darwin_decision_authority: DISABLED` and `darwin_execution_authority: DISABLED` in `DETECTOR_METADATA`. The orchestrator function `run_payout_vault_setup` returns a `SetupResult` dataclass only — it does not connect to any order management system, database write path, or execution endpoint.

---

## Section 14 — GitHub Verification Record

| Field | Value |
|---|---|
| Branch | `sprint/123a-9-payout-vault-research-intake` |
| G8 ancestor SHA | `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed` |
| Previous G9 commit | `8a5f749c2597f741ca65c49db941fcfe267df0f5` |
| This commit (G9 v2) | TBD — computed after push |
| LOCAL_SHA=REMOTE_SHA | TBD — verified after push |

---

## DARWIN Next Experiment

**PV-EXP-001 — Baseline Frequency Scan** is the mandatory first experiment.

Run `run_payout_vault_setup` on the OOS dataset (2025-10-01 to 2026-07-20). Count qualifying setups.

- **< 30 total events:** HALT all Payout Vault research. Insufficient sample for any statistical inference.
- **30–87 events (< 2/week):** Classify as `LOW_FREQUENCY`. Continue to PV-EXP-002 with reduced statistical power. Note in all subsequent reports.
- **≥ 88 events (≥ 2/week):** Proceed normally to PV-EXP-002.

The breakeven win rate is **26%** at 3R after $7.50 round-trip cost. The first question is not whether the strategy is profitable — it is whether the setup occurs frequently enough to be statistically testable at all.
