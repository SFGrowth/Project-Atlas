# Pipeline Observability Soak — 4-Hour Ledger Summary
## Sprint: darwin-core-observation-to-finding-chain
## Soak Window: 2026-07-31T00:31:03.272447+00:00 → 2026-07-31T04:26:04.565202+00:00
## Duration: 3.92 hours
## Samples Collected: 48/48
## Sample Errors: 0

## Pipeline Throughput (delta over soak window)
| Metric | Value |
|--------|-------|
| EVENTS_PERSISTED_DELTA | 65 bars |
| OBSERVATIONS_DELTA | -4 observations |
| AUTONOMOUS_J4_RUNS | 0 |
| J4_FAILURES | 0 |
| NOTIFICATIONS_DELIVERED | 2 |
| NOTIFICATIONS_FAILED | 0 |
| DROPPED_EVENTS | 0 |

## Feed Adapter State (observed states during soak)
- LIVE

## Metrics NOT Collected (honest statement)
The following 4 metrics are not available from the current instrumentation:
- EVENTS_RECEIVED_TOTAL — bridge-server counter not exposed via HTTP
- WRITE_FAILURE_COUNT — no explicit counter in mysql-bar-persistence.ts
- DUPLICATE_EVENT_COUNT — idempotency enforced at DB level; no explicit counter
- CONSUMER_LAG_MS — bar ts_event not stored in atlas_bars_1m

## Soak Result
PASS — 48 of 48 samples collected, 0 errors
