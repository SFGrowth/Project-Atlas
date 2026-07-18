# Databento Python Feed Service Specification
**Document type:** Architecture Reference  
**Sprint:** 123A.2  
**Revision:** 2  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

This document specifies the Python Databento feed service that will be built in Sprint 123A.2. The service is a pure adapter — it owns only the official Databento client connection and raw record normalisation. All candle construction, aggregation, and persistence are owned by TypeScript.

---

## Module Structure

```
services/
└── databento-feed/
    ├── main.py                  # Entry point; environment loading; service startup
    ├── config.py                # Environment variable loading and validation
    ├── databento_client.py      # Official databento-python client wrapper
    ├── record_normalizer.py     # trades + ohlcv-1m + definition + symbol-mapping normalisation
    ├── bridge_client.py         # Authenticated WebSocket bridge client
    ├── health_reporter.py       # Feed health state reporting to bridge
    ├── replay_manager.py        # Live replay and historical API request management
    ├── requirements.txt         # databento, websockets, python-dotenv
    └── tests/
        ├── test_record_normalizer.py    # Fixture-based normalisation tests
        ├── test_bridge_client.py        # Bridge auth and message format tests
        ├── test_health_reporter.py      # Feed health state machine tests
        └── fixtures/
            ├── sample_trades.dbn        # Sample DBN trades records
            ├── sample_ohlcv_1m.dbn      # Sample DBN ohlcv-1m records
            └── sample_definitions.dbn   # Sample DBN definition records
```

---

## Module Responsibilities

### `main.py`

Entry point. Loads environment variables from `.env` (development) or system environment (production). Validates required variables. Creates and starts the `DatabentoFeedService`. Handles `SIGTERM` and `SIGINT` for graceful shutdown.

**Must not:** Connect to Databento if `DATABENTO_LIVE_ENABLED=false`. Log `DATABENTO_API_KEY`. Start if `BRIDGE_AUTH_TOKEN` is not set.

### `config.py`

Loads and validates all environment variables. Raises a clear error if any required variable is missing. Provides typed access to all configuration values.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABENTO_API_KEY` | Yes | — | Never logged |
| `DATABENTO_LIVE_ENABLED` | Yes | `false` | Must be `true` to connect |
| `DATABENTO_DATASET` | No | `GLBX.MDP3` | CME Globex |
| `DATABENTO_SYMBOL` | No | `<unverified — see TEST-INT-001>` | Continuous front month symbol; actual value confirmed by TEST-INT-001 before use |
| `DATABENTO_TRADES_SCHEMA` | No | `trades` | Schema for trade records |
| `DATABENTO_BAR_SCHEMA` | No | `ohlcv-1m` | Schema for bar records |
| `BRIDGE_AUTH_TOKEN` | Yes | — | Never logged |
| `BRIDGE_HOST` | No | `127.0.0.1` | Bridge host |
| `BRIDGE_PORT` | No | `7890` | Bridge port |

### `databento_client.py`

Wraps the official `databento.Live` client. Subscribes to the continuous MNQ front-month symbol (resolved dynamically; actual symbol confirmed by `TEST-INT-001` before Sprint 123A.2 begins) with `trades` and `ohlcv-1m` schemas. Handles reconnection with exponential backoff. Publishes raw records to the normaliser. Reports connection state changes to the health reporter.

**Must not:** Perform any bar construction. Perform any aggregation. Write to any database. Log the API key.

### `record_normalizer.py`

Normalises raw Databento records into the canonical Atlas message format for the bridge. Handles `trades`, `ohlcv-1m`, `InstrumentDefMsg`, and `SymbolMappingMsg` record types.

**Output message types:**

| Input Record | Output Message Type | Notes |
|---|---|---|
| `TradeMsg` | `atlas_trade` | Price, size, side, aggressor, timestamps |
| `OhlcvMsg` (1-min) | `atlas_ohlcv_1m` | Official Databento 1-min bar for reconciliation |
| `InstrumentDefMsg` | `atlas_definition` | Contract metadata |
| `SymbolMappingMsg` | `atlas_symbol_mapping` | Raw symbol → canonical symbol mapping |

**Timestamp conversion rule:** The normaliser is the sole location where Databento nanosecond timestamps are converted to Atlas millisecond timestamps. The conversion must use integer division:

```python
barOpenTsMs: int = ts_event_ns // 1_000_000  # integer division — no floating-point
```

The following pattern is **prohibited** because current-epoch nanosecond values exceed the IEEE 754 double-precision safe integer range:

```python
# PROHIBITED
# barOpenTsMs = int(float(ts_event_ns) / 1_000_000)  # precision loss
```

The raw `ts_event_ns` and `ts_recv_ns` values are preserved as Python `int` and serialised to the bridge as base-10 decimal strings (see bridge message format below).

**Must not:** Construct developing candles. Construct confirmed candles. Perform aggregation.

### `bridge_client.py`

Authenticated WebSocket client that connects to the Atlas bridge server. Handles the authentication handshake. Publishes normalised messages. Handles reconnection. Implements bounded queue with backpressure.

**Authentication sequence:**

1. Connect to `ws://{BRIDGE_HOST}:{BRIDGE_PORT}`
2. Receive `{ "type": "auth_challenge", "nonce": "<random>" }`
3. Send `{ "type": "auth_response", "token": "<BRIDGE_AUTH_TOKEN>" }`
4. Receive `{ "type": "auth_ok" }` or connection closed
5. Begin streaming normalised records

**Message format:**

**Nanosecond wire format:** Standard JSON cannot serialise Python `int` values that exceed JavaScript's `Number.MAX_SAFE_INTEGER`. Nanosecond timestamp fields (`tsEventNs`, `tsRecvNs`) must be serialised as base-10 decimal strings. The TypeScript bridge reconstructs the `BigInt` value using `BigInt(payload.tsEventNs)`.

```json
{
  "type": "atlas_trade",
  "version": 1,
  "ts": 1753000000000,
  "payload": {
    "symbol": "<resolved by Contract Roll Manager — see TEST-INT-001>",
    "rawSymbol": "MNQM5",
    "instrumentId": 12345,
    "price": 21500.25,
    "size": 1,
    "side": "buy",
    "aggressor": "buy",
    "tsEventNs": "1753000000123456789",
    "tsRecvNs": "1753000000123500000",
    "barOpenTsMs": 1753000000123,
    "sequence": 9876543
  }
}
```

`tsEventNs` and `tsRecvNs` are decimal strings. `barOpenTsMs` is a JSON integer (safe: milliseconds since epoch are well within `Number.MAX_SAFE_INTEGER` until the year 2255). Never transmit nanosecond timestamps as floating-point JSON numbers.

**Must not:** Include `DATABENTO_API_KEY` or `BRIDGE_AUTH_TOKEN` in any message.

### `health_reporter.py`

Reports feed health state to the bridge. Maps Databento connection states to Atlas feed health states.

| Databento State | Atlas Feed Health State |
|---|---|
| Connected, receiving records | `LIVE` |
| Connected, no records for > 30s during trading hours | `STALE` |
| Reconnecting | `RECONNECTING` |
| Disconnected | `OFFLINE` |
| Receiving records with sequence gaps | `DEGRADED` |

### `replay_manager.py`

Manages live replay requests (for gap recovery) and historical API requests (for gap recovery > 60 minutes). Triggered by the bridge when the TypeScript server requests a replay for a specific time range.

---

## Testing Strategy

All tests use fixtures. No paid Databento connection is required for CI.

| Test | Type | Fixtures Used |
|---|---|---|
| `test_record_normalizer.py` | Unit | `sample_trades.dbn`, `sample_ohlcv_1m.dbn`, `sample_definitions.dbn` |
| `test_bridge_client.py` | Unit | Mock WebSocket server |
| `test_health_reporter.py` | Unit | Mock connection state changes |
| Integration test (opt-in) | Integration | Live Databento connection (`DATABENTO_INTEGRATION_TESTS=true`) |

---

## Secret Scanning Tests

The following tests are required in Sprint 123A.2 and must pass before Gate G2:

1. `DATABENTO_API_KEY` does not appear in any log output
2. `DATABENTO_API_KEY` does not appear in any bridge message
3. `BRIDGE_AUTH_TOKEN` does not appear in any log output
4. `BRIDGE_AUTH_TOKEN` does not appear in any bridge message payload
5. `DATABENTO_API_KEY` does not appear in any Python exception traceback
6. `DATABENTO_API_KEY` does not appear in any health report message
