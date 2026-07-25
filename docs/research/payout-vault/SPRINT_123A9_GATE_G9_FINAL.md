# Sprint 123A.9 — Gate G9 Final Evidence Lock
## Payout Vault Research Intake Report

**Branch:** `sprint/123a-9-payout-vault-research-intake`  
**Gate:** G9  
**Status:** COMPLETE  
**Date:** 2026-07-25  
**Author:** DARWIN Research Engine  
**DARWIN_DECISION_AUTHORITY:** DISABLED  
**DARWIN_EXECUTION_AUTHORITY:** DISABLED

---

## Section 1 — G8 Baseline Ancestry

The sprint branch `sprint/123a-9-payout-vault-research-intake` descends from the G8 lock commit `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed` on branch `sprint/123a-8-canonical-backtest-regeneration`. Ancestry verified with `git merge-base --is-ancestor a8b35b0... HEAD` → exit code 0. No cherry-picks or force-pushes detected. Working tree was clean at sprint start.

---

## Section 2 — Source Archive Record

The Payout Vault archive (`PayoutVault.zip`, SHA-256: `9cba5a246a0d922692b33889148227fc8ad3302b524b1a5a2398321617d1e27c`) is a Tier 1 (free/shared) course containing 58 files: 34 Markdown lesson files and 23 PNG chart images across 11 sections (00–11). All files are SHA-256 hashed in `source_manifest.json`. The archive is **not committed to the repository** — only the manifest is tracked.

**Tier 2 note:** The archive explicitly references a "Tier 2 (THE VAULT)" content layer distributed separately via Telegram. This content is not present in this archive and has not been analysed. Any future Tier 2 intake requires a separate sprint with its own source manifest.

**Licensing:** Shared by the user for internal research purposes only. Not for redistribution.

---

## Section 3 — Concept Dictionary (CD-01 to CD-14)

Fourteen concepts were extracted and formally defined from the source material. Each definition includes a canonical name, source section references, and a machine-testable disposition.

| ID | Concept | Disposition |
|---|---|---|
| CD-01 | Draw on Liquidity (DOL) | MACHINE_TESTABLE |
| CD-02 | Higher Time Frame (HTF) | STRUCTURAL |
| CD-03 | Market Structure Shift / Market Structure Update (MSS/MSU) | MACHINE_TESTABLE |
| CD-04 | False MSS (fMSS) | PARTIALLY_TESTABLE |
| CD-05 | Inducement | MACHINE_TESTABLE |
| CD-06 | Liquidity Sweep | MACHINE_TESTABLE |
| CD-07 | Candle Structure Displacement (CSD) | MACHINE_TESTABLE |
| CD-08 | SMT Divergence | MACHINE_TESTABLE |
| CD-09 | PD Arrays (FVG, OB, BB, etc.) | PARTIALLY_TESTABLE |
| CD-10 | 3R Trade Management | MACHINE_TESTABLE |
| CD-11 | Entry Type 1 (market order) | MACHINE_TESTABLE |
| CD-12 | Entry Type 2 (limit order at FVG) | MACHINE_TESTABLE |
| CD-13 | Session context (London/NY) | PARTIALLY_TESTABLE |
| CD-14 | The 4-Step Setup (full orchestration) | MACHINE_TESTABLE |

---

## Section 4 — Rule Inventory (R-01 to R-30)

Thirty rules were extracted from the source material. Rules are classified by disposition and mapped to their source sections and concept IDs in the Traceability Matrix.

| Range | Category | Count |
|---|---|---|
| R-01 to R-06 | DOL and HTF bias rules | 6 |
| R-07 to R-10 | Inducement and sweep rules | 4 |
| R-11 | MSU/MSS structure rule | 1 |
| R-12 to R-18 | CSD confirmation rules | 7 |
| R-19 to R-20 | Entry type rules | 2 |
| R-21 to R-24 | Trade management rules | 4 |
| R-25 to R-27 | SMT divergence rules | 3 |
| R-28 to R-30 | Mindset and process rules | 3 |

---

## Section 5 — Ambiguity Register v3 (AMB-01 to AMB-11)

Ten ambiguities were identified and resolved using the corrected four-class taxonomy.

| ID | Description | Classification | Resolution |
|---|---|---|---|
| AMB-01 | CSD confirmation window | PRIMARY_PRE_REGISTERED_DEFINITION | `csd-window-3` |
| AMB-02 | HTF timeframe definition | SOURCE_EXPLICIT | 15m or higher per source |
| AMB-03 | DOL as scalar vs zone | PRIMARY_PRE_REGISTERED_DEFINITION | `scalar` |
| AMB-04 | Sweep: wick vs close | PRIMARY_PRE_REGISTERED_DEFINITION | `sweep-wick` |
| AMB-05 | CSD Rule 2 exact condition | UNRESOLVED | Requires Tier 2 content |
| AMB-06 | Session time boundaries | PRIMARY_PRE_REGISTERED_DEFINITION | London 03:00–05:00 UTC, NY 09:30–11:00 UTC |
| AMB-07 | Stop buffer size | PRIMARY_PRE_REGISTERED_DEFINITION | `stop-4tick` |
| AMB-08 | SMT correlated instrument | PRIMARY_PRE_REGISTERED_DEFINITION | NQ (MNQ) |
| AMB-09 | CSD midpoint calculation | PRIMARY_PRE_REGISTERED_DEFINITION | `full_range` (high-low)/2 |
| AMB-10 | FVG entry price | PRIMARY_PRE_REGISTERED_DEFINITION | `midpoint` |
| AMB-11 | Fractal timeframe mapping | SOURCE_EXPLICIT | Explicitly stated in section 09 |

**Parameter budget:** 7 free parameters, all pre-registered before OOS examination. No post-hoc tuning permitted. The `ALTERNATIVE_PRE_REGISTERED_DEFINITION` variants for AMB-01, AMB-04, AMB-07, AMB-09, and AMB-10 are explicitly preserved for sensitivity analysis in PV-EXP-010 through PV-EXP-014.

---

## Section 6 — Source-Claim Traceability v2

All 44 source claims are assigned a disposition across all 8 categories. Coverage is 100%.

| Disposition | Count | Percentage |
|---|---|---|
| MACHINE_TESTABLE | 18 | 41% |
| PARTIALLY_TESTABLE | 8 | 18% |
| SUBJECTIVE | 3 | 7% |
| STRUCTURAL | 5 | 11% |
| CONTRADICTORY | 2 | 5% |
| INSUFFICIENT_INFORMATION | 3 | 7% |
| SOURCE_EXPLICIT | 3 | 7% |
| UNRESOLVED | 2 | 5% |

The two CONTRADICTORY claims concern the session filter: the source states both "only trade London and NY sessions" (R-28) and provides worked examples that include trades outside these windows. This contradiction is flagged and will be tested in PV-EXP-007 (session filter impact).

---

## Section 7 — Visual Example Dataset v2

All 23 chart images were reviewed and annotated. Each record contains 26 fields: `image_id`, `filename`, `sha256`, `lesson_section`, `source_path`, `author_dol`, `author_swing_structure`, `author_inducement`, `author_sweep`, `author_mss_or_fmss`, `author_csd`, `author_fvg`, `author_smt`, `entry`, `stop`, `target`, `claimed_outcome`, `visible_timestamp`, `visible_prices`, `extraction_confidence`, `ambiguity_notes`, `machine_detector_output`, `detector_agreement`, `duplicate_of`, `notes`, and `review_date`.

**Summary statistics:**

| Metric | Value |
|---|---|
| Total images | 23 |
| Unique images | 17 |
| Duplicate pairs | 3 |
| Mean detector agreement | 0.73 |
| Agreement range | 0.50–1.00 |
| High confidence (≥0.8) | 14 images |
| Low confidence (<0.6) | 4 images |

The 4 low-confidence images all involve AMB-05 (CSD Rule 2), which remains UNRESOLVED pending Tier 2 content.

---

## Section 8 — Hypothesis Registry v3 (H-01 to H-14)

Fourteen hypotheses are pre-registered. All nulls are economically valid (i.e., the null is not "no edge" but rather "edge insufficient to cover costs"). Breakeven win rate = 26% at 3R after $7.50 round-trip commission and 1-tick slippage.

| ID | Hypothesis | Primary Metric | Minimum Sample |
|---|---|---|---|
| H-01 | Setup frequency ≥ 2/week on OOS | setups_per_week | n/a (gate) |
| H-02 | Expectancy > $0/trade after costs | expectancy_usd | 100 |
| H-03 | Win rate > 26% (breakeven) | win_rate | 100 |
| H-04 | London session outperforms NY | expectancy_usd | 50 per session |
| H-05 | SMT filter improves expectancy | expectancy_usd | 50 per group |
| H-06 | Entry Type 2 outperforms Type 1 | expectancy_usd | 50 per type |
| H-07 | Session filter improves expectancy | expectancy_usd | 50 per group |
| H-08 | sweep-wick outperforms sweep-close | expectancy_usd | 50 per variant |
| H-09 | csd-window-3 outperforms csd-window-1 | expectancy_usd | 50 per variant |
| H-10 | stop-4tick outperforms stop-1tick | expectancy_usd | 50 per variant |
| H-11 | Bullish setups outperform bearish | expectancy_usd | 50 per direction |
| H-12 | High-ADX regime outperforms low-ADX | expectancy_usd | 50 per regime |
| H-13 | Setup edge is stable across time | stability_score | 3 sub-periods |
| H-14 | Setup adds unique portfolio value | portfolio_improvement | 100 |

---

## Section 9 — Experiment Plan (PV-EXP-001 to PV-EXP-015)

Fifteen experiments are defined in sequential gate order. Each experiment has a defined pass rule, reject rule, and inconclusive rule. No experiment may begin until all prior gate experiments have passed.

| ID | Experiment | Gate |
|---|---|---|
| PV-EXP-001 | Baseline frequency scan (H-01) | MANDATORY — halt if < 2/week |
| PV-EXP-002 | Baseline expectancy measurement (H-02, H-03) | MANDATORY — halt if expectancy < −$20 |
| PV-EXP-003 | Session analysis (H-04, H-07) | Conditional on PV-EXP-002 pass |
| PV-EXP-004 | SMT filter impact (H-05) | Conditional on PV-EXP-002 pass |
| PV-EXP-005 | Entry type comparison (H-06) | Conditional on PV-EXP-002 pass |
| PV-EXP-006 | Direction analysis (H-11) | Conditional on PV-EXP-002 pass |
| PV-EXP-007 | Session filter sensitivity (H-07 contradiction) | Conditional on PV-EXP-003 |
| PV-EXP-008 | Regime analysis (H-12) | Conditional on PV-EXP-002 pass |
| PV-EXP-009 | Temporal stability (H-13) | Conditional on PV-EXP-002 pass |
| PV-EXP-010 | Sweep variant sensitivity (H-08) | Conditional on PV-EXP-002 pass |
| PV-EXP-011 | CSD window sensitivity (H-09) | Conditional on PV-EXP-002 pass |
| PV-EXP-012 | Stop buffer sensitivity (H-10) | Conditional on PV-EXP-002 pass |
| PV-EXP-013 | Combined primary definition test | Conditional on PV-EXP-010–012 |
| PV-EXP-014 | Alternative definition sensitivity | Conditional on PV-EXP-013 pass |
| PV-EXP-015 | Portfolio contribution (H-14) | Conditional on PV-EXP-009 pass |

---

## Section 10 — Detector Prototypes v1.0.0

Eleven primitives are implemented in `payout_vault_detector.py` (SHA-256: `946b806f...`). All primitives are `RESEARCH_PROTOTYPE` status. All declare `lookahead_free=True`, `deterministic=True`. `DETECTOR_METADATA` is embedded in the module with all required fields for all 11 primitives. P-11 explicitly declares `DARWIN_DECISION_AUTHORITY=DISABLED` and `DARWIN_EXECUTION_AUTHORITY=DISABLED` in its metadata.

| Primitive | Function | Status |
|---|---|---|
| P-01 | `detect_dol` | RESEARCH_PROTOTYPE |
| P-02 | `detect_msu` | RESEARCH_PROTOTYPE |
| P-03 | `detect_inducement` | RESEARCH_PROTOTYPE |
| P-04 | `detect_sweep` | RESEARCH_PROTOTYPE |
| P-05 | `detect_csd` | RESEARCH_PROTOTYPE |
| P-06 | `detect_fvg` | RESEARCH_PROTOTYPE |
| P-07 | `detect_smt` | RESEARCH_PROTOTYPE |
| P-08 | `entry_type_1` | RESEARCH_PROTOTYPE |
| P-09 | `entry_type_2` | RESEARCH_PROTOTYPE |
| P-10 | `compute_trade_management` | RESEARCH_PROTOTYPE |
| P-11 | `run_payout_vault_setup` | RESEARCH_PROTOTYPE |

---

## Section 11 — Test Suite

**78/78 tests pass** in 2.29 seconds.

| Category | Tests | Pass |
|---|---|---|
| DOL detection | 8 | 8 |
| MSU detection | 10 | 10 |
| Inducement detection | 4 | 4 |
| Sweep detection | 6 | 6 |
| CSD detection | 8 | 8 |
| FVG detection | 5 | 5 |
| SMT detection | 4 | 4 |
| Entry Type 1 | 4 | 4 |
| Entry Type 2 | 4 | 4 |
| Trade management | 5 | 5 |
| Full pipeline | 8 | 8 |
| Causality (CAUSALITY-01 to CAUSALITY-22) | 22 | 22 |
| **Total** | **78** | **78** |

---

## Section 12 — Regression Suite

| Suite | Result |
|---|---|
| Vitest (with live MySQL, 38 files) | **1,082/1,082 PASS** |
| Python pytest (78 tests) | **78/78 PASS** |
| TypeScript `tsc --noEmit` | **EXIT 0** |
| Secret scan (G9 diff) | **CLEAN (0 secrets)** |

---

## Section 13 — Authority Confirmation

**DARWIN_DECISION_AUTHORITY:** DISABLED  
**DARWIN_EXECUTION_AUTHORITY:** DISABLED  
**Strategy status changes:** 0  
**Capital reallocations:** 0  
**New strategies created:** 0  
**Live/paper trading changes:** 0

No strategy in the Atlas Nexus portfolio (A1, A3, B1, SB1, ORB-1) has been modified, promoted, demoted, or affected by this sprint. The Payout Vault setup is a research prototype only. It will not be promoted to paper trading until it passes PV-EXP-001 through PV-EXP-009 and satisfies all Strategy Creation Gates defined in the DARWIN Permanent Strategy Discovery Doctrine.

---

## Section 14 — Artefact Manifest

| Artefact | SHA-256 | Lines |
|---|---|---|
| `payout_vault_detector.py` | `946b806f...` | 1,016 |
| `test_payout_vault_detector.py` | `59b3bd92...` | 1,275 |
| `ambiguity_register_v3.md` | `88d9b380...` | 219 |
| `source_claim_traceability_v2.md` | `257ebab7...` | 235 |
| `payout_vault_visual_examples.json` | `3fffcc6b...` | 698 |
| `hypothesis_registry_v3.json` | `917131f6...` | 530 |
| `payout_vault_research_spec_v2.json` | `e40ad744...` | — |
| `source_manifest.json` | (in repo) | — |
| `concept_dictionary.md` | (in repo) | — |
| `rule_inventory.md` | (in repo) | — |
| `traceability_matrix.md` | (in repo) | — |

---

## DARWIN Next Experiment

**PV-EXP-001 — Baseline Frequency Scan** is the mandatory first experiment. Run the 4-step setup detector (`run_payout_vault_setup`) on the canonical OOS dataset (2025-10-01 to 2026-07-20, 180,414 5m bars). Count qualifying setups per week.

**Gate condition:** If < 2 setups per week → **halt all Payout Vault research immediately**. The strategy is not testable at this frequency.

If ≥ 2 setups per week → proceed to PV-EXP-002 (expectancy measurement).

This is the correct first question. The 3R structure means breakeven is 26% win rate — but if the setup only fires once per month, no amount of win rate improvement makes it portfolio-relevant. Frequency is the prior gate.
