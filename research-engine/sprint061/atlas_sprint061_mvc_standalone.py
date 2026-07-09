"""
Atlas Sprint 061 — MVC Stand-Alone Execution Model Evaluation

Tests each of the 6 validated MVCs as a complete execution model.
For each MVC, we define:
  - Entry: first bar where all MVC conditions are met
  - Stop: 1.5 × ATR14 (canonical Atlas stop)
  - Target: 2.5 × ATR14 (RR=2.5, same as A3)
  - Session exit: close at 15:55 if still open
  - Risk: $800 per trade (same as A2)
  - Max 1 trade per day per model
  - No re-entry after a loss on the same day

MVC Definitions:
  MVC-001: rel_vol_20 >= p85 AND ov_range_vs_atr14 >= p75 AND ov_dir == 1
  MVC-002: ov_range_vs_atr14 >= p75 AND ov_dir == 1 AND hour in [9,10,11]
  MVC-003: rel_txn >= 1.33 AND ov_range_vs_atr14 >= 10.85 AND ov_dir == 1
  MVC-004: ov_range_vs_atr14 >= p85 AND ov_dir == 1 AND dow == 2 (Wednesday)
  MVC-005: ov_dir == 1 AND day_range_vs_atr14 >= p75 AND hour in [9,10,11]
  MVC-006: ov_range_vs_atr14 >= p75 AND ema_alignment == 1 AND hour in [9,10,11]
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

print("Loading MNQ 5-min data...")
df = pd.read_csv(DATA_PATH)
df.columns = [c.lower().strip() for c in df.columns]
if 'timestamp_et' in df.columns:
    df['ts'] = pd.to_datetime(df['timestamp_et'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
elif 'timestamp' in df.columns:
    df['ts'] = pd.to_datetime(df['timestamp_utc'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
elif 'time' in df.columns:
    df['ts'] = pd.to_datetime(df['time'], utc=True).dt.tz_convert('America/New_York').dt.tz_localize(None)
df = df.sort_values('ts').reset_index(drop=True)
print(f"  {len(df):,} bars | {df['ts'].min().date()} to {df['ts'].max().date()}")

# ─── Feature Engineering ──────────────────────────────────────────────────────
print("Computing features...")
df['hour']   = df['ts'].dt.hour
df['minute'] = df['ts'].dt.minute
df['date']   = df['ts'].dt.date
df['dow']    = df['ts'].dt.dayofweek

# RTH filter
df['is_rth'] = ((df['hour'] > 9) | ((df['hour'] == 9) & (df['minute'] >= 30))) & (df['hour'] < 16)

# ATR14
df['tr']    = np.maximum(df['high'] - df['low'], 
              np.maximum(abs(df['high'] - df['close'].shift(1)), abs(df['low'] - df['close'].shift(1))))
df['atr14'] = df['tr'].ewm(span=14, adjust=False).mean()

# EMA alignment
df['ema20']  = df['close'].ewm(span=20, adjust=False).mean()
df['ema50']  = df['close'].ewm(span=50, adjust=False).mean()
df['ema200'] = df['close'].ewm(span=200, adjust=False).mean()
df['ema_alignment'] = np.where((df['ema20'] > df['ema50']) & (df['ema50'] > df['ema200']), 1,
                      np.where((df['ema20'] < df['ema50']) & (df['ema50'] < df['ema200']), -1, 0))

# ADX14
df['dm_plus']  = np.where((df['high'] - df['high'].shift(1)) > (df['low'].shift(1) - df['low']),
                           np.maximum(df['high'] - df['high'].shift(1), 0), 0)
df['dm_minus'] = np.where((df['low'].shift(1) - df['low']) > (df['high'] - df['high'].shift(1)),
                           np.maximum(df['low'].shift(1) - df['low'], 0), 0)
df['di_plus']  = 100 * (df['dm_plus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['di_minus'] = 100 * (df['dm_minus'].ewm(span=14, adjust=False).mean() / (df['atr14'] + 1e-10))
df['dx']       = 100 * abs(df['di_plus'] - df['di_minus']) / (df['di_plus'] + df['di_minus'] + 1e-10)
df['adx14']    = df['dx'].ewm(span=14, adjust=False).mean()

# Relative volume (20-bar rolling)
df['vol_ma20']    = df['volume'].rolling(20).mean()
df['rel_vol_20']  = df['volume'] / (df['vol_ma20'] + 1e-10)

# Relative transaction rate (proxy: use volume as transaction proxy)
df['txn_ma20']   = df['volume'].rolling(20).mean()
df['rel_txn']    = df['volume'] / (df['txn_ma20'] + 1e-10)

# Overnight features (computed per day)
print("Computing overnight features...")
overnight_data = {}
for date, group in df.groupby('date'):
    # Overnight = bars before 09:30 on this date
    ov_bars = group[~group['is_rth']]
    prev_rth = df[(df['date'] < date) & df['is_rth']]
    
    if len(ov_bars) == 0 or len(prev_rth) == 0:
        overnight_data[date] = {'ov_dir': 0, 'ov_range_vs_atr14': 0}
        continue
    
    prev_close = prev_rth.iloc[-1]['close']
    ov_high    = ov_bars['high'].max()
    ov_low     = ov_bars['low'].min()
    ov_close   = ov_bars.iloc[-1]['close'] if len(ov_bars) > 0 else prev_close
    atr_ref    = prev_rth.iloc[-1]['atr14']
    
    ov_range   = (ov_high - ov_low) / (atr_ref + 1e-10)
    ov_return  = (ov_close - prev_close) / (atr_ref + 1e-10)
    ov_dir     = 1 if ov_return > 0.1 else (-1 if ov_return < -0.1 else 0)
    
    overnight_data[date] = {'ov_dir': ov_dir, 'ov_range_vs_atr14': ov_range}

df['ov_dir']           = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_dir', 0))
df['ov_range_vs_atr14'] = df['date'].map(lambda d: overnight_data.get(d, {}).get('ov_range_vs_atr14', 0))

# Day range vs ATR14 (running intraday)
df['day_high'] = df.groupby('date')['high'].transform('cummax')
df['day_low']  = df.groupby('date')['low'].transform('cummin')
df['day_range_vs_atr14'] = (df['day_high'] - df['day_low']) / (df['atr14'] + 1e-10)

# Compute percentile thresholds from full dataset
rth_df = df[df['is_rth']].copy()
p75_ov  = np.percentile(rth_df['ov_range_vs_atr14'].dropna(), 75)
p85_ov  = np.percentile(rth_df['ov_range_vs_atr14'].dropna(), 85)
p75_dr  = np.percentile(rth_df['day_range_vs_atr14'].dropna(), 75)
p85_rv  = np.percentile(rth_df['rel_vol_20'].dropna(), 85)
print(f"  Thresholds: ov_range p75={p75_ov:.2f}, p85={p85_ov:.2f} | dayrange p75={p75_dr:.2f} | rel_vol p85={p85_rv:.2f}")

# ─── MVC Signal Functions ─────────────────────────────────────────────────────
def mvc_signal(row, mvc_id):
    """Return True if the MVC conditions are met for this bar."""
    if mvc_id == 'MVC-001':
        return (row['rel_vol_20'] >= p85_rv and 
                row['ov_range_vs_atr14'] >= p75_ov and 
                row['ov_dir'] == 1)
    elif mvc_id == 'MVC-002':
        return (row['ov_range_vs_atr14'] >= p75_ov and 
                row['ov_dir'] == 1 and 
                row['hour'] in [9, 10, 11])
    elif mvc_id == 'MVC-003':
        return (row['rel_txn'] >= 1.33 and 
                row['ov_range_vs_atr14'] >= 10.85 and 
                row['ov_dir'] == 1)
    elif mvc_id == 'MVC-004':
        return (row['ov_range_vs_atr14'] >= p85_ov and 
                row['ov_dir'] == 1 and 
                row['dow'] == 2)
    elif mvc_id == 'MVC-005':
        return (row['ov_dir'] == 1 and 
                row['day_range_vs_atr14'] >= p75_dr and 
                row['hour'] in [9, 10, 11])
    elif mvc_id == 'MVC-006':
        return (row['ov_range_vs_atr14'] >= p75_ov and 
                row['ema_alignment'] == 1 and 
                row['hour'] in [9, 10, 11])
    return False

# ─── Execution Simulator ──────────────────────────────────────────────────────
RISK_PER_TRADE = 800  # $800 per trade
TICK_VALUE     = 0.50  # MNQ: $0.50 per tick, 1 tick = 0.25 pts → $0.50 per 0.25 pts = $2/pt
POINT_VALUE    = 2.0   # $2 per point for MNQ
RR             = 2.5   # Reward:Risk ratio
STOP_ATR_MULT  = 1.5   # Stop = 1.5 × ATR14
SESSION_EXIT   = (15, 55)  # Exit at 15:55

def simulate_mvc(df_in, mvc_id):
    """Simulate the execution model for a given MVC."""
    rth = df_in[df_in['is_rth']].copy().reset_index(drop=True)
    trades = []
    
    traded_dates = set()
    i = 0
    while i < len(rth):
        row = rth.iloc[i]
        
        # Skip if already traded today
        if row['date'] in traded_dates:
            i += 1
            continue
        
        # Check MVC signal
        if not mvc_signal(row, mvc_id):
            i += 1
            continue
        
        # Entry
        entry_price = row['close']
        atr         = row['atr14']
        stop_pts    = STOP_ATR_MULT * atr
        target_pts  = stop_pts * RR
        
        # Direction: always long (MVCs are bullish)
        stop_price   = entry_price - stop_pts
        target_price = entry_price + target_pts
        
        # Contract sizing: $800 risk / (stop_pts × $2/pt)
        contracts = max(1, round(RISK_PER_TRADE / (stop_pts * POINT_VALUE)))
        
        # Simulate trade
        entry_ts   = row['ts']
        entry_date = row['date']
        outcome    = 'open'
        exit_price = None
        exit_ts    = None
        
        for j in range(i+1, min(i+100, len(rth))):
            future = rth.iloc[j]
            
            # Session exit
            if future['hour'] > SESSION_EXIT[0] or (future['hour'] == SESSION_EXIT[0] and future['minute'] >= SESSION_EXIT[1]):
                exit_price = future['close']
                exit_ts    = future['ts']
                outcome    = 'time_exit'
                i = j + 1
                break
            
            # Stop hit
            if future['low'] <= stop_price:
                exit_price = stop_price
                exit_ts    = future['ts']
                outcome    = 'stop'
                i = j + 1
                break
            
            # Target hit
            if future['high'] >= target_price:
                exit_price = target_price
                exit_ts    = future['ts']
                outcome    = 'target'
                i = j + 1
                break
            
            # New day — exit at close of last bar
            if future['date'] != entry_date:
                exit_price = rth.iloc[j-1]['close']
                exit_ts    = rth.iloc[j-1]['ts']
                outcome    = 'day_end'
                i = j
                break
        else:
            # End of data
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
            'mvc': mvc_id,
        })
        traded_dates.add(entry_date)
    
    return pd.DataFrame(trades)

# ─── Run All MVCs ─────────────────────────────────────────────────────────────
print("\n=== MVC STAND-ALONE EVALUATION ===")
mvc_results = {}
mvc_trades  = {}

for mvc_id in ['MVC-001', 'MVC-002', 'MVC-003', 'MVC-004', 'MVC-005', 'MVC-006']:
    print(f"\n  {mvc_id}...")
    trades_df = simulate_mvc(df, mvc_id)
    
    if len(trades_df) == 0:
        print(f"    No trades generated")
        continue
    
    n        = len(trades_df)
    wins     = trades_df['is_win'].sum()
    losses   = trades_df['is_loss'].sum()
    wr       = wins / n * 100
    gross_w  = trades_df.loc[trades_df['pnl'] > 0, 'pnl'].sum()
    gross_l  = trades_df.loc[trades_df['pnl'] < 0, 'pnl'].abs().sum()
    pf       = gross_w / (gross_l + 1e-6)
    net_pnl  = trades_df['pnl'].sum()
    avg_win  = trades_df.loc[trades_df['pnl'] > 0, 'pnl'].mean() if wins > 0 else 0
    avg_loss = trades_df.loc[trades_df['pnl'] < 0, 'pnl'].mean() if losses > 0 else 0
    expectancy = net_pnl / n
    
    # Max drawdown
    equity = trades_df['pnl'].cumsum()
    rolling_max = equity.cummax()
    drawdown = equity - rolling_max
    max_dd   = drawdown.min()
    
    print(f"    N={n} | WR={wr:.1f}% | PF={pf:.3f} | Net=${net_pnl:,.0f} | MaxDD=${max_dd:,.0f}")
    print(f"    AvgWin=${avg_win:,.0f} | AvgLoss=${avg_loss:,.0f} | Expectancy=${expectancy:,.0f}")
    
    # Year breakdown
    trades_df['year'] = pd.to_datetime(trades_df['date'].astype(str)).dt.year
    for yr in sorted(trades_df['year'].unique()):
        yr_t = trades_df[trades_df['year'] == yr]
        yr_wr = yr_t['is_win'].mean() * 100
        yr_pf = yr_t.loc[yr_t['pnl']>0,'pnl'].sum() / (yr_t.loc[yr_t['pnl']<0,'pnl'].abs().sum() + 1e-6)
        print(f"    {yr}: N={len(yr_t)} | WR={yr_wr:.1f}% | PF={yr_pf:.3f}")
    
    mvc_results[mvc_id] = {
        'n': int(n), 'wr': float(wr), 'pf': float(pf), 'net_pnl': float(net_pnl),
        'max_dd': float(max_dd), 'expectancy': float(expectancy),
        'avg_win': float(avg_win), 'avg_loss': float(avg_loss),
    }
    mvc_trades[mvc_id] = trades_df

# ─── Visualisation ────────────────────────────────────────────────────────────
print("\nGenerating stand-alone evaluation visualisation...")
plt.style.use('dark_background')
GREEN = '#22c55e'; RED = '#ef4444'; GOLD = '#f59e0b'; BLUE = '#3b82f6'

fig = plt.figure(figsize=(22, 12), facecolor='#0d1117')
gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.45, wspace=0.35)

mvc_ids = list(mvc_results.keys())

# Chart 1: Win Rate
ax1 = fig.add_subplot(gs[0, 0])
wrs = [mvc_results[m]['wr'] for m in mvc_ids]
colors1 = [GREEN if w >= 60 else GOLD if w >= 55 else RED for w in wrs]
bars1 = ax1.bar(mvc_ids, wrs, color=colors1, alpha=0.85, edgecolor='white', linewidth=0.5)
ax1.axhline(55, color=GOLD, linestyle='--', alpha=0.7, label='55% floor')
ax1.set_title('Win Rate by MVC', color='white', fontsize=11, fontweight='bold')
ax1.set_ylabel('Win Rate (%)', color='white'); ax1.tick_params(colors='white'); ax1.legend(fontsize=9)
for bar, wr in zip(bars1, wrs):
    ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3, f'{wr:.1f}%', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 2: Profit Factor
ax2 = fig.add_subplot(gs[0, 1])
pfs = [mvc_results[m]['pf'] for m in mvc_ids]
colors2 = [GREEN if p >= 1.5 else GOLD if p >= 1.2 else RED for p in pfs]
bars2 = ax2.bar(mvc_ids, pfs, color=colors2, alpha=0.85, edgecolor='white', linewidth=0.5)
ax2.axhline(1.5, color=GOLD, linestyle='--', alpha=0.7, label='PF 1.5 floor')
ax2.set_title('Profit Factor by MVC', color='white', fontsize=11, fontweight='bold')
ax2.set_ylabel('Profit Factor', color='white'); ax2.tick_params(colors='white'); ax2.legend(fontsize=9)
for bar, pf in zip(bars2, pfs):
    ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02, f'{pf:.3f}', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 3: Net PnL
ax3 = fig.add_subplot(gs[0, 2])
pnls = [mvc_results[m]['net_pnl'] for m in mvc_ids]
colors3 = [GREEN if p > 0 else RED for p in pnls]
bars3 = ax3.bar(mvc_ids, pnls, color=colors3, alpha=0.85, edgecolor='white', linewidth=0.5)
ax3.axhline(0, color='white', linestyle='-', alpha=0.3)
ax3.set_title('Net P&L by MVC ($)', color='white', fontsize=11, fontweight='bold')
ax3.set_ylabel('Net P&L ($)', color='white'); ax3.tick_params(colors='white')
for bar, pnl in zip(bars3, pnls):
    ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 100, f'${pnl:,.0f}', 
             ha='center', va='bottom', color='white', fontsize=9)

# Chart 4: Equity curves
ax4 = fig.add_subplot(gs[1, :])
mvc_colors = [GREEN, BLUE, GOLD, '#a855f7', '#f97316', '#06b6d4']
for i, mvc_id in enumerate(mvc_ids):
    if mvc_id in mvc_trades:
        equity = mvc_trades[mvc_id]['pnl'].cumsum()
        ax4.plot(range(len(equity)), equity, color=mvc_colors[i], linewidth=1.5, 
                 label=f'{mvc_id} (PF={mvc_results[mvc_id]["pf"]:.2f})', alpha=0.85)
ax4.axhline(0, color='white', linestyle='--', alpha=0.3)
ax4.set_title('Equity Curves — All MVCs (1-contract, $800 risk)', color='white', fontsize=11, fontweight='bold')
ax4.set_xlabel('Trade Number', color='white'); ax4.set_ylabel('Cumulative P&L ($)', color='white')
ax4.tick_params(colors='white'); ax4.legend(fontsize=9, loc='upper left')

plt.suptitle('Atlas Sprint 061 — MVC Stand-Alone Execution Model Evaluation', 
             color='white', fontsize=14, fontweight='bold')
plt.savefig(f'{CHARTS_DIR}/sprint061_mvc_standalone.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
plt.close()
print(f"  Saved: sprint061_mvc_standalone.png")

# Save results
with open(f'{OUTPUT_DIR}/mvc_standalone_results.json', 'w') as f:
    json.dump(mvc_results, f, indent=2, default=str)
print(f"Saved: {OUTPUT_DIR}/mvc_standalone_results.json")

# Save trade data for portfolio analysis
for mvc_id, trades_df in mvc_trades.items():
    trades_df.to_csv(f'{OUTPUT_DIR}/trades_{mvc_id.replace("-","_")}.csv', index=False)
print("Saved trade CSVs for portfolio analysis")
print("=== MVC STAND-ALONE EVALUATION COMPLETE ===")
