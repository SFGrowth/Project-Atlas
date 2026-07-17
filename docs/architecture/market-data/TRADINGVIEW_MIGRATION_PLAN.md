# TradingView M-16 to DataBento Migration Plan

**Document type:** Migration Plan  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-010

---

## Overview

This document specifies the step-by-step migration plan for transitioning Atlas from TradingView M-16 as the primary market data source to DataBento as the primary source. The migration is designed to be zero-risk: at no point does the live trading system lose its ability to process bars and dispatch trades. The migration proceeds through five phases, each with explicit rollback criteria.

---

## Migration Phases

### Phase 0: Pre-Migration (Sprint 120 — Current Sprint)

**Goal:** Complete design documentation. No code changes.

**Deliverables:** All 19 architecture documents, 12 ADRs, 7 diagrams, implementation roadmap.

**Exit criteria:** Design review approved. DataBento API key obtained. Sprint 121 scope confirmed.

**Rollback:** N/A — no code changes.

---

### Phase 1: Infrastructure (Sprint 121)

**Goal:** Add DataBento client infrastructure without connecting to live feed.

**Changes:**
- Add `DATABENTO_API_KEY` secret to Atlas environment
- Create `server/market-data/` directory structure
- Implement `databento-client.ts` with TCP connection, authentication, and DBN parser
- Implement `event-normalizer.ts` with price conversion and event contracts
- Implement `symbol-registry.ts` with MNQ instrument specification
- Implement `event-bus.ts` (in-process EventEmitter)
- Implement `feed-health.ts` state machine
- Add `atlas_ticks`, `atlas_quotes`, `atlas_bars_1m` tables to schema
- Add `atlas_symbol_registry`, `atlas_contract_rolls` tables to schema
- Add `atlas_chart_annotations` table to schema
- Write unit tests for all new modules
- DataBento client is instantiated but NOT started (no live connection)

**Exit criteria:** All unit tests pass. TypeScript compiles without errors. No live DataBento connection.

**Rollback:** Revert all Sprint 121 changes. M-16 pipeline unchanged and fully operational.

---

### Phase 2: Shadow Mode (Sprint 122–123)

**Goal:** Connect DataBento in shadow mode — receive data, build bars, but do NOT trigger processBar().

**Changes:**
- Start DataBento client in shadow mode
- Bar builder subscribes to trade events and builds confirmed bars
- Confirmed bars are stored in `atlas_memory` with `source = 'databento'` alongside M-16 bars
- Parity monitor compares DataBento bars against M-16 bars on every bar close
- Tick storage inserts into `atlas_ticks` and `atlas_quotes`
- Feature engine calculates indicators for DataBento bars (stored but not used for trading)
- Dashboard displays DataBento feed health indicator
- Dashboard displays parity status (MATCH / MISMATCH)
- `processBar()` is still triggered exclusively by M-16 webhook

**Exit criteria:**
- DataBento feed connected and receiving data for 5 consecutive trading days
- Bar parity ≥ 99.9% OHLCV exact match over 5 trading days
- Indicator parity ≥ 99.0% agreement over 5 trading days
- Zero unhandled exceptions in DataBento client
- Feed health state machine transitions correctly on simulated disconnect
- Owner has reviewed parity report and approved promotion

**Rollback:** Stop DataBento client. Remove shadow-mode code. M-16 pipeline unchanged.

---

### Phase 3: Dual-Primary (Sprint 124–125)

**Goal:** DataBento and M-16 both trigger processBar() — cross-validation with deduplication.

**Changes:**
- DataBento bar builder promoted to trigger `processBar()` on confirmed bars
- M-16 webhook continues to trigger `processBar()` as a parallel path
- Deduplication: if both feeds produce a bar for the same `barOpenTs`, only the first arrival triggers `processBar()` (idempotency key prevents double execution)
- Parity monitor logs any cases where M-16 triggers before DataBento
- Live chart implemented with DataBento developing-bar updates
- Trade annotations implemented

**Exit criteria:**
- DataBento triggers `processBar()` first on ≥ 95% of bars over 5 trading days
- Zero duplicate `processBar()` calls (idempotency confirmed)
- No execution discrepancies between DataBento-triggered and M-16-triggered bars
- Live chart displaying correctly on dashboard

**Rollback:** Demote DataBento to shadow mode. M-16 remains primary.

---

### Phase 4: DataBento Primary (Sprint 126)

**Goal:** DataBento is the exclusive primary feed. M-16 is fallback only.

**Changes:**
- M-16 webhook transitions to watchdog mode (no longer triggers `processBar()`)
- M-16 fallback activation logic implemented in feed health state machine
- Parity monitor continues to run for ongoing validation
- Owner notification system updated with new feed health alerts
- Monitoring dashboard updated to show DataBento as primary

**Exit criteria:**
- DataBento has been primary for 10 consecutive trading days
- M-16 fallback has been tested in a controlled disconnect scenario
- Parity monitor shows ≥ 99.9% agreement over the 10-day period
- No execution issues attributable to the DataBento feed
- Owner has reviewed and approved the final promotion

**Rollback:** Reactivate M-16 as primary. DataBento reverts to shadow mode.

---

### Phase 5: Replay Engine (Sprint 127)

**Goal:** Implement the Atlas Replay Engine using historical DataBento data.

**Changes:**
- Implement replay event generator
- Implement replay session management
- Implement DARWIN research integration with replay
- Implement cold tier S3 export
- Full replay certification test

**Exit criteria:** Replay produces deterministic results matching live system output for the same historical period.

---

## Migration Timeline

| Sprint | Phase | Key Milestone |
|---|---|---|
| 120 | Phase 0 | Design complete, ADRs approved |
| 121 | Phase 1 | Infrastructure deployed, no live connection |
| 122 | Phase 2 | Shadow mode connected, parity monitoring active |
| 123 | Phase 2 | 5-day parity validation complete |
| 124 | Phase 3 | Dual-primary active, live chart deployed |
| 125 | Phase 3 | Dual-primary certification complete |
| 126 | Phase 4 | DataBento primary, M-16 fallback only |
| 127 | Phase 5 | Replay engine deployed |

---

## Rollback Decision Matrix

| Condition | Action |
|---|---|
| DataBento OHLCV disagrees with M-16 by > 0.25 points | Immediate rollback to M-16 primary |
| DataBento indicator disagrees with M-16 by > 1% | Rollback to shadow mode, investigate |
| Any duplicate processBar() call | Immediate rollback to M-16 primary |
| Any execution dispatch during shadow mode | Immediate rollback, security review |
| DataBento offline > 10 minutes during RTH | Activate M-16 fallback (not a rollback) |
| DataBento API key compromised | Immediate rollback, rotate key |
| Owner requests rollback | Immediate rollback, no questions asked |

---

## M-16 Permanent Retention

TradingView M-16 is retained permanently as a fallback and watchdog. It is never decommissioned. The Pine Script M-16 alert continues to fire on every 5-minute bar close indefinitely. This provides:

1. A fallback feed if DataBento experiences extended outages
2. A continuous cross-validation signal for bar parity monitoring
3. An independent data source for DARWIN research cross-validation
4. A recovery path if DataBento pricing becomes prohibitive

The cost of retaining M-16 is zero (TradingView alert is already configured and paid for).

---

*This migration plan is the authoritative schedule for the DataBento integration. No phase may be skipped. Each phase requires explicit exit criteria validation before proceeding.*
