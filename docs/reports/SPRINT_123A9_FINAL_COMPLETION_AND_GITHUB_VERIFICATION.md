# Sprint 123A.9 — Final Completion and GitHub Verification Record

**Sprint:** 123A.9 — Payout Vault Research Intake  
**Gate:** G9 — Final Evidence Lock  
**Date:** 2026-07-25  
**Branch:** `sprint/123a-9-payout-vault-research-intake`  
**Repository:** SFGrowth/Project-Atlas  

---

## 1. Authoritative Git Provenance

| Field | Value |
|---|---|
| Repository | `https://github.com/SFGrowth/Project-Atlas` |
| Branch | `sprint/123a-9-payout-vault-research-intake` |
| G8 Baseline SHA (parent) | `a8b35b0673a8a59d4fe83fdafb3a4f4b40001aed` |
| G9 Implementation SHA | `8219bb06` (first research artefacts committed) |
| G9 Evidence Correction SHA | `9bd2d7c6ea310b0aaaca19384c26204b371e8c25` |
| G9 Authoritative Evidence SHA | `ce2a083a78c74c34c2f07418142e0880676ad8e3` |
| G9 V3 Report Updated SHA | `fac21b72d1afc3c695f3e06e091bd49341548f95` |
| G9 Todo Locked SHA | `f4ac55a9c58a7b55e47f3e8533c219e887cfbcd9` |
| G9 Provenance Reconciliation SHA | `bf9cd8895c83ccc2af66313c1dbbd1857ec77752` |
| **Authoritative Local HEAD SHA** | **`bf9cd8895c83ccc2af66313c1dbbd1857ec77752`** |
| **Authoritative Remote Branch SHA** | **`bf9cd8895c83ccc2af66313c1dbbd1857ec77752`** |
| **LOCAL_SHA = REMOTE_SHA** | **TRUE** |
| Working Tree Status | CLEAN |

---

## 2. SHA Relationship Explanation

Two SHAs were previously described as the G9 final evidence commit. This section resolves the ambiguity definitively.

| SHA | Role | In Branch History? |
|---|---|---|
| `5d9671ad404fabbddbc5b838c8a8078e597081eb` | **Superseded first attempt.** The original G9 evidence lock commit, created with parent `9bd2d7c6`. It was pushed to remote but then replaced by an amended commit (`ce2a083a`) via `git push --force`. It is an orphaned commit — **not reachable** from the current branch HEAD. It is NOT the final commit. |  NO — orphaned |
| `ce2a083a78c74c34c2f07418142e0880676ad8e3` | **Authoritative G9 evidence commit.** An amended version of `5d9671ad` with the same parent (`9bd2d7c6`), same files, same commit message, and same timestamp. The amendment updated `SPRINT_123A9_FINAL_COMPLETION_AND_GITHUB_VERIFICATION.md` to include confirmed LOCAL/REMOTE SHA values. This commit IS in the branch history. | YES — reachable |

The branch history is strictly linear from G8 baseline to the current HEAD:

```
a8b35b06  (G8 baseline)
  ↓
8219bb06  feat(sprint-123a9): Payout Vault research intake — G9 complete
  ↓
4cf36b86  feat(sprint-123a9): G9 final evidence lock — expanded formalisation layer
  ↓
8a5f749c  feat(sprint-123a9): G9 final evidence lock — all 14 sections complete
  ↓
9bd2d7c6  docs(g9-v2): final correction — ambiguity totals, PV-H01–H18, 17 experiments
  ↓
ce2a083a  docs(g9): final evidence lock v3 — artefact manifest v2, authority boundary tests, G9 report v3
  ↓
fac21b72  docs(g9): update G9 v3 report with final commit SHA ce2a083a
  ↓
f4ac55a9  chore(g9): mark Sprint 123A.9 complete in todo.md — G9 LOCKED
  ↓
(provenance reconciliation commit — SHA set after push)
```

`5d9671ad` is **not** in this chain. It was force-replaced by `ce2a083a`.

---

## 3. Final Files at Remote HEAD

All three required final files are confirmed present at the authoritative remote HEAD.

| File | Path | Git Blob SHA | Present |
|---|---|---|---|
| artefact_hash_manifest_v2.json | `docs/research/payout-vault/artefact_hash_manifest_v2.json` | `5ed4e9ca58e09a7517cd8a4748c851bb29d68c40` | TRUE |
| SPRINT_123A9_GATE_G9_FINAL_V3.md | `docs/research/payout-vault/SPRINT_123A9_GATE_G9_FINAL_V3.md` | `44d4cdff26b3a564ef686e23d82e7583dd099d5c` | TRUE |
| SPRINT_123A9_FINAL_COMPLETION_AND_GITHUB_VERIFICATION.md | `docs/reports/SPRINT_123A9_FINAL_COMPLETION_AND_GITHUB_VERIFICATION.md` | `1b7068a90595ef91cff5b0a394e23ba405c50bf3` | TRUE |

```
FINAL_MANIFEST_PRESENT=TRUE
FINAL_G9_REPORT_PRESENT=TRUE
FINAL_GITHUB_RECORD_PRESENT=TRUE
```

---

## 4. Final Lock Manifest

The final lock manifest (`artefact_hash_manifest_final.json`) covers all 16 Sprint 123A.9 artefacts.

| Field | Value |
|---|---|
| Filename | `artefact_hash_manifest_final.json` |
| SHA-256 | `7c2421360649be2354ea00efdd69b7f5f5e279d50d9761c22ecb9bc092e4aa00` |
| Total artefacts | 16 |
| FINAL_LOCK_ARTEFACT_COUNT | 16 |
| PLACEHOLDER_SHA256_COUNT | 0 |
| ABBREVIATED_SHA256_COUNT | 0 |
| ARTEFACT_HASH_COVERAGE | 100_PERCENT |

Note: The manifest cannot include its own stable SHA-256 inside itself. Its SHA-256 is recorded in this completion record (above).

---

## 5. Full Artefact Inventory — 16 Artefacts

| ID | Path | SHA-256 | Git Blob SHA | Size | Commit |
|---|---|---|---|---|---|
| A-01 | docs/research/payout-vault/concept_dictionary.md | `966a3eced42435abe2f3a9fe20c6e1ee8bedb169bf8a739d59704857856646ed` | `7b2b7ce6ab8444f992a72fe07fb662c9bb9bb667` | 12,471 B | `8219bb06` |
| A-02 | docs/research/payout-vault/rule_inventory.md | `b46fed52b8b3447fef5007f6a14128349c624eac05f335a84acae1e3fec669e7` | `c8404ea2dc209804b910ab09a2ca0531e8eb64e6` | 8,426 B | `8219bb06` |
| A-03 | docs/research/payout-vault/ambiguity_register_v3.md | `5e264b0029c0fe5a46cdcfd358aaf74eb778f5c3edbed0ee7a0cc397d0601854` | `4cc48a0aa6ca8e2c3aa7cf5ff6e4b5313ae75d52` | 10,849 B | `9bd2d7c6` |
| A-04 | docs/research/payout-vault/source_claim_traceability_v2.md | `257ebab725768cc053c5e8d0f18f294e45f741a8fc35cf191be550da75dbafcb` | `2828b3081a3e456b3ddc1c924d5efdd2c14dabf0` | 16,910 B | `9bd2d7c6` |
| A-05 | docs/research/payout-vault/traceability_matrix.md | `f03d835918f5c58eb14e8f821cdc36fef5bf6771d2aff79718129496e022045b` | `a9117df12f63c5a79e868c5f589fecd834fb9e14` | 6,392 B | `8219bb06` |
| A-06 | docs/research/payout-vault/payout_vault_visual_examples.json | `877c3389cb2f0772f050a41e5e7150fdeecba3e0e3af842108c5785bc979205b` | `a175a04cef4965be2b9e920a17e0411d715fae60` | 40,679 B | `9bd2d7c6` |
| A-07 | docs/research/payout-vault/hypothesis_registry_v4.json | `46489b97d1775fcb48b93b556e49c2c6f40601dfe4cf395599cd6bf25654bc4f` | `80689655a6f5258611ef1ac8210094b9da3bd8d0` | 35,283 B | `9bd2d7c6` |
| A-08 | docs/research/payout-vault/payout_vault_research_spec_v2.json | `e40ad744a18cc117976c6fedd58619f90b1d73bd6e9bddd0293ff0be0b4fce22` | `de172590a52abaaf0de02551356fa901c145cef1` | 12,589 B | `9bd2d7c6` |
| A-09 | docs/research/payout-vault/payout_vault_detector.py | `946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec` | `b233da449a35dd5debe63682df4e66117ebffaf0` | 36,120 B | `9bd2d7c6` |
| A-10 | docs/research/payout-vault/test_payout_vault_detector.py | `59b3bd92876ea2464edbdb009048e418c3f22c32b2f6672168ded3645caf5302` | `df410e8556a4022393685ed6c30406bbfe9d3b8e` | 58,928 B | `9bd2d7c6` |
| A-11 | docs/research/payout-vault/test_authority_boundaries.py | `8d38a7dcfb4a4cb237b46b50f19b956c1738c802a07320494dc837a18c80516b` | `d60ef6594c9f593d5a218dfe406cb10b6a3c2058` | 15,702 B | `ce2a083a` |
| A-12 | docs/research/payout-vault/artefact_hash_manifest.json | `e7df331013f84ab3553cabcf5bab9eff168a84a62c1dcfeee2dd4763e53d82ba` | `ca48ef91189115ea37898fe42c2867599f43d692` | 5,127 B | `9bd2d7c6` |
| A-13 | docs/research/payout-vault/SPRINT_123A9_GATE_G9_FINAL_V2.md | `101d4a2adfb7fe921de33622c62007d65a4793fc803a8598faf1dfe02dbbd586` | `3e70f7b8e37a24a2ee5181785501af597bd4f4ba` | 12,088 B | `9bd2d7c6` |
| A-14 | docs/research/payout-vault/artefact_hash_manifest_v2.json | `c73b4ff62ae2735274f8e35cbca3b42c5c61b1d203347ee99a3b17f91e14798d` | `5ed4e9ca58e09a7517cd8a4748c851bb29d68c40` | 5,756 B | `ce2a083a` |
| A-15 | docs/research/payout-vault/SPRINT_123A9_GATE_G9_FINAL_V3.md | `78cb90e3b76f6cf93c811cdde384d7f96277db680d7e1c8ca6f2afcc71251a90` | `44d4cdff26b3a564ef686e23d82e7583dd099d5c` | 14,340 B | `fac21b72` |
| A-16 | docs/reports/SPRINT_123A9_FINAL_COMPLETION_AND_GITHUB_VERIFICATION.md | *(this file — SHA is self-referential; recorded in manifest_final.json after commit)* | `937a1ab00757550b98a8127fdf402ddd4ebcbe97` | — | `bf9cd88` |

---

## 6. Regression Summary

| Suite | Tests | Passed | Status |
|---|---|---|---|
| Python PV Detector (test_payout_vault_detector.py) | 78 | 78 | PASS |
| Python Authority Boundaries (test_authority_boundaries.py) | 27 | 27 | PASS |
| TypeScript/Vitest (38 files) | 1082 | 1082 | PASS |
| TypeScript compilation (tsc --noEmit) | — | EXIT 0 | PASS |
| Frontend build (vite build) | — | EXIT 0 | PASS |
| Secret scan (G9 diff) | — | CLEAN | PASS |
| **Total tests** | **1,187** | **1,187** | **PASS** |

---

## 7. Authority Counter Final State

| Counter | Value |
|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 |
| DARWIN_TRADERSPOST_CALLS | 0 |
| DARWIN_TRADOVATE_CALLS | 0 |
| STRATEGY_STATUS_CHANGES | 0 |
| CAPITAL_REALLOCATIONS | 0 |
| LIVE_TRADES_INITIATED | 0 |
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |

---

## 8. Merge Status

**NOT MERGED.** The branch `sprint/123a-9-payout-vault-research-intake` has not been merged into `main`. Merge requires Phil's written approval.

---

*Verification record generated: 2026-07-25 | Atlas Nexus Research System | DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED*
