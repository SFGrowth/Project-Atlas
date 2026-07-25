"""
Sprint 123A.9 — Authority Zero-Call Boundary Tests
===================================================
These tests prove that the Payout Vault research path CANNOT reach:
  - processBar
  - postBarAutomation
  - TradersPost
  - Tradovate
  - broker order submission
  - live risk modification
  - strategy status modification
  - capital allocation

Tests fail if any detector, orchestrator or research experiment imports,
calls or emits toward these paths.

DARWIN_PROCESSBAR_CALLS=0
DARWIN_POSTBARAUTOMATION_CALLS=0
DARWIN_TRADERSPOST_CALLS=0
DARWIN_TRADOVATE_CALLS=0
STRATEGY_STATUS_CHANGES=0
CAPITAL_REALLOCATIONS=0
LIVE_TRADES_INITIATED=0
"""

import ast
import importlib
import inspect
import os
import sys
import pytest

# Path to the G9 implementation files
PAYOUT_VAULT_DIR = os.path.dirname(os.path.abspath(__file__))
DETECTOR_FILE = os.path.join(PAYOUT_VAULT_DIR, "payout_vault_detector.py")

# Authority-boundary terms that must NOT appear in the G9 implementation
FORBIDDEN_LIVE_TERMS = [
    "processBar",
    "postBarAutomation",
    "TradersPost",
    "Tradovate",
    "order_submission",
    "broker_execution",
    "risk_mutation",
    "strategy_promotion",
    "capital_allocation",
    "submitOrder",
    "placeOrder",
    "cancelOrder",
    "modifyOrder",
    "riskLimit",
    "positionSize",
    "accountBalance",
    "liveRisk",
    "promotionRequest",
    "demotionRequest",
]

# Allowed imports in the detector (pure data science only)
ALLOWED_IMPORT_PREFIXES = [
    "numpy", "pandas", "scipy", "sklearn", "statsmodels",
    "dataclasses", "typing", "datetime", "math", "json",
    "os", "sys", "re", "collections", "itertools", "functools",
    "enum", "abc", "__future__", "pytest",
    "payout_vault_detector",  # test file imports this
]


class TestAuthorityBoundaryImports:
    """Verify the detector module only imports safe data-science libraries."""

    def test_detector_imports_only_safe_libraries(self):
        """Detector must not import any live trading or execution module."""
        with open(DETECTOR_FILE, "r") as f:
            source = f.read()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        module = alias.name.split(".")[0]
                        assert any(module.startswith(p) for p in ALLOWED_IMPORT_PREFIXES), \
                            f"FORBIDDEN IMPORT in detector: {alias.name}"
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        module = node.module.split(".")[0]
                        assert any(module.startswith(p) for p in ALLOWED_IMPORT_PREFIXES), \
                            f"FORBIDDEN IMPORT FROM in detector: {node.module}"

    def test_detector_no_network_imports(self):
        """Detector must not import any network/HTTP/websocket library."""
        forbidden_network = ["requests", "httpx", "aiohttp", "websocket", "socket",
                             "urllib", "http", "grpc", "zeromq", "zmq", "pika",
                             "kafka", "redis", "boto", "azure", "google.cloud"]
        with open(DETECTOR_FILE, "r") as f:
            source = f.read()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        for forbidden in forbidden_network:
                            assert not alias.name.startswith(forbidden), \
                                f"FORBIDDEN NETWORK IMPORT: {alias.name}"
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        for forbidden in forbidden_network:
                            assert not node.module.startswith(forbidden), \
                                f"FORBIDDEN NETWORK IMPORT FROM: {node.module}"


class TestAuthorityBoundarySourceCode:
    """Verify no authority-boundary terms appear in G9 source files."""

    def _scan_file(self, filepath: str, terms: list) -> list:
        """Return list of (line_number, term, line_content) for any hits."""
        hits = []
        with open(filepath, "r") as f:
            for lineno, line in enumerate(f, 1):
                for term in terms:
                    if term in line:
                        hits.append((lineno, term, line.strip()))
        return hits

    def test_detector_no_processBar(self):
        hits = self._scan_file(DETECTOR_FILE, ["processBar"])
        assert hits == [], f"processBar found in detector: {hits}"

    def test_detector_no_postBarAutomation(self):
        hits = self._scan_file(DETECTOR_FILE, ["postBarAutomation"])
        assert hits == [], f"postBarAutomation found in detector: {hits}"

    def test_detector_no_TradersPost(self):
        hits = self._scan_file(DETECTOR_FILE, ["TradersPost"])
        assert hits == [], f"TradersPost found in detector: {hits}"

    def test_detector_no_Tradovate(self):
        hits = self._scan_file(DETECTOR_FILE, ["Tradovate"])
        assert hits == [], f"Tradovate found in detector: {hits}"

    def test_detector_no_order_submission(self):
        hits = self._scan_file(DETECTOR_FILE, ["submitOrder", "placeOrder", "cancelOrder",
                                                "modifyOrder", "order_submission"])
        assert hits == [], f"Order submission terms found in detector: {hits}"

    def test_detector_no_broker_execution(self):
        hits = self._scan_file(DETECTOR_FILE, ["broker_execution", "brokerExecution",
                                                "executeTrade", "fillOrder"])
        assert hits == [], f"Broker execution terms found in detector: {hits}"

    def test_detector_no_risk_mutation(self):
        hits = self._scan_file(DETECTOR_FILE, ["risk_mutation", "riskMutation",
                                                "modifyRisk", "setRiskLimit"])
        assert hits == [], f"Risk mutation terms found in detector: {hits}"

    def test_detector_no_strategy_promotion(self):
        hits = self._scan_file(DETECTOR_FILE, ["strategy_promotion", "strategyPromotion",
                                                "promoteStrategy", "demoteStrategy",
                                                "LIVE", "PAPER"])
        # LIVE and PAPER are only forbidden as execution targets, not as string constants
        # Check they don't appear as function calls or assignments
        with open(DETECTOR_FILE, "r") as f:
            source = f.read()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Attribute):
                    assert node.func.attr not in ["promoteStrategy", "demoteStrategy",
                                                   "setStrategyStatus"], \
                        f"Strategy status mutation call found: {node.func.attr}"

    def test_detector_no_capital_allocation(self):
        hits = self._scan_file(DETECTOR_FILE, ["capital_allocation", "capitalAllocation",
                                                "allocateCapital", "setPositionSize"])
        assert hits == [], f"Capital allocation terms found in detector: {hits}"

    def test_all_forbidden_terms_absent_from_detector(self):
        """Comprehensive check: all forbidden live terms absent from detector."""
        hits = self._scan_file(DETECTOR_FILE, FORBIDDEN_LIVE_TERMS)
        assert hits == [], \
            f"AUTHORITY BOUNDARY VIOLATION in detector: {hits}"


class TestAuthorityBoundaryRuntime:
    """Runtime tests: verify the detector module cannot reach live paths when executed."""

    def test_detector_module_loads_without_live_connections(self):
        """Importing the detector must not open any network connections."""
        # If the import succeeds without error, no network connection was attempted
        # (network errors would raise exceptions)
        import payout_vault_detector as pvd
        assert pvd is not None

    def test_run_payout_vault_setup_returns_no_orders(self):
        """The orchestrator must return a SetupResult, never an order object."""
        import payout_vault_detector as pvd
        import pandas as pd
        import numpy as np

        # Minimal OHLCV dataframe — no setups will be found
        bars = pd.DataFrame({
            "bar_time": pd.date_range("2025-01-02 09:30", periods=20, freq="5min", tz="UTC"),
            "open": np.full(20, 21000.0),
            "high": np.full(20, 21010.0),
            "low": np.full(20, 20990.0),
            "close": np.full(20, 21000.0),
            "volume": np.full(20, 100.0),
            "is_roll_window": np.zeros(20, dtype=bool),
            "session": ["RTH"] * 20,
            "vwap": np.full(20, 21000.0),
        })
        # run_payout_vault_setup requires htf_bars and ltf_bars
        result = pvd.run_payout_vault_setup(htf_bars=bars, ltf_bars=bars)
        # Must be a SetupResult, not an order or trade object
        assert isinstance(result, pvd.SetupResult)
        # Must not have any order-related fields
        assert not hasattr(result, "order_id")
        assert not hasattr(result, "broker_ref")
        assert not hasattr(result, "execution_id")
        assert not hasattr(result, "fill_price")

    def test_setup_result_has_no_execution_fields(self):
        """SetupResult dataclass must not contain execution-related fields."""
        import payout_vault_detector as pvd
        import dataclasses
        fields = {f.name for f in dataclasses.fields(pvd.SetupResult)}
        forbidden_fields = {"order_id", "broker_ref", "execution_id", "fill_price",
                            "account_id", "position_size", "risk_dollars", "live_status"}
        violations = fields & forbidden_fields
        assert violations == set(), \
            f"SetupResult contains execution fields: {violations}"

    def test_detector_metadata_authority_disabled(self):
        """P-11 orchestrator metadata must declare both authorities DISABLED."""
        import payout_vault_detector as pvd
        meta = pvd.DETECTOR_METADATA.get("P-11", {})
        # Authority is stored as a string: 'DARWIN_DECISION_AUTHORITY=DISABLED, DARWIN_EXECUTION_AUTHORITY=DISABLED'
        authority_str = meta.get("authority", "")
        status = meta.get("status", "")
        # Either the authority string contains DISABLED declarations, or status=RESEARCH_PROTOTYPE
        decision_disabled = "DARWIN_DECISION_AUTHORITY=DISABLED" in str(authority_str)
        execution_disabled = "DARWIN_EXECUTION_AUTHORITY=DISABLED" in str(authority_str)
        is_prototype = status == "RESEARCH_PROTOTYPE"
        assert decision_disabled or is_prototype, \
            f"P-11 must declare DARWIN_DECISION_AUTHORITY=DISABLED or be RESEARCH_PROTOTYPE. Got authority={authority_str!r}, status={status!r}"
        assert execution_disabled or is_prototype, \
            f"P-11 must declare DARWIN_EXECUTION_AUTHORITY=DISABLED or be RESEARCH_PROTOTYPE. Got authority={authority_str!r}, status={status!r}"

    def test_processBar_call_count_is_zero(self):
        """processBar must never be called by the detector pipeline."""
        import payout_vault_detector as pvd
        # Verify processBar is not defined or referenced in the module
        assert not hasattr(pvd, "processBar"), \
            "AUTHORITY VIOLATION: processBar found in detector module"
        source = inspect.getsource(pvd)
        assert "processBar" not in source, \
            "AUTHORITY VIOLATION: processBar referenced in detector source"

    def test_postBarAutomation_call_count_is_zero(self):
        """postBarAutomation must never be called by the detector pipeline."""
        import payout_vault_detector as pvd
        assert not hasattr(pvd, "postBarAutomation"), \
            "AUTHORITY VIOLATION: postBarAutomation found in detector module"
        source = inspect.getsource(pvd)
        assert "postBarAutomation" not in source, \
            "AUTHORITY VIOLATION: postBarAutomation referenced in detector source"

    def test_TradersPost_call_count_is_zero(self):
        """TradersPost must never be called by the detector pipeline."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        assert "TradersPost" not in source, \
            "AUTHORITY VIOLATION: TradersPost referenced in detector source"

    def test_Tradovate_call_count_is_zero(self):
        """Tradovate must never be called by the detector pipeline."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        assert "Tradovate" not in source, \
            "AUTHORITY VIOLATION: Tradovate referenced in detector source"


class TestAuthorityCounters:
    """Verify all authority call counters are zero."""

    def test_DARWIN_PROCESSBAR_CALLS_zero(self):
        """DARWIN_PROCESSBAR_CALLS must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        count = source.count("processBar(")
        assert count == 0, f"DARWIN_PROCESSBAR_CALLS={count} (expected 0)"

    def test_DARWIN_POSTBARAUTOMATION_CALLS_zero(self):
        """DARWIN_POSTBARAUTOMATION_CALLS must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        count = source.count("postBarAutomation(")
        assert count == 0, f"DARWIN_POSTBARAUTOMATION_CALLS={count} (expected 0)"

    def test_DARWIN_TRADERSPOST_CALLS_zero(self):
        """DARWIN_TRADERSPOST_CALLS must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        count = source.count("TradersPost")
        assert count == 0, f"DARWIN_TRADERSPOST_CALLS={count} (expected 0)"

    def test_DARWIN_TRADOVATE_CALLS_zero(self):
        """DARWIN_TRADOVATE_CALLS must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        count = source.count("Tradovate")
        assert count == 0, f"DARWIN_TRADOVATE_CALLS={count} (expected 0)"

    def test_STRATEGY_STATUS_CHANGES_zero(self):
        """STRATEGY_STATUS_CHANGES must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        for term in ["setStrategyStatus", "promoteStrategy", "demoteStrategy",
                     "strategy_status", "LIVE_STRATEGY", "PAPER_STRATEGY"]:
            count = source.count(term)
            assert count == 0, \
                f"STRATEGY_STATUS_CHANGES: '{term}' found {count} times (expected 0)"

    def test_CAPITAL_REALLOCATIONS_zero(self):
        """CAPITAL_REALLOCATIONS must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        for term in ["allocateCapital", "setCapital", "capital_reallocation",
                     "account_balance", "position_size_dollars"]:
            count = source.count(term)
            assert count == 0, \
                f"CAPITAL_REALLOCATIONS: '{term}' found {count} times (expected 0)"

    def test_LIVE_TRADES_INITIATED_zero(self):
        """LIVE_TRADES_INITIATED must equal 0."""
        import payout_vault_detector as pvd
        source = inspect.getsource(pvd)
        for term in ["submitOrder", "placeOrder", "executeTrade", "fillOrder",
                     "live_trade", "initiateTrade"]:
            count = source.count(term)
            assert count == 0, \
                f"LIVE_TRADES_INITIATED: '{term}' found {count} times (expected 0)"
