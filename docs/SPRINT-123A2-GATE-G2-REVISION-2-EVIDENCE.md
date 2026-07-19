# Sprint 123A.2 — Gate G2 Revision 2 Evidence
**Branch:** `sprint/123a-2-databento-adapter`
**Commit:** `6035b5f`
**Date:** 2026-07-19
**Reviewer gate:** G2 Revision 2 (12 requirements)

---

## Executive Summary

All 12 Gate G2 Revision 2 requirements are implemented and verified. The full test suite passes: **114 Python tests** and **20 TypeScript tests** (134 total), zero failures, zero live API calls.

---

## Test Manifest

### Python Test Suite — 114 tests, all passing

| Test ID | File | Description | Result |
|---------|------|-------------|--------|
| TEST-123A2-R001 | test_replay_client.py | Out-of-order trade records are skipped | PASS |
| TEST-123A2-R002 | test_replay_client.py | Duplicate trade records (same sequence) are skipped | PASS |
| TEST-123A2-R003 | test_replay_client.py | Cancellation via asyncio.Event stops the stream | PASS |
| TEST-123A2-R004 | test_replay_client.py | Invalid range (end ≤ start) raises ValueError | PASS |
| TEST-123A2-R005 | test_replay_client.py | Replay window > 7 days raises ValueError | PASS |
| TEST-123A2-R006 | test_replay_client.py | 429 rate-limit triggers exponential backoff and retry | PASS |
| TEST-123A2-R007 | test_replay_client.py | After MAX_RETRIES failures, recovery-failed is emitted | PASS |
| TEST-123A2-R008 | test_replay_client.py | recover_definitions yields definition envelopes | PASS |
| TEST-123A2-R009 | test_replay_client.py | recover_symbol_mappings yields symbol-mapping envelopes | PASS |
| TEST-123A2-R010 | test_replay_client.py | Empty historical response yields recovery-complete | PASS |
| TEST-123A2-R011 | test_replay_client.py | Stream ending before end_ts_ns yields recovery-partial | PASS |
| TEST-123A2-R012 | test_replay_client.py | DATABENTO_API_KEY never appears in any bridge envelope | PASS |
| TEST-123A2-M001 | test_recovery_manager.py | request_recovery emits recovery-requested event | PASS |
| TEST-123A2-M002 | test_recovery_manager.py | Recovery emits recovery-started before streaming | PASS |
| TEST-123A2-M003 | test_recovery_manager.py | Successful recovery increments recovery_count | PASS |
| TEST-123A2-M004 | test_recovery_manager.py | Failed recovery increments recovery_failures | PASS |
| TEST-123A2-M005 | test_recovery_manager.py | Duplicate recovery request for same schema is ignored | PASS |
| TEST-123A2-M006 | test_recovery_manager.py | on_complete callback is invoked after successful recovery | PASS |
| TEST-123A2-M007 | test_recovery_manager.py | on_failed callback is invoked after failed recovery | PASS |
| TEST-123A2-M008 | test_recovery_manager.py | Recovery timeout emits recovery-failed with TIMEOUT code | PASS |
| TEST-123A2-H001 | test_health_states.py | All 11 required health states are defined in FeedState | PASS |
| TEST-123A2-H002 | test_health_states.py | bridge-health record contains all Section 7 required fields | PASS |
| TEST-123A2-H003 | test_health_states.py | backpressure-state record contains required fields | PASS |
| TEST-123A2-H004 | test_health_states.py | LIVE not reported when bridge disconnected (OFFLINE) | PASS |
| TEST-123A2-H005 | test_health_states.py | LIVE not reported when queue overflowing (DEGRADED) | PASS |
| TEST-123A2-H006 | test_health_states.py | LIVE not reported during recovery (RECOVERING) | PASS |
| TEST-123A2-H007 | test_health_states.py | LIVE not reported when stale (STALE) | PASS |
| TEST-123A2-H008 | test_health_states.py | LIVE not reported during authentication (AUTHENTICATING) | PASS |
| TEST-123A2-H009 | test_health_states.py | LIVE not reported when disabled (DISABLED) | PASS |
| TEST-123A2-H010 | test_health_states.py | DATABENTO_API_KEY never appears in bridge-health record | PASS |
| TEST-123A2-H011 | test_health_states.py | STOPPED state bridge-health record is correctly formed | PASS |

The remaining 83 Python tests are pre-existing tests from Gate G2 Round 2 (WS1 overflow policy: 7, WS2 historical client: 10, WS3 DBN fixtures: 10, feed adapter: 46, symbol resolver: 10).

### TypeScript Test Suite — 20 tests, all passing

| Test ID | Description | Result |
|---------|-------------|--------|
| TEST-123A2-TS001 | validateBridgeTopology passes for default localhost | PASS |
| TEST-123A2-TS002 | validateBridgeTopology passes for explicit 127.0.0.1 | PASS |
| TEST-123A2-TS003 | validateBridgeTopology throws for non-private address without TLS | PASS |
| TEST-123A2-TS004 | validateBridgeTopology passes for public IP with TLS (Topology 3) | PASS |
| TEST-123A2-TS005 | validateBridgeTopology passes for Docker private address with TLS | PASS |
| TEST-123A2-TS006 | validateBridgeTopology passes for private 192.168.x.x without TLS | PASS |
| TEST-123A2-TS007 | validateBridgeTopology passes for 172.17.x.x Docker bridge | PASS |
| TEST-123A2-TS008 | validateBridgeTopology throws for 172.32.x.x (not RFC 1918) | PASS |
| TEST-123A2-TS009 | Constructor throws if BRIDGE_AUTH_TOKEN not set | PASS |
| TEST-123A2-TS010 | Bridge session ID is a non-empty UUID string | PASS |
| TEST-123A2-TS011 | Two server instances have different bridge session IDs | PASS |
| TEST-123A2-TS012 | getStats() does not contain BRIDGE_AUTH_TOKEN | PASS |
| TEST-123A2-TS013 | toJSON() does not contain BRIDGE_AUTH_TOKEN | PASS |
| TEST-123A2-TS014 | isReadyToReceive returns false when server not started | PASS |
| TEST-123A2-TS015 | getStats reflects initial state correctly | PASS |
| TEST-123A2-TS016 | BRIDGE_PROTOCOL_VERSION is 123A.2 | PASS |
| TEST-123A2-TS017 | Server constructs successfully with valid token and localhost | PASS |
| TEST-123A2-TS018 | bridgeSessionId is set at construction time | PASS |
| TEST-123A2-TS019 | BRIDGE_HOST defaults to 127.0.0.1 when env not set | PASS |
| TEST-123A2-TS020 | stop() on a non-started server does not throw | PASS |

---

## Requirement Coverage

### Requirement 1 — Replay Client (`replay_client.py`)

`DatabentoReplayClient` provides three async generator methods:

- `replay_trades(symbol, start_ts_ns, end_ts_ns, cancel_event)` — trade replay with out-of-order detection (skips records where `ts_event < last_ts_ns`) and duplicate detection (by sequence number using a `Set[int]`).
- `recover_definitions(start_ts_ns, end_ts_ns, cancel_event)` — instrument definition recovery.
- `recover_symbol_mappings(symbol, start_ts_ns, end_ts_ns, cancel_event)` — symbol mapping recovery.

All three methods enforce: replay window ≤ 7 days, exponential backoff on 429 errors, cancellation via `asyncio.Event`, and deterministic terminal envelopes (`recovery-complete`, `recovery-partial`, `recovery-failed`). The PEP 479 sentinel fix is applied to `_iter_records`.

### Requirement 2 — Recovery Manager (`recovery_manager.py`)

`RecoveryManager` manages the full gap recovery lifecycle:

- Accepts a `GapRecord` and a historical client, emits `recovery-requested` immediately.
- Enforces `RECOVERY_TIMEOUT_S` (default 300s) via `asyncio.timeout`.
- Prevents duplicate recovery for the same schema via `_active` dict and `asyncio.Lock`.
- Emits `recovery-started` before streaming, `recovery-progress` every 100 records.
- Increments `recovery_count` on complete/partial, `recovery_failures` on failed/timeout.
- Invokes `on_complete(schema)` or `on_failed(schema)` callbacks after stream ends.
- Exposes `recovery_count` and `recovery_failures` as read-only properties.

### Requirement 3 — Extended Bridge Records (`bridge_records.py`)

All 8 recovery event types are implemented with full field contracts:

| Schema | Factory Function | Required Fields |
|--------|-----------------|-----------------|
| `gap-detected` | `make_gap_detected_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, first/last_missing_ts_ns, records_lost, atlas_processing_ts_ms |
| `recovery-requested` | `make_recovery_requested_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, start/end_ts_ns, retry_count, atlas_processing_ts_ms |
| `recovery-started` | `make_recovery_started_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, start/end_ts_ns, atlas_processing_ts_ms |
| `recovery-progress` | `make_recovery_progress_record` | recovery_id, schema, records_received, last_ts_ns, end_ts_ns, atlas_processing_ts_ms |
| `recovery-complete` | `make_recovery_complete_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, records_recovered, start/end_ts_ns, completion_status, atlas_processing_ts_ms |
| `recovery-partial` | `make_recovery_partial_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, records_recovered, start/end_ts_ns, actual_end_ts_ns, completion_status, atlas_processing_ts_ms |
| `recovery-failed` | `make_recovery_failed_record` | recovery_id, schema, dataset, raw_symbol, instrument_id, reason, retry_count, error_code, start/end_ts_ns, completion_status, atlas_processing_ts_ms |
| `backpressure-state` | `make_backpressure_state_record` | schema, queue_depth, queue_capacity, backpressure_count, state, atlas_processing_ts_ms |

Recovery IDs are deterministic: `"rcv-{sha256(schema:start_ts_ns:end_ts_ns)[:16]}"`.

### Requirement 4 — Bridge Server Authentication Hardening (`bridge-server.ts`)

The `DatabentoBridgeServer` now enforces:

| Control | Implementation | Default |
|---------|---------------|---------|
| Auth timeout | `AUTH_TIMEOUT_MS` env var | 5000ms |
| Rate limiting | `MAX_CONNECTIONS_PER_MINUTE` | 10/min |
| Max unauthenticated | `MAX_UNAUTHENTICATED_CONNECTIONS` | 3 |
| Max message size | `MAX_MESSAGE_BYTES` | 512KB |
| Session ID | `bridgeSessionId = randomUUID()` | Per-start |
| Stale connection | `STALE_CONNECTION_TIMEOUT_MS` | 60s |
| Duplicate adapter | Supersede policy (close old, accept new) | — |
| Graceful shutdown | `stop()` emits `bridge-health` STOPPED | — |
| Token comparison | `timingSafeEqual(sha256(a), sha256(b))` | — |
| Secret redaction | `toJSON()` returns `getStats()` only | — |

### Requirement 5 — Health States (`FeedState` in `bridge_records.py`)

All 11 health states are defined as a `Literal` type:

`DISABLED` | `STARTING` | `AUTHENTICATING` | `LIVE` | `DEGRADED` | `BACKPRESSURED` | `RECOVERING` | `STALE` | `OFFLINE` | `ERROR` | `STOPPED`

The `make_bridge_health_record` factory emits all Section 7 observability counters: `queue_depth`, `queue_capacity`, `records_received`, `records_rejected`, `recovery_count`, `recovery_failures`, `reconnect_attempts`, `last_error`, `active_schemas`, `current_raw_contract`, `adapter_instance_id`, `bridge_session_id`.

### Requirement 6 — Authority Boundary

No authority boundary violations were introduced. All Python files include the authority boundary comment block. The bridge server's `dispatchRecord` method emits to `AtlasEventBus` only — it does not call `processBar`, `postBarAutomation`, or any strategy function. The `isReadyToReceive()` method checks `getMarketDataAuthority()` before accepting records.

### Requirement 7 — Secret Safety

Verified across all new files:
- `DATABENTO_API_KEY` never appears in any bridge envelope, log message, or error response.
- `BRIDGE_AUTH_TOKEN` never appears in `getStats()`, `toJSON()`, or any log message.
- Token comparison uses `timingSafeEqual` on SHA-256 hashes (constant-time).
- Rejected connections receive only `{ error: "Unauthorized" }`.

---

## Files Delivered

### New files (Revision 2)

| File | Lines | Purpose |
|------|-------|---------|
| `services/databento-feed/replay_client.py` | 350 | Replay client with OOO/dup detection, definition/symbol-mapping recovery, cancellation |
| `services/databento-feed/recovery_manager.py` | 357 | Gap lifecycle management, timeout, callbacks, duplicate prevention |
| `services/databento-feed/tests/test_replay_client.py` | 290 | 12 tests for replay_client.py |
| `services/databento-feed/tests/test_recovery_manager.py` | 240 | 8 tests for recovery_manager.py |
| `services/databento-feed/tests/test_health_states.py` | 200 | 11 tests for all FeedState health states |

### Updated files (Revision 2)

| File | Change Summary |
|------|---------------|
| `server/market-data/bridge-server.ts` | Auth timeout, rate-limit, max-size, session ID, stale-connection, duplicate adapter, graceful shutdown, toJSON() secret redaction |
| `server/market-data/tests/sprint-123a2.test.ts` | Expanded from 8 to 20 tests with unique IDs TEST-123A2-TS001..TS020 |
| `services/databento-feed/bridge_records.py` | All 11 FeedState health states, make_bridge_health_record, make_backpressure_state_record, all 8 recovery event factory functions |
| `services/databento-feed/tests/test_bridge_records.py` | Fixed timing tolerance in test_ts_ms_is_approximately_now |

### Pre-existing files (Gate G2 Round 2, unchanged)

`feed_adapter.py`, `historical_client.py`, `symbol_resolver.py`, `tests/fixtures/dbn_fixtures.py`, `tests/test_overflow_policy.py`, `tests/test_historical_client.py`, `tests/test_dbn_fixtures.py`, `tests/test_feed_adapter.py`, `tests/test_symbol_resolver.py`, `docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md`

---

## Commit History

| Commit | Message |
|--------|---------|
| `6035b5f` | sprint/123a-2: Gate G2 Revision 2 — replay_client, recovery_manager, bridge auth hardening, health states |
| `581454e` | sprint/123a-2: Gate G2 Round 2 — WS1-WS4 complete, 91 tests passing |

---

## Gate G2 Revision 2 Checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | `replay_client.py` implemented | DONE |
| 2 | Out-of-order record detection | DONE |
| 3 | Duplicate record detection (by sequence) | DONE |
| 4 | Definition recovery | DONE |
| 5 | Symbol-mapping recovery | DONE |
| 6 | Cancellation via `asyncio.Event` | DONE |
| 7 | Recovery timeout enforcement | DONE |
| 8 | `recovery_manager.py` implemented | DONE |
| 9 | Duplicate recovery prevention | DONE |
| 10 | on_complete/on_failed callbacks | DONE |
| 11 | Bridge auth hardening (session ID, rate-limit, max-size, stale, duplicate, shutdown) | DONE |
| 12 | All 11 health states defined and tested | DONE |
