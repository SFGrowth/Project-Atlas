# Atlas Production Specification (APS) v1.0
**Date:** 9 July 2026  
**Author:** Manus AI  
**Project:** Atlas Trading System (ATS)

---

## SECTION 1 — SYSTEM OVERVIEW

The Atlas Trading System (ATS) v2.1 is a fully autonomous, multi-model quantitative trading system. It operates on a strict, layered architecture designed to enforce safety, mathematically proven edge, and absolute regime dependence.

The architecture is composed of eight distinct layers that evaluate market data, generate signals, allocate risk, verify safety, and execute trades across multiple broker accounts simultaneously.

### Complete ATS Architecture Flow

1. **Market Data:** Ingests raw OHLCV and transaction data on a 5-minute timeframe.
2. **Market State Engine (MSE):** Computes a 56-field immutable snapshot of the market on every bar close.
3. **Execution Models (A1, A3, B1):** Specialised logic engines that evaluate the Market State Object and propose trades based on validated Market Laws (MVCs).
4. **Atlas Decision Engine (ADE):** Ranks all proposed trades using a 100-point Edge Score framework and selects the single best candidate.
5. **Atlas Risk Intelligence (ARI):** Applies 8 strict capital protection rules (e.g., daily loss limits, circuit breakers) and determines the final position size and risk multiplier.
6. **Trade Verification Layer (TVL):** The final safety gatekeeper. Enforces 38 independent rules across 6 categories. If any uncertainty exists, the trade is blocked.
7. **Execution Engine:** Generates the TradingView alert, constructs the JSON webhook payload, and transmits the signal.
8. **Broker Routing (TradersPost/Tradovate):** Translates the webhook into broker-specific instructions and routes simultaneously to Prop Firm 1, Prop Firm 2, and the Live Account.
9. **Observatory:** An immutable, read-only database that records every state, decision, and outcome for post-trade analysis.

*(Reference: `sprint-062-charts/atlas_ade_architecture.png` and `sprint-063-charts/atlas_e2e_flow_v2.2.png`)*

---

## SECTION 2 — MARKET STATE ENGINE (MSE)

The Market State Engine is responsible for generating the **Market State Object (MSO)**—a 56-field immutable snapshot of the market calculated precisely at the close of every 5-minute candle. This object is the sole input for all downstream decision-making.

### 2.1 Temporal Definitions
*   **Timezone:** All internal calculations use Eastern Time (`America/New_York`).
*   **Regular Trading Hours (RTH):** 09:30 to 16:00 ET.
*   **Session Classifications:**
    *   `PRE_MARKET`: 04:00–09:29 ET
    *   `AM_OPEN`: 09:30–10:00 ET
    *   `AM_SESSION`: 09:30–11:59 ET
    *   `MID_SESSION`: 12:00–13:59 ET
    *   `PM_SESSION`: 14:00–15:59 ET
    *   `AFTER_HOURS`: 16:00–17:59 ET
    *   `OVERNIGHT`: 18:00–04:00 ET

### 2.2 Core Indicators & Regimes
*   **Trend Alignment:** Evaluated using the stack of 9-period, 21-period, and 50-period Exponential Moving Averages (EMA).
    *   `BULL_ALIGNED`: EMA9 > EMA21 > EMA50
    *   `BEAR_ALIGNED`: EMA9 < EMA21 < EMA50
*   **Volatility Regime:** Measured via Average Directional Index (ADX) over a 14-period lookback.
    *   `LOW`: ADX < 25
    *   `TRENDING`: ADX $\ge$ 25
*   **Volatility Compression (VolComp):** Defined as `ATR(5) / ATR(5)[20] < 0.80`.
*   **Volatility Expansion:** Defined as `ATR(5) / ATR(5)[20] > 1.30`.

### 2.3 MVC State Generation
The MSE pre-calculates the boolean states of all Minimum Viable Combinations (MVCs) discovered in the research phase, making them instantly available to the Execution Models.
*   **MVC-003 (Apex Combination):** `Relative Transaction Volume >= 1.33` AND `Overnight Range >= 10.85 ATR14` AND `Overnight Direction == BULLISH`.

---

## SECTION 3 — EXECUTION MODEL LIBRARY

Atlas operates multiple execution models. Each model is a specialised expert designed to exploit a specific, statistically validated market behaviour.

### Model A1 (Depth-Constrained Pullback)
*   **Purpose:** Capture institutional volume entering the market after the European close.
*   **Market Behaviour Exploited:** Volatility expansion followed by a shallow pullback to the EMA21 in a confirmed trend.
*   **Applicable Session:** PM Session only (13:00–16:00 ET). Tuesday–Thursday only.
*   **Regime Constraint:** Low-to-medium ADX (ADX $\le$ 40) at entry.
*   **Entry Logic:** 1-leg pullback touching EMA21 while EMA 9/21/50 are aligned. Pullback depth must be between 0.5 and 1.2 $\times$ ATR(14).
*   **Stop Methodology:** 1.0 $\times$ ATR(14).
*   **Target Methodology:** 2.0 $\times$ ATR(14) (Reward:Risk = 2.0).
*   **Historical Performance:** Win Rate = 41.3%, Profit Factor = 1.387.

### Model A3 (Overnight Expansion)
*   **Purpose:** Capture overnight volatility breakouts in the direction of the higher-timeframe trend.
*   **Market Behaviour Exploited:** Volatility contraction (compression) followed immediately by expansion.
*   **Applicable Session:** Overnight only (18:00–09:00 ET).
*   **Regime Constraint:** ADX(14) $\ge$ 25.
*   **Entry Logic:** `ATR(5) / ATR(5)[20] < 0.80` on the prior bar, followed by `ATR(5) / ATR(5)[20] > 1.30` on the current bar closing in the trend direction.
*   **Stop Methodology:** Extreme (high/low) of the 5-bar compression zone.
*   **Target Methodology:** 2.5 $\times$ Risk (Reward:Risk = 2.5).
*   **Historical Performance:** Win Rate = 28.3%, Profit Factor = 1.566.

### Model B1 (Participation-Amplified Directional Momentum)
*   **Purpose:** Exploit the synergistic interaction between overnight range expansion and AM session liquidity surges.
*   **Market Behaviour Exploited:** MVC-003 (Apex Combination).
*   **Applicable Session:** AM Session only (09:30–11:59 ET).
*   **Regime Constraint:** ADX(14) $\ge$ 25.
*   **Entry Logic:** MVC-003 is active (Rel Txn $\ge$ 1.33 AND OV Range $\ge$ 10.85 ATR AND OV Dir = Bullish).
*   **Stop Methodology:** 1.5 $\times$ ATR(14).
*   **Target Methodology:** 4.5 $\times$ ATR(14) (Reward:Risk = 3.0).
*   **Historical Performance:** Win Rate = 43.3%, Profit Factor = 2.231.

---

## SECTION 4 — ATLAS DECISION ENGINE (ADE)

The ADE evaluates all proposed trades from the Execution Models and selects the single best candidate for capital allocation.

### 4.1 Edge Score Calculation
Every proposed trade receives a standardised Edge Score (0–100) based on 7 components:
1.  **C1: Market Alignment (20 pts):** Match between current EMA/ADX structure and model's historical win conditions.
2.  **C2: Historical Expectancy (20 pts):** Model's validated expectancy in the current specific regime and session.
3.  **C3: Regime Match (20 pts):** Volatility and trend direction match.
4.  **C4: Session Match (15 pts):** Strict session compatibility (0 points if outside optimal window).
5.  **C5: MVC Strength (15 pts):** Presence of supporting Minimum Viable Combinations.
6.  **C6: Behaviour Confidence (5 pts):** Recent rolling win rate of the model.
7.  **C7: Production Reliability (5 pts):** Static score based on the model's all-time validated Profit Factor.

### 4.2 Ranking and Selection Procedure
1.  **Threshold:** A model must achieve an Edge Score $\ge$ 60 to be considered eligible. Scores below 60 indicate insufficient edge and are immediately rejected.
2.  **Ranking:** All eligible models are ranked descending by Edge Score.
3.  **Tie-Breaking:** If two models have identical scores, the model with the higher C7 (Production Reliability) score wins. If still tied, the model with the higher C2 (Historical Expectancy) wins.
4.  **Output:** The ADE outputs exactly one "Candidate Model" (or NO_TRADE if no model scores $\ge$ 60) and passes it to Atlas Risk Intelligence (ARI).

---

## SECTION 5 — ATLAS RISK INTELLIGENCE (ARI)

Atlas Risk Intelligence (ARI) is the capital protection layer. It receives the Candidate Model from the ADE and determines whether to allocate capital, how much to allocate, and when to enforce emergency halts. 

### 5.1 The 8 Capital Protection Rules
ARI evaluates the Candidate Model against 8 strict, sequential rules. A failure at any step results in immediate rejection.

*   **R1: Active Position Block:** Only one active position per instrument is permitted at any time. If a position is open, all new signals are rejected.
*   **R2: Circuit Breaker:** If the ARI circuit breaker is active (due to severe drawdown or manual intervention), all trades are rejected.
*   **R3: Daily Loss Limit:** If the daily P&L $\le -\$2,000$ (Live) or $\le -\$1,500$ (Prop), all further trades for the day are rejected. Resets at 18:00 ET.
*   **R4: Consecutive Loss Caution:** If the system suffers 2 consecutive losses, the risk multiplier is halved (0.5x). If 3 consecutive losses occur, the system pauses for 2 hours.
*   **R5: Daily Trade Limit:** Maximum of 3 trades per day. If `daily_trade_count >= 3`, all further trades are rejected.
*   **R6: Drawdown Reduction:** If the system is in a drawdown $> \$3,000$ from the all-time equity peak, the risk multiplier is reduced to 0.75x.
*   **R7: Profit Compounding:** When a significant profit milestone is reached (e.g., +$5,000 above the previous high-water mark), the base risk is increased by 10%.
*   **R8: Session End Block:** No trades may be initiated within 15 minutes of the RTH close (after 15:45 ET).

### 5.2 Position Sizing & Capital Allocation
1.  **Base Risk:** The default risk is \$800 per trade for Live accounts and \$400 for Prop accounts.
2.  **Risk Multiplier:** ARI applies the risk multiplier calculated from R4, R6, and R7.
3.  **Contract Calculation:** `Contracts = Floor((Base Risk * Risk Multiplier) / (Stop Distance in Points * Point Value))`
4.  **Limits:** Minimum 1 contract, maximum 10 contracts.

---

## SECTION 6 — TRADE VERIFICATION LAYER (TVL)

The TVL is the final safety gatekeeper. It executes 38 independent verification rules across 6 categories. The TVL assumes the ADE and ARI may have failed or operated on stale data, and re-verifies everything immediately prior to webhook transmission.

### 6.1 Validation Categories
1.  **C1: Execution Model Verification:** Validates the Model ID, promotion status, and ensures the Edge Score is $\ge$ 60.
2.  **C2: Market State Verification:** Ensures `barstate.isrealtime == true` (preventing historical replay execution) and verifies the entry price is within 0.5% of the current close.
3.  **C3: ARI Re-Verification:** Independently recalculates daily loss, consecutive losses, and active position status. Failure on active position or circuit breaker results in an **EMERGENCY BLOCK**.
4.  **C4: Trade Parameter Verification:** Mathematically proves that Entry, Stop, and Target prices are correctly ordered, Risk:Reward is $\ge$ 1.5, and contracts are within limits.
5.  **C5: Duplicate Prevention:** Checks the 60-second rolling cache for identical `signal_id`s and verifies no pending webhooks are in flight.
6.  **C6: Broker Safety:** Confirms the broker session is open, the Tradovate connection is active, and the JSON payload matches the strict schema.

### 6.2 TVL Output States
*   **VERIFIED:** All 38 rules pass. Webhook is transmitted.
*   **REJECTED:** A non-critical rule fails. Webhook is suppressed.
*   **DELAYED:** A transient issue (e.g., broker timeout). Retry on next bar.
*   **EMERGENCY BLOCK:** A critical safety failure (e.g., desynchronised position). All trading halted; manual reset required.

*(Reference: `sprint-063-tvl-specification.md` for the exhaustive 38-rule list).*

---

## SECTION 7 — EXECUTION ENGINE

The Execution Engine handles the physical routing of the approved trade from TradingView to the brokers.

### 7.1 Webhook Payload Schema
The JSON payload transmitted by TradingView must strictly conform to this schema:
```json
{
  "action": "buy", // buy, sell, close_long, close_short
  "ticker": "MNQ1!",
  "model_id": "B1",
  "signal_id": "B1-1718029300",
  "edge_score": 85.4,
  "contracts": 2,
  "entry_price": 20150.25,
  "stop_price": 20120.00,
  "target_price": 20240.75
}
```

### 7.2 Routing Pipeline
1.  **TradingView Alert:** Fires the JSON payload to the Webhook Receiver.
2.  **Webhook Receiver:** Validates the JSON schema, checks the `signal_id` cache to prevent duplicates, and forwards the payload to TradersPost.
3.  **TradersPost:** Translates the payload into broker-specific limit/stop orders and routes them simultaneously to:
    *   Prop Firm Account 1 (e.g., TopStep)
    *   Prop Firm Account 2 (e.g., Apex)
    *   Live Brokerage Account (Tradovate)

### 7.3 Error Handling & Retries
*   If TradersPost returns a 5xx error, the Webhook Receiver will retry up to 3 times with a 2-second exponential backoff.
*   If the order is rejected by the broker (e.g., insufficient margin), the failure is logged to the Observatory and an alert is sent to the operator. No automated retry is attempted for broker rejections.

---

## SECTION 8 — OBSERVATORY

The Observatory is the immutable, read-only database that records every state, decision, and outcome in the Atlas system. It never modifies production behaviour.

### 8.1 Record Types
1.  **MARKET_STATE_SNAPSHOT:** Recorded every 5 minutes. Contains all 56 MSO fields. (90-day retention).
2.  **ADE_EVALUATION:** Recorded when models are evaluated. Contains Edge Scores and the selected Candidate Model. (180-day retention).
3.  **ARI_DECISION:** Recorded when ARI approves or rejects a trade, including the specific rule applied. (365-day retention).
4.  **TVL_VERIFICATION:** Recorded for every TVL state (VERIFIED, REJECTED, EMERGENCY BLOCK) along with specific rejection codes. (Permanent).
5.  **TRADE_ENTRY & TRADE_EXIT:** Records the exact fill prices, slippage, and final P&L. (Permanent).

### 8.2 Drift Detection
The Observatory continuously compares the live `TRADE_EXIT` P&L against the theoretical Historical Expectancy (from the ADE). If the live Profit Factor diverges negatively by more than 25% from the historical baseline over a 20-trade rolling window, the Observatory flags the model for "Edge Decay Review."

---

## SECTION 9 — SOFTWARE MODULES

To ensure maintainability and separation of concerns, the Pine Script implementation will be structured into distinct logical modules. While Pine Script v5 does not support true object-oriented classes, it supports libraries and user-defined types (UDTs) which will be used to enforce modularity.

### 9.1 Module Breakdown
1.  **`MarketStateEngine` (Library):** Contains functions to compute EMAs, ADX, ATR, and session flags. Returns the `MarketState` UDT.
2.  **`ExecutionModels` (Library):** Contains the specific entry/exit logic for Models A1, A3, and B1. Each function takes a `MarketState` UDT as input and returns a `TradeProposal` UDT.
3.  **`DecisionEngine` (Library):** Contains the Edge Score calculation logic. Takes an array of `TradeProposal`s and returns a single `CandidateModel` UDT.
4.  **`RiskEngine` (Library):** Implements the 8 ARI rules. Takes the `CandidateModel` and the current strategy equity/drawdown, returning an `ApprovedTrade` UDT (or `na` if rejected).
5.  **`VerificationEngine` (Library):** Implements the 27 Pine-native TVL rules. Takes the `ApprovedTrade` and returns a `VerifiedSignal` UDT.
6.  **`ExecutionEngine` (Main Script):** Handles the `strategy.entry`, `strategy.exit`, and `alert()` calls. Parses the `VerifiedSignal` into the final JSON payload.
7.  **`Observatory` (External):** A separate Python/PostgreSQL service that receives data via a secondary webhook endpoint for logging.

---

## SECTION 10 — PINE SCRIPT IMPLEMENTATION PLAN

The translation of this specification into TradingView Pine Script v5 will follow a strict 10-phase roadmap. Each phase must be fully tested before proceeding to the next.

### Phase 1: Core Framework (Complexity: Low)
*   Define all User-Defined Types (UDTs): `MarketState`, `TradeProposal`, `CandidateModel`, `ApprovedTrade`.
*   Set up the basic strategy shell and time/session variables.

### Phase 2: Market State Engine (Complexity: Medium)
*   Implement all indicator calculations (EMA, ADX, ATR).
*   Implement the MVC boolean state flags.
*   *Test:* Verify MSO outputs match the Python research engine outputs for known historical dates.

### Phase 3: Execution Models (Complexity: High)
*   Code the entry and exit logic for A1, A3, and B1.
*   *Test:* Run each model in isolation. The Pine Script backtest results MUST exactly match the Python research engine results (N=134, PF=2.231 for B1).

### Phase 4: Decision Engine (Complexity: Medium)
*   Implement the 100-point Edge Score framework.
*   Implement the ranking and selection array logic.

### Phase 5: Atlas Risk Intelligence (Complexity: High)
*   Implement the 8 ARI rules, including the complex state tracking for consecutive losses and daily P&L.
*   *Test:* Verify that the system halts correctly after 2 consecutive losses and respects the daily loss limit.

### Phase 6: Trade Verification Layer (Complexity: Very High)
*   Implement the 27 Pine-native TVL rules.
*   Implement the `barstate.isrealtime` and `barstate.isconfirmed` guards.
*   *Test:* Attempt to force the strategy to generate invalid parameters; verify the TVL catches and blocks them.

### Phase 7: Alerts & JSON Formatting (Complexity: Low)
*   Construct the webhook JSON payload string dynamically.

### Phase 8: Webhook Testing (Complexity: Medium)
*   Deploy the external Webhook Receiver.
*   Fire test alerts from TradingView to verify schema validation and TradersPost routing.

### Phase 9: Paper Trading (Complexity: Medium)
*   Run the complete end-to-end system on live data using a Tradovate simulated account for 2 weeks.
*   Verify fill prices, slippage, and duplicate prevention.

### Phase 10: Live Deployment (Complexity: High)
*   Connect to Prop Firm and Live accounts.
*   Activate the system.

---

## SECTION 11 — FUTURE EXPANSION

The APS architecture is designed to be extensible without requiring a redesign of the core framework.

### 11.1 Adding New Execution Models
To add a new model (e.g., Model C1), an engineer only needs to:
1. Add the logic to the `ExecutionModels` module.
2. Add the model's historical parameters to the `DecisionEngine` calibration matrix.
The ADE, ARI, and TVL will automatically handle the new model without modification.

### 11.2 Machine Learning Integration
Future ML models (e.g., a neural network for Edge Score calculation) can replace the static `DecisionEngine` library by exposing an external API. The MSE would send the Market State Object to the external ML API, which would return the Edge Scores.

### 11.3 Multi-Market Support
Currently, Atlas is hardcoded for MNQ. To expand to ES or CL, the `MarketStateEngine` must be updated to support instrument-specific volatility baselines, and the `RiskEngine` must support dynamic point-value calculations. The TVL already supports multi-ticker validation (Rule C6-02).
