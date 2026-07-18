# Sprint 123A Gate Matrix
**Document type:** Architecture Reference  
**Sprint:** 123A  
**Status:** ACTIVE — update as gates are reached  
**Date:** 2026-07-18

---

## Overview

This matrix defines every gate that must be passed before each sub-sprint begins, before each authority mode is activated, and before Sprint 123B is approved. Every gate requires explicit human approval from Phil. No system may self-promote through a gate.

---

## Gate G0 — Plan Approval (Before 123A.1 Begins)

**Required before:** Sprint 123A.1 implementation begins  
**Approver:** Phil  
**Status:** PENDING

| Criterion | Verification Method | Status |
|---|---|---|
| Amended implementation plan reviewed by Phil | Phil confirms in writing | PENDING |
| All 12 architecture documents reviewed by Phil | Phil confirms in writing | PENDING |
| Risk register reviewed and accepted | Phil confirms in writing | PENDING |
| Gate matrix reviewed and accepted | Phil confirms in writing | PENDING |
| No production code changes before this gate | Source control verification | PENDING |

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
| G-001: `onNewBarObservation()` called via `postBarAutomation` | Test verifies call | NOT REACHED |
| G-002: `/api/scheduled/monthly-review` returns real output | Test verifies response | NOT REACHED |
| `LEGACY_BEHAVIOUR_ENABLED=true` — legacy system unchanged | Test verifies legacy writes | NOT REACHED |
| `MARKET_DATA_AUTHORITY=TRADINGVIEW_ONLY` — no Databento connection | No Databento client started | NOT REACHED |
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G2 — Sprint 123A.2 Complete (Before 123A.3 Begins)

**Required before:** Sprint 123A.3 branch begins  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| Python feed service connects to Databento in shadow mode | Integration test (opt-in) | NOT REACHED |
| Bridge server receives normalised records | Bridge health endpoint | NOT REACHED |
| `atlasEventBus` receives `AtlasTradeEvent` records | Event bus test | NOT REACHED |
| `DATABENTO_API_KEY` not in any log, SSE, DB, or browser bundle | Secret scanning test | NOT REACHED |
| Bridge port `7890` not externally accessible | Security verification | NOT REACHED |
| No `processBar()` called from Databento path | Integration test | NOT REACHED |
| No `onNewBarObservation()` called from Databento path | Integration test | NOT REACHED |
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
| Contract rolls detected and persisted | Database query | NOT REACHED |
| No `UNRESOLVED` minute silently aggregated | Integration test | NOT REACHED |
| `containsUnresolvedMinutes=true` bars blocked from production dispatch | Integration test | NOT REACHED |
| Consumer processing ledger populated | Database query | NOT REACHED |
| No `processBar()` called from Databento path | Integration test | NOT REACHED |
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G4 — Parity Certification (Before DATABENTO_CHART_AUTHORITY)

**Required before:** `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY` is activated  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| Parity ≥ 99.9% over 5 consecutive trading days | Parity report | NOT REACHED |
| Zero `containsUnresolvedMinutes` bars in 5-day window | Database query | NOT REACHED |
| All contract rolls detected correctly | Roll log review | NOT REACHED |
| `AtlasLiveChart.tsx` displays developing and confirmed candles | Visual review | NOT REACHED |
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
| All existing tests pass | `pnpm test` passes | NOT REACHED |
| Phil reviews and approves | Phil confirms in writing | NOT REACHED |

---

## Gate G6 — Learning Authority Activation (DATABENTO_LEARNING_AUTHORITY)

**Required before:** `MARKET_DATA_AUTHORITY=DATABENTO_LEARNING_AUTHORITY` is activated  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| Canonical Behaviour Engine has ≥ 20 trading days of shadow data | Database query | NOT REACHED |
| Behaviour migration agreement rate ≥ 95% (for mappable behaviours) | Migration log analysis | NOT REACHED |
| Zero duplicate `onNewBarObservation()` calls in 5-day test | Consumer ledger | NOT REACHED |
| Zero duplicate Behaviour Engine instances in 5-day test | Consumer ledger | NOT REACHED |
| TradingView learning trigger disabled in `DATABENTO_LEARNING_AUTHORITY` mode | Integration test | NOT REACHED |
| TradingView decision trigger still active | Integration test | NOT REACHED |
| DARWIN confirms canonical behaviour data is meaningful | DARWIN research report | NOT REACHED |
| Phil explicitly approves `DATABENTO_LEARNING_AUTHORITY` activation | Phil confirms in writing | NOT REACHED |

---

## Gate G7 — Sprint 123A Complete

**Required before:** Sprint 123B planning begins  
**Approver:** Phil  
**Status:** NOT REACHED

| Criterion | Verification Method | Status |
|---|---|---|
| All five sub-sprints merged to `main` | Git log | NOT REACHED |
| `DATABENTO_SHADOW` mode active in production | Environment check | NOT REACHED |
| Parity ≥ 99.9% over 5 consecutive trading days | Parity report | NOT REACHED |
| `AtlasLiveChart.tsx` passes Chart Authority gate | Visual review | NOT REACHED |
| All 64 test categories pass | `pnpm test` | NOT REACHED |
| `SPRINT_123A_DATABENTO_LIVE_VALIDATION.md` report complete | Document review | NOT REACHED |
| `DATABENTO_LEARNING_AUTHORITY` NOT activated | Environment check | NOT REACHED |
| `DATABENTO_DECISION_AUTHORITY` NOT activated | Environment check | NOT REACHED |
| Phil approves Sprint 123A as complete | Phil confirms in writing | NOT REACHED |

---

## Gate Status Summary

| Gate | Description | Status |
|---|---|---|
| G0 | Plan Approval | **PENDING** |
| G1 | 123A.1 Complete | NOT REACHED |
| G2 | 123A.2 Complete | NOT REACHED |
| G3 | 123A.3 Complete | NOT REACHED |
| G4 | Parity Certification | NOT REACHED |
| G5 | 123A.4 Complete | NOT REACHED |
| G6 | Learning Authority Activation | NOT REACHED |
| G7 | Sprint 123A Complete | NOT REACHED |
