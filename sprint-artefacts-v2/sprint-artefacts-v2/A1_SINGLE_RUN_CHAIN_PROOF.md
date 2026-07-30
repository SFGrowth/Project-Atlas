# Artefact A1 — Single-Run Chain Proof
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2 (corrected — FINDING_ID/MEMORY_ID conflation resolved)
## Produced: 2026-07-30T23:17:00Z

---

## Canonical Chain Run

This document records a single complete, fully-linked, autonomous chain run. All
7 IDs are distinct, all FK relationships are correct, and FINDING_ID ≠ MEMORY_ID.

### Chain Run Selected for Proof

The run at 2026-07-30T22:47:08Z was selected as the canonical proof run because:
1. It was triggered autonomously by a live observation (not a test or manual trigger)
2. It has a fully delivered Telegram notification (telegram_message_id=17, delivered=1)
3. It was produced by the corrected J4 code (post-fix)
4. All 7 chain links are populated with no NULLs in required fields

---

## 7-Link Chain

```
LINK 1 — SOURCE EVENT
  TABLE:              atlas_bars_1m
  SOURCE_EVENT_ID:    9054
  RAW_SYMBOL:         MNQU6
  BAR_OPEN_TS_MS:     1785452940000
  BAR_OPEN_UTC:       2026-07-30 22:29:00 UTC
  TRIGGER_TYPE:       Live 1-minute MNQ candle received via Databento feed

LINK 2 — OBSERVATION
  TABLE:              darwin_candidate_observations
  OBSERVATION_ID:     8b30ad08-b986-415d-8cea-56a1b3cf133e
  CANDIDATE_ID:       415f0797-141e-4958-a070-9dfb7bfbf652
  SOURCE_EVENT_ID:    9054 (FK → atlas_bars_1m.id ✓)
  TRIGGER_RULE_ID:    RULE-J4-001
  TRIGGER_RULE_VER:   1.0.0
  LINKED_AT:          2026-07-30T22:43:20Z

LINK 3 — HYPOTHESIS (CANDIDATE)
  TABLE:              darwin_candidates
  HYPOTHESIS_ID:      415f0797-141e-4958-a070-9dfb7bfbf652
  SOURCE_OBS_ID:      8b30ad08-b986-415d-8cea-56a1b3cf133e (FK → observation ✓)
  SOURCE_EVENT_ID:    9054 (FK → atlas_bars_1m.id ✓)
  RULE_ID:            RULE-J4-001
  RULE_VERSION:       1.0.0
  GOVERNANCE_STAGE:   HYPOTHESIS
  FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14 (FK → darwin_findings ✓)
  EXPERIMENT_ID:      6349aead-a945-4e3f-999b-2d3376818d40 (FK → experiment ✓)
  CREATED_AT:         2026-07-30T22:43:20Z

LINK 4 — JOB
  TABLE:              darwin_job_run_history
  JOB_ID:             J4-1785453252380-1d0271d0
  JOB_TYPE:           J4
  STATUS:             COMPLETED
  TRIGGERED_BY:       OBSERVATION:8b30ad08-b986-415d-8cea-56a1b3cf133e:CANDIDATE:415f0797-141e-4958-a070-9dfb7bfbf652
  TRIGGER_TYPE:       AUTONOMOUS (live observation, not manual or test)
  STARTED_AT:         2026-07-30T22:47:08Z
  COMPLETED_AT:       2026-07-30T22:47:08Z
  LIVE_CHART_AFFECTED: 0 (authority boundary respected)

LINK 5 — RESULT (EXPERIMENT)
  TABLE:              darwin_experiment_records
  RESULT_ID:          6349aead-a945-4e3f-999b-2d3376818d40
  CANDIDATE_ID:       415f0797-141e-4958-a070-9dfb7bfbf652 (FK → candidate ✓)
  RUN_ID:             J4-1785453252380-1d0271d0 (FK → job ✓)
  FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14 (FK → darwin_findings ✓, NOT memory_id)
  CLASSIFICATION:     INCONCLUSIVE
  SAMPLE_SIZE:        833
  P_VALUE:            0.8140
  H1_MEAN_RETURN:     -0.0019 pts
  H1_WIN_RATE:        46.9%
  CI_LOWER:           -0.0232
  CI_UPPER:            0.0204
  BH_FDR_SIGNIFICANT: 0 (not significant)
  RAW_P_VALUE:        0.8140
  ADJUSTED_P_VALUE:   0.8140
  LIVE_CHART_AFFECTED: 0

LINK 6 — FINDING (FORMAL FINDING RECORD)
  TABLE:              darwin_findings
  FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14
  RESULT_ID:          6349aead-a945-4e3f-999b-2d3376818d40 (FK → experiment ✓)
  CANDIDATE_ID:       415f0797-141e-4958-a070-9dfb7bfbf652 (FK → candidate ✓)
  CLASSIFICATION:     INCONCLUSIVE
  RAW_P_VALUE:        0.8140
  ADJUSTED_P_VALUE:   0.8140
  BH_FDR_SIGNIFICANT: 0
  CREATED_AT:         2026-07-30T22:47:08Z

  *** FINDING_ID (f96fd2ff) ≠ MEMORY_ID (7e09ea34) — DISTINCT ✓ ***

LINK 6b — MEMORY (RESEARCH MEMORY RECORD)
  TABLE:              darwin_research_memory
  MEMORY_ID:          7e09ea34-dc9e-4b33-b236-d3861989cc32
  FINDING_ID:         f96fd2ff-02f0-4979-aadf-4cc6590cbd14 (FK → darwin_findings ✓)
  EXPERIMENT_ID:      6349aead-a945-4e3f-999b-2d3376818d40 (FK → experiment ✓)
  SOURCE_OBS_ID:      8b30ad08-b986-415d-8cea-56a1b3cf133e (FK → observation ✓)
  SOURCE_EVENT_ID:    9054 (FK → atlas_bars_1m.id ✓)
  RULE_ID:            RULE-J4-001
  RULE_VERSION:       1.0.0
  NOTIFICATION_ID:    223 (FK → notification_log ✓)
  TELEGRAM_MESSAGE_ID: 17
  CREATED_AT:         2026-07-30T22:47:08Z

LINK 7 — NOTIFICATION
  TABLE:              notification_log
  NOTIFICATION_ID:    223
  TYPE:               DARWIN_FINDING
  DELIVERED:          1
  TELEGRAM_MESSAGE_ID: 17
  SENT_AT:            2026-07-30T22:47:08Z
  CHANNEL:            Telegram (external delivery confirmed)
```

---

## FK Integrity Summary

| FK Relationship | Expected | Actual | Status |
|----------------|----------|--------|--------|
| experiment.candidate_id → candidates.candidate_id | 415f0797 | 415f0797 | ✓ PASS |
| experiment.run_id → job_run_history.run_id | J4-1785453252380-1d0271d0 | J4-1785453252380-1d0271d0 | ✓ PASS |
| experiment.finding_id → darwin_findings.finding_id | f96fd2ff | f96fd2ff | ✓ PASS |
| darwin_findings.result_id → experiment.experiment_id | 6349aead | 6349aead | ✓ PASS |
| darwin_findings.candidate_id → candidates.candidate_id | 415f0797 | 415f0797 | ✓ PASS |
| memory.finding_id → darwin_findings.finding_id | f96fd2ff | f96fd2ff | ✓ PASS |
| memory.experiment_id → experiment.experiment_id | 6349aead | 6349aead | ✓ PASS |
| memory.source_observation_id → observations.observation_id | 8b30ad08 | 8b30ad08 | ✓ PASS |
| memory.notification_id → notification_log.id | 223 | 223 | ✓ PASS |
| candidates.finding_id → darwin_findings.finding_id | f96fd2ff | f96fd2ff | ✓ PASS |
| candidates.experiment_id → experiment.experiment_id | 6349aead | 6349aead | ✓ PASS |

**FINDING_ID ≠ MEMORY_ID: f96fd2ff ≠ 7e09ea34 — DISTINCT ✓**

---

## Trigger Autonomy Proof

```
TRIGGERED_BY field: "OBSERVATION:8b30ad08-b986-415d-8cea-56a1b3cf133e:CANDIDATE:415f0797-141e-4958-a070-9dfb7bfbf652"
TRIGGER_PREFIX:     OBSERVATION: (not MANUAL: or TEST: or SCHEDULER:)
MANUAL_INSERTION:   FALSE
TEST_TRIGGER:       FALSE
CRON_TRIGGER:       FALSE (J4 is triggered by live observations, not cron)
AUTONOMOUS:         TRUE
```

The `triggered_by` field format `OBSERVATION:<obs_id>:CANDIDATE:<cand_id>` is set
by `createJobRecord()` in J4, which is called only when a live qualifying observation
is found by `findLatestQualifyingObservation()`. This function queries `darwin_observations`
for bars where `bar_range >= 1.5 × atr` — a live data condition that cannot be
satisfied without a real Databento feed event.

---

## Authority Boundary

```
LIVE_CHART_AFFECTED:    0 (darwin_experiment_records)
LIVE_CHART_AFFECTED:    0 (darwin_job_run_history)
TRADERSPOST_CALLS:      0 (verified by G17-AUTH-02)
TRADOVATE_CALLS:        0 (verified by G17-AUTH-03)
PROCESSBAR_CALLS:       0 (verified by G17-AUTH-01)
DARWIN_DECISION_AUTH:   DISABLED
DARWIN_EXECUTION_AUTH:  DISABLED
LIVE_TRADES_INITIATED:  0
```
