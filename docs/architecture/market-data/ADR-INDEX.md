# Atlas Architecture Decision Records — Market Data Platform

**Sprint:** 120  
**Date:** 2026-07-17  
**Status:** All ADRs are PROPOSED — Pending Review and Approval

This index lists all 12 Architecture Decision Records for the Atlas Market Data Platform. Each ADR documents a significant architectural decision, the context that drove it, the options considered, and the rationale for the decision made.

---

| ADR | Title | Status |
|---|---|---|
| ADR-001 | DataBento as Primary Live Market Data Provider | PROPOSED |
| ADR-002 | GLBX.MDP3 MBP-1 Schema for Live Feed | PROPOSED |
| ADR-003 | Provider-Independent Internal Event Contracts | PROPOSED |
| ADR-004 | In-Process EventEmitter as Initial Event Transport | PROPOSED |
| ADR-005 | Three-Tier Storage Architecture | PROPOSED |
| ADR-006 | UTC-Aligned 5-Minute Bar Boundaries | PROPOSED |
| ADR-007 | TradingView Lightweight Charts for Live Chart | PROPOSED |
| ADR-008 | Dual-Feed Failover with M-16 as Permanent Fallback | PROPOSED |
| ADR-009 | Volume-Based Continuous Contract Roll Policy | PROPOSED |
| ADR-010 | Additive Shadow-Mode Migration Strategy | PROPOSED |
| ADR-011 | Server-Side-Only DataBento API Key | PROPOSED |
| ADR-012 | Same-Code-Path Replay Architecture | PROPOSED |

---

## ADR-001: DataBento as Primary Live Market Data Provider

**Date:** 2026-07-17  
**Status:** PROPOSED  
**Deciders:** Atlas system owner

### Context

Atlas currently receives all market data from TradingView's Pine Script M-16 webhook. This creates a single point of failure: if TradingView's alert system delays, fails, or the Pine Script has an error, Atlas receives no market data and cannot process bars. The webhook also introduces a minimum 5-minute latency (one bar period) before Atlas can react to market conditions, and provides no intrabar data for tick-level research.

Atlas requires a more reliable, lower-latency, and higher-resolution market data source to support the DARWIN research engine's tick-level analysis and to eliminate the single point of failure in the live trading system.

### Decision

DataBento is selected as the primary live market data provider. DataBento provides direct CME Globex exchange feed data (GLBX.MDP3) with nanosecond timestamps, institutional-grade reliability, and a clean TCP subscription API.

### Options Considered

| Option | Pros | Cons | Decision |
|---|---|---|---|
| DataBento | Direct exchange feed, nanosecond timestamps, reliable, clean API, L1+L2 history | No Node.js SDK, $199/month cost | **Selected** |
| Interactive Brokers TWS API | Free with account, familiar | Requires local TWS installation, not suitable for server deployment, delayed data |
| Polygon.io | Node.js SDK available, WebSocket API | Not direct exchange feed, higher latency, less reliable for futures |
| CQG | Institutional grade | Very high cost, complex integration |
| Rithmic | Futures-specific | Complex C++ API, no Node.js support |
| Continue with TradingView only | Zero additional cost | Single point of failure, no intrabar data, 5-min minimum latency |

### Consequences

DataBento adds $199/month in subscription costs. The absence of an official Node.js SDK requires implementing the Raw TCP API directly, which is estimated at 5–7 days of engineering work. The DataBento integration eliminates the single point of failure and enables tick-level DARWIN research.

---

## ADR-002: GLBX.MDP3 MBP-1 Schema for Live Feed

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

DataBento provides multiple schemas for the GLBX.MDP3 dataset. The schema selection determines the data richness, bandwidth consumption, and processing complexity of the live feed.

### Decision

The MBP-1 (Market by Price, Level 1) schema is selected for the Atlas live feed. MBP-1 provides every trade event and every BBO (best bid/offer) update — the optimal balance of data richness and bandwidth for a single-instrument live trading system.

### Options Considered

| Schema | Data | Bandwidth | Decision |
|---|---|---|---|
| `trades` | Trades only | Lowest | Insufficient — no BBO |
| `mbp-1` | Trades + BBO | Low | **Selected** |
| `mbp-10` | Top 10 levels | Medium | Excessive for single instrument |
| `mbo` | Full order book | High | Excessive complexity |
| `ohlcv-1m` | Pre-built 1-min bars | Very low | Insufficient resolution |

### Consequences

MBP-1 provides all data required for bar building, spread monitoring, trade annotation, and tick research. The bandwidth is approximately 1–5 MB/hour during RTH for MNQ — negligible.

---

## ADR-003: Provider-Independent Internal Event Contracts

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

The Atlas market data system must support multiple data providers (DataBento primary, TradingView fallback, replay engine). If downstream consumers depend on provider-specific data formats, adding or changing providers requires modifying all consumers.

### Decision

All internal communication uses provider-independent Atlas market event contracts (`AtlasTradeEvent`, `AtlasQuoteEvent`, `AtlasBarEvent`, etc.). The normalisation layer converts provider-specific formats to Atlas contracts. No downstream consumer has any knowledge of DataBento or TradingView.

### Consequences

The normalisation layer adds a small amount of code. All downstream consumers are completely decoupled from the data provider. Adding a new provider requires only a new normaliser, not changes to any consumer.

---

## ADR-004: In-Process EventEmitter as Initial Event Transport

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

The Atlas market data system requires an event bus to decouple the DataBento gateway from downstream consumers. Options range from in-process EventEmitter to external message brokers (Redis, Kafka, RabbitMQ).

### Decision

Node.js's built-in `EventEmitter` is used as the initial event transport. The bus interface is designed to be drop-in replaceable with Redis Pub/Sub without changing any consumer code.

### Options Considered

| Option | Latency | Complexity | Cost | Decision |
|---|---|---|---|---|
| In-process EventEmitter | Nanoseconds | Minimal | Free | **Selected** |
| Redis Pub/Sub | < 1ms | Low | Redis instance cost | Upgrade path |
| Kafka | < 10ms | High | Significant | Overkill |
| RabbitMQ | < 5ms | Medium | Medium | Overkill |

### Consequences

The EventEmitter is the correct choice for a single-process, single-instrument system. The Redis upgrade path is documented and ready to execute if horizontal scaling is required.

---

## ADR-005: Three-Tier Storage Architecture

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

Atlas market data has different retention requirements at different resolutions: tick data is only needed for 7 days for live research, but bar data is needed indefinitely for strategy development. A single storage tier cannot efficiently serve all use cases.

### Decision

Three storage tiers are used: hot (MySQL, 0–7 days for ticks), warm (MySQL, indefinite for bars), and cold (S3 Parquet, 90+ days for archived data). The tiers are managed by automated export and purge jobs.

### Consequences

The three-tier architecture provides efficient storage at each resolution. The cold tier adds minimal cost (~$17/year). The warm tier (MySQL) retains all bars indefinitely, which is the most important data for strategy development.

---

## ADR-006: UTC-Aligned 5-Minute Bar Boundaries

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

5-minute bars can be aligned to various reference points: UTC clock, exchange session start (18:00 ET), RTH session start (09:30 ET), or the first trade of the day. The alignment must be consistent with TradingView's bar alignment to ensure parity.

### Decision

Atlas 5-minute bars are aligned to the UTC clock (00:00:00 UTC, 00:05:00 UTC, etc.). This is consistent with TradingView's default 5-minute bar alignment for CME futures.

### Consequences

UTC alignment is the simplest and most consistent alignment. It ensures parity with TradingView and simplifies bar boundary calculations. The bar builder uses `Math.floor(tsEvent_ms / 300_000) * 300_000` to determine the bar window.

---

## ADR-007: TradingView Lightweight Charts for Live Chart

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

The Atlas dashboard requires a live candlestick chart that updates in real time as trades arrive. Multiple charting libraries are available for React applications.

### Decision

TradingView Lightweight Charts (Apache 2.0 license) is selected. It is purpose-built for financial time-series data, supports real-time updates, is open source, and is maintained by TradingView.

### Options Considered

| Library | License | Real-time | Financial | Decision |
|---|---|---|---|---|
| TradingView Lightweight Charts | Apache 2.0 | Yes | Yes | **Selected** |
| Recharts | MIT | Limited | No | Not suitable |
| Chart.js | MIT | Limited | No | Not suitable |
| D3.js | BSD | Manual | Manual | Too low-level |
| Highcharts Stock | Commercial | Yes | Yes | Licensing cost |

### Consequences

Lightweight Charts provides all required functionality at zero licensing cost. The library requires attribution to TradingView per the NOTICE file.

---

## ADR-008: Dual-Feed Failover with M-16 as Permanent Fallback

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

DataBento is a third-party service that can experience outages. If DataBento is the sole market data source, an outage would prevent Atlas from processing bars and dispatching trades. The existing TradingView M-16 webhook provides a natural fallback.

### Decision

TradingView M-16 is retained permanently as a fallback feed. When DataBento is unavailable, M-16 automatically becomes the primary trigger for `processBar()`. M-16 is never decommissioned.

### Consequences

The dual-feed design eliminates the single point of failure. The cost of retaining M-16 is zero. The complexity of the failover logic is modest (feed health state machine with 6 states).

---

## ADR-009: Volume-Based Continuous Contract Roll Policy

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

MNQ futures expire quarterly. The active contract must be tracked and rolled to the new front-month contract. The roll policy determines when Atlas transitions from one contract to the next.

### Decision

Atlas uses a volume-based roll policy, consistent with DataBento's `MNQ.v.0` continuous symbol. The roll occurs when the new contract's volume exceeds the expiring contract's volume (typically 8–10 days before expiry). DataBento's `SymbolMappingMsg` is the authoritative roll signal.

### Options Considered

| Policy | Description | Decision |
|---|---|---|
| Volume-based | Roll when new contract volume > old | **Selected** — consistent with DataBento |
| Calendar-based | Roll on fixed date (e.g., 8 days before expiry) | Less accurate, may diverge from DataBento |
| Open interest-based | Roll when new contract OI > old | Similar to volume, slightly different timing |

### Consequences

Volume-based roll ensures that Atlas and DataBento track the same front-month contract at all times. Roll gaps are handled by closing the current bar and resetting VWAP and ADX.

---

## ADR-010: Additive Shadow-Mode Migration Strategy

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

Migrating from TradingView M-16 to DataBento as the primary feed carries risk. A direct cutover would expose the live trading system to untested DataBento infrastructure. A safer approach is needed.

### Decision

The migration proceeds through five phases: infrastructure (no live connection), shadow mode (DataBento receives data but does not trigger processBar()), dual-primary (both feeds trigger processBar() with deduplication), DataBento primary (M-16 is fallback only), and replay engine. Each phase has explicit certification gates.

### Consequences

The additive migration strategy ensures that the live trading system is never exposed to untested DataBento infrastructure. The migration takes 8–12 weeks but eliminates migration risk.

---

## ADR-011: Server-Side-Only DataBento API Key

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

The DataBento API key grants access to live market data and has a monthly cost. If exposed to the browser, it could be stolen and used to consume data at the account holder's expense.

### Decision

The DataBento API key is stored exclusively as a server-side environment variable. It is never sent to the browser, logged, or committed to version control. Only `databento-client.ts` may access it.

### Consequences

The API key is protected from browser-side exposure. This is a hard security requirement with no exceptions.

---

## ADR-012: Same-Code-Path Replay Architecture

**Date:** 2026-07-17  
**Status:** PROPOSED

### Context

Many trading systems have separate "live" and "backtest" code paths. This creates divergence: the backtest produces different results from the live system because the code is different. This divergence undermines the validity of backtesting.

### Decision

The Atlas replay engine feeds historical events into the same event bus, bar builder, and feature engine as the live system. There is no separate backtest code path. The only difference between live and replay is the data source and the clock.

### Consequences

Replay results are guaranteed to match live system behaviour for the same sequence of market events. This is the critical property that makes DARWIN research valid. The replay clock abstraction adds a small amount of complexity to the bar builder and feature engine.

---

*All 12 ADRs are PROPOSED and require review and approval before Sprint 121 begins.*
