# DBN Fixture Manifest

**Sprint:** 123A.2  
**Gate:** G2 Final  
**Last updated:** 2026-07-19  
**File:** `services/databento-feed/tests/fixtures/`

---

## Fixture Tier Classification

All fixtures are classified into three tiers. The tier determines the level of
production-path compatibility assurance each fixture provides.

| Tier | Classification | Construction Method | DBN Decode? | Gate G2 Role |
|------|---------------|---------------------|-------------|--------------|
| **TIER 1** | Synthetic SDK-constructed | Real SDK constructor, no encode/decode | No | Primary fixtures for trades, OHLCV, symbol-mapping |
| **TIER 2** | Official DBN-decoded | SDK constructor → `bytes(msg)` → `DBNDecoder.decode()` | **Yes** | **Authoritative definition production-path fixture** |
| **TIER 3** | Spec-based mock | `MagicMock(spec=InstrumentDefMsg)` | No | Backward compatibility only |

> **Gate G2 requirement:** The definition production-compatibility gate relies on the
> TIER 2 official DBN-decoded fixture (`make_real_instrument_def_msg()`), not the
> TIER 3 spec-based mock. Tests `TEST-123A2-DEF001` through `TEST-123A2-DEF010` in
> `test_real_definition_fixture.py` use TIER 2 exclusively.

---

## Fixture Inventory

| Schema | Factory Function | Tier | SDK Class | Production Path |
|--------|-----------------|------|-----------|-----------------|
| `trades` | `make_trade_msg()` | TIER 1 | `databento.TradeMsg` | `_handle_trade()` → `_enqueue_authoritative()` |
| `ohlcv-1m` | `make_ohlcv_msg()` | TIER 1 | `databento.OHLCVMsg` | `_handle_ohlcv()` → `_enqueue_authoritative()` |
| `symbol-mapping` | `make_symbol_mapping_msg()` | TIER 1 | `databento.SymbolMappingMsg` | `_handle_symbol_mapping()` → `SymbolResolver.register()` |
| `definition` | `make_real_instrument_def_msg()` | **TIER 2** | `databento_dbn.InstrumentDefMsg` | `_handle_definition()` → `_enqueue_low_priority()` |
| `definition` | `make_instrument_def_msg()` | TIER 3 | `MagicMock(spec=InstrumentDefMsg)` | `_handle_definition()` → `_enqueue_low_priority()` |

---

## TIER 1 — Synthetic SDK-Constructed Fixtures

These fixtures call the real Databento SDK constructors with synthetic test data.
They exercise real SDK class validation (enum types, field constraints) but do not
go through the DBN binary encode/decode round-trip.

### `make_trade_msg()` → `databento.TradeMsg`

**SDK class:** `databento.TradeMsg` (real SDK constructor)  
**Construction:** `db.TradeMsg(publisher_id=1, instrument_id=12345, ts_event=..., price=..., action=db.Action.TRADE, side=db.Side.BID, ...)`

| Field | Value | Notes |
|-------|-------|-------|
| publisher_id | 1 | Synthetic |
| instrument_id | 12345 | Synthetic MNQ instrument ID |
| ts_event | 1_700_000_000_000_000_000 | 2023-11-14T22:13:20.000000000Z |
| price | 18_500_250_000_000 | 18500.25 USD at 1e-9 scale |
| size | 1 | Synthetic |
| action | `db.Action.TRADE` | Real SDK enum |
| side | `db.Side.BID` | Real SDK enum |
| ts_recv | ts_event + 1_000 | +1 microsecond |
| **Secret safety** | PASS | No API key, bridge token, or real data |

### `make_ohlcv_msg()` → `databento.OHLCVMsg`

**SDK class:** `databento.OHLCVMsg` (real SDK constructor)  
**Construction:** `db.OHLCVMsg(rtype=34, publisher_id=1, instrument_id=12345, ts_event=..., open=..., high=..., low=..., close=..., volume=250)`

| Field | Value | Notes |
|-------|-------|-------|
| rtype | 34 | RType.OHLCV_1M |
| publisher_id | 1 | Synthetic |
| instrument_id | 12345 | Synthetic MNQ instrument ID |
| ts_event | 1_700_000_000_000_000_000 | 2023-11-14T22:13:20.000000000Z |
| open | 18_500_000_000_000 | 18500.00 USD at 1e-9 scale |
| high | 18_510_000_000_000 | 18510.00 USD at 1e-9 scale |
| low | 18_490_000_000_000 | 18490.00 USD at 1e-9 scale |
| close | 18_505_000_000_000 | 18505.00 USD at 1e-9 scale |
| volume | 250 | Synthetic |
| **Secret safety** | PASS | No API key, bridge token, or real data |

### `make_symbol_mapping_msg()` → `databento.SymbolMappingMsg`

**SDK class:** `databento.SymbolMappingMsg` (real SDK constructor)  
**Construction:** `db.SymbolMappingMsg(publisher_id=1, instrument_id=12345, ts_event=..., stype_in=db.SType.CONTINUOUS, stype_in_symbol="MNQ.v.0", stype_out=db.SType.RAW_SYMBOL, stype_out_symbol="MNQM5", ...)`

| Field | Value | Notes |
|-------|-------|-------|
| publisher_id | 1 | Synthetic |
| instrument_id | 12345 | Synthetic MNQ instrument ID |
| ts_event | 1_700_000_000_000_000_000 | 2023-11-14T22:13:20.000000000Z |
| stype_in | `db.SType.CONTINUOUS` | Real SDK enum |
| stype_in_symbol | "MNQ.v.0" | Continuous front-month symbol |
| stype_out | `db.SType.RAW_SYMBOL` | Real SDK enum |
| stype_out_symbol | "MNQM5" | Raw contract symbol |
| start_ts | ts_event | Mapping start |
| end_ts | 0 | No expiry |
| **Secret safety** | PASS | No API key, bridge token, or real data |

---

## TIER 2 — Official DBN-Decoded Fixture

This is the **authoritative definition fixture** for Gate G2 production-path
compatibility testing. It is the only fixture that goes through the full
DBN binary encode/decode round-trip.

### `make_real_instrument_def_msg()` → `databento_dbn.InstrumentDefMsg`

**Binary fixture file:** `mnq_definition_record.dbn` (520 bytes)  
**SDK class:** `databento_dbn.InstrumentDefMsg` (real SDK class — NOT a mock)  
**Decode method:** `databento_dbn.DBNDecoder(has_metadata=False).decode()`

**Generation procedure (no live API connection):**

1. Constructed `databento_dbn.InstrumentDefMsg` using the real SDK constructor
   with synthetic MNQ-like parameters and correct enum types
   (`InstrumentClass.FUTURE`, `SecurityUpdateAction.ADD`).
2. Encoded to DBN binary format using `bytes(msg)` (520 bytes).
3. Decoded via `databento_dbn.DBNDecoder(has_metadata=False, ts_out=False)` to
   produce a real `InstrumentDefMsg` instance.
4. All 9 field assertions confirmed to pass (round-trip fidelity verified).
5. Encoded bytes written to `mnq_definition_record.dbn`.

**Generation script:** `/tmp/build_defn_fixture.py` (content reproduced in
`docs/reports/SPRINT_123A2_GATE_G2_FINAL_APPROVAL_SUBMISSION.md`).

| Field | Value | Notes |
|-------|-------|-------|
| publisher_id | 1 | Synthetic |
| instrument_id | 12345 | Synthetic MNQ instrument ID |
| ts_event | 1_700_000_000_000_000_000 | 2023-11-14T22:13:20.000000000Z (nanosecond precision) |
| ts_recv | 1_700_000_000_001_000_000 | +1_000_000 ns (1 microsecond) |
| raw_symbol | "MNQM5" | MNQ June 2025 contract |
| asset | "MNQ" | Micro E-mini Nasdaq-100 |
| currency | "USD" | US Dollar |
| instrument_class | `InstrumentClass.FUTURE` ('F') | Real SDK enum — decoded from DBN |
| min_price_increment | 2_500_000 | 0.0025 USD at 1e-9 scale |
| display_factor | 1_000_000_000 | 1.0 at 1e-9 scale |
| expiration | 1_748_649_600_000_000_000 | 2025-05-30T00:00:00Z (nanosecond precision) |
| security_update_action | `SecurityUpdateAction.ADD` | Real SDK enum |
| **Live API used** | **NO** | Constructed from SDK constructor + DBN encode/decode only |
| **Secret safety** | **PASS** | No API key, bridge token, or real market data |
| **DBN decode fidelity** | **VERIFIED** | Round-trip assertions all pass |

**Production-path test coverage:** Tests `TEST-123A2-DEF001` through
`TEST-123A2-DEF010` in `tests/test_real_definition_fixture.py` verify all
10 Gate G2 definition requirements using this TIER 2 fixture exclusively.

---

## TIER 3 — Spec-Based Mock (Retained for Backward Compatibility)

### `make_instrument_def_msg()` → `MagicMock(spec=databento.InstrumentDefMsg)`

**IMPORTANT:** This mock does NOT exercise the real DBN decode path. It is retained
for backward compatibility with tests in `test_dbn_fixtures.py` that do not require
round-trip DBN decode fidelity. For production-path compatibility testing, use
`make_real_instrument_def_msg()` (TIER 2) instead.

| Field | Value | Notes |
|-------|-------|-------|
| SDK class | `MagicMock(spec=databento.InstrumentDefMsg)` | Spec-based mock — NOT a real SDK instance |
| instrument_id | 12345 | Synthetic |
| raw_symbol | "MNQM5" | Synthetic |
| asset | "MNQ" | Synthetic |
| instrument_class | "FUT" | String, not SDK enum |
| currency | "USD" | Synthetic |
| min_price_increment | 2_500_000 | 0.0025 USD at 1e-9 scale |
| display_factor | 1_000_000_000 | 1.0 at 1e-9 scale |
| expiration | 0 | No expiry |
| ts_recv | SAMPLE_TS_EVENT_NS + 1_000 | Synthetic |
| **DBN decode fidelity** | **NONE** | MagicMock does not exercise DBNDecoder |
| **Secret safety** | PASS | No API key, bridge token, or real data |

**Mock rationale:** The spec ensures that attribute access on undefined fields raises
`AttributeError` rather than silently returning a Mock, which would mask bugs in the
normalisation code. However, it cannot verify that the real SDK decoder produces the
correct field values — that is the role of TIER 2.

---

## Synthetic Data Constants

All fixtures share these synthetic test constants. None of these values are real
market data, real API credentials, or real bridge tokens.

| Constant | Value | Meaning |
|----------|-------|---------|
| `MNQ_INSTRUMENT_ID` | 12345 | Synthetic instrument ID (not a real CME ID) |
| `MNQ_CANONICAL_SYMBOL` | "MNQ1!" | TradingView continuous front-month symbol |
| `MNQ_RAW_SYMBOL` | "MNQM5" | Synthetic June 2025 contract symbol |
| `MNQ_CONTINUOUS_SYMBOL` | "MNQ.v.0" | Databento continuous symbol |
| `SAMPLE_TS_EVENT_NS` | 1_700_000_000_000_000_000 | 2023-11-14T22:13:20.000000000Z |
| `SAMPLE_TS_RECV_NS` | 1_700_000_000_001_000_000 | +1_000_000 ns (1 microsecond) |
| `SAMPLE_EXPIRY_NS` | 1_748_649_600_000_000_000 | 2025-05-30T00:00:00Z |
| `SAMPLE_PRICE_INT` | 18_500_250_000_000 | 18500.25 USD (fixed-point, 1e-9 scale) |
| `SAMPLE_MIN_PRICE_INC` | 2_500_000 | 0.0025 USD (fixed-point, 1e-9 scale) |
| `SAMPLE_DISPLAY_FACTOR` | 1_000_000_000 | 1.0 (fixed-point, 1e-9 scale) |
| `SAMPLE_OPEN_INT` | 18_500_000_000_000 | 18500.00 USD |
| `SAMPLE_HIGH_INT` | 18_510_000_000_000 | 18510.00 USD |
| `SAMPLE_LOW_INT` | 18_490_000_000_000 | 18490.00 USD |
| `SAMPLE_CLOSE_INT` | 18_505_000_000_000 | 18505.00 USD |
| `SAMPLE_VOLUME` | 250 | 250 contracts |

---

## Secret Safety Statement

No fixture in this directory contains or references:
- Real Databento API keys (`DATABENTO_API_KEY`)
- Real bridge authentication tokens (`BRIDGE_AUTH_TOKEN`)
- Real market data from any live or historical Databento feed
- Real instrument IDs from any live Databento dataset

All values are synthetic test data. The `mnq_definition_record.dbn` binary file was
generated from a synthetic SDK constructor call with no live API connection.

Secret safety is verified programmatically by:
- `TEST-123A2-DEF010` in `test_real_definition_fixture.py` (TIER 2 fixture)
- `test_no_api_key_in_normalised_trade` in `test_dbn_fixtures.py` (TIER 1 fixture)

---

## File Inventory

| File | Tier | Type | Size | Description |
|------|------|------|------|-------------|
| `dbn_fixtures.py` | 1/2/3 | Python module | — | Factory functions for all tiers |
| `mnq_definition_record.dbn` | **2** | Binary DBN | **520 bytes** | Official DBN-decoded definition fixture |
| `DBN_FIXTURE_MANIFEST.md` | — | Documentation | — | This file |
| `__init__.py` | — | Python | — | Package init |

---

*Atlas Nexus — Sprint 123A.2 — Gate G2 Final*  
*2026-07-19*
