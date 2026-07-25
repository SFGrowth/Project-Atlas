# Sprint 123A.9 — Gate G9 Final Evidence Lock (v3)

**Sprint:** 123A.9 — Payout Vault Research Intake  
**Gate:** G9 — Final Evidence Lock  
**Report Version:** v3 (supersedes v2)  
**Date:** 2026-07-25  
**Branch:** `sprint/123a-9-payout-vault-research-intake`  
**G8 Baseline SHA:** `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed`  
**DARWIN_DECISION_AUTHORITY:** DISABLED  
**DARWIN_EXECUTION_AUTHORITY:** DISABLED  

---

## 1. Gate G9 Acceptance Criteria — Final Status

| Criterion | Required | Actual | Status |
|---|---|---|---|
| ARTEFACT_HASH_COVERAGE | 100% | 100% (13/13) | PASS |
| PLACEHOLDER_SHA256_COUNT | 0 | 0 | PASS |
| ABBREVIATED_SHA256_COUNT | 0 | 0 | PASS |
| Python PV detector tests | 78/78 | 78/78 | PASS |
| Python authority boundary tests | 27/27 | 27/27 | PASS |
| TypeScript/Vitest tests | 1082/1082 | 1082/1082 | PASS |
| TypeScript compilation (tsc) | EXIT 0 | EXIT 0 | PASS |
| Frontend build (vite) | EXIT 0 | EXIT 0 | PASS |
| Secret scan | CLEAN | CLEAN | PASS |
| DARWIN_PROCESSBAR_CALLS | 0 | 0 | PASS |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 | 0 | PASS |
| DARWIN_TRADERSPOST_CALLS | 0 | 0 | PASS |
| DARWIN_TRADOVATE_CALLS | 0 | 0 | PASS |
| STRATEGY_STATUS_CHANGES | 0 | 0 | PASS |
| CAPITAL_REALLOCATIONS | 0 | 0 | PASS |
| LIVE_TRADES_INITIATED | 0 | 0 | PASS |
| TBD count in all artefacts | 0 | 0 | PASS |
| LOCAL_SHA = REMOTE_SHA | TRUE | TRUE | PASS |

**All 18 acceptance criteria: PASS**

---

## 2. Source Archive

| Field | Value |
|---|---|
| Archive filename | PayoutVault.zip |
| SHA-256 | `9cba5a246a0d922692b33889148227fc8ad3302b524b1a5a2398321617d1e27c` |
| Extraction path | `/home/ubuntu/atlas-historical/payout-vault-source/` |
| Lessons processed | All lessons (01a–02g confirmed with visual examples) |

---

## 3. Artefact Hash Manifest — All 13 Artefacts (Full 64-Char SHA-256)

All SHA-256 hashes are full 64-character hex strings. Zero placeholders. Zero abbreviations.

| ID | Filename | SHA-256 (64 chars) | Git Blob SHA | Size |
|---|---|---|---|---|
| A-01 | concept_dictionary.md | `966a3eced42435abe2f3a9fe20c6e1ee8bedb169bf8a739d59704857856646ed` | `7b2b7ce6ab8444f992a72fe07fb662c9bb9bb667` | 12,471 B |
| A-02 | rule_inventory.md | `b46fed52b8b3447fef5007f6a14128349c624eac05f335a84acae1e3fec669e7` | `c8404ea2dc209804b910ab09a2ca0531e8eb64e6` | 8,426 B |
| A-03 | ambiguity_register_v3.md | `5e264b0029c0fe5a46cdcfd358aaf74eb778f5c3edbed0ee7a0cc397d0601854` | `4cc48a0aa6ca8e2c3aa7cf5ff6e4b5313ae75d52` | 10,849 B |
| A-04 | source_claim_traceability_v2.md | `257ebab725768cc053c5e8d0f18f294e45f741a8fc35cf191be550da75dbafcb` | `2828b3081a3e456b3ddc1c924d5efdd2c14dabf0` | 16,910 B |
| A-05 | traceability_matrix.md | `f03d835918f5c58eb14e8f821cdc36fef5bf6771d2aff79718129496e022045b` | `a9117df12f63c5a79e868c5f589fecd834fb9e14` | 6,392 B |
| A-06 | payout_vault_visual_examples.json | `877c3389cb2f0772f050a41e5e7150fdeecba3e0e3af842108c5785bc979205b` | `a175a04cef4965be2b9e920a17e0411d715fae60` | 40,679 B |
| A-07 | hypothesis_registry_v4.json | `46489b97d1775fcb48b93b556e49c2c6f40601dfe4cf395599cd6bf25654bc4f` | `80689655a6f5258611ef1ac8210094b9da3bd8d0` | 35,283 B |
| A-08 | payout_vault_research_spec_v2.json | `e40ad744a18cc117976c6fedd58619f90b1d73bd6e9bddd0293ff0be0b4fce22` | `de172590a52abaaf0de02551356fa901c145cef1` | 12,589 B |
| A-09 | payout_vault_detector.py | `946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec` | `b233da449a35dd5debe63682df4e66117ebffaf0` | 36,120 B |
| A-10 | test_payout_vault_detector.py | `59b3bd92876ea2464edbdb009048e418c3f22c32b2f6672168ded3645caf5302` | `df410e8556a4022393685ed6c30406bbfe9d3b8e` | 58,928 B |
| A-11 | test_authority_boundaries.py | `8d38a7dcfb4a4cb237b46b50f19b956c1738c802a07320494dc837a18c80516b` | `d60ef6594c9f593d5a218dfe406cb10b6a3c2058` | 15,702 B |
| A-12 | artefact_hash_manifest.json | `e7df331013f84ab3553cabcf5bab9eff168a84a62c1dcfeee2dd4763e53d82ba` | `ca48ef91189115ea37898fe42c2867599f43d692` | 5,127 B |
| A-13 | SPRINT_123A9_GATE_G9_FINAL_V2.md | `101d4a2adfb7fe921de33622c62007d65a4793fc803a8598faf1dfe02dbbd586` | `3e70f7b8e37a24a2ee5181785501af597bd4f4ba` | 12,088 B |

**Manifest v2 SHA-256:** `c73b4ff62ae2735274f8e35cbca3b42c5c61b1d203347ee99a3b17f91e14798d`

---

## 4. Research Artefact Summary

### 4.1 Concept Dictionary (A-01)
14 formally defined SMC concepts (CD-01 to CD-14):

| ID | Concept | Definition Status |
|---|---|---|
| CD-01 | Higher Time Frame (HTF) | DEFINED |
| CD-02 | Draw on Liquidity (DOL) | DEFINED |
| CD-03 | Liquidity Pool | DEFINED |
| CD-04 | Inducement | DEFINED |
| CD-05 | Sweep | DEFINED |
| CD-06 | Displacement | DEFINED |
| CD-07 | Fair Value Gap (FVG) | DEFINED |
| CD-08 | Order Block (OB) | DEFINED |
| CD-09 | Breaker Block | DEFINED |
| CD-10 | Mitigation Block | DEFINED |
| CD-11 | Premium/Discount Zone | DEFINED |
| CD-12 | Change of Character (ChoCH) | DEFINED |
| CD-13 | Break of Structure (BOS) | DEFINED |
| CD-14 | Market Structure Shift (MSS) | DEFINED |

### 4.2 Rule Inventory (A-02)
30 rules extracted (R-01 to R-30). All rules have source lesson traceability. Key rules:

- **R-01 to R-10:** HTF bias, DOL identification, liquidity pool criteria
- **R-11 to R-20:** Inducement mechanics, sweep confirmation, displacement requirements
- **R-21 to R-30:** Entry execution, stop placement, target rules (R-22: Fixed 1:3 R:R)

### 4.3 Ambiguity Register v3 (A-03)
10 ambiguities (AMB-01 to AMB-10) with corrected taxonomy:

| ID | Ambiguity | Taxonomy | Resolution Path |
|---|---|---|---|
| AMB-01 | HTF timeframe definition | DEFINITIONAL | Experiment PV-EXP-002 |
| AMB-02 | Displacement magnitude threshold | PARAMETRIC | Experiment PV-EXP-003 |
| AMB-03 | FVG minimum gap size | PARAMETRIC | Experiment PV-EXP-004 |
| AMB-04 | Inducement vs. sweep distinction | DEFINITIONAL | Experiment PV-EXP-005 |
| AMB-05 | OB candle body vs. wick | DEFINITIONAL | Experiment PV-EXP-006 |
| AMB-06 | Breaker block formation criteria | DEFINITIONAL | Experiment PV-EXP-007 |
| AMB-07 | Premium/discount zone boundaries | PARAMETRIC | Experiment PV-EXP-008 |
| AMB-08 | ChoCH vs. BOS threshold | DEFINITIONAL | Experiment PV-EXP-009 |
| AMB-09 | Session time boundaries | PARAMETRIC | Experiment PV-EXP-010 |
| AMB-10 | Multi-timeframe confluence requirement | STRUCTURAL | Experiment PV-EXP-011 |

### 4.4 Source Claim Traceability v2 (A-04)
44 claims with 100% disposition coverage across all 8 disposition categories:

| Disposition | Count | % |
|---|---|---|
| CONFIRMED_MEASURABLE | 12 | 27.3% |
| CONFIRMED_QUALITATIVE | 8 | 18.2% |
| TESTABLE_HYPOTHESIS | 9 | 20.5% |
| AMBIGUOUS | 6 | 13.6% |
| CONTRADICTORY | 3 | 6.8% |
| INSUFFICIENT_INFORMATION | 4 | 9.1% |
| IMPLEMENTATION_DETAIL | 1 | 2.3% |
| OUT_OF_SCOPE | 1 | 2.3% |
| **Total** | **44** | **100%** |

### 4.5 Visual Examples (A-06)
23 chart images catalogued with 26 fields per record:

| Outcome | Count |
|---|---|
| TRUE_POSITIVE (TP) | 14 |
| FALSE_POSITIVE (FP) | 4 |
| FALSE_NEGATIVE (FN) | 3 |
| NOT_MEASURABLE | 2 |
| **Total** | **23** |

### 4.6 Hypothesis Registry v4 (A-07)
18 hypotheses (PV-H01 to PV-H18) with 17 experiments (PV-EXP-001 to PV-EXP-017):

- All 14 required fields present in every hypothesis record
- NET_EXPECTANCY: null (pre-experiment — no data yet)
- Mandatory next experiment: **PV-EXP-001** (baseline frequency scan, OOS dataset 2025-10-01 to 2026-07-20)
- Frequency gate policy: LOW_FREQUENCY classification if < 2 setups/week (NOT halt-immediately); halt only if total events < 30

### 4.7 Research Specification v2 (A-08)
Machine-readable research spec v2.0.0:
- 11 primitives (P-01 to P-11)
- All SHA-256 references are real 64-char hashes (zero placeholders)
- Detector status: RESEARCH_PROTOTYPE (not production)

---

## 5. Detector Prototype (A-09)

**File:** `payout_vault_detector.py`  
**Version:** 1.0.0  
**Status:** RESEARCH_PROTOTYPE  
**Primitives:** 11 (P-01 to P-11)

| Primitive | Name | Implementation |
|---|---|---|
| P-01 | HTF Bias Detection | COMPLETE |
| P-02 | DOL Identification | COMPLETE |
| P-03 | Liquidity Pool Scanner | COMPLETE |
| P-04 | Inducement Detector | COMPLETE |
| P-05 | Sweep Confirmation | COMPLETE |
| P-06 | Displacement Detector | COMPLETE |
| P-07 | FVG Scanner | COMPLETE |
| P-08 | Order Block Detector | COMPLETE |
| P-09 | Breaker Block Detector | COMPLETE |
| P-10 | Premium/Discount Zone | COMPLETE |
| P-11 | Full Setup Assembler | COMPLETE |

---

## 6. Regression Suite Results

### 6.1 Python Tests

| Suite | Tests | Passed | Failed | Status |
|---|---|---|---|---|
| PV Detector (test_payout_vault_detector.py) | 78 | 78 | 0 | PASS |
| Authority Boundaries (test_authority_boundaries.py) | 27 | 27 | 0 | PASS |
| **Python Total** | **105** | **105** | **0** | **PASS** |

**PV Detector test breakdown:**
- Unit tests (per-primitive): 33
- Integration tests (multi-primitive): 23
- Causality tests (CAUSALITY-01 to CAUSALITY-22): 22

**Authority boundary test breakdown:**
- Import isolation tests: 5
- Source-code scan tests: 8
- Runtime call counter tests: 9
- Counter reset/isolation tests: 5

### 6.2 TypeScript / Node.js Tests

| Suite | Result | Details |
|---|---|---|
| Vitest (38 test files) | 1082/1082 PASS | Duration: 30.39s |
| TypeScript compilation (tsc --noEmit) | EXIT 0 | No type errors |
| Frontend build (vite build) | EXIT 0 | Built in 49.97s |
| Secret scan (G9 diff) | CLEAN | 0 secrets detected |

**Vitest test file count:** 38 files  
**Total tests across all suites:** 1082 + 78 + 27 = **1,187 tests, 1,187 passing**

---

## 7. Authority Zero-Call Boundary Proofs

All six authority counters are confirmed zero throughout the entire sprint. The detector prototype (`payout_vault_detector.py`) contains no imports of, and no calls to, any execution or strategy-management function.

| Counter | Required | Actual | Method of Verification |
|---|---|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 | 0 | Source scan + runtime counter test |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 | 0 | Source scan + runtime counter test |
| DARWIN_TRADERSPOST_CALLS | 0 | 0 | Source scan + runtime counter test |
| DARWIN_TRADOVATE_CALLS | 0 | 0 | Source scan + runtime counter test |
| STRATEGY_STATUS_CHANGES | 0 | 0 | Source scan + runtime counter test |
| CAPITAL_REALLOCATIONS | 0 | 0 | Source scan + runtime counter test |
| LIVE_TRADES_INITIATED | 0 | 0 | Source scan + runtime counter test |

**Proof method:** `test_authority_boundaries.py` (A-11) performs:
1. Import isolation — verifies detector module imports no execution dependencies
2. Source-code scan — regex scan confirms zero references to processBar, postBarAutomation, TradersPost, Tradovate, submitOrder, allocateCapital
3. Runtime counter tests — instantiates detector, runs all 11 primitives on synthetic data, asserts all counters remain at zero after execution
4. Counter reset/isolation — verifies counters are independent across instances

---

## 8. DARWIN Doctrine Compliance

This sprint strictly follows the DARWIN Permanent Strategy Discovery Doctrine. The research intake is a **behaviour discovery** exercise, not a strategy creation exercise.

| Doctrine Requirement | Status |
|---|---|
| Behaviour identified before strategy proposed | COMPLIANT |
| Three competing explanations generated | COMPLIANT (per hypothesis) |
| Disproof attempts documented | COMPLIANT (ambiguity register) |
| Stability across periods not yet assessed | PENDING (PV-EXP-001 required) |
| Strategy creation gates NOT triggered | COMPLIANT (no strategy created) |
| Unique portfolio value not yet assessed | PENDING (PV-EXP-001 required) |
| No narrow-parameter strategies created | COMPLIANT |
| All findings recorded in Atlas Memory | COMPLIANT |

**No new strategies were created in this sprint.** The detector prototype is classified as RESEARCH_PROTOTYPE and is not connected to any live or paper trading system.

---

## 9. Mandatory Next Experiment

**PV-EXP-001:** Baseline Frequency Scan

| Field | Value |
|---|---|
| Experiment ID | PV-EXP-001 |
| Hypothesis | PV-H01 (setup frequency is sufficient for statistical analysis) |
| Dataset | OOS: 2025-10-01 to 2026-07-20 (MNQ 5-min candles) |
| Detector | payout_vault_detector.py v1.0.0 |
| Primary metric | Setup count per week |
| Frequency gate | LOW_FREQUENCY if < 2/week; HALT if total events < 30 |
| Gate | PV-EXP-001 must pass before any further experiments |
| Status | NOT_STARTED (awaiting sprint 123A.10 authorisation) |

---

## 10. Artefact Hash Manifest v2 (A-NEW)

The new artefact hash manifest v2 (`artefact_hash_manifest_v2.json`) is the authoritative hash record for this sprint:

| Field | Value |
|---|---|
| Filename | artefact_hash_manifest_v2.json |
| SHA-256 | `c73b4ff62ae2735274f8e35cbca3b42c5c61b1d203347ee99a3b17f91e14798d` |
| Total artefacts | 13 |
| ARTEFACT_HASH_COVERAGE | 100% |
| PLACEHOLDER_SHA256_COUNT | 0 |
| ABBREVIATED_SHA256_COUNT | 0 |

---

## 11. Git Provenance

| Field | Value |
|---|---|
| Repository | atlas-nexus |
| Branch | `sprint/123a-9-payout-vault-research-intake` |
| G8 baseline SHA (parent) | `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed` |
| Previous remote HEAD | `9bd2d7c6ea310b0aaaca19384c26204b371e8c25` |
| G9 final commit SHA | `ce2a083a78c74c34c2f07418142e0880676ad8e3` |
| LOCAL_SHA = REMOTE_SHA | TRUE (verified post-push) |

---

## 12. G9 Gate Decision

**Gate G9: PASS**

All 18 acceptance criteria are satisfied:
- 13/13 artefacts have full 64-char SHA-256 hashes (zero placeholders, zero abbreviations)
- 105/105 Python tests pass (78 detector + 27 authority boundary)
- 1082/1082 TypeScript tests pass across 38 test files
- tsc compilation: EXIT 0
- vite build: EXIT 0
- Secret scan: CLEAN
- All 7 authority counters: 0
- Zero TBDs in any artefact
- LOCAL_SHA = REMOTE_SHA: TRUE

**Sprint 123A.9 is formally closed at Gate G9.**

---

## 13. Supersession Record

| Version | SHA-256 | Status |
|---|---|---|
| SPRINT_123A9_GATE_G9_FINAL_V1.md | (not tracked) | SUPERSEDED by v2 |
| SPRINT_123A9_GATE_G9_FINAL_V2.md | `101d4a2adfb7fe921de33622c62007d65a4793fc803a8598faf1dfe02dbbd586` | SUPERSEDED by v3 |
| **SPRINT_123A9_GATE_G9_FINAL_V3.md** | **(this document)** | **CURRENT — FINAL** |

---

*Report generated: 2026-07-25 | Atlas Nexus Research System | DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED*
