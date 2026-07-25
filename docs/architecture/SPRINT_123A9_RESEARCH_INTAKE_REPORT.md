# Sprint 123A.9 — Payout Vault Research Intake Report

**Sprint:** 123A.9 | **Gate:** G9 | **Branch:** sprint/123a-9-payout-vault-research-intake
**Status:** COMPLETE | **Date:** 2026-07-25
**Authority:** DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED

## 1. Executive Summary

Sprint 123A.9 formalises the Payout Vault trading methodology into a machine-readable research specification for DARWIN's quantitative validation pipeline. The source material describes a price-action methodology built on Smart Money Concepts: Draw on Liquidity (DOL), Market Structure Units (MSU), Inducement, Candle Structure Delivery (CSD), Fair Value Gaps (FVG), and SMT Divergence. The sprint produces a Concept Dictionary (14 concepts), Rule Inventory (30 rules), Ambiguity Register (10 resolutions), Traceability Matrix, machine-readable Research Specification, 11 versioned detector prototypes, and 56 passing unit tests. No strategy status changes, capital reallocations, or execution authority changes are made.

## 2. Source Material

| Item | Value |
|---|---|
| Archive | PayoutVault.zip |
| Archive SHA-256 | 9cba5a246a0d922692b33889148227fc8ad3302b524b1a5a2398321617d1e27c |
| Total files | 58 (34 MD lessons, 23 PNG charts) |
| Sections | 11 (00–11) |
| Tier | Tier 1 (Tier 2 not present) |
| Source manifest | docs/research/payout-vault/source_manifest.json |
| Images reviewed | 23 (17 unique, 3 duplicate pairs) |

## 3. Formalisation Artefacts

### Concept Dictionary (14 concepts)
CD-01 DOL (scalar HTF swing extreme), CD-02 HTF Bias, CD-03 MSU (bullish/bearish/neutral), CD-04 MSS, CD-05 fMSS, CD-06 Inducement (most recent LTF swing in MSU direction), CD-07 CSD (body close beyond 50% or prior body), CD-08 SMT Divergence (optional filter), CD-09 PD Array, CD-09d FVG (3-candle gap), CD-10 3R Fix (fixed 3:1 RR), CD-11 Entry Type 1 (next bar open), CD-12 Entry Type 2 (FVG midpoint limit), CD-14 4-Step Process (sequential gate model).

### Rule Inventory (30 rules)
R-01–R-06: DOL identification. R-07–R-09: Inducement. R-10: Sweep. R-11: MSU. R-12–R-18: CSD (body close only, Rule 1 OR Rule 2 sufficient). R-19–R-20: Entry. R-21–R-24: Trade management (3R Fix). R-25–R-27: SMT. R-28–R-30: Pitfalls (never enter without CSD, never trade against DOL, never enter on sweep candle).

### Ambiguity Register (10 resolutions)
AMB-01 CSD window → primary 3 bars. AMB-02 HTF definition → 15m. AMB-03 DOL scalar vs range → scalar. AMB-04 Sweep wick vs close → wick primary. AMB-05 50% boundary strict vs inclusive → strict (>). AMB-06 MSU lookback → 3 bars. AMB-07 Stop buffer → 4 ticks primary. AMB-08 SMT required vs optional → optional. AMB-09 Fractal timeframe pairs → 15m/5m primary. AMB-10 FVG entry midpoint vs edge → midpoint.

## 4. Research Specification

File: docs/research/payout-vault/payout_vault_research_spec.json (v1.0.0)
- 11 primitives (P-01 through P-11) with full parameter schemas
- 3 pre-registered hypotheses (H-01: positive expectancy, H-02: CSD value-add, H-03: SMT filter value)
- 4 experiment phases (EX-01: frequency scan, EX-02: expectancy, EX-03: CSD test, EX-04: SMT test)
- 10 ambiguity resolution records, 5 null hypotheses

## 5. Detector Prototypes

File: docs/research/payout-vault/payout_vault_detector.py (v1.0.0)
Status: RESEARCH_PROTOTYPE — not for live or paper trading

| Primitive | Function |
|---|---|
| P-01 | detect_dol() — HTF swing-based DOL |
| P-02 | detect_msu() — LTF pivot-based MSU |
| P-03 | detect_inducement() — inducement from MSU swings |
| P-04 | detect_sweep() — wick or close sweep |
| P-05 | detect_csd() — CSD Rule 1 or Rule 2 |
| P-06 | detect_fvg() — Fair Value Gap |
| P-07 | detect_smt() — SMT divergence (optional) |
| P-08 | entry_type_1() — market entry next bar open |
| P-09 | entry_type_2() — limit entry at FVG midpoint |
| P-10 | compute_trade_management() — stop + 3R target |
| P-11 | run_payout_vault_setup() — full orchestrator |

## 6. Test Suite

File: docs/research/payout-vault/test_payout_vault_detector.py
Tests: 56 | Pass: 56 | Fail: 0

Coverage: P-01 through P-11, all AMB resolutions (AMB-01, AMB-04, AMB-05, AMB-07), key rules (R-07, R-08, R-12, R-15, R-19, R-22), authority check (no order/signal/execute attributes).

## 7. Full Regression Suite

| Suite | Tests | Result |
|---|---|---|
| Vitest (TypeScript + live MySQL) | 1,082 | PASS |
| Python pytest (detector) | 56 | PASS |
| TypeScript tsc --noEmit | — | EXIT 0 |
| Secret scan | — | CLEAN (0 hits) |

No regressions introduced.

## 8. DARWIN Research Assessment

The Payout Vault methodology is internally consistent and describes a repeatable 4-step process. Critical unknowns before any strategy hypothesis is formed:

1. **Setup frequency:** How many qualifying 4-step setups occur per week on MNQ 5m OOS data?
2. **Expectancy:** Does the setup achieve >26% win rate (3R breakeven) on OOS data?
3. **CSD value-add:** Does CSD confirmation add expectancy vs sweep-only entry?
4. **SMT filter value:** Does SMT divergence filter losers disproportionately?
5. **Regime dependence:** Is performance stable across trending and ranging regimes?
6. **Portfolio overlap:** Does the setup overlap significantly with A1, B1, or ORB-1?

**DARWIN next experiment (EX-01):** Baseline frequency scan on OOS data (2025-10-01 to 2026-07-20). If frequency < 2/week, halt research. If ≥ 2/week, proceed to EX-02.

## 9. Authority Confirmation

DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED
Strategy status changes: 0 | Capital reallocations: 0 | New strategies created: 0

## 10. Artefact Manifest

| File | Description |
|---|---|
| docs/research/payout-vault/source_manifest.json | SHA-256 of all 58 source files |
| docs/research/payout-vault/concept_dictionary.md | 14 formally defined concepts |
| docs/research/payout-vault/rule_inventory.md | 30 extracted rules |
| docs/research/payout-vault/ambiguity_register.md | 10 ambiguities with resolutions |
| docs/research/payout-vault/traceability_matrix.md | Rule-to-lesson bidirectional map |
| docs/research/payout-vault/payout_vault_research_spec.json | Machine-readable spec v1.0.0 |
| docs/research/payout-vault/payout_vault_detector.py | 11 detector prototypes v1.0.0 |
| docs/research/payout-vault/test_payout_vault_detector.py | 56 unit tests |
| docs/architecture/SPRINT_123A9_RESEARCH_INTAKE_REPORT.md | This document |

---
*Sprint 123A.9 — Gate G9 — Research Intake Complete — 2026-07-25*
