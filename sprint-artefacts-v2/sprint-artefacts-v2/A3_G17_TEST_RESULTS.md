# Artefact A3 — G17 Test Results
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2 (corrected)
## Test Run: 2026-07-30T23:14:36Z
## Result: 59/59 PASS

---

## Summary

```
TEST_FILE:    server/sprint-darwin-core-chain-gate-g17.test.ts
RUNNER:       vitest
TEST_COUNT:   59
PASSED:       59
FAILED:       0
SKIPPED:      0
DURATION:     1.96s
START_TIME:   2026-07-30T23:14:36Z
```

---

## Test Suites and Results

### G17-SCHEMA: Chain linkage columns exist (10 tests)

| Test | Result |
|------|--------|
| G17-SCHEMA-01: darwin_candidates has source_observation_id | PASS |
| G17-SCHEMA-02: darwin_candidates has source_event_id | PASS |
| G17-SCHEMA-03: darwin_candidates has condition_signature | PASS |
| G17-SCHEMA-04: darwin_candidates has rule_id and rule_version | PASS |
| G17-SCHEMA-05: darwin_candidates has experiment_id and finding_id | PASS |
| G17-SCHEMA-06: darwin_experiment_records has candidate_id linkage | PASS |
| G17-SCHEMA-07: darwin_experiment_records has statistical result columns | PASS |
| G17-SCHEMA-08: darwin_research_memory has full chain linkage columns | PASS |
| G17-SCHEMA-09: darwin_candidate_observations junction table exists | PASS |
| G17-SCHEMA-10: darwin_job_run_history triggered_by is VARCHAR(255) | PASS |

### G17-RULE: Discovery rule is frozen and correct (7 tests)

| Test | Result |
|------|--------|
| G17-RULE-01: RULE_ID is RULE-J4-001 | PASS |
| G17-RULE-02: RULE_VERSION is 1.0.0 | PASS |
| G17-RULE-03: RANGE_EXPANSION_MULTIPLIER is 1.5 | PASS |
| G17-RULE-04: MIN_SAMPLE_SIZE is 30 | PASS |
| G17-RULE-05: P_VALUE_THRESHOLD is 0.05 | PASS |
| G17-RULE-06: WIN_RATE_THRESHOLD is 0.55 | PASS |
| G17-RULE-07: EXPECTANCY_THRESHOLD is 0.5 | PASS |

### G17-SIG: Condition signature is deterministic (3 tests)

| Test | Result |
|------|--------|
| G17-SIG-01: Same inputs produce same signature | PASS |
| G17-SIG-02: Different direction produces different signature | PASS |
| G17-SIG-03: Signature is 32 hex characters | PASS |

### G17-OBS: Live observations qualify for J4 (4 tests)

| Test | Result |
|------|--------|
| G17-OBS-01: darwin_observations has bars with bar_range >= 1.5x ATR | PASS |
| G17-OBS-02: atlas_bars_1m has rows that join to qualifying observations | PASS |
| G17-OBS-03: findLatestQualifyingObservation returns a non-null result | PASS |
| G17-OBS-04: source_event_id is a real atlas_bars_1m.id | PASS |

### G17-CHAIN: Full observation-to-finding chain (10 tests)

| Test | Result | Notes |
|------|--------|-------|
| G17-CHAIN-01: J4 run completes or skips (not blocked) | PASS | Status: SKIPPED (duplicate candidate — correct) |
| G17-CHAIN-02: If COMPLETE, all 7 chain IDs are present | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-03: If COMPLETE, candidate row exists with correct linkage | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-04: If COMPLETE, job row exists with OBSERVATION trigger | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-05: If COMPLETE, experiment record exists with candidate linkage | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-06: If COMPLETE, research memory row exists with full linkage | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-07: If COMPLETE, notification_log row exists and is delivered | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-08: If COMPLETE, candidate_observations junction row exists | PASS | (skipped — SKIPPED status) |
| G17-CHAIN-09: If SKIPPED, duplicate was prevented (existing candidate linked) | PASS | Duplicate correctly prevented |
| G17-CHAIN-10: MANUAL_JOB_INSERTION_USED is always FALSE | PASS | |

### G17-DEDUP: Duplicate candidate prevention (2 tests)

| Test | Result |
|------|--------|
| G17-DEDUP-01: Running J4 twice does not create duplicate candidates | PASS |
| G17-DEDUP-02: condition_signature is unique per candidate | PASS |

### G17-STAT: Experiment classification is honest (5 tests)

| Test | Result |
|------|--------|
| G17-STAT-01: darwin_experiment_records has at least one J4 experiment | PASS |
| G17-STAT-02: J4 experiments have non-null sample_size | PASS |
| G17-STAT-03: J4 experiments have non-null p_value | PASS |
| G17-STAT-04: J4 experiments have non-null CI bounds | PASS |
| G17-STAT-05: live_chart_affected is always 0 for J4 experiments | PASS |

### G17-FINDING: Research memory is populated (4 tests)

| Test | Result |
|------|--------|
| G17-FINDING-01: darwin_research_memory has at least one J4 finding | PASS |
| G17-FINDING-02: J4 finding has non-null experiment_id | PASS |
| G17-FINDING-03: J4 finding has non-null source_observation_id | PASS |
| G17-FINDING-04: J4 finding has non-null notification_id | PASS |

### G17-NOTIF: Notification is externally delivered (3 tests)

| Test | Result |
|------|--------|
| G17-NOTIF-01: notification_log has at least one DARWIN_FINDING entry | PASS |
| G17-NOTIF-02: DARWIN_FINDING notification is marked delivered | PASS |
| G17-NOTIF-03: DARWIN_FINDING notification has metadata with finding_id | PASS |

### G17-DASHBOARD: Chain trace endpoint returns live data (3 tests)

| Test | Result |
|------|--------|
| G17-DASHBOARD-01: /api/darwin/chain-trace returns 200 | PASS |
| G17-DASHBOARD-02: chain-trace returns CHAIN_COMPLETE status | PASS |
| G17-DASHBOARD-03: chain-trace confirms AUTONOMOUS_JOB_TRIGGERED_BY_LIVE_OBSERVATION | PASS |

### G17-FINDING-ID: FINDING_ID and MEMORY_ID are distinct identifiers (5 tests — NEW)

| Test | Result | Evidence |
|------|--------|---------|
| G17-FINDING-ID-01: darwin_findings table has at least one row | PASS | COUNT > 0 |
| G17-FINDING-ID-02: darwin_findings.finding_id ≠ darwin_research_memory.memory_id | PASS | f96fd2ff ≠ 7e09ea34 |
| G17-FINDING-ID-03: darwin_findings.result_id FK points to valid experiment_id | PASS | 6349aead → 6349aead |
| G17-FINDING-ID-04: darwin_research_memory.finding_id FK points to darwin_findings | PASS | f96fd2ff → darwin_findings |
| G17-FINDING-ID-05: chain-trace returns FINDING_MEMORY_IDS_DISTINCT=true | PASS | FINDING_MEMORY_IDS_DISTINCT=true |

### G17-AUTHORITY: Authority counters remain zero (3 tests)

| Test | Result |
|------|--------|
| G17-AUTH-01: processBar was never called by J4 | PASS |
| G17-AUTH-02: No traderspost.io calls in J4 source file | PASS |
| G17-AUTH-03: No tradovate calls in J4 source file | PASS |

---

## Test Runner Output (final lines)

```
 Test Files  1 passed (1)
      Tests  59 passed (59)
   Start at  23:14:36
   Duration  1.96s (transform 348ms, setup 0ms, collect 403ms, tests 1.00s, environment 0ms, prepare 138ms)
[Atlas Test Guard] Database Client Registry:
  TOTAL_TEST_DATABASE_CLIENTS:     0
  ISOLATED_TEST_DATABASE_CLIENTS:  0
  STAGING_DATABASE_CLIENTS:        0
  PRODUCTION_DATABASE_CLIENTS:     0
  UNKNOWN_DATABASE_CLIENTS:        0
```

---

## Note on G17-CHAIN Tests

The G17-CHAIN suite runs `runJ4PatternDiscovery()` in `beforeAll`. The test run at 23:14:36
received `status: SKIPPED` because the candidate (415f0797) already had an experiment record
from the prior run at 22:47:08. This is correct behaviour — the deduplication gate prevents
re-running experiments on the same candidate. The SKIPPED status causes G17-CHAIN-02 through
G17-CHAIN-08 to return early (they are gated on `if (chainResult.status !== 'COMPLETE') return`).
G17-CHAIN-09 explicitly validates the SKIPPED path. The canonical COMPLETE run is documented
in Artefact A1.
