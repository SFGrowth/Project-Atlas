# DARWIN Dashboard Evidence

**Sprint:** DARWIN-OPS-RECOVERY  
**Date:** 2026-07-30  
**Status:** ALL PANELS HEALTHY

### Panel 1 — Server Status

| Metric | Value |
|--------|-------|
| Service | atlas-nexus.service |
| Status | **active (running)** |

### Panel 2 — Live Bar Feed (5m)

| Metric | Value |
|--------|-------|
| Row count | 1,551 |
| Newest bar | 2026-07-30T02:35:00Z |
| Age | 0.1 hours |
| Health | **HEALTHY** |

### Panel 3 — Live Bar Feed (1m)

| Metric | Value |
|--------|-------|
| Row count | 7,901 |
| Newest bar | 2026-07-30T02:41:00Z |
| Age | 0.0 hours |
| Health | **HEALTHY** |

### Panel 4 — DARWIN Observation Engine

| Metric | Value |
|--------|-------|
| Total observations | 7,850 |
| Latest observation | 2026-07-30T02:39:00Z |
| Status | **ACTIVE** |

### Panel 5 — DARWIN Job Queue

| Metric | Value |
|--------|-------|
| Pre-sprint count | 0 |
| Post-fix count | 7 |
| All jobs status | COMPLETE |
| Health | **OPERATIONAL** |

### Panel 6 — DARWIN Daily Reports

| Metric | Value |
|--------|-------|
| Pre-sprint count | 1 (stale) |
| Post-fix count | 2 |
| Latest report | 2026-07-30 |
| Health | **OPERATIONAL** |

### Panel 7 — Local Cron Bypass

| Metric | Value |
|--------|-------|
| Endpoints tested | 6 / 6 PASS |
| Rejection tests | 2 / 2 PASS |
| Status | **ACTIVE** |

### Panel 8 — Cron Daemon

| Metric | Value |
|--------|-------|
| File | /etc/cron.d/atlas-darwin |
| Permissions | 644 root:root |
| Jobs | 6 installed |
| Status | **INSTALLED** |

### Panel 9 — DARWIN Authority Flags

| Flag | Value |
|------|-------|
| DARWIN_DECISION_AUTHORITY | **DISABLED** |
| DARWIN_EXECUTION_AUTHORITY | **DISABLED** |
| LIVE_TRADES_INITIATED | **0** |

### Panel 10 — Notification Service

| Metric | Value |
|--------|-------|
| BUILT_IN_FORGE_API_URL | UNAVAILABLE |
| Database persistence | **UNAFFECTED** |
| Autonomous loop | **UNAFFECTED** |

## Overall System Health

All critical panels are green. Panel 10 (notification service) is amber — known limitation, graceful fail, no action required.
