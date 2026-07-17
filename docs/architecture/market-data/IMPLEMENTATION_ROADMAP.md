# Atlas Market Data Implementation Roadmap

**Document type:** Implementation Roadmap  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17

---

## Overview

This roadmap translates the Atlas market data architecture design into a sprint-by-sprint implementation plan. Each sprint has a single clear objective, explicit deliverables, acceptance criteria, and rollback procedures. The roadmap spans Sprints 121–127 and culminates in the full deployment of the Atlas Market Data Platform.

---

## Sprint 121: DataBento Infrastructure (No Live Connection)

**Objective:** Build all DataBento infrastructure without connecting to the live feed.

**Deliverables:**

| Deliverable | File | Description |
|---|---|---|
| DBN parser | `server/market-data/dbn-parser.ts` | Binary DBN record parsing |
| DataBento client | `server/market-data/databento-client.ts` | TCP connection, auth, subscription (disabled) |
| Event normaliser | `server/market-data/event-normalizer.ts` | MBP-1 → AtlasTradeEvent/AtlasQuoteEvent |
| Symbol registry | `server/market-data/symbol-registry.ts` | MNQ instrument spec, SymbolMappingMsg handling |
| Event bus | `server/market-data/event-bus.ts` | In-process EventEmitter |
| Feed health | `server/market-data/feed-health.ts` | Six-state state machine |
| Market event types | `shared/types/market-events.ts` | All AtlasMarketEvent interfaces |
| Schema migration | `drizzle/schema.ts` | atlas_ticks, atlas_quotes, atlas_bars_1m, atlas_symbol_registry, atlas_contract_rolls, atlas_chart_annotations |
| Unit tests | `server/market-data/*.test.ts` | All modules covered |
| Secret | `DATABENTO_API_KEY` | Added via webdev_request_secrets |

**Acceptance criteria:**
- All unit tests pass
- TypeScript compiles without errors
- DataBento client is instantiated but NOT started (no live connection)
- Schema migration applied successfully
- No changes to M-16 pipeline

**Estimated effort:** 5–7 days

---

## Sprint 122: Shadow Mode Connection

**Objective:** Connect DataBento in shadow mode. Build bars. Store ticks. No processBar() calls from DataBento.

**Deliverables:**

| Deliverable | File | Description |
|---|---|---|
| Bar builder | `server/market-data/bar-builder.ts` | 5-min OHLCV from trades |
| Tick storage | `server/market-data/tick-storage.ts` | Insert into atlas_ticks, atlas_quotes |
| Parity monitor | `server/market-data/parity-monitor.ts` | Compare DataBento vs M-16 bars |
| Shadow mode flag | `server/market-data/config.ts` | `DATABENTO_SHADOW_MODE=true` |
| Feature engine stub | `server/market-data/feature-engine.ts` | Calculate indicators for DataBento bars |
| SSE extension | `server/nexusRoutes.ts` | Add feed_health event to SSE stream |
| Dashboard indicator | `client/src/components/FeedHealthBadge.tsx` | Feed health status display |
| Integration tests | `server/market-data/integration.test.ts` | End-to-end pipeline tests |

**Acceptance criteria:**
- DataBento client connects and receives MBP-1 data
- Bar builder produces confirmed bars matching M-16 bars (parity ≥ 99.9%)
- Tick data stored in atlas_ticks
- Feed health indicator visible on dashboard
- processBar() NOT called from DataBento path
- M-16 pipeline unchanged

**Estimated effort:** 7–10 days

---

## Sprint 123: Shadow Mode Certification

**Objective:** Run shadow mode for 5 consecutive trading days and validate parity.

**Deliverables:**

| Deliverable | Description |
|---|---|
| Parity report | Daily report of bar parity statistics |
| Certification checklist | Completed Gate 1 certification checklist |
| Parity dashboard panel | Observatory page panel showing parity history |

**Acceptance criteria:** Gate 1 certification passes (see TESTING_AND_CERTIFICATION_PLAN.md).

**Estimated effort:** 5 trading days (monitoring only, minimal code)

---

## Sprint 124: Dual-Primary and Live Chart

**Objective:** Promote DataBento to dual-primary. Deploy live chart with developing bar.

**Deliverables:**

| Deliverable | File | Description |
|---|---|---|
| Dual-primary activation | `server/market-data/config.ts` | `DATABENTO_DUAL_PRIMARY=true` |
| processBar() integration | `server/market-data/bar-builder.ts` | Call processBar() on confirmed bars |
| Idempotency guard | `server/nexusRoutes.ts` | Prevent duplicate processBar() calls |
| Live chart component | `client/src/components/LiveChart.tsx` | TradingView Lightweight Charts |
| Developing bar SSE | `server/market-data/sse-fanout.ts` | atlas_bar_developing events |
| Trade annotations | `server/market-data/annotation-writer.ts` | Insert into atlas_chart_annotations |
| Chart annotations UI | `client/src/components/LiveChart.tsx` | Render trade markers |

**Acceptance criteria:**
- DataBento triggers processBar() first on ≥ 95% of bars
- Zero duplicate processBar() calls
- Live chart displays developing bar updates
- Trade annotations visible on chart

**Estimated effort:** 7–10 days

---

## Sprint 125: Dual-Primary Certification

**Objective:** Run dual-primary for 5 consecutive trading days and validate.

**Deliverables:**

| Deliverable | Description |
|---|---|
| Dual-primary report | Daily report of trigger source statistics |
| Certification checklist | Completed Gate 2 certification checklist |

**Acceptance criteria:** Gate 2 certification passes.

**Estimated effort:** 5 trading days (monitoring only)

---

## Sprint 126: DataBento Primary Promotion

**Objective:** Promote DataBento to exclusive primary. M-16 becomes fallback only.

**Deliverables:**

| Deliverable | File | Description |
|---|---|---|
| M-16 watchdog mode | `server/nexusRoutes.ts` | M-16 no longer triggers processBar() |
| Fallback activation | `server/market-data/feed-health.ts` | Activate M-16 on DataBento failure |
| Controlled rollback test | Test procedure | Manual disconnect/reconnect test |
| Primary promotion report | Documentation | 10-day certification report |

**Acceptance criteria:** Gate 3 certification passes. Rollback test passes.

**Estimated effort:** 3–5 days

---

## Sprint 127: Replay Engine

**Objective:** Implement the Atlas Replay Engine and cold tier storage.

**Deliverables:**

| Deliverable | File | Description |
|---|---|---|
| Replay event generator | `server/market-data/replay-generator.ts` | Historical events from storage |
| Replay session manager | `server/market-data/replay-manager.ts` | Session lifecycle management |
| Replay clock | `server/market-data/replay-clock.ts` | Virtual clock for deterministic replay |
| Cold tier export | `server/market-data/cold-tier-export.ts` | S3 Parquet export |
| DARWIN integration | `server/darwin/replay-integration.ts` | Research session management |
| Replay certification | Test procedure | Gate 4 certification |

**Acceptance criteria:** Gate 4 certification passes. Replay is deterministic.

**Estimated effort:** 10–14 days

---

## Dependency Map

```
Sprint 121 (Infrastructure)
    ↓
Sprint 122 (Shadow Mode)
    ↓
Sprint 123 (Shadow Certification) ← 5 trading days
    ↓
Sprint 124 (Dual-Primary + Live Chart)
    ↓
Sprint 125 (Dual-Primary Certification) ← 5 trading days
    ↓
Sprint 126 (Primary Promotion)
    ↓
Sprint 127 (Replay Engine)
```

---

## Pre-Sprint 121 Prerequisites

Before Sprint 121 begins, the following must be completed:

1. **DataBento account created** — Sign up at databento.com
2. **DataBento API key obtained** — Generate in the DataBento dashboard
3. **DataBento Standard plan activated** — Confirm GLBX.MDP3 live data access
4. **Sprint 120 design review approved** — All 19 documents reviewed and approved
5. **ADRs approved** — All 12 ADRs reviewed and approved
6. **DATABENTO_API_KEY secret added** — Added to Atlas environment via webdev_request_secrets

---

## Total Estimated Timeline

| Phase | Sprints | Calendar Duration |
|---|---|---|
| Infrastructure | 121 | 1–2 weeks |
| Shadow mode + certification | 122–123 | 2–3 weeks |
| Dual-primary + certification | 124–125 | 2–3 weeks |
| Primary promotion | 126 | 1 week |
| Replay engine | 127 | 2–3 weeks |
| **Total** | **121–127** | **8–12 weeks** |

---

*This roadmap is the authoritative implementation schedule for the Atlas Market Data Platform. Sprint scope may be adjusted based on certification results, but the phase sequence and gate requirements are fixed.*
