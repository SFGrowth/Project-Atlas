"""
Atlas Research Engine — Sprint 045
Reverse Market Causality Engine (RMCE)
Stream E — Discovery Methodology

Research Question: What market conditions consistently exist before exceptional
                   directional moves (≥2.0R)?

Methodology:
  1. Identify all ≥1.5R, ≥2.0R, ≥2.5R target events (outcome-first)
  2. Reconstruct the complete market state 0-30 bars before each event
  3. Cluster events by precursor similarity (K-Means + DBSCAN)
  4. Contrast against matched non-event control group
  5. Compute Information Gain, effect size, and statistical significance
  6. Generate ranked hypotheses for Atlas validation pipeline
"""

import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, DBSCAN
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
import warnings
warnings.filterwarnings('ignore')

DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
CHART_DIR  = Path("/home/ubuntu/Project-Atlas/research/sprint-045-charts")
CHART_DIR.mkdir(parents=True, exist_ok=True)
MNQ_PV = 2.0

# ─── Data Loading & Indicators ────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts']     = pd.to_datetime(df['timestamp_et'], utc=True)
    df           = df.sort_values('ts').reset_index(drop=True)
    df['date']   = df['ts'].dt.date
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['dow']    = df['ts'].dt.dayofweek   # 0=Mon
    df['month']  = df['ts'].dt.month
    df['dom']    = df['ts'].dt.day
    df['mins_since_open'] = (df['hour'] - 9)*60 + df['minute'] - 30
    df['mins_since_open'] = df['mins_since_open'].clip(lower=0)

    # Session labels
    def session(row):
        t = row['hour']*60 + row['minute']
        if t < 570:  return 'GLOBEX'    # before 9:30
        if t < 660:  return 'OPEN'      # 9:30-11:00
        if t < 780:  return 'MIDDAY'    # 11:00-13:00
        if t < 900:  return 'PM'        # 13:00-15:00
        if t < 960:  return 'CLOSE'     # 15:00-16:00
        return 'OVERNIGHT'
    df['session'] = df.apply(session, axis=1)
    df['is_rth']  = df['session'].isin(['OPEN','MIDDAY','PM','CLOSE'])

    hi = df['high'].values; lo = df['low'].values; cl = df['close'].values
    n  = len(cl)

    # True Range & ATR
    pc  = np.concatenate([[cl[0]], cl[:-1]])
    tr  = np.maximum(hi-lo, np.maximum(np.abs(hi-pc), np.abs(lo-pc)))
    df['atr5']  = pd.Series(tr).rolling(5,  min_periods=1).mean().values
    df['atr14'] = pd.Series(tr).rolling(14, min_periods=1).mean().values
    df['atr50'] = pd.Series(tr).rolling(50, min_periods=1).mean().values

    # ATR acceleration (current / 20-bar-ago)
    atr14 = df['atr14'].values
    atr_accel = np.ones(n)
    for i in range(20, n):
        if atr14[i-20] > 0:
            atr_accel[i] = atr14[i] / atr14[i-20]
    df['atr_accel'] = atr_accel

    # EMAs
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['ema200']= df['close'].ewm(span=200,adjust=False).mean()

    # ADX
    df['adx'] = compute_adx(df, 14)

    # ADX slope (5-bar change)
    adx = df['adx'].values
    adx_slope = np.zeros(n)
    for i in range(5, n):
        adx_slope[i] = adx[i] - adx[i-5]
    df['adx_slope'] = adx_slope

    # VWAP (daily reset)
    df['vwap'] = compute_daily_vwap(df)

    # Relative volume (vs 20-bar avg)
    vol = df['volume'].values if 'volume' in df.columns else np.ones(n)
    avg_vol = pd.Series(vol).rolling(20, min_periods=1).mean().values
    df['rel_vol'] = np.where(avg_vol > 0, vol / avg_vol, 1.0)

    # Previous day high/low
    df['prev_day_hi'] = df.groupby('date')['high'].transform('max').shift(288)
    df['prev_day_lo'] = df.groupby('date')['low'].transform('min').shift(288)

    # Swing highs/lows (11-bar)
    df['swing_hi_11'] = df['high'].rolling(11, center=True, min_periods=1).max()
    df['swing_lo_11'] = df['low'].rolling(11,  center=True, min_periods=1).min()

    # Compression: 20-bar range / ATR14
    hi20 = df['high'].rolling(20, min_periods=1).max().values
    lo20 = df['low'].rolling(20,  min_periods=1).min().values
    df['compression_20'] = np.where(atr14 > 0, (hi20-lo20)/atr14, 0)

    # Impulse: largest single-bar move in last 10 bars / ATR14
    bar_move = (df['high'] - df['low']).values
    impulse = np.zeros(n)
    for i in range(10, n):
        impulse[i] = bar_move[i-10:i].max()
    df['impulse_10'] = np.where(atr14 > 0, impulse/atr14, 0)

    # EMA trend alignment
    ema9v  = df['ema9'].values
    ema21v = df['ema21'].values
    ema50v = df['ema50'].values
    df['ema_bull'] = (ema9v > ema21v) & (ema21v > ema50v)
    df['ema_bear'] = (ema9v < ema21v) & (ema21v < ema50v)
    df['ema_align'] = np.where(df['ema_bull'], 1, np.where(df['ema_bear'], -1, 0))

    # Distance from VWAP (in ATR units)
    vwap = df['vwap'].values
    df['vwap_dist'] = np.where(atr14 > 0, (cl - vwap) / atr14, 0)

    # Consolidation length: bars since last ATR expansion (>1.5 ATR)
    consol = np.zeros(n)
    cnt = 0
    for i in range(1, n):
        if bar_move[i] > 1.5 * atr14[i]:
            cnt = 0
        else:
            cnt += 1
        consol[i] = cnt
    df['consol_len'] = consol

    # Trend maturity: bars since EMA alignment began
    ema_align = df['ema_align'].values
    trend_mat = np.zeros(n)
    cnt = 0
    for i in range(1, n):
        if ema_align[i] == ema_align[i-1] and ema_align[i] != 0:
            cnt += 1
        else:
            cnt = 0
        trend_mat[i] = cnt
    df['trend_maturity'] = trend_mat

    # Pullback depth: distance from recent swing extreme (in ATR)
    pullback = np.zeros(n)
    for i in range(20, n):
        if ema_align[i] == 1:  # bullish
            swing_hi = hi[max(0,i-20):i].max()
            pullback[i] = (swing_hi - cl[i]) / atr14[i] if atr14[i] > 0 else 0
        elif ema_align[i] == -1:  # bearish
            swing_lo = lo[max(0,i-20):i].min()
            pullback[i] = (cl[i] - swing_lo) / atr14[i] if atr14[i] > 0 else 0
    df['pullback_depth'] = pullback

    # Structure break: price crossed above recent 10-bar high or below 10-bar low
    hi10 = df['high'].rolling(10, min_periods=1).max().shift(1).values
    lo10 = df['low'].rolling(10,  min_periods=1).min().shift(1).values
    df['struct_break_up']   = (cl > hi10).astype(int)
    df['struct_break_down'] = (cl < lo10).astype(int)

    return df

def compute_adx(df, period=14):
    hi = df['high'].values; lo = df['low'].values; cl = df['close'].values
    n  = len(cl)
    tr = np.zeros(n); pdm = np.zeros(n); ndm = np.zeros(n)
    for i in range(1, n):
        hl = hi[i]-lo[i]; hpc = abs(hi[i]-cl[i-1]); lpc = abs(lo[i]-cl[i-1])
        tr[i]  = max(hl, hpc, lpc)
        up = hi[i]-hi[i-1]; dn = lo[i-1]-lo[i]
        pdm[i] = up if (up > dn and up > 0) else 0
        ndm[i] = dn if (dn > up and dn > 0) else 0
    atr  = pd.Series(tr).ewm(span=period, adjust=False).mean().values
    pdi  = pd.Series(pdm).ewm(span=period, adjust=False).mean().values
    ndi  = pd.Series(ndm).ewm(span=period, adjust=False).mean().values
    with np.errstate(divide='ignore', invalid='ignore'):
        pdi_r = np.where(atr > 0, 100*pdi/atr, 0)
        ndi_r = np.where(atr > 0, 100*ndi/atr, 0)
        dx    = np.where((pdi_r+ndi_r) > 0, 100*np.abs(pdi_r-ndi_r)/(pdi_r+ndi_r), 0)
    return pd.Series(dx).ewm(span=period, adjust=False).mean().values

def compute_daily_vwap(df):
    vwap = np.zeros(len(df))
    for date, grp in df.groupby('date'):
        idx = grp.index
        tp  = (grp['high'] + grp['low'] + grp['close']) / 3
        vol = grp['volume'].values if 'volume' in grp.columns else np.ones(len(grp))
        cum_tpv = np.cumsum(tp.values * vol)
        cum_vol = np.cumsum(vol)
        vwap[idx] = np.where(cum_vol > 0, cum_tpv/cum_vol, tp.values)
    return vwap

# ─── Event Detection ──────────────────────────────────────────────────────────
def detect_events(df, r_threshold=2.0, lookforward=60):
    """
    Scan every bar. For each bar, compute a structural stop (0.5 × ATR14).
    Check if price moves ≥ r_threshold × stop in either direction within
    `lookforward` bars. Record the event if it does.
    Only count events where the stop is at least 2.0 ATR points (meaningful move).
    """
    cl  = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr = df['atr14'].values; n  = len(cl)
    events = []
    used_bars = set()

    for i in range(30, n - lookforward):
        if atr[i] <= 0: continue
        stop = 0.5 * atr[i]
        # Require minimum stop of 2.0 index points (meaningful structural stop)
        if stop < 2.0: continue
        # Only scan from RTH session bars (where meaningful moves originate)
        if not df['is_rth'].iloc[i]: continue

        # Long event: price rises ≥ r_threshold × stop
        target_up = cl[i] + r_threshold * stop
        # Short event: price falls ≥ r_threshold × stop
        target_dn = cl[i] - r_threshold * stop

        hit_up = False; hit_dn = False; hit_bar = -1
        for j in range(i+1, min(i+lookforward, n)):
            if hi[j] >= target_up and not hit_up:
                # Check stop not hit first
                stop_p = cl[i] - stop
                if lo[j] <= stop_p: break
                hit_up = True; hit_bar = j; break
            if lo[j] <= target_dn and not hit_dn:
                stop_p = cl[i] + stop
                if hi[j] >= stop_p: break
                hit_dn = True; hit_bar = j; break

        if (hit_up or hit_dn) and i not in used_bars:
            direction = 1 if hit_up else -1
            # Mark bars as used to avoid overlapping events
            for k in range(i, min(i+30, n)):
                used_bars.add(k)
            events.append({
                'bar': i,
                'direction': direction,
                'stop': stop,
                'target': r_threshold * stop,
                'atr': atr[i],
                'date': df['date'].iloc[i],
                'session': df['session'].iloc[i],
                'hour': df['hour'].iloc[i],
                'dow': df['dow'].iloc[i],
                'month': df['month'].iloc[i],
            })
    return events

# ─── Feature Extraction ───────────────────────────────────────────────────────
FEATURE_COLS = [
    'adx', 'adx_slope', 'atr_accel', 'compression_20', 'impulse_10',
    'ema_align', 'vwap_dist', 'consol_len', 'trend_maturity', 'pullback_depth',
    'struct_break_up', 'struct_break_down', 'rel_vol',
    'mins_since_open', 'dow', 'month',
]

def extract_features(df, bar, lookback=5):
    """Extract pre-event features from `lookback` bars before `bar`."""
    start = max(0, bar - lookback)
    window = df.iloc[start:bar]
    if len(window) == 0:
        return None
    feats = {}
    for col in FEATURE_COLS:
        if col in window.columns:
            feats[f'{col}_mean'] = window[col].mean()
            feats[f'{col}_last'] = window[col].iloc[-1]
    # Session encoding
    sess_map = {'GLOBEX': 0, 'OPEN': 1, 'MIDDAY': 2, 'PM': 3, 'CLOSE': 4, 'OVERNIGHT': 5}
    feats['session_code'] = sess_map.get(df['session'].iloc[bar], 0)
    feats['is_rth']       = int(df['is_rth'].iloc[bar])
    return feats

# ─── Control Group ────────────────────────────────────────────────────────────
def build_control_group(df, events, n_control=None):
    """
    Build a matched control group: bars where no ≥2R move followed.
    Sample randomly from bars not within 30 bars of any event.
    """
    event_bars = set(e['bar'] for e in events)
    excluded   = set()
    for b in event_bars:
        for k in range(max(0, b-30), b+60):
            excluded.add(k)

    candidates = [i for i in range(30, len(df)-60) if i not in excluded]
    if n_control is None:
        n_control = len(events) * 3  # 3:1 control ratio
    n_control = min(n_control, len(candidates))
    np.random.seed(42)
    sampled = np.random.choice(candidates, size=n_control, replace=False)
    controls = []
    for bar in sampled:
        controls.append({
            'bar': int(bar),
            'direction': 0,
            'date': df['date'].iloc[bar],
            'session': df['session'].iloc[bar],
        })
    return controls

# ─── Information Gain ─────────────────────────────────────────────────────────
def information_gain(feature_vals, labels):
    """Compute information gain of a continuous feature for binary classification."""
    from scipy.stats import entropy
    n = len(labels)
    if n == 0: return 0
    # Parent entropy
    p1 = labels.mean()
    if p1 == 0 or p1 == 1: return 0
    H_parent = -p1*np.log2(p1) - (1-p1)*np.log2(1-p1)
    # Try 10 split points
    thresholds = np.percentile(feature_vals, [10,20,30,40,50,60,70,80,90])
    best_ig = 0
    for t in thresholds:
        left  = labels[feature_vals <= t]
        right = labels[feature_vals > t]
        if len(left) == 0 or len(right) == 0: continue
        p_l = len(left)/n; p_r = len(right)/n
        p1l = left.mean(); p1r = right.mean()
        H_l = 0 if (p1l==0 or p1l==1) else -p1l*np.log2(p1l)-(1-p1l)*np.log2(1-p1l)
        H_r = 0 if (p1r==0 or p1r==1) else -p1r*np.log2(p1r)-(1-p1r)*np.log2(1-p1r)
        ig = H_parent - p_l*H_l - p_r*H_r
        best_ig = max(best_ig, ig)
    return best_ig

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars")

    # ── Event Detection ───────────────────────────────────────────────────────
    print("\nDetecting target events...")
    events_15 = detect_events(df, r_threshold=1.5)
    events_20 = detect_events(df, r_threshold=2.0)
    events_25 = detect_events(df, r_threshold=2.5)
    print(f"  ≥1.5R events: {len(events_15)}")
    print(f"  ≥2.0R events: {len(events_20)}")
    print(f"  ≥2.5R events: {len(events_25)}")

    # Work with ≥2.0R as the primary set
    events = events_20
    print(f"\nWorking with {len(events)} primary events (≥2.0R)")

    # ── Feature Extraction ────────────────────────────────────────────────────
    print("Extracting pre-event features...")
    event_feats = []
    for e in events:
        f = extract_features(df, e['bar'], lookback=5)
        if f is not None:
            f['label'] = 1
            f['direction'] = e['direction']
            f['session'] = e['session']
            f['dow'] = e['dow']
            event_feats.append(f)

    controls = build_control_group(df, events)
    control_feats = []
    for c in controls:
        f = extract_features(df, c['bar'], lookback=5)
        if f is not None:
            f['label'] = 0
            f['direction'] = 0
            f['session'] = df['session'].iloc[c['bar']]
            f['dow'] = df['dow'].iloc[c['bar']]
            control_feats.append(f)

    print(f"  Event features: {len(event_feats)}")
    print(f"  Control features: {len(control_feats)}")

    all_feats = event_feats + control_feats
    feat_df = pd.DataFrame(all_feats).fillna(0)

    # ── Feature Importance (Random Forest) ────────────────────────────────────
    print("\nComputing feature importance...")
    feat_cols = [c for c in feat_df.columns if c not in ['label','direction','session','dow']]
    X = feat_df[feat_cols].values
    y = feat_df['label'].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    rf = RandomForestClassifier(n_estimators=200, random_state=42, class_weight='balanced')
    rf.fit(X_scaled, y)
    importances = rf.feature_importances_
    feat_importance = sorted(zip(feat_cols, importances), key=lambda x: -x[1])

    print("\n  Top 15 features by importance:")
    for fname, imp in feat_importance[:15]:
        print(f"    {fname:<35} {imp:.4f}")

    # ── Information Gain ──────────────────────────────────────────────────────
    print("\nComputing information gain per feature...")
    ig_scores = {}
    for col in feat_cols:
        vals = feat_df[col].values.astype(float)
        ig = information_gain(vals, y)
        ig_scores[col] = ig
    top_ig = sorted(ig_scores.items(), key=lambda x: -x[1])[:15]
    print("  Top 15 features by information gain:")
    for fname, ig in top_ig:
        print(f"    {fname:<35} {ig:.4f}")

    # ── Statistical Tests ─────────────────────────────────────────────────────
    print("\nRunning statistical tests (event vs control)...")
    event_only = feat_df[feat_df['label']==1]
    control_only = feat_df[feat_df['label']==0]
    stat_results = []
    for col in feat_cols:
        ev = event_only[col].values.astype(float)
        ct = control_only[col].values.astype(float)
        if len(ev) < 5 or len(ct) < 5: continue
        t_stat, p_val = stats.ttest_ind(ev, ct, equal_var=False)
        # Effect size (Cohen's d)
        pooled_std = np.sqrt((ev.std()**2 + ct.std()**2)/2)
        cohens_d = (ev.mean() - ct.mean()) / pooled_std if pooled_std > 0 else 0
        stat_results.append({
            'feature': col,
            'event_mean': round(ev.mean(), 3),
            'control_mean': round(ct.mean(), 3),
            'diff': round(ev.mean()-ct.mean(), 3),
            'cohens_d': round(cohens_d, 3),
            'p_value': round(p_val, 4),
            'significant': p_val < 0.05,
            'ig': round(ig_scores.get(col, 0), 4),
            'rf_imp': round(importances[feat_cols.index(col)] if col in feat_cols else 0, 4),
        })

    if not stat_results:
        print('  WARNING: No stat results — control group may be empty')
        stat_df = pd.DataFrame(columns=['feature','event_mean','control_mean','diff','cohens_d','p_value','significant','ig','rf_imp'])
    else:
        stat_df = pd.DataFrame(stat_results).sort_values('cohens_d', key=abs, ascending=False)
    print("\n  Top 15 features by effect size:")
    print(f"  {'Feature':<35} {'Ev Mean':>8} {'Ct Mean':>8} {'Cohen d':>8} {'p-val':>8} {'Sig':>5}")
    for _, row in stat_df.head(15).iterrows():
        sig = '***' if row['p_value'] < 0.001 else ('**' if row['p_value'] < 0.01 else ('*' if row['p_value'] < 0.05 else ''))
        print(f"  {row['feature']:<35} {row['event_mean']:>8.3f} {row['control_mean']:>8.3f} "
              f"{row['cohens_d']:>8.3f} {row['p_value']:>8.4f} {sig:>5}")

    # ── Clustering ────────────────────────────────────────────────────────────
    print("\nClustering event precursors...")
    X_events = scaler.transform(event_only[feat_cols].values)

    # PCA for visualisation
    pca = PCA(n_components=2, random_state=42)
    X_pca = pca.fit_transform(X_events)

    # K-Means: try k=3,4,5
    best_k = 4; best_inertia = np.inf
    inertias = []
    for k in range(2, 8):
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        km.fit(X_events)
        inertias.append((k, km.inertia_))
        if km.inertia_ < best_inertia:
            best_inertia = km.inertia_; best_k = k

    # Use elbow: pick k where improvement drops below 15%
    for i in range(1, len(inertias)):
        prev = inertias[i-1][1]; curr = inertias[i][1]
        if prev > 0 and (prev-curr)/prev < 0.15:
            best_k = inertias[i-1][0]; break

    km_final = KMeans(n_clusters=best_k, random_state=42, n_init=10)
    cluster_labels = km_final.fit_predict(X_events)
    print(f"  Optimal K: {best_k}")
    print(f"  Cluster sizes: {np.bincount(cluster_labels).tolist()}")

    # Characterise each cluster
    event_only = event_only.copy()
    event_only['cluster'] = cluster_labels
    cluster_profiles = []
    for k in range(best_k):
        grp = event_only[event_only['cluster']==k]
        profile = {'cluster': k, 'n': len(grp)}
        for col in ['adx_last', 'atr_accel_last', 'compression_20_last',
                    'ema_align_last', 'consol_len_last', 'trend_maturity_last',
                    'vwap_dist_last', 'pullback_depth_last', 'impulse_10_last']:
            if col in grp.columns:
                profile[col] = round(grp[col].mean(), 3)
        # Session distribution
        if 'session' in grp.columns:
            sess_dist = grp['session'].value_counts(normalize=True).to_dict()
            profile['top_session'] = max(sess_dist, key=sess_dist.get)
            profile['top_session_pct'] = round(max(sess_dist.values())*100, 1)
        # Direction
        if 'direction' in grp.columns:
            profile['pct_long'] = round((grp['direction']==1).mean()*100, 1)
        cluster_profiles.append(profile)

    print("\n  Cluster Profiles:")
    for p in cluster_profiles:
        print(f"  Cluster {p['cluster']} (N={p['n']}): ADX={p.get('adx_last','?'):.1f}, "
              f"ATR_accel={p.get('atr_accel_last','?'):.2f}, "
              f"Compression={p.get('compression_20_last','?'):.2f}, "
              f"EMA_align={p.get('ema_align_last','?'):.1f}, "
              f"Session={p.get('top_session','?')} ({p.get('top_session_pct','?')}%), "
              f"Long={p.get('pct_long','?')}%")

    # ── Session Analysis ──────────────────────────────────────────────────────
    print("\nSession distribution of events vs controls:")
    sess_order = ['GLOBEX','OPEN','MIDDAY','PM','CLOSE','OVERNIGHT']
    for sess in sess_order:
        ev_n  = (event_only['session']==sess).sum()
        ct_n  = (control_only['session']==sess).sum() if 'session' in control_only.columns else 0
        ev_pct = ev_n/len(event_only)*100
        ct_pct = ct_n/len(control_only)*100 if len(control_only) > 0 else 0
        ratio  = ev_pct/ct_pct if ct_pct > 0 else 0
        print(f"  {sess:<12}: Events={ev_pct:5.1f}%  Control={ct_pct:5.1f}%  Ratio={ratio:.2f}x")

    # ── ADX Analysis ──────────────────────────────────────────────────────────
    print("\nADX distribution: events vs controls")
    adx_bins = [0, 20, 30, 40, 50, 100]
    ev_adx  = event_only['adx_last'].values
    ct_adx  = control_only['adx_last'].values if 'adx_last' in control_only.columns else np.zeros(1)
    for i in range(len(adx_bins)-1):
        lo_b, hi_b = adx_bins[i], adx_bins[i+1]
        ev_n = ((ev_adx >= lo_b) & (ev_adx < hi_b)).sum()
        ct_n = ((ct_adx >= lo_b) & (ct_adx < hi_b)).sum()
        ev_pct = ev_n/len(ev_adx)*100; ct_pct = ct_n/len(ct_adx)*100
        ratio = ev_pct/ct_pct if ct_pct > 0 else 0
        print(f"  ADX {lo_b:2d}-{hi_b:3d}: Events={ev_pct:5.1f}%  Control={ct_pct:5.1f}%  Ratio={ratio:.2f}x")

    # ── Charts ────────────────────────────────────────────────────────────────
    print("\nGenerating charts...")
    fig = plt.figure(figsize=(20, 18))
    fig.patch.set_facecolor('#0d1117')
    gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

    cluster_colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#a855f7','#06b6d4']

    # Chart 1: PCA scatter of event clusters
    ax1 = fig.add_subplot(gs[0, :2])
    ax1.set_facecolor('#161b22')
    for k in range(best_k):
        mask = cluster_labels == k
        ax1.scatter(X_pca[mask, 0], X_pca[mask, 1],
                    c=cluster_colors[k], alpha=0.6, s=20, label=f'Cluster {k} (N={mask.sum()})')
    ax1.set_xlabel('PC1', color='white'); ax1.set_ylabel('PC2', color='white')
    ax1.set_title(f'Event Precursor Clusters (K={best_k}) — PCA Projection', color='white', fontweight='bold')
    ax1.tick_params(colors='white')
    ax1.spines['bottom'].set_color('#30363d'); ax1.spines['left'].set_color('#30363d')
    ax1.spines['top'].set_visible(False); ax1.spines['right'].set_visible(False)
    ax1.legend(fontsize=8, facecolor='#161b22', labelcolor='white')

    # Chart 2: Feature importance (top 10)
    ax2 = fig.add_subplot(gs[0, 2])
    ax2.set_facecolor('#161b22')
    top10_names = [f[0] for f in feat_importance[:10]]
    top10_vals  = [f[1] for f in feat_importance[:10]]
    bars = ax2.barh(range(10), top10_vals[::-1], color='#3b82f6', alpha=0.85)
    ax2.set_yticks(range(10))
    ax2.set_yticklabels([n.replace('_mean','').replace('_last','') for n in top10_names[::-1]],
                        color='white', fontsize=8)
    ax2.set_xlabel('RF Importance', color='white')
    ax2.set_title('Top 10 Predictive Features', color='white', fontweight='bold')
    ax2.tick_params(colors='white')
    ax2.spines['bottom'].set_color('#30363d'); ax2.spines['left'].set_color('#30363d')
    ax2.spines['top'].set_visible(False); ax2.spines['right'].set_visible(False)

    # Chart 3: ADX distribution — events vs controls
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.set_facecolor('#161b22')
    bins = np.linspace(0, 80, 20)
    ax3.hist(ev_adx, bins=bins, alpha=0.7, color='#10b981', label='Events', density=True)
    ax3.hist(ct_adx, bins=bins, alpha=0.5, color='#6b7280', label='Control', density=True)
    ax3.set_xlabel('ADX', color='white'); ax3.set_ylabel('Density', color='white')
    ax3.set_title('ADX Distribution: Events vs Control', color='white', fontweight='bold')
    ax3.tick_params(colors='white')
    ax3.spines['bottom'].set_color('#30363d'); ax3.spines['left'].set_color('#30363d')
    ax3.spines['top'].set_visible(False); ax3.spines['right'].set_visible(False)
    ax3.legend(fontsize=8, facecolor='#161b22', labelcolor='white')

    # Chart 4: ATR Acceleration — events vs controls
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.set_facecolor('#161b22')
    ev_atr  = event_only['atr_accel_last'].values.clip(0, 3)
    ct_atr  = control_only['atr_accel_last'].values.clip(0, 3) if 'atr_accel_last' in control_only.columns else np.ones(10)
    bins2 = np.linspace(0, 3, 20)
    ax4.hist(ev_atr, bins=bins2, alpha=0.7, color='#f59e0b', label='Events', density=True)
    ax4.hist(ct_atr, bins=bins2, alpha=0.5, color='#6b7280', label='Control', density=True)
    ax4.set_xlabel('ATR Acceleration', color='white'); ax4.set_ylabel('Density', color='white')
    ax4.set_title('ATR Acceleration: Events vs Control', color='white', fontweight='bold')
    ax4.tick_params(colors='white')
    ax4.spines['bottom'].set_color('#30363d'); ax4.spines['left'].set_color('#30363d')
    ax4.spines['top'].set_visible(False); ax4.spines['right'].set_visible(False)
    ax4.legend(fontsize=8, facecolor='#161b22', labelcolor='white')

    # Chart 5: Compression — events vs controls
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_facecolor('#161b22')
    ev_comp = event_only['compression_20_last'].values.clip(0, 5)
    ct_comp = control_only['compression_20_last'].values.clip(0, 5) if 'compression_20_last' in control_only.columns else np.ones(10)
    bins3 = np.linspace(0, 5, 20)
    ax5.hist(ev_comp, bins=bins3, alpha=0.7, color='#ef4444', label='Events', density=True)
    ax5.hist(ct_comp, bins=bins3, alpha=0.5, color='#6b7280', label='Control', density=True)
    ax5.set_xlabel('Compression Ratio (20-bar range / ATR)', color='white')
    ax5.set_ylabel('Density', color='white')
    ax5.set_title('Compression: Events vs Control', color='white', fontweight='bold')
    ax5.tick_params(colors='white')
    ax5.spines['bottom'].set_color('#30363d'); ax5.spines['left'].set_color('#30363d')
    ax5.spines['top'].set_visible(False); ax5.spines['right'].set_visible(False)
    ax5.legend(fontsize=8, facecolor='#161b22', labelcolor='white')

    # Chart 6: Session distribution ratio
    ax6 = fig.add_subplot(gs[2, 0])
    ax6.set_facecolor('#161b22')
    sess_ratios = []
    for sess in sess_order:
        ev_n  = (event_only['session']==sess).sum()
        ct_n  = (control_only['session']==sess).sum() if 'session' in control_only.columns else 1
        ev_pct = ev_n/len(event_only)*100; ct_pct = ct_n/len(control_only)*100 if len(control_only) > 0 else 1
        sess_ratios.append(ev_pct/ct_pct if ct_pct > 0 else 0)
    colors_sess = ['#3b82f6' if r > 1.2 else ('#ef4444' if r < 0.8 else '#6b7280') for r in sess_ratios]
    ax6.bar(sess_order, sess_ratios, color=colors_sess, alpha=0.85)
    ax6.axhline(1.0, color='white', linestyle='--', linewidth=1)
    ax6.set_ylabel('Event/Control Ratio', color='white')
    ax6.set_title('Session Overrepresentation in Events', color='white', fontweight='bold')
    ax6.tick_params(colors='white', axis='y')
    ax6.tick_params(colors='white', axis='x', rotation=30)
    ax6.spines['bottom'].set_color('#30363d'); ax6.spines['left'].set_color('#30363d')
    ax6.spines['top'].set_visible(False); ax6.spines['right'].set_visible(False)

    # Chart 7: Cluster profiles (radar-like bar chart)
    ax7 = fig.add_subplot(gs[2, 1:])
    ax7.set_facecolor('#161b22')
    profile_features = ['adx_last', 'atr_accel_last', 'compression_20_last',
                        'consol_len_last', 'trend_maturity_last', 'impulse_10_last']
    profile_labels = ['ADX', 'ATR Accel', 'Compression', 'Consol Len', 'Trend Mat', 'Impulse']
    x = np.arange(len(profile_labels)); w = 0.18
    for k, p in enumerate(cluster_profiles):
        vals = [p.get(f, 0) for f in profile_features]
        # Normalise for display
        ax7.bar(x + k*w, vals, w*0.9, label=f"Cluster {k} (N={p['n']})",
                color=cluster_colors[k], alpha=0.85)
    ax7.set_xticks(x + w*(best_k-1)/2)
    ax7.set_xticklabels(profile_labels, color='white', fontsize=9)
    ax7.set_ylabel('Mean Value', color='white')
    ax7.set_title('Cluster Precursor Profiles', color='white', fontweight='bold')
    ax7.tick_params(colors='white')
    ax7.spines['bottom'].set_color('#30363d'); ax7.spines['left'].set_color('#30363d')
    ax7.spines['top'].set_visible(False); ax7.spines['right'].set_visible(False)
    ax7.legend(fontsize=8, facecolor='#161b22', labelcolor='white')

    fig.suptitle('Sprint 045 — Reverse Market Causality Engine (RMCE)',
                 color='white', fontsize=14, fontweight='bold', y=0.98)
    chart_path = CHART_DIR / 'sprint_045_rmce.png'
    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close()
    print(f"  Chart saved: {chart_path}")

    # ── Save full results for report ──────────────────────────────────────────
    results = {
        'n_events_15': len(events_15),
        'n_events_20': len(events_20),
        'n_events_25': len(events_25),
        'n_events': len(events),
        'n_controls': len(controls),
        'best_k': best_k,
        'cluster_profiles': cluster_profiles,
        'top_features_rf': feat_importance[:20],
        'top_features_ig': top_ig,
        'stat_results': stat_df.head(20).to_dict('records'),
        'sess_ratios': dict(zip(sess_order, sess_ratios)),
    }

    # Print final summary
    print("\n" + "="*70)
    print("RMCE SUMMARY")
    print("="*70)
    print(f"  Total ≥2.0R events identified: {len(events)}")
    print(f"  Control group size: {len(controls)}")
    print(f"  Optimal clusters: {best_k}")
    print(f"\n  Top 5 discriminating features:")
    for row in stat_df.head(5).to_dict('records'):
        sig = '***' if row['p_value'] < 0.001 else ('**' if row['p_value'] < 0.01 else '*')
        print(f"    {row['feature']:<35} Cohen d={row['cohens_d']:+.3f}  p={row['p_value']:.4f} {sig}")
    print(f"\n  Session overrepresentation:")
    for sess, ratio in zip(sess_order, sess_ratios):
        flag = ' <-- OVERREPRESENTED' if ratio > 1.3 else (' <-- UNDERREPRESENTED' if ratio < 0.7 else '')
        print(f"    {sess:<12}: {ratio:.2f}x{flag}")

    return results, stat_df, cluster_profiles, feat_importance, sess_ratios, sess_order, best_k

if __name__ == '__main__':
    results, stat_df, cluster_profiles, feat_importance, sess_ratios, sess_order, best_k = main()
    print("\n=== RMCE COMPLETE ===")
