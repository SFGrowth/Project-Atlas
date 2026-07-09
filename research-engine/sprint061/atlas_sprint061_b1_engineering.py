"""
Atlas Sprint 061 — Model B1 Engineering

MVC Selection: MVC-003 (Participation-Amplified Directional Momentum) as primary engine.
Rationale: Highest trade count (N=137), best net P&L ($52,767), strong PF (1.835).
MVC-001/002 are operationally identical and have fewer trades.

Engineering Objective: Optimise ONLY execution mechanics. MVC structure is FROZEN.
  - Entry timing (immediate vs pullback)
  - Stop placement (ATR multiplier)
  - Target placement (RR ratio)
  - Session restriction
  - Regime filter (ADX)
  - Risk model

The MVC conditions (rel_txn >= 1.33, ov_range >= 10.85, ov_dir == 1) are NOT modified.
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, json, os
warnings.filterwarnings('ignore')

DATA_PATH  = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint061'
CHARTS_DIR = '/home/ubuntu/Project-Atlas/research/sprint-061-charts'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

POINT_VALUE = 2.0
RISK_PER_TRADE = 800

print("Loading MNQ 5-min data...")
df = pd.read_csv(DATA_PATH)
df.columns = [c.lower().strip() for c in df.columns]
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values('ts').reset_index(drop=True)
print(f"  {len(df):,} bars | {df['ts'].min().date()} to {df['ts'].max().date()}")

# ─── Feature Engineering ──────────────────────────────────────────────────────
df['hour']   = df['ts'].dt.hour
df['minute'] = df['ts'].dt.minute
df['date']   = df['ts'].dt.date
df['dow']    = df['ts'].dt.dayofweek
df['is_rth'] = ((df['hour'] > 9) | ((df['hour'] == 9) & (df['minute'] >= 30))) & (df['hour'] < 16)

df['tr']    = np.maximum(df['high'] - df['low'], 
              np.maximum(abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))))
df['atr14'] = df['tr'].ewm(span=14, adjust=False).mean()

df['ema20']  = df['close'].ewm(span=20, adjust=False).mean()
df['ema50']  = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
df['ema_bull'] = ((df['ema20'] > df['ema50']) & (df['ema50'] > df['ema200'])).astype(int)

df['dm_plus']  = np.where((df['high'] - df['high'].shift(1)) > (df['low'].shift(1) - df['low']),
                           np.maximum(df['high'] - df['high'].shift(1), 0), 0)
df['dm_minus'] = np.where((df['low'].shift(1) - df['low']) > (df['high'] - df['high'].shift(1)),
                           np.maximum(df['low'].shift(1) - df['low'], 0), 0)
df['di_plus']  = 100 * (df['dm_plus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['di_minus'] = 100 * (df['dm_minus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['dx']       = 100 * abs(df['di_plus'] - df['di_minus']) / (df['di_plus'] + df['di_minus'] + 1e-10)
df['adx14']    = df['dx'].ewm(span=14, adjust=False).mean()

df['vol_ma20']   = df['volume'].rolling(20).mean()
df['rel_vol_20'] = df['volume'] / (df['vol_ma20'] + 1e-10)
df['txn_ma20']   = df['transactions'].rolling(20).mean() if 'transactions' in df.columns else df['vol_ma20']
df['rel_txn']    = df['transactions'] / (df['txn_ma20'] + 1e-10) if 'transactions' in df.columns else df['rel_vol_20']

# Overnight features
print("Computing overnight features...")
overnight_data = {}
for date, group in df.groupby('date'):
    ov_bars  = group[~group['is_rth']]
    prev_rth = df[(df['date'] < date) & df['is_rth']]
    if len(ov_bars) == 0 or len(prev_rth) == 0:
        overnight_data[date] = {'ov_dir': 0, 'ov_range_vs_atr14': 0}
        continue
    prev_close = prev_rth.iloc[-1]['close']
    ov_close   = ov_bars.iloc[-1]['close']
    atr_ref    = prev_rth.iloc[-1]['atr14']
    ov_range   = (ov_bars['high'].max() - ov_bars['low'].min()) / (atr_ref + 1e-10)
    ov_return  = (ov_close - prev_close) / (atr_ref + 1e-10)
    ov_dir     = 1 if ov_return > 0.1 else (-1 if ov_return < -0.1 else 0)
    overnight_data[date] = {'ov_dir': ov_dir, 'ov_range_vs_atr14': ov_range}

df['ov_dir']            = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_dir', 0))
df['ov_range_vs_atr14'] = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_range_vs_atr14', 0))

# MVC-003 base signal
df['mvc003_signal'] = ((df['rel_txn'] >= 1.33) & 
                       (df['ov_range_vs_atr14'] >= 10.85) & 
                       (df['ov_dir'] == 1)).astype(int)

print(f"  MVC-003 signal bars: {df['mvc003_signal'].sum():,}")

# ─── Execution Simulator ──────────────────────────────────────────────────────
def simulate_b1(df_in, stop_mult=1.5, rr=2.5, session_restrict=None, adx_min=None, ema_required=False):
    """
    Simulate Model B1 with configurable execution mechanics.
    MVC-003 signal is FROZEN. Only mechanics are varied.
    """
    rth = df_in[df_in['is_rth']].copy().reset_index(drop=True)
    trades = []
    traded_dates = set()
    i = 0
    
    while i < len(rth):
        row = rth.iloc[i]
        
        if row['date'] in traded_dates:
            i += 1
            continue
        
        # MVC-003 signal check (FROZEN)
        if row['mvc003_signal'] != 1:
            i += 1
            continue
        
        # Optional execution mechanics filters
        if session_restrict and row['hour'] not in session_restrict:
            i += 1
            continue
        if adx_min and row['adx14'] < adx_min:
            i += 1
            continue
        if ema_required and row['ema_bull'] != 1:
            i += 1
            continue
        
        # Entry
        entry_price  = row['close']
        atr          = row['atr14']
        stop_pts     = stop_mult * atr
        target_pts   = stop_pts * rr
        stop_price   = entry_price - stop_pts
        target_price = entry_price + target_pts
        contracts    = max(1, round(RISK_PER_TRADE / (stop_pts * POINT_VALUE)))
        
        entry_ts   = row['ts']
        entry_date = row['date']
        outcome    = 'open'
        exit_price = None
        exit_ts    = None
        
        for j in range(i+1, min(i+200, len(rth))):
            future = rth.iloc[j]
            
            if future['hour'] > 15 or (future['hour'] == 15 and future['minute'] >= 55):
                exit_price = future['close']
                exit_ts    = future['ts']
                outcome    = 'time_exit'
                i = j + 1
                break
            
            if future['low'] <= stop_price:
                exit_price = stop_price
                exit_ts    = future['ts']
                outcome    = 'stop'
                i = j + 1
                break
            
            if future['high'] >= target_price:
                exit_price = target_price
                exit_ts    = future['ts']
                outcome    = 'target'
                i = j + 1
                break
            
            if future['date'] != entry_date:
                exit_price = rth.iloc[j-1]['close']
                exit_ts    = rth.iloc[j-1]['ts']
                outcome    = 'day_end'
                i = j
                break
        else:
            if outcome == 'open':
                exit_price = rth.iloc[-1]['close']
                exit_ts    = rth.iloc[-1]['ts']
                outcome    = 'end_of_data'
                i = len(rth)
        
        pnl = (exit_price - entry_price) * contracts * POINT_VALUE
        trades.append({
            'entry_ts': entry_ts, 'exit_ts': exit_ts, 'date': entry_date,
            'entry': entry_price, 'exit': exit_price,
            'stop': stop_price, 'target': target_price,
            'atr': atr, 'stop_pts': stop_pts, 'contracts': contracts,
            'outcome': outcome, 'pnl': pnl,
            'is_win': pnl > 0, 'is_loss': pnl < 0,
        })
        traded_dates.add(entry_date)
    
    return pd.DataFrame(trades)

def score_trades(trades_df, label=''):
    if len(trades_df) == 0:
        return None
    n       = len(trades_df)
    wr      = trades_df['is_win'].mean() * 100
    gross_w = trades_df.loc[trades_df['pnl']>0,'pnl'].sum()
    gross_l = trades_df.loc[trades_df['pnl']<0,'pnl'].abs().sum()
    pf      = gross_w / (gross_l + 1e-6)
    net     = trades_df['pnl'].sum()
    equity  = trades_df['pnl'].cumsum()
    max_dd  = (equity - equity.cummax()).min()
    exp     = net / n
    return {'label': label, 'n': n, 'wr': wr, 'pf': pf, 'net': net, 'max_dd': max_dd, 'exp': exp}

# ─── Phase 1: Stop Multiplier Optimisation ────────────────────────────────────
print("\n=== STOP MULTIPLIER OPTIMISATION (RR=2.5 fixed) ===")
stop_results = {}
for stop_mult in [1.0, 1.2, 1.5, 1.8, 2.0, 2.5]:
    trades = simulate_b1(df, stop_mult=stop_mult, rr=2.5)
    s = score_trades(trades, f'Stop={stop_mult}×ATR')
    stop_results[stop_mult] = s
    print(f"  Stop={stop_mult}×ATR: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f} | DD=${s['max_dd']:,.0f}")

# ─── Phase 2: RR Optimisation ─────────────────────────────────────────────────
print("\n=== REWARD:RISK OPTIMISATION (Stop=1.5×ATR fixed) ===")
rr_results = {}
for rr in [1.5, 2.0, 2.5, 3.0, 3.5]:
    trades = simulate_b1(df, stop_mult=1.5, rr=rr)
    s = score_trades(trades, f'RR={rr}')
    rr_results[rr] = s
    print(f"  RR={rr}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f} | DD=${s['max_dd']:,.0f}")

# ─── Phase 3: Session Restriction ─────────────────────────────────────────────
print("\n=== SESSION RESTRICTION TEST (Stop=1.5×ATR, RR=2.5) ===")
session_results = {}
sessions = {
    'All RTH': None,
    'AM Only (9-11)': [9, 10, 11],
    'AM+Mid (9-13)': [9, 10, 11, 12, 13],
    'PM Only (12-15)': [12, 13, 14, 15],
}
for label, session in sessions.items():
    trades = simulate_b1(df, stop_mult=1.5, rr=2.5, session_restrict=session)
    s = score_trades(trades, label)
    session_results[label] = s
    print(f"  {label}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f}")

# ─── Phase 4: ADX Filter ──────────────────────────────────────────────────────
print("\n=== ADX FILTER TEST (Stop=1.5×ATR, RR=2.5) ===")
adx_results = {}
for adx_min in [None, 20, 25, 30, 35]:
    trades = simulate_b1(df, stop_mult=1.5, rr=2.5, adx_min=adx_min)
    s = score_trades(trades, f'ADX>={adx_min}')
    adx_results[str(adx_min)] = s
    print(f"  ADX>={adx_min}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f}")

# ─── Phase 5: EMA Alignment Filter ───────────────────────────────────────────
print("\n=== EMA ALIGNMENT FILTER TEST (Stop=1.5×ATR, RR=2.5) ===")
ema_results = {}
for ema_req in [False, True]:
    trades = simulate_b1(df, stop_mult=1.5, rr=2.5, ema_required=ema_req)
    s = score_trades(trades, f'EMA_req={ema_req}')
    ema_results[str(ema_req)] = s
    print(f"  EMA_required={ema_req}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f}")

# ─── Phase 6: Best Configuration ─────────────────────────────────────────────
print("\n=== BEST CONFIGURATION SEARCH ===")
# Test the most promising combinations
best_configs = [
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': None, 'adx_min': None, 'ema_required': False, 'label': 'Baseline (MVC-003 only)'},
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': [9,10,11], 'adx_min': None, 'ema_required': False, 'label': 'AM Session'},
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': None, 'adx_min': 25, 'ema_required': False, 'label': 'ADX>=25'},
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': [9,10,11], 'adx_min': 25, 'ema_required': False, 'label': 'AM + ADX>=25'},
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': None, 'adx_min': None, 'ema_required': True, 'label': 'EMA Bull'},
    {'stop_mult': 1.5, 'rr': 2.5, 'session_restrict': [9,10,11], 'adx_min': None, 'ema_required': True, 'label': 'AM + EMA Bull'},
    {'stop_mult': 1.2, 'rr': 3.0, 'session_restrict': None, 'adx_min': None, 'ema_required': False, 'label': 'Tight Stop RR=3.0'},
    {'stop_mult': 1.5, 'rr': 3.0, 'session_restrict': [9,10,11], 'adx_min': 25, 'ema_required': False, 'label': 'AM + ADX>=25 + RR=3.0'},
]

best_results = {}
for cfg in best_configs:
    trades = simulate_b1(df, **{k: v for k, v in cfg.items() if k != 'label'})
    s = score_trades(trades, cfg['label'])
    best_results[cfg['label']] = {'config': cfg, 'scores': s}
    print(f"  {cfg['label']}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f} | DD=${s['max_dd']:,.0f}")

# Select best config: maximise PF with N >= 30
valid = {k: v for k, v in best_results.items() if v['scores']['n'] >= 30}
best_label = max(valid, key=lambda k: valid[k]['scores']['pf'])
best_cfg   = best_results[best_label]
print(f"\n  SELECTED: {best_label}")
print(f"  Config: {best_cfg['config']}")

# ─── Final B1 Model ───────────────────────────────────────────────────────────
print("\n=== FINAL MODEL B1 SPECIFICATION ===")
b1_cfg = best_cfg['config']
b1_trades = simulate_b1(df, **{k: v for k, v in b1_cfg.items() if k != 'label'})
b1_trades.to_csv(f'{OUTPUT_DIR}/b1_trades_final.csv', index=False)

b1_scores = score_trades(b1_trades, 'Model B1')
print(f"  N={b1_scores['n']} | WR={b1_scores['wr']:.1f}% | PF={b1_scores['pf']:.3f}")
print(f"  Net=${b1_scores['net']:,.0f} | MaxDD=${b1_scores['max_dd']:,.0f} | Expectancy=${b1_scores['exp']:,.0f}")

# Year breakdown
b1_trades['year'] = pd.to_datetime(b1_trades['date'].astype(str)).dt.year
for yr in sorted(b1_trades['year'].unique()):
    yr_t = b1_trades[b1_trades['year'] == yr]
    yr_wr = yr_t['is_win'].mean() * 100
    yr_pf = yr_t.loc[yr_t['pnl']>0,'pnl'].sum() / (yr_t.loc[yr_t['pnl']<0,'pnl'].abs().sum() + 1e-6)
    print(f"  {yr}: N={len(yr_t)} | WR={yr_wr:.1f}% | PF={yr_pf:.3f}")

# ─── Visualisation ────────────────────────────────────────────────────────────
print("\nGenerating B1 engineering visualisation...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(22, 14), facecolor='#0d1117')
gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

# Chart 1: Stop multiplier sweep
ax1 = fig.add_subplot(gs[0, 0])
stop_mults = list(stop_results.keys())
stop_pfs   = [stop_results[m]['pf'] for m in stop_mults]
ax1.plot(stop_mults, stop_pfs, color=BLUE, marker='o', linewidth=2)
ax1.axhline(1.5, color=GOLD, linestyle='--', alpha=0.7)
ax1.set_title('PF vs Stop Multiplier\n(RR=2.5 fixed)', color='white', fontsize=11, fontweight='bold')
ax1.set_xlabel('Stop ATR Multiplier', color='white'); ax1.set_ylabel('Profit Factor', color='white')
ax1.tick_params(colors='white')

# Chart 2: RR sweep
ax2 = fig.add_subplot(gs[0, 1])
rr_vals = list(rr_results.keys())
rr_pfs  = [rr_results[r]['pf'] for r in rr_vals]
rr_nets = [rr_results[r]['net'] for r in rr_vals]
ax2_twin = ax2.twinx()
ax2.plot(rr_vals, rr_pfs, color=BLUE, marker='o', linewidth=2, label='PF')
ax2_twin.plot(rr_vals, rr_nets, color=GREEN, marker='s', linewidth=2, linestyle='--', label='Net $')
ax2.set_title('PF & Net P&L vs Reward:Risk\n(Stop=1.5×ATR fixed)', color='white', fontsize=11, fontweight='bold')
ax2.set_xlabel('Reward:Risk Ratio', color='white'); ax2.set_ylabel('Profit Factor', color='white')
ax2_twin.set_ylabel('Net P&L ($)', color=GREEN)
ax2.tick_params(colors='white'); ax2_twin.tick_params(colors=GREEN)

# Chart 3: Configuration comparison
ax3 = fig.add_subplot(gs[0, 2])
cfg_labels = [k[:20] for k in best_results.keys()]
cfg_pfs    = [v['scores']['pf'] for v in best_results.values()]
cfg_ns     = [v['scores']['n'] for v in best_results.values()]
colors3 = [GREEN if p >= 2.0 else GOLD if p >= 1.5 else RED for p in cfg_pfs]
bars3 = ax3.barh(cfg_labels[::-1], cfg_pfs[::-1], color=colors3[::-1], alpha=0.85, edgecolor='white', linewidth=0.5)
ax3.axvline(1.5, color=GOLD, linestyle='--', alpha=0.7)
ax3.set_title('PF by Configuration\n(B1 Engineering)', color='white', fontsize=11, fontweight='bold')
ax3.set_xlabel('Profit Factor', color='white'); ax3.tick_params(colors='white')

# Chart 4: Final B1 equity curve
ax4 = fig.add_subplot(gs[1, :])
equity = b1_trades['pnl'].cumsum()
ax4.plot(range(len(equity)), equity, color=GREEN, linewidth=2, label=f'Model B1: {best_label}')
ax4.fill_between(range(len(equity)), equity, alpha=0.15, color=GREEN)
ax4.axhline(0, color='white', linestyle='--', alpha=0.3)
ax4.set_title(f'Model B1 Final Equity Curve\n{best_label} | N={b1_scores["n"]} | WR={b1_scores["wr"]:.1f}% | PF={b1_scores["pf"]:.3f} | Net=${b1_scores["net"]:,.0f}', 
              color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
ax4.tick_params(colors='white'); ax4.legend(fontsize=10)

plt.suptitle('Atlas Sprint 061 — Model B1 Engineering (MVC-003 Execution Mechanics Optimisation)', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint061_b1_engineering.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint061_b1_engineering.png")

# Save results
output = {
    'selected_config': best_cfg['config'],
    'selected_label': best_label,
    'b1_scores': b1_scores,
    'stop_results': {str(k): v for k, v in stop_results.items()},
    'rr_results': {str(k): v for k, v in rr_results.items()},
    'session_results': session_results,
    'adx_results': adx_results,
    'ema_results': ema_results,
    'best_configs': {k: {'config': v['config'], 'scores': v['scores']} for k, v in best_results.items()},
}
with open(f'{OUTPUT_DIR}/b1_engineering_results.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/b1_engineering_results.json")
print("=== MODEL B1 ENGINEERING COMPLETE ===")
