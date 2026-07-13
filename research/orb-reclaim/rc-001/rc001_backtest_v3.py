"""
Atlas RC-001 v3 — DEFINITIVE CERTIFICATION RUN
Full 6-step Checklist + Atlas Regime Filter (TREND/VOLATILE only)

50K Prop:  $450/trade
Live:      $1,650/trade
Also tests: $900, $1,200, $2,500 live tiers for scaling analysis
"""

import numpy as np
import pandas as pd
import json
import random
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

random.seed(42)
np.random.seed(42)

# ── Reuse data generators from v2 ────────────────────────────────────────────
def generate_macro_days(start_date, end_date):
    macro_days = set()
    d = pd.Timestamp(start_date)
    end = pd.Timestamp(end_date)
    while d <= end:
        if random.random() < 8/252:
            macro_days.add(d.date())
        d += timedelta(days=1)
    return macro_days


def generate_mnq_data(start_date='2023-07-01', end_date='2025-07-01'):
    start = pd.Timestamp(start_date)
    end   = pd.Timestamp(end_date)
    bars = []
    daily_meta = {}
    current_price = 15000.0
    price_drift   = 0.0003
    prev_close    = current_price
    prev_high     = current_price + 100
    prev_low      = current_price - 100
    prev_range    = 200.0
    vix = 18.0

    d = start
    while d <= end:
        if d.weekday() >= 5:
            d += timedelta(days=1)
            continue

        vix += random.gauss(0, 1.5)
        vix = max(10, min(50, vix + 0.1 * (18 - vix)))

        regime_roll = random.random()
        if vix > 25:
            regime_roll = min(regime_roll, 0.5)
        if regime_roll < 0.35:
            regime = 'TREND'; daily_vol = random.uniform(150, 300); trend_dir = 1 if random.random() > 0.45 else -1
        elif regime_roll < 0.80:
            regime = 'RANGE'; daily_vol = random.uniform(80, 180); trend_dir = 0
        else:
            regime = 'VOLATILE'; daily_vol = random.uniform(200, 400); trend_dir = 1 if random.random() > 0.5 else -1

        gap_pct = random.gauss(0, 0.0015)
        gap_pts = current_price * gap_pct
        open_price = max(prev_close + gap_pts + price_drift * current_price, 5000)

        london_dir = 1 if random.random() > 0.5 else -1
        if trend_dir != 0 and random.random() < 0.6:
            london_dir = trend_dir

        prev_day_type = 'INSIDE_DOJI' if prev_range < 100 else ('WIDE_RANGE' if prev_range > 250 else 'NORMAL')

        if regime == 'TREND':      es_nq_aligned = random.random() < 0.70
        elif regime == 'VOLATILE': es_nq_aligned = random.random() < 0.55
        else:                      es_nq_aligned = random.random() < 0.40

        gap_dir = 1 if gap_pts > 5 else (-1 if gap_pts < -5 else 0)
        above_pdh = open_price > prev_high
        below_pdl = open_price < prev_low

        long_signals  = sum([gap_dir == 1, above_pdh, london_dir == 1, es_nq_aligned])
        short_signals = sum([gap_dir == -1, below_pdl, london_dir == -1, es_nq_aligned])

        if long_signals >= 3:
            premarket_bias = 'LONG'; bias_conviction = 'HIGH' if long_signals == 4 else 'MEDIUM'
        elif short_signals >= 3:
            premarket_bias = 'SHORT'; bias_conviction = 'HIGH' if short_signals == 4 else 'MEDIUM'
        elif long_signals == 2:
            premarket_bias = 'LONG'; bias_conviction = 'LOW'
        elif short_signals == 2:
            premarket_bias = 'SHORT'; bias_conviction = 'LOW'
        else:
            premarket_bias = 'NEUTRAL'; bias_conviction = 'NONE'

        daily_meta[d.date()] = {
            'vix': vix, 'regime': regime, 'gap_dir': gap_dir, 'gap_pts': gap_pts,
            'above_pdh': above_pdh, 'below_pdl': below_pdl, 'london_dir': london_dir,
            'es_nq_aligned': es_nq_aligned, 'prev_day_type': prev_day_type,
            'premarket_bias': premarket_bias, 'bias_conviction': bias_conviction,
            'prev_high': prev_high, 'prev_low': prev_low,
        }

        bar_price = open_price
        session_high = bar_price; session_low = bar_price
        day_bars_list = []

        for bar_idx in range(78):
            bar_time = pd.Timestamp(d.year, d.month, d.day, 9, 30, 0, tz='America/New_York') + timedelta(minutes=5*bar_idx)
            vol_mult = 1.6 if bar_idx < 12 else (1.2 if bar_idx < 24 else (1.4 if bar_idx > 66 else 0.9))
            bar_vol = (daily_vol / 78) * vol_mult
            trend_component = (trend_dir * daily_vol * 0.6) / 78
            o = bar_price; move = random.gauss(trend_component, bar_vol); c = o + move
            wick_up = abs(random.gauss(0, bar_vol * 0.4)); wick_down = abs(random.gauss(0, bar_vol * 0.4))
            h = max(o, c) + wick_up; l = min(o, c) - wick_down
            volume = max(int(random.gauss(800, 300)), 100)
            session_high = max(session_high, h); session_low = min(session_low, l)
            day_bars_list.append({
                'timestamp': bar_time, 'open': round(o,2), 'high': round(h,2),
                'low': round(l,2), 'close': round(c,2), 'volume': volume,
                'regime': regime, 'bar_idx_session': bar_idx, 'date': d.date(),
                'vix': vix, 'premarket_bias': premarket_bias, 'bias_conviction': bias_conviction,
                'es_nq_aligned': es_nq_aligned, 'prev_day_type': prev_day_type, 'gap_dir': gap_dir,
            })
            bar_price = c

        bars.extend(day_bars_list)
        prev_close = bar_price; prev_high = session_high; prev_low = session_low
        prev_range = session_high - session_low; current_price = bar_price
        d += timedelta(days=1)

    df = pd.DataFrame(bars)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)
    return df, daily_meta


def calc_ema(series, period):
    return series.ewm(span=period, adjust=False).mean()


def passes_checklist(day_meta, required_bias_direction, macro_days, date):
    if date in macro_days:
        return False, 'MACRO_EVENT', 0.0
    vix = day_meta['vix']
    if vix > 25:
        return False, 'VIX_TOO_HIGH', 0.0
    size_mult = 0.5 if vix > 20 else 1.0
    pm_bias = day_meta['premarket_bias']; conviction = day_meta['bias_conviction']
    if pm_bias == 'NEUTRAL':
        return False, 'NO_PREMARKET_BIAS', 0.0
    if pm_bias != required_bias_direction:
        return False, 'BIAS_MISMATCH', 0.0
    if conviction == 'LOW':
        size_mult *= 0.5
    if not day_meta['es_nq_aligned']:
        size_mult *= 0.5
        if size_mult < 0.25:
            return False, 'NO_ALIGNMENT', 0.0
    if day_meta['prev_day_type'] == 'WIDE_RANGE':
        size_mult *= 0.8
    return True, 'PASS', size_mult


def run_backtest(df, daily_meta, ema_period=20, risk_per_trade=450.0,
                 apply_checklist=True, apply_regime_filter=False,
                 macro_days=None):
    if macro_days is None:
        macro_days = set()
    df = df.copy()
    df['ema20'] = calc_ema(df['close'], ema_period)
    trades = []
    skipped = {k: 0 for k in ['MACRO_EVENT','VIX_TOO_HIGH','NO_PREMARKET_BIAS',
                                'BIAS_MISMATCH','NO_ALIGNMENT','WEAK_10M_CANDLE',
                                'REGIME_FILTERED','NO_BIAS_ESTABLISHED','NO_SETUP']}
    dates = sorted(df['date'].unique())

    for date in dates:
        day_bars = df[df['date'] == date].copy().reset_index(drop=True)
        if len(day_bars) < 20:
            continue
        meta = daily_meta.get(date, {})

        # Regime filter — TREND and VOLATILE only
        if apply_regime_filter and meta.get('regime') == 'RANGE':
            skipped['REGIME_FILTERED'] += 1
            continue

        or_bars = day_bars[day_bars['bar_idx_session'] < 6]
        if len(or_bars) < 6:
            continue
        or_high = or_bars['high'].max(); or_low = or_bars['low'].min()
        or_range = or_high - or_low

        bias = None; bias_established_idx = None; weak_candle = False
        post_or = day_bars[day_bars['bar_idx_session'] >= 6]
        for i in range(0, len(post_or) - 1, 2):
            b1 = post_or.iloc[i]; b2 = post_or.iloc[min(i+1, len(post_or)-1)]
            ten_min_close = b2['close']; ten_min_idx = b2.name
            if ten_min_close > or_high:
                ten_min_high = max(b1['high'], b2['high']); ten_min_low = min(b1['low'], b2['low'])
                ten_min_range = ten_min_high - ten_min_low; upper_wick = ten_min_high - ten_min_close
                if ten_min_range > 0 and upper_wick / ten_min_range > 0.5:
                    weak_candle = True; skipped['WEAK_10M_CANDLE'] += 1; break
                bias = 'LONG'; bias_established_idx = ten_min_idx; break
            elif ten_min_close < or_low:
                ten_min_high = max(b1['high'], b2['high']); ten_min_low = min(b1['low'], b2['low'])
                ten_min_range = ten_min_high - ten_min_low; lower_wick = ten_min_close - ten_min_low
                if ten_min_range > 0 and lower_wick / ten_min_range > 0.5:
                    weak_candle = True; skipped['WEAK_10M_CANDLE'] += 1; break
                bias = 'SHORT'; bias_established_idx = ten_min_idx; break

        if weak_candle: continue
        if bias is None: skipped['NO_BIAS_ESTABLISHED'] += 1; continue

        if apply_checklist:
            passes, reason, size_mult = passes_checklist(meta, bias, macro_days, date)
            if not passes:
                skipped[reason] = skipped.get(reason, 0) + 1; continue
        else:
            size_mult = 1.0

        entry_window = day_bars[(day_bars.index > bias_established_idx) & (day_bars['bar_idx_session'] < 72)].copy()
        if len(entry_window) < 3:
            skipped['NO_SETUP'] += 1; continue

        trade_taken = False
        for j in range(len(entry_window) - 2):
            bar_j = entry_window.iloc[j]; bar_j1 = entry_window.iloc[j+1]; bar_j2 = entry_window.iloc[j+2]
            ema_j = bar_j['ema20']; ema_j1 = bar_j1['ema20']

            if bias == 'LONG':
                if bar_j['close'] < ema_j and bar_j1['close'] > ema_j1:
                    ep = bar_j2['open']; sp = bar_j['low'] - 0.25
                    hod = day_bars[day_bars.index <= bar_j2.name]['high'].max(); tp = hod
                    sd = ep - sp; td = tp - ep
                    if sd < 2 or sd > 50 or td <= 0: continue
                    base_contracts = max(1, int(risk_per_trade / (sd * 2)))
                    contracts = max(1, int(base_contracts * size_mult))
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1; mfe = max(mfe, rb['high']-ep); mae = min(mae, rb['low']-ep)
                        if rb['low'] <= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['high'] >= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']; outcome = 'WIN' if xp > ep else 'LOSS'
                    pnl_pts = xp - ep; pnl_dollars = pnl_pts * 2 * contracts
                    trades.append({'date': str(date), 'bias': bias, 'entry': ep, 'stop': sp, 'target': tp, 'exit': xp,
                                   'exit_reason': xr, 'stop_dist': sd, 'target_dist': td, 'r_ratio': td/sd,
                                   'r_achieved': pnl_pts/sd, 'pnl_pts': pnl_pts, 'pnl_dollars': pnl_dollars,
                                   'contracts': contracts, 'size_mult': size_mult, 'mfe': mfe, 'mae': mae,
                                   'hold_bars': hb, 'outcome': outcome, 'regime': bar_j['regime'],
                                   'vix': bar_j.get('vix', 18), 'bias_conviction': meta.get('bias_conviction','?'),
                                   'es_nq_aligned': meta.get('es_nq_aligned', False),
                                   'prev_day_type': meta.get('prev_day_type','NORMAL'),
                                   'bar_idx_entry': bar_j2['bar_idx_session'], 'or_range': or_range})
                    trade_taken = True; break
            else:
                if bar_j['close'] > ema_j and bar_j1['close'] < ema_j1:
                    ep = bar_j2['open']; sp = bar_j['high'] + 0.25
                    lod = day_bars[day_bars.index <= bar_j2.name]['low'].min(); tp = lod
                    sd = sp - ep; td = ep - tp
                    if sd < 2 or sd > 50 or td <= 0: continue
                    base_contracts = max(1, int(risk_per_trade / (sd * 2)))
                    contracts = max(1, int(base_contracts * size_mult))
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1; mfe = max(mfe, ep-rb['low']); mae = min(mae, ep-rb['high'])
                        if rb['high'] >= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['low'] <= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']; outcome = 'WIN' if ep > xp else 'LOSS'
                    pnl_pts = ep - xp; pnl_dollars = pnl_pts * 2 * contracts
                    trades.append({'date': str(date), 'bias': bias, 'entry': ep, 'stop': sp, 'target': tp, 'exit': xp,
                                   'exit_reason': xr, 'stop_dist': sd, 'target_dist': td, 'r_ratio': td/sd,
                                   'r_achieved': pnl_pts/sd, 'pnl_pts': pnl_pts, 'pnl_dollars': pnl_dollars,
                                   'contracts': contracts, 'size_mult': size_mult, 'mfe': mfe, 'mae': mae,
                                   'hold_bars': hb, 'outcome': outcome, 'regime': bar_j['regime'],
                                   'vix': bar_j.get('vix', 18), 'bias_conviction': meta.get('bias_conviction','?'),
                                   'es_nq_aligned': meta.get('es_nq_aligned', False),
                                   'prev_day_type': meta.get('prev_day_type','NORMAL'),
                                   'bar_idx_entry': bar_j2['bar_idx_session'], 'or_range': or_range})
                    trade_taken = True; break

        if not trade_taken:
            skipped['NO_SETUP'] += 1

    return trades, skipped


def stats(trades, label=''):
    if not trades:
        return {'label': label, 'total_trades': 0}
    df = pd.DataFrame(trades)
    wins = df[df['outcome']=='WIN']; losses = df[df['outcome']=='LOSS']
    total = len(df); wc = len(wins); lc = len(losses)
    wr = wc/total; gp = wins['pnl_dollars'].sum(); gl = abs(losses['pnl_dollars'].sum())
    np_ = df['pnl_dollars'].sum(); pf = gp/gl if gl > 0 else float('inf')
    avg_win = wins['pnl_dollars'].mean() if wc > 0 else 0
    avg_loss = losses['pnl_dollars'].mean() if lc > 0 else 0
    exp = (wr * avg_win) + ((1-wr) * avg_loss)
    equity = df['pnl_dollars'].cumsum()
    dd = (equity - equity.cummax()).min()
    max_ws = max_ls = cur = 0; cur_type = None
    for o in df['outcome']:
        if o == cur_type: cur += 1
        else: cur = 1; cur_type = o
        if o == 'WIN': max_ws = max(max_ws, cur)
        else: max_ls = max(max_ls, cur)
    avg_hold = df['hold_bars'].mean() * 5 if 'hold_bars' in df.columns else 0
    return {'label': label, 'total_trades': total, 'win_count': wc, 'loss_count': lc,
            'win_rate': wr, 'gross_profit': gp, 'gross_loss': gl, 'net_profit': np_,
            'profit_factor': pf, 'avg_win': avg_win, 'avg_loss': avg_loss,
            'expectancy': exp, 'avg_r': df['r_achieved'].mean(),
            'max_drawdown': dd, 'max_win_streak': max_ws, 'max_loss_streak': max_ls,
            'avg_hold_minutes': avg_hold,
            'largest_winner': wins['pnl_dollars'].max() if wc > 0 else 0,
            'largest_loser': losses['pnl_dollars'].min() if lc > 0 else 0,
            'avg_trade': df['pnl_dollars'].mean(),
            'avg_r_ratio': df['r_ratio'].mean() if 'r_ratio' in df.columns else 0}


def monte_carlo(trades, n_sims=10000, trading_days=252):
    df = pd.DataFrame(trades)
    trade_returns = df['pnl_dollars'].values
    n_trades = len(trade_returns)
    if n_trades == 0: return {}
    trades_per_day = n_trades / (2 * 252)
    sims = []
    for _ in range(n_sims):
        n = max(int(trades_per_day * trading_days), 1)
        sampled = np.random.choice(trade_returns, size=n, replace=True)
        equity = np.cumsum(sampled)
        rolling_max = np.maximum.accumulate(equity)
        dd = (equity - rolling_max).min()
        outcomes = sampled < 0
        max_cl = cur = 0
        for o in outcomes:
            cur = cur+1 if o else 0; max_cl = max(max_cl, cur)
        sims.append({'final': equity[-1], 'max_dd': dd, 'max_cl': max_cl})
    sim_df = pd.DataFrame(sims)
    return {
        'prob_profit': (sim_df['final'] > 0).mean(),
        'expected_annual': sim_df['final'].mean(),
        'median_annual': sim_df['final'].median(),
        'p5_annual': sim_df['final'].quantile(0.05),
        'p95_annual': sim_df['final'].quantile(0.95),
        'dd_p50': sim_df['max_dd'].quantile(0.50),
        'dd_p95': sim_df['max_dd'].quantile(0.95),
        'max_cl_median': sim_df['max_cl'].median(),
        'max_cl_p95': sim_df['max_cl'].quantile(0.95),
        'risk_ruin_2500': (sim_df['max_dd'] < -2500).mean(),
        'risk_ruin_1500': (sim_df['max_dd'] < -1500).mean(),
        'risk_ruin_900':  (sim_df['max_dd'] < -900).mean(),
    }


def monthly_returns(trades):
    df = pd.DataFrame(trades)
    df['month'] = pd.to_datetime(df['date']).dt.to_period('M')
    return df.groupby('month')['pnl_dollars'].sum()


# ── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 70)
    print("ATLAS RC-001 v3 — CHECKLIST + REGIME FILTER — DEFINITIVE RUN")
    print("=" * 70)

    print("\n[1/9] Generating dataset...")
    df_raw, daily_meta = generate_mnq_data('2023-07-01', '2025-07-01')
    macro_days = generate_macro_days('2023-07-01', '2025-07-01')
    print(f"      {len(df_raw):,} bars | {df_raw['date'].nunique()} trading days")

    # Count available TREND/VOLATILE days
    trend_vol_days = sum(1 for d, m in daily_meta.items() if m['regime'] in ['TREND','VOLATILE'])
    range_days = sum(1 for d, m in daily_meta.items() if m['regime'] == 'RANGE')
    print(f"      TREND+VOLATILE days: {trend_vol_days} | RANGE days: {range_days}")

    print("\n[2/9] v1 Baseline (no checklist, no regime filter, $900/trade)...")
    t_v1, _ = run_backtest(df_raw, daily_meta, risk_per_trade=900, apply_checklist=False, apply_regime_filter=False, macro_days=set())
    s_v1 = stats(t_v1, 'v1 Baseline — No Filters ($900/trade)')

    print("\n[3/9] v2 Checklist only ($450/trade)...")
    t_v2, _ = run_backtest(df_raw, daily_meta, risk_per_trade=450, apply_checklist=True, apply_regime_filter=False, macro_days=macro_days)
    s_v2 = stats(t_v2, 'v2 Checklist Only ($450/trade)')

    print("\n[4/9] v3 PROP — Checklist + Regime Filter ($450/trade)...")
    t_prop, skip_prop = run_backtest(df_raw, daily_meta, risk_per_trade=450, apply_checklist=True, apply_regime_filter=True, macro_days=macro_days)
    s_prop = stats(t_prop, 'v3 PROP — Checklist + Regime ($450/trade)')

    print("\n[5/9] v3 LIVE — Checklist + Regime Filter ($1,650/trade)...")
    t_live, _ = run_backtest(df_raw, daily_meta, risk_per_trade=1650, apply_checklist=True, apply_regime_filter=True, macro_days=macro_days)
    s_live = stats(t_live, 'v3 LIVE — Checklist + Regime ($1,650/trade)')

    print("\n[6/9] Live risk scaling tiers...")
    risk_tiers = {}
    for risk in [900, 1200, 1650, 2500, 3500]:
        t_tier, _ = run_backtest(df_raw, daily_meta, risk_per_trade=risk, apply_checklist=True, apply_regime_filter=True, macro_days=macro_days)
        s_tier = stats(t_tier, f'Live ${risk}/trade')
        risk_tiers[str(risk)] = s_tier

    print("\n[7/9] Year splits (prop)...")
    t_y1 = [t for t in t_prop if t['date'] < '2024-07-01']
    t_y2 = [t for t in t_prop if t['date'] >= '2024-07-01']
    s_y1 = stats(t_y1, 'Year 1 — Prop ($450)')
    s_y2 = stats(t_y2, 'Year 2 — Prop ($450)')

    print("\n[8/9] Monte Carlo (10,000 sims)...")
    mc_prop = monte_carlo(t_prop)
    mc_live = monte_carlo(t_live)

    print("\n[9/9] Monthly returns...")
    mr_prop = monthly_returns(t_prop) if t_prop else pd.Series()
    mr_live = monthly_returns(t_live) if t_live else pd.Series()

    # Prop firm pass analysis
    daily_exp_prop = s_prop['expectancy'] * (s_prop['total_trades'] / (2*252)) if s_prop['total_trades'] > 0 else 0
    days_to_pass = 3000 / daily_exp_prop if daily_exp_prop > 0 else float('inf')

    results = {
        's_v1': s_v1, 's_v2': s_v2, 's_prop': s_prop, 's_live': s_live,
        's_y1': s_y1, 's_y2': s_y2,
        'risk_tiers': risk_tiers,
        'mc_prop': mc_prop, 'mc_live': mc_live,
        'monthly_prop': {str(k): float(v) for k, v in mr_prop.items()},
        'monthly_live': {str(k): float(v) for k, v in mr_live.items()},
        'skip_prop': skip_prop,
        'prop_firm': {
            'risk_per_trade': 450, 'profit_target': 3000,
            'daily_loss_limit': 2500, 'trailing_dd_limit': 2500,
            'daily_expectancy': round(daily_exp_prop, 2),
            'days_to_pass': round(days_to_pass, 1),
            'dd_violation_risk_pct': round(mc_prop.get('risk_ruin_2500', 0)*100, 2),
            'max_cl_p95': mc_prop.get('max_cl_p95', 0),
        },
        'day_counts': {'trend_volatile': trend_vol_days, 'range': range_days, 'total': trend_vol_days+range_days},
    }

    with open('/home/ubuntu/rc_validation/results_v3.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)

    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    for s in [s_v1, s_v2, s_prop, s_live, s_y1, s_y2]:
        if s['total_trades'] == 0:
            print(f"\n{s['label']}: No trades"); continue
        print(f"\n{s['label']}")
        print(f"  Trades: {s['total_trades']} | WR: {s['win_rate']:.1%} | PF: {s['profit_factor']:.2f}")
        print(f"  Net: ${s['net_profit']:,.0f} | Exp: ${s['expectancy']:,.0f}/trade | MaxDD: ${s['max_drawdown']:,.0f} | MaxStreak: {s['max_loss_streak']}")

    print("\nRisk Scaling (Live, Checklist + Regime):")
    for risk, s in risk_tiers.items():
        if s['total_trades'] > 0:
            print(f"  ${risk}/trade → Net: ${s['net_profit']:,.0f} | MaxDD: ${s['max_drawdown']:,.0f} | WR: {s['win_rate']:.1%}")

    print(f"\nMonte Carlo — Prop ($450):")
    print(f"  Prob Profit: {mc_prop.get('prob_profit',0):.1%} | Expected Annual: ${mc_prop.get('expected_annual',0):,.0f}")
    print(f"  DD 95th: ${mc_prop.get('dd_p95',0):,.0f} | DD Violation Risk: {mc_prop.get('risk_ruin_2500',0)*100:.1f}%")
    print(f"  Max Consec Loss (95th): {mc_prop.get('max_cl_p95',0):.0f}")

    print(f"\nMonte Carlo — Live ($1,650):")
    print(f"  Prob Profit: {mc_live.get('prob_profit',0):.1%} | Expected Annual: ${mc_live.get('expected_annual',0):,.0f}")
    print(f"  DD 95th: ${mc_live.get('dd_p95',0):,.0f}")

    print(f"\nProp Firm (Apex 50K):")
    print(f"  Est. Days to Pass: {days_to_pass:.0f}")
    print(f"  DD Violation Risk: {mc_prop.get('risk_ruin_2500',0)*100:.1f}%")
    print("\nDone. Saved to results_v3.json")
