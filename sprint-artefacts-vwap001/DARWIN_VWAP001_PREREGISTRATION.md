# DARWIN-VWAP-001 — Pre-Registration Artefact

**Status:** PRE-REGISTERED  
**Registered:** 2026-08-06 (before any data examination)  
**Experiment ID:** DARWIN-VWAP-001  
**Branch:** sprint/darwin-vwap001-validation  
**Research family:** VWAP (VWAP Deviation + Reclaim)

---

## Behavioural Observation

VWAP (Volume Weighted Average Price) is widely used by institutional participants as a daily fair-value anchor. When price deviates significantly from VWAP and then closes back toward it, this may indicate that the deviation was temporary and that institutional order flow is pulling price back to fair value.

Unlike session high/low levels (which are static), VWAP is dynamic and volume-weighted, making it a more meaningful institutional reference.

---

## Hypothesis

> When MNQ 5m price closes more than 1.5 × ATR14 from VWAP (extended deviation), and then closes within 0.5 × ATR14 of VWAP on the next bar (VWAP reclaim), entering in the direction of the reclaim (toward VWAP) produces a positive mean-reversion edge after transaction costs.

---

## Pre-Registered Parameters

### Signal definition
- **Extended deviation:** |close − vwap| > 1.5 × ATR14 on bar i
- **VWAP reclaim:** |close − vwap| < 0.5 × ATR14 on bar i+1
- **Direction:** If bar i close > vwap → SHORT (price was above, reclaiming down); if bar i close < vwap → LONG (price was below, reclaiming up)
- **Deviation threshold variants:** 1.0×, 1.5×, 2.0× ATR14 (pre-registered)
- **Reclaim threshold variants:** 0.5× ATR14 (single, pre-registered)
- **Warmup:** 50 bars minimum

### Entry models
- **Entry A:** Close of reclaim bar (bar i+1)
- **Entry B:** Open of bar i+2

### Exit models
- **Exit 1:** Fixed 5-bar hold
- **Exit 2:** Fixed 15-bar hold

### Cost model
- **BASE:** 2.47 pts | **STRESSED:** 3.09 pts | **SEVERE:** 3.71 pts

### Subgroup splits
- Direction: LONG / SHORT
- Session: RTH / ETH
- Year: 2019–2026
- Partition: DISCOVERY (to 2024-01-01) / VALIDATION (to 2025-07-01) / HOLDOUT

### Statistical tests
- Two-tailed t-test, BH-FDR (q=0.05), Bootstrap CI (1,000 resamples)

### Success criteria
- Mean net > 0 in DISCOVERY (p < 0.05) AND VALIDATION (p < 0.10)
- Win rate > 50% in both partitions
- Holds across ≥ 2 of 3 deviation threshold variants

---

## Authority Boundaries
- DARWIN_EXECUTION_AUTHORITY: DISABLED
- No paper/live trades, no main merge without Phil's approval

*Written and committed before any data was examined.*
