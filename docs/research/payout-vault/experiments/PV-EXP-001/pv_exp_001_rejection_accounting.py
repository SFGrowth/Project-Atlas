"""
PV-EXP-001 Exact Rejection Accounting
=======================================
Mirrors the vectorised scanner's exact gate logic to produce integer counts
per gate. Proves:
  GATE1_FAIL + GATE2_FAIL + GATE3_FAIL + GATE4_FAIL + GATE5_FAIL
  + GATE6_FAIL + ENTRY_FAIL + DEDUP_COOLDOWN + qualifying = total_candidates

This script uses the same pre-computed swing arrays and gate logic as
pv_exp_001_scan.py. It does NOT call the detector.
"""
from __future__ import annotations
import sys, json, hashlib, time
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import numpy as np

REPO_ROOT     = Path("/home/ubuntu/atlas-nexus")
DETECTOR_PATH = REPO_ROOT / "docs/research/payout-vault/payout_vault_detector.py"
DATASET_PATH  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")
OUTPUT_PATH   = REPO_ROOT / "docs/research/payout-vault/experiments/PV-EXP-001/PV_EXP_001_EXACT_REJECTION_FUNNEL.json"

APPROVED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"
APPROVED_DATASET_SHA  = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"

OOS_START     = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END       = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
COOLDOWN_BARS = 12
HTF_LOOKBACK  = 20
LTF_WINDOW    = 60
CONFIG = {
    "htf_lookback": HTF_LOOKBACK, "ltf_swing_lookback": 3,
    "csd_window": 3, "sweep_variant": "sweep-wick",
    "stop_buffer_ticks": 4, "entry_type": 1,
    "smt_enabled": False, "smt_window_bars": 3, "tick_size": 0.25,
}

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(65536), b""): h.update(c)
    return h.hexdigest()

def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def compute_htf_swings(htf):
    """5-bar pivot: strictly greater/less than 2 neighbours on each side."""
    h = htf["high"].values
    l = htf["low"].values
    n = len(h)
    is_sh = np.zeros(n, dtype=bool)
    is_sl = np.zeros(n, dtype=bool)
    if n < 5:
        return is_sh, is_sl
    is_sh[2:n-2] = (
        (h[2:n-2] > h[1:n-3]) & (h[2:n-2] > h[0:n-4]) &
        (h[2:n-2] > h[3:n-1]) & (h[2:n-2] > h[4:n])
    )
    is_sl[2:n-2] = (
        (l[2:n-2] < l[1:n-3]) & (l[2:n-2] < l[0:n-4]) &
        (l[2:n-2] < l[3:n-1]) & (l[2:n-2] < l[4:n])
    )
    return is_sh, is_sl

def compute_ltf_swings(oos):
    """3-bar pivot with >= (non-strict) matching detect_msu lb=3."""
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

def main():
    log("=== PV-EXP-001 EXACT REJECTION ACCOUNTING ===")

    # Verify hashes
    det_sha = sha256_file(DETECTOR_PATH)
    if det_sha != APPROVED_DETECTOR_SHA:
        log(f"FATAL: detector hash mismatch: {det_sha}")
        sys.exit(1)
    log(f"DETECTOR_SHA256: {det_sha} ✓")

    ds_sha = sha256_file(DATASET_PATH)
    if ds_sha != APPROVED_DATASET_SHA:
        log(f"FATAL: dataset hash mismatch: {ds_sha}")
        sys.exit(1)
    log(f"DATASET_SHA256: {ds_sha} ✓")

    # Load dataset
    df = pd.read_parquet(DATASET_PATH)
    oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].copy().reset_index(drop=True)
    n = len(oos)
    log(f"OOS bars: {n}")

    # Build HTF
    sub = oos.set_index("bar_time")
    htf_full = sub[["open","high","low","close","volume"]].resample(
        "15min", closed="left", label="left"
    ).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna()
    htf_full = htf_full.reset_index()
    log(f"HTF bars: {len(htf_full)}")

    # Pre-compute swing arrays
    htf_is_sh, htf_is_sl = compute_htf_swings(htf_full)
    ltf_is_sh, ltf_is_sl = compute_ltf_swings(oos)
    log("Swing arrays computed")

    # Pre-compute arrays
    htf_times_ns = htf_full["bar_time"].values.astype("int64")
    oos_times_ns = oos["bar_time"].values.astype("int64")
    oos_open  = oos["open"].values
    oos_high  = oos["high"].values
    oos_low   = oos["low"].values
    oos_close = oos["close"].values
    htf_high  = htf_full["high"].values
    htf_low   = htf_full["low"].values

    # htf_bar_for_ltf[i] = index of last HTF bar whose bar_time <= oos bar_time[i]
    htf_bar_for_ltf = np.searchsorted(htf_times_ns, oos_times_ns, side="right") - 1

    # Gate counters (matching scanner's rejection key names exactly)
    rej = {}
    total_rej = 0
    dup_rem = 0
    last_bar = {"bullish": -9999, "bearish": -9999}
    total_candidates = 0
    qualifying = 0

    min_bars = HTF_LOOKBACK * 3 + LTF_WINDOW  # = 180

    log(f"Scanning {n - min_bars - 1} bars (i={min_bars} to {n-2})...")
    t0 = time.time()

    for i in range(min_bars, n - 1):
        if i % 5000 == 0:
            elapsed = time.time() - t0
            log(f"Progress: {i}/{n-1} | qualifying: {qualifying} | elapsed: {elapsed:.0f}s")

        # ---- Gate 1: DOL ----
        htf_idx = htf_bar_for_ltf[i]
        if htf_idx < HTF_LOOKBACK * 2:
            rej["GATE1_FAIL"] = rej.get("GATE1_FAIL", 0) + 1
            total_rej += 1
            total_candidates += 1
            continue

        htf_window_end = htf_idx - 1
        if htf_window_end < 4:
            rej["GATE1_FAIL"] = rej.get("GATE1_FAIL", 0) + 1
            total_rej += 1
            total_candidates += 1
            continue

        sh_indices = np.where(htf_is_sh[:htf_window_end])[0]
        sl_indices = np.where(htf_is_sl[:htf_window_end])[0]

        if len(sh_indices) == 0 or len(sl_indices) == 0:
            rej["GATE1_FAIL"] = rej.get("GATE1_FAIL", 0) + 1
            total_rej += 1
            total_candidates += 1
            continue

        last_sh_idx = sh_indices[-1]
        last_sl_idx = sl_indices[-1]

        if last_sh_idx > last_sl_idx:
            dol_direction = "bearish"
            dol_price = htf_low[last_sl_idx]
        else:
            dol_direction = "bullish"
            dol_price = htf_high[last_sh_idx]

        total_candidates += 1

        # ---- Gate 2: MSU ----
        ltf_start = max(0, i - LTF_WINDOW + 1)
        ltf_pivot_end = max(ltf_start, i - 3)
        ltf_sh_in_window = np.where(ltf_is_sh[ltf_start:ltf_pivot_end])[0]
        ltf_sl_in_window = np.where(ltf_is_sl[ltf_start:ltf_pivot_end])[0]

        if len(ltf_sh_in_window) < 2 or len(ltf_sl_in_window) < 2:
            rej["GATE2_FAIL"] = rej.get("GATE2_FAIL", 0) + 1
            total_rej += 1
            continue

        last_ltf_sh  = ltf_sh_in_window[-1]
        prev_ltf_sh  = ltf_sh_in_window[-2]
        last_ltf_sl  = ltf_sl_in_window[-1]
        prev_ltf_sl  = ltf_sl_in_window[-2]

        last_sh_abs = ltf_start + last_ltf_sh
        prev_sh_abs = ltf_start + prev_ltf_sh
        last_sl_abs = ltf_start + last_ltf_sl
        prev_sl_abs = ltf_start + prev_ltf_sl

        making_hh = oos_high[last_sh_abs] > oos_high[prev_sh_abs]
        making_hl = oos_low[last_sl_abs]  > oos_low[prev_sl_abs]
        making_lh = oos_high[last_sh_abs] < oos_high[prev_sh_abs]
        making_ll = oos_low[last_sl_abs]  < oos_low[prev_sl_abs]

        if making_hh and making_hl:
            msu_direction = "bullish"
        elif making_lh and making_ll:
            msu_direction = "bearish"
        else:
            rej["GATE2_FAIL"] = rej.get("GATE2_FAIL", 0) + 1
            total_rej += 1
            continue

        # For Gate 4 inducement
        ltf_sh_full = np.where(ltf_is_sh[ltf_start:i - 1])[0]
        ltf_sl_full = np.where(ltf_is_sl[ltf_start:i - 1])[0]

        # ---- Gate 3: MSU-DOL alignment ----
        if msu_direction != dol_direction:
            rej["GATE3_FAIL"] = rej.get("GATE3_FAIL", 0) + 1
            total_rej += 1
            continue

        # ---- Gate 4: Inducement ----
        if dol_direction == "bullish":
            if len(ltf_sl_full) == 0:
                rej["GATE4_FAIL"] = rej.get("GATE4_FAIL", 0) + 1
                total_rej += 1
                continue
            ind_local_idx = ltf_sl_full[-1]
            ind_abs_idx   = ltf_start + ind_local_idx
            inducement_price = oos_low[ind_abs_idx]
        else:
            if len(ltf_sh_full) == 0:
                rej["GATE4_FAIL"] = rej.get("GATE4_FAIL", 0) + 1
                total_rej += 1
                continue
            ind_local_idx = ltf_sh_full[-1]
            ind_abs_idx   = ltf_start + ind_local_idx
            inducement_price = oos_high[ind_abs_idx]

        # ---- Gate 5: Sweep ----
        search_start = ind_abs_idx + 1
        swept = False
        sweep_bar_idx = None

        if dol_direction == "bullish":
            for j in range(search_start, i + 1):
                if oos_low[j] < inducement_price:
                    swept = True
                    sweep_bar_idx = j
                    break
        else:
            for j in range(search_start, i + 1):
                if oos_high[j] > inducement_price:
                    swept = True
                    sweep_bar_idx = j
                    break

        if not swept or sweep_bar_idx is None:
            rej["GATE5_FAIL"] = rej.get("GATE5_FAIL", 0) + 1
            total_rej += 1
            continue

        # ---- Gate 6: CSD ----
        csd_found = False
        csd_bar_idx = None
        csd_window = CONFIG["csd_window"]
        sweep_high = oos_high[sweep_bar_idx]
        sweep_low  = oos_low[sweep_bar_idx]
        sweep_range = sweep_high - sweep_low

        if sweep_range == 0:
            rej["GATE6_FAIL"] = rej.get("GATE6_FAIL", 0) + 1
            total_rej += 1
            continue

        sweep_midpoint = sweep_low + 0.5 * sweep_range

        for j in range(sweep_bar_idx + 1, min(sweep_bar_idx + csd_window + 1, i + 1)):
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
                csd_found = True
                csd_bar_idx = j
                break

        if not csd_found or csd_bar_idx is None:
            rej["GATE6_FAIL"] = rej.get("GATE6_FAIL", 0) + 1
            total_rej += 1
            continue

        # CSD bar must be strictly before bar i
        if csd_bar_idx >= i:
            rej["GATE6_FAIL"] = rej.get("GATE6_FAIL", 0) + 1
            total_rej += 1
            continue

        # ---- Entry ----
        entry_bar_idx = csd_bar_idx + 1
        if entry_bar_idx >= n:
            rej["ENTRY_FAIL"] = rej.get("ENTRY_FAIL", 0) + 1
            total_rej += 1
            continue

        # ---- Cooldown deduplication ----
        if i - last_bar[dol_direction] <= COOLDOWN_BARS:
            rej["DEDUP_COOLDOWN"] = rej.get("DEDUP_COOLDOWN", 0) + 1
            total_rej += 1
            dup_rem += 1
            continue

        # ---- Qualifying ----
        last_bar[dol_direction] = i
        qualifying += 1

    elapsed = time.time() - t0
    log(f"Scan complete in {elapsed:.1f}s")

    # Build reconciliation
    gate1_rej  = rej.get("GATE1_FAIL", 0)
    gate2_rej  = rej.get("GATE2_FAIL", 0)
    gate3_rej  = rej.get("GATE3_FAIL", 0)
    gate4_rej  = rej.get("GATE4_FAIL", 0)
    gate5_rej  = rej.get("GATE5_FAIL", 0)
    gate6_rej  = rej.get("GATE6_FAIL", 0)
    entry_rej  = rej.get("ENTRY_FAIL", 0)
    dedup_rej  = rej.get("DEDUP_COOLDOWN", 0)

    total_accounted = gate1_rej + gate2_rej + gate3_rej + gate4_rej + gate5_rej + gate6_rej + entry_rej + dedup_rej + qualifying
    reconciles = (total_accounted == total_candidates)

    log(f"TOTAL_ELIGIBLE_CANDIDATES (total_candidates): {total_candidates}")
    log(f"GATE_1_REJECTIONS: {gate1_rej}")
    log(f"GATE_2_REJECTIONS (insuf+neutral): {gate2_rej}")
    log(f"GATE_3_ALIGNMENT_REJECTIONS: {gate3_rej}")
    log(f"GATE_4_REJECTIONS: {gate4_rej}")
    log(f"GATE_5_SWEEP_REJECTIONS: {gate5_rej}")
    log(f"GATE_6_CSD_REJECTIONS: {gate6_rej}")
    log(f"ENTRY_REJECTIONS: {entry_rej}")
    log(f"DUPLICATES_REMOVED: {dedup_rej}")
    log(f"QUALIFYING_EVENTS: {qualifying}")
    log(f"TOTAL_ACCOUNTED: {total_accounted}")
    log(f"REJECTION_ACCOUNTING_RECONCILES: {reconciles}")

    result = {
        "source": "VECTORISED_SCANNER_GATE_LOGIC",
        "detector_sha256": det_sha,
        "dataset_sha256": ds_sha,
        "oos_start": OOS_START.isoformat(),
        "oos_end": OOS_END.isoformat(),
        "scan_loop_range": f"i in range({min_bars}, {n-1})",
        "TOTAL_ELIGIBLE_CANDIDATES": total_candidates,
        "GATE_1_REJECTIONS": gate1_rej,
        "GATE_2_REJECTIONS": gate2_rej,
        "GATE_2_INSUFFICIENT_STRUCTURE": "included in GATE_2_REJECTIONS",
        "GATE_2_3_NEUTRAL_MSU": "included in GATE_2_REJECTIONS",
        "GATE_3_ALIGNMENT_REJECTIONS": gate3_rej,
        "GATE_4_REJECTIONS": gate4_rej,
        "GATE_5_SWEEP_REJECTIONS": gate5_rej,
        "GATE_6_CSD_REJECTIONS": gate6_rej,
        "ENTRY_REJECTIONS": entry_rej,
        "DUPLICATES_REMOVED": dedup_rej,
        "QUALIFYING_EVENTS": qualifying,
        "TOTAL_ACCOUNTED": total_accounted,
        "REJECTION_ACCOUNTING_RECONCILES": reconciles,
        "elapsed_seconds": round(elapsed, 2)
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)
    log(f"Written: {OUTPUT_PATH}")
    log("=== DONE ===")

if __name__ == "__main__":
    main()
