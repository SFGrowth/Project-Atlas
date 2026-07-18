"""
Atlas Databento Feed Adapter — Symbol Resolver
Sprint 123A.2 — Databento Adapter and Private Bridge

Resolves Databento instrument_id and raw contract symbols to Atlas canonical
symbols (e.g. "MNQ1!"). The resolver is populated from definition and
symbol-mapping records received from the live feed.

IMPORTANT: The canonical symbol "MNQ1!" is an Atlas convention.
Databento uses continuous symbols like "MNQ.v.0" (front-month roll).
The actual raw contract symbol (e.g. "MNQM5") is resolved dynamically.
MNQ1! is NOT assumed to be a valid Databento symbol — it is an Atlas alias.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from threading import Lock
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SymbolEntry:
    """A resolved symbol mapping entry."""
    instrument_id: int
    raw_symbol: str           # e.g. "MNQM5" (exchange contract)
    continuous_symbol: str    # e.g. "MNQ.v.0" (Databento continuous)
    canonical_symbol: str     # e.g. "MNQ1!" (Atlas canonical alias)
    asset: str                # e.g. "MNQ"
    expiration_ts_ns: int     # 0 = no expiry


class SymbolResolver:
    """
    Thread-safe symbol resolver for the Databento feed adapter.

    Populated from:
    - definition records (instrument_id → raw_symbol, asset, expiry)
    - symbol-mapping records (continuous_symbol → raw_symbol)

    The Atlas canonical symbol is derived from the asset name:
    - "MNQ" → "MNQ1!" (front-month continuous alias)
    """

    # Atlas canonical alias map: asset → Atlas canonical symbol
    ASSET_TO_CANONICAL: dict[str, str] = {
        "MNQ": "MNQ1!",
        "NQ": "NQ1!",
        "ES": "ES1!",
        "MES": "MES1!",
    }

    def __init__(self) -> None:
        self._lock = Lock()
        # instrument_id → SymbolEntry
        self._by_instrument_id: dict[int, SymbolEntry] = {}
        # raw_symbol → SymbolEntry
        self._by_raw_symbol: dict[str, SymbolEntry] = {}
        # continuous_symbol → raw_symbol (from symbol-mapping records)
        self._continuous_to_raw: dict[str, str] = {}

    def process_definition(
        self,
        instrument_id: int,
        raw_symbol: str,
        asset: str,
        expiration_ts_ns: int,
    ) -> None:
        """Register an instrument definition record."""
        canonical = self.ASSET_TO_CANONICAL.get(asset, f"{asset}1!")
        # The continuous symbol is not known from definition alone;
        # it will be set when a symbol-mapping record arrives.
        entry = SymbolEntry(
            instrument_id=instrument_id,
            raw_symbol=raw_symbol,
            continuous_symbol="",
            canonical_symbol=canonical,
            asset=asset,
            expiration_ts_ns=expiration_ts_ns,
        )
        with self._lock:
            self._by_instrument_id[instrument_id] = entry
            self._by_raw_symbol[raw_symbol] = entry
        logger.debug(
            "[SymbolResolver] Registered definition: instrument_id=%d raw=%s canonical=%s",
            instrument_id, raw_symbol, canonical,
        )

    def process_symbol_mapping(
        self,
        instrument_id: int,
        stype_in_symbol: str,   # continuous symbol, e.g. "MNQ.v.0"
        stype_out_symbol: str,  # raw contract symbol, e.g. "MNQM5"
    ) -> None:
        """Register a symbol-mapping record."""
        with self._lock:
            self._continuous_to_raw[stype_in_symbol] = stype_out_symbol
            # Update the continuous_symbol field on the matching entry
            entry = (
                self._by_instrument_id.get(instrument_id)
                or self._by_raw_symbol.get(stype_out_symbol)
            )
            if entry is not None:
                entry.continuous_symbol = stype_in_symbol
            else:
                # Entry not yet registered from definition — create a placeholder
                asset = stype_in_symbol.split(".")[0] if "." in stype_in_symbol else stype_in_symbol
                canonical = self.ASSET_TO_CANONICAL.get(asset, f"{asset}1!")
                entry = SymbolEntry(
                    instrument_id=instrument_id,
                    raw_symbol=stype_out_symbol,
                    continuous_symbol=stype_in_symbol,
                    canonical_symbol=canonical,
                    asset=asset,
                    expiration_ts_ns=0,
                )
                self._by_instrument_id[instrument_id] = entry
                self._by_raw_symbol[stype_out_symbol] = entry
        logger.debug(
            "[SymbolResolver] Symbol mapping: %s → %s (instrument_id=%d)",
            stype_in_symbol, stype_out_symbol, instrument_id,
        )

    def resolve_by_instrument_id(self, instrument_id: int) -> Optional[SymbolEntry]:
        """Resolve an instrument_id to a SymbolEntry. Returns None if not yet known."""
        with self._lock:
            return self._by_instrument_id.get(instrument_id)

    def resolve_canonical(self, instrument_id: int) -> Optional[str]:
        """Return the Atlas canonical symbol for an instrument_id."""
        entry = self.resolve_by_instrument_id(instrument_id)
        return entry.canonical_symbol if entry else None

    def resolve_raw(self, instrument_id: int) -> Optional[str]:
        """Return the raw contract symbol for an instrument_id."""
        entry = self.resolve_by_instrument_id(instrument_id)
        return entry.raw_symbol if entry else None

    def is_ready(self) -> bool:
        """True if at least one symbol has been fully resolved (definition + mapping)."""
        with self._lock:
            return any(
                e.continuous_symbol != "" for e in self._by_instrument_id.values()
            )

    def snapshot(self) -> list[dict]:
        """Return a snapshot of all resolved symbols for diagnostics."""
        with self._lock:
            return [
                {
                    "instrument_id": e.instrument_id,
                    "raw_symbol": e.raw_symbol,
                    "continuous_symbol": e.continuous_symbol,
                    "canonical_symbol": e.canonical_symbol,
                    "asset": e.asset,
                }
                for e in self._by_instrument_id.values()
            ]
