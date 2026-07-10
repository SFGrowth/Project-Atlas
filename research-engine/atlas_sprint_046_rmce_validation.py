"""
Atlas Research Engine — Sprint 046
RMCE Validation Programme

Tests:
  H-RMCE-02: ATR Acceleration Filter on Models A1, A2, A3
  H-RMCE-03: Relative Volume Confirmation across pattern types
  H-RMCE-01: AM Volatility Breakout as standalone execution model
"""

import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from scipy import stats
import warnings
warnings.filterwarnings('ignore')

DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
CHART_DIR  = Path("/home/ubuntu/Project-Atlas/research/sprint-046-charts")
CHART_DIR.mkdir(parents=True, exist_ok=True)
MNQ_PV = 2.0
RISK   = 800.0  # $800 per trade

# ─── Data Loading ─────────────────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts']     = pd.to_datetime(df['timestamp_et'], utc=True)
    df           = df.sort_values('ts').reset_index(drop=True)
    df['date']   = df['ts'].dt.date
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['dow']    = df['ts'].dt.dayofweek
    df['time_int'] = df['hour']*100 + df['minute']

    hi = df['high'].values; lo = df['low'].values; cl = df['close'].values
    n  = len(cl)

    # TR / ATR
    pc  = np.concatenate([[cl[0]], cl[:-1]])
    tr  = np.maximum(hi-lo, np.maximum(np.abs(hi-pc), np.abs(lo-pc)))
    df['atr5']  = pd.Series(tr).rolling(5,  min_periods=1).mean().values
    df['atr14'] = pd.Series(tr).rolling(14, min_periods=1).mean().values

    # ATR Acceleration
    atr14 = df['atr14'].values
    atr_accel = np.ones(n)
    for i in range(20, n):
        if atr14[i-20] > 0:
            atr_accel[i] = atr14[i] / atr14[i-20]
    df['atr_accel'] = atr_accel

    # Relative Volume
    vol = df['volume'].values if 'volume' in df.columns else np.ones(n)
    avg_vol = pd.Series(vol).rolling(20, min_periods=1).mean().values
    df['rel_vol'] = np.where(avg_vol > 0, vol / avg_vol, 1.0)

    # EMAs
    df['ema9']   = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21']  = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50']  = df['close'].ewm(span=50, adjust=False).mean()

    # ADX
    df['adx'] = compute_adx(df, 14)

    # Volatility expansion ratio (for A1)
    atr5 = df['atr5'].values
    vol_exp = np.ones(n)
    for i in range(20, n):
        if atr5[i-20] > 0:
            vol_exp[i] = atr5[i] / atr5[i-20]
    df['vol_exp'] = vol_exp

    # EMA alignment
    ema9v = df['ema9'].values; ema21v = df['ema21'].values; ema50v = df['ema50'].values
    df['ema_bull'] = (ema9v > ema21v) & (ema21v > ema50v)
    df['ema_bear'] = (ema9v < ema21v) & (ema21v < ema50v)

    # Compression (20-bar range / ATR14)
    hi20 = df['high'].rolling(20, min_periods=1).max().values
    lo20 = df['low'].rolling(20,  min_periods=1).min().values
    df['compression_20'] = np.where(atr14 > 0, (hi20-lo20)/atr14, 0)

    # Session
    def session(row):
        t = row['hour']*60 + row['minute']
        if t < 570:  return 'GLOBEX'
        if t < 660:  return 'OPEN'
        if t < 780:  return 'MIDDAY'
        if t < 900:  return 'PM'
        if t < 960:  return 'CLOSE'
        return 'OVERNIGHT'
    df['session'] = df.apply(session, axis=1)
    df['is_rth']  = df['session'].isin(['OPEN','MIDDAY','PM','CLOSE'])

    # 10-bar high/low for breakout detection
    df['hi10'] = df['high'].rolling(10, min_periods=1).max().shift(1)
    df['lo10'] = df['low'].rolling(10,  min_periods=1).min().shift(1)

    # Swing depth from recent extreme (for A1 pullback)
    swing_depth = np.zeros(n)
    for i in range(20, n):
        if df['ema_bull'].iloc[i]:
            swing_hi = hi[max(0,i-20):i].max()
            swing_depth[i] = (swing_hi - cl[i]) / atr14[i] if atr14[i] > 0 else 0
        elif df['ema_bear'].iloc[i]:
            swing_lo = lo[max(0,i-20):i].min()
            swing_depth[i] = (cl[i] - swing_lo) / atr14[i] if atr14[i] > 0 else 0
    df['swing_depth'] = swing_depth

    # Flag detection: 3-8 bar consolidation after impulse
    bar_move = hi - lo
    flag_signal = np.zeros(n)
    for i in range(10, n):
        # Check for prior impulse (any bar > 1.5 ATR in last 10)
        prior_impulse = any(bar_move[max(0,i-10):i] > 1.5 * atr14[i])
        # Check current consolidation (last 3-8 bars all < 0.7 ATR)
        consol_len = 0
        for j in range(i-1, max(i-9, 0), -1):
            if bar_move[j] < 0.7 * atr14[j]:
                consol_len += 1
            else:
                break
        if prior_impulse and 3 <= consol_len <= 8:
            flag_signal[i] = 1
    df['flag_signal'] = flag_signal

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

def calc_metrics(trades):
    if not trades: return {}
    pnl = [t['pnl'] for t in trades]
    wins = [p for p in pnl if p > 0]; losses = [p for p in pnl if p < 0]
    gross_profit = sum(wins); gross_loss = abs(sum(losses))
    pf = gross_profit/gross_loss if gross_loss > 0 else (999 if gross_profit > 0 else 0)
    net = sum(pnl)
    equity = np.cumsum([0] + pnl)
    peak = np.maximum.accumulate(equity)
    dd = equity - peak
    max_dd = dd.min()
    monthly = {}
    for t in trades:
        key = str(t['date'])[:7]
        monthly[key] = monthly.get(key, 0) + t['pnl']
    monthly_pct = sum(1 for v in monthly.values() if v > 0) / len(monthly) if monthly else 0
    return {
        'n': len(trades), 'pf': round(pf, 3), 'net': round(net, 2),
        'wr': round(len(wins)/len(trades)*100, 1),
        'avg_win': round(np.mean(wins), 2) if wins else 0,
        'avg_loss': round(np.mean(losses), 2) if losses else 0,
        'max_dd': round(max_dd, 2),
        'monthly_pct': round(monthly_pct*100, 1),
        'expectancy': round(net/len(trades), 2),
    }

# ─── Model A1 Simulator (validated logic from Sprint 025) ─────────────────────
def run_model_a1(df, use_atr_accel=False, use_rel_vol=False,
                 atr_accel_thresh=1.2, rel_vol_thresh=1.2):
    """Model A1: EMA21 pullback continuation, PM session, low ADX."""
    trades = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    ema21 = df['ema21'].values; vol_exp = df['vol_exp'].values
    atr_accel = df['atr_accel'].values; rel_vol = df['rel_vol'].values
    swing_depth = df['swing_depth'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    n = len(cl)

    for i in range(50, n-2):
        # Session: PM 13:00-16:00 ET
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (1300 <= t < 1600): continue
        # Regime: low ADX
        if adx[i] >= 30: continue
        # Volatility expansion
        if vol_exp[i] < 1.8: continue
        # Swing depth 0.5-1.2 ATR
        if not (0.5 <= swing_depth[i] <= 1.2): continue
        # EMA21 touch/cross
        prev_cl = cl[i-1]
        ema21_touch = (
            (ema_bull[i] and prev_cl > ema21[i] and cl[i] <= ema21[i] * 1.001) or
            (ema_bear[i] and prev_cl < ema21[i] and cl[i] >= ema21[i] * 0.999)
        )
        if not ema21_touch: continue
        # Optional filters
        if use_atr_accel and atr_accel[i] < atr_accel_thresh: continue
        if use_rel_vol and rel_vol[i] < rel_vol_thresh: continue

        direction = 1 if ema_bull[i] else -1
        entry = cl[i]
        stop_dist = atr14[i]
        if stop_dist < 0.5: continue
        n_contracts = max(1, round(RISK / (stop_dist * MNQ_PV)))
        stop  = entry - direction * stop_dist
        target = entry + direction * 2.0 * stop_dist

        # Simulate
        outcome = None
        for j in range(i+1, min(i+30, n)):
            if direction == 1:
                if lo[j] <= stop:  outcome = 'loss'; break
                if hi[j] >= target: outcome = 'win'; break
            else:
                if hi[j] >= stop:  outcome = 'loss'; break
                if lo[j] <= target: outcome = 'win'; break
        if outcome is None: outcome = 'loss'

        pnl = (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
              (-n_contracts * stop_dist * MNQ_PV)
        trades.append({'pnl': pnl, 'outcome': outcome, 'date': df['date'].iloc[i],
                       'direction': direction, 'atr_accel': atr_accel[i], 'rel_vol': rel_vol[i]})
    return trades

# ─── Model A2 Simulator (validated logic from Sprint 042) ─────────────────────
def run_model_a2(df, use_atr_accel=False, use_rel_vol=False,
                 atr_accel_thresh=1.2, rel_vol_thresh=1.2):
    """Model A2: Flag continuation, Late PM session, high ADX."""
    trades = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    atr_accel = df['atr_accel'].values; rel_vol = df['rel_vol'].values
    flag_signal = df['flag_signal'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    n = len(cl)

    for i in range(50, n-2):
        # Session: Late PM 14:00-16:00 ET
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (1400 <= t < 1600): continue
        # Regime: high ADX
        if adx[i] < 45: continue
        # Flag signal present
        if flag_signal[i] == 0: continue
        # Breakout of 10-bar range
        struct_break_up   = cl[i] > hi10[i] and ema_bull[i]
        struct_break_down = cl[i] < lo10[i] and ema_bear[i]
        if not (struct_break_up or struct_break_down): continue
        # Optional filters
        if use_atr_accel and atr_accel[i] < atr_accel_thresh: continue
        if use_rel_vol and rel_vol[i] < rel_vol_thresh: continue

        direction = 1 if struct_break_up else -1
        entry = cl[i]
        stop_dist = atr14[i]
        if stop_dist < 0.5: continue
        n_contracts = max(1, round(RISK / (stop_dist * MNQ_PV)))
        stop  = entry - direction * stop_dist
        target = entry + direction * 2.0 * stop_dist

        outcome = None
        for j in range(i+1, min(i+30, n)):
            if direction == 1:
                if lo[j] <= stop:  outcome = 'loss'; break
                if hi[j] >= target: outcome = 'win'; break
            else:
                if hi[j] >= stop:  outcome = 'loss'; break
                if lo[j] <= target: outcome = 'win'; break
        if outcome is None: outcome = 'loss'

        pnl = (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
              (-n_contracts * stop_dist * MNQ_PV)
        trades.append({'pnl': pnl, 'outcome': outcome, 'date': df['date'].iloc[i],
                       'direction': direction, 'atr_accel': atr_accel[i], 'rel_vol': rel_vol[i]})
    return trades

# ─── Model A3 Simulator (validated logic from Sprint 037) ─────────────────────
def run_model_a3(df, use_atr_accel=False, use_rel_vol=False,
                 atr_accel_thresh=1.2, rel_vol_thresh=1.2):
    """Model A3: Overnight volatility contraction breakout, high ADX."""
    trades = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    atr_accel = df['atr_accel'].values; rel_vol = df['rel_vol'].values
    compression = df['compression_20'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    n = len(cl)

    for i in range(50, n-2):
        # Session: overnight (before 9:30 ET)
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (t < 930 or t >= 2000): continue
        # Regime: ADX > 25
        if adx[i] < 25: continue
        # Compression: range contracted
        if compression[i] > 2.5: continue
        # Breakout of 10-bar range
        struct_break_up   = cl[i] > hi10[i] and ema_bull[i]
        struct_break_down = cl[i] < lo10[i] and ema_bear[i]
        if not (struct_break_up or struct_break_down): continue
        # Optional filters
        if use_atr_accel and atr_accel[i] < atr_accel_thresh: continue
        if use_rel_vol and rel_vol[i] < rel_vol_thresh: continue

        direction = 1 if struct_break_up else -1
        entry = cl[i]
        stop_dist = atr14[i]
        if stop_dist < 0.5: continue
        n_contracts = max(1, round(RISK / (stop_dist * MNQ_PV)))
        stop  = entry - direction * stop_dist
        target = entry + direction * 2.0 * stop_dist

        outcome = None
        for j in range(i+1, min(i+30, n)):
            if direction == 1:
                if lo[j] <= stop:  outcome = 'loss'; break
                if hi[j] >= target: outcome = 'win'; break
            else:
                if hi[j] >= stop:  outcome = 'loss'; break
                if lo[j] <= target: outcome = 'win'; break
        if outcome is None: outcome = 'loss'

        pnl = (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
              (-n_contracts * stop_dist * MNQ_PV)
        trades.append({'pnl': pnl, 'outcome': outcome, 'date': df['date'].iloc[i],
                       'direction': direction, 'atr_accel': atr_accel[i], 'rel_vol': rel_vol[i]})
    return trades

# ─── H-RMCE-01: AM Volatility Breakout ────────────────────────────────────────
def run_am_breakout(df, atr_accel_thresh=1.2, rel_vol_thresh=1.2, adx_min=0):
    """H-RMCE-01: AM session breakout with volatility acceleration."""
    trades = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    atr_accel = df['atr_accel'].values; rel_vol = df['rel_vol'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    n = len(cl)

    for i in range(50, n-2):
        # Session: AM 09:30-12:00 ET
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (930 <= t < 1200): continue
        # ADX filter (optional)
        if adx[i] < adx_min: continue
        # ATR Acceleration required
        if atr_accel[i] < atr_accel_thresh: continue
        # Relative Volume required
        if rel_vol[i] < rel_vol_thresh: continue
        # Structural breakout
        struct_break_up   = cl[i] > hi10[i] and ema_bull[i]
        struct_break_down = cl[i] < lo10[i] and ema_bear[i]
        if not (struct_break_up or struct_break_down): continue

        direction = 1 if struct_break_up else -1
        entry = cl[i]
        stop_dist = atr14[i]
        if stop_dist < 0.5: continue
        n_contracts = max(1, round(RISK / (stop_dist * MNQ_PV)))
        stop  = entry - direction * stop_dist
        target = entry + direction * 2.0 * stop_dist

        outcome = None
        for j in range(i+1, min(i+30, n)):
            if direction == 1:
                if lo[j] <= stop:  outcome = 'loss'; break
                if hi[j] >= target: outcome = 'win'; break
            else:
                if hi[j] >= stop:  outcome = 'loss'; break
                if lo[j] <= target: outcome = 'win'; break
        if outcome is None: outcome = 'loss'

        pnl = (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
              (-n_contracts * stop_dist * MNQ_PV)
        trades.append({'pnl': pnl, 'outcome': outcome, 'date': df['date'].iloc[i],
                       'direction': direction, 'atr_accel': atr_accel[i], 'rel_vol': rel_vol[i]})
    return trades

# ─── H-RMCE-03: Relative Volume Confirmation ──────────────────────────────────
def run_relvol_test(df, pattern='breakout', rel_vol_thresh=1.3):
    """H-RMCE-03: Test relative volume as a filter across pattern types."""
    trades_with = []; trades_without = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    rel_vol = df['rel_vol'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    flag_signal = df['flag_signal'].values
    swing_depth = df['swing_depth'].values
    compression = df['compression_20'].values
    vol_exp = df['vol_exp'].values
    n = len(cl)

    for i in range(50, n-2):
        if not df['is_rth'].iloc[i]: continue
        direction = None

        if pattern == 'breakout':
            if adx[i] < 30: continue
            if cl[i] > hi10[i] and ema_bull[i]: direction = 1
            elif cl[i] < lo10[i] and ema_bear[i]: direction = -1
        elif pattern == 'pullback':
            if adx[i] >= 30: continue
            if vol_exp[i] < 1.8: continue
            if 0.5 <= swing_depth[i] <= 1.2:
                direction = 1 if ema_bull[i] else (-1 if ema_bear[i] else None)
        elif pattern == 'flag':
            if adx[i] < 40: continue
            if flag_signal[i] == 0: continue
            if cl[i] > hi10[i] and ema_bull[i]: direction = 1
            elif cl[i] < lo10[i] and ema_bear[i]: direction = -1
        elif pattern == 'compression':
            if adx[i] < 25: continue
            if compression[i] > 2.5: continue
            if cl[i] > hi10[i] and ema_bull[i]: direction = 1
            elif cl[i] < lo10[i] and ema_bear[i]: direction = -1

        if direction is None: continue

        entry = cl[i]; stop_dist = atr14[i]
        if stop_dist < 0.5: continue
        n_contracts = max(1, round(RISK / (stop_dist * MNQ_PV)))
        stop  = entry - direction * stop_dist
        target = entry + direction * 2.0 * stop_dist

        outcome = None
        for j in range(i+1, min(i+30, n)):
            if direction == 1:
                if lo[j] <= stop:  outcome = 'loss'; break
                if hi[j] >= target: outcome = 'win'; break
            else:
                if hi[j] >= stop:  outcome = 'loss'; break
                if lo[j] <= target: outcome = 'win'; break
        if outcome is None: outcome = 'loss'

        pnl = (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
              (-n_contracts * stop_dist * MNQ_PV)
        trade = {'pnl': pnl, 'outcome': outcome, 'date': df['date'].iloc[i]}
        trades_without.append(trade)
        if rel_vol[i] >= rel_vol_thresh:
            trades_with.append(trade)

    return trades_without, trades_with

# ─── Walk-Forward ─────────────────────────────────────────────────────────────
def walk_forward(trades, n_splits=4):
    if not trades: return []
    dates = sorted(set(t['date'] for t in trades))
    split_size = len(dates) // n_splits
    results = []
    for k in range(n_splits):
        start = dates[k*split_size]
        end   = dates[min((k+1)*split_size, len(dates))-1]
        subset = [t for t in trades if start <= t['date'] <= end]
        if subset:
            m = calc_metrics(subset)
            results.append({'period': k+1, 'start': start, 'end': end,
                            'n': m['n'], 'pf': m['pf'], 'net': m['net']})
    return results

# ─── Monte Carlo ──────────────────────────────────────────────────────────────
def monte_carlo(trades, n_sims=2000, account=50000, daily_limit=1000, max_dd_limit=2500):
    if not trades: return 0.0
    pnl_arr = np.array([t['pnl'] for t in trades])
    passes = 0
    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        equity = account; daily_pnl = 0; peak = account; max_dd = 0
        failed = False
        for p in shuffled:
            equity += p; daily_pnl += p
            peak = max(peak, equity)
            max_dd = max(max_dd, peak - equity)
            if daily_pnl < -daily_limit or max_dd > max_dd_limit:
                failed = True; break
        if not failed and equity > account:
            passes += 1
    return passes / n_sims * 100

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars")

    # ═══════════════════════════════════════════════════════════════════════════
    # H-RMCE-02: ATR Acceleration Filter
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("H-RMCE-02: ATR ACCELERATION FILTER")
    print("="*70)

    results_02 = {}
    for model_name, run_fn in [('A1', run_model_a1), ('A2', run_model_a2), ('A3', run_model_a3)]:
        base   = run_fn(df, use_atr_accel=False, use_rel_vol=False)
        with_f = run_fn(df, use_atr_accel=True,  use_rel_vol=False, atr_accel_thresh=1.2)
        m_base = calc_metrics(base); m_filt = calc_metrics(with_f)
        results_02[model_name] = {'base': m_base, 'filtered': m_filt, 'base_trades': base, 'filt_trades': with_f}
        print(f"\n  Model {model_name}:")
        print(f"    Baseline:   N={m_base['n']:3d}  PF={m_base['pf']:.3f}  Net=${m_base['net']:,.0f}  WR={m_base['wr']}%  MaxDD=${m_base['max_dd']:,.0f}")
        print(f"    +ATR_accel: N={m_filt['n']:3d}  PF={m_filt['pf']:.3f}  Net=${m_filt['net']:,.0f}  WR={m_filt['wr']}%  MaxDD=${m_filt['max_dd']:,.0f}")
        pf_change = (m_filt['pf']/m_base['pf'] - 1)*100 if m_base['pf'] > 0 else 0
        n_change  = (m_filt['n']/m_base['n'] - 1)*100 if m_base['n'] > 0 else 0
        print(f"    PF change: {pf_change:+.1f}%  N change: {n_change:+.1f}%")

    # Component attribution: what does ATR_accel actually improve?
    print("\n  Component Attribution (Model A1 as example):")
    a1_base = results_02['A1']['base_trades']
    a1_filt = results_02['A1']['filt_trades']
    if a1_base and a1_filt:
        # Trades filtered OUT (in base but not in filtered)
        filt_dates = set((t['date'], t['direction']) for t in a1_filt)
        removed = [t for t in a1_base if (t['date'], t['direction']) not in filt_dates]
        if removed:
            m_removed = calc_metrics(removed)
            print(f"    Removed trades: N={m_removed['n']}  PF={m_removed['pf']:.3f}  WR={m_removed['wr']}%")
            print(f"    → ATR filter removes trades with PF={m_removed['pf']:.3f} (vs baseline {results_02['A1']['base']['pf']:.3f})")

    # ═══════════════════════════════════════════════════════════════════════════
    # H-RMCE-03: Relative Volume Confirmation
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("H-RMCE-03: RELATIVE VOLUME CONFIRMATION")
    print("="*70)

    results_03 = {}
    for pattern in ['breakout', 'pullback', 'flag', 'compression']:
        without, with_rv = run_relvol_test(df, pattern=pattern, rel_vol_thresh=1.3)
        m_without = calc_metrics(without); m_with = calc_metrics(with_rv)
        results_03[pattern] = {'without': m_without, 'with': m_with}
        pf_change = (m_with['pf']/m_without['pf'] - 1)*100 if m_without.get('pf',0) > 0 else 0
        n_change  = (m_with.get('n',0)/m_without.get('n',1) - 1)*100
        print(f"\n  Pattern: {pattern.upper()}")
        print(f"    Without RelVol: N={m_without.get('n',0):4d}  PF={m_without.get('pf',0):.3f}  Net=${m_without.get('net',0):,.0f}")
        print(f"    With RelVol>1.3: N={m_with.get('n',0):4d}  PF={m_with.get('pf',0):.3f}  Net=${m_with.get('net',0):,.0f}")
        print(f"    PF change: {pf_change:+.1f}%  N change: {n_change:+.1f}%")

    # ═══════════════════════════════════════════════════════════════════════════
    # H-RMCE-01: AM Volatility Breakout
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("H-RMCE-01: AM VOLATILITY BREAKOUT")
    print("="*70)

    # Test parameter sweep
    am_results = {}
    for atr_t in [1.1, 1.2, 1.3]:
        for rv_t in [1.1, 1.2, 1.3]:
            trades = run_am_breakout(df, atr_accel_thresh=atr_t, rel_vol_thresh=rv_t)
            m = calc_metrics(trades)
            am_results[(atr_t, rv_t)] = m
            print(f"  ATR_accel>{atr_t}  RelVol>{rv_t}: N={m.get('n',0):4d}  PF={m.get('pf',0):.3f}  Net=${m.get('net',0):,.0f}  WR={m.get('wr',0)}%")

    # Best configuration
    best_key = max(am_results.keys(), key=lambda k: am_results[k].get('pf', 0) if am_results[k].get('n', 0) >= 30 else 0)
    best_am = am_results[best_key]
    print(f"\n  Best configuration: ATR_accel>{best_key[0]}, RelVol>{best_key[1]}")
    print(f"  N={best_am.get('n',0)}  PF={best_am.get('pf',0):.3f}  Net=${best_am.get('net',0):,.0f}  WR={best_am.get('wr',0)}%")

    # Full validation of best AM config
    am_trades = run_am_breakout(df, atr_accel_thresh=best_key[0], rel_vol_thresh=best_key[1])
    am_wf = walk_forward(am_trades)
    am_mc = monte_carlo(am_trades)
    print(f"\n  Walk-Forward: {sum(1 for w in am_wf if w['pf'] > 1.0)}/{len(am_wf)} positive periods")
    for w in am_wf:
        print(f"    Period {w['period']}: PF={w['pf']:.3f}  Net=${w['net']:,.0f}  N={w['n']}")
    print(f"  MC Pass Rate (Topstep 50K): {am_mc:.1f}%")

    # ═══════════════════════════════════════════════════════════════════════════
    # Charts
    # ═══════════════════════════════════════════════════════════════════════════
    print("\nGenerating charts...")
    fig = plt.figure(figsize=(20, 16))
    fig.patch.set_facecolor('#0d1117')
    gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

    # Chart 1: H-RMCE-02 PF comparison
    ax1 = fig.add_subplot(gs[0, :])
    ax1.set_facecolor('#161b22')
    models = ['A1', 'A2', 'A3']
    x = np.arange(len(models)); w = 0.35
    base_pfs = [results_02[m]['base']['pf'] for m in models]
    filt_pfs = [results_02[m]['filtered']['pf'] for m in models]
    bars1 = ax1.bar(x - w/2, base_pfs, w, label='Baseline', color='#6b7280', alpha=0.85)
    bars2 = ax1.bar(x + w/2, filt_pfs, w, label='+ ATR Acceleration Filter', color='#3b82f6', alpha=0.85)
    ax1.axhline(1.0, color='white', linestyle='--', linewidth=1, alpha=0.5)
    ax1.axhline(1.2, color='#10b981', linestyle='--', linewidth=1, alpha=0.5)
    ax1.set_xticks(x); ax1.set_xticklabels([f'Model {m}' for m in models], color='white', fontsize=11)
    ax1.set_ylabel('Profit Factor', color='white')
    ax1.set_title('H-RMCE-02: ATR Acceleration Filter — Profit Factor Impact on All Models', color='white', fontweight='bold')
    ax1.tick_params(colors='white')
    ax1.spines['bottom'].set_color('#30363d'); ax1.spines['left'].set_color('#30363d')
    ax1.spines['top'].set_visible(False); ax1.spines['right'].set_visible(False)
    ax1.legend(fontsize=10, facecolor='#161b22', labelcolor='white')
    for bar in bars1: ax1.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.01, f'{bar.get_height():.3f}', ha='center', va='bottom', color='white', fontsize=9)
    for bar in bars2: ax1.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.01, f'{bar.get_height():.3f}', ha='center', va='bottom', color='#3b82f6', fontsize=9)

    # Chart 2: H-RMCE-03 RelVol PF comparison
    ax2 = fig.add_subplot(gs[1, :2])
    ax2.set_facecolor('#161b22')
    patterns = ['breakout', 'pullback', 'flag', 'compression']
    x2 = np.arange(len(patterns))
    wo_pfs = [results_03[p]['without'].get('pf', 0) for p in patterns]
    wi_pfs = [results_03[p]['with'].get('pf', 0) for p in patterns]
    ax2.bar(x2 - w/2, wo_pfs, w, label='Without RelVol', color='#6b7280', alpha=0.85)
    ax2.bar(x2 + w/2, wi_pfs, w, label='RelVol > 1.3', color='#f59e0b', alpha=0.85)
    ax2.axhline(1.0, color='white', linestyle='--', linewidth=1, alpha=0.5)
    ax2.axhline(1.2, color='#10b981', linestyle='--', linewidth=1, alpha=0.5)
    ax2.set_xticks(x2); ax2.set_xticklabels([p.capitalize() for p in patterns], color='white')
    ax2.set_ylabel('Profit Factor', color='white')
    ax2.set_title('H-RMCE-03: Relative Volume Confirmation by Pattern Type', color='white', fontweight='bold')
    ax2.tick_params(colors='white')
    ax2.spines['bottom'].set_color('#30363d'); ax2.spines['left'].set_color('#30363d')
    ax2.spines['top'].set_visible(False); ax2.spines['right'].set_visible(False)
    ax2.legend(fontsize=9, facecolor='#161b22', labelcolor='white')

    # Chart 3: H-RMCE-01 AM Breakout walk-forward
    ax3 = fig.add_subplot(gs[1, 2])
    ax3.set_facecolor('#161b22')
    if am_wf:
        periods = [f"P{w['period']}" for w in am_wf]
        pfs = [w['pf'] for w in am_wf]
        colors = ['#10b981' if p > 1.0 else '#ef4444' for p in pfs]
        ax3.bar(periods, pfs, color=colors, alpha=0.85)
        ax3.axhline(1.0, color='white', linestyle='--', linewidth=1)
        ax3.set_ylabel('Profit Factor', color='white')
        ax3.set_title('H-RMCE-01: AM Breakout Walk-Forward', color='white', fontweight='bold')
        ax3.tick_params(colors='white')
        ax3.spines['bottom'].set_color('#30363d'); ax3.spines['left'].set_color('#30363d')
        ax3.spines['top'].set_visible(False); ax3.spines['right'].set_visible(False)

    # Chart 4: AM Breakout equity curve
    ax4 = fig.add_subplot(gs[2, :])
    ax4.set_facecolor('#161b22')
    if am_trades:
        equity = np.cumsum([0] + [t['pnl'] for t in am_trades])
        ax4.plot(equity, color='#a855f7', linewidth=1.5, label=f'H-RMCE-01 AM Breakout (N={len(am_trades)}, PF={best_am.get("pf",0):.3f})')
        ax4.axhline(0, color='white', linestyle='--', linewidth=0.5, alpha=0.5)
        ax4.fill_between(range(len(equity)), equity, 0, where=(np.array(equity) > 0), alpha=0.15, color='#10b981')
        ax4.fill_between(range(len(equity)), equity, 0, where=(np.array(equity) < 0), alpha=0.15, color='#ef4444')
        ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
        ax4.set_title('H-RMCE-01: AM Volatility Breakout — Equity Curve', color='white', fontweight='bold')
        ax4.tick_params(colors='white')
        ax4.spines['bottom'].set_color('#30363d'); ax4.spines['left'].set_color('#30363d')
        ax4.spines['top'].set_visible(False); ax4.spines['right'].set_visible(False)
        ax4.legend(fontsize=9, facecolor='#161b22', labelcolor='white')

    fig.suptitle('Sprint 046 — RMCE Validation Programme', color='white', fontsize=14, fontweight='bold', y=0.98)
    chart_path = CHART_DIR / 'sprint_046_rmce_validation.png'
    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close()
    print(f"  Chart saved: {chart_path}")

    # ═══════════════════════════════════════════════════════════════════════════
    # Summary
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SPRINT 046 SUMMARY")
    print("="*70)
    print("\nH-RMCE-02 (ATR Acceleration Filter):")
    for m in models:
        b = results_02[m]['base']; f = results_02[m]['filtered']
        change = (f['pf']/b['pf']-1)*100 if b['pf'] > 0 else 0
        verdict = "IMPROVES" if change > 3 else ("NEUTRAL" if abs(change) <= 3 else "DEGRADES")
        print(f"  Model {m}: PF {b['pf']:.3f} → {f['pf']:.3f} ({change:+.1f}%) — {verdict}")

    print("\nH-RMCE-03 (Relative Volume Confirmation):")
    for p in patterns:
        wo = results_03[p]['without']; wi = results_03[p]['with']
        change = (wi.get('pf',0)/wo.get('pf',1)-1)*100 if wo.get('pf',0) > 0 else 0
        verdict = "IMPROVES" if change > 3 else ("NEUTRAL" if abs(change) <= 3 else "DEGRADES")
        print(f"  {p.capitalize()}: PF {wo.get('pf',0):.3f} → {wi.get('pf',0):.3f} ({change:+.1f}%) — {verdict}")

    print(f"\nH-RMCE-01 (AM Volatility Breakout):")
    print(f"  Best config: ATR_accel>{best_key[0]}, RelVol>{best_key[1]}")
    print(f"  N={best_am.get('n',0)}, PF={best_am.get('pf',0):.3f}, Net=${best_am.get('net',0):,.0f}")
    print(f"  WF positive periods: {sum(1 for w in am_wf if w['pf']>1.0)}/{len(am_wf)}")
    print(f"  MC Pass Rate: {am_mc:.1f}%")

    return results_02, results_03, best_am, am_wf, am_mc, best_key

if __name__ == '__main__':
    results_02, results_03, best_am, am_wf, am_mc, best_key = main()
    print("\n=== SPRINT 046 VALIDATION COMPLETE ===")
