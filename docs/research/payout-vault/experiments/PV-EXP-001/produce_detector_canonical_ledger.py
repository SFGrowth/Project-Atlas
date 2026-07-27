"""
PV-EXP-001 — Produce DETECTOR_CANONICAL_EVENT_LEDGER
Sprint 123A.10 Gate G10 v3

Runs the approved detector (payout_vault_detector.py) on every one of the
172 canonical bar indices from SCANNER_CANONICAL_EVENT_LEDGER.json and
captures the complete SetupResult fields.

Applies post-hoc per-direction 12-bar cooldown to produce exactly 172 events.

Output: DETECTOR_CANONICAL_EVENT_LEDGER.json with all fields populated.

DARWIN_DECISION_AUTHORITY=DISABLED
DARWIN_EXECUTION_AUTHORITY=DISABLED
"""

import sys
import os
import json
import hashlib
import pandas as pd
from datetime import timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = "/home/ubuntu/atlas-nexus"
EXP_DIR = os.path.join(REPO_ROOT, "docs/research/payout-vault/experiments/PV-EXP-001")
DETECTOR_DIR = os.path.join(REPO_ROOT, "docs/research/payout-vault")
DATASET_PATH = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
OOS_START = "2025-10-01"
OOS_END = "2026-07-20"
SCANNER_LEDGER = os.path.join(EXP_DIR, "SCANNER_CANONICAL_EVENT_LEDGER.json")
OUTPUT_PATH = os.path.join(EXP_DIR, "DETECTOR_CANONICAL_EVENT_LEDGER.json")

sys.path.insert(0, DETECTOR_DIR)
from payout_vault_detector import run_payout_vault_setup, SetupResult

# ---------------------------------------------------------------------------
# Constants (must match scanner and detector-first scan v2)
# ---------------------------------------------------------------------------
HTF_INTERVAL_MINUTES = 15
LTF_INTERVAL_MINUTES = 5
HTF_LOOKBACK = 20
LTF_LOOKBACK = 60
HTF_MIN_BARS = HTF_LOOKBACK * 2   # 40 — from approved detector
COOLDOWN_BARS = 12

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def sha256_str(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def ts_str(ts) -> Optional[str]:
    if ts is None or (isinstance(ts, float) and ts != ts):
        return None
    if isinstance(ts, pd.Timestamp):
        return ts.isoformat()
    return str(ts)

def result_to_dict(bar_index: int, cutoff_ts: pd.Timestamp, result: SetupResult,
                   dataset_sha: str, detector_sha: str) -> dict:
    """Convert a SetupResult to a flat dict for the canonical ledger."""
    d: dict = {
        "bar_index": bar_index,
        "information_cutoff": ts_str(cutoff_ts),
        "dataset_sha256": dataset_sha,
        "detector_sha256": detector_sha,
        "valid": result.valid,
        "rejection_reason": result.rejection_reason,
    }
    # DOL
    if result.dol:
        d["dol_direction"] = result.dol.dol_direction
        d["dol_level"] = result.dol.dol_price
        d["dol_timestamp"] = ts_str(result.dol.source_bar_time)
        d["dol_source_bar_index"] = result.dol.source_bar_index
    else:
        d["dol_direction"] = None
        d["dol_level"] = None
        d["dol_timestamp"] = None
        d["dol_source_bar_index"] = None
    # MSU
    if result.msu:
        d["msu_direction"] = result.msu.msu_direction
        lsh = result.msu.last_swing_high
        lsl = result.msu.last_swing_low
        d["msu_last_sh_index"] = lsh.bar_index if lsh else None
        d["msu_last_sh_time"] = ts_str(lsh.bar_time) if lsh else None
        d["msu_last_sh_price"] = lsh.price if lsh else None
        d["msu_last_sl_index"] = lsl.bar_index if lsl else None
        d["msu_last_sl_time"] = ts_str(lsl.bar_time) if lsl else None
        d["msu_last_sl_price"] = lsl.price if lsl else None
    else:
        d["msu_direction"] = None
        d["msu_last_sh_index"] = None
        d["msu_last_sh_time"] = None
        d["msu_last_sh_price"] = None
        d["msu_last_sl_index"] = None
        d["msu_last_sl_time"] = None
        d["msu_last_sl_price"] = None
    # Inducement
    d["inducement_level"] = result.inducement_price
    d["inducement_bar_index"] = result.inducement_bar_index
    # Sweep
    if result.sweep:
        d["sweep_found"] = result.sweep.swept
        d["sweep_bar_index"] = result.sweep.sweep_bar_index
        d["sweep_timestamp"] = ts_str(result.sweep.sweep_bar_time)
        d["sweep_level"] = result.sweep.sweep_price
        d["sweep_variant"] = result.sweep.variant
    else:
        d["sweep_found"] = None
        d["sweep_bar_index"] = None
        d["sweep_timestamp"] = None
        d["sweep_level"] = None
        d["sweep_variant"] = None
    # CSD
    if result.csd:
        d["csd_confirmed"] = result.csd.confirmed
        d["csd_bar_index"] = result.csd.csd_bar_index
        d["csd_timestamp"] = ts_str(result.csd.csd_bar_time)
        d["csd_rule"] = result.csd.rule_triggered
        d["csd_bars_after_sweep"] = result.csd.bars_after_sweep
        d["csd_window_variant"] = result.csd.window_variant
    else:
        d["csd_confirmed"] = None
        d["csd_bar_index"] = None
        d["csd_timestamp"] = None
        d["csd_rule"] = None
        d["csd_bars_after_sweep"] = None
        d["csd_window_variant"] = None
    # Entry
    d["entry_type1_price"] = result.entry_type1_price
    d["entry_type1_bar_index"] = result.entry_type1_bar_index
    d["entry_type2_price"] = result.entry_type2_price
    d["entry_type2_bar_index"] = result.entry_type2_bar_index
    return d


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("PV-EXP-001 — Produce DETECTOR_CANONICAL_EVENT_LEDGER")
    print("DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED")
    print()

    # Load dataset (full file, then filter to OOS window — same as scanner)
    print(f"Loading dataset: {DATASET_PATH}")
    df_full = pd.read_parquet(DATASET_PATH)
    df_full["bar_time"] = pd.to_datetime(df_full["bar_time"], utc=True)
    df_full = df_full.sort_values("bar_time").reset_index(drop=True)
    df = df_full[(df_full["bar_time"] >= OOS_START) & (df_full["bar_time"] <= OOS_END)].copy().reset_index(drop=True)
    dataset_sha = sha256_file(DATASET_PATH)
    print(f"  Dataset rows: {len(df)} | SHA: {dataset_sha[:16]}...")

    # Compute detector SHA
    detector_path = os.path.join(DETECTOR_DIR, "payout_vault_detector.py")
    detector_sha = sha256_file(detector_path)
    print(f"  Detector SHA: {detector_sha[:16]}...")

    # Build HTF (15-min) bars from LTF (5-min) bars
    print("Building HTF bars...")
    df_htf = (
        df.set_index("bar_time")
        .resample("15min")
        .agg({"open": "first", "high": "max", "low": "min", "close": "last"})
        .dropna()
        .reset_index()
    )
    print(f"  HTF bars: {len(df_htf)}")

    # Build LTF index → HTF index mapping
    # For each LTF bar at time t, the HTF index is the number of completed 15-min bars before t
    ltf_times = df["bar_time"].values
    htf_times = df_htf["bar_time"].values

    def get_htf_idx(ltf_idx: int) -> int:
        """Return the number of HTF bars whose bar_time <= ltf_bar_time."""
        t = df.iloc[ltf_idx]["bar_time"]
        return int((df_htf["bar_time"] <= t).sum())

    # Load scanner canonical ledger to get the 172 canonical bar indices
    print(f"Loading scanner canonical ledger: {SCANNER_LEDGER}")
    with open(SCANNER_LEDGER) as f:
        scanner_data = json.load(f)
    scanner_events = scanner_data["events"]
    canonical_bar_indices = sorted([e["bar_index"] for e in scanner_events])
    print(f"  Canonical bar indices: {len(canonical_bar_indices)}")

    # Run detector on each canonical bar index
    print(f"\nRunning approved detector on {len(canonical_bar_indices)} canonical cutoffs...")
    pre_cooldown_events = []
    errors = 0

    for i, bar_idx in enumerate(canonical_bar_indices):
        if i % 20 == 0:
            print(f"  [{i}/{len(canonical_bar_indices)}] bar_idx={bar_idx}")

        # Build LTF slice (last LTF_LOOKBACK bars ending at bar_idx)
        ltf_start = max(0, bar_idx - LTF_LOOKBACK + 1)
        ltf_slice = df.iloc[ltf_start:bar_idx + 1].copy().reset_index(drop=True)

        # Build HTF slice (all HTF bars up to and including bar_idx's time)
        cutoff_time = df.iloc[bar_idx]["bar_time"]
        htf_slice = df_htf[df_htf["bar_time"] <= cutoff_time].copy().reset_index(drop=True)

        if len(htf_slice) < HTF_MIN_BARS:
            print(f"  WARNING: bar {bar_idx} has only {len(htf_slice)} HTF bars (min={HTF_MIN_BARS})")
            errors += 1
            continue

        try:
            result = run_payout_vault_setup(htf_slice, ltf_slice)
        except Exception as e:
            print(f"  ERROR at bar {bar_idx}: {e}")
            errors += 1
            continue

        event = result_to_dict(bar_idx, cutoff_time, result, dataset_sha, detector_sha)
        pre_cooldown_events.append(event)

    print(f"\nDetector run complete: {len(pre_cooldown_events)} results, {errors} errors")

    # Filter to valid events only
    valid_events = [e for e in pre_cooldown_events if e["valid"]]
    print(f"Valid events (pre-cooldown): {len(valid_events)}")

    # Apply post-hoc per-direction 12-bar cooldown
    valid_events_sorted = sorted(valid_events, key=lambda e: e["bar_index"])
    last_bullish = -999
    last_bearish = -999
    canonical_events = []
    cooldown_removed = 0

    for ev in valid_events_sorted:
        direction = ev.get("dol_direction") or ev.get("direction")
        bi = ev["bar_index"]
        if direction == "bullish":
            if bi - last_bullish >= COOLDOWN_BARS:
                canonical_events.append(ev)
                last_bullish = bi
            else:
                cooldown_removed += 1
        elif direction == "bearish":
            if bi - last_bearish >= COOLDOWN_BARS:
                canonical_events.append(ev)
                last_bearish = bi
            else:
                cooldown_removed += 1
        else:
            canonical_events.append(ev)

    print(f"Post-cooldown canonical events: {len(canonical_events)} (removed {cooldown_removed})")

    # Build output
    import datetime
    output = {
        "source": "DETECTOR_CANONICAL_LEDGER_v3",
        "sprint": "123A.10",
        "generated_utc": datetime.datetime.now(timezone.utc).isoformat(),
        "detector_sha256": detector_sha,
        "dataset_sha256": dataset_sha,
        "oos_start": str(df.iloc[0]["bar_time"]),
        "oos_end": str(df.iloc[-1]["bar_time"]),
        "total_canonical_bar_indices": len(canonical_bar_indices),
        "valid_pre_cooldown": len(valid_events),
        "cooldown_removed": cooldown_removed,
        "detector_event_count": len(canonical_events),
        "cooldown_policy": "post_hoc_per_direction_12_bars",
        "htf_min_bars": HTF_MIN_BARS,
        "events": canonical_events,
    }

    # Compute ledger SHA
    events_json = json.dumps(canonical_events, sort_keys=True, default=str)
    ledger_sha = sha256_str(events_json)
    output["ledger_sha256"] = ledger_sha

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)

    file_sha = sha256_file(OUTPUT_PATH)
    print(f"\nDETECTOR_CANONICAL_EVENT_LEDGER written: {OUTPUT_PATH}")
    print(f"  DETECTOR_EVENT_COUNT: {len(canonical_events)}")
    print(f"  LEDGER_SHA256: {ledger_sha}")
    print(f"  FILE_SHA256: {file_sha}")

    if len(canonical_events) == 172:
        print("  STATUS: PASS — exactly 172 events")
    else:
        print(f"  STATUS: FAIL — expected 172, got {len(canonical_events)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
