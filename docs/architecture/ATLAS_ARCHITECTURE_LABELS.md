# Atlas Nexus — Architecture Labels
## Canonical System Architecture Reference
**Approved by Phil:** Sprint 123A.7 Gate G7 correction  
**Effective from:** Sprint 123A.7  
**Status:** AUTHORITATIVE — all code, tests, reports and research must reference these labels

---

## Canonical Architecture Labels

```
DATABENTO_MNQ_DATA_AUTHORITY=CANONICAL
ATLAS_LIVE_CHART_SOURCE=DATABENTO
DARWIN_LIVE_DATA_SOURCE=DATABENTO
DARWIN_HISTORICAL_DATA_SOURCE=DATABENTO
STRATEGY_MONITORING_DATA_SOURCE=DATABENTO
TYPESCRIPT_STRATEGY_ENGINE=TARGET_CANONICAL_IMPLEMENTATION
PINE_SCRIPT_STATUS=LEGACY_REFERENCE_AND_CURRENT_TEMPORARY_AUTOMATION_TRIGGER
PINE_SCRIPT_MARKET_DATA_ROLE=NONE
PINE_SCRIPT_CANONICAL_STRATEGY_ROLE=NONE
PINE_SCRIPT_CURRENT_AUTOMATION_ROLE=ACTIVE_TEMPORARY_TRIGGER
TRADINGVIEW_MARKET_DATA_ROLE=NONE
TRADINGVIEW_CURRENT_AUTOMATION_ROLE=ACTIVE_TEMPORARY
```

---

## Current Operational Flow

```
TradingView / Pine Script atlas_portfolio_v1.pine v1.0.2
  → current live automation signal (ACTIVE_TEMPORARY_TRIGGER)
  → TradersPost webhook
  → Tradovate
```

Pine Script **currently is** the active temporary strategy and automation signal trigger.
Pine Script **is not** the canonical MNQ market-data source.
Pine Script **is not** the canonical future strategy implementation.
Pine Script **is not** the live broker execution engine.

---

## Databento Data Flow (Current State)

```
Databento API ($199/month)
  → atlas-feed-adapter.service (systemd, cloud computer)
  → atlas_bars_1m / atlas_bars_5m (MySQL, atlas_staging_g4)
  → Atlas Nexus server (TypeScript, systemd, cloud computer)
  → darwin_observations (DARWIN learning, shadow mode)
  → Live chart (Gate G5, approved, Databento-only visuals)
```

---

## Intended Final Architecture (Not Yet Active)

```
Databento API
  → atlas-feed-adapter.service
  → Atlas TypeScript strategy engine (TARGET_CANONICAL_IMPLEMENTATION)
  → Atlas risk and decision checks
  → Atlas-generated TradersPost webhook
  → Tradovate
```

This path has **not yet been activated**. It requires:
1. TypeScript strategy engine implementation
2. Risk and decision check layer
3. TradersPost webhook generation
4. Shadow testing and approval
5. Explicit Phil approval to activate and retire Pine Script

---

## Pine Script Policy

| Field | Value |
|-------|-------|
| File | `tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine` |
| Version | 1.0.2 |
| SHA-256 | `d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb` |
| Status | `LEGACY_REFERENCE_AND_CURRENT_TEMPORARY_AUTOMATION_TRIGGER` |
| Market data role | `NONE` — Databento is the canonical MNQ data source |
| Canonical strategy role | `NONE` — TypeScript engine is the target canonical implementation |
| Current automation role | `ACTIVE_TEMPORARY_TRIGGER` — active TradersPost/Tradovate path until Atlas-native engine approved |
| Research role | Reference only — do not use as primary fidelity target for Python backtests |
| Deletion policy | **Do not delete or disable** until Atlas-native strategy engine is separately built, shadow-tested and approved by Phil |

---

## What Databento Provides

Databento provides **everything** needed for the Atlas system:

| Use | Source |
|-----|--------|
| Live 5-min MNQ candles | Databento live feed → feed adapter |
| Historical MNQ data | Databento GLBX.MDP3, 874,405 × 1m bars (2024-2026) |
| Live chart | Databento bars → Atlas dashboard (Gate G5, approved) |
| DARWIN observations | Databento bars → `darwin_observations` |
| Strategy backtests | Databento canonical datasets (1m/5m/15m) |
| Strategy monitoring | Databento bars → rolling metrics |
| Pattern discovery | Databento canonical datasets |
| Indicator computation | Databento OHLCV → ATR, ADX, RSI, VWAP, EMA |

TradingView is **not used** as a market data source.

---

## Approved Gates

| Gate | Sprint | Description | Status |
|------|--------|-------------|--------|
| G1 | 123A.1 | Foundation | APPROVED |
| G2 | 123A.2 | Market data authority | APPROVED |
| G3 | 123A.3 | Feed adapter | APPROVED |
| G4 | 123A.4 | Staging environment | APPROVED |
| G5 | 123A.5 | Live Databento chart | APPROVED |
| G6A | 123A.6 | DARWIN learning shadow | APPROVED |
| G7 | 123A.7 | Autonomous research operations | PENDING |

---

*This document supersedes any previous architecture description that assigned a market data role to TradingView or treated Pine Script fidelity as a primary research objective.*
