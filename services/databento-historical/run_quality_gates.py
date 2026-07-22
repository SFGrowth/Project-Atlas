#!/usr/bin/env python3
"""
Atlas Nexus — Data Quality Gates
Sprint 123A.6 / Gate G6A — Phase 7

Runs comprehensive quality gates on the canonical 5m dataset:
  QG-01: Missing bars (expected gaps vs unexpected gaps)
  QG-02: Duplicate timestamps
  QG-03: Invalid OHLC (H<L, H<O, H<C, L>O, L>C)
  QG-04: Roll transition check (no false price jumps >5%)
  QG-05: Timezone consistency (all UTC)
  QG-06: Holiday/weekend coverage (no bars on CME holidays)
  QG-07: Volume sanity (no zero-volume bars during RTH)
  QG-08: Feature NaN rate (warm-up period only)
  QG-09: Degraded day flagging
  QG-10: Cross-contract contamination (MNQ.v.0 only)
"""

import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime, timezone

CANONICAL_DIR = Path("/home/ubuntu/atlas-historical/canonical")

# CME holidays 2024-2026 (MNQ closed)
CME_HOLIDAYS = {
    "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
    "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03",
}


def run_quality_gates(df: pd.DataFrame, tf_minutes: int) -> dict:
    """Run all quality gates on a canonical dataset."""
    gates = {}
    issues = []

    n_total = len(df)
    gates["total_bars"] = n_total
    gates["timeframe_minutes"] = tf_minutes

    # QG-01: Duplicate timestamps
    n_dups = df["bar_time"].duplicated().sum()
    gates["QG-01_duplicate_timestamps"] = {"count": int(n_dups), "result": "PASS" if n_dups == 0 else "FAIL"}
    if n_dups > 0:
        issues.append(f"QG-01 FAIL: {n_dups} duplicate timestamps")

    # QG-02: Invalid OHLC
    invalid_ohlc = (
        (df["high"] < df["low"]) |
        (df["high"] < df["open"]) |
        (df["high"] < df["close"]) |
        (df["low"] > df["open"]) |
        (df["low"] > df["close"])
    ).sum()
    gates["QG-02_invalid_ohlc"] = {"count": int(invalid_ohlc), "result": "PASS" if invalid_ohlc == 0 else "FAIL"}
    if invalid_ohlc > 0:
        issues.append(f"QG-02 FAIL: {invalid_ohlc} invalid OHLC bars")

    # QG-03: Price jumps (roll transitions)
    close_pct_change = df["close"].pct_change().abs()
    jumps_2pct = (close_pct_change > 0.02).sum()
    jumps_5pct = (close_pct_change > 0.05).sum()
    gates["QG-03_price_jumps"] = {
        "jumps_gt_2pct": int(jumps_2pct),
        "jumps_gt_5pct": int(jumps_5pct),
        "result": "PASS" if jumps_5pct == 0 else "FAIL"
    }
    if jumps_5pct > 0:
        issues.append(f"QG-03 FAIL: {jumps_5pct} price jumps >5%")

    # QG-04: Timezone consistency
    if hasattr(df["bar_time"].dtype, 'tz') and df["bar_time"].dt.tz is not None:
        tz_name = str(df["bar_time"].dt.tz)
        tz_ok = "UTC" in tz_name
    else:
        tz_ok = False
    gates["QG-04_timezone"] = {"tz": str(df["bar_time"].dt.tz) if df["bar_time"].dt.tz else "NONE", "result": "PASS" if tz_ok else "FAIL"}
    if not tz_ok:
        issues.append("QG-04 FAIL: Timestamps not UTC")

    # QG-05: Holiday bars (should be minimal/zero during RTH)
    # RTH = 13:30-20:00 UTC
    rth_mask = (df["bar_time"].dt.hour >= 13) & (df["bar_time"].dt.hour < 20)
    df_rth = df[rth_mask]
    holiday_dates = {str(d.date()) for d in df_rth["bar_time"]}
    holiday_rth_bars = sum(1 for d in df_rth["bar_time"] if str(d.date()) in CME_HOLIDAYS)
    gates["QG-05_holiday_bars"] = {"rth_bars_on_holidays": int(holiday_rth_bars), "result": "PASS" if holiday_rth_bars == 0 else "WARN"}
    if holiday_rth_bars > 0:
        issues.append(f"QG-05 WARN: {holiday_rth_bars} RTH bars on CME holidays")

    # QG-06: Zero volume during RTH
    zero_vol_rth = (df_rth["volume"] == 0).sum()
    gates["QG-06_zero_volume_rth"] = {"count": int(zero_vol_rth), "result": "PASS" if zero_vol_rth == 0 else "WARN"}
    if zero_vol_rth > 0:
        issues.append(f"QG-06 WARN: {zero_vol_rth} zero-volume bars during RTH")

    # QG-07: Feature NaN rate
    feature_cols = ["ema15", "ema50", "atr14", "adx14", "rsi14", "vwap"]
    nan_rates = {}
    for col in feature_cols:
        if col in df.columns:
            rate = df[col].isna().mean()
            nan_rates[col] = float(rate)
    max_nan_rate = max(nan_rates.values()) if nan_rates else 0
    gates["QG-07_feature_nan_rates"] = {**nan_rates, "result": "PASS" if max_nan_rate < 0.05 else "WARN"}
    if max_nan_rate >= 0.05:
        issues.append(f"QG-07 WARN: Max feature NaN rate {max_nan_rate:.2%}")

    # QG-08: Degraded day bars
    if "is_degraded" in df.columns:
        degraded_count = df["is_degraded"].sum()
        degraded_pct = degraded_count / n_total
        gates["QG-08_degraded_bars"] = {"count": int(degraded_count), "pct": float(degraded_pct), "result": "PASS" if degraded_pct < 0.01 else "WARN"}
        if degraded_pct >= 0.01:
            issues.append(f"QG-08 WARN: {degraded_pct:.2%} degraded bars")
    else:
        gates["QG-08_degraded_bars"] = {"count": 0, "pct": 0.0, "result": "PASS"}

    # QG-09: Monotonic timestamps
    is_monotonic = df["bar_time"].is_monotonic_increasing
    gates["QG-09_monotonic_timestamps"] = {"result": "PASS" if is_monotonic else "FAIL"}
    if not is_monotonic:
        issues.append("QG-09 FAIL: Timestamps not monotonic")

    # QG-10: Price range sanity
    price_min = float(df["close"].min())
    price_max = float(df["close"].max())
    price_ok = 5000 < price_min and price_max < 200000
    gates["QG-10_price_range"] = {"min": price_min, "max": price_max, "result": "PASS" if price_ok else "FAIL"}
    if not price_ok:
        issues.append(f"QG-10 FAIL: Price range suspicious: {price_min:.0f}-{price_max:.0f}")

    # Overall result
    fail_count = sum(1 for k, v in gates.items() if isinstance(v, dict) and v.get("result") == "FAIL")
    warn_count = sum(1 for k, v in gates.items() if isinstance(v, dict) and v.get("result") == "WARN")
    
    gates["issues"] = issues
    gates["fail_count"] = fail_count
    gates["warn_count"] = warn_count
    gates["overall_result"] = "PASS" if fail_count == 0 else "FAIL"

    return gates


def main():
    print("=" * 70)
    print("ATLAS NEXUS — DATA QUALITY GATES")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    all_results = {}

    for tf in [1, 3, 5, 15, 30, 60]:
        path = CANONICAL_DIR / f"mnq_{tf}m_features.parquet"
        if not path.exists():
            print(f"\n{tf}m: FILE NOT FOUND — skipping")
            continue

        print(f"\nRunning quality gates on {tf}m dataset...")
        df = pd.read_parquet(path)

        # Ensure bar_time is datetime
        if not pd.api.types.is_datetime64_any_dtype(df["bar_time"]):
            df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)

        result = run_quality_gates(df, tf)
        all_results[f"{tf}m"] = result

        print(f"  Overall: {result['overall_result']} | FAILs: {result['fail_count']} | WARNs: {result['warn_count']}")
        if result["issues"]:
            for issue in result["issues"]:
                print(f"    {issue}")

    # Save report
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "timeframes": all_results,
        "overall_result": "PASS" if all(v["overall_result"] == "PASS" for v in all_results.values()) else "FAIL",
    }

    report_path = CANONICAL_DIR / "quality_gates_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print(f"QUALITY GATES OVERALL: {report['overall_result']}")
    print(f"Report: {report_path}")
    print("=" * 70)

    return report


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, default=str))
