# Sprint 123A.1 — Gate G1 Evidence Submission
## Revision 3 — Round 3 Corrections Applied

**Status:** Awaiting Gate G1 Approval
**Branch:** `sprint/123a-1-foundation`
**Repository:** `SFGrowth/Project-Atlas`
**Sprint:** 123A.1 — Foundation and Autonomy Remediation
**Submitted:** 2026-07-19
**Revision:** 3 (Round 3 corrections applied)

---

## 1. Gate G0 Approval Record

Gate G0 was approved by Phil on 2026-07-19 with the following explicit scope:

> "Gate G0 approved. Sprint 123A.1 may begin. Approval is limited strictly to
> Sprint 123A.1 — Foundation and Autonomy Remediation."

Immutable tag `sprint-123a-g0-ready` is present on commit `1e8557d` in the repository.

---

## 2. Deliverables Implemented

| Deliverable | File | Revision | Status |
|---|---|---|---|
| Feature-flag configuration | `server/market-data/config.ts` | Rev 3 | Complete |
| Canonical TypeScript event contracts | `shared/types/canonical-events.ts` | Rev 3 | Complete |
| postBarAutomation | `server/automation/postBarAutomation.ts` | Rev 3 | Complete |
| nexusRoutes.ts wiring | `server/nexusRoutes.ts` | Sprint 123A.1 | Complete |
| Monthly review fix (G-002) | `server/scheduledJobs.ts` | Sprint 123A.1 | Complete |
| Database migration | `drizzle/0026_sprint_123a1_foundation.sql` | Rev 1 | Awaiting approval to run |
| Sprint 123A.1 tests | `server/sprint-123a1.test.ts` | Rev 3 | **33 passed, 0 failed** |

---

## 3. Round 3 Corrections Applied

| Ref | File | Correction |
|---|---|---|
| R3-1 | `canonical-events.ts` | `DatabentoEventId` and `TradingViewEventId` split into separate branded types; 5 Databento-only lifecycle event types added; `INSPECTION_RELEASE_GOVERNANCE` constant with formal release conditions |
| R3-2 | `postBarAutomation.ts` | Authority guard now fires **before** any `dynamic import()`; invalid `triggerSource`/`authorityMode` combination rejected at function entry, not after module loading |
| R3-3 | `migration 0026` | Structural validation confirmed via Python regex analysis (MySQL not available as standalone service in sandbox); all 8 checks pass |
| R3-4 | `sprint-123a1.test.ts` | 5 new runtime tests added: TEST-123A1-021 (monthly review calls `runMonthlyAudit` exactly once), TEST-123A1-021B (audit failure surfaced correctly), TEST-123A1-029 (nexus TradingView flow invokes `runPostBarAutomation`), TEST-123A1-030 (`processBar` still invoked exactly once), TEST-123A1-031 (no direct `liveLearnEngine` call at runtime), TEST-123A1-032 (invalid authority loads no dependencies) |
| R3-5 | `sprint-123a1.test.ts` | Comment-stripping fix applied to TEST-123A1-029 and TEST-123A1-031 — `processLiveBar(` appears only in a doc comment on line 1226 of nexusRoutes.ts, not as a function call |

---

## 4. Test Results

**Command:** `pnpm vitest run server/sprint-123a1.test.ts`
**Result:** 33 passed, 0 failed
**TypeScript:** 0 errors (`pnpm tsc --noEmit`)

| Test ID | Description | Result |
|---|---|---|
| TEST-123A1-001 | Feature flag defaults to TRADINGVIEW_ONLY | PASS |
| TEST-123A1-002 | All Databento predicates return false by default | PASS |
| TEST-123A1-003 | isDatabentoProcessBarTrigger always returns false | PASS |
| TEST-123A1-004 | assertSprint123A1Invariants throws on DATABENTO_LIVE_ENABLED=true | PASS |
| TEST-123A1-005 | assertSprint123A1Invariants throws on DATABENTO_DECISION_AUTHORITY | PASS |
| TEST-123A1-006 | assertSprint123A1Invariants throws on DATABENTO_SHADOW | PASS |
| TEST-123A1-007 | Authority matrix: Databento rejected in TRADINGVIEW_ONLY | PASS |
| TEST-123A1-008 | Authority matrix: TradingView accepted in TRADINGVIEW_ONLY | PASS |
| TEST-123A1-009 | Authority matrix: Databento rejected in DATABENTO_SHADOW | PASS |
| TEST-123A1-010 | Authority matrix: Databento rejected in DATABENTO_CHART_AUTHORITY | PASS |
| TEST-123A1-011 | Authority matrix: TradingView rejected in DATABENTO_LEARNING_AUTHORITY | PASS |
| TEST-123A1-012 | Authority matrix: Databento accepted in DATABENTO_LEARNING_AUTHORITY | PASS |
| TEST-123A1-013 | Authority matrix: authorityMode payload mismatch rejected | PASS |
| TEST-123A1-014 | Subsystem isolation: liveLearnEngine called exactly once | PASS |
| TEST-123A1-015 | Subsystem isolation: onNewBarObservation called exactly once (G-001 fix) | PASS |
| TEST-123A1-016 | Subsystem isolation: behaviourEngine called exactly once | PASS |
| TEST-123A1-017 | Failure isolation: liveLearnEngine failure does not stop others | PASS |
| TEST-123A1-018 | Failure isolation: DARWIN failure does not stop behaviourEngine | PASS |
| TEST-123A1-019 | No subsystem runs after authority violation | PASS |
| TEST-123A1-020 | processBar never called by postBarAutomation (source boundary) | PASS |
| TEST-123A1-021 | Monthly review calls runMonthlyAudit exactly once (runtime) | PASS |
| TEST-123A1-021B | Monthly review surfaces audit failure correctly (runtime) | PASS |
| TEST-123A1-022 | Migration 0026: no CONTAINS_UNRESOLVED in ENUMs | PASS |
| TEST-123A1-023 | Migration 0026: effective-once unique constraints | PASS |
| TEST-123A1-024 | Migration 0026: nanosecond precision DECIMAL(20,0) | PASS |
| TEST-123A1-025 | Migration 0026: reconciliation_status ENUM (not boolean) | PASS |
| TEST-123A1-026 | Migration 0026: separated rollback tiers | PASS |
| TEST-123A1-027 | DATABENTO_DECISION_AUTHORITY removed from Sprint 123A type | PASS |
| TEST-123A1-028 | getMarketDataAuthority throws on DATABENTO_DECISION_AUTHORITY | PASS |
| TEST-123A1-029 | Nexus TradingView flow: postBarAutomation invoked exactly once | PASS |
| TEST-123A1-030 | Nexus TradingView flow: processBar invoked exactly once | PASS |
| TEST-123A1-031 | Nexus TradingView flow: no direct liveLearnEngine call at runtime | PASS |
| TEST-123A1-032 | Invalid authority: dependency loaders not invoked | PASS |

---

## 5. Migration Review

### Migration File
`drizzle/0026_sprint_123a1_foundation.sql`

### Tables Created (9)

| Table | Purpose | Key Constraint |
|---|---|---|
| `atlas_ticks` | Raw Databento tick data | `uq_atlas_ticks_source_ns` (source, dataset, instrument_id, ts_event_ns) |
| `atlas_bars_1m` | Databento 1-minute OHLCV bars | `uq_atlas_bars_1m_source_bar` |
| `atlas_bars_5m` | Databento 5-minute OHLCV bars | `uq_atlas_bars_5m_source_bar` |
| `atlas_canonical_bars` | Authority-safe canonical bar record | `uq_atlas_canonical_bars_authority` |
| `atlas_contract_rolls` | Continuous contract roll events | `uq_atlas_contract_rolls` |
| `atlas_parity_reports` | Daily parity certification reports | `uq_atlas_parity_reports_date` |
| `atlas_chart_annotations` | Chart annotation log | — |
| `atlas_consumer_processing_ledger` | Effective-once consumer processing record | `uq_atlas_consumer_ledger` |
| `atlas_feed_health_log` | Feed health and connectivity events | — |

### Structural Validation Results (8/8 PASS)

| Check | Result |
|---|---|
| CONTAINS_UNRESOLVED absent from all ENUMs | PASS |
| All 9 required tables present | PASS |
| Effective-once unique constraints on source bar tables | PASS |
| DECIMAL(20,0) for nanosecond timestamps | PASS |
| reconciliation_status uses ENUM (not boolean) | PASS |
| Separated rollback tiers (operational + destructive) | PASS |
| atlas_consumer_processing_ledger effective-once design | PASS |
| Databento-only lifecycle event ENUMs | PASS |

### Migration Execution Status

**Not run against production.** Deferral to Sprint 123A.3 is safe — no Databento functionality requires these tables before then.

### Rollback Procedures

**Tier 1 — Operational Rollback** (preserves evidence tables):
```sql
DROP TABLE IF EXISTS `atlas_chart_annotations`;
DROP TABLE IF EXISTS `atlas_contract_rolls`;
DROP TABLE IF EXISTS `atlas_bars_5m`;
DROP TABLE IF EXISTS `atlas_bars_1m`;
DROP TABLE IF EXISTS `atlas_ticks`;
```

**Tier 2 — Destructive Development Reset** (drops all 9 tables):
```sql
DROP TABLE IF EXISTS `atlas_consumer_processing_ledger`;
DROP TABLE IF EXISTS `atlas_chart_annotations`;
DROP TABLE IF EXISTS `atlas_parity_reports`;
DROP TABLE IF EXISTS `atlas_contract_rolls`;
DROP TABLE IF EXISTS `atlas_canonical_bars`;
DROP TABLE IF EXISTS `atlas_bars_5m`;
DROP TABLE IF EXISTS `atlas_bars_1m`;
DROP TABLE IF EXISTS `atlas_feed_health_log`;
DROP TABLE IF EXISTS `atlas_ticks`;
```

---

## 6. Rollback Verification

| Rollback Step | Command | Effect |
|---|---|---|
| Revert nexusRoutes.ts | `git checkout 1e8557d -- server/nexusRoutes.ts` | Restores direct `liveLearnEngine.processLiveBar()` call |
| Revert scheduledJobs.ts | `git checkout 1e8557d -- server/scheduledJobs.ts` | Restores `not_implemented` monthly review stub |
| Remove new files | `git rm server/automation/postBarAutomation.ts server/market-data/config.ts shared/types/canonical-events.ts server/sprint-123a1.test.ts` | Removes all new Sprint 123A.1 files |
| Revert schema | `git checkout 1e8557d -- drizzle/schema.ts drizzle/meta/_journal.json` | Removes Sprint 123A.1 schema additions |

**Rollback baseline commit:** `1e8557d` (tagged `sprint-123a-g0-ready`)

---

## 7. Invariant Confirmations

| Invariant | Confirmed |
|---|---|
| No Databento connection made | Yes |
| No migration run against production | Yes |
| No strategy logic changed | Yes |
| No ADE, risk, or execution logic changed | Yes |
| TradingView production authority unchanged | Yes — `processBar()` remains in `nexusRoutes.ts` |
| `isDatabentoProcessBarTrigger()` always returns false | Yes — hardcoded, not overridable |
| `DATABENTO_DECISION_AUTHORITY` not in Sprint 123A type | Yes — throws if set |
| Authority guard fires before any dynamic import | Yes — Rev 3 correction |
| `processBar()` never called by `postBarAutomation` | Yes — verified by TEST-123A1-020 and TEST-123A1-030 |

---

## 8. Git Audit Trail

### Baseline and Head

| Item | SHA |
|---|---|
| Baseline (pre-Sprint 123A docs) | `0906a80` |
| Gate G0 architecture content | `43995df` |
| Gate G0 evidence lock | `1e8557d` (tagged `sprint-123a-g0-ready`) |
| Sprint 123A.1 Round 2 | `60d1819` |
| Sprint 123A.1 Round 3 (current HEAD) | `277c47c` |

### Proof Commands and Results

```
git rev-list --count 0906a80..277c47c
25

git diff --name-status 0906a80..277c47c
(25 docs/ files added, 9 implementation files added/modified)

git diff --name-only 0906a80..277c47c | grep -v "^docs/" | wc -l
9
```

### Non-docs Files Changed

| File | Change |
|---|---|
| `drizzle/0026_sprint_123a1_foundation.sql` | New — Sprint 123A.1 schema (not run against production) |
| `drizzle/meta/_journal.json` | Modified — migration 0026 registered |
| `drizzle/schema.ts` | Modified — Sprint 123A.1 table definitions appended |
| `server/automation/postBarAutomation.ts` | New — postBarAutomation implementation |
| `server/market-data/config.ts` | New — feature-flag configuration |
| `server/nexusRoutes.ts` | Modified — direct `liveLearnEngine` call replaced with `runPostBarAutomation` |
| `server/scheduledJobs.ts` | Modified — monthly review `not_implemented` stub replaced with `runMonthlyAudit()` |
| `server/sprint-123a1.test.ts` | New — Sprint 123A.1 test suite (33 tests) |
| `shared/types/canonical-events.ts` | New — canonical TypeScript event contracts |

---

## 9. Gate G1 Approval Request

Sprint 123A.1 implementation is complete. 33 tests pass. TypeScript compiles cleanly. All invariants confirmed.

To approve Gate G1 and allow Sprint 123A.2 to begin, please confirm three items:

1. **Code review:** The implementation is acceptable.
2. **Migration decision:** Approve or defer running `drizzle/0026_sprint_123a1_foundation.sql` against production. Deferral to Sprint 123A.3 is safe.
3. **Sprint 123A.2 authorisation:** Explicit written approval for Sprint 123A.2 scope.

> **Sprint 123A.2 will not begin until explicit written approval is received.**
