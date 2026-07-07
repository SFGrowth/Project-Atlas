# Sprint 020: Guardian Decision Engine

**Date:** 2026-07-07  
**Author:** Manus AI  
**Module:** Guardian Decision Engine v0.1  

## Executive Summary

Sprint 020 introduces the Guardian Decision Engine, the second module in the Atlas Three-Question Architecture. Guardian's responsibility is to maximise survival by consuming the outputs of the Market Regime Engine and deciding whether the current market environment justifies risking capital.

Guardian does not generate signals. It outputs one of four states: **PASS, REDUCE RISK, PAPER ONLY, or BLOCK**.

## Architecture & Integration

Guardian integrates directly with the frozen Market Regime Engine v1.0. It applies a series of hierarchical rules to the Tradeability Score, session context, and simulated drawdown state to produce a final decision.

### The Guardian Ruleset

1. **Outside RTH → BLOCK**  
   Any bar outside the Regular Trading Hours (09:30–16:00 ET) is automatically blocked.

2. **Zero Tradeability → BLOCK**  
   If the Regime Engine assigns a Tradeability Score of 0 (no compression, no expansion, poor location), Guardian blocks execution.

3. **High Risk State → PAPER ONLY**  
   If the system detects rapid downside momentum (a proxy for severe drawdown), Guardian downgrades the decision to Paper Only, preventing live capital loss during capitulation events.

4. **Session Context → REDUCE RISK**  
   During the Opening Auction (09:30–10:00 ET) and Lunch Session (12:00–13:30 ET), Guardian reduces risk to protect against noise and false breakouts.

5. **Low Tradeability → REDUCE RISK**  
   If the Tradeability Score is only 25, Guardian reduces risk.

6. **All Clear → PASS**  
   If the market is in RTH, Tradeability is 50+, no high-risk state exists, and the session is clear, Guardian issues a PASS.

## Impact Analysis (2-Year MNQ Dataset)

The Guardian Engine was run against the 2-year MNQ dataset (140,933 bars). The impact on the tradeable universe during Regular Trading Hours (40,058 bars) is profound:

| Guardian Decision | Bar Count | Percentage of RTH |
|---|---|---|
| **PASS** | 5,594 | 14.0% |
| **REDUCE RISK** | 18,136 | 45.3% |
| **PAPER ONLY** | 1,253 | 3.1% |
| **BLOCK** | 15,075 | 37.6% |

### Key Finding

Guardian blocked or downgraded 86% of all Regular Trading Hours bars. Only **14.0% of the market** was deemed safe for full-risk execution. 

This validates the core Atlas hypothesis: the majority of market action is noise, and capital preservation depends on standing down when conditions are sub-optimal. By restricting full-risk execution to the highest-quality 14% of the market, Atlas protects the trader from the chop that destroys prop firm evaluations.

## Sprint 021 Preparation: Out-of-Sample Validation

With the Regime Engine frozen at v1.0 and Guardian integrated, Atlas is now ready for **Sprint 021: Out-of-Sample Validation**.

In Sprint 021, the frozen v1.0 Regime Engine and Guardian Decision Engine will be run against a dataset they have never seen. No parameter tuning or optimisation will be permitted. The objective is to prove that the 14% of the market Guardian approves for PASS genuinely exhibits higher statistical expectancy than the 86% it restricts.
