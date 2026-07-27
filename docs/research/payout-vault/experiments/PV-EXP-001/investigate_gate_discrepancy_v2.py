"""
Investigate the gate logic discrepancy:
Scanner: 114 pre-cooldown qualifying events
Detector-first: 258 pre-cooldown qualifying events
"""
import json, sys, pandas as pd, numpy as np, importlib.util
sys.path.insert(0, '/home/ubuntu/atlas-nexus')

with open('docs/research/payout-vault/experiments/PV-EXP-001/detector_first_checkpoints/chunk_00.json') as f:
    cp = json.load(f)
detector_events = cp['events']

with open('docs/research/payout-vault/experiments/PV-EXP-001/PV_EXP_001_EVENT_LEDGER.json') as f:
    scanner_ledger = json.load(f)
scanner_events = scanner_ledger['events']

scanner_bars = set(e['bar_index'] for e in scanner_events)
detector_bars = set(e['bar_index'] for e in detector_events)
det_only = sorted(detector_bars - scanner_bars)
print(f"Detector pre-cooldown: {len(detector_bars)}")
print(f"Scanner post-cooldown: {len(scanner_bars)}")
print(f"Detector-only bars: {len(det_only)}")

df = pd.read_parquet('/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet')
oos_start = pd.Timestamp('2025-10-01', tz='UTC')
oos_end = pd.Timestamp('2026-07-20 23:59:59', tz='UTC')
oos = df[(df['bar_time'] >= oos_start) & (df['bar_time'] <= oos_end)].reset_index(drop=True)
print(f"OOS bars: {len(oos)}")

HTF_LOOKBACK = 20; LTF_WINDOW = 60; HTF_RESAMPLE = "15min"; SWING_LB = 3; COOLDOWN_BARS = 12
MIN_BARS = HTF_LOOKBACK * 3 + LTF_WINDOW

htf = oos.set_index('bar_time').resample(HTF_RESAMPLE).agg({'open':'first','high':'max','low':'min','close':'last','volume':'sum'}).dropna().reset_index()
htf_high = htf['high'].values; htf_low = htf['low'].values; htf_times = htf['bar_time'].values

def swing_high(arr, lb):
    n=len(arr); sh=np.zeros(n,dtype=bool)
    for i in range(lb,n-lb):
        if arr[i]==max(arr[i-lb:i+lb+1]): sh[i]=True
    return sh

def swing_low(arr, lb):
    n=len(arr); sl=np.zeros(n,dtype=bool)
    for i in range(lb,n-lb):
        if arr[i]==min(arr[i-lb:i+lb+1]): sl[i]=True
    return sl

htf_sh = swing_high(htf_high, SWING_LB)
htf_sl = swing_low(htf_low, SWING_LB)
ltf_times = oos['bar_time'].values
htf_bar_for_ltf = np.searchsorted(htf_times, ltf_times, side='right') - 1
print("Precomputation done")

spec = importlib.util.spec_from_file_location("payout_vault_detector","docs/research/payout-vault/payout_vault_detector.py")
mod = importlib.util.module_from_spec(spec)
sys.modules["payout_vault_detector"] = mod
spec.loader.exec_module(mod)
run_payout_vault_setup = mod.run_payout_vault_setup

sample = det_only[:30]
gate_rejections = {}

for i in sample:
    if i < MIN_BARS:
        gate_rejections[i] = 'BELOW_MIN_BARS'; continue
    htf_idx = htf_bar_for_ltf[i]
    if htf_idx < HTF_LOOKBACK * 2:
        gate_rejections[i] = 'GATE1_HTF_HISTORY'; continue
    hs = max(0, htf_idx - HTF_LOOKBACK * 3)
    hi = htf_idx - SWING_LB
    if hi <= hs:
        gate_rejections[i] = 'GATE1_HTF_RANGE'; continue
    sh_indices = np.where(htf_sh[hs:hi])[0]
    sl_indices = np.where(htf_sl[hs:hi])[0]
    if len(sh_indices) == 0 or len(sl_indices) == 0:
        gate_rejections[i] = 'GATE1_NO_SWINGS'; continue
    last_sh_idx = sh_indices[-1]; last_sl_idx = sl_indices[-1]
    if last_sh_idx > last_sl_idx:
        dol_direction = "bearish"; dol_level = htf_low[hs+last_sl_idx]; dol_ts = htf_times[hs+last_sl_idx]
    else:
        dol_direction = "bullish"; dol_level = htf_high[hs+last_sh_idx]; dol_ts = htf_times[hs+last_sh_idx]
    ltf_start = max(0, i - LTF_WINDOW)
    ltf_slice = oos.iloc[ltf_start:i+1].copy()
    htf_slice = htf.iloc[max(0, htf_idx - HTF_LOOKBACK * 2):htf_idx+1].copy()
    try:
        result = run_payout_vault_setup(ltf_bars=ltf_slice, htf_bars=htf_slice,
            information_cutoff=oos['bar_time'].iloc[i], dol_direction=dol_direction,
            dol_level=dol_level, dol_timestamp=pd.Timestamp(dol_ts))
        if result.valid:
            gate_rejections[i] = f'DETECTOR_VALID_TRUE (dir={dol_direction})'
        else:
            gate_rejections[i] = f'DETECTOR_VALID_FALSE: {result.rejection_reason} (dir={dol_direction})'
    except Exception as e:
        gate_rejections[i] = f'DETECTOR_ERROR: {str(e)[:100]}'

print("\n=== Gate analysis for 30 detector-only bars ===")
from collections import Counter
counts = Counter(gate_rejections.values())
for gate, count in sorted(counts.items(), key=lambda x: -x[1]):
    print(f"  {count:3d}  {gate}")
print("\n=== Individual results ===")
for bar, gate in sorted(gate_rejections.items()):
    print(f"  bar {bar:6d}: {gate}")
