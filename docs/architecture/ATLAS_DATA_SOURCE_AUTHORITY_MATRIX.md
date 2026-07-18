# Atlas Data Source Authority Matrix
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

This matrix defines the authoritative source, fallback, owner, consumers, persistence, and failure behaviour for every category of data in the Atlas system. No system may claim authority over a category unless it is listed here as the authority for that category in the current `MARKET_DATA_AUTHORITY` mode.

---

## Market Data

| Category | Authority (TRADINGVIEW_ONLY) | Authority (DATABENTO_SHADOW+) | Fallback | Owner | Consumers | Persistence | Failure Behaviour |
|---|---|---|---|---|---|---|---|
| Live MNQ trades | TradingView webhook (bar close only) | Databento `trades` stream | TradingView webhook | Market-data service | Bar builder, tick storage | `atlas_ticks` (future) | Feed health → DEGRADED; SSE `atlas_feed_health` |
| Confirmed 5-min bars | TradingView webhook | Databento canonical router | TradingView webhook | Market-data service | processBar, liveLearnEngine, postBarAutomation | `atlas_memory`, `atlas_bars_5m` | Gap detection; `atlas_feed_health` |
| Confirmed 1-min bars | None | Databento bar builder | None | Market-data service | 5-min aggregator | `atlas_bars_1m` | Mark interval UNRESOLVED |
| Developing candles | None | Databento bar builder | None | Market-data service | AtlasLiveChart SSE | In-memory only | Chart shows stale; feed health badge |
| Instrument definitions | None | Databento definition records | None | Contract Roll Manager | Symbol registry | `atlas_contract_rolls` | Use last known mapping |
| Symbol mappings | None | Databento symbol-mapping records | None | Contract Roll Manager | Bar builder, normaliser | `atlas_contract_rolls` | Use last known mapping |
| Contract metadata | None | Databento definition records | None | Contract Roll Manager | Chart, canonical router | `atlas_contract_rolls` | Use last known mapping |
| Historical market seed | None | Databento Historical API | None | Historical client | Bar builder warm-up | `atlas_bars_1m`, `atlas_bars_5m` | Start from first live bar |
| Market-data gap recovery | None | Databento Historical API | None | Gap detector | Canonical router | `atlas_bars_1m` | Mark gaps; alert |

---

## Canonical Atlas State

| Category | Authority | Fallback | Owner | Consumers | Persistence | Failure Behaviour |
|---|---|---|---|---|---|---|
| Normalised market events | Atlas TypeScript server | None | Market-data service | Event bus subscribers | `atlas_ticks` (future) | Drop; log |
| Developing candles (1-min) | Atlas TypeScript bar builder | None | Market-data service | AtlasLiveChart | In-memory | Chart shows stale |
| Canonical confirmed bars (1-min) | Atlas TypeScript bar builder | None | Market-data service | 5-min aggregator | `atlas_bars_1m` | Mark UNRESOLVED |
| Five-minute aggregation | Atlas TypeScript 5-min aggregator | None | Market-data service | Canonical router | `atlas_bars_5m`, `atlas_canonical_bars` | Do not aggregate across UNRESOLVED |
| Feature calculations | Atlas TypeScript | None | liveLearnEngine | ADE, Behaviour Engine | `atlas_memory` | Skip bar |
| Behaviour classifications | Atlas Behaviour Engine (canonical) | Legacy system | Behaviour Engine | DARWIN, chart | `atlas_behaviour_instances` | Log; skip |
| ADE decisions | Atlas ADE | None | Strategy service | Guardian, dispatch | `paper_trades` | Skip; alert |
| Guardian decisions | Atlas Guardian | None | Decision service | Dispatch | `paper_trades` | Skip; alert |
| Strategy proposals | Atlas ADE | None | Strategy service | AtlasLiveChart | `paper_trades` | Skip |
| Dispatch decisions | Atlas tpDispatch | None | Trade lifecycle service | TradersPost | `paper_trades` | Alert |
| Research | DARWIN | None | DARWIN engine | darwinCroEngine | `darwin_research_memory` | Queue for retry |
| Audit history | Atlas | None | All services | Observatory | All tables | Never drop |
| Chart annotations | Atlas | None | Trade lifecycle service | AtlasLiveChart | `atlas_chart_annotations` | Chart shows without annotation |

---

## Broker and Execution State

| Category | Authority | Fallback | Owner | Consumers | Persistence | Failure Behaviour |
|---|---|---|---|---|---|---|
| Order acknowledgements | TradersPost/Broker | None | Broker | tpDispatch | `paper_trades` | Alert; do not assume fill |
| Fills | TradersPost/Broker | None | Broker | tpDispatch | `paper_trades` | Alert; do not assume fill |
| Rejections | TradersPost/Broker | None | Broker | tpDispatch | `paper_trades` | Alert |
| Open broker positions | TradersPost/Broker | None | Broker | Guardian | External | Alert |
| Closed broker positions | TradersPost/Broker | None | Broker | Daily review | External | Alert |
| Realised execution prices | TradersPost/Broker | None | Broker | P&L calculation | `paper_trades` | Alert |
| Account balances | TradersPost/Broker | None | Broker | Risk controls | External | Alert; halt new trades |
| Prop-firm account state | Apex/Broker | None | Broker | Risk controls | External | Alert; halt new trades |

---

## Frontend

The frontend is never a market-data authority. The chart is only a projection of canonical Atlas state. The frontend must never connect directly to Databento. The Databento API key must never reach the browser.

| Category | Frontend Role | Source |
|---|---|---|
| Chart candles | Projection | Atlas SSE + `nexus.getRecentBars` |
| Feed health | Display | Atlas SSE `atlas_feed_health` |
| Trade markers | Display | Atlas SSE `atlas_trade_opened` etc. |
| Behaviour detections | Display | Atlas SSE `atlas_behaviour_detected` |
| P&L | Display | Atlas tRPC `nexus.getPnl` |
