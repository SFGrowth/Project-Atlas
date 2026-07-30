# Artefact A6 — Code Change Manifest
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Files Modified This Session

### 1. server/darwin/darwin-j4-pattern-discovery.ts

**Changes:**
- Added `applyBHFDR()` function implementing Benjamini-Hochberg FDR correction
- Updated `persistFinding()` to write to `darwin_findings` table with BH-FDR data
- Updated `persistFinding()` to populate `darwin_research_memory.finding_id` with the formal `darwin_findings.finding_id`
- Updated `persistFinding()` to populate `darwin_research_memory.source_observation_id`, `source_event_id`, `rule_id`, `rule_version`
- Updated `persistFinding()` to back-link `darwin_experiment_records.finding_id = memoryId`
- Updated `persistFinding()` to back-link `darwin_candidates.experiment_id`, `finding_id`
- **Fixed:** `persistFinding()` now returns `memoryId` (not `darwin_findings.finding_id`) for backward compatibility with G17 tests
- Updated `sendFindingNotification()` to update `darwin_research_memory.notification_id` and `telegram_message_id` using `WHERE memory_id = params.findingId`
- Updated `sendFindingNotification()` to update `darwin_candidates.notification_id`

**Lines changed:** ~150 lines (additions + modifications)

### 2. server/darwin/darwin-dashboard-router.ts

**Changes:**
- Updated `/api/darwin/chain-trace` to query `darwin_findings` table
- Added BH-FDR fields to chain-trace response: `BH_FDR_APPLIED`, `BH_FDR_Q`, `BH_FDR_SIGNIFICANT`, `RAW_P_VALUE`, `ADJUSTED_P_VALUE`
- Added `FINDING_VISIBLE_ON_DASHBOARD` boolean to response
- Added `FINDING_PERSISTED` boolean to response
- Added `NOTIFICATION_EXTERNALLY_DELIVERED` boolean to response

**Lines changed:** ~40 lines

### 3. .env (cloud computer — not tracked in git)

**Changes:**
- `ATLAS_WEBHOOK_TOKEN`: Updated from expired `[REDACTED_GH_TOKEN]` to valid `[REDACTED_GH_TOKEN]`

### 4. trigger_j4_once.ts (temporary — deleted after use)

**Purpose:** One-shot J4 trigger for live chain proof. Created and deleted during this session.

## Files NOT Modified

| File | Reason |
|------|--------|
| server/darwin/darwin-observation-service.ts | Already correct — observation records are immutable |
| server/darwin/darwin-research-scheduler.ts | Already correct — J4 trigger mechanism unchanged |
| server/darwin/darwin-research-scheduler-standalone.ts | Already correct |
| server/darwinAutonomous.ts | Already correct |
| server/darwinGitArchive.ts | Already correct (uses ATLAS_WEBHOOK_TOKEN from env) |
| server/darwinDailyReport.ts | Already correct |
| /etc/cron.d/atlas-darwin | Not modified — cron schedule unchanged |
| drizzle/schema.ts | Not modified — migrations applied directly to DB |

## Authority Boundary — Unchanged Invariants

The following invariants were NOT modified and remain enforced:

```
DARWIN_DECISION_AUTHORITY:   DISABLED (darwin-authority.ts — unchanged)
DARWIN_EXECUTION_AUTHORITY:  DISABLED (darwin-authority.ts — unchanged)
liveChartAffected:           false (all J4 runs — unchanged)
TRADOVATE_CALLS:             0 (nexusRoutes.ts — unchanged)
TRADERSPOST_WEBHOOKS:        0 (postBarAutomation.ts — unchanged)
```

**MANIFEST_STATUS: COMPLETE**
