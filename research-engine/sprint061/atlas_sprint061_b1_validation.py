"""
Atlas Sprint 061 — Model B1 Validation Suite

Full validation for Model B1:
  - OOS (in-sample 2024-2025, out-of-sample 2026)
  - Walk-forward (12 rolling windows)
  - Monte Carlo (10,000 runs, $5,000 DD limit)
  - Regime decomposition (ADX, EMA, session)
  - Permutation test
  - Year stability
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
df['tr']     = np.maximum(df['high'] - df['low'], 
               np.maximum(abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))))
df['atr14']  = df['tr'].ewm(span=14, adjust=False).mean()
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
df['txn_ma20'] = df['transactions'].rolling(20).mean() if 'transactions' in df.columns else df['volume'].rolling(20).mean()
df['rel_txn']  = df['transactions'] / (df['txn_ma20'] + 1e-10) if 'transactions' in df.columns else df['volume'] / (df['txn_ma20'] + 1e-10)

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

# Model B1 signal (FROZEN MVC-003 + execution mechanics)
df['b1_signal'] = ((df['rel_txn'] >= 1.33) & 
                   (df['ov_range_vs_atr14'] >= 10.85) & 
                   (df['ov_dir'] == 1) &
                   (df['hour'].isin([9, 10, 11])) &
                   (df['adx14'] >= 25)).astype(int)

# ─── Execution Simulator ──────────────────────────────────────────────────────
def simulate_b1(df_in, permute=False, seed=None):
    """Simulate Model B1. permute=True shuffles outcomes for permutation test."""
    rth = df_in[df_in['is_rth']].copy().reset_index(drop=True)
    trades = []
    traded_dates = set()
    i = 0
    
    while i < len(rth):
        row = rth.iloc[i]
        if row['date'] in traded_dates:
            i += 1
            continue
        if row['b1_signal'] != 1:
            i += 1
            continue
        
        entry_price  = row['close']
        atr          = row['atr14']
        stop_pts     = 1.5 * atr
        target_pts   = stop_pts * 3.0
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
            'atr': atr, 'stop_pts': stop_pts, 'contracts': contracts,
            'outcome': outcome, 'pnl': pnl,
            'is_win': pnl > 0, 'is_loss': pnl < 0,
            'adx': row['adx14'], 'ema_bull': row['ema_bull'],
        })
        traded_dates.add(entry_date)
    
    trades_df = pd.DataFrame(trades)
    if permute and len(trades_df) > 0:
        rng = np.random.default_rng(seed)
        trades_df['pnl'] = rng.permutation(trades_df['pnl'].values)
        trades_df['is_win'] = trades_df['pnl'] > 0
        trades_df['is_loss'] = trades_df['pnl'] < 0
    return trades_df

def score_trades(trades_df):
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
    return {'n': n, 'wr': wr, 'pf': pf, 'net': net, 'max_dd': max_dd, 'exp': exp}

# ─── Full simulation ──────────────────────────────────────────────────────────
print("\nRunning full B1 simulation...")
all_trades = simulate_b1(df)
all_trades['year'] = pd.to_datetime(all_trades['date'].astype(str)).dt.year
all_trades['month'] = pd.to_datetime(all_trades['date'].astype(str)).dt.to_period('M')
full_scores = score_trades(all_trades)
print(f"  Full: N={full_scores['n']} | WR={full_scores['wr']:.1f}% | PF={full_scores['pf']:.3f} | Net=${full_scores['net']:,.0f}")

# ─── 1. OOS Validation ────────────────────────────────────────────────────────
print("\n=== 1. OOS VALIDATION (IS: 2024-2025, OOS: 2026) ===")
is_mask  = all_trades['year'] <= 2025
oos_mask = all_trades['year'] == 2026
is_scores  = score_trades(all_trades[is_mask])
oos_scores = score_trades(all_trades[oos_mask])
print(f"  IS (2024-2025): N={is_scores['n']} | WR={is_scores['wr']:.1f}% | PF={is_scores['pf']:.3f} | Net=${is_scores['net']:,.0f}")
print(f"  OOS (2026):     N={oos_scores['n']} | WR={oos_scores['wr']:.1f}% | PF={oos_scores['pf']:.3f} | Net=${oos_scores['net']:,.0f}")

# ─── 2. Walk-Forward ──────────────────────────────────────────────────────────
print("\n=== 2. WALK-FORWARD (12 windows, 60-day IS, 30-day OOS) ===")
all_trades_sorted = all_trades.sort_values('entry_ts').reset_index(drop=True)
all_trades_sorted['entry_dt'] = pd.to_datetime(all_trades_sorted['date'].astype(str))
dates = sorted(all_trades_sorted['entry_dt'].unique())
wf_results = []
window_size = 60  # days IS
oos_size    = 30  # days OOS
start_date  = dates[0]
end_date    = dates[-1]

current = start_date
while current + pd.Timedelta(days=window_size + oos_size) <= end_date:
    is_end  = current + pd.Timedelta(days=window_size)
    oos_end = is_end + pd.Timedelta(days=oos_size)
    
    is_t  = all_trades_sorted[(all_trades_sorted['entry_dt'] >= current) & (all_trades_sorted['entry_dt'] < is_end)]
    oos_t = all_trades_sorted[(all_trades_sorted['entry_dt'] >= is_end) & (all_trades_sorted['entry_dt'] < oos_end)]
    
    if len(is_t) >= 5 and len(oos_t) >= 3:
        is_s  = score_trades(is_t)
        oos_s = score_trades(oos_t)
        wf_results.append({'window': len(wf_results)+1, 'is': is_s, 'oos': oos_s})
    
    current += pd.Timedelta(days=30)

above_55 = sum(1 for w in wf_results if w['oos']['wr'] >= 43)  # B1 uses RR=3.0, so 43% WR is equivalent to 55% at RR=1.5
above_pf = sum(1 for w in wf_results if w['oos']['pf'] >= 1.5)
print(f"  {len(wf_results)} windows | WR>=43%: {above_55}/{len(wf_results)} | PF>=1.5: {above_pf}/{len(wf_results)}")
for w in wf_results:
    print(f"  W{w['window']:02d}: IS WR={w['is']['wr']:.1f}% PF={w['is']['pf']:.2f} | OOS WR={w['oos']['wr']:.1f}% PF={w['oos']['pf']:.2f} (N={w['oos']['n']})")

# ─── 3. Monte Carlo ───────────────────────────────────────────────────────────
print("\n=== 3. MONTE CARLO (10,000 runs, $5,000 DD limit) ===")
np.random.seed(42)
pnls = all_trades['pnl'].values
n_runs = 10000
mc_pass_wr = 0
mc_pass_pf = 0
mc_pass_dd = 0
mc_wrs = []
mc_pfs = []
mc_dds = []

for _ in range(n_runs):
    shuffled = np.random.choice(pnls, size=len(pnls), replace=True)
    wr = (shuffled > 0).mean() * 100
    gw = shuffled[shuffled > 0].sum()
    gl = abs(shuffled[shuffled < 0].sum())
    pf = gw / (gl + 1e-6)
    eq = np.cumsum(shuffled)
    dd = (eq - np.maximum.accumulate(eq)).min()
    mc_wrs.append(wr)
    mc_pfs.append(pf)
    mc_dds.append(dd)
    if wr >= 40: mc_pass_wr += 1
    if pf >= 1.5: mc_pass_pf += 1
    if dd >= -5000: mc_pass_dd += 1

print(f"  WR>=40%: {mc_pass_wr/n_runs*100:.1f}% | PF>=1.5: {mc_pass_pf/n_runs*100:.1f}% | DD>=-$5k: {mc_pass_dd/n_runs*100:.1f}%")
print(f"  WR p5={np.percentile(mc_wrs,5):.1f}% | PF p5={np.percentile(mc_pfs,5):.3f} | DD p5=${np.percentile(mc_dds,5):,.0f}")

# ─── 4. Permutation Test (fast — shuffle PnL array directly) ─────────────────
print("\n=== 4. PERMUTATION TEST (10,000 runs, fast shuffle) ===")
canonical_pf = full_scores['pf']
pnl_arr = all_trades['pnl'].values
np.random.seed(42)
perm_pfs = []
for _ in range(10000):
    shuffled = np.random.permutation(pnl_arr)
    gw = shuffled[shuffled > 0].sum()
    gl = abs(shuffled[shuffled < 0].sum())
    perm_pfs.append(gw / (gl + 1e-6))

z_score = (canonical_pf - np.mean(perm_pfs)) / (np.std(perm_pfs) + 1e-10)
p_value = np.mean([p >= canonical_pf for p in perm_pfs])
print(f"  Canonical PF={canonical_pf:.3f} | Perm mean={np.mean(perm_pfs):.3f} | Z={z_score:.2f} | p={p_value:.6f}")

# ─── 5. Regime Decomposition ──────────────────────────────────────────────────
print("\n=== 5. REGIME DECOMPOSITION ===")
# ADX regime
for adx_range, label in [((0,25), 'Low ADX <25'), ((25,35), 'Mid ADX 25-35'), ((35,100), 'High ADX >35')]:
    t = all_trades[(all_trades['adx'] >= adx_range[0]) & (all_trades['adx'] < adx_range[1])]
    if len(t) > 0:
        s = score_trades(t)
        print(f"  {label}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f}")

# EMA alignment
for ema_val, label in [(1, 'EMA Bull'), (0, 'EMA Neutral/Bear')]:
    t = all_trades[all_trades['ema_bull'] == ema_val]
    if len(t) > 0:
        s = score_trades(t)
        print(f"  {label}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f}")

# Month stability
print("\n  Monthly stability:")
for month, t in all_trades.groupby('month'):
    if len(t) >= 3:
        s = score_trades(t)
        print(f"    {month}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f}")

# ─── 6. Year Stability ────────────────────────────────────────────────────────
print("\n=== 6. YEAR STABILITY ===")
year_scores = {}
for yr in sorted(all_trades['year'].unique()):
    t = all_trades[all_trades['year'] == yr]
    s = score_trades(t)
    year_scores[int(yr)] = s
    print(f"  {yr}: N={s['n']} | WR={s['wr']:.1f}% | PF={s['pf']:.3f} | Net=${s['net']:,.0f}")

# ─── VISUALISATION ────────────────────────────────────────────────────────────
print("\nGenerating B1 validation visualisation...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(22, 14), facecolor='#0d1117')
gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

# Chart 1: Walk-forward OOS WR
ax1 = fig.add_subplot(gs[0, 0])
wf_wrs = [w['oos']['wr'] for w in wf_results]
wf_pfs = [w['oos']['pf'] for w in wf_results]
x = range(1, len(wf_results)+1)
colors_wf = [GREEN if w >= 43 else RED for w in wf_wrs]
ax1.bar(x, wf_wrs, color=colors_wf, alpha=0.85, edgecolor='white', linewidth=0.5)
ax1.axhline(43, color=GOLD, linestyle='--', alpha=0.7, label='43% WR floor (equiv. 55% at RR=1.5)')
ax1.set_title('Walk-Forward OOS Win Rate\n(12 windows)', color='white', fontsize=11, fontweight='bold')
ax1.set_xlabel('Window', color='white'); ax1.set_ylabel('Win Rate (%)', color='white')
ax1.tick_params(colors='white'); ax1.legend(fontsize=8)

# Chart 2: Monte Carlo PF distribution
ax2 = fig.add_subplot(gs[0, 1])
ax2.hist(mc_pfs, bins=50, color=BLUE, alpha=0.7, edgecolor='none')
ax2.axvline(canonical_pf, color=GREEN, linewidth=2, label=f'Canonical PF={canonical_pf:.3f}')
ax2.axvline(1.5, color=GOLD, linestyle='--', alpha=0.7, label='PF 1.5 floor')
ax2.set_title(f'Monte Carlo PF Distribution\n(10,000 runs | Z={z_score:.2f})', color='white', fontsize=11, fontweight='bold')
ax2.set_xlabel('Profit Factor', color='white'); ax2.set_ylabel('Frequency', color='white')
ax2.tick_params(colors='white'); ax2.legend(fontsize=9)

# Chart 3: Year stability
ax3 = fig.add_subplot(gs[0, 2])
years = list(year_scores.keys())
yr_pfs = [year_scores[y]['pf'] for y in years]
yr_wrs = [year_scores[y]['wr'] for y in years]
x3 = np.arange(len(years))
width = 0.35
ax3.bar(x3 - width/2, yr_pfs, width, color=BLUE, alpha=0.85, label='PF', edgecolor='white', linewidth=0.5)
ax3_twin = ax3.twinx()
ax3_twin.bar(x3 + width/2, yr_wrs, width, color=GREEN, alpha=0.85, label='WR%', edgecolor='white', linewidth=0.5)
ax3.set_title('Year-by-Year Stability', color='white', fontsize=11, fontweight='bold')
ax3.set_xticks(x3); ax3.set_xticklabels(years)
ax3.set_ylabel('Profit Factor', color=BLUE); ax3_twin.set_ylabel('Win Rate (%)', color=GREEN)
ax3.tick_params(colors='white'); ax3_twin.tick_params(colors=GREEN)
ax3.axhline(1.5, color=GOLD, linestyle='--', alpha=0.5)

# Chart 4: Equity curve with IS/OOS split
ax4 = fig.add_subplot(gs[1, :])
equity = all_trades.sort_values('entry_ts')['pnl'].cumsum().values
is_n   = is_scores['n']
ax4.plot(range(is_n), equity[:is_n], color=BLUE, linewidth=2, label=f'IS 2024-2025 (PF={is_scores["pf"]:.3f})')
ax4.plot(range(is_n, len(equity)), equity[is_n:], color=GREEN, linewidth=2, label=f'OOS 2026 (PF={oos_scores["pf"]:.3f})')
ax4.axvline(is_n, color=GOLD, linestyle='--', alpha=0.7, label='IS/OOS Split')
ax4.fill_between(range(is_n), equity[:is_n], alpha=0.1, color=BLUE)
ax4.fill_between(range(is_n, len(equity)), equity[is_n:], alpha=0.1, color=GREEN)
ax4.axhline(0, color='white', linestyle='--', alpha=0.3)
ax4.set_title(f'Model B1 Equity Curve — IS/OOS Split\nFull: N={full_scores["n"]} | WR={full_scores["wr"]:.1f}% | PF={full_scores["pf"]:.3f} | MaxDD=${full_scores["max_dd"]:,.0f}', 
              color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
ax4.tick_params(colors='white'); ax4.legend(fontsize=10)

plt.suptitle('Atlas Sprint 061 — Model B1 Validation Suite', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint061_b1_validation.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint061_b1_validation.png")

# Save results
output = {
    'full_scores': full_scores,
    'is_scores': is_scores,
    'oos_scores': oos_scores,
    'wf_summary': {'total': len(wf_results), 'above_43wr': above_55, 'above_pf15': above_pf},
    'mc_summary': {'pass_wr40': mc_pass_wr/n_runs*100, 'pass_pf15': mc_pass_pf/n_runs*100, 
                   'pass_dd5k': mc_pass_dd/n_runs*100, 'wr_p5': float(np.percentile(mc_wrs,5)),
                   'pf_p5': float(np.percentile(mc_pfs,5)), 'dd_p5': float(np.percentile(mc_dds,5))},
    'perm_test': {'z_score': float(z_score), 'p_value': float(p_value), 'canonical_pf': float(canonical_pf)},
    'year_scores': {str(k): v for k, v in year_scores.items()},
}
with open(f'{OUTPUT_DIR}/b1_validation_results.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/b1_validation_results.json")
print("=== MODEL B1 VALIDATION COMPLETE ===")
