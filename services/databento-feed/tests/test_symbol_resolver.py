"""
Atlas Databento Feed Adapter — Symbol Resolver Tests
Sprint 123A.2 — Fixture-based unit tests

Tests the SymbolResolver using fixtures only — no live Databento connection.
"""

import pytest
from symbol_resolver import SymbolResolver


@pytest.fixture
def resolver():
    return SymbolResolver()


@pytest.fixture
def populated_resolver():
    r = SymbolResolver()
    r.process_definition(
        instrument_id=12345,
        raw_symbol="MNQM5",
        asset="MNQ",
        expiration_ts_ns=1_750_000_000_000_000_000,
    )
    r.process_symbol_mapping(
        instrument_id=12345,
        stype_in_symbol="MNQ.v.0",
        stype_out_symbol="MNQM5",
    )
    return r


class TestSymbolResolverDefinition:
    def test_resolve_canonical_after_definition(self, resolver):
        resolver.process_definition(12345, "MNQM5", "MNQ", 0)
        assert resolver.resolve_canonical(12345) == "MNQ1!"

    def test_resolve_raw_after_definition(self, resolver):
        resolver.process_definition(12345, "MNQM5", "MNQ", 0)
        assert resolver.resolve_raw(12345) == "MNQM5"

    def test_unknown_instrument_returns_none(self, resolver):
        assert resolver.resolve_canonical(99999) is None
        assert resolver.resolve_raw(99999) is None

    def test_asset_to_canonical_mapping(self, resolver):
        """Atlas canonical aliases must match the expected mapping."""
        test_cases = [
            ("MNQ", "MNQ1!"),
            ("NQ", "NQ1!"),
            ("ES", "ES1!"),
            ("MES", "MES1!"),
        ]
        for asset, expected_canonical in test_cases:
            resolver.process_definition(1000 + len(asset), f"{asset}M5", asset, 0)
            assert resolver.resolve_canonical(1000 + len(asset)) == expected_canonical


class TestSymbolResolverMapping:
    def test_resolve_canonical_after_mapping(self, populated_resolver):
        assert populated_resolver.resolve_canonical(12345) == "MNQ1!"

    def test_is_ready_after_definition_and_mapping(self, populated_resolver):
        assert populated_resolver.is_ready() is True

    def test_is_not_ready_with_definition_only(self, resolver):
        resolver.process_definition(12345, "MNQM5", "MNQ", 0)
        # Definition alone does not set continuous_symbol
        assert resolver.is_ready() is False

    def test_mapping_without_prior_definition_creates_placeholder(self, resolver):
        resolver.process_symbol_mapping(12345, "MNQ.v.0", "MNQM5")
        entry = resolver.resolve_by_instrument_id(12345)
        assert entry is not None
        assert entry.canonical_symbol == "MNQ1!"

    def test_mapping_updates_continuous_symbol(self, populated_resolver):
        entry = populated_resolver.resolve_by_instrument_id(12345)
        assert entry is not None
        assert entry.continuous_symbol == "MNQ.v.0"


class TestSymbolResolverSnapshot:
    def test_snapshot_returns_list(self, populated_resolver):
        snap = populated_resolver.snapshot()
        assert isinstance(snap, list)
        assert len(snap) == 1

    def test_snapshot_contains_expected_fields(self, populated_resolver):
        snap = populated_resolver.snapshot()
        entry = snap[0]
        assert "instrument_id" in entry
        assert "raw_symbol" in entry
        assert "continuous_symbol" in entry
        assert "canonical_symbol" in entry
        assert "asset" in entry

    def test_snapshot_does_not_contain_api_key(self, populated_resolver):
        """SECURITY: Snapshot must never contain API key material."""
        snap = str(populated_resolver.snapshot())
        assert "api_key" not in snap.lower()
        assert "db-" not in snap.lower()


class TestSymbolResolverThreadSafety:
    def test_concurrent_definition_and_mapping(self, resolver):
        """Basic thread-safety: definition and mapping from different threads."""
        import threading

        def add_definition():
            for i in range(100):
                resolver.process_definition(i, f"SYM{i}", "MNQ", 0)

        def add_mapping():
            for i in range(100):
                resolver.process_symbol_mapping(i, f"MNQ.v.{i}", f"SYM{i}")

        t1 = threading.Thread(target=add_definition)
        t2 = threading.Thread(target=add_mapping)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # No assertion on order — just verify no crash and some entries exist
        assert len(resolver.snapshot()) > 0
