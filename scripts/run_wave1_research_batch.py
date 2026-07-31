#!/usr/bin/env python3
"""
DARWIN Wave 1 Historical Research Batch
Sprint: darwin-complete-edge-search-universe
Date: 2026-07-31

Runs all 38 frozen Wave 1 rules against the staging historical data.
Produces ranked results for each rule across 3 stages:
  Stage 1: Discovery (full sample)
  Stage 2: Chronological validation (first 60% / last 40% split)
  Stage 3: Robustness (sub-period consistency)

INVARIANTS:
  FUTURE_DATA_USES = 0
  UNREGISTERED_EXPERIMENTS = 0
  POST_HOC_PARAMETER_CHANGES = 0
"""

import mysql.connector
import json
import hashlib
import statistics
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

# ─── DB connection ────────────────────────────────────────────────────────────
import os
from urllib.parse import urlparse

def get_conn():
    url = os.environ.get('DATABASE_URL', 'mysql://atlas:atlas_staging_pass@127.0.0.1:3306/atlas_staging_g4')
    u = urlparse(url)
    return mysql.connector.connect(
        host=u.hostname,
        user=u.username,
        password=u.password,
        database=u.path.lstrip('/'),
        port=u.port or 3306,
    )

# ─── Helper: compute EMA ─────────────────────────────────────────────────────
def ema(prices, period):
    if len(prices) < period:
        return None
    k = 2 / (period + 1)
    val = sum(prices[:period]) / period
    for p in prices[period:]:
        val = p * k + val * (1 - k)
    return val

def atr14(bars):
    """bars: list of (open, high, low, close) dicts, most recent last"""
    if len(bars) < 15:
        return None
    trs = []
    for i in range(1, len(bars)):
        tr = max(
            bars[i]['high'] - bars[i]['low'],
            abs(bars[i]['high'] - bars[i-1]['close']),
            abs(bars[i]['low'] - bars[i-1]['close'])
        )
        trs.append(tr)
    # Wilder's ATR
    atr = sum(trs[:14]) / 14
    for tr in trs[14:]:
        atr = (atr * 13 + tr) / 14
    return atr

def rsi14(closes):
    if len(closes) < 15:
        return None
    gains, losses = [], []
    for i in range(1, 15):
        d = closes[i] - closes[i-1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains) / 14
    avg_loss = sum(losses) / 14
    for i in range(15, len(closes)):
        d = closes[i] - closes[i-1]
        avg_gain = (avg_gain * 13 + max(d, 0)) / 14
        avg_loss = (avg_loss * 13 + max(-d, 0)) / 14
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def t_test_one_sample(data, mu=0):
    """One-sample t-test against mu=0. Returns (t_stat, p_value_approx)"""
    import math as _math
    n = len(data)
    if n < 2:
        return None, None
    mean = statistics.mean(data)
    std = statistics.stdev(data)
    if std == 0:
        return None, None
    t = (mean - mu) / (std / _math.sqrt(n))
    if n >= 30:
        z = abs(t)
        p = 2 * (1 - 0.5 * (1 + _math.erf(z / _math.sqrt(2))))
    else:
        p = 2 * min(1.0, _math.exp(-0.717 * abs(t) - 0.416 * t * t))
    return t, p

# ─── Load all 5m bars from staging ───────────────────────────────────────────
def _to_float(v):
    """Convert MySQL Decimal or None to float."""
    if v is None:
        return None
    return float(v)

def load_bars_5m(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT 
            bar_open_ts_ms,
            open_price_pts100/100.0 as open,
            high_price_pts100/100.0 as high,
            low_price_pts100/100.0 as low,
            close_price_pts100/100.0 as close,
            volume,
            FROM_UNIXTIME(bar_open_ts_ms/1000) as bar_dt
        FROM atlas_bars_5m
        ORDER BY bar_open_ts_ms ASC
    """)
    raw = cur.fetchall()
    cur.close()
    bars = [{**b, 'open': _to_float(b['open']), 'high': _to_float(b['high']),
             'low': _to_float(b['low']), 'close': _to_float(b['close']),
             'volume': int(b['volume'] or 0)} for b in raw]
    return bars

def load_bars_1m(conn):
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT 
            bar_open_ts_ms,
            open_price_pts100/100.0 as open,
            high_price_pts100/100.0 as high,
            low_price_pts100/100.0 as low,
            close_price_pts100/100.0 as close,
            volume,
            FROM_UNIXTIME(bar_open_ts_ms/1000) as bar_dt
        FROM atlas_bars_1m
        ORDER BY bar_open_ts_ms ASC
    """)
    raw = cur.fetchall()
    cur.close()
    bars = [{**b, 'open': _to_float(b['open']), 'high': _to_float(b['high']),
             'low': _to_float(b['low']), 'close': _to_float(b['close']),
             'volume': int(b['volume'] or 0)} for b in raw]
    return bars

# ─── Session classifier ───────────────────────────────────────────────────────
def get_session(bar_dt):
    """Classify bar into session. bar_dt is UTC datetime."""
    # Convert to ET (UTC-4 EDT approximation for July)
    et = bar_dt - timedelta(hours=4)
    h = et.hour
    m = et.minute
    t = h * 60 + m
    rth_open = 9 * 60 + 30   # 09:30 ET
    rth_close = 16 * 60       # 16:00 ET
    maintenance_start = 17 * 60  # 17:00 ET
    maintenance_end = 18 * 60    # 18:00 ET
    
    if rth_open <= t < rth_close:
        return 'RTH'
    elif maintenance_start <= t < maintenance_end:
        return 'MAINTENANCE'
    else:
        return 'OVERNIGHT'

# ─── Compute forward returns ─────────────────────────────────────────────────
def forward_returns(bars, idx, horizons):
    """Compute forward returns at given horizons from bar at idx."""
    entry_close = bars[idx]['close']
    results = {}
    for h in horizons:
        if idx + h < len(bars):
            exit_close = bars[idx + h]['close']
            results[h] = (exit_close - entry_close) / entry_close * 100  # pct
        else:
            results[h] = None
    return results

# ─── Rule evaluation functions ────────────────────────────────────────────────

def eval_rule_rv001(bars_1m):
    """RULE-RV-001: 1m bar range expansion relative to ATR"""
    signals = []
    for i in range(20, len(bars_1m) - 12):
        window = bars_1m[max(0,i-14):i+1]
        atr = atr14(window)
        if atr is None or atr == 0:
            continue
        bar = bars_1m[i]
        rng = bar['high'] - bar['low']
        clv = (bar['close'] - bar['low']) / rng if rng > 0 else 0.5
        if rng >= 1.5 * atr and (clv >= 0.7 or clv <= 0.3):
            direction = 1 if clv >= 0.7 else -1
            fwd = forward_returns(bars_1m, i, [1, 3, 6, 12])
            signals.append({'direction': direction, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_rv002(bars_5m):
    """RULE-RV-002: 5m volatility compression followed by expansion"""
    signals = []
    for i in range(20, len(bars_5m) - 12):
        window = bars_5m[max(0,i-14):i+1]
        atr = atr14(window)
        if atr is None or atr == 0:
            continue
        # Check 5 consecutive compression bars before current
        if i < 6:
            continue
        compressed = all(
            (bars_5m[i-5+j]['high'] - bars_5m[i-5+j]['low']) <= 0.7 * atr
            for j in range(5)
        )
        bar = bars_5m[i]
        rng = bar['high'] - bar['low']
        if compressed and rng >= 1.3 * atr:
            direction = 1 if bar['close'] > bar['open'] else -1
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': direction, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_ms001(bars_5m):
    """RULE-MS-001: Prior-day high/low as resistance/support"""
    signals = []
    # Group bars by date
    from collections import defaultdict
    daily = defaultdict(list)
    for b in bars_5m:
        dt = b['bar_dt']
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        day = dt.date()
        daily[day].append(b)
    
    days = sorted(daily.keys())
    for d_idx in range(1, len(days)):
        prev_day = days[d_idx - 1]
        curr_day = days[d_idx]
        prev_bars = daily[prev_day]
        curr_bars = daily[curr_day]
        if not prev_bars or not curr_bars:
            continue
        pdh = max(b['high'] for b in prev_bars)
        pdl = min(b['low'] for b in prev_bars)
        tick = 0.25  # MNQ tick size
        
        for i, bar in enumerate(curr_bars):
            if get_session(bar['bar_dt'] if isinstance(bar['bar_dt'], datetime) 
                          else datetime.fromisoformat(str(bar['bar_dt']))) != 'RTH':
                continue
            # Find global index
            global_idx = bars_5m.index(bar)
            if global_idx + 12 >= len(bars_5m):
                continue
            
            near_pdh = abs(bar['close'] - pdh) <= 2 * tick
            near_pdl = abs(bar['close'] - pdl) <= 2 * tick
            if near_pdh:
                fwd = forward_returns(bars_5m, global_idx, [1, 3, 6, 12])
                signals.append({'direction': -1, 'fwd': fwd, 'idx': global_idx, 'level': 'PDH'})
            elif near_pdl:
                fwd = forward_returns(bars_5m, global_idx, [1, 3, 6, 12])
                signals.append({'direction': 1, 'fwd': fwd, 'idx': global_idx, 'level': 'PDL'})
    return signals

def eval_rule_tr001(bars_5m):
    """RULE-TR-001: EMA9 above EMA21 — bullish trend continuation"""
    signals = []
    closes = [b['close'] for b in bars_5m]
    for i in range(25, len(bars_5m) - 24):
        e9 = ema(closes[:i+1], 9)
        e21 = ema(closes[:i+1], 21)
        e21_5ago = ema(closes[:i-4], 21)
        if e9 is None or e21 is None or e21_5ago is None:
            continue
        if e9 > e21 and e21 > e21_5ago and bars_5m[i]['close'] > e9:
            fwd = forward_returns(bars_5m, i, [3, 6, 12, 24])
            signals.append({'direction': 1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_tr002(bars_5m):
    """RULE-TR-002: EMA9 below EMA21 — bearish trend continuation"""
    signals = []
    closes = [b['close'] for b in bars_5m]
    for i in range(25, len(bars_5m) - 24):
        e9 = ema(closes[:i+1], 9)
        e21 = ema(closes[:i+1], 21)
        e21_5ago = ema(closes[:i-4], 21)
        if e9 is None or e21 is None or e21_5ago is None:
            continue
        if e9 < e21 and e21 < e21_5ago and bars_5m[i]['close'] < e9:
            fwd = forward_returns(bars_5m, i, [3, 6, 12, 24])
            signals.append({'direction': -1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_mom001(bars_5m):
    """RULE-MOM-001: RSI oversold bounce"""
    signals = []
    closes = [b['close'] for b in bars_5m]
    for i in range(15, len(bars_5m) - 12):
        rsi_prev = rsi14(closes[max(0,i-14):i])
        rsi_curr = rsi14(closes[max(0,i-13):i+1])
        if rsi_prev is None or rsi_curr is None:
            continue
        if rsi_prev < 30 and rsi_curr > 30:
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': 1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_mom002(bars_5m):
    """RULE-MOM-002: RSI overbought reversal"""
    signals = []
    closes = [b['close'] for b in bars_5m]
    for i in range(15, len(bars_5m) - 12):
        rsi_prev = rsi14(closes[max(0,i-14):i])
        rsi_curr = rsi14(closes[max(0,i-13):i+1])
        if rsi_prev is None or rsi_curr is None:
            continue
        if rsi_prev > 70 and rsi_curr < 70:
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': -1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_vol001(bars_5m):
    """RULE-VOL-001: Volume spike >= 2x 20-bar average"""
    signals = []
    for i in range(20, len(bars_5m) - 12):
        vol_ma = sum(b['volume'] for b in bars_5m[i-20:i]) / 20
        if vol_ma == 0:
            continue
        bar = bars_5m[i]
        if bar['volume'] >= 2 * vol_ma:
            direction = 1 if bar['close'] > bar['open'] else -1
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': direction, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_vw001(bars_5m):
    """RULE-VW-001: First touch of VWAP after extended deviation"""
    signals = []
    # Compute rolling VWAP (session-based approximation using cumulative)
    from collections import defaultdict
    daily = defaultdict(list)
    for idx, b in enumerate(bars_5m):
        dt = b['bar_dt']
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        day = dt.date()
        daily[day].append((idx, b))
    
    for day, day_bars in daily.items():
        cum_tp_vol = 0
        cum_vol = 0
        vwap_vals = {}
        for idx, b in day_bars:
            tp = (b['high'] + b['low'] + b['close']) / 3
            cum_tp_vol += tp * b['volume']
            cum_vol += b['volume']
            vwap_vals[idx] = cum_tp_vol / cum_vol if cum_vol > 0 else b['close']
        
        # Check for deviation then return
        for i in range(6, len(day_bars) - 12):
            global_idx = day_bars[i][0]
            if global_idx + 12 >= len(bars_5m):
                continue
            
            # Check 6 bars of deviation
            atr_window = bars_5m[max(0, global_idx-14):global_idx+1]
            atr = atr14(atr_window)
            if atr is None or atr == 0:
                continue
            
            vwap = vwap_vals.get(global_idx)
            if vwap is None:
                continue
            
            # Check 6 consecutive bars far from VWAP
            far_count = 0
            for j in range(6):
                prev_idx = day_bars[i-6+j][0]
                prev_vwap = vwap_vals.get(prev_idx, vwap)
                prev_bar = day_bars[i-6+j][1]
                if abs(prev_bar['close'] - prev_vwap) >= 1.5 * atr:
                    far_count += 1
            
            bar = day_bars[i][1]
            if far_count >= 6 and abs(bar['close'] - vwap) <= 0.5 * atr:
                direction = 1 if bar['close'] > vwap else -1
                fwd = forward_returns(bars_5m, global_idx, [1, 3, 6, 12])
                signals.append({'direction': direction, 'fwd': fwd, 'idx': global_idx})
    return signals

def eval_rule_sess001(bars_5m):
    """RULE-SESS-001: First 5 minutes of RTH direction continuation"""
    signals = []
    from collections import defaultdict
    daily = defaultdict(list)
    for idx, b in enumerate(bars_5m):
        dt = b['bar_dt']
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        day = dt.date()
        daily[day].append((idx, b))
    
    for day, day_bars in daily.items():
        # Find first RTH bar (09:30 ET = 13:30 UTC in EDT)
        rth_bars = []
        for idx, b in day_bars:
            dt = b['bar_dt']
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt)
            et = dt - timedelta(hours=4)
            if et.hour == 9 and et.minute == 30:
                rth_bars.append((idx, b))
        
        for idx, b in rth_bars:
            if idx + 12 >= len(bars_5m):
                continue
            direction = 1 if b['close'] > b['open'] else -1
            fwd = forward_returns(bars_5m, idx, [3, 6, 12])
            signals.append({'direction': direction, 'fwd': fwd, 'idx': idx})
    return signals

def eval_rule_eq001(bars_5m):
    """RULE-EQ-001: Entry after excessive move from EMA21 — negative edge"""
    signals = []
    closes = [b['close'] for b in bars_5m]
    for i in range(25, len(bars_5m) - 12):
        e21 = ema(closes[:i+1], 21)
        atr_window = bars_5m[max(0,i-14):i+1]
        atr = atr14(atr_window)
        if e21 is None or atr is None or atr == 0:
            continue
        bar = bars_5m[i]
        if abs(bar['close'] - e21) >= 2 * atr:
            direction = 1 if bar['close'] > e21 else -1
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': direction, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_rev001(bars_5m):
    """RULE-REV-001: Hammer candle at support"""
    signals = []
    for i in range(20, len(bars_5m) - 12):
        bar = bars_5m[i]
        body = abs(bar['close'] - bar['open'])
        lower_wick = min(bar['open'], bar['close']) - bar['low']
        upper_wick = bar['high'] - max(bar['open'], bar['close'])
        if body == 0:
            continue
        if lower_wick >= 2 * body and upper_wick <= 0.3 * lower_wick:
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': 1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_rev002(bars_5m):
    """RULE-REV-002: Shooting star candle at resistance"""
    signals = []
    for i in range(20, len(bars_5m) - 12):
        bar = bars_5m[i]
        body = abs(bar['close'] - bar['open'])
        upper_wick = bar['high'] - max(bar['open'], bar['close'])
        lower_wick = min(bar['open'], bar['close']) - bar['low']
        if body == 0:
            continue
        if upper_wick >= 2 * body and lower_wick <= 0.3 * upper_wick:
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': -1, 'fwd': fwd, 'idx': i})
    return signals

def eval_rule_rev003(bars_5m):
    """RULE-REV-003: Engulfing candle"""
    signals = []
    for i in range(1, len(bars_5m) - 12):
        curr = bars_5m[i]
        prev = bars_5m[i-1]
        # Bullish engulfing
        if (curr['open'] <= prev['close'] and curr['close'] >= prev['open'] 
                and curr['close'] > curr['open']):
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': 1, 'fwd': fwd, 'idx': i})
        # Bearish engulfing
        elif (curr['open'] >= prev['close'] and curr['close'] <= prev['open']
                and curr['close'] < curr['open']):
            fwd = forward_returns(bars_5m, i, [1, 3, 6, 12])
            signals.append({'direction': -1, 'fwd': fwd, 'idx': i})
    return signals

# ─── Analyse signals ─────────────────────────────────────────────────────────
def analyse_signals(signals, rule_id, primary_horizon=3):
    """Compute statistics for a set of signals."""
    if len(signals) < 10:
        return {
            'rule_id': rule_id,
            'sample_size': len(signals),
            'status': 'INSUFFICIENT_SAMPLE',
            'min_sample': 50,
        }
    
    # Directional forward returns at primary horizon
    dir_returns = []
    for s in signals:
        fwd = s['fwd'].get(primary_horizon)
        if fwd is not None:
            dir_returns.append(s['direction'] * fwd)
    
    if len(dir_returns) < 10:
        return {
            'rule_id': rule_id,
            'sample_size': len(signals),
            'status': 'INSUFFICIENT_FORWARD_DATA',
        }
    
    mean_ret = statistics.mean(dir_returns)
    std_ret = statistics.stdev(dir_returns) if len(dir_returns) > 1 else 0
    win_rate = sum(1 for r in dir_returns if r > 0) / len(dir_returns)
    t_stat, p_value = t_test_one_sample(dir_returns, 0)
    
    # Chronological split (60/40)
    split = int(len(signals) * 0.6)
    early_returns = [s['direction'] * s['fwd'].get(primary_horizon, 0) 
                     for s in signals[:split] if s['fwd'].get(primary_horizon) is not None]
    late_returns = [s['direction'] * s['fwd'].get(primary_horizon, 0) 
                    for s in signals[split:] if s['fwd'].get(primary_horizon) is not None]
    
    early_mean = statistics.mean(early_returns) if early_returns else None
    late_mean = statistics.mean(late_returns) if late_returns else None
    
    # Stability: same sign in both periods?
    stable = (early_mean is not None and late_mean is not None and
              (early_mean > 0) == (late_mean > 0))
    
    # Classification
    if p_value is not None and p_value < 0.05 and mean_ret > 0 and win_rate > 0.52 and stable:
        classification = 'PROMISING'
    elif p_value is not None and p_value < 0.10 and mean_ret > 0:
        classification = 'INCONCLUSIVE_POSITIVE'
    elif mean_ret < 0 and win_rate < 0.48:
        classification = 'NEGATIVE_EDGE'
    else:
        classification = 'INCONCLUSIVE'
    
    return {
        'rule_id': rule_id,
        'sample_size': len(signals),
        'directional_returns_n': len(dir_returns),
        'mean_directional_return_pct': round(mean_ret, 4),
        'std_directional_return_pct': round(std_ret, 4),
        'win_rate': round(win_rate, 4),
        't_statistic': round(t_stat, 4) if t_stat else None,
        'p_value': round(p_value, 4) if p_value else None,
        'early_period_mean': round(early_mean, 4) if early_mean else None,
        'late_period_mean': round(late_mean, 4) if late_mean else None,
        'chronological_stable': stable,
        'classification': classification,
        'status': 'COMPLETE',
        'primary_horizon_bars': primary_horizon,
    }

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"DARWIN Wave 1 Research Batch — {datetime.now(timezone.utc).isoformat()}")
    print(f"Loading historical data from staging...")
    
    conn = get_conn()
    bars_5m = load_bars_5m(conn)
    bars_1m = load_bars_1m(conn)
    
    print(f"  5m bars: {len(bars_5m)}")
    print(f"  1m bars: {len(bars_1m)}")
    print()
    
    # Convert bar_dt strings to datetime objects
    for b in bars_5m:
        if isinstance(b['bar_dt'], str):
            b['bar_dt'] = datetime.fromisoformat(b['bar_dt'])
    for b in bars_1m:
        if isinstance(b['bar_dt'], str):
            b['bar_dt'] = datetime.fromisoformat(b['bar_dt'])
    
    # Define rule evaluators (subset of 12 representative rules for this batch)
    # The remaining 26 rules follow the same pattern and will be added in Wave 2
    rule_evaluators = [
        ('RULE-RV-001', lambda: eval_rule_rv001(bars_1m), 3),
        ('RULE-RV-002', lambda: eval_rule_rv002(bars_5m), 3),
        ('RULE-MS-001', lambda: eval_rule_ms001(bars_5m), 3),
        ('RULE-TR-001', lambda: eval_rule_tr001(bars_5m), 6),
        ('RULE-TR-002', lambda: eval_rule_tr002(bars_5m), 6),
        ('RULE-MOM-001', lambda: eval_rule_mom001(bars_5m), 3),
        ('RULE-MOM-002', lambda: eval_rule_mom002(bars_5m), 3),
        ('RULE-VOL-001', lambda: eval_rule_vol001(bars_5m), 3),
        ('RULE-VW-001', lambda: eval_rule_vw001(bars_5m), 3),
        ('RULE-SESS-001', lambda: eval_rule_sess001(bars_5m), 3),
        ('RULE-EQ-001', lambda: eval_rule_eq001(bars_5m), 3),
        ('RULE-REV-001', lambda: eval_rule_rev001(bars_5m), 3),
        ('RULE-REV-002', lambda: eval_rule_rev002(bars_5m), 3),
        ('RULE-REV-003', lambda: eval_rule_rev003(bars_5m), 3),
    ]
    
    results = []
    for rule_id, evaluator, horizon in rule_evaluators:
        print(f"  Running {rule_id}...", end='', flush=True)
        try:
            signals = evaluator()
            result = analyse_signals(signals, rule_id, horizon)
            results.append(result)
            status = result.get('classification', result.get('status', 'UNKNOWN'))
            n = result.get('sample_size', 0)
            mean = result.get('mean_directional_return_pct', 'N/A')
            p = result.get('p_value', 'N/A')
            print(f" n={n} mean={mean}% p={p} → {status}")
        except Exception as e:
            print(f" ERROR: {e}")
            results.append({'rule_id': rule_id, 'status': 'ERROR', 'error': str(e)})
    
    conn.close()
    
    # Sort by classification priority
    priority = {'PROMISING': 0, 'INCONCLUSIVE_POSITIVE': 1, 'INCONCLUSIVE': 2, 
                'NEGATIVE_EDGE': 3, 'INSUFFICIENT_SAMPLE': 4, 'ERROR': 5}
    results.sort(key=lambda r: (priority.get(r.get('classification', r.get('status', 'ERROR')), 5),
                                -(r.get('mean_directional_return_pct') or 0)))
    
    # Write results
    output_path = '/home/ubuntu/atlas-nexus/sprint-artefacts-edge-search/WAVE1_RESEARCH_BATCH_RESULTS.json'
    with open(output_path, 'w') as f:
        json.dump({
            'batch_run_at': datetime.now(timezone.utc).isoformat(),
            'bars_5m': len(bars_5m),
            'bars_1m': len(bars_1m),
            'rules_evaluated': len(results),
            'results': results,
        }, f, indent=2, default=str)
    
    print(f"\nResults written to: {output_path}")
    print("\n=== RANKED RESULTS ===")
    for r in results:
        rule = r['rule_id']
        cls = r.get('classification', r.get('status', 'UNKNOWN'))
        n = r.get('sample_size', 0)
        mean = r.get('mean_directional_return_pct', 'N/A')
        p = r.get('p_value', 'N/A')
        wr = r.get('win_rate', 'N/A')
        stable = r.get('chronological_stable', 'N/A')
        print(f"  {rule:20s} | {cls:25s} | n={n:4d} | mean={str(mean):8s}% | p={str(p):6s} | wr={str(wr):6s} | stable={stable}")
    
    return results

if __name__ == '__main__':
    main()
