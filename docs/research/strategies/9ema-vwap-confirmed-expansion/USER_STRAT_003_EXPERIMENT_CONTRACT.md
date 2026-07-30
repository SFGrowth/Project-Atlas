# USER-STRAT-003-EMA9-VWAP-CONFIRMED-EXPANSION
## Pre-Registration Contract — Sprint 123A.15

**PRE_REGISTRATION_STATUS: FROZEN**
**RESULTS_VISIBLE_AT_SIGNING: NO**
**DATE: 2026-07-30**
**SPRINT: 123A.15**

---

## 1. Parent Baseline

| Field | Value |
|---|---|
| Parent strategy | USER-STRAT-002-EMA9-VWAP-MOMENTUM |
| Parent classification | REJECTED |
| Parent filled trades | 57,687 |
| Parent trades/week | 153.42 |
| Parent one-bar exit % | 67.2% |
| Parent win rate | 11.62% |
| Parent profit factor | 0.3415 |
| Parent expectancy | −$7.3831 |
| Parent validation expectancy | −$9.4446 |
| Parent failure mechanism | EXCESSIVE_ENTRY_FREQUENCY_AND_IMMEDIATE_EMA_RETEST |

---

## 2. Research Hypothesis

The parent strategy failed because it treated ordinary EMA/VWAP alignment as a momentum breakout. Requiring:
- structural breakout above/below the prior 6-bar range
- positive indicator slope (EMA9 and VWAP both sloping in direction)
- stronger signal candle (body ≥ 50%, range 0.80–1.80 ATR)
- relative-volume confirmation (≥ 1.25× 20-bar SMA)
- controlled distance from EMA9 (0.15–0.75 ATR)
- one-bar continuation confirmation before entry
- close-back exit instead of intrabar EMA touch

may reduce false entries and improve expectancy after costs.

**Improvement over a rejected baseline does not automatically establish an edge.**

---

## 3. Strategy Identification

| Field | Value |
|---|---|
| STRATEGY_ID | USER-STRAT-003-EMA9-VWAP-CONFIRMED-EXPANSION |
| Market | MNQ futures |
| Timeframe | 5-minute bars |
| Data authority | Databento only |
| Primary historical period | 2019-05-06 through latest complete available MNQ session |

---

## 4. Dataset

| Field | Value |
|---|---|
| File | mnq_5m_full_2019_2026.parquet |
| SHA256 | 17206c6289589622a6bf0fc25b0f598752045c2e61a24d0896002f9bfda531fe |
| Total 5m bars | 508,903 |
| Date range | 2019-05-06 to 2026-07-20 |
| Source | Databento GLBX.MDP3 (downloaded Sprint 123A.14) |

---

## 5. Indicators (Pre-Registered)

| Indicator | Value |
|---|---|
| EMA_LENGTH | 9 |
| ATR_LENGTH | 14 |
| RELATIVE_VOLUME_LENGTH | 20 |
| BREAKOUT_LOOKBACK | 6 completed bars (signal bar excluded) |
| VWAP_TYPE | SESSION_VWAP |
| VWAP_PRICE_BASIS | TYPICAL_PRICE = (HIGH+LOW+CLOSE)/3 |
| PRIMARY_VWAP_RESET | CME_SESSION_RESET (18:00 ET / 23:00 UTC, Sunday–Friday) |
| SENSITIVITY_VWAP_RESET | NY_RTH_RESET (09:30 ET / 13:30 UTC, Monday–Friday) |
| EMA_SLOPE_LOOKBACK | 3 bars |
| VWAP_SLOPE_LOOKBACK | 3 bars |

**The VWAP reset convention is frozen before results. Do not select the better reset after seeing results.**

---

## 6. Long Signal (Canonical)

```
LONG_SIGNAL =
  CLOSE > EMA9
  AND EMA9 > VWAP
  AND EMA9 > EMA9[3]
  AND VWAP > VWAP[3]
  AND CLOSE > HIGHEST_HIGH(prior 6 completed bars)  [signal bar excluded]
  AND ABS(CLOSE-OPEN) / MAX(HIGH-LOW, MIN_TICK) >= 0.50
  AND (HIGH-LOW) / ATR14 >= 0.80
  AND (HIGH-LOW) / ATR14 <= 1.80
  AND (CLOSE-EMA9) / ATR14 >= 0.15
  AND (CLOSE-EMA9) / ATR14 <= 0.75
  AND VOLUME >= 1.25 * SMA(VOLUME, 20)
  AND no open position
  AND no prior qualifying long signal still active
```

---

## 7. Long Confirmation and Entry

- Confirmation bar = next completed 5m bar after signal bar
- Confirmation requires: low > EMA9, close > EMA9, close > VWAP, EMA9 > VWAP, bar trades above signal-bar high
- Entry trigger: signal-bar high + 1 tick
- If confirmation-bar open > trigger: fill at open
- Otherwise: fill at trigger + 2 ticks adverse slippage
- Cancel if: confirmation bar touches/falls below EMA9, closes below EMA9, EMA9 no longer > VWAP, fails to break signal-bar high, or confirmation bar expires without entry
- No delayed entry after the confirmation bar

---

## 8. Short Signal (Canonical)

```
SHORT_SIGNAL =
  CLOSE < EMA9
  AND EMA9 < VWAP
  AND EMA9 < EMA9[3]
  AND VWAP < VWAP[3]
  AND CLOSE < LOWEST_LOW(prior 6 completed bars)  [signal bar excluded]
  AND ABS(CLOSE-OPEN) / MAX(HIGH-LOW, MIN_TICK) >= 0.50
  AND (HIGH-LOW) / ATR14 >= 0.80
  AND (HIGH-LOW) / ATR14 <= 1.80
  AND (EMA9-CLOSE) / ATR14 >= 0.15
  AND (EMA9-CLOSE) / ATR14 <= 0.75
  AND VOLUME >= 1.25 * SMA(VOLUME, 20)
  AND no open position
  AND no prior qualifying short signal still active
```

---

## 9. Short Confirmation and Entry

- Confirmation bar = next completed 5m bar after signal bar
- Confirmation requires: high < EMA9, close < EMA9, close < VWAP, EMA9 < VWAP, bar trades below signal-bar low
- Entry trigger: signal-bar low − 1 tick
- If confirmation-bar open < trigger: fill at open
- Otherwise: fill at trigger − 2 ticks adverse slippage
- Cancel if: confirmation bar touches/rises above EMA9, closes above EMA9, EMA9 no longer < VWAP, fails to break signal-bar low, or confirmation bar expires without entry
- No delayed entry after the confirmation bar

---

## 10. Primary Exit

- **Long normal exit:** next bar open after a completed 5m bar closes below EMA9
- **Short normal exit:** next bar open after a completed 5m bar closes above EMA9
- Apply 2 ticks adverse slippage + $1.24 commission on exit

---

## 11. Emergency Stop

```
Long:
  STRUCTURAL_STOP = SIGNAL_BAR_LOW - 1_TICK
  ATR_STOP = ENTRY_PRICE - 1.25 * ATR14_AT_ENTRY
  LONG_STOP = MAX(STRUCTURAL_STOP, ATR_STOP)  [tighter = higher value]

Short:
  STRUCTURAL_STOP = SIGNAL_BAR_HIGH + 1_TICK
  ATR_STOP = ENTRY_PRICE + 1.25 * ATR14_AT_ENTRY
  SHORT_STOP = MIN(STRUCTURAL_STOP, ATR_STOP)  [tighter = lower value]
```

- Gap-through: exit at first available bar-open price
- Otherwise: fill at stop + 2 ticks adverse slippage

---

## 12. Re-Entry Rules

- No same-direction re-entry immediately after exit
- After long exit: long alignment must be lost at least once, then a completely new qualifying signal and confirmation sequence
- After short exit: short alignment must be lost at least once, then a completely new qualifying signal and confirmation sequence
- One position at a time, no pyramiding, no scaling in

---

## 13. Execution Model

| Parameter | Value |
|---|---|
| MNQ_TICK_SIZE | 0.25 |
| MNQ_TICK_VALUE | $0.50 |
| SLIPPAGE | 2 ticks adverse per round trip |
| COMMISSION | $1.24 round trip |
| ENTRY | CAUSAL_CONFIRMATION_BREAK |
| NORMAL_EXIT | NEXT_BAR_OPEN_AFTER_COMPLETED_EMA_CLOSE_BACK |
| EMERGENCY_STOP | INTRABAR_CAUSAL_STOP |
| GAP_FILL | FIRST_AVAILABLE_CAUSAL_PRICE |

---

## 14. Primary Configuration (Frozen)

```
STRAT003_PRIMARY:
  EMA=9
  ATR=14
  BREAKOUT_LOOKBACK=6
  BODY_MIN=0.50
  RANGE_MIN_ATR=0.80
  RANGE_MAX_ATR=1.80
  EMA_DISTANCE_MIN_ATR=0.15
  EMA_DISTANCE_MAX_ATR=0.75
  RELATIVE_VOLUME_MIN=1.25
  EMA_SLOPE_LOOKBACK=3
  VWAP_SLOPE_LOOKBACK=3
  CONFIRMATION_BARS=1
  EMERGENCY_STOP_ATR=1.25
```

**Do not modify these values after results are visible.**
**Do not test alternative parameter values in this experiment.**

---

## 15. Classification Rules (Pre-Registered)

| Classification | Criteria |
|---|---|
| SUPPORTED | expectancy > $0, PF > 1.10, validation exp > $0, bootstrap 95% CI lower bound > $0, permutation p < 0.05, stable walk-forward, no causality violations |
| PROMISING | expectancy > $0, validation exp > $0, PF > 1.0, but one or more statistical gates unconfirmed |
| INCONCLUSIVE | near break-even, mixed statistical evidence, or inadequate sample size |
| REJECTED | expectancy ≤ $0, validation exp ≤ $0, PF ≤ 1.0, or fails materially across periods |

**Do not use a negative CI threshold such as > −$10 to claim support.**

---

## 16. Authority Boundaries

```
DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
PAPER_TRADES_INITIATED: 0
STRATEGY_STATUS_CHANGES: 0
CAPITAL_REALLOCATIONS: 0
EXISTING_PINE_AUTOMATION_STATUS: UNCHANGED
```

---

## 17. Merge Gate

**Do not merge into main without Phil's written approval.**
