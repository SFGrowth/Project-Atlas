"""
Cross-Language Fidelity Evaluator (Python side)
Sprint 123A.7 Gate G7 — Seventh Withhold

Reads shared fidelity-fixtures.json and evaluates each fixture using the same
logic as canonical_strategy_backtests.py. Results are written to
fidelity-python-results.json for comparison with the TypeScript evaluator output.

Usage:
    python3 fidelity-evaluator.py [--fixtures path/to/fidelity-fixtures.json]
"""

import json
import math
import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone

# ============================================================
# CONSTANTS (must match canonical_strategy_backtests.py exactly)
# ============================================================

COMMISSION_PER_CONTRACT = 0.62
TICK_VALUE = 0.50
TICK_SIZE = 0.25
MAX_RISK_PER_TRADE = 450.0
ADX_THRESHOLD = 25.0
ATR_VOLATILE_MULT = 1.2

STOP_MULT = {"A1": 2.0, "A3": 2.0, "SB1": 1.5, "ORB-1": 1.8, "B1": 2.0}
TARGET_RR = {"A1": 2.0, "A3": 2.0, "SB1": 2.5, "ORB-1": 2.0, "B1": 1.5}
ADE_SCORE_SB1 = 50.0
ADE_SCORE_ORB1 = 45.0
ADE_SCORE_B1 = 1.0

# ============================================================
# ADE EVALUATION (from precomputed indicators)
# ============================================================

def evaluate_ade(ind: dict) -> tuple[str | None, str | None, float]:
    """
    Evaluate ADE selection from precomputed indicators.
    Returns (strategy_id, direction, ade_score) or (None, None, 0.0).
    """
    win_model = None
    win_long = None
    win_score = 0.0

    # A1
    a1_long = ind["is_trending"] and ind["is_rth"] and ind["di_plus"] > ind["di_minus"]
    a1_short = ind["is_trending"] and ind["is_rth"] and ind["di_minus"] > ind["di_plus"]
    a1_elig = a1_long or a1_short
    a1_score = ind["adx"]
    if a1_elig and a1_score > win_score:
        win_model = "A1"
        win_long = a1_long
        win_score = a1_score

    # A3 (5% haircut — can never beat A1 when both eligible)
    a3_long = ind["is_trending"] and ind["is_rth"] and ind["di_plus"] > ind["di_minus"]
    a3_short = ind["is_trending"] and ind["is_rth"] and ind["di_minus"] > ind["di_plus"]
    a3_elig = a3_long or a3_short
    a3_score = ind["adx"] * 0.95
    if a3_elig and a3_score > win_score:
        win_model = "A3"
        win_long = a3_long
        win_score = a3_score

    # SB1
    sb1_long = ind["is_trending"] and ind["is_am_mid"] and ind["ema9_slope"] > 0
    sb1_short = ind["is_trending"] and ind["is_am_mid"] and ind["ema9_slope"] < 0
    sb1_elig = sb1_long or sb1_short
    if sb1_elig and ADE_SCORE_SB1 > win_score:
        win_model = "SB1"
        win_long = sb1_long
        win_score = ADE_SCORE_SB1

    # ORB-1
    orb1_long = ind["is_volatile"] and ind["is_am_open"] and ind["is_rth"] and ind["ohlcv"]["close"] > ind["ohlcv"]["open"]
    orb1_short = ind["is_volatile"] and ind["is_am_open"] and ind["is_rth"] and ind["ohlcv"]["close"] < ind["ohlcv"]["open"]
    orb1_elig = orb1_long or orb1_short
    if orb1_elig and ADE_SCORE_ORB1 > win_score:
        win_model = "ORB-1"
        win_long = orb1_long
        win_score = ADE_SCORE_ORB1

    # B1 (fallback)
    b1_long = ind["is_rth"] and ind["ohlcv"]["close"] > ind["vwap"]
    b1_short = ind["is_rth"] and ind["ohlcv"]["close"] < ind["vwap"]
    b1_elig = b1_long or b1_short
    if b1_elig and ADE_SCORE_B1 > win_score:
        win_model = "B1"
        win_long = b1_long
        win_score = ADE_SCORE_B1

    if win_model is None:
        return None, None, 0.0

    direction = "LONG" if win_long else "SHORT"
    return win_model, direction, round(win_score, 4)


def compute_trade(strategy_id: str, direction: str, entry_price: float, atr: float) -> dict:
    """Compute trade parameters from strategy, direction, entry price, and ATR."""
    stop_mult = STOP_MULT[strategy_id]
    target_rr = TARGET_RR[strategy_id]
    stop_dist = atr * stop_mult
    target_dist = stop_dist * target_rr

    if direction == "LONG":
        stop_price = entry_price - stop_dist
        target_price = entry_price + target_dist
    else:
        stop_price = entry_price + stop_dist
        target_price = entry_price - target_dist

    ticks_risk = stop_dist / TICK_SIZE
    risk_per_con = ticks_risk * TICK_VALUE
    contracts = max(1, int(MAX_RISK_PER_TRADE / risk_per_con))

    gross_pnl = target_dist * (1 / TICK_SIZE) * TICK_VALUE * contracts
    commission = COMMISSION_PER_CONTRACT * 2 * contracts
    net_pnl = gross_pnl - commission

    return {
        "quantity": contracts,
        "stop_price": round(stop_price, 2),
        "target_price": round(target_price, 2),
        "stop_dist_pts": round(stop_dist, 4),
        "target_dist_pts": round(target_dist, 4),
        "gross_pnl_pts": round(target_dist, 4),
        "commission_dollars": round(commission, 2),
        "net_pnl_dollars": round(net_pnl, 2),
    }


def evaluate_fixture(fixture: dict) -> dict:
    """Evaluate a single fixture and return the result."""
    ind = dict(fixture["precomputed_indicators"])
    ind["ohlcv"] = fixture["ohlcv"]
    ind["vwap"] = ind["vwap"]

    strategy_id, direction, ade_score = evaluate_ade(ind)

    if strategy_id is None:
        return {
            "fixture_id": fixture["fixture_id"],
            "eligible": False,
            "strategy_id": None,
            "direction": None,
            "ade_score": 0.0,
            "entry_price": None,
            "quantity": 0,
            "stop_price": None,
            "target_price": None,
            "stop_dist_pts": None,
            "target_dist_pts": None,
            "gross_pnl_pts": None,
            "commission_dollars": None,
            "net_pnl_dollars": None,
            "evaluator": "python",
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }

    entry_price = fixture["ohlcv"]["close"]
    atr = ind["atr"]
    trade = compute_trade(strategy_id, direction, entry_price, atr)

    return {
        "fixture_id": fixture["fixture_id"],
        "eligible": True,
        "strategy_id": strategy_id,
        "direction": direction,
        "ade_score": ade_score,
        "entry_price": entry_price,
        "quantity": trade["quantity"],
        "stop_price": trade["stop_price"],
        "target_price": trade["target_price"],
        "stop_dist_pts": trade["stop_dist_pts"],
        "target_dist_pts": trade["target_dist_pts"],
        "gross_pnl_pts": trade["gross_pnl_pts"],
        "commission_dollars": trade["commission_dollars"],
        "net_pnl_dollars": trade["net_pnl_dollars"],
        "evaluator": "python",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


def compare_with_expected(result: dict, fixture: dict, tolerances: dict) -> dict:
    """Compare evaluator result with expected values. Returns comparison record."""
    expected = fixture["expected"]
    price_tol = tolerances.get("price_pts", 0.0)
    pnl_tol = tolerances.get("pnl_dollars", 0.01)

    fields_checked = []
    all_pass = True

    def check(field, actual, exp, tolerance=0.0):
        nonlocal all_pass
        if exp is None and actual is None:
            pass_ = True
        elif exp is None or actual is None:
            pass_ = False
        elif isinstance(exp, float) or isinstance(actual, float):
            pass_ = abs(float(actual) - float(exp)) <= tolerance
        else:
            pass_ = actual == exp
        if not pass_:
            all_pass = False
        fields_checked.append({
            "field": field,
            "expected": exp,
            "actual": actual,
            "tolerance": tolerance,
            "pass": pass_,
        })

    check("eligible", result["eligible"], expected["eligible"])
    check("strategy_id", result["strategy_id"], fixture.get("strategy_expected"))
    check("direction", result["direction"], expected.get("direction"))
    check("ade_score", result["ade_score"], expected.get("ade_score"), tolerance=0.001)
    check("entry_price", result["entry_price"], expected.get("entry_price"), tolerance=price_tol)
    check("quantity", result["quantity"], expected.get("quantity"))
    check("stop_price", result["stop_price"], expected.get("stop_price"), tolerance=price_tol)
    check("target_price", result["target_price"], expected.get("target_price"), tolerance=price_tol)
    check("stop_dist_pts", result["stop_dist_pts"], expected.get("stop_dist_pts"), tolerance=price_tol)
    check("target_dist_pts", result["target_dist_pts"], expected.get("target_dist_pts"), tolerance=price_tol)
    check("commission_dollars", result["commission_dollars"], expected.get("commission_dollars"), tolerance=pnl_tol)
    check("net_pnl_dollars", result["net_pnl_dollars"], expected.get("net_pnl_dollars"), tolerance=pnl_tol)

    return {
        "fixture_id": result["fixture_id"],
        "all_pass": all_pass,
        "fields": fields_checked,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", default=str(Path(__file__).parent / "fidelity-fixtures.json"))
    parser.add_argument("--output", default=str(Path(__file__).parent / "fidelity-python-results.json"))
    args = parser.parse_args()

    with open(args.fixtures) as f:
        fixtures_doc = json.load(f)

    tolerances = fixtures_doc.get("tolerances", {})
    fixtures = fixtures_doc["fixtures"]

    results = []
    comparisons = []
    all_pass = True

    for fixture in fixtures:
        result = evaluate_fixture(fixture)
        comparison = compare_with_expected(result, fixture, tolerances)
        results.append(result)
        comparisons.append(comparison)
        if not comparison["all_pass"]:
            all_pass = False

    output = {
        "evaluator": "python",
        "fixture_version": fixtures_doc["fixture_version"],
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "total_fixtures": len(fixtures),
        "all_pass": all_pass,
        "results": results,
        "comparisons": comparisons,
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    # Print summary
    passed = sum(1 for c in comparisons if c["all_pass"])
    failed = len(comparisons) - passed
    print(f"Python fidelity evaluator: {passed}/{len(comparisons)} fixtures PASS")
    if failed > 0:
        print(f"FAILURES:")
        for c in comparisons:
            if not c["all_pass"]:
                print(f"  {c['fixture_id']}:")
                for f in c["fields"]:
                    if not f["pass"]:
                        print(f"    {f['field']}: expected={f['expected']}, actual={f['actual']}")
    print(f"Results written to: {args.output}")

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
