"""
PV-EXP-001 Sampled Equivalence Harness — Sprint 123A.10 Gate G10
Runs on a stratified sample of 3000 bars (every 18th eligible bar) to produce
statistically representative equivalence results in ~5 minutes.
"""
from __future__ import annotations
import sys, json, hashlib, time
from pathlib import Path
import pandas as pd
import numpy as np
import importlib.util

REPO_ROOT     = Path("/home/ubuntu/atlas-nexus")
DETECTOR_PATH = REPO_ROOT / "docs/research/payout-vault/payout_vault_detector.py"
OUTPUT_DIR    = REPO_ROOT / "docs/research/payout-vault/experiments/PV-EXP-001"
DATASET_PATH  = Path("/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet")

APPROVED_DETECTOR_SHA = "946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec"
OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
HTF_LOOKBACK = 20
LTF_WINDOW   = 60
SAMPLE_STEP  = 18  # every 18th bar → ~3134 bars from 56415 eligible

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

def load_detector():
    spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
    mod  = importlib.util.module_from_spec(spec)
    sys.modules["payout_vault_detector"] = mod
    spec.loader.exec_module(mod)
    return mod

def build_htf_full(oos):
    sub = oos.set_index("bar_time")
    htf = sub[["open","high","low","close","volume"]].resample(
        "15min", closed="left", label="left"
    ).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna()
    return htf.reset_index()

def scanner_fields(oos, htf, htf_times_np, i):
    cutoff = oos.loc[i, "bar_time"]
    htf_end_idx = int(np.searchsorted(htf_times_np, cutoff.to_datetime64(), side="right"))
    if htf_end_idx < HTF_LOOKBACK * 2:
        return {"qualifying": False, "direction": None, "rejection": "GATE1_FAIL"}
    htf_w = htf.iloc[:htf_end_idx]
    htf_h = htf_w["high"].values
    htf_l = htf_w["low"].values
    n = len(htf_w)
    sh_idx, sl_idx = [], []
    for k in range(2, n-2):
        if htf_h[k]>htf_h[k-1] and htf_h[k]>htf_h[k-2] and htf_h[k]>htf_h[k+1] and htf_h[k]>htf_h[k+2]: sh_idx.append(k)
        if htf_l[k]<htf_l[k-1] and htf_l[k]<htf_l[k-2] and htf_l[k]<htf_l[k+1] and htf_l[k]<htf_l[k+2]: sl_idx.append(k)
    if not sh_idx or not sl_idx: return {"qualifying": False, "direction": None, "rejection": "GATE1_FAIL"}
    last_sh, last_sl = sh_idx[-1], sl_idx[-1]
    dol_dir = "bearish" if last_sh > last_sl else "bullish"
    dol_price = htf_l[last_sl] if dol_dir == "bearish" else htf_h[last_sh]
    ltf_s = max(0, i-LTF_WINDOW+1)
    ltf_w = oos.iloc[ltf_s:i+1]
    ltf_h = ltf_w["high"].values; ltf_l = ltf_w["low"].values
    ltf_o = ltf_w["open"].values; ltf_c = ltf_w["close"].values
    n_ltf = len(ltf_w); lb = 3
    ltf_sh, ltf_sl = [], []
    for k in range(lb, n_ltf-lb):
        if all(ltf_h[k]>=ltf_h[k-j] for j in range(1,lb+1)) and all(ltf_h[k]>=ltf_h[k+j] for j in range(1,lb+1)): ltf_sh.append((k, ltf_h[k]))
        if all(ltf_l[k]<=ltf_l[k-j] for j in range(1,lb+1)) and all(ltf_l[k]<=ltf_l[k+j] for j in range(1,lb+1)): ltf_sl.append((k, ltf_l[k]))
    if not ltf_sh or not ltf_sl: return {"qualifying": False, "direction": None, "rejection": "GATE2_FAIL"}
    msu = "neutral"
    if len(ltf_sh)>=2 and len(ltf_sl)>=2:
        hh = ltf_sh[-1][1]>ltf_sh[-2][1]; hl = ltf_sl[-1][1]>ltf_sl[-2][1]
        lh = ltf_sh[-1][1]<ltf_sh[-2][1]; ll = ltf_sl[-1][1]<ltf_sl[-2][1]
        if hh and hl: msu="bullish"
        elif lh and ll: msu="bearish"
    if msu=="neutral": return {"qualifying": False, "direction": None, "rejection": "GATE2_FAIL"}
    if msu!=dol_dir: return {"qualifying": False, "direction": None, "rejection": "GATE3_FAIL"}
    ind_idx = ltf_sl[-1][0] if dol_dir=="bullish" else ltf_sh[-1][0]
    ind_price = ltf_sl[-1][1] if dol_dir=="bullish" else ltf_sh[-1][1]
    swept=False; sw_idx=None; sw_price=None
    for k in range(ind_idx+1, n_ltf):
        if dol_dir=="bullish" and ltf_l[k]<ind_price: swept=True; sw_idx=k; sw_price=ltf_l[k]; break
        if dol_dir=="bearish" and ltf_h[k]>ind_price: swept=True; sw_idx=k; sw_price=ltf_h[k]; break
    if not swept: return {"qualifying": False, "direction": None, "rejection": "GATE5_FAIL"}
    sw_mid = ltf_l[sw_idx] + 0.5*(ltf_h[sw_idx]-ltf_l[sw_idx])
    if ltf_h[sw_idx]==ltf_l[sw_idx]: return {"qualifying": False, "direction": None, "rejection": "GATE6_FAIL"}
    csd=False
    for k in range(sw_idx+1, min(sw_idx+1+3, n_ltf)):
        pb_h = max(ltf_o[k-1],ltf_c[k-1]) if k>0 else None
        pb_l = min(ltf_o[k-1],ltf_c[k-1]) if k>0 else None
        r1 = ltf_c[k]>sw_mid if dol_dir=="bullish" else ltf_c[k]<sw_mid
        r2 = (pb_h is not None and ltf_c[k]>pb_h) if dol_dir=="bullish" else (pb_l is not None and ltf_c[k]<pb_l)
        if r1 or r2: csd=True; break
    if not csd: return {"qualifying": False, "direction": None, "rejection": "GATE6_FAIL"}
    return {"qualifying": True, "direction": dol_dir, "rejection": None}

def detector_fields(det, oos, htf, i):
    cutoff = oos.loc[i, "bar_time"]
    htf_w = htf[htf["bar_time"] <= cutoff].copy().reset_index(drop=True)
    ltf_s = max(0, i-LTF_WINDOW+1)
    ltf_w = oos.iloc[ltf_s:i+1].copy().reset_index(drop=True)
    sr = det.run_payout_vault_setup(htf_w, ltf_w, config=CONFIG)
    if sr.rejection_reason:
        code = sr.rejection_reason.split(":")[0].strip()
        return {"qualifying": False, "direction": None, "rejection": code}
    return {"qualifying": True, "direction": sr.dol.dol_direction if sr.dol else None, "rejection": None}

print("PV-EXP-001 SAMPLED EQUIVALENCE HARNESS")
print("="*60)
actual_sha = sha256_file(DETECTOR_PATH)
assert actual_sha == APPROVED_DETECTOR_SHA, f"Detector hash mismatch: {actual_sha}"
print(f"BASELINE_HASHES_VERIFIED: TRUE")
det = load_detector()
print(f"Detector loaded: {DETECTOR_PATH.name}")
oos = pd.read_parquet(DATASET_PATH)
oos = oos[(oos["bar_time"]>=OOS_START)&(oos["bar_time"]<=OOS_END)].copy().reset_index(drop=True)
htf = build_htf_full(oos)
htf_times_np = htf["bar_time"].values
min_bars = HTF_LOOKBACK*2 + LTF_WINDOW
eligible = [i for i in range(min_bars, len(oos))]
sample = eligible[::SAMPLE_STEP]
print(f"OOS bars: {len(oos)} | Eligible: {len(eligible)} | Sample: {len(sample)} (every {SAMPLE_STEP}th)")
print(f"Running sampled comparison...")

mismatches = []
scanner_events = 0
detector_events = 0
t0 = time.time()

for idx, i in enumerate(sample):
    sf = scanner_fields(oos, htf, htf_times_np, i)
    df = detector_fields(det, oos, htf, i)
    if sf["qualifying"] != df["qualifying"] or sf["direction"] != df["direction"]:
        mismatches.append({
            "bar_index": i,
            "cutoff_ts": str(oos.loc[i,"bar_time"]),
            "scanner_qualifying": sf["qualifying"],
            "detector_qualifying": df["qualifying"],
            "scanner_direction": sf["direction"],
            "detector_direction": df["direction"],
            "scanner_rejection": sf["rejection"],
            "detector_rejection": df["rejection"],
        })
    if sf["qualifying"]: scanner_events += 1
    if df["qualifying"]: detector_events += 1
    if (idx+1) % 100 == 0:
        elapsed = time.time()-t0
        eta = elapsed/(idx+1)*(len(sample)-idx-1)
        print(f"  {idx+1}/{len(sample)} | mismatches: {len(mismatches)} | ETA: {eta:.0f}s")

elapsed = time.time()-t0
mismatch_rate = len(mismatches)/len(sample)*100
print(f"\nCOMPLETE in {elapsed:.1f}s")
print(f"SAMPLE_SIZE:              {len(sample)}")
print(f"SCANNER_EVENTS:           {scanner_events}")
print(f"DETECTOR_EVENTS:          {detector_events}")
print(f"TOTAL_MISMATCHES:         {len(mismatches)}")
print(f"MISMATCH_RATE:            {mismatch_rate:.2f}%")
print(f"FULL_GATE_EQUIVALENCE:    {'TRUE' if len(mismatches)==0 else 'FALSE'}")

# Categorise mismatches
false_pos = [m for m in mismatches if m["scanner_qualifying"] and not m["detector_qualifying"]]
false_neg = [m for m in mismatches if not m["scanner_qualifying"] and m["detector_qualifying"]]
dir_mismatch = [m for m in mismatches if m["scanner_qualifying"]==m["detector_qualifying"] and m["scanner_direction"]!=m["detector_direction"]]
print(f"SCANNER_FALSE_POSITIVES:  {len(false_pos)} (scanner says QUALIFY, detector says REJECT)")
print(f"SCANNER_FALSE_NEGATIVES:  {len(false_neg)} (scanner says REJECT, detector says QUALIFY)")
print(f"DIRECTION_MISMATCHES:     {len(dir_mismatch)}")

# Extrapolate to full dataset
extrap_events = int(detector_events / len(sample) * len(eligible))
print(f"\nEXTRAPOLATED_DETECTOR_EVENTS (full OOS): ~{extrap_events}")

# Save results
out = {
    "experiment_id": "PV-EXP-001",
    "sprint": "123A.10",
    "harness_type": "SAMPLED",
    "sample_step": SAMPLE_STEP,
    "sample_size": len(sample),
    "eligible_bars": len(eligible),
    "scanner_events_in_sample": scanner_events,
    "detector_events_in_sample": detector_events,
    "total_mismatches": len(mismatches),
    "mismatch_rate_pct": round(mismatch_rate, 4),
    "false_positives": len(false_pos),
    "false_negatives": len(false_neg),
    "direction_mismatches": len(dir_mismatch),
    "full_gate_equivalence": len(mismatches)==0,
    "extrapolated_detector_events_full_oos": extrap_events,
    "elapsed_seconds": round(elapsed, 1),
    "mismatch_sample": mismatches[:20],
}
out_path = OUTPUT_DIR / "PV_EXP_001_EQUIVALENCE_SAMPLED.json"
with open(out_path, "w") as f:
    json.dump(out, f, indent=2, default=str)
print(f"\nResults saved: {out_path}")
