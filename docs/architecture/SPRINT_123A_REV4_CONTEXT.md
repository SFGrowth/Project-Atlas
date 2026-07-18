# Sprint 123A Revision 4 — Working Context (DO NOT COMMIT)

## Current state
- HEAD: 6b05ff1
- All 17 Sprint 123A docs at Rev 3 state
- Gate G0 still withheld — 10 corrections required

## Content hashes at 6b05ff1
ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md  22332a7679555449
ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md      20c1b6a373b201ab
ATLAS_EFFECTIVELY_ONCE_PROCESSING.md       3164aa0826c10a2c
BDE_CAPABILITY_STATUS.md                   0d13b39020f857ec
BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md         7d034ec882b9584c
DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md  8d0f971749705036
DATABENTO_DEPLOYMENT_TOPOLOGY.md           b823b212e7476451
DATABENTO_NO_TRADE_AND_GAP_POLICY.md       f329fe15a83b8351
DATABENTO_PARITY_CERTIFICATION_SPEC.md     0a8633969b77be06
DATABENTO_PYTHON_FEED_SERVICE_SPEC.md      3e0ccaa2cc790f87
SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md 41e0dc8132e89e1d
SPRINT_123A_AMENDMENT_REPORT.md            e771026be94bab24
SPRINT_123A_DEPENDENCY_DIAGRAM.md          1cf05d79fdc541ba
SPRINT_123A_GATE_G0_FINAL_RECONCILIATION.md b6b0d8dcdb06ce4a
SPRINT_123A_GATE_G0_FINAL_VERIFICATION.md  9e85a87ac5eb95c1
SPRINT_123A_GATE_MATRIX.md                 dfa7fdd4a777001f
SPRINT_123A_RISK_REGISTER.md               d462b8f53abb83e7
SPRINT_123A_TEST_MANIFEST.md               2419ca5d322bb1e0

## 10 Corrections to apply

### Correction 1 — Version the document set
- Add content hash + commit SHA to document manifest in Final Verification + Reconciliation
- Remove all stale refs: "Revision 2", "Revision 3 pending", "not yet committed", "16-document"
- Authoritative state: Parity Spec Rev 3, Test Manifest Rev 3, Gate Matrix Rev 3, 17 docs, 61 tests

### Correction 2 — Separate provisional/confirmed bar events
4 distinct events (no more isReconciled=false on AtlasBarConfirmed):
- AtlasBarDeveloping — live trade updates
- AtlasBarProvisionalClosed — minute boundary, chart only, NOT canonical, NOT eligible for aggregation
- AtlasBarConfirmed — after ohlcv-1m reconciliation PASSES, reconciliationStatus=MATCHED, eligible for aggregation
- AtlasBarUnresolved — official bar missing or reconciliation fails, never eligible for aggregation

### Correction 3 — Standardise timestamp units
All canonical Atlas timestamps: UTC milliseconds
- barOpenTsMs, barCloseTsMs, atlasTsMs, rollTsMs
Raw Databento nanoseconds preserved separately:
- tsEventNs, tsRecvNs
Convert ns→ms ONCE at Python/feed-adapter boundary
Update: event contracts, parity spec, test manifest, effectively-once key spec, DB schema spec, chart contracts

### Correction 4 — Source-safe CanonicalEventId
Replace single struct with discriminated union:
- DatabentoEventId: source, dataset, rawSymbol, instrumentId, interval, barOpenTsMs, revision, mappingVersion
- TradingViewEventId: source, sourceInstrumentKey, interval, barOpenTsMs, revision
Both must serialize deterministically.
Add 6 tests: Databento ID, TradingView ID, deterministic serialization, no collision, revision handling, roll mapping version

### Correction 5 — Bar lifecycle tests
Replace TEST-123A3-001 sequence:
- 001A: Trades → AtlasBarDeveloping
- 001B: Minute boundary → AtlasBarProvisionalClosed ONLY (not AtlasBarConfirmed)
- 001C: ohlcv-1m reconciliation passes → AtlasBarConfirmed
- 001D: Reconciliation discrepancy → AtlasBarUnresolved + alert
- 001E: Missing official bar → UNRESOLVED, cannot enter aggregator
No test may expect AtlasBarConfirmed from trade records alone.

### Correction 6 — Remove canonical unresolved overrides
Delete operator-override path for CanonicalBarConfirmed with containsUnresolvedMinutes=true
CanonicalBarConfirmed ALWAYS has containsUnresolvedMinutes=false
New event: AtlasBarReleasedForInspection (Phil-approved inspection only)
- Consumed ONLY by: chart inspection, diagnostics, research tooling
- NEVER by: postBarAutomation, liveLearnEngine, BE canonical, DARWIN canonical, ADE, strategies, execution

### Correction 7 — MNQ parity units
Replace "0.25 ticks" with "1 tick = 0.25 index points"
Add units table to Parity Spec
Every metric must state its unit explicitly

### Correction 8 — Feed availability definition
NOT "a trade occurred in every minute"
Feed availability = live connection heartbeat + bridge heartbeat + sequence continuity + ohlcv-1m arrival/recovery + feed-health state
Separate metric: trade-active-minute rate (informational only, not a gate)

### Correction 9 — Gate references
Gate G4 and G7 reference Parity Spec Rev 3 (not Rev 2)
Do not restate thresholds in Gate Matrix
Clarify G7: requires only Gate G4 parity to remain valid; G6A is optional
G6A activation must remain optional

### Correction 10 — Final verification report
Create: docs/reports/SPRINT_123A_GATE_G0_CONTRACT_RECONCILIATION.md
Include: final SHA, baseline SHA, doc count, test count, risk count, doc revisions,
timestamp unit decision, canonical event-ID design, provisional/confirmed/unresolved contracts,
parity tick-unit correction, feed-availability correction, no production code, no migration,
no Databento connection, unresolved issues, explicit Gate G0 recommendation

## Test count after Rev 4
Current: 61 tests
Adding 6 new CanonicalEventId tests → 67 tests
TEST-123A3-001 sequence: 001A-001E already exist (5 tests)
Net change: +6 (CanonicalEventId tests) = 67 total
