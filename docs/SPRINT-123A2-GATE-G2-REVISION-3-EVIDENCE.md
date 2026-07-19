# Sprint 123A.2 — Gate G2 Revision 3 Evidence

**Branch:** `sprint/123a-2-databento-adapter`
**Commit:** `39db508`
**Date:** 2026-07-19
**Reviewer gate:** G2 Revision 3

---

## Summary

This document provides the complete evidence record for Gate G2 Revision 3 of Sprint 123A.2. All five substantive corrections requested in the Revision 3 review have been implemented, tested, and committed. The full regression suite passes cleanly.

---

## Revision 3 Requirements — Disposition

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| R1 | Bounded reorder buffer replacing skip-on-OOO in `replay_client.py` | COMPLETE | `replay_client.py` — `ReorderBuffer` class, `REORDER_TOLERANCE_MS=500`, `MAX_BUFFER_SIZE=1000` |
| R2 | `RECOVERY_PARTIAL` never invokes `on_complete`; retains `unresolved_range`; increments `recovery_partial_count` | COMPLETE | `recovery_manager.py` — separate PARTIAL/COMPLETE/FAILED terminal paths |
| R3 | `validateBridgeTopology` rejects public IPs unconditionally (even with TLS); rejects wildcard `0.0.0.0`/`::` | COMPLETE | `bridge-server.ts` — Revision 3 hardened rules |
| R4 | IPv6 public addresses rejected; IPv6 ULA (`fd00::/7`) and link-local (`fe80::/10`) accepted | COMPLETE | `isPrivateOrLoopback()` updated; 6 new IPv6 unit tests |
| R5 | `DBN_FIXTURE_MANIFEST.md` with full provenance for all 4 fixture schemas | COMPLETE | `tests/fixtures/DBN_FIXTURE_MANIFEST.md` |
| R6 | Production-path normalisation tests for all 4 schemas | COMPLETE | `test_dbn_fixtures.py` — 4 new tests |
| R7 | Full regression: Python + TypeScript sprint-123a2 + `pnpm tsc --noEmit` | COMPLETE | 133 Python + 31 TypeScript + clean tsc |

---

## Test Results

### Python Suite — 133 tests, all passing

| Test File | Tests | Revision 3 Changes |
|-----------|-------|-------------------|
| `test_replay_client.py` | 24 | Rewritten for bounded reorder buffer semantics |
| `test_dbn_fixtures.py` | 14 | +4 production-path tests (definition, symbol-mapping, trade price, OHLCV price) |
| `test_bridge_records.py` | 24 | Unchanged |
| `test_feed_adapter.py` | 19 | Unchanged |
| `test_health_states.py` | 11 | Unchanged |
| `test_recovery_manager.py` | 11 | Updated for PARTIAL/COMPLETE/FAILED terminal handling |
| `test_historical_client.py` | 10 | Unchanged |
| `test_symbol_resolver.py` | 13 | Unchanged |
| `test_overflow_policy.py` | 7 | Unchanged |
| **Total** | **133** | **ALL PASS** |

### TypeScript Suite — sprint-123a2 tests: 31 tests, all passing

| Test Group | Tests | Revision 3 Changes |
|------------|-------|-------------------|
| `validateBridgeTopology` (TS001–TS008, TS021–TS022) | 10 | TS003/TS004/TS008 updated; TS021/TS022 new (wildcard) |
| `isPrivateOrLoopback` unit (TS023–TS028) | 6 | New — IPv6 loopback, link-local, ULA, public |
| `isWildcard` unit (TS029–TS031) | 3 | New |
| Authentication hardening (TS009–TS011) | 3 | Unchanged |
| Secret redaction (TS012–TS013) | 2 | Unchanged |
| Authority boundary (TS014–TS015) | 2 | Unchanged |
| Protocol version (TS016) | 1 | Unchanged |
| Schema validation (TS017–TS018) | 2 | Unchanged |
| BRIDGE_HOST default (TS019) | 1 | Unchanged |
| Graceful shutdown (TS020) | 1 | Unchanged |
| **Total** | **31** | **ALL PASS** |

### TypeScript Compilation

`pnpm tsc --noEmit` exits with code 0. No type errors.

### Pre-existing TypeScript failures (not introduced by Sprint 123A.2)

The following 32 test failures exist on the `main` branch and are pre-existing. They are caused by missing database connectivity (`ard.test.ts`, `nexusRoutes.test.ts`, `sb1.test.ts`) and a third-party API key (`massive-api.test.ts`). They are not caused by any Sprint 123A.2 changes and are confirmed identical on the pre-Revision-3 commit via `git stash` regression.

---

## Implementation Detail

### R1 — Bounded Reorder Buffer (`replay_client.py`)

The previous implementation silently skipped records where `ts_event < last_ts_ns`. This was identified as incorrect because it caused silent data loss for records that arrived late but within a reasonable tolerance window.

The `ReorderBuffer` class replaces this with a heap-based buffer ordered by `(ts_event_ns, sequence_number)`. Records are held until the watermark advances beyond `ts_event_ns + REORDER_TOLERANCE_MS * 1_000_000`. When flushed, records are emitted in strict timestamp order. The buffer enforces `MAX_BUFFER_SIZE=1000` to prevent unbounded memory growth.

Duplicate detection operates on `sequence_number`. An exact duplicate (same sequence, same price) is silently dropped. A conflicting duplicate (same sequence, different price) emits a `recovery-anomaly` record and triggers DEGRADED state with a recovery request. Records arriving more than `REORDER_TOLERANCE_MS` behind the watermark are not buffered — they emit a gap record and trigger recovery.

### R2 — Separate Terminal Recovery States (`recovery_manager.py`)

The previous implementation called `on_complete(schema)` for both `RECOVERY_COMPLETE` and `RECOVERY_PARTIAL` outcomes. This was incorrect because a partial recovery leaves a data gap that must be tracked and retried.

The revised implementation maintains three separate terminal paths:

- **`RECOVERY_COMPLETE`**: all requested records were received (`last_ts_ns >= end_ts_ns`). Calls `on_complete(schema)`. Clears the gap from `_active_gaps`.
- **`RECOVERY_PARTIAL`**: some records were received but the range was not fully covered. **Never calls `on_complete`**. Retains `unresolved_range` in the gap record. Increments `recovery_partial_count`. The gap remains in `_active_gaps` for retry.
- **`RECOVERY_FAILED`**: no records received or timeout. Calls `on_failed(schema)`. Increments `recovery_failures`.

The `recovery_partial_count` property is exposed for observability.

### R3/R4 — Hardened Bridge Topology Validation (`bridge-server.ts`)

The previous `validateBridgeTopology` allowed public IP addresses when `BRIDGE_TLS=true` (Topology 3). This was identified as incorrect because the bridge is a process-to-process transport and must never be reachable from the public internet, regardless of TLS.

**Revision 3 rules (in order of evaluation):**

1. **Wildcard addresses** (`0.0.0.0`, `::`, `0:0:0:0:0:0:0:0`) — always rejected. The bridge must bind to a specific interface.
2. **Private/loopback addresses** — always allowed. Includes `127.0.0.1`, `localhost`, `::1`, RFC 1918 ranges (`10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`), IPv6 link-local (`fe80::/10`), IPv6 ULA (`fc00::/7`).
3. **All other addresses** (public IPv4 and public IPv6) — always rejected, regardless of TLS setting.

`isPrivateOrLoopback()` and `isWildcard()` are now exported for direct unit testing. The test suite includes 6 `isPrivateOrLoopback` unit tests and 3 `isWildcard` unit tests.

### R5/R6 — DBN Fixture Manifest and Production-Path Tests

`DBN_FIXTURE_MANIFEST.md` documents the provenance, construction method, SDK class, and production normalisation path for all four fixture schemas (`trades`, `ohlcv-1m`, `symbol-mapping`, `definition`). It includes the synthetic data constants table and a secret safety section.

Four new production-path tests were added to `test_dbn_fixtures.py`:

- `test_definition_fixture_exercises_production_path` — calls `_handle_definition()` with the mock fixture and asserts the enqueued `BridgeEnvelope` has `schema="definition"`, correct `instrument_id`, `raw_symbol`, `currency`, and `min_price_increment` (fixed-point converted to 0.0025 USD).
- `test_symbol_mapping_fixture_exercises_production_path` — calls `_handle_symbol_mapping()` and asserts the enqueued envelope has `schema="symbol-mapping"` with correct symbol fields.
- `test_trade_price_fixed_point_conversion` — asserts `price_usd = SAMPLE_PRICE_INT / 1e9 = 18500.25` within floating-point tolerance.
- `test_ohlcv_price_fixed_point_conversion_all_fields` — asserts all four OHLCV prices are correctly converted independently.

---

## Files Changed in Revision 3

| File | Change Type | Description |
|------|-------------|-------------|
| `server/market-data/bridge-server.ts` | Modified | Hardened topology validation (R3/R4) |
| `server/market-data/tests/sprint-123a2.test.ts` | Modified | Expanded from 20 to 31 tests (R3/R4) |
| `services/databento-feed/replay_client.py` | Modified | Bounded reorder buffer (R1) |
| `services/databento-feed/recovery_manager.py` | Modified | Separate PARTIAL/COMPLETE/FAILED terminals (R2) |
| `services/databento-feed/tests/test_dbn_fixtures.py` | Modified | +4 production-path tests (R6) |
| `services/databento-feed/tests/test_recovery_manager.py` | Modified | Updated for R2 semantics |
| `services/databento-feed/tests/test_replay_client.py` | Modified | Updated for R1 semantics |
| `services/databento-feed/tests/fixtures/DBN_FIXTURE_MANIFEST.md` | New | Fixture provenance (R5) |

---

## Cumulative Sprint 123A.2 Deliverables

The following table summarises all files delivered across all three Gate G2 revisions.

| File | Sprint Phase | Status |
|------|-------------|--------|
| `services/databento-feed/bridge_records.py` | G2 R1 | 11 health states, 8 recovery event types |
| `services/databento-feed/feed_adapter.py` | G2 R1 | Schema-aware overflow, FeedState, GapRecord |
| `services/databento-feed/historical_client.py` | G2 R1 | Backfill/replay with backoff |
| `services/databento-feed/recovery_manager.py` | G2 R2 → R3 | Gap lifecycle, PARTIAL/COMPLETE/FAILED |
| `services/databento-feed/replay_client.py` | G2 R2 → R3 | Bounded reorder buffer, definition/symbol recovery |
| `services/databento-feed/tests/fixtures/dbn_fixtures.py` | G2 R1 | Real SDK fixture factories |
| `services/databento-feed/tests/fixtures/DBN_FIXTURE_MANIFEST.md` | G2 R3 | Fixture provenance |
| `services/databento-feed/tests/test_overflow_policy.py` | G2 R1 | 7 tests |
| `services/databento-feed/tests/test_historical_client.py` | G2 R1 | 10 tests |
| `services/databento-feed/tests/test_dbn_fixtures.py` | G2 R1 → R3 | 14 tests |
| `services/databento-feed/tests/test_recovery_manager.py` | G2 R2 → R3 | 11 tests |
| `services/databento-feed/tests/test_replay_client.py` | G2 R2 → R3 | 24 tests |
| `services/databento-feed/tests/test_health_states.py` | G2 R2 | 11 tests |
| `server/market-data/bridge-server.ts` | G2 R1 → R3 | Auth hardening, topology validation |
| `server/market-data/tests/sprint-123a2.test.ts` | G2 R1 → R3 | 31 tests |
| `docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md` | G2 R1 | Topology documentation |

---

*Generated by Atlas Nexus DARWIN — Sprint 123A.2 Gate G2 Revision 3*
*2026-07-19*
