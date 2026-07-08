"""
Sprint 027: Edge Attribution Analysis — Atlas Execution Model A1
================================================================
Objective: Determine WHY Model A1 underperformed in Year 1 (PF 0.956) vs Year 2 (PF 1.985).
Partition all trades by regime variables, rank feature importance, test alternative solutions.

Model A1 frozen parameters (Sprint 024):
  - EMA stack: 9/21/50
  - Pullback: EMA21 touch with depth 0.5–1.2 ATR (10-bar swing)
  - Volatility Expansion: ATR(5) / ATR(5)[20 bars ago] > 1.8
  - Stop: 1.0x ATR14 | Target: 2.0x RR
  - Session: 13:00–15:59 ET, no Fridays
"""

import pandas as pd
import numpy as np
from datetime import date
import warnings
warnings.filterwarnings('ignore')

# ── Constants ─────────────────────────────────────────────────────────────────
DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
OUTPUT_PATH = "/tmp/s027_output.txt"
POINT_VALUE = 2.0
COMMISSION  = 1.0
STOP_ATR    = 1.0
TARGET_RR   = 2.0
DEPTH_MIN   = 0.5
DEPTH_MAX   = 1.2
EXP_RATIO   = 1.8
EXP_PERIOD  = 20
SESSION_START = 13
SESSION_END   = 15
YEAR1_END   = date(2025, 7, 7)

lines = []
def p(s=""):
    lines.append(s)
    print(s)

# ── Data Loading ──────────────────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts']      = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date']    = df['ts'].dt.date
    df['hour']    = df['ts'].dt.hour
    df['minute']  = df['ts'].dt.minute
    df['weekday'] = df['ts'].dt.weekday
    df['is_rth']  = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    return df

# ── Indicators ────────────────────────────────────────────────────────────────
def compute_indicators(df):
    pc = df['close'].shift(1)
    tr = np.maximum(df['high']-df['low'],
         np.maximum((df['high']-pc).abs(), (df['low']-pc).abs()))
    df['tr']    = tr
    df['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df['atr14'] = tr.rolling(14, min_periods=1).mean()
    df['atr20'] = tr.rolling(20, min_periods=1).mean()

    # EMA stack
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    # Trend
    df['uptrend']   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    df['downtrend'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    # Pullback touch
    pc2 = df['close'].shift(1)
    df['pb_long_touch']  = (pc2 > df['ema21']) & (df['close'] <= df['ema21'] * 1.001)
    df['pb_short_touch'] = (pc2 < df['ema21']) & (df['close'] >= df['ema21'] * 0.999)

    # Depth
    df['swing_high_10'] = df['high'].shift(1).rolling(10, min_periods=1).max()
    df['swing_low_10']  = df['low'].shift(1).rolling(10, min_periods=1).min()
    df['pb_depth_long']  = (df['swing_high_10'] - df['close']) / df['atr14'].replace(0, np.nan)
    df['pb_depth_short'] = (df['close'] - df['swing_low_10'])  / df['atr14'].replace(0, np.nan)

    # Volatility expansion
    df['atr_exp_base']  = df['atr5'].shift(EXP_PERIOD)
    df['vol_expansion'] = df['atr5'] / df['atr_exp_base'].replace(0, np.nan)

    # ADX (simplified: directional movement)
    high_diff = df['high'].diff()
    low_diff  = -df['low'].diff()
    dm_plus  = np.where((high_diff > low_diff) & (high_diff > 0), high_diff, 0.0)
    dm_minus = np.where((low_diff > high_diff) & (low_diff > 0), low_diff, 0.0)
    df['dm_plus']  = pd.Series(dm_plus,  index=df.index).rolling(14, min_periods=1).mean()
    df['dm_minus'] = pd.Series(dm_minus, index=df.index).rolling(14, min_periods=1).mean()
    df['di_plus']  = 100 * df['dm_plus']  / df['atr14'].replace(0, np.nan)
    df['di_minus'] = 100 * df['dm_minus'] / df['atr14'].replace(0, np.nan)
    dx = 100 * abs(df['di_plus'] - df['di_minus']) / (df['di_plus'] + df['di_minus']).replace(0, np.nan)
    df['adx'] = dx.rolling(14, min_periods=1).mean()

    # ATR percentile (rolling 252 bars ~1 trading day of 5-min bars)
    df['atr14_pct'] = df['atr14'].rolling(252, min_periods=50).rank(pct=True) * 100

    # VWAP
    df['vwap'] = (
        df.groupby('date')
          .apply(lambda g: (g['close'] * g['volume']).cumsum() / g['volume'].cumsum())
          .reset_index(level=0, drop=True)
    )
    df['vwap_dist'] = (df['close'] - df['vwap']) / df['atr14'].replace(0, np.nan)

    return df

# ── Trade Simulation (exact Model A1, returns full trade record) ──────────────
def simulate_all_trades(df):
    """
    Simulate all Model A1 trades with full regime context at entry.
    Returns a DataFrame with one row per trade.
    """
    trades = []
    n = len(df)
    i = EXP_PERIOD + 50

    while i < n - 1:
        row = df.iloc[i]

        # RTH only
        if not row['is_rth']:
            i += 1
            continue

        # Session filter (13:00–15:59 ET, no Fridays)
        if not (SESSION_START <= int(row['hour']) <= SESSION_END):
            i += 1
            continue
        if int(row['weekday']) == 4:
            i += 1
            continue

        # Volatility expansion
        if pd.isna(row['vol_expansion']) or row['vol_expansion'] < EXP_RATIO:
            i += 1
            continue

        # Pullback + depth
        direction = None
        if row['uptrend'] and row['pb_long_touch']:
            d = row['pb_depth_long']
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = 1
        if direction is None and row['downtrend'] and row['pb_short_touch']:
            d = row['pb_depth_short']
            if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX:
                direction = -1

        if direction is None:
            i += 1
            continue

        # Regime context at entry
        entry_adx       = row['adx']
        entry_atr_pct   = row['atr14_pct']
        entry_expansion = row['vol_expansion']
        entry_vwap_dist = row['vwap_dist']
        entry_hour      = int(row['hour'])
        entry_weekday   = int(row['weekday'])
        entry_depth     = row['pb_depth_long'] if direction == 1 else row['pb_depth_short']
        entry_date      = row['date']
        entry_year      = 1 if entry_date <= YEAR1_END else 2

        # Simulate trade
        entry_price = row['close']
        stop_pts    = row['atr14'] * STOP_ATR
        tp_pts      = stop_pts * TARGET_RR
        stop_price  = entry_price - direction * stop_pts
        tp_price    = entry_price + direction * tp_pts

        outcome    = None
        exit_price = None
        bars_held  = 0
        for j in range(i + 1, min(i + 300, n)):
            future = df.iloc[j]
            bars_held = j - i
            if direction == 1:
                if future['low'] <= stop_price:
                    outcome = 'loss'; exit_price = stop_price; break
                if future['high'] >= tp_price:
                    outcome = 'win';  exit_price = tp_price;  break
            else:
                if future['high'] >= stop_price:
                    outcome = 'loss'; exit_price = stop_price; break
                if future['low'] <= tp_price:
                    outcome = 'win';  exit_price = tp_price;  break

        if outcome is None:
            exit_price = df.iloc[min(i + 299, n - 1)]['close']
            outcome    = 'win' if direction * (exit_price - entry_price) > 0 else 'loss'
            bars_held  = 299

        pnl = direction * (exit_price - entry_price) * POINT_VALUE - COMMISSION

        trades.append({
            'date':        entry_date,
            'year':        entry_year,
            'hour':        entry_hour,
            'weekday':     entry_weekday,
            'direction':   'long' if direction == 1 else 'short',
            'outcome':     outcome,
            'pnl':         pnl,
            'bars_held':   bars_held,
            'adx':         entry_adx,
            'atr_pct':     entry_atr_pct,
            'expansion':   entry_expansion,
            'vwap_dist':   entry_vwap_dist,
            'depth':       entry_depth,
            'stop_pts':    stop_pts,
        })

        i += bars_held

    return pd.DataFrame(trades)

# ── Metrics Helper ────────────────────────────────────────────────────────────
def metrics(subset, label):
    if len(subset) == 0:
        return {'label': label, 'trades': 0, 'pf': 0, 'wr': 0, 'exp': 0, 'net': 0}
    wins   = subset[subset['outcome'] == 'win']['pnl']
    losses = subset[subset['outcome'] == 'loss']['pnl']
    gp = wins.sum() if len(wins) > 0 else 0
    gl = abs(losses.sum()) if len(losses) > 0 else 0
    pf = gp / gl if gl > 0 else float('inf')
    wr = len(wins) / len(subset)
    exp = subset['pnl'].mean()
    net = subset['pnl'].sum()
    return {'label': label, 'trades': len(subset), 'pf': pf, 'wr': wr*100, 'exp': exp, 'net': net}

def print_metrics(m):
    p(f"  {m['label']:<45} | Trades: {m['trades']:4d} | PF: {m['pf']:.3f} | WR: {m['wr']:5.1f}% | Exp: ${m['exp']:6.2f} | Net: ${m['net']:8,.0f}")

# ── Feature Importance ────────────────────────────────────────────────────────
def feature_importance(trades):
    """
    For each feature, split into quartiles and compute PF per quartile.
    Return ranked list of features by PF spread (max quartile PF - min quartile PF).
    """
    features = {
        'ADX':            'adx',
        'ATR Percentile': 'atr_pct',
        'Vol Expansion':  'expansion',
        'VWAP Distance':  'vwap_dist',
        'Pullback Depth': 'depth',
        'Bars Held':      'bars_held',
    }

    results = []
    for fname, col in features.items():
        if col not in trades.columns:
            continue
        valid = trades.dropna(subset=[col])
        if len(valid) < 40:
            continue
        try:
            q = pd.qcut(valid[col], q=4, labels=['Q1','Q2','Q3','Q4'], duplicates='drop')
        except ValueError:
            try:
                q = pd.qcut(valid[col], q=3, labels=['Q1','Q2','Q3'], duplicates='drop')
            except ValueError:
                continue
        pfs = []
        for qname in ['Q1','Q2','Q3','Q4']:
            sub = valid[q == qname]
            if len(sub) < 5:
                pfs.append(np.nan)
                continue
            m = metrics(sub, qname)
            pfs.append(m['pf'])
        valid_pfs = [x for x in pfs if not np.isnan(x)]
        spread = max(valid_pfs) - min(valid_pfs) if len(valid_pfs) >= 2 else 0
        results.append({
            'feature': fname,
            'Q1_pf':   pfs[0] if len(pfs) > 0 else np.nan,
            'Q2_pf':   pfs[1] if len(pfs) > 1 else np.nan,
            'Q3_pf':   pfs[2] if len(pfs) > 2 else np.nan,
            'Q4_pf':   pfs[3] if len(pfs) > 3 else np.nan,
            'spread':  spread,
        })

    return sorted(results, key=lambda x: x['spread'], reverse=True)

# ── Alternative Solutions ─────────────────────────────────────────────────────
def test_alternative_exits(df):
    """Test different RR targets on the full dataset."""
    results = []
    for rr in [1.0, 1.5, 2.0, 2.5, 3.0]:
        trades = []
        n = len(df)
        i = EXP_PERIOD + 50
        while i < n - 1:
            row = df.iloc[i]
            if not row['is_rth']: i += 1; continue
            if not (SESSION_START <= int(row['hour']) <= SESSION_END): i += 1; continue
            if int(row['weekday']) == 4: i += 1; continue
            if pd.isna(row['vol_expansion']) or row['vol_expansion'] < EXP_RATIO: i += 1; continue
            direction = None
            if row['uptrend'] and row['pb_long_touch']:
                d = row['pb_depth_long']
                if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX: direction = 1
            if direction is None and row['downtrend'] and row['pb_short_touch']:
                d = row['pb_depth_short']
                if not np.isnan(d) and DEPTH_MIN <= d <= DEPTH_MAX: direction = -1
            if direction is None: i += 1; continue

            entry_price = row['close']
            stop_pts    = row['atr14'] * STOP_ATR
            tp_pts      = stop_pts * rr
            stop_price  = entry_price - direction * stop_pts
            tp_price    = entry_price + direction * tp_pts
            outcome = None; exit_price = None; bars_held = 0
            for j in range(i+1, min(i+300, n)):
                future = df.iloc[j]; bars_held = j - i
                if direction == 1:
                    if future['low'] <= stop_price: outcome='loss'; exit_price=stop_price; break
                    if future['high'] >= tp_price:  outcome='win';  exit_price=tp_price;  break
                else:
                    if future['high'] >= stop_price: outcome='loss'; exit_price=stop_price; break
                    if future['low'] <= tp_price:    outcome='win';  exit_price=tp_price;  break
            if outcome is None:
                exit_price = df.iloc[min(i+299, n-1)]['close']
                outcome = 'win' if direction*(exit_price-entry_price) > 0 else 'loss'
                bars_held = 299
            pnl = direction*(exit_price-entry_price)*POINT_VALUE - COMMISSION
            trades.append({'outcome': outcome, 'pnl': pnl, 'date': row['date']})
            i += bars_held

        t = pd.DataFrame(trades)
        if len(t) == 0: continue
        wins = t[t['outcome']=='win']['pnl']
        losses = t[t['outcome']=='loss']['pnl']
        pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 0
        results.append({'rr': rr, 'trades': len(t), 'pf': pf, 'net': t['pnl'].sum(),
                        'wr': len(wins)/len(t)*100})
    return results

def test_regime_exclusion(trades):
    """Test excluding trades based on the top-ranked feature (ADX)."""
    results = []
    for adx_max in [15, 20, 25, 30, 35, 40, 999]:
        sub = trades[trades['adx'] <= adx_max]
        if len(sub) < 20: continue
        m = metrics(sub, f"ADX <= {adx_max}")
        results.append(m)
    return results

def test_dynamic_sizing(trades):
    """Test regime-based position sizing: half size when ADX > threshold."""
    results = []
    for adx_thresh in [20, 25, 30]:
        pnls = []
        for _, row in trades.iterrows():
            size = 0.5 if row['adx'] > adx_thresh else 1.0
            pnls.append(row['pnl'] * size)
        t2 = trades.copy()
        t2['pnl'] = pnls
        wins = t2[t2['outcome']=='win']['pnl']
        losses = t2[t2['outcome']=='loss']['pnl']
        pf = wins.sum() / abs(losses.sum()) if len(losses) > 0 else 0
        results.append({'adx_thresh': adx_thresh, 'pf': pf, 'net': t2['pnl'].sum()})
    return results

# ── MAIN ──────────────────────────────────────────────────────────────────────
p("=" * 100)
p("  SPRINT 027: EDGE ATTRIBUTION ANALYSIS — ATLAS EXECUTION MODEL A1")
p("=" * 100)

p("\nLoading data and computing indicators...")
df = load_data()
df = compute_indicators(df)
p(f"  Dataset: {len(df):,} bars | {df['date'].min()} to {df['date'].max()}")

p("\nSimulating all Model A1 trades with regime context...")
trades = simulate_all_trades(df)
p(f"  Total trades generated: {len(trades)}")

# ── SECTION 1: YEAR 1 vs YEAR 2 BREAKDOWN ────────────────────────────────────
p("\n" + "=" * 100)
p("  SECTION 1: YEAR 1 vs YEAR 2 PERFORMANCE")
p("=" * 100)
for yr in [1, 2, None]:
    sub = trades[trades['year'] == yr] if yr is not None else trades
    label = f"Year {yr}" if yr else "Full Dataset"
    print_metrics(metrics(sub, label))

# ── SECTION 2: FEATURE IMPORTANCE ────────────────────────────────────────────
p("\n" + "=" * 100)
p("  SECTION 2: FEATURE IMPORTANCE — RANKED BY PF SPREAD ACROSS QUARTILES")
p("=" * 100)
p(f"  {'Feature':<20} | {'Q1 PF':>7} | {'Q2 PF':>7} | {'Q3 PF':>7} | {'Q4 PF':>7} | {'Spread':>7}")
p("  " + "-" * 70)
importance = feature_importance(trades)
for r in importance:
    def fmt(v): return f"{v:.3f}" if not np.isnan(v) else "  N/A "
    p(f"  {r['feature']:<20} | {fmt(r['Q1_pf']):>7} | {fmt(r['Q2_pf']):>7} | {fmt(r['Q3_pf']):>7} | {fmt(r['Q4_pf']):>7} | {r['spread']:>7.3f}")

# ── SECTION 3: YEAR 1 ROOT CAUSE — TOP FEATURE DISTRIBUTION ─────────────────
p("\n" + "=" * 100)
p("  SECTION 3: YEAR 1 ROOT CAUSE — TOP FEATURE DISTRIBUTIONS")
p("=" * 100)
y1 = trades[trades['year'] == 1]
y2 = trades[trades['year'] == 2]

for col, name in [('adx', 'ADX'), ('atr_pct', 'ATR Percentile'), ('expansion', 'Vol Expansion'), ('depth', 'Pullback Depth')]:
    p(f"\n  {name}:")
    p(f"    Year 1: mean={y1[col].mean():.2f}  median={y1[col].median():.2f}  std={y1[col].std():.2f}")
    p(f"    Year 2: mean={y2[col].mean():.2f}  median={y2[col].median():.2f}  std={y2[col].std():.2f}")

# ADX breakdown by year
p("\n  ADX Quartile Performance by Year:")
p(f"  {'ADX Range':<20} | {'Y1 Trades':>10} | {'Y1 PF':>7} | {'Y2 Trades':>10} | {'Y2 PF':>7}")
p("  " + "-" * 65)
for label, lo, hi in [('ADX < 15', 0, 15), ('ADX 15–20', 15, 20), ('ADX 20–25', 20, 25),
                       ('ADX 25–30', 25, 30), ('ADX 30–40', 30, 40), ('ADX > 40', 40, 999)]:
    s1 = y1[(y1['adx'] >= lo) & (y1['adx'] < hi)]
    s2 = y2[(y2['adx'] >= lo) & (y2['adx'] < hi)]
    m1 = metrics(s1, ''); m2 = metrics(s2, '')
    p(f"  {label:<20} | {m1['trades']:>10} | {m1['pf']:>7.3f} | {m2['trades']:>10} | {m2['pf']:>7.3f}")

# ── SECTION 4: REGIME BREAKDOWN ──────────────────────────────────────────────
p("\n" + "=" * 100)
p("  SECTION 4: FULL REGIME BREAKDOWN")
p("=" * 100)

p("\n  By Hour:")
for h in sorted(trades['hour'].unique()):
    sub = trades[trades['hour'] == h]
    print_metrics(metrics(sub, f"Hour {h:02d}:00"))

p("\n  By Day of Week:")
days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
for d in range(5):
    sub = trades[trades['weekday'] == d]
    print_metrics(metrics(sub, days[d]))

p("\n  By Direction:")
for d in ['long', 'short']:
    sub = trades[trades['direction'] == d]
    print_metrics(metrics(sub, d.capitalize()))

p("\n  By ADX Quartile (full dataset):")
adx_q = pd.qcut(trades['adx'], q=4, labels=['Q1 (Low)','Q2','Q3','Q4 (High)'])
for q in ['Q1 (Low)', 'Q2', 'Q3', 'Q4 (High)']:
    sub = trades[adx_q == q]
    lo = sub['adx'].min(); hi = sub['adx'].max()
    print_metrics(metrics(sub, f"ADX {q} ({lo:.0f}–{hi:.0f})"))

p("\n  By ATR Percentile Quartile:")
try:
    atr_valid = trades.dropna(subset=['atr_pct'])
    atr_q, atr_bins = pd.qcut(atr_valid['atr_pct'], q=4, retbins=True, duplicates='drop')
    for i_q, q in enumerate(atr_q.cat.categories):
        sub = atr_valid[atr_q == q]
        print_metrics(metrics(sub, f"ATR Pct {q}"))
except Exception as e:
    p(f"  ATR Pct quartile error: {e}")

p("\n  By Volatility Expansion Quartile:")
try:
    exp_q, exp_bins = pd.qcut(trades['expansion'], q=4, retbins=True, duplicates='drop')
    for q in exp_q.cat.categories:
        sub = trades[exp_q == q]
        lo = sub['expansion'].min(); hi = sub['expansion'].max()
        print_metrics(metrics(sub, f"Expansion {q} ({lo:.2f}–{hi:.2f})"))
except Exception as e:
    p(f"  Expansion quartile error: {e}")

# ── SECTION 5: ALTERNATIVE SOLUTIONS ─────────────────────────────────────────
p("\n" + "=" * 100)
p("  SECTION 5: ALTERNATIVE SOLUTIONS")
p("=" * 100)

p("\n  5A: Different RR Targets (full dataset, all conditions):")
p(f"  {'RR Target':>10} | {'Trades':>7} | {'PF':>7} | {'WR%':>7} | {'Net':>10}")
p("  " + "-" * 50)
for r in test_alternative_exits(df):
    p(f"  {r['rr']:>10.1f} | {r['trades']:>7} | {r['pf']:>7.3f} | {r['wr']:>7.1f}% | ${r['net']:>9,.0f}")

p("\n  5B: ADX Regime Exclusion (exclude trades above ADX threshold):")
p(f"  {'ADX Filter':<20} | {'Trades':>7} | {'PF':>7} | {'WR%':>7} | {'Net':>10}")
p("  " + "-" * 55)
for r in test_regime_exclusion(trades):
    p(f"  {r['label']:<20} | {r['trades']:>7} | {r['pf']:>7.3f} | {r['wr']:>7.1f}% | ${r['net']:>9,.0f}")

p("\n  5C: Dynamic Sizing (half size when ADX > threshold):")
p(f"  {'ADX Threshold':<20} | {'PF':>7} | {'Net':>10}")
p("  " + "-" * 42)
for r in test_dynamic_sizing(trades):
    p(f"  ADX > {r['adx_thresh']:<14} | {r['pf']:>7.3f} | ${r['net']:>9,.0f}")

# ── SECTION 6: BEST SOLUTION YEAR 1 / YEAR 2 ─────────────────────────────────
p("\n" + "=" * 100)
p("  SECTION 6: BEST SOLUTION — YEAR 1 / YEAR 2 STABILITY")
p("=" * 100)

# Find the best ADX exclusion threshold
best_adx = None
best_pf  = 0
for r in test_regime_exclusion(trades):
    if r['pf'] > best_pf and r['trades'] >= 80:
        best_pf  = r['pf']
        best_adx = float(r['label'].split('<=')[1].strip())

if best_adx:
    p(f"\n  Best ADX exclusion threshold: ADX <= {best_adx:.0f}")
    for yr in [1, 2, None]:
        sub = trades[trades['year'] == yr] if yr is not None else trades
        sub = sub[sub['adx'] <= best_adx]
        label = f"Year {yr} (ADX <= {best_adx:.0f})" if yr else f"Full (ADX <= {best_adx:.0f})"
        print_metrics(metrics(sub, label))

p("\n" + "=" * 100)
p("  SPRINT 027 ANALYSIS COMPLETE")
p("=" * 100)

# Save output
with open(OUTPUT_PATH, 'w') as f:
    f.write('\n'.join(lines))
p(f"\nFull output saved to {OUTPUT_PATH}")
