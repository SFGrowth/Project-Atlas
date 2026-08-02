"""
DARWIN-EQ001-VALIDATION-001 — Vectorised implementation.
Same pre-registered parameters and logic as validate_eq001.py.
Rewritten with NumPy vectorised operations for performance.
"""

import databento as db
import pandas as pd
import numpy as np
from scipy import stats
import json, os
from datetime import datetime, timezone, timedelta
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ────────────────────────────────────────────────────────────────
DATA_PATH   = "/home/ubuntu/atlas-nexus/data/historical/mnq_ohlcv1m_2019_2026.dbn"
OUTPUT_DIR  = "/home/ubuntu/atlas-nexus/sprint-artefacts-eq001"
os.makedirs(OUTPUT_DIR, exist_ok=True)

EMA_LENGTH  = 21
ATR_LENGTH  = 14
THRESHOLD   = 2.0
MNQ_PV      = 2.0
RT_COST_PTS = 2.47          # pre-registered round-trip cost
BOOTSTRAP_N = 1000
FDR_Q       = 0.05
DEGRADED    = {'2019-01-15', '2019-02-22', '2019-03-13'}

# ─── Load data ────────────────────────────────────────────────────────────────
print("Loading data...")
store = db.DBNStore.from_file(DATA_PATH)
df = store.to_df().reset_index()
df.columns = [c.lower() for c in df.columns]

# Timestamp
if 'ts_event' in df.columns:
    df['ts'] = pd.to_datetime(df['ts_event'], utc=True)
else:
    df['ts'] = pd.to_datetime(df.index, utc=True)

# Price scaling
if df['close'].iloc[100] > 1_000_000:
    for c in ['open','high','low','close']:
        df[c] = df[c] / 1e9

print(f"Raw rows: {len(df):,}  |  price sample: {df['close'].iloc[100]:.2f}")

# Remove degraded dates and maintenance
df['date_str'] = df['ts'].dt.strftime('%Y-%m-%d')
df = df[~df['date_str'].isin(DEGRADED)]

# Session classification (vectorised)
def classify_session_vec(ts_series: pd.Series) -> pd.Series:
    # Convert UTC to ET offset (approximate: EDT Apr-Oct, EST Nov-Mar)
    month = ts_series.dt.month
    offset = np.where((month >= 4) & (month <= 10), -4, -5)
    et_minutes = (ts_series.dt.hour + offset) * 60 + ts_series.dt.minute
    et_minutes = et_minutes % (24 * 60)  # wrap negative
    rth_open  = 9 * 60 + 30
    rth_close = 16 * 60
    maint_s   = 17 * 60
    maint_e   = 18 * 60
    session = np.where(
        (et_minutes >= maint_s) & (et_minutes < maint_e), 'MAINTENANCE',
        np.where((et_minutes >= rth_open) & (et_minutes < rth_close), 'RTH', 'ETH')
    )
    return pd.Series(session, index=ts_series.index)

df['session'] = classify_session_vec(df['ts'])
df = df[df['session'] != 'MAINTENANCE'].copy().reset_index(drop=True)
print(f"After maintenance removal: {len(df):,} 1m bars")

# Resample to 5m
df.set_index('ts', inplace=True)
df5 = df[['open','high','low','close','volume']].resample('5min').agg(
    {'open':'first','high':'max','low':'min','close':'last','volume':'sum'}
).dropna(subset=['close']).reset_index()
df5['session'] = classify_session_vec(df5['ts'])
df5 = df5[df5['session'] != 'MAINTENANCE'].copy().reset_index(drop=True)
print(f"5m bars: {len(df5):,}")

# ─── Indicators ───────────────────────────────────────────────────────────────
df5['ema21']       = df5['close'].ewm(span=EMA_LENGTH, adjust=False).mean()
# Wilder ATR via ewm
high, low, close = df5['high'].values, df5['low'].values, df5['close'].values
prev_close = np.roll(close, 1); prev_close[0] = close[0]
tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
df5['atr14'] = pd.Series(tr).ewm(alpha=1/ATR_LENGTH, adjust=False).mean().values
df5['ema21_slope'] = df5['ema21'].diff()

# Warmup
WARMUP = max(EMA_LENGTH, ATR_LENGTH) + 5
df5 = df5.iloc[WARMUP:].copy().reset_index(drop=True)
print(f"5m bars after warmup: {len(df5):,}")

# ─── Partitions ───────────────────────────────────────────────────────────────
n = len(df5)
d_end = int(n * 0.60)
v_end = int(n * 0.80)
part = np.full(n, 'HOLDOUT    ', dtype='U12')
part[:d_end]      = 'DISCOVERY'
part[d_end:v_end] = 'VALIDATION'
df5['partition'] = part

print(f"DISCOVERY:  {df5['ts'].iloc[0].date()} – {df5['ts'].iloc[d_end-1].date()} ({d_end:,})")
print(f"VALIDATION: {df5['ts'].iloc[d_end].date()} – {df5['ts'].iloc[v_end-1].date()} ({v_end-d_end:,})")
print(f"HOLDOUT:    {df5['ts'].iloc[v_end].date()} – {df5['ts'].iloc[-1].date()} ({n-v_end:,})")

# ─── Signal detection ─────────────────────────────────────────────────────────
def detect(df: pd.DataFrame, thr: float) -> np.ndarray:
    dist_atr = (df['close'] - df['ema21']).abs() / df['atr14']
    valid = (dist_atr >= thr) & (df['atr14'] > 0) & df['atr14'].notna()
    # Exclude last 4 bars (need forward bars for exits)
    valid.iloc[-4:] = False
    return np.where(valid)[0]

sig_idx = detect(df5, THRESHOLD)
print(f"\nSignals (T={THRESHOLD}): {len(sig_idx):,}")

# Pre-extract arrays for vectorised access
close_arr  = df5['close'].values
open_arr   = df5['open'].values
high_arr   = df5['high'].values
low_arr    = df5['low'].values
ema_arr    = df5['ema21'].values
atr_arr    = df5['atr14'].values
slope_arr  = df5['ema21_slope'].values
sess_arr   = df5['session'].values
part_arr   = df5['partition'].values

# Signal attributes
sig_direction = np.where(close_arr[sig_idx] < ema_arr[sig_idx], 'LONG', 'SHORT')
sig_uptrend   = slope_arr[sig_idx] > 0
# trend_rel: LONG in downtrend = WITH_TREND; LONG in uptrend = AGAINST_TREND
sig_trend_rel = np.where(
    (sig_direction == 'LONG') & ~sig_uptrend, 'WITH_TREND',
    np.where((sig_direction == 'LONG') & sig_uptrend, 'AGAINST_TREND',
    np.where((sig_direction == 'SHORT') & sig_uptrend, 'WITH_TREND', 'AGAINST_TREND'))
)
sig_session   = sess_arr[sig_idx]
sig_partition = part_arr[sig_idx]

print(f"  LONG: {(sig_direction=='LONG').sum():,}  SHORT: {(sig_direction=='SHORT').sum():,}")
print(f"  RTH:  {(sig_session=='RTH').sum():,}   ETH: {(sig_session=='ETH').sum():,}")

# ─── Vectorised trade evaluation ──────────────────────────────────────────────
def eval_trades_vec(sig_idx: np.ndarray, direction: np.ndarray,
                    entry_model: str, exit_model: str, cost_pts: float) -> pd.DataFrame:
    """
    Vectorised trade evaluation.
    entry_model: 'A' or 'B'
    exit_model:  '1','2','3','4'
    """
    ei = sig_idx + 1  # entry bar index
    
    # Entry price = next bar open
    entry_price = open_arr[ei]
    
    # Entry B filter: skip if price already crossed EMA21 before entry
    if entry_model == 'B':
        ema_at_entry = ema_arr[ei]
        long_mask  = direction == 'LONG'
        short_mask = direction == 'SHORT'
        valid_b = np.ones(len(sig_idx), dtype=bool)
        valid_b[long_mask]  = entry_price[long_mask]  < ema_at_entry[long_mask]
        valid_b[short_mask] = entry_price[short_mask] > ema_at_entry[short_mask]
    else:
        valid_b = np.ones(len(sig_idx), dtype=bool)
    
    # Exit prices
    if exit_model == '1':
        exit_price = close_arr[ei + 1]
    elif exit_model == '2':
        exit_price = close_arr[ei + 2]
    elif exit_model == '3':
        exit_price = close_arr[ei + 3]
    elif exit_model == '4':
        # First causal EMA21 touch, capped at 3 bars
        exit_price = np.empty(len(sig_idx))
        for k in range(len(sig_idx)):
            ep = entry_price[k]
            d  = direction[k]
            touched = False
            for j in range(ei[k], min(ei[k] + 4, len(close_arr))):
                ema_j = ema_arr[j]
                if d == 'LONG' and high_arr[j] >= ema_j:
                    exit_price[k] = ema_j
                    touched = True
                    break
                elif d == 'SHORT' and low_arr[j] <= ema_j:
                    exit_price[k] = ema_j
                    touched = True
                    break
            if not touched:
                exit_price[k] = close_arr[min(ei[k] + 3, len(close_arr)-1)]
    
    # Gross P&L in points
    long_mask  = direction == 'LONG'
    short_mask = direction == 'SHORT'
    gross_pts  = np.where(long_mask, exit_price - entry_price, entry_price - exit_price)
    net_pts    = gross_pts - cost_pts
    win        = (net_pts > 0).astype(int)
    
    # MFE/MAE (vectorised over 3-bar window)
    mfe = np.zeros(len(sig_idx))
    mae = np.zeros(len(sig_idx))
    for offset in range(1, 4):
        j = np.minimum(ei + offset, len(close_arr) - 1)
        mfe_long  = high_arr[j] - entry_price
        mae_long  = low_arr[j]  - entry_price
        mfe_short = entry_price - low_arr[j]
        mae_short = entry_price - high_arr[j]
        mfe = np.where(long_mask, np.maximum(mfe, mfe_long), np.maximum(mfe, mfe_short))
        mae = np.where(long_mask, np.minimum(mae, mae_long), np.minimum(mae, mae_short))
    
    df_out = pd.DataFrame({
        'gross_pts':  gross_pts,
        'net_pts':    net_pts,
        'win':        win,
        'mfe_pts':    mfe,
        'mae_pts':    mae,
        'direction':  direction,
        'session':    sig_session,
        'partition':  sig_partition,
        'trend_rel':  sig_trend_rel,
    })
    return df_out[valid_b].reset_index(drop=True)

# ─── Run primary combinations ─────────────────────────────────────────────────
print("\nRunning primary combinations (T=2.0)...")
COST_SCENARIOS = {'BASE': RT_COST_PTS, 'BASE_125': RT_COST_PTS*1.25, 'BASE_150': RT_COST_PTS*1.50}
primary_trades = {}

for entry_model in ['A', 'B']:
    for exit_model in ['1', '2', '3', '4']:
        for cost_label, cost_pts in COST_SCENARIOS.items():
            key = f"E{entry_model}_X{exit_model}_{cost_label}"
            primary_trades[key] = eval_trades_vec(sig_idx, sig_direction, entry_model, exit_model, cost_pts)

print(f"Primary combinations: {len(primary_trades)}")

# Neighbourhood check
print("Neighbourhood check (1.9, 2.0, 2.1)...")
nbr_trades = {}
for thr in [1.9, 2.0, 2.1]:
    idx_t = detect(df5, thr)
    dir_t = np.where(close_arr[idx_t] < ema_arr[idx_t], 'LONG', 'SHORT')
    sess_t = sess_arr[idx_t]
    part_t = part_arr[idx_t]
    slope_t = slope_arr[idx_t]
    uptrend_t = slope_t > 0
    trend_t = np.where(
        (dir_t=='LONG') & ~uptrend_t, 'WITH_TREND',
        np.where((dir_t=='LONG') & uptrend_t, 'AGAINST_TREND',
        np.where((dir_t=='SHORT') & uptrend_t, 'WITH_TREND', 'AGAINST_TREND'))
    )
    # Temporarily override globals for vectorised eval
    _save = (sig_session, sig_partition, sig_trend_rel)
    # Use a direct approach
    ei_t = idx_t + 1
    ep_t = open_arr[ei_t]
    ex_t = close_arr[np.minimum(ei_t + 3, len(close_arr)-1)]
    long_t = dir_t == 'LONG'
    gross_t = np.where(long_t, ex_t - ep_t, ep_t - ex_t)
    net_t   = gross_t - RT_COST_PTS
    nbr_trades[thr] = pd.DataFrame({
        'net_pts': net_t, 'win': (net_t > 0).astype(int),
        'direction': dir_t, 'session': sess_t, 'partition': part_t,
        'trend_rel': trend_t,
    })
    print(f"  T={thr}: {len(idx_t):,} signals")

# ─── Statistical analysis ─────────────────────────────────────────────────────
def analyse(df_t: pd.DataFrame, label: str) -> dict:
    if len(df_t) < 10:
        return {'label': label, 'n': len(df_t), 'status': 'INSUFFICIENT_SAMPLE',
                'classification': 'INSUFFICIENT_SAMPLE'}
    net = df_t['net_pts'].values.astype(float)
    n   = len(net)
    mean_net = float(np.mean(net))
    std_net  = float(np.std(net, ddof=1)) if n > 1 else 0.0
    win_rate = float(np.mean(df_t['win'].values))
    t_stat, p_val = stats.ttest_1samp(net, 0) if std_net > 0 else (0.0, 1.0)
    wins   = net[net > 0].sum() if (net > 0).any() else 0.0
    losses = abs(net[net < 0].sum()) if (net < 0).any() else 0.0
    pf     = (wins / losses) if losses > 0 else (999.0 if wins > 0 else 0.0)
    rng    = np.random.default_rng(42)
    boots  = [np.mean(rng.choice(net, size=n, replace=True)) for _ in range(BOOTSTRAP_N)]
    ci_lo  = float(np.percentile(boots, 2.5))
    ci_hi  = float(np.percentile(boots, 97.5))
    mfe    = float(df_t['mfe_pts'].mean()) if 'mfe_pts' in df_t.columns else 0.0
    mae    = float(df_t['mae_pts'].mean()) if 'mae_pts' in df_t.columns else 0.0
    return {
        'label': label, 'n': n, 'status': 'COMPUTED',
        'mean_net_pts': round(mean_net, 4),
        'std_net_pts':  round(std_net, 4),
        'win_rate':     round(win_rate, 4),
        'profit_factor':round(min(pf, 999.0), 4),
        't_stat':       round(float(t_stat), 4),
        'p_value_raw':  round(float(p_val), 6),
        'ci_lower_95':  round(ci_lo, 4),
        'ci_upper_95':  round(ci_hi, 4),
        'mean_mfe_pts': round(mfe, 4),
        'mean_mae_pts': round(mae, 4),
        'bh_reject':    False,  # filled in below
        'classification': '',   # filled in below
    }

# Build primary results
print("\nComputing statistics...")
primary_results = {}
for exit_model in ['1','2','3','4']:
    key_base = f"EA_X{exit_model}_BASE"
    df_t = primary_trades[key_base]
    
    primary_results[f"ALL_X{exit_model}"]  = analyse(df_t, f"ALL_X{exit_model}")
    for d in ['LONG','SHORT']:
        primary_results[f"{d}_X{exit_model}"] = analyse(df_t[df_t['direction']==d], f"{d}_X{exit_model}")
    for s in ['RTH','ETH']:
        primary_results[f"{s}_X{exit_model}"] = analyse(df_t[df_t['session']==s], f"{s}_X{exit_model}")
    for tr in ['WITH_TREND','AGAINST_TREND']:
        primary_results[f"{tr}_X{exit_model}"] = analyse(df_t[df_t['trend_rel']==tr], f"{tr}_X{exit_model}")
    for d in ['LONG','SHORT']:
        for s in ['RTH','ETH']:
            sub = df_t[(df_t['direction']==d)&(df_t['session']==s)]
            primary_results[f"{s}_{d}_X{exit_model}"] = analyse(sub, f"{s}_{d}_X{exit_model}")
    for p in ['DISCOVERY','VALIDATION','HOLDOUT']:
        primary_results[f"{p}_X{exit_model}"] = analyse(df_t[df_t['partition']==p], f"{p}_X{exit_model}")

# BH-FDR
valid_keys = [k for k,v in primary_results.items() if v['status']=='COMPUTED' and v['n']>=50]
p_vals = [primary_results[k]['p_value_raw'] for k in valid_keys]
n_tests = len(p_vals)
bh_critical = 0.0
if n_tests > 0:
    sidx = np.argsort(p_vals)
    sp   = np.array(p_vals)[sidx]
    bh_thr = [(i+1)/n_tests*FDR_Q for i in range(n_tests)]
    reject = [sp[i] <= bh_thr[i] for i in range(n_tests)]
    if any(reject):
        bh_critical = bh_thr[max(i for i,r in enumerate(reject) if r)]
for k in valid_keys:
    primary_results[k]['bh_reject'] = primary_results[k]['p_value_raw'] <= bh_critical
bh_rejections = sum(1 for k in valid_keys if primary_results[k]['bh_reject'])
print(f"BH-FDR: {n_tests} tests, critical={bh_critical:.6f}, rejections={bh_rejections}")

# Classification
def classify(r: dict) -> str:
    if r['status'] != 'COMPUTED' or r['n'] < 50: return 'INSUFFICIENT_SAMPLE'
    if r['mean_net_pts'] <= 0 or r['profit_factor'] <= 1.0: return 'NEGATIVE_EDGE'
    if r.get('bh_reject') and r['ci_lower_95'] > 0 and r['profit_factor'] > 1.10:
        return 'PROMISING_STRONG'
    if r['mean_net_pts'] > 0 and r['profit_factor'] > 1.0: return 'PROMISING'
    return 'INCONCLUSIVE_POSITIVE'

for k in primary_results:
    primary_results[k]['classification'] = classify(primary_results[k])

# Cost sensitivity
cost_sens = {}
for cl, cp in COST_SCENARIOS.items():
    cost_sens[cl] = analyse(primary_trades[f"EA_X3_{cl}"], f"ALL_{cl}")

# Neighbourhood
nbr_results = {}
for thr, df_t in nbr_trades.items():
    nbr_results[thr] = {
        'all':   analyse(df_t, f"ALL_T{thr}"),
        'long':  analyse(df_t[df_t['direction']=='LONG'], f"LONG_T{thr}"),
        'short': analyse(df_t[df_t['direction']=='SHORT'], f"SHORT_T{thr}"),
    }

# Year-by-year
df_yr = primary_trades["EA_X3_BASE"].copy()
df_yr['year'] = pd.to_datetime(df5['ts'].iloc[
    primary_trades["EA_X3_BASE"].index if hasattr(primary_trades["EA_X3_BASE"].index, '__len__') else range(len(primary_trades["EA_X3_BASE"]))
].values if False else np.arange(len(df_yr))).year
# Simpler: use signal timestamps
sig_ts = df5['ts'].values[sig_idx]
sig_years = pd.to_datetime(sig_ts).year
# Match to trades (Entry A, no filter)
df_yr_base = primary_trades["EA_X3_BASE"].copy()
# Recompute years from sig_idx (Entry A keeps all signals)
years_arr = pd.to_datetime(sig_ts).year
df_yr_base['year'] = years_arr[:len(df_yr_base)]
yearly = {}
for yr in sorted(df_yr_base['year'].unique()):
    yearly[int(yr)] = analyse(df_yr_base[df_yr_base['year']==yr], f"YEAR_{yr}")

# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("RESULTS SUMMARY")
print("="*70)

ranked = [(k,v) for k,v in primary_results.items() if v['status']=='COMPUTED' and v['n']>=50]
ranked.sort(key=lambda x: x[1]['mean_net_pts'], reverse=True)

print(f"\nTop 10 subgroups by mean net P&L (points):")
for k,v in ranked[:10]:
    print(f"  {k:40s}  n={v['n']:6d}  mean={v['mean_net_pts']:+.4f}  "
          f"wr={v['win_rate']:.3f}  pf={v['profit_factor']:.3f}  "
          f"p={v['p_value_raw']:.4f}  bh={v['bh_reject']}  {v['classification']}")

print(f"\nPartition stability (EA, X3, BASE):")
for p in ['DISCOVERY','VALIDATION','HOLDOUT']:
    r = primary_results.get(f"{p}_X3",{})
    if r.get('status')=='COMPUTED':
        print(f"  {p:12s}  n={r['n']:6d}  mean={r['mean_net_pts']:+.4f}  "
              f"wr={r['win_rate']:.3f}  {r['classification']}")

print(f"\nCost sensitivity (EA, X3):")
for cl,r in cost_sens.items():
    if r['status']=='COMPUTED':
        print(f"  {cl:12s}  n={r['n']:6d}  mean={r['mean_net_pts']:+.4f}  "
              f"wr={r['win_rate']:.3f}  pf={r['profit_factor']:.3f}")

print(f"\nNeighbourhood (EA, X3, BASE):")
for thr,nr in nbr_results.items():
    r = nr['all']
    if r['status']=='COMPUTED':
        print(f"  T={thr}  n={r['n']:6d}  mean={r['mean_net_pts']:+.4f}  "
              f"wr={r['win_rate']:.3f}  pf={r['profit_factor']:.3f}")

print(f"\nYear-by-year (EA, X3, BASE):")
for yr,r in sorted(yearly.items()):
    if r['status']=='COMPUTED':
        print(f"  {yr}  n={r['n']:5d}  mean={r['mean_net_pts']:+.4f}  "
              f"wr={r['win_rate']:.3f}  {r['classification']}")

ps = [k for k,v in primary_results.items() if v.get('classification')=='PROMISING_STRONG']
pp = [k for k,v in primary_results.items() if v.get('classification')=='PROMISING']
ne = [k for k,v in primary_results.items() if v.get('classification')=='NEGATIVE_EDGE' and v['n']>=50]
print(f"\nPROMISING_STRONG: {len(ps)}  PROMISING: {len(pp)}  NEGATIVE_EDGE: {len(ne)}")

# ─── Save results JSON ────────────────────────────────────────────────────────
def ser(obj):
    if isinstance(obj, (np.integer,)): return int(obj)
    if isinstance(obj, (np.floating,)): return float(obj)
    if isinstance(obj, (np.bool_,)): return bool(obj)
    if isinstance(obj, dict): return {k: ser(v) for k,v in obj.items()}
    if isinstance(obj, list): return [ser(v) for v in obj]
    return obj

results = {
    'experiment_id': 'DARWIN-EQ001-VALIDATION-001',
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'data_source': 'GLBX.MDP3 ohlcv-1m via Databento',
    'data_rows_5m_after_warmup': len(df5),
    'degraded_dates_excluded': list(DEGRADED),
    'parameters': {
        'ema_length': EMA_LENGTH, 'atr_length': ATR_LENGTH,
        'distance_threshold_atr': THRESHOLD,
        'round_trip_cost_points': RT_COST_PTS,
        'bootstrap_n': BOOTSTRAP_N, 'fdr_q': FDR_Q,
    },
    'partitions': {
        'discovery':  {'start': str(df5['ts'].iloc[0].date()),
                       'end':   str(df5['ts'].iloc[d_end-1].date()), 'n': d_end},
        'validation': {'start': str(df5['ts'].iloc[d_end].date()),
                       'end':   str(df5['ts'].iloc[v_end-1].date()), 'n': v_end-d_end},
        'holdout':    {'start': str(df5['ts'].iloc[v_end].date()),
                       'end':   str(df5['ts'].iloc[-1].date()), 'n': n-v_end},
    },
    'total_signals': {
        'all': int(len(sig_idx)),
        'long': int((sig_direction=='LONG').sum()),
        'short': int((sig_direction=='SHORT').sum()),
        'rth': int((sig_session=='RTH').sum()),
        'eth': int((sig_session=='ETH').sum()),
    },
    'bh_fdr': {'n_tests': n_tests, 'critical': round(bh_critical,6), 'rejections': bh_rejections},
    'primary_results': ser(primary_results),
    'neighbourhood': ser({str(k): v for k,v in nbr_results.items()}),
    'cost_sensitivity': ser(cost_sens),
    'yearly': ser({str(k): v for k,v in yearly.items()}),
    'classification_summary': {
        'promising_strong': len(ps), 'promising': len(pp), 'negative_edge': len(ne),
        'promising_strong_keys': ps[:10],
    },
    'strategy_specification_created': len(ps) > 0,
    'authority_boundaries': {
        'darwin_execution_authority': 'DISABLED',
        'live_trades_initiated': 0, 'paper_trades_initiated': 0,
    },
}

json_path = os.path.join(OUTPUT_DIR, 'DARWIN_EQ001_VALIDATION_RESULTS.json')
with open(json_path, 'w') as f:
    json.dump(results, f, indent=2, default=str)
print(f"\nResults JSON saved: {json_path}")
print("=== COMPLETE ===")
