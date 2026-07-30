# Artefact A7 — Code Change Manifest
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2 (corrected)
## Produced: 2026-07-30T23:17:00Z

---

## Summary

This version (v2) supersedes the v1 code change manifest. It includes the additional
fixes applied in this correction session.

---

## Files Modified

### 1. `server/darwin/darwin-j4-pattern-discovery.ts`

**Changes (v1 — prior session):**
- Added `applyBHFDR()` function implementing Benjamini-Hochberg FDR correction
- Added `darwin_findings` table write in `persistFinding()`
- Fixed `persistFinding()` to return `memoryId` (backward compat with G17 tests)
- Fixed `notification_id` population in `darwin_research_memory`

**Changes (v2 — this session):**
- Fixed Bug 1: Back-link UPDATEs in `persistFinding()` now use `findingId` (darwin_findings.finding_id) instead of `memoryId` for `darwin_experiment_records.finding_id` and `darwin_candidates.finding_id`
- Fixed Bug 2: `runHistoricalExperiment()` now accepts `runId?: string` parameter and writes it to `darwin_experiment_records.run_id` (was NULL before)

### 2. `server/darwin/darwin-dashboard-router.ts`

**Changes (v1 — prior session):**
- Added BH-FDR fields to `/api/darwin/chain-trace` response

**Changes (v2 — this session):**
- Updated chain-trace to query `darwin_findings` directly by `result_id` (experiment_id) to get the formal `finding_id`
- Added `FINDING_MEMORY_IDS_DISTINCT` boolean field to chain-trace response
- Added `FINDING_ID` as a distinct field (from `darwin_findings.finding_id`, not from `darwin_research_memory.finding_id`)

### 3. `server/sprint-darwin-core-chain-gate-g17.test.ts`

**Changes (v2 — this session):**
- Added `describe('G17-FINDING-ID: FINDING_ID and MEMORY_ID are distinct identifiers')` with 5 new tests:
  - G17-FINDING-ID-01 through G17-FINDING-ID-05

---

## Files NOT Modified (Operational Boundary)

| File/System | Status |
|-------------|--------|
| `server/darwin/darwin-observation-service.ts` | NOT MODIFIED |
| `server/darwin/darwin-research-scheduler.ts` | NOT MODIFIED |
| `server/darwin/darwinGitArchive.ts` | NOT MODIFIED |
| `/etc/cron.d/atlas-darwin` | NOT MODIFIED |
| `drizzle/schema.ts` | NOT MODIFIED (schema changes via raw SQL only) |
| `server/_core/telegramNotifier.ts` | NOT MODIFIED |
| `server/_core/cmeSchedule.ts` | NOT MODIFIED |
| Live database (production data) | NOT MODIFIED |
| Active model configurations (A1, A3, B1, SB1, ORB-1) | NOT MODIFIED |
| `.env` (except ATLAS_WEBHOOK_TOKEN token rotation) | NOT MODIFIED |

---

## Schema Changes (Raw SQL, applied to atlas_staging_g4)

The following schema changes were applied in the prior session (v1) and remain in place:

| Table | Change | Applied |
|-------|--------|---------|
| `darwin_findings` | New table created | v1 |
| `darwin_experiment_records` | Added `bh_fdr_significant`, `raw_p_value`, `adjusted_p_value`, `run_id` | v1 |
| `darwin_research_memory` | Added `finding_id`, `source_observation_id`, `telegram_message_id`, `notification_id`, `rule_id`, `rule_version` | v1 |
| `darwin_candidates` | Added `governance_stage`, `finding_id`, `experiment_id`, `rule_id`, `rule_version` | v1 |

---

## Environment Changes

| Change | Applied | Notes |
|--------|---------|-------|
| `ATLAS_WEBHOOK_TOKEN` updated in `.env` | v2 | Token rotation — old token expired. New token is valid `ghu_` OAuth token. Token value redacted. |
| `ATLAS_GITHUB_TOKEN` updated in `.env` | v1 | Same token rotation applied to both env vars. |

---

## Authority Boundary Compliance

No changes were made to any file that touches:
- Live trade execution (traderspost.io, tradovate)
- Model signal generation (processBar, signal computation)
- Risk management parameters
- Apex prop firm account configuration
- Live account ($1,650/trade) configuration

`DARWIN_DECISION_AUTHORITY: DISABLED` — unchanged throughout.
`DARWIN_EXECUTION_AUTHORITY: DISABLED` — unchanged throughout.
