# Atlas Nexus — Architecture Labels
## Canonical System Architecture Reference
**Approved by Phil:** Sprint 123A.7 Gate G7 (fifth withhold correction)
**Effective from:** Sprint 123A.5 (Gate G5 approved Databento chart authority)
**Status:** AUTHORITATIVE — all code, tests, reports and research must reference these labels

---

## Canonical Architecture Labels

```
DATABENTO_MNQ_DATA_AUTHORITY=CANONICAL
ATLAS_LIVE_CHART_SOURCE=DATABENTO
DARWIN_LIVE_DATA_SOURCE=DATABENTO
DARWIN_HISTORICAL_DATA_SOURCE=DATABENTO
STRATEGY_MONITORING_DATA_SOURCE=DATABENTO
INDICATOR_DATA_SOURCE=DATABENTO
SIGNAL_VISUAL_DATA_SOURCE=DATABENTO
TYPESCRIPT_STRATEGY_ENGINE=CANONICAL
TRADINGVIEW_MARKET_DATA_ROLE=NONE
TRADINGVIEW_CHART_ROLE=NONE
TRADINGVIEW_AUTOMATION_ROLE=NONE
PINE_SCRIPT_STATUS=NON_CANONICAL_LEGACY_REFERENCE
```

---

## Permanent Atlas Architecture

Gate G5 approved Databento chart authority. Databento is the permanent and sole canonical
data source for all Atlas chart candles, indicators, overlays, observations, and visual signals.

```
Databento GLBX.MDP3
  → atlas-feed-adapter.service (systemd, cloud computer)
  → atlas_bars_1m / atlas_bars_5m (MySQL, atlas_staging_g4)
  → Atlas Nexus TypeScript services (systemd, cloud computer)
  → Atlas dashboard chart and visuals
  → DARWIN observations (darwin_observations)
  → Strategy monitoring (darwin_strategy_monitoring_snapshots)
  → Historical and live research
  → Future separately gated decision and execution services
```

All chart candles, indicators, overlays, observations and visual signals originate from
Databento-derived canonical bars. No TradingView data enters this path. No Pine-generated
candle enters this path.

---

## TradingView and Pine Script Status

| Field | Value |
|-------|-------|
| `TRADINGVIEW_MARKET_DATA_ROLE` | `NONE` |
| `TRADINGVIEW_CHART_ROLE` | `NONE` |
| `TRADINGVIEW_AUTOMATION_ROLE` | `NONE` |
| `PINE_SCRIPT_STATUS` | `NON_CANONICAL_LEGACY_REFERENCE` |

Pine Script (`tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine`) may remain in
the repository as historical reference only. It is:

- **Not** a canonical strategy source
- **Not** an active market-data source
- **Not** an active chart source
- **Not** a required runtime dependency
- **Not** a Gate G7 fidelity target

The TypeScript strategy engine is the canonical strategy implementation. Backtests must
match TypeScript specifications, not Pine Script.

---

## What Databento Provides

Databento provides **everything** needed for the Atlas system:

| Use | Source |
|-----|--------|
| Live 1-min and 5-min MNQ candles | Databento live feed → atlas-feed-adapter.service |
| Historical MNQ data | Databento GLBX.MDP3, 2,128+ × 1m bars (live and growing) |
| Live chart | Databento bars → Atlas dashboard (Gate G5, approved) |
| DARWIN observations | Databento bars → `darwin_observations` |
| Strategy backtests | Databento canonical datasets (1m/5m) |
| Strategy monitoring | Databento bars → rolling metrics |
| Pattern discovery | Databento canonical datasets |
| Indicator computation | Databento OHLCV → ATR, ADX, VWAP, EMA |
| Signal visuals | Databento bars → Atlas dashboard overlays |

TradingView is **not used** as a market data source.
TradingView is **not used** as a chart source.
TradingView is **not used** as an automation trigger.

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

*This document supersedes any previous architecture description that assigned a market data,
chart, or automation role to TradingView or Pine Script, or that described Databento chart
authority as pending.*
