# Atlas Market Data Architecture

**Document type:** Master Architecture Overview  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Author:** Atlas Engineering (DARWIN Research Engine)

---

## Executive Summary

This document is the master reference for the Atlas Market Data Architecture. It describes the complete design for evolving Atlas from its current TradingView M-16 webhook-based data pipeline into a continuous, institutional-grade live market data platform powered by DataBento.

Sprint 120 is a **design-only sprint**. No production code changes, no strategy rule modifications, no ADE/ARI/TVL/Guardian/Safety alterations, and no live feed switches are made during this sprint. Every decision recorded here must be reviewed and approved before implementation begins in Sprint 121.

---

## Document Index

| Document | Purpose |
|---|---|
| `MARKET_DATA_ARCHITECTURE.md` | This document — master overview and index |
| `CURRENT_STATE.md` | Current TradingView M-16 production flow |
| `TARGET_STATE.md` | DataBento target architecture |
| `DATABENTO_INTEGRATION_DESIGN.md` | DataBento connection, schemas, symbols, pricing |
| `MARKET_EVENT_CONTRACTS.md` | Provider-independent internal event type definitions |
| `SYMBOL_AND_ROLL_SPEC.md` | Futures symbol registry and contract-roll policy |
| `BAR_BUILDER_SPEC.md` | Atlas live bar-building rules and specifications |
| `EVENT_TRANSPORT_DESIGN.md` | Internal event bus design and transport selection |
| `STORAGE_DESIGN.md` | Tiered storage architecture for market data |
| `LIVE_CHART_DESIGN.md` | Dashboard live-streaming and chart library design |
| `TRADE_ANNOTATION_SPEC.md` | Chart annotation and trade-marker architecture |
| `REPLAY_ARCHITECTURE.md` | Time Machine and replay engine design |
| `FAILOVER_AND_RECOVERY.md` | Feed failure detection and recovery procedures |
| `TRADINGVIEW_MIGRATION_PLAN.md` | Staged migration from M-16 to DataBento primary |
| `SECURITY_DESIGN.md` | Secret management, access control, audit logging |
| `OBSERVABILITY_PLAN.md` | Metrics, alerting, and monitoring design |
| `CAPACITY_AND_COST_MODEL.md` | Performance estimates and monthly cost model |
| `TESTING_AND_CERTIFICATION_PLAN.md` | Testing strategy and parity certification gates |
| `IMPLEMENTATION_ROADMAP.md` | Sprint 121–127 build sequence and acceptance gates |

### Architecture Decision Records

| ADR | Decision |
|---|---|
| `ADR-001-primary-market-data-provider.md` | DataBento as primary provider |
| `ADR-002-live-schema-selection.md` | MBP-1 as production live schema |
| `ADR-003-internal-event-contract.md` | Provider-independent Atlas event types |
| `ADR-004-event-transport.md` | In-process EventEmitter with Redis upgrade path |
| `ADR-005-storage-architecture.md` | Tiered MySQL hot/warm + object storage cold |
| `ADR-006-bar-building-standard.md` | Atlas-owned bar builder, 5-minute certified trigger |
| `ADR-007-chart-library.md` | TradingView Lightweight Charts |
| `ADR-008-timestamp-and-session-standard.md` | UTC storage, America/New_York sessions |
| `ADR-009-contract-roll-policy.md` | Volume-based roll, symbol registry |
| `ADR-010-tradingview-migration.md` | Four-phase staged migration |
| `ADR-011-feed-failover-policy.md` | Six-state feed health model |
| `ADR-012-replay-architecture.md` | Deterministic replay using live event contracts |

---

## Architectural Principles

The following fifteen principles govern every design decision in this architecture. They are non-negotiable and must be preserved through all implementation sprints.

**1. DataBento is the proposed primary market-data provider.** All live CME Globex data for MNQ and NQ will be sourced from DataBento's GLBX.MDP3 dataset once the migration is complete.

**2. Atlas must connect to DataBento from the backend only.** The DataBento API key and all raw market data connections must reside exclusively in the Atlas server process. No browser client may connect to DataBento directly.

**3. The browser must never connect directly to DataBento.** The dashboard receives all market data through Atlas's own streaming layer (SSE or WebSocket), not from any external provider.

**4. TradingView M-16 must remain active during migration as an independent fallback and validation feed.** M-16 is not removed from the critical path until DataBento has passed all parity and failover certification gates.

**5. Certified strategy decisions must initially remain based on confirmed 5-minute bars.** The `processBar()` function is only called on finalised 5-minute Atlas bars. Intrabar data may update charts and research but must not trigger certified execution decisions unless a future certified model explicitly requires it.

**6. Intrabar data may update charts, risk, position valuation and research continuously.** Developing-bar data from the live feed is used for dashboard display, position P&L, and DARWIN research. It does not trigger `processBar()`.

**7. Live tick data must not silently change certified strategy behaviour.** Any future model that requires tick-level triggers must be explicitly certified through the full DARWIN research and validation pipeline.

**8. Market data ingestion must be independent from execution.** The Atlas Market Data Gateway has no knowledge of strategy logic, ADE scoring, or execution dispatch. It only receives, normalises, stores, and publishes market events.

**9. Dashboard availability must never affect market-data ingestion or trading.** A dashboard disconnect, crash, or slow client must not pause, block, or corrupt the data pipeline.

**10. Every component must consume standardised Atlas market events rather than provider-specific messages.** ADE, DARWIN, Guardian, the bar builder, and the dashboard all consume `AtlasTradeEvent`, `AtlasQuoteEvent`, and `AtlasBarEvent` — never raw DataBento records.

**11. Provider replacement must be possible without rewriting ADE, DARWIN, Guardian or the dashboard.** The normalisation layer is the only component that knows about DataBento. All downstream components are provider-agnostic.

**12. Every market event must be timestamped, traceable and replayable.** Every event carries an exchange timestamp, an Atlas receipt timestamp, a sequence number where available, and a unique event ID.

**13. Feed interruption must be detected and surfaced immediately.** The feed health monitor detects silence within a configurable window and transitions the system to the appropriate degraded state.

**14. Duplicate and out-of-order events must be handled deterministically.** The normalisation layer uses sequence numbers and timestamps to detect and discard duplicates and to handle late-arriving events without corrupting bar state.

**15. All production design decisions must be documented through Architecture Decision Records.** Every major architectural choice has a corresponding ADR with context, alternatives, advantages, disadvantages, risks, and upgrade path.

---

## Target Architecture Overview

The target end-state data flow is as follows:

```
DataBento Live Market Data (GLBX.MDP3, MBP-1)
        ↓
Atlas Market Data Gateway
  ├── databento-client.ts      — TCP connection, authentication, reconnect
  ├── event-normalizer.ts      — DataBento → Atlas event contracts
  ├── symbol-registry.ts       — Contract mapping, roll management
  ├── gap-detector.ts          — Sequence gap detection
  └── feed-health.ts           — Health state machine
        ↓
Market Event Bus (in-process EventEmitter, Redis upgrade path)
        ↓
┌─────────────────────────────────────────────────────────────┐
│                    Parallel Consumers                        │
├──────────────────┬──────────────────┬───────────────────────┤
│ Live Bar Builder │ Tick Storage     │ Quote Storage         │
│ Feature Engine   │ Bar Storage      │ Position Valuation    │
│ DARWIN           │ Gap Discovery    │ Behaviour Discovery   │
│ Replay Engine    │ Feed Health Mon. │ Dashboard SSE         │
└──────────────────┴──────────────────┴───────────────────────┘
        ↓ (confirmed 5-minute bar only)
processBar()
        ↓
ADE Portfolio Selection
        ↓
ARI / TVL / Guardian / Safety
        ↓
Automatic Execution Dispatch
        ↓
TradersPost / Broker
```

The Market Data Service is the **single internal source of truth** for all market events. No other component connects directly to DataBento or to TradingView.

---

## Current State Summary

The current production system uses TradingView Pine Script M-16 as the sole market data source. M-16 runs on TradingView's servers, calculates all indicators, evaluates all strategy models, and fires a webhook to Atlas Nexus on every confirmed 5-minute bar close.

The current flow is:

```
TradingView (Pine Script M-16)
        ↓
5-minute bar close → webhook fired
        ↓
POST /api/webhook/observe/:token (Atlas Nexus)
        ↓
normalisePayload() → validatePayload()
        ↓
atlas_memory table insert
        ↓
barEvaluator.evaluate()
        ↓
processBar() → paperTradeEngine
        ↓
ADE → ARI → TVL → Guardian → Safety
        ↓
tpDispatch.ts → TradersPost webhook
```

The current system has several architectural limitations that this design addresses:

- Atlas depends entirely on TradingView's servers for market data delivery. Any TradingView outage, alert failure, or Pine Script error silences the entire pipeline.
- Indicators are calculated inside Pine Script, not in Atlas. Atlas cannot independently verify or recalculate any indicator.
- There is no live tick or quote data. Atlas only sees confirmed bar closes, not intrabar price action.
- The dashboard has no live chart. It displays the last received bar's data but cannot show a live candlestick.
- Historical data is not accessible to Atlas. DARWIN research relies on what Pine Script sends via webhook.
- Contract roll handling is implicit in TradingView's continuous symbol `MNQ1!`. Atlas has no symbol registry.

---

## Implementation Roadmap Summary

The implementation is divided into seven sprints following this sprint's design approval:

| Sprint | Focus | Key Deliverable |
|---|---|---|
| 121 | DataBento connection and normalisation | Live MBP-1 feed connected, events published to bus |
| 122 | Storage, symbol registry, live bar builder | Confirmed 5-minute Atlas bars stored |
| 123 | Feature engine and processBar() shadow mode | Atlas bars feed processBar() in parallel with M-16 |
| 124 | Dashboard live chart and trade annotations | Live candlestick chart with Atlas trade markers |
| 125 | Feed parity, recovery, production certification | DataBento vs M-16 parity certified |
| 126 | DataBento becomes primary production feed | M-16 demoted to fallback and watchdog |
| 127 | Historical replay and Time Machine foundation | Replay engine operational |

No sprint may begin until the previous sprint's acceptance gates have been met and the design documents for that sprint have been reviewed.

---

## Non-Negotiable Invariants for Sprint 120

The following constraints apply to this sprint and must be carried forward into all implementation sprints until explicitly reviewed:

- Do not remove M-16 during this sprint.
- Do not switch the production feed during this sprint.
- Do not alter live strategy rules (A1, A3, B1, SB1, ORB-1, A2).
- Do not alter ADE scoring.
- Do not alter ARI.
- Do not alter TVL.
- Do not alter Guardian.
- Do not alter Safety.
- Do not alter automatic execution behaviour.
- Do not expose DataBento credentials to the browser.
- Do not make the dashboard part of the execution path.
- Do not allow live-feed implementation to produce undocumented strategy changes.
- Do not use separate indicator implementations for live, historical and replay systems.
- Do not begin production migration until parity and failover criteria are defined.

---

*This document is the authoritative index for Sprint 120. All referenced documents are co-located in `/docs/architecture/market-data/`.*
