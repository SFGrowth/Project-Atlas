import sys, importlib.util, json
import pandas as pd
import numpy as np

DATASET_PATH = "/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet"
DETECTOR_PATH = "/home/ubuntu/atlas-nexus/docs/research/payout-vault/payout_vault_detector.py"
HTF_RESAMPLE = "15min"
HTF_LOOKBACK = 20
LTF_WINDOW   = 60

spec = importlib.util.spec_from_file_location("payout_vault_detector", DETECTOR_PATH)
mod  = importlib.util.module_from_spec(spec)
sys.modules["payout_vault_detector"] = mod
spec.loader.exec_module(mod)
run_setup = mod.run_payout_vault_setup

print("Loading dataset...")
df_full = pd.read_parquet(DATASET_PATH)
OOS_START = pd.Timestamp("2025-10-01", tz="UTC")
OOS_END   = pd.Timestamp("2026-07-20 23:59:59", tz="UTC")
df_oos = df_full[(df_full["bar_time"] >= OOS_START) & (df_full["bar_time"] <= OOS_END)].copy().reset_index(drop=True)
print(f"OOS bars: {len(df_oos)}")

htf_full = df_oos[["bar_time","open","high","low","close","volume"]].copy()
htf_full = htf_full.set_index("bar_time")
htf_full = htf_full[["open","high","low","close","volume"]].resample(
    HTF_RESAMPLE, closed="left", label="left"
).agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"})
htf_full = htf_full.dropna(subset=["open"]).reset_index()
print(f"HTF bars: {len(htf_full)}")

htf_times_ns = htf_full["bar_time"].values.astype("int64")
ltf_times_ns = df_oos["bar_time"].values.astype("int64")

TARGET_BARS = [13192, 15383, 19285, 31909]
print("\n=== RUNNING DETECTOR ON 4 SCANNER-ONLY BARS ===")
for target_bar in TARGET_BARS:
    htf_idx = int(np.searchsorted(htf_times_ns, ltf_times_ns[target_bar], side="right")) - 1
    hs = max(0, htf_idx - HTF_LOOKBACK * 2)
    hi = htf_idx + 1
    ltf_start = max(0, target_bar - LTF_WINDOW)
    htf_slice = htf_full.iloc[hs:hi].copy().reset_index(drop=True)
    ltf_slice = df_oos.iloc[ltf_start:target_bar+1].copy().reset_index(drop=True)
    result = run_setup(htf_bars=htf_slice, ltf_bars=ltf_slice, config={"htf_lookback": HTF_LOOKBACK, "ltf_swing_lookback": 3})
    bar_time = df_oos["bar_time"].iloc[target_bar]
    print(f"\n  bar={target_bar} ({bar_time})")
    print(f"  valid={result.valid}")
    print(f"  rejection_reason={result.rejection_reason}")
    if result.valid:
        print(f"  direction={getattr(result, 'dol_direction', getattr(result, 'direction', '?'))}")
    with open('/home/ubuntu/atlas-nexus/docs/research/payout-vault/experiments/PV-EXP-001/detector_first_checkpoints/chunk_00.json') as f:
        ckpt = json.load(f)
    completed = ckpt.get('completed_bars', [])
    print(f"  in_checkpoint={target_bar in completed}")
print("\n=== DONE ===")
