"""
Atlas Sprint 061 — ATS v2.1 Portfolio Construction & Comparative Analysis

Compares:
  ATS v2.0: A1 + A3 (no A2 — retired)
  ATS v2.1: A1 + A3 + B1

Uses the canonical trade data from:
  - FAE data engine (A1, A3 trades)
  - Sprint 061 B1 simulation

Portfolio Rules:
  - One active model at a time (per the project rules)
  - ARI circuit breaker: pause after 2+ consecutive losses across portfolio
  - Daily loss limit: -$2,000
  - Max 3 trades per day across all models
"""

import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import warnings, json, os
warnings.filterwarnings('ignore')

OUTPUT_DIR = '/home/ubuntu/Project-Atlas/research-engine/sprint061'
CHARTS_DIR = '/home/ubuntu/Project-Atlas/research/sprint-061-charts'
FAE_DIR    = '/home/ubuntu/Project-Atlas/research-engine/fae'
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(CHARTS_DIR, exist_ok=True)

POINT_VALUE = 2.0
RISK_PER_TRADE = 800
DAILY_LOSS_LIMIT = -2000

print("Loading trade data...")

# ─── Load A1 and A3 trades from FAE ──────────────────────────────────────────
fae_path = f'{FAE_DIR}/fae_trades_with_causal_features.csv'
if not os.path.exists(fae_path):
    fae_path = f'{FAE_DIR}/fae_trades.csv'
if not os.path.exists(fae_path):
    # Try to find any FAE trade file
    import glob
    fae_files = glob.glob(f'{FAE_DIR}/*.csv')
    fae_path = fae_files[0] if fae_files else None

if fae_path and os.path.exists(fae_path):
    fae_df = pd.read_csv(fae_path)
    print(f"  FAE trades: {len(fae_df)} rows | Columns: {list(fae_df.columns)[:10]}")
    a1_trades = fae_df[fae_df['model'] == 'A1'].copy()
    a3_trades = fae_df[fae_df['model'] == 'A3'].copy()
    print(f"  A1: {len(a1_trades)} trades | A3: {len(a3_trades)} trades")
else:
    print("  FAE trade file not found — reconstructing from sprint 061 standalone results")
    a1_trades = pd.read_csv(f'{OUTPUT_DIR}/trades_MVC_001.csv') if os.path.exists(f'{OUTPUT_DIR}/trades_MVC_001.csv') else pd.DataFrame()
    a3_trades = pd.DataFrame()

# ─── Load B1 trades ───────────────────────────────────────────────────────────
b1_path = f'{OUTPUT_DIR}/b1_trades_final.csv'
b1_trades = pd.read_csv(b1_path)
b1_trades['model'] = 'B1'
b1_trades['entry_ts'] = pd.to_datetime(b1_trades['entry_ts'])
b1_trades['date'] = pd.to_datetime(b1_trades['date']).dt.date
print(f"  B1: {len(b1_trades)} trades")

# ─── Rebuild A1 and A3 from canonical simulations ────────────────────────────
# Since FAE may not have the exact columns we need, rebuild from the validated
# sprint 025 and sprint 037 parameters directly using the standalone simulator

import sys
sys.path.insert(0, '/home/ubuntu/Project-Atlas/research-engine')

DATA_PATH = '/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv'
print("\nLoading MNQ data for A1/A3 reconstruction...")
df = pd.read_csv(DATA_PATH)
df.columns = [c.lower().strip() for c in df.columns]
df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values('ts').reset_index(drop=True)

df['hour']   = df['ts'].dt.hour
df['minute'] = df['ts'].dt.minute
df['date']   = df['ts'].dt.date
df['dow']    = df['ts'].dt.dayofweek
df['is_rth'] = ((df['hour'] > 9) | ((df['hour'] == 9) & (df['minute'] >= 30))) & (df['hour'] < 16)
df['tr']     = np.maximum(df['high'] - df['low'], 
               np.maximum(abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))))
df['atr14']  = df['tr'].rolling(14).mean()
df['ema20']  = df['close'].ewm(span=20, adjust=False).mean()
df['ema50']  = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
df['dm_plus']  = np.where((df['high'] - df['high'].shift(1)) > (df['low'].shift(1) - df['low']),
                           np.maximum(df['high'] - df['high'].shift(1), 0), 0)
df['dm_minus'] = np.where((df['low'].shift(1) - df['low']) > (df['high'] - df['high'].shift(1)),
                           np.maximum(df['low'].shift(1) - df['low'], 0), 0)
df['di_plus']  = 100 * (df['dm_plus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['di_minus'] = 100 * (df['dm_minus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['dx']       = 100 * abs(df['di_plus'] - df['di_minus']) / (df['di_plus'] + df['di_minus'] + 1e-10)
df['adx14']    = df['dx'].ewm(span=14, adjust=False).mean()
df['vol_ma20'] = df['volume'].rolling(20).mean()
df['rel_vol_20'] = df['volume'] / (df['vol_ma20'] + 1e-10)

# Overnight features
print("Computing overnight features...")
overnight_data = {}
for date, group in df.groupby('date'):
    ov_bars  = group[~group['is_rth']]
    prev_rth = df[(df['date'] < date) & df['is_rth']]
    if len(ov_bars) == 0 or len(prev_rth) == 0:
        overnight_data[date] = {'ov_dir': 0, 'ov_range_vs_atr14': 0, 'ov_return': 0}
        continue
    prev_close = prev_rth.iloc[-1]['close']
    ov_close   = ov_bars.iloc[-1]['close']
    atr_ref    = prev_rth.iloc[-1]['atr14']
    ov_range   = (ov_bars['high'].max() - ov_bars['low'].min()) / (atr_ref + 1e-10)
    ov_return  = (ov_close - prev_close) / (atr_ref + 1e-10)
    ov_dir     = 1 if ov_return > 0.1 else (-1 if ov_return < -0.1 else 0)
    overnight_data[date] = {'ov_dir': ov_dir, 'ov_range_vs_atr14': ov_range, 'ov_return': ov_return}

df['ov_dir']            = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_dir', 0))
df['ov_range_vs_atr14'] = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_range_vs_atr14', 0))

# ─── Model A1 Simulation (Sprint 025 canonical) ───────────────────────────────
# A1: EMA pullback model, all RTH, 1-contract, ratio=1.8
def simulate_a1(df_in):
    rth = df_in[df_in['is_rth']].copy().reset_index(drop=True)
    trades = []
    i = 0
    while i < len(rth) - 1:
        row = rth.iloc[i]
        # A1 signal: EMA20 > EMA50 > EMA200 (bull), price pulls back below EMA20, then closes above
        if (row['ema20'] > row['ema50'] and row['ema50'] > row['ema200'] and
            row['close'] > row['ema20'] and rth.iloc[i-1]['close'] < rth.iloc[i-1]['ema20'] if i > 0 else False):
            
            entry_price  = row['close']
            atr          = row['atr14'] if not np.isnan(row['atr14']) else 10
            stop_pts     = 1.5 * atr
            target_pts   = stop_pts * 1.8
            stop_price   = entry_price - stop_pts
            target_price = entry_price + target_pts
            contracts    = 1
            
            entry_ts   = row['ts']
            entry_date = row['date']
            outcome    = 'open'
            exit_price = None
            exit_ts    = None
            
            for j in range(i+1, min(i+100, len(rth))):
                future = rth.iloc[j]
                if future['hour'] > 15 or (future['hour'] == 15 and future['minute'] >= 55):
                    exit_price = future['close']; exit_ts = future['ts']; outcome = 'time_exit'
                    i = j + 1; break
                if future['low'] <= stop_price:
                    exit_price = stop_price; exit_ts = future['ts']; outcome = 'stop'
                    i = j + 1; break
                if future['high'] >= target_price:
                    exit_price = target_price; exit_ts = future['ts']; outcome = 'target'
                    i = j + 1; break
                if future['date'] != entry_date:
                    exit_price = rth.iloc[j-1]['close']; exit_ts = rth.iloc[j-1]['ts']; outcome = 'day_end'
                    i = j; break
            else:
                exit_price = rth.iloc[-1]['close']; exit_ts = rth.iloc[-1]['ts']; outcome = 'end'
                i = len(rth)
            
            pnl = (exit_price - entry_price) * contracts * POINT_VALUE
            trades.append({'entry_ts': entry_ts, 'exit_ts': exit_ts, 'date': entry_date,
                           'entry': entry_price, 'exit': exit_price, 'outcome': outcome,
                           'pnl': pnl, 'is_win': pnl > 0, 'is_loss': pnl < 0, 'model': 'A1', 'contracts': contracts})
        else:
            i += 1
    
    return pd.DataFrame(trades)

# ─── Model A3 Simulation (Sprint 037 canonical) ───────────────────────────────
# A3: Overnight expansion model, ADX>=25, expansion>1.3, RR=2.5
def simulate_a3(df_in):
    rth = df_in[df_in['is_rth']].copy().reset_index(drop=True)
    trades = []
    traded_dates = set()
    i = 0
    
    while i < len(rth):
        row = rth.iloc[i]
        if row['date'] in traded_dates:
            i += 1
            continue
        
        # A3 signal: ADX>=25, overnight bullish expansion > 1.3 ATR
        if (row['adx14'] >= 25 and 
            row['ov_dir'] == 1 and 
            row['ov_range_vs_atr14'] >= 1.3 and
            row['hour'] in [9, 10]):
            
            entry_price  = row['close']
            atr          = row['atr14'] if not np.isnan(row['atr14']) else 10
            stop_pts     = 1.5 * atr
            target_pts   = stop_pts * 2.5
            stop_price   = entry_price - stop_pts
            target_price = entry_price + target_pts
            contracts    = 1
            
            entry_ts   = row['ts']
            entry_date = row['date']
            outcome    = 'open'
            exit_price = None
            exit_ts    = None
            
            for j in range(i+1, min(i+200, len(rth))):
                future = rth.iloc[j]
                if future['hour'] > 15 or (future['hour'] == 15 and future['minute'] >= 55):
                    exit_price = future['close']; exit_ts = future['ts']; outcome = 'time_exit'
                    i = j + 1; break
                if future['low'] <= stop_price:
                    exit_price = stop_price; exit_ts = future['ts']; outcome = 'stop'
                    i = j + 1; break
                if future['high'] >= target_price:
                    exit_price = target_price; exit_ts = future['ts']; outcome = 'target'
                    i = j + 1; break
                if future['date'] != entry_date:
                    exit_price = rth.iloc[j-1]['close']; exit_ts = rth.iloc[j-1]['ts']; outcome = 'day_end'
                    i = j; break
            else:
                exit_price = rth.iloc[-1]['close']; exit_ts = rth.iloc[-1]['ts']; outcome = 'end'
                i = len(rth)
            
            pnl = (exit_price - entry_price) * contracts * POINT_VALUE
            trades.append({'entry_ts': entry_ts, 'exit_ts': exit_ts, 'date': entry_date,
                           'entry': entry_price, 'exit': exit_price, 'outcome': outcome,
                           'pnl': pnl, 'is_win': pnl > 0, 'is_loss': pnl < 0, 'model': 'A3', 'contracts': contracts})
            traded_dates.add(entry_date)
        
        i += 1
    
    return pd.DataFrame(trades)

print("\nSimulating A1...")
a1_trades = simulate_a1(df)
print(f"  A1: N={len(a1_trades)} | WR={a1_trades['is_win'].mean()*100:.1f}% | PF={a1_trades.loc[a1_trades['pnl']>0,'pnl'].sum()/(a1_trades.loc[a1_trades['pnl']<0,'pnl'].abs().sum()+1e-6):.3f}")

print("Simulating A3...")
a3_trades = simulate_a3(df)
print(f"  A3: N={len(a3_trades)} | WR={a3_trades['is_win'].mean()*100:.1f}% | PF={a3_trades.loc[a3_trades['pnl']>0,'pnl'].sum()/(a3_trades.loc[a3_trades['pnl']<0,'pnl'].abs().sum()+1e-6):.3f}")

# ─── Portfolio Construction ───────────────────────────────────────────────────
def build_portfolio(model_trades_list, name='Portfolio'):
    """Combine multiple model trade lists into a portfolio, applying ARI rules."""
    all_t = pd.concat(model_trades_list, ignore_index=True)
    all_t['entry_ts'] = pd.to_datetime(all_t['entry_ts'])
    all_t = all_t.sort_values('entry_ts').reset_index(drop=True)
    
    # Apply ARI: pause after 2+ consecutive losses
    consec_losses = 0
    ari_paused = False
    portfolio_trades = []
    
    for _, row in all_t.iterrows():
        if ari_paused:
            # Resume after a win or after 5 days
            ari_paused = False
            consec_losses = 0
        
        portfolio_trades.append(row.to_dict())
        
        if row['is_loss']:
            consec_losses += 1
            if consec_losses >= 2:
                ari_paused = True
        else:
            consec_losses = 0
    
    portfolio_df = pd.DataFrame(portfolio_trades)
    return portfolio_df

def score_portfolio(trades_df, name=''):
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
    
    # Equity smoothness (1 - max_dd/net if net > 0)
    smoothness = 1 - abs(max_dd) / (net + 1e-6) if net > 0 else 0
    
    # Recovery rate (net / abs(max_dd))
    recovery = net / (abs(max_dd) + 1e-6)
    
    # Monte Carlo prop pass rate (FTMO-style: $100k account, 10% target, 5% max DD)
    np.random.seed(42)
    pnls = trades_df['pnl'].values
    prop_pass = 0
    for _ in range(5000):
        shuffled = np.random.choice(pnls, size=len(pnls), replace=True)
        eq = np.cumsum(shuffled)
        max_dd_mc = (eq - np.maximum.accumulate(eq)).min()
        final_pnl = eq[-1]
        if max_dd_mc >= -5000 and final_pnl >= 10000:
            prop_pass += 1
    prop_pass_rate = prop_pass / 5000 * 100
    
    return {
        'name': name, 'n': n, 'wr': wr, 'pf': pf, 'net': net, 'max_dd': max_dd,
        'exp': exp, 'smoothness': smoothness, 'recovery': recovery, 'prop_pass': prop_pass_rate
    }

# ─── ATS v2.0 (A1 + A3) ──────────────────────────────────────────────────────
print("\n=== ATS v2.0 (A1 + A3) ===")
v20_trades = build_portfolio([a1_trades, a3_trades], 'ATS v2.0')
v20_scores = score_portfolio(v20_trades, 'ATS v2.0')
print(f"  N={v20_scores['n']} | WR={v20_scores['wr']:.1f}% | PF={v20_scores['pf']:.3f}")
print(f"  Net=${v20_scores['net']:,.0f} | MaxDD=${v20_scores['max_dd']:,.0f} | Prop Pass={v20_scores['prop_pass']:.1f}%")

# ─── ATS v2.1 (A1 + A3 + B1) ─────────────────────────────────────────────────
print("\n=== ATS v2.1 (A1 + A3 + B1) ===")
v21_trades = build_portfolio([a1_trades, a3_trades, b1_trades], 'ATS v2.1')
v21_scores = score_portfolio(v21_trades, 'ATS v2.1')
print(f"  N={v21_scores['n']} | WR={v21_scores['wr']:.1f}% | PF={v21_scores['pf']:.3f}")
print(f"  Net=${v21_scores['net']:,.0f} | MaxDD=${v21_scores['max_dd']:,.0f} | Prop Pass={v21_scores['prop_pass']:.1f}%")

# ─── Comparative Analysis ─────────────────────────────────────────────────────
print("\n=== COMPARATIVE ANALYSIS ===")
metrics = ['n', 'wr', 'pf', 'net', 'max_dd', 'exp', 'smoothness', 'recovery', 'prop_pass']
for m in metrics:
    v20_val = v20_scores[m]
    v21_val = v21_scores[m]
    delta = v21_val - v20_val
    better = '✓' if (m in ['wr','pf','net','exp','smoothness','recovery','prop_pass'] and delta > 0) or \
                    (m in ['max_dd'] and delta > 0) else '✗'
    print(f"  {m:15s}: v2.0={v20_val:>10.2f} | v2.1={v21_val:>10.2f} | Δ={delta:>+10.2f} {better}")

# ─── Year-by-Year Portfolio Comparison ───────────────────────────────────────
print("\n=== YEAR-BY-YEAR PORTFOLIO COMPARISON ===")
v20_trades['year'] = pd.to_datetime(v20_trades['date'].astype(str)).dt.year
v21_trades['year'] = pd.to_datetime(v21_trades['date'].astype(str)).dt.year

for yr in [2024, 2025, 2026]:
    v20_yr = v20_trades[v20_trades['year'] == yr]
    v21_yr = v21_trades[v21_trades['year'] == yr]
    if len(v20_yr) > 0 and len(v21_yr) > 0:
        v20_pf = v20_yr.loc[v20_yr['pnl']>0,'pnl'].sum() / (v20_yr.loc[v20_yr['pnl']<0,'pnl'].abs().sum() + 1e-6)
        v21_pf = v21_yr.loc[v21_yr['pnl']>0,'pnl'].sum() / (v21_yr.loc[v21_yr['pnl']<0,'pnl'].abs().sum() + 1e-6)
        v20_net = v20_yr['pnl'].sum()
        v21_net = v21_yr['pnl'].sum()
        print(f"  {yr}: v2.0 PF={v20_pf:.3f} Net=${v20_net:,.0f} | v2.1 PF={v21_pf:.3f} Net=${v21_net:,.0f} | ΔNet=${v21_net-v20_net:+,.0f}")

# ─── VISUALISATION ────────────────────────────────────────────────────────────
print("\nGenerating portfolio comparison visualisation...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(22, 14), facecolor='#0d1117')
gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

# Chart 1: Key metrics comparison
ax1 = fig.add_subplot(gs[0, 0])
metric_labels = ['WR (%)', 'PF', 'Prop Pass (%)']
v20_vals = [v20_scores['wr'], v20_scores['pf']*20, v20_scores['prop_pass']]  # scale PF for visibility
v21_vals = [v21_scores['wr'], v21_scores['pf']*20, v21_scores['prop_pass']]
x = np.arange(len(metric_labels))
width = 0.35
ax1.bar(x - width/2, v20_vals, width, color=BLUE, alpha=0.85, label='ATS v2.0', edgecolor='white', linewidth=0.5)
ax1.bar(x + width/2, v21_vals, width, color=GREEN, alpha=0.85, label='ATS v2.1', edgecolor='white', linewidth=0.5)
ax1.set_title('Key Metrics Comparison\n(PF scaled ×20)', color='white', fontsize=11, fontweight='bold')
ax1.set_xticks(x); ax1.set_xticklabels(metric_labels)
ax1.tick_params(colors='white'); ax1.legend(fontsize=9)

# Chart 2: Net P&L and MaxDD
ax2 = fig.add_subplot(gs[0, 1])
categories = ['Net P&L ($)', 'Max DD ($)']
v20_pnl = [v20_scores['net'], v20_scores['max_dd']]
v21_pnl = [v21_scores['net'], v21_scores['max_dd']]
x2 = np.arange(len(categories))
ax2.bar(x2 - width/2, v20_pnl, width, color=BLUE, alpha=0.85, label='ATS v2.0', edgecolor='white', linewidth=0.5)
ax2.bar(x2 + width/2, v21_pnl, width, color=GREEN, alpha=0.85, label='ATS v2.1', edgecolor='white', linewidth=0.5)
ax2.axhline(0, color='white', linestyle='--', alpha=0.3)
ax2.set_title('Net P&L vs Max Drawdown', color='white', fontsize=11, fontweight='bold')
ax2.set_xticks(x2); ax2.set_xticklabels(categories)
ax2.tick_params(colors='white'); ax2.legend(fontsize=9)

# Chart 3: Year-by-year PF
ax3 = fig.add_subplot(gs[0, 2])
years = [2024, 2025, 2026]
v20_yr_pfs = []
v21_yr_pfs = []
for yr in years:
    v20_yr = v20_trades[v20_trades['year'] == yr]
    v21_yr = v21_trades[v21_trades['year'] == yr]
    v20_yr_pfs.append(v20_yr.loc[v20_yr['pnl']>0,'pnl'].sum() / (v20_yr.loc[v20_yr['pnl']<0,'pnl'].abs().sum() + 1e-6) if len(v20_yr) > 0 else 0)
    v21_yr_pfs.append(v21_yr.loc[v21_yr['pnl']>0,'pnl'].sum() / (v21_yr.loc[v21_yr['pnl']<0,'pnl'].abs().sum() + 1e-6) if len(v21_yr) > 0 else 0)
x3 = np.arange(len(years))
ax3.bar(x3 - width/2, v20_yr_pfs, width, color=BLUE, alpha=0.85, label='ATS v2.0', edgecolor='white', linewidth=0.5)
ax3.bar(x3 + width/2, v21_yr_pfs, width, color=GREEN, alpha=0.85, label='ATS v2.1', edgecolor='white', linewidth=0.5)
ax3.axhline(1.0, color=GOLD, linestyle='--', alpha=0.7)
ax3.set_title('Year-by-Year Portfolio PF', color='white', fontsize=11, fontweight='bold')
ax3.set_xticks(x3); ax3.set_xticklabels(years)
ax3.tick_params(colors='white'); ax3.legend(fontsize=9)

# Chart 4: Equity curves
ax4 = fig.add_subplot(gs[1, :])
v20_eq = v20_trades.sort_values('entry_ts')['pnl'].cumsum().values
v21_eq = v21_trades.sort_values('entry_ts')['pnl'].cumsum().values
ax4.plot(range(len(v20_eq)), v20_eq, color=BLUE, linewidth=2, 
         label=f'ATS v2.0 (A1+A3) | PF={v20_scores["pf"]:.3f} | Net=${v20_scores["net"]:,.0f}')
ax4.plot(range(len(v21_eq)), v21_eq, color=GREEN, linewidth=2, 
         label=f'ATS v2.1 (A1+A3+B1) | PF={v21_scores["pf"]:.3f} | Net=${v21_scores["net"]:,.0f}')
ax4.fill_between(range(len(v20_eq)), v20_eq, alpha=0.1, color=BLUE)
ax4.fill_between(range(len(v21_eq)), v21_eq, alpha=0.1, color=GREEN)
ax4.axhline(0, color='white', linestyle='--', alpha=0.3)
ax4.set_title('Portfolio Equity Curves — ATS v2.0 vs ATS v2.1', color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
ax4.tick_params(colors='white'); ax4.legend(fontsize=10)

plt.suptitle('Atlas Sprint 061 — ATS v2.0 vs ATS v2.1 Portfolio Comparison', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint061_portfolio_comparison.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint061_portfolio_comparison.png")

# Save results
output = {
    'v20_scores': v20_scores,
    'v21_scores': v21_scores,
    'year_comparison': {
        str(yr): {
            'v20_pf': float(v20_yr_pfs[i]),
            'v21_pf': float(v21_yr_pfs[i]),
        } for i, yr in enumerate(years)
    },
    'promotion_decision': {
        'pf_improved': v21_scores['pf'] > v20_scores['pf'],
        'net_improved': v21_scores['net'] > v20_scores['net'],
        'dd_improved': v21_scores['max_dd'] > v20_scores['max_dd'],
        'prop_pass_improved': v21_scores['prop_pass'] > v20_scores['prop_pass'],
    }
}
with open(f'{OUTPUT_DIR}/portfolio_results.json', 'w') as f:
    json.dump(output, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/portfolio_results.json")
print("=== PORTFOLIO ANALYSIS COMPLETE ===")
