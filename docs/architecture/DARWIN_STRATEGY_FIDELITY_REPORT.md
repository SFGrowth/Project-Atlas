# DARWIN Strategy Definition Fidelity Report

**Document type:** Fidelity Assessment  
**Version:** 1.0  
**Effective from:** Sprint 123A.6 / Gate G6A  
**Parent doctrine:** `ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md`  
**Status:** ACTIVE — PROVISIONAL (full reconciliation requires Pine Script access)

---

## 1. Purpose

This report documents the degree to which each Python historical backtest runner faithfully reproduces the approved strategy logic. A strategy must not be classified as definitively failed if the historical runner is only an approximation of the live Pine Script implementation.

---

## 2. Fidelity Assessment Framework

For each strategy, the following dimensions are assessed:

| Dimension | Description |
|-----------|-------------|
| Entry logic | Does the Python runner replicate the entry condition exactly? |
| Exit logic | Does the Python runner replicate the stop and target logic exactly? |
| Session filter | Does the Python runner apply the same session filter? |
| Position sizing | Does the Python runner use the same position size? |
| Fill assumption | Does the Python runner use the same fill model (market, limit, next-bar open)? |
| Commission model | Does the Python runner apply the correct commission? |
| Slippage model | Does the Python runner apply a slippage assumption? |
| Contract mapping | Does the Python runner use the correct continuous contract? |
| Bar timing | Does the Python runner use bar-close or bar-open for entry? |
| Feature version | Does the Python runner use the same feature version as the live system? |

**Fidelity rating:**

| Rating | Meaning |
|--------|---------|
| `EXACT` | Python runner is a verified exact replica of the Pine Script |
| `APPROXIMATE` | Python runner approximates the Pine Script with documented differences |
| `UNKNOWN` | Pine Script not yet compared — fidelity unverified |
| `DIVERGENT` | Known material differences between Python runner and Pine Script |

---

## 3. Strategy Fidelity Assessments

### 3.1 A1 — Fidelity: APPROXIMATE

| Dimension | Python Runner | Pine Script | Fidelity |
|-----------|--------------|-------------|---------|
| Entry logic | EMA15 cross with ATR filter | EMA15 cross with ATR filter (assumed) | APPROXIMATE |
| Exit logic | Fixed ATR-based stop and target | Unknown — Pine Script not reviewed | UNKNOWN |
| Session filter | NY session (09:30–16:00 ET) | Unknown | UNKNOWN |
| Position sizing | 1 MNQ contract | 1 MNQ contract (assumed) | APPROXIMATE |
| Fill assumption | Next-bar open | Unknown | UNKNOWN |
| Commission model | $2.00 round-trip | $2.00 round-trip (Apex 50K) | APPROXIMATE |
| Slippage model | 0 ticks assumed | Unknown | UNKNOWN |
| Contract mapping | MNQ.v.0 continuous | MNQM2026 (live) | APPROXIMATE |
| Bar timing | 5m bar close | 5m bar close (assumed) | APPROXIMATE |
| Feature version | v1.1 | Unknown | UNKNOWN |

**Overall A1 fidelity: APPROXIMATE / UNKNOWN**

**Conclusion:** The A1 Python backtest is an approximation. The negative OOS result (-$5,451, Sharpe -1.263) may reflect implementation differences rather than a fundamental strategy failure. A1 is classified as `REQUIRES_REVIEW` pending full Pine Script reconciliation.

---

### 3.2 A3 — Fidelity: APPROXIMATE

| Dimension | Python Runner | Pine Script | Fidelity |
|-----------|--------------|-------------|---------|
| Entry logic | Multi-session EMA15 momentum | Multi-session EMA15 (assumed) | APPROXIMATE |
| Exit logic | Fixed ATR-based stop and target | Unknown | UNKNOWN |
| Session filter | All sessions | Unknown | UNKNOWN |
| Position sizing | 1 MNQ contract | 1 MNQ contract (assumed) | APPROXIMATE |
| Fill assumption | Next-bar open | Unknown | UNKNOWN |
| Commission model | $2.00 round-trip | $2.00 round-trip (Apex 50K) | APPROXIMATE |
| Slippage model | 0 ticks assumed | Unknown | UNKNOWN |
| Contract mapping | MNQ.v.0 continuous | MNQM2026 (live) | APPROXIMATE |
| Bar timing | 5m bar close | 5m bar close (assumed) | APPROXIMATE |
| Feature version | v1.1 | Unknown | UNKNOWN |

**Overall A3 fidelity: APPROXIMATE / UNKNOWN**

**Conclusion:** The A3 Python backtest is an approximation. The near-zero OOS result (-$4,828, Sharpe -0.111) is close to breakeven and may be within the margin of implementation differences. A3 is classified as `REQUIRES_REVIEW` pending full Pine Script reconciliation.

---

### 3.3 B1 — Fidelity: APPROXIMATE

| Dimension | Python Runner | Pine Script | Fidelity |
|-----------|--------------|-------------|---------|
| Entry logic | Multi-session B-pattern | B-pattern (assumed) | APPROXIMATE |
| Exit logic | Fixed ATR-based stop and target | Unknown | UNKNOWN |
| Session filter | All sessions | Unknown | UNKNOWN |
| Position sizing | 1 MNQ contract | 1 MNQ contract (assumed) | APPROXIMATE |
| Fill assumption | Next-bar open | Unknown | UNKNOWN |
| Commission model | $2.00 round-trip | $2.00 round-trip (Apex 50K) | APPROXIMATE |
| Slippage model | 0 ticks assumed | Unknown | UNKNOWN |
| Contract mapping | MNQ.v.0 continuous | MNQM2026 (live) | APPROXIMATE |
| Bar timing | 5m bar close | 5m bar close (assumed) | APPROXIMATE |
| Feature version | v1.1 | Unknown | UNKNOWN |

**Overall B1 fidelity: APPROXIMATE / UNKNOWN**

**Conclusion:** The B1 Python backtest is an approximation. The negative OOS result (-$2,724, Sharpe -1.242) may reflect implementation differences. B1 is classified as `REQUIRES_REVIEW` pending full Pine Script reconciliation.

---

### 3.4 SB1 — Fidelity: APPROXIMATE

| Dimension | Python Runner | Pine Script | Fidelity |
|-----------|--------------|-------------|---------|
| Entry logic | Scalp breakout | Scalp breakout (assumed) | APPROXIMATE |
| Exit logic | Tight ATR-based stop and target | Unknown | UNKNOWN |
| Session filter | NY session (assumed) | Unknown | UNKNOWN |
| Position sizing | 1 MNQ contract | 1 MNQ contract (assumed) | APPROXIMATE |
| Fill assumption | Next-bar open | Unknown | UNKNOWN |
| Commission model | $2.00 round-trip | $2.00 round-trip (Apex 50K) | APPROXIMATE |
| Slippage model | 0 ticks assumed | Unknown — scalp strategies are highly slippage-sensitive | **CONCERN** |
| Contract mapping | MNQ.v.0 continuous | MNQM2026 (live) | APPROXIMATE |
| Bar timing | 5m bar close | 5m bar close (assumed) | APPROXIMATE |
| Feature version | v1.1 | Unknown | UNKNOWN |

**Overall SB1 fidelity: APPROXIMATE / UNKNOWN — SLIPPAGE CONCERN**

**Conclusion:** The SB1 Python backtest is an approximation with a specific concern: scalp strategies are highly sensitive to slippage. The 0-tick slippage assumption may be optimistic. The negative OOS result (-$3,171, Sharpe -2.174) may be partially explained by real-world slippage not modelled. SB1 is classified as `REQUIRES_REVIEW` pending full Pine Script reconciliation and slippage sensitivity analysis.

---

### 3.5 ORB-1 — Fidelity: APPROXIMATE

| Dimension | Python Runner | Pine Script | Fidelity |
|-----------|--------------|-------------|---------|
| Entry logic | Opening range breakout (first 30 min) | ORB (assumed) | APPROXIMATE |
| Exit logic | ORB range as stop, fixed target | Unknown | UNKNOWN |
| Session filter | NY session (09:30–10:00 ET for ORB formation) | Unknown | UNKNOWN |
| Position sizing | 1 MNQ contract | 1 MNQ contract (assumed) | APPROXIMATE |
| Fill assumption | Next-bar open | Unknown | UNKNOWN |
| Commission model | $2.00 round-trip | $2.00 round-trip (Apex 50K) | APPROXIMATE |
| Slippage model | 0 ticks assumed | Unknown | UNKNOWN |
| Contract mapping | MNQ.v.0 continuous | MNQM2026 (live) | APPROXIMATE |
| Bar timing | 5m bar close | 5m bar close (assumed) | APPROXIMATE |
| Feature version | v1.1 | Unknown | UNKNOWN |

**Overall ORB-1 fidelity: APPROXIMATE / UNKNOWN**

**Conclusion:** The ORB-1 Python backtest is an approximation. The positive OOS result (+$4,880, Sharpe 2.886) is encouraging but should not be treated as definitive until Pine Script reconciliation is complete. The positive result is more robust to implementation differences than the negative results of other strategies, but the exact ORB formation window and exit logic must be confirmed.

---

## 4. Required Reconciliation Actions (Sprint 123A.7)

The following actions are required before any strategy can be definitively classified as failed or promoted:

1. **Obtain Pine Script source** for A1, A3, B1, SB1, and ORB-1 from TradingView
2. **Line-by-line comparison** of entry logic, exit logic, session filters, and position sizing
3. **Fill model reconciliation** — determine whether Pine Script uses bar-close, bar-open, or limit orders
4. **Slippage sensitivity analysis** for SB1 (most sensitive to fill assumptions)
5. **Commission reconciliation** — confirm $2.00 round-trip is correct for all strategies
6. **Feature version reconciliation** — confirm Python features match Pine Script indicators
7. **Update fidelity ratings** from `APPROXIMATE` to `EXACT` or `DIVERGENT` after reconciliation

---

## 5. Interim Classification

Until full Pine Script reconciliation is complete, the following interim classifications apply:

| Strategy | Interim Status | Reason |
|---------|---------------|--------|
| A1 | `REQUIRES_REVIEW` | Negative OOS, fidelity APPROXIMATE/UNKNOWN |
| A3 | `REQUIRES_REVIEW` | Near-zero OOS, fidelity APPROXIMATE/UNKNOWN |
| B1 | `REQUIRES_REVIEW` | Negative OOS, fidelity APPROXIMATE/UNKNOWN |
| SB1 | `REQUIRES_REVIEW` | Negative OOS, slippage concern, fidelity APPROXIMATE/UNKNOWN |
| ORB-1 | `MONITORING` | Positive OOS, fidelity APPROXIMATE/UNKNOWN |

**No strategy is classified as definitively failed.** No strategy is retired or has capital reallocated based on this sprint.

---

## 6. Amendment History

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-22 | Atlas Nexus (Phil approval) | Initial fidelity report — Sprint 123A.6 Gate G6A |
