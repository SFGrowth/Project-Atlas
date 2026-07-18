# Atlas Behaviour System Migration Plan
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

Two parallel behaviour tracking systems currently exist in Atlas. This document defines the migration path from the legacy 7-behaviour system to the canonical 12-classifier Behaviour Engine. Neither system may influence live execution during the migration. The legacy system must not be removed until the canonical system has been certified as a complete replacement.

---

## Current State (Verified 2026-07-18)

### Legacy System

**Location:** `server/liveLearnEngine.ts:240–297`  
**Table:** `behaviour_library`  
**Status:** PRODUCTION — runs on every TradingView bar  
**Source field:** None (no source tag — legacy assumption)

The legacy system detects 7 ad-hoc indicator-derived signals using simple threshold rules applied to bar features. These are not classifiers in the architectural sense — they are boolean indicator conditions that produce a signal name.

| Legacy Behaviour ID | Detection Rule | Notes |
|---|---|---|
| `VWAP_RECLAIM` | `close > vwap` | Simple price comparison |
| `VWAP_REJECTION` | `close <= vwap` | Complement of VWAP_RECLAIM |
| `EMA9_21_CROSS_UP` | `ema9 > ema21` | State, not a cross event |
| `EMA9_21_CROSS_DOWN` | `ema9 <= ema21` | Complement of EMA9_21_CROSS_UP |
| `ATR_EXPANSION` | `atrExpansion > 1.2` | Single threshold |
| `RSI_OVERSOLD_BOUNCE` | `rsi < 35` | Single threshold |
| `RSI_OVERBOUGHT_FADE` | `rsi > 65` | Single threshold |

**Critical observation:** `VWAP_RECLAIM` and `VWAP_REJECTION` are always both evaluated and one always fires. `EMA9_21_CROSS_UP` and `EMA9_21_CROSS_DOWN` are always both evaluated and one always fires. These are state labels, not behaviour detections. The legacy system will always produce at least 2 observations per bar regardless of market conditions.

### Canonical System

**Location:** `server/behaviour-engine/` (12 classifier files)  
**Table:** `atlas_behaviour_instances` (raw SQL, not in drizzle schema)  
**Status:** SHADOW — runs after TradingView processBar, no production consumers  
**Source field:** Implicit (all instances are canonical)

The canonical system uses 12 evidence-based classifiers that evaluate multiple conditions, require confidence thresholds, and produce lifecycle-managed instances with probability scores.

| Canonical BehaviourId | Classifier File |
|---|---|
| `TREND_CONTINUATION` | `trend-continuation.ts` |
| `SECOND_ENTRY_PULLBACK` | `second-entry-pullback.ts` |
| `LIQUIDITY_SWEEP` | `liquidity-sweep.ts` |
| `FAILED_BREAKOUT` | `failed-breakout.ts` |
| `MEAN_REVERSION` | `mean-reversion.ts` |
| `OPENING_RANGE_BREAKOUT` | `opening-range-breakout.ts` |
| `VWAP_RECLAIM` | `vwap-reclaim.ts` |
| `COMPRESSION` | `compression.ts` |
| `BREAKOUT_EXPANSION` | `breakout-expansion.ts` |
| `OVERNIGHT_INVENTORY` | `overnight-inventory.ts` |
| `SESSION_ROTATION` | `session-rotation.ts` |
| `VOLATILITY_EXPANSION` | `volatility-expansion.ts` |

---

## Legacy-to-Canonical Mapping

| Legacy Behaviour ID | Canonical Equivalent | Mapping Type | Notes |
|---|---|---|---|
| `VWAP_RECLAIM` | `VWAP_RECLAIM` | **Same name, different logic** | Legacy is a state label; canonical is a classifier with evidence scoring |
| `VWAP_REJECTION` | None | **Unmappable** | No canonical classifier for VWAP rejection; closest is `MEAN_REVERSION` or `FAILED_BREAKOUT` |
| `EMA9_21_CROSS_UP` | None | **Unmappable** | EMA state; no canonical equivalent |
| `EMA9_21_CROSS_DOWN` | None | **Unmappable** | EMA state; no canonical equivalent |
| `ATR_EXPANSION` | `VOLATILITY_EXPANSION` | **Partial** | Legacy is a single threshold; canonical uses multi-condition evidence |
| `RSI_OVERSOLD_BOUNCE` | `MEAN_REVERSION` | **Partial** | RSI is one input to mean-reversion; canonical uses additional evidence |
| `RSI_OVERBOUGHT_FADE` | `MEAN_REVERSION` | **Partial** | Same as above, opposite direction |

**Conclusion:** 4 of 7 legacy behaviours are unmappable or only partially mappable to canonical behaviours. The legacy system cannot be retired by simple renaming. A shadow comparison period is required to validate that the canonical system covers the market conditions the legacy system was tracking.

---

## Migration Adapter Design

The `legacy-adapter.ts` module (to be created in Sprint 123A.1) will:

1. Run after each legacy behaviour update in `liveLearnEngine`
2. Produce a shadow comparison record for each bar
3. Write comparison records to `atlas_behaviour_migration_log` (new table)
4. Never modify either system's output
5. Never influence live execution

### Comparison Record Schema

| Field | Type | Description |
|---|---|---|
| `barTime` | number | Bar open timestamp (ms UTC) |
| `legacyBehaviourId` | string | Legacy behaviour ID |
| `canonicalBehaviourId` | string? | Mapped canonical ID (null if unmappable) |
| `legacyFired` | boolean | Whether legacy system detected this behaviour |
| `canonicalFired` | boolean | Whether canonical system detected mapped behaviour |
| `agreementStatus` | string | `AGREE`, `DISAGREE`, `UNMAPPABLE`, `NO_CANONICAL_EQUIVALENT` |
| `disagreementReason` | string? | Why they disagree |
| `legacyConfidence` | number? | Legacy confidence (always 1.0 — no scoring) |
| `canonicalConfidence` | number? | Canonical confidence score |
| `confidenceDelta` | number? | Canonical minus legacy |
| `regime` | string | Market regime at bar time |
| `session` | string | Trading session at bar time |
| `classifierVersion` | string | Canonical classifier version |
| `deprecationFlag` | boolean | True when legacy is scheduled for removal |
| `createdAt` | timestamp | Record creation time |

---

## Migration Certification Criteria

The legacy system may be deprecated only when all of the following are true:

1. The canonical system has been running in shadow mode for at least 20 trading days
2. Agreement rate between legacy and canonical (for mappable behaviours) is ≥ 95%
3. The canonical system has detected at least 100 instances of each of the 12 behaviours
4. DARWIN has confirmed that canonical behaviour detections are statistically meaningful
5. No production consumer depends on legacy behaviour IDs
6. Phil has explicitly approved the deprecation
7. A rollback plan is documented and tested

---

## Source Field Convention

All behaviour records must carry a `source` field to distinguish systems during the migration period:

| Source Value | System | Table |
|---|---|---|
| `legacy_v1` | Legacy 7-behaviour system | `behaviour_library` |
| `canonical_v1` | Canonical 12-classifier engine (TradingView path) | `atlas_behaviour_instances` |
| `canonical_v1_databento_parity` | Canonical engine (Databento parity namespace) | `atlas_behaviour_instances` |

Records from the Databento parity namespace must not be consumed by ADE, Guardian, strategy selection, or DARWIN learning until `DATABENTO_LEARNING_AUTHORITY` is approved.

---

## Timeline

| Milestone | Sub-Sprint | Condition |
|---|---|---|
| Migration adapter created | 123A.1 | This sprint |
| Shadow comparison begins | 123A.1 | Immediately after deployment |
| Certification criteria evaluated | 123A.5 | After 20 trading days of shadow data |
| Legacy system deprecated | Post-123A.5 | Phil approval only |
| Legacy code removed | Future sprint | After deprecation period |
