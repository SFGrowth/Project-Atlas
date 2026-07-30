# STRAT-9EMA-002 — 9EMA Crossover + VWAP Filter Baseline
## Experiment Contract (Pre-Registration)

**Sprint:** 123A.14  
**Gate:** G14  
**Status:** PRE_REGISTERED  
**Pre-registration date:** 2026-07-30  
**Results locked after:** First simulation run  

---

## 1. Hypothesis

The 9EMA crossover strategy (STRAT-9EMA-001) produces a slight positive bias (+$3.54/trade, PF=1.066) but fails all statistical gates. Adding a VWAP location filter — requiring the crossover to occur on the correct side of the session VWAP — will improve signal quality by filtering out counter-trend crossovers that occur in unfavourable price locations.

**Pre-registered question:** Does adding a VWAP location filter to the 9EMA crossover strategy produce a statistically supported edge (bootstrap 95% CI lower bound > −$10 AND permutation p < 0.10)?

---

## 2. Configurations (Pre-Registered)

Four configurations are tested. All share the same base rules as STRAT-9EMA-001. The VWAP filter is the only variable.

| Config | Name | VWAP Filter | 1H Trend | ADX Threshold | Target |
|--------|------|-------------|----------|---------------|--------|
| A | VWAP_BASIC | price > VWAP (long) / price < VWAP (short) | None | ADX > 20 | 2R |
| B | VWAP_PROXIMITY | price > VWAP AND within 1.0 ATR of VWAP | None | ADX > 20 | 2R |
| C | VWAP_1H_TREND | price > VWAP AND price > 1H EMA50 | Yes (1H EMA50) | ADX > 20 | 2R |
| D | VWAP_STRICT_ADX | price > VWAP AND price > 1H EMA50 | Yes (1H EMA50) | ADX > 25 | 2R |

**Rationale for 2R target:** EXIT_XO was the best variant in STRAT-9EMA-001 but is harder to analyse. 2R provides a clean, pre-specified target that avoids the ambiguity of opposite crossover timing.

---

## 3. Base Strategy Rules (Unchanged from STRAT-9EMA-001)

- **Timeframe:** 15-minute bars
- **EMAs:** 9, 21, 50 (computed on 15m)
- **Long entry:** EMA9 crosses above EMA21, close > EMA50 (15m)
- **Short entry:** EMA9 crosses below EMA21, close < EMA50 (15m)
- **Entry timing:** Next bar open after crossover candle closes
- **Stop:** Low of crossover candle (long) / High of crossover candle (short)
- **Session:** RTH only (13:30–20:00 UTC)
- **Execution costs:** 2 ticks adverse slippage + $1.24 RT commission

---

## 4. VWAP Filter Definitions (Pre-Registered)

- **VWAP:** Session VWAP, reset at 13:30 UTC (NY open), computed from 15m bars
- **Config A:** `close > vwap` (long) / `close < vwap` (short) at signal bar
- **Config B:** `close > vwap` AND `abs(close - vwap) <= 1.0 * atr14` (long) / mirror (short)
- **Config C:** `close > vwap` AND `close > ema50_1h` (long) / mirror (short)
- **Config D:** `close > vwap` AND `close > ema50_1h` AND `adx14 > 25` (long) / mirror (short)

---

## 5. Statistical Gates (Pre-Registered)

All gates applied to the training period (2019-05-06 to 2025-04-30):

| Gate | Threshold | Required |
|------|-----------|----------|
| G1: Bootstrap 95% CI lower bound | > −$10.00/trade | YES |
| G2: Permutation p-value | < 0.10 | YES |
| G3: Validation expectancy | > $0.00/trade | YES |
| G4: Minimum trade count | ≥ 50 trades | YES |

**Validation period:** 2025-05-01 to 2026-07-20  
**Train/val split:** 60/40 chronological  

---

## 6. Locked Inputs

| Input | Value | SHA256 |
|-------|-------|--------|
| 5m canonical dataset | mnq_5m_full_2019_2026.parquet | 17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe |
| STRAT-9EMA-001 baseline | EXIT_XO exp=+$3.54, PF=1.066, CI=[−7.22,+11.46] | (from STRAT_9EMA_001_PRIMARY_RESULTS.json) |

---

## 7. Authority

```
DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
PARAMETER_CHANGED_AFTER_PREREGISTRATION: FALSE
LOOKAHEAD_VIOLATIONS: 0
FUTURE_BAR_USES: 0
```

---

## 8. Failure Conditions

This experiment will be classified as RESEARCH_FAIL if:
- No configuration passes all 4 statistical gates
- Best configuration bootstrap CI lower bound ≤ −$10.00
- Best configuration permutation p ≥ 0.10
- Best configuration validation expectancy ≤ $0.00

This experiment will be classified as PROMISING if:
- At least one configuration passes G1 (CI lower > −$10) but fails G2 (p ≥ 0.10)
- Validation expectancy is positive

This experiment will be classified as SUPPORTED if:
- At least one configuration passes ALL 4 gates
- The result is stable across the train/val split
