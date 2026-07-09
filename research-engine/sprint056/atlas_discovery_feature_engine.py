"""
Atlas Sprint 056 — Discovery Campaign Feature Engine

Builds the full discovery feature matrix across all 20 discovery domains.
Each row = one 5-min bar, with ~65 features covering:
  - Auction behaviour
  - Liquidity migration
  - Volatility memory
  - Trend ageing / birth
  - Failed continuation / reversal
  - Session transitions
  - Cross-session interactions
  - Overnight inventory
  - Time since impulse / expansion
  - Multi-day behaviour
  - Relative volatility / participation
  - Market compression cycles
  - Momentum decay
  - Fractal behaviour
  - Structural symmetry
  - Behaviour preceding exceptional moves
  - Behaviour preceding catastrophic failures
"""

import pandas as pd
import numpy as np
import os, warnings
warnings.filterwarnings('ignore')

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research-engine/sprint056'
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Loading MNQ 5-min data...")
df = pd.read_csv(DATA_PATH)
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('US/Eastern').dt.tz_localize(None)
df = df.sort_values('ts').reset_index(drop=True)
df['hour']    = df['ts'].dt.hour
df['minute']  = df['ts'].dt.minute
df['date']    = df['ts'].dt.date
df['dow']     = df['ts'].dt.dayofweek   # 0=Mon, 4=Fri
df['week']    = df['ts'].dt.isocalendar().week.astype(int)

print(f"  Loaded {len(df):,} bars from {df['ts'].min()} to {df['ts'].max()}")

# ─── Helper: rolling functions ────────────────────────────────────────────────
def ema(s, n): return s.ewm(span=n, adjust=False).mean()
def atr(h, l, c, n):
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()

# ─── DOMAIN 1: Core price features ───────────────────────────────────────────
print("Computing core price features...")
df['bar_range']  = df['high'] - df['low']
df['bar_body']   = (df['close'] - df['open']).abs()
df['bar_dir']    = np.sign(df['close'] - df['open'])
df['upper_wick'] = df['high'] - df[['open', 'close']].max(axis=1)
df['lower_wick'] = df[['open', 'close']].min(axis=1) - df['low']
df['wick_ratio'] = (df['upper_wick'] + df['lower_wick']) / (df['bar_range'] + 1e-6)
df['body_ratio'] = df['bar_body'] / (df['bar_range'] + 1e-6)

# ─── DOMAIN 2: Volatility features ───────────────────────────────────────────
print("Computing volatility features...")
df['atr5']   = atr(df['high'], df['low'], df['close'], 5)
df['atr14']  = atr(df['high'], df['low'], df['close'], 14)
df['atr50']  = atr(df['high'], df['low'], df['close'], 50)
df['atr200'] = atr(df['high'], df['low'], df['close'], 200)

# Volatility compression ratio (VolComp)
df['volcomp_5_14']   = df['atr5']  / (df['atr14']  + 1e-6)
df['volcomp_14_50']  = df['atr14'] / (df['atr50']  + 1e-6)
df['volcomp_50_200'] = df['atr50'] / (df['atr200'] + 1e-6)

# Volatility memory: how long since ATR was at current level
df['atr14_zscore'] = (df['atr14'] - df['atr14'].rolling(200).mean()) / (df['atr14'].rolling(200).std() + 1e-6)
df['atr14_pct_rank'] = df['atr14'].rolling(200).rank(pct=True)

# Relative bar range vs recent ATR
df['range_vs_atr14'] = df['bar_range'] / (df['atr14'] + 1e-6)

# ─── DOMAIN 3: Trend features ─────────────────────────────────────────────────
print("Computing trend features...")
df['ema9']  = ema(df['close'], 9)
df['ema21'] = ema(df['close'], 21)
df['ema50'] = ema(df['close'], 50)
df['ema200']= ema(df['close'], 200)

# EMA alignment
df['ema_aligned_bull'] = ((df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])).astype(int)
df['ema_aligned_bear'] = ((df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])).astype(int)
df['ema_alignment']    = df['ema_aligned_bull'] - df['ema_aligned_bear']

# EMA spread (trend strength proxy)
df['ema9_21_spread']  = (df['ema9'] - df['ema21']) / (df['atr14'] + 1e-6)
df['ema21_50_spread'] = (df['ema21'] - df['ema50']) / (df['atr14'] + 1e-6)

# Price vs EMA
df['close_vs_ema50']  = (df['close'] - df['ema50'])  / (df['atr14'] + 1e-6)
df['close_vs_ema200'] = (df['close'] - df['ema200']) / (df['atr14'] + 1e-6)

# ─── DOMAIN 4: ADX ────────────────────────────────────────────────────────────
print("Computing ADX...")
def compute_adx(df, n=14):
    high, low, close = df['high'], df['low'], df['close']
    up_move   = high.diff()
    down_move = -low.diff()
    plus_dm   = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm  = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
    tr = pd.concat([high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1).max(axis=1)
    atr_n     = tr.rolling(n).mean()
    plus_di   = 100 * pd.Series(plus_dm).rolling(n).mean() / (atr_n + 1e-6)
    minus_di  = 100 * pd.Series(minus_dm).rolling(n).mean() / (atr_n + 1e-6)
    dx        = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-6)
    adx       = dx.rolling(n).mean()
    return adx.values, plus_di.values, minus_di.values

df['adx14'], df['plus_di'], df['minus_di'] = compute_adx(df, 14)
df['adx_slope'] = pd.Series(df['adx14']).diff(5)   # 25-min ADX slope
df['adx_accel'] = pd.Series(df['adx_slope']).diff(5)  # ADX acceleration

# ─── DOMAIN 5: Momentum features ─────────────────────────────────────────────
print("Computing momentum features...")
df['roc5']   = df['close'].pct_change(5)   * 100
df['roc14']  = df['close'].pct_change(14)  * 100
df['roc50']  = df['close'].pct_change(50)  * 100
df['roc200'] = df['close'].pct_change(200) * 100

# RSI
def rsi(s, n=14):
    delta = s.diff()
    gain  = delta.clip(lower=0).rolling(n).mean()
    loss  = (-delta.clip(upper=0)).rolling(n).mean()
    rs    = gain / (loss + 1e-6)
    return 100 - (100 / (1 + rs))

df['rsi14'] = rsi(df['close'], 14)
df['rsi5']  = rsi(df['close'], 5)

# Momentum decay: RSI slope
df['rsi14_slope'] = df['rsi14'].diff(5)

# ─── DOMAIN 6: Volume / Participation features ────────────────────────────────
print("Computing volume/participation features...")
df['vol_ma20']     = df['volume'].rolling(20).mean()
df['vol_ma100']    = df['volume'].rolling(100).mean()
df['rel_vol_20']   = df['volume'] / (df['vol_ma20'] + 1e-6)
df['rel_vol_100']  = df['volume'] / (df['vol_ma100'] + 1e-6)
df['vol_zscore']   = (df['volume'] - df['vol_ma100']) / (df['volume'].rolling(100).std() + 1e-6)

# Dollar volume (institutional participation proxy)
df['dollar_vol_ma20']  = df['dollar_volume'].rolling(20).mean()
df['rel_dollar_vol']   = df['dollar_volume'] / (df['dollar_vol_ma20'] + 1e-6)

# Transactions per bar (order fragmentation proxy)
df['txn_per_vol']  = df['transactions'] / (df['volume'] + 1e-6)
df['txn_ma20']     = df['transactions'].rolling(20).mean()
df['rel_txn']      = df['transactions'] / (df['txn_ma20'] + 1e-6)

# ─── DOMAIN 7: Session / Time features ───────────────────────────────────────
print("Computing session/time features...")
def session_label(h, m):
    t = h * 60 + m
    if 18*60 <= t or t < 9*60+30:   return 'overnight'
    if t < 10*60+30:                 return 'am_open'
    if t < 12*60:                    return 'am_mid'
    if t < 13*60:                    return 'lunch'
    if t < 15*60:                    return 'pm_early'
    return 'pm_late'

df['session'] = df.apply(lambda r: session_label(r['hour'], r['minute']), axis=1)
df['is_rth']  = ((df['hour'] >= 9) & ~((df['hour'] == 9) & (df['minute'] < 30)) & (df['hour'] < 16)).astype(int)
df['is_am_open'] = ((df['hour'] == 9) & (df['minute'] >= 30) | (df['hour'] == 10)).astype(int)
df['is_overnight'] = (1 - df['is_rth']).astype(int)
df['bars_since_rth_open'] = df.groupby('date').cumcount()  # bars since day start

# ─── DOMAIN 8: Overnight inventory ───────────────────────────────────────────
print("Computing overnight inventory features...")
# For each RTH bar, compute the overnight range and direction
overnight_stats = {}
for date, grp in df.groupby('date'):
    ov = grp[grp['session'] == 'overnight']
    if len(ov) == 0: continue
    ov_range = ov['high'].max() - ov['low'].min()
    ov_open  = ov['open'].iloc[0]
    ov_close = ov['close'].iloc[-1]
    ov_dir   = np.sign(ov_close - ov_open)
    overnight_stats[date] = {'ov_range': ov_range, 'ov_dir': ov_dir,
                              'ov_open': ov_open, 'ov_close': ov_close}

df['ov_range'] = df['date'].map(lambda d: overnight_stats.get(d, {}).get('ov_range', np.nan))
df['ov_dir']   = df['date'].map(lambda d: overnight_stats.get(d, {}).get('ov_dir', np.nan))
df['ov_range_vs_atr14'] = df['ov_range'] / (df['atr14'] + 1e-6)

# ─── DOMAIN 9: Trend ageing ───────────────────────────────────────────────────
print("Computing trend ageing features...")
# How many consecutive bars has EMA alignment been in the same state?
alignment_age = []
current_state = None
current_age   = 0
for a in df['ema_alignment']:
    if a == current_state:
        current_age += 1
    else:
        current_state = a
        current_age   = 1
    alignment_age.append(current_age)
df['trend_age_bars'] = alignment_age

# Time since last EMA flip
ema_flip = (df['ema_alignment'] != df['ema_alignment'].shift(1)).astype(int)
df['bars_since_ema_flip'] = ema_flip.groupby((ema_flip != 0).cumsum()).cumcount()

# ─── DOMAIN 10: Impulse / Expansion timing ───────────────────────────────────
print("Computing impulse/expansion timing features...")
# Define impulse: bar range > 2 × ATR14
df['is_impulse'] = (df['range_vs_atr14'] > 2.0).astype(int)
# Time since last impulse
impulse_flag = df['is_impulse'].copy()
bars_since_impulse = []
count = 999
for v in impulse_flag:
    if v == 1:
        count = 0
    else:
        count += 1
    bars_since_impulse.append(count)
df['bars_since_impulse'] = bars_since_impulse

# Define expansion: ATR5 > 1.5 × ATR14
df['is_expansion'] = (df['volcomp_5_14'] > 1.5).astype(int)
bars_since_expansion = []
count = 999
for v in df['is_expansion']:
    if v == 1:
        count = 0
    else:
        count += 1
    bars_since_expansion.append(count)
df['bars_since_expansion'] = bars_since_expansion

# ─── DOMAIN 11: Multi-day features ───────────────────────────────────────────
print("Computing multi-day features...")
# Daily range, return, and direction
daily_stats = df.groupby('date').agg(
    day_high=('high', 'max'),
    day_low=('low', 'min'),
    day_open=('open', 'first'),
    day_close=('close', 'last'),
    day_volume=('volume', 'sum'),
).reset_index()
daily_stats['day_range'] = daily_stats['day_high'] - daily_stats['day_low']
daily_stats['day_return'] = daily_stats['day_close'] - daily_stats['day_open']
daily_stats['day_dir']   = np.sign(daily_stats['day_return'])

# Rolling 5-day range and direction
daily_stats['day_range_ma5']  = daily_stats['day_range'].rolling(5).mean()
daily_stats['consec_up_days'] = (daily_stats['day_dir'] == 1).astype(int)
daily_stats['consec_up_days'] = daily_stats.groupby(
    (daily_stats['day_dir'] != daily_stats['day_dir'].shift()).cumsum()
)['consec_up_days'].cumsum()

df = df.merge(daily_stats[['date', 'day_range', 'day_return', 'day_dir',
                             'day_range_ma5', 'consec_up_days']],
              on='date', how='left')
df['day_range_vs_atr14'] = df['day_range'] / (df['atr14'] + 1e-6)

# ─── DOMAIN 12: Structural symmetry ─────────────────────────────────────────
print("Computing structural symmetry features...")
# Rolling high/low over 20 bars (structural swing)
df['roll_high_20'] = df['high'].rolling(20).max()
df['roll_low_20']  = df['low'].rolling(20).min()
df['roll_mid_20']  = (df['roll_high_20'] + df['roll_low_20']) / 2
df['close_vs_range_mid'] = (df['close'] - df['roll_mid_20']) / (df['roll_high_20'] - df['roll_low_20'] + 1e-6)

# Symmetry ratio: upper half range vs lower half range
df['range_upper'] = df['roll_high_20'] - df['roll_mid_20']
df['range_lower'] = df['roll_mid_20'] - df['roll_low_20']
df['range_symmetry'] = df['range_upper'] / (df['range_lower'] + 1e-6)

# ─── DOMAIN 13: Failed continuation / reversal ───────────────────────────────
print("Computing failure pattern features...")
# Failed continuation: bar closes in opposite direction to prior 5-bar trend
prior_5_return = df['close'] - df['close'].shift(5)
df['prior_5_dir'] = np.sign(prior_5_return)
df['failed_continuation'] = ((df['bar_dir'] != df['prior_5_dir']) & (df['prior_5_dir'] != 0)).astype(int)

# Failed reversal: bar tries to reverse (large wick) but closes back in trend direction
df['failed_reversal'] = ((df['wick_ratio'] > 0.5) & (df['bar_dir'] == df['prior_5_dir'])).astype(int)

# ─── DOMAIN 14: Auction behaviour ────────────────────────────────────────────
print("Computing auction behaviour features...")
# Value area approximation: close position within day's range
df['day_value_pos'] = (df['close'] - df.groupby('date')['low'].transform('min')) / \
                      (df.groupby('date')['high'].transform('max') - df.groupby('date')['low'].transform('min') + 1e-6)

# Auction extension: how far price has moved from open
df['day_open_price'] = df.groupby('date')['open'].transform('first')
df['auction_extension'] = (df['close'] - df['day_open_price']) / (df['atr14'] + 1e-6)

# ─── DOMAIN 15: Fractal behaviour ────────────────────────────────────────────
print("Computing fractal behaviour features...")
# Higher timeframe trend (50-bar EMA on 5-min = ~4hr trend)
df['ema_htf_bull'] = (df['close'] > df['ema50']).astype(int)

# Fractal alignment: does 5-bar EMA agree with 50-bar EMA?
df['fractal_aligned'] = (df['ema_aligned_bull'] == df['ema_htf_bull']).astype(int)

# ─── DOMAIN 16: Compression cycles ──────────────────────────────────────────
print("Computing compression cycle features...")
# Compression depth: how low has VolComp been in last 50 bars?
df['volcomp_min_50'] = df['volcomp_5_14'].rolling(50).min()
df['volcomp_rank_50'] = df['volcomp_5_14'].rolling(50).rank(pct=True)

# Compression duration: bars since VolComp was above 1.0
df['is_compressed'] = (df['volcomp_5_14'] < 0.85).astype(int)
bars_compressed = []
count = 0
for v in df['is_compressed']:
    if v == 1:
        count += 1
    else:
        count = 0
    bars_compressed.append(count)
df['bars_compressed'] = bars_compressed

# ─── DOMAIN 17: Exceptional move precursors ──────────────────────────────────
print("Computing exceptional move precursors...")
# Define exceptional move: next 12 bars move > 3 × ATR14 in one direction
df['fwd_12_return'] = df['close'].shift(-12) - df['close']
df['fwd_12_range']  = df['high'].rolling(12).max().shift(-12) - df['low'].rolling(12).min().shift(-12)
df['fwd_12_return_atr'] = df['fwd_12_return'] / (df['atr14'] + 1e-6)
df['is_exceptional_fwd'] = (df['fwd_12_return_atr'].abs() > 3.0).astype(int)

# ─── DOMAIN 18: Catastrophic failure precursors ──────────────────────────────
print("Computing catastrophic failure precursors...")
# Define catastrophic failure: next 12 bars move > 3 × ATR14 AGAINST the current trend
df['is_catastrophic_fwd'] = (
    (df['fwd_12_return_atr'] < -3.0) & (df['ema_alignment'] == 1) |
    (df['fwd_12_return_atr'] > 3.0)  & (df['ema_alignment'] == -1)
).astype(int)

# ─── DOMAIN 19: Cross-session interaction ────────────────────────────────────
print("Computing cross-session interaction features...")
# How does overnight range relate to RTH range?
df['ov_range_vs_day_range'] = df['ov_range'] / (df['day_range'] + 1e-6)

# ─── DOMAIN 20: Liquidity migration ─────────────────────────────────────────
print("Computing liquidity migration features...")
# Volume migration: is volume increasing or decreasing within session?
df['vol_trend_20'] = (df['volume'] - df['volume'].shift(20)) / (df['vol_ma20'] + 1e-6)
df['txn_trend_20'] = (df['transactions'] - df['transactions'].shift(20)) / (df['txn_ma20'] + 1e-6)

# ─── Filter to RTH bars only for most analysis ────────────────────────────────
print("\nFiltering to RTH bars for discovery analysis...")
rth = df[df['is_rth'] == 1].copy()
print(f"  RTH bars: {len(rth):,}")

# ─── Save feature matrix ─────────────────────────────────────────────────────
feature_cols = [
    'ts', 'date', 'hour', 'minute', 'dow', 'session',
    'open', 'high', 'low', 'close', 'volume', 'transactions',
    # Core
    'bar_range', 'bar_body', 'bar_dir', 'upper_wick', 'lower_wick', 'wick_ratio', 'body_ratio',
    # Volatility
    'atr5', 'atr14', 'atr50', 'atr200',
    'volcomp_5_14', 'volcomp_14_50', 'volcomp_50_200',
    'atr14_zscore', 'atr14_pct_rank', 'range_vs_atr14',
    # Trend
    'ema9', 'ema21', 'ema50', 'ema200',
    'ema_alignment', 'ema9_21_spread', 'ema21_50_spread',
    'close_vs_ema50', 'close_vs_ema200',
    # ADX
    'adx14', 'plus_di', 'minus_di', 'adx_slope', 'adx_accel',
    # Momentum
    'roc5', 'roc14', 'roc50', 'rsi14', 'rsi5', 'rsi14_slope',
    # Volume
    'rel_vol_20', 'rel_vol_100', 'vol_zscore', 'rel_dollar_vol', 'rel_txn', 'txn_per_vol',
    # Session/Time
    'is_rth', 'is_am_open', 'bars_since_rth_open',
    # Overnight
    'ov_range', 'ov_dir', 'ov_range_vs_atr14',
    # Trend ageing
    'trend_age_bars', 'bars_since_ema_flip',
    # Impulse/Expansion
    'is_impulse', 'bars_since_impulse', 'is_expansion', 'bars_since_expansion',
    # Multi-day
    'day_range', 'day_return', 'day_dir', 'day_range_vs_atr14', 'consec_up_days',
    # Structural
    'close_vs_range_mid', 'range_symmetry',
    # Failure patterns
    'failed_continuation', 'failed_reversal',
    # Auction
    'day_value_pos', 'auction_extension',
    # Fractal
    'fractal_aligned',
    # Compression
    'volcomp_rank_50', 'bars_compressed',
    # Forward labels
    'fwd_12_return', 'fwd_12_return_atr', 'is_exceptional_fwd', 'is_catastrophic_fwd',
    # Cross-session
    'ov_range_vs_day_range',
    # Liquidity
    'vol_trend_20', 'txn_trend_20',
]

# Save full dataset
out_cols = [c for c in feature_cols if c in df.columns]
df[out_cols].to_csv(f'{OUTPUT_DIR}/discovery_features_full.csv', index=False)
print(f"\nSaved full feature matrix: {len(df):,} bars × {len(out_cols)} features")

# Save RTH-only
rth_cols = [c for c in feature_cols if c in rth.columns]
rth[rth_cols].to_csv(f'{OUTPUT_DIR}/discovery_features_rth.csv', index=False)
print(f"Saved RTH feature matrix:  {len(rth):,} bars × {len(rth_cols)} features")

# Feature summary
print("\n=== FEATURE SUMMARY ===")
print(f"Total features: {len(out_cols)}")
print(f"Date range: {df['ts'].min().date()} to {df['ts'].max().date()}")
print(f"RTH bars: {len(rth):,} / Total bars: {len(df):,}")
print(f"Exceptional fwd moves (RTH): {rth['is_exceptional_fwd'].sum():,} ({rth['is_exceptional_fwd'].mean()*100:.1f}%)")
print(f"Catastrophic failures (RTH): {rth['is_catastrophic_fwd'].sum():,} ({rth['is_catastrophic_fwd'].mean()*100:.1f}%)")
print(f"Impulse bars (RTH): {rth['is_impulse'].sum():,} ({rth['is_impulse'].mean()*100:.1f}%)")
print(f"Compression bars (RTH): {rth['is_compressed'].sum():,} ({rth['is_compressed'].mean()*100:.1f}%)")
print("\n=== FEATURE ENGINEERING COMPLETE ===")
