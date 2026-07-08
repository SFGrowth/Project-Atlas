# Sprint 029 — Momentum Continuation: Research Results

**Sprint Type:** Stream B — Execution Intelligence  
**Candidate:** Model A2 Candidate 1 (Momentum Continuation)  
**Verdict:** REJECTED  
**Date:** 2026-07-08

---

## 1. Executive Summary

The Momentum Continuation hypothesis (H-A2-001) was tested across 9 parameter configurations on the full 2-year dataset. The objective was to determine if entering in the direction of an established high-ADX trend, immediately following a sequence of strong closes, produces a statistically significant edge.

**The verdict is REJECTED.** No configuration met the standalone acceptance criteria. The hypothesis failed to demonstrate that momentum continuation—defined purely by bar close location—provides a durable statistical edge.

Following the Sprint 029 failure protocol, the hypothesis is archived, and Atlas will proceed immediately to test the next ranked candidate: Breakout Continuation.

---

## 2. Full Parameter Sweep Results

The test evaluated N consecutive bars closing in the top X% of their range (for longs) within an ADX > 30 environment.

| Configuration | Trades | PF | Net P&L | Max DD | Win Rate | Expectancy | Year 1 PF | Year 2 PF |
|---|---|---|---|---|---|---|---|---|
| N=2, Top 25% | 1,550 | 0.929 | -$5,508 | -$7,085 | 33.0% | -$3.55 | 0.962 | 0.853 |
| N=2, Top 33% | 1,403 | 0.944 | -$3,898 | -$5,498 | 33.4% | -$2.78 | 1.009 | 0.857 |
| N=2, Top 50% | 1,094 | 0.937 | -$3,506 | -$4,931 | 33.1% | -$3.21 | 1.040 | 0.875 |
| N=3, Top 25% | 1,292 | 0.997 | -$182 | -$4,076 | 33.8% | -$0.14 | 1.193 | 0.945 |
| N=3, Top 33% | 1,084 | 0.974 | -$1,375 | -$4,092 | 34.2% | -$1.27 | 1.153 | 0.905 |
| N=3, Top 50% | 706 | 0.982 | -$620 | -$3,441 | 34.3% | -$0.88 | 1.102 | 0.954 |
| N=4, Top 25% | 1,086 | 1.009 | +$476 | -$3,722 | 34.2% | +$0.44 | 1.172 | 1.000 |
| **N=4, Top 33%** | **859** | **1.034** | **+$1,401** | **-$2,799** | **35.9%** | **+$1.63** | **1.235** | **1.014** |
| N=4, Top 50% | 453 | 1.010 | +$225 | -$2,085 | 35.5% | +$0.50 | 1.055 | 0.974 |

*Note: The best configuration (N=4, Top 33%) achieved a PF of only 1.034, far below the 1.20 acceptance threshold.*

---

## 3. Analysis and Root Cause

The null hypothesis could not be rejected. Entering immediately after a sequence of strong momentum bars in a high-ADX environment does not provide a durable edge. 

The data reveals two structural reasons for this failure:

1. **Mean Reversion Penalty:** Even in high-ADX trends, price does not move in a straight line. By the time 3 or 4 consecutive bars have closed near their highs, the short-term directional impulse is often exhausted. The market frequently prints a minor pullback immediately after the signal fires, which triggers the 1.0 ATR stop loss before the trend resumes.
2. **Lack of Structural Support:** Unlike Model A1, which anchors its entry to a dynamic support level (EMA21) after a defined pullback, Momentum Continuation enters "in the air." Without a structural anchor, the stop loss is highly vulnerable to routine market noise.

---

## 4. Knowledge Gain Assessment

**What did we learn?**
Momentum alone—even when defined strictly by strong closes in a confirmed high-ADX regime—is insufficient for a 1 ATR stop. Buying momentum requires a wider stop to survive the inevitable micro-pullbacks, which degrades the risk/reward profile.

**What uncertainty was removed?**
We have eliminated the hypothesis that simply following the immediate directional velocity of a trend is a viable standalone execution model for MNQ futures.

**What future work has been eliminated?**
No further parameter tuning will be conducted on pure momentum continuation models. 

**Did Atlas become objectively smarter?**
Yes. Atlas now knows that high-ADX execution models still require structural entry points (like micro-consolidations or breakouts) rather than pure momentum chasing.

---

## 5. Next Steps

Following the failure protocol, no portfolio analysis was conducted (as no configuration passed the standalone criteria).

Atlas will immediately proceed to **Sprint 030**, testing the second-ranked candidate from the Design Space Survey: **Breakout Continuation** (micro-consolidation break in the trend direction).
