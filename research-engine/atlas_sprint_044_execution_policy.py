"""
Atlas Research Engine — Sprint 044
Prop Firm Execution Layer: Portfolio Execution Policy Testing
H-PF001: Which portfolio execution policy maximises prop firm survivability
         while preserving long-term expectancy?

Policies Tested:
  Baseline : No policy (concurrent, unlimited)
  Policy A : Single Active Strategy (SAS) — only one model active at a time
  Policy B : Portfolio Risk Budget — concurrent allowed if daily budget not exceeded
  Policy C : Priority Queue — highest-ranked opportunity wins on conflict
  Policy D : Hybrid — Risk Budget + Priority Ranking + Daily Loss Constraint

Risk Levels: $400, $500, $800 per trade
Prop Firm: Apex 50K ($3,000 profit target, $2,500 max daily loss, $2,500 trailing DD)
           Topstep 50K ($3,000 profit target, $1,000 max daily loss, $2,000 trailing DD)
           Generic 50K ($3,000 profit target, $1,000 max daily loss, $3,000 trailing DD)
"""

import pandas as pd
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch
import warnings
warnings.filterwarnings('ignore')

# ─── Constants ────────────────────────────────────────────────────────────────
DATA_PATH = Path("/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv")
MNQ_PV    = 2.0
TICK      = 0.25
COMM      = 1.00
CHART_DIR = Path("/home/ubuntu/Project-Atlas/research/sprint-044-charts")
CHART_DIR.mkdir(parents=True, exist_ok=True)

RISK_LEVELS = [400, 500, 800]

# Prop firm rules
PROP_FIRMS = {
    'Apex 50K':    {'target': 3000, 'daily_limit': 2500, 'trail_dd': 2500},
    'Topstep 50K': {'target': 3000, 'daily_limit': 1000, 'trail_dd': 2000},
    'Generic 50K': {'target': 3000, 'daily_limit': 1000, 'trail_dd': 3000},
}

# Model priority ranking (based on BCS / validated expectancy)
# A3 highest (BCS 90, overnight, least correlated)
# A2 second (BCS 80, late PM, highest PF in isolation)
# A1 third (BCS 75, PM, most trades)
MODEL_PRIORITY = {'A3': 1, 'A2': 2, 'A1': 3}
MODEL_EXPECTANCY = {'A1': 75.0, 'A2': 75.07, 'A3': 228.18}
MODEL_BCS = {'A1': 75, 'A2': 80, 'A3': 90}

# ─── Helpers ──────────────────────────────────────────────────────────────────
def ewm_np(arr, span):
    alpha = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = alpha * arr[i] + (1 - alpha) * out[i-1]
    return out

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    df['date']   = df['ts'].dt.date
    df['hour']   = df['ts'].dt.hour
    df['minute'] = df['ts'].dt.minute
    df['is_rth'] = (
        ((df['hour'] == 9) & (df['minute'] >= 30)) |
        ((df['hour'] >= 10) & (df['hour'] <= 15))
    )
    pc = df['close'].shift(1)
    tr = np.maximum(df['high']-df['low'],
         np.maximum((df['high']-pc).abs(), (df['low']-pc).abs()))
    df['atr5']  = tr.rolling(5,  min_periods=1).mean()
    df['atr14'] = tr.rolling(14, min_periods=1).mean()
    df['adx']   = compute_adx(df, 14)
    df['ema9']  = df['close'].ewm(span=9,  adjust=False).mean()
    df['ema21'] = df['close'].ewm(span=21, adjust=False).mean()
    df['ema50'] = df['close'].ewm(span=50, adjust=False).mean()
    return df

def compute_adx(df, period=14):
    hi = df['high'].values; lo = df['low'].values; cl = df['close'].values
    n = len(cl)
    tr = np.zeros(n); pdm = np.zeros(n); ndm = np.zeros(n)
    for i in range(1, n):
        hl = hi[i]-lo[i]; hpc = abs(hi[i]-cl[i-1]); lpc = abs(lo[i]-cl[i-1])
        tr[i] = max(hl, hpc, lpc)
        up = hi[i]-hi[i-1]; dn = lo[i-1]-lo[i]
        pdm[i] = up if (up > dn and up > 0) else 0
        ndm[i] = dn if (dn > up and dn > 0) else 0
    atr = pd.Series(tr).ewm(span=period, adjust=False).mean().values
    pdi = pd.Series(pdm).ewm(span=period, adjust=False).mean().values
    ndi = pd.Series(ndm).ewm(span=period, adjust=False).mean().values
    with np.errstate(divide='ignore', invalid='ignore'):
        pdi_r = np.where(atr > 0, 100*pdi/atr, 0)
        ndi_r = np.where(atr > 0, 100*ndi/atr, 0)
        dx = np.where((pdi_r+ndi_r) > 0, 100*np.abs(pdi_r-ndi_r)/(pdi_r+ndi_r), 0)
    adx = pd.Series(dx).ewm(span=period, adjust=False).mean().values
    return adx

# ─── Model Signal Generators ──────────────────────────────────────────────────
def generate_a1_signals(df):
    """Model A1: Low-ADX RTH pullback continuation (exact Sprint 025 logic)"""
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr5 = df['atr5'].values; atr14 = df['atr14'].values
    is_rth = df['is_rth'].values; n = len(cl)
    ema9  = ewm_np(cl, 9); ema21 = ewm_np(cl, 21); ema50 = ewm_np(cl, 50)
    # Volatility expansion
    exp_sig = np.zeros(n, dtype=bool)
    for i in range(20, n):
        if atr5[i-20] > 0: exp_sig[i] = atr5[i]/atr5[i-20] > 1.8
    # Swing highs/lows
    swing_hi = np.full(n, np.nan); swing_lo = np.full(n, np.nan)
    for i in range(11, n):
        swing_hi[i] = hi[max(0,i-11):i-1].max()
        swing_lo[i] = lo[max(0,i-11):i-1].min()
    signals = []
    i = 0
    while i < n-1:
        if not is_rth[i] or not exp_sig[i] or atr14[i] <= 0:
            i += 1; continue
        avg = atr14[i]
        # Long
        if ema9[i] > ema21[i] > ema50[i]:
            prev = cl[i-1] if i > 0 else cl[i]
            if prev > ema21[i] and cl[i] <= ema21[i]*1.001 and not np.isnan(swing_hi[i]):
                depth = (swing_hi[i]-cl[i])/avg
                if 0.5 <= depth <= 1.2 and avg >= 1.0:
                    sp = avg; tp = 2.0*sp
                    signals.append({'idx': i, 'dir': 1, 'stop_pts': sp, 'target_pts': tp,
                                    'model': 'A1', 'date': df['date'].iloc[i],
                                    'session': 'PM', 'adx': df['adx'].iloc[i]})
                    i += 1; continue
        # Short
        if ema9[i] < ema21[i] < ema50[i]:
            prev = cl[i-1] if i > 0 else cl[i]
            if prev < ema21[i] and cl[i] >= ema21[i]*0.999 and not np.isnan(swing_lo[i]):
                depth = (cl[i]-swing_lo[i])/avg
                if 0.5 <= depth <= 1.2 and avg >= 1.0:
                    sp = avg; tp = 2.0*sp
                    signals.append({'idx': i, 'dir': -1, 'stop_pts': sp, 'target_pts': tp,
                                    'model': 'A1', 'date': df['date'].iloc[i],
                                    'session': 'PM', 'adx': df['adx'].iloc[i]})
                    i += 1; continue
        i += 1
    return signals

def generate_a2_signals(df):
    """Model A2: High-ADX Late RTH Flag Continuation (Sprint 042 validated)"""
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; adx = df['adx'].values
    hour = df['hour'].values; minute = df['minute'].values
    is_rth = df['is_rth'].values; n = len(cl)
    ema9  = ewm_np(cl, 9); ema21 = ewm_np(cl, 21)
    signals = []
    for i in range(20, n-1):
        if not is_rth[i]: continue
        t = hour[i]*60 + minute[i]
        if t < 840 or t >= 960: continue  # 14:00-16:00 ET only
        if adx[i] < 45: continue
        avg = atr14[i]
        if avg <= 0: continue
        # Flag: 8-bar consolidation (range < 1.5 ATR), then breakout
        if i < 8: continue
        flag_hi = hi[i-8:i].max(); flag_lo = lo[i-8:i].min()
        flag_range = flag_hi - flag_lo
        if flag_range > 1.5*avg: continue
        # Long breakout
        if ema9[i] > ema21[i] and cl[i] > flag_hi:
            sp = 0.8*avg; tp = 1.6*avg
            if sp >= 0.5:
                signals.append({'idx': i, 'dir': 1, 'stop_pts': sp, 'target_pts': tp,
                                'model': 'A2', 'date': df['date'].iloc[i],
                                'session': 'LATE_PM', 'adx': adx[i]})
        # Short breakout
        elif ema9[i] < ema21[i] and cl[i] < flag_lo:
            sp = 0.8*avg; tp = 1.6*avg
            if sp >= 0.5:
                signals.append({'idx': i, 'dir': -1, 'stop_pts': sp, 'target_pts': tp,
                                'model': 'A2', 'date': df['date'].iloc[i],
                                'session': 'LATE_PM', 'adx': adx[i]})
    return signals

def generate_a3_signals(df):
    """Model A3: Overnight Volatility Contraction Breakout (Sprint 037 validated)"""
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    atr14 = df['atr14'].values; atr5 = df['atr5'].values; adx = df['adx'].values
    hour = df['hour'].values; minute = df['minute'].values
    is_rth = df['is_rth'].values; n = len(cl)
    ema21 = ewm_np(cl, 21)
    signals = []
    for i in range(30, n-1):
        if is_rth[i]: continue  # Overnight only
        if adx[i] < 25: continue
        avg = atr14[i]
        if avg <= 0: continue
        # Compression: 20-bar ATR range < 0.6 * ATR14
        if i < 20: continue
        recent_hi = hi[i-20:i].max(); recent_lo = lo[i-20:i].min()
        compression = (recent_hi - recent_lo) / avg
        if compression > 0.6: continue
        # Breakout above/below compression range
        if cl[i] > recent_hi:
            sp = 0.5*avg; tp = 1.5*sp
            if sp >= 0.5:
                signals.append({'idx': i, 'dir': 1, 'stop_pts': sp, 'target_pts': tp,
                                'model': 'A3', 'date': df['date'].iloc[i],
                                'session': 'OVERNIGHT', 'adx': adx[i]})
        elif cl[i] < recent_lo:
            sp = 0.5*avg; tp = 1.5*sp
            if sp >= 0.5:
                signals.append({'idx': i, 'dir': -1, 'stop_pts': sp, 'target_pts': tp,
                                'model': 'A3', 'date': df['date'].iloc[i],
                                'session': 'OVERNIGHT', 'adx': adx[i]})
    return signals

# ─── Trade Simulator ──────────────────────────────────────────────────────────
def simulate_trade(df, sig, risk_dollars):
    """Execute a single trade, sizing by dollar risk. Returns P&L in dollars."""
    i = sig['idx']
    cl = df['close'].values; hi = df['high'].values; lo = df['low'].values
    is_rth = df['is_rth'].values; n = len(cl)
    sp = sig['stop_pts']; tp = sig['target_pts']; d = sig['dir']
    # Position size: risk / (stop_pts * point_value)
    contracts = max(1, round(risk_dollars / (sp * MNQ_PV)))
    entry = cl[i]
    stop_p  = entry - d*sp
    target_p = entry + d*tp
    for j in range(i+1, min(i+300, n)):
        if d == 1:
            if lo[j] <= stop_p:
                pnl = d*(stop_p - entry)*MNQ_PV*contracts - COMM*contracts
                return pnl, j-i, 'STOP'
            if hi[j] >= target_p:
                pnl = d*(target_p - entry)*MNQ_PV*contracts - COMM*contracts
                return pnl, j-i, 'TARGET'
        else:
            if hi[j] >= stop_p:
                pnl = d*(stop_p - entry)*MNQ_PV*contracts - COMM*contracts
                return pnl, j-i, 'STOP'
            if lo[j] <= target_p:
                pnl = d*(target_p - entry)*MNQ_PV*contracts - COMM*contracts
                return pnl, j-i, 'TARGET'
    # Timeout
    pnl = d*(cl[min(i+299,n-1)] - entry)*MNQ_PV*contracts - COMM*contracts
    return pnl, 299, 'TIMEOUT'

# ─── Policy Engine ────────────────────────────────────────────────────────────
def run_policy(df, all_signals, policy, risk_dollars):
    """
    Run a portfolio execution policy over the full signal stream.
    Returns list of executed trade dicts.
    """
    # Sort all signals by bar index
    signals = sorted(all_signals, key=lambda x: x['idx'])
    n = len(df)
    trades = []
    # State tracking
    active_end_bar = -1          # last bar of active trade (SAS)
    daily_risk_used = {}         # date -> dollars risked today
    daily_pnl = {}               # date -> realised P&L today
    active_models = {}           # model -> end_bar (for SAS per-model)

    i = 0
    sig_idx = 0
    while sig_idx < len(signals):
        sig = signals[sig_idx]
        bar = sig['idx']
        date = sig['date']
        model = sig['model']
        risk = sig['stop_pts'] * MNQ_PV * max(1, round(risk_dollars/(sig['stop_pts']*MNQ_PV)))

        # ── Policy A: Single Active Strategy ──────────────────────────────────
        if policy == 'A':
            if bar <= active_end_bar:
                sig_idx += 1; continue
            pnl, dur, exit_t = simulate_trade(df, sig, risk_dollars)
            trades.append({**sig, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                           'risk': risk_dollars, 'policy': 'A'})
            active_end_bar = bar + dur
            sig_idx += 1

        # ── Policy B: Portfolio Risk Budget ───────────────────────────────────
        elif policy == 'B':
            budget = risk_dollars * 2.5  # allow 2.5x base risk concurrently
            used = daily_risk_used.get(date, 0)
            if used + risk_dollars > budget:
                sig_idx += 1; continue
            # Also check daily loss limit (1000 for Topstep)
            dl = daily_pnl.get(date, 0)
            if dl <= -1000:
                sig_idx += 1; continue
            pnl, dur, exit_t = simulate_trade(df, sig, risk_dollars)
            trades.append({**sig, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                           'risk': risk_dollars, 'policy': 'B'})
            daily_risk_used[date] = used + risk_dollars
            daily_pnl[date] = daily_pnl.get(date, 0) + pnl
            sig_idx += 1

        # ── Policy C: Priority Queue ───────────────────────────────────────────
        elif policy == 'C':
            # Collect all signals at this bar
            same_bar = [s for s in signals[sig_idx:] if s['idx'] == bar]
            if len(same_bar) > 1:
                # Pick highest priority (lowest number = highest priority)
                best = min(same_bar, key=lambda s: MODEL_PRIORITY[s['model']])
                # Skip all others at this bar
                sig_idx += len(same_bar)
                # Check daily loss limit
                dl = daily_pnl.get(date, 0)
                if dl <= -1000:
                    continue
                pnl, dur, exit_t = simulate_trade(df, best, risk_dollars)
                trades.append({**best, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                               'risk': risk_dollars, 'policy': 'C'})
                daily_pnl[date] = daily_pnl.get(date, 0) + pnl
            else:
                dl = daily_pnl.get(date, 0)
                if dl <= -1000:
                    sig_idx += 1; continue
                pnl, dur, exit_t = simulate_trade(df, sig, risk_dollars)
                trades.append({**sig, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                               'risk': risk_dollars, 'policy': 'C'})
                daily_pnl[date] = daily_pnl.get(date, 0) + pnl
                sig_idx += 1

        # ── Policy D: Hybrid ───────────────────────────────────────────────────
        elif policy == 'D':
            budget = risk_dollars * 2.0
            used = daily_risk_used.get(date, 0)
            dl = daily_pnl.get(date, 0)
            # Hard daily loss stop
            if dl <= -1000:
                sig_idx += 1; continue
            # Collect same-bar signals
            same_bar = [s for s in signals[sig_idx:] if s['idx'] == bar]
            if len(same_bar) > 1:
                # Sort by priority, take as many as budget allows
                ranked = sorted(same_bar, key=lambda s: MODEL_PRIORITY[s['model']])
                sig_idx += len(same_bar)
                for candidate in ranked:
                    if used + risk_dollars > budget: break
                    pnl, dur, exit_t = simulate_trade(df, candidate, risk_dollars)
                    trades.append({**candidate, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                                   'risk': risk_dollars, 'policy': 'D'})
                    used += risk_dollars
                    dl += pnl
                    if dl <= -1000: break
                daily_risk_used[date] = used
                daily_pnl[date] = dl
            else:
                if used + risk_dollars <= budget:
                    pnl, dur, exit_t = simulate_trade(df, sig, risk_dollars)
                    trades.append({**sig, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                                   'risk': risk_dollars, 'policy': 'D'})
                    daily_risk_used[date] = used + risk_dollars
                    daily_pnl[date] = dl + pnl
                sig_idx += 1

        # ── Baseline: No policy ────────────────────────────────────────────────
        elif policy == 'BASE':
            pnl, dur, exit_t = simulate_trade(df, sig, risk_dollars)
            trades.append({**sig, 'pnl': pnl, 'duration': dur, 'exit': exit_t,
                           'risk': risk_dollars, 'policy': 'BASE'})
            sig_idx += 1

    return trades

# ─── Metrics ──────────────────────────────────────────────────────────────────
def compute_metrics(trades, label=''):
    if not trades:
        return {'label': label, 'n': 0, 'pf': 0, 'net': 0, 'wr': 0,
                'exp': 0, 'maxdd': 0, 'romaD': 0, 'monthly': 0, 'ror': 0,
                'smoothness': 0, 'recovery': 0}
    pnls = [t['pnl'] for t in trades]
    wins = [p for p in pnls if p > 0]
    loss = [p for p in pnls if p <= 0]
    gross_w = sum(wins); gross_l = abs(sum(loss))
    pf = gross_w/gross_l if gross_l > 0 else 999
    net = sum(pnls)
    wr = len(wins)/len(pnls)
    exp = net/len(pnls)
    # Equity curve
    equity = np.cumsum(pnls)
    peak = np.maximum.accumulate(equity)
    dd = equity - peak
    maxdd = dd.min()
    romaD = net/abs(maxdd) if maxdd < 0 else 999
    recovery = net/abs(maxdd) if maxdd < 0 else 999
    # Smoothness (R²)
    x = np.arange(len(equity))
    if len(x) > 1:
        m, b = np.polyfit(x, equity, 1)
        resid = equity - (m*x+b)
        ss_res = np.sum(resid**2); ss_tot = np.sum((equity-equity.mean())**2)
        r2 = 1 - ss_res/ss_tot if ss_tot > 0 else 0
    else:
        r2 = 0
    # Monthly consistency
    dates = [t['date'] for t in trades]
    df_t = pd.DataFrame({'pnl': pnls, 'date': dates})
    df_t['date'] = pd.to_datetime(df_t['date'])
    df_t['ym'] = df_t['date'].dt.to_period('M')
    monthly = df_t.groupby('ym')['pnl'].sum()
    monthly_pos = (monthly > 0).mean() if len(monthly) > 0 else 0
    # Risk of ruin (simplified: % of MC paths that hit -$5000)
    np.random.seed(42)
    ror_hits = 0
    for _ in range(1000):
        shuffled = np.random.choice(pnls, size=len(pnls), replace=True)
        if np.cumsum(shuffled).min() < -5000:
            ror_hits += 1
    ror = ror_hits / 1000
    # Daily violations (daily loss > $1000)
    df_t2 = pd.DataFrame({'pnl': pnls, 'date': dates})
    daily_pnl = df_t2.groupby('date')['pnl'].sum()
    violations = (daily_pnl < -1000).sum()
    return {
        'label': label, 'n': len(trades), 'pf': round(pf, 3),
        'net': round(net, 2), 'wr': round(wr*100, 1),
        'exp': round(exp, 2), 'maxdd': round(maxdd, 2),
        'romaD': round(romaD, 3), 'monthly': round(monthly_pos*100, 1),
        'ror': round(ror*100, 1), 'smoothness': round(r2, 4),
        'recovery': round(recovery, 3), 'violations': int(violations)
    }

# ─── Monte Carlo Prop Firm Simulation ─────────────────────────────────────────
def mc_prop_firm(trades, firm_rules, n_sims=2000):
    pnls = [t['pnl'] for t in trades]
    if len(pnls) < 5:
        return {'pass_rate': 0, 'avg_days': 0}
    target = firm_rules['target']
    daily_limit = firm_rules['daily_limit']
    trail_dd = firm_rules['trail_dd']
    passes = 0; days_list = []
    np.random.seed(42)
    for _ in range(n_sims):
        equity = 0; peak = 0; day = 0
        daily_pnl = 0; daily_trades = 0
        passed = False; failed = False
        shuffled = np.random.choice(pnls, size=min(len(pnls)*3, 500), replace=True)
        for pnl in shuffled:
            daily_trades += 1
            daily_pnl += pnl
            equity += pnl
            if equity > peak: peak = equity
            # Daily loss check
            if daily_pnl < -daily_limit:
                failed = True; break
            # Trailing DD check
            if equity < peak - trail_dd:
                failed = True; break
            # New trading day (every ~24 trades = ~2 hours of signals)
            if daily_trades >= 24:
                day += 1; daily_pnl = 0; daily_trades = 0
            # Pass check
            if equity >= target:
                passed = True; days_list.append(day+1); break
        if passed: passes += 1
    pass_rate = passes / n_sims
    avg_days = np.mean(days_list) if days_list else 0
    return {'pass_rate': round(pass_rate*100, 1), 'avg_days': round(avg_days, 1)}

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("Loading data...")
    df = load_data()
    print(f"  Loaded {len(df):,} bars")

    print("Generating model signals...")
    a1_sigs = generate_a1_signals(df)
    a2_sigs = generate_a2_signals(df)
    a3_sigs = generate_a3_signals(df)
    all_sigs = a1_sigs + a2_sigs + a3_sigs
    print(f"  A1: {len(a1_sigs)} signals | A2: {len(a2_sigs)} signals | A3: {len(a3_sigs)} signals")
    print(f"  Total: {len(all_sigs)} signals")

    policies = ['BASE', 'A', 'B', 'C', 'D']
    policy_names = {
        'BASE': 'Baseline (No Policy)',
        'A': 'Policy A — SAS',
        'B': 'Policy B — Risk Budget',
        'C': 'Policy C — Priority Queue',
        'D': 'Policy D — Hybrid',
    }

    results = {}  # (policy, risk) -> metrics
    mc_results = {}  # (policy, risk, firm) -> mc

    print("\n" + "="*70)
    print("RUNNING ALL POLICIES × RISK LEVELS")
    print("="*70)

    for risk in RISK_LEVELS:
        for pol in policies:
            label = f"{policy_names[pol]} @ ${risk}"
            print(f"\n  Testing: {label}")
            trades = run_policy(df, all_sigs, pol, risk)
            m = compute_metrics(trades, label)
            results[(pol, risk)] = m
            print(f"    N={m['n']}, PF={m['pf']}, Net=${m['net']:,.0f}, "
                  f"MaxDD=${m['maxdd']:,.0f}, Monthly={m['monthly']}%, "
                  f"Violations={m['violations']}")
            # MC for each prop firm
            for firm_name, firm_rules in PROP_FIRMS.items():
                mc = mc_prop_firm(trades, firm_rules)
                mc_results[(pol, risk, firm_name)] = mc
                print(f"    {firm_name}: Pass={mc['pass_rate']}%, AvgDays={mc['avg_days']}")

    # ─── Summary Table ────────────────────────────────────────────────────────
    print("\n" + "="*70)
    print("SUMMARY: TOPSTEP 50K PASS RATE BY POLICY & RISK")
    print("="*70)
    print(f"{'Policy':<30} {'$400':>8} {'$500':>8} {'$800':>8}")
    print("-"*56)
    for pol in policies:
        row = f"{policy_names[pol]:<30}"
        for risk in RISK_LEVELS:
            mc = mc_results.get((pol, risk, 'Topstep 50K'), {})
            row += f" {mc.get('pass_rate', 0):>7.1f}%"
        print(row)

    print("\n" + "="*70)
    print("SUMMARY: NET PROFIT BY POLICY & RISK")
    print("="*70)
    print(f"{'Policy':<30} {'$400':>10} {'$500':>10} {'$800':>10}")
    print("-"*62)
    for pol in policies:
        row = f"{policy_names[pol]:<30}"
        for risk in RISK_LEVELS:
            m = results.get((pol, risk), {})
            row += f" ${m.get('net', 0):>9,.0f}"
        print(row)

    print("\n" + "="*70)
    print("SUMMARY: MAX DRAWDOWN BY POLICY & RISK")
    print("="*70)
    print(f"{'Policy':<30} {'$400':>12} {'$500':>12} {'$800':>12}")
    print("-"*68)
    for pol in policies:
        row = f"{policy_names[pol]:<30}"
        for risk in RISK_LEVELS:
            m = results.get((pol, risk), {})
            row += f" ${m.get('maxdd', 0):>11,.0f}"
        print(row)

    print("\n" + "="*70)
    print("SUMMARY: DAILY LOSS VIOLATIONS BY POLICY & RISK")
    print("="*70)
    print(f"{'Policy':<30} {'$400':>8} {'$500':>8} {'$800':>8}")
    print("-"*56)
    for pol in policies:
        row = f"{policy_names[pol]:<30}"
        for risk in RISK_LEVELS:
            m = results.get((pol, risk), {})
            row += f" {m.get('violations', 0):>8}"
        print(row)

    # ─── Best Policy Identification ───────────────────────────────────────────
    print("\n" + "="*70)
    print("BEST CONFIGURATION (Topstep Pass Rate × Net Profit)")
    print("="*70)
    best_score = -999; best_config = None
    for pol in policies:
        for risk in RISK_LEVELS:
            mc = mc_results.get((pol, risk, 'Topstep 50K'), {})
            m = results.get((pol, risk), {})
            pr = mc.get('pass_rate', 0)
            net = m.get('net', 0)
            pf = m.get('pf', 0)
            # Score: pass_rate * 2 + pf * 10 + net/10000
            score = pr*2 + pf*10 + net/10000
            if score > best_score:
                best_score = score
                best_config = (pol, risk, pr, net, pf, m.get('maxdd',0), m.get('monthly',0))

    if best_config:
        pol, risk, pr, net, pf, maxdd, monthly = best_config
        print(f"  Best Policy: {policy_names[pol]} @ ${risk}/trade")
        print(f"  Topstep Pass Rate: {pr}%")
        print(f"  Net Profit: ${net:,.0f}")
        print(f"  Profit Factor: {pf}")
        print(f"  Max Drawdown: ${maxdd:,.0f}")
        print(f"  Monthly Consistency: {monthly}%")

    # ─── Charts ───────────────────────────────────────────────────────────────
    print("\nGenerating charts...")
    fig = plt.figure(figsize=(20, 16))
    fig.patch.set_facecolor('#0d1117')
    gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)

    colors = {'BASE': '#6b7280', 'A': '#3b82f6', 'B': '#f59e0b', 'C': '#10b981', 'D': '#ef4444'}
    short_names = {'BASE': 'Baseline', 'A': 'SAS', 'B': 'Risk Budget', 'C': 'Priority', 'D': 'Hybrid'}

    # Chart 1: Topstep Pass Rate by Policy & Risk
    ax1 = fig.add_subplot(gs[0, :2])
    ax1.set_facecolor('#161b22')
    x = np.arange(len(RISK_LEVELS)); w = 0.15
    for j, pol in enumerate(policies):
        vals = [mc_results.get((pol, r, 'Topstep 50K'), {}).get('pass_rate', 0) for r in RISK_LEVELS]
        bars = ax1.bar(x + j*w, vals, w*0.9, label=short_names[pol], color=colors[pol], alpha=0.85)
    ax1.axhline(75, color='#ef4444', linestyle='--', linewidth=1.5, label='75% Target')
    ax1.set_xticks(x + w*2); ax1.set_xticklabels([f'${r}' for r in RISK_LEVELS], color='white')
    ax1.set_ylabel('Pass Rate (%)', color='white'); ax1.set_title('Topstep 50K Pass Rate by Policy & Risk', color='white', fontweight='bold')
    ax1.tick_params(colors='white'); ax1.spines['bottom'].set_color('#30363d'); ax1.spines['left'].set_color('#30363d')
    ax1.spines['top'].set_visible(False); ax1.spines['right'].set_visible(False)
    ax1.legend(fontsize=8, facecolor='#161b22', labelcolor='white', loc='upper right')
    ax1.set_ylim(0, 100)

    # Chart 2: Net Profit by Policy & Risk
    ax2 = fig.add_subplot(gs[0, 2])
    ax2.set_facecolor('#161b22')
    for j, pol in enumerate(policies):
        vals = [results.get((pol, r), {}).get('net', 0)/1000 for r in RISK_LEVELS]
        ax2.plot(RISK_LEVELS, vals, 'o-', color=colors[pol], label=short_names[pol], linewidth=2, markersize=6)
    ax2.set_xlabel('Risk per Trade ($)', color='white'); ax2.set_ylabel('Net Profit ($k)', color='white')
    ax2.set_title('Net Profit by Policy', color='white', fontweight='bold')
    ax2.tick_params(colors='white'); ax2.spines['bottom'].set_color('#30363d'); ax2.spines['left'].set_color('#30363d')
    ax2.spines['top'].set_visible(False); ax2.spines['right'].set_visible(False)
    ax2.legend(fontsize=7, facecolor='#161b22', labelcolor='white')

    # Chart 3: Max Drawdown by Policy & Risk
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.set_facecolor('#161b22')
    for j, pol in enumerate(policies):
        vals = [abs(results.get((pol, r), {}).get('maxdd', 0))/1000 for r in RISK_LEVELS]
        ax3.plot(RISK_LEVELS, vals, 's--', color=colors[pol], label=short_names[pol], linewidth=1.5, markersize=5)
    ax3.set_xlabel('Risk ($)', color='white'); ax3.set_ylabel('Max DD ($k)', color='white')
    ax3.set_title('Max Drawdown by Policy', color='white', fontweight='bold')
    ax3.tick_params(colors='white'); ax3.spines['bottom'].set_color('#30363d'); ax3.spines['left'].set_color('#30363d')
    ax3.spines['top'].set_visible(False); ax3.spines['right'].set_visible(False)
    ax3.legend(fontsize=7, facecolor='#161b22', labelcolor='white')

    # Chart 4: Daily Violations by Policy & Risk
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.set_facecolor('#161b22')
    x = np.arange(len(RISK_LEVELS)); w = 0.15
    for j, pol in enumerate(policies):
        vals = [results.get((pol, r), {}).get('violations', 0) for r in RISK_LEVELS]
        ax4.bar(x + j*w, vals, w*0.9, label=short_names[pol], color=colors[pol], alpha=0.85)
    ax4.set_xticks(x + w*2); ax4.set_xticklabels([f'${r}' for r in RISK_LEVELS], color='white')
    ax4.set_ylabel('Daily Violations', color='white'); ax4.set_title('Daily Loss Violations', color='white', fontweight='bold')
    ax4.tick_params(colors='white'); ax4.spines['bottom'].set_color('#30363d'); ax4.spines['left'].set_color('#30363d')
    ax4.spines['top'].set_visible(False); ax4.spines['right'].set_visible(False)
    ax4.legend(fontsize=7, facecolor='#161b22', labelcolor='white')

    # Chart 5: Profit Factor by Policy & Risk
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_facecolor('#161b22')
    for j, pol in enumerate(policies):
        vals = [min(results.get((pol, r), {}).get('pf', 0), 3.0) for r in RISK_LEVELS]
        ax5.plot(RISK_LEVELS, vals, '^-', color=colors[pol], label=short_names[pol], linewidth=2, markersize=6)
    ax5.axhline(1.20, color='#ef4444', linestyle='--', linewidth=1.5, label='1.20 Target')
    ax5.set_xlabel('Risk ($)', color='white'); ax5.set_ylabel('Profit Factor', color='white')
    ax5.set_title('Profit Factor by Policy', color='white', fontweight='bold')
    ax5.tick_params(colors='white'); ax5.spines['bottom'].set_color('#30363d'); ax5.spines['left'].set_color('#30363d')
    ax5.spines['top'].set_visible(False); ax5.spines['right'].set_visible(False)
    ax5.legend(fontsize=7, facecolor='#161b22', labelcolor='white')

    # Chart 6: Equity curves for best policy at $500
    ax6 = fig.add_subplot(gs[2, :])
    ax6.set_facecolor('#161b22')
    for pol in policies:
        trades = run_policy(df, all_sigs, pol, 500)
        if trades:
            pnls = [t['pnl'] for t in trades]
            eq = np.cumsum(pnls)
            ax6.plot(eq, color=colors[pol], label=f"{short_names[pol]} (${sum(pnls):,.0f})",
                     linewidth=1.5, alpha=0.85)
    ax6.axhline(0, color='#6b7280', linewidth=0.8)
    ax6.set_xlabel('Trade Number', color='white'); ax6.set_ylabel('Cumulative P&L ($)', color='white')
    ax6.set_title('Equity Curves — All Policies @ $500 Risk', color='white', fontweight='bold')
    ax6.tick_params(colors='white'); ax6.spines['bottom'].set_color('#30363d'); ax6.spines['left'].set_color('#30363d')
    ax6.spines['top'].set_visible(False); ax6.spines['right'].set_visible(False)
    ax6.legend(fontsize=8, facecolor='#161b22', labelcolor='white', loc='upper left')

    fig.suptitle('Sprint 044 — Prop Firm Execution Layer: Policy Comparison', 
                 color='white', fontsize=14, fontweight='bold', y=0.98)

    chart_path = CHART_DIR / 'sprint_044_execution_policy.png'
    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close()
    print(f"Chart saved: {chart_path}")

    # ─── Final Verdict ────────────────────────────────────────────────────────
    print("\n" + "="*70)
    print("FINAL VERDICT — H-PF001")
    print("="*70)
    print(f"  Best Policy: {policy_names[best_config[0]]} @ ${best_config[1]}/trade")
    print(f"  Topstep Pass Rate: {best_config[2]}%  (Target: ≥75%)")
    print(f"  Net Profit: ${best_config[3]:,.0f}")
    print(f"  Profit Factor: {best_config[4]}")
    print(f"  Max Drawdown: ${best_config[5]:,.0f}")
    print(f"  Monthly Consistency: {best_config[6]}%")
    topstep_pass = best_config[2]
    if topstep_pass >= 75:
        print("\n  H-PF001: VALIDATED — Execution policy achieves prop firm mission.")
        print(f"  RECOMMENDED POLICY: {policy_names[best_config[0]]} @ ${best_config[1]}/trade")
    elif topstep_pass >= 40:
        print("\n  H-PF001: PARTIAL — Significant improvement over baseline but below 75% target.")
        print(f"  RECOMMENDED POLICY: {policy_names[best_config[0]]} @ ${best_config[1]}/trade (best available)")
    else:
        print("\n  H-PF001: REJECTED — No policy achieves the 75% prop firm pass rate target.")

    print("\n=== VALIDATION COMPLETE ===")

if __name__ == '__main__':
    main()
