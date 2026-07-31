# B7 — Pipeline Observability Soak Ledger
## Sprint: darwin-core-observation-to-finding-chain
## Artefact: B7
## Generated: 2026-07-31T04:26:19Z

---

## Soak Summary

| Field | Value |
|---|---|
| **Soak Start** | 2026-07-31T00:31:03.272481+00:00 |
| **Soak End** | 2026-07-31T04:26:04.538169+00:00 |
| **Duration (hours)** | 3.9170 |
| **Expected Duration (hours)** | 3.9167 |
| **Samples Collected** | 48 |
| **Target Samples** | 48 |
| **Errors** | 0 |
| **Bad Intervals** | 0 |
| **Duplicate Intervals** | 0 |
| **Interval Tolerance** | ±30 seconds from 300s |

---

## Validation Result

```
SOAK_VALIDATION: PASS
SAMPLES_COLLECTED: 48
TARGET_SAMPLES: 48
ERRORS: 0
BAD_INTERVALS: 0
DUPLICATE_INTERVALS: 0
MISSING_INTERVALS: 0
DURATION_HOURS: 3.9170
SOAK_INTERRUPTED: FALSE
LIVE_SERVICES_RESTARTED: FALSE
LIVE_SCHEMA_ALTERED: FALSE
CRON_CHANGED: FALSE
ENV_CHANGED: FALSE
```

---

## Required Counters

| Counter | Value |
|---|---|
| SAMPLES_EXPECTED | 48 |
| SAMPLES_COLLECTED | 48 |
| SAMPLES_MISSING | 0 |
| SAMPLES_DUPLICATE | 0 |
| COLLECTION_ERRORS | 0 |
| BAD_INTERVAL_COUNT | 0 |
| SOAK_PASS | TRUE |
| SOAK_INTERRUPTED | FALSE |

---

## Notification Rate-Limit Analysis

The notification system was not exercised during the soak window. The soak collector
is a passive Python script that reads pipeline health endpoints only. No notifications
were triggered. The notification rate-limit service (notificationRetryService.ts)
was not modified during the soak window.

| Metric | Value |
|---|---|
| NOTIFICATIONS_SENT_DURING_SOAK | 0 |
| RATE_LIMIT_EVENTS | 0 |
| RETRY_EVENTS | 0 |
| NOTIFICATION_FAILURES | 0 |

---

## Retry Governance Evidence

No retry events occurred during the soak. The retry governance service
(notificationRetryService.ts) was deployed and active throughout the measurement
window. No jobs entered the failed retry queue during the soak period.

| Metric | Value |
|---|---|
| RETRY_QUEUE_ENTRIES_DURING_SOAK | 0 |
| MAX_RETRIES_EXCEEDED | 0 |
| PERMANENT_FAILURES | 0 |
| CRITICAL_ALERTS_DROPPED | 0 |

---

## Soak Ledger (All 48 Samples)

The raw ledger is stored at:
`sprint-artefacts-v3/soak_ledger.json`

Samples are spaced at 300-second (5-minute) intervals matching the live TradingView
Pine Script M-16 webhook cadence. All 48 intervals were within the ±30s tolerance.

| # | Approximate Timestamp (UTC) | Status |
|---|---|---|
| 1 | 2026-07-31T00:31:03 | OK |
| 2 | 2026-07-31T00:36:03 | OK |
| 3 | 2026-07-31T00:41:03 | OK |
| 4 | 2026-07-31T00:46:03 | OK |
| 5 | 2026-07-31T00:51:03 | OK |
| 6 | 2026-07-31T00:56:03 | OK |
| 7 | 2026-07-31T01:01:03 | OK |
| 8 | 2026-07-31T01:06:03 | OK |
| 9 | 2026-07-31T01:11:03 | OK |
| 10 | 2026-07-31T01:16:03 | OK |
| 11 | 2026-07-31T01:21:03 | OK |
| 12 | 2026-07-31T01:26:03 | OK |
| 13 | 2026-07-31T01:31:03 | OK |
| 14 | 2026-07-31T01:36:03 | OK |
| 15 | 2026-07-31T01:41:03 | OK |
| 16 | 2026-07-31T01:46:03 | OK |
| 17 | 2026-07-31T01:51:03 | OK |
| 18 | 2026-07-31T01:56:03 | OK |
| 19 | 2026-07-31T02:01:03 | OK |
| 20 | 2026-07-31T02:06:03 | OK |
| 21 | 2026-07-31T02:11:03 | OK |
| 22 | 2026-07-31T02:16:03 | OK |
| 23 | 2026-07-31T02:21:03 | OK |
| 24 | 2026-07-31T02:26:03 | OK |
| 25 | 2026-07-31T02:31:03 | OK |
| 26 | 2026-07-31T02:36:03 | OK |
| 27 | 2026-07-31T02:41:03 | OK |
| 28 | 2026-07-31T02:46:03 | OK |
| 29 | 2026-07-31T02:51:03 | OK |
| 30 | 2026-07-31T02:56:03 | OK |
| 31 | 2026-07-31T03:01:03 | OK |
| 32 | 2026-07-31T03:06:03 | OK |
| 33 | 2026-07-31T03:11:03 | OK |
| 34 | 2026-07-31T03:16:03 | OK |
| 35 | 2026-07-31T03:21:03 | OK |
| 36 | 2026-07-31T03:26:03 | OK |
| 37 | 2026-07-31T03:31:03 | OK |
| 38 | 2026-07-31T03:36:03 | OK |
| 39 | 2026-07-31T03:41:03 | OK |
| 40 | 2026-07-31T03:46:03 | OK |
| 41 | 2026-07-31T03:51:03 | OK |
| 42 | 2026-07-31T03:56:03 | OK |
| 43 | 2026-07-31T04:01:03 | OK |
| 44 | 2026-07-31T04:06:03 | OK |
| 45 | 2026-07-31T04:11:03 | OK |
| 46 | 2026-07-31T04:16:03 | OK |
| 47 | 2026-07-31T04:21:04 | OK |
| 48 | 2026-07-31T04:26:04 | OK |

---

## Cycle 003 Specification Reconciliation

Cycle 003 was NOT run during this sprint per explicit instruction.

```
CYCLE_003_RUN: FALSE
CYCLE_003_BLOCKED_BY: EXPLICIT_INSTRUCTION
```

---

## Evidence Lock

```
CURRENT_SOAK_COMPLETED: TRUE
CURRENT_SOAK_EVIDENCE_LOCKED: TRUE
SOAK_VALIDATION: PASS
SOAK_INTERRUPTED: FALSE
LIVE_SERVICES_RESTARTED_DURING_SOAK: FALSE
LIVE_SCHEMA_ALTERED_DURING_SOAK: FALSE
CRON_CHANGED_DURING_SOAK: FALSE
ENV_CHANGED_DURING_SOAK: FALSE
COLLECTOR_INTERRUPTED: FALSE
```

---

## Autonomous GitHub Archival

```
PASS_AUTONOMOUS_GITHUB_ARCHIVAL: PENDING
EXPECTED_TRIGGER: 2026-07-31T22:00:00Z
RELEASE_GATE_STATUS: WITHHELD_PENDING_SCHEDULED_ARCHIVAL
```

The 22:00 UTC daily cron will trigger the autonomous GitHub archival.
A follow-up session will confirm the result and make the final evidence-only commit.
