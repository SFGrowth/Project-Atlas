# Sprint 020b: Guardian Controlled Experiment

**Date:** 2026-07-07  
**Author:** Manus AI  
**Module:** Guardian Decision Engine v0.2  

## Executive Summary

Sprint 020b was designed to prove Guardian's independent contribution to the Atlas OS. A scientifically controlled experiment was run: **Experiment A** tested the validated Atlas Strategy components without Guardian, while **Experiment B** tested the exact same components with Guardian enabled.

The results were completely identical. Guardian did not block a single trade that passed the underlying regime filters. 

Rather than manufacturing success, Atlas recorded the truth. This negative result is highly valuable, as it revealed two fundamental architectural truths about the current state of the platform.

## Experimental Design

The experiment used only the validated components from Sprints 018 and 019:
- Volatility Compression (ATR ratio ≤ 0.7)
- VWAP Deviation (≤ 1.5 ATR)
- EMA21 Proximity Pullback (price within 0.5 ATR of EMA21 during trend)
- 0.75 ATR Stop / 1.5 ATR Target

Guardian v0.2 was built as a Risk Intelligence Engine, computing six independent component scores (Market Regime, Confidence, Volatility, Session, Drawdown Health, Daily Risk) and aggregating them into an Overall Risk Score. A score of ≥ 75 was required for a `PASS` decision.

## Guardian Contribution Analysis

If Guardian did not exist, how would Atlas have performed?

| Metric | Exp A (No Guardian) | Exp B (Guardian Enabled) |
|---|---|---|
| **Trade Count** | 48 | 48 |
| **Win Rate (%)** | 8.3 | 8.3 |
| **Net Profit ($)** | -1,858.0 | -1,858.0 |
| **Profit Factor** | 0.150 | 0.150 |
| **Expectancy ($)** | -38.71 | -38.71 |
| **Max Drawdown ($)** | -1,824.0 | -1,824.0 |

**Hypothesis:** Guardian improves the robustness of the validated Atlas Strategy.  
**Result:** **REJECTED**

Guardian did not improve the strategy. The performance was identical.

## Two Architectural Truths Discovered

This negative result successfully identified two major issues that dictate the future roadmap of Atlas OS.

### Finding 1: The Execution Signal Lacks Edge
The current execution signal (EMA21 proximity pullback) produced a Profit Factor of 0.15 with an 8.3% win rate over 48 trades. The validated components discovered so far (compression and VWAP proximity) are necessary conditions, but they are not sufficient to produce a production-quality execution module. The execution signal itself does not possess a statistical edge.

### Finding 2: Guardian is Acting as a Second Regime Engine
Guardian blocked 0 trades because its current scoring model relies heavily on the same inputs as the Regime Engine (ATR ratio, VWAP deviation). By the time a signal passes the Regime Engine filters, it automatically passes Guardian. Guardian is currently measuring market characteristics rather than independent risk factors.

## The New Direction: Three Independent Research Streams

Because of these findings, Atlas is separating the problem into three completely independent research streams:

**Research Stream A — Market Understanding**  
Continue improving the Market Regime Engine. Its purpose is to answer: *"What market are we currently in?"*

**Research Stream B — Execution Research**  
Pause assumptions about inherited methodologies (e.g., Thomas Wade). Begin researching execution from first principles. Treat entries as hypotheses (pullbacks, sweeps, breakouts, mean reversion) and let them compete on evidence alone.

**Research Stream C — Capital Preservation**  
Redesign Guardian into a true Risk Intelligence Engine. Guardian must consume information unavailable to the Regime Engine: consecutive losses, daily/weekly drawdown, prop firm trailing drawdown limits, live vs evaluation mode, and position sizing. Guardian's responsibility is capital allocation, not market classification.

Atlas earns trust by telling the truth, even when the truth is disappointing. This discipline is what makes Atlas a quantitative research platform rather than an optimisation project.
