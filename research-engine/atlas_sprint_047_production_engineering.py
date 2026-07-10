"""
Atlas Research Engine — Sprint 047
Production Engineering

Objective: Maximise prop firm pass probability using frozen Models A1, A2, A3.
Primary KPI: Topstep 50K Monte Carlo pass rate ≥ 75%.

Engineering components tested:
  1. Baseline: Policy C (Priority Queue) @ $800 — 42.6% pass rate (Sprint 044)
  2. Milestone Compounding — scale risk after profit milestones
  3. Session Risk Allocation — differential risk by session/model
  4. Daily Loss Management — adaptive limits, recovery protocols
  5. ATS v2.0 — all validated components combined
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

DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
CHART_DIR  = Path("/home/ubuntu/Project-Atlas/research/sprint-047-charts")
CHART_DIR.mkdir(parents=True, exist_ok=True)
MNQ_PV = 2.0

# ─── Prop Firm Rules ──────────────────────────────────────────────────────────
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

    hi = df['high'].values; lo = df['low'].values; cl = df['close'].values
    n  = len(cl)
    pc  = np.concatenate([[cl[0]], cl[:-1]])
    tr  = np.maximum(hi-lo, np.maximum(np.abs(hi-pc), np.abs(lo-pc)))
    df['atr14'] = pd.Series(tr).rolling(14, min_periods=1).mean().values
    df['atr5']  = pd.Series(tr).rolling(5,  min_periods=1).mean().values

    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    df['adx']   = compute_adx(df, 14)

    ema9v = df['ema9'].values; ema21v = df['ema21'].values; ema50v = df['ema50'].values
    df['ema_bull'] = (ema9v > ema21v) & (ema21v > ema50v)
    df['ema_bear'] = (ema9v < ema21v) & (ema21v < ema50v)

    atr5 = df['atr5'].values
    vol_exp = np.ones(n)
    for i in range(20, n):
        if atr5[i-20] > 0:
            vol_exp[i] = atr5[i] / atr5[i-20]
    df['vol_exp'] = vol_exp

    swing_depth = np.zeros(n)
    atr14 = df['atr14'].values
    for i in range(20, n):
        if df['ema_bull'].iloc[i]:
            swing_hi = hi[max(0,i-20):i].max()
            swing_depth[i] = (swing_hi - cl[i]) / atr14[i] if atr14[i] > 0 else 0
        elif df['ema_bear'].iloc[i]:
            swing_lo = lo[max(0,i-20):i].min()
            swing_depth[i] = (cl[i] - swing_lo) / atr14[i] if atr14[i] > 0 else 0
    df['swing_depth'] = swing_depth

    hi10 = df['high'].rolling(10, min_periods=1).max().shift(1)
    lo10 = df['low'].rolling(10,  min_periods=1).min().shift(1)
    df['hi10'] = hi10; df['lo10'] = lo10

    bar_move = hi - lo
    flag_signal = np.zeros(n)
    for i in range(10, n):
        prior_impulse = any(bar_move[max(0,i-10):i] > 1.5 * atr14[i])
        consol_len = 0
        for j in range(i-1, max(i-9, 0), -1):
            if bar_move[j] < 0.7 * atr14[j]: consol_len += 1
            else: break
        if prior_impulse and 3 <= consol_len <= 8:
            flag_signal[i] = 1
    df['flag_signal'] = flag_signal

    hi20 = df['high'].rolling(20, min_periods=1).max().values
    lo20 = df['low'].rolling(20,  min_periods=1).min().values
    df['compression_20'] = np.where(atr14 > 0, (hi20-lo20)/atr14, 0)

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

# ─── Individual Model Signal Generators ───────────────────────────────────────
def generate_signals(df):
    """Generate all model signals with metadata. Returns list of signal dicts."""
    signals = []
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    ema21 = df['ema21'].values; vol_exp = df['vol_exp'].values
    swing_depth = df['swing_depth'].values
    ema_bull = df['ema_bull'].values; ema_bear = df['ema_bear'].values
    flag_signal = df['flag_signal'].values
    hi10 = df['hi10'].values; lo10 = df['lo10'].values
    compression = df['compression_20'].values
    n = len(cl)

    for i in range(50, n-2):
        hour = df['hour'].iloc[i]; minute = df['minute'].iloc[i]
        t = hour*100 + minute
        date = df['date'].iloc[i]

        # Model A1: PM pullback, low ADX
        if 1300 <= t < 1600 and adx[i] < 30 and vol_exp[i] >= 1.8 and 0.5 <= swing_depth[i] <= 1.2:
            prev_cl = cl[i-1]
            ema21_touch = (
                (ema_bull[i] and prev_cl > ema21[i] and cl[i] <= ema21[i] * 1.001) or
                (ema_bear[i] and prev_cl < ema21[i] and cl[i] >= ema21[i] * 0.999)
            )
            if ema21_touch:
                direction = 1 if ema_bull[i] else -1
                signals.append({'model': 'A1', 'bar': i, 'date': date, 'time': t,
                                 'direction': direction, 'atr14': atr14[i],
                                 'adx': adx[i], 'session': 'PM', 'priority': 3})

        # Model A2: Late PM flag, high ADX
        if 1400 <= t < 1600 and adx[i] >= 45 and flag_signal[i] == 1:
            struct_break_up   = cl[i] > hi10[i] and ema_bull[i]
            struct_break_down = cl[i] < lo10[i] and ema_bear[i]
            if struct_break_up or struct_break_down:
                direction = 1 if struct_break_up else -1
                signals.append({'model': 'A2', 'bar': i, 'date': date, 'time': t,
                                 'direction': direction, 'atr14': atr14[i],
                                 'adx': adx[i], 'session': 'LATE_PM', 'priority': 2})

        # Model A3: Overnight compression breakout, high ADX
        if (t < 930 or t >= 2000) and adx[i] >= 25 and compression[i] <= 2.5:
            struct_break_up   = cl[i] > hi10[i] and ema_bull[i]
            struct_break_down = cl[i] < lo10[i] and ema_bear[i]
            if struct_break_up or struct_break_down:
                direction = 1 if struct_break_up else -1
                signals.append({'model': 'A3', 'bar': i, 'date': date, 'time': t,
                                 'direction': direction, 'atr14': atr14[i],
                                 'adx': adx[i], 'session': 'OVERNIGHT', 'priority': 1})

    return signals

def simulate_trade(signal, df, risk_dollars):
    """Simulate a single trade from a signal. Returns P&L."""
    i = signal['bar']
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    n = len(cl)
    direction = signal['direction']
    entry = cl[i]
    stop_dist = signal['atr14']
    if stop_dist < 0.5: return 0.0
    n_contracts = max(1, round(risk_dollars / (stop_dist * MNQ_PV)))
    stop   = entry - direction * stop_dist
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
    return (n_contracts * 2.0 * stop_dist * MNQ_PV) if outcome == 'win' else \
           (-n_contracts * stop_dist * MNQ_PV)

# ─── Portfolio Execution Engine ───────────────────────────────────────────────
def run_portfolio(signals, df, config):
    """
    Run portfolio simulation with configurable execution policy.
    config keys:
      base_risk: base risk per trade ($)
      policy: 'priority_queue' | 'sas'
      milestone_step: profit increment to increase risk ($), 0=disabled
      milestone_risk_add: additional risk per milestone ($)
      milestone_max_risk: maximum risk after compounding ($)
      daily_limit: daily loss limit ($)
      session_risk_override: dict {session: risk_multiplier}
      recovery_mode_limit: if daily loss exceeds this, halt for day ($)
    """
    base_risk          = config.get('base_risk', 800)
    policy             = config.get('policy', 'priority_queue')
    milestone_step     = config.get('milestone_step', 0)
    milestone_risk_add = config.get('milestone_risk_add', 200)
    milestone_max_risk = config.get('milestone_max_risk', 2000)
    daily_limit        = config.get('daily_limit', 1000)
    session_risk_override = config.get('session_risk_override', {})
    recovery_limit     = config.get('recovery_mode_limit', daily_limit)

    # Sort signals by bar index
    sorted_signals = sorted(signals, key=lambda s: s['bar'])

    trades = []
    cumulative_pnl = 0.0
    milestones_hit = 0
    current_risk = base_risk

    # Group signals by date for daily management
    by_date = defaultdict(list)
    for s in sorted_signals:
        by_date[s['date']].append(s)

    active_bar = -1  # last bar where a trade was active (for SAS)

    for date in sorted(by_date.keys()):
        day_signals = by_date[date]
        daily_pnl = 0.0
        daily_halted = False

        # Sort by priority (A3=1 highest, A2=2, A1=3 lowest)
        if policy == 'priority_queue':
            day_signals = sorted(day_signals, key=lambda s: (s['bar'], s['priority']))
        else:
            day_signals = sorted(day_signals, key=lambda s: s['bar'])

        # Update risk based on milestones
        if milestone_step > 0:
            new_milestones = int(cumulative_pnl / milestone_step)
            if new_milestones > milestones_hit:
                milestones_hit = new_milestones
                current_risk = min(base_risk + milestones_hit * milestone_risk_add, milestone_max_risk)

        # Track active trade for SAS
        active_until_bar = -1

        for sig in day_signals:
            if daily_halted: break
            if daily_pnl <= -recovery_limit: daily_halted = True; break

            # SAS: skip if another model is still active
            if policy == 'sas' and sig['bar'] <= active_until_bar:
                continue

            # Priority Queue: skip if same-bar conflict with higher-priority model already taken
            # (handled by sorting — first signal at same bar wins)

            # Apply session risk override
            risk = current_risk
            sess = sig['session']
            if sess in session_risk_override:
                risk = current_risk * session_risk_override[sess]
            risk = max(200, min(risk, milestone_max_risk))

            pnl = simulate_trade(sig, df, risk)
            daily_pnl += pnl
            cumulative_pnl += pnl

            # Estimate trade duration (up to 30 bars)
            active_until_bar = sig['bar'] + 30

            trades.append({
                'pnl': pnl, 'date': date, 'model': sig['model'],
                'session': sig['session'], 'risk': risk,
                'cumulative': cumulative_pnl
            })

    return trades

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
    romd = abs(net / max_dd) if max_dd < 0 else 0
    monthly = {}
    for t in trades:
        key = str(t['date'])[:7]
        monthly[key] = monthly.get(key, 0) + t['pnl']
    monthly_pct = sum(1 for v in monthly.values() if v > 0) / len(monthly) if monthly else 0
    return {
        'n': len(trades), 'pf': round(pf, 3), 'net': round(net, 2),
        'wr': round(len(wins)/len(trades)*100, 1),
        'max_dd': round(max_dd, 2), 'romd': round(romd, 3),
        'monthly_pct': round(monthly_pct*100, 1),
        'expectancy': round(net/len(trades), 2),
    }

def monte_carlo_prop(trades, firm_config, n_sims=3000):
    """Run MC simulation against prop firm rules. Returns pass rate and avg days to pass."""
    if not trades: return 0.0, 0
    pnl_arr = np.array([t['pnl'] for t in trades])
    account      = firm_config['account']
    profit_target = firm_config['profit_target']
    max_dd_limit  = firm_config['max_dd']
    daily_limit   = firm_config['daily_limit']
    passes = 0; days_to_pass = []

    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        equity = 0.0; peak = 0.0; max_dd = 0.0
        daily_pnl = 0.0; current_day = 0; trade_day = 0
        failed = False; passed = False; day_count = 0

        for idx, p in enumerate(shuffled):
            # Simulate daily grouping (approx 2-3 trades per day)
            trade_day = idx // 3
            if trade_day != current_day:
                daily_pnl = 0.0
                current_day = trade_day
                day_count += 1

            equity += p; daily_pnl += p
            peak = max(peak, equity)
            max_dd = max(max_dd, peak - equity)

            if daily_pnl < -daily_limit or max_dd > max_dd_limit:
                failed = True; break
            if equity >= profit_target:
                passed = True; days_to_pass.append(day_count)
                break

        if passed: passes += 1

    avg_days = int(np.mean(days_to_pass)) if days_to_pass else 0
    return passes / n_sims * 100, avg_days

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars")

    print("Generating signals...")
    signals = generate_signals(df)
    print(f"  Total signals: {len(signals)} (A1={sum(1 for s in signals if s['model']=='A1')}, "
          f"A2={sum(1 for s in signals if s['model']=='A2')}, "
          f"A3={sum(1 for s in signals if s['model']=='A3')})")

    results = {}

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. BASELINE: Policy C @ $800 (Sprint 044 reference)
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("1. BASELINE: Priority Queue @ $800")
    print("="*70)
    cfg_baseline = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000}
    trades_baseline = run_portfolio(signals, df, cfg_baseline)
    m_baseline = calc_metrics(trades_baseline)
    mc_baseline, days_baseline = monte_carlo_prop(trades_baseline, PROP_FIRMS['Topstep_50K'])
    results['Baseline'] = {'metrics': m_baseline, 'mc': mc_baseline, 'days': days_baseline, 'trades': trades_baseline}
    print(f"  N={m_baseline['n']}  PF={m_baseline['pf']}  Net=${m_baseline['net']:,.0f}  MaxDD=${m_baseline['max_dd']:,.0f}")
    print(f"  MC Pass Rate (Topstep): {mc_baseline:.1f}%  Avg Days to Pass: {days_baseline}")

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. MILESTONE COMPOUNDING
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("2. MILESTONE COMPOUNDING")
    print("="*70)
    best_mc = mc_baseline; best_mc_config = None
    for step in [500, 750, 1000, 1500]:
        for add in [200, 300, 400]:
            for max_r in [1200, 1600, 2000]:
                cfg = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000,
                       'milestone_step': step, 'milestone_risk_add': add, 'milestone_max_risk': max_r}
                trades = run_portfolio(signals, df, cfg)
                m = calc_metrics(trades)
                mc, days = monte_carlo_prop(trades, PROP_FIRMS['Topstep_50K'])
                if mc > best_mc and m['pf'] >= 1.15:
                    best_mc = mc; best_mc_config = cfg.copy()
                    best_mc_config['_mc'] = mc; best_mc_config['_metrics'] = m; best_mc_config['_days'] = days

    if best_mc_config:
        print(f"  Best Milestone Config: step=${best_mc_config['milestone_step']}, "
              f"add=${best_mc_config['milestone_risk_add']}, max=${best_mc_config['milestone_max_risk']}")
        print(f"  MC Pass Rate: {best_mc_config['_mc']:.1f}%  PF={best_mc_config['_metrics']['pf']}  "
              f"Net=${best_mc_config['_metrics']['net']:,.0f}  Days={best_mc_config['_days']}")
        trades_milestone = run_portfolio(signals, df, best_mc_config)
        results['Milestone'] = {'metrics': best_mc_config['_metrics'], 'mc': best_mc_config['_mc'],
                                 'days': best_mc_config['_days'], 'trades': trades_milestone, 'config': best_mc_config}
    else:
        print(f"  No milestone config improved over baseline ({mc_baseline:.1f}%)")
        results['Milestone'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. SESSION RISK ALLOCATION
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("3. SESSION RISK ALLOCATION")
    print("="*70)
    best_sess_mc = mc_baseline; best_sess_config = None
    for pm_mult in [0.75, 1.0, 1.25]:
        for late_pm_mult in [0.75, 1.0, 1.25]:
            for overnight_mult in [0.75, 1.0, 1.25]:
                if pm_mult == 1.0 and late_pm_mult == 1.0 and overnight_mult == 1.0: continue
                cfg = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000,
                       'session_risk_override': {'PM': pm_mult, 'LATE_PM': late_pm_mult, 'OVERNIGHT': overnight_mult}}
                trades = run_portfolio(signals, df, cfg)
                m = calc_metrics(trades)
                mc, days = monte_carlo_prop(trades, PROP_FIRMS['Topstep_50K'])
                if mc > best_sess_mc and m['pf'] >= 1.15:
                    best_sess_mc = mc; best_sess_config = cfg.copy()
                    best_sess_config['_mc'] = mc; best_sess_config['_metrics'] = m; best_sess_config['_days'] = days

    if best_sess_config:
        print(f"  Best Session Config: PM={best_sess_config['session_risk_override']['PM']}x, "
              f"LATE_PM={best_sess_config['session_risk_override']['LATE_PM']}x, "
              f"OVERNIGHT={best_sess_config['session_risk_override']['OVERNIGHT']}x")
        print(f"  MC Pass Rate: {best_sess_config['_mc']:.1f}%  PF={best_sess_config['_metrics']['pf']}  "
              f"Net=${best_sess_config['_metrics']['net']:,.0f}  Days={best_sess_config['_days']}")
        trades_session = run_portfolio(signals, df, best_sess_config)
        results['Session'] = {'metrics': best_sess_config['_metrics'], 'mc': best_sess_config['_mc'],
                               'days': best_sess_config['_days'], 'trades': trades_session, 'config': best_sess_config}
    else:
        print(f"  No session config improved over baseline ({mc_baseline:.1f}%)")
        results['Session'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. DAILY LOSS MANAGEMENT
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("4. DAILY LOSS MANAGEMENT")
    print("="*70)
    best_dlm_mc = mc_baseline; best_dlm_config = None
    for daily_lim in [600, 700, 800, 900, 1000]:
        for recovery_lim in [400, 500, 600, 700]:
            if recovery_lim >= daily_lim: continue
            cfg = {'base_risk': 800, 'policy': 'priority_queue',
                   'daily_limit': daily_lim, 'recovery_mode_limit': recovery_lim}
            trades = run_portfolio(signals, df, cfg)
            m = calc_metrics(trades)
            mc, days = monte_carlo_prop(trades, PROP_FIRMS['Topstep_50K'],
                                        n_sims=1000)  # faster sweep
            if mc > best_dlm_mc and m['pf'] >= 1.15:
                best_dlm_mc = mc; best_dlm_config = cfg.copy()
                best_dlm_config['_mc'] = mc; best_dlm_config['_metrics'] = m; best_dlm_config['_days'] = days

    if best_dlm_config:
        print(f"  Best DLM Config: daily_limit=${best_dlm_config['daily_limit']}, "
              f"recovery_limit=${best_dlm_config['recovery_mode_limit']}")
        print(f"  MC Pass Rate: {best_dlm_config['_mc']:.1f}%  PF={best_dlm_config['_metrics']['pf']}  "
              f"Net=${best_dlm_config['_metrics']['net']:,.0f}  Days={best_dlm_config['_days']}")
        trades_dlm = run_portfolio(signals, df, best_dlm_config)
        results['DLM'] = {'metrics': best_dlm_config['_metrics'], 'mc': best_dlm_config['_mc'],
                           'days': best_dlm_config['_days'], 'trades': trades_dlm, 'config': best_dlm_config}
    else:
        print(f"  No DLM config improved over baseline ({mc_baseline:.1f}%)")
        results['DLM'] = results['Baseline']

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. ATS v2.0: COMBINED BEST CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("5. ATS v2.0: COMBINED CONFIGURATION")
    print("="*70)

    # Build combined config from best individual components
    ats_v2_config = {'base_risk': 800, 'policy': 'priority_queue', 'daily_limit': 1000}

    # Add milestone compounding if it improved things
    if results['Milestone']['mc'] > mc_baseline:
        mc_cfg = results['Milestone']['config']
        ats_v2_config['milestone_step']     = mc_cfg['milestone_step']
        ats_v2_config['milestone_risk_add'] = mc_cfg['milestone_risk_add']
        ats_v2_config['milestone_max_risk'] = mc_cfg['milestone_max_risk']

    # Add session override if it improved things
    if results['Session']['mc'] > mc_baseline:
        ats_v2_config['session_risk_override'] = results['Session']['config']['session_risk_override']

    # Add DLM if it improved things
    if results['DLM']['mc'] > mc_baseline:
        dlm_cfg = results['DLM']['config']
        ats_v2_config['daily_limit']          = dlm_cfg['daily_limit']
        ats_v2_config['recovery_mode_limit']  = dlm_cfg['recovery_mode_limit']

    # Also test a conservative base risk of $600 with milestone compounding
    cfg_conservative = {'base_risk': 600, 'policy': 'priority_queue', 'daily_limit': 800,
                        'milestone_step': 750, 'milestone_risk_add': 200, 'milestone_max_risk': 1600}
    trades_cons = run_portfolio(signals, df, cfg_conservative)
    m_cons = calc_metrics(trades_cons)
    mc_cons, days_cons = monte_carlo_prop(trades_cons, PROP_FIRMS['Topstep_50K'])
    print(f"  Conservative ($600 base): MC={mc_cons:.1f}%  PF={m_cons['pf']}  Net=${m_cons['net']:,.0f}  Days={days_cons}")

    trades_v2 = run_portfolio(signals, df, ats_v2_config)
    m_v2 = calc_metrics(trades_v2)
    mc_v2, days_v2 = monte_carlo_prop(trades_v2, PROP_FIRMS['Topstep_50K'])
    print(f"  ATS v2.0 (combined):      MC={mc_v2:.1f}%  PF={m_v2['pf']}  Net=${m_v2['net']:,.0f}  Days={days_v2}")

    # Use whichever is better
    if mc_cons > mc_v2 and m_cons['pf'] >= 1.15:
        final_config = cfg_conservative; final_trades = trades_cons
        final_m = m_cons; final_mc = mc_cons; final_days = days_cons
        print(f"  → Conservative config selected (higher MC pass rate)")
    else:
        final_config = ats_v2_config; final_trades = trades_v2
        final_m = m_v2; final_mc = mc_v2; final_days = days_v2
        print(f"  → Combined config selected")

    results['ATS_v2'] = {'metrics': final_m, 'mc': final_mc, 'days': final_days,
                          'trades': final_trades, 'config': final_config}

    # Full prop firm suite for ATS v2.0
    print(f"\n  ATS v2.0 Full Prop Firm Suite:")
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

    config_names = ['Baseline', 'Milestone', 'Session', 'DLM', 'ATS_v2']
    display_names = ['Baseline\n(Sprint 044)', 'Milestone\nCompounding', 'Session\nAllocation',
                     'Daily Loss\nManagement', 'ATS v2.0\n(Combined)']
    mc_values = [results[k]['mc'] for k in config_names]
    pf_values = [results[k]['metrics'].get('pf', 0) for k in config_names]
    net_values = [results[k]['metrics'].get('net', 0) for k in config_names]
    dd_values  = [abs(results[k]['metrics'].get('max_dd', 0)) for k in config_names]

    # Chart 1: MC Pass Rate comparison
    ax1 = fig.add_subplot(gs[0, :])
    ax1.set_facecolor('#161b22')
    colors = ['#6b7280', '#3b82f6', '#f59e0b', '#10b981', '#a855f7']
    bars = ax1.bar(display_names, mc_values, color=colors, alpha=0.85, width=0.6)
    ax1.axhline(75, color='#ef4444', linestyle='--', linewidth=2, label='Target: 75%')
    ax1.axhline(42.6, color='#6b7280', linestyle=':', linewidth=1.5, alpha=0.7, label='Sprint 044 Baseline: 42.6%')
    for bar, val in zip(bars, mc_values):
        ax1.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5, f'{val:.1f}%',
                 ha='center', va='bottom', color='white', fontsize=11, fontweight='bold')
    ax1.set_ylabel('Topstep 50K MC Pass Rate (%)', color='white', fontsize=11)
    ax1.set_title('Sprint 047 — Production Engineering: Monte Carlo Pass Rate by Configuration', color='white', fontweight='bold', fontsize=13)
    ax1.tick_params(colors='white'); ax1.set_ylim(0, 100)
    ax1.spines['bottom'].set_color('#30363d'); ax1.spines['left'].set_color('#30363d')
    ax1.spines['top'].set_visible(False); ax1.spines['right'].set_visible(False)
    ax1.legend(fontsize=10, facecolor='#161b22', labelcolor='white')

    # Chart 2: PF comparison
    ax2 = fig.add_subplot(gs[1, 0])
    ax2.set_facecolor('#161b22')
    ax2.bar(display_names, pf_values, color=colors, alpha=0.85)
    ax2.axhline(1.2, color='#10b981', linestyle='--', linewidth=1.5)
    ax2.axhline(1.0, color='white', linestyle='--', linewidth=1, alpha=0.5)
    ax2.set_ylabel('Profit Factor', color='white')
    ax2.set_title('Profit Factor by Configuration', color='white', fontweight='bold')
    ax2.tick_params(colors='white')
    ax2.spines['bottom'].set_color('#30363d'); ax2.spines['left'].set_color('#30363d')
    ax2.spines['top'].set_visible(False); ax2.spines['right'].set_visible(False)
    for i, v in enumerate(pf_values):
        ax2.text(i, v+0.005, f'{v:.3f}', ha='center', va='bottom', color='white', fontsize=9)

    # Chart 3: Net P&L comparison
    ax3 = fig.add_subplot(gs[1, 1])
    ax3.set_facecolor('#161b22')
    bar_colors = ['#10b981' if v > 0 else '#ef4444' for v in net_values]
    ax3.bar(display_names, net_values, color=bar_colors, alpha=0.85)
    ax3.axhline(0, color='white', linestyle='--', linewidth=0.5)
    ax3.set_ylabel('Net P&L ($)', color='white')
    ax3.set_title('Net P&L by Configuration', color='white', fontweight='bold')
    ax3.tick_params(colors='white')
    ax3.spines['bottom'].set_color('#30363d'); ax3.spines['left'].set_color('#30363d')
    ax3.spines['top'].set_visible(False); ax3.spines['right'].set_visible(False)

    # Chart 4: ATS v2.0 equity curve
    ax4 = fig.add_subplot(gs[2, :])
    ax4.set_facecolor('#161b22')
    if final_trades:
        equity = np.cumsum([0] + [t['pnl'] for t in final_trades])
        peak   = np.maximum.accumulate(equity)
        dd     = equity - peak
        ax4.plot(equity, color='#a855f7', linewidth=1.5, label=f'ATS v2.0 (N={final_m["n"]}, PF={final_m["pf"]:.3f}, MC={final_mc:.1f}%)')
        ax4.fill_between(range(len(equity)), equity, 0, where=(equity > 0), alpha=0.12, color='#10b981')
        ax4.fill_between(range(len(equity)), equity, 0, where=(equity < 0), alpha=0.12, color='#ef4444')
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
    print(f"\n{'Config':<25} {'MC Pass%':>10} {'PF':>8} {'Net P&L':>12} {'MaxDD':>12} {'Days':>8}")
    print("-"*75)
    for k, dn in zip(config_names, ['Baseline', 'Milestone', 'Session', 'DLM', 'ATS v2.0']):
        r = results[k]; m = r['metrics']
        print(f"  {dn:<23} {r['mc']:>9.1f}% {m.get('pf',0):>8.3f} ${m.get('net',0):>10,.0f} ${m.get('max_dd',0):>10,.0f} {r['days']:>8}")
    print(f"\n  Target: MC Pass Rate ≥ 75.0%")
    print(f"  Best:   ATS v2.0 = {final_mc:.1f}%")
    verdict = "PRODUCTION READY" if final_mc >= 75 else ("NEAR PRODUCTION" if final_mc >= 60 else "EXPERIMENTAL")
    print(f"  Verdict: {verdict}")
    print(f"\n  ATS v2.0 Config: {final_config}")

    return results, final_config, final_mc

if __name__ == '__main__':
    results, final_config, final_mc = main()
    print("\n=== SPRINT 047 COMPLETE ===")
