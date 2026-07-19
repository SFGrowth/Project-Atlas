# Sprint 123A.2 — Gate G2 Round 2 Evidence

**Branch:** `sprint/123a-2-databento-adapter`
**Commit:** `313c293`
**Date:** 2026-07-19
**Status:** PASS — All four workstreams implemented and tested

---

## Summary

Gate G2 Round 2 corrects all findings from the Round 1 review. All four workstreams are fully implemented with passing tests. The Python test suite passes 83 tests. The TypeScript topology tests pass 8 tests. The commit is pushed to the remote branch.

---

## Test Results

| Suite | File | Tests | Result |
|-------|------|-------|--------|
| WS1 — Overflow Policy | `tests/test_overflow_policy.py` | 7 | **PASS** |
| WS2 — Historical Client | `tests/test_historical_client.py` | 10 | **PASS** |
| WS3 — DBN Fixtures | `tests/test_dbn_fixtures.py` | 10 | **PASS** |
| WS3 — Feed Adapter | `tests/test_feed_adapter.py` | 46 | **PASS** |
| WS3 — Symbol Resolver | `tests/test_symbol_resolver.py` | 10 | **PASS** |
| WS4 — Bridge Topology | `server/market-data/tests/sprint-123a2.test.ts` | 8 | **PASS** |
| **Total** | | **91** | **ALL PASS** |

**Python:** `83 passed, 26 warnings in 2.80s`
**TypeScript:** `8 passed (8 tests) 8ms`

---

## Workstream Evidence

### WS1 — Schema-Aware Overflow Policy

**Files modified:**
- `services/databento-feed/feed_adapter.py` — FeedState enum, `_enqueue_authoritative()`, `_enqueue_low_priority()`, `confirm_recovery()`, `_request_recovery()`
- `services/databento-feed/bridge_records.py` — `GapRecord`, `make_gap_detected_record()`, `RecoveryFailedError`
- `services/databento-feed/tests/test_overflow_policy.py` — 7 new tests

**Behaviour implemented:**

| Schema class | Overflow action |
|-------------|-----------------|
| Authoritative (`trades`, `ohlcv-1m`, `definition`) | Enter `DEGRADED` state, drop oldest record, emit `gap-detected` envelope, trigger async recovery |
| Low-priority (`feed-health`) | Silently drop — no state change, no gap record |

**Key invariants:**
- A dropped authoritative record is **never treated as delivered**. A `GapRecord` is always created with `start_ts_ns`, `end_ts_ns`, and `loss_count`.
- `confirm_recovery(schema)` clears `DEGRADED` back to `CONNECTED` only after the historical client confirms the gap is filled.
- `_request_recovery()` is non-blocking (`asyncio.ensure_future`).

---

### WS2 — Historical/Replay Client

**Files created:**
- `services/databento-feed/historical_client.py` — `DatabentoHistoricalClient`
- `services/databento-feed/tests/test_historical_client.py` — 10 tests

**API:**

```python
async for envelope in client.backfill_ohlcv_1m(symbol, start_ts_ns, end_ts_ns):
    # yields BridgeEnvelope with schema='ohlcv-1m' for each bar
    # then yields BridgeEnvelope with schema='recovery-complete' or 'recovery-partial'

async for envelope in client.replay_trades(symbol, start_ts_ns, end_ts_ns):
    # yields BridgeEnvelope with schema='trades' for each trade
    # then yields BridgeEnvelope with schema='recovery-complete' or 'recovery-partial'
```

**Recovery semantics:**

| Condition | Envelope yielded |
|-----------|-----------------|
| `records_recovered == 0` | `recovery-complete` (empty window) |
| `last_ts_ns >= end_ts_ns` | `recovery-complete` (full window covered) |
| `last_ts_ns < end_ts_ns AND records_recovered > 0` | `recovery-partial` (stream ended early) |
| `MAX_RETRIES` exhausted | `recovery-failed` |

**Validation:**
- `end_ts_ns <= start_ts_ns` raises `ValueError: Invalid time range`
- Span > 7 days (`MAX_REPLAY_WINDOW_NS`) raises `ValueError: Replay window too large`
- Rate-limit (429) triggers exponential backoff starting at `BACKOFF_INITIAL_S = 1.0s`

**Bug fixed:** `StopIteration` cannot be raised into a `Future` in Python 3.7+ (PEP 479). The `_iter_records` async generator now uses a sentinel value (`_ITER_SENTINEL`) instead of catching `StopIteration`.

**Authority boundary:** No candle construction code exists in `historical_client.py`. Python is transport and normalisation only. TypeScript Atlas constructs canonical bars.

---

### WS3 — DBN Fixtures and Normalisation Validation

**Files created:**
- `services/databento-feed/tests/fixtures/dbn_fixtures.py` — factory functions for `TradeMsg`, `OHLCVMsg`, `SymbolMappingMsg`
- `services/databento-feed/tests/test_dbn_fixtures.py` — 10 tests

**Fixtures provided:**

| Factory | Returns | Notes |
|---------|---------|-------|
| `make_trade_msg(ts_event_ns, price_fixed, size, instrument_id)` | `db.TradeMsg` | Real SDK object, not MagicMock |
| `make_ohlcv_msg(ts_event_ns, open_fixed, high_fixed, low_fixed, close_fixed, volume, instrument_id)` | `db.OHLCVMsg` | Fixed-point prices (1e-9 USD) |
| `make_symbol_mapping_msg(instrument_id, stype_in_symbol, stype_out_symbol)` | `db.SymbolMappingMsg` | |

**Normalisation validated:**
- Nanosecond precision preserved end-to-end (no integer truncation)
- Fixed-point price conversion: `price_fixed / 1_000_000_000 == price_usd`
- Symbol mapping resolves `instrument_id` → canonical symbol correctly

**Secret safety validated:**
- `DATABENTO_API_KEY` never appears in any normalised record
- `BRIDGE_AUTH_TOKEN` never appears in any normalised record

**Pre-existing test updates (`test_feed_adapter.py`):**
Three tests were updated to match the schema-aware overflow policy introduced in WS1:

1. `test_queue_drops_oldest_when_full` — Updated to test `_enqueue_authoritative()` directly and assert `FeedState.DEGRADED` (the old "Backpressure" log message no longer exists).
2. `test_stops_after_max_reconnect_attempts` — Updated to mock `_enqueue_low_priority` (the OFFLINE health is enqueued via `_enqueue_low_priority`, not `_enqueue_feed_health`).
3. `test_feed_adapter_does_not_construct_canonical_bars` — Updated to mock `_enqueue_authoritative` (since `_handle_ohlcv` now calls `_enqueue_authoritative`, not `_enqueue`).

---

### WS4 — Bridge Topology Documentation and TypeScript Update

**Files created/modified:**
- `docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md` — Full topology reference (new)
- `server/market-data/bridge-server.ts` — `validateBridgeTopology()`, `BRIDGE_HOST` from env, `BRIDGE_PROTOCOL_VERSION`
- `server/market-data/tests/sprint-123a2.test.ts` — 8 topology tests (new)

**Three topologies documented:**

| Topology | Use case | `BRIDGE_HOST` | TLS required |
|----------|----------|---------------|-------------|
| 1 — Dev localhost | Local development | `127.0.0.1` (default) | No |
| 2 — Prod same-host | Co-located production | `127.0.0.1` (default) | No |
| 3 — Separate containers | Docker/K8s | Private IP or service name | **Yes** |

**`validateBridgeTopology()` rules:**
1. Loopback (`127.0.0.1`) → start normally
2. Private network (10.x, 172.16-31.x, 192.168.x) → log warning, allow startup
3. Non-private address without `BRIDGE_TLS=true` → **throw** (prevents insecure startup)

**Security invariants (all topologies):**
- Bridge is **never** publicly exposed
- `BRIDGE_AUTH_TOKEN` is **always** required
- Secrets **never** appear in logs or bridge payloads
- `127.0.0.1` is the secure default

---

## Files Changed

| File | Change |
|------|--------|
| `services/databento-feed/bridge_records.py` | Added `GapRecord`, `make_gap_detected_record()`, `RecoveryFailedError` |
| `services/databento-feed/feed_adapter.py` | Added `FeedState`, schema-aware overflow policy, `confirm_recovery()`, `_request_recovery()` |
| `services/databento-feed/historical_client.py` | **New** — `DatabentoHistoricalClient` with backfill and replay |
| `services/databento-feed/tests/fixtures/__init__.py` | **New** — fixtures package init |
| `services/databento-feed/tests/fixtures/dbn_fixtures.py` | **New** — DBN record factory functions |
| `services/databento-feed/tests/test_dbn_fixtures.py` | **New** — 10 normalisation/safety tests |
| `services/databento-feed/tests/test_feed_adapter.py` | Updated 3 tests to match WS1 changes |
| `services/databento-feed/tests/test_historical_client.py` | **New** — 10 historical client tests |
| `services/databento-feed/tests/test_overflow_policy.py` | **New** — 7 overflow policy tests |
| `server/market-data/bridge-server.ts` | Added `validateBridgeTopology()`, `BRIDGE_HOST` env, `BRIDGE_PROTOCOL_VERSION` |
| `server/market-data/tests/sprint-123a2.test.ts` | **New** — 8 topology tests |
| `docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md` | **New** — topology reference document |
| `package.json` / `pnpm-lock.yaml` | Added `ws` package (required by bridge-server.ts) |

---

## Known Pre-Existing Failures (Not Introduced by This Sprint)

The following TypeScript test files fail due to `DB unavailable` errors (no database connection in the test environment). These failures pre-date Sprint 123A.2 and are not caused by any changes in this sprint:

- `server/ard.test.ts` — 10 failures (ARD/ORACLE DB queries)
- `server/sb1.test.ts` — 3 failures (SB1 DB writes)
- `server/nexusRoutes.test.ts` — 2 failures (webhook route DB writes)
- `server/massive-api.test.ts` — 1 failure (Massive.com API key)

These are tracked separately and are outside the scope of Sprint 123A.2.

---

*Sprint 123A.2 Gate G2 Round 2 — Atlas Nexus Databento Feed Adapter*
*Commit: 313c293 on branch sprint/123a-2-databento-adapter*
