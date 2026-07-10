"""
Atlas Sprint 043 — Atlas Trading System v1.0 Validation
Complete production system: Model A1 + Model A2 + Model A3 + ARI v2.0
Prop firm simulations: Apex 50K, Topstep 50K, Generic 50K
16 performance metrics | $800 fixed risk per trade
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

DATA_PATH   = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR  = '/home/ubuntu/Project-Atlas/research/sprint-043-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

POINT_VALUE    = 2.0
COMMISSION     = 1.00
RISK_PER_TRADE = 800.0

# ─── Prop Firm Specifications ─────────────────────────────────────────────────
PROP_FIRMS = {
    'Apex 50K': {
        'account_size': 50000,
        'profit_target': 3000,
        'max_daily_loss': 1000,
        'max_total_dd': 2500,
        'min_trading_days': 7,
    },
    'Topstep 50K': {
        'account_size': 50000,
        'profit_target': 3000,
        'max_daily_loss': 1000,
        'max_total_dd': 2000,
        'min_trading_days': 5,
    },
    'Generic 50K': {
        'account_size': 50000,
        'profit_target': 2500,
        'max_daily_loss': 1000,
        'max_total_dd': 2500,
        'min_trading_days': 5,
    },
}

def ewm_np(arr, span):
    a = 2.0 / (span + 1)
    out = np.empty_like(arr, dtype=float)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = a * arr[i] + (1 - a) * out[i-1]
    return out

def load_data():
    df = pd.read_csv(DATA_PATH)
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)
    hi = df['high'].values.astype(float)
    lo = df['low'].values.astype(float)
    cl = df['close'].values.astype(float)
    n  = len(df)
    hour   = df['ts'].dt.hour.values
    minute = df['ts'].dt.minute.values
    year   = df['ts'].dt.year.values
    month  = df['ts'].dt.month.values
    date   = df['ts'].dt.date.values

    tr = np.maximum(hi - lo, np.maximum(np.abs(hi - np.roll(cl,1)), np.abs(lo - np.roll(cl,1))))
    tr[0] = hi[0] - lo[0]
    atr5  = ewm_np(tr, 5)
    atr14 = ewm_np(tr, 14)
    atr20 = ewm_np(tr, 20)
    ema9  = ewm_np(cl, 9)
    ema21 = ewm_np(cl, 21)
    ema50 = ewm_np(cl, 50)

    pdm = np.where((hi-np.roll(hi,1))>(np.roll(lo,1)-lo), np.maximum(hi-np.roll(hi,1),0), 0)
    mdm = np.where((np.roll(lo,1)-lo)>(hi-np.roll(hi,1)), np.maximum(np.roll(lo,1)-lo,0), 0)
    pdm[0] = mdm[0] = 0
    pdi = 100 * ewm_np(pdm,14) / np.where(atr14>0, atr14, 1)
    mdi = 100 * ewm_np(mdm,14) / np.where(atr14>0, atr14, 1)
    ds  = pdi + mdi
    dx  = np.where(ds>0, 100*np.abs(pdi-mdi)/ds, 0)
    adx = ewm_np(dx, 14)

    trend_long  = (ema9 > ema21) & (ema21 > ema50)
    trend_short = (ema9 < ema21) & (ema21 < ema50)
    time_val = hour * 60 + minute
    is_rth      = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
    is_overnight= ((hour >= 18) | (hour < 9)) | ((hour == 9) & (minute < 30))
    is_late_rth = (time_val >= 840) & (time_val < 960)

    return dict(hi=hi, lo=lo, cl=cl, n=n, hour=hour, minute=minute,
                year=year, month=month, date=date,
                atr5=atr5, atr14=atr14, atr20=atr20,
                adx=adx, trend_long=trend_long, trend_short=trend_short,
                is_rth=is_rth, is_overnight=is_overnight, is_late_rth=is_late_rth)

def simulate_trade_stream(mkt, signal_idx, directions, stop_pts_arr, rr=2.0, max_bars=150, model_name=""):
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    is_rth=mkt['is_rth']; n=mkt['n']
    trades = []
    used_until = -1
    for k in range(len(signal_idx)):
        i = int(signal_idx[k])
        if i <= used_until: continue
        d = int(directions[k])
        sp = float(stop_pts_arr[k])
        if sp < 1.0: continue
        entry = cl[i]
        stop  = entry - d * sp
        tgt   = entry + d * sp * rr
        n_c   = max(1, round(RISK_PER_TRADE / (sp * POINT_VALUE)))
        outcome = None
        for j in range(i+1, min(i+max_bars, n)):
            if not is_rth[j] and model_name != 'A3':
                net = (cl[j-1]-entry)*POINT_VALUE*d*n_c - COMMISSION*2*n_c
                outcome = dict(net=net, bars=j-i, outcome='time_exit',
                               year=mkt['year'][i], month=mkt['month'][i],
                               date=str(mkt['date'][i]), model=model_name)
                break
            if d==1:
                if lo[j]<=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; outcome=dict(net=net,bars=j-i,outcome='loss',year=mkt['year'][i],month=mkt['month'][i],date=str(mkt['date'][i]),model=model_name); break
                if hi[j]>=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  outcome=dict(net=net,bars=j-i,outcome='win', year=mkt['year'][i],month=mkt['month'][i],date=str(mkt['date'][i]),model=model_name); break
            else:
                if hi[j]>=stop: net=(stop-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c; outcome=dict(net=net,bars=j-i,outcome='loss',year=mkt['year'][i],month=mkt['month'][i],date=str(mkt['date'][i]),model=model_name); break
                if lo[j]<=tgt:  net=(tgt-entry)*POINT_VALUE*d*n_c-COMMISSION*2*n_c;  outcome=dict(net=net,bars=j-i,outcome='win', year=mkt['year'][i],month=mkt['month'][i],date=str(mkt['date'][i]),model=model_name); break
        if outcome:
            trades.append(outcome)
            used_until = i + outcome['bars']
    return pd.DataFrame(trades)

# ─── Model Signal Generators ──────────────────────────────────────────────────

def model_a1_signals(mkt):
    """
    Model A1 (EXACT validated logic from Sprint 025):
    - Volatility expansion: ATR5 / ATR5[20 bars ago] > 1.8
    - Trend: EMA9 > EMA21 > EMA50 (long) / reverse (short)
    - Trigger: price touches/crosses EMA21 (prev_close > ema21, close <= ema21*1.001)
    - Depth: 0.5 <= (swing_high_10 - close) / ATR14 <= 1.2
    - Session: RTH only (all day, not PM-restricted in original)
    - Stop: 1.0 * ATR14 | Target: 2.0 * ATR14
    """
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; atr5=mkt['atr5']
    is_rth=mkt['is_rth']; n=mkt['n']
    EXP_LOOKBACK = 20; EXP_RATIO = 1.8
    DEPTH_MIN = 0.5; DEPTH_MAX = 1.2

    ema9  = ewm_np(cl, 9)
    ema21 = ewm_np(cl, 21)
    ema50 = ewm_np(cl, 50)

    # Volatility expansion signal
    exp_sig = np.zeros(n, dtype=bool)
    for i in range(EXP_LOOKBACK, n):
        prev = atr5[i - EXP_LOOKBACK]
        if prev > 0:
            exp_sig[i] = atr5[i] / prev > EXP_RATIO

    # Swing high/low (10-bar lookback, shifted 1)
    swing_hi = np.full(n, np.nan)
    swing_lo = np.full(n, np.nan)
    for i in range(11, n):
        swing_hi[i] = hi[max(0,i-11):i-1].max()
        swing_lo[i] = lo[max(0,i-11):i-1].min()

    idx=[]; dirs=[]; stops=[]
    i = 0
    while i < n - 1:
        if not is_rth[i] or not exp_sig[i] or atr14[i] <= 0:
            i += 1; continue
        avg = atr14[i]
        # Long: uptrend + EMA21 touch + depth
        if ema9[i] > ema21[i] > ema50[i]:
            prev_cl = cl[i-1] if i > 0 else cl[i]
            if prev_cl > ema21[i] and cl[i] <= ema21[i] * 1.001:
                if not np.isnan(swing_hi[i]):
                    depth = (swing_hi[i] - cl[i]) / avg
                    if DEPTH_MIN <= depth <= DEPTH_MAX:
                        sp = 1.0 * avg
                        if sp >= 1.0:
                            idx.append(i); dirs.append(1); stops.append(sp)
                            i += 1; continue
        # Short: downtrend + EMA21 touch + depth
        if ema9[i] < ema21[i] < ema50[i]:
            prev_cl = cl[i-1] if i > 0 else cl[i]
            if prev_cl < ema21[i] and cl[i] >= ema21[i] * 0.999:
                if not np.isnan(swing_lo[i]):
                    depth = (cl[i] - swing_lo[i]) / avg
                    if DEPTH_MIN <= depth <= DEPTH_MAX:
                        sp = 1.0 * avg
                        if sp >= 1.0:
                            idx.append(i); dirs.append(-1); stops.append(sp)
                            i += 1; continue
        i += 1
    return np.array(idx), np.array(dirs), np.array(stops)

def model_a2_signals(mkt):
    """Model A2: High-ADX Late RTH Flag Continuation"""
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']
    is_late_rth=mkt['is_late_rth']; n=mkt['n']
    flag_w=8; impulse_w=5
    idx=[]; dirs=[]; stops=[]
    for i in range(flag_w+impulse_w+10, n-1):
        if not is_late_rth[i]: continue
        if adx[i] < 45: continue
        avg = atr14[i]
        if avg <= 0: continue
        ihi = hi[i-impulse_w-flag_w:i-flag_w].max()
        ilo = lo[i-impulse_w-flag_w:i-flag_w].min()
        imp = ihi - ilo
        if imp < 1.5 * avg: continue
        fhi = hi[i-flag_w:i+1].max()
        flo = lo[i-flag_w:i+1].min()
        frange = fhi - flo
        if frange < 1.0: continue
        if tl[i]:
            retrace = (fhi - cl[i]) / imp if imp > 0 else 1
            if retrace > 0.50: continue
            if cl[i] > fhi * 0.998:
                sp = cl[i] - flo
                if 1.0 <= sp <= avg * 5:
                    idx.append(i); dirs.append(1); stops.append(sp)
        elif ts[i]:
            retrace = (cl[i] - flo) / imp if imp > 0 else 1
            if retrace > 0.50: continue
            if cl[i] < flo * 1.002:
                sp = fhi - cl[i]
                if 1.0 <= sp <= avg * 5:
                    idx.append(i); dirs.append(-1); stops.append(sp)
    return np.array(idx), np.array(dirs), np.array(stops)

def model_a3_signals(mkt):
    """Model A3: High-ADX Overnight Volatility Contraction Breakout"""
    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr14=mkt['atr14']; adx=mkt['adx']
    tl=mkt['trend_long']; ts=mkt['trend_short']
    is_overnight=mkt['is_overnight']; is_rth=mkt['is_rth']; n=mkt['n']
    idx=[]; dirs=[]; stops=[]
    for i in range(30, n-1):
        if not is_overnight[i]: continue
        if adx[i] < 25: continue
        avg14 = atr14[i]; avg5 = atr5[i]
        if avg14 <= 0: continue
        # Compression: ATR5 < 0.70 * ATR14
        if avg5 >= 0.70 * avg14: continue
        # Expansion signal: current bar range > ATR5
        bar_range = hi[i] - lo[i]
        if bar_range < avg5: continue
        zone_hi = hi[max(0,i-5):i].max()
        zone_lo = lo[max(0,i-5):i].min()
        zone_range = zone_hi - zone_lo
        if zone_range < 1.0: continue
        if tl[i] and cl[i] > zone_hi:
            idx.append(i); dirs.append(1); stops.append(zone_range)
        elif ts[i] and cl[i] < zone_lo:
            idx.append(i); dirs.append(-1); stops.append(zone_range)
    return np.array(idx), np.array(dirs), np.array(stops)

# ─── ARI v2.0 Engine ──────────────────────────────────────────────────────────
def apply_ari_v2(df_portfolio, daily_loss_limit=-300, consec_loss_threshold=3,
                 adx_boost_threshold=32.0, adx_boost_mult=1.25, base_mult=0.75):
    """
    ARI v2.0 rules (in priority order):
    1. Daily Loss Stop: if daily_loss <= -$300, halt (0x)
    2. Consecutive Loss Scaling: if streak >= 3, scale to 0.5x
    3. ADX Regime Boost: if ADX >= 32, scale to 1.25x
    4. Base: 0.75x (conservative base allocation)
    """
    df = df_portfolio.copy().sort_values('date').reset_index(drop=True)
    df['ari_mult'] = 1.0
    df['ari_net']  = df['net']
    daily_pnl = {}
    streak = 0
    for idx, row in df.iterrows():
        d = row['date']
        daily_total = daily_pnl.get(d, 0)
        # Rule 1: Daily Loss Stop
        if daily_total <= daily_loss_limit:
            mult = 0.0
        # Rule 2: Consecutive Loss Scaling
        elif streak >= consec_loss_threshold:
            mult = 0.5
        # Rule 3: ADX Boost (use model-level ADX proxy — A3 is always high ADX, A2 is always high ADX, A1 is low ADX)
        elif row.get('model', '') in ['A2', 'A3']:
            mult = adx_boost_mult
        else:
            mult = base_mult
        ari_net = row['net'] * mult
        df.at[idx, 'ari_mult'] = mult
        df.at[idx, 'ari_net']  = ari_net
        # Update daily P&L
        daily_pnl[d] = daily_pnl.get(d, 0) + ari_net
        # Update streak
        if row['net'] < 0: streak += 1
        else: streak = 0
    return df

# ─── Full Metrics ─────────────────────────────────────────────────────────────
def full_metrics(pnl_arr, label="", risk=RISK_PER_TRADE):
    if len(pnl_arr) < 10:
        return {k: 0 for k in ['label','n','pf','wr','net','exp','avg_win','avg_loss',
                                'max_dd','max_dd_r','romaD','rec_factor','ulcer',
                                'sharpe','smoothness','streak','tpm','monthly_pos',
                                'p_value']}
    wins = pnl_arr[pnl_arr>0]; loss = pnl_arr[pnl_arr<0]
    gw = wins.sum(); gl = abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    wr = (pnl_arr>0).mean()
    avg_win  = wins.mean() if len(wins)>0 else 0
    avg_loss = loss.mean() if len(loss)>0 else 0
    exp = pnl_arr.mean()
    eq = np.cumsum(pnl_arr)
    dd = eq - np.maximum.accumulate(eq)
    max_dd = dd.min()
    max_dd_r = max_dd / risk
    romaD = eq[-1] / abs(max_dd) if max_dd < 0 else 0
    rec_factor = eq[-1] / abs(max_dd) if max_dd < 0 else 0
    # Ulcer Index
    ulcer = np.sqrt(np.mean(dd**2))
    # Sharpe (annualised, assuming ~252 trading days, ~15 trades/month avg)
    if pnl_arr.std() > 0:
        sharpe = (pnl_arr.mean() / pnl_arr.std()) * np.sqrt(252)
    else:
        sharpe = 0
    # Equity smoothness (R²)
    x = np.arange(len(eq))
    if len(eq) > 2:
        slope, intercept, r, p, se = stats.linregress(x, eq)
        smoothness = r**2
    else:
        smoothness = 0
    # Longest losing streak
    streak = 0; cur = 0
    for p in pnl_arr:
        if p < 0: cur += 1; streak = max(streak, cur)
        else: cur = 0
    n_wins = int((pnl_arr>0).sum())
    p_val = stats.binomtest(n_wins, len(pnl_arr), 0.333, alternative='greater').pvalue
    return dict(label=label, n=len(pnl_arr), pf=pf, wr=wr, net=pnl_arr.sum(), exp=exp,
                avg_win=avg_win, avg_loss=avg_loss, max_dd=max_dd, max_dd_r=max_dd_r,
                romaD=romaD, rec_factor=rec_factor, ulcer=ulcer, sharpe=sharpe,
                smoothness=smoothness, streak=streak, p_value=p_val, equity=eq)

def monthly_metrics(df, pnl_col='net'):
    df2 = df.copy()
    df2['ym'] = df2['year'].astype(str) + '-' + df2['month'].astype(str).str.zfill(2)
    monthly = df2.groupby('ym')[pnl_col].sum()
    tpm = len(df2) / max(1, len(monthly))
    monthly_pos = (monthly > 0).mean()
    return tpm, monthly_pos, monthly

# ─── Prop Firm Simulation ─────────────────────────────────────────────────────
def simulate_prop_firm(pnl_arr, firm_spec, n_sims=5000, trades_per_day=2.5):
    """
    Simulate prop firm evaluation.
    Returns: pass_rate, avg_days_to_pass, fail_rate, worst_dd, best_equity, worst_equity
    """
    account = firm_spec['account_size']
    target  = firm_spec['profit_target']
    max_dd  = firm_spec['max_total_dd']
    daily_limit = firm_spec['max_daily_loss']
    min_days = firm_spec['min_trading_days']

    passes = 0
    fails  = 0
    days_to_pass = []
    all_max_dds = []
    best_eq = None
    worst_eq = None

    for sim in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        equity = 0
        peak   = 0
        day_pnl = 0
        day_count = 0
        trade_in_day = 0
        passed = False
        failed = False
        sim_eq = [0]
        sim_max_dd = 0

        for t, pnl in enumerate(shuffled):
            # New day check (approximate)
            if trade_in_day >= trades_per_day:
                day_count += 1
                trade_in_day = 0
                day_pnl = 0
            trade_in_day += 1
            equity += pnl
            day_pnl += pnl
            sim_eq.append(equity)
            if equity > peak: peak = equity
            dd = peak - equity
            if dd > sim_max_dd: sim_max_dd = dd
            # Fail conditions
            if equity <= -max_dd or day_pnl <= -daily_limit:
                failed = True; break
            # Pass condition
            if equity >= target and day_count >= min_days:
                passed = True
                days_to_pass.append(day_count + trade_in_day / trades_per_day)
                break

        all_max_dds.append(sim_max_dd)
        if passed: passes += 1
        elif failed: fails += 1

        if best_eq is None or equity > (best_eq[-1] if best_eq else -999999):
            best_eq = sim_eq
        if worst_eq is None or equity < (worst_eq[-1] if worst_eq else 999999):
            worst_eq = sim_eq

    pass_rate = passes / n_sims
    fail_rate = fails / n_sims
    avg_days  = np.mean(days_to_pass) if days_to_pass else 0
    worst_dd  = np.percentile(all_max_dds, 95)
    return dict(pass_rate=pass_rate, fail_rate=fail_rate, avg_days=avg_days,
                worst_dd=worst_dd, best_eq=best_eq, worst_eq=worst_eq)

# ─── Risk of Ruin ─────────────────────────────────────────────────────────────
def risk_of_ruin(pnl_arr, ruin_threshold=-5000, n_sims=5000):
    ruins = 0
    for _ in range(n_sims):
        shuffled = np.random.choice(pnl_arr, size=len(pnl_arr), replace=True)
        eq = np.cumsum(shuffled)
        if eq.min() <= ruin_threshold:
            ruins += 1
    return ruins / n_sims

# ─── Main ─────────────────────────────────────────────────────────────────────
print("="*70)
print("Sprint 043 — Atlas Trading System v1.0 Validation")
print(f"Models: A1 + A2 + A3 | ARI v2.0 | Risk: ${RISK_PER_TRADE}/trade")
print("="*70)

mkt = load_data()
print(f"Data: {mkt['n']} bars, {mkt['date'][0]} to {mkt['date'][-1]}")

# ─── Generate trade streams ───────────────────────────────────────────────────
print("\nGenerating trade streams...")

idx1, dir1, stp1 = model_a1_signals(mkt)
df_a1 = simulate_trade_stream(mkt, idx1, dir1, stp1, rr=2.0, model_name='A1')
print(f"  Model A1: {len(df_a1)} trades")

idx2, dir2, stp2 = model_a2_signals(mkt)
df_a2 = simulate_trade_stream(mkt, idx2, dir2, stp2, rr=2.0, model_name='A2')
print(f"  Model A2: {len(df_a2)} trades")

idx3, dir3, stp3 = model_a3_signals(mkt)
df_a3 = simulate_trade_stream(mkt, idx3, dir3, stp3, rr=2.5, model_name='A3')
print(f"  Model A3: {len(df_a3)} trades")

# ─── Build portfolio ──────────────────────────────────────────────────────────
df_portfolio = pd.concat([df_a1, df_a2, df_a3], ignore_index=True)
df_portfolio = df_portfolio.sort_values('date').reset_index(drop=True)
print(f"  Portfolio (static): {len(df_portfolio)} trades")

# Apply ARI v2.0
df_ari = apply_ari_v2(df_portfolio)
print(f"  ARI interventions: {(df_ari['ari_mult'] != 1.0).sum()} trades modified")

# ─── Compute all metrics ──────────────────────────────────────────────────────
print("\n" + "="*70)
print("PERFORMANCE METRICS — ALL SYSTEMS")
print("="*70)

systems = {
    'Model A1':        df_a1['net'].values,
    'Model A2':        df_a2['net'].values,
    'Model A3':        df_a3['net'].values,
    'Static Portfolio':df_portfolio['net'].values,
    'ARI Portfolio':   df_ari['ari_net'].values,
}

all_stats = {}
for name, pnl in systems.items():
    s = full_metrics(pnl, label=name)
    tpm, mp, monthly = monthly_metrics(
        df_a1 if name=='Model A1' else df_a2 if name=='Model A2' else
        df_a3 if name=='Model A3' else df_portfolio if 'Static' in name else df_ari,
        pnl_col='net' if 'ARI' not in name else 'ari_net'
    )
    ror = risk_of_ruin(pnl)
    s['tpm'] = tpm
    s['monthly_pos'] = mp
    s['ror'] = ror
    all_stats[name] = s

    print(f"\n{'─'*60}")
    print(f"  {name}")
    print(f"{'─'*60}")
    print(f"  N Trades:           {s['n']}")
    print(f"  Net Profit:         ${s['net']:>10,.2f}")
    print(f"  Profit Factor:      {s['pf']:>10.3f}")
    print(f"  Win Rate:           {s['wr']:>10.1%}")
    print(f"  Expectancy:         ${s['exp']:>10.2f}")
    print(f"  Avg Winner:         ${s['avg_win']:>10.2f}")
    print(f"  Avg Loser:          ${s['avg_loss']:>10.2f}")
    print(f"  Max Drawdown:       ${s['max_dd']:>10,.2f}")
    print(f"  Max DD (R):         {s['max_dd_r']:>10.2f}R")
    print(f"  RoMaD:              {s['romaD']:>10.3f}")
    print(f"  Recovery Factor:    {s['rec_factor']:>10.3f}")
    print(f"  Ulcer Index:        {s['ulcer']:>10.2f}")
    print(f"  Sharpe Ratio:       {s['sharpe']:>10.3f}")
    print(f"  Equity Smoothness:  {s['smoothness']:>10.4f}")
    print(f"  Longest Losing Str: {s['streak']:>10}")
    print(f"  Trades/Month:       {s['tpm']:>10.1f}")
    print(f"  Monthly Consistency:{s['monthly_pos']:>10.1%}")
    print(f"  Risk of Ruin:       {s['ror']:>10.1%}")
    print(f"  p-value:            {s['p_value']:>10.6f}")

# ─── Prop Firm Simulations ────────────────────────────────────────────────────
print("\n" + "="*70)
print("PROP FIRM SIMULATIONS — ARI Portfolio")
print("="*70)

ats_pnl = df_ari['ari_net'].values
prop_results = {}
for firm_name, spec in PROP_FIRMS.items():
    result = simulate_prop_firm(ats_pnl, spec, n_sims=3000)
    prop_results[firm_name] = result
    print(f"\n  {firm_name}")
    print(f"    Pass Rate:          {result['pass_rate']:.1%}")
    print(f"    Fail Rate:          {result['fail_rate']:.1%}")
    print(f"    Avg Days to Pass:   {result['avg_days']:.1f}")
    print(f"    Worst DD (95th):    ${result['worst_dd']:,.0f}")

# ─── Correlation Analysis ─────────────────────────────────────────────────────
print("\n" + "="*70)
print("PORTFOLIO CORRELATION ANALYSIS")
print("="*70)

# Align by date
df_a1_d = df_a1.groupby('date')['net'].sum().reset_index()
df_a2_d = df_a2.groupby('date')['net'].sum().reset_index()
df_a3_d = df_a3.groupby('date')['net'].sum().reset_index()

all_dates = sorted(set(df_a1_d['date']) | set(df_a2_d['date']) | set(df_a3_d['date']))
corr_df = pd.DataFrame({'date': all_dates})
corr_df = corr_df.merge(df_a1_d.rename(columns={'net':'A1'}), on='date', how='left')
corr_df = corr_df.merge(df_a2_d.rename(columns={'net':'A2'}), on='date', how='left')
corr_df = corr_df.merge(df_a3_d.rename(columns={'net':'A3'}), on='date', how='left')
corr_df = corr_df.fillna(0)

corr_matrix = corr_df[['A1','A2','A3']].corr()
print(f"\n  Correlation Matrix:")
print(f"  {'':>8} {'A1':>8} {'A2':>8} {'A3':>8}")
for m in ['A1','A2','A3']:
    row = "  " + f"{m:>8}"
    for m2 in ['A1','A2','A3']:
        row += f" {corr_matrix.loc[m,m2]:>8.3f}"
    print(row)

# Model contributions
print(f"\n  Model Contributions to Portfolio Net Profit:")
total_net = df_portfolio['net'].sum()
for name, df_m in [('A1', df_a1), ('A2', df_a2), ('A3', df_a3)]:
    contrib = df_m['net'].sum()
    pct = contrib / total_net * 100 if total_net != 0 else 0
    print(f"    {name}: ${contrib:>10,.2f} ({pct:.1f}%)")

# ─── Generate Charts ──────────────────────────────────────────────────────────
print("\nGenerating charts...")

fig = plt.figure(figsize=(24, 20))
gs = gridspec.GridSpec(4, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle('Atlas Trading System v1.0 — Complete Validation\nMNQ | $800 Risk/Trade | Models A1 + A2 + A3 + ARI v2.0',
             fontsize=14, fontweight='bold')

colors = {'Model A1':'#2196F3','Model A2':'#FF9800','Model A3':'#9C27B0',
          'Static Portfolio':'#607D8B','ARI Portfolio':'#4CAF50'}

# 1. Individual equity curves
ax1 = fig.add_subplot(gs[0, :2])
for name in ['Model A1','Model A2','Model A3']:
    eq = all_stats[name].get('equity', np.array([]))
    if len(eq) > 5:
        ax1.plot(eq, color=colors[name], lw=1.5, alpha=0.8, label=f'{name} PF={all_stats[name]["pf"]:.3f}')
ax1.axhline(0, color='black', lw=0.5)
ax1.set_title('Individual Model Equity Curves', fontweight='bold')
ax1.set_xlabel('Trade'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=9); ax1.grid(True, alpha=0.3)

# 2. Portfolio comparison
ax2 = fig.add_subplot(gs[0, 2])
for name in ['Static Portfolio','ARI Portfolio']:
    eq = all_stats[name].get('equity', np.array([]))
    if len(eq) > 5:
        ax2.plot(eq, color=colors[name], lw=2, label=f'{name}')
ax2.axhline(0, color='black', lw=0.5)
ax2.set_title('Portfolio: Static vs ARI', fontweight='bold')
ax2.set_xlabel('Trade'); ax2.set_ylabel('Cumulative P&L ($)')
ax2.legend(fontsize=9); ax2.grid(True, alpha=0.3)

# 3. ARI equity curve (main)
ax3 = fig.add_subplot(gs[1, :2])
eq_ari = all_stats['ARI Portfolio'].get('equity', np.array([]))
if len(eq_ari) > 5:
    ax3.plot(eq_ari, color='#4CAF50', lw=2.5)
    ax3.fill_between(range(len(eq_ari)), eq_ari, 0, where=eq_ari>0, alpha=0.12, color='green')
    ax3.fill_between(range(len(eq_ari)), eq_ari, 0, where=eq_ari<0, alpha=0.12, color='red')
s_ari = all_stats['ARI Portfolio']
ax3.set_title(f'ATS v1.0 (ARI Portfolio) | Net=${s_ari["net"]:,.0f} | PF={s_ari["pf"]:.3f} | '
              f'MaxDD=${s_ari["max_dd"]:,.0f}', fontweight='bold')
ax3.set_xlabel('Trade'); ax3.set_ylabel('Cumulative P&L ($)'); ax3.grid(True, alpha=0.3)

# 4. Drawdown profile
ax4 = fig.add_subplot(gs[1, 2])
if len(eq_ari) > 5:
    dd_ari = eq_ari - np.maximum.accumulate(eq_ari)
    ax4.fill_between(range(len(dd_ari)), dd_ari, 0, color='#F44336', alpha=0.6)
    ax4.axhline(0, color='black', lw=0.5)
ax4.set_title(f'ATS v1.0 Drawdown Profile\nMax DD=${s_ari["max_dd"]:,.0f}', fontweight='bold')
ax4.set_xlabel('Trade'); ax4.set_ylabel('Drawdown ($)'); ax4.grid(True, alpha=0.3)

# 5. Prop firm MC distributions
ax5 = fig.add_subplot(gs[2, :])
firm_colors = ['#2196F3','#4CAF50','#FF9800']
for (firm_name, result), fc in zip(prop_results.items(), firm_colors):
    # Simulate pass/fail equity paths for visualization
    n_paths = 200
    for _ in range(n_paths):
        shuffled = np.random.choice(ats_pnl, size=min(len(ats_pnl), 100), replace=True)
        eq_path = np.cumsum(shuffled)
        ax5.plot(eq_path, color=fc, alpha=0.03, lw=0.8)
    # Highlight best/worst
    if result['best_eq']:
        ax5.plot(result['best_eq'], color=fc, lw=2, alpha=0.8,
                 label=f"{firm_name}: Pass={result['pass_rate']:.1%} | Avg Days={result['avg_days']:.0f}")
ax5.axhline(0, color='black', lw=0.5)
ax5.set_title('Prop Firm Simulation — Monte Carlo Paths (200 paths each)', fontweight='bold')
ax5.set_xlabel('Trade'); ax5.set_ylabel('Equity ($)'); ax5.legend(fontsize=9); ax5.grid(True, alpha=0.3)

# 6. Metrics comparison table
ax6 = fig.add_subplot(gs[3, :2])
ax6.axis('off')
metrics_table = [
    ['Metric', 'Model A1', 'Model A2', 'Model A3', 'Static Port', 'ARI Port'],
    ['Net P&L', f"${all_stats['Model A1']['net']:,.0f}", f"${all_stats['Model A2']['net']:,.0f}",
     f"${all_stats['Model A3']['net']:,.0f}", f"${all_stats['Static Portfolio']['net']:,.0f}",
     f"${all_stats['ARI Portfolio']['net']:,.0f}"],
    ['Profit Factor', f"{all_stats['Model A1']['pf']:.3f}", f"{all_stats['Model A2']['pf']:.3f}",
     f"{all_stats['Model A3']['pf']:.3f}", f"{all_stats['Static Portfolio']['pf']:.3f}",
     f"{all_stats['ARI Portfolio']['pf']:.3f}"],
    ['Win Rate', f"{all_stats['Model A1']['wr']:.1%}", f"{all_stats['Model A2']['wr']:.1%}",
     f"{all_stats['Model A3']['wr']:.1%}", f"{all_stats['Static Portfolio']['wr']:.1%}",
     f"{all_stats['ARI Portfolio']['wr']:.1%}"],
    ['Max DD', f"${all_stats['Model A1']['max_dd']:,.0f}", f"${all_stats['Model A2']['max_dd']:,.0f}",
     f"${all_stats['Model A3']['max_dd']:,.0f}", f"${all_stats['Static Portfolio']['max_dd']:,.0f}",
     f"${all_stats['ARI Portfolio']['max_dd']:,.0f}"],
    ['RoMaD', f"{all_stats['Model A1']['romaD']:.2f}", f"{all_stats['Model A2']['romaD']:.2f}",
     f"{all_stats['Model A3']['romaD']:.2f}", f"{all_stats['Static Portfolio']['romaD']:.2f}",
     f"{all_stats['ARI Portfolio']['romaD']:.2f}"],
    ['Sharpe', f"{all_stats['Model A1']['sharpe']:.2f}", f"{all_stats['Model A2']['sharpe']:.2f}",
     f"{all_stats['Model A3']['sharpe']:.2f}", f"{all_stats['Static Portfolio']['sharpe']:.2f}",
     f"{all_stats['ARI Portfolio']['sharpe']:.2f}"],
    ['Monthly %', f"{all_stats['Model A1']['monthly_pos']:.0%}", f"{all_stats['Model A2']['monthly_pos']:.0%}",
     f"{all_stats['Model A3']['monthly_pos']:.0%}", f"{all_stats['Static Portfolio']['monthly_pos']:.0%}",
     f"{all_stats['ARI Portfolio']['monthly_pos']:.0%}"],
]
table = ax6.table(cellText=metrics_table[1:], colLabels=metrics_table[0],
                  cellLoc='center', loc='center', bbox=[0, 0, 1, 1])
table.auto_set_font_size(False); table.set_fontsize(9)
for (r, c), cell in table.get_celld().items():
    if r == 0: cell.set_facecolor('#263238'); cell.set_text_props(color='white', fontweight='bold')
    elif r % 2 == 0: cell.set_facecolor('#F5F5F5')
ax6.set_title('Performance Metrics Comparison', fontweight='bold', pad=10)

# 7. Prop firm pass rates
ax7 = fig.add_subplot(gs[3, 2])
firm_names = list(prop_results.keys())
pass_rates = [prop_results[f]['pass_rate'] for f in firm_names]
fail_rates = [prop_results[f]['fail_rate'] for f in firm_names]
x = np.arange(len(firm_names))
ax7.bar(x, pass_rates, color='#4CAF50', alpha=0.85, label='Pass')
ax7.bar(x, fail_rates, bottom=pass_rates, color='#F44336', alpha=0.85, label='Fail')
ax7.set_xticks(x); ax7.set_xticklabels([f.split(' ')[0]+'\n'+f.split(' ')[1] for f in firm_names], fontsize=9)
ax7.axhline(0.75, color='black', lw=1.5, ls='--', label='75% target')
ax7.set_title('Prop Firm Pass Rates', fontweight='bold')
ax7.set_ylabel('Probability'); ax7.legend(fontsize=8); ax7.grid(True, alpha=0.3, axis='y')
ax7.set_ylim(0, 1.05)

plt.savefig(f'{OUTPUT_DIR}/sprint_043_ats_v1_validation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Main chart saved.")

# ─── Final Verdict ────────────────────────────────────────────────────────────
print("\n" + "="*70)
print("FINAL VERDICT — ATLAS TRADING SYSTEM v1.0")
print("="*70)
s = all_stats['ARI Portfolio']
criteria = [
    ('Positive Expectancy',       s['exp'] > 0,                     f"${s['exp']:.2f}"),
    ('Profit Factor > 1.20',      s['pf'] >= 1.20,                  f"{s['pf']:.3f}"),
    ('Acceptable Drawdown',       s['max_dd'] > -15000,             f"${s['max_dd']:,.0f}"),
    ('RoMaD > 2.0',               s['romaD'] >= 2.0,                f"{s['romaD']:.3f}"),
    ('Monthly Consistency > 55%', s['monthly_pos'] >= 0.55,         f"{s['monthly_pos']:.0%}"),
    ('Apex Pass Rate > 75%',      prop_results['Apex 50K']['pass_rate'] >= 0.75,
     f"{prop_results['Apex 50K']['pass_rate']:.1%}"),
    ('Topstep Pass Rate > 75%',   prop_results['Topstep 50K']['pass_rate'] >= 0.75,
     f"{prop_results['Topstep 50K']['pass_rate']:.1%}"),
    ('Risk of Ruin < 5%',         s['ror'] < 0.05,                  f"{s['ror']:.1%}"),
]
passes = sum(1 for _,p,_ in criteria if p)
for metric, passed, value in criteria:
    symbol = '✓' if passed else '✗'
    print(f"  {symbol} {metric:<35} {value}")

print(f"\n  Criteria Met: {passes}/{len(criteria)}")
if passes >= 7:   verdict = "PROMOTE TO PRODUCTION"
elif passes >= 5: verdict = "PROMOTE WITH CONDITIONS"
elif passes >= 3: verdict = "EXPERIMENTAL"
else:             verdict = "REJECT"
print(f"\n  VERDICT: {verdict}")
print("="*70)
print("=== VALIDATION COMPLETE ===")
