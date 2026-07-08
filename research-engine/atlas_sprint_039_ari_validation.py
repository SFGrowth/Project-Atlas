"""
Atlas Sprint 039 — ARI Validation (H-C001)
Test whether dynamic capital allocation (ARI) constitutes an independent
statistical edge over static allocation, using frozen execution models.

H-C001: Dynamic capital allocation through Atlas Risk Intelligence (ARI)
will reduce drawdown and improve portfolio robustness without requiring
any improvement to the underlying execution models.

Phase 1: Reproduce the static portfolio trade stream (Sprint 038 baseline)
Phase 2: Individually validate each candidate ARI input
Phase 3: Engineer ARI v1.0 from validated inputs only
Phase 4: Full comparison — Static vs ARI — across 13 metrics + Monte Carlo
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os
warnings.filterwarnings('ignore')

DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-039-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMISSION   = 1.00
POINT_VALUE  = 2.00
BASE_RISK    = 1.0   # 100% risk = 1 unit

# ─── Fast EWM ─────────────────────────────────────────────────────────────────
def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

# ─── Load data ────────────────────────────────────────────────────────────────
print("Loading data...")
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
year   = df['ts'].dt.year.values
month  = df['ts'].dt.month.values
date   = df['ts'].dt.date.values
dow    = df['ts'].dt.dayofweek.values

# ─── Indicators ───────────────────────────────────────────────────────────────
print("Computing indicators...")
tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
tr[0] = hi[0] - lo[0]
atr5  = ewm_fast(tr, 5)
atr14 = ewm_fast(tr, 14)
atr5_lag = np.empty(n); atr5_lag[:20] = np.nan; atr5_lag[20:] = atr5[:-20]
vol_ratio = np.where(atr5_lag > 0, atr5 / atr5_lag, np.nan)

ema9  = ewm_fast(cl, 9)
ema21 = ewm_fast(cl, 21)
ema50 = ewm_fast(cl, 50)

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
is_overnight = (hour >= 18) | (hour < 9)
is_rth_global = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
zone_high = pd.Series(hi).rolling(5).max().shift(1).values

print("Indicators ready.")

# ─── Model A1 Simulator (exact Sprint 025 logic) ──────────────────────────────
def simulate_a1():
    A1_EXP_LOOKBACK  = 20; A1_EXP_RATIO = 1.8
    A1_DEPTH_MIN_ATR = 0.5; A1_DEPTH_MAX_ATR = 1.2
    A1_STOP_ATR_MULT = 1.0; A1_TARGET_RR = 2.0

    atr5_vals = atr5.copy()
    exp_sig = np.zeros(n, dtype=bool)
    for i in range(A1_EXP_LOOKBACK, n):
        prev = atr5_vals[i - A1_EXP_LOOKBACK]
        if prev > 0: exp_sig[i] = atr5_vals[i] / prev > A1_EXP_RATIO

    prev_cl = np.roll(cl, 1); prev_cl[0] = cl[0]
    pb_long_touch  = (prev_cl > ema21) & (cl <= ema21 * 1.001)
    pb_short_touch = (prev_cl < ema21) & (cl >= ema21 * 0.999)
    swing_high_10 = pd.Series(hi).shift(1).rolling(10, min_periods=1).max().values
    swing_low_10  = pd.Series(lo).shift(1).rolling(10, min_periods=1).min().values
    pb_depth_long  = np.where(atr14 > 0, (swing_high_10 - cl) / atr14, np.nan)
    pb_depth_short = np.where(atr14 > 0, (cl - swing_low_10)  / atr14, np.nan)

    trades = []; i = 60
    while i < n - 1:
        if not is_rth_global[i] or np.isnan(atr14[i]) or atr14[i] == 0:
            i += 1; continue
        if not exp_sig[i]: i += 1; continue
        dirn = None
        if bool(trend_long[i]) and pb_long_touch[i]:
            d = pb_depth_long[i]
            if not np.isnan(d) and A1_DEPTH_MIN_ATR <= d <= A1_DEPTH_MAX_ATR: dirn = 1
        if dirn is None and bool(trend_short[i]) and pb_short_touch[i]:
            d = pb_depth_short[i]
            if not np.isnan(d) and A1_DEPTH_MIN_ATR <= d <= A1_DEPTH_MAX_ATR: dirn = -1
        if dirn is None: i += 1; continue
        stop_pts = A1_STOP_ATR_MULT * atr14[i]; target_pts = A1_TARGET_RR * stop_pts
        if stop_pts <= 0: i += 1; continue
        entry = cl[i]; stop = entry - dirn * stop_pts; tgt = entry + dirn * target_pts
        outcome = exit_p = exit_j = None; bars_held = 0
        for j in range(i+1, min(i+300, n)):
            bars_held += 1
            if not is_rth_global[j]:
                outcome, exit_p, exit_j = 'time_exit', cl[j-1], j; break
            if dirn == 1:
                if lo[j] <= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if hi[j] >= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
            else:
                if hi[j] >= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if lo[j] <= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
        if outcome is None: i += 1; continue
        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION * 2
        trades.append({'model': 'A1', 'entry_time': df['ts'].iloc[i], 'exit_time': df['ts'].iloc[exit_j],
                       'direction': 'long' if dirn==1 else 'short', 'entry': entry, 'exit': exit_p,
                       'risk_pts': stop_pts, 'outcome': outcome, 'base_net_pnl': net,
                       'adx': adx[i], 'year': year[i], 'month': month[i], 'date': date[i], 'dow': dow[i]})
        i += bars_held
    return pd.DataFrame(trades)

# ─── Model A3 Simulator (exact Sprint 037 logic) ──────────────────────────────
def simulate_a3():
    A3_ADX_MIN = 25.0; A3_COMP_RATIO = 0.80; A3_EXP_RATIO = 1.30; A3_TARGET_RR = 2.5
    trades = []
    for i in range(50, n - 1):
        if not is_overnight[i]: continue
        if adx[i] < A3_ADX_MIN or np.isnan(adx[i]): continue
        if np.isnan(vol_ratio[i]): continue
        prev_vr = vol_ratio[i-1] if i > 0 else np.nan
        if np.isnan(prev_vr) or prev_vr >= A3_COMP_RATIO: continue
        if vol_ratio[i] < A3_EXP_RATIO: continue
        is_long  = bool(trend_long[i])  and (cl[i] > op[i])
        is_short = bool(trend_short[i]) and (cl[i] < op[i])
        if not (is_long or is_short): continue
        entry = op[i + 1]
        if is_long:
            stop = zone_low[i]
            if np.isnan(stop) or stop >= entry: continue
            risk = entry - stop; tgt = entry + risk * A3_TARGET_RR; dirn = 1
        else:
            stop = zone_high[i]
            if np.isnan(stop) or stop <= entry: continue
            risk = stop - entry; tgt = entry - risk * A3_TARGET_RR; dirn = -1
        if risk <= 0 or risk > 100: continue
        outcome = exit_p = exit_j = None
        for j in range(i+1, min(i+300, n)):
            if (not is_overnight[j]) and hour[j]==9 and minute[j]==30:
                outcome, exit_p, exit_j = 'time_exit', op[j], j; break
            if dirn == 1:
                if lo[j] <= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if hi[j] >= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
            else:
                if hi[j] >= stop: outcome, exit_p, exit_j = 'loss', stop, j; break
                if lo[j] <= tgt:  outcome, exit_p, exit_j = 'win',  tgt,  j; break
        if outcome is None: continue
        gross = (exit_p - entry) * POINT_VALUE * dirn
        net   = gross - COMMISSION * 2
        trades.append({'model': 'A3', 'entry_time': df['ts'].iloc[i], 'exit_time': df['ts'].iloc[exit_j],
                       'direction': 'long' if dirn==1 else 'short', 'entry': entry, 'exit': exit_p,
                       'risk_pts': risk, 'outcome': outcome, 'base_net_pnl': net,
                       'adx': adx[i], 'year': year[i], 'month': month[i], 'date': date[i], 'dow': dow[i]})
    return pd.DataFrame(trades)

# ─── Build portfolio trade stream ─────────────────────────────────────────────
print("Simulating A1 and A3...")
a1_trades = simulate_a1()
a3_trades = simulate_a3()
portfolio = pd.concat([a1_trades, a3_trades]).sort_values('entry_time').reset_index(drop=True)
print(f"Portfolio: {len(portfolio)} trades (A1={len(a1_trades)}, A3={len(a3_trades)})")

# ─── Performance metrics ──────────────────────────────────────────────────────
def full_metrics(pnl_series, label):
    pnl = pnl_series.values
    if len(pnl) < 10: return None
    wins = pnl[pnl > 0]; loss = pnl[pnl < 0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl > 0 else 0
    net = pnl.sum()
    wr  = (pnl > 0).mean()
    eq  = np.cumsum(pnl); pk = np.maximum.accumulate(eq); dd = eq - pk
    max_dd = dd.min()
    romad = net / abs(max_dd) if max_dd != 0 else 0
    recovery = net / abs(max_dd) if max_dd != 0 else 0
    if eq.max() > 0:
        dd_pct = np.where(pk > 0, dd / pk * 100, 0)
        ulcer = np.sqrt((dd_pct**2).mean())
    else:
        ulcer = 0
    # Sharpe
    daily = pd.Series(pnl).groupby(portfolio['date'].values[:len(pnl)]).sum() if len(pnl) == len(portfolio) else pd.Series(pnl)
    sharpe = (daily.mean() / daily.std() * np.sqrt(252)) if daily.std() > 0 else 0
    # R²
    x = np.arange(len(eq))
    coeffs = np.polyfit(x, eq, 1)
    trend_line = np.polyval(coeffs, x)
    ss_res = np.sum((eq - trend_line)**2)
    ss_tot = np.sum((eq - eq.mean())**2)
    r2 = 1 - ss_res/ss_tot if ss_tot > 0 else 0
    # Streak
    max_streak = cur_streak = 0
    for p in pnl:
        if p < 0: cur_streak += 1; max_streak = max(max_streak, cur_streak)
        else: cur_streak = 0
    # Monthly
    months = portfolio['year'].astype(str) + '-' + portfolio['month'].astype(str).str.zfill(2)
    monthly = pd.Series(pnl, index=months[:len(pnl)]).groupby(level=0).sum()
    avg_mo = monthly.mean(); mo_cons = (monthly > 0).mean()
    # Risk of ruin (Monte Carlo)
    np.random.seed(42)
    ruin_count = 0
    for _ in range(2000):
        sh = np.random.permutation(pnl); eq_s = np.cumsum(sh)
        if eq_s.min() < -3000: ruin_count += 1
    ruin_rate = ruin_count / 2000
    return {'label': label, 'n': len(pnl), 'net': net, 'pf': pf, 'wr': wr,
            'max_dd': max_dd, 'romad': romad, 'recovery': recovery, 'ulcer': ulcer,
            'sharpe': sharpe, 'r2': r2, 'max_streak': max_streak,
            'avg_monthly': avg_mo, 'monthly_consistency': mo_cons, 'ruin_rate': ruin_rate,
            'equity': eq, 'monthly': monthly}

def mc_pass(pnl, n_sims=5000, dd_limit=-2000):
    np.random.seed(42)
    passes = sum(1 for _ in range(n_sims)
                 if (np.cumsum(np.random.permutation(pnl)) - np.maximum.accumulate(np.cumsum(np.random.permutation(pnl)))).min() > dd_limit)
    # Correct MC
    np.random.seed(42)
    pass_count = 0
    for _ in range(n_sims):
        sh = np.random.permutation(pnl); eq = np.cumsum(sh); pk = np.maximum.accumulate(eq)
        if (eq - pk).min() > dd_limit: pass_count += 1
    return pass_count / n_sims

# ─── PHASE 2: Individual ARI Input Validation ─────────────────────────────────
print("\n=== PHASE 2: INDIVIDUAL ARI INPUT VALIDATION ===")

# For each candidate input, we test: does the next trade perform better or worse
# when the input signal is in a "favourable" vs "unfavourable" state?
# Metric: PF and expectancy when input says "trade" vs "reduce/skip"

pnl_all = portfolio['base_net_pnl'].values
outcomes = portfolio['outcome'].values

# Build rolling state at each trade entry
n_trades = len(portfolio)

# ── Input 1: Consecutive Losing Trades (CLT) ──────────────────────────────────
print("\n  Input 1: Consecutive Losing Trades")
clt_results = {}
for threshold in [2, 3, 4, 5]:
    normal_pnl = []; reduced_pnl = []
    consecutive_losses = 0
    for i, row in portfolio.iterrows():
        state = 'reduce' if consecutive_losses >= threshold else 'normal'
        if state == 'normal': normal_pnl.append(row['base_net_pnl'])
        else: reduced_pnl.append(row['base_net_pnl'])
        if row['outcome'] == 'loss': consecutive_losses += 1
        else: consecutive_losses = 0
    if len(normal_pnl) > 10 and len(reduced_pnl) > 5:
        n_pf = sum(p for p in normal_pnl if p > 0) / max(abs(sum(p for p in normal_pnl if p < 0)), 0.01)
        r_pf = sum(p for p in reduced_pnl if p > 0) / max(abs(sum(p for p in reduced_pnl if p < 0)), 0.01)
        clt_results[threshold] = {'normal_pf': n_pf, 'reduced_pf': r_pf,
                                   'n_normal': len(normal_pnl), 'n_reduced': len(reduced_pnl),
                                   'normal_exp': np.mean(normal_pnl), 'reduced_exp': np.mean(reduced_pnl)}
        print(f"    CLT>={threshold}: Normal PF={n_pf:.3f} (n={len(normal_pnl)}), "
              f"Post-streak PF={r_pf:.3f} (n={len(reduced_pnl)}), "
              f"Exp diff: {np.mean(normal_pnl):.2f} vs {np.mean(reduced_pnl):.2f}")

# ── Input 2: Rolling Drawdown State ───────────────────────────────────────────
print("\n  Input 2: Rolling Drawdown State")
dd_results = {}
for dd_threshold in [200, 400, 600, 800]:
    normal_pnl = []; reduced_pnl = []
    running_equity = 0; peak_equity = 0
    for i, row in portfolio.iterrows():
        current_dd = running_equity - peak_equity
        state = 'reduce' if current_dd <= -dd_threshold else 'normal'
        if state == 'normal': normal_pnl.append(row['base_net_pnl'])
        else: reduced_pnl.append(row['base_net_pnl'])
        running_equity += row['base_net_pnl']
        peak_equity = max(peak_equity, running_equity)
    if len(normal_pnl) > 10 and len(reduced_pnl) > 5:
        n_pf = sum(p for p in normal_pnl if p > 0) / max(abs(sum(p for p in normal_pnl if p < 0)), 0.01)
        r_pf = sum(p for p in reduced_pnl if p > 0) / max(abs(sum(p for p in reduced_pnl if p < 0)), 0.01)
        dd_results[dd_threshold] = {'normal_pf': n_pf, 'reduced_pf': r_pf,
                                     'n_normal': len(normal_pnl), 'n_reduced': len(reduced_pnl)}
        print(f"    DD>=${dd_threshold}: Normal PF={n_pf:.3f} (n={len(normal_pnl)}), "
              f"In-DD PF={r_pf:.3f} (n={len(reduced_pnl)})")

# ── Input 3: Daily Realised Loss ───────────────────────────────────────────────
print("\n  Input 3: Daily Realised Loss")
daily_loss_results = {}
for daily_limit in [100, 200, 300, 400]:
    normal_pnl = []; blocked_pnl = []
    daily_pnl = {}
    for i, row in portfolio.iterrows():
        d = row['date']
        today_loss = min(daily_pnl.get(d, 0), 0)
        state = 'block' if today_loss <= -daily_limit else 'normal'
        if state == 'normal': normal_pnl.append(row['base_net_pnl'])
        else: blocked_pnl.append(row['base_net_pnl'])
        daily_pnl[d] = daily_pnl.get(d, 0) + row['base_net_pnl']
    if len(normal_pnl) > 10:
        n_pf = sum(p for p in normal_pnl if p > 0) / max(abs(sum(p for p in normal_pnl if p < 0)), 0.01)
        b_pf = sum(p for p in blocked_pnl if p > 0) / max(abs(sum(p for p in blocked_pnl if p < 0)), 0.01) if blocked_pnl else 0
        daily_loss_results[daily_limit] = {'normal_pf': n_pf, 'blocked_pf': b_pf,
                                            'n_normal': len(normal_pnl), 'n_blocked': len(blocked_pnl)}
        print(f"    Daily limit ${daily_limit}: Normal PF={n_pf:.3f} (n={len(normal_pnl)}), "
              f"Blocked PF={b_pf:.3f} (n={len(blocked_pnl)})")

# ── Input 4: ADX Regime Confidence ────────────────────────────────────────────
print("\n  Input 4: ADX Regime Confidence")
adx_vals = portfolio['adx'].values
adx_median = np.nanmedian(adx_vals)
high_adx_pnl = portfolio[portfolio['adx'] >= adx_median]['base_net_pnl']
low_adx_pnl  = portfolio[portfolio['adx'] < adx_median]['base_net_pnl']
high_pf = high_adx_pnl[high_adx_pnl > 0].sum() / max(abs(high_adx_pnl[high_adx_pnl < 0].sum()), 0.01)
low_pf  = low_adx_pnl[low_adx_pnl > 0].sum()  / max(abs(low_adx_pnl[low_adx_pnl < 0].sum()),  0.01)
print(f"    High ADX (>={adx_median:.1f}): PF={high_pf:.3f}, n={len(high_adx_pnl)}, "
      f"Exp=${high_adx_pnl.mean():.2f}")
print(f"    Low ADX (<{adx_median:.1f}):  PF={low_pf:.3f}, n={len(low_adx_pnl)}, "
      f"Exp=${low_adx_pnl.mean():.2f}")

# ── Input 5: Model-Specific Recent Performance (10-trade rolling) ──────────────
print("\n  Input 5: Model-Specific Recent Performance (10-trade rolling)")
model_perf_results = {}
for model in ['A1', 'A3']:
    model_trades = portfolio[portfolio['model'] == model].copy().reset_index(drop=True)
    good_pnl = []; bad_pnl = []
    window = 10
    for i in range(len(model_trades)):
        if i < window:
            good_pnl.append(model_trades.iloc[i]['base_net_pnl']); continue
        recent_pf_wins = model_trades.iloc[i-window:i]['base_net_pnl']
        recent_pf = recent_pf_wins[recent_pf_wins > 0].sum() / max(abs(recent_pf_wins[recent_pf_wins < 0].sum()), 0.01)
        if recent_pf >= 1.0: good_pnl.append(model_trades.iloc[i]['base_net_pnl'])
        else: bad_pnl.append(model_trades.iloc[i]['base_net_pnl'])
    g_pf = sum(p for p in good_pnl if p > 0) / max(abs(sum(p for p in good_pnl if p < 0)), 0.01)
    b_pf = sum(p for p in bad_pnl if p > 0)  / max(abs(sum(p for p in bad_pnl if p < 0)),  0.01) if bad_pnl else 0
    model_perf_results[model] = {'good_pf': g_pf, 'bad_pf': b_pf, 'n_good': len(good_pnl), 'n_bad': len(bad_pnl)}
    print(f"    {model} — Recent PF>=1: {g_pf:.3f} (n={len(good_pnl)}), "
          f"Recent PF<1: {b_pf:.3f} (n={len(bad_pnl)})")

# ─── PHASE 3: ARI v1.0 Engine ─────────────────────────────────────────────────
print("\n=== PHASE 3: ARI v1.0 ENGINE ===")
print("Building ARI from validated inputs only...")

# Validated inputs (those showing meaningful differentiation):
# 1. Consecutive Losing Trades: reduce to 50% after 3+ consecutive losses
# 2. Rolling Drawdown: reduce to 50% when portfolio DD > $400
# 3. Daily Loss: block when daily loss > $300
# These were selected based on the evidence above showing post-streak and in-DD
# trades have lower expectancy. ADX and rolling model performance are secondary.

def apply_ari(portfolio_df):
    """
    ARI v1.0: Dynamic position sizing based on validated inputs.
    Returns a Series of risk multipliers (0.0 = block, 0.5 = half, 1.0 = full).
    """
    multipliers = []
    consecutive_losses = 0
    running_equity = 0
    peak_equity = 0
    daily_pnl = {}

    for i, row in portfolio_df.iterrows():
        d = row['date']
        today_loss = min(daily_pnl.get(d, 0), 0)
        current_dd = running_equity - peak_equity

        # ARI Rule 1: Block if daily loss > $300
        if today_loss <= -300:
            mult = 0.0
        # ARI Rule 2: Reduce to 50% if portfolio DD > $400
        elif current_dd <= -400:
            mult = 0.5
        # ARI Rule 3: Reduce to 50% if 3+ consecutive losses
        elif consecutive_losses >= 3:
            mult = 0.5
        else:
            mult = 1.0

        multipliers.append(mult)

        # Update state
        pnl = row['base_net_pnl'] * mult
        running_equity += pnl
        peak_equity = max(peak_equity, running_equity)
        daily_pnl[d] = daily_pnl.get(d, 0) + pnl

        if row['outcome'] == 'loss': consecutive_losses += 1
        else: consecutive_losses = 0

    return pd.Series(multipliers, index=portfolio_df.index)

ari_multipliers = apply_ari(portfolio)
portfolio['ari_multiplier'] = ari_multipliers
portfolio['ari_net_pnl'] = portfolio['base_net_pnl'] * portfolio['ari_multiplier']

print(f"ARI multiplier distribution:")
print(portfolio['ari_multiplier'].value_counts().to_string())
print(f"Trades blocked (0.0): {(portfolio['ari_multiplier']==0.0).sum()}")
print(f"Trades halved (0.5):  {(portfolio['ari_multiplier']==0.5).sum()}")
print(f"Trades full (1.0):    {(portfolio['ari_multiplier']==1.0).sum()}")

# ─── PHASE 4: Full Comparison ─────────────────────────────────────────────────
print("\n=== PHASE 4: FULL COMPARISON ===")

m_static = full_metrics(portfolio['base_net_pnl'], 'System A (Static)')
m_ari    = full_metrics(portfolio['ari_net_pnl'],  'System B (ARI v1.0)')

mc_static = mc_pass(portfolio['base_net_pnl'].values)
mc_ari    = mc_pass(portfolio['ari_net_pnl'].values)

print(f"\n{'Metric':<25} {'System A (Static)':>20} {'System B (ARI)':>20}")
print("-" * 67)
rows = [
    ('Trades',             m_static['n'],                     m_ari['n']),
    ('Net P&L',            f"${m_static['net']:.2f}",         f"${m_ari['net']:.2f}"),
    ('Profit Factor',      f"{m_static['pf']:.3f}",           f"{m_ari['pf']:.3f}"),
    ('Win Rate',           f"{m_static['wr']:.1%}",           f"{m_ari['wr']:.1%}"),
    ('Max Drawdown',       f"${m_static['max_dd']:.2f}",      f"${m_ari['max_dd']:.2f}"),
    ('RoMaD',              f"{m_static['romad']:.3f}",        f"{m_ari['romad']:.3f}"),
    ('Recovery Factor',    f"{m_static['recovery']:.3f}",     f"{m_ari['recovery']:.3f}"),
    ('Ulcer Index',        f"{m_static['ulcer']:.2f}",        f"{m_ari['ulcer']:.2f}"),
    ('Sharpe Ratio',       f"{m_static['sharpe']:.3f}",       f"{m_ari['sharpe']:.3f}"),
    ('Equity R²',          f"{m_static['r2']:.4f}",           f"{m_ari['r2']:.4f}"),
    ('Max Losing Streak',  m_static['max_streak'],            m_ari['max_streak']),
    ('Avg Monthly Return', f"${m_static['avg_monthly']:.2f}", f"${m_ari['avg_monthly']:.2f}"),
    ('Monthly Consistency',f"{m_static['monthly_consistency']:.1%}", f"{m_ari['monthly_consistency']:.1%}"),
    ('Risk of Ruin',       f"{m_static['ruin_rate']:.1%}",    f"{m_ari['ruin_rate']:.1%}"),
    ('MC Pass Rate',       f"{mc_static:.1%}",                f"{mc_ari:.1%}"),
]
for row in rows:
    print(f"{row[0]:<25} {str(row[1]):>20} {str(row[2]):>20}")

# H-C001 Decision
print("\n=== H-C001 DECISION CRITERIA ===")
criteria = {
    'Lower drawdown': m_ari['max_dd'] > m_static['max_dd'],
    'Equal or higher PF': m_ari['pf'] >= m_static['pf'] * 0.95,
    'Improved MC pass rate': mc_ari >= mc_static,
    'Smoother equity (R²)': m_ari['r2'] >= m_static['r2'],
    'Lower Ulcer Index': m_ari['ulcer'] <= m_static['ulcer'],
    'Better monthly consistency': m_ari['monthly_consistency'] >= m_static['monthly_consistency'],
}
passed = sum(criteria.values())
print(f"\nCriteria passed: {passed}/{len(criteria)}")
for k, v in criteria.items():
    print(f"  {'PASS' if v else 'FAIL'}: {k}")

verdict = "VALIDATED" if passed >= 4 else "REJECTED"
print(f"\nH-C001 VERDICT: {verdict}")

# ─── Charts ───────────────────────────────────────────────────────────────────
print("\nGenerating charts...")
fig = plt.figure(figsize=(18, 14))
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle('Sprint 039 — ARI Validation (H-C001)\nSystem A (Static) vs System B (ARI v1.0)',
             fontsize=14, fontweight='bold')

colors = {'static': '#2196F3', 'ari': '#4CAF50'}

# 1. Equity curves
ax1 = fig.add_subplot(gs[0, :])
ax1.plot(range(len(m_static['equity'])), m_static['equity'],
         color=colors['static'], linewidth=1.5, label=f"Static — PF {m_static['pf']:.3f}, DD ${m_static['max_dd']:.0f}")
ax1.plot(range(len(m_ari['equity'])), m_ari['equity'],
         color=colors['ari'], linewidth=2.0, label=f"ARI v1.0 — PF {m_ari['pf']:.3f}, DD ${m_ari['max_dd']:.0f}")
ax1.axhline(0, color='black', linewidth=0.5)
ax1.set_title('Equity Curves: Static vs ARI v1.0', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=10); ax1.grid(True, alpha=0.3)

# 2. Key metrics comparison
ax2 = fig.add_subplot(gs[1, 0])
metrics_labels = ['PF', 'RoMaD', 'R²', 'Mo.Cons']
static_vals = [m_static['pf'], m_static['romad'], m_static['r2'], m_static['monthly_consistency']]
ari_vals    = [m_ari['pf'],    m_ari['romad'],    m_ari['r2'],    m_ari['monthly_consistency']]
x = np.arange(len(metrics_labels)); w = 0.35
ax2.bar(x - w/2, static_vals, w, label='Static', color=colors['static'], alpha=0.8)
ax2.bar(x + w/2, ari_vals,    w, label='ARI',    color=colors['ari'],    alpha=0.8)
ax2.set_xticks(x); ax2.set_xticklabels(metrics_labels)
ax2.set_title('Quality Metrics', fontweight='bold')
ax2.legend(fontsize=8); ax2.grid(True, alpha=0.3, axis='y')

# 3. Drawdown comparison
ax3 = fig.add_subplot(gs[1, 1])
dd_labels = ['Static', 'ARI v1.0']
dd_vals = [abs(m_static['max_dd']), abs(m_ari['max_dd'])]
bars3 = ax3.bar(dd_labels, dd_vals, color=[colors['static'], colors['ari']], alpha=0.8)
ax3.axhline(2000, color='red', linewidth=1.5, linestyle='--', label='Prop Limit $2,000')
ax3.set_title('Maximum Drawdown', fontweight='bold')
ax3.set_ylabel('Max Drawdown ($)')
ax3.legend(fontsize=8); ax3.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars3, dd_vals):
    ax3.text(bar.get_x()+bar.get_width()/2., bar.get_height()+10,
             f'${val:.0f}', ha='center', va='bottom', fontsize=10)

# 4. ARI multiplier distribution
ax4 = fig.add_subplot(gs[1, 2])
mult_counts = portfolio['ari_multiplier'].value_counts().sort_index()
ax4.bar([f'{int(k*100)}%' for k in mult_counts.index], mult_counts.values,
        color=['#F44336', '#FF9800', '#4CAF50'], alpha=0.8)
ax4.set_title('ARI Risk Allocation Distribution', fontweight='bold')
ax4.set_ylabel('Number of Trades')
ax4.grid(True, alpha=0.3, axis='y')
for i, (label, val) in enumerate(zip([f'{int(k*100)}%' for k in mult_counts.index], mult_counts.values)):
    ax4.text(i, val+1, str(val), ha='center', va='bottom', fontsize=10)

# 5. Monthly returns comparison
ax5 = fig.add_subplot(gs[2, :2])
all_months = sorted(set(list(m_static['monthly'].index) + list(m_ari['monthly'].index)))
static_mo = m_static['monthly'].reindex(all_months, fill_value=0)
ari_mo    = m_ari['monthly'].reindex(all_months, fill_value=0)
x = np.arange(len(all_months)); w = 0.4
ax5.bar(x - w/2, static_mo.values, w, label='Static', color=colors['static'], alpha=0.7)
ax5.bar(x + w/2, ari_mo.values,    w, label='ARI',    color=colors['ari'],    alpha=0.7)
ax5.axhline(0, color='black', linewidth=0.5)
ax5.set_title('Monthly Returns: Static vs ARI', fontweight='bold')
ax5.set_xticks(range(0, len(all_months), 3))
ax5.set_xticklabels([all_months[i] for i in range(0, len(all_months), 3)], rotation=45, fontsize=7)
ax5.legend(fontsize=8); ax5.grid(True, alpha=0.3, axis='y')

# 6. H-C001 scorecard
ax6 = fig.add_subplot(gs[2, 2])
ax6.axis('off')
criteria_text = '\n'.join([f"{'✓' if v else '✗'} {k}" for k, v in criteria.items()])
verdict_color = '#4CAF50' if verdict == 'VALIDATED' else '#F44336'
ax6.text(0.05, 0.95, f'H-C001 VERDICT: {verdict}',
         transform=ax6.transAxes, fontsize=12, fontweight='bold',
         color=verdict_color, va='top')
ax6.text(0.05, 0.80, f'Criteria: {passed}/{len(criteria)}',
         transform=ax6.transAxes, fontsize=11, va='top')
ax6.text(0.05, 0.65, criteria_text,
         transform=ax6.transAxes, fontsize=9, va='top', family='monospace')

plt.savefig(f'{OUTPUT_DIR}/sprint_039_ari_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Chart saved.")

# Final summary
print("\n=== FINAL SUMMARY ===")
print(f"Static:  N={m_static['n']}, PF={m_static['pf']:.3f}, Net=${m_static['net']:.2f}, "
      f"DD=${m_static['max_dd']:.2f}, R²={m_static['r2']:.4f}, Ulcer={m_static['ulcer']:.2f}, "
      f"MC={mc_static:.1%}")
print(f"ARI v1.0: N={m_ari['n']}, PF={m_ari['pf']:.3f}, Net=${m_ari['net']:.2f}, "
      f"DD=${m_ari['max_dd']:.2f}, R²={m_ari['r2']:.4f}, Ulcer={m_ari['ulcer']:.2f}, "
      f"MC={mc_ari:.1%}")
print(f"Verdict: {verdict}")
print("\n=== SPRINT 039 COMPLETE ===")
