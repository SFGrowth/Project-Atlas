# Databento Contract Mapping and Roll Policy
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

This document defines how Atlas resolves the active MNQ front-month contract, detects contract rolls, and manages the transition between contracts. Databento continuous-symbol mapping and symbol-mapping records are the primary contract-resolution source. Local volume crossover and expiry calculations are validation and anomaly detection only — not the authoritative roll rule.

---

## MNQ Contract Structure

MNQ (Micro E-mini NASDAQ-100) futures trade on CME Globex under the dataset `GLBX.MDP3`. The contract series uses quarterly expiry codes: H (March), M (June), U (September), Z (December).

| Symbol Pattern | Example | Expiry Month |
|---|---|---|
| `MNQ{month}{year}` | `MNQM5` | June 2025 |
| `MNQ{month}{year}` | `MNQU5` | September 2025 |

The Databento continuous symbol for the front month is `MNQ1!`. Atlas uses `MNQ1!` as the canonical symbol in all internal representations. Raw symbols (`MNQM5`, `MNQU5`) are used only for Databento subscription management and are mapped to `MNQ1!` by the Contract Roll Manager.

---

## Primary Contract Resolution Source

### Databento Continuous Symbol Mapping

When subscribing to `MNQ1!`, Databento automatically routes to the current front-month contract. The `SymbolMappingMsg` record contains the current raw symbol and instrument_id for the continuous symbol. This is the authoritative source for which contract is the current front month.

### Databento Definition Records

`InstrumentDefMsg` records contain the contract expiry date, trading hours, tick size, and other contract metadata. These records are received on subscription and on contract roll. The Contract Roll Manager uses these records to maintain the `atlas_contract_rolls` table.

---

## Secondary Validation Sources

The following sources are used for anomaly detection and validation only. They do not override Databento symbol mapping.

| Source | Purpose | Override authority? |
|---|---|---|
| Volume crossover | Detect when new contract volume exceeds old contract volume | NO — validation only |
| CME expiry calendar | Verify expected expiry date | NO — validation only |
| Local roll date calculation | Cross-check against Databento mapping | NO — anomaly detection only |

If local validation disagrees with Databento mapping, an alert is raised for manual review. The Databento mapping remains authoritative until Phil explicitly overrides it.

---

## Roll Detection

A contract roll is detected when any of the following occur:

1. A `SymbolMappingMsg` record is received with a new `raw_symbol` for `MNQ1!`
2. An `InstrumentDefMsg` record is received for a new instrument_id that maps to `MNQ1!`
3. The instrument_id in a `trades` record changes from the previously known front-month instrument_id

When a roll is detected:

1. The Contract Roll Manager creates a new `atlas_contract_rolls` record
2. The `mappingVersion` counter is incremented
3. An `AtlasContractRoll` event is published to `atlasEventBus`
4. The SSE `atlas_contract_roll` event is broadcast to all connected clients
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
- The `AtlasLiveChart` displays a roll marker at the roll timestamp

### Historical Continuity

For historical data requests spanning a contract roll, the Databento Historical API is used with the continuous symbol `MNQ1!`. Databento handles the back-adjustment. Atlas does not perform independent back-adjustment.

### Overnight Roll

If a contract roll occurs during the overnight session (before the regular trading session), the roll is processed before the first regular-session bar. No special handling is required beyond the standard roll detection procedure.

---

## `atlas_contract_rolls` Schema

```sql
CREATE TABLE atlas_contract_rolls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ',
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

The symbol registry (`server/market-data/symbol-registry.ts`) maintains the current mapping between canonical symbols and raw symbols. After a roll:

| Field | Before Roll | After Roll |
|---|---|---|
| `canonicalSymbol` | `MNQ1!` | `MNQ1!` (unchanged) |
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
