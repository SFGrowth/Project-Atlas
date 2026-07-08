# Atlas Sprint 044 — Prop Firm Execution Layer
**Objective:** Determine which execution policy best governs competing opportunities under prop firm constraints.
**Date:** July 2026
**Status:** VALIDATED (Partial)

## 1. Executive Summary

Sprint 044 evaluated four portfolio execution policies across three risk levels ($400, $500, $800) to solve the Concurrent Execution Risk problem identified in Sprint 043. 

The hypothesis (H-PF001) that execution policy determines prop firm survivability is **VALIDATED**.

The data reveals that **Policy C (Priority Queue)** is the optimal execution policy for the Atlas portfolio. By resolving concurrent signal conflicts using a strict hierarchy of validated edge (BCS / expectancy), Policy C significantly outperforms the Baseline, the Single Active Strategy (SAS), and the Risk Budget policies.

However, the highest Topstep 50K pass rate achieved by Policy C was **42.6%** (at $800 risk). While this is a massive improvement over the 12.3% pass rate in Sprint 043, it remains below the 75% target required for full production promotion. The execution layer is now optimised, but the capital allocation layer (ARI) still requires milestone-based compounding to bridge the final gap.

## 2. Policy Performance Scorecard

All policies were evaluated over the standard 2-year MNQ backtest window. The table below shows the results at the optimal **$800 risk per trade** level.

| Policy | Topstep Pass Rate | Net Profit | Max Drawdown | Profit Factor | Daily Violations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Baseline** (No Policy) | 36.8% | $50,680 | -$14,621 | 1.222 | 44 |
| **Policy A** (SAS) | 37.0% | $36,292 | **-$7,345** | 1.228 | **23** |
| **Policy B** (Risk Budget) | 36.9% | $37,960 | -$11,593 | 1.219 | 51 |
| **Policy C** (Priority Queue) | **42.6%** | **$69,854** | -$11,593 | **1.370** | 51 |
| **Policy D** (Hybrid) | 36.9% | $37,960 | -$11,593 | 1.219 | 51 |

## 3. The Critical Discovery: Priority Queue vs SAS

The most surprising finding of the sprint is the outperformance of Policy C (Priority Queue) over Policy A (Single Active Strategy).

The initial assumption in Sprint 043 was that a strict SAS rule (only one model active at a time) was required to survive prop firm daily loss limits. The data disproves this.

While SAS (Policy A) did successfully reduce the absolute drawdown to -$7,345 and cut daily limit violations in half, it did so by indiscriminately blocking trades. If a low-expectancy A1 trade was active, it would block a high-expectancy A3 breakout from firing.

**Policy C (Priority Queue)** takes a different approach. When models conflict, it ranks them by their Behaviour Confidence Score (A3 > A2 > A1) and executes the highest-ranked opportunity. It allows concurrent trades *only* if they are the highest-quality signals. 

This approach preserved the highest-expectancy trades, resulting in a massive increase in Net Profit ($69,854 vs $36,292 for SAS) and Profit Factor (1.37 vs 1.22), which ultimately translated into a higher prop firm pass rate (42.6% vs 37.0%), despite experiencing deeper absolute drawdowns.

## 4. The Risk Level Contradiction

A second counter-intuitive finding emerged regarding position sizing.

Conventional wisdom suggests that lowering risk per trade increases prop firm pass rates by avoiding the daily loss limit. The data shows the exact opposite:

| Policy C Risk Level | Topstep Pass Rate | Apex Pass Rate | Net Profit |
| :--- | :--- | :--- | :--- |
| **$400 per trade** | 41.1% | 52.8% | $32,777 |
| **$500 per trade** | 35.8% | 46.5% | $42,903 |
| **$800 per trade** | **42.6%** | **58.9%** | **$69,854** |

**Why does $800 risk pass more often than $500 risk?**
Because the Topstep trailing drawdown is calculated end-of-day. At $500 risk, the system takes too long to reach the $3,000 profit target (Avg 12 days). The longer the system stays in the evaluation, the more exposure it has to a sequence of losses that hits the trailing drawdown. At $800 risk, the system reaches the profit target much faster (Avg 6 days), "outrunning" the trailing drawdown, even though it risks hitting the daily loss limit.

## 5. Strategic Implications & Next Steps

**Policy C (Priority Queue) is promoted** as the permanent execution policy for the Atlas Trading System.

However, the 42.6% pass rate indicates that static risk sizing ($800) is still mathematically inefficient for prop firm constraints. The system needs to combine the high pass rate of large risk ($800) with the survivability of low risk ($400).

**Recommended Next Sprint:** Sprint 045 — **ARI v3.0 (Milestone Compounding)**. 
Atlas will integrate Policy C into ARI and engineer a dynamic compounding layer: start evaluations at $400 risk to survive the initial variance, and scale to $800 risk only after a $1,500 profit buffer is established. This is the final step to breach the 75% pass rate target.
