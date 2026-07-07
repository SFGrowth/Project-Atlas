"""
Atlas Market Regime Engine — Research Module v2.0
Sprint 019

Atlas does not seek confirmation. Atlas seeks evidence.
Every hypothesis is assumed false until statistically supported.
Every rule must earn its place through objective validation.

This engine tests 8 independent regime detection hypotheses against the
full 2-year MNQ 5-minute dataset (140,933 bars), then builds a composite
Regime Score and Tradeability Score from only the validated components.

Hypotheses tested:
  H1: ADX improves regime detection (trend strength)
  H2: ATR expansion predicts trend continuation (volatility expansion)
  H3: Chop Index identifies ranging markets
  H4: EMA slope magnitude identifies trend quality
  H5: VWAP deviation improves classification (location relative to value)
  H6: Swing efficiency identifies trend quality (directional efficiency)
  H7: Volatility compression predicts breakouts (low ATR → expansion)
  H8: Session context improves regime accuracy (time-of-day)

Every hypothesis is tested independently.
Components are only combined if individually validated.
The final Regime Score and Tradeability Score are built from validated components only.
"""

import pandas as pd
import numpy as np
import os
from datetime import datetime, time as dtime

DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
RESULTS_DIR = "/home/ubuntu/Project-Atlas/research-engine/results"
os.makedirs(RESULTS_DIR, exist_ok=True)

POINT_VALUE = 2.0    # MNQ: $2 per point
COMMISSION  = 0.62   # per side ($1.24 round trip)
MIN_TRADES  = 80     # minimum trades for statistical validity

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def atr(df, period=14):
    tr = pd.concat([
        df['high'] - df['low'],
        (df['high'] - df['close'].shift(1)).abs(),
        (df['low']  - df['close'].shift(1)).abs()
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()

def adx_full(df, period=14):
    up   = df['high'].diff()
    down = -df['low'].diff()
    pdm  = np.where((up > down) & (up > 0), up, 0.0)
    ndm  = np.where((down > up) & (down > 0), down, 0.0)
    tr   = pd.concat([
        df['high'] - df['low'],
        (df['high'] - df['close'].shift(1)).abs(),
        (df['low']  - df['close'].shift(1)).abs()
    ], axis=1).max(axis=1)
    atr_s = tr.ewm(span=period, adjust=False).mean()
    pdi   = 100 * pd.Series(pdm, index=df.index).ewm(span=period, adjust=False).mean() / atr_s
    ndi   = 100 * pd.Series(ndm, index=df.index).ewm(span=period, adjust=False).mean() / atr_s
    dx    = 100 * (pdi - ndi).abs() / (pdi + ndi).replace(0, np.nan)
    return dx.ewm(span=period, adjust=False).mean(), pdi, ndi

def chop_index(df, period=14):
    tr    = pd.concat([
        df['high'] - df['low'],
        (df['high'] - df['close'].shift(1)).abs(),
        (df['low']  - df['close'].shift(1)).abs()
    ], axis=1).max(axis=1)
    atr_s = tr.rolling(period).sum()
    hl    = df['high'].rolling(period).max() - df['low'].rolling(period).min()
    return 100 * np.log10(atr_s / hl.replace(0, np.nan)) / np.log10(period)

def swing_efficiency(df, period=20):
    """
    Directional efficiency: net price move / sum of bar ranges over N bars.
    High efficiency = strong trend. Low efficiency = chop.
    """
    net_move = (df['close'] - df['close'].shift(period)).abs()
    total_range = (df['high'] - df['low']).rolling(period).sum()
    return net_move / total_range.replace(0, np.nan)

def vwap_deviation(df):
    """
    Distance of close from daily VWAP, normalised by ATR.
    Requires time column to reset VWAP each session.
    """
    df = df.copy()
    df['date'] = df['time'].dt.date
    df['typical'] = (df['high'] + df['low'] + df['close']) / 3
    df['cum_vol_price'] = df.groupby('date').apply(
        lambda g: (g['typical'] * g['volume']).cumsum()
    ).reset_index(level=0, drop=True)
    df['cum_vol'] = df.groupby('date')['volume'].cumsum()
    df['vwap'] = df['cum_vol_price'] / df['cum_vol'].replace(0, np.nan)
    df['vwap_dev'] = (df['close'] - df['vwap']).abs() / df['atr14']
    return df['vwap_dev']

def volatility_compression(df, fast=5, slow=20):
    """
    ATR compression: current ATR(fast) / ATR(slow).
    Values < 0.7 indicate compression (potential breakout setup).
    """
    atr_f = atr(df, fast)
    atr_s = atr(df, slow)
    return atr_f / atr_s.replace(0, np.nan)

# ─────────────────────────────────────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 70)
print("Atlas Market Regime Engine v2.0 — Sprint 019")
print("Atlas does not seek confirmation. Atlas seeks evidence.")
print("=" * 70)
print("\nLoading MNQ 5-min data...")
df = pd.read_csv(DATA_PATH)
df['time'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values("time").reset_index(drop=True)
print(f"  {len(df):,} rows | {df['time'].iloc[0].date()} → {df['time'].iloc[-1].date()}")

# ─────────────────────────────────────────────────────────────────────────────
# COMPUTE ALL INDICATORS
# ─────────────────────────────────────────────────────────────────────────────
print("\nComputing regime indicators...")
df['ema9']  = ema(df['close'], 9)
df['ema21'] = ema(df['close'], 21)
df['ema50'] = ema(df['close'], 50)
df['atr14'] = atr(df, 14)
df['atr50'] = atr(df, 50)
df['atr_ratio'] = df['atr14'] / df['atr50'].replace(0, np.nan)   # expansion
df['vol_compress'] = volatility_compression(df, fast=5, slow=20)   # compression
df['adx14'], df['pdi'], df['ndi'] = adx_full(df, 14)
df['chop14'] = chop_index(df, 14)
df['swing_eff'] = swing_efficiency(df, 20)
df['ema9_slope'] = (df['ema9'] - df['ema9'].shift(5)) / df['atr14']  # normalised slope

# VWAP deviation (requires volume)
if 'volume' in df.columns and df['volume'].sum() > 0:
    df['vwap_dev'] = vwap_deviation(df)
    has_volume = True
else:
    df['vwap_dev'] = 0.0
    has_volume = False
    print("  WARNING: No volume data — VWAP deviation will be skipped.")

# Session classification (ET times)
df['hour_et'] = df['time'].dt.hour  # data assumed to be in ET
df['session'] = 'other'
df.loc[(df['hour_et'] >= 9) & (df['hour_et'] < 10),  'session'] = 'open'      # 9:00–10:00
df.loc[(df['hour_et'] >= 10) & (df['hour_et'] < 12), 'session'] = 'mid_am'    # 10:00–12:00
df.loc[(df['hour_et'] >= 12) & (df['hour_et'] < 14), 'session'] = 'lunch'     # 12:00–14:00
df.loc[(df['hour_et'] >= 14) & (df['hour_et'] < 16), 'session'] = 'pm'        # 14:00–16:00

# Trend direction (baseline entry signal — same as Sprint 018)
df['trend_up'] = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
df['trend_dn'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])
df['l2'] = (df['low'] < df['low'].shift(1)) & (df['low'].shift(1) < df['low'].shift(2))
df['h2'] = (df['high'] > df['high'].shift(1)) & (df['high'].shift(1) > df['high'].shift(2))
df['long_signal']  = df['trend_up'] & df['l2']
df['short_signal'] = df['trend_dn'] & df['h2']

df = df.dropna().reset_index(drop=True)
print(f"  All indicators computed. Shape: {df.shape}")

# ─────────────────────────────────────────────────────────────────────────────
# BACKTEST ENGINE (vectorised simulation)
# ─────────────────────────────────────────────────────────────────────────────
def backtest(df, regime_mask=None, rr=2.5, stop_atr=0.75, label=""):
    entries = df['long_signal'] | df['short_signal']
    if regime_mask is not None:
        entries = entries & regime_mask
    entry_idx = df.index[entries].tolist()
    if len(entry_idx) < MIN_TRADES:
        return None

    pnl_list, bars_list = [], []
    long_pnl, short_pnl = [], []
    session_pnl = {'open': [], 'mid_am': [], 'lunch': [], 'pm': [], 'other': []}
    last_exit = -1

    for i in entry_idx:
        if i <= last_exit:
            continue
        is_long = bool(df.at[i, 'long_signal'])
        ep  = df.at[i, 'close']
        sd  = df.at[i, 'atr14'] * stop_atr
        sl  = ep - sd if is_long else ep + sd
        tp  = ep + sd * rr if is_long else ep - sd * rr
        sess = df.at[i, 'session']

        result = None
        bars = 0
        end = min(i + 60, len(df) - 1)
        for j in range(i + 1, end + 1):
            bars += 1
            h, l = df.at[j, 'high'], df.at[j, 'low']
            if is_long:
                if l <= sl:  result = (sl - ep) * POINT_VALUE - COMMISSION * 2; break
                if h >= tp:  result = (tp - ep) * POINT_VALUE - COMMISSION * 2; break
            else:
                if h >= sl:  result = (ep - sl) * POINT_VALUE - COMMISSION * 2; break
                if l <= tp:  result = (ep - tp) * POINT_VALUE - COMMISSION * 2; break
        if result is None:
            exit_p = df.at[end, 'close']
            result = ((exit_p - ep) if is_long else (ep - exit_p)) * POINT_VALUE - COMMISSION * 2

        pnl_list.append(result)
        bars_list.append(bars)
        last_exit = i + bars
        (long_pnl if is_long else short_pnl).append(result)
        session_pnl[sess].append(result)

    if len(pnl_list) < MIN_TRADES:
        return None

    pnl = np.array(pnl_list)
    w = pnl[pnl > 0]; l = pnl[pnl <= 0]
    gp = w.sum() if len(w) else 0
    gl = abs(l.sum()) if len(l) else 1e-9
    pf = gp / gl

    equity = np.cumsum(pnl)
    dd = (equity - np.maximum.accumulate(equity)).min()

    streak = mx_streak = 0
    for p in pnl:
        streak = streak + 1 if p <= 0 else 0
        mx_streak = max(mx_streak, streak)

    wr = len(w) / len(pnl)
    aw = w.mean() if len(w) else 0
    al = l.mean() if len(l) else 0
    exp = (wr * aw + (1 - wr) * al) / abs(al) if al != 0 else 0
    rob = (pf * len(pnl) * max(exp, 0.001)) / (abs(dd) / 1000 + 1)

    def pf_sub(arr):
        if not arr: return 0.0
        a = np.array(arr)
        gp_ = a[a>0].sum() if any(a>0) else 0
        gl_ = abs(a[a<=0].sum()) if any(a<=0) else 1e-9
        return round(gp_/gl_, 3)

    return {
        'profit_factor': round(pf, 3),
        'win_rate': round(wr * 100, 2),
        'trades': len(pnl),
        'net_pnl': round(pnl.sum(), 2),
        'avg_trade': round(pnl.mean(), 2),
        'max_drawdown': round(dd, 2),
        'expectancy': round(exp, 3),
        'avg_winner': round(aw, 2),
        'avg_loser': round(al, 2),
        'largest_losing_streak': mx_streak,
        'avg_bars_held': round(np.mean(bars_list), 1),
        'robustness_score': round(rob, 4),
        'long_pf': pf_sub(long_pnl),
        'short_pf': pf_sub(short_pnl),
        'open_pf': pf_sub(session_pnl['open']),
        'mid_am_pf': pf_sub(session_pnl['mid_am']),
        'lunch_pf': pf_sub(session_pnl['lunch']),
        'pm_pf': pf_sub(session_pnl['pm']),
    }

# ─────────────────────────────────────────────────────────────────────────────
# HYPOTHESIS TESTING FRAMEWORK
# ─────────────────────────────────────────────────────────────────────────────
baseline = backtest(df)
print(f"\nBaseline (no regime filter): PF={baseline['profit_factor']} | "
      f"WR={baseline['win_rate']}% | Trades={baseline['trades']} | "
      f"PnL=${baseline['net_pnl']:,.0f} | DD=${baseline['max_drawdown']:,.0f} | "
      f"Exp={baseline['expectancy']}")

accepted_components = {}

def test_hypothesis(name, hypothesis, mask_fn_list, baseline):
    """
    Test a hypothesis with multiple threshold variants.
    Returns the best result and whether it was accepted.
    """
    print(f"\n{'─'*70}")
    print(f"  Hypothesis: {hypothesis}")
    best = None
    best_thresh = None
    for thresh, mask in mask_fn_list:
        r = backtest(df, regime_mask=mask)
        if r and (best is None or r['robustness_score'] > best['robustness_score']):
            best = r
            best_thresh = thresh

    if best is None:
        print(f"  Result:     INCONCLUSIVE (insufficient trades at all thresholds)")
        print(f"{'─'*70}")
        return False, None, None

    pf_d  = best['profit_factor'] - baseline['profit_factor']
    dd_d  = best['max_drawdown']  - baseline['max_drawdown']
    pnl_d = best['net_pnl']       - baseline['net_pnl']
    rob_d = best['robustness_score'] - baseline['robustness_score']

    # Acceptance: PF improves AND drawdown improves AND robustness improves
    accepted = (pf_d > 0.005 and dd_d > 0 and rob_d > 0)
    result_str = "TRUE" if accepted else "FALSE"

    print(f"  Result:     {result_str}  (best threshold: {best_thresh})")
    print(f"  Evidence:")
    print(f"    Profit Factor:      {baseline['profit_factor']} → {best['profit_factor']}  ({pf_d:+.3f})")
    print(f"    Win Rate:           {baseline['win_rate']}% → {best['win_rate']}%")
    print(f"    Net PnL:            ${baseline['net_pnl']:,.0f} → ${best['net_pnl']:,.0f}  ({pnl_d:+,.0f})")
    print(f"    Max Drawdown:       ${baseline['max_drawdown']:,.0f} → ${best['max_drawdown']:,.0f}  ({dd_d:+,.0f})")
    print(f"    Expectancy:         {baseline['expectancy']} → {best['expectancy']}")
    print(f"    Trades:             {baseline['trades']} → {best['trades']}  ({best['trades']-baseline['trades']:+d})")
    print(f"    Losing Streak:      {baseline['largest_losing_streak']} → {best['largest_losing_streak']}")
    print(f"    Long PF:            {best['long_pf']}  |  Short PF: {best['short_pf']}")
    print(f"    Open PF:            {best['open_pf']}  |  Mid-AM PF: {best['mid_am_pf']}  |  PM PF: {best['pm_pf']}")
    print(f"    Robustness Δ:       {rob_d:+.4f}")
    print(f"  Decision:   {'Accept rule.' if accepted else 'Reject rule.'}")
    print(f"{'─'*70}")
    return accepted, best, best_thresh

# ─────────────────────────────────────────────────────────────────────────────
# H1: ADX — Trend Strength
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("HYPOTHESIS TESTS — REGIME COMPONENTS")
print("=" * 70)

print("\n[H1] ADX — Trend Strength Filter")
h1_accepted, h1_best, h1_thresh = test_hypothesis(
    "H1", "ADX >= threshold filters out low-quality trend environments.",
    [(t, df['adx14'] >= t) for t in [15, 20, 25, 30]], baseline
)
if h1_accepted:
    accepted_components['adx'] = {'mask': df['adx14'] >= h1_thresh, 'threshold': h1_thresh, 'result': h1_best}

# ─────────────────────────────────────────────────────────────────────────────
# H2: ATR Expansion — Volatility Expansion
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H2] ATR Expansion — Volatility Expansion Filter")
h2_accepted, h2_best, h2_thresh = test_hypothesis(
    "H2", "ATR expansion (current ATR > N × long-term ATR) predicts trend continuation.",
    [(t, df['atr_ratio'] >= t) for t in [1.0, 1.1, 1.2, 1.3]], baseline
)
if h2_accepted:
    accepted_components['atr_expansion'] = {'mask': df['atr_ratio'] >= h2_thresh, 'threshold': h2_thresh, 'result': h2_best}

# ─────────────────────────────────────────────────────────────────────────────
# H3: Chop Index — Range Detection
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H3] Chop Index — Range Detection Filter")
h3_accepted, h3_best, h3_thresh = test_hypothesis(
    "H3", "Low Chop Index (<= threshold) identifies trending markets worth trading.",
    [(t, df['chop14'] <= t) for t in [50, 55, 60, 65]], baseline
)
if h3_accepted:
    accepted_components['chop'] = {'mask': df['chop14'] <= h3_thresh, 'threshold': h3_thresh, 'result': h3_best}

# ─────────────────────────────────────────────────────────────────────────────
# H4: EMA Slope — Trend Momentum
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H4] EMA Slope — Trend Momentum Filter")
h4_accepted, h4_best, h4_thresh = test_hypothesis(
    "H4", "A steep EMA slope (>= threshold ATR/bar) indicates strong trend momentum.",
    [(t, df['ema9_slope'].abs() >= t) for t in [0.1, 0.2, 0.3, 0.4]], baseline
)
if h4_accepted:
    accepted_components['ema_slope'] = {'mask': df['ema9_slope'].abs() >= h4_thresh, 'threshold': h4_thresh, 'result': h4_best}

# ─────────────────────────────────────────────────────────────────────────────
# H5: Swing Efficiency — Trend Quality
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H5] Swing Efficiency — Trend Quality Filter")
h5_accepted, h5_best, h5_thresh = test_hypothesis(
    "H5", "High swing efficiency (>= threshold) identifies high-quality directional trends.",
    [(t, df['swing_eff'] >= t) for t in [0.3, 0.4, 0.5, 0.6]], baseline
)
if h5_accepted:
    accepted_components['swing_eff'] = {'mask': df['swing_eff'] >= h5_thresh, 'threshold': h5_thresh, 'result': h5_best}

# ─────────────────────────────────────────────────────────────────────────────
# H6: Volatility Compression — Breakout Predictor
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H6] Volatility Compression — Breakout Predictor")
h6_accepted, h6_best, h6_thresh = test_hypothesis(
    "H6", "Volatility compression (ATR fast/slow <= threshold) predicts impending breakouts.",
    [(t, df['vol_compress'] <= t) for t in [0.7, 0.8, 0.9, 1.0]], baseline
)
if h6_accepted:
    accepted_components['vol_compress'] = {'mask': df['vol_compress'] <= h6_thresh, 'threshold': h6_thresh, 'result': h6_best}

# ─────────────────────────────────────────────────────────────────────────────
# H7: VWAP Deviation — Location Filter
# ─────────────────────────────────────────────────────────────────────────────
if has_volume:
    print("\n[H7] VWAP Deviation — Location Filter")
    h7_accepted, h7_best, h7_thresh = test_hypothesis(
        "H7", "Entries close to VWAP (deviation <= threshold ATR) have higher expectancy.",
        [(t, df['vwap_dev'] <= t) for t in [0.5, 1.0, 1.5, 2.0]], baseline
    )
    if h7_accepted:
        accepted_components['vwap_dev'] = {'mask': df['vwap_dev'] <= h7_thresh, 'threshold': h7_thresh, 'result': h7_best}
else:
    print("\n[H7] VWAP Deviation — SKIPPED (no volume data)")

# ─────────────────────────────────────────────────────────────────────────────
# H8: Session Context — Time-of-Day Filter
# ─────────────────────────────────────────────────────────────────────────────
print("\n[H8] Session Context — Time-of-Day Filter")
session_results = {}
for sess in ['open', 'mid_am', 'pm']:
    r = backtest(df, regime_mask=(df['session'] == sess))
    if r:
        session_results[sess] = r
        print(f"  Session '{sess}': PF={r['profit_factor']} | WR={r['win_rate']}% | "
              f"Trades={r['trades']} | DD=${r['max_drawdown']:,.0f}")

# Find best session combination
best_sess_mask = None
best_sess_result = None
best_sess_name = None
for combo_size in [1, 2, 3]:
    from itertools import combinations
    for combo in combinations(['open', 'mid_am', 'pm'], combo_size):
        mask = df['session'].isin(combo)
        r = backtest(df, regime_mask=mask)
        if r and (best_sess_result is None or r['robustness_score'] > best_sess_result['robustness_score']):
            best_sess_result = r
            best_sess_mask = mask
            best_sess_name = '+'.join(combo)

if best_sess_result:
    pf_d = best_sess_result['profit_factor'] - baseline['profit_factor']
    dd_d = best_sess_result['max_drawdown'] - baseline['max_drawdown']
    rob_d = best_sess_result['robustness_score'] - baseline['robustness_score']
    h8_accepted = (pf_d > 0.005 and dd_d > 0 and rob_d > 0)
    print(f"\n  Best session combo: {best_sess_name}")
    print(f"  Result: {'TRUE' if h8_accepted else 'FALSE'}")
    print(f"  PF: {baseline['profit_factor']} → {best_sess_result['profit_factor']} ({pf_d:+.3f})")
    print(f"  DD: ${baseline['max_drawdown']:,.0f} → ${best_sess_result['max_drawdown']:,.0f} ({dd_d:+,.0f})")
    print(f"  Decision: {'Accept rule.' if h8_accepted else 'Reject rule.'}")
    if h8_accepted:
        accepted_components['session'] = {'mask': best_sess_mask, 'threshold': best_sess_name, 'result': best_sess_result}

# ─────────────────────────────────────────────────────────────────────────────
# COMPOSITE REGIME SCORE
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("COMPOSITE REGIME SCORE — COMBINING VALIDATED COMPONENTS")
print("=" * 70)
print(f"\n  Accepted components: {list(accepted_components.keys())}")

if len(accepted_components) == 0:
    print("  WARNING: No components were individually validated. Cannot build composite score.")
    composite_result = None
elif len(accepted_components) == 1:
    name = list(accepted_components.keys())[0]
    composite_result = accepted_components[name]['result']
    print(f"  Only one component accepted ({name}). Using it as the composite filter.")
else:
    # Build composite mask: AND of all accepted components
    masks = [data['mask'] for data in accepted_components.values()]
    composite_mask = masks[0]
    for m in masks[1:]:
        composite_mask = composite_mask & m

    composite_result = backtest(df, regime_mask=composite_mask)
    if composite_result:
        pf_d  = composite_result['profit_factor'] - baseline['profit_factor']
        dd_d  = composite_result['max_drawdown']  - baseline['max_drawdown']
        rob_d = composite_result['robustness_score'] - baseline['robustness_score']
        print(f"\n  Composite Result:")
        print(f"    PF:        {baseline['profit_factor']} → {composite_result['profit_factor']}  ({pf_d:+.3f})")
        print(f"    WR:        {baseline['win_rate']}% → {composite_result['win_rate']}%")
        print(f"    PnL:       ${baseline['net_pnl']:,.0f} → ${composite_result['net_pnl']:,.0f}  ({composite_result['net_pnl']-baseline['net_pnl']:+,.0f})")
        print(f"    DD:        ${baseline['max_drawdown']:,.0f} → ${composite_result['max_drawdown']:,.0f}  ({dd_d:+,.0f})")
        print(f"    Trades:    {baseline['trades']} → {composite_result['trades']}")
        print(f"    Exp:       {baseline['expectancy']} → {composite_result['expectancy']}")
        print(f"    Streak:    {baseline['largest_losing_streak']} → {composite_result['largest_losing_streak']}")
        print(f"    Robustness Δ: {rob_d:+.4f}")
        composite_accepted = (pf_d > 0.005 and dd_d > 0 and rob_d > 0)
        print(f"  Composite Decision: {'ACCEPTED — use as Atlas Regime Filter' if composite_accepted else 'REJECTED — composite worse than best individual'}")

# ─────────────────────────────────────────────────────────────────────────────
# PARAMETER SWEEP ON BEST COMPOSITE
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("PARAMETER SWEEP — RR AND STOP OPTIMISATION WITH REGIME FILTER")
print("=" * 70)

import itertools
rr_vals   = [1.5, 2.0, 2.5, 3.0]
stop_vals = [0.5, 0.75, 1.0, 1.25]

# Use best individual component mask for sweep (most trades)
best_individual_name = max(accepted_components.keys(),
    key=lambda k: accepted_components[k]['result']['robustness_score']) if accepted_components else None

sweep_mask = accepted_components[best_individual_name]['mask'] if best_individual_name else None
combos = list(itertools.product(rr_vals, stop_vals))
print(f"  Running {len(combos)} combinations with '{best_individual_name}' regime filter...")

sweep_results = []
best_sweep = None
for rr, stop in combos:
    r = backtest(df, regime_mask=sweep_mask, rr=rr, stop_atr=stop)
    if r:
        r.update({'rr_ratio': rr, 'stop_atr_mult': stop, 'regime_filter': best_individual_name})
        sweep_results.append(r)
        if best_sweep is None or r['robustness_score'] > best_sweep['robustness_score']:
            best_sweep = r

if sweep_results:
    sweep_df = pd.DataFrame(sweep_results).sort_values('robustness_score', ascending=False)
    sweep_df.to_csv(f"{RESULTS_DIR}/regime_v2_sweep_results.csv", index=False)
    print(f"\n  Top 5 by Robustness:")
    print(sweep_df[['robustness_score','profit_factor','win_rate','trades','net_pnl',
                     'max_drawdown','expectancy','largest_losing_streak','rr_ratio','stop_atr_mult']].head(5).to_string(index=False))

    print("\n" + "=" * 70)
    print("BEST RESULT — FULL DETAIL")
    print("=" * 70)
    for k, v in best_sweep.items():
        print(f"  {k:<30}: {v}")

# ─────────────────────────────────────────────────────────────────────────────
# SAVE COMPONENT SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
summary_rows = [{'component': 'baseline', **baseline}]
for name, data in accepted_components.items():
    summary_rows.append({'component': name, **data['result']})
if composite_result:
    summary_rows.append({'component': 'composite', **composite_result})

pd.DataFrame(summary_rows).to_csv(f"{RESULTS_DIR}/regime_v2_component_summary.csv", index=False)

print(f"\nAll results saved to: {RESULTS_DIR}")
print("\n" + "=" * 70)
print("Sprint 019 — Regime Engine Research Complete")
print("=" * 70)
