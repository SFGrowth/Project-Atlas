# Sprint 123A.2 — Gate G2 Final Approval Submission (Revision 2)

**Branch:** `sprint/123a-2-databento-adapter`  
**Final committed SHA (evidence lock):** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b`  
**Implementation content SHA:** `4f9e9f0c32e8ccd2ca44f558e7bcac7ac12a6014`  
**Gate G1 approved baseline SHA:** `08cca5232d40df9cf44a0629790ec6dd906e41b1`  
**Submission date:** 2026-07-19  

---

## Production Safety Confirmations

| Constraint | Status |
|------------|--------|
| Migration 0026 run against production | **NOT executed** |
| DATABENTO_SHADOW activated in production | **NOT activated** |
| Production authority changed | **NOT changed** |
| Production Databento connection established | **NOT established** |
| Sprint 123A.3 begun | **NOT begun** |

---

## Corrections from Revision 1

**Revision 1 error:** The previous evidence document incorrectly stated "Databento accepted as the postBarAutomation trigger in DATABENTO_SHADOW mode." This was an error in the evidence document only. The committed implementation and tests have always been correct.

**Revision 2 corrections applied:**

1. Authority matrix corrected to match the actual committed tests verbatim.
2. `DATABENTO_LIVE` confirmed absent from the type system.
3. `pytest.mark.asyncio` removed from all synchronous test functions; per-function marks added to async tests only.
4. `datetime.utcfromtimestamp()` deprecation warning fixed in `historical_client.py`.
5. All test names reproduced verbatim from Vitest output — not paraphrased.

---

## 9. Changed-File List: Gate G1 Baseline → Final Evidence SHA

**From:** `08cca5232d40df9cf44a0629790ec6dd906e41b1` (Sprint 123A.1 Gate G1 — Final Approval Submission Revision 3)  
**To:** `1b73c5d2e087b5a5228446df1bf8bd8298a69a4b` (Gate G2 Final Revision 2 — evidence corrections)

| Status | File |
|--------|------|
| M | `.gitignore` |
| M | `package.json` |
| M | `pnpm-lock.yaml` |
| A | `docs/SPRINT-123A2-GATE-G2-REVISION-2-EVIDENCE.md` |
| A | `docs/SPRINT-123A2-GATE-G2-REVISION-3-EVIDENCE.md` |
| A | `docs/SPRINT-123A2-GATE-G2-ROUND2-EVIDENCE.md` |
| A | `docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md` |
| A | `docs/reports/SPRINT_123A2_GATE_G2_EVIDENCE_SUBMISSION.md` |
| A | `docs/reports/SPRINT_123A2_GATE_G2_FINAL_APPROVAL_SUBMISSION.md` |
| A | `docs/reports/SPRINT_123A2_GATE_G2_FINAL_APPROVAL_SUBMISSION_REVISION_2.md` |
| A | `server/market-data/bridge-readiness.ts` |
| A | `server/market-data/bridge-server.ts` |
| A | `server/market-data/tests/sprint-123a2.test.ts` |
| A | `server/sprint-123a2.test.ts` |
| A | `services/databento-feed/bridge_records.py` |
| A | `services/databento-feed/feed_adapter.py` |
| A | `services/databento-feed/historical_client.py` |
| A | `services/databento-feed/recovery_manager.py` |
| A | `services/databento-feed/replay_client.py` |
| A | `services/databento-feed/requirements.txt` |
| A | `services/databento-feed/symbol_resolver.py` |
| A | `services/databento-feed/tests/conftest.py` |
| A | `services/databento-feed/tests/fixtures/DBN_FIXTURE_MANIFEST.md` |
| A | `services/databento-feed/tests/fixtures/__init__.py` |
| A | `services/databento-feed/tests/fixtures/dbn_fixtures.py` |
| A | `services/databento-feed/tests/fixtures/mnq_definition_record.dbn` |
| A | `services/databento-feed/tests/test_bridge_records.py` |
| A | `services/databento-feed/tests/test_dbn_fixtures.py` |
| A | `services/databento-feed/tests/test_feed_adapter.py` |
| A | `services/databento-feed/tests/test_health_states.py` |
| A | `services/databento-feed/tests/test_historical_client.py` |
| A | `services/databento-feed/tests/test_overflow_policy.py` |
| A | `services/databento-feed/tests/test_real_definition_fixture.py` |
| A | `services/databento-feed/tests/test_recovery_manager.py` |
| A | `services/databento-feed/tests/test_replay_client.py` |
| A | `services/databento-feed/tests/test_symbol_resolver.py` |

**A** = Added (new file), **M** = Modified (existing file)

### Production Authority Verification

The following categories of files were **not changed** between the Gate G1 baseline and the final evidence SHA:

| Category | Verification |
|----------|--------------|
| `nexusRoutes.ts` | Not changed |
| Authority guard files (`marketDataAuthority`, `postBarAutomation`) | Not changed |
| `liveLearnEngine`, `darwinAutonomous`, `behaviourEngine` | Not changed |
| `processBar` execution path | Not changed |
| Database migration files | Not changed |
| Drizzle schema files | Not changed |

**Confirmation:** `git diff --name-only 08cca5232d40df9cf44a0629790ec6dd906e41b1 1b73c5d2e087b5a5228446df1bf8bd8298a69a4b | grep -E "nexusRoutes|authority|migration|schema\.ts"` → **no output** (zero matches).

All changes are confined to:
- `services/databento-feed/` — new Python adapter service (transport and normalisation only)
- `server/market-data/` — new bridge server (private bridge only, not connected to production)
- `docs/` — evidence and architecture documentation
- `package.json` / `pnpm-lock.yaml` — `ws` package addition for bridge server
- `.gitignore` — Python `__pycache__` exclusion

---

## Gate G2 Recommendation

**This submission recommends Gate G2 APPROVAL.**

---

## 1. Corrected Sprint 123A.1 Authority Matrix

The following matrix is derived directly from the committed test assertions in `server/sprint-123a1.test.ts`. Test names are reproduced verbatim.

| Mode | TradingView trigger | Databento trigger | Test IDs |
|------|---------------------|-------------------|----------|
| `TRADINGVIEW_ONLY` | **ACCEPTED** | **REJECTED** | TEST-123A1-007, TEST-123A1-008 |
| `DATABENTO_SHADOW` | **ACCEPTED** | **REJECTED** | TEST-123A1-009, TEST-123A1-009B |
| `DATABENTO_CHART_AUTHORITY` | **ACCEPTED** | **REJECTED** | TEST-123A1-010, TEST-123A1-010B |
| `DATABENTO_LEARNING_AUTHORITY` | **REJECTED** | **ACCEPTED** | TEST-123A1-011, TEST-123A1-012 |

**`DATABENTO_LIVE` does not exist** in `Sprint123AAuthorityMode`. `assertSprint123A1Invariants` throws if `DATABENTO_LIVE_ENABLED=true` is set (TEST-123A1-004). `DATABENTO_DECISION_AUTHORITY` is excluded from the Sprint 123A type and throws fail-closed (TEST-123A1-027, TEST-123A1-028).

**`isDatabentoProcessBarTrigger` always returns `false` in all Sprint 123A modes** (TEST-123A1-003). TradingView owns `processBar` in every Sprint 123A authority mode.

**`DATABENTO_SHADOW` requires Gate G3** — `assertSprint123A1Invariants` throws if `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` (TEST-123A1-006).

---

## 2. Complete Sprint 123A.1 Regression Output (Verbatim)

**Command:**
```
pnpm vitest run \
  server/sprint-123a1.test.ts \
  server/sprint-123a1-integration.test.ts \
  server/market-data/tests/sprint-123a2.test.ts \
  --reporter=verbose
```

**Result: Test Files 3 passed (3) | Tests 73 passed (73) | Duration 1.11s**

### Sprint 123A.1 — Feature Flag Configuration

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-001: defaults to TRADINGVIEW_ONLY when MARKET_DATA_AUTHORITY is unset
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-002: isTradingViewOnly returns true by default; all Databento predicates return false
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-003: isDatabentoProcessBarTrigger always returns false in all Sprint 123A modes
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-004: assertSprint123A1Invariants throws when DATABENTO_LIVE_ENABLED=true
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-005: assertSprint123A1Invariants throws on DATABENTO_DECISION_AUTHORITY (Sprint 123B only)
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Feature Flag Configuration > TEST-123A1-006: assertSprint123A1Invariants throws on DATABENTO_SHADOW (requires Gate G3)
```

### Sprint 123A.1 — DATABENTO_DECISION_AUTHORITY removed from Sprint 123A

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — DATABENTO_DECISION_AUTHORITY removed from Sprint 123A > TEST-123A1-027: Sprint123AAuthorityMode type does not include DATABENTO_DECISION_AUTHORITY
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — DATABENTO_DECISION_AUTHORITY removed from Sprint 123A > TEST-123A1-028: getMarketDataAuthority throws on DATABENTO_DECISION_AUTHORITY (fail closed)
```

### Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural)

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-007: Databento rejected in TRADINGVIEW_ONLY mode — no subsystem called
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-008: TradingView accepted in TRADINGVIEW_ONLY mode — authority guard passes
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-009: TradingView accepted in DATABENTO_SHADOW mode
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-009B: Databento rejected in DATABENTO_SHADOW mode — triggerSource must be TRADINGVIEW
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-010: TradingView accepted in DATABENTO_CHART_AUTHORITY mode
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-010B: Databento rejected in DATABENTO_CHART_AUTHORITY mode — triggerSource must be TRADINGVIEW
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-011: TradingView rejected in DATABENTO_LEARNING_AUTHORITY mode — triggerSource must be DATABENTO
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-012: Databento accepted in DATABENTO_LEARNING_AUTHORITY mode
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Authority Matrix (behavioural) > TEST-123A1-013: authorityMode payload mismatch is rejected before any subsystem is called
```

### Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural)

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-014: liveLearnEngine.processLiveBar called exactly once per bar
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-015: darwinAutonomous.onNewBarObservation called exactly once per bar (G-001 fix)
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-016: behaviourEngine.runBehaviourEngineShadow called exactly once per bar
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-017: liveLearnEngine failure does not stop DARWIN or behaviourEngine
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-018: DARWIN failure does not stop behaviourEngine
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-019: no subsystem runs after authority violation
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — postBarAutomation Subsystem Isolation (behavioural) > TEST-123A1-020: processBar is never called by postBarAutomation (source boundary)
```

### Sprint 123A.1 — Monthly Review Handler (G-002 fix, runtime)

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Monthly Review Handler (G-002 fix, runtime) > TEST-123A1-021: handleMonthlyReview calls runMonthlyAudit exactly once and returns real result
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Monthly Review Handler (G-002 fix, runtime) > TEST-123A1-021B: handleMonthlyReview surfaces audit failure correctly
```

### Sprint 123A.1 — Nexus TradingView Flow (runtime source-boundary)

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Nexus TradingView Flow (runtime source-boundary) > TEST-123A1-029: nexusRoutes.ts invokes runPostBarAutomation (not liveLearnEngine directly)
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Nexus TradingView Flow (runtime source-boundary) > TEST-123A1-030: nexusRoutes.ts still invokes processBar exactly once (TradingView execution path)
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Nexus TradingView Flow (runtime source-boundary) > TEST-123A1-031: no direct liveLearnEngine.processLiveBar call in nexusRoutes.ts at runtime
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Nexus TradingView Flow (runtime source-boundary) > TEST-123A1-032: invalid authority — dependency loaders not invoked (runtime)
```

### Sprint 123A.1 — Migration 0026 Structure

```
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Migration 0026 Structure > TEST-123A1-022: CONTAINS_UNRESOLVED is absent from all ENUMs in migration 0026
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Migration 0026 Structure > TEST-123A1-023: all source bar tables have effective-once unique constraints
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Migration 0026 Structure > TEST-123A1-024: nanosecond timestamps stored as DECIMAL(20,0) for full precision
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Migration 0026 Structure > TEST-123A1-025: reconciliation_status is an ENUM column (not a boolean)
 ✓ server/sprint-123a1.test.ts > Sprint 123A.1 — Migration 0026 Structure > TEST-123A1-026: migration has separated rollback tiers (operational and destructive)
```

**Sprint 123A.1 unit total: 35 tests, 0 failures, 0 skipped**

### Sprint 123A.1 — Nexus Webhook Integration Tests

```
stderr | server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-006: automation failure does not suppress processBar
[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure
    at /home/ubuntu/atlas-nexus/server/sprint-123a1-integration.test.ts:273:48
    [... stack trace ...]

 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-001: processBar called exactly once per valid TradingView bar 514ms
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-002: runPostBarAutomation called exactly once per valid TradingView bar
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-003: liveLearnEngine.processLiveBar NOT called directly from nexusRoutes
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-004: persisted bar payload passed correctly to runPostBarAutomation
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-005: webhook response is not blocked by post-bar processing
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-006: automation failure does not suppress processBar
 ✓ server/sprint-123a1-integration.test.ts > Sprint 123A.1 — Nexus Webhook Integration Tests > INT-007: duplicate webhook returns 200 duplicate — no second postBarAutomation call
```

**Sprint 123A.1 integration total: 7 tests, 0 failures, 0 skipped**

**Expected stderr (INT-006):** `[POST_BAR_AUTO] runPostBarAutomation error: Error: Automation failure` — this is the correct non-suppression behaviour that INT-006 is designed to prove. The test passes.

---

## 3. Complete Sprint 123A.2 TypeScript Regression Output (Verbatim)

### validateBridgeTopology

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS001: passes for default localhost (Topology 1/2)
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS002: passes for explicit 127.0.0.1 (Topology 1/2)
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS003: throws for public IPv4 without TLS (public binding always rejected)
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS004: throws for public IPv4 even WITH TLS (Revision 3 — public binding prohibited)
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS005: passes for Docker private address (10.x.x.x) without TLS
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS006: passes for private 192.168.x.x without TLS
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS007: passes for 172.17.x.x Docker bridge without TLS
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS008: throws for 172.32.x.x (not RFC 1918, public range) — always rejected
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS021: throws for wildcard 0.0.0.0 (binds all interfaces — always rejected)
 ✓ server/market-data/tests/sprint-123a2.test.ts > validateBridgeTopology > TEST-123A2-TS022: throws for IPv6 wildcard :: (binds all interfaces — always rejected)
```

### isPrivateOrLoopback

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS023: 127.0.0.1 is private
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS024: ::1 is private (IPv6 loopback)
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS025: fe80::1 is private (IPv6 link-local)
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS026: fd00::1 is private (IPv6 ULA)
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS027: 2001:db8::1 is NOT private (IPv6 documentation range)
 ✓ server/market-data/tests/sprint-123a2.test.ts > isPrivateOrLoopback > TEST-123A2-TS028: 0.0.0.0 is NOT private (wildcard)
```

### isWildcard

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > isWildcard > TEST-123A2-TS029: 0.0.0.0 is a wildcard
 ✓ server/market-data/tests/sprint-123a2.test.ts > isWildcard > TEST-123A2-TS030: :: is a wildcard
 ✓ server/market-data/tests/sprint-123a2.test.ts > isWildcard > TEST-123A2-TS031: 127.0.0.1 is NOT a wildcard
```

### DatabentoBridgeServer — authentication

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — authentication > TEST-123A2-TS009: throws at construction if BRIDGE_AUTH_TOKEN is not set
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — authentication > TEST-123A2-TS010: bridge session ID is a non-empty UUID string
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — authentication > TEST-123A2-TS011: two server instances have different bridge session IDs
```

### DatabentoBridgeServer — secret redaction

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — secret redaction > TEST-123A2-TS012: getStats() does not contain BRIDGE_AUTH_TOKEN
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — secret redaction > TEST-123A2-TS013: toJSON() does not contain BRIDGE_AUTH_TOKEN
```

### DatabentoBridgeServer — authority boundary / schema validation / BRIDGE_HOST / graceful shutdown

```
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — authority boundary > TEST-123A2-TS014: isReadyToReceive returns false when server is not started
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — authority boundary > TEST-123A2-TS015: getStats reflects initial state correctly
 ✓ server/market-data/tests/sprint-123a2.test.ts > BRIDGE_PROTOCOL_VERSION > TEST-123A2-TS016: protocol version is 123A.2
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — schema validation (unit) > TEST-123A2-TS017: server constructs successfully with valid token and localhost
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — schema validation (unit) > TEST-123A2-TS018: bridgeSessionId is set at construction time
 ✓ server/market-data/tests/sprint-123a2.test.ts > BRIDGE_HOST > TEST-123A2-TS019: BRIDGE_HOST defaults to 127.0.0.1 when env not set
 ✓ server/market-data/tests/sprint-123a2.test.ts > DatabentoBridgeServer — graceful shutdown > TEST-123A2-TS020: stop() on a non-started server does not throw
```

**Expected stderr (TS005, TS006, TS007):**
```
[BridgeServer] BRIDGE_HOST is a private network address (10.0.0.2). Ensure the bridge is not reachable from outside the private network.
[BridgeServer] BRIDGE_HOST is a private network address (192.168.1.100). Ensure the bridge is not reachable from outside the private network.
[BridgeServer] BRIDGE_HOST is a private network address (172.17.0.1). Ensure the bridge is not reachable from outside the private network.
```
These are correct advisory warnings for non-loopback private addresses. All three tests pass.

**Expected stderr (TEST-123A1-007):**
```
[Atlas config] INVARIANT VIOLATION: In TRADINGVIEW_ONLY mode, postBarAutomation must be triggered by TRADINGVIEW. Got triggerSource=DATABENTO.
```
Correct authority rejection. Test passes.

**Unexpected stderr:** None.

**Sprint 123A.2 TypeScript total: 31 tests, 0 failures, 0 skipped**

---

## 4. Vitest Summary Line (Verbatim)

```
 Test Files  3 passed (3)
      Tests  73 passed (73)
   Start at  07:08:32
   Duration  1.11s (transform 473ms, setup 0ms, collect 601ms, tests 669ms, environment 1ms, prepare 212ms)
```

| Suite | Count |
|-------|-------|
| Sprint 123A.1 unit (`sprint-123a1.test.ts`) | 35 |
| Sprint 123A.1 integration (`sprint-123a1-integration.test.ts`) | 7 |
| Sprint 123A.2 TypeScript (`sprint-123a2.test.ts`) | 31 |
| **Total TypeScript** | **73** |
| Failures | 0 |
| Skipped | 0 |

---

## 5. Python Regression Output

**Command:** `python3 -m pytest services/databento-feed/tests/ -v`

**Result: 143 passed in 3.84s — 0 warnings**

```
============================= 143 passed in 3.84s ==============================
```

| Test File | Tests | Warnings |
|-----------|-------|----------|
| `test_real_definition_fixture.py` | 10 | 0 |
| `test_bridge_records.py` | 24 | 0 |
| `test_replay_client.py` | 24 | 0 |
| `test_dbn_fixtures.py` | 14 | 0 |
| `test_feed_adapter.py` | 19 | 0 |
| `test_health_states.py` | 11 | 0 |
| `test_recovery_manager.py` | 11 | 0 |
| `test_historical_client.py` | 10 | 0 |
| `test_symbol_resolver.py` | 13 | 0 |
| `test_overflow_policy.py` | 7 | 0 |
| **Total** | **143** | **0** |

**Warning corrections applied:**

- `pytest.mark.asyncio` removed from module-level `pytestmark` in `test_replay_client.py`, `test_dbn_fixtures.py`, and `test_real_definition_fixture.py`. Per-function `@pytest.mark.asyncio` decorators added to all async test functions only.
- `datetime.utcfromtimestamp()` replaced with `datetime.fromtimestamp(ts_s, tz=datetime.timezone.utc)` in `historical_client.py`.

---

## 6. TypeScript Compilation

**Command:** `pnpm tsc --noEmit`

**Result:** Exit code 0 — no output — clean compilation.

---

## 7. DBN Fixture Classification

The TIER 2 fixture `mnq_definition_record.dbn` is classified precisely as:

> **A synthetic SDK-created record encoded to DBN and decoded through the official DBN decoder.**

It is not captured live market data. It was constructed using the `databento_dbn.InstrumentDefMsg` constructor with synthetic test parameters, encoded to DBN binary format via `bytes(msg)`, and decoded via `databento_dbn.DBNDecoder`. No live Databento API connection was used.

See `services/databento-feed/tests/fixtures/DBN_FIXTURE_MANIFEST.md` for full provenance.

---

## 8. Total Unique Test Count

| Suite | Tests | Result |
|-------|-------|--------|
| Sprint 123A.1 unit | 35 | ALL PASS |
| Sprint 123A.1 integration | 7 | ALL PASS |
| Sprint 123A.2 TypeScript | 31 | ALL PASS |
| Sprint 123A.2 Python | 143 | ALL PASS |
| `pnpm tsc --noEmit` | — | Exit 0 |
| **Total unique tests** | **216** | **ALL PASS** |
| Failures | 0 | — |
| Skipped | 0 | — |
| Unexpected warnings | 0 | — |

---

*Atlas Nexus — Sprint 123A.2 — Gate G2 Final Approval Submission (Revision 2)*  
*2026-07-19*
