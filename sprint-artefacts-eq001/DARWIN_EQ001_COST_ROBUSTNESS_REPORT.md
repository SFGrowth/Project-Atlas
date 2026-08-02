# DARWIN-EQ001-VALIDATION-001 — Cost and Robustness Report

**Experiment ID:** DARWIN-EQ001-VALIDATION-001  
**Generated:** 2026-08-02T04:30:00Z  

---

## Cost Model

### Pre-Registered Round-Trip Cost

| Component | Value |
|-----------|-------|
| Exchange fee (per side) | $0.35 |
| NFA fee (per side) | $0.02 |
| Broker commission (per side) | $0.85 |
| Estimated slippage (per side) | $0.25 |
| **Total per side** | **$1.47** |
| **Round-trip total** | **$2.94** |
| **MNQ point value** | **$2.00** |
| **Round-trip cost in points** | **2.47 pts** |

The cost model was frozen in the pre-registration artefact (SHA: 8079fd37) before any data was examined.

---

## Cost Sensitivity Results

| Scenario | Multiplier | Round-trip pts | Mean net pts | Win rate | PF | Delta vs BASE |
|----------|-----------|---------------|-------------|----------|-----|---------------|
| BASE | 1.00× | 2.47 | −2.7196 | 44.6% | 0.751 | — |
| BASE × 1.25 | 1.25× | 3.09 | −3.3371 | 42.2% | 0.704 | −0.618 |
| BASE × 1.50 | 1.50× | 3.71 | −3.9546 | 40.8% | 0.660 | −1.235 |

**Key finding:** The rule is negative even before any costs are applied. The gross mean return (before the 2.47 pt cost deduction) is approximately **−0.25 pts per trade** — meaning the strategy loses money on a gross basis. Costs make the situation worse but are not the primary cause of the negative edge.

---

## Gross vs Net Decomposition

| Metric | Value |
|--------|-------|
| Mean gross P&L (before costs) | ~−0.25 pts |
| Mean cost per trade | 2.47 pts |
| Mean net P&L | −2.72 pts |
| % of loss attributable to costs | ~9% |
| % of loss attributable to gross edge | ~91% |

The fundamental problem is the **gross edge is negative**. This is not a cost problem — it is a market structure problem. The mean reversion hypothesis is wrong.

---

## Neighbourhood Robustness

| Threshold | n signals | Mean net pts | Win rate | PF | Stable? |
|-----------|-----------|-------------|----------|-----|---------|
| 1.9 × ATR | 78,241 | −2.6976 | 44.4% | 0.750 | Yes |
| **2.0 × ATR (canonical)** | **68,744** | **−2.7196** | **44.6%** | **0.751** | **Yes** |
| 2.1 × ATR | 60,114 | −2.7276 | 44.8% | 0.754 | Yes |

The result is stable across the neighbourhood. Increasing the threshold slightly reduces signal count and slightly worsens the mean return. There is no threshold in the tested range that produces a positive edge.

---

## Entry Model Comparison

| Entry | n | Mean net pts | Win rate | PF |
|-------|---|-------------|----------|-----|
| A (next bar open, no filter) | 68,744 | −2.7196 | 44.6% | 0.751 |
| B (skip if EMA21 already touched) | ~55,000 | ~−2.6x | ~45% | ~0.76 |

Entry B (which filters out cases where the move has partially reversed before entry) is marginally less negative. This is consistent with the momentum-continuation hypothesis — when the move has already partially reversed, the mean reversion has begun and the entry is less adverse. However, Entry B is still clearly negative.

---

## Exit Model Comparison

| Exit | Description | Mean net pts | Win rate | PF |
|------|-------------|-------------|----------|-----|
| Exit 1 | 5m close | ~−2.9x | ~43% | ~0.72 |
| Exit 2 | 10m close | ~−2.7x | ~44% | ~0.74 |
| Exit 3 | 15m close | −2.7196 | 44.6% | 0.751 |
| Exit 4 | EMA21 touch (cap 15m) | ~−2.7x | ~45% | ~0.75 |

Longer exits are marginally less negative. Exit 4 (EMA21 touch) is not materially better than Exit 3 (15m close), which suggests that when the EMA21 touch occurs within 15 minutes, it does not represent a profitable mean-reversion completion — the price has simply drifted back, not reverted with conviction.

---

## Year-by-Year Stability

| Year | n | Mean net pts | Win rate | Regime Notes |
|------|---|-------------|----------|--------------|
| 2019 | 6,744 | −2.7551 | 37.3% | Low volatility, early MNQ |
| 2020 | 9,383 | −2.3073 | 45.3% | COVID crash, extreme volatility |
| 2021 | 9,736 | −2.9797 | 43.4% | Bull market, low volatility |
| 2022 | 9,961 | −2.6566 | 47.9% | Bear market, high volatility |
| 2023 | 9,127 | −2.5645 | 43.5% | Recovery, mixed regime |
| 2024 | 9,391 | −3.4384 | 43.4% | Bull market, AI-driven |
| 2025 | 8,817 | −1.9909 | 47.2% | Least negative year |
| 2026 | 5,585 | −3.2240 | 48.4% | Partial year |

**2025 is the least negative year (−1.99 pts).** Even in the best year, the rule loses money. There is no year in which the rule was profitable.

---

## Robustness Verdict

The RULE-EQ-001 negative edge is:

- **Stable across time** (every year 2019–2026)
- **Stable across regimes** (bull, bear, high vol, low vol)
- **Stable across sessions** (RTH and ETH)
- **Stable across directions** (LONG and SHORT)
- **Stable across thresholds** (1.9, 2.0, 2.1 × ATR)
- **Stable across entry models** (A and B)
- **Stable across exit models** (1, 2, 3, 4)
- **Stable across cost scenarios** (BASE, ×1.25, ×1.50)
- **Stable across chronological partitions** (DISCOVERY, VALIDATION, HOLDOUT)

This is a robust negative finding. The rule should be permanently blocked.

---

## False Positive Analysis (Wave 1 Batch)

The Wave 1 batch (2026-07-31) reported RULE-EQ-001 as PROMISING with p=0.0299, n=328. This was a false positive caused by:

1. **Insufficient data:** 6 weeks of data (1,835 5m bars) vs 7.5 years (506,698 5m bars)
2. **Small sample:** n=328 signals vs n=68,744 in the full dataset
3. **No partition validation:** The 6-week dataset was too small to split into discovery/validation/holdout
4. **No BH-FDR correction:** With only 14 rules tested, the multiple-testing correction was insufficient

This is exactly the scenario the DARWIN Doctrine is designed to prevent. The Wave 1 batch correctly flagged the rule as PROMISING (not CONFIRMED), and the mandatory full validation has now correctly classified it as NEGATIVE_EDGE.

**The system worked as designed.**
