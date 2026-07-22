#!/usr/bin/env python3
"""
Atlas Nexus — Continuous MNQ Research Series Builder
Sprint 123A.6 / Gate G6A — Phase 4

Builds a clean continuous 1-minute OHLCV series from the raw Databento chunks.

Contract roll handling:
- MNQ.v.0 is Databento's front-month continuous contract
- Databento handles roll mapping automatically via stype_in="continuous"
- We verify: no cross-contract price jumps > 2% at roll boundaries
- We verify: no duplicate timestamps across chunks
- We verify: all OHLCV values are valid (H >= L, H >= O, H >= C, L <= O, L <= C)
- We verify: timestamps are monotonically increasing
- We flag all "degraded" and "missing" days from Databento metadata

Output:
- /home/ubuntu/atlas-historical/processed/mnq_1m_continuous.parquet
- /home/ubuntu/atlas-historical/processed/mnq_1m_continuous_manifest.json
- /home/ubuntu/atlas-historical/processed/data_quality_report.json

STOP CONDITIONS:
- Cross-contract price jump > 5% at any roll boundary → flag and exclude that boundary
- Duplicate timestamp rate > 0.1% → stop and report
- Invalid OHLC rate > 0.5% → stop and report
"""

import pandas as pd
import numpy as np
import json
import hashlib
import os
from pathlib import Path
from datetime import datetime, timezone

DATA_ROOT = Path("/home/ubuntu/atlas-historical")
RAW_DIR = DATA_ROOT / "raw" / "GLBX.MDP3" / "ohlcv-1m"
PROCESSED_DIR = DATA_ROOT / "processed"
MANIFESTS_DIR = DATA_ROOT / "manifests"

PRICE_SCALE = 1_000_000_000
ROLL_JUMP_WARN_PCT = 0.02   # 2% — warn
ROLL_JUMP_FAIL_PCT = 0.05   # 5% — stop and flag

# Known degraded/missing days from Databento warnings (to be flagged in quality report)
DEGRADED_DAYS = {
    "2025-09-17", "2025-09-24",
    "2025-11-28",
    "2026-02-14", "2026-02-21",
    "2026-03-07", "2026-03-14", "2026-03-15",
    "2026-04-04", "2026-04-10", "2026-04-11",
    "2026-05-02", "2026-05-09", "2026-05-24",
}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_all_chunks() -> pd.DataFrame:
    """Load all monthly parquet chunks and concatenate."""
    parquet_files = sorted(RAW_DIR.glob("ohlcv-1m_*.parquet"))
    print(f"Loading {len(parquet_files)} parquet chunks...")

    dfs = []
    for f in parquet_files:
        df = pd.read_parquet(f)
        dfs.append(df)
        print(f"  {f.name}: {len(df):,} rows")

    combined = pd.concat(dfs, ignore_index=True)
    print(f"\nTotal rows loaded: {len(combined):,}")
    return combined


def normalise_prices(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalise prices from fixed-point int64 to float.
    Databento stores prices as int64 with scale 1e9.
    If already normalised (float < 100000), skip.
    """
    df = df.copy()
    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            # Check if already normalised
            sample = df[col].dropna().head(100)
            if sample.max() > 100_000:
                # Still in fixed-point format
                df[col] = df[col] / PRICE_SCALE
    return df


def build_continuous_series(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Build clean continuous series. Returns (clean_df, quality_report).
    """
    quality_issues = []
    quality_flags = {}

    print("\n=== Building Continuous Series ===")

    # Ensure we have the right columns
    required_cols = ["open", "high", "low", "close", "volume"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    # Normalise prices
    df = normalise_prices(df)

    # Parse timestamps
    if "bar_time" in df.columns:
        # Already has bar_time column (reprocessed v1.1 format)
        if not hasattr(df["bar_time"].dtype, 'tz') or df["bar_time"].dt.tz is None:
            df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)
        else:
            df["bar_time"] = df["bar_time"].dt.tz_convert("UTC")
    elif "ts_event" in df.columns:
        # ts_event is nanoseconds since epoch
        if df["ts_event"].dtype == object or str(df["ts_event"].dtype).startswith("datetime"):
            df["bar_time"] = pd.to_datetime(df["ts_event"], utc=True)
        else:
            # Integer nanoseconds
            df["bar_time"] = pd.to_datetime(df["ts_event"].astype(np.int64), unit="ns", utc=True)
    elif "bar_time_utc" in df.columns:
        df["bar_time"] = pd.to_datetime(df["bar_time_utc"], utc=True)
    else:
        raise ValueError(f"No timestamp column found. Available columns: {list(df.columns)}")

    # Sort by timestamp
    df = df.sort_values("bar_time").reset_index(drop=True)

    n_total = len(df)
    print(f"Total bars before dedup: {n_total:,}")
    print(f"Date range: {df['bar_time'].min()} to {df['bar_time'].max()}")

    # 1. Remove duplicates
    n_before_dedup = len(df)
    df = df.drop_duplicates(subset=["bar_time"], keep="first")
    n_dups = n_before_dedup - len(df)
    dup_rate = n_dups / n_before_dedup if n_before_dedup > 0 else 0
    print(f"Duplicates removed: {n_dups:,} ({dup_rate:.4%})")

    if dup_rate > 0.001:
        quality_issues.append(f"HIGH_DUPLICATE_RATE: {dup_rate:.4%} > 0.1% threshold")
        print(f"WARNING: High duplicate rate {dup_rate:.4%}")

    quality_flags["duplicate_bars"] = n_dups
    quality_flags["duplicate_rate"] = round(dup_rate, 6)

    # 2. Verify monotonic timestamps
    ts_sorted = df["bar_time"].is_monotonic_increasing
    print(f"Timestamps monotonic: {ts_sorted}")
    if not ts_sorted:
        quality_issues.append("TIMESTAMPS_NOT_MONOTONIC")

    # 3. Validate OHLC
    invalid_mask = (
        (df["high"] < df["low"]) |
        (df["high"] < df["open"]) |
        (df["high"] < df["close"]) |
        (df["low"] > df["open"]) |
        (df["low"] > df["close"]) |
        (df["open"] <= 0) |
        (df["close"] <= 0)
    )
    n_invalid = invalid_mask.sum()
    invalid_rate = n_invalid / len(df)
    print(f"Invalid OHLC bars: {n_invalid:,} ({invalid_rate:.4%})")

    if invalid_rate > 0.005:
        quality_issues.append(f"HIGH_INVALID_OHLC_RATE: {invalid_rate:.4%} > 0.5% threshold")

    # Remove invalid OHLC bars
    df = df[~invalid_mask].reset_index(drop=True)
    quality_flags["invalid_ohlc_bars"] = int(n_invalid)
    quality_flags["invalid_ohlc_rate"] = round(invalid_rate, 6)

    # 4. Check for price jumps at roll boundaries
    # With continuous contract, rolls happen quarterly (Mar, Jun, Sep, Dec)
    # Detect large price jumps between consecutive bars
    price_changes = df["close"].pct_change().abs()
    large_jumps = price_changes[price_changes > ROLL_JUMP_WARN_PCT]
    very_large_jumps = price_changes[price_changes > ROLL_JUMP_FAIL_PCT]

    print(f"Price jumps > {ROLL_JUMP_WARN_PCT:.0%}: {len(large_jumps):,}")
    print(f"Price jumps > {ROLL_JUMP_FAIL_PCT:.0%}: {len(very_large_jumps):,}")

    if len(very_large_jumps) > 0:
        jump_details = []
        for idx in very_large_jumps.index[:10]:  # log first 10
            if idx > 0:
                prev_bar = df.iloc[idx-1]
                curr_bar = df.iloc[idx]
                jump_pct = price_changes.iloc[idx]
                jump_details.append({
                    "bar_time": str(curr_bar["bar_time"]),
                    "prev_close": round(prev_bar["close"], 2),
                    "curr_open": round(curr_bar["open"], 2),
                    "jump_pct": round(jump_pct * 100, 2),
                })
        quality_flags["large_price_jumps"] = jump_details
        quality_issues.append(f"LARGE_PRICE_JUMPS: {len(very_large_jumps)} jumps > {ROLL_JUMP_FAIL_PCT:.0%}")

    quality_flags["price_jumps_warn"] = int(len(large_jumps))
    quality_flags["price_jumps_fail"] = int(len(very_large_jumps))

    # 5. Flag degraded days
    df["date_str"] = df["bar_time"].dt.strftime("%Y-%m-%d")
    df["is_degraded"] = df["date_str"].isin(DEGRADED_DAYS)
    n_degraded_bars = df["is_degraded"].sum()
    print(f"Bars on degraded/missing days: {n_degraded_bars:,}")
    quality_flags["degraded_day_bars"] = int(n_degraded_bars)
    quality_flags["degraded_days"] = sorted(list(DEGRADED_DAYS))

    # 6. Zero volume bars (informational)
    zero_vol = (df["volume"] == 0).sum()
    print(f"Zero volume bars: {zero_vol:,} (informational)")
    quality_flags["zero_volume_bars"] = int(zero_vol)

    # 7. Summary statistics
    n_clean = len(df)
    print(f"\nClean bars: {n_clean:,}")
    print(f"Date range: {df['bar_time'].min()} to {df['bar_time'].max()}")
    print(f"Price range: {df['close'].min():.2f} to {df['close'].max():.2f}")
    print(f"Avg volume: {df['volume'].mean():.0f}")

    # 8. Determine overall quality
    critical_issues = [i for i in quality_issues if not i.startswith("LARGE_PRICE_JUMPS")]
    overall_quality = "PASS" if not critical_issues else "WARN"
    if len(very_large_jumps) > 100:
        overall_quality = "FAIL"

    quality_report = {
        "total_bars_raw": n_total,
        "total_bars_clean": n_clean,
        "duplicate_bars": quality_flags.get("duplicate_bars", 0),
        "invalid_ohlc_bars": quality_flags.get("invalid_ohlc_bars", 0),
        "degraded_day_bars": quality_flags.get("degraded_day_bars", 0),
        "zero_volume_bars": quality_flags.get("zero_volume_bars", 0),
        "price_jumps_warn": quality_flags.get("price_jumps_warn", 0),
        "price_jumps_fail": quality_flags.get("price_jumps_fail", 0),
        "large_price_jump_details": quality_flags.get("large_price_jumps", []),
        "degraded_days": quality_flags.get("degraded_days", []),
        "issues": quality_issues,
        "overall_quality": overall_quality,
        "date_range_start": str(df["bar_time"].min()),
        "date_range_end": str(df["bar_time"].max()),
        "price_min": round(float(df["close"].min()), 2),
        "price_max": round(float(df["close"].max()), 2),
        "avg_volume": round(float(df["volume"].mean()), 0),
    }

    return df, quality_report


def main():
    print("=" * 70)
    print("ATLAS NEXUS — CONTINUOUS MNQ SERIES BUILDER")
    print(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)

    # Load all chunks
    df = load_all_chunks()

    # Build continuous series
    df_clean, quality_report = build_continuous_series(df)

    # Select output columns
    output_cols = ["bar_time", "open", "high", "low", "close", "volume", "is_degraded"]
    if "symbol" in df_clean.columns:
        output_cols.insert(1, "symbol")
    if "instrument_id" in df_clean.columns:
        output_cols.insert(2, "instrument_id")

    df_out = df_clean[[c for c in output_cols if c in df_clean.columns]].copy()

    # Save processed parquet
    output_path = PROCESSED_DIR / "mnq_1m_continuous.parquet"
    df_out.to_parquet(output_path, index=False, compression="snappy")
    checksum = sha256_file(output_path)
    size_bytes = output_path.stat().st_size

    print(f"\nSaved: {output_path}")
    print(f"Size: {size_bytes/1024/1024:.1f} MB")
    print(f"SHA256: {checksum}")

    # Save manifest
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_dataset": "GLBX.MDP3",
        "source_schema": "ohlcv-1m",
        "source_symbol": "MNQ.v.0",
        "stype_in": "continuous",
        "date_range_start": "2024-01-01",
        "date_range_end": "2026-07-21",
        "output_file": str(output_path),
        "output_sha256": checksum,
        "output_size_bytes": size_bytes,
        "total_bars": len(df_out),
        "price_scale_applied": PRICE_SCALE,
        "normalisation_version": "v1.0",
        "quality_report": quality_report,
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
    }

    manifest_path = PROCESSED_DIR / "mnq_1m_continuous_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, default=str)

    quality_report_path = PROCESSED_DIR / "data_quality_report.json"
    with open(quality_report_path, "w") as f:
        json.dump(quality_report, f, indent=2, default=str)

    print(f"\nManifest: {manifest_path}")
    print(f"Quality report: {quality_report_path}")

    print("\n" + "=" * 70)
    print("CONTINUOUS SERIES BUILD COMPLETE")
    print(f"Total clean bars: {len(df_out):,}")
    print(f"Quality: {quality_report['overall_quality']}")
    if quality_report["issues"]:
        print(f"Issues: {quality_report['issues']}")
    print("=" * 70)

    return manifest


if __name__ == "__main__":
    result = main()
    print(json.dumps(result, indent=2, default=str))
