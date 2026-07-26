"""
Investigation: Why does the scanner produce 114 pre-cooldown events
while the detector produces 258?

This script takes the 258 detector pre-cooldown events from chunk_00.json
and evaluates each one through the scanner's gate logic to find which gates
fail and why.

AUTHORITY: DARWIN_DECISION_AUTHORITY=DISABLED, DARWIN_EXECUTION_AUTHORITY=DISABLED
"""
from __future__ import annotations
import sys, json
from pathlib import Path
import pandas as pd
import numpy as np

REPO_ROOT     = Path(__file__).resolve().parents[5]
DETECTOR_PATH = REPO_ROOT / "docs/research/payout-vault/payout_vault_detector.py"
OUTPUT_DIR    = Path(__file__).parent
DATASET_PATH  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")

HTF_LOOKBACK  = 20
LTF_WINDOW    = 60
COOLDOWN_BARS = 12
CONFIG = {
    "htf_lookback": HTF_LOOKBACK, "ltf_swing_lookback": 3,
    "csd_window": 3, "sweep_variant": "sweep-wick",
    "stop_buffer_ticks": 4, "entry_type": 1,
    "smt_enabled": False, "smt_window_bars": 3, "tick_size": 0.25,
}

OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")

def compute_local_dol(htf_high, htf_low, htf_idx, lookback=HTF_LOOKBACK):
    if htf_idx < lookback * 2:
        return None, None
    slice_start = max(0, htf_idx - lookback * 3)
    h = htf_high[slice_start:htf_idx]
    l = htf_low[slice_start:htf_idx]
    n = len(h)
    last_sh_local = -1
    last_sl_local = -1
    last_sh_price = 0.0
    last_sl_price = 0.0
    for i in range(2, n - 2):
        if (h[i] > h[i-1] and h[i] > h[i-2] and h[i] > h[i+1] and h[i] > h[i+2]):
            last_sh_local = i
            last_sh_price = h[i]
        if (l[i] < l[i-1] and l[i] < l[i-2] and l[i] < l[i+1] and l[i] < l[i+2]):
            last_sl_local = i
            last_sl_price = l[i]
    if last_sh_local == -1 or last_sl_local == -1:
        return None, None
    if last_sh_local > last_sl_local:
        return "bearish", last_sl_price
    else:
        return "bullish", last_sh_price

def compute_ltf_swings(oos):
    h = oos["high"].values
    l = oos["low"].values
    n = len(h)
    is_sh = np.zeros(n, dtype=bool)
    is_sl = np.zeros(n, dtype=bool)
    if n < 7:
        return is_sh, is_sl
    is_sh[3:n-3] = (
        (h[3:n-3] >= h[2:n-4]) & (h[3:n-3] >= h[1:n-5]) & (h[3:n-3] >= h[0:n-6]) &
        (h[3:n-3] >= h[4:n-2]) & (h[3:n-3] >= h[5:n-1]) & (h[3:n-3] >= h[6:n])
    )
    is_sl[3:n-3] = (
        (l[3:n-3] <= l[2:n-4]) & (l[3:n-3] <= l[1:n-5]) & (l[3:n-3] <= l[0:n-6]) &
        (l[3:n-3] <= l[4:n-2]) & (l[3:n-3] <= l[5:n-1]) & (l[3:n-3] <= l[6:n])
    )
    return is_sh, is_sl

def evaluate_scanner_gates(i, oos, htf_full, ltf_is_sh, ltf_is_sl,
                            htf_times_ns, oos_open, oos_high, oos_low, oos_close,
                            htf_high, htf_low, htf_bar_for_ltf, n, htf_n):
    """Evaluate all scanner gates for bar i. Returns dict with gate results."""
    result = {"bar_index": i, "passed": False, "fail_gate": None, "details": {}}

    # Gate 1: DOL
    htf_idx = int(htf_bar_for_ltf[i])
    dol_direction, dol_price = compute_local_dol(htf_high, htf_low, htf_idx)
    if dol_direction is None:
        result["fail_gate"] = "GATE1"
        result["details"]["htf_idx"] = htf_idx
        return result
    result["details"]["dol_direction"] = dol_direction
    result["details"]["dol_price"] = dol_price

    # Gate 2: MSU
    ltf_start = max(0, i - LTF_WINDOW + 1)
    ltf_pivot_end = max(ltf_start, i - 3 + 1)
    ltf_sh_in_window = np.where(ltf_is_sh[ltf_start:ltf_pivot_end])[0]
    ltf_sl_in_window = np.where(ltf_is_sl[ltf_start:ltf_pivot_end])[0]
    if len(ltf_sh_in_window) < 2 or len(ltf_sl_in_window) < 2:
        result["fail_gate"] = "GATE2_INSUFFICIENT_SWINGS"
        result["details"]["ltf_sh_count"] = len(ltf_sh_in_window)
        result["details"]["ltf_sl_count"] = len(ltf_sl_in_window)
        return result

    last_sh_abs = ltf_start + ltf_sh_in_window[-1]
    prev_sh_abs = ltf_start + ltf_sh_in_window[-2]
    last_sl_abs = ltf_start + ltf_sl_in_window[-1]
    prev_sl_abs = ltf_start + ltf_sl_in_window[-2]

    making_hh = oos_high[last_sh_abs] > oos_high[prev_sh_abs]
    making_hl = oos_low[last_sl_abs]  > oos_low[prev_sl_abs]
    making_lh = oos_high[last_sh_abs] < oos_high[prev_sh_abs]
    making_ll = oos_low[last_sl_abs]  < oos_low[prev_sl_abs]

    if making_hh and making_hl:
        msu_direction = "bullish"
    elif making_lh and making_ll:
        msu_direction = "bearish"
    else:
        result["fail_gate"] = "GATE2_NEUTRAL"
        result["details"]["making_hh"] = bool(making_hh)
        result["details"]["making_hl"] = bool(making_hl)
        result["details"]["making_lh"] = bool(making_lh)
        result["details"]["making_ll"] = bool(making_ll)
        return result
    result["details"]["msu_direction"] = msu_direction

    # Gate 3: MSU must align with DOL
    if msu_direction != dol_direction:
        result["fail_gate"] = "GATE3"
        result["details"]["msu_direction"] = msu_direction
        result["details"]["dol_direction"] = dol_direction
        return result

    # Gate 4: Inducement
    ltf_sh_full = np.where(ltf_is_sh[ltf_start:i - 3])[0]
    ltf_sl_full = np.where(ltf_is_sl[ltf_start:i - 3])[0]
    if dol_direction == "bullish":
        if len(ltf_sl_full) == 0:
            result["fail_gate"] = "GATE4"
            return result
        ind_abs_idx = ltf_start + ltf_sl_full[-1]
        inducement_price = oos_low[ind_abs_idx]
    else:
        if len(ltf_sh_full) == 0:
            result["fail_gate"] = "GATE4"
            return result
        ind_abs_idx = ltf_start + ltf_sh_full[-1]
        inducement_price = oos_high[ind_abs_idx]
    result["details"]["inducement_price"] = float(inducement_price)

    # Gate 5: Sweep
    swept = False
    sweep_bar_idx = None
    for j in range(ind_abs_idx + 1, i + 1):
        if dol_direction == "bullish":
            if oos_low[j] < inducement_price:
                swept = True; sweep_bar_idx = j; break
        else:
            if oos_high[j] > inducement_price:
                swept = True; sweep_bar_idx = j; break
    if not swept:
        result["fail_gate"] = "GATE5"
        return result

    # Gate 6: CSD
    sweep_high = oos_high[sweep_bar_idx]
    sweep_low  = oos_low[sweep_bar_idx]
    sweep_range = sweep_high - sweep_low
    if sweep_range == 0:
        result["fail_gate"] = "GATE6_ZERO_RANGE"
        return result
    sweep_midpoint = sweep_low + 0.5 * sweep_range
    csd_found = False
    csd_bar_idx = None
    for j in range(sweep_bar_idx + 1, min(sweep_bar_idx + CONFIG["csd_window"] + 1, i + 1)):
        close_j = oos_close[j]
        prior_body_high = max(oos_open[j-1], oos_close[j-1]) if j > 0 else None
        prior_body_low  = min(oos_open[j-1], oos_close[j-1]) if j > 0 else None
        if dol_direction == "bullish":
            rule1 = close_j > sweep_midpoint
            rule2 = (prior_body_high is not None) and (close_j > prior_body_high)
        else:
            rule1 = close_j < sweep_midpoint
            rule2 = (prior_body_low is not None) and (close_j < prior_body_low)
        if rule1 or rule2:
            csd_found = True; csd_bar_idx = j; break
    if not csd_found:
        result["fail_gate"] = "GATE6_NO_CSD"
        return result
    if csd_bar_idx >= i:
        result["fail_gate"] = "GATE6_CSD_AT_OR_AFTER_I"
        return result

    # Entry
    entry_bar_idx = csd_bar_idx + 1
    if entry_bar_idx >= n:
        result["fail_gate"] = "ENTRY_FAIL"
        return result

    result["passed"] = True
    result["details"]["csd_bar_idx"] = csd_bar_idx
    result["details"]["entry_bar_idx"] = entry_bar_idx
    return result

def main():
    print("Loading dataset...")
    df = pd.read_parquet(DATASET_PATH)
    oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].copy().reset_index(drop=True)

    print("Building HTF...")
    sub = oos.set_index("bar_time")
    htf_full = sub[["open","high","low","close","volume"]].resample(
        "15min", closed="left", label="left"
    ).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna().reset_index()

    print("Computing LTF swings...")
    ltf_is_sh, ltf_is_sl = compute_ltf_swings(oos)

    htf_times_ns = htf_full["bar_time"].values.astype("int64")
    oos_times_ns = oos["bar_time"].values.astype("int64")
    oos_open  = oos["open"].values
    oos_high  = oos["high"].values
    oos_low   = oos["low"].values
    oos_close = oos["close"].values
    htf_high  = htf_full["high"].values
    htf_low   = htf_full["low"].values
    htf_bar_for_ltf = np.searchsorted(htf_times_ns, oos_times_ns, side="right")
    n = len(oos)
    htf_n = len(htf_full)

    # Load the 258 pre-cooldown detector events
    print("Loading detector checkpoint (258 events)...")
    with open(OUTPUT_DIR / "detector_first_checkpoints/chunk_00.json") as f:
        ck = json.load(f)
    det_events = ck["events"]
    print(f"Detector events: {len(det_events)}")

    # For each detector event, evaluate scanner gates
    gate_fail_counts = {}
    passed = 0
    failed = 0
    fail_details = []

    for ev in det_events:
        bar_idx = ev["bar_index"]
        if bar_idx >= n - 1:
            gate_fail_counts["OUT_OF_RANGE"] = gate_fail_counts.get("OUT_OF_RANGE", 0) + 1
            failed += 1
            continue

        r = evaluate_scanner_gates(
            bar_idx, oos, htf_full, ltf_is_sh, ltf_is_sl,
            htf_times_ns, oos_open, oos_high, oos_low, oos_close,
            htf_high, htf_low, htf_bar_for_ltf, n, htf_n
        )

        if r["passed"]:
            passed += 1
        else:
            failed += 1
            fg = r["fail_gate"]
            gate_fail_counts[fg] = gate_fail_counts.get(fg, 0) + 1
            fail_details.append({
                "bar_index": bar_idx,
                "information_cutoff": ev["information_cutoff"],
                "det_dol_direction": ev["dol_direction"],
                "fail_gate": fg,
                "scanner_details": r["details"],
            })

    print(f"\n=== SCANNER GATE EVALUATION ON 258 DETECTOR EVENTS ===")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"\nFail breakdown:")
    for k, v in sorted(gate_fail_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    # Save detailed failure report
    report = {
        "total_detector_events": len(det_events),
        "scanner_passed": passed,
        "scanner_failed": failed,
        "gate_fail_counts": gate_fail_counts,
        "fail_details": fail_details[:50],  # first 50 for inspection
    }
    out = OUTPUT_DIR / "scanner_gate_investigation.json"
    out.write_text(json.dumps(report, indent=2, default=str))
    print(f"\nReport saved: {out}")

if __name__ == "__main__":
    main()
