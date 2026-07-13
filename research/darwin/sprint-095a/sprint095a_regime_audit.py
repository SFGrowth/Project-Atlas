"""
Sprint 095A — Priority 1: Regime Classifier Audit
Uses the REAL MNQ 5-min dataset (140,933 bars) to:
1. Replicate the Pine Script v1.0 FROZEN regime engine in Python
2. Run threshold sensitivity analysis
3. Analyse eligible days for ORB-1
4. Measure false positives/negatives vs a trend oracle
5. Recommend optimal thresholds
"""
import pandas as pd
import numpy as np
import json
from pathlib import Path

DATA_PATH = "/home/ubuntu/Project-Atlas/data/raw/massive/MNQ_5min_full.csv"
OUT_DIR = Path("/home/ubuntu/rc_validation")

print("[1/7] Loading real MNQ dataset...")
df = pd.read_csv(DATA_PATH)
df.columns = [c.lower().strip() for c in df.columns]
# Normalise timestamp
if 'time' in df.columns:
    df['ts'] = pd.to_datetime(df['time'], utc=True)
elif 'timestamp' in df.columns:
    df['ts'] = pd.to_datetime(df['timestamp'], utc=True)
else:
    df['ts'] = pd.to_datetime(df.iloc[:, 0], utc=True)

df = df.sort_values('ts').reset_index(drop=True)
df['date'] = df['ts'].dt.date
print(f"  Loaded {len(df):,} bars | {df['date'].min()} → {df['date'].max()}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: Replicate Pine Script v1.0 FROZEN regime engine
# compressThresh=0.7, expandThresh=1.1, vwapThresh=1.5
# fastAtrLen=5, slowAtrLen=20
# ─────────────────────────────────────────────────────────────────────────────
print("[2/7] Replicating Pine Script v1.0 FROZEN regime engine...")

def true_range(h, l, prev_c):
    return max(h - l, abs(h - prev_c), abs(l - prev_c))

def compute_atr(df, period):
    trs = []
    for i in range(len(df)):
        if i == 0:
            trs.append(df['high'].iloc[i] - df['low'].iloc[i])
        else:
            trs.append(true_range(df['high'].iloc[i], df['low'].iloc[i], df['close'].iloc[i-1]))
    tr = pd.Series(trs, index=df.index)
    return tr.ewm(span=period, adjust=False).mean()

df['atr5']  = compute_atr(df, 5)
df['atr20'] = compute_atr(df, 20)
df['atr_ratio'] = df['atr5'] / df['atr20'].clip(lower=0.01)

# VWAP (session-reset)
df['hlc3'] = (df['high'] + df['low'] + df['close']) / 3
df['new_session'] = df['date'] != df['date'].shift(1)
cum_vp = 0.0
cum_v  = 0.0
vwaps  = []
for i, row in df.iterrows():
    if row['new_session']:
        cum_vp = 0.0
        cum_v  = 0.0
    cum_vp += row['hlc3'] * row['volume']
    cum_v  += row['volume']
    vwaps.append(cum_vp / cum_v if cum_v > 0 else row['close'])
df['vwap'] = vwaps
df['atr14'] = compute_atr(df, 14)
df['vwap_dev'] = (df['close'] - df['vwap']).abs() / df['atr14'].clip(lower=0.01)

# Pine Script v1.0 FROZEN classification
def classify_pine_v1(row, compress=0.7, expand=1.1, vwap_thresh=1.5):
    is_compressed = row['atr_ratio'] <= compress
    is_expanded   = row['atr_ratio'] >= expand
    is_good_loc   = row['vwap_dev']  <= vwap_thresh
    score = 0
    if is_compressed:
        score += 50
    elif is_expanded:
        score += 25
    if is_good_loc:
        score += 25
    if is_compressed:
        return 'RANGE', score
    elif is_expanded:
        return 'TREND', score
    else:
        return 'NEUTRAL', score

df[['regime_v1', 'trade_score']] = df.apply(
    lambda r: pd.Series(classify_pine_v1(r)), axis=1)

# Sprint 094B Python classifier (for comparison)
def classify_094b(row):
    if row['atr_ratio'] > 1.5:
        return 'VOLATILE'
    elif row['atr_ratio'] > 1.1:
        return 'TREND'
    else:
        return 'RANGE'

df['regime_094b'] = df.apply(classify_094b, axis=1)

print("  Pine v1.0 distribution:")
for r, c in df['regime_v1'].value_counts().items():
    print(f"    {r}: {c:,} ({100*c/len(df):.1f}%)")
print("  Sprint 094B distribution:")
for r, c in df['regime_094b'].value_counts().items():
    print(f"    {r}: {c:,} ({100*c/len(df):.1f}%)")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Daily aggregation for ORB-1 eligibility
# ─────────────────────────────────────────────────────────────────────────────
print("[3/7] Computing daily regime and ORB-1 eligibility...")

daily = df.groupby('date').agg(
    open=('open', 'first'),
    high=('high', 'max'),
    low=('low', 'min'),
    close=('close', 'last'),
    volume=('volume', 'sum'),
    atr_ratio_mean=('atr_ratio', 'mean'),
    atr_ratio_max=('atr_ratio', 'max'),
    regime_v1=('regime_v1', lambda x: x.mode()[0]),
    regime_094b=('regime_094b', lambda x: x.mode()[0]),
    trade_score_mean=('trade_score', 'mean'),
    bars=('close', 'count')
).reset_index()

daily['daily_range'] = daily['high'] - daily['low']
daily['atr_ma20'] = daily['atr_ratio_mean'].rolling(20).mean()

# ORB-1 eligible: TREND or VOLATILE (094b) or TREND (v1.0)
daily['orb1_eligible_094b'] = daily['regime_094b'].isin(['TREND', 'VOLATILE'])
daily['orb1_eligible_v1']   = daily['regime_v1'] == 'TREND'

n_days = len(daily)
orb_094b = daily['orb1_eligible_094b'].sum()
orb_v1   = daily['orb1_eligible_v1'].sum()
print(f"  Total trading days: {n_days}")
print(f"  ORB-1 eligible (094B classifier): {orb_094b} ({100*orb_094b/n_days:.1f}%)")
print(f"  ORB-1 eligible (Pine v1.0):       {orb_v1} ({100*orb_v1/n_days:.1f}%)")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Threshold sensitivity analysis
# ─────────────────────────────────────────────────────────────────────────────
print("[4/7] Running threshold sensitivity analysis...")

# Test ATR ratio thresholds for TREND classification
trend_thresholds = [0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20, 1.25, 1.30, 1.40, 1.50]
sensitivity = []
for thresh in trend_thresholds:
    eligible = (daily['atr_ratio_mean'] >= thresh).sum()
    pct = 100 * eligible / n_days
    # Estimate win rate: use actual daily range as proxy for trend quality
    trend_days = daily[daily['atr_ratio_mean'] >= thresh]
    avg_range = trend_days['daily_range'].mean() if len(trend_days) > 0 else 0
    sensitivity.append({
        'threshold': thresh,
        'eligible_days': int(eligible),
        'pct_days': round(pct, 1),
        'avg_daily_range': round(avg_range, 1),
    })

print("  Threshold | Eligible Days | % Days | Avg Range")
for s in sensitivity:
    print(f"  {s['threshold']:.2f}      | {s['eligible_days']:5d}         | {s['pct_days']:5.1f}% | {s['avg_daily_range']:.1f} pts")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Trend oracle — identify genuinely trending days
# A "true trend day" = daily range > 1.5x the 20-day median range
# ─────────────────────────────────────────────────────────────────────────────
print("[5/7] Building trend oracle and false positive/negative analysis...")

daily['range_ma20'] = daily['daily_range'].rolling(20).mean()
daily['range_std20'] = daily['daily_range'].rolling(20).std()
daily['is_true_trend'] = daily['daily_range'] > (daily['range_ma20'] + daily['range_std20'])
daily['is_true_range'] = daily['daily_range'] < (daily['range_ma20'] - 0.5 * daily['range_std20'])

# For each threshold, compute TP/FP/TN/FN
fp_fn_analysis = []
for thresh in trend_thresholds:
    predicted_trend = daily['atr_ratio_mean'] >= thresh
    true_trend = daily['is_true_trend'].fillna(False)
    tp = (predicted_trend & true_trend).sum()
    fp = (predicted_trend & ~true_trend).sum()
    fn = (~predicted_trend & true_trend).sum()
    tn = (~predicted_trend & ~true_trend).sum()
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    fp_fn_analysis.append({
        'threshold': thresh,
        'tp': int(tp), 'fp': int(fp), 'fn': int(fn), 'tn': int(tn),
        'precision': round(precision, 3),
        'recall': round(recall, 3),
        'f1': round(f1, 3),
        'eligible_days': int(predicted_trend.sum())
    })

print("  Threshold | TP   | FP   | FN   | Precision | Recall | F1")
for r in fp_fn_analysis:
    print(f"  {r['threshold']:.2f}      | {r['tp']:4d} | {r['fp']:4d} | {r['fn']:4d} | {r['precision']:.3f}     | {r['recall']:.3f}  | {r['f1']:.3f}")

# Find optimal threshold (max F1)
best = max(fp_fn_analysis, key=lambda x: x['f1'])
print(f"\n  OPTIMAL THRESHOLD (max F1): {best['threshold']} → {best['eligible_days']} eligible days, F1={best['f1']}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Missed opportunity analysis
# ─────────────────────────────────────────────────────────────────────────────
print("[6/7] Missed opportunity analysis...")

# Days that were true trend but NOT caught by current 094B classifier
missed = daily[daily['is_true_trend'].fillna(False) & ~daily['orb1_eligible_094b']]
caught = daily[daily['is_true_trend'].fillna(False) & daily['orb1_eligible_094b']]
false_pos = daily[~daily['is_true_trend'].fillna(False) & daily['orb1_eligible_094b']]

print(f"  True trend days total: {daily['is_true_trend'].sum()}")
print(f"  Caught by 094B classifier: {len(caught)} ({100*len(caught)/max(daily['is_true_trend'].sum(),1):.1f}%)")
print(f"  Missed by 094B classifier: {len(missed)} ({100*len(missed)/max(daily['is_true_trend'].sum(),1):.1f}%)")
print(f"  False positives (not trend but classified as TREND/VOLATILE): {len(false_pos)}")

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Recommended thresholds and save results
# ─────────────────────────────────────────────────────────────────────────────
print("[7/7] Generating recommendations and saving results...")

# Best threshold analysis
best_thresh = best['threshold']
new_eligible = (daily['atr_ratio_mean'] >= best_thresh).sum()

# ORB-1 backtest with new threshold
orb_new = daily[daily['atr_ratio_mean'] >= best_thresh]

results = {
    "sprint": "095A",
    "part": "Regime Classifier Audit",
    "dataset": {"bars": len(df), "days": n_days},
    "current_classifier_094b": {
        "trend_threshold": 1.10,
        "volatile_threshold": 1.50,
        "orb1_eligible_days": int(orb_094b),
        "orb1_pct": round(100*orb_094b/n_days, 1),
        "regime_distribution": {
            "RANGE": int((daily['regime_094b']=='RANGE').sum()),
            "TREND": int((daily['regime_094b']=='TREND').sum()),
            "VOLATILE": int((daily['regime_094b']=='VOLATILE').sum()),
        }
    },
    "pine_v1_classifier": {
        "compress_thresh": 0.7,
        "expand_thresh": 1.1,
        "orb1_eligible_days": int(orb_v1),
        "orb1_pct": round(100*orb_v1/n_days, 1),
        "regime_distribution": {
            "RANGE": int((daily['regime_v1']=='RANGE').sum()),
            "TREND": int((daily['regime_v1']=='TREND').sum()),
            "NEUTRAL": int((daily['regime_v1']=='NEUTRAL').sum()),
        }
    },
    "sensitivity_analysis": sensitivity,
    "fp_fn_analysis": fp_fn_analysis,
    "optimal_threshold": {
        "value": best_thresh,
        "f1_score": best['f1'],
        "precision": best['precision'],
        "recall": best['recall'],
        "eligible_days": int(new_eligible),
        "eligible_pct": round(100*new_eligible/n_days, 1)
    },
    "missed_opportunities": {
        "true_trend_days": int(daily['is_true_trend'].sum()),
        "caught": int(len(caught)),
        "missed": int(len(missed)),
        "false_positives": int(len(false_pos))
    },
    "recommendation": {
        "action": "RECALIBRATE" if best_thresh != 1.10 else "MAINTAIN",
        "new_trend_threshold": best_thresh,
        "rationale": f"Optimal F1={best['f1']:.3f} at threshold {best_thresh}. Current threshold 1.10 yields F1={[r['f1'] for r in fp_fn_analysis if r['threshold']==1.10][0]:.3f}.",
        "expected_orb1_eligible_days": int(new_eligible),
        "expected_orb1_pct": round(100*new_eligible/n_days, 1)
    }
}

with open(OUT_DIR / "sprint095a_regime_audit.json", "w") as f:
    json.dump(results, f, indent=2)

# Save daily data for chart generation
daily.to_csv(OUT_DIR / "sprint095a_daily.csv", index=False)

print("\n=== REGIME AUDIT COMPLETE ===")
print(f"Current ORB-1 eligible: {orb_094b} days ({100*orb_094b/n_days:.1f}%)")
print(f"Optimal threshold: {best_thresh} → {new_eligible} days ({100*new_eligible/n_days:.1f}%)")
print(f"Recommendation: {results['recommendation']['action']}")
print("Results saved to sprint095a_regime_audit.json")
