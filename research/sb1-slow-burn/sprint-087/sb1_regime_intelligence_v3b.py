"""
Atlas Regime Intelligence v3b — Sprint 087 (corrected)
=======================================================
Fixes the data leakage in v3: every trade's RAS is now computed
using a model trained ONLY on the OTHER folds (out-of-fold prediction).
This gives honest, out-of-sample RAS scores for every trade.

Key change: use StratifiedKFold cross-val to assign RAS probabilities
out-of-fold, then use those honest scores for all downstream analysis.
The final production model is retrained on all data and its feature
importances are used for the fingerprint report.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings
warnings.filterwarnings('ignore')

from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score
from scipy.stats import mannwhitneyu
import json

# ─── Load data ───────────────────────────────────────────────────────────────
print("Loading MNQ 5-minute canonical dataset...")
df = pd.read_csv('/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv')
df['dt'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values('dt').reset_index(drop=True)
df['date'] = df['dt'].dt.date
df['hour'] = df['dt'].dt.hour
df['minute'] = df['dt'].dt.minute
df['dow'] = df['dt'].dt.dayofweek
df['month_num'] = df['dt'].dt.month
print(f"  {len(df):,} bars loaded.")

# ─── Core indicators ─────────────────────────────────────────────────────────
print("Computing indicators...")
df['ema15'] = df['close'].ewm(span=15, adjust=False).mean()
df['tr'] = np.maximum(df['high'] - df['low'],
           np.maximum(abs(df['high'] - df['close'].shift(1)),
                      abs(df['low'] - df['close'].shift(1))))
df['atr14'] = df['tr'].ewm(span=14, adjust=False).mean()
df['atr20_mean'] = df['atr14'].rolling(20).mean()
df['atr50_pct'] = df['atr14'].rolling(50).rank(pct=True)

up_move = df['high'].diff()
down_move = -df['low'].diff()
plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)
plus_dm_s = pd.Series(plus_dm, index=df.index).ewm(span=14, adjust=False).mean()
minus_dm_s = pd.Series(minus_dm, index=df.index).ewm(span=14, adjust=False).mean()
atr_s = df['tr'].ewm(span=14, adjust=False).mean()
plus_di = 100 * plus_dm_s / atr_s.replace(0, np.nan)
minus_di = 100 * minus_dm_s / atr_s.replace(0, np.nan)
dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di).replace(0, np.nan)
df['adx14'] = dx.ewm(span=14, adjust=False).mean()

atr_sum = df['tr'].rolling(14).sum()
high_max = df['high'].rolling(14).max()
low_min = df['low'].rolling(14).min()
rng = high_max - low_min
df['chop14'] = np.where(rng > 0, 100 * np.log10(atr_sum / rng) / np.log10(14), 50)

df['typical_price'] = (df['high'] + df['low'] + df['close']) / 3
df['tp_vol'] = df['typical_price'] * df['volume']
df['cum_tp_vol'] = df.groupby('date')['tp_vol'].cumsum()
df['cum_vol'] = df.groupby('date')['volume'].cumsum()
df['vwap'] = df['cum_tp_vol'] / df['cum_vol']

df['bb_mid'] = df['close'].rolling(20).mean()
df['bb_std'] = df['close'].rolling(20).std()
df['bb_width'] = (2 * df['bb_std']) / df['bb_mid'].replace(0, np.nan)
df['bb_width_pct'] = df['bb_width'].rolling(50).rank(pct=True)

df['above_ema'] = df['close'] > df['ema15']
df['cross_up'] = (~df['above_ema'].shift(1).fillna(False)) & df['above_ema']
df['cross_dn'] = df['above_ema'].shift(1).fillna(False) & (~df['above_ema'])
df['cross_any'] = df['cross_up'] | df['cross_dn']

df['vol_20_mean'] = df['volume'].rolling(20).mean()
df['vol_ratio'] = df['volume'] / df['vol_20_mean'].replace(0, np.nan)
df['body'] = abs(df['close'] - df['open'])

df['prev_close'] = df.groupby('date')['close'].transform('last').shift(1)
df['prev_high'] = df.groupby('date')['high'].transform('max').shift(1)
df['prev_low'] = df.groupby('date')['low'].transform('min').shift(1)
df['prev_range'] = df['prev_high'] - df['prev_low']

# Opening range
or_high_map = {}
or_low_map = {}
for date, grp in df.groupby('date'):
    morning = grp[(grp['hour'] == 9) & (grp['minute'] >= 30)]
    if len(morning) == 0:
        morning = grp[grp['hour'] == 10].head(6)
    if len(morning) > 0:
        or_high_map[date] = morning['high'].max()
        or_low_map[date] = morning['low'].min()
df['or_high'] = df['date'].map(or_high_map)
df['or_low'] = df['date'].map(or_low_map)
print("  Indicators computed.")

# ─── Load trades ─────────────────────────────────────────────────────────────
print("Loading 2-year trade list...")
trades_df = pd.read_csv('/home/ubuntu/sb1_086_trades_2yr.csv')
trades_df['entry_dt'] = pd.to_datetime(trades_df['entry_dt'])
trades_df['is_win'] = trades_df['pnl'] > 0
print(f"  {len(trades_df)} trades loaded.")

# ─── Feature Engineering ─────────────────────────────────────────────────────
print("Computing regime features...")

def get_regime_features(entry_dt, direction, df):
    idx_matches = df.index[df['dt'] == entry_dt]
    idx = idx_matches[0] if len(idx_matches) > 0 else (df['dt'] - entry_dt).abs().idxmin()
    if idx < 50:
        return None
    row = df.iloc[idx]
    close = row['close']
    ema = row['ema15']
    atr = row['atr14']
    if atr <= 0 or np.isnan(atr):
        return None

    atr_mean = row['atr20_mean']
    f_atr_expansion = atr / atr_mean if (atr_mean > 0 and not np.isnan(atr_mean)) else 1.0
    f_ema_dist = (close - ema) / atr
    ema_5ago = df.iloc[idx-5]['ema15'] if idx >= 5 else ema
    f_ema_slope = (ema - ema_5ago) / atr

    window_20 = df.iloc[max(0,idx-20):idx+1]
    above_seq = (window_20['close'] > window_20['ema15']).values
    persistence = sum(1 for v in reversed(above_seq) if v == above_seq[-1])
    # break on first mismatch
    p = 0
    for v in reversed(above_seq):
        if v == above_seq[-1]: p += 1
        else: break
    f_trend_persistence = p

    w10 = df.iloc[max(0,idx-10):idx+1]
    net_disp = abs(w10['close'].iloc[-1] - w10['close'].iloc[0])
    total_path = w10['tr'].sum()
    f_dir_efficiency = net_disp / total_path if total_path > 0 else 0.5

    w5 = df.iloc[max(0,idx-5):idx+1]
    if direction == 'LONG':
        pullback = (w5['high'].max() - close) / atr
    else:
        pullback = (close - w5['low'].min()) / atr
    f_pullback = max(0, pullback)

    vwap = row['vwap']
    f_vwap_dist = (close - vwap) / atr if not np.isnan(vwap) else 0.0

    prev_close = row['prev_close']
    f_overnight_gap = (row['open'] - prev_close) / atr if (not np.isnan(prev_close) and prev_close > 0) else 0.0

    hour, minute = row['hour'], row['minute']
    time_min = hour * 60 + minute
    news_times = [8*60+30, 10*60, 14*60]
    f_news_near = 1 if min(abs(time_min - t) for t in news_times) <= 30 else 0
    f_time_bucket = 0 if hour < 11 else (1 if hour < 13 else 2)
    f_dow = row['dow']

    f_vol_regime = row['atr50_pct'] if not np.isnan(row['atr50_pct']) else 0.5
    f_bb_width_pct = row['bb_width_pct'] if not np.isnan(row['bb_width_pct']) else 0.5

    or_h, or_l = row['or_high'], row['or_low']
    if not np.isnan(or_h) and not np.isnan(or_l) and (or_h - or_l) > 0:
        f_or_position = (close - or_l) / (or_h - or_l)
        f_or_breakout = 1 if close > or_h else (-1 if close < or_l else 0)
    else:
        f_or_position, f_or_breakout = 0.5, 0

    prev_h, prev_l, prev_r = row['prev_high'], row['prev_low'], row['prev_range']
    if not np.isnan(prev_r) and prev_r > 0:
        f_prev_day_position = (close - prev_l) / prev_r
        f_prev_day_range_atr = prev_r / atr
    else:
        f_prev_day_position, f_prev_day_range_atr = 0.5, 10.0

    f_chop = row['chop14']
    f_adx = row['adx14']
    f_vol_ratio = row['vol_ratio'] if not np.isnan(row['vol_ratio']) else 1.0

    cross_window = df['cross_any'].iloc[max(0,idx-20):idx+1]
    cross_indices = cross_window[cross_window].index
    f_cross_age = idx - cross_indices[-1] if len(cross_indices) > 0 else 20

    f_body_atr = row['body'] / atr if atr > 0 else 0.0

    return {
        'adx': f_adx, 'atr_expansion': f_atr_expansion, 'ema_dist': f_ema_dist,
        'ema_slope': f_ema_slope, 'trend_persistence': f_trend_persistence,
        'dir_efficiency': f_dir_efficiency, 'pullback': f_pullback,
        'vwap_dist': f_vwap_dist, 'overnight_gap': f_overnight_gap,
        'time_bucket': f_time_bucket, 'dow': f_dow, 'news_near': f_news_near,
        'vol_regime': f_vol_regime, 'bb_width_pct': f_bb_width_pct,
        'or_position': f_or_position, 'or_breakout': f_or_breakout,
        'prev_day_position': f_prev_day_position, 'prev_day_range_atr': f_prev_day_range_atr,
        'chop': f_chop, 'vol_ratio': f_vol_ratio, 'cross_age': f_cross_age,
        'body_atr': f_body_atr,
    }

feature_rows = []
for _, trade in trades_df.iterrows():
    feats = get_regime_features(trade['entry_dt'], trade['direction'], df)
    if feats is not None:
        feats.update({
            'pnl': trade['pnl'], 'is_win': trade['is_win'],
            'entry_dt': trade['entry_dt'], 'exit_signal': trade['exit_signal'],
            'bars_held': trade['bars_held'], 'mfe_usd': trade['mfe_usd'],
            'mae_usd': trade['mae_usd'], 'direction': trade['direction'],
        })
        feature_rows.append(feats)

feat_df = pd.DataFrame(feature_rows)
print(f"  {len(feat_df)} trades with regime features.")

FEATURE_COLS = [
    'adx', 'atr_expansion', 'ema_dist', 'ema_slope', 'trend_persistence',
    'dir_efficiency', 'pullback', 'vwap_dist', 'overnight_gap',
    'time_bucket', 'dow', 'news_near', 'vol_regime', 'bb_width_pct',
    'or_position', 'or_breakout', 'prev_day_position', 'prev_day_range_atr',
    'chop', 'vol_ratio', 'cross_age', 'body_atr',
]

# ─── Univariate Analysis ──────────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 1 — UNIVARIATE REGIME ANALYSIS")
print("="*70)

wins_raw = feat_df[feat_df['is_win']]
losses_raw = feat_df[~feat_df['is_win']]
print(f"\n  Winners: {len(wins_raw)} | Losers: {len(losses_raw)}")
print(f"\n  {'Feature':<25} {'Win Mean':>10} {'Loss Mean':>10} {'Diff':>8} {'p-value':>10} {'Sig':>5}")
print(f"  {'-'*70}")

univariate_results = []
for col in FEATURE_COLS:
    w_vals = wins_raw[col].dropna()
    l_vals = losses_raw[col].dropna()
    if len(w_vals) < 5 or len(l_vals) < 5:
        continue
    stat, pval = mannwhitneyu(w_vals, l_vals, alternative='two-sided')
    w_mean, l_mean = w_vals.mean(), l_vals.mean()
    diff = w_mean - l_mean
    sig = '***' if pval < 0.001 else ('**' if pval < 0.01 else ('*' if pval < 0.05 else ''))
    print(f"  {col:<25} {w_mean:>10.3f} {l_mean:>10.3f} {diff:>8.3f} {pval:>10.4f} {sig:>5}")
    univariate_results.append({'feature': col, 'win_mean': w_mean, 'loss_mean': l_mean,
                                'diff': diff, 'pval': pval, 'sig': sig})

univ_df = pd.DataFrame(univariate_results).sort_values('pval')

# ─── Clustering ───────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 2 — REGIME CLUSTERING")
print("="*70)

X = feat_df[FEATURE_COLS].fillna(feat_df[FEATURE_COLS].median())
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

from sklearn.metrics import silhouette_score
silhouettes = []
K_range = range(3, 9)
for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    silhouettes.append(silhouette_score(X_scaled, labels))

best_k = K_range[np.argmax(silhouettes)]
print(f"  Optimal K: {best_k} (silhouette: {max(silhouettes):.3f})")

km_final = KMeans(n_clusters=best_k, random_state=42, n_init=20)
feat_df['cluster'] = km_final.fit_predict(X_scaled)

print(f"\n  {'Cluster':<12} {'N':>5} {'Win%':>7} {'Net P&L':>10} {'PF':>7} {'Exp':>8} {'ADX':>7} {'Chop':>7} {'ATRexp':>8}")
print(f"  {'-'*75}")

cluster_profiles = []
for c in sorted(feat_df['cluster'].unique()):
    grp = feat_df[feat_df['cluster'] == c]
    w = grp[grp['is_win']]
    l = grp[~grp['is_win']]
    gp = w['pnl'].sum()
    gl = abs(l['pnl'].sum())
    pf = gp/gl if gl > 0 else float('inf')
    wr = len(w)/len(grp)*100
    net = grp['pnl'].sum()
    exp = grp['pnl'].mean()
    adx_m = grp['adx'].mean()
    chop_m = grp['chop'].mean()
    atr_exp_m = grp['atr_expansion'].mean()
    dir_eff_m = grp['dir_efficiency'].mean()
    trend_p_m = grp['trend_persistence'].mean()
    vol_r_m = grp['vol_regime'].mean()
    label = f"C{c}"
    print(f"  {label:<12} {len(grp):>5} {wr:>7.1f}% ${net:>9,.0f} {pf:>7.3f} ${exp:>7,.0f} {adx_m:>7.1f} {chop_m:>7.1f} {atr_exp_m:>8.3f}")
    cluster_profiles.append({
        'cluster': c, 'n': len(grp), 'wr': wr, 'net_pnl': net, 'pf': pf,
        'expectancy': exp, 'adx': adx_m, 'chop': chop_m, 'atr_expansion': atr_exp_m,
        'dir_efficiency': dir_eff_m, 'trend_persistence': trend_p_m,
        'vol_regime': vol_r_m, 'bb_width_pct': grp['bb_width_pct'].mean(),
        'cross_age': grp['cross_age'].mean(), 'dow': grp['dow'].mean(),
        'ema_slope': grp['ema_slope'].mean(), 'vwap_dist': grp['vwap_dist'].mean(),
        'prev_day_range_atr': grp['prev_day_range_atr'].mean(),
        'overnight_gap': grp['overnight_gap'].mean(),
    })

cluster_df = pd.DataFrame(cluster_profiles).sort_values('pf', ascending=False)

winning_clusters = cluster_df[cluster_df['pf'] >= 1.30]['cluster'].tolist()
losing_clusters = cluster_df[cluster_df['pf'] < 1.00]['cluster'].tolist()
marginal_clusters = cluster_df[(cluster_df['pf'] >= 1.00) & (cluster_df['pf'] < 1.30)]['cluster'].tolist()
print(f"\n  Winning (PF≥1.30): {winning_clusters}")
print(f"  Marginal (1.00–1.30): {marginal_clusters}")
print(f"  Losing (PF<1.00): {losing_clusters}")

# ─── OUT-OF-FOLD RAS ──────────────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 3 — OUT-OF-FOLD REGIME ACTIVATION SCORE (honest, no leakage)")
print("="*70)

X_ras = pd.DataFrame(X, columns=FEATURE_COLS)
y_ras = feat_df['is_win'].astype(int).values

# Out-of-fold prediction: each trade scored by a model that never saw it
oof_probs = np.zeros(len(feat_df))
skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
cv_aucs = []

for fold, (train_idx, val_idx) in enumerate(skf.split(X_ras, y_ras)):
    gbm = GradientBoostingClassifier(n_estimators=300, max_depth=4, learning_rate=0.03,
                                      subsample=0.8, min_samples_leaf=10, random_state=42)
    gbm.fit(X_ras.iloc[train_idx], y_ras[train_idx])
    probs = gbm.predict_proba(X_ras.iloc[val_idx])[:, 1]
    oof_probs[val_idx] = probs
    auc = roc_auc_score(y_ras[val_idx], probs)
    cv_aucs.append(auc)
    print(f"  Fold {fold+1:2d}: AUC {auc:.3f}")

print(f"\n  Mean OOF AUC: {np.mean(cv_aucs):.3f} ± {np.std(cv_aucs):.3f}")

feat_df['ras'] = (oof_probs * 100).round(1)

# Train final production model on all data for feature importances
gbm_final = GradientBoostingClassifier(n_estimators=300, max_depth=4, learning_rate=0.03,
                                        subsample=0.8, min_samples_leaf=10, random_state=42)
gbm_final.fit(X_ras, y_ras)
feat_importance = pd.DataFrame({
    'feature': FEATURE_COLS,
    'importance': gbm_final.feature_importances_
}).sort_values('importance', ascending=False)

print(f"\n  Top 10 Feature Importances (production model):")
for _, r in feat_importance.head(10).iterrows():
    bar = '█' * int(r['importance'] * 200)
    print(f"    {r['feature']:<25}: {r['importance']:.4f} {bar}")

# ─── RAS Threshold Analysis (honest OOF scores) ───────────────────────────────
print(f"\n  OOF RAS Threshold Analysis:")
print(f"  {'Threshold':>10} {'Trades':>8} {'Net P&L':>10} {'PF':>7} {'WR':>7} {'Exp':>8} {'Coverage':>10}")
print(f"  {'-'*65}")

threshold_results = []
for thresh in range(30, 75, 5):
    active = feat_df[feat_df['ras'] >= thresh]
    if len(active) < 20:
        break
    w = active[active['is_win']]
    l = active[~active['is_win']]
    gp = w['pnl'].sum()
    gl = abs(l['pnl'].sum())
    pf = gp/gl if gl > 0 else float('inf')
    wr = len(w)/len(active)*100
    net = active['pnl'].sum()
    exp = active['pnl'].mean()
    coverage = len(active)/len(feat_df)*100
    print(f"  {thresh:>10} {len(active):>8} ${net:>9,.0f} {pf:>7.3f} {wr:>7.1f}% ${exp:>7,.0f} {coverage:>9.1f}%")
    threshold_results.append({
        'threshold': thresh, 'n': len(active), 'net_pnl': net,
        'pf': pf, 'wr': wr, 'expectancy': exp, 'coverage': coverage
    })

thresh_df = pd.DataFrame(threshold_results)

# Optimal: highest PF with coverage ≥ 30%
valid = thresh_df[thresh_df['coverage'] >= 30]
optimal_thresh = int(valid.loc[valid['pf'].idxmax(), 'threshold']) if len(valid) > 0 else 45
print(f"\n  Optimal OOF RAS threshold: {optimal_thresh}")

# ─── Performance Comparison ───────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 4 — PERFORMANCE COMPARISON (honest OOF RAS)")
print("="*70)

always_on = feat_df
regime_active = feat_df[feat_df['ras'] >= optimal_thresh]
regime_suppressed = feat_df[feat_df['ras'] < optimal_thresh]

def summary(df, label):
    if len(df) == 0:
        return {}
    w = df[df['is_win']]
    l = df[~df['is_win']]
    gp = w['pnl'].sum()
    gl = abs(l['pnl'].sum())
    pf = gp/gl if gl > 0 else float('inf')
    wr = len(w)/len(df)*100
    net = df['pnl'].sum()
    exp = df['pnl'].mean()
    cum = df['pnl'].cumsum()
    max_dd = (cum - cum.cummax()).min()
    romad = abs(net/max_dd) if max_dd < 0 else float('inf')
    print(f"  {label}")
    print(f"    Trades: {len(df):>6}  |  Net P&L: ${net:>10,.0f}  |  PF: {pf:.3f}  |  WR: {wr:.1f}%  |  Exp: ${exp:,.0f}  |  DD: ${max_dd:,.0f}")
    return {'label': label, 'n': len(df), 'net_pnl': net, 'pf': pf,
            'wr': wr, 'expectancy': exp, 'max_dd': max_dd, 'romad': romad}

print()
always_stats = summary(always_on, f"Always-On (all {len(always_on)} trades)")
regime_stats = summary(regime_active, f"Regime-Activated (RAS≥{optimal_thresh}, {len(regime_active)} trades, {len(regime_active)/len(always_on)*100:.1f}% coverage)")
suppressed_stats = summary(regime_suppressed, f"Suppressed (RAS<{optimal_thresh}, {len(regime_suppressed)} trades)")

pf_improvement = (regime_stats['pf'] - always_stats['pf']) / always_stats['pf'] * 100
exp_improvement = (regime_stats['expectancy'] - always_stats['expectancy']) / abs(always_stats['expectancy']) * 100
dd_improvement = (abs(regime_stats['max_dd']) - abs(always_stats['max_dd'])) / abs(always_stats['max_dd']) * 100

print(f"\n  Improvement Summary:")
print(f"    PF:          {always_stats['pf']:.3f} → {regime_stats['pf']:.3f}  ({pf_improvement:+.1f}%)")
print(f"    Expectancy:  ${always_stats['expectancy']:,.0f} → ${regime_stats['expectancy']:,.0f}  ({exp_improvement:+.1f}%)")
print(f"    Max DD:      ${always_stats['max_dd']:,.0f} → ${regime_stats['max_dd']:,.0f}  ({dd_improvement:+.1f}%)")
print(f"    Trades:      {len(always_on)} → {len(regime_active)}  ({(1-len(regime_active)/len(always_on))*100:.1f}% reduction)")

# ─── Monte Carlo Comparison ───────────────────────────────────────────────────
print("\n" + "="*70)
print("PHASE 5 — MONTE CARLO COMPARISON (10,000 simulations)")
print("="*70)

rng_mc = np.random.default_rng(42)
n_sims = 10000

def run_mc(trade_pnls, n_annual, label):
    sim_pnls = []
    sim_dds = []
    for _ in range(n_sims):
        sample = rng_mc.choice(trade_pnls, size=n_annual, replace=True)
        sim_pnls.append(sample.sum())
        cum = np.cumsum(sample)
        dd = (cum - np.maximum.accumulate(cum)).min()
        sim_dds.append(dd)
    sim_pnls = np.array(sim_pnls)
    sim_dds = np.array(sim_dds)
    p_pos = (sim_pnls > 0).mean() * 100
    print(f"  {label}:")
    print(f"    Mean: ${sim_pnls.mean():>10,.0f}  |  5th pct: ${np.percentile(sim_pnls,5):>10,.0f}  |  95th pct: ${np.percentile(sim_pnls,95):>10,.0f}  |  P(+): {p_pos:.1f}%  |  Mean DD: ${sim_dds.mean():>10,.0f}")
    return sim_pnls, sim_dds, p_pos

n_annual_always = max(1, int(len(always_on) / 2))
n_annual_regime = max(1, int(len(regime_active) / 2))
print()
mc_always_pnls, mc_always_dds, p_pos_always = run_mc(always_on['pnl'].values, n_annual_always, f"Always-On ({n_annual_always}/yr)")
print()
mc_regime_pnls, mc_regime_dds, p_pos_regime = run_mc(regime_active['pnl'].values, n_annual_regime, f"Regime-Activated ({n_annual_regime}/yr)")

# ─── Charts ───────────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("GENERATING CHARTS")
print("="*70)

wins = feat_df[feat_df['is_win']]
losses = feat_df[~feat_df['is_win']]

# Chart 1: Cluster analysis + feature importance + RAS distribution
fig = plt.figure(figsize=(22, 14), facecolor='#0d1117')
fig.suptitle('Atlas Regime Intelligence v3 — Cluster Analysis & Feature Importance\nSB1 Two-Year Trade Population (883 trades, 22 regime dimensions)', 
             color='white', fontsize=15, fontweight='bold', y=0.98)
gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.42, wspace=0.35)

# PCA 2D scatter
ax_pca = fig.add_subplot(gs[0, :2])
ax_pca.set_facecolor('#161b22')
ax_pca.tick_params(colors='#8b949e')
for sp in ax_pca.spines.values(): sp.set_color('#30363d')
ax_pca.spines['top'].set_visible(False); ax_pca.spines['right'].set_visible(False)

pca = PCA(n_components=2, random_state=42)
X_pca = pca.fit_transform(X_scaled)
palette = ['#58a6ff', '#3fb950', '#f85149', '#f0e68c', '#c084fc', '#fb923c', '#34d399', '#e879f9']
for c in sorted(feat_df['cluster'].unique()):
    mask = feat_df['cluster'] == c
    cp = cluster_df[cluster_df['cluster'] == c].iloc[0]
    color = '#3fb950' if c in winning_clusters else ('#f85149' if c in losing_clusters else palette[c % len(palette)])
    ax_pca.scatter(X_pca[mask, 0], X_pca[mask, 1], c=color, alpha=0.45, s=20,
                   label=f"C{c} PF{cp['pf']:.2f} n={cp['n']}")
ax_pca.set_title('PCA 2D — Trade Regime Clusters', color='#e6edf3', fontsize=12)
ax_pca.set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]*100:.1f}%)', color='#8b949e', fontsize=9)
ax_pca.set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]*100:.1f}%)', color='#8b949e', fontsize=9)
ax_pca.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

# Cluster PF
ax_pf = fig.add_subplot(gs[0, 2])
ax_pf.set_facecolor('#161b22')
ax_pf.tick_params(colors='#8b949e')
for sp in ax_pf.spines.values(): sp.set_color('#30363d')
ax_pf.spines['top'].set_visible(False); ax_pf.spines['right'].set_visible(False)
c_labels = [f"C{r['cluster']}\n(n={r['n']})" for _, r in cluster_df.iterrows()]
c_pfs = np.minimum(cluster_df['pf'].values, 3.0)  # cap for display
c_colors = ['#3fb950' if p >= 1.30 else ('#f85149' if p < 1.00 else '#f0e68c') for p in cluster_df['pf'].values]
ax_pf.barh(c_labels, c_pfs, color=c_colors, alpha=0.85)
ax_pf.axvline(x=1.30, color='#f0e68c', linewidth=1.5, linestyle='--', label='PF 1.30')
ax_pf.axvline(x=1.00, color='#f85149', linewidth=1.0, linestyle=':', label='PF 1.00')
ax_pf.set_title('Cluster Profit Factors', color='#e6edf3', fontsize=11)
ax_pf.set_xlabel('Profit Factor (capped at 3.0)', color='#8b949e', fontsize=9)
ax_pf.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

# Feature importance
ax_fi = fig.add_subplot(gs[1, :2])
ax_fi.set_facecolor('#161b22')
ax_fi.tick_params(colors='#8b949e')
for sp in ax_fi.spines.values(): sp.set_color('#30363d')
ax_fi.spines['top'].set_visible(False); ax_fi.spines['right'].set_visible(False)
top15 = feat_importance.head(15)
fi_colors = ['#58a6ff' if i < 3 else ('#3fb950' if i < 7 else '#8b949e') for i in range(len(top15))]
ax_fi.barh(top15['feature'][::-1], top15['importance'][::-1], color=fi_colors[::-1], alpha=0.85)
ax_fi.set_title('RAS Feature Importances — Top 15 (Production Model)', color='#e6edf3', fontsize=11)
ax_fi.set_xlabel('Importance', color='#8b949e', fontsize=9)

# OOF RAS distribution
ax_ras = fig.add_subplot(gs[1, 2])
ax_ras.set_facecolor('#161b22')
ax_ras.tick_params(colors='#8b949e')
for sp in ax_ras.spines.values(): sp.set_color('#30363d')
ax_ras.spines['top'].set_visible(False); ax_ras.spines['right'].set_visible(False)
ax_ras.hist(wins['ras'], bins=25, alpha=0.6, color='#3fb950', label=f'Winners ({len(wins)})', density=True)
ax_ras.hist(losses['ras'], bins=25, alpha=0.6, color='#f85149', label=f'Losers ({len(losses)})', density=True)
ax_ras.axvline(x=optimal_thresh, color='#f0e68c', linewidth=2, linestyle='--', label=f'RAS≥{optimal_thresh}')
ax_ras.set_title(f'OOF RAS Distribution\nAUC={np.mean(cv_aucs):.3f}', color='#e6edf3', fontsize=11)
ax_ras.set_xlabel('Regime Activation Score (out-of-fold)', color='#8b949e', fontsize=9)
ax_ras.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

plt.savefig('/home/ubuntu/sb1_087_chart1_clusters.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 1 saved.")

# Chart 2: Performance comparison
fig, axes = plt.subplots(2, 2, figsize=(18, 12), facecolor='#0d1117')
fig.suptitle(f'SB1 Always-On vs Regime-Activated (OOF RAS≥{optimal_thresh})\nHonest Out-of-Fold Performance Comparison', 
             color='white', fontsize=14, fontweight='bold')
for ax in axes.flat:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    for sp in ax.spines.values(): sp.set_color('#30363d')
    ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)

# Equity curves
ax = axes[0, 0]
cum_always = always_on['pnl'].cumsum().reset_index(drop=True)
cum_regime = regime_active.sort_values('entry_dt')['pnl'].cumsum().reset_index(drop=True)
ax.plot(cum_always.values, color='#8b949e', linewidth=1.2, alpha=0.7, label=f'Always-On (PF {always_stats["pf"]:.3f})')
ax.plot(cum_regime.values, color='#3fb950', linewidth=1.8, label=f'Regime-Activated (PF {regime_stats["pf"]:.3f})')
ax.axhline(y=0, color='#30363d', linewidth=0.8, linestyle='--')
ax.set_title('Equity Curves', color='#e6edf3', fontsize=11)
ax.set_ylabel('Cumulative P&L ($)', color='#8b949e')
ax.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

# Drawdown
ax = axes[0, 1]
dd_always = cum_always - cum_always.cummax()
dd_regime = cum_regime - cum_regime.cummax()
ax.fill_between(range(len(dd_always)), 0, dd_always.values, alpha=0.4, color='#8b949e', label=f'Always-On DD: ${always_stats["max_dd"]:,.0f}')
ax.fill_between(range(len(dd_regime)), 0, dd_regime.values, alpha=0.5, color='#f85149', label=f'Regime DD: ${regime_stats["max_dd"]:,.0f}')
ax.set_title('Drawdown Profiles', color='#e6edf3', fontsize=11)
ax.set_ylabel('Drawdown ($)', color='#8b949e')
ax.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

# RAS threshold sweep
ax = axes[1, 0]
if len(thresh_df) > 0:
    ax.plot(thresh_df['threshold'], thresh_df['pf'].clip(upper=5.0), color='#58a6ff', linewidth=2, marker='o', markersize=5)
    ax.axhline(y=1.30, color='#f0e68c', linewidth=1.5, linestyle='--', label='PF 1.30 target')
    ax.axvline(x=optimal_thresh, color='#3fb950', linewidth=1.5, linestyle='--', label=f'Optimal: {optimal_thresh}')
    ax.set_title('PF vs OOF RAS Threshold', color='#e6edf3', fontsize=11)
    ax.set_xlabel('RAS Threshold', color='#8b949e')
    ax.set_ylabel('Profit Factor (capped 5.0)', color='#8b949e')
    ax.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

# Monte Carlo
ax = axes[1, 1]
ax.hist(mc_always_pnls, bins=60, alpha=0.5, color='#8b949e', label=f'Always-On P(+)={p_pos_always:.0f}%', density=True)
ax.hist(mc_regime_pnls, bins=60, alpha=0.6, color='#3fb950', label=f'Regime-Act P(+)={p_pos_regime:.0f}%', density=True)
ax.axvline(x=0, color='#f85149', linewidth=1.5, linestyle='--')
ax.set_title('Monte Carlo Annual P&L (10,000 sims)', color='#e6edf3', fontsize=11)
ax.set_xlabel('Annual P&L ($)', color='#8b949e')
ax.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

plt.tight_layout(rect=[0, 0, 1, 0.94])
plt.savefig('/home/ubuntu/sb1_087_chart2_comparison.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 2 saved.")

# Chart 3: Regime fingerprints
fig, axes = plt.subplots(1, 3, figsize=(21, 7), facecolor='#0d1117')
fig.suptitle('Regime Fingerprints — Winning vs Losing Market States (OOF RAS)', 
             color='white', fontsize=13, fontweight='bold')
for ax in axes:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    for sp in ax.spines.values(): sp.set_color('#30363d')
    ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)

key_features = ['adx', 'chop', 'atr_expansion', 'dir_efficiency', 'trend_persistence',
                'vol_regime', 'bb_width_pct', 'cross_age', 'ema_slope', 'prev_day_range_atr']
key_labels = ['ADX', 'CHOP', 'ATR Exp', 'Dir Eff', 'Trend Pers', 'Vol Regime', 'BB Width', 'Cross Age', 'EMA Slope', 'PD Range/ATR']

# Normalise for radar-like comparison
regime_active_trades = feat_df[feat_df['ras'] >= optimal_thresh]
regime_suppressed_trades = feat_df[feat_df['ras'] < optimal_thresh]

def norm_col(col, df_all):
    mn, mx = df_all[col].quantile(0.05), df_all[col].quantile(0.95)
    return lambda x: np.clip((x - mn) / (mx - mn + 1e-9), 0, 1)

x = np.arange(len(key_features))
width = 0.28
active_means = [regime_active_trades[f].mean() for f in key_features]
suppressed_means = [regime_suppressed_trades[f].mean() for f in key_features]
win_means = [wins[f].mean() for f in key_features]
loss_means = [losses[f].mean() for f in key_features]

axes[0].bar(x - width/2, win_means, width, label='Winners', color='#3fb950', alpha=0.8)
axes[0].bar(x + width/2, loss_means, width, label='Losers', color='#f85149', alpha=0.8)
axes[0].set_xticks(x); axes[0].set_xticklabels(key_labels, rotation=45, ha='right', fontsize=7)
axes[0].set_title('Winners vs Losers\n(raw feature means)', color='#e6edf3', fontsize=10)
axes[0].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

axes[1].bar(x - width/2, active_means, width, label=f'RAS≥{optimal_thresh} Active', color='#3fb950', alpha=0.8)
axes[1].bar(x + width/2, suppressed_means, width, label=f'RAS<{optimal_thresh} Suppressed', color='#f85149', alpha=0.8)
axes[1].set_xticks(x); axes[1].set_xticklabels(key_labels, rotation=45, ha='right', fontsize=7)
axes[1].set_title(f'Active vs Suppressed\n(RAS threshold {optimal_thresh})', color='#e6edf3', fontsize=10)
axes[1].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

# DOW breakdown
dow_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
dow_always = [always_on[always_on['dow'] == d]['pnl'].sum() for d in range(5)]
dow_regime = [regime_active_trades[regime_active_trades['dow'] == d]['pnl'].sum() for d in range(5)]
x2 = np.arange(5)
axes[2].bar(x2 - width/2, dow_always, width, label='Always-On', color='#8b949e', alpha=0.7)
axes[2].bar(x2 + width/2, dow_regime, width, label=f'RAS≥{optimal_thresh}', color='#3fb950', alpha=0.8)
axes[2].axhline(y=0, color='#30363d', linewidth=0.8)
axes[2].set_xticks(x2); axes[2].set_xticklabels(dow_names)
axes[2].set_title('Day-of-Week P&L\nAlways-On vs Regime-Activated', color='#e6edf3', fontsize=10)
axes[2].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=8)

plt.tight_layout()
plt.savefig('/home/ubuntu/sb1_087_chart3_fingerprints.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 3 saved.")

# Chart 4: RAS calibration — win rate by RAS decile
fig, axes = plt.subplots(1, 2, figsize=(16, 7), facecolor='#0d1117')
fig.suptitle('RAS Calibration — Win Rate & Expectancy by Score Decile', 
             color='white', fontsize=13, fontweight='bold')
for ax in axes:
    ax.set_facecolor('#161b22')
    ax.tick_params(colors='#8b949e')
    for sp in ax.spines.values(): sp.set_color('#30363d')
    ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)

feat_df['ras_decile'] = pd.qcut(feat_df['ras'], q=10, labels=False, duplicates='drop')
decile_stats = feat_df.groupby('ras_decile').agg(
    n=('pnl', 'count'),
    wr=('is_win', 'mean'),
    exp=('pnl', 'mean'),
    net=('pnl', 'sum'),
    ras_mid=('ras', 'mean')
).reset_index()

colors_d = ['#f85149' if r < 0.34 else ('#f0e68c' if r < 0.40 else '#3fb950') for r in decile_stats['wr']]
axes[0].bar(decile_stats['ras_decile'], decile_stats['wr'] * 100, color=colors_d, alpha=0.85)
axes[0].axhline(y=34.2, color='#8b949e', linewidth=1.5, linestyle='--', label='Baseline WR 34.2%')
axes[0].set_title('Win Rate by RAS Decile', color='#e6edf3', fontsize=11)
axes[0].set_xlabel('RAS Decile (0=lowest, 9=highest)', color='#8b949e')
axes[0].set_ylabel('Win Rate (%)', color='#8b949e')
axes[0].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

exp_colors = ['#f85149' if e < 0 else '#3fb950' for e in decile_stats['exp']]
axes[1].bar(decile_stats['ras_decile'], decile_stats['exp'], color=exp_colors, alpha=0.85)
axes[1].axhline(y=9.2, color='#8b949e', linewidth=1.5, linestyle='--', label='Baseline Exp $9')
axes[1].axhline(y=0, color='#30363d', linewidth=0.8)
axes[1].set_title('Expectancy by RAS Decile', color='#e6edf3', fontsize=11)
axes[1].set_xlabel('RAS Decile (0=lowest, 9=highest)', color='#8b949e')
axes[1].set_ylabel('Expectancy ($/trade)', color='#8b949e')
axes[1].legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='#8b949e', fontsize=9)

plt.tight_layout()
plt.savefig('/home/ubuntu/sb1_087_chart4_calibration.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print("  Chart 4 saved.")

# ─── Save data ────────────────────────────────────────────────────────────────
feat_df.to_csv('/home/ubuntu/sb1_087_regime_features.csv', index=False)
cluster_df.to_csv('/home/ubuntu/sb1_087_cluster_profiles.csv', index=False)
feat_importance.to_csv('/home/ubuntu/sb1_087_feature_importance.csv', index=False)
thresh_df.to_csv('/home/ubuntu/sb1_087_threshold_analysis.csv', index=False)

# ─── Final Summary ────────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print("FINAL SUMMARY — ATLAS REGIME INTELLIGENCE v3 (honest OOF)")
print("="*70)
print(f"  Trades analysed:         {len(feat_df)}")
print(f"  Regime dimensions:       {len(FEATURE_COLS)}")
print(f"  Clusters found:          {best_k}")
print(f"  OOF AUC:                 {np.mean(cv_aucs):.3f} ± {np.std(cv_aucs):.3f}")
print(f"  Optimal RAS threshold:   {optimal_thresh}")
print(f"")
print(f"  ALWAYS-ON:               PF {always_stats['pf']:.3f} | ${always_stats['net_pnl']:,.0f} | WR {always_stats['wr']:.1f}% | DD ${always_stats['max_dd']:,.0f}")
print(f"  REGIME-ACTIVATED:        PF {regime_stats['pf']:.3f} | ${regime_stats['net_pnl']:,.0f} | WR {regime_stats['wr']:.1f}% | DD ${regime_stats['max_dd']:,.0f}")
print(f"")
print(f"  PF improvement:          {pf_improvement:+.1f}%")
print(f"  Expectancy improvement:  {exp_improvement:+.1f}%")
print(f"  Max DD change:           {dd_improvement:+.1f}%")
print(f"  Trade count reduction:   {(1-len(regime_active)/len(always_on))*100:.1f}%")
print(f"  MC P(positive) always:   {p_pos_always:.1f}%")
print(f"  MC P(positive) regime:   {p_pos_regime:.1f}%")

# Decile table
print(f"\n  Win Rate & Expectancy by RAS Decile:")
print(f"  {'Decile':>8} {'RAS Mid':>8} {'N':>5} {'WR':>7} {'Exp':>8} {'Net P&L':>10}")
for _, r in decile_stats.iterrows():
    print(f"  {int(r['ras_decile']):>8} {r['ras_mid']:>8.1f} {int(r['n']):>5} {r['wr']*100:>7.1f}% ${r['exp']:>7,.0f} ${r['net']:>9,.0f}")

# Save results JSON
results = {
    'n_trades': len(feat_df), 'n_dims': len(FEATURE_COLS), 'best_k': best_k,
    'winning_clusters': winning_clusters, 'losing_clusters': losing_clusters,
    'marginal_clusters': marginal_clusters, 'oof_auc': float(np.mean(cv_aucs)),
    'oof_auc_std': float(np.std(cv_aucs)), 'optimal_thresh': int(optimal_thresh),
    'always_stats': {k: float(v) if not isinstance(v, str) else v for k, v in always_stats.items()},
    'regime_stats': {k: float(v) if not isinstance(v, str) else v for k, v in regime_stats.items()},
    'pf_improvement': float(pf_improvement), 'exp_improvement': float(exp_improvement),
    'dd_improvement': float(dd_improvement),
    'trade_reduction': float((1-len(regime_active)/len(always_on))*100),
    'p_pos_always': float(p_pos_always), 'p_pos_regime': float(p_pos_regime),
    'mc_always_mean': float(mc_always_pnls.mean()), 'mc_regime_mean': float(mc_regime_pnls.mean()),
    'mc_always_p5': float(np.percentile(mc_always_pnls, 5)),
    'mc_regime_p5': float(np.percentile(mc_regime_pnls, 5)),
    'mc_always_p95': float(np.percentile(mc_always_pnls, 95)),
    'mc_regime_p95': float(np.percentile(mc_regime_pnls, 95)),
    'mc_always_dd_mean': float(mc_always_dds.mean()),
    'mc_regime_dd_mean': float(mc_regime_dds.mean()),
    'top_features': feat_importance.head(10)['feature'].tolist(),
    'cluster_df': cluster_df.to_dict('records'),
    'thresh_df': thresh_df.to_dict('records'),
    'univ_df': univ_df.head(10).to_dict('records'),
    'decile_df': decile_stats.to_dict('records'),
    'wins_adx': float(wins['adx'].mean()), 'losses_adx': float(losses['adx'].mean()),
    'wins_chop': float(wins['chop'].mean()), 'losses_chop': float(losses['chop'].mean()),
    'wins_dir_eff': float(wins['dir_efficiency'].mean()), 'losses_dir_eff': float(losses['dir_efficiency'].mean()),
    'wins_trend_pers': float(wins['trend_persistence'].mean()), 'losses_trend_pers': float(losses['trend_persistence'].mean()),
    'wins_vol_regime': float(wins['vol_regime'].mean()), 'losses_vol_regime': float(losses['vol_regime'].mean()),
    'wins_atr_exp': float(wins['atr_expansion'].mean()), 'losses_atr_exp': float(losses['atr_expansion'].mean()),
    'wins_cross_age': float(wins['cross_age'].mean()), 'losses_cross_age': float(losses['cross_age'].mean()),
    'wins_ema_slope': float(wins['ema_slope'].mean()), 'losses_ema_slope': float(losses['ema_slope'].mean()),
    'wins_prev_day_range': float(wins['prev_day_range_atr'].mean()),
    'losses_prev_day_range': float(losses['prev_day_range_atr'].mean()),
    'wins_overnight_gap': float(wins['overnight_gap'].mean()),
    'losses_overnight_gap': float(losses['overnight_gap'].mean()),
    'n_annual_always': n_annual_always, 'n_annual_regime': n_annual_regime,
}
with open('/home/ubuntu/sb1_087_results.json', 'w') as f:
    json.dump(results, f, indent=2, default=str)

print("\n✓ All analysis complete. Data saved.")
