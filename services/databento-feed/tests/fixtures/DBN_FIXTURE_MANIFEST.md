# DBN Fixture Manifest

**Sprint 123A.2 — Gate G2 Revision 3**
**File:** `services/databento-feed/tests/fixtures/dbn_fixtures.py`

---

## Purpose

This manifest documents the provenance, construction method, and intended usage of every fixture schema defined in `dbn_fixtures.py`. All fixtures are **synthetic test data** constructed from the live Databento Python SDK. No real market data, API keys, bridge tokens, or account credentials are present in any fixture.

---

## Fixture Schemas

| Schema | Factory Function | SDK Class | Construction Method | Production Path |
|--------|-----------------|-----------|---------------------|-----------------|
| `trades` | `make_trade_msg()` | `databento.TradeMsg` | Real SDK constructor | `_handle_trade()` → `_enqueue_authoritative()` |
| `ohlcv-1m` | `make_ohlcv_msg()` | `databento.OHLCVMsg` | Real SDK constructor | `_handle_ohlcv()` → `_enqueue_authoritative()` |
| `symbol-mapping` | `make_symbol_mapping_msg()` | `databento.SymbolMappingMsg` | Real SDK constructor | `_handle_symbol_mapping()` → `SymbolResolver.register()` |
| `definition` | `make_instrument_def_msg()` | `MagicMock(spec=databento.InstrumentDefMsg)` | Mock with spec | `_handle_definition()` → `_enqueue_low_priority()` |

---

## Schema Provenance

### 1. `trades` — `make_trade_msg()`

**SDK class:** `databento.TradeMsg`
**Construction:** Real SDK constructor called with all required fields.
**Key fields:**
- `publisher_id=1` — CME Globex publisher
- `instrument_id=12345` — synthetic MNQ instrument ID
- `ts_event` — nanosecond timestamp (`SAMPLE_TS_EVENT_NS = 1_700_000_000_000_000_000`)
- `price` — fixed-point integer (`SAMPLE_PRICE_INT = 18_500_250_000_000`, representing 18500.25 USD at 1e-9 scale)
- `size=1` — single contract
- `action=db.Action.TRADE` — real SDK enum
- `side=db.Side.BID` — real SDK enum
- `ts_recv = ts_event + 1_000` — 1 microsecond synthetic receive latency

**Production path:** `DatabentoFeedAdapter._handle_trade(msg)` normalises the fixed-point price to USD float, resolves the canonical symbol via `SymbolResolver`, and enqueues a `BridgeEnvelope` with schema `"trades"` via `_enqueue_authoritative()`.

**Precision contract:** `ts_event_ns` in the normalised payload must equal the input `ts_event` exactly (nanosecond precision preserved end-to-end).

---

### 2. `ohlcv-1m` — `make_ohlcv_msg()`

**SDK class:** `databento.OHLCVMsg`
**Construction:** Real SDK constructor called with `rtype=34` (RType.OHLCV_1M).
**Key fields:**
- `rtype=34` — OHLCV 1-minute RType value
- `publisher_id=1` — CME Globex publisher
- `instrument_id=12345` — synthetic MNQ instrument ID
- `ts_event` — nanosecond timestamp
- `open=18_500_000_000_000` (18500.00 USD)
- `high=18_510_000_000_000` (18510.00 USD)
- `low=18_490_000_000_000` (18490.00 USD)
- `close=18_505_000_000_000` (18505.00 USD)
- `volume=250` — 250 contracts

**Production path:** `DatabentoFeedAdapter._handle_ohlcv(msg)` normalises all four OHLCV prices from fixed-point to USD float, resolves the canonical symbol, and enqueues a `BridgeEnvelope` with schema `"ohlcv-1m"` via `_enqueue_authoritative()`. Overflow triggers DEGRADED state + GapRecord.

**Precision contract:** All four OHLCV prices must be within floating-point rounding tolerance of their expected USD values. `ts_event_ns` must be preserved exactly.

---

### 3. `symbol-mapping` — `make_symbol_mapping_msg()`

**SDK class:** `databento.SymbolMappingMsg`
**Construction:** Real SDK constructor.
**Key fields:**
- `publisher_id=1`
- `instrument_id=12345`
- `ts_event` — nanosecond timestamp
- `stype_in=db.SType.CONTINUOUS` — real SDK enum
- `stype_in_symbol="MNQ.v.0"` — continuous front-month symbol
- `stype_out=db.SType.RAW_SYMBOL` — real SDK enum
- `stype_out_symbol="MNQM5"` — raw contract symbol
- `start_ts=ts_event`, `end_ts=0` (no expiry)

**Production path:** `DatabentoFeedAdapter._handle_symbol_mapping(msg)` calls `SymbolResolver.register(instrument_id, stype_in_symbol, stype_out_symbol)`. After registration, `resolver.resolve_canonical(instrument_id)` returns `"MNQ1!"`.

**Precision contract:** After processing, `SymbolResolver.resolve_canonical(MNQ_INSTRUMENT_ID)` must return `MNQ_CANONICAL_SYMBOL = "MNQ1!"`.

---

### 4. `definition` — `make_instrument_def_msg()`

**SDK class:** `MagicMock(spec=databento.InstrumentDefMsg)`
**Construction:** Mock with spec (not real SDK constructor).
**Rationale:** `databento.InstrumentDefMsg` has a complex constructor requiring many fields not relevant to the normalisation test. The mock provides only the attributes consumed by `_handle_definition()`.
**Key attributes:**
- `instrument_id=12345`
- `raw_symbol="MNQM5"`
- `asset="MNQ"`
- `instrument_class="FUT"`
- `currency="USD"`
- `min_price_increment=2_500_000` (0.0025 USD in fixed-point)
- `display_factor=1_000_000_000` (1.0 in fixed-point)
- `expiration=0` (no expiry)
- `ts_recv = SAMPLE_TS_EVENT_NS + 1_000`

**Production path:** `DatabentoFeedAdapter._handle_definition(msg)` enqueues a `BridgeEnvelope` with schema `"definition"` via `_enqueue_low_priority()`.

**Mock rationale documented:** The use of `MagicMock(spec=...)` is intentional and documented. The spec ensures that attribute access on undefined fields raises `AttributeError` rather than silently returning a Mock, which would mask bugs in the normalisation code.

---

## Synthetic Data Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `MNQ_INSTRUMENT_ID` | `12345` | Synthetic instrument ID (not a real CME ID) |
| `MNQ_CANONICAL_SYMBOL` | `"MNQ1!"` | TradingView continuous front-month symbol |
| `MNQ_RAW_SYMBOL` | `"MNQM5"` | Synthetic June 2025 contract symbol |
| `MNQ_CONTINUOUS_SYMBOL` | `"MNQ.v.0"` | Databento continuous symbol |
| `SAMPLE_TS_EVENT_NS` | `1_700_000_000_000_000_000` | 2023-11-14T22:13:20.000000000Z |
| `SAMPLE_PRICE_INT` | `18_500_250_000_000` | 18500.25 USD (fixed-point, 1e-9 scale) |
| `SAMPLE_OPEN_INT` | `18_500_000_000_000` | 18500.00 USD |
| `SAMPLE_HIGH_INT` | `18_510_000_000_000` | 18510.00 USD |
| `SAMPLE_LOW_INT` | `18_490_000_000_000` | 18490.00 USD |
| `SAMPLE_CLOSE_INT` | `18_505_000_000_000` | 18505.00 USD |
| `SAMPLE_VOLUME` | `250` | 250 contracts |

---

## Secret Safety

All fixtures are synthetic. The following secrets are explicitly absent from all fixture data:

- `DATABENTO_API_KEY` — not present in any fixture field
- `BRIDGE_AUTH_TOKEN` — not present in any fixture field
- Real CME instrument IDs — not used (synthetic `12345`)
- Real market prices — not used (synthetic round numbers)

Tests `test_no_api_key_in_normalised_trade` and `test_no_bridge_token_in_normalised_trade` in `test_dbn_fixtures.py` verify this programmatically.

---

## Production-Path Coverage

The following table maps each fixture to the production normalisation code path it exercises:

| Fixture | Handler | Normalisation | Queue Method | Schema |
|---------|---------|---------------|--------------|--------|
| `make_trade_msg()` | `_handle_trade()` | price / 1e9, symbol resolve | `_enqueue_authoritative()` | `"trades"` |
| `make_ohlcv_msg()` | `_handle_ohlcv()` | 4× price / 1e9, symbol resolve, overflow check | `_enqueue_authoritative()` | `"ohlcv-1m"` |
| `make_symbol_mapping_msg()` | `_handle_symbol_mapping()` | `SymbolResolver.register()` | `_enqueue_low_priority()` | `"symbol-mapping"` |
| `make_instrument_def_msg()` | `_handle_definition()` | price / 1e9, field extraction | `_enqueue_low_priority()` | `"definition"` |

Tests in `test_dbn_fixtures.py` call each handler directly with the fixture and assert the normalised output matches the expected values, confirming that fixtures exercise the real production code path rather than mocked normalisation.

---

*Generated by Atlas Nexus Sprint 123A.2 Gate G2 Revision 3.*
*Last updated: 2026-07-19*
