# Atlas Market Data Testing and Certification Plan

**Document type:** Test Strategy  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17

---

## Overview

This document specifies the testing and certification strategy for the Atlas market data system. The strategy is structured around four certification gates that must be passed before DataBento can be promoted to primary feed status. Each gate has explicit pass/fail criteria.

---

## Test Categories

### Unit Tests (Vitest)

Unit tests cover individual module behaviour in isolation. They run on every code change and must pass before any deployment.

| Module | Test Coverage Required | Key Test Cases |
|---|---|---|
| `databento-client.ts` | DBN parser accuracy | Parse MBP-1 record, price conversion, bigint handling |
| `event-normalizer.ts` | Normalisation correctness | Trade event, quote event, snapshot flag, F_LAST flag |
| `symbol-registry.ts` | Mapping correctness | SymbolMappingMsg processing, roll detection |
| `bar-builder.ts` | Bar construction | Single bar, multi-bar, empty bar, late trade, roll mid-bar |
| `feed-health.ts` | State machine transitions | All valid transitions, invalid transition rejection |
| `gap-detector.ts` | Gap detection | Sequential, gap, wrap-around, duplicate |
| `event-bus.ts` | Pub/sub correctness | Subscribe, publish, unsubscribe, multiple consumers |

### Integration Tests

Integration tests verify the interaction between modules using recorded DataBento data.

| Test | Description | Pass Criteria |
|---|---|---|
| `databento-to-bar` | Full pipeline from raw DBN records to confirmed bar | Bar OHLCV matches expected values from test fixture |
| `bar-to-processbar` | Confirmed bar triggers processBar() with correct BarData | processBar() called exactly once per confirmed bar |
| `failover-activation` | DataBento disconnect activates M-16 fallback | Fallback active within 120 seconds of disconnect |
| `failover-recovery` | DataBento reconnect deactivates M-16 fallback | Fallback deactivated within 30 seconds of reconnect |
| `parity-monitor` | M-16 bar compared against DataBento bar | MATCH status for identical bars, MISMATCH for different |

### Shadow Mode Certification (Gate 1)

**Duration:** 5 consecutive trading days  
**Trigger:** Automatic after Sprint 122 deployment

| Metric | Pass Threshold |
|---|---|
| DataBento connection uptime (RTH) | ≥ 99.5% |
| Bar OHLCV parity with M-16 | ≥ 99.9% exact match |
| Indicator parity with M-16 | ≥ 99.0% within 0.01% |
| Unhandled exceptions | 0 |
| processBar() called from DataBento | 0 (shadow mode only) |
| M-16 processBar() calls | 100% (unchanged) |

### Dual-Primary Certification (Gate 2)

**Duration:** 5 consecutive trading days  
**Trigger:** Manual after Gate 1 passes

| Metric | Pass Threshold |
|---|---|
| DataBento triggers processBar() first | ≥ 95% of bars |
| Duplicate processBar() calls | 0 |
| Execution discrepancies | 0 |
| Live chart update rate | ≥ 1 update/second during RTH |
| Feed health state machine accuracy | 100% correct transitions |

### Primary Promotion Certification (Gate 3)

**Duration:** 10 consecutive trading days  
**Trigger:** Manual after Gate 2 passes

| Metric | Pass Threshold |
|---|---|
| DataBento primary uptime | ≥ 99.5% during RTH |
| M-16 fallback activations | 0 (unless DataBento actually fails) |
| Parity match rate | ≥ 99.9% |
| Owner review and approval | Required |

### Replay Certification (Gate 4)

**Duration:** One-time test  
**Trigger:** Manual after Sprint 127 deployment

| Test | Pass Criteria |
|---|---|
| Determinism test | Same replay session produces identical results on 3 consecutive runs |
| Historical parity test | Replay of last 30 days matches live system records for all bars |
| DARWIN integration test | DARWIN can query replay results and produce research findings |

---

## Rollback Test

Before promoting DataBento to primary, a controlled rollback test is performed:

1. DataBento client is manually disconnected
2. Feed health state machine transitions to RECONNECTING within 30 seconds
3. M-16 fallback activates within 120 seconds
4. processBar() continues to be called via M-16 during the outage
5. DataBento client is manually reconnected
6. Feed health state machine transitions to CONNECTED within 30 seconds
7. M-16 fallback deactivates
8. DataBento resumes as primary

This test must pass before Gate 3 certification begins.

---

## Test Data Management

Unit and integration tests use recorded DataBento data stored in `server/market-data/__fixtures__/`. The fixtures include:

- `mnq_mbp1_sample.bin`: 1 hour of MNQ MBP-1 data in DBN binary format
- `mnq_bars_expected.json`: Expected confirmed bars for the sample data
- `mnq_symbol_mapping.bin`: SymbolMappingMsg records for MNQ
- `mnq_gap_sample.bin`: MBP-1 data with a deliberate sequence gap

Fixtures are generated from real DataBento data and committed to the repository. They are never generated from synthetic data.

---

*This testing plan is the authoritative certification framework for the DataBento integration. No gate may be bypassed.*
