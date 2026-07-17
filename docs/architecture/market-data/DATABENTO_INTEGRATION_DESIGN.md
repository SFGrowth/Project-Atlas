# DataBento Integration Design

**Document type:** Integration Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-001, ADR-002

---

## Overview

This document specifies the complete design for integrating DataBento as the primary live market data provider for Atlas. It covers dataset selection, schema selection, symbol configuration, connection protocol, authentication, reconnection strategy, and the normalisation layer that converts raw DataBento records into Atlas market event contracts.

DataBento is selected as the primary provider because it offers direct CME Globex exchange feed data (GLBX.MDP3) with nanosecond timestamps, institutional-grade reliability, a clean subscription API, and a pricing model that is viable for a single-instrument live trading system. The absence of an official Node.js SDK is a known constraint that is addressed by the Raw TCP API design in this document.

---

## Dataset Selection

Atlas will use the **GLBX.MDP3** dataset. This dataset is the CME Globex MDP 3.0 feed, which covers all futures and options traded on CME, CBOT, NYMEX, and COMEX. It is sourced directly from the exchange at Aurora I and Equinix FR2 colocation facilities and provides the highest-fidelity CME data available from any commercial vendor.

The GLBX.MDP3 dataset provides:

| Property | Value |
|---|---|
| Exchange coverage | CME, CBOT, NYMEX, COMEX |
| Data since | June 2010 |
| Feed type | UDP multicast, full depth-of-book (MBOFD) |
| Latency | Sub-millisecond at source |
| Symbols | 650,000+ active instruments |
| MNQ availability | Full history from inception |

No other DataBento dataset is required for the initial Atlas integration. The GLBX.MDP3 dataset covers all current and planned Atlas instruments.

---

## Schema Selection

Atlas will subscribe to the **MBP-1** (Market by Price, Level 1) schema for live data. This schema provides every order book event that updates the top price level, including every trade and every BBO (Best Bid and Offer) change.

The MBP-1 schema is selected over alternatives for the following reasons:

| Schema | Data | Reason Not Selected |
|---|---|---|
| `trades` | Trades only, no BBO | Insufficient for spread monitoring and quote display |
| `mbp-1` | **Trades + BBO updates** | **Selected — optimal balance of data richness and bandwidth** |
| `mbp-10` | Top 10 levels | Excessive bandwidth for single-instrument live trading |
| `mbo` | Full order book | Excessive bandwidth and complexity for Atlas use case |
| `ohlcv-1m` | Pre-built 1-minute bars | Insufficient resolution for Atlas 5-minute bar builder |
| `bbo` | BBO in time space | Does not include trade events |
| `tbbo` | Trades with BBO | Does not include non-trade BBO updates |

The MBP-1 schema provides all data required for:

- Live candlestick chart (developing bar updates on every trade)
- Spread monitoring (bid/ask prices and sizes)
- Trade annotation (exact trade prices for entry/exit markers)
- DARWIN tick research (trade price, size, side, sequence)
- Bar building (OHLCV from trades)
- Position P&L valuation (mid-price from BBO)

### MBP-1 Field Reference

| Field | Type | Atlas Usage |
|---|---|---|
| `ts_recv` | uint64_t nanoseconds | Atlas receipt timestamp |
| `ts_event` | uint64_t nanoseconds | Exchange event timestamp |
| `ts_in_delta` | int32_t nanoseconds | Exchange-to-DataBento latency |
| `rtype` | uint8_t | Always 1 for MBP-1 |
| `publisher_id` | uint16_t | Venue identification |
| `instrument_id` | uint32_t | Symbol registry key |
| `action` | char | T=Trade, A=Add, C=Cancel, M=Modify, R=Clear |
| `side` | char | A=Ask aggressor, B=Bid aggressor, N=None |
| `depth` | uint8_t | Always 0 for BBO level |
| `price` | int64_t | Price in 1e-9 units |
| `size` | uint32_t | Order quantity |
| `flags` | uint8_t | F_LAST=0x80, F_BAD_TS_RECV=0x04, F_SNAPSHOT=0x20 |
| `sequence` | uint32_t | Exchange sequence number (gap detection) |
| `bid_px_00` | int64_t | Best bid price (1e-9 units) |
| `ask_px_00` | int64_t | Best ask price (1e-9 units) |
| `bid_sz_00` | uint32_t | Best bid size |
| `ask_sz_00` | uint32_t | Best ask size |
| `bid_ct_00` | uint32_t | Best bid order count |
| `ask_ct_00` | uint32_t | Best ask order count |

### Price Conversion

DataBento stores all prices as signed 64-bit integers in units of 1e-9 (one billionth). To convert to a decimal price:

```typescript
function dbPriceToFloat(dbPrice: bigint): number {
  return Number(dbPrice) / 1_000_000_000;
}
```

For MNQ, the minimum price increment is 0.25 points. In DataBento's integer format, this is 250,000,000 (0.25 × 1e9). All MNQ prices are multiples of 250,000,000 in the raw feed.

---

## Symbol Configuration

### Initial Symbol Subscription

Atlas will subscribe to the following symbols at launch:

| Atlas Symbol | DataBento Symbol | Type | Description |
|---|---|---|---|
| `MNQ1!` | `MNQ.v.0` | Continuous (volume-based front month) | Primary trading instrument |
| `NQ1!` | `NQ.v.0` | Continuous (volume-based front month) | Reference instrument for regime analysis |

The `stype_in` parameter must be set to `"continuous"` when subscribing to continuous contract symbols.

### Symbol Mapping

DataBento uses numeric `instrument_id` values in the live feed, not human-readable symbols. The symbol registry must maintain the mapping between `instrument_id` and Atlas symbols. This mapping is established at session start via `SymbolMappingMsg` records that DataBento sends after the session begins.

The mapping process is:

1. Subscribe to `MNQ.v.0` with `stype_in="continuous"`
2. DataBento sends a `SymbolMappingMsg` containing the current `instrument_id` for the front-month contract
3. The symbol registry stores `instrument_id → { atlasSymbol: "MNQ1!", rawSymbol: "MNQM5", continuousSymbol: "MNQ.v.0" }`
4. All subsequent MBP-1 records use `instrument_id` for symbol identification
5. On contract roll, DataBento sends a new `SymbolMappingMsg` with the new `instrument_id`
6. The symbol registry updates the mapping and publishes an `AtlasSymbolMappingEvent`

### Contract Roll Handling

DataBento's continuous contract symbology (`MNQ.v.0`) automatically tracks the front-month contract by volume. However, the live API does not automatically remap existing subscriptions when a roll occurs. The Atlas symbol registry must handle this explicitly:

1. Monitor `SymbolMappingMsg` records for changes to the `instrument_id` mapped to `MNQ.v.0`
2. When a new `instrument_id` is received for `MNQ.v.0`, update the registry
3. Publish an `AtlasSymbolMappingEvent` to notify all consumers of the roll
4. Log the roll event with the old and new raw symbols and the roll timestamp
5. The bar builder must not split a bar across a contract roll — if a roll occurs mid-bar, the bar is closed and a new bar is started

---

## Connection Protocol

DataBento's live API uses a TCP socket protocol with binary DBN encoding. There is no official Node.js SDK. Atlas must implement the Raw TCP API directly.

### Connection Parameters

| Parameter | Value |
|---|---|
| Host | `live.databento.com` |
| Port | `13000` |
| Protocol | TCP |
| Encoding | DBN (Databento Binary Notation) |
| TLS | Required |
| Authentication | Challenge-response (API key never transmitted) |

### Authentication Sequence

DataBento uses a challenge-response authentication protocol that ensures the API key is never transmitted over the network:

```
Client → Server: CONNECT <api_key_id>\n
Server → Client: CHALLENGE <challenge_string>\n
Client → Server: AUTHENTICATE <HMAC-SHA256(challenge_string, api_key)>\n
Server → Client: SUCCESS <session_id>\n
```

The `api_key_id` is the first 8 characters of the API key. The HMAC-SHA256 response is computed using the full API key as the secret and the challenge string as the message.

### Subscription Request

After authentication, Atlas sends a subscription request:

```json
{
  "dataset": "GLBX.MDP3",
  "schema": "mbp-1",
  "symbols": ["MNQ.v.0"],
  "stype_in": "continuous",
  "start": 0
}
```

Setting `start: 0` requests the full intraday replay from the beginning of the current session. This ensures Atlas has a complete bar history when it connects mid-session.

### Session Lifecycle

```
1. TCP connect to live.databento.com:13000
2. Challenge-response authentication
3. Send subscription request
4. Receive SymbolMappingMsg records (instrument_id mappings)
5. Receive SystemMsg (session start confirmation)
6. Receive MBP-1 records continuously
7. On disconnect: enter RECONNECTING state, begin backoff
8. On reconnect: restart from step 1 with start=<last_received_ts>
```

### DBN Record Parsing

DataBento sends binary DBN-encoded records over the TCP socket. Each record begins with a fixed-size header containing the record length, record type (`rtype`), and publisher ID. The Atlas DBN parser must:

1. Read the 4-byte record length header
2. Buffer the complete record
3. Dispatch based on `rtype`:
   - `rtype=1`: MBP-1 record → normalise to `AtlasTradeEvent` or `AtlasQuoteEvent`
   - `rtype=15`: SymbolMappingMsg → update symbol registry
   - `rtype=11`: SystemMsg → log session events
   - `rtype=20`: ErrorMsg → log and handle
4. All multi-byte integers are little-endian

The DBN parser is implemented in `server/market-data/databento-client.ts` and is the only component that handles raw binary DataBento records.

---

## Reconnection Strategy

The DataBento client implements exponential backoff reconnection with the following parameters:

| Parameter | Value |
|---|---|
| Initial delay | 1 second |
| Backoff multiplier | 2.0 |
| Maximum delay | 60 seconds |
| Maximum attempts | Unlimited (retry forever) |
| Jitter | ±20% of delay |

On reconnection, the client sends `start=<last_received_ts_event>` to request only records that arrived after the last successfully processed event. This prevents duplicate processing of records that were received before the disconnect.

During the reconnection window, the feed health state machine transitions to `RECONNECTING` and activates the M-16 fallback. `processBar()` continues to be called via the M-16 webhook path. When DataBento reconnects, the fallback is deactivated and DataBento resumes as the primary trigger.

---

## Event Normalisation

The event normaliser converts raw DataBento MBP-1 records into Atlas market event contracts. The normalisation rules are:

### Trade Event (action='T')

A DataBento MBP-1 record with `action='T'` is normalised to an `AtlasTradeEvent`:

```typescript
function normaliseTrade(record: Mbp1Record, mapping: SymbolMapping): AtlasTradeEvent {
  return {
    type: 'trade',
    eventId: generateEventId(),
    symbol: mapping.continuousSymbol,    // "MNQ.v.0"
    atlasSymbol: mapping.atlasSymbol,    // "MNQ1!"
    rawSymbol: mapping.rawSymbol,        // "MNQM5"
    price: dbPriceToFloat(record.price),
    size: record.size,
    side: record.side as 'A' | 'B' | 'N',
    action: 'T',
    sequence: record.sequence,
    tsEvent: record.ts_event,
    tsRecv: record.ts_recv,
    atlasTs: Date.now(),
    source: 'databento',
  };
}
```

### Quote Event (action='A', 'C', 'M', 'R')

A DataBento MBP-1 record with `action` other than 'T' is normalised to an `AtlasQuoteEvent`:

```typescript
function normaliseQuote(record: Mbp1Record, mapping: SymbolMapping): AtlasQuoteEvent {
  return {
    type: 'quote',
    eventId: generateEventId(),
    symbol: mapping.continuousSymbol,
    atlasSymbol: mapping.atlasSymbol,
    rawSymbol: mapping.rawSymbol,
    bidPx: dbPriceToFloat(record.bid_px_00),
    askPx: dbPriceToFloat(record.ask_px_00),
    bidSz: record.bid_sz_00,
    askSz: record.ask_sz_00,
    bidCt: record.bid_ct_00,
    askCt: record.ask_ct_00,
    action: record.action as 'A' | 'C' | 'M' | 'R',
    side: record.side as 'A' | 'B' | 'N',
    sequence: record.sequence,
    tsEvent: record.ts_event,
    tsRecv: record.ts_recv,
    atlasTs: Date.now(),
    source: 'databento',
  };
}
```

### Snapshot Records

DataBento sends snapshot records (flags & 0x20 = F_SNAPSHOT) at session start to provide the current order book state. Snapshot records are processed identically to live records but are tagged with `source: 'databento_snapshot'` for monitoring purposes.

### F_LAST Flag

The `F_LAST` flag (flags & 0x80) indicates the last message in a sequence of updates for a single exchange event. Atlas does not need to buffer records waiting for `F_LAST` for the MBP-1 schema, as each MBP-1 record is self-contained. The flag is logged for monitoring but does not affect processing.

---

## Subscription Plan Requirements

The DataBento Standard plan ($199/month) is sufficient for the initial Atlas integration. It provides:

- Live data for GLBX.MDP3 (included)
- Last 12 months of L1 historical data (MBP-1)
- Last 1 month of L2 historical data (MBP-10)
- 100 simultaneous sessions per dataset

The Standard plan supports all Sprint 121–127 requirements. The Plus plan ($1,750/month annual) would be required if DARWIN research needs more than 12 months of MBP-1 history or more than 1 month of MBP-10 history.

---

## Environment Variables

The DataBento integration requires the following environment variables:

| Variable | Description | Required |
|---|---|---|
| `DATABENTO_API_KEY` | DataBento API key (server-side only) | Yes |
| `DATABENTO_DATASET` | Dataset ID (default: `GLBX.MDP3`) | No |
| `DATABENTO_SCHEMA` | Schema (default: `mbp-1`) | No |
| `DATABENTO_SYMBOLS` | Comma-separated symbols (default: `MNQ.v.0`) | No |
| `DATABENTO_STYPE_IN` | Symbol type (default: `continuous`) | No |

The `DATABENTO_API_KEY` must be stored as a server-side secret and must never be exposed to the browser. It is added via `webdev_request_secrets` in Sprint 121.

---

## Historical API Usage

The DataBento historical API is used for two purposes:

**1. Gap fill:** When the live feed detects a sequence gap, the gap-detector requests the missing records from the historical API using the `timeseries.get_range` endpoint with the gap's start and end timestamps.

**2. DARWIN research:** DARWIN research queries use the historical API to fetch MBP-1 data for specific date ranges. These queries are executed server-side using the DataBento HTTP API with the same `DATABENTO_API_KEY`.

The historical API uses HTTPS (not TCP) and returns DBN-encoded data. The same DBN parser used for the live feed is reused for historical data.

---

*This document is the authoritative specification for the DataBento integration. Implementation begins in Sprint 121.*
