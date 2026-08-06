# DARWIN-SWEEP-001 — Pre-Registration Artefact

**Status:** PRE-REGISTERED  
**Registered:** 2026-08-06 (before any data examination)  
**Experiment ID:** DARWIN-SWEEP-001  
**Branch:** sprint/darwin-sweep001-validation  
**Research family:** SWEEP (Liquidity Sweep + Reclaim)

---

## Behavioural Observation

Price occasionally moves beyond a prior session high or low by a small amount (sweeping the level), then closes back inside the prior range within 1–2 bars. This pattern is consistent with a **stop-hunt / liquidity grab** mechanism: resting stop orders above session highs or below session lows are triggered, providing liquidity for institutional participants who then reverse direction.

If this mechanism is real and consistent, the reclaim bar (the bar that closes back inside the range) should mark the beginning of a mean-reversion move that produces a positive edge.

---

## Hypothesis

> When MNQ 5m price wicks beyond a prior session high or low by ≤ 0.5 × ATR14 and then closes back inside the prior range on the same or the next bar, entering in the direction of the reclaim (i.e., against the sweep direction) produces a positive mean-reversion edge after transaction costs.

---

## Pre-Registered Parameters (frozen before data examination)

### Session high/low definition
- **Prior session:** The most recent completed RTH session (13:30–20:00 UTC)
- **Session high:** Highest high of the prior RTH session
- **Session low:** Lowest low of the prior RTH session
- **Lookback:** 1 prior session only (not multi-session)

### Sweep definition
- **Sweep high:** Current bar high > prior session high AND current bar high ≤ prior session high + 0.5 × ATR14
- **Sweep low:** Current bar low < prior session low AND current bar low ≥ prior session low − 0.5 × ATR14
- **Sweep tolerance variants (pre-registered):** 0.3×, 0.5×, 0.75× ATR14

### Reclaim confirmation
- **Reclaim:** Current bar close is back inside the prior session range (close < prior session high for sweep-high; close > prior session low for sweep-low)
- **Reclaim window:** Same bar as sweep OR next bar (both tested separately as Entry A and Entry B)

### Entry models
- **Entry A:** Close of the reclaim bar (immediate)
- **Entry B:** Open of the bar after reclaim confirmation

### Exit models (all four tested, none selected post-hoc)
- **Exit 1:** Fixed 5-bar hold (25 minutes)
- **Exit 2:** Fixed 15-bar hold (75 minutes)
- **Exit 3:** Close of 30m bar containing entry
- **Exit 4:** Close of 60m bar containing entry

### Direction
- **Sweep-high signal → SHORT** (price swept above, reclaimed below → fade the sweep)
- **Sweep-low signal → LONG** (price swept below, reclaimed above → fade the sweep)

### Cost model
- **BASE:** 2.47 points round-trip
- **STRESSED:** 3.09 points (×1.25)
- **SEVERE:** 3.71 points (×1.50)

### Subgroup splits (all pre-registered)
- Direction: LONG (sweep-low) / SHORT (sweep-high)
- Session: RTH / ETH (sweep occurring in RTH vs ETH)
- Time of day: Early RTH (13:30–15:30 UTC) / Mid RTH (15:30–18:30 UTC) / Late RTH (18:30–20:00 UTC)
- Year: 2019–2026

### Statistical tests
- Two-tailed t-test on mean net return per trade
- BH-FDR correction across all subgroups (q=0.05)
- Bootstrap 95% CI (1,000 resamples — reduced for efficiency)
- Neighbourhood check: ±0.1× ATR tolerance variants

### Chronological partitions (no look-ahead)
- DISCOVERY: 2019-05-06 to 2023-12-31
- VALIDATION: 2024-01-01 to 2025-06-30
- HOLDOUT: 2025-07-01 to 2026-07-20

---

## Success Criteria (pre-registered)

A result is classified as **PROMISING** only if ALL of:
1. Mean net return > 0 after BASE cost in DISCOVERY
2. p-value < 0.05 (BH-FDR corrected) in DISCOVERY
3. Mean net return > 0 after BASE cost in VALIDATION
4. p-value < 0.10 in VALIDATION
5. Win rate > 50% in both DISCOVERY and VALIDATION
6. Result holds in at least 2 of 3 tolerance variants (neighbourhood check)
7. Not driven by a single year or single session

A result is **NEGATIVE_EDGE** if mean net return < 0 after BASE cost in DISCOVERY with p < 0.05.

All other results are **INCONCLUSIVE**.

---

## Competing Explanations (pre-registered, per DARWIN doctrine step 6)

1. **Stop-hunt mechanism is real and consistent:** Institutional participants systematically hunt retail stops above session highs and below session lows, then reverse. The reclaim marks the exhaustion of the sweep and the beginning of a directional move.
2. **The pattern is noise:** Sweeps occur randomly and the reclaim is coincidental. The apparent reversal is just mean reversion to the session range that would occur regardless of the sweep.
3. **Regime-dependent:** The sweep-reclaim edge only exists in low-volatility, range-bound sessions. In trending sessions, the sweep is a genuine breakout and continuation follows.

---

## Falsification Criteria (pre-registered)

- If win rate < 50% in DISCOVERY → reject immediately
- If result only holds for one tolerance variant → reject as parameter-sensitive
- If result only holds in one session type or one year → reject as regime-specific
- If VALIDATION partition is negative → reject even if DISCOVERY is positive
- If sample size < 200 signals in DISCOVERY → classify as INSUFFICIENT_SAMPLE

---

## Authority Boundaries

- DARWIN_DECISION_AUTHORITY: DISABLED
- DARWIN_EXECUTION_AUTHORITY: DISABLED
- No paper trades, no live trades
- No main merge without Phil's written approval

---

*This artefact was written and committed before any data was examined.*
