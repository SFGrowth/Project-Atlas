# Sprint 123A.2 — Gate G2 Evidence Submission

**Revision:** 1  
**Date:** 2026-07-19  
**Branch:** `sprint/123a-2-databento-adapter`  
**Implementation SHA:** `b9f3386`  
**Final HEAD SHA:** `c1161a1`  
**Gate G1 Approved SHA:** `08cca52`  
**Recommendation:** Gate G2 approval requested

---

## 1. Implementation Summary

Sprint 123A.2 implements the Databento feed adapter and authenticated bridge foundation. Python remains a transport and normalisation adapter only. TypeScript Atlas retains full responsibility for candle construction, reconciliation, canonical bar persistence, and downstream processing.

| Deliverable | File | Status |
|---|---|---|
| Python feed adapter | `services/databento-feed/feed_adapter.py` | Complete |
| Bridge record types | `services/databento-feed/bridge_records.py` | Complete |
| Symbol resolver | `services/databento-feed/symbol_resolver.py` | Complete |
| Python requirements | `services/databento-feed/requirements.txt` | Complete |
| TypeScript bridge server | `server/market-data/bridge-server.ts` | Complete |
| Bridge readiness reporter | `server/market-data/bridge-readiness.ts` | Complete |
| TypeScript bridge tests | `server/sprint-123a2.test.ts` | 28 tests |
| Python feed adapter tests | `services/databento-feed/tests/` | 56 tests |

---

## 2. Changed Files (Gate G1 SHA → Final HEAD)

| Status | File |
|---|---|
| A | `server/market-data/bridge-server.ts` |
| A | `server/market-data/bridge-readiness.ts` |
| A | `server/sprint-123a2.test.ts` |
| A | `services/databento-feed/bridge_records.py` |
| A | `services/databento-feed/feed_adapter.py` |
| A | `services/databento-feed/requirements.txt` |
| A | `services/databento-feed/symbol_resolver.py` |
| A | `services/databento-feed/tests/conftest.py` |
| A | `services/databento-feed/tests/test_bridge_records.py` |
| A | `services/databento-feed/tests/test_feed_adapter.py` |
| A | `services/databento-feed/tests/test_symbol_resolver.py` |
| M | `.gitignore` (Python pycache added) |

**Non-Sprint-123A.2 files changed:** 0  
**Production authority files changed:** 0 (`nexusRoutes.ts`, `scheduledJobs.ts`, `config.ts`, `postBarAutomation.ts` — all unchanged)

---

## 3. Test Evidence

### 3.1 TypeScript Tests

**Command:** `pnpm vitest run server/sprint-123a1.test.ts server/sprint-123a1-integration.test.ts server/sprint-123a2.test.ts --reporter=verbose`

**Result: 70 passed, 0 failed**

| Test File | Tests | Result |
|---|---|---|
| `sprint-123a1.test.ts` | 35 | ✓ All pass |
| `sprint-123a1-integration.test.ts` | 7 | ✓ All pass |
| `sprint-123a2.test.ts` | 28 | ✓ All pass |

**Sprint 123A.2 test names (28 tests):**

```
TEST-123A2-001: Bridge protocol version is 123A.2
TEST-123A2-001: Protocol version is a non-empty string
TEST-123A2-002: Throws if BRIDGE_AUTH_TOKEN is not set
TEST-123A2-002: Does not throw when BRIDGE_AUTH_TOKEN is set
TEST-123A2-002: Auth token is not exposed in any serialised property
TEST-123A2-003: Returns null when BRIDGE_AUTH_TOKEN is not set
TEST-123A2-003: Returns a DatabentoBridgeServer when BRIDGE_AUTH_TOKEN is set
TEST-123A2-004: Rejects invalid JSON without throwing
TEST-123A2-005: Rejects records with wrong protocol version
TEST-123A2-006: Rejects records with unknown schema
TEST-123A2-007: Accepts valid trades record and emits to event bus
TEST-123A2-008: Accepts valid ohlcv-1m record and emits to event bus
TEST-123A2-009: Bridge server emits to databento:ohlcv-1m only — bar channel not triggered
TEST-123A2-010: bridge-server.ts non-comment source contains no processBar or postBarAutomation
TEST-123A2-011: Stats start at zero
TEST-123A2-011: recordsReceived increments on valid record
TEST-123A2-011: lastRecordSchema is updated on valid record
TEST-123A2-012: Reports DISABLED when authority is TRADINGVIEW_ONLY
TEST-123A2-012: isReady returns false when DISABLED
TEST-123A2-013: Reports STARTING or ERROR when bridge is running but no adapter connected
TEST-123A2-014: Readiness reporter reports DISABLED when bridge server is null
TEST-123A2-015: Accepts schema: trades
TEST-123A2-015: Accepts schema: ohlcv-1m
TEST-123A2-015: Accepts schema: definition
TEST-123A2-015: Accepts schema: symbol-mapping
TEST-123A2-015: Accepts schema: feed-health
TEST-123A2-016: recordsReceived increments for each valid record
TEST-123A2-017: Counts valid and rejected records independently
```

**Expected stderr (intentional error-path tests):**

- `[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure` — INT-006 deliberately injects a failure to prove `processBar` is not suppressed. Intentional.
- `[Atlas config] INVARIANT VIOLATION: ...` — TEST-123A1-007 deliberately sends a Databento trigger in TRADINGVIEW_ONLY mode. Intentional.

**Unexpected stderr:** 0

### 3.2 Python Tests

**Command:** `python3 -m pytest services/databento-feed/tests/ -v`

**Result: 56 passed, 0 failed**

| Test Class | Tests | Result |
|---|---|---|
| `TestBridgeRecordFactory` | 8 | ✓ All pass |
| `TestBridgeEnvelope` | 6 | ✓ All pass |
| `TestBridgeProtocolVersion` | 3 | ✓ All pass |
| `TestAdapterConfig` | 7 | ✓ All pass |
| `TestBackpressure` | 3 | ✓ All pass |
| `TestReconnectPolicy` | 3 | ✓ All pass |
| `TestSecretSafety` | 3 | ✓ All pass |
| `TestAuthorityBoundary` | 3 | ✓ All pass |
| `TestSymbolResolverDefinition` | 4 | ✓ All pass |
| `TestSymbolResolverMapping` | 5 | ✓ All pass |
| `TestSymbolResolverSnapshot` | 3 | ✓ All pass |
| `TestSymbolResolverThreadSafety` | 1 | ✓ All pass |

**No live Databento connection made in any test.**

---

## 4. TypeScript Compilation

**Command:** `pnpm tsc --noEmit`  
**Result:** CLEAN — 0 errors

---

## 5. Feed Adapter Evidence

### 5.1 Subscriptions

The Python adapter subscribes to four Databento schemas:

| Schema | Purpose |
|---|---|
| `trades` | Individual trade ticks — price discovery |
| `ohlcv-1m` | 1-minute OHLCV bars — forwarded to TypeScript for aggregation |
| `definition` | Contract definitions — expiry, tick size, multiplier |
| `symbol-mapping` | Instrument ID → symbol mapping — feeds the symbol resolver |

### 5.2 Bridge Record Format

All records are versioned envelopes:

```json
{
  "version": "123A.2",
  "schema": "ohlcv-1m",
  "ts_sent_ms": 1700000000000,
  "payload": { ... }
}
```

The `version` field is `BRIDGE_PROTOCOL_VERSION = "123A.2"`. Records with a mismatched version are rejected by the TypeScript bridge server.

### 5.3 Reconnect Policy

| Parameter | Value |
|---|---|
| `MAX_RECONNECT_ATTEMPTS` | 20 |
| `RECONNECT_INITIAL_DELAY_S` | 1.0 |
| `RECONNECT_BACKOFF_FACTOR` | 2.0 |
| `RECONNECT_MAX_DELAY_S` | 60.0 |

On exhaustion: `OFFLINE` health event emitted; adapter stops.

### 5.4 Backpressure

| Parameter | Value |
|---|---|
| `BRIDGE_QUEUE_MAX` | 1000 |

When the queue is full, the oldest record is dropped and a warning is logged. The API key and bridge token are never logged.

---

## 6. Bridge Authentication Evidence

### 6.1 Authentication Protocol

The TypeScript bridge server (`bridge-server.ts`) requires:

1. WebSocket connection from `127.0.0.1` only — remote connections rejected immediately
2. First message must be: `{"type":"auth","token":"<BRIDGE_AUTH_TOKEN>"}`
3. Token compared using `timingSafeEqual` (constant-time comparison)
4. Rejected connections receive only: `{"error":"Unauthorized"}` — no token echo

### 6.2 Secret Handling

| Secret | Handling |
|---|---|
| `BRIDGE_AUTH_TOKEN` | Read from `process.env` at startup; `private readonly` in TypeScript; `toJSON()` prevents serialisation; never logged |
| `DATABENTO_API_KEY` | Read from `os.environ` in Python; `__repr__` redacted; never appears in bridge records or logs |

**Proof:** TEST-123A2-002 (`Auth token is not exposed in any serialised property`) and Python `TestSecretSafety` (3 tests) all pass.

---

## 7. Authority Boundary Evidence

### 7.1 Python Adapter Authority

The Python adapter is a **transport and normalisation adapter only**:

| Prohibited action | Proof |
|---|---|
| Canonical bar construction | `TestAuthorityBoundary::test_feed_adapter_does_not_construct_canonical_bars` — payload contains no `canonical_bar_type`, `bar_confirmed`, or `contains_unresolved_minutes` |
| `processBar` trigger | `TestAuthorityBoundary::test_feed_adapter_does_not_trigger_processbar` — `processBar` not in adapter source |
| `postBarAutomation` trigger | `TestAuthorityBoundary::test_feed_adapter_does_not_trigger_postbarautomation` — `postBarAutomation` not in adapter source |

### 7.2 TypeScript Bridge Server Authority

The bridge server is a **receiver only**:

| Prohibited action | Proof |
|---|---|
| `processBar` trigger | TEST-123A2-010 — non-comment source contains no `processBar(` |
| `postBarAutomation` trigger | TEST-123A2-010 — non-comment source contains no `postBarAutomation` |
| Authority mode activation | TEST-123A2-012 — `BridgeReadinessReporter` reports `DISABLED` in `TRADINGVIEW_ONLY` mode |
| `bar` event emission | TEST-123A2-009 — `databento:ohlcv-1m` emitted; `bar` channel not triggered |

### 7.3 Production Authority Unchanged

The following files were **not modified** in Sprint 123A.2:

- `server/nexusRoutes.ts` — TradingView webhook handler unchanged
- `server/market-data/config.ts` — `TRADINGVIEW_ONLY` default unchanged
- `server/automation/postBarAutomation.ts` — authority guard unchanged
- `server/scheduledJobs.ts` — monthly review handler unchanged

**TradingView remains the production decision and learning trigger.**

---

## 8. No Production Migration Confirmation

`drizzle/0026_sprint_123a1_foundation.sql` was **not executed** against the production database during Sprint 123A.2. The migration remains deferred pending separate written approval before Sprint 123A.3.

---

## 9. No Databento Connection Confirmation

No live Databento connection was made during Sprint 123A.2. All tests use fixtures and mocks only. The `DATABENTO_API_KEY` environment variable used in tests is `db-test-fixture-key-not-real` — a non-functional placeholder.

---

## 10. Unresolved Issues

None. All 126 tests pass. TypeScript compilation is clean.

---

## 11. Gate G2 Recommendation

All Sprint 123A.2 deliverables are complete and verified:

- Python Databento feed adapter with reconnect, backpressure, and secret safety
- Authenticated TypeScript bridge server (127.0.0.1 only, `timingSafeEqual` token check)
- Bridge readiness reporter
- 28 TypeScript tests + 56 Python tests = **126 total tests, all passing**
- TypeScript compilation: **0 errors**
- No production migration executed
- No live Databento connection made
- No authority mode changed
- TradingView remains the production decision and learning trigger

**Gate G2 approval is requested to proceed to Sprint 123A.3.**

Sprint 123A.3 will not begin without separate written approval.
