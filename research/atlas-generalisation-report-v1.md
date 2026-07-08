# Atlas Generalisation Report v1.0

**Date:** 2026-07-08  
**Sprint:** 041 — Cross-Market Generalisation (H-G001)  
**Author:** Atlas Research Framework

## 1. Executive Summary

Sprint 041 executed the most rigorous scientific test in the Atlas Framework to date. The objective was to determine whether the market behaviours validated on MNQ over the previous 40 sprints represent universal market truths or instrument-specific phenomena.

The entire frozen Atlas execution stack (Model A1, Model A3, and ARI v2.0) was deployed across six additional futures markets (NQ, ES, MES, YM, MYM, RTY) over an identical two-year period (July 2024 – July 2026). No parameter tuning or market-specific adjustments were permitted. Position sizing was standardised at $800 risk per trade.

### The Verdict: H-G001 is REJECTED.

**Atlas has not discovered universal market principles. Atlas has discovered highly specific behavioural characteristics of the Nasdaq 100 index.**

The execution models replicated successfully on the full-size NQ contract, but completely failed on the S&P 500 (ES/MES), Dow Jones (YM/MYM), and Russell 2000 (RTY). The edge Atlas has isolated is a function of Nasdaq volatility and structural dynamics, not general financial market behaviour.

---

## 2. Cross-Market Performance Data

The following table presents the performance of the frozen static portfolio (Model A1 + Model A3) across all tested markets.

| Market | Index | Trades | Profit Factor | Net P&L ($) | Max Drawdown ($) | RoMaD |
|---|---|---|---|---|---|---|
| **NQ** | Nasdaq 100 | 379 | **1.315** | **+$65,603** | -$14,326 | 4.58 |
| **MNQ** | Micro Nasdaq | 373 | **1.136** | **+$24,086** | -$12,849 | 1.88 |
| **RTY** | Russell 2000 | 353 | 1.014 | +$2,548 | -$18,033 | 0.14 |
| **YM** | Dow Jones | 568 | 0.941 | -$17,145 | -$30,393 | -0.56 |
| **ES** | S&P 500 | 524 | 0.862 | -$40,262 | -$68,071 | -0.59 |
| **MYM** | Micro Dow | 570 | 0.829 | -$54,923 | -$58,276 | -0.94 |
| **MES** | Micro S&P | 528 | 0.761 | -$71,182 | -$81,140 | -0.88 |

*Note: All figures based on dynamic contract sizing to risk exactly $800 per trade.*

---

## 3. Component Replication Analysis

### 3.1 Model A1 (PM Low-ADX Pullback)

**Verdict: INSTRUMENT-SPECIFIC (Nasdaq Only)**

Model A1 relies on the structural integrity of depth-constrained pullbacks during low-ADX regimes.
- **MNQ PF:** 1.046
- **NQ PF:** 1.171 (Replicates / Strengthens)
- **RTY PF:** 1.062 (Replicates / Weakens)
- **ES/YM PF:** < 0.950 (Fails)

**Analysis:** The S&P 500 and Dow Jones do not respect the specific ATR depth constraints (0.5 to 1.2 ATR) that govern Nasdaq pullbacks. ES pullbacks are structurally deeper and more complex, routinely stopping out A1 entries before continuing the trend.

### 3.2 Model A3 (Overnight Volatility Contraction Breakout)

**Verdict: INSTRUMENT-SPECIFIC (Nasdaq Only)**

Model A3 exploits the asymmetry of overnight volatility contraction resolving into trend expansion.
- **MNQ PF:** 1.523
- **NQ PF:** 1.633 (Replicates / Strengthens)
- **ES/YM/RTY PF:** < 0.910 (Fails completely)

**Analysis:** This is the most significant finding of the sprint. The overnight contraction asymmetry is unique to the Nasdaq. On the ES and YM, overnight breakouts from tight compressions lack the follow-through required to hit a 2.5R target, resulting in persistent negative expectancy.

### 3.3 Atlas Risk Intelligence (ARI v2.0)

**Verdict: WEAKENS (Portfolio-Dependent)**

ARI v2.0 was designed to exploit the mean-reverting nature of the MNQ portfolio's equity curve.
When applied to failing markets (ES, YM), ARI v2.0 slightly improved performance by suppressing risk during extended losing streaks, but it could not manufacture a positive edge where none existed.

---

## 4. Knowledge Confidence Updates

Based on the cross-market data, the Atlas Knowledge Base confidence scores are updated as follows:

| Market Truth / Component | Previous Confidence | New Confidence | Rationale |
|---|---|---|---|
| **Theory of Edge** | High | **High** | Validated universally: where uncertainty is not reduced (ES/YM), no edge exists. |
| **Regime Dependence** | High | **High** | Validated universally: ADX states dictate behaviour across all indices. |
| **Overnight Contraction Asymmetry** | High | **Low (General)**<br>**High (Nasdaq)** | Demoted to an instrument-specific phenomenon. |
| **Model A1 Structural Anchoring** | Medium | **Low (General)**<br>**High (Nasdaq)** | ES/YM structure differs fundamentally from NQ structure. |

---

## 5. Strategic Implications

Atlas should prefer truth over optimism. The truth is that Atlas is currently a **Nasdaq-specialised execution framework**, not a general market framework.

This does not invalidate the framework; it clarifies its boundaries. The decision rules mandate that we document precisely which discoveries are MNQ-specific and proceed with that knowledge.

**Recommended Action:**
1. **Cease generalisation attempts.** Accept that Atlas models are index-specific.
2. **Standardise on NQ/MNQ.** The framework is highly effective on the Nasdaq. All future execution models (including Model A2) should be engineered exclusively for NQ/MNQ.
3. **Scale via Size, Not Breadth.** With $800 risk per trade, the NQ portfolio produced +$65,603 over two years. The path to scale is increasing capital allocation on the validated Nasdaq models, rather than attempting to force those models onto the S&P 500.
