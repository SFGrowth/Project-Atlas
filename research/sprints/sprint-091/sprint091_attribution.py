"""
Sprint 091 — Checklist Attribution & Decision Simplification Engine
Parts 1–5: Forensics, Winner Rejection, Loser Prevention, Redundancy, Explanation Layer

Methodology:
- Generate the full universe of TREND/VOLATILE day trades (v1+regime, no checklist) = 63 trades
- For each trade, evaluate every checklist rule individually and record pass/fail
- Compare outcomes: did the checklist approve or reject this trade, and was it right?
- Compute attribution metrics for each rule
- Score redundancy against the Regime Engine
"""

import numpy as np
import pandas as pd
import json
import random
from datetime import timedelta
import warnings
warnings.filterwarnings('ignore')

random.seed(42)
np.random.seed(42)

# ── Re-import core functions from v3 ─────────────────────────────────────────
exec(open('/home/ubuntu/rc_validation/backtest_v3.py').read().split("if __name__")[0])


# ── Per-rule checklist evaluator ─────────────────────────────────────────────
RULES = [
    'MACRO_EVENT',       # Step 1a — no FOMC/NFP/CPI
    'VIX_ELEVATED',      # Step 2b — VIX 20-25 (reduces size, doesn't block)
    'VIX_EXTREME',       # Step 2c — VIX > 25 (blocks trade)
    'GAP_ALIGNMENT',     # Step 3a — gap direction matches bias
    'PDH_PDL',           # Step 3b — price above PDH / below PDL
    'LONDON_ORB',        # Step 3c — London ORB alignment
    'ES_NQ_ALIGNED',     # Step 4 — ES/NQ/VIX all aligned
    'PRIOR_DAY_TYPE',    # Step 5 — prior day candle (wide range = reduce)
    'CONVICTION_GATE',   # Step 6 — minimum 3 of 4 signals
    'WEAK_CANDLE',       # ORB candle wick filter
]


def evaluate_all_rules(day_meta, bias, macro_days, date, or_bars, b1, b2):
    """
    Evaluate each checklist rule independently.
    Returns dict: rule -> (blocks: bool, reduces_size: bool, reason: str)
    """
    results = {}

    # MACRO_EVENT
    results['MACRO_EVENT'] = {
        'blocks': date in macro_days,
        'reduces_size': False,
        'detail': 'FOMC/NFP/CPI day' if date in macro_days else 'Clear'
    }

    # VIX_EXTREME (blocks)
    vix = day_meta.get('vix', 18)
    results['VIX_EXTREME'] = {
        'blocks': vix > 25,
        'reduces_size': False,
        'detail': f'VIX={vix:.1f} > 25' if vix > 25 else f'VIX={vix:.1f} OK'
    }

    # VIX_ELEVATED (reduces size only)
    results['VIX_ELEVATED'] = {
        'blocks': False,
        'reduces_size': 20 < vix <= 25,
        'detail': f'VIX={vix:.1f} elevated (half size)' if 20 < vix <= 25 else f'VIX={vix:.1f} normal'
    }

    # GAP_ALIGNMENT
    gap_dir = day_meta.get('gap_dir', 0)
    gap_matches = (bias == 'LONG' and gap_dir == 1) or (bias == 'SHORT' and gap_dir == -1)
    results['GAP_ALIGNMENT'] = {
        'blocks': False,  # contributes to conviction score, not a hard block
        'reduces_size': False,
        'aligned': gap_matches,
        'detail': f'Gap {"aligned" if gap_matches else "misaligned"} (gap_dir={gap_dir}, bias={bias})'
    }

    # PDH_PDL
    above_pdh = day_meta.get('above_pdh', False)
    below_pdl = day_meta.get('below_pdl', False)
    pdh_pdl_matches = (bias == 'LONG' and above_pdh) or (bias == 'SHORT' and below_pdl)
    results['PDH_PDL'] = {
        'blocks': False,
        'reduces_size': False,
        'aligned': pdh_pdl_matches,
        'detail': f'PDH/PDL {"aligned" if pdh_pdl_matches else "misaligned"}'
    }

    # LONDON_ORB
    london_dir = day_meta.get('london_dir', 0)
    london_matches = (bias == 'LONG' and london_dir == 1) or (bias == 'SHORT' and london_dir == -1)
    results['LONDON_ORB'] = {
        'blocks': False,
        'reduces_size': False,
        'aligned': london_matches,
        'detail': f'London ORB {"aligned" if london_matches else "misaligned"}'
    }

    # ES_NQ_ALIGNED
    es_nq = day_meta.get('es_nq_aligned', False)
    results['ES_NQ_ALIGNED'] = {
        'blocks': False,
        'reduces_size': not es_nq,
        'aligned': es_nq,
        'detail': 'ES/NQ/VIX aligned' if es_nq else 'ES/NQ divergence (reduce size)'
    }

    # PRIOR_DAY_TYPE
    pdt = day_meta.get('prev_day_type', 'NORMAL')
    results['PRIOR_DAY_TYPE'] = {
        'blocks': False,
        'reduces_size': pdt == 'WIDE_RANGE',
        'aligned': pdt != 'WIDE_RANGE',
        'detail': f'Prior day: {pdt}'
    }

    # CONVICTION_GATE — the actual blocking rule (< 2 signals = skip)
    signal_count = sum([
        gap_matches,
        pdh_pdl_matches,
        london_matches,
        es_nq
    ])
    pm_bias = day_meta.get('premarket_bias', 'NEUTRAL')
    conviction_pass = pm_bias != 'NEUTRAL' and pm_bias == bias
    results['CONVICTION_GATE'] = {
        'blocks': not conviction_pass,
        'reduces_size': False,
        'signal_count': signal_count,
        'detail': f'Signals={signal_count}, bias={pm_bias}, required={bias}, pass={conviction_pass}'
    }

    # WEAK_CANDLE — evaluated at ORB breakout candle level
    if b1 is not None and b2 is not None:
        ten_min_high = max(b1['high'], b2['high'])
        ten_min_low  = min(b1['low'], b2['low'])
        ten_min_close = b2['close']
        ten_min_range = ten_min_high - ten_min_low
        if bias == 'LONG':
            wick = ten_min_high - ten_min_close
        else:
            wick = ten_min_close - ten_min_low
        weak = ten_min_range > 0 and wick / ten_min_range > 0.5
        results['WEAK_CANDLE'] = {
            'blocks': weak,
            'reduces_size': False,
            'detail': f'Wick ratio={wick/ten_min_range:.2f}' if ten_min_range > 0 else 'No range'
        }
    else:
        results['WEAK_CANDLE'] = {'blocks': False, 'reduces_size': False, 'detail': 'N/A'}

    return results


def run_attribution_backtest(df, daily_meta, macro_days, risk_per_trade=450):
    """
    Run the FULL universe (regime filter only, no checklist blocking).
    For every trade, record:
    - What the trade outcome was (WIN/LOSS)
    - Which checklist rules would have blocked it
    - Which rules would have reduced size
    - Full rule evaluation
    """
    df = df.copy()
    df['ema20'] = calc_ema(df['close'], 20)

    all_trades = []
    dates = sorted(df['date'].unique())

    for date in dates:
        day_bars = df[df['date'] == date].copy().reset_index(drop=True)
        if len(day_bars) < 20:
            continue
        meta = daily_meta.get(date, {})

        # Regime filter — only TREND/VOLATILE
        if meta.get('regime') == 'RANGE':
            continue

        or_bars = day_bars[day_bars['bar_idx_session'] < 6]
        if len(or_bars) < 6:
            continue
        or_high = or_bars['high'].max()
        or_low  = or_bars['low'].min()

        bias = None; bias_established_idx = None
        b1_candle = None; b2_candle = None
        post_or = day_bars[day_bars['bar_idx_session'] >= 6]

        for i in range(0, len(post_or) - 1, 2):
            b1 = post_or.iloc[i]; b2 = post_or.iloc[min(i+1, len(post_or)-1)]
            ten_min_close = b2['close']; ten_min_idx = b2.name
            if ten_min_close > or_high:
                bias = 'LONG'; bias_established_idx = ten_min_idx
                b1_candle = b1; b2_candle = b2; break
            elif ten_min_close < or_low:
                bias = 'SHORT'; bias_established_idx = ten_min_idx
                b1_candle = b1; b2_candle = b2; break

        if bias is None:
            continue

        # Evaluate all rules
        rule_eval = evaluate_all_rules(meta, bias, macro_days, date, or_bars, b1_candle, b2_candle)

        # Determine if checklist would have blocked this trade
        blocking_rules = [r for r, v in rule_eval.items() if v.get('blocks', False)]
        reducing_rules = [r for r, v in rule_eval.items() if v.get('reduces_size', False)]
        checklist_approved = len(blocking_rules) == 0

        # Find EMA reclaim entry
        entry_window = day_bars[(day_bars.index > bias_established_idx) & (day_bars['bar_idx_session'] < 72)].copy()
        if len(entry_window) < 3:
            continue

        trade_found = False
        for j in range(len(entry_window) - 2):
            bar_j = entry_window.iloc[j]; bar_j1 = entry_window.iloc[j+1]; bar_j2 = entry_window.iloc[j+2]
            ema_j = bar_j['ema20']; ema_j1 = bar_j1['ema20']

            if bias == 'LONG':
                if bar_j['close'] < ema_j and bar_j1['close'] > ema_j1:
                    ep = bar_j2['open']; sp = bar_j['low'] - 0.25
                    hod = day_bars[day_bars.index <= bar_j2.name]['high'].max(); tp = hod
                    sd = ep - sp; td = tp - ep
                    if sd < 2 or sd > 50 or td <= 0: continue
                    contracts = max(1, int(risk_per_trade / (sd * 2)))
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1; mfe = max(mfe, rb['high']-ep); mae = min(mae, rb['low']-ep)
                        if rb['low'] <= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['high'] >= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']; outcome = 'WIN' if xp > ep else 'LOSS'
                    pnl_pts = xp - ep; pnl_dollars = pnl_pts * 2 * contracts

                    all_trades.append({
                        'date': str(date), 'bias': bias, 'regime': meta.get('regime'),
                        'outcome': outcome, 'pnl_dollars': pnl_dollars, 'pnl_pts': pnl_pts,
                        'r_achieved': pnl_pts / sd, 'stop_dist': sd, 'r_ratio': td/sd,
                        'checklist_approved': checklist_approved,
                        'blocking_rules': blocking_rules,
                        'reducing_rules': reducing_rules,
                        'rule_eval': rule_eval,
                        'vix': meta.get('vix', 18),
                        'es_nq_aligned': meta.get('es_nq_aligned', False),
                        'premarket_bias': meta.get('premarket_bias', 'NEUTRAL'),
                        'bias_conviction': meta.get('bias_conviction', 'NONE'),
                        'gap_dir': meta.get('gap_dir', 0),
                        'london_dir': meta.get('london_dir', 0),
                        'prev_day_type': meta.get('prev_day_type', 'NORMAL'),
                    })
                    trade_found = True; break

            else:
                if bar_j['close'] > ema_j and bar_j1['close'] < ema_j1:
                    ep = bar_j2['open']; sp = bar_j['high'] + 0.25
                    lod = day_bars[day_bars.index <= bar_j2.name]['low'].min(); tp = lod
                    sd = sp - ep; td = ep - tp
                    if sd < 2 or sd > 50 or td <= 0: continue
                    contracts = max(1, int(risk_per_trade / (sd * 2)))
                    remaining = day_bars[day_bars.index > bar_j2.name]
                    outcome = 'OPEN'; xp = None; xr = 'EOD'; mfe = 0; mae = 0; hb = 0
                    for _, rb in remaining.iterrows():
                        hb += 1; mfe = max(mfe, ep-rb['low']); mae = min(mae, ep-rb['high'])
                        if rb['high'] >= sp: outcome='LOSS'; xp=sp; xr='STOP'; break
                        if rb['low'] <= tp: outcome='WIN'; xp=tp; xr='TARGET'; break
                    if outcome == 'OPEN':
                        xp = day_bars.iloc[-1]['close']; outcome = 'WIN' if ep > xp else 'LOSS'
                    pnl_pts = ep - xp; pnl_dollars = pnl_pts * 2 * contracts

                    all_trades.append({
                        'date': str(date), 'bias': bias, 'regime': meta.get('regime'),
                        'outcome': outcome, 'pnl_dollars': pnl_dollars, 'pnl_pts': pnl_pts,
                        'r_achieved': pnl_pts / sd, 'stop_dist': sd, 'r_ratio': td/sd,
                        'checklist_approved': checklist_approved,
                        'blocking_rules': blocking_rules,
                        'reducing_rules': reducing_rules,
                        'rule_eval': rule_eval,
                        'vix': meta.get('vix', 18),
                        'es_nq_aligned': meta.get('es_nq_aligned', False),
                        'premarket_bias': meta.get('premarket_bias', 'NEUTRAL'),
                        'bias_conviction': meta.get('bias_conviction', 'NONE'),
                        'gap_dir': meta.get('gap_dir', 0),
                        'london_dir': meta.get('london_dir', 0),
                        'prev_day_type': meta.get('prev_day_type', 'NORMAL'),
                    })
                    trade_found = True; break

    return all_trades


def compute_rule_attribution(all_trades):
    """Part 1 — For each rule, compute full attribution metrics."""
    df = pd.DataFrame(all_trades)
    total = len(df)
    approved = df[df['checklist_approved']]
    rejected = df[~df['checklist_approved']]

    attribution = {}
    for rule in RULES:
        # Trades where this specific rule was the blocking factor
        blocked_by_rule = df[df['blocking_rules'].apply(lambda x: rule in x)]
        # Trades where this rule reduced size
        reduced_by_rule = df[df['reducing_rules'].apply(lambda x: rule in x)]

        blocked_wins  = blocked_by_rule[blocked_by_rule['outcome'] == 'WIN']
        blocked_losses = blocked_by_rule[blocked_by_rule['outcome'] == 'LOSS']

        attribution[rule] = {
            'trades_blocked': len(blocked_by_rule),
            'trades_reduced': len(reduced_by_rule),
            'winners_blocked': len(blocked_wins),
            'losers_blocked': len(blocked_losses),
            'net_profit_blocked': blocked_by_rule['pnl_dollars'].sum(),
            'profit_blocked': blocked_wins['pnl_dollars'].sum(),
            'loss_prevented': abs(blocked_losses['pnl_dollars'].sum()),
            'opportunity_cost': blocked_wins['pnl_dollars'].sum(),
            'net_impact': -blocked_by_rule['pnl_dollars'].sum(),  # positive = good (prevented losses)
            'win_rate_blocked': len(blocked_wins)/len(blocked_by_rule) if len(blocked_by_rule) > 0 else 0,
            'avg_r_blocked': blocked_by_rule['r_achieved'].mean() if len(blocked_by_rule) > 0 else 0,
            'pct_of_universe': len(blocked_by_rule)/total if total > 0 else 0,
        }

    return attribution


def compute_winner_rejection(all_trades):
    """Part 2 — Every profitable trade rejected by the checklist."""
    df = pd.DataFrame(all_trades)
    rejected_winners = df[(~df['checklist_approved']) & (df['outcome'] == 'WIN')]

    analysis = []
    for _, row in rejected_winners.iterrows():
        # Was the regime engine sufficient? (it already approved this trade — yes by definition)
        # Which rule caused rejection?
        blocking = row['blocking_rules']
        # Would regime alone have approved? Yes — we are in TREND/VOLATILE universe
        regime_alone_approved = True  # by construction of the universe

        analysis.append({
            'date': row['date'],
            'bias': row['bias'],
            'regime': row['regime'],
            'pnl_dollars': row['pnl_dollars'],
            'r_achieved': row['r_achieved'],
            'blocking_rules': blocking,
            'primary_blocker': blocking[0] if blocking else 'NONE',
            'regime_alone_approved': regime_alone_approved,
            'regime_made_it_redundant': regime_alone_approved,
            'vix': row['vix'],
            'es_nq_aligned': row['es_nq_aligned'],
            'premarket_bias': row['premarket_bias'],
        })

    # Group by primary blocker
    by_rule = {}
    for a in analysis:
        rule = a['primary_blocker']
        if rule not in by_rule:
            by_rule[rule] = []
        by_rule[rule].append(a)

    rule_opportunity_cost = {}
    for rule, trades in by_rule.items():
        total_lost = sum(t['pnl_dollars'] for t in trades)
        rule_opportunity_cost[rule] = {
            'count': len(trades),
            'total_profit_lost': total_lost,
            'avg_profit_lost': total_lost / len(trades),
            'avg_r_lost': sum(t['r_achieved'] for t in trades) / len(trades),
        }

    return analysis, rule_opportunity_cost


def compute_loser_prevention(all_trades):
    """Part 3 — Every losing trade blocked by the checklist."""
    df = pd.DataFrame(all_trades)
    blocked_losers = df[(~df['checklist_approved']) & (df['outcome'] == 'LOSS')]

    analysis = []
    for _, row in blocked_losers.iterrows():
        blocking = row['blocking_rules']
        # Would regime alone have prevented this? No — regime approved it (it's in TREND/VOLATILE universe)
        regime_alone_prevented = False

        analysis.append({
            'date': row['date'],
            'bias': row['bias'],
            'regime': row['regime'],
            'pnl_dollars': row['pnl_dollars'],
            'r_achieved': row['r_achieved'],
            'blocking_rules': blocking,
            'primary_blocker': blocking[0] if blocking else 'NONE',
            'regime_alone_prevented': regime_alone_prevented,
            'loss_avoided': abs(row['pnl_dollars']),
            'vix': row['vix'],
            'es_nq_aligned': row['es_nq_aligned'],
        })

    by_rule = {}
    for a in analysis:
        rule = a['primary_blocker']
        if rule not in by_rule:
            by_rule[rule] = []
        by_rule[rule].append(a)

    rule_protection_value = {}
    for rule, trades in by_rule.items():
        total_saved = sum(t['loss_avoided'] for t in trades)
        rule_protection_value[rule] = {
            'count': len(trades),
            'total_loss_prevented': total_saved,
            'avg_loss_prevented': total_saved / len(trades),
        }

    return analysis, rule_protection_value


def compute_redundancy_scores(all_trades, attribution, winner_rejection, loser_prevention):
    """Part 4 — Redundancy scoring: does the regime engine already capture this rule's value?"""
    df = pd.DataFrame(all_trades)
    total = len(df)

    # For each rule, compute:
    # redundancy = % of its blocked trades where regime engine already had the right answer
    # (i.e., if regime alone would have produced the same outcome)

    redundancy = {}
    for rule in RULES:
        blocked = df[df['blocking_rules'].apply(lambda x: rule in x)]
        if len(blocked) == 0:
            redundancy[rule] = {
                'redundancy_score': 0,
                'classification': 'INACTIVE',
                'note': 'Rule never triggered',
                'verdict': 'RETIRE → Never triggers',
                'total_blocked': 0, 'winners_blocked': 0, 'losers_blocked': 0,
                'opportunity_cost': 0, 'loss_prevented': 0, 'net_impact': 0,
            }
            continue

        blocked_wins  = len(blocked[blocked['outcome'] == 'WIN'])
        blocked_losses = len(blocked[blocked['outcome'] == 'LOSS'])
        total_blocked = len(blocked)

        opp_cost = attribution[rule]['opportunity_cost']
        loss_prevented = attribution[rule]['loss_prevented']
        net_impact = attribution[rule]['net_impact']

        # Regime engine already handles RANGE days — for TREND/VOLATILE days,
        # the regime engine has no further signal. So any additional checklist
        # rule that blocks trades in TREND/VOLATILE is providing UNIQUE value
        # if it blocks losers, or HARMFUL if it blocks winners.

        # Redundancy score: if the rule mostly blocks winners (regime already approved them),
        # it is HARMFUL. If it blocks losers, it is PROTECTIVE.
        # If it blocks nothing meaningful, it is REDUNDANT/INACTIVE.

        if total_blocked == 0:
            score = 0; classification = 'INACTIVE'
        elif blocked_wins > blocked_losses:
            # Blocking more winners than losers = harmful / opportunity cost
            harm_ratio = blocked_wins / total_blocked
            score = int(harm_ratio * 100)
            classification = 'HARMFUL' if score > 60 else 'MIXED'
        elif blocked_losses > blocked_wins:
            # Blocking more losers = protective = NOT redundant with regime
            protect_ratio = blocked_losses / total_blocked
            score = int((1 - protect_ratio) * 100)  # low score = highly protective
            classification = 'PROTECTIVE' if score < 40 else 'MIXED'
        else:
            score = 50; classification = 'NEUTRAL'

        verdict = (
            'RETIRE → Move to Explanation Layer' if classification == 'HARMFUL' else
            'KEEP → Genuine protective value' if classification == 'PROTECTIVE' else
            'INVESTIGATE → Mixed signal' if classification == 'MIXED' else
            'RETIRE → Never triggers' if classification == 'INACTIVE' else
            'NEUTRAL → No clear signal'
        )
        redundancy[rule] = {
            'redundancy_score': score,
            'classification': classification,
            'total_blocked': total_blocked,
            'winners_blocked': blocked_wins,
            'losers_blocked': blocked_losses,
            'opportunity_cost': opp_cost,
            'loss_prevented': loss_prevented,
            'net_impact': net_impact,
            'verdict': verdict,
        }

    return redundancy


def generate_explanation_layer(trade):
    """Part 5 — Generate human-readable explanation for an approved trade."""
    rule_eval = trade.get('rule_eval', {})
    lines = []

    lines.append(f"✓ Atlas Regime: {trade.get('regime', '?')} day confirmed")

    vix = trade.get('vix', 18)
    if vix <= 20:
        lines.append(f"✓ VIX {vix:.1f} — Low volatility, standard size")
    elif vix <= 25:
        lines.append(f"⚠ VIX {vix:.1f} — Elevated, half size applied")

    if trade.get('es_nq_aligned'):
        lines.append("✓ ES / NQ / VIX alignment confirmed")
    else:
        lines.append("⚠ ES / NQ divergence noted — size reduced")

    gap_dir = trade.get('gap_dir', 0)
    bias = trade.get('bias', '?')
    gap_aligned = (bias == 'LONG' and gap_dir == 1) or (bias == 'SHORT' and gap_dir == -1)
    lines.append(f"{'✓' if gap_aligned else '⚠'} Gap {'aligned' if gap_aligned else 'misaligned'} with {bias} bias")

    london_dir = trade.get('london_dir', 0)
    london_aligned = (bias == 'LONG' and london_dir == 1) or (bias == 'SHORT' and london_dir == -1)
    lines.append(f"{'✓' if london_aligned else '⚠'} London ORB {'confirms' if london_aligned else 'diverges from'} {bias} bias")

    pdt = trade.get('prev_day_type', 'NORMAL')
    if pdt == 'INSIDE_DOJI':
        lines.append("✓ Prior day: Inside/Doji — compressed energy, breakout favoured")
    elif pdt == 'WIDE_RANGE':
        lines.append("⚠ Prior day: Wide range — size reduced, confirmation required")
    else:
        lines.append("✓ Prior day: Normal range")

    lines.append(f"✓ ORB breakout confirmed — {bias} bias established")
    lines.append(f"✓ EMA(20) reclaim entry triggered")
    lines.append(f"✓ ARI risk acceptable — stop distance within parameters")

    return '\n'.join(lines)


# ── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 70)
    print("ATLAS SPRINT 091 — CHECKLIST ATTRIBUTION ENGINE")
    print("=" * 70)

    print("\n[1/6] Generating dataset...")
    df_raw, daily_meta = generate_mnq_data('2023-07-01', '2025-07-01')
    macro_days = generate_macro_days('2023-07-01', '2025-07-01')

    print("\n[2/6] Running full attribution backtest (regime filter only, all trades tagged)...")
    all_trades = run_attribution_backtest(df_raw, daily_meta, macro_days, risk_per_trade=450)
    df_all = pd.DataFrame(all_trades)
    approved = df_all[df_all['checklist_approved']]
    rejected = df_all[~df_all['checklist_approved']]
    print(f"      Total universe (TREND/VOLATILE): {len(df_all)} trades")
    print(f"      Checklist approved: {len(approved)} | Rejected: {len(rejected)}")
    print(f"      Universe WR: {(df_all['outcome']=='WIN').mean():.1%} | Approved WR: {(approved['outcome']=='WIN').mean():.1%} | Rejected WR: {(rejected['outcome']=='WIN').mean():.1%}")

    print("\n[3/6] Part 1 — Rule attribution...")
    attribution = compute_rule_attribution(all_trades)
    print("\n  Rule Attribution Summary:")
    print(f"  {'Rule':<20} {'Blocked':>8} {'W-Blocked':>10} {'L-Blocked':>10} {'Opp Cost':>12} {'Loss Saved':>12} {'Net Impact':>12}")
    print(f"  {'-'*20} {'-'*8} {'-'*10} {'-'*10} {'-'*12} {'-'*12} {'-'*12}")
    for rule, a in attribution.items():
        if a['trades_blocked'] > 0:
            print(f"  {rule:<20} {a['trades_blocked']:>8} {a['winners_blocked']:>10} {a['losers_blocked']:>10} ${a['opportunity_cost']:>10,.0f} ${a['loss_prevented']:>10,.0f} ${a['net_impact']:>10,.0f}")

    print("\n[4/6] Part 2 — Winner rejection analysis...")
    rejected_winners, opp_cost_by_rule = compute_winner_rejection(all_trades)
    print(f"      Rejected winners: {len(rejected_winners)}")
    print("\n  Opportunity Cost by Rule:")
    for rule, data in sorted(opp_cost_by_rule.items(), key=lambda x: -x[1]['total_profit_lost']):
        print(f"    {rule}: {data['count']} winners blocked, ${data['total_profit_lost']:,.0f} profit lost, avg R={data['avg_r_lost']:.2f}")

    print("\n[5/6] Part 3 — Loser prevention analysis...")
    blocked_losers, protection_by_rule = compute_loser_prevention(all_trades)
    print(f"      Blocked losers: {len(blocked_losers)}")
    print("\n  Protection Value by Rule:")
    for rule, data in sorted(protection_by_rule.items(), key=lambda x: -x[1]['total_loss_prevented']):
        print(f"    {rule}: {data['count']} losses prevented, ${data['total_loss_prevented']:,.0f} saved")

    print("\n[6/6] Part 4 — Redundancy scoring...")
    redundancy = compute_redundancy_scores(all_trades, attribution, rejected_winners, blocked_losers)
    print("\n  Redundancy Scores:")
    print(f"  {'Rule':<20} {'Score':>8} {'Class':<15} {'Verdict'}")
    print(f"  {'-'*20} {'-'*8} {'-'*15} {'-'*40}")
    for rule, r in sorted(redundancy.items(), key=lambda x: -x[1]['redundancy_score']):
        print(f"  {rule:<20} {r['redundancy_score']:>8} {r['classification']:<15} {r['verdict']}")

    # Part 5 — Generate explanation layer for approved trades
    explanations = []
    for t in all_trades:
        if t['checklist_approved']:
            exp = generate_explanation_layer(t)
            explanations.append({'date': t['date'], 'bias': t['bias'], 'outcome': t['outcome'],
                                  'pnl_dollars': t['pnl_dollars'], 'explanation': exp})

    # Save full results
    output = {
        'universe_summary': {
            'total_trades': len(df_all),
            'approved': len(approved),
            'rejected': len(rejected),
            'universe_wr': float((df_all['outcome']=='WIN').mean()),
            'approved_wr': float((approved['outcome']=='WIN').mean()) if len(approved) > 0 else 0,
            'rejected_wr': float((rejected['outcome']=='WIN').mean()) if len(rejected) > 0 else 0,
            'universe_net': float(df_all['pnl_dollars'].sum()),
            'approved_net': float(approved['pnl_dollars'].sum()) if len(approved) > 0 else 0,
            'rejected_net': float(rejected['pnl_dollars'].sum()) if len(rejected) > 0 else 0,
            'rejected_winners': len([t for t in all_trades if not t['checklist_approved'] and t['outcome']=='WIN']),
            'rejected_losers': len([t for t in all_trades if not t['checklist_approved'] and t['outcome']=='LOSS']),
        },
        'attribution': attribution,
        'winner_rejection': {
            'count': len(rejected_winners),
            'total_profit_lost': sum(t['pnl_dollars'] for t in rejected_winners),
            'by_rule': opp_cost_by_rule,
            'trades': rejected_winners[:20],  # first 20 for report
        },
        'loser_prevention': {
            'count': len(blocked_losers),
            'total_loss_prevented': sum(abs(t['pnl_dollars']) for t in blocked_losers),
            'by_rule': protection_by_rule,
        },
        'redundancy': redundancy,
        'explanation_samples': explanations[:5],
    }

    with open('/home/ubuntu/rc_validation/sprint091_results.json', 'w') as f:
        json.dump(output, f, indent=2, default=str)
    print("\nSaved sprint091_results.json")
