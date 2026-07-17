# Atlas Symbol Registry and Contract Roll Specification

**Document type:** Symbol and Roll Specification  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-009

---

## Overview

This document specifies the Atlas symbol registry and contract roll policy. The symbol registry is a new component that Atlas currently lacks. It maintains the authoritative mapping between Atlas canonical symbols, DataBento continuous symbols, DataBento raw contract symbols, and DataBento instrument IDs. It also manages the contract roll lifecycle, ensuring that bar data, indicator calculations, and strategy evaluations are never contaminated by roll gaps or split bars.

---

## Current Gap

Atlas currently has no symbol registry. The contract month, expiry, and roll dates are managed entirely by TradingView's `MNQ1!` continuous symbol. Atlas is unaware of which physical contract is active, when rolls occur, or what the current expiry date is. This creates several risks:

- Roll gaps (price jumps between expiring and new contracts) are invisible to Atlas and can corrupt ATR, VWAP, and other indicators
- Atlas cannot independently verify that TradingView's continuous symbol is tracking the correct front-month contract
- DARWIN research cannot distinguish between genuine price moves and roll artefacts in historical data
- Replay cannot accurately reconstruct which contract was active at any historical point in time

---

## Symbol Registry Design

The symbol registry is a server-side module (`server/market-data/symbol-registry.ts`) that maintains the following state:

```typescript
interface SymbolRegistryEntry {
  // Atlas canonical symbol (stable across rolls)
  atlasSymbol: string;         // "MNQ1!"
  
  // DataBento continuous symbol
  continuousSymbol: string;    // "MNQ.v.0"
  
  // Current active contract
  rawSymbol: string;           // "MNQM5" (current front month)
  instrumentId: number;        // DataBento numeric ID
  
  // Contract metadata
  expiryDate: string;          // ISO 8601 date: "2025-06-20"
  expiryMonth: string;         // "M5" (month code + year digit)
  rollDate: string;            // ISO 8601 date: "2025-06-13" (8 days before expiry)
  
  // Previous contract (retained for roll gap analysis)
  previousRawSymbol?: string;  // "MNQH5"
  previousInstrumentId?: number;
  rollTs?: number;             // UTC milliseconds when roll was detected
  
  // Instrument specification
  tickSize: number;            // 0.25 for MNQ
  tickValue: number;           // $0.50 for MNQ (0.25 × $2/point)
  pointValue: number;          // $2.00 for MNQ
  contractMultiplier: number;  // 2 for MNQ
  currency: string;            // "USD"
  exchange: string;            // "CME"
  
  // State
  status: 'active' | 'rolling' | 'expired';
  lastUpdated: number;         // UTC milliseconds
}
```

### Instrument Specifications

The registry is pre-seeded with the following instruments:

| Atlas Symbol | DataBento Continuous | Tick Size | Point Value | Exchange |
|---|---|---|---|---|
| `MNQ1!` | `MNQ.v.0` | 0.25 | $2.00 | CME |
| `NQ1!` | `NQ.v.0` | 0.25 | $20.00 | CME |
| `MES1!` | `MES.v.0` | 0.25 | $1.25 | CME |
| `ES1!` | `ES.v.0` | 0.25 | $12.50 | CME |

Only `MNQ1!` is active in the initial deployment. The others are registered for future use.

---

## CME Micro E-Mini Nasdaq-100 Contract Specifications

The MNQ contract has the following specifications:

| Property | Value |
|---|---|
| Full name | Micro E-Mini Nasdaq-100 Futures |
| Exchange | CME Globex |
| Underlying | Nasdaq-100 Index |
| Contract size | $2 × Nasdaq-100 Index |
| Tick size | 0.25 index points |
| Tick value | $0.50 |
| Point value | $2.00 |
| Trading hours | Sunday 18:00 ET – Friday 17:00 ET (with daily break 17:00–18:00 ET) |
| Expiry months | March (H), June (M), September (U), December (Z) — quarterly cycle |
| Expiry date | Third Friday of the contract month |
| Last trading day | Third Friday of the contract month |
| Settlement | Cash settled to Special Opening Quotation (SOQ) |
| Margin | CME-set performance bond requirements |

### MNQ Expiry Calendar (2025–2026)

| Contract | Month Code | Expiry Date | Roll Date (8 days prior) |
|---|---|---|---|
| MNQH5 | H5 | 2025-03-21 | 2025-03-13 |
| MNQM5 | M5 | 2025-06-20 | 2025-06-12 |
| MNQU5 | U5 | 2025-09-19 | 2025-09-11 |
| MNQZ5 | Z5 | 2025-12-19 | 2025-12-11 |
| MNQH6 | H6 | 2026-03-20 | 2026-03-12 |
| MNQM6 | M6 | 2026-06-19 | 2026-06-11 |
| MNQU6 | U6 | 2026-09-18 | 2026-09-10 |
| MNQZ6 | Z6 | 2026-12-18 | 2026-12-10 |

---

## Contract Roll Policy

Atlas uses a **volume-based roll policy** consistent with DataBento's `MNQ.v.0` continuous symbol. The front-month contract is defined as the contract with the highest open interest and volume. The roll occurs when the new contract's volume exceeds the expiring contract's volume, typically 8–10 days before expiry.

### Roll Detection

The symbol registry detects rolls by monitoring `SymbolMappingMsg` records from DataBento. When DataBento sends a new `instrument_id` for `MNQ.v.0`, the registry:

1. Records the roll timestamp
2. Updates the active contract mapping
3. Stores the previous contract as `previousRawSymbol`
4. Publishes an `AtlasSymbolMappingEvent` with `isRoll: true`
5. Inserts a roll record into the `atlas_contract_rolls` database table
6. Sends an owner notification: "MNQ contract roll detected: MNQH5 → MNQM5"

### Roll Gap Handling

A contract roll introduces a price gap between the expiring and new contracts. This gap is not a genuine price move and must not contaminate indicator calculations.

The Atlas bar builder handles rolls as follows:

1. When an `AtlasSymbolMappingEvent` with `isRoll: true` is received mid-bar, the current developing bar is immediately closed and stored as a confirmed bar with `rollClose: true`
2. A new bar is started for the new contract
3. The gap between the last price of the old contract and the first price of the new contract is recorded in `atlas_contract_rolls`
4. The feature engine applies a roll-gap adjustment to VWAP and EMA calculations to prevent the gap from contaminating the indicator series
5. The `atlas_memory` record for the first bar of the new contract includes a `contractRoll: true` flag

### Roll Gap Adjustment

The roll gap adjustment ensures that ATR, VWAP, and EMA calculations are not distorted by the contract roll. The adjustment is:

- **ATR:** The roll gap is excluded from the ATR calculation. The ATR for the first bar of the new contract is initialised from the last 14 bars of the old contract, adjusted for the gap.
- **VWAP:** VWAP is reset to the new contract's first bar open price on roll day.
- **EMAs:** EMAs are carried forward from the old contract without adjustment, as the EMA is calculated on price differences and the gap is a one-time event.
- **ADX:** ADX is reset to its initial value on roll day, as the directional movement calculation is distorted by the gap.

---

## Symbol Registry Database Schema

The symbol registry state is persisted in two new tables:

### `atlas_symbol_registry`

```sql
CREATE TABLE atlas_symbol_registry (
  id INT AUTO_INCREMENT PRIMARY KEY,
  atlas_symbol VARCHAR(16) NOT NULL UNIQUE,
  continuous_symbol VARCHAR(32) NOT NULL,
  raw_symbol VARCHAR(16) NOT NULL,
  instrument_id INT,
  expiry_date DATE,
  expiry_month VARCHAR(4),
  roll_date DATE,
  tick_size DECIMAL(10, 4) NOT NULL,
  tick_value DECIMAL(10, 4) NOT NULL,
  point_value DECIMAL(10, 4) NOT NULL,
  contract_multiplier INT NOT NULL,
  currency VARCHAR(4) NOT NULL DEFAULT 'USD',
  exchange VARCHAR(8) NOT NULL DEFAULT 'CME',
  status ENUM('active', 'rolling', 'expired') NOT NULL DEFAULT 'active',
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `atlas_contract_rolls`

```sql
CREATE TABLE atlas_contract_rolls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  atlas_symbol VARCHAR(16) NOT NULL,
  old_raw_symbol VARCHAR(16) NOT NULL,
  new_raw_symbol VARCHAR(16) NOT NULL,
  old_instrument_id INT,
  new_instrument_id INT,
  roll_ts BIGINT NOT NULL,           -- UTC milliseconds
  roll_gap DECIMAL(10, 4),           -- Price gap (new_open - old_close)
  roll_gap_pct DECIMAL(8, 4),        -- Gap as % of old_close
  detected_by VARCHAR(32) NOT NULL,  -- 'databento_symbol_mapping' or 'manual'
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Symbol Format Reference

| Format | Example | Usage |
|---|---|---|
| Atlas canonical | `MNQ1!` | All Atlas internal references, `atlas_memory.symbol`, strategy configs |
| DataBento continuous | `MNQ.v.0` | DataBento subscription, `stype_in="continuous"` |
| DataBento raw contract | `MNQM5` | DataBento historical queries, roll records |
| DataBento instrument ID | `12345` (numeric) | Live feed record identification |
| TradingView | `MNQ1!` | Pine Script M-16, TradingView chart |
| TradersPost | Strategy-specific | Configured in `portfolio_strategy_controls` |
| Broker (Tradovate) | `MNQM5` | Raw contract, managed by TradersPost |

---

## Symbol Registry Initialisation

On Atlas server startup, the symbol registry:

1. Loads the pre-seeded instrument specifications from `atlas_symbol_registry`
2. Connects to DataBento and subscribes to `MNQ.v.0` with `stype_in="continuous"`
3. Waits for the `SymbolMappingMsg` to establish the current `instrument_id`
4. Updates `atlas_symbol_registry` with the current `instrument_id` and `rawSymbol`
5. Publishes an `AtlasSymbolMappingEvent` with `isRoll: false` to notify all consumers

If the DataBento connection is unavailable at startup, the registry uses the last known `instrument_id` from the database and marks its status as `UNKNOWN` until DataBento connects.

---

*This specification governs all symbol handling in the Atlas market data system. No component may use a symbol format other than the Atlas canonical symbol (`MNQ1!`) for internal references.*
