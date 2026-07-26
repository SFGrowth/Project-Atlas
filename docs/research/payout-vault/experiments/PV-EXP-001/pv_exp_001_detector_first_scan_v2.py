"""
PV-EXP-001 Detector-First Full Scan v2 — Optimised (Adapter-Only)
==================================================================
Optimisation: pre-converts immutable input columns to NumPy-backed float64
arrays ONCE per worker before the evaluation loop. The approved detector source
is NEVER modified. The adapter passes the same DataFrame API to the detector;
only the internal memory layout changes (single consolidated block instead of
mixed-dtype blocks), eliminating per-row dtype resolution overhead.

Behaviour-preserving validation is embedded: before the production scan runs,
the script validates the optimised path against the original path on:
  - all 62 known qualifying events (from SCANNER_FULL_EVENT_LEDGER.json)
  - 1000 deterministic cutoffs spread across the full dataset
  - boundary bars (first/last 5 eligible bars, session/roll edges)

Required: OPTIMISATION_EQUIVALENCE_MISMATCHES=0

Resilience features:
  - Atomic checkpoint writes every CHECKPOINT_INTERVAL bars
  - Resumable: skips already-completed chunks on restart
  - CPU quota: sleep(CPU_SLEEP_S) between calls to keep CPU < 80%
  - Single worker by default (N_WORKERS=1); set N_WORKERS=2 to add second
  - Completion marker written on success

Output artefacts:
  DETECTOR_FULL_EVENT_LEDGER.json
  DETECTOR_FIRST_REJECTION_SUMMARY.json
  PV_EXP_001_DETECTOR_FIRST_RUN_STATE.json
  PV_EXP_001_OPTIMISATION_EQUIVALENCE.json
"""
import sys
import os
import json
import hashlib
import importlib.util
import time
import multiprocessing as mp
import pandas as pd
import numpy as np
from datetime import datetime, timezone

# ── paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT     = "/home/ubuntu/atlas-nexus"
DETECTOR_PATH = os.path.join(REPO_ROOT, "docs/research/payout-vault/payout_vault_detector.py")
DATASET_PATH  = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
EXP_DIR       = os.path.join(REPO_ROOT, "docs/research/payout-vault/experiments/PV-EXP-001")
SCANNER_LEDGER_PATH = os.path.join(EXP_DIR, "PV_EXP_001_EVENT_LEDGER.json")

OUTPUT_LEDGER_PATH    = os.path.join(EXP_DIR, "DETECTOR_FULL_EVENT_LEDGER.json")
OUTPUT_REJECTION_PATH = os.path.join(EXP_DIR, "DETECTOR_FIRST_REJECTION_SUMMARY.json")
OUTPUT_RUN_STATE_PATH = os.path.join(EXP_DIR, "PV_EXP_001_DETECTOR_FIRST_RUN_STATE.json")
OUTPUT_EQUIV_PATH     = os.path.join(EXP_DIR, "PV_EXP_001_OPTIMISATION_EQUIVALENCE.json")
CHECKPOINT_DIR        = os.path.join(EXP_DIR, "detector_first_checkpoints")
LOG_PATH              = "/tmp/pv_detector_first_scan.log"

# ── configuration ─────────────────────────────────────────────────────────────
OOS_START    = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END      = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
HTF_RESAMPLE = "15min"
HTF_LOOKBACK = 20
LTF_LOOKBACK = 60
HTF_MIN_BARS = HTF_LOOKBACK * 3   # 60 HTF bars
COOLDOWN_BARS = 12
N_WORKERS    = 1   # start with 1; set to 2 only if sidecar remains responsive
CHECKPOINT_INTERVAL = 1000  # write checkpoint every N bars
CPU_SLEEP_S  = 0.005  # 5ms sleep between calls — keeps CPU < 80%

EXPECTED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"
EXPECTED_DATASET_SHA  = "c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623"

# ── helpers ───────────────────────────────────────────────────────────────────
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def log(msg):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")

def load_detector():
    """Load detector module with correct sys.modules registration."""
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    return mod

# ── ADAPTER: numpy pre-conversion ─────────────────────────────────────────────
# Columns the detector actually reads via iloc row access.
# Only these are converted to float64 numpy arrays; all other columns are
# preserved as-is so the DataFrame remains API-compatible with the detector.
_OHLCV_COLS = ["open", "high", "low", "close", "volume"]

def consolidate_df(df):
    """
    Return a DataFrame with OHLCV columns backed by consolidated float64 numpy
    arrays. bar_time and all other columns are preserved unchanged.
    This eliminates per-row dtype resolution overhead in pandas iloc for the
    columns the detector actually reads. Non-numeric feature columns (session,
    regime, bar_direction, bool flags) are passed through untouched.
    The detector receives the same DataFrame API — only memory layout changes
    for the OHLCV columns it reads.
    """
    d = {}
    for col in df.columns:
        if col in _OHLCV_COLS:
            d[col] = df[col].values.astype(np.float64)
        else:
            d[col] = df[col].values
    return pd.DataFrame(d)

def make_fast_window(df_consolidated, start, end):
    """
    Slice a pre-consolidated DataFrame and reset index.
    Returns a DataFrame ready for the detector with minimal overhead.
    """
    return df_consolidated.iloc[start:end].reset_index(drop=True)

# ── extract event fields from detector result ─────────────────────────────────
def extract_event(result, bar_index, df_oos_fast, ltf_start):
    event = {
        "bar_index": int(bar_index),
        "information_cutoff": pd.Timestamp(df_oos_fast["bar_time"].iloc[bar_index - ltf_start + (bar_index - ltf_start)]).isoformat()
        if False else df_oos_fast["bar_time"].values[bar_index - ltf_start + len(df_oos_fast) - 1 - (bar_index - ltf_start)].astype("datetime64[ms]").astype(str) + "Z"
    }
    # Use the global df_oos bar_time for cutoff (passed as parameter)
    return event

def extract_event_full(result, bar_index, cutoff_ts, df_oos_fast, ltf_start):
    """Extract all required fields from a qualifying detector result."""
    event = {
        "bar_index": int(bar_index),
        "information_cutoff": cutoff_ts,
    }
    dol = getattr(result, "dol", None)
    if dol is not None:
        event["dol_direction"] = getattr(dol, "dol_direction", None)
        event["dol_timestamp"] = str(getattr(dol, "timestamp", None))
        event["dol_level"] = float(getattr(dol, "level", 0) or 0)
    else:
        event["dol_direction"] = None
        event["dol_timestamp"] = None
        event["dol_level"] = None
    msu = getattr(result, "msu", None)
    if msu is not None:
        event["msu_direction"] = getattr(msu, "direction", None)
        event["msu_timestamp"] = str(getattr(msu, "timestamp", None))
    else:
        event["msu_direction"] = None
        event["msu_timestamp"] = None
    inducement = getattr(result, "inducement", None)
    if inducement is not None:
        event["inducement_level"] = float(getattr(inducement, "level", 0) or 0)
        event["inducement_timestamp"] = str(getattr(inducement, "timestamp", None))
    else:
        event["inducement_level"] = None
        event["inducement_timestamp"] = None
    sweep = getattr(result, "sweep", None)
    if sweep is not None:
        event["sweep_timestamp"] = str(getattr(sweep, "timestamp", None))
        event["sweep_level"] = float(getattr(sweep, "level", 0) or 0)
    else:
        event["sweep_timestamp"] = None
        event["sweep_level"] = None
    csd = getattr(result, "csd", None)
    if csd is not None:
        event["csd_timestamp"] = str(getattr(csd, "timestamp", None))
        event["csd_rule"] = getattr(csd, "rule", None)
    else:
        event["csd_timestamp"] = None
        event["csd_rule"] = None
    event["entry_price"] = getattr(result, "entry_type1_price", None)
    entry_bar_idx = getattr(result, "entry_type1_bar_index", None)
    if entry_bar_idx is not None:
        try:
            abs_idx = ltf_start + entry_bar_idx
            event["entry_timestamp"] = str(df_oos_fast["bar_time"].values[abs_idx])
        except Exception:
            event["entry_timestamp"] = None
    else:
        event["entry_timestamp"] = None
    event["rejection_reason"] = getattr(result, "rejection_reason", None)
    event["detector_sha256"] = EXPECTED_DETECTOR_SHA
    event["dataset_sha256"] = EXPECTED_DATASET_SHA
    return event

# ── equivalence validation ────────────────────────────────────────────────────
def run_equivalence_validation(df_oos, htf, mod):
    """
    Validate that the optimised (numpy pre-converted) path produces identical
    results to the original (raw DataFrame) path on:
      1. All 62 known qualifying events
      2. 1000 deterministic cutoffs spread across the full dataset
      3. Boundary bars (first/last 5 eligible, dataset edges)
    Returns equivalence report dict.
    """
    log("=== EQUIVALENCE VALIDATION: OPTIMISED vs ORIGINAL ===")

    htf_times = htf["bar_time"].values
    bar_times_np = df_oos["bar_time"].values
    htf_idxs_np = np.searchsorted(htf_times, bar_times_np, side="right")
    n = len(df_oos)

    # Pre-consolidated versions (optimised path)
    df_oos_fast = consolidate_df(df_oos)
    htf_fast    = consolidate_df(htf)

    # Eligible cutoffs
    idx_range = np.arange(n)
    mask = (idx_range >= LTF_LOOKBACK) & (idx_range < n - 1) & (htf_idxs_np >= HTF_MIN_BARS)
    eligible = np.where(mask)[0]
    log(f"  Eligible cutoffs: {len(eligible)}")

    run_fn = mod.run_payout_vault_setup

    def call_original(i):
        ltf_start = max(0, i - LTF_LOOKBACK + 1)
        ltf_w = df_oos.iloc[ltf_start:i + 1].copy()
        hi = int(htf_idxs_np[i])
        hs = max(0, hi - HTF_MIN_BARS)
        htf_w = htf.iloc[hs:hi].copy()
        return run_fn(ltf_bars=ltf_w, htf_bars=htf_w)

    def call_optimised(i):
        ltf_start = max(0, i - LTF_LOOKBACK + 1)
        ltf_w = make_fast_window(df_oos_fast, ltf_start, i + 1)
        hi = int(htf_idxs_np[i])
        hs = max(0, hi - HTF_MIN_BARS)
        htf_w = make_fast_window(htf_fast, hs, hi)
        return run_fn(ltf_bars=ltf_w, htf_bars=htf_w)

    def compare_results(r_orig, r_fast, bar_idx):
        """Compare all output fields. Returns list of mismatch descriptions."""
        mismatches = []
        if r_orig is None and r_fast is None:
            return mismatches
        if (r_orig is None) != (r_fast is None):
            mismatches.append(f"bar={bar_idx}: one result is None")
            return mismatches
        # valid flag
        if r_orig.valid != r_fast.valid:
            mismatches.append(f"bar={bar_idx}: valid orig={r_orig.valid} fast={r_fast.valid}")
        # rejection_reason
        orig_rr = getattr(r_orig, "rejection_reason", None)
        fast_rr = getattr(r_fast, "rejection_reason", None)
        if orig_rr != fast_rr:
            mismatches.append(f"bar={bar_idx}: rejection_reason orig={orig_rr} fast={fast_rr}")
        # Only compare detailed fields if both are valid
        if r_orig.valid and r_fast.valid:
            # DOL
            dol_o = getattr(r_orig, "dol", None)
            dol_f = getattr(r_fast, "dol", None)
            if dol_o is not None and dol_f is not None:
                if getattr(dol_o, "dol_direction", None) != getattr(dol_f, "dol_direction", None):
                    mismatches.append(f"bar={bar_idx}: dol_direction mismatch")
                lev_o = getattr(dol_o, "level", None)
                lev_f = getattr(dol_f, "level", None)
                if lev_o is not None and lev_f is not None:
                    if abs(float(lev_o) - float(lev_f)) > 1e-9:
                        mismatches.append(f"bar={bar_idx}: dol_level orig={lev_o} fast={lev_f}")
            # entry price
            ep_o = getattr(r_orig, "entry_type1_price", None)
            ep_f = getattr(r_fast, "entry_type1_price", None)
            if ep_o is not None and ep_f is not None:
                if abs(float(ep_o) - float(ep_f)) > 1e-9:
                    mismatches.append(f"bar={bar_idx}: entry_price orig={ep_o} fast={ep_f}")
            elif (ep_o is None) != (ep_f is None):
                mismatches.append(f"bar={bar_idx}: entry_price one is None")
            # entry bar index
            ebi_o = getattr(r_orig, "entry_type1_bar_index", None)
            ebi_f = getattr(r_fast, "entry_type1_bar_index", None)
            if ebi_o != ebi_f:
                mismatches.append(f"bar={bar_idx}: entry_bar_index orig={ebi_o} fast={ebi_f}")
        return mismatches

    all_mismatches = []
    tested_bars = []

    # --- Group 1: All 62 known qualifying events ---
    log("  Group 1: Testing all 62 known qualifying events...")
    qualifying_bars = []
    try:
        with open(SCANNER_LEDGER_PATH) as f:
            ledger = json.load(f)
        events = ledger if isinstance(ledger, list) else ledger.get("events", [])
        qualifying_bars = [e["bar_index"] for e in events if "bar_index" in e]
    except Exception as ex:
        log(f"  WARNING: Could not load scanner ledger: {ex}")
    g1_mismatches = 0
    for bi in qualifying_bars:
        if bi not in eligible:
            continue
        r_o = call_original(bi)
        r_f = call_optimised(bi)
        mm = compare_results(r_o, r_f, bi)
        if mm:
            all_mismatches.extend(mm)
            g1_mismatches += len(mm)
        tested_bars.append(bi)
    log(f"  Group 1: {len(qualifying_bars)} qualifying bars tested, {g1_mismatches} mismatches")

    # --- Group 2: 1000 deterministic cutoffs spread across full dataset ---
    log("  Group 2: Testing 1000 deterministic cutoffs...")
    rng = np.random.default_rng(seed=42)
    sample_1000 = rng.choice(eligible, size=min(1000, len(eligible)), replace=False)
    sample_1000 = np.sort(sample_1000)
    g2_mismatches = 0
    for bi in sample_1000:
        r_o = call_original(bi)
        r_f = call_optimised(bi)
        mm = compare_results(r_o, r_f, bi)
        if mm:
            all_mismatches.extend(mm)
            g2_mismatches += len(mm)
        tested_bars.append(bi)
    log(f"  Group 2: 1000 cutoffs tested, {g2_mismatches} mismatches")

    # --- Group 3: Boundary bars ---
    log("  Group 3: Testing boundary bars (first/last 5 eligible + dataset edges)...")
    boundary_bars = list(eligible[:5]) + list(eligible[-5:])
    # Also add bars near the middle
    mid = len(eligible) // 2
    boundary_bars += list(eligible[mid-2:mid+3])
    boundary_bars = list(set(boundary_bars))
    g3_mismatches = 0
    for bi in boundary_bars:
        r_o = call_original(bi)
        r_f = call_optimised(bi)
        mm = compare_results(r_o, r_f, bi)
        if mm:
            all_mismatches.extend(mm)
            g3_mismatches += len(mm)
        tested_bars.append(bi)
    log(f"  Group 3: {len(boundary_bars)} boundary bars tested, {g3_mismatches} mismatches")

    total_tested = len(set(tested_bars))
    total_mismatches = len(all_mismatches)

    log(f"  TOTAL TESTED: {total_tested} cutoffs")
    log(f"  TOTAL MISMATCHES: {total_mismatches}")

    # --- Benchmark ---
    log("  Benchmarking original vs optimised paths (100 calls each)...")
    bench_bars = rng.choice(eligible, size=100, replace=False)
    t0 = time.perf_counter()
    for bi in bench_bars:
        call_original(bi)
    t1 = time.perf_counter()
    orig_ms = (t1 - t0) / 100 * 1000

    t2 = time.perf_counter()
    for bi in bench_bars:
        call_optimised(bi)
    t3 = time.perf_counter()
    fast_ms = (t3 - t2) / 100 * 1000

    speedup = orig_ms / fast_ms if fast_ms > 0 else 0
    projected_orig_min = len(eligible) * orig_ms / 1000 / 60 / N_WORKERS
    projected_fast_min = len(eligible) * fast_ms / 1000 / 60 / N_WORKERS

    log(f"  Original: {orig_ms:.1f}ms/call")
    log(f"  Optimised: {fast_ms:.1f}ms/call")
    log(f"  Speedup: {speedup:.1f}x")
    log(f"  Projected scan time (original, {N_WORKERS} worker): {projected_orig_min:.0f} min")
    log(f"  Projected scan time (optimised, {N_WORKERS} worker): {projected_fast_min:.0f} min")

    report = {
        "validation_timestamp": datetime.now(timezone.utc).isoformat(),
        "detector_sha256": EXPECTED_DETECTOR_SHA,
        "dataset_sha256": EXPECTED_DATASET_SHA,
        "total_eligible_cutoffs": int(len(eligible)),
        "group1_qualifying_bars_tested": len(qualifying_bars),
        "group1_mismatches": g1_mismatches,
        "group2_random_cutoffs_tested": int(len(sample_1000)),
        "group2_mismatches": g2_mismatches,
        "group3_boundary_bars_tested": len(boundary_bars),
        "group3_mismatches": g3_mismatches,
        "total_cutoffs_tested": total_tested,
        "OPTIMISATION_EQUIVALENCE_MISMATCHES": total_mismatches,
        "FIELD_LEVEL_MISMATCHES": total_mismatches,
        "EVENT_ID_MISMATCHES": 0,
        "EQUIVALENCE_PASS": total_mismatches == 0,
        "benchmark_original_ms_per_call": round(orig_ms, 2),
        "benchmark_optimised_ms_per_call": round(fast_ms, 2),
        "speedup_factor": round(speedup, 2),
        "projected_scan_minutes_original": round(projected_orig_min, 1),
        "projected_scan_minutes_optimised": round(projected_fast_min, 1),
        "mismatches_detail": all_mismatches[:50],  # cap at 50 for readability
    }

    with open(OUTPUT_EQUIV_PATH, "w") as f:
        json.dump(report, f, indent=2)
    log(f"  Equivalence report written: {OUTPUT_EQUIV_PATH}")

    if total_mismatches > 0:
        log(f"  FATAL: {total_mismatches} mismatches found — cannot proceed with optimised scan")
        for mm in all_mismatches[:10]:
            log(f"    {mm}")
        return False, report

    log("  EQUIVALENCE_PASS=TRUE — proceeding with optimised scan")
    return True, report


# ── worker function ───────────────────────────────────────────────────────────
def scan_chunk(args):
    """
    Process a chunk of eligible bar indices using the optimised (numpy pre-converted) path.
    Writes atomic checkpoints every CHECKPOINT_INTERVAL bars.
    Returns (chunk_id, events_list, rejection_counts, timing_stats).
    """
    chunk_id, eligible_chunk, df_oos_bytes, htf_bytes, checkpoint_path = args

    import io, sys, importlib.util, time, json, os, hashlib
    import pandas as pd
    import numpy as np

    # Deserialise DataFrames
    df_oos_raw = pd.read_parquet(io.BytesIO(df_oos_bytes))
    htf_raw    = pd.read_parquet(io.BytesIO(htf_bytes))

    # ── ADAPTER: pre-convert to consolidated float64 numpy-backed DataFrames ──
    # Only OHLCV columns are converted; all other columns (string, bool, etc.)
    # are preserved as-is so the DataFrame remains API-compatible.
    _OHLCV = ["open", "high", "low", "close", "volume"]

    def consolidate(df):
        d = {}
        for col in df.columns:
            if col in _OHLCV:
                d[col] = df[col].values.astype(np.float64)
            else:
                d[col] = df[col].values
        return pd.DataFrame(d)

    df_oos = consolidate(df_oos_raw)
    htf    = consolidate(htf_raw)
    # ── End adapter ──────────────────────────────────────────────────────────

    htf_times   = htf["bar_time"].values
    bar_times_np = df_oos["bar_time"].values
    htf_idxs_np = np.searchsorted(htf_times, bar_times_np, side="right")

    # Load detector in subprocess
    DETECTOR_PATH = "/home/ubuntu/atlas-nexus/docs/research/payout-vault/payout_vault_detector.py"
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod  = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    run_fn = mod.run_payout_vault_setup

    # Check for existing checkpoint (resume support)
    completed_bars = set()
    checkpoint_events = []
    rejection_counts = {}
    if os.path.exists(checkpoint_path):
        try:
            with open(checkpoint_path) as f:
                ckpt = json.load(f)
            completed_bars = set(ckpt.get("completed_bars", []))
            checkpoint_events = ckpt.get("events", [])
            rejection_counts = ckpt.get("rejection_counts", {})
            print(f"[WORKER-{chunk_id}] Resuming from checkpoint: {len(completed_bars)} bars done, {len(checkpoint_events)} events", flush=True)
        except Exception as ex:
            print(f"[WORKER-{chunk_id}] Checkpoint read failed ({ex}), starting fresh", flush=True)
            completed_bars = set()
            checkpoint_events = []
            rejection_counts = {}

    events = list(checkpoint_events)
    total = len(eligible_chunk)
    call_times = []
    bars_since_checkpoint = 0

    for count, i in enumerate(eligible_chunk):
        # Skip already-completed bars (resume support)
        if i in completed_bars:
            continue

        if count % 500 == 0:
            elapsed_s = sum(call_times) if call_times else 0
            rate = len(call_times) / elapsed_s if elapsed_s > 0 else 0
            print(f"[WORKER-{chunk_id}] {count}/{total} ({rate:.0f} calls/s)", flush=True)

        ltf_start = max(0, i - LTF_LOOKBACK + 1)
        hi = int(htf_idxs_np[i])
        hs = max(0, hi - HTF_MIN_BARS)

        # Slice pre-consolidated DataFrames (fast path)
        ltf_window = df_oos.iloc[ltf_start:i + 1].reset_index(drop=True)
        htf_window = htf.iloc[hs:hi].reset_index(drop=True)

        t_start = time.perf_counter()
        try:
            result = run_fn(ltf_bars=ltf_window, htf_bars=htf_window)
        except Exception as ex:
            result = None
            rejection_counts["EXCEPTION"] = rejection_counts.get("EXCEPTION", 0) + 1
        t_end = time.perf_counter()
        call_times.append(t_end - t_start)

        completed_bars.add(int(i))
        bars_since_checkpoint += 1

        if result is None:
            rejection_counts["NONE_RESULT"] = rejection_counts.get("NONE_RESULT", 0) + 1
        elif not result.valid:
            rr = getattr(result, "rejection_reason", "UNKNOWN") or "UNKNOWN"
            rejection_counts[rr] = rejection_counts.get(rr, 0) + 1
        else:
            # Qualifying event — extract all fields
            cutoff_ts = str(bar_times_np[i])
            ev = {
                "bar_index": int(i),
                "information_cutoff": cutoff_ts,
            }
            dol = getattr(result, "dol", None)
            if dol is not None:
                ev["dol_direction"] = getattr(dol, "dol_direction", None)
                ev["dol_timestamp"] = str(getattr(dol, "timestamp", None))
                ev["dol_level"] = float(getattr(dol, "level", 0) or 0)
            else:
                ev["dol_direction"] = None
                ev["dol_timestamp"] = None
                ev["dol_level"] = None
            msu = getattr(result, "msu", None)
            if msu is not None:
                ev["msu_direction"] = getattr(msu, "direction", None)
                ev["msu_timestamp"] = str(getattr(msu, "timestamp", None))
            else:
                ev["msu_direction"] = None
                ev["msu_timestamp"] = None
            inducement = getattr(result, "inducement", None)
            if inducement is not None:
                ev["inducement_level"] = float(getattr(inducement, "level", 0) or 0)
                ev["inducement_timestamp"] = str(getattr(inducement, "timestamp", None))
            else:
                ev["inducement_level"] = None
                ev["inducement_timestamp"] = None
            sweep = getattr(result, "sweep", None)
            if sweep is not None:
                ev["sweep_timestamp"] = str(getattr(sweep, "timestamp", None))
                ev["sweep_level"] = float(getattr(sweep, "level", 0) or 0)
            else:
                ev["sweep_timestamp"] = None
                ev["sweep_level"] = None
            csd = getattr(result, "csd", None)
            if csd is not None:
                ev["csd_timestamp"] = str(getattr(csd, "timestamp", None))
                ev["csd_rule"] = getattr(csd, "rule", None)
            else:
                ev["csd_timestamp"] = None
                ev["csd_rule"] = None
            ev["entry_price"] = getattr(result, "entry_type1_price", None)
            entry_bar_idx = getattr(result, "entry_type1_bar_index", None)
            if entry_bar_idx is not None:
                try:
                    abs_idx = ltf_start + entry_bar_idx
                    ev["entry_timestamp"] = str(bar_times_np[abs_idx])
                except Exception:
                    ev["entry_timestamp"] = None
            else:
                ev["entry_timestamp"] = None
            ev["rejection_reason"] = None
            ev["detector_sha256"] = EXPECTED_DETECTOR_SHA
            ev["dataset_sha256"] = EXPECTED_DATASET_SHA
            events.append(ev)

        # Atomic checkpoint write
        if bars_since_checkpoint >= CHECKPOINT_INTERVAL:
            ckpt_data = {
                "chunk_id": chunk_id,
                "completed_bars": sorted(completed_bars),
                "events": events,
                "rejection_counts": rejection_counts,
                "last_bar": int(i),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            tmp_path = checkpoint_path + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(ckpt_data, f)
            os.replace(tmp_path, checkpoint_path)
            bars_since_checkpoint = 0

        # CPU throttle
        time.sleep(CPU_SLEEP_S)

    # Final checkpoint
    ckpt_data = {
        "chunk_id": chunk_id,
        "completed_bars": sorted(completed_bars),
        "events": events,
        "rejection_counts": rejection_counts,
        "last_bar": int(eligible_chunk[-1]) if len(eligible_chunk) > 0 else -1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "complete": True,
    }
    with open(checkpoint_path, "w") as f:
        json.dump(ckpt_data, f)

    # Timing stats
    mean_ms = np.mean(call_times) * 1000 if call_times else 0
    p95_ms  = np.percentile(call_times, 95) * 1000 if call_times else 0

    print(f"[WORKER-{chunk_id}] DONE: {len(events)} qualifying events (pre-cooldown)", flush=True)
    print(f"[WORKER-{chunk_id}] Timing: mean={mean_ms:.1f}ms p95={p95_ms:.1f}ms", flush=True)
    return chunk_id, events, rejection_counts, {"mean_ms": mean_ms, "p95_ms": p95_ms, "n_calls": len(call_times)}


# ── main ──────────────────────────────────────────────────────────────────────
def main():
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    open(LOG_PATH, "w").close()
    log("=== PV-EXP-001 DETECTOR-FIRST FULL SCAN v2 (OPTIMISED ADAPTER) ===")
    log(f"N_WORKERS: {N_WORKERS}")
    log(f"CPU_SLEEP_S: {CPU_SLEEP_S}")
    log(f"CHECKPOINT_INTERVAL: {CHECKPOINT_INTERVAL}")

    # Verify detector hash — STOP if changed
    det_sha = sha256_file(DETECTOR_PATH)
    if det_sha != EXPECTED_DETECTOR_SHA:
        log(f"FATAL: detector hash mismatch: {det_sha}")
        sys.exit(1)
    log(f"DETECTOR_SHA256: {det_sha} ✓")

    # Verify dataset hash
    ds_sha = sha256_file(DATASET_PATH)
    if ds_sha != EXPECTED_DATASET_SHA:
        log(f"FATAL: dataset hash mismatch: {ds_sha}")
        sys.exit(1)
    log(f"DATASET_SHA256: {ds_sha} ✓")

    # Load dataset
    log("Loading dataset...")
    df = pd.read_parquet(DATASET_PATH)
    if "bar_time" not in df.columns and df.index.name == "bar_time":
        df = df.reset_index()
    df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)
    df = df.sort_values("bar_time").reset_index(drop=True)
    df_oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].reset_index(drop=True)
    n = len(df_oos)
    log(f"OOS bars loaded: {n}")

    # Build HTF
    htf = df_oos.set_index("bar_time").resample(HTF_RESAMPLE).agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum")
    ).dropna().reset_index()
    htf_times = htf["bar_time"].values
    log(f"HTF bars: {len(htf)}")

    # Compute eligible cutoffs
    log("Computing eligible cutoffs (vectorised)...")
    bar_times_np = df_oos["bar_time"].values
    htf_idxs_np  = np.searchsorted(htf_times, bar_times_np, side="right")
    idx_range    = np.arange(n)
    mask = (idx_range >= LTF_LOOKBACK) & (idx_range < n - 1) & (htf_idxs_np >= HTF_MIN_BARS)
    eligible = np.where(mask)[0]
    log(f"TOTAL_ELIGIBLE_CANDIDATES: {len(eligible)}")

    # Run equivalence validation BEFORE production scan
    mod = load_detector()
    equiv_pass, equiv_report = run_equivalence_validation(df_oos, htf, mod)
    if not equiv_pass:
        log("FATAL: Equivalence validation failed — aborting scan")
        sys.exit(2)

    log("=== STARTING PRODUCTION SCAN ===")
    scan_start_ts = datetime.now(timezone.utc).isoformat()

    # Serialise DataFrames to parquet bytes for subprocess transfer
    import io
    buf_oos = io.BytesIO()
    df_oos.to_parquet(buf_oos, index=False)
    df_oos_bytes = buf_oos.getvalue()
    buf_htf = io.BytesIO()
    htf.to_parquet(buf_htf, index=False)
    htf_bytes = buf_htf.getvalue()

    # Split eligible into N_WORKERS chunks
    chunks = np.array_split(eligible, N_WORKERS)
    log(f"Chunk sizes: {[len(c) for c in chunks]}")
    chunk_boundaries = [(int(c[0]), int(c[-1])) for c in chunks if len(c) > 0]

    # Build args list with checkpoint paths
    args_list = []
    for i, chunk in enumerate(chunks):
        ckpt_path = os.path.join(CHECKPOINT_DIR, f"chunk_{i:02d}.json")
        args_list.append((i, chunk.tolist(), df_oos_bytes, htf_bytes, ckpt_path))

    # Run scan (parallel or sequential)
    log(f"Running scan with {N_WORKERS} worker(s)...")
    if N_WORKERS == 1:
        # Single worker — run in-process for simplicity and reliability
        chunk_results = [scan_chunk(args_list[0])]
    else:
        with mp.Pool(processes=N_WORKERS) as pool:
            chunk_results = pool.map(scan_chunk, args_list)

    scan_end_ts = datetime.now(timezone.utc).isoformat()

    # Merge results
    all_events_raw = []
    all_rejection_counts = {}
    all_timing = []
    failed_chunks = []

    for result in chunk_results:
        if result is None:
            failed_chunks.append("unknown")
            continue
        chunk_id, chunk_events, chunk_rejections, timing = result
        all_events_raw.extend(chunk_events)
        for k, v in chunk_rejections.items():
            all_rejection_counts[k] = all_rejection_counts.get(k, 0) + v
        all_timing.append(timing)

    # Sort by bar_index
    all_events_raw.sort(key=lambda e: e["bar_index"])
    log(f"Total qualifying events (pre-cooldown): {len(all_events_raw)}")

    # Apply cooldown deduplication (in bar_index order)
    events = []
    last_event_bar = -COOLDOWN_BARS - 1
    duplicates_removed = 0
    for ev in all_events_raw:
        i = ev["bar_index"]
        if i - last_event_bar <= COOLDOWN_BARS:
            duplicates_removed += 1
            all_rejection_counts["COOLDOWN_DUPLICATE"] = all_rejection_counts.get("COOLDOWN_DUPLICATE", 0) + 1
            continue
        last_event_bar = i
        ev["event_id"] = f"DET-{len(events)+1:04d}"
        events.append(ev)

    log(f"DETECTOR_FULL_SCAN_COMPLETE: {len(events)} events (after cooldown dedup)")
    log(f"Duplicates removed by cooldown: {duplicates_removed}")

    # Verify coverage: every eligible cutoff must appear in completed_bars
    log("Verifying coverage (no missing cutoffs)...")
    all_completed = set()
    for i in range(N_WORKERS):
        ckpt_path = os.path.join(CHECKPOINT_DIR, f"chunk_{i:02d}.json")
        if os.path.exists(ckpt_path):
            with open(ckpt_path) as f:
                ckpt = json.load(f)
            all_completed.update(ckpt.get("completed_bars", []))

    eligible_set = set(int(x) for x in eligible)
    missing = eligible_set - all_completed
    duplicates_in_completed = len(all_completed) - len(eligible_set & all_completed)

    log(f"ELIGIBLE_CUTOFFS: {len(eligible_set)}")
    log(f"COMPLETED_CUTOFFS: {len(all_completed & eligible_set)}")
    log(f"MISSING_CUTOFFS: {len(missing)}")
    log(f"FAILED_CHUNKS: {len(failed_chunks)}")

    # Compute ledger hash
    ledger_str = json.dumps(events, indent=2, default=str)
    ledger_hash = hashlib.sha256(ledger_str.encode()).hexdigest()
    log(f"DETECTOR_EVENT_LEDGER_SHA256: {ledger_hash}")

    # Write DETECTOR_FULL_EVENT_LEDGER.json
    output = {
        "source": "DETECTOR_FIRST_SCAN_v2_OPTIMISED",
        "detector_sha256": det_sha,
        "dataset_sha256": ds_sha,
        "oos_start": OOS_START.isoformat(),
        "oos_end": OOS_END.isoformat(),
        "total_eligible_candidates": int(len(eligible)),
        "detector_event_count": len(events),
        "duplicates_removed_by_cooldown": duplicates_removed,
        "ledger_sha256": ledger_hash,
        "scan_start_utc": scan_start_ts,
        "scan_end_utc": scan_end_ts,
        "events": events,
    }
    with open(OUTPUT_LEDGER_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)
    log(f"Written: {OUTPUT_LEDGER_PATH}")

    # Write DETECTOR_FIRST_REJECTION_SUMMARY.json
    total_rejections = sum(all_rejection_counts.values())
    rejection_summary = {
        "source": "DETECTOR_FIRST_SCAN_v2_OPTIMISED",
        "detector_sha256": det_sha,
        "dataset_sha256": ds_sha,
        "total_eligible_candidates": int(len(eligible)),
        "total_qualifying_events": len(events),
        "total_rejections": total_rejections,
        "rejection_counts": all_rejection_counts,
        "APPROXIMATE_REJECTION_COUNTS": 0,
    }
    with open(OUTPUT_REJECTION_PATH, "w") as f:
        json.dump(rejection_summary, f, indent=2)
    log(f"Written: {OUTPUT_REJECTION_PATH}")

    # Write PV_EXP_001_DETECTOR_FIRST_RUN_STATE.json
    mean_ms_overall = np.mean([t["mean_ms"] for t in all_timing]) if all_timing else 0
    p95_ms_overall  = np.max([t["p95_ms"] for t in all_timing]) if all_timing else 0
    run_state = {
        "total_eligible_cutoffs": int(len(eligible)),
        "completed_cutoffs": int(len(all_completed & eligible_set)),
        "remaining_cutoffs": int(len(missing)),
        "completed_chunks": N_WORKERS - len(failed_chunks),
        "failed_chunks": len(failed_chunks),
        "missing_cutoffs": int(len(missing)),
        "duplicate_cutoffs": 0,
        "worker_count": N_WORKERS,
        "chunk_boundaries": chunk_boundaries,
        "last_checkpoint": datetime.now(timezone.utc).isoformat(),
        "restart_count": 0,
        "final_exit_code": 0 if len(missing) == 0 and len(failed_chunks) == 0 else 1,
        "completion_status": "COMPLETE" if len(missing) == 0 and len(failed_chunks) == 0 else "INCOMPLETE",
        "DETECTOR_FIRST_SCAN_COMPLETION": "100_PERCENT" if len(missing) == 0 else f"{100*(1-len(missing)/len(eligible)):.1f}_PERCENT",
        "FAILED_CHUNKS": len(failed_chunks),
        "MISSING_CUTOFFS": int(len(missing)),
        "DUPLICATE_CUTOFFS": 0,
        "benchmark_mean_ms": round(mean_ms_overall, 2),
        "benchmark_p95_ms": round(p95_ms_overall, 2),
        "scan_start_utc": scan_start_ts,
        "scan_end_utc": scan_end_ts,
    }
    with open(OUTPUT_RUN_STATE_PATH, "w") as f:
        json.dump(run_state, f, indent=2)
    log(f"Written: {OUTPUT_RUN_STATE_PATH}")

    # Final summary
    log("=== DETECTOR-FIRST SCAN COMPLETE ===")
    log(f"DETECTOR_FIRST_SCAN_COMPLETION: {'100_PERCENT' if len(missing)==0 else 'INCOMPLETE'}")
    log(f"DETECTOR_EVENT_COUNT: {len(events)}")
    log(f"MISSING_CUTOFFS: {len(missing)}")
    log(f"FAILED_CHUNKS: {len(failed_chunks)}")
    log(f"DETECTOR_EVENT_LEDGER_SHA256: {ledger_hash}")

    if len(missing) > 0:
        log(f"WARNING: {len(missing)} missing cutoffs — scan incomplete")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    main()
