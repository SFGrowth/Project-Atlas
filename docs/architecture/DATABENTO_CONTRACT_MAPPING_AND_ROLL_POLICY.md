# Databento Contract Mapping and Roll Policy (Revision 2)
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18 (Revision 2: Correction 5 applied — MNQ1! removed as stated fact; dynamic resolution required)  
**Parent document:** `SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md`

---

## Overview

This document defines how Atlas resolves the active MNQ front-month contract, detects contract rolls, and manages the transition between contracts. Databento symbol mapping is the primary contract-resolution source. Local volume crossover and expiry calculations are validation and anomaly detection only.

**Correction 5 applied:** `MNQ1!` is not stated as a proven Databento continuous symbol. Databento's continuous-symbol naming conventions must be proven by an opt-in integration test (`TEST-INT-001`) before Sprint 123A.2 begins. All references to `MNQ1!` in this document are marked as **unverified** until that test passes.

---

## MNQ Contract Structure

MNQ (Micro E-mini NASDAQ-100) futures trade on CME Globex under the Databento dataset `GLBX.MDP3`. The contract series uses quarterly expiry codes: H (March), M (June), U (September), Z (December).

| Symbol Pattern | Example | Expiry Month |
|---|---|---|
| `MNQ{month}{year}` | `MNQM5` | June 2025 |
| `MNQ{month}{year}` | `MNQU5` | September 2025 |

The raw symbol format is known and stable. The **continuous symbol** — the symbol used to subscribe to the front month without specifying the expiry — is **not assumed**. It must be resolved dynamically and confirmed by integration test.

---

## Dynamic Symbology Resolution (Correction 5)

### Why MNQ1! Is Not Assumed

Databento's continuous-symbol naming conventions are not publicly guaranteed to be identical to CME or other vendor conventions. The symbol `MNQ1!` is a TradingView convention. Databento may use a different format (e.g., `MNQ.c.0`, `CONTINUOUS_MNQ_ALL`, or a dataset-specific naming scheme). Assuming `MNQ1!` without verification risks a failed subscription.

### Required Integration Test

Before Sprint 123A.2 begins, `TEST-INT-001 — Databento Symbol Resolution` must pass. This test:

1. Connects to Databento with `DATABENTO_INTEGRATION_TESTS=true` and `DATABENTO_API_KEY` set
2. Queries the Databento metadata API for available symbols in `GLBX.MDP3` matching the MNQ instrument family
3. Identifies the continuous-symbol format used by Databento for the MNQ front month
4. Subscribes to that symbol with the `trades` schema and confirms that records are received
5. Records the confirmed continuous symbol name in the test evidence log at `docs/evidence/TEST-INT-001-result.md`

Until `TEST-INT-001` passes, no code may hardcode any continuous symbol string.

### Dynamic Resolution at Runtime

The Contract Roll Manager resolves the active contract dynamically:

1. On startup, query the Databento metadata API for the current front-month instrument in `GLBX.MDP3` for the MNQ family
2. Subscribe to the resolved symbol with the `trades` and `ohlcv-1m` schemas
3. On receipt of `SymbolMappingMsg`, update the symbol registry with the current raw symbol and instrument_id
4. On receipt of `InstrumentDefMsg`, update the contract metadata

The symbol registry always reflects the current dynamically resolved state. No hardcoded symbol strings exist in production code.

---

## Primary Contract Resolution Source

### Databento Symbol Mapping Records

`SymbolMappingMsg` records contain the current raw symbol and instrument_id for the subscribed continuous symbol. This is the authoritative source for which contract is the current front month.

### Databento Definition Records

`InstrumentDefMsg` records contain the contract expiry date, trading hours, tick size, and other contract metadata. These records are received on subscription and on contract roll.

---

## Secondary Validation Sources

| Source | Purpose | Override authority? |
|---|---|---|
| Volume crossover | Detect when new contract volume exceeds old contract volume | NO — validation only |
| CME expiry calendar | Verify expected expiry date | NO — validation only |
| Local roll date calculation | Cross-check against Databento mapping | NO — anomaly detection only |

If local validation disagrees with Databento mapping, an alert is raised for manual review. The Databento mapping remains authoritative until Phil explicitly overrides it.

---

## Roll Detection

A contract roll is detected when any of the following occur:

1. A `SymbolMappingMsg` record is received with a new `raw_symbol` for the subscribed continuous symbol
2. An `InstrumentDefMsg` record is received for a new instrument_id that maps to the subscribed continuous symbol
3. The instrument_id in a `trades` record changes from the previously known front-month instrument_id

When a roll is detected:

1. The Contract Roll Manager creates a new `atlas_contract_rolls` record
2. The `mappingVersion` counter is incremented
3. An `AtlasContractRoll` event is published to `atlasEventBus`
4. The SSE `atlas_contract_roll` event is broadcast to all connected clients via the SSE transport layer
5. The symbol registry is updated with the new raw symbol and instrument_id
6. All subsequent `CanonicalEventId` values use the new `mappingVersion`

---

## Roll Transition Policy

### Bar Continuity at Roll

The 5-minute bar that spans a contract roll must be handled carefully:

- If the roll occurs mid-bar, the bar is split at the roll boundary
- The pre-roll portion is confirmed using the old contract's trades
- The post-roll portion uses the new contract's trades
- Both portions are marked with `contractRollBoundary = true`
- The `AtlasLiveChart.tsx` displays a roll marker at the roll timestamp

### Historical Continuity

For historical data requests spanning a contract roll, the Databento Historical API is used with the dynamically resolved continuous symbol. Databento handles the back-adjustment. Atlas does not perform independent back-adjustment.

---

## `atlas_contract_rolls` Schema

```sql
CREATE TABLE atlas_contract_rolls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ',
  continuous_symbol VARCHAR(32) NOT NULL COMMENT 'Dynamically resolved — confirmed by TEST-INT-001',
  previous_raw_symbol VARCHAR(16),
  new_raw_symbol VARCHAR(16) NOT NULL,
  previous_instrument_id INT,
  new_instrument_id INT NOT NULL,
  roll_ts BIGINT NOT NULL,
  mapping_version INT NOT NULL,
  detection_source ENUM('databento_symbol_mapping', 'databento_definition', 'instrument_id_change') NOT NULL,
  validation_status ENUM('confirmed', 'anomaly_detected', 'manual_override') NOT NULL DEFAULT 'confirmed',
  validation_notes TEXT,
  atlas_ts BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_parent_symbol (parent_symbol),
  INDEX idx_roll_ts (roll_ts),
  INDEX idx_mapping_version (mapping_version)
);
```

---

## Symbol Registry State

The symbol registry maintains the current mapping between the dynamically resolved continuous symbol and raw symbols. After a roll:

| Field | Before Roll | After Roll |
|---|---|---|
| `continuousSymbol` | Resolved by `TEST-INT-001` | Unchanged |
| `rawSymbol` | `MNQM5` | `MNQU5` |
| `instrumentId` | Previous ID | New ID |
| `mappingVersion` | N | N+1 |
| `expiryTs` | June expiry | September expiry |

---

## Anomaly Handling

| Anomaly | Detection | Action |
|---|---|---|
| Databento mapping disagrees with volume crossover | Volume of new contract > old by > 20% before Databento mapping change | Alert; log; do not override Databento |
| Multiple rolls in one trading day | Second `SymbolMappingMsg` in same day | Alert; escalate; do not process automatically |
| Roll detected outside expected expiry window | Roll detected > 5 days before expected expiry | Alert; manual review required |
| Instrument_id change without `SymbolMappingMsg` | `trades` record with unknown instrument_id | Treat as roll; alert; request definition record |
| `TEST-INT-001` not passed before 123A.2 | Sprint 123A.2 gate check | Block sprint; do not proceed |
