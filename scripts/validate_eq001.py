"""
DARWIN-EQ001-VALIDATION-001
Full validation of RULE-EQ-001: Entry after excessive move from EMA21.

Pre-registered parameters (frozen before data was seen):
  EMA_LENGTH = 21
  ATR_LENGTH = 14
  DISTANCE_THRESHOLD_ATR = 2.0
  ENTRY_A = next bar open
  ENTRY_B = next bar open if price has not touched EMA21 before entry
  EXIT_1 = 5m close (1 bar)
  EXIT_2 = 10m close (2 bars)
  EXIT_3 = 15m close (3 bars)
  EXIT_4 = first causal EMA21 touch, capped at 15m

Splits: LONG/SHORT, RTH/ETH, WITH_TREND/AGAINST_TREND
Partitions: DISCOVERY (60%), VALIDATION (20%), HOLDOUT (20%)
Cost model: $4.94 round-trip = 2.47 MNQ points
Neighbourhood check: 1.9, 2.0, 2.1 ATR
BH-FDR at q=0.05
Bootstrap CI (1000 resamples)
"""

import databento as db
import pandas as pd
import numpy as np
from scipy import stats
import json
import os
from datetime import datetime, timezone, timedelta
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ────────────────────────────────────────────────────────────────
DATA_PATH = "/home/ubuntu/atlas-nexus/data/historical/mnq_ohlcv1m_2019_2026.dbn"
OUTPUT_DIR = "/home/ubuntu/atlas-nexus/sprint-artefacts-eq001"
os.makedirs(OUTPUT_DIR, exist_ok=True)

EMA_LENGTH = 21
ATR_LENGTH = 14
DISTANCE_THRESHOLD_ATR = 2.0
MNQ_POINT_VALUE = 2.0
ROUND_TRIP_COST_POINTS = 2.47  # pre-registered
BOOTSTRAP_N = 1000
FDR_Q = 0.05
DEGRADED_DATES = {'2019-01-15', '2019-02-22', '2019-03-13'}

# ─── Indicator functions ──────────────────────────────────────────────────────
def compute_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def compute_atr(df: pd.DataFrame, period: int) -> pd.Series:
    high = df['high']
    low = df['low']
    close = df['close']
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs()
    ], axis=1).max(axis=1)
    # Wilder's ATR
    atr = tr.ewm(alpha=1/period, adjust=False).mean()
    return atr

def get_session(dt: pd.Timestamp) -> str:
    """Classify bar into RTH or ETH. dt is UTC."""
    # Approximate EDT (UTC-4) for summer, EST (UTC-5) for winter
    # Use a simple rule: March second Sunday to November first Sunday = EDT
    month = dt.month
    if 3 < month < 11:
        offset = -4
    elif month == 3:
        # Second Sunday of March
        day = dt.day
        offset = -4 if day >= 8 else -5
    elif month == 11:
        day = dt.day
        offset = -5 if day >= 1 else -4
    else:
        offset = -5
    et = dt + timedelta(hours=offset)
    h, m = et.hour, et.minute
    t = h * 60 + m
    rth_open = 9 * 60 + 30
    rth_close = 16 * 60
    maint_start = 17 * 60
    maint_end = 18 * 60
    if maint_start <= t < maint_end:
        return 'MAINTENANCE'
    if rth_open <= t < rth_close:
        return 'RTH'
    return 'ETH'

# ─── Load and prepare data ────────────────────────────────────────────────────
print("Loading data...")
store = db.DBNStore.from_file(DATA_PATH)
df_raw = store.to_df()
print(f"Raw rows: {len(df_raw):,}")
print(f"Columns: {list(df_raw.columns)}")

# Normalise column names
df_raw.columns = [c.lower() for c in df_raw.columns]

# The DBN store index is ts_event (nanoseconds UTC) — convert to datetime
df_raw = df_raw.reset_index()
if 'ts_event' in df_raw.columns:
    df_raw['ts'] = pd.to_datetime(df_raw['ts_event'], utc=True)
elif df_raw.index.name == 'ts_event':
    df_raw['ts'] = pd.to_datetime(df_raw.index, utc=True)
    df_raw = df_raw.reset_index(drop=True)
else:
    # Try the first datetime-like column
    for col in df_raw.columns:
        if 'ts' in col or 'time' in col:
            df_raw['ts'] = pd.to_datetime(df_raw[col], utc=True)
            break

print(f"Timestamp range: {df_raw['ts'].min()} to {df_raw['ts'].max()}")

# Price columns — DBN OHLCV stores prices as fixed-point int64 (1e-9 scale)
# Check if prices need scaling
price_cols = ['open', 'high', 'low', 'close']
for col in price_cols:
    if col in df_raw.columns:
        sample = df_raw[col].iloc[100]
        if sample > 1_000_000:  # raw fixed-point
            df_raw[col] = df_raw[col] / 1e9
        break

print(f"Sample close prices: {df_raw['close'].iloc[100:105].values}")

# Remove degraded dates
df_raw['date_str'] = df_raw['ts'].dt.strftime('%Y-%m-%d')
before = len(df_raw)
df_raw = df_raw[~df_raw['date_str'].isin(DEGRADED_DATES)]
print(f"Removed {before - len(df_raw):,} bars from {len(DEGRADED_DATES)} degraded dates")

# Remove maintenance window bars
df_raw['session'] = df_raw['ts'].apply(get_session)
df_raw = df_raw[df_raw['session'] != 'MAINTENANCE'].copy()
print(f"After removing maintenance: {len(df_raw):,} bars")

# Resample to 5m
df_raw = df_raw.sort_values('ts').reset_index(drop=True)
df_raw.set_index('ts', inplace=True)
df_5m = df_raw[['open', 'high', 'low', 'close', 'volume']].resample('5min').agg({
    'open': 'first',
    'high': 'max',
    'low': 'min',
    'close': 'last',
    'volume': 'sum'
}).dropna(subset=['close'])
df_5m = df_5m.reset_index()
print(f"5m bars: {len(df_5m):,}")

# Recompute session on 5m bars
df_5m['session'] = df_5m['ts'].apply(get_session)
df_5m = df_5m[df_5m['session'] != 'MAINTENANCE'].copy().reset_index(drop=True)
print(f"5m bars (no maintenance): {len(df_5m):,}")

# ─── Compute indicators ───────────────────────────────────────────────────────
df_5m['ema21'] = compute_ema(df_5m['close'], EMA_LENGTH)
df_5m['atr14'] = compute_atr(df_5m, ATR_LENGTH)
df_5m['ema21_slope'] = df_5m['ema21'].diff()  # positive = uptrend

# Warmup: need at least max(EMA_LENGTH, ATR_LENGTH) bars
WARMUP = max(EMA_LENGTH, ATR_LENGTH) + 5
df_5m = df_5m.iloc[WARMUP:].copy().reset_index(drop=True)
print(f"5m bars after warmup: {len(df_5m):,}")

# ─── Chronological partitions ─────────────────────────────────────────────────
n = len(df_5m)
disc_end = int(n * 0.60)
val_end = int(n * 0.80)
df_5m['partition'] = 'HOLDOUT'
df_5m.loc[:disc_end-1, 'partition'] = 'DISCOVERY'
df_5m.loc[disc_end:val_end-1, 'partition'] = 'VALIDATION'

disc_range = (df_5m[df_5m['partition']=='DISCOVERY']['ts'].min(),
              df_5m[df_5m['partition']=='DISCOVERY']['ts'].max())
val_range  = (df_5m[df_5m['partition']=='VALIDATION']['ts'].min(),
              df_5m[df_5m['partition']=='VALIDATION']['ts'].max())
hold_range = (df_5m[df_5m['partition']=='HOLDOUT']['ts'].min(),
              df_5m[df_5m['partition']=='HOLDOUT']['ts'].max())

print(f"DISCOVERY:  {disc_range[0].date()} to {disc_range[1].date()} ({disc_end} bars)")
print(f"VALIDATION: {val_range[0].date()} to {val_range[1].date()} ({val_end - disc_end} bars)")
print(f"HOLDOUT:    {hold_range[0].date()} to {hold_range[1].date()} ({n - val_end} bars)")

# ─── Signal detection ─────────────────────────────────────────────────────────
def detect_signals(df: pd.DataFrame, threshold_atr: float = 2.0) -> pd.DataFrame:
    """Detect EQ-001 signals: close at least threshold_atr × ATR14 from EMA21."""
    dist = df['close'] - df['ema21']
    dist_atr = dist.abs() / df['atr14']
    
    signals = []
    for i in range(len(df) - 4):  # need 4 forward bars for exits
        if dist_atr.iloc[i] < threshold_atr:
            continue
        if df['atr14'].iloc[i] == 0 or pd.isna(df['atr14'].iloc[i]):
            continue
        
        bar = df.iloc[i]
        direction = 'LONG' if bar['close'] < bar['ema21'] else 'SHORT'
        
        # Trend relationship
        slope = bar['ema21_slope']
        if pd.isna(slope):
            continue
        uptrend = slope > 0
        
        if direction == 'LONG':
            trend_rel = 'AGAINST_TREND' if uptrend else 'WITH_TREND'
        else:
            trend_rel = 'WITH_TREND' if uptrend else 'AGAINST_TREND'
        
        signals.append({
            'idx': i,
            'ts': bar['ts'],
            'session': bar['session'],
            'partition': bar['partition'],
            'direction': direction,
            'trend_rel': trend_rel,
            'close': bar['close'],
            'ema21': bar['ema21'],
            'atr14': bar['atr14'],
            'dist_atr': dist_atr.iloc[i],
        })
    
    return pd.DataFrame(signals)

signals = detect_signals(df_5m, DISTANCE_THRESHOLD_ATR)
print(f"\nTotal signals detected: {len(signals):,}")
print(f"  LONG: {(signals['direction']=='LONG').sum():,}")
print(f"  SHORT: {(signals['direction']=='SHORT').sum():,}")
print(f"  RTH: {(signals['session']=='RTH').sum():,}")
print(f"  ETH: {(signals['session']=='ETH').sum():,}")

# ─── Entry and exit evaluation ────────────────────────────────────────────────
def evaluate_trade(df: pd.DataFrame, sig_idx: int, direction: str, 
                   entry_model: str, exit_model: str, cost_pts: float) -> dict | None:
    """Evaluate a single trade. Returns dict with P&L metrics or None if invalid."""
    i = sig_idx
    
    if i + 4 >= len(df):
        return None
    
    # Entry price
    entry_bar_idx = i + 1
    entry_price = df.iloc[entry_bar_idx]['open']
    
    # Entry B: skip if EMA21 already touched before entry
    if entry_model == 'B':
        # Check if the signal bar's close to entry bar's open crossed EMA21
        sig_close = df.iloc[i]['close']
        sig_ema = df.iloc[i]['ema21']
        entry_ema = df.iloc[entry_bar_idx]['ema21']
        if direction == 'LONG':
            # We want price to still be below EMA21 at entry
            if entry_price >= entry_ema:
                return None
        else:
            if entry_price <= entry_ema:
                return None
    
    # Exit price
    if exit_model == '1':
        exit_bar_idx = i + 2  # 1 bar after entry
        exit_price = df.iloc[exit_bar_idx]['close']
    elif exit_model == '2':
        exit_bar_idx = i + 3
        exit_price = df.iloc[exit_bar_idx]['close']
    elif exit_model == '3':
        exit_bar_idx = i + 4
        exit_price = df.iloc[exit_bar_idx]['close']
    elif exit_model == '4':
        # First causal EMA21 touch, capped at 3 bars (15 min)
        exit_price = None
        exit_bar_idx = i + 4  # default cap
        for j in range(i + 2, min(i + 5, len(df))):
            bar_j = df.iloc[j]
            ema_j = bar_j['ema21']
            if direction == 'LONG':
                if bar_j['high'] >= ema_j:
                    exit_price = ema_j
                    exit_bar_idx = j
                    break
            else:
                if bar_j['low'] <= ema_j:
                    exit_price = ema_j
                    exit_bar_idx = j
                    break
        if exit_price is None:
            exit_price = df.iloc[exit_bar_idx]['close']
    else:
        return None
    
    # P&L in points
    if direction == 'LONG':
        gross_pts = exit_price - entry_price
    else:
        gross_pts = entry_price - exit_price
    
    net_pts = gross_pts - cost_pts
    
    # MFE and MAE (using bars between entry and exit)
    mfe_pts = 0.0
    mae_pts = 0.0
    for j in range(entry_bar_idx, exit_bar_idx + 1):
        if j >= len(df):
            break
        bar_j = df.iloc[j]
        if direction == 'LONG':
            mfe_pts = max(mfe_pts, bar_j['high'] - entry_price)
            mae_pts = min(mae_pts, bar_j['low'] - entry_price)
        else:
            mfe_pts = max(mfe_pts, entry_price - bar_j['low'])
            mae_pts = min(mae_pts, entry_price - bar_j['high'])
    
    return {
        'gross_pts': gross_pts,
        'net_pts': net_pts,
        'win': 1 if net_pts > 0 else 0,
        'mfe_pts': mfe_pts,
        'mae_pts': mae_pts,
        'entry_price': entry_price,
        'exit_price': exit_price,
    }

# ─── Run all combinations ─────────────────────────────────────────────────────
print("\nRunning all trade combinations...")

ENTRY_MODELS = ['A', 'B']
EXIT_MODELS = ['1', '2', '3', '4']
COST_SCENARIOS = {
    'BASE': ROUND_TRIP_COST_POINTS,
    'BASE_125': ROUND_TRIP_COST_POINTS * 1.25,
    'BASE_150': ROUND_TRIP_COST_POINTS * 1.50,
}
THRESHOLDS = [1.9, 2.0, 2.1]

all_results = {}

for threshold in THRESHOLDS:
    if threshold != DISTANCE_THRESHOLD_ATR:
        sigs_t = detect_signals(df_5m, threshold)
    else:
        sigs_t = signals
    
    for entry_model in ENTRY_MODELS:
        for exit_model in EXIT_MODELS:
            for cost_label, cost_pts in COST_SCENARIOS.items():
                combo_key = f"T{str(threshold).replace('.','')}_E{entry_model}_X{exit_model}_{cost_label}"
                
                trades = []
                for _, sig in sigs_t.iterrows():
                    result = evaluate_trade(
                        df_5m, int(sig['idx']), sig['direction'],
                        entry_model, exit_model, cost_pts
                    )
                    if result is None:
                        continue
                    result.update({
                        'direction': sig['direction'],
                        'session': sig['session'],
                        'partition': sig['partition'],
                        'trend_rel': sig['trend_rel'],
                        'ts': sig['ts'],
                    })
                    trades.append(result)
                
                all_results[combo_key] = pd.DataFrame(trades)

print(f"Combinations evaluated: {len(all_results)}")

# ─── Statistical analysis ─────────────────────────────────────────────────────
def analyse_group(trades_df: pd.DataFrame, label: str) -> dict:
    """Compute all required statistics for a group of trades."""
    if len(trades_df) < 10:
        return {'label': label, 'n': len(trades_df), 'status': 'INSUFFICIENT_SAMPLE'}
    
    net = trades_df['net_pts'].values
    n = len(net)
    mean_net = float(np.mean(net))
    std_net = float(np.std(net, ddof=1)) if n > 1 else 0.0
    win_rate = float(np.mean(trades_df['win'].values))
    
    # t-test (one-sample, H0: mean=0)
    if std_net > 0:
        t_stat, p_val = stats.ttest_1samp(net, 0)
    else:
        t_stat, p_val = 0.0, 1.0
    
    # Profit factor
    gross_wins = net[net > 0].sum() if (net > 0).any() else 0.0
    gross_losses = abs(net[net < 0].sum()) if (net < 0).any() else 0.0
    profit_factor = (gross_wins / gross_losses) if gross_losses > 0 else (float('inf') if gross_wins > 0 else 0.0)
    
    # Bootstrap CI (1000 resamples)
    boot_means = []
    rng = np.random.default_rng(42)
    for _ in range(BOOTSTRAP_N):
        sample = rng.choice(net, size=n, replace=True)
        boot_means.append(np.mean(sample))
    boot_means = np.array(boot_means)
    ci_lower = float(np.percentile(boot_means, 2.5))
    ci_upper = float(np.percentile(boot_means, 97.5))
    
    # MFE/MAE
    mean_mfe = float(trades_df['mfe_pts'].mean())
    mean_mae = float(trades_df['mae_pts'].mean())
    
    return {
        'label': label,
        'n': n,
        'mean_net_pts': round(mean_net, 4),
        'std_net_pts': round(std_net, 4),
        'win_rate': round(win_rate, 4),
        'profit_factor': round(profit_factor, 4) if profit_factor != float('inf') else 999.0,
        't_stat': round(float(t_stat), 4),
        'p_value_raw': round(float(p_val), 6),
        'ci_lower_95': round(ci_lower, 4),
        'ci_upper_95': round(ci_upper, 4),
        'mean_mfe_pts': round(mean_mfe, 4),
        'mean_mae_pts': round(mean_mae, 4),
        'status': 'COMPUTED',
    }

# ─── Primary analysis: canonical threshold, Entry A, BASE cost ────────────────
print("\nPrimary analysis (T2.0, Entry A, BASE cost)...")

primary_key = "T20_EA_X{}_BASE"
primary_results = {}

for exit_model in EXIT_MODELS:
    key = f"T20_EA_X{exit_model}_BASE"
    df_trades = all_results[key]
    
    # Overall
    primary_results[f"ALL_X{exit_model}"] = analyse_group(df_trades, f"ALL_X{exit_model}")
    
    # By direction
    for direction in ['LONG', 'SHORT']:
        sub = df_trades[df_trades['direction'] == direction]
        primary_results[f"{direction}_X{exit_model}"] = analyse_group(sub, f"{direction}_X{exit_model}")
    
    # By session
    for session in ['RTH', 'ETH']:
        sub = df_trades[df_trades['session'] == session]
        primary_results[f"{session}_X{exit_model}"] = analyse_group(sub, f"{session}_X{exit_model}")
    
    # By trend relationship
    for trend_rel in ['WITH_TREND', 'AGAINST_TREND']:
        sub = df_trades[df_trades['trend_rel'] == trend_rel]
        primary_results[f"{trend_rel}_X{exit_model}"] = analyse_group(sub, f"{trend_rel}_X{exit_model}")
    
    # Combined splits
    for direction in ['LONG', 'SHORT']:
        for session in ['RTH', 'ETH']:
            sub = df_trades[(df_trades['direction'] == direction) & (df_trades['session'] == session)]
            primary_results[f"{session}_{direction}_X{exit_model}"] = analyse_group(sub, f"{session}_{direction}_X{exit_model}")
    
    # Partition analysis
    for partition in ['DISCOVERY', 'VALIDATION', 'HOLDOUT']:
        sub = df_trades[df_trades['partition'] == partition]
        primary_results[f"{partition}_X{exit_model}"] = analyse_group(sub, f"{partition}_X{exit_model}")

# ─── BH-FDR correction ────────────────────────────────────────────────────────
print("Applying BH-FDR correction...")

# Collect all p-values from primary results (computed, n>=50)
valid_keys = [k for k, v in primary_results.items() 
              if v['status'] == 'COMPUTED' and v['n'] >= 50]
p_values = [primary_results[k]['p_value_raw'] for k in valid_keys]
n_tests = len(p_values)

# BH procedure
if n_tests > 0:
    sorted_idx = np.argsort(p_values)
    sorted_p = np.array(p_values)[sorted_idx]
    bh_thresholds = [(i+1) / n_tests * FDR_Q for i in range(n_tests)]
    
    # Find largest k where p(k) <= k/m * q
    bh_reject = np.array([sorted_p[i] <= bh_thresholds[i] for i in range(n_tests)])
    if bh_reject.any():
        last_reject = np.where(bh_reject)[0][-1]
        bh_critical = bh_thresholds[last_reject]
    else:
        bh_critical = 0.0
    
    for k in valid_keys:
        primary_results[k]['bh_reject'] = primary_results[k]['p_value_raw'] <= bh_critical
        primary_results[k]['bh_critical'] = round(bh_critical, 6)
        primary_results[k]['n_tests_family'] = n_tests

print(f"BH-FDR: {n_tests} tests, critical threshold = {bh_critical:.6f}")
bh_rejections = sum(1 for k in valid_keys if primary_results[k].get('bh_reject', False))
print(f"BH rejections (H0 rejected): {bh_rejections}")

# ─── Neighbourhood robustness check ──────────────────────────────────────────
print("\nNeighbourhood robustness check (1.9, 2.0, 2.1)...")
neighbourhood_results = {}

for threshold in THRESHOLDS:
    key = f"T{str(threshold).replace('.','')}_EA_X3_BASE"
    df_t = all_results[key]
    neighbourhood_results[threshold] = {
        'threshold': threshold,
        'n_signals': len(df_t),
        'all': analyse_group(df_t, f"ALL_T{threshold}"),
        'long': analyse_group(df_t[df_t['direction']=='LONG'], f"LONG_T{threshold}"),
        'short': analyse_group(df_t[df_t['direction']=='SHORT'], f"SHORT_T{threshold}"),
    }

# ─── Cost sensitivity ─────────────────────────────────────────────────────────
print("Cost sensitivity analysis...")
cost_sensitivity = {}
for cost_label in ['BASE', 'BASE_125', 'BASE_150']:
    key = f"T20_EA_X3_{cost_label}"
    df_c = all_results[key]
    cost_sensitivity[cost_label] = analyse_group(df_c, f"ALL_{cost_label}")

# ─── Year-by-year analysis ────────────────────────────────────────────────────
print("Year-by-year analysis...")
df_primary = all_results["T20_EA_X3_BASE"].copy()
df_primary['year'] = pd.to_datetime(df_primary['ts']).dt.year
yearly_results = {}
for year in sorted(df_primary['year'].unique()):
    sub = df_primary[df_primary['year'] == year]
    yearly_results[year] = analyse_group(sub, f"YEAR_{year}")

# ─── Classification ───────────────────────────────────────────────────────────
def classify_result(r: dict) -> str:
    if r['status'] != 'COMPUTED':
        return 'INSUFFICIENT_SAMPLE'
    if r['n'] < 50:
        return 'INSUFFICIENT_SAMPLE'
    if r['mean_net_pts'] <= 0:
        return 'NEGATIVE_EDGE'
    if r['profit_factor'] <= 1.0:
        return 'NEGATIVE_EDGE'
    if r.get('bh_reject', False) and r['ci_lower_95'] > 0 and r['profit_factor'] > 1.10:
        return 'PROMISING_STRONG'
    if r['mean_net_pts'] > 0 and r['profit_factor'] > 1.0:
        return 'PROMISING'
    return 'INCONCLUSIVE_POSITIVE'

for k in primary_results:
    primary_results[k]['classification'] = classify_result(primary_results[k])

# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("RESULTS SUMMARY")
print("="*70)

# Best subgroups by mean_net_pts (n>=50)
ranked = [(k, v) for k, v in primary_results.items() 
          if v['status'] == 'COMPUTED' and v['n'] >= 50]
ranked.sort(key=lambda x: x[1]['mean_net_pts'], reverse=True)

print(f"\nTop 10 subgroups by mean net P&L (points):")
for k, v in ranked[:10]:
    print(f"  {k:40s} n={v['n']:5d}  mean={v['mean_net_pts']:+.4f}  "
          f"wr={v['win_rate']:.3f}  pf={v['profit_factor']:.3f}  "
          f"p={v['p_value_raw']:.4f}  class={v['classification']}")

print(f"\nBottom 5 subgroups:")
for k, v in ranked[-5:]:
    print(f"  {k:40s} n={v['n']:5d}  mean={v['mean_net_pts']:+.4f}  "
          f"wr={v['win_rate']:.3f}  pf={v['profit_factor']:.3f}  "
          f"p={v['p_value_raw']:.4f}  class={v['classification']}")

# Partition stability
print(f"\nPartition stability (T2.0, Entry A, Exit 3, BASE cost):")
for partition in ['DISCOVERY', 'VALIDATION', 'HOLDOUT']:
    r = primary_results.get(f"{partition}_X3", {})
    if r.get('status') == 'COMPUTED':
        print(f"  {partition:12s}  n={r['n']:5d}  mean={r['mean_net_pts']:+.4f}  "
              f"wr={r['win_rate']:.3f}  class={r['classification']}")

# Overall classification
promising_strong = [k for k, v in primary_results.items() 
                    if v.get('classification') == 'PROMISING_STRONG']
promising = [k for k, v in primary_results.items() 
             if v.get('classification') == 'PROMISING']
negative = [k for k, v in primary_results.items() 
            if v.get('classification') == 'NEGATIVE_EDGE' and v['n'] >= 50]

print(f"\nClassification summary:")
print(f"  PROMISING_STRONG: {len(promising_strong)}")
print(f"  PROMISING:        {len(promising)}")
print(f"  NEGATIVE_EDGE:    {len(negative)}")

# ─── Save results JSON ────────────────────────────────────────────────────────
print("\nSaving results JSON...")

def make_serializable(obj):
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [make_serializable(v) for v in obj]
    return obj

results_json = {
    'experiment_id': 'DARWIN-EQ001-VALIDATION-001',
    'generated_at': datetime.now(timezone.utc).isoformat(),
    'data_source': 'GLBX.MDP3 ohlcv-1m via Databento',
    'data_rows_raw': len(df_raw),
    'data_rows_5m': len(df_5m) + WARMUP,
    'data_rows_5m_after_warmup': len(df_5m),
    'degraded_dates_excluded': list(DEGRADED_DATES),
    'parameters': {
        'ema_length': EMA_LENGTH,
        'atr_length': ATR_LENGTH,
        'distance_threshold_atr': DISTANCE_THRESHOLD_ATR,
        'round_trip_cost_points': ROUND_TRIP_COST_POINTS,
        'bootstrap_n': BOOTSTRAP_N,
        'fdr_q': FDR_Q,
    },
    'partitions': {
        'discovery': {'start': str(disc_range[0].date()), 'end': str(disc_range[1].date()), 'n_bars': disc_end},
        'validation': {'start': str(val_range[0].date()), 'end': str(val_range[1].date()), 'n_bars': val_end - disc_end},
        'holdout': {'start': str(hold_range[0].date()), 'end': str(hold_range[1].date()), 'n_bars': n - val_end},
    },
    'total_signals': {
        'all': len(signals),
        'long': int((signals['direction']=='LONG').sum()),
        'short': int((signals['direction']=='SHORT').sum()),
        'rth': int((signals['session']=='RTH').sum()),
        'eth': int((signals['session']=='ETH').sum()),
    },
    'bh_fdr': {
        'n_tests': n_tests,
        'critical_threshold': round(bh_critical, 6),
        'rejections': bh_rejections,
    },
    'primary_results': make_serializable(primary_results),
    'neighbourhood_robustness': make_serializable(neighbourhood_results),
    'cost_sensitivity': make_serializable(cost_sensitivity),
    'yearly_results': make_serializable({str(k): v for k, v in yearly_results.items()}),
    'classification_summary': {
        'promising_strong': len(promising_strong),
        'promising': len(promising),
        'negative_edge': len(negative),
        'promising_strong_keys': promising_strong[:10],
    },
    'strategy_specification_created': len(promising_strong) > 0,
    'authority_boundaries': {
        'darwin_processbar_calls': 0,
        'darwin_execution_authority': 'DISABLED',
        'live_trades_initiated': 0,
        'paper_trades_initiated': 0,
    },
}

json_path = os.path.join(OUTPUT_DIR, 'DARWIN_EQ001_VALIDATION_RESULTS.json')
with open(json_path, 'w') as f:
    json.dump(results_json, f, indent=2, default=str)
print(f"Results JSON saved: {json_path}")

print("\n=== VALIDATION SCRIPT COMPLETE ===")
print(f"Total signals: {len(signals):,}")
print(f"BH-FDR rejections: {bh_rejections}/{n_tests}")
print(f"PROMISING_STRONG subgroups: {len(promising_strong)}")
print(f"PROMISING subgroups: {len(promising)}")
print(f"NEGATIVE_EDGE subgroups: {len(negative)}")
