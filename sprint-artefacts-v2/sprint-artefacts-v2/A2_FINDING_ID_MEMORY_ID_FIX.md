# Artefact A2 — FINDING_ID / MEMORY_ID Conflation Fix Record
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2
## Produced: 2026-07-30T23:17:00Z

---

## Problem Statement

The previous sprint delivery (v1) contained a FK conflation bug in `darwin-j4-pattern-discovery.ts`.
The `persistFinding()` function wrote the `darwin_findings.finding_id` (UUID) correctly to the
`darwin_findings` table, but then overwrote the FK back-links in `darwin_experiment_records` and
`darwin_candidates` with the `darwin_research_memory.memory_id` instead of the `darwin_findings.finding_id`.

This caused:
1. `darwin_experiment_records.finding_id` → pointed to `memory_id` (wrong table)
2. `darwin_candidates.finding_id` → pointed to `memory_id` (wrong table)
3. `darwin_experiment_records.run_id` → NULL (job run ID not passed through)
4. The chain-trace endpoint returned `FINDING_ID = memory_id` (conflated)

The `darwin_research_memory` table itself was correct — its `finding_id` column correctly pointed
to `darwin_findings.finding_id`. The bug was only in the back-link UPDATEs.

---

## Root Cause

In `persistFinding()`, after writing the `darwin_findings` row and the `darwin_research_memory` row,
two UPDATE statements ran to back-link the experiment record and candidate:

```typescript
// BUG (v1): Both UPDATEs used memoryId instead of findingId
await pool.execute(`UPDATE darwin_experiment_records SET finding_id = ? WHERE experiment_id = ?`,
  [memoryId, params.experimentId]);  // ← WRONG: should be findingId

await pool.execute(`UPDATE darwin_candidates SET experiment_id = ?, finding_id = ? WHERE candidate_id = ?`,
  [params.experimentId, memoryId, params.candidateId]);  // ← WRONG: should be findingId
```

Additionally, `runHistoricalExperiment()` had `run_id, NULL` in the INSERT statement — the `runId`
parameter was never added to the function signature, so the job run ID was never written to the
experiment record.

---

## Fix Applied

### File: `server/darwin/darwin-j4-pattern-discovery.ts`

**Fix 1 — Back-link UPDATEs now use `findingId` (darwin_findings.finding_id):**

```typescript
// FIXED (v2): Both UPDATEs use findingId (darwin_findings.finding_id)
await pool.execute(`UPDATE darwin_experiment_records SET finding_id = ? WHERE experiment_id = ?`,
  [findingId, params.experimentId]);  // ← CORRECT: darwin_findings.finding_id

await pool.execute(`UPDATE darwin_candidates SET experiment_id = ?, finding_id = ? WHERE candidate_id = ?`,
  [params.experimentId, findingId, params.candidateId]);  // ← CORRECT: darwin_findings.finding_id
```

**Fix 2 — `runHistoricalExperiment()` now accepts and writes `runId`:**

```typescript
// FIXED (v2): runId parameter added to function signature and INSERT
export async function runHistoricalExperiment(candidateId: string, runId?: string): Promise<...>
// INSERT now includes: runId ?? null  (instead of NULL)
```

**Fix 3 — `persistFinding()` return value preserved for backward compatibility:**

`persistFinding()` continues to return `memoryId` (not `findingId`). This is intentional:
the chain result's `findingId` field is the `memory_id`, which is used by the notification
UPDATE (`WHERE memory_id = params.findingId`) and by the G17 test `G17-CHAIN-06`
(`WHERE memory_id = c.findingId`). The formal `darwin_findings.finding_id` is now
accessible via the `darwin_findings` table join.

### File: `server/darwin/darwin-dashboard-router.ts`

**Fix 4 — chain-trace now queries `darwin_findings` directly:**

The `/api/darwin/chain-trace` endpoint now queries `darwin_findings` by `result_id` (experiment_id)
to get the formal `finding_id`, and returns both `FINDING_ID` and `MEMORY_ID` as distinct fields,
plus `FINDING_MEMORY_IDS_DISTINCT: true` when they differ.

### File: `server/sprint-darwin-core-chain-gate-g17.test.ts`

**Fix 5 — New G17-FINDING-ID test suite (5 tests):**

Added `describe('G17-FINDING-ID: FINDING_ID and MEMORY_ID are distinct identifiers')` with 5 tests:
- `G17-FINDING-ID-01`: darwin_findings table has at least one row
- `G17-FINDING-ID-02`: darwin_findings.finding_id ≠ darwin_research_memory.memory_id
- `G17-FINDING-ID-03`: darwin_findings.result_id FK points to a valid experiment_id
- `G17-FINDING-ID-04`: darwin_research_memory.finding_id FK points to darwin_findings (not to itself)
- `G17-FINDING-ID-05`: chain-trace returns FINDING_MEMORY_IDS_DISTINCT=true

---

## Verification

### DB Verification (post-fix run, candidate 415f0797)

```
FINDING_ID:                f96fd2ff-02f0-4979-aadf-4cc6590cbd14
MEMORY_ID:                 7e09ea34-dc9e-4b33-b236-d3861989cc32
ID_CHECK:                  DISTINCT_OK
RUN_ID_IN_EXPERIMENT:      J4-1785453252380-1d0271d0
RUN_ID_CHECK:              RUN_ID_OK
CANDIDATE_FINDING_FK:      f96fd2ff (→ darwin_findings) CAND_FK_OK
EXPERIMENT_FINDING_FK:     f96fd2ff (→ darwin_findings) EXP_FK_OK
```

### Test Suite Result

```
G17-FINDING-ID-01: PASS
G17-FINDING-ID-02: PASS  (finding_id f96fd2ff ≠ memory_id 7e09ea34)
G17-FINDING-ID-03: PASS  (result_id 6349aead → experiment_id 6349aead)
G17-FINDING-ID-04: PASS  (memory.finding_id f96fd2ff → darwin_findings.finding_id f96fd2ff)
G17-FINDING-ID-05: PASS  (FINDING_MEMORY_IDS_DISTINCT=true from chain-trace)

TOTAL G17 TESTS: 59/59 PASS
```

---

## Historical Data Note

Rows created before this fix (before 2026-07-30T23:14:00Z) have `finding_id = memory_id`
in `darwin_experiment_records` and `darwin_candidates`. These rows are not retroactively
corrected — they are historical evidence of the bug. All new runs from this fix forward
will have correct FK relationships.

The `darwin_research_memory` table was never affected — its `finding_id` column was always
written correctly from the `darwin_findings` INSERT.
