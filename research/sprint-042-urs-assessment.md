# Sprint 042 — Model A2 Discovery: URS Pre-Assessment

**Date:** 2026-07-08  
**Sprint:** 042 — Model A2 Discovery (High-ADX RTH Trend Continuation)  
**Purpose:** Rank all candidate hypotheses by Uncertainty Reduction Score before any backtest code is written.

---

## Candidate Hypotheses

Six candidate hypotheses are evaluated. Each is scored across the six URS dimensions (0–20 points each, max 120, normalised to 100).

### URS Scoring Criteria (from Atlas URS Specification v1.0)

| Dimension | Weight | What It Measures |
|---|---|---|
| U1: Directional | 20 | Is direction resolved before entry? |
| U2: Structural | 20 | Is there a specific structural event anchoring entry? |
| U3: Regime | 20 | Is the market regime confirmed? |
| U4: Temporal | 20 | Is session/time context confirmed? |
| U5: Volatility | 20 | Is volatility state characterised? |
| U6: Liquidity | 20 | Is liquidity context understood? |

---

## Hypothesis Evaluations

### H-A2-01: Micro-Consolidation Breakout

**Definition:** A 3–8 bar tight consolidation (ATR compression ≥ 40%) inside an established High-ADX RTH trend, followed by a breakout in the trend direction.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 18 | Trend confirmed by ADX + EMA alignment. High confidence. |
| U2: Structural | 17 | Consolidation zone provides precise breakout level. |
| U3: Regime | 20 | ADX > 25 required. Regime fully specified. |
| U4: Temporal | 18 | RTH session (09:30–16:00 ET) specified. |
| U5: Volatility | 16 | ATR compression ratio quantifies volatility state. |
| U6: Liquidity | 12 | Consolidation zones attract liquidity but not fully characterised. |
| **Total** | **101/120 → 84/100** | **PROCEED** |

**Previous Atlas Evidence:** Sprint 029 (Momentum Continuation) failed because it entered after multiple impulsive closes. Micro-consolidation specifically avoids this by requiring a pause before entry. The Theory of Edge predicts this pause reduces directional and structural uncertainty simultaneously.

---

### H-A2-02: Flag Structure Continuation

**Definition:** A brief 5–15 bar counter-trend consolidation (flag) inside a High-ADX RTH trend, followed by a breakout in the trend direction.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 18 | Trend confirmed. Flag direction is counter-trend (controlled pullback). |
| U2: Structural | 16 | Flag boundary provides entry level, but flag shape is subjective. |
| U3: Regime | 20 | ADX > 25 required. |
| U4: Temporal | 18 | RTH session specified. |
| U5: Volatility | 14 | Flag compression is less precisely defined than micro-consolidation. |
| U6: Liquidity | 11 | Flag high/low may attract stop runs before continuation. |
| **Total** | **97/120 → 81/100** | **PROCEED** |

---

### H-A2-03: Pullback Failure (Failed Reversal)

**Definition:** A 2–5 bar pullback against the High-ADX RTH trend that fails to make a new extreme, followed by immediate resumption in the trend direction.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 17 | Trend confirmed. Failure signal adds directional confirmation. |
| U2: Structural | 15 | Failure point is identifiable but requires real-time judgment. |
| U3: Regime | 20 | ADX > 25 required. |
| U4: Temporal | 18 | RTH session specified. |
| U5: Volatility | 12 | Volatility state during pullback is not well-characterised. |
| U6: Liquidity | 10 | Pullback may sweep liquidity — this is the edge, but also the risk. |
| **Total** | **92/120 → 77/100** | **PROCEED (lower priority)** |

---

### H-A2-04: Break-and-Retest

**Definition:** A structural breakout of a prior swing high/low inside a High-ADX RTH trend, followed by a retest of the broken level before continuation.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 17 | Trend confirmed. Breakout adds directional confirmation. |
| U2: Structural | 18 | Broken level is precisely defined. Retest provides exact entry. |
| U3: Regime | 20 | ADX > 25 required. |
| U4: Temporal | 18 | RTH session specified. |
| U5: Volatility | 13 | Volatility state at retest is not specified. |
| U6: Liquidity | 14 | Broken level becomes support/resistance — liquidity well understood. |
| **Total** | **100/120 → 83/100** | **PROCEED** |

---

### H-A2-05: Volatility Compression Inside Trend

**Definition:** A 5–15 bar ATR compression (≥ 50% below 20-bar ATR mean) occurring inside an established High-ADX RTH trend, followed by expansion in the trend direction.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 18 | Trend confirmed. |
| U2: Structural | 14 | Compression zone is identifiable but entry timing is imprecise. |
| U3: Regime | 20 | ADX > 25 required. |
| U4: Temporal | 18 | RTH session specified. |
| U5: Volatility | 20 | Volatility compression is the primary signal — fully characterised. |
| U6: Liquidity | 11 | Liquidity context during compression is unclear. |
| **Total** | **101/120 → 84/100** | **PROCEED** |

*Note: This is the RTH equivalent of Model A3's overnight compression mechanism. The Theory of Edge strongly predicts this should work.*

---

### H-A2-06: Liquidity Sweep Continuation

**Definition:** A brief spike below a prior swing low (long) or above a prior swing high (short) inside a High-ADX RTH trend, followed by immediate reversal and continuation in the trend direction.

| Dimension | Score | Rationale |
|---|---|---|
| U1: Directional | 16 | Trend confirmed. Sweep direction is counter-trend. |
| U2: Structural | 16 | Sweep level (prior swing) is precisely defined. |
| U3: Regime | 20 | ADX > 25 required. |
| U4: Temporal | 18 | RTH session specified. |
| U5: Volatility | 11 | Volatility state at sweep is not characterised. |
| U6: Liquidity | 18 | Liquidity sweep is the core mechanism — well understood. |
| **Total** | **99/120 → 83/100** | **PROCEED** |

---

## URS Ranking and Testing Priority

| Rank | Hypothesis | URS Score | Decision |
|---|---|---|---|
| 1 | H-A2-01: Micro-Consolidation Breakout | **84/100** | Test first |
| 1 | H-A2-05: Volatility Compression Inside Trend | **84/100** | Test first |
| 3 | H-A2-02: Flag Structure Continuation | 81/100 | Test second |
| 4 | H-A2-04: Break-and-Retest | 83/100 | Test second |
| 5 | H-A2-06: Liquidity Sweep Continuation | 83/100 | Test if needed |
| 6 | H-A2-03: Pullback Failure | 77/100 | Test if needed |

**All six hypotheses score above the 60/100 minimum threshold.** All six will be tested.

**Testing order:** H-A2-01 and H-A2-05 first (tied highest URS). H-A2-04 and H-A2-02 second. H-A2-06 and H-A2-03 third.

---

## Atlas Theory of Edge Prediction

The Theory of Edge predicts that the most promising candidates are those that reduce **multiple dimensions of uncertainty simultaneously**. H-A2-01 (Micro-Consolidation) and H-A2-05 (Volatility Compression Inside Trend) both reduce U1, U2, U3, and U5 simultaneously — the same combination that made Model A3 successful. This is the strongest theoretical prior for Model A2 discovery.
