# DARWIN-MOM-EQ-001 — Pre-Registration Artefact

**Status:** PRE-REGISTERED  
**Registered:** 2026-08-06 (before any data examination)  
**Experiment ID:** DARWIN-MOM-EQ-001  
**Branch:** sprint/darwin-mom-eq001-validation  
**Derived from:** DARWIN-EQ001-VALIDATION-001 (negative edge confirmed)

---

## Behavioural Observation

DARWIN-EQ001-VALIDATION-001 confirmed that **entering against a 2+ ATR EMA21 extension on MNQ 5m bars is a negative edge** with a win rate of 44.6% across 68,744 signals and 7.5 years (2019–2026).

This implies that **entering in the direction of the extension** wins approximately 55.4% of the time — the complement of the confirmed loser.

This is not a new hypothesis invented from scratch. It is the **logical inverse of a confirmed negative edge**, which makes it a higher-priority candidate than a random new idea.

---

## Hypothesis

> When MNQ 5m price closes 2+ ATR(14) above or below EMA21, entering **in the direction of the extension** (momentum continuation) produces a positive edge after transaction costs.

---

## Pre-Registered Parameters (frozen before data examination)

### Signal definition
- **Threshold:** Close ≥ EMA21 + 2.0 × ATR14 → LONG signal; Close ≤ EMA21 − 2.0 × ATR14 → SHORT signal
- **Threshold variants tested:** 1.9×, 2.0×, 2.1× ATR14 (pre-registered, not selected post-hoc)
- **Timeframe:** 5m bars
- **Warmup:** 50 bars minimum before first signal

### Entry models (both tested, neither selected post-hoc)
- **Entry A:** Market-on-close of signal bar (immediate)
- **Entry B:** Next bar open

### Exit models (all four tested, none selected post-hoc)
- **Exit 1:** Fixed 5-bar hold (25 minutes)
- **Exit 2:** Fixed 15-bar hold (75 minutes)
- **Exit 3:** Close of 15m bar containing signal (resampled)
- **Exit 4:** Close of 60m bar containing signal (resampled)

### Cost model
- **BASE:** 2.47 points round-trip (matching EQ-001 validation)
- **STRESSED:** 2.47 × 1.25 = 3.09 points
- **SEVERE:** 2.47 × 1.50 = 3.71 points

### Subgroup splits (all pre-registered)
- Direction: LONG / SHORT
- Session: RTH (13:30–20:00 UTC) / ETH (all other hours)
- Trend: WITH EMA trend (ema_bullish/ema_bearish flag) / AGAINST EMA trend
- Year: 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026

### Statistical tests
- Two-tailed t-test on mean net return per trade
- BH-FDR correction across all subgroups (q=0.05)
- Bootstrap 95% CI (10,000 resamples)
- Neighbourhood check: ±0.1× ATR threshold variants

### Chronological partitions (no look-ahead)
- DISCOVERY: 2019-01-01 to 2023-12-31 (60%)
- VALIDATION: 2024-01-01 to 2025-06-30 (20%)
- HOLDOUT: 2025-07-01 to 2026-07-30 (20%)

---

## Success Criteria (pre-registered)

A result is classified as **PROMISING** only if ALL of:
1. Mean net return > 0 after BASE cost in DISCOVERY partition
2. p-value < 0.05 (BH-FDR corrected) in DISCOVERY partition
3. Mean net return > 0 after BASE cost in VALIDATION partition
4. p-value < 0.10 in VALIDATION partition
5. Win rate > 50% in both DISCOVERY and VALIDATION
6. Result is not dependent on a single year, session, or direction
7. Neighbourhood check: result holds at 1.9× and 2.1× threshold variants

A result is classified as **NEGATIVE_EDGE** if mean net return < 0 after BASE cost in DISCOVERY with p < 0.05.

All other results are **INCONCLUSIVE**.

---

## Competing Explanations (pre-registered, per DARWIN doctrine step 6)

1. **Momentum continuation is real:** Extreme extensions are driven by genuine order flow imbalance that persists for 1–3 bars before exhaustion. The continuation wins more than it loses.
2. **The complement effect is spurious:** The EQ-001 44.6% win rate is not stable enough to imply a 55.4% win rate for the opposite direction. The true rate may be near 50% for both.
3. **Regime-dependent:** Momentum continuation only works in trending regimes (high ADX, clear EMA structure). In choppy regimes it reverts, and the aggregate is near 50%.

---

## Falsification Criteria (pre-registered)

- If win rate < 50% in DISCOVERY → reject immediately
- If result is only positive in one year or one session → reject as regime-specific artefact
- If neighbourhood check fails (only works at exactly 2.0×) → reject as parameter-sensitive
- If VALIDATION partition is negative → reject even if DISCOVERY is positive

---

## Authority Boundaries

- DARWIN_DECISION_AUTHORITY: DISABLED
- DARWIN_EXECUTION_AUTHORITY: DISABLED
- No paper trades, no live trades
- No main merge without Phil's written approval

---

*This artefact was written and committed before any data was examined. The pre-registration SHA is the integrity anchor for this experiment.*
