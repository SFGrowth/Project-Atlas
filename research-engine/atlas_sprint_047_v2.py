"""
Atlas Research Engine — Sprint 047 v2
Production Engineering (Corrected Trade Generators)

Uses the exact validated trade generators from Sprints 025, 037, 042.
Primary KPI: Topstep 50K MC Pass Rate >= 75%.
"""

import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

DATA_PATH  = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
CHART_DIR  = Path("/home/ubuntu/Project-Atlas/research/sprint-047-charts")
CHART_DIR.mkdir(parents=True, exist_ok=True)
MNQ_PV     = 2.0
TICK_SIZE  = 0.25

PROP_FIRMS = {
    'Topstep_50K': {'account': 50000, 'profit_target': 3000, 'max_dd': 2000, 'daily_limit': 1000},
    'Apex_50K':    {'account': 50000, 'profit_target': 3000, 'max_dd': 2500, 'daily_limit': 1000},
    'Generic_50K': {'account': 50000, 'profit_target': 2500, 'max_dd': 2000, 'daily_limit': 800},
}

# ─── Data Loading ─────────────────────────────────────────────────────────────
def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts']     = pd.to_datetime(df['timestamp_et'], utc=True)
    df           = df.sort_values('ts').reset_index(drop=True)
    df['date']   = df['ts'].dt.date
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['quarter']= df['ts'].dt.to_period('Q').astype(str)

    df['is_rth'] = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    df['is_overnight'] = ~df['is_rth']

    pc   = df['close'].shift(1)
    tr   = np.maximum(df['high']-df['low'],
           np.maximum((df['high']-pc).abs(), (df['low']-pc).abs()))
    df['tr']    = tr
    df['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df['atr14'] = tr.rolling(14, min_periods=1).mean()
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()

    df['uptrend']   = (df['ema9'] > df['ema21']) & (df['ema21'] > df['ema50'])
    df['downtrend'] = (df['ema9'] < df['ema21']) & (df['ema21'] < df['ema50'])

    # A1 features
    prev_close = df['close'].shift(1)
    df['pb_long_touch']  = (prev_close > df['ema21']) & (df['close'] <= df['ema21'] * 1.001)
    df['pb_short_touch'] = (prev_close < df['ema21']) & (df['close'] >= df['ema21'] * 0.999)
    df['swing_high_10']  = df['high'].shift(1).rolling(10, min_periods=1).max()
    df['swing_low_10']   = df['low'].shift(1).rolling(10, min_periods=1).min()
    df['pb_depth_long']  = (df['swing_high_10'] - df['close']) / df['atr14'].replace(0, np.nan)
    df['pb_depth_short'] = (df['close'] - df['swing_low_10'])  / df['atr14'].replace(0, np.nan)

    # ADX
    df['adx'] = compute_adx(df, 14)

    # A2 features
    bar_move = (df['high'] - df['low']).values
    atr14v   = df['atr14'].values
    n = len(df)
    flag_sig = np.zeros(n)
    for i in range(10, n):
        prior_impulse = any(bar_move[max(0,i-10):i] > 1.5 * atr14v[i])
        consol_len = 0
        for j in range(i-1, max(i-9, 0), -1):
            if bar_move[j] < 0.7 * atr14v[j]: consol_len += 1
            else: break
        if prior_impulse and 3 <= consol_len <= 8:
            flag_sig[i] = 1
    df['flag_signal'] = flag_sig
    df['hi10'] = df['high'].rolling(10, min_periods=1).max().shift(1)
    df['lo10'] = df['low'].rolling(10,  min_periods=1).min().shift(1)

    # A3 features
    hi20 = df['high'].rolling(20, min_periods=1).max().values
    lo20 = df['low'].rolling(20,  min_periods=1).min().values
    df['compression_20'] = np.where(atr14v > 0, (hi20-lo20)/atr14v, 0)

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

# ─── Validated Trade Generators ───────────────────────────────────────────────
def precompute_expansion(atr5, lookback=20, ratio=1.8):
    n = len(atr5); sig = np.zeros(n, dtype=bool)
    for i in range(lookback, n):
        if atr5[i-lookback] > 0:
            sig[i] = atr5[i] / atr5[i-lookback] > ratio
    return sig

def sim_trade_exit(close, high, low, is_rth, entry_idx, direction, stop_pts, target_pts, max_bars=300):
    """Returns (pnl_points, bars_held, exit_type)."""
    entry = close[entry_idx]
    stop   = entry - direction * stop_pts
    target = entry + direction * target_pts
    n = len(close)
    for i in range(entry_idx+1, min(entry_idx+max_bars, n)):
        if not is_rth[i]:
            return direction * (close[i-1] - entry), i - entry_idx, 'EOD'
        if direction == 1:
            if low[i]  <= stop:  return -(stop_pts),  i - entry_idx, 'STOP'
            if high[i] >= target: return target_pts,  i - entry_idx, 'TARGET'
        else:
            if high[i] >= stop:  return -(stop_pts),  i - entry_idx, 'STOP'
            if low[i]  <= target: return target_pts,  i - entry_idx, 'TARGET'
    return direction * (close[min(entry_idx+max_bars-1, n-1)] - entry), max_bars, 'TIMEOUT'

def generate_a1_trades(df):
    """Exact Sprint 025 Model A1 logic."""
    close  = df['close'].values; high = df['high'].values; low = df['low'].values
    is_rth = df['is_rth'].values; atr14 = df['atr14'].values
    uptrend = df['uptrend'].values; downtrend = df['downtrend'].values
    pb_lt  = df['pb_long_touch'].values; pb_st = df['pb_short_touch'].values
    pb_dl  = df['pb_depth_long'].values; pb_ds = df['pb_depth_short'].values
    atr5   = df['atr5'].values; adx = df['adx'].values
    exp_sig = precompute_expansion(atr5)
    n = len(df); trades = []; i = 0
    while i < n - 1:
        if not is_rth[i] or np.isnan(atr14[i]) or atr14[i] == 0 or not exp_sig[i]:
            i += 1; continue
        # Session filter: 13:00-16:00 ET
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (1300 <= t < 1600):
            i += 1; continue
        # ADX filter: low ADX regime
        if adx[i] >= 30:
            i += 1; continue
        direction = None
        if uptrend[i] and pb_lt[i]:
            d = pb_dl[i]
            if not np.isnan(d) and 0.5 <= d <= 1.2: direction = 1
        if direction is None and downtrend[i] and pb_st[i]:
            d = pb_ds[i]
            if not np.isnan(d) and 0.5 <= d <= 1.2: direction = -1
        if direction is None:
            i += 1; continue
        stop_pts = 1.0 * atr14[i]
        if stop_pts <= 0: i += 1; continue
        pnl_pts, bars, exit_type = sim_trade_exit(close, high, low, is_rth, i, direction, stop_pts, 2.0*stop_pts)
        pnl_dollars = pnl_pts * MNQ_PV - 1.0  # commission
        trades.append({'pnl': pnl_dollars, 'model': 'A1', 'date': df['date'].iloc[i],
                       'time': t, 'session': 'PM', 'priority': 3,
                       'stop_pts': stop_pts, 'direction': direction, 'bar': i})
        i += bars
    return trades

def generate_a2_trades(df):
    """Exact Sprint 042 Model A2 logic."""
    close  = df['close'].values; high = df['high'].values; low = df['low'].values
    is_rth = df['is_rth'].values; atr14 = df['atr14'].values
    adx    = df['adx'].values
    uptrend = df['uptrend'].values; downtrend = df['downtrend'].values
    flag_sig = df['flag_signal'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    n = len(df); trades = []; i = 0
    while i < n - 1:
        if not is_rth[i] or np.isnan(atr14[i]) or atr14[i] == 0:
            i += 1; continue
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        if not (1400 <= t < 1600):
            i += 1; continue
        if adx[i] < 45 or flag_sig[i] != 1:
            i += 1; continue
        direction = None
        if close[i] > hi10[i] and uptrend[i]:   direction = 1
        if close[i] < lo10[i] and downtrend[i]: direction = -1
        if direction is None:
            i += 1; continue
        stop_pts = 1.0 * atr14[i]
        if stop_pts <= 0: i += 1; continue
        pnl_pts, bars, exit_type = sim_trade_exit(close, high, low, is_rth, i, direction, stop_pts, 2.0*stop_pts)
        pnl_dollars = pnl_pts * MNQ_PV - 1.0
        trades.append({'pnl': pnl_dollars, 'model': 'A2', 'date': df['date'].iloc[i],
                       'time': t, 'session': 'LATE_PM', 'priority': 2,
                       'stop_pts': stop_pts, 'direction': direction, 'bar': i})
        i += bars
    return trades

def generate_a3_trades(df):
    """Exact Sprint 037 Model A3 logic."""
    close  = df['close'].values; high = df['high'].values; low = df['low'].values
    is_rth = df['is_rth'].values; atr14 = df['atr14'].values
    adx    = df['adx'].values
    uptrend = df['uptrend'].values; downtrend = df['downtrend'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    compression = df['compression_20'].values
    n = len(df); trades = []; i = 0
    while i < n - 1:
        if is_rth[i] or np.isnan(atr14[i]) or atr14[i] == 0:
            i += 1; continue
        if adx[i] < 25 or compression[i] > 2.5:
            i += 1; continue
        direction = None
        if close[i] > hi10[i] and uptrend[i]:   direction = 1
        if close[i] < lo10[i] and downtrend[i]: direction = -1
        if direction is None:
            i += 1; continue
        stop_pts = 1.0 * atr14[i]
        if stop_pts <= 0: i += 1; continue
        # A3 exits at RTH open (is_rth transition)
        pnl_pts, bars, exit_type = sim_trade_exit(close, high, low, is_rth, i, direction, stop_pts, 2.0*stop_pts, max_bars=200)
        pnl_dollars = pnl_pts * MNQ_PV - 1.0
        t = df['hour'].iloc[i]*100 + df['minute'].iloc[i]
        trades.append({'pnl': pnl_dollars, 'model': 'A3', 'date': df['date'].iloc[i],
                       'time': t, 'session': 'OVERNIGHT', 'priority': 1,
                       'stop_pts': stop_pts, 'direction': direction, 'bar': i})
        i += bars
    return trades

# ─── Portfolio Execution Engine ───────────────────────────────────────────────
def run_portfolio_policy(all_trades, config):
    """
    Apply execution policy to pre-generated individual model trades.
    Handles: Priority Queue, SAS, daily limits, milestone compounding.
    """
    base_risk          = config.get('base_risk', 800)
    policy             = config.get('policy', 'priority_queue')
    milestone_step     = config.get('milestone_step', 0)
    milestone_risk_add = config.get('milestone_risk_add', 200)
    milestone_max_risk = config.get('milestone_max_risk', 2000)
    daily_limit        = config.get('daily_limit', 1000)
    recovery_limit     = config.get('recovery_mode_limit', daily_limit)
    session_override   = config.get('session_risk_override', {})

    # Sort all trades by date then bar index
    sorted_trades = sorted(all_trades, key=lambda t: (t['date'], t['bar']))

    # Group by date
    by_date = defaultdict(list)
    for t in sorted_trades:
        by_date[t['date']].append(t)

    result_trades = []
    cumulative_pnl = 0.0
    milestones_hit = 0
    current_risk = base_risk

    for date in sorted(by_date.keys()):
        day_trades = by_date[date]
        daily_pnl  = 0.0
        daily_halted = False

        # Update risk milestones
        if milestone_step > 0:
            new_milestones = int(max(0, cumulative_pnl) / milestone_step)
            if new_milestones > milestones_hit:
                milestones_hit = new_milestones
                current_risk = min(base_risk + milestones_hit * milestone_risk_add, milestone_max_risk)

        # Sort by priority within day
        if policy == 'priority_queue':
            day_trades = sorted(day_trades, key=lambda t: (t['bar'], t['priority']))
        else:
            day_trades = sorted(day_trades, key=lambda t: t['bar'])

        last_bar_end = -1  # for SAS

        for trade in day_trades:
            if daily_halted: break
            if daily_pnl <= -recovery_limit: daily_halted = True; break

            # SAS: skip if a trade is still active
            if policy == 'sas' and trade['bar'] <= last_bar_end:
                continue

            # Scale risk
            risk = current_risk
            sess = trade['session']
            if sess in session_override:
                risk = current_risk * session_override[sess]
            risk = max(200, min(risk, milestone_max_risk))

            # Scale P&L from base $800 to target risk
            base_stop_dollars = trade['stop_pts'] * MNQ_PV
            if base_stop_dollars <= 0:
                continue
            scale = risk / 800.0  # scale relative to $800 base
            scaled_pnl = trade['pnl'] * scale

            daily_pnl      += scaled_pnl
            cumulative_pnl += scaled_pnl
            last_bar_end    = trade['bar'] + 30

            result_trades.append({
                'pnl': scaled_pnl, 'date': date, 'model': trade['model'],
                'session': trade['session'], 'risk': risk,
                'cumulative': cumulative_pnl
            })

    return result_trades

def calc_metrics(trades):
    if not trades: return {}
    pnl = [t['pnl'] for t in trades]
    wins = [p for p in pnl if p > 0]; losses = [p for p in pnl if p < 0]
    gp = sum(wins); gl = abs(sum(losses))
    pf = gp/gl if gl > 0 else (999 if gp > 0 else 0)
    net = sum(pnl)
    equity = np.cumsum([0] + pnl)
    peak = np.maximum.accumulate(equity)
    dd = equity - peak; max_dd = dd.min()
    romd = abs(net/max_dd) if max_dd < 0 else 0
    monthly = {}
    for t in trades:
        key = str(t['date'])[:7]
        monthly[key] = monthly.get(key, 0) + t['pnl']
    monthly_pct = sum(1 for v in monthly.values() if v > 0) / len(monthly) if monthly else 0
    return {'n': len(trades), 'pf': round(pf,3), 'net': round(net,2),
            'wr': round(len(wins)/len(trades)*100,1),
            'max_dd': round(max_dd,2), 'romd': round(romd,3),
            'monthly_pct': round(monthly_pct*100,1),
            'expectancy': round(net/len(trades),2)}

def monte_carlo_prop(trades, firm_config, n_sims=3000):
    if not trades: return 0.0, 0
    pnl_arr = np.array([t['pnl'] for t in trades])
    pt = firm_config['profit_target']; mdd = firm_config['max_dd']; dl = firm_config['daily_limit']
    passes = 0; days_list = []
    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        equity = 0.0; peak = 0.0; max_dd_seen = 0.0
        daily_pnl = 0.0; cur_day = 0; day_count = 0
        failed = False; passed = False
        for idx, p in enumerate(shuffled):
            td = idx // 3
            if td != cur_day:
                daily_pnl = 0.0; cur_day = td; day_count += 1
            equity += p; daily_pnl += p
            peak = max(peak, equity); max_dd_seen = max(max_dd_seen, peak-equity)
            if daily_pnl < -dl or max_dd_seen > mdd:
                failed = True; break
            if equity >= pt:
                passed = True; days_list.append(day_count); break
        if passed: passes += 1
    avg_days = int(np.mean(days_list)) if days_list else 0
    return passes/n_sims*100, avg_days

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars")

    print("Generating validated model trade streams...")
    a1_trades = generate_a1_trades(df)
    a2_trades = generate_a2_trades(df)
    a3_trades = generate_a3_trades(df)
    all_trades = a1_trades + a2_trades + a3_trades
    print(f"  A1={len(a1_trades)}, A2={len(a2_trades)}, A3={len(a3_trades)}, Total={len(all_trades)}")

    # Standalone metrics
    for name, trd in [('A1', a1_trades), ('A2', a2_trades), ('A3', a3_trades)]:
        m = calc_metrics(trd)
        print(f"  Standalone {name}: N={m.get('n',0)}, PF={m.get('pf',0)}, Net=${m.get('net',0):,.0f}")

    results = {}

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. BASELINE: Priority Queue @ $800
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("1. BASELINE: Priority Queue @ $800")
    cfg_base = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000}
    t_base = run_portfolio_policy(all_trades, cfg_base)
    m_base = calc_metrics(t_base)
    mc_base, days_base = monte_carlo_prop(t_base, PROP_FIRMS['Topstep_50K'])
    results['Baseline'] = {'metrics': m_base, 'mc': mc_base, 'days': days_base, 'trades': t_base}
    print(f"  N={m_base['n']}  PF={m_base['pf']}  Net=${m_base['net']:,.0f}  MaxDD=${m_base['max_dd']:,.0f}")
    print(f"  MC Pass (Topstep): {mc_base:.1f}%  Avg Days: {days_base}")

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. MILESTONE COMPOUNDING SWEEP
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("2. MILESTONE COMPOUNDING SWEEP")
    best_mc = mc_base; best_ms_cfg = None; best_ms_trades = None; best_ms_m = None
    for step in [500, 750, 1000, 1500]:
        for add in [200, 300, 400]:
            for max_r in [1200, 1600, 2000]:
                cfg = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000,
                       'milestone_step': step, 'milestone_risk_add': add, 'milestone_max_risk': max_r}
                t = run_portfolio_policy(all_trades, cfg)
                m = calc_metrics(t)
                mc, days = monte_carlo_prop(t, PROP_FIRMS['Topstep_50K'])
                if mc > best_mc and m.get('pf', 0) >= 1.10:
                    best_mc = mc; best_ms_cfg = cfg.copy(); best_ms_trades = t
                    best_ms_m = m; best_ms_days = days
    if best_ms_cfg:
        print(f"  Best: step=${best_ms_cfg['milestone_step']}, add=${best_ms_cfg['milestone_risk_add']}, max=${best_ms_cfg['milestone_max_risk']}")
        print(f"  MC={best_mc:.1f}%  PF={best_ms_m['pf']}  Net=${best_ms_m['net']:,.0f}  Days={best_ms_days}")
        results['Milestone'] = {'metrics': best_ms_m, 'mc': best_mc, 'days': best_ms_days,
                                 'trades': best_ms_trades, 'config': best_ms_cfg}
    else:
        print(f"  No improvement over baseline ({mc_base:.1f}%)")
        results['Milestone'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. DAILY LOSS MANAGEMENT SWEEP
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("3. DAILY LOSS MANAGEMENT SWEEP")
    best_dlm_mc = mc_base; best_dlm_cfg = None; best_dlm_trades = None; best_dlm_m = None
    for dl in [600, 700, 800, 900, 1000]:
        for rl in [300, 400, 500, 600]:
            if rl >= dl: continue
            cfg = {'base_risk': 800, 'policy': 'priority_queue',
                   'daily_limit': dl, 'recovery_mode_limit': rl}
            t = run_portfolio_policy(all_trades, cfg)
            m = calc_metrics(t)
            mc, days = monte_carlo_prop(t, PROP_FIRMS['Topstep_50K'], n_sims=1000)
            if mc > best_dlm_mc and m.get('pf', 0) >= 1.10:
                best_dlm_mc = mc; best_dlm_cfg = cfg.copy(); best_dlm_trades = t
                best_dlm_m = m; best_dlm_days = days
    if best_dlm_cfg:
        print(f"  Best: daily_limit=${best_dlm_cfg['daily_limit']}, recovery=${best_dlm_cfg['recovery_mode_limit']}")
        print(f"  MC={best_dlm_mc:.1f}%  PF={best_dlm_m['pf']}  Net=${best_dlm_m['net']:,.0f}  Days={best_dlm_days}")
        results['DLM'] = {'metrics': best_dlm_m, 'mc': best_dlm_mc, 'days': best_dlm_days,
                           'trades': best_dlm_trades, 'config': best_dlm_cfg}
    else:
        print(f"  No improvement over baseline ({mc_base:.1f}%)")
        results['DLM'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. LOWER BASE RISK SWEEP (prop firm compliance focus)
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("4. LOWER BASE RISK SWEEP")
    best_lr_mc = mc_base; best_lr_cfg = None; best_lr_trades = None; best_lr_m = None
    for br in [300, 400, 500, 600]:
        for step in [500, 750, 1000]:
            for add in [100, 200, 300]:
                for max_r in [800, 1200, 1600]:
                    cfg = {'base_risk': br, 'policy': 'priority_queue', 'daily_limit': 1000,
                           'milestone_step': step, 'milestone_risk_add': add, 'milestone_max_risk': max_r}
                    t = run_portfolio_policy(all_trades, cfg)
                    m = calc_metrics(t)
                    mc, days = monte_carlo_prop(t, PROP_FIRMS['Topstep_50K'], n_sims=1000)
                    if mc > best_lr_mc and m.get('pf', 0) >= 1.10:
                        best_lr_mc = mc; best_lr_cfg = cfg.copy(); best_lr_trades = t
                        best_lr_m = m; best_lr_days = days
    if best_lr_cfg:
        print(f"  Best: base=${best_lr_cfg['base_risk']}, step=${best_lr_cfg['milestone_step']}, "
              f"add=${best_lr_cfg['milestone_risk_add']}, max=${best_lr_cfg['milestone_max_risk']}")
        print(f"  MC={best_lr_mc:.1f}%  PF={best_lr_m['pf']}  Net=${best_lr_m['net']:,.0f}  Days={best_lr_days}")
        results['LowRisk'] = {'metrics': best_lr_m, 'mc': best_lr_mc, 'days': best_lr_days,
                               'trades': best_lr_trades, 'config': best_lr_cfg}
    else:
        print(f"  No improvement over baseline ({mc_base:.1f}%)")
        results['LowRisk'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. ATS v2.0: BEST COMBINED CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("5. ATS v2.0: BEST COMBINED CONFIGURATION")

    # Find best overall
    best_overall_mc = 0; best_overall_key = 'Baseline'
    for key in ['Baseline', 'Milestone', 'DLM', 'LowRisk']:
        if results[key]['mc'] > best_overall_mc:
            best_overall_mc = results[key]['mc']
            best_overall_key = key

    # Try combining best milestone + best DLM
    if 'config' in results.get('Milestone', {}) and 'config' in results.get('DLM', {}):
        combined_cfg = results['Milestone']['config'].copy()
        combined_cfg['daily_limit'] = results['DLM']['config']['daily_limit']
        combined_cfg['recovery_mode_limit'] = results['DLM']['config']['recovery_mode_limit']
        t_comb = run_portfolio_policy(all_trades, combined_cfg)
        m_comb = calc_metrics(t_comb)
        mc_comb, days_comb = monte_carlo_prop(t_comb, PROP_FIRMS['Topstep_50K'])
        print(f"  Combined (Milestone+DLM): MC={mc_comb:.1f}%  PF={m_comb['pf']}  Net=${m_comb['net']:,.0f}")
        if mc_comb > best_overall_mc and m_comb.get('pf', 0) >= 1.10:
            best_overall_mc = mc_comb; best_overall_key = 'Combined'
            results['Combined'] = {'metrics': m_comb, 'mc': mc_comb, 'days': days_comb,
                                    'trades': t_comb, 'config': combined_cfg}

    final_result = results.get(best_overall_key, results['Baseline'])
    final_trades = final_result['trades']
    final_m      = final_result['metrics']
    final_mc     = final_result['mc']
    final_days   = final_result['days']

    print(f"\n  ATS v2.0 Selected: {best_overall_key}")
    print(f"  MC Pass (Topstep): {final_mc:.1f}%  PF={final_m['pf']}  Net=${final_m['net']:,.0f}  MaxDD=${final_m['max_dd']:,.0f}")

    # Full prop firm suite
    print(f"\n  Full Prop Firm Suite:")
    for firm_name, firm_cfg in PROP_FIRMS.items():
        mc_r, days_r = monte_carlo_prop(final_trades, firm_cfg)
        print(f"    {firm_name}: MC={mc_r:.1f}%  Avg Days={days_r}")

    # ═══════════════════════════════════════════════════════════════════════════
    # Charts
    # ═══════════════════════════════════════════════════════════════════════════
    print("\nGenerating charts...")
    fig = plt.figure(figsize=(20, 16))
    fig.patch.set_facecolor('#0d1117')
    gs = gridspec.GridSpec(3, 2, figure=fig, hspace=0.45, wspace=0.35)

    config_keys  = ['Baseline', 'Milestone', 'DLM', 'LowRisk']
    display_names = ['Baseline\n(Policy C)', 'Milestone\nCompounding', 'Daily Loss\nManagement', 'Lower Base\nRisk']
    mc_vals  = [results[k]['mc'] for k in config_keys]
    pf_vals  = [results[k]['metrics'].get('pf', 0) for k in config_keys]
    net_vals = [results[k]['metrics'].get('net', 0) for k in config_keys]
    colors   = ['#6b7280', '#3b82f6', '#10b981', '#f59e0b']

    ax1 = fig.add_subplot(gs[0, :])
    ax1.set_facecolor('#161b22')
    bars = ax1.bar(display_names, mc_vals, color=colors, alpha=0.85, width=0.55)
    ax1.axhline(75, color='#ef4444', linestyle='--', linewidth=2, label='Target: 75%')
    ax1.axhline(mc_base, color='#6b7280', linestyle=':', linewidth=1.5, alpha=0.7,
                label=f'Sprint 044 Reference: {mc_base:.1f}%')
    for bar, val in zip(bars, mc_vals):
        ax1.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5, f'{val:.1f}%',
                 ha='center', va='bottom', color='white', fontsize=12, fontweight='bold')
    ax1.set_ylabel('Topstep 50K MC Pass Rate (%)', color='white', fontsize=11)
    ax1.set_title('Sprint 047 — Production Engineering: MC Pass Rate by Configuration', color='white', fontweight='bold', fontsize=13)
    ax1.tick_params(colors='white'); ax1.set_ylim(0, 100)
    ax1.spines['bottom'].set_color('#30363d'); ax1.spines['left'].set_color('#30363d')
    ax1.spines['top'].set_visible(False); ax1.spines['right'].set_visible(False)
    ax1.legend(fontsize=10, facecolor='#161b22', labelcolor='white')

    ax2 = fig.add_subplot(gs[1, 0])
    ax2.set_facecolor('#161b22')
    ax2.bar(display_names, pf_vals, color=colors, alpha=0.85)
    ax2.axhline(1.2, color='#10b981', linestyle='--', linewidth=1.5)
    ax2.axhline(1.0, color='white', linestyle='--', linewidth=0.8, alpha=0.4)
    ax2.set_ylabel('Profit Factor', color='white')
    ax2.set_title('Profit Factor by Configuration', color='white', fontweight='bold')
    ax2.tick_params(colors='white')
    ax2.spines['bottom'].set_color('#30363d'); ax2.spines['left'].set_color('#30363d')
    ax2.spines['top'].set_visible(False); ax2.spines['right'].set_visible(False)
    for i, v in enumerate(pf_vals):
        ax2.text(i, v+0.005, f'{v:.3f}', ha='center', va='bottom', color='white', fontsize=9)

    ax3 = fig.add_subplot(gs[1, 1])
    ax3.set_facecolor('#161b22')
    bc = ['#10b981' if v > 0 else '#ef4444' for v in net_vals]
    ax3.bar(display_names, net_vals, color=bc, alpha=0.85)
    ax3.axhline(0, color='white', linestyle='--', linewidth=0.5)
    ax3.set_ylabel('Net P&L ($)', color='white')
    ax3.set_title('Net P&L by Configuration', color='white', fontweight='bold')
    ax3.tick_params(colors='white')
    ax3.spines['bottom'].set_color('#30363d'); ax3.spines['left'].set_color('#30363d')
    ax3.spines['top'].set_visible(False); ax3.spines['right'].set_visible(False)

    ax4 = fig.add_subplot(gs[2, :])
    ax4.set_facecolor('#161b22')
    if final_trades:
        equity = np.cumsum([0] + [t['pnl'] for t in final_trades])
        ax4.plot(equity, color='#a855f7', linewidth=1.5,
                 label=f'ATS v2.0 ({best_overall_key}) — N={final_m["n"]}, PF={final_m["pf"]:.3f}, MC={final_mc:.1f}%')
        ax4.fill_between(range(len(equity)), equity, 0, where=(equity>=0), alpha=0.12, color='#10b981')
        ax4.fill_between(range(len(equity)), equity, 0, where=(equity<0),  alpha=0.12, color='#ef4444')
        ax4.axhline(0, color='white', linestyle='--', linewidth=0.5, alpha=0.5)
        ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
        ax4.set_title('ATS v2.0 — Equity Curve', color='white', fontweight='bold')
        ax4.tick_params(colors='white')
        ax4.spines['bottom'].set_color('#30363d'); ax4.spines['left'].set_color('#30363d')
        ax4.spines['top'].set_visible(False); ax4.spines['right'].set_visible(False)
        ax4.legend(fontsize=10, facecolor='#161b22', labelcolor='white')

    fig.suptitle('Sprint 047 — Atlas Production Engineering: ATS v2.0', color='white', fontsize=14, fontweight='bold', y=0.98)
    chart_path = CHART_DIR / 'sprint_047_production_engineering.png'
    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close()
    print(f"  Chart saved: {chart_path}")

    # ═══════════════════════════════════════════════════════════════════════════
    # Final Summary
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("SPRINT 047 FINAL SUMMARY")
    print("="*70)
    print(f"\n{'Config':<22} {'MC Pass%':>10} {'PF':>8} {'Net P&L':>12} {'MaxDD':>12} {'Days':>8}")
    print("-"*72)
    for k, dn in [('Baseline','Baseline'), ('Milestone','Milestone'),
                  ('DLM','DLM'), ('LowRisk','LowRisk')]:
        r = results[k]; m = r['metrics']
        print(f"  {dn:<20} {r['mc']:>9.1f}% {m.get('pf',0):>8.3f} ${m.get('net',0):>10,.0f} ${m.get('max_dd',0):>10,.0f} {r['days']:>8}")
    print(f"\n  ATS v2.0 Best Config: {best_overall_key}")
    print(f"  MC Pass Rate: {final_mc:.1f}%  (Target: 75.0%)")
    verdict = "PRODUCTION READY" if final_mc >= 75 else ("NEAR PRODUCTION" if final_mc >= 60 else "EXPERIMENTAL")
    print(f"  Verdict: {verdict}")

    return results, best_overall_key, final_mc, final_m, final_trades

if __name__ == '__main__':
    results, best_key, final_mc, final_m, final_trades = main()
    print("\n=== SPRINT 047 COMPLETE ===")
