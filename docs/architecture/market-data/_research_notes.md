# Sprint 120 Research Notes — DataBento Facts

## DataBento Verified Facts (from official documentation)

### Dataset
- Dataset ID: `GLBX.MDP3` (CME Globex MDP 3.0)
- Covers: All futures and options on CME, CBOT, NYMEX, COMEX
- Coverage since: June 2010
- Symbols: 650,000+
- Source: Direct exchange feed at Aurora I and Equinix FR2 colos (DC3 datacenter)
- Feed type: UDP multicast, full depth-of-book (MBOFD)

### Schemas Available
- `trades` — L1: trade price, size, side, aggressor, sequence
- `mbp-1` — L1: every trade + BBO update (bid_px_00, ask_px_00, bid_sz_00, ask_sz_00, bid_ct_00, ask_ct_00, action, side, depth, price, size, flags, sequence, ts_event, ts_recv, ts_in_delta)
- `mbp-10` — L2: top 10 price levels with size and order count
- `mbo` — L3: full order book (every order add/cancel/modify)
- `ohlcv-1s`, `ohlcv-1m`, `ohlcv-1h`, `ohlcv-1d` — L0: pre-built bars
- `bbo` — BBO in time space (different from mbp-1 which is in book update space)
- `tbbo` — Trades with BBO (trade space)
- `definitions` — Instrument definitions, expiry, settlement
- `statistics` — Settlement prices, open interest, cleared volume

### MBP-1 Schema Fields
| Field | Type | Description |
|---|---|---|
| ts_recv | uint64_t | Capture-server-received timestamp (nanoseconds since UNIX epoch) |
| ts_event | uint64_t | Matching-engine-received timestamp (nanoseconds since UNIX epoch) |
| ts_in_delta | int32_t | Matching-engine-sending timestamp (nanoseconds before ts_recv) |
| rtype | uint8_t | Record type sentinel, always 1 for mbp-1 |
| publisher_id | uint16_t | Publisher ID |
| instrument_id | uint32_t | Numeric instrument ID |
| action | char | A=Add, C=Cancel, M=Modify, R=Clear, T=Trade |
| side | char | A=Ask aggressor, B=Bid aggressor, N=None |
| depth | uint8_t | Book level (0 for BBO) |
| price | int64_t | Price in 1e-9 units (divide by 1e9 for float) |
| size | uint32_t | Order quantity |
| flags | uint8_t | Bit field: F_LAST=0x80, F_BAD_TS_RECV=0x04, F_SNAPSHOT=0x20 |
| sequence | uint32_t | Venue message sequence number |
| bid_px_00 | int64_t | Best bid price (1e-9 units) |
| ask_px_00 | int64_t | Best ask price (1e-9 units) |
| bid_sz_00 | uint32_t | Best bid size |
| ask_sz_00 | uint32_t | Best ask size |
| bid_ct_00 | uint32_t | Best bid order count |
| ask_ct_00 | uint32_t | Best ask order count |

### Symbology
- Raw symbol: `MNQM5` (product code + month code + year)
- Parent symbol: `MNQ.FUT` (all MNQ futures)
- Continuous symbol: `MNQ.v.0` (volume-based front month), `MNQ.v.1` (second expiry)
- Month codes: F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec
- Note: In live API, existing subscriptions to continuous contracts will NOT be remapped when contract rolls. Must submit new subscription.

### Timestamps
- ts_event: matching-engine-received timestamp (nanoseconds)
- ts_recv: capture-server-received timestamp (nanoseconds)
- ts_in_delta: matching-engine-sending timestamp (nanoseconds before ts_recv)
- ts_out: Databento gateway-sending timestamp
- All timestamps are nanoseconds since UNIX epoch

### Pricing Plans (as of 2026)
| Plan | Monthly Cost | Historical L1 | Historical L2/L3 | Live Data |
|---|---|---|---|---|
| Usage-based | Pay per GB | L0 only | No | No |
| Standard | $199/mo | Last 12 months | Last 1 month | Included |
| Plus | $1,750/mo (annual) | 16+ years | Last 1 month | Included |
| Unlimited | $4,500/mo (annual) | 16+ years | 16+ years | Included |

- Historical GLBX.MDP3 pricing: from $0.50/GB
- Live data: included in all paid subscription plans
- Standard plan is sufficient for Atlas initial deployment

### Connection Limits
- 100 simultaneous sessions per dataset per user
- Live API uses TCP socket (Raw API)
- Authentication: challenge-response (API key never sent over network)
- Default env var: `DATABENTO_API_KEY`

### Client Libraries
- Official: Python, C++, Rust only
- NO official JavaScript/TypeScript/Node.js SDK (as of 2026)
- Roadmap item exists: https://roadmap.databento.com/b/n0o5prm6/feature-ideas/official-javascript-client-library
- Atlas must use Raw TCP API directly from Node.js

### Intraday Replay
- Last 24 hours available via live API
- GLBX.MDP3 special: full weekly session replay for MBO and definitions schemas
- Pass start=0 for full replay history

### Live API Protocol
- Socket-based TCP subscription protocol
- Binary DBN encoding for performant zero-copy decoding
- Multiple subscriptions per session (same dataset)
- Session starts streaming when Live.start() called
- SymbolMappingMsg records sent after session starts for instrument_id → symbol mapping

## TradingView Lightweight Charts Facts
- License: Apache 2.0 (open source, commercial use permitted)
- GitHub: https://github.com/tradingview/lightweight-charts
- npm package: `lightweight-charts`
- Attribution required: must credit TradingView per NOTICE file
- Supports: live candlestick updates via series.update() and series.setData()
- Supports: series markers (trade annotations) via series.setMarkers()
- Performance: designed for high-frequency updates, WebGL-accelerated
- Dark mode: supported via theme configuration
- Mobile: responsive, touch support
- Does NOT require TradingView platform, Pine Script, or TradingView alerts

## Current Atlas Architecture Facts (from codebase)
- Webhook endpoint: POST /api/webhook/observe/:token
- Symbol: MNQ1! (TradingView continuous)
- Timeframe: 5 (5-minute bars)
- Schema version: 1.0.0
- SSE already in use: /api/events
- atlas_memory table: full bar + indicator schema
- processBar() input: BarData interface (all indicators from Pine Script)
- No independent indicator calculation in Atlas
- No live chart in dashboard
- No historical data access
- No symbol registry
- Feed monitoring: 15-min silence = WEBHOOK_FAILURE, 45-min = TV_DISCONNECTED
