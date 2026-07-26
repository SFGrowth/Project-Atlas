"""
PV-EXP-001 Detector-First Full Scan (Parallel)
================================================
Runs the APPROVED DETECTOR independently across every eligible evaluation cutoff
in the OOS dataset using multiprocessing for speed.

This is the authoritative source for DETECTOR_EVENT_COUNT and proves
FALSE_NEGATIVES=0 when compared with the scanner's event set.

Eligible cutoff = any bar index i where:
  - bar_time is within OOS range (2025-10-01 to 2026-07-20)
  - enough HTF bars exist before i (HTF_LOOKBACK * 3 = 60 HTF bars)
  - enough LTF bars exist before i (LTF_LOOKBACK = 60 bars)
  - the bar after i exists (entry bar i+1 must be in dataset)

Output:
  DETECTOR_FULL_EVENT_LEDGER.json  — all events found by detector-first scan
"""
import sys
import os
import json
import hashlib
import importlib.util
import multiprocessing as mp
import pandas as pd
import numpy as np
from datetime import datetime, timezone

# ── paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = "/home/ubuntu/atlas-nexus"
DETECTOR_PATH = os.path.join(REPO_ROOT, "docs/research/payout-vault/payout_vault_detector.py")
DATASET_PATH = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
EXP_DIR = os.path.join(REPO_ROOT, "docs/research/payout-vault/experiments/PV-EXP-001")
OUTPUT_PATH = os.path.join(EXP_DIR, "DETECTOR_FULL_EVENT_LEDGER.json")
LOG_PATH = "/tmp/pv_detector_first_scan.log"

# ── configuration ─────────────────────────────────────────────────────────────
OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
HTF_RESAMPLE = "15min"
HTF_LOOKBACK = 20
LTF_LOOKBACK = 60
HTF_MIN_BARS = HTF_LOOKBACK * 3   # 60 HTF bars
COOLDOWN_BARS = 12
N_WORKERS = 2  # number of parallel workers (matches CPU count)

EXPECTED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"

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

# ── worker function (runs in subprocess) ─────────────────────────────────────
def scan_chunk(args):
    """
    Process a chunk of eligible bar indices.
    Returns list of qualifying events (before cooldown — cooldown applied in main).
    """
    chunk_id, eligible_chunk, df_oos_bytes, htf_bytes = args

    # Deserialise DataFrames from parquet bytes
    import io
    df_oos = pd.read_parquet(io.BytesIO(df_oos_bytes))
    htf = pd.read_parquet(io.BytesIO(htf_bytes))
    htf_times = htf["bar_time"].values

    # Load detector in subprocess
    import sys, importlib.util
    DETECTOR_PATH = "/home/ubuntu/atlas-nexus/docs/research/payout-vault/payout_vault_detector.py"
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    run_fn = mod.run_payout_vault_setup

    bar_times_np = df_oos["bar_time"].values
    htf_idxs_np = np.searchsorted(htf_times, bar_times_np, side="right")

    events = []
    total = len(eligible_chunk)

    for count, i in enumerate(eligible_chunk):
        if count % 500 == 0:
            print(f"[WORKER-{chunk_id}] {count}/{total}", flush=True)

        ltf_start = max(0, i - LTF_LOOKBACK + 1)
        ltf_window = df_oos.iloc[ltf_start:i + 1].copy()
        hi = int(htf_idxs_np[i])
        hs = max(0, hi - HTF_LOOKBACK * 3)
        htf_window = htf.iloc[hs:hi].copy()

        try:
            result = run_fn(ltf_bars=ltf_window, htf_bars=htf_window)
        except Exception:
            continue

        if result is None or not result.valid:
            continue

        # Extract event fields
        event = {
            "bar_index": int(i),
            "information_cutoff": df_oos.iloc[i]["bar_time"].isoformat(),
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

        event["entry_price"] = getattr(result, "entry_type1_price", None)
        entry_bar_idx = getattr(result, "entry_type1_bar_index", None)
        if entry_bar_idx is not None:
            try:
                event["entry_timestamp"] = df_oos.iloc[ltf_start + entry_bar_idx]["bar_time"].isoformat()
            except Exception:
                event["entry_timestamp"] = None
        else:
            event["entry_timestamp"] = None

        event["rejection_reason"] = getattr(result, "rejection_reason", None)
        events.append(event)

    print(f"[WORKER-{chunk_id}] DONE: {len(events)} qualifying events (pre-cooldown)", flush=True)
    return events

# ── main ──────────────────────────────────────────────────────────────────────
def main():
    open(LOG_PATH, "w").close()
    log("=== PV-EXP-001 DETECTOR-FIRST FULL SCAN (PARALLEL) ===")
    log(f"N_WORKERS: {N_WORKERS}")

    # Verify detector hash
    det_sha = sha256_file(DETECTOR_PATH)
    if det_sha != EXPECTED_DETECTOR_SHA:
        log(f"FATAL: detector hash mismatch: {det_sha}")
        sys.exit(1)
    log(f"DETECTOR_SHA256: {det_sha} ✓")

    # Load dataset
    df = pd.read_parquet(DATASET_PATH)
    if "bar_time" not in df.columns and df.index.name == "bar_time":
        df = df.reset_index()
    df["bar_time"] = pd.to_datetime(df["bar_time"], utc=True)
    df = df.sort_values("bar_time").reset_index(drop=True)
    df_oos = df[(df["bar_time"] >= OOS_START) & (df["bar_time"] <= OOS_END)].reset_index(drop=True)
    n = len(df_oos)
    log(f"OOS bars loaded: {n}")

    # Build HTF array
    htf = df_oos.set_index("bar_time").resample(HTF_RESAMPLE).agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum")
    ).dropna().reset_index()
    htf_times = htf["bar_time"].values
    log(f"HTF bars: {len(htf)}")

    # Vectorised eligible cutoffs
    log("Computing eligible cutoffs (vectorised)...")
    bar_times_np = df_oos["bar_time"].values
    htf_idxs_np = np.searchsorted(htf_times, bar_times_np, side="right")
    idx_range = np.arange(n)
    mask = (idx_range >= LTF_LOOKBACK) & (idx_range < n - 1) & (htf_idxs_np >= HTF_MIN_BARS)
    eligible = np.where(mask)[0]
    log(f"TOTAL_ELIGIBLE_CANDIDATES: {len(eligible)}")

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

    # Run parallel scan
    log("Starting parallel scan...")
    args_list = [(i, chunk.tolist(), df_oos_bytes, htf_bytes) for i, chunk in enumerate(chunks)]

    with mp.Pool(processes=N_WORKERS) as pool:
        chunk_results = pool.map(scan_chunk, args_list)

    # Merge results from all chunks (maintain bar_index order)
    all_events_raw = []
    for chunk_events in chunk_results:
        all_events_raw.extend(chunk_events)

    # Sort by bar_index
    all_events_raw.sort(key=lambda e: e["bar_index"])
    log(f"Total qualifying events (pre-cooldown): {len(all_events_raw)}")

    # Apply cooldown deduplication (must be done after merging, in order)
    events = []
    last_event_bar = -COOLDOWN_BARS - 1
    for ev in all_events_raw:
        i = ev["bar_index"]
        if i - last_event_bar <= COOLDOWN_BARS:
            continue
        last_event_bar = i
        ev["event_id"] = f"DET-{len(events)+1:04d}"
        events.append(ev)

    log(f"DETECTOR_FULL_SCAN_COMPLETE: {len(events)} events found (after cooldown)")

    # Compute ledger hash
    ledger_str = json.dumps(events, indent=2, default=str)
    ledger_hash = hashlib.sha256(ledger_str.encode()).hexdigest()
    log(f"DETECTOR_EVENT_LEDGER_SHA256: {ledger_hash}")

    output = {
        "source": "DETECTOR_FIRST_SCAN",
        "detector_sha256": det_sha,
        "dataset_sha256": sha256_file(DATASET_PATH),
        "oos_start": OOS_START.isoformat(),
        "oos_end": OOS_END.isoformat(),
        "total_eligible_candidates": int(len(eligible)),
        "detector_event_count": len(events),
        "ledger_sha256": ledger_hash,
        "events": events
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2, default=str)
    log(f"Written: {OUTPUT_PATH}")
    log("=== DETECTOR-FIRST SCAN COMPLETE ===")

if __name__ == "__main__":
    mp.set_start_method("spawn", force=True)
    main()
