"""
Cross-Language Fidelity Comparison
Sprint 123A.7 Gate G7 — Seventh Withhold

Runs both the Python and TypeScript evaluators against the shared fixtures,
then compares their outputs field-by-field. Any divergence between the two
evaluators is a fidelity failure, regardless of whether either matches the
expected values.

Usage:
    python3 fidelity-cross-compare.py [--fixtures path] [--output path]
"""

import json
import subprocess
import sys
import os
import argparse
from pathlib import Path
from datetime import datetime, timezone


def run_python_evaluator(fixtures_path: str, output_path: str) -> dict:
    """Run the Python fidelity evaluator and return results."""
    script = Path(__file__).parent / "fidelity-evaluator.py"
    result = subprocess.run(
        [sys.executable, str(script), "--fixtures", fixtures_path, "--output", output_path],
        capture_output=True, text=True
    )
    print("=== Python Evaluator ===")
    print(result.stdout)
    if result.returncode != 0:
        print(f"STDERR: {result.stderr}")
    with open(output_path) as f:
        return json.load(f)


def run_ts_evaluator(fixtures_path: str, output_path: str) -> dict:
    """Run the TypeScript fidelity evaluator and return results."""
    script = Path(__file__).parent / "fidelity-evaluator.ts"
    # Find tsx
    tsx = None
    for candidate in [
        "/home/ubuntu/.nvm/versions/node/v22.13.0/bin/tsx",
        "/usr/local/bin/tsx",
        "tsx",
    ]:
        try:
            r = subprocess.run(["which", candidate] if "/" not in candidate else ["test", "-f", candidate],
                               capture_output=True)
            if r.returncode == 0:
                tsx = candidate
                break
        except Exception:
            pass
    if tsx is None:
        # Try npx tsx
        tsx_cmd = ["npx", "tsx"]
    else:
        tsx_cmd = [tsx]

    result = subprocess.run(
        tsx_cmd + [str(script), "--fixtures", fixtures_path, "--output", output_path],
        capture_output=True, text=True,
        cwd=str(Path(__file__).parent.parent.parent.parent)  # atlas-nexus root
    )
    print("=== TypeScript Evaluator ===")
    print(result.stdout)
    if result.returncode != 0:
        print(f"STDERR: {result.stderr}")
    with open(output_path) as f:
        return json.load(f)


def compare_results(py_results: dict, ts_results: dict, tolerances: dict) -> dict:
    """Compare Python and TypeScript evaluator outputs field-by-field."""
    pnl_tol = tolerances.get("pnl_dollars", 0.01)
    price_tol = tolerances.get("price_pts", 0.0)

    py_by_id = {r["fixture_id"]: r for r in py_results["results"]}
    ts_by_id = {r["fixture_id"]: r for r in ts_results["results"]}

    all_fixture_ids = sorted(set(py_by_id.keys()) | set(ts_by_id.keys()))

    comparisons = []
    all_match = True

    numeric_fields_pnl = {"commission_dollars", "net_pnl_dollars"}
    numeric_fields_price = {"entry_price", "stop_price", "target_price", "stop_dist_pts",
                            "target_dist_pts", "gross_pnl_pts"}
    numeric_fields_score = {"ade_score"}
    string_fields = {"strategy_id", "direction"}
    bool_fields = {"eligible"}
    int_fields = {"quantity"}

    for fid in all_fixture_ids:
        py = py_by_id.get(fid)
        ts = ts_by_id.get(fid)

        if py is None or ts is None:
            comparisons.append({
                "fixture_id": fid,
                "match": False,
                "error": f"Missing in {'python' if py is None else 'typescript'} results",
                "fields": [],
            })
            all_match = False
            continue

        fields = []
        fixture_match = True

        def check_field(field, tol=0.0):
            nonlocal fixture_match
            pv = py.get(field)
            tv = ts.get(field)
            if pv is None and tv is None:
                match = True
            elif pv is None or tv is None:
                match = False
            elif tol > 0:
                match = abs(float(pv) - float(tv)) <= tol
            else:
                match = pv == tv
            if not match:
                nonlocal all_match
                all_match = False
                fixture_match = False
            fields.append({"field": field, "python": pv, "typescript": tv, "tolerance": tol, "match": match})

        for f in bool_fields:
            check_field(f)
        for f in string_fields:
            check_field(f)
        for f in int_fields:
            check_field(f)
        for f in numeric_fields_price:
            check_field(f, price_tol)
        for f in numeric_fields_pnl:
            check_field(f, pnl_tol)
        for f in numeric_fields_score:
            check_field(f, 0.001)

        comparisons.append({
            "fixture_id": fid,
            "match": fixture_match,
            "fields": fields,
        })

    return {
        "cross_language_match": all_match,
        "total_fixtures": len(all_fixture_ids),
        "matched": sum(1 for c in comparisons if c["match"]),
        "failed": sum(1 for c in comparisons if not c["match"]),
        "comparisons": comparisons,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", default=str(Path(__file__).parent / "fidelity-fixtures.json"))
    parser.add_argument("--output", default=str(Path(__file__).parent / "fidelity-cross-compare-results.json"))
    args = parser.parse_args()

    with open(args.fixtures) as f:
        fixtures_doc = json.load(f)
    tolerances = fixtures_doc.get("tolerances", {})

    py_output = str(Path(args.output).parent / "fidelity-python-results.json")
    ts_output = str(Path(args.output).parent / "fidelity-ts-results.json")

    py_results = run_python_evaluator(args.fixtures, py_output)
    ts_results = run_ts_evaluator(args.fixtures, ts_output)

    comparison = compare_results(py_results, ts_results, tolerances)

    output = {
        "cross_language_fidelity": "EXACT" if comparison["cross_language_match"] else "DIVERGENT",
        "fixture_version": fixtures_doc["fixture_version"],
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "python_all_pass": py_results["all_pass"],
        "typescript_all_pass": ts_results["all_pass"],
        "cross_language_match": comparison["cross_language_match"],
        "total_fixtures": comparison["total_fixtures"],
        "matched": comparison["matched"],
        "failed": comparison["failed"],
        "comparisons": comparison["comparisons"],
    }

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print("\n=== Cross-Language Fidelity Summary ===")
    print(f"Python:     {'PASS' if py_results['all_pass'] else 'FAIL'} ({py_results['total_fixtures']} fixtures)")
    print(f"TypeScript: {'PASS' if ts_results['all_pass'] else 'FAIL'} ({ts_results['total_fixtures']} fixtures)")
    print(f"Cross-match: {comparison['matched']}/{comparison['total_fixtures']} fixtures match between evaluators")
    print(f"CROSS_LANGUAGE_FIDELITY = {'EXACT' if comparison['cross_language_match'] else 'DIVERGENT'}")
    print(f"Results written to: {args.output}")

    if not comparison["cross_language_match"]:
        print("\nDIVERGENCES:")
        for c in comparison["comparisons"]:
            if not c["match"]:
                print(f"  {c['fixture_id']}:")
                for f in c["fields"]:
                    if not f["match"]:
                        print(f"    {f['field']}: python={f['python']}, typescript={f['typescript']}")

    return 0 if comparison["cross_language_match"] else 1


if __name__ == "__main__":
    sys.exit(main())
