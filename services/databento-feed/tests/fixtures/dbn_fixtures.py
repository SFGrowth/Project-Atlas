"""
Atlas Databento Feed Adapter — Official DBN Fixtures
Sprint 123A.2 — Gate G2 Round 2 — Workstream 3

Provides factory functions for creating real Databento SDK message objects
for use in tests. These fixtures use the actual databento SDK classes to
ensure tests exercise real normalisation code paths.

All fixtures use MNQ (Micro Nasdaq futures) as the test instrument.
Timestamps use nanosecond precision to validate that precision is preserved
through the normalisation pipeline.

SECRET SAFETY
-------------
These fixtures MUST NOT contain any real API keys, bridge tokens, or
other secrets. All values are synthetic test data only.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import databento as db

# ── Test constants ─────────────────────────────────────────────────────────────

MNQ_INSTRUMENT_ID = 12345
MNQ_CANONICAL_SYMBOL = "MNQ1!"
MNQ_RAW_SYMBOL = "MNQM5"
MNQ_CONTINUOUS_SYMBOL = "MNQ.v.0"

# Nanosecond timestamp: 2023-11-14T22:13:20.000000000Z
SAMPLE_TS_EVENT_NS = 1_700_000_000_000_000_000

# Fixed-point price: 18500.25 USD (Databento uses 1e-9 scale factor)
# 18500.25 * 1_000_000_000 = 18_500_250_000_000
SAMPLE_PRICE_INT = 18_500_250_000_000

# OHLCV prices in fixed-point
SAMPLE_OPEN_INT = 18_500_000_000_000   # 18500.00
SAMPLE_HIGH_INT = 18_510_000_000_000   # 18510.00
SAMPLE_LOW_INT = 18_490_000_000_000    # 18490.00
SAMPLE_CLOSE_INT = 18_505_000_000_000  # 18505.00
SAMPLE_VOLUME = 250


# ── Factory functions ──────────────────────────────────────────────────────────

def make_trade_msg(
    instrument_id: int = MNQ_INSTRUMENT_ID,
    ts_event_ns: int = SAMPLE_TS_EVENT_NS,
    price_int: int = SAMPLE_PRICE_INT,
    size: int = 1,
) -> db.TradeMsg:
    """
    Create a real databento.TradeMsg for testing.

    Uses db.Action.TRADE and db.Side.BID enum values as required by the SDK.
    All values are synthetic test data — no real market data or secrets.
    """
    return db.TradeMsg(
        publisher_id=1,
        instrument_id=instrument_id,
        ts_event=ts_event_ns,
        price=price_int,
        size=size,
        action=db.Action.TRADE,
        side=db.Side.BID,
        depth=0,
        ts_recv=ts_event_ns + 1_000,  # 1 microsecond receive latency
    )


def make_ohlcv_msg(
    instrument_id: int = MNQ_INSTRUMENT_ID,
    ts_event_ns: int = SAMPLE_TS_EVENT_NS,
    open_int: int = SAMPLE_OPEN_INT,
    high_int: int = SAMPLE_HIGH_INT,
    low_int: int = SAMPLE_LOW_INT,
    close_int: int = SAMPLE_CLOSE_INT,
    volume: int = SAMPLE_VOLUME,
) -> db.OHLCVMsg:
    """
    Create a real databento.OHLCVMsg for testing.

    rtype=34 corresponds to the ohlcv-1m schema RType value.
    All values are synthetic test data — no real market data or secrets.
    """
    return db.OHLCVMsg(
        rtype=34,  # RType.OHLCV_1M
        publisher_id=1,
        instrument_id=instrument_id,
        ts_event=ts_event_ns,
        open=open_int,
        high=high_int,
        low=low_int,
        close=close_int,
        volume=volume,
    )


def make_symbol_mapping_msg(
    instrument_id: int = MNQ_INSTRUMENT_ID,
    ts_event_ns: int = SAMPLE_TS_EVENT_NS,
    stype_in_symbol: str = MNQ_CONTINUOUS_SYMBOL,
    stype_out_symbol: str = MNQ_RAW_SYMBOL,
) -> db.SymbolMappingMsg:
    """
    Create a real databento.SymbolMappingMsg for testing.

    Maps MNQ.v.0 (continuous) → MNQM5 (raw contract symbol).
    All values are synthetic test data — no real market data or secrets.
    """
    return db.SymbolMappingMsg(
        publisher_id=1,
        instrument_id=instrument_id,
        ts_event=ts_event_ns,
        stype_in=db.SType.CONTINUOUS,
        stype_in_symbol=stype_in_symbol,
        stype_out=db.SType.RAW_SYMBOL,
        stype_out_symbol=stype_out_symbol,
        start_ts=ts_event_ns,
        end_ts=0,  # 0 = no expiry
    )


def make_instrument_def_msg(
    instrument_id: int = MNQ_INSTRUMENT_ID,
    raw_symbol: str = MNQ_RAW_SYMBOL,
    asset: str = "MNQ",
) -> MagicMock:
    """
    Create a mock databento.InstrumentDefMsg for testing.

    Uses MagicMock with spec=db.InstrumentDefMsg because InstrumentDefMsg
    has a complex constructor that requires many fields. The mock provides
    all attributes needed by the feed adapter's _handle_definition method.
    All values are synthetic test data — no real market data or secrets.
    """
    mock = MagicMock(spec=db.InstrumentDefMsg)
    mock.instrument_id = instrument_id
    mock.raw_symbol = raw_symbol
    mock.asset = asset
    mock.instrument_class = "FUT"
    mock.currency = "USD"
    mock.min_price_increment = 2_500_000  # 0.0025 USD in fixed-point
    mock.display_factor = 1_000_000_000   # 1.0 in fixed-point
    mock.expiration = 0
    mock.ts_recv = SAMPLE_TS_EVENT_NS + 1_000
    return mock
