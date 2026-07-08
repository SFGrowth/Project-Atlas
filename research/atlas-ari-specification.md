# Atlas Risk Intelligence (ARI) — Governing Specification

## The Philosophy of Risk

Execution models discover opportunity. Atlas Risk Intelligence (ARI) determines whether opportunity deserves capital.

ARI is the executive decision-maker of Atlas. It does not look for trades. It looks for reasons to reduce or eliminate risk. The question ARI answers is not: *"Should we trade?"*

The question ARI answers is:
**"Given everything Atlas currently knows about the market, the execution model, and the account, what level of risk is objectively justified right now?"**

## The Three Domains of Intelligence

ARI synthesises three independent domains of knowledge to arrive at a single risk allocation decision.

### 1. Market Intelligence
*What does Atlas know about the current market?*
- Market Regime (e.g., Compression, Expansion, Chop)
- Tradeability Score
- Volatility (ATR Quartile)
- Time of Day / Session (AM vs PM)
- Market State (e.g., ADX Trend Strength)

### 2. Execution Intelligence
*What does Atlas know about the current execution model?*
- Historical robustness and confidence level
- Suitable operating conditions (from the Model Characterisation)
- Current match to those conditions (e.g., Is Model A1 firing in the PM session?)
- Statistical expectancy in the current environment

### 3. Capital Intelligence
*What does Atlas know about the account?*
- Current daily drawdown
- Current weekly drawdown
- Consecutive losses streak
- Prop firm trailing drawdown limits
- Account type (Evaluation vs Funded vs Live)
- Baseline position sizing
- Current risk budget

## ARI Output States

Instead of a binary PASS/FAIL, ARI outputs a dynamic risk allocation. Every decision must include an explanation for future auditing.

1. **BLOCK:** No execution permitted. Used when environmental conditions are hostile (e.g., Friday PM, 12:00-13:00 ET) or risk limits are breached.
2. **OBSERVE ONLY:** Signals are generated and logged for research, but not routed to execution.
3. **PAPER TRADE:** Signals are routed to a paper trading account for forward-testing out-of-sample validation.
4. **REDUCED RISK:** Capital is allocated, but at a fraction of standard size (e.g., 25% or 50%). Used during drawdown recovery or when consecutive losses suggest a temporary regime shift.
5. **STANDARD RISK:** Normal position sizing applied when all conditions align perfectly.
6. **INCREASED RISK:** (Future capability) Only permitted if statistically justified by overwhelming compounding evidence.

## The Airline Analogy

ARI is the flight management computer. The navigation system (Stream B) finds the route. The weather system (Stream A) reports conditions. The engines provide thrust. But ARI decides how the aircraft should actually operate given all available information—whether to proceed, reduce speed, or stay on the ground.

## Future Research (Stream C)

All Stream C (Capital Intelligence) research will now focus on defining the exact mathematical thresholds for these output states, specifically tailored to protect capital during prop firm evaluations.
