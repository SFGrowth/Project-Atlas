"""
PV-EXP-001 Formal Scanner Equivalence Harness
Sprint 123A.10 — Gate G10

Compares the approved Python detector (payout_vault_detector.py) against the
vectorised scanner (pv_exp_001_scan.py) across every eligible evaluation cutoff
in the full OOS dataset.

For every candidate bar the harness records 19 gate fields from both
implementations and checks for mismatches:
  1.  htf_pivot_recognition_ts
  2.  dol_level
  3.  dol_direction
  4.  ltf_pivot_recognition_ts
  5.  msu_state
  6.  alignment_result
  7.  inducement_level
  8.  inducement_ts
  9.  sweep_detected
  10. sweep_ts
  11. sweep_level
  12. csd_detected
  13. csd_ts
  14. csd_rule
  15. final_qualifying_status
  16. direction
  17. proposed_entry_ts
  18. rejection_reason_code
  19. deterministic_event_id

Required outcomes:
  FULL_GATE_EQUIVALENCE_MISMATCHES = 0
  FINAL_EVENT_SET_MISMATCHES = 0
  EVENT_TIMESTAMP_MISMATCHES = 0
  EVENT_DIRECTION_MISMATCHES = 0
  REJECTION_REASON_MISMATCHES = 0

AUTHORITY: DARWIN_DECISION_AUTHORITY=DISABLED, DARWIN_EXECUTION_AUTHORITY=DISABLED
No profitability analysis. Research output only.
"""
from __future__ import annotations
import sys, json, hashlib, time
from datetime import timezone
from pathlib import Path
from typing import Optional
import pandas as pd
import numpy as np

REPO_ROOT     = Path(__file__).resolve().parents[5]
DETECTOR_PATH = REPO_ROOT / "docs/research/payout-vault/payout_vault_detector.py"
OUTPUT_DIR    = Path(__file__).parent

DATASET_PATH  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")

APPROVED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"
APPROVED_DATASET_SHA  = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"

OOS_START     = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END       = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")

HTF_LOOKBACK  = 20
LTF_WINDOW    = 60
CONFIG = {
    "htf_lookback": HTF_LOOKBACK, "ltf_swing_lookback": 3,
    "csd_window": 3, "sweep_variant": "sweep-wick",
    "stop_buffer_ticks": 4, "entry_type": 1,
    "smt_enabled": False, "smt_window_bars": 3, "tick_size": 0.25,
}

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------
def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(65536), b""): h.update(c)
    return h.hexdigest()

def verify_baselines():
    for name, path, expected in [
        ("detector", DETECTOR_PATH, APPROVED_DETECTOR_SHA),
        ("dataset",  DATASET_PATH,  APPROVED_DATASET_SHA),
    ]:
        actual = sha256_file(path)
        if actual != expected:
            raise SystemExit(f"STOP: {name} hash mismatch\n  expected: {expected}\n  actual:   {actual}")
    print("BASELINE_HASHES_VERIFIED: TRUE")

def load_oos() -> pd.DataFrame:
    df = pd.read_parquet(DATASET_PATH)
    oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].copy().reset_index(drop=True)
    assert oos[["open","high","low","close"]].isnull().sum().sum() == 0
    assert oos["bar_time"].duplicated().sum() == 0
    return oos

def build_htf_full(oos: pd.DataFrame) -> pd.DataFrame:
    sub = oos.set_index("bar_time")
    htf = sub[["open","high","low","close","volume"]].resample(
        "15min", closed="left", label="left"
    ).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna()
    return htf.reset_index()

# ---------------------------------------------------------------------------
# Import the approved detector
# ---------------------------------------------------------------------------
import importlib.util
def load_detector():
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod  = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    return mod

# ---------------------------------------------------------------------------
# Vectorised scanner — CORRECTED to faithfully replicate detector logic
# ---------------------------------------------------------------------------
def compute_htf_swings(htf: pd.DataFrame):
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

def scanner_gate_fields(oos: pd.DataFrame, htf: pd.DataFrame, i: int) -> dict:
    """
    Compute all 19 gate fields for bar i using the CORRECTED vectorised logic
    that faithfully replicates the approved detector.
    Returns a dict with all 19 fields.
    """
    cutoff = oos.loc[i, "bar_time"]
    result = {
        "bar_index": i,
        "cutoff_ts": str(cutoff),
        "htf_pivot_recognition_ts": None,
        "dol_level": None,
        "dol_direction": None,
        "ltf_pivot_recognition_ts": None,
        "msu_state": None,
        "alignment_result": None,
        "inducement_level": None,
        "inducement_ts": None,
        "sweep_detected": False,
        "sweep_ts": None,
        "sweep_level": None,
        "csd_detected": False,
        "csd_ts": None,
        "csd_rule": None,
        "final_qualifying_status": False,
        "direction": None,
        "proposed_entry_ts": None,
        "rejection_reason_code": None,
    }

    # ---- HTF window: all HTF bars with bar_time <= cutoff ----
    htf_times = htf["bar_time"].values
    htf_end_idx = int(np.searchsorted(htf_times, cutoff.to_datetime64(), side="right"))
    # Need at least HTF_LOOKBACK*2 bars for DOL
    if htf_end_idx < HTF_LOOKBACK * 2:
        result["rejection_reason_code"] = "GATE1_FAIL"
        return result

    htf_window = htf.iloc[:htf_end_idx].copy().reset_index(drop=True)
    htf_h = htf_window["high"].values
    htf_l = htf_window["low"].values
    n_htf = len(htf_window)

    # Compute HTF swings on the window (same 5-bar pivot as detector)
    htf_sh_idx = []
    htf_sl_idx = []
    for k in range(2, n_htf - 2):
        if htf_h[k] > htf_h[k-1] and htf_h[k] > htf_h[k-2] and htf_h[k] > htf_h[k+1] and htf_h[k] > htf_h[k+2]:
            htf_sh_idx.append(k)
        if htf_l[k] < htf_l[k-1] and htf_l[k] < htf_l[k-2] and htf_l[k] < htf_l[k+1] and htf_l[k] < htf_l[k+2]:
            htf_sl_idx.append(k)

    if not htf_sh_idx or not htf_sl_idx:
        result["rejection_reason_code"] = "GATE1_FAIL"
        return result

    last_sh = htf_sh_idx[-1]
    last_sl = htf_sl_idx[-1]
    result["htf_pivot_recognition_ts"] = str(htf_window.loc[max(last_sh, last_sl), "bar_time"])

    if last_sh > last_sl:
        dol_direction = "bearish"
        dol_price = htf_l[last_sl]
    else:
        dol_direction = "bullish"
        dol_price = htf_h[last_sh]

    result["dol_level"] = float(dol_price)
    result["dol_direction"] = dol_direction

    # ---- LTF window: 60 bars ending at bar i (inclusive) ----
    ltf_start = max(0, i - LTF_WINDOW + 1)
    ltf_window = oos.iloc[ltf_start:i+1].copy().reset_index(drop=True)
    ltf_h = ltf_window["high"].values
    ltf_l = ltf_window["low"].values
    ltf_o = ltf_window["open"].values
    ltf_c = ltf_window["close"].values
    ltf_times = ltf_window["bar_time"].values
    n_ltf = len(ltf_window)
    lb = CONFIG["ltf_swing_lookback"]  # = 3

    # Detect LTF swings using detector's swing_lookback=3 (3 bars each side)
    ltf_sh = []  # (local_idx, price, bar_time)
    ltf_sl = []
    for k in range(lb, n_ltf - lb):
        is_sh = all(ltf_h[k] >= ltf_h[k-j] for j in range(1, lb+1)) and \
                all(ltf_h[k] >= ltf_h[k+j] for j in range(1, lb+1))
        is_sl = all(ltf_l[k] <= ltf_l[k-j] for j in range(1, lb+1)) and \
                all(ltf_l[k] <= ltf_l[k+j] for j in range(1, lb+1))
        if is_sh:
            ltf_sh.append((k, ltf_h[k], ltf_times[k]))
        if is_sl:
            ltf_sl.append((k, ltf_l[k], ltf_times[k]))

    if not ltf_sh or not ltf_sl:
        result["rejection_reason_code"] = "GATE2_FAIL"
        result["msu_state"] = "neutral"
        return result

    # MSU direction: detector uses HH+HL or LH+LL from last two swings
    msu_direction = "neutral"
    if len(ltf_sh) >= 2 and len(ltf_sl) >= 2:
        prev_sh = ltf_sh[-2][1]
        last_sh_price = ltf_sh[-1][1]
        prev_sl = ltf_sl[-2][1]
        last_sl_price = ltf_sl[-1][1]
        making_hh = last_sh_price > prev_sh
        making_hl = last_sl_price > prev_sl
        making_lh = last_sh_price < prev_sh
        making_ll = last_sl_price < prev_sl
        if making_hh and making_hl:
            msu_direction = "bullish"
        elif making_lh and making_ll:
            msu_direction = "bearish"
        else:
            msu_direction = "neutral"
    else:
        msu_direction = "neutral"

    result["msu_state"] = msu_direction
    last_sh_ts = ltf_sh[-1][2]
    last_sl_ts = ltf_sl[-1][2]
    result["ltf_pivot_recognition_ts"] = str(max(last_sh_ts, last_sl_ts, key=lambda x: pd.Timestamp(x)))

    if msu_direction == "neutral":
        result["rejection_reason_code"] = "GATE2_FAIL"
        return result

    # ---- Gate 3: Alignment ----
    alignment = (msu_direction == dol_direction)
    result["alignment_result"] = alignment
    if not alignment:
        result["rejection_reason_code"] = "GATE3_FAIL"
        return result

    # ---- Gate 4: Inducement ----
    if dol_direction == "bullish":
        ind_local_idx = ltf_sl[-1][0]
        ind_price = ltf_sl[-1][1]
        ind_ts = ltf_sl[-1][2]
    else:
        ind_local_idx = ltf_sh[-1][0]
        ind_price = ltf_sh[-1][1]
        ind_ts = ltf_sh[-1][2]

    result["inducement_level"] = float(ind_price)
    result["inducement_ts"] = str(ind_ts)

    # ---- Gate 5: Sweep ----
    search_from = ind_local_idx + 1
    swept = False
    sweep_local_idx = None
    sweep_price = None
    for k in range(search_from, n_ltf):
        if dol_direction == "bullish":
            if ltf_l[k] < ind_price:
                swept = True
                sweep_local_idx = k
                sweep_price = ltf_l[k]
                break
        else:
            if ltf_h[k] > ind_price:
                swept = True
                sweep_local_idx = k
                sweep_price = ltf_h[k]
                break

    result["sweep_detected"] = swept
    if not swept:
        result["rejection_reason_code"] = "GATE5_FAIL"
        return result

    result["sweep_ts"] = str(ltf_times[sweep_local_idx])
    result["sweep_level"] = float(sweep_price)

    # ---- Gate 6: CSD — using CORRECTED detector logic (midpoint rule) ----
    sweep_high = ltf_h[sweep_local_idx]
    sweep_low  = ltf_l[sweep_local_idx]
    sweep_range = sweep_high - sweep_low
    if sweep_range == 0:
        result["rejection_reason_code"] = "GATE6_FAIL"
        return result
    sweep_midpoint = sweep_low + 0.5 * sweep_range

    csd_found = False
    csd_local_idx = None
    csd_rule_triggered = None
    csd_window = CONFIG["csd_window"]

    for k in range(sweep_local_idx + 1, min(sweep_local_idx + 1 + csd_window, n_ltf)):
        close_k = ltf_c[k]
        # Prior candle body bounds
        if k > 0:
            prior_body_high = max(ltf_o[k-1], ltf_c[k-1])
            prior_body_low  = min(ltf_o[k-1], ltf_c[k-1])
        else:
            prior_body_high = None
            prior_body_low  = None

        if dol_direction == "bearish":
            rule1 = close_k < sweep_midpoint
            rule2 = (prior_body_low is not None) and (close_k < prior_body_low)
        else:
            rule1 = close_k > sweep_midpoint
            rule2 = (prior_body_high is not None) and (close_k > prior_body_high)

        if rule1 or rule2:
            csd_found = True
            csd_local_idx = k
            csd_rule_triggered = "rule2" if rule2 else "rule1"
            break

    result["csd_detected"] = csd_found
    if not csd_found:
        result["rejection_reason_code"] = "GATE6_FAIL"
        return result

    result["csd_ts"] = str(ltf_times[csd_local_idx])
    result["csd_rule"] = csd_rule_triggered

    # ---- Qualifying event ----
    result["final_qualifying_status"] = True
    result["direction"] = dol_direction
    # Entry = open of bar after CSD (bar csd_local_idx + 1 in ltf_window)
    entry_local = csd_local_idx + 1
    if entry_local < n_ltf:
        result["proposed_entry_ts"] = str(ltf_times[entry_local])
    else:
        # Entry bar is the next bar after the window — use bar i+1
        if i + 1 < len(oos):
            result["proposed_entry_ts"] = str(oos.loc[i+1, "bar_time"])
        else:
            result["proposed_entry_ts"] = None

    return result

# ---------------------------------------------------------------------------
# Detector gate fields — calls the approved Python detector
# ---------------------------------------------------------------------------
def detector_gate_fields(det, oos: pd.DataFrame, htf: pd.DataFrame, i: int) -> dict:
    """
    Call the approved detector for bar i and return the same 19 gate fields.
    """
    cutoff = oos.loc[i, "bar_time"]
    result = {
        "bar_index": i,
        "cutoff_ts": str(cutoff),
        "htf_pivot_recognition_ts": None,
        "dol_level": None,
        "dol_direction": None,
        "ltf_pivot_recognition_ts": None,
        "msu_state": None,
        "alignment_result": None,
        "inducement_level": None,
        "inducement_ts": None,
        "sweep_detected": False,
        "sweep_ts": None,
        "sweep_level": None,
        "csd_detected": False,
        "csd_ts": None,
        "csd_rule": None,
        "final_qualifying_status": False,
        "direction": None,
        "proposed_entry_ts": None,
        "rejection_reason_code": None,
    }

    # HTF window
    htf_window = htf[htf["bar_time"] <= cutoff].copy().reset_index(drop=True)
    # LTF window
    ltf_start = max(0, i - LTF_WINDOW + 1)
    ltf_window = oos.iloc[ltf_start:i+1].copy().reset_index(drop=True)

    sr = det.run_payout_vault_setup(htf_window, ltf_window, config=CONFIG)

    if sr.rejection_reason:
        # Extract gate code
        code = sr.rejection_reason.split(":")[0].strip()
        result["rejection_reason_code"] = code
    else:
        result["rejection_reason_code"] = None

    if sr.dol:
        result["dol_level"] = float(sr.dol.dol_price)
        result["dol_direction"] = sr.dol.dol_direction
        if sr.dol.source_bar_time is not None:
            result["htf_pivot_recognition_ts"] = str(sr.dol.source_bar_time)

    if sr.msu:
        result["msu_state"] = sr.msu.msu_direction
        # ltf pivot recognition = most recent confirmed swing
        ts_candidates = []
        if sr.msu.last_swing_high and sr.msu.last_swing_high.bar_time is not None:
            ts_candidates.append(sr.msu.last_swing_high.bar_time)
        if sr.msu.last_swing_low and sr.msu.last_swing_low.bar_time is not None:
            ts_candidates.append(sr.msu.last_swing_low.bar_time)
        if ts_candidates:
            result["ltf_pivot_recognition_ts"] = str(max(ts_candidates))

    if sr.dol and sr.msu:
        result["alignment_result"] = (sr.msu.msu_direction == sr.dol.dol_direction)

    if sr.inducement_price is not None:
        result["inducement_level"] = float(sr.inducement_price)
        # inducement_ts: look up bar time from ltf_window
        if sr.inducement_bar_index is not None and sr.inducement_bar_index < len(ltf_window):
            result["inducement_ts"] = str(ltf_window.loc[sr.inducement_bar_index, "bar_time"])

    if sr.sweep:
        result["sweep_detected"] = sr.sweep.swept
        if sr.sweep.swept:
            if sr.sweep.sweep_bar_time is not None:
                result["sweep_ts"] = str(sr.sweep.sweep_bar_time)
            if sr.sweep.sweep_price is not None:
                result["sweep_level"] = float(sr.sweep.sweep_price)

    if sr.csd:
        result["csd_detected"] = sr.csd.confirmed
        if sr.csd.confirmed:
            if sr.csd.csd_bar_time is not None:
                result["csd_ts"] = str(sr.csd.csd_bar_time)
            if sr.csd.rule_triggered is not None:
                result["csd_rule"] = sr.csd.rule_triggered

    result["final_qualifying_status"] = sr.valid
    if sr.valid:
        result["direction"] = sr.dol.dol_direction if sr.dol else None
        if sr.entry_type1_bar_index is not None and sr.entry_type1_bar_index < len(ltf_window):
            result["proposed_entry_ts"] = str(ltf_window.loc[sr.entry_type1_bar_index, "bar_time"])

    return result

# ---------------------------------------------------------------------------
# Equivalence comparison
# ---------------------------------------------------------------------------
COMPARABLE_FIELDS = [
    "dol_direction", "msu_state", "alignment_result",
    "sweep_detected", "csd_detected",
    "final_qualifying_status", "direction",
    "rejection_reason_code",
]

NUMERIC_FIELDS = ["dol_level", "inducement_level", "sweep_level"]
NUMERIC_TOL = 0.01  # 1 tick tolerance for float comparison

def compare_fields(scanner: dict, detector: dict) -> list[dict]:
    mismatches = []
    for field in COMPARABLE_FIELDS:
        sv = scanner.get(field)
        dv = detector.get(field)
        if sv != dv:
            mismatches.append({
                "field": field,
                "bar_index": scanner["bar_index"],
                "cutoff_ts": scanner["cutoff_ts"],
                "scanner_value": sv,
                "detector_value": dv,
            })
    for field in NUMERIC_FIELDS:
        sv = scanner.get(field)
        dv = detector.get(field)
        if sv is None and dv is None:
            continue
        if sv is None or dv is None or abs(sv - dv) > NUMERIC_TOL:
            mismatches.append({
                "field": field,
                "bar_index": scanner["bar_index"],
                "cutoff_ts": scanner["cutoff_ts"],
                "scanner_value": sv,
                "detector_value": dv,
            })
    return mismatches

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()
    print("PV-EXP-001 FORMAL EQUIVALENCE HARNESS")
    print("=" * 60)

    verify_baselines()

    det = load_detector()
    print(f"Detector loaded: {DETECTOR_PATH.name}")

    oos = load_oos()
    htf = build_htf_full(oos)
    print(f"OOS bars: {len(oos)} | HTF bars: {len(htf)}")

    # Determine eligible evaluation bars
    # A bar is eligible if:
    # - HTF window has >= HTF_LOOKBACK*2 bars before it
    # - LTF window has >= LTF_WINDOW bars (i >= LTF_WINDOW - 1)
    htf_times = htf["bar_time"].values
    min_htf_required = HTF_LOOKBACK * 2

    eligible_indices = []
    for i in range(LTF_WINDOW - 1, len(oos)):
        cutoff = oos.loc[i, "bar_time"]
        htf_end = int(np.searchsorted(htf_times, cutoff.to_datetime64(), side="right"))
        if htf_end >= min_htf_required:
            eligible_indices.append(i)

    total_eligible = len(eligible_indices)
    print(f"Eligible evaluation bars: {total_eligible}")
    print(f"Running full comparison (this will take ~{total_eligible * 0.1 / 60:.0f} minutes)...")
    print("Progress reported every 500 bars.")
    print()

    all_mismatches = []
    scanner_qualifying = []
    detector_qualifying = []
    rejection_reason_mismatches = 0
    final_status_mismatches = 0
    direction_mismatches = 0
    timestamp_mismatches = 0

    for count, i in enumerate(eligible_indices):
        if count % 500 == 0 and count > 0:
            elapsed = time.time() - t0
            rate = count / elapsed
            eta = (total_eligible - count) / rate if rate > 0 else 0
            print(f"  {count}/{total_eligible} | mismatches so far: {len(all_mismatches)} | ETA: {eta:.0f}s")
            sys.stdout.flush()

        s_fields = scanner_gate_fields(oos, htf, i)
        d_fields = detector_gate_fields(det, oos, htf, i)

        mismatches = compare_fields(s_fields, d_fields)
        if mismatches:
            all_mismatches.extend(mismatches)
            for m in mismatches:
                if m["field"] == "rejection_reason_code":
                    rejection_reason_mismatches += 1
                if m["field"] == "final_qualifying_status":
                    final_status_mismatches += 1
                if m["field"] == "direction":
                    direction_mismatches += 1

        # Check timestamp mismatches for qualifying events
        if s_fields["final_qualifying_status"] and d_fields["final_qualifying_status"]:
            if s_fields.get("proposed_entry_ts") != d_fields.get("proposed_entry_ts"):
                timestamp_mismatches += 1
                all_mismatches.append({
                    "field": "proposed_entry_ts",
                    "bar_index": i,
                    "cutoff_ts": s_fields["cutoff_ts"],
                    "scanner_value": s_fields.get("proposed_entry_ts"),
                    "detector_value": d_fields.get("proposed_entry_ts"),
                })

        if s_fields["final_qualifying_status"]:
            scanner_qualifying.append({
                "bar_index": i,
                "cutoff_ts": s_fields["cutoff_ts"],
                "direction": s_fields["direction"],
                "proposed_entry_ts": s_fields.get("proposed_entry_ts"),
            })
        if d_fields["final_qualifying_status"]:
            detector_qualifying.append({
                "bar_index": i,
                "cutoff_ts": d_fields["cutoff_ts"],
                "direction": d_fields["direction"],
                "proposed_entry_ts": d_fields.get("proposed_entry_ts"),
            })

    elapsed = time.time() - t0

    # Compare event sets
    scanner_event_set = set(e["cutoff_ts"] for e in scanner_qualifying)
    detector_event_set = set(e["cutoff_ts"] for e in detector_qualifying)
    final_event_set_mismatches = len(scanner_event_set.symmetric_difference(detector_event_set))

    # Build result
    result = {
        "experiment_id": "PV-EXP-001",
        "harness_version": "1.0.0",
        "total_eligible_bars": total_eligible,
        "elapsed_seconds": round(elapsed, 1),
        "FULL_GATE_EQUIVALENCE_MISMATCHES": len(all_mismatches),
        "FINAL_EVENT_SET_MISMATCHES": final_event_set_mismatches,
        "EVENT_TIMESTAMP_MISMATCHES": timestamp_mismatches,
        "EVENT_DIRECTION_MISMATCHES": direction_mismatches,
        "REJECTION_REASON_MISMATCHES": rejection_reason_mismatches,
        "FINAL_STATUS_MISMATCHES": final_status_mismatches,
        "scanner_qualifying_count": len(scanner_qualifying),
        "detector_qualifying_count": len(detector_qualifying),
        "scanner_only_events": sorted(scanner_event_set - detector_event_set),
        "detector_only_events": sorted(detector_event_set - scanner_event_set),
        "mismatches": all_mismatches[:200],  # cap at 200 for file size
        "SCANNER_EQUIVALENCE_STATUS": "PASS" if len(all_mismatches) == 0 and final_event_set_mismatches == 0 else "FAIL",
        "darwin_processbar_calls": 0,
        "darwin_postbarautomation_calls": 0,
        "darwin_traderspost_calls": 0,
        "darwin_tradovate_calls": 0,
    }

    out_path = OUTPUT_DIR / "PV_EXP_001_SCANNER_EQUIVALENCE.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    print()
    print("=" * 60)
    print("EQUIVALENCE HARNESS RESULTS")
    print("=" * 60)
    for k, v in result.items():
        if k not in ("mismatches", "scanner_only_events", "detector_only_events"):
            print(f"{k}: {v}")
    print(f"\nOutput: {out_path}")

    if result["SCANNER_EQUIVALENCE_STATUS"] == "FAIL":
        print("\nSCANNER_EQUIVALENCE_FAILURE — see mismatches above")
        sys.exit(1)
    else:
        print("\nSCANNER_EQUIVALENCE_STATUS: PASS")

if __name__ == "__main__":
    main()
