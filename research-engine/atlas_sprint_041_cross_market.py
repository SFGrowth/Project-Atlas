"""
Atlas Sprint 041 — Cross-Market Generalisation (H-G001)
Runs frozen Model A1, Model A3, and ARI v2.0 on all available markets.
Position sizing: $800 risk per trade (dynamic contract sizing).
No parameter tuning. No market-specific adjustments.
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, os
warnings.filterwarnings('ignore')

DATA_DIR   = '/home/ubuntu/Project-Atlas/data/raw/massive'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research/sprint-041-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMISSION    = 1.00   # per side per contract
RISK_PER_TRADE = 800.0  # $800 risk per trade (new standard)

# Market specifications: (product_code, point_value_per_contract)
MARKETS = [
    ("MNQ",  2.0),
    ("NQ",  20.0),
    ("ES",  50.0),
    ("MES",  5.0),
    ("YM",   5.0),
    ("RTY",  50.0),
    ("MYM",  0.5),
]

# ─── Fast EWM ─────────────────────────────────────────────────────────────────
def ewm_fast(arr, span):
    alpha = 2.0 / (span + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = alpha * arr[i] + (1 - alpha) * result[i - 1]
    return result

def load_and_compute(product_code):
    path = os.path.join(DATA_DIR, f"{product_code}_5min_full.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path)
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
    atr5_lag = np.empty(n); atr5_lag[:20] = np.nan; atr5_lag[20:] = atr5[:-20]
    vol_ratio = np.where(atr5_lag > 0, atr5 / atr5_lag, np.nan)

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
    is_overnight = (hour >= 18) | (hour < 9)
    is_rth = ((hour == 9) & (minute >= 30)) | ((hour >= 10) & (hour <= 15))
    zone_low  = pd.Series(lo).rolling(5).min().shift(1).values
    zone_high = pd.Series(hi).rolling(5).max().shift(1).values

    return {
        'df': df, 'hi': hi, 'lo': lo, 'cl': cl, 'op': op, 'n': n,
        'hour': hour, 'minute': minute, 'date': date, 'year': year, 'month': month,
        'atr5': atr5, 'atr14': atr14, 'vol_ratio': vol_ratio,
        'ema9': ema9, 'ema21': ema21, 'ema50': ema50, 'adx': adx,
        'trend_long': trend_long, 'trend_short': trend_short,
        'is_overnight': is_overnight, 'is_rth': is_rth,
        'zone_low': zone_low, 'zone_high': zone_high,
    }

def contracts_for_risk(risk_pts, point_value):
    """Calculate number of contracts to risk exactly $800."""
    if risk_pts <= 0 or point_value <= 0:
        return 0
    dollar_risk_per_contract = risk_pts * point_value
    return max(1, round(RISK_PER_TRADE / dollar_risk_per_contract))

# ─── Model A1 (FROZEN) ────────────────────────────────────────────────────────
def simulate_a1(mkt, point_value):
    A1_EXP_LOOKBACK=20; A1_EXP_RATIO=1.8; A1_DEPTH_MIN=0.5; A1_DEPTH_MAX=1.2
    A1_STOP=1.0; A1_RR=2.0

    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']
    atr5=mkt['atr5']; atr14=mkt['atr14']
    ema21=mkt['ema21']; trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_rth=mkt['is_rth']; adx=mkt['adx']
    date=mkt['date']; year=mkt['year']; month=mkt['month']
    n=mkt['n']

    atr5v = atr5.copy(); exp_sig = np.zeros(n, dtype=bool)
    for i in range(A1_EXP_LOOKBACK, n):
        p = atr5v[i-A1_EXP_LOOKBACK]
        if p > 0: exp_sig[i] = atr5v[i]/p > A1_EXP_RATIO

    pc = np.roll(cl,1); pc[0]=cl[0]
    plt_l = (pc>ema21)&(cl<=ema21*1.001)
    plt_s = (pc<ema21)&(cl>=ema21*0.999)
    sh10 = pd.Series(hi).shift(1).rolling(10,min_periods=1).max().values
    sl10 = pd.Series(lo).shift(1).rolling(10,min_periods=1).min().values
    pdl = np.where(atr14>0,(sh10-cl)/atr14,np.nan)
    pds = np.where(atr14>0,(cl-sl10)/atr14,np.nan)

    trades=[]; i=60
    while i<n-1:
        if not is_rth[i] or np.isnan(atr14[i]) or atr14[i]==0: i+=1; continue
        if not exp_sig[i]: i+=1; continue
        d=None
        if bool(trend_long[i]) and plt_l[i]:
            v=pdl[i]
            if not np.isnan(v) and A1_DEPTH_MIN<=v<=A1_DEPTH_MAX: d=1
        if d is None and bool(trend_short[i]) and plt_s[i]:
            v=pds[i]
            if not np.isnan(v) and A1_DEPTH_MIN<=v<=A1_DEPTH_MAX: d=-1
        if d is None: i+=1; continue
        sp=A1_STOP*atr14[i]; tp=A1_RR*sp
        if sp<=0: i+=1; continue
        entry=cl[i]; stop=entry-d*sp; tgt=entry+d*tp
        n_contracts = contracts_for_risk(sp, point_value)
        out=ep=ej=None; bh=0
        for j in range(i+1,min(i+300,n)):
            bh+=1
            if not is_rth[j]: out,ep,ej='time_exit',cl[j-1],j; break
            if d==1:
                if lo[j]<=stop: out,ep,ej='loss',stop,j; break
                if hi[j]>=tgt:  out,ep,ej='win',tgt,j; break
            else:
                if hi[j]>=stop: out,ep,ej='loss',stop,j; break
                if lo[j]<=tgt:  out,ep,ej='win',tgt,j; break
        if out is None: i+=1; continue
        net=(ep-entry)*point_value*d*n_contracts - COMMISSION*2*n_contracts
        trades.append({'model':'A1','entry_time':mkt['df']['ts'].iloc[i],'exit_time':mkt['df']['ts'].iloc[ej],
                       'outcome':out,'net_pnl':net,'risk_pts':sp,'contracts':n_contracts,
                       'adx':adx[i],'year':year[i],'month':month[i],'date':date[i]})
        i+=bh
    return pd.DataFrame(trades)

# ─── Model A3 (FROZEN) ────────────────────────────────────────────────────────
def simulate_a3(mkt, point_value):
    A3_ADX_MIN=25.0; A3_COMP=0.80; A3_EXP=1.30; A3_RR=2.5

    hi=mkt['hi']; lo=mkt['lo']; cl=mkt['cl']; op=mkt['op']
    vol_ratio=mkt['vol_ratio']; adx=mkt['adx']
    trend_long=mkt['trend_long']; trend_short=mkt['trend_short']
    is_overnight=mkt['is_overnight']; hour=mkt['hour']; minute=mkt['minute']
    zone_low=mkt['zone_low']; zone_high=mkt['zone_high']
    date=mkt['date']; year=mkt['year']; month=mkt['month']
    n=mkt['n']

    trades=[]
    for i in range(50,n-1):
        if not is_overnight[i]: continue
        if adx[i]<A3_ADX_MIN or np.isnan(adx[i]): continue
        if np.isnan(vol_ratio[i]): continue
        pv=vol_ratio[i-1] if i>0 else np.nan
        if np.isnan(pv) or pv>=A3_COMP: continue
        if vol_ratio[i]<A3_EXP: continue
        isl=bool(trend_long[i]) and (cl[i]>op[i])
        iss=bool(trend_short[i]) and (cl[i]<op[i])
        if not (isl or iss): continue
        entry=op[i+1]
        if isl:
            stop=zone_low[i]
            if np.isnan(stop) or stop>=entry: continue
            risk=entry-stop; tgt=entry+risk*A3_RR; d=1
        else:
            stop=zone_high[i]
            if np.isnan(stop) or stop<=entry: continue
            risk=stop-entry; tgt=entry-risk*A3_RR; d=-1
        if risk<=0 or risk>500: continue
        n_contracts = contracts_for_risk(risk, point_value)
        out=ep=ej=None
        for j in range(i+1,min(i+300,n)):
            if (not is_overnight[j]) and hour[j]==9 and minute[j]==30:
                out,ep,ej='time_exit',op[j],j; break
            if d==1:
                if lo[j]<=stop: out,ep,ej='loss',stop,j; break
                if hi[j]>=tgt:  out,ep,ej='win',tgt,j; break
            else:
                if hi[j]>=stop: out,ep,ej='loss',stop,j; break
                if lo[j]<=tgt:  out,ep,ej='win',tgt,j; break
        if out is None: continue
        net=(ep-entry)*point_value*d*n_contracts - COMMISSION*2*n_contracts
        trades.append({'model':'A3','entry_time':mkt['df']['ts'].iloc[i],'exit_time':mkt['df']['ts'].iloc[ej],
                       'outcome':out,'net_pnl':net,'risk_pts':risk,'contracts':n_contracts,
                       'adx':adx[i],'year':year[i],'month':month[i],'date':date[i]})
    return pd.DataFrame(trades)

# ─── ARI v2.0 (FROZEN) ────────────────────────────────────────────────────────
def apply_ari_v2(portfolio_df, adx_median=32.0):
    """Apply ARI v2.0 rules: A (daily halt), C (streak scaling), D (ADX boost)."""
    mults=[]; daily={}; streak=0
    for i,row in portfolio_df.iterrows():
        d=row['date']; today=min(daily.get(d,0),0)
        if today<=-300: m=0.0
        elif streak>=3: m=0.5
        elif row['adx']>=adx_median: m=1.25
        else: m=0.75
        mults.append(m)
        daily[d]=daily.get(d,0)+row['net_pnl']*m
        if row['outcome']=='loss': streak+=1
        else: streak=0
    return mults

# ─── Metrics ──────────────────────────────────────────────────────────────────
def compute_metrics(pnl_arr, dates_arr, label):
    pnl = np.array(pnl_arr, dtype=float)
    if len(pnl) < 5:
        return None
    wins=pnl[pnl>0]; loss=pnl[pnl<0]
    gw=wins.sum(); gl=abs(loss.sum())
    pf = gw/gl if gl>0 else 0
    net=pnl.sum(); wr=(pnl>0).mean()
    eq=np.cumsum(pnl); pk=np.maximum.accumulate(eq); dd=eq-pk
    max_dd=dd.min()
    romad=net/abs(max_dd) if max_dd!=0 else 0
    # Monthly
    mo_key=[f"{d.year}-{d.month:02d}" for d in dates_arr[:len(pnl)]]
    monthly=pd.Series(pnl,index=mo_key).groupby(level=0).sum()
    mo_cons=(monthly>0).mean()
    # MC
    np.random.seed(42); pass_c=0
    for _ in range(2000):
        sh=np.random.permutation(pnl); eq_s=np.cumsum(sh)
        pk_s=np.maximum.accumulate(eq_s)
        if (eq_s-pk_s).min()>-2000: pass_c+=1
    mc=pass_c/2000
    return {'label':label,'n':len(pnl),'net':net,'pf':pf,'wr':wr,
            'max_dd':max_dd,'romad':romad,'mc':mc,'mo_cons':mo_cons,
            'equity':eq,'monthly':monthly}

# ─── Main ─────────────────────────────────────────────────────────────────────
print("="*70)
print("Sprint 041 — Cross-Market Generalisation (H-G001)")
print(f"Risk per trade: ${RISK_PER_TRADE}")
print("="*70)

results = {}

for product_code, point_value in MARKETS:
    print(f"\n{'─'*60}")
    print(f"Market: {product_code} (point value: ${point_value})")

    mkt = load_and_compute(product_code)
    if mkt is None:
        print(f"  No data file found. Skipping.")
        continue

    print(f"  Data: {len(mkt['df'])} bars, {mkt['df']['ts'].iloc[0].date()} to {mkt['df']['ts'].iloc[-1].date()}")

    # Run models
    a1 = simulate_a1(mkt, point_value)
    a3 = simulate_a3(mkt, point_value)
    print(f"  A1: {len(a1)} trades | A3: {len(a3)} trades")

    if len(a1) == 0 and len(a3) == 0:
        print(f"  No trades generated. Skipping.")
        continue

    portfolio = pd.concat([a1, a3]).sort_values('entry_time').reset_index(drop=True)

    # Static portfolio metrics
    m_static = compute_metrics(portfolio['net_pnl'].values, portfolio['date'].values, f"{product_code} Static")

    # ARI v2.0
    adx_median = np.nanmedian(mkt['adx'])
    mults = apply_ari_v2(portfolio, adx_median)
    pnl_ari = portfolio['net_pnl'].values * np.array(mults)
    m_ari = compute_metrics(pnl_ari, portfolio['date'].values, f"{product_code} ARI v2.0")

    # A1 only
    m_a1 = compute_metrics(a1['net_pnl'].values, a1['date'].values, f"{product_code} A1") if len(a1)>=5 else None
    # A3 only
    m_a3 = compute_metrics(a3['net_pnl'].values, a3['date'].values, f"{product_code} A3") if len(a3)>=5 else None

    results[product_code] = {
        'point_value': point_value,
        'a1_trades': len(a1), 'a3_trades': len(a3),
        'adx_median': adx_median,
        'm_a1': m_a1, 'm_a3': m_a3,
        'm_static': m_static, 'm_ari': m_ari,
        'portfolio': portfolio, 'pnl_ari': pnl_ari,
    }

    if m_static:
        print(f"  Static:   PF={m_static['pf']:.3f}  Net=${m_static['net']:,.0f}  DD=${m_static['max_dd']:,.0f}  MC={m_static['mc']:.1%}")
    if m_ari:
        print(f"  ARI v2.0: PF={m_ari['pf']:.3f}  Net=${m_ari['net']:,.0f}  DD=${m_ari['max_dd']:,.0f}  MC={m_ari['mc']:.1%}")

# ─── Summary Table ────────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print("CROSS-MARKET SUMMARY TABLE (Static Portfolio, $800 risk/trade)")
print(f"{'='*70}")
print(f"{'Market':<8} {'A1 N':>6} {'A3 N':>6} {'PF':>7} {'Net P&L':>12} {'Max DD':>10} {'MC%':>7} {'RoMaD':>7}")
print("-"*70)
for sym, r in results.items():
    m = r['m_static']
    if m:
        print(f"{sym:<8} {r['a1_trades']:>6} {r['a3_trades']:>6} {m['pf']:>7.3f} "
              f"{m['net']:>12,.0f} {m['max_dd']:>10,.0f} {m['mc']:>7.1%} {m['romad']:>7.3f}")

print(f"\n{'='*70}")
print("MODEL A1 CROSS-MARKET RESULTS")
print(f"{'='*70}")
print(f"{'Market':<8} {'N':>6} {'PF':>7} {'Net P&L':>12} {'Max DD':>10} {'Win%':>7} {'MC%':>7}")
print("-"*70)
for sym, r in results.items():
    m = r['m_a1']
    if m:
        print(f"{sym:<8} {m['n']:>6} {m['pf']:>7.3f} {m['net']:>12,.0f} {m['max_dd']:>10,.0f} "
              f"{m['wr']:>7.1%} {m['mc']:>7.1%}")

print(f"\n{'='*70}")
print("MODEL A3 CROSS-MARKET RESULTS")
print(f"{'='*70}")
print(f"{'Market':<8} {'N':>6} {'PF':>7} {'Net P&L':>12} {'Max DD':>10} {'Win%':>7} {'MC%':>7}")
print("-"*70)
for sym, r in results.items():
    m = r['m_a3']
    if m:
        print(f"{sym:<8} {m['n']:>6} {m['pf']:>7.3f} {m['net']:>12,.0f} {m['max_dd']:>10,.0f} "
              f"{m['wr']:>7.1%} {m['mc']:>7.1%}")

# ─── Generalisation scoring ───────────────────────────────────────────────────
print(f"\n{'='*70}")
print("H-G001 GENERALISATION ASSESSMENT")
print(f"{'='*70}")
mnq_a1 = results.get('MNQ', {}).get('m_a1')
mnq_a3 = results.get('MNQ', {}).get('m_a3')

for sym, r in results.items():
    if sym == 'MNQ':
        continue
    m_a1 = r['m_a1']; m_a3 = r['m_a3']
    # A1 generalisation
    if m_a1 and mnq_a1:
        a1_pf_ratio = m_a1['pf'] / mnq_a1['pf'] if mnq_a1['pf'] > 0 else 0
        a1_verdict = 'REPLICATES' if m_a1['pf'] > 1.0 else ('WEAKENS' if m_a1['pf'] > 0.8 else 'DISAPPEARS')
    else:
        a1_pf_ratio = 0; a1_verdict = 'NO DATA'
    if m_a3 and mnq_a3:
        a3_pf_ratio = m_a3['pf'] / mnq_a3['pf'] if mnq_a3['pf'] > 0 else 0
        a3_verdict = 'REPLICATES' if m_a3['pf'] > 1.0 else ('WEAKENS' if m_a3['pf'] > 0.8 else 'DISAPPEARS')
    else:
        a3_pf_ratio = 0; a3_verdict = 'NO DATA'
    a1_pf_str = f"{m_a1['pf']:.3f}" if m_a1 else "0.000"
    a3_pf_str = f"{m_a3['pf']:.3f}" if m_a3 else "0.000"
    print(f"  {sym}: A1={a1_verdict} (PF={a1_pf_str}, ratio={a1_pf_ratio:.2f}) | "
          f"A3={a3_verdict} (PF={a3_pf_str}, ratio={a3_pf_ratio:.2f})")

# ─── Charts ───────────────────────────────────────────────────────────────────
print("\nGenerating charts...")
fig = plt.figure(figsize=(22, 18))
gs = gridspec.GridSpec(3, 3, figure=fig, hspace=0.45, wspace=0.35)
fig.suptitle('Sprint 041 — Cross-Market Generalisation (H-G001)\nModel A1 + A3 + ARI v2.0 | $800 Risk Per Trade | Frozen Parameters',
             fontsize=13, fontweight='bold')

colors = {'MNQ':'#2196F3','NQ':'#4CAF50','ES':'#FF9800','MES':'#9C27B0',
          'YM':'#F44336','RTY':'#00BCD4','MYM':'#795548'}

# 1. Equity curves — A1 across markets
ax1 = fig.add_subplot(gs[0,:])
for sym, r in results.items():
    m = r['m_a1']
    if m and len(m['equity']) > 5:
        lw = 2.5 if sym == 'MNQ' else 1.5
        ls = '-' if sym == 'MNQ' else '--'
        ax1.plot(m['equity'], color=colors.get(sym,'gray'), lw=lw, ls=ls,
                 label=f"{sym} PF={m['pf']:.3f} N={m['n']}")
ax1.axhline(0, color='black', lw=0.5)
ax1.set_title('Model A1 — Equity Curves Across All Markets ($800 risk/trade, frozen params)', fontweight='bold')
ax1.set_xlabel('Trade Number'); ax1.set_ylabel('Cumulative P&L ($)')
ax1.legend(fontsize=9, ncol=4); ax1.grid(True, alpha=0.3)

# 2. A1 Profit Factor comparison
ax2 = fig.add_subplot(gs[1,0])
syms_a1 = [s for s,r in results.items() if r['m_a1']]
pfs_a1  = [results[s]['m_a1']['pf'] for s in syms_a1]
bar_cols = [colors.get(s,'gray') for s in syms_a1]
bars = ax2.bar(syms_a1, pfs_a1, color=bar_cols, alpha=0.85)
ax2.axhline(1.0, color='red', lw=1.5, ls='--', label='PF=1.0')
ax2.set_title('Model A1 — PF by Market', fontweight='bold')
ax2.set_ylabel('Profit Factor'); ax2.legend(fontsize=8)
ax2.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars, pfs_a1):
    ax2.text(bar.get_x()+bar.get_width()/2., val+0.01, f'{val:.3f}',
             ha='center', va='bottom', fontsize=9)

# 3. A3 Profit Factor comparison
ax3 = fig.add_subplot(gs[1,1])
syms_a3 = [s for s,r in results.items() if r['m_a3']]
pfs_a3  = [results[s]['m_a3']['pf'] for s in syms_a3]
bar_cols3 = [colors.get(s,'gray') for s in syms_a3]
bars3 = ax3.bar(syms_a3, pfs_a3, color=bar_cols3, alpha=0.85)
ax3.axhline(1.0, color='red', lw=1.5, ls='--', label='PF=1.0')
ax3.set_title('Model A3 — PF by Market', fontweight='bold')
ax3.set_ylabel('Profit Factor'); ax3.legend(fontsize=8)
ax3.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars3, pfs_a3):
    ax3.text(bar.get_x()+bar.get_width()/2., val+0.01, f'{val:.3f}',
             ha='center', va='bottom', fontsize=9)

# 4. Net P&L comparison (static portfolio)
ax4 = fig.add_subplot(gs[1,2])
syms_p = [s for s,r in results.items() if r['m_static']]
nets   = [results[s]['m_static']['net'] for s in syms_p]
bar_cols4 = [colors.get(s,'gray') for s in syms_p]
bars4 = ax4.bar(syms_p, nets, color=bar_cols4, alpha=0.85)
ax4.axhline(0, color='red', lw=1.0, ls='--')
ax4.set_title('Portfolio Net P&L by Market ($800/trade)', fontweight='bold')
ax4.set_ylabel('Net P&L ($)')
ax4.grid(True, alpha=0.3, axis='y')
for bar, val in zip(bars4, nets):
    ax4.text(bar.get_x()+bar.get_width()/2., val+(max(nets)*0.02 if val>=0 else min(nets)*0.02),
             f'${val:,.0f}', ha='center', va='bottom', fontsize=8)

# 5. A3 equity curves across markets
ax5 = fig.add_subplot(gs[2,:2])
for sym, r in results.items():
    m = r['m_a3']
    if m and len(m['equity']) > 5:
        lw = 2.5 if sym == 'MNQ' else 1.5
        ls = '-' if sym == 'MNQ' else '--'
        ax5.plot(m['equity'], color=colors.get(sym,'gray'), lw=lw, ls=ls,
                 label=f"{sym} PF={m['pf']:.3f} N={m['n']}")
ax5.axhline(0, color='black', lw=0.5)
ax5.set_title('Model A3 — Equity Curves Across All Markets', fontweight='bold')
ax5.set_xlabel('Trade Number'); ax5.set_ylabel('Cumulative P&L ($)')
ax5.legend(fontsize=9, ncol=4); ax5.grid(True, alpha=0.3)

# 6. Generalisation scorecard
ax6 = fig.add_subplot(gs[2,2])
ax6.axis('off')
ax6.text(0.05, 0.97, 'H-G001 Generalisation Scorecard', transform=ax6.transAxes,
         fontsize=11, fontweight='bold', va='top')
row_y = 0.88
ax6.text(0.05, row_y, f"{'Market':<8} {'A1':>10} {'A3':>10}", transform=ax6.transAxes,
         fontsize=9, va='top', fontfamily='monospace')
row_y -= 0.06
for sym, r in results.items():
    m_a1 = r['m_a1']; m_a3 = r['m_a3']
    a1_str = f"PF={m_a1['pf']:.2f}" if m_a1 else "N/A"
    a3_str = f"PF={m_a3['pf']:.2f}" if m_a3 else "N/A"
    a1_col = '#4CAF50' if (m_a1 and m_a1['pf']>1.0) else '#F44336'
    a3_col = '#4CAF50' if (m_a3 and m_a3['pf']>1.0) else '#F44336'
    ax6.text(0.05, row_y, f"{sym:<8}", transform=ax6.transAxes,
             fontsize=9, va='top', fontfamily='monospace', fontweight='bold')
    ax6.text(0.38, row_y, a1_str, transform=ax6.transAxes,
             fontsize=9, va='top', color=a1_col, fontweight='bold')
    ax6.text(0.68, row_y, a3_str, transform=ax6.transAxes,
             fontsize=9, va='top', color=a3_col, fontweight='bold')
    row_y -= 0.10

plt.savefig(f'{OUTPUT_DIR}/sprint_041_cross_market_generalisation.png', dpi=150, bbox_inches='tight')
plt.close()
print(f"Chart saved.")
print("\n=== SPRINT 041 DATA ANALYSIS COMPLETE ===")
