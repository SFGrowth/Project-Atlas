# Atlas Research Record: Sprint 023 — Interaction Effects

## 1. Context and Objective

**Research Stream:** B — Execution Intelligence
**Sprint:** 023
**Status:** Completed
**Verdict:** ALL HYPOTHESES REJECTED

In Sprint 021, four execution triggers (Pullback, Liquidity Sweep, Breakout, Mean Reversion) were tested unconditionally as standalone strategies. All four failed to produce a statistical edge. 

The objective of Sprint 023 was to test whether combining these Trigger Components with specific Structural Components (environment filters) would create a statistically robust execution model that neither component could achieve alone.

## 2. Hypotheses Tested

- **H-B006:** Liquidity Sweep + High Tradeability Regime (Rel Vol > 1.5 & ATR Expansion)
- **H-B007:** Pullback Continuation + Volatility Expansion (ATR5 > 1.4x ATR5 from 10 bars ago)
- **H-B008:** Mean Reversion + Low Trend Strength (EMA21 slope flat, price between EMA9 and EMA50)
- **H-B009:** Breakout Continuation + Volatility Compression (ATR ratio 5/50 < 0.85)

## 3. Experimental Design

Each hypothesis was tested as a controlled A/B experiment across a 2-year MNQ 5-minute dataset (140,933 bars):
- **Experiment A:** Trigger unconditional (baseline).
- **Experiment B:** Trigger restricted to the structural condition.

## 4. Results Summary

All four hypotheses failed to meet the Atlas standard (Profit Factor > 1.20). While the structural filters generally improved the Profit Factor slightly and reduced absolute drawdown by restricting trade frequency, none of the interactions produced a durable, tradable edge.

| Hypothesis | Exp | Trades | PF | Net P&L | Max Drawdown | Verdict |
|---|---|---|---|---|---|---|
| **H-B006** (Liquidity Sweep) | A (Base) | 3,971 | 0.957 | -$5,628 | -$9,610 | FAIL |
| | B (Interaction) | 1,940 | 0.967 | -$2,358 | -$6,027 | FAIL |
| **H-B007** (Pullback) | A (Base) | 4,391 | 1.017 | $2,098 | -$3,576 | FAIL |
| | B (Interaction) | 1,531 | 1.023 | $1,113 | -$2,191 | FAIL |
| **H-B008** (Mean Reversion) | A (Base) | 4,737 | 0.950 | -$8,033 | -$10,895 | FAIL |
| | B (Interaction) | 87 | N/A | -$304 | N/A | INSUFFICIENT TRADES |
| **H-B009** (Breakout) | A (Base) | 2,488 | 0.986 | -$1,231 | -$5,563 | FAIL |
| | B (Interaction) | 284 | 0.942 | -$326 | -$678 | FAIL |

## 5. Detailed Findings

### H-B006: Liquidity Sweep + High Tradeability Regime
Filtering Liquidity Sweeps to only occur during high volume and ATR expansion improved the PF marginally (0.957 to 0.967) and reduced drawdown, but the edge remains negative. Sweeps in high-momentum environments often just become continuations against the position.

### H-B007: Pullback Continuation + Volatility Expansion
This was the closest to breakeven. The unconditional pullback (Exp A) produced a PF of 1.017. Restricting it to occur immediately after a volatility expansion event (Exp B) improved the PF to 1.023 and reduced drawdown from -$3,576 to -$2,191. The Year 1 (PF 1.019) and Year 2 (PF 1.025) stability was excellent. However, a PF of 1.023 is insufficient to cover slippage and variance in live execution.

### H-B008: Mean Reversion + Low Trend Strength
Restricting mean reversion to strictly non-trending environments (flat EMA slope) starved the model of trades. Only 87 trades fired over 2 years, rendering the result statistically invalid.

### H-B009: Breakout Continuation + Volatility Compression
Restricting breakouts to occur only immediately after volatility compression actually *degraded* the Profit Factor from 0.986 to 0.942. This suggests that many valid breakouts occur without prior compression, or that compression breakouts on the 5-minute chart frequently fail (false breakouts).

## 6. Conclusion and Verdict

**Verdict: ALL HYPOTHESES REJECTED**

**Evidence:**
None of the tested interactions between these specific Structural Components and Trigger Components produced a Profit Factor > 1.20.

**Atlas Principle Applied:**
"Standing down is a valid output." Atlas will not force a marginal result into production.

**Next Steps:**
- Record the failure of these interactions in the Knowledge Base.
- The next logical step is to investigate the parameters of the components themselves. The structural definitions (e.g., High Tradeability) may be poorly defined, or the triggers (e.g., Pullback) may be poorly defined. 
- Stream D research should return to first principles: what exactly constitutes a valid structural condition?
