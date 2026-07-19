# Sprint 123A.3 — Planning Context (saved 2026-07-19)

## Gate G2 Approval
- Approved SHA: 1b73c5d2e087b5a5228446df1bf8bd8298a69a4b
- Evidence lock SHA: 6b521a8 (final)
- Branch: sprint/123a-2-databento-adapter

## Authorised Scope (Sprint 123A.3)
1. TypeScript canonical one-minute bar construction
2. Developing / provisional / confirmed / unresolved bar lifecycles
3. Reconciliation against official Databento ohlcv-1m records
4. Five-minute aggregation from five confirmed one-minute bars ONLY
5. Gap detection and historical recovery integration
6. Contract definition and symbol-mapping handling
7. Contract-roll preparation
8. Effectively-once processing and persistence preparation
9. Fixture-based and disposable-database validation
10. Parity-data preparation while TradingView remains authoritative

## NOT Authorised
- Migration 0026 against production
- DATABENTO_SHADOW activation
- DATABENTO_CHART_AUTHORITY or DATABENTO_LEARNING_AUTHORITY
- DATABENTO_DECISION_AUTHORITY
- Databento-triggered postBarAutomation or processBar
- Changes to ADE, strategies, risk, execution
- Production chart cutover
- Direct browser access to Databento

## Key Existing Infrastructure
- `server/market-data/bridge-server.ts` — emits events to AtlasEventBus
  - `databento:ohlcv-1m` → BridgeOhlcv1mPayload
  - `databento:trade` → BridgeTradePayload
  - `databento:definition` → BridgeDefinitionPayload
  - `databento:symbol-mapping` → BridgeSymbolMappingPayload
  - `databento:gap-detected` → BridgeGapDetectedPayload
  - `databento:recovery` → BridgeRecoveryPayload
- `server/market-data/event-bus.ts` — AtlasEventBus (EventEmitter)
- `server/market-data/gap-detector.ts` — sequence gap monitoring
- `server/market-data/symbol-registry.ts` — MNQ instrument spec

## Migration 0026 Schema (NOT run against production)
File: `drizzle/0026_sprint_123a1_foundation.sql`

### atlas_bars_1m
- source, dataset, raw_symbol, instrument_id
- bar_open_ts_ms (BIGINT), bar_open_ts_ns (DECIMAL(20,0)), bar_close_ts_ms
- open/high/low/close_price_pts100 (BIGINT — integer * 100)
- volume, trade_count
- reconciliation_status ENUM('MATCHED','UNMATCHED','PENDING','UNAVAILABLE')
- recon_close/high/low_delta_pts100, recon_volume_delta, recon_within_tolerance, recon_tolerance_pts100
- revision INT, mapping_version VARCHAR(50)
- UNIQUE KEY: (source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version)

### atlas_bars_5m
- canonical_bar_type ENUM('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')
  — CONTAINS_UNRESOLVED intentionally absent
- minute_bar_count INT (must be 5)
- UNIQUE KEY: (source, dataset, instrument_id, bar_open_ts_ms, revision, mapping_version)

### atlas_canonical_bars
- authority_source ENUM('TRADINGVIEW','DATABENTO')
- contains_unresolved_minutes TINYINT always 0
- canonical_bar_type ENUM('LIVE_CONFIRMED','CONTAINS_SYNTHETIC','RECOVERED')
- dispatched_to_process_bar, dispatched_to_post_bar_auto

## Bar Lifecycle States (Sprint 123A.3 must implement)
Based on migration schema and approval:
- PROVISIONAL: received from bridge, not yet reconciled
- DEVELOPING: within current minute window, still accumulating
- CONFIRMED (MATCHED): reconciled against ohlcv-1m, within tolerance
- UNRESOLVED (UNMATCHED/PENDING): reconciliation failed or pending
- Only CONFIRMED bars may be forwarded to Five-Min Aggregator

## Sprint 123A.3 New Files to Create
- `server/market-data/bar-builder.ts` — one-minute bar construction engine
- `server/market-data/bar-reconciler.ts` — reconciliation against ohlcv-1m
- `server/market-data/five-min-aggregator.ts` — 5m aggregation (5 confirmed only)
- `server/market-data/contract-manager.ts` — definition/symbol-mapping/roll handling
- `server/market-data/bar-persistence.ts` — effectively-once write to atlas_bars_1m/5m
- `server/market-data/types/bar-lifecycle.ts` — BarLifecycle enum, typed interfaces
- `server/market-data/tests/sprint-123a3.test.ts` — Gate G3 test suite

## Gate G3 Evidence Required
- Complete implementation evidence
- One-minute lifecycle tests
- Official-bar reconciliation evidence
- Unresolved-bar blocking evidence
- Five-minute aggregation evidence
- Gap recovery evidence
- Contract mapping and rollover evidence
- Effectively-once and duplicate handling evidence
- Migration compatibility evidence
- Rollback evidence
- Confirmation that no production authority changed
