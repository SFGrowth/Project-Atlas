"""
Atlas Sprint 042 — Model A2 Discovery: Behavioural Validation
Tests all six candidate hypotheses as pure statistical behaviours.
Measures: win rate, expectancy, sample size, p-value vs random baseline.
Uses MNQ 5-min data, 2024-07-07 to 2026-07-07.
$800 risk per trade (dynamic contract sizing).
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os
from scipy import stats
warnings.filterwarnings('ignore')

DATA_PATH  = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-042-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE   = 2.0    # MNQ: $2/point
COMMISSION    = 1.00   # per side per contract
RISK_PER_TRADE = 800.0
RR_TEST       = 2.0    # Fixed 2R target for behavioural test

def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    hi = df['high'].values.astype(float)
    lo = df['low'].values.astype(float)
    cl = df['close'].values.astype(float)
    op = df['open'].values.astype(float)
    n  = len(df)
    hour   = df['ts'].dt.hour.values
    minute = df['ts'].dt.minute.values
    date   = df['ts'].dt.date.values
    year   = df['ts'].dt.year.values
    month  = df['ts'].dt.month.values

    # ATR
    tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
    tr[0] = hi[0] - lo[0]
    atr5  = ewm_fast(tr, 5)
    atr14 = ewm_fast(tr, 14)
    atr20 = ewm_fast(tr, 20)

    # EMAs
    ema9  = ewm_fast(cl, 9)
    ema21 = ewm_fast(cl, 21)
    ema50 = ewm_fast(cl, 50)

    # ADX
    plus_dm  = np.where((hi-np.roll(hi,1))>(np.roll(lo,1)-lo), np.maximum(hi-np.roll(hi,1),0), 0)
    minus_dm = np.where((np.roll(lo,1)-lo)>(hi-np.roll(hi,1)), np.maximum(np.roll(lo,1)-lo,0), 0)
    plus_dm[0] = minus_dm[0] = 0
    plus_di14  = 100 * ewm_fast(plus_dm,14) / np.where(atr14>0, atr14, np.nan)
    minus_di14 = 100 * ewm_fast(minus_dm,14) / np.where(atr14>0, atr14, np.nan)
    di_sum = plus_di14 + minus_di14
    dx = np.where(di_sum>0, 100*np.abs(plus_di14-minus_di14)/di_sum, np.nan)
    adx = ewm_fast(np.nan_to_num(dx, nan=0), 14)

    trend_long  = (ema9 > ema21) & (ema21 > ema50)
    trend_short = (ema9 < ema21) & (ema21 < ema50)
    # RTH: 09:30–15:59 ET
    is_rth = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))

    return {
        'df': df, 'hi': hi, 'lo': lo, 'cl': cl, 'op': op, 'n': n,
        'hour': hour, 'minute': minute, 'date': date, 'year': year, 'month': month,
        'atr5': atr5, 'atr14': atr14, 'atr20': atr20,
        'ema9': ema9, 'ema21': ema21, 'ema50': ema50, 'adx': adx,
        'trend_long': trend_long, 'trend_short': trend_short, 'is_rth': is_rth,
    }

def contracts_for_risk(risk_pts):
    if risk_pts <= 0: return 0
    return max(1, round(RISK_PER_TRADE / (risk_pts * POINT_VALUE)))

def simulate_trade(mkt, i, d, stop_pts, rr=RR_TEST, max_bars=200):
    """Simulate a single trade from bar i. d=1 long, d=-1 short."""
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    is_rth=mkt['is_rth']; n=mkt['n']
    entry = cl[i]
    stop  = entry - d * stop_pts
    tgt   = entry + d * stop_pts * rr
    n_contracts = contracts_for_risk(stop_pts)
    for j in range(i+1, min(i+max_bars, n)):
        if not is_rth[j]:
            net = (cl[j-1]-entry)*POINT_VALUE*d*n_contracts - COMMISSION*2*n_contracts
            return {'outcome':'time_exit','net':net,'bars':j-i,'exit_price':cl[j-1]}
        if d==1:
            if lo[j]<=stop: net=(stop-entry)*POINT_VALUE*d*n_contracts-COMMISSION*2*n_contracts; return {'outcome':'loss','net':net,'bars':j-i,'exit_price':stop}
            if hi[j]>=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_contracts-COMMISSION*2*n_contracts; return {'outcome':'win','net':net,'bars':j-i,'exit_price':tgt}
        else:
            if hi[j]>=stop: net=(stop-entry)*POINT_VALUE*d*n_contracts-COMMISSION*2*n_contracts; return {'outcome':'loss','net':net,'bars':j-i,'exit_price':stop}
            if lo[j]<=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_contracts-COMMISSION*2*n_contracts; return {'outcome':'win','net':net,'bars':j-i,'exit_price':tgt}
    return None

def compute_stats(trades_df, label):
    if len(trades_df) < 10:
        return {'label':label,'n':len(trades_df),'pf':0,'wr':0,'net':0,'exp':0,'p_value':1.0}
    pnl = trades_df['net'].values
    wins = pnl[pnl>0]; loss = pnl[pnl<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl>0).mean()
    net = pnl.sum()
    exp = pnl.mean()
    # Binomial test: is win rate significantly above breakeven for 2R?
    # At 2R, breakeven win rate = 1/(1+2) = 33.3%
    n_wins = int((pnl>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl), 0.333, alternative='greater').pvalue
    eq = np.cumsum(pnl)
    max_dd = (eq - np.maximum.accumulate(eq)).min()
    return {'label':label,'n':len(pnl),'pf':pf,'wr':wr,'net':net,'exp':exp,
            'p_value':p_val,'max_dd':max_dd,'equity':eq}

# ─── H-A2-01: Micro-Consolidation Breakout ────────────────────────────────────
def test_h_a2_01(mkt, adx_min=25, consol_bars_min=3, consol_bars_max=8, comp_ratio=0.60):
    """
    Inside a High-ADX RTH trend:
    - Find N consecutive bars where ATR < comp_ratio * ATR20 (compression)
    - Enter on breakout of the consolidation high (long) or low (short)
    - Stop = consolidation low/high
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr20=mkt['atr20']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 50
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        # Look back for consolidation
        for clen in range(consol_bars_max, consol_bars_min-1, -1):
            if i - clen < 10: break
            window = slice(i-clen, i+1)
            avg_atr = atr20[i]
            if avg_atr <= 0: break
            # All bars in window must be compressed
            if not all(atr5[j] < comp_ratio * avg_atr for j in range(i-clen, i+1)): continue
            consol_hi = hi[i-clen:i+1].max()
            consol_lo = lo[i-clen:i+1].min()
            consol_range = consol_hi - consol_lo
            if consol_range <= 0: break
            # Long: trend up, breakout above consolidation
            if bool(trend_long[i]) and cl[i] > consol_hi:
                stop_pts = consol_range
                if stop_pts < 1.0: break
                result = simulate_trade(mkt, i, 1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
                i += result['bars'] if result else 1
                break
            # Short: trend down, breakout below consolidation
            elif bool(trend_short[i]) and cl[i] < consol_lo:
                stop_pts = consol_range
                if stop_pts < 1.0: break
                result = simulate_trade(mkt, i, -1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
                i += result['bars'] if result else 1
                break
            else:
                break
        else:
            i += 1
            continue
    return pd.DataFrame(trades)

# ─── H-A2-05: Volatility Compression Inside Trend ─────────────────────────────
def test_h_a2_05(mkt, adx_min=25, comp_ratio=0.50, comp_bars=5):
    """
    Inside a High-ADX RTH trend:
    - ATR5 < comp_ratio * ATR20 for at least comp_bars consecutive bars
    - Previous bar had ATR5 >= comp_ratio * ATR20 (compression just ended)
    - Enter on next bar open in trend direction
    - Stop = lowest low of compression zone (long) or highest high (short)
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']; op=mkt['op']
    atr5=mkt['atr5']; atr20=mkt['atr20']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 50
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        avg_atr = atr20[i]
        if avg_atr <= 0: i+=1; continue
        # Check if current bar is expansion (compression just ended)
        if atr5[i] < comp_ratio * avg_atr: i+=1; continue
        # Count consecutive compressed bars ending at i-1
        count = 0
        for k in range(i-1, max(i-30, 0), -1):
            if atr5[k] < comp_ratio * avg_atr: count += 1
            else: break
        if count < comp_bars: i+=1; continue
        # Compression zone: bars from i-count to i-1
        zone_start = i - count
        zone_hi = hi[zone_start:i].max()
        zone_lo = lo[zone_start:i].min()
        zone_range = zone_hi - zone_lo
        if zone_range < 1.0: i+=1; continue
        # Entry: next bar open in trend direction
        entry_bar = i + 1
        if entry_bar >= n: break
        if bool(trend_long[i]) and cl[i] > zone_lo:
            stop_pts = zone_range
            result = simulate_trade(mkt, i, 1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
            i += result['bars'] if result else 1
        elif bool(trend_short[i]) and cl[i] < zone_hi:
            stop_pts = zone_range
            result = simulate_trade(mkt, i, -1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
            i += result['bars'] if result else 1
        else:
            i += 1
    return pd.DataFrame(trades)

# ─── H-A2-02: Flag Structure ───────────────────────────────────────────────────
def test_h_a2_02(mkt, adx_min=25, flag_bars_min=4, flag_bars_max=15):
    """
    Inside a High-ADX RTH trend:
    - Find N bars of counter-trend price action (flag)
    - Flag must not retrace more than 50% of the prior impulse
    - Enter on breakout of flag in trend direction
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        # Find the prior impulse (last 5-bar high/low)
        impulse_hi = hi[max(0,i-5):i].max()
        impulse_lo = lo[max(0,i-5):i].min()
        impulse_range = impulse_hi - impulse_lo
        if impulse_range < atr14[i] * 0.5: i+=1; continue
        # Long: look for flag (counter-trend pullback)
        if bool(trend_long[i]):
            # Flag = recent bars making lower highs/lows
            flag_hi = hi[max(0,i-flag_bars_max):i+1].max()
            flag_lo = lo[max(0,i-flag_bars_max):i+1].min()
            # Check flag is a pullback (not too deep)
            retrace = (impulse_hi - cl[i]) / impulse_range if impulse_range > 0 else 1
            if retrace > 0.5: i+=1; continue
            # Breakout: current close above flag high
            if cl[i] > flag_hi * 0.999:
                stop_pts = cl[i] - flag_lo
                if stop_pts < 1.0: i+=1; continue
                result = simulate_trade(mkt, i, 1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
                i += result['bars'] if result else 1
                continue
        elif bool(trend_short[i]):
            retrace = (cl[i] - impulse_lo) / impulse_range if impulse_range > 0 else 1
            if retrace > 0.5: i+=1; continue
            if cl[i] < impulse_lo * 1.001:
                stop_pts = impulse_hi - cl[i]
                if stop_pts < 1.0: i+=1; continue
                result = simulate_trade(mkt, i, -1, stop_pts)
                if result:
                    trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                                   'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
                i += result['bars'] if result else 1
                continue
        i += 1
    return pd.DataFrame(trades)

# ─── H-A2-04: Break-and-Retest ────────────────────────────────────────────────
def test_h_a2_04(mkt, adx_min=25, lookback=10, retest_tolerance=0.3):
    """
    Inside a High-ADX RTH trend:
    - Prior swing high/low broken (structural breakout)
    - Price retests the broken level (within tolerance * ATR)
    - Enter on retest in trend direction
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        prior_hi = hi[max(0,i-lookback):i].max()
        prior_lo = lo[max(0,i-lookback):i].min()
        tol = retest_tolerance * atr14[i]
        # Long: prior high broken, now retesting from above
        if bool(trend_long[i]) and cl[i-1] > prior_hi and abs(cl[i] - prior_hi) < tol:
            stop_pts = cl[i] - prior_lo
            if stop_pts < 1.0 or stop_pts > atr14[i] * 4: i+=1; continue
            result = simulate_trade(mkt, i, 1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
            i += result['bars'] if result else 1
            continue
        # Short: prior low broken, now retesting from below
        if bool(trend_short[i]) and cl[i-1] < prior_lo and abs(cl[i] - prior_lo) < tol:
            stop_pts = prior_hi - cl[i]
            if stop_pts < 1.0 or stop_pts > atr14[i] * 4: i+=1; continue
            result = simulate_trade(mkt, i, -1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
            i += result['bars'] if result else 1
            continue
        i += 1
    return pd.DataFrame(trades)

# ─── H-A2-03: Pullback Failure ────────────────────────────────────────────────
def test_h_a2_03(mkt, adx_min=25, pb_bars_min=2, pb_bars_max=5):
    """
    Inside a High-ADX RTH trend:
    - N bars of pullback against trend
    - Pullback fails (does not make new extreme beyond prior pullback)
    - Enter on resumption bar
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        # Long: look for failed pullback (lower closes followed by higher close)
        if bool(trend_long[i]):
            # Count consecutive lower closes (pullback)
            pb = 0
            for k in range(i-1, max(i-pb_bars_max-1, 0), -1):
                if cl[k] < cl[k-1]: pb += 1
                else: break
            if pb < pb_bars_min: i+=1; continue
            # Current bar must close higher (failure)
            if cl[i] <= cl[i-1]: i+=1; continue
            pb_lo = lo[i-pb:i+1].min()
            stop_pts = cl[i] - pb_lo
            if stop_pts < 1.0: i+=1; continue
            result = simulate_trade(mkt, i, 1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
            i += result['bars'] if result else 1
            continue
        elif bool(trend_short[i]):
            pb = 0
            for k in range(i-1, max(i-pb_bars_max-1, 0), -1):
                if cl[k] > cl[k-1]: pb += 1
                else: break
            if pb < pb_bars_min: i+=1; continue
            if cl[i] >= cl[i-1]: i+=1; continue
            pb_hi = hi[i-pb:i+1].max()
            stop_pts = pb_hi - cl[i]
            if stop_pts < 1.0: i+=1; continue
            result = simulate_trade(mkt, i, -1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
            i += result['bars'] if result else 1
            continue
        i += 1
    return pd.DataFrame(trades)

# ─── H-A2-06: Liquidity Sweep Continuation ────────────────────────────────────
def test_h_a2_06(mkt, adx_min=25, lookback=10, sweep_min=0.5):
    """
    Inside a High-ADX RTH trend:
    - Price spikes below prior swing low (long) or above prior swing high (short)
    - Immediately closes back inside the prior range (sweep and reverse)
    - Enter on the close of the sweep bar
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; n=mkt['n']

    trades = []
    i = 60
    while i < n - 1:
        if not is_rth[i] or adx[i] < adx_min: i+=1; continue
        prior_lo = lo[max(0,i-lookback):i].min()
        prior_hi = hi[max(0,i-lookback):i].max()
        min_sweep = sweep_min * atr14[i]
        # Long: spike below prior low but close back above
        if bool(trend_long[i]) and lo[i] < prior_lo - min_sweep and cl[i] > prior_lo:
            stop_pts = cl[i] - lo[i]
            if stop_pts < 1.0: i+=1; continue
            result = simulate_trade(mkt, i, 1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':1})
            i += result['bars'] if result else 1
            continue
        # Short: spike above prior high but close back below
        if bool(trend_short[i]) and hi[i] > prior_hi + min_sweep and cl[i] < prior_hi:
            stop_pts = hi[i] - cl[i]
            if stop_pts < 1.0: i+=1; continue
            result = simulate_trade(mkt, i, -1, stop_pts)
            if result:
                trades.append({**result, 'adx':adx[i], 'year':mkt['year'][i],
                               'month':mkt['month'][i], 'date':mkt['date'][i], 'dir':-1})
            i += result['bars'] if result else 1
            continue
        i += 1
    return pd.DataFrame(trades)

# ─── Main ─────────────────────────────────────────────────────────────────────
print("="*70)
print("Sprint 042 — Model A2 Discovery: Behavioural Validation")
print(f"Data: MNQ 5-min | Risk: ${RISK_PER_TRADE}/trade | RR: {RR_TEST}R")
print("="*70)

mkt = load_data()
print(f"Data loaded: {mkt['n']} bars, {mkt['df']['ts'].iloc[0].date()} to {mkt['df']['ts'].iloc[-1].date()}")

# Run all six hypotheses
tests = [
    ("H-A2-01: Micro-Consolidation Breakout",      test_h_a2_01(mkt)),
    ("H-A2-05: Volatility Compression In Trend",   test_h_a2_05(mkt)),
    ("H-A2-02: Flag Structure Continuation",       test_h_a2_02(mkt)),
    ("H-A2-04: Break-and-Retest",                  test_h_a2_04(mkt)),
    ("H-A2-03: Pullback Failure",                  test_h_a2_03(mkt)),
    ("H-A2-06: Liquidity Sweep Continuation",      test_h_a2_06(mkt)),
]

print(f"\n{'─'*70}")
print(f"{'Hypothesis':<42} {'N':>5} {'PF':>7} {'WR':>7} {'Exp($)':>9} {'p-val':>8}")
print("─"*70)

results = {}
for name, df in tests:
    stats_r = compute_stats(df, name)
    results[name] = {'df': df, 'stats': stats_r}
    sig = "**" if stats_r['p_value'] < 0.05 else ("*" if stats_r['p_value'] < 0.10 else "")
    print(f"{name:<42} {stats_r['n']:>5} {stats_r['pf']:>7.3f} {stats_r['wr']:>7.1%} "
          f"{stats_r['exp']:>9.2f} {stats_r['p_value']:>8.4f}{sig}")

print("\n** p < 0.05 (statistically significant)  * p < 0.10 (marginal)")

# ─── Charts ───────────────────────────────────────────────────────────────────
fig = plt.figure(figsize=(20, 14))
gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.40, wspace=0.35)
fig.suptitle('Sprint 042 — Model A2 Discovery: Behavioural Validation\nAll Six Candidate Hypotheses | MNQ | $800 Risk Per Trade',
             fontsize=13, fontweight='bold')

colors = ['#2196F3','#4CAF50','#FF9800','#9C27B0','#F44336','#00BCD4']
short_names = ['H-A2-01\nMicro-Consol', 'H-A2-05\nVol Compress', 'H-A2-02\nFlag',
               'H-A2-04\nBreak-Retest', 'H-A2-03\nPB Failure', 'H-A2-06\nLiq Sweep']

# 1. Equity curves
ax1 = fig.add_subplot(gs[0,:])
for (name, _), col, sname in zip(tests, colors, short_names):
    eq = results[name]['stats'].get('equity')
    if eq is not None and len(eq) > 5:
        pf = results[name]['stats']['pf']
        n  = results[name]['stats']['n']
        ax1.plot(eq, color=col, lw=1.8, label=f"{sname.replace(chr(10),' ')} PF={pf:.3f} N={n}")
ax1.axhline(0, color='black', lw=0.5)
ax1.set_title('Equity Curves — All Six Candidate Hypotheses', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=8, ncol=3); ax1.grid(True, alpha=0.3)

# 2. Profit Factor comparison
ax2 = fig.add_subplot(gs[1,0])
pfs = [results[n]['stats']['pf'] for n,_ in tests]
bars = ax2.bar(short_names, pfs, color=colors, alpha=0.85)
ax2.axhline(1.0, color='red', lw=1.5, ls='--', label='PF=1.0')
ax2.axhline(1.2, color='green', lw=1.0, ls=':', label='PF=1.2 target')
ax2.set_title('Profit Factor by Hypothesis', fontweight='bold')
ax2.set_ylabel('Profit Factor'); ax2.legend(fontsize=8)
ax2.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars, pfs):
    ax2.text(bar.get_x()+bar.get_width()/2., val+0.01, f'{val:.3f}',
             ha='center', va='bottom', fontsize=9)

# 3. Win Rate comparison
ax3 = fig.add_subplot(gs[1,1])
wrs = [results[n]['stats']['wr'] for n,_ in tests]
bars3 = ax3.bar(short_names, wrs, color=colors, alpha=0.85)
ax3.axhline(0.333, color='red', lw=1.5, ls='--', label='Breakeven (2R)')
ax3.set_title('Win Rate by Hypothesis', fontweight='bold')
ax3.set_ylabel('Win Rate'); ax3.legend(fontsize=8)
ax3.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars3, wrs):
    ax3.text(bar.get_x()+bar.get_width()/2., val+0.005, f'{val:.1%}',
             ha='center', va='bottom', fontsize=9)

# 4. p-value comparison
ax4 = fig.add_subplot(gs[1,2])
pvals = [results[n]['stats']['p_value'] for n,_ in tests]
bars4 = ax4.bar(short_names, pvals, color=colors, alpha=0.85)
ax4.axhline(0.05, color='red', lw=1.5, ls='--', label='p=0.05')
ax4.axhline(0.10, color='orange', lw=1.0, ls=':', label='p=0.10')
ax4.set_title('Statistical Significance (p-value)', fontweight='bold')
ax4.set_ylabel('p-value (lower = more significant)'); ax4.legend(fontsize=8)
ax4.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars4, pvals):
    ax4.text(bar.get_x()+bar.get_width()/2., val+0.001, f'{val:.4f}',
             ha='center', va='bottom', fontsize=8)

plt.savefig(f'{OUTPUT_DIR}/sprint_042_behaviour_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"\nChart saved.")
print("\n=== BEHAVIOURAL VALIDATION COMPLETE ===")
