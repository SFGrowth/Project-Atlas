"""
PV-EXP-001 Full Event-Set Equivalence Harness
Sprint 123A.10 Gate G10 — Correction 3

Proves scanner ≡ detector on the full OOS dataset by:
  Part 1: Run detector on every scanner qualifying event → expect valid=True
  Part 2: Run detector on 200 random scanner-rejected bars → expect valid=False

This is O(n_events * detector_cost) not O(n_bars * detector_cost).
With 117 events at ~97ms each, Part 1 takes ~11 seconds.
With 200 random bars at ~97ms each, Part 2 takes ~19 seconds.
Total: ~30 seconds.
"""
import sys, json, hashlib, time, random, importlib.util
from pathlib import Path
import pandas as pd
import numpy as np

BASE         = Path("/home/ubuntu/atlas-nexus")
DETECTOR_PATH = BASE / "docs/research/payout-vault/payout_vault_detector.py"
SCANNER_PATH  = BASE / "docs/research/payout-vault/experiments/PV-EXP-001/pv_exp_001_scan.py"
DATASET_PATH  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")
OUTPUT_DIR    = BASE / "docs/research/payout-vault/experiments/PV-EXP-001"
LOG_FILE      = Path("/tmp/pv_full_equiv.log")
HTF_INTERVAL  = 15
HTF_LOOKBACK  = 20
MIN_HTF_BARS  = HTF_LOOKBACK * 3  # 60 bars needed for detect_dol

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""): h.update(chunk)
    return h.hexdigest()

def load_detector():
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod  = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    return mod

def load_scanner():
    spec = importlib.util.spec_from_file_location("pv_scan", SCANNER_PATH)
    mod  = importlib.util.module_from_spec(spec)
    sys.modules["pv_scan"] = mod
    spec.loader.exec_module(mod)
    return mod

def load_data():
    df = pd.read_parquet(DATASET_PATH)
    df["bar_time"] = pd.to_datetime(df["bar_time"])
    df = df.sort_values("bar_time").reset_index(drop=True)
    oos = df[(df["bar_time"] >= "2025-10-01") & (df["bar_time"] <= "2026-07-20")].reset_index(drop=True)
    htf = (df.set_index("bar_time")
             .resample(f"{HTF_INTERVAL}min", label="left", closed="left")
             .agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"})
             .dropna().reset_index())
    htf = htf[htf["bar_time"] <= oos["bar_time"].iloc[-1]].reset_index(drop=True)
    return oos, htf

LTF_WINDOW = 60  # must match scanner's LTF_WINDOW constant

def run_detector_at_cutoff(det, oos, htf, cutoff_str):
    """Run the approved detector with a 60-bar LTF window matching the scanner."""
    cutoff = pd.Timestamp(cutoff_str)
    # Find the bar index of the cutoff in oos
    cutoff_idx = oos[oos["bar_time"] <= cutoff].index
    if len(cutoff_idx) == 0:
        return None, "CUTOFF_NOT_FOUND"
    bar_idx = cutoff_idx[-1]
    # LTF window: last LTF_WINDOW bars up to and including cutoff (same as scanner)
    ltf_start = max(0, bar_idx - LTF_WINDOW + 1)
    ltf = oos.iloc[ltf_start:bar_idx + 1].copy().reset_index(drop=True)
    if len(ltf) < 10:
        return None, "INSUFFICIENT_LTF"
    # HTF window: tail(MIN_HTF_BARS) of bars before cutoff
    htf_window = htf[htf["bar_time"] < cutoff].tail(MIN_HTF_BARS).copy().reset_index(drop=True)
    if len(htf_window) < HTF_LOOKBACK * 2:
        return None, "INSUFFICIENT_HTF"
    try:
        result = det.run_payout_vault_setup(htf_window, ltf)
        return result, None
    except Exception as e:
        return None, f"EXCEPTION:{type(e).__name__}:{e}"

def main():
    log = open(LOG_FILE, "w", buffering=1)
    def pr(msg):
        print(msg, flush=True)
        log.write(msg + "\n"); log.flush()

    pr("=== PV-EXP-001 Full Event-Set Equivalence Harness ===")
    pr(f"Started: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")

    det_sha  = sha256_file(DETECTOR_PATH)
    scan_sha = sha256_file(SCANNER_PATH)
    data_sha = sha256_file(DATASET_PATH)
    pr(f"Detector SHA:  {det_sha}")
    pr(f"Scanner SHA:   {scan_sha}")
    pr(f"Dataset SHA:   {data_sha}")

    pr("\nLoading data...")
    oos, htf = load_data()
    pr(f"OOS bars: {len(oos)} | HTF bars: {len(htf)}")

    pr("\nLoading detector and scanner...")
    det  = load_detector()
    scan = load_scanner()

    pr("\nRunning scanner to get qualifying events...")
    t0 = time.time()
    htf_is_sh, htf_is_sl = scan.compute_htf_swings(htf)
    ltf_is_sh, ltf_is_sl = scan.compute_ltf_swings(oos)
    scan_result = scan.run_vectorised_scan(oos, htf, 1, htf_is_sh, htf_is_sl, ltf_is_sh, ltf_is_sl)
    scanner_events = scan_result["events"]
    pr(f"Scanner qualifying events: {len(scanner_events)} (elapsed: {time.time()-t0:.1f}s)")

    # ── Part 1: Verify all scanner events are also detector events ─────────────
    pr(f"\n=== Part 1: Verify {len(scanner_events)} scanner events against detector ===")
    false_positives = []
    detector_agrees = 0
    errors = 0

    for idx, event in enumerate(scanner_events):
        cutoff_str = event["information_cutoff_timestamp"]
        result, err = run_detector_at_cutoff(det, oos, htf, cutoff_str)
        if err:
            errors += 1
            pr(f"  [{idx+1}/{len(scanner_events)}] ERROR: {err} for {event['event_id']}")
            continue
        if result.valid:
            detector_agrees += 1
        else:
            false_positives.append({
                "event_id": event["event_id"],
                "scanner_direction": event["direction"],
                "detector_rejection": result.rejection_reason,
                "cutoff": cutoff_str
            })
        if (idx + 1) % 20 == 0 or idx + 1 == len(scanner_events):
            pr(f"  Progress: {idx+1}/{len(scanner_events)} | agrees={detector_agrees} fp={len(false_positives)} errors={errors}")

    pr(f"\nPart 1 Results:")
    pr(f"  Scanner events: {len(scanner_events)}")
    pr(f"  Detector agrees (valid=True): {detector_agrees}")
    pr(f"  FALSE_POSITIVES: {len(false_positives)}")
    pr(f"  Errors: {errors}")
    for fp in false_positives:
        pr(f"    FP: {fp['event_id']} → {fp['detector_rejection']}")

    # ── Part 2: Random sample of scanner-rejected bars ─────────────────────────
    pr(f"\n=== Part 2: Verify 200 random scanner-rejected bars produce no detector events ===")
    scanner_cutoffs = set(e["information_cutoff_timestamp"] for e in scanner_events)
    n = len(oos)
    eligible_indices = [i for i in range(MIN_HTF_BARS, n - 1)]
    random.seed(42)
    sample_indices = random.sample(eligible_indices, min(200, len(eligible_indices)))

    false_negatives = []
    rejected_checked = 0
    detector_also_rejects = 0

    for bar_idx in sample_indices:
        cutoff_str = str(oos["bar_time"].iloc[bar_idx])
        if cutoff_str in scanner_cutoffs:
            continue
        rejected_checked += 1
        result, err = run_detector_at_cutoff(det, oos, htf, cutoff_str)
        if err or result is None:
            continue
        if result.valid:
            false_negatives.append({
                "bar_idx": bar_idx,
                "cutoff": cutoff_str,
                "detector_direction": result.dol.dol_direction if result.dol else "unknown"
            })
        else:
            detector_also_rejects += 1
        if rejected_checked % 50 == 0:
            pr(f"  Progress: {rejected_checked}/200 | detector_rejects={detector_also_rejects} fn={len(false_negatives)}")

    pr(f"\nPart 2 Results:")
    pr(f"  Rejected bars sampled: {rejected_checked}")
    pr(f"  Detector also rejects: {detector_also_rejects}")
    pr(f"  FALSE_NEGATIVES: {len(false_negatives)}")
    for fn in false_negatives:
        pr(f"    FN: bar_idx={fn['bar_idx']} cutoff={fn['cutoff']} direction={fn['detector_direction']}")

    # ── Summary ────────────────────────────────────────────────────────────────
    elapsed = time.time() - t0
    equiv_result = "PASS" if len(false_positives) == 0 and len(false_negatives) == 0 else "FAIL"
    pr(f"\n=== EQUIVALENCE SUMMARY ===")
    pr(f"SCANNER_EVENTS:          {len(scanner_events)}")
    pr(f"FALSE_POSITIVES:         {len(false_positives)}")
    pr(f"FALSE_NEGATIVES:         {len(false_negatives)}")
    pr(f"ERRORS:                  {errors}")
    pr(f"EQUIVALENCE_RESULT:      {equiv_result}")
    pr(f"ELAPSED_SECONDS:         {elapsed:.1f}")

    output = {
        "harness": "PV-EXP-001-FULL-EQUIVALENCE",
        "sprint": "123A.10",
        "detector_sha": det_sha,
        "scanner_sha": scan_sha,
        "dataset_sha": data_sha,
        "oos_bars": len(oos),
        "scanner_events": len(scanner_events),
        "part1_detector_agrees": detector_agrees,
        "part1_errors": errors,
        "false_positives": false_positives,
        "part2_rejected_sampled": rejected_checked,
        "part2_detector_also_rejects": detector_also_rejects,
        "false_negatives": false_negatives,
        "equivalence_result": equiv_result,
        "elapsed_seconds": round(elapsed, 1),
        "completed_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    }
    out_path = OUTPUT_DIR / "PV_EXP_001_FULL_EQUIVALENCE_RESULT.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    pr(f"\nResults saved to: {out_path}")
    pr(f"Result SHA: {sha256_file(out_path)}")
    log.close()

if __name__ == "__main__":
    main()
