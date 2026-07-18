# Sprint 123A Gate Matrix (Revision 3)
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** ACTIVE — update as gates are reached  
**Date:** 2026-07-18 (Revision 3: corrections 1–3 from Gate G0 Final Surgical Pass applied; Revision 3 update: parity spec references updated to Revision 4; plan reference updated to Revision 3; test manifest reference updated to Revision 4)  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`

---

## Overview

This matrix defines every gate that must be passed before each sub-sprint begins, before each authority mode is activated, and before Sprint 123B is approved. Every gate requires explicit human approval from Phil. No system may self-promote through a gate.

**Correction 3 applied:** Gate G6 now certifies Sprint 123A.5 implementation only, with Learning Authority still disabled. Gate G6A is a separate, optional gate for `DATABENTO_LEARNING_AUTHORITY` activation.

**Correction 4 applied:** Sprint 123A is complete at Gate G7 regardless of whether Gate G6A is passed. Learning Authority activation is not required for Sprint 123A completion.

**Correction 9 applied:** Rollback criteria are explicit in Gate G7 and every sub-sprint gate.

---

## Gate G0 — Plan Approval (Before 123A.1 Begins)

**Required before:** Sprint 123A.1 implementation begins  
**Approver:** Phil  
**Status:** PENDING

| Criterion | Verification Method | Status |
|---|---|---|
| Amended implementation plan (Revision 3) reviewed by Phil | Phil confirms in writing | PENDING |
| All 15 supporting architecture documents reviewed by Phil | Phil confirms in writing | PENDING |
| Risk register (Revision 2 — 22 risks) reviewed and accepted | Phil confirms in writing | PENDING |
| Gate matrix (Revision 3) reviewed and accepted | Phil confirms in writing | PENDING |
| Test manifest reviewed and accepted | Phil confirms in writing | PENDING |
| Parity certification spec reviewed and accepted | Phil confirms in writing | PENDING |
| No production code changes before this gate | Source control verification | PENDING |
| No migrations run before this gate | Source control verification | PENDING |
| No Databento connection made before this gate | Confirmed by correction report | PENDING |

---

## Gate G1 — Sprint 123A.1 Complete (Before 123A.2 Begins)

**Required before:** Sprint 123A.2 branch begins  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| `server/market-data/config.ts` created with `MARKET_DATA_AUTHORITY` flag | `pnpm build` passes | NOT REACHED |
| All 7 new database tables created in drizzle schema | Migration applies cleanly | NOT REACHED |
| `shared/types/canonical-events.ts` created with all new event types | `tsc --noEmit` passes | NOT REACHED |
| `server/automation/postBarAutomation.ts` created | `pnpm build` passes | NOT REACHED |
| Direct `liveLearnEngine` call removed from `nexusRoutes.ts` | Source search confirms no direct call | NOT REACHED |
| `postBarAutomation` is sole caller of `liveLearnEngine` | Test `TEST-123A1-003` passes | NOT REACHED |
| G-001: `onNewBarObservation()` called via `postBarAutomation` | Test `TEST-123A1-004` passes | NOT REACHED |
| G-002: `/api/scheduled/monthly-review` returns real output | Test `TEST-123A1-005` passes | NOT REACHED |
| `LEGACY_BEHAVIOUR_ENABLED=true` — legacy system unchanged | Test `TEST-123A1-006` passes | NOT REACHED |
| `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` — no Databento connection | Confirmed by environment check | NOT REACHED |
| Rollback verified: setting `TRADINGVIEW_ONLY` restores full production path | Manual verification | NOT REACHED |
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G2 — Sprint 123A.2 Complete (Before 123A.3 Begins)

**Required before:** Sprint 123A.3 branch begins  
**Approver:** Phil  
**Status:** NOT REACHED

**Pre-requisite:** `TEST-INT-001 — Databento Symbol Resolution` opt-in integration test must pass and the actual continuous symbol must be recorded before this gate can be reached.

| Criterion | Verification Method | Status |
|---|---|---|
| `TEST-INT-001` passed — actual Databento continuous symbol confirmed | Integration test evidence log | NOT REACHED |
| Python feed service connects to Databento in shadow mode | Integration test `TEST-INT-002` (opt-in) | NOT REACHED |
| Bridge server receives normalised records | Bridge health endpoint | NOT REACHED |
| `atlasEventBus` receives `AtlasTradeEvent` records | Test `TEST-123A2-003` | NOT REACHED |
| `DATABENTO_API_KEY` not in any log, SSE, DB, or browser bundle | Secret scanning tests pass | NOT REACHED |
| Bridge port `7890` not externally accessible | Security verification | NOT REACHED |
| No `processBar()` called from Databento path | Test `TEST-123A2-006` | NOT REACHED |
| No `postBarAutomation` called from Databento path | Test `TEST-123A2-007` | NOT REACHED |
| No `onNewBarObservation()` called from Databento path | Test `TEST-123A2-008` | NOT REACHED |
| Rollback verified: `TRADINGVIEW_ONLY` restores production path, all new tables preserved | Manual verification | NOT REACHED |
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G3 — Sprint 123A.3 Complete (Before 123A.4 Begins)

**Required before:** Sprint 123A.4 branch begins  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| 1-min bars persisted to `atlas_bars_1m` | Database query | NOT REACHED |
| 5-min bars persisted to `atlas_bars_5m` | Database query | NOT REACHED |
| `atlas_canonical_bars` populated from TradingView in `TRADINGVIEW_ONLY` mode | Database query | NOT REACHED |
| Contract rolls detected and persisted to `atlas_contract_rolls` | Database query | NOT REACHED |
| Confirmed no-trade minute and synthetic-bar safety | Test `TEST-123A3-005` | NOT REACHED |
| No `UNRESOLVED` minute silently aggregated into 5-min dispatch | Test `TEST-123A3-006` | NOT REACHED |
| Consumer processing ledger populated | Database query | NOT REACHED |
| No `processBar()` called from Databento path | Test `TEST-123A3-008` | NOT REACHED |
| No `postBarAutomation` called from Databento path | Test `TEST-123A3-009` | NOT REACHED |
| Rollback verified: `TRADINGVIEW_ONLY` restores production path, all new tables preserved | Manual verification | NOT REACHED |
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G4 — Parity Certification (Before DATABENTO_CHART_AUTHORITY Activation)

**Required before:** `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY` is activated  
**Approver:** Phil  
**Status:** NOT REACHED

Gate G4 passes only when every applicable requirement in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` Revision 4 is satisfied. Thresholds are not restated here — the parity specification is the sole authoritative source.

| Criterion | Verification Method | Status |
|---|---|---|
| All requirements in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` Revision 4 satisfied (Section A: 1-min feed quality; Section B: 5-min cross-feed parity) | Parity report per spec | NOT REACHED |
| Zero `containsUnresolvedMinutes` bars in 5-day window | Database query | NOT REACHED |
| All contract rolls detected correctly | Roll log review | NOT REACHED |
| `AtlasLiveChart.tsx` displays developing and confirmed candles from Databento | Visual review | NOT REACHED |
| `AtlasLiveChart.tsx` never publishes to Atlas Event Bus | Test `TEST-123A4-005` | NOT REACHED |
| Feed health badge accurate | Manual verification | NOT REACHED |
| Contract roll markers display correctly | Manual verification | NOT REACHED |
| `LiveChart.tsx` (TradingView fallback) still functional | Manual verification | NOT REACHED |
| Phil reviews parity report and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G5 — Sprint 123A.4 Complete (Before 123A.5 Begins)

**Required before:** Sprint 123A.5 branch begins  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| Gate G4 passed | See G4 | NOT REACHED |
| Parity monitor producing daily reports | DARWIN daily report | NOT REACHED |
| All trade lifecycle SSE events functional | Integration test | NOT REACHED |
| `AtlasLiveChart.tsx` chart authority gate passed | Visual review | NOT REACHED |
| All tests in `SPRINT_123A_TEST_MANIFEST.md` for sub-sprints 1–4 pass | `pnpm test` | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G6 — Sprint 123A.5 Implementation Certified (Learning Authority Disabled)

**Required before:** Sprint 123B planning begins (or Gate G6A consideration)  
**Approver:** Phil  
**Status:** NOT REACHED

**This gate certifies that Sprint 123A.5 is correctly implemented. `DATABENTO_LEARNING_AUTHORITY` remains disabled at this gate. Activation is a separate decision at Gate G6A.**

| Criterion | Verification Method | Status |
|---|---|---|
| `postBarAutomation.ts` correctly handles `DATABENTO_LEARNING_AUTHORITY` mode | Test `TEST-123A5-001` | NOT REACHED |
| Behaviour Engine canonical Databento bar input implemented | Test `TEST-123A5-002` | NOT REACHED |
| `liveLearnEngine` canonical trigger from Databento implemented | Test `TEST-123A5-003` | NOT REACHED |
| DARWIN canonical trigger from Databento implemented | Test `TEST-123A5-004` | NOT REACHED |
| Duplicate-learning protection verified | Test `TEST-123A5-005` | NOT REACHED |
| Zero duplicate `onNewBarObservation()` calls in 5-day shadow test | Consumer ledger | NOT REACHED |
| Zero duplicate Behaviour Engine instances in 5-day shadow test | Consumer ledger | NOT REACHED |
| `DATABENTO_LEARNING_AUTHORITY` is NOT activated | Environment check | NOT REACHED |
| TradingView remains the active learning trigger | Confirmed by environment | NOT REACHED |
| All tests in `SPRINT_123A_TEST_MANIFEST.md` pass | `pnpm test` | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G6A — Optional: DATABENTO_LEARNING_AUTHORITY Activation

**Required before:** `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` is activated  
**Approver:** Phil (explicit, separate approval — not implied by G6)  
**Status:** NOT REACHED  
**This gate is optional. Sprint 123A is complete at G7 regardless of G6A status.**

| Criterion | Verification Method | Status |
|---|---|---|
| Gate G6 passed | See G6 | NOT REACHED |
| Canonical Behaviour Engine has ≥ 20 trading days of shadow data | Database query | NOT REACHED |
| Behaviour migration agreement rate ≥ 95% (for mappable behaviours) | Migration log analysis | NOT REACHED |
| DARWIN confirms canonical behaviour data is meaningful | DARWIN research report | NOT REACHED |
| TradingView learning trigger disabled in `DATABENTO_LEARNING_AUTHORITY` mode | Integration test | NOT REACHED |
| TradingView decision trigger still active | Integration test | NOT REACHED |
| Phil explicitly approves `DATABENTO_LEARNING_AUTHORITY` activation | Phil confirms in writing | NOT REACHED |

---

## Gate G7 — Sprint 123A Complete

**Required before:** Sprint 123B planning begins  
**Approver:** Phil  
**Status:** NOT REACHED  
**Sprint 123A is complete at this gate regardless of whether Gate G6A has been passed.**

| Criterion | Verification Method | Status |
|---|---|---|
| All five sub-sprints merged to `main` | Git log | NOT REACHED |
| Gate G6 passed | See G6 | NOT REACHED |
| `DATABENTO_SHADOW` mode active in production (or higher) | Environment check | NOT REACHED |
| All requirements in `DATABENTO_PARITY_CERTIFICATION_SPEC.md` Revision 4 (Section B, Gate G6A features) satisfied | Parity report per spec | NOT REACHED |
| `AtlasLiveChart.tsx` passes Chart Authority gate | Visual review | NOT REACHED |
| All tests in `SPRINT_123A_TEST_MANIFEST.md` pass | `pnpm test` | NOT REACHED |
| `SPRINT_123A_DATABENTO_LIVE_VALIDATION.md` report complete | Document review | NOT REACHED |
| `DATABENTO_DECISION_AUTHORITY` NOT activated | Environment check | NOT REACHED |
| No production execution path was changed without explicit gate approval | Source review | NOT REACHED |
| `postBarAutomation.ts` is sole caller of `liveLearnEngine` and `onNewBarObservation()` | Source search | NOT REACHED |
| `AtlasLiveChart.tsx` never publishes to Atlas Event Bus | Test `TEST-123A4-005` | NOT REACHED |
| Rollback procedure verified: `TRADINGVIEW_ONLY` restores full production path | Manual verification | NOT REACHED |
| All new tables preserved (not dropped) | Database query | NOT REACHED |
| Phil approves Sprint 123A as complete | Phil confirms in writing | NOT REACHED |

---

## Gate Status Summary

| Gate | Description | Optional? | Status |
|---|---|---|---|
| G0 | Plan Approval | No | **PENDING** |
| G1 | 123A.1 Complete | No | NOT REACHED |
| G2 | 123A.2 Complete | No | NOT REACHED |
| G3 | 123A.3 Complete | No | NOT REACHED |
| G4 | Parity Certification | No | NOT REACHED |
| G5 | 123A.4 Complete | No | NOT REACHED |
| G6 | 123A.5 Implementation Certified (Learning Authority disabled) | No | NOT REACHED |
| G6A | Learning Authority Activation | **Yes** | NOT REACHED |
| G7 | Sprint 123A Complete | No | NOT REACHED |
