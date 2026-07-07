# Atlas Strategy Research Specification

**Project Atlas: Vision 1.0**  
**Document Status:** Draft for Review  
**Module:** Atlas Strategy (First Execution Module)  

## 1. Purpose

This document outlines the research and specification for the first execution module in the Atlas Operating System: the **Atlas Strategy**. 

The goal is not to recreate Thomas Wade's methodology. The goal is to build a statistically superior systematic strategy inspired by the underlying market principles that Thomas Wade teaches. 

Thomas Wade's concepts serve as research inputs only. Atlas will engineer its own rules from first principles, validate them statistically, and adopt only what the evidence proves. If Atlas discovers a better rule than Wade's original discretionary approach, Atlas adopts the better rule.

This strategy will only request permission to trade; the Atlas Guardian will decide if the market conditions justify risking capital.

## 2. Research Input: Deconstructing the Principles

Thomas Wade's discretionary approach relies on several core price action principles. Rather than copying his specific rules (e.g., "0-1-2 entry logic" or "21 EMA"), Atlas extracts the underlying market dynamics for independent testing [1].

### 2.1 The Underlying Principles

| Principle | The Discretionary Concept | The Atlas Research Question |
| :--- | :--- | :--- |
| **Trend Qualification** | Trade only in the direction of the dominant trend, visually assessed. | What objective metric (EMA slope, VWAP relation, structure breaks) provides the highest-expectancy trend filter? |
| **Failed Counter-Trend Attempts** | Trends often resume after counter-trend traders fail twice (the "second entry" trap). | Does a two-legged pullback statistically outperform a single-legged pullback or a simple momentum breakout? |
| **Dynamic Support/Resistance** | Price frequently reacts at moving averages during trends. | Which moving average (length and type) provides the most reliable reaction zone for MNQ futures? |
| **Signal Commitment** | The entry candle must show strong commitment (closing near its extreme). | What is the optimal close-position ratio (e.g., top 25% of range) and minimum body size to confirm momentum without entering late? |
| **Location Quality** | Entries must occur at "key entry points," not in the middle of nowhere. | How does proximity to recent structure (BOS), VWAP, or opening range extremes impact trade expectancy? |

## 3. Proposed Measurable Implementations (For Testing)

Atlas will test the following objective implementations of these principles. None of these are assumed to be correct until validated.

### 3.1 Structure & Trend Implementation
1. **Objective Trend:** A trend is defined by a combination of EMA alignment (Fast > Slow) and recent Break of Structure (BOS).
2. **Objective BOS:** A valid BOS requires a body close beyond a confirmed N-bar swing high/low [2].
3. **Objective CHOCH:** A body close beyond the swing point that initiated the most recent BOS signals a Change of Character, suspending trend-continuation setups until a new BOS occurs [2].

### 3.2 The Pullback Implementation
1. **Leg Counting:** Atlas will test a mechanical leg-counting algorithm:
   - *Leg 1:* The first bar to break the extreme of the previous bar in the trend direction.
   - *Leg 2:* The second bar to break the extreme of the previous bar in the trend direction, occurring after a counter-trend swing.
2. **Hypothesis Test:** Atlas will test whether the "Leg 2" setup actually outperforms "Leg 1" setups under specific market conditions.

### 3.3 Quality & Location Implementation
1. **Reaction Zone Proximity:** The signal bar must close within a defined ATR distance of a dynamic support level (e.g., EMA or VWAP).
2. **Signal Quality Score:** The signal bar is scored mathematically: `(Close - Low) / (High - Low)`. A score > 0.75 is bullish; < 0.25 is bearish.
3. **Exhaustion Filter:** The signal bar range must not exceed a multiple of the current ATR, preventing entries on exhaustion candles.

## 4. Research Philosophy

Atlas does not seek confirmation.

Atlas seeks evidence.

Every hypothesis is assumed false until statistically supported. Every rule must earn its place through objective validation. If evidence contradicts an existing rule, Atlas changes the rule — not the evidence.

This principle applies to every component of the Atlas Strategy without exception. No rule is protected by popularity, convention, or the reputation of the methodology that inspired it.

---

## 5. Validation Methodology

No production execution code will be written until these components are validated. Observer and research tools may still be developed to collect the evidence required for validation.

1. **Phase 1: Component Isolation Testing**
   - Build a Pine Script test harness to isolate and measure individual components (e.g., test the predictive power of the Signal Quality Score independently of the trend).
   - *Goal:* Determine which individual metrics possess an edge.

2. **Phase 2: Statistical Backtesting**
   - Combine the high-expectancy components into a unified strategy.
   - Export setup data using the Atlas Research Exporter.
   - Run the data through the Python `atlas_research_engine.py` over a minimum 2-year MNQ dataset.
   - *Goal:* Prove positive statistical expectancy (Profit Factor, Win Rate, Drawdown).

3. **Phase 3: Guardian Integration**
   - Test the strategy in conjunction with existing Atlas Guardian rules (e.g., the H001 rule blocking strong pressure into reaction zones).
   - *Goal:* Verify that Guardian effectively filters low-quality setups and improves the strategy's baseline performance.

## 6. Assumptions and Limitations

- **Assumption:** Discretionary concepts like "pullback legs" can be accurately codified into objective, bar-by-bar logic without losing their underlying market meaning.
- **Assumption:** The combination of structure (BOS), location (proximity), and momentum (signal quality) is sufficient to define a high-probability setup.
- **Limitation:** The initial testing will focus on a single timeframe (e.g., 5-minute MNQ). Multi-timeframe confluence will be researched in a later sprint.

## 7. Acceptance Criteria

The Atlas Strategy will only be adopted if the research proves:

1. **Evidence over Assumption:** The final ruleset must be backed by statistical evidence from the backtester, not just adopted because it is popular in price action theory.
2. **Expectancy:** The backtested Profit Factor must exceed 1.20 over the 2-year sample.
3. **Decision Quality:** The strategy must integrate seamlessly with Atlas Observer, taking fewer, higher-quality trades.
4. **Risk Profile:** The maximum historical drawdown must remain within the acceptable limits for a $50k prop firm evaluation (e.g., < $2,000 trailing drawdown).

---

## References

[1] User Guide: "Thomas Wade Price Action" Strategy. Thomas Wade Price Action Indicators. https://thomaswadepriceactionindicators.com/blogs/noticias/user-guide-thomas-wade-price-action-strategy
[2] Market Structure: BoS And CHoCH Made Simple. Daily Price Action. https://dailypriceaction.com/blog/smc-market-structure/
