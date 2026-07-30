# A5 — Autonomous Research Classification
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Classification Framework

A system is classified as **Fully Autonomous** if it satisfies all four criteria without human intervention per research cycle:

1. **Observation** — The system detects a market behaviour from live data
2. **Hypothesis** — The system generates a testable hypothesis from the observation
3. **Experiment** — The system executes a backtest or statistical test
4. **Memory** — The system persists the finding and uses it in future cycles

A system is classified as **Partially Autonomous** if it satisfies criteria 2–4 but requires a human to initiate the observation or trigger the cycle.

A system is classified as **Execution-Only** if it has no research loop — it executes a fixed strategy without generating or testing new hypotheses.

---

## Classifications

### FULLY AUTONOMOUS

**OnePunchMonk/AgentQuant** — The most architecturally complete public autonomous research system found. Implements a genuine LangGraph ReAct loop: `analyze → hypothesize → backtest → reflect → store`. The agent autonomously detects market regime, generates strategy proposals via LLM or grid search, backtests them in a tournament, reflects on results, retries if below the Sharpe threshold, and persists accepted strategies to SQLite memory. The multi-agent swarm mode adds a Memory Agent, Regime Analyst, Strategy Specialists, Critic Agent, and Backtest Coordinator. Crucially, the authors report that their own rigorous walk-forward validation showed the LLM agent underperforming a static baseline (Sharpe 0.28 vs 0.71), demonstrating intellectual honesty consistent with DARWIN's doctrine.

**microsoft/RD-Agent** — Implements a full R→D loop for quantitative finance: a Research Agent proposes new factors or model modifications, a Development Agent implements them, and the system evaluates and iterates. Accepted at NeurIPS 2025. Achieves approximately 2× higher ARR than benchmark factor libraries at a cost under $10 per run. The loop is autonomous within a run but requires human configuration of the scenario.

**augiemazza/varrd** — Implements autonomous edge discovery with a domain-specific language for expressing market behaviours. The system runs 24/7 against live market data, detects when validated edges fire, and maintains a governed library with K-tracking (counting every test to prevent p-hacking), Bonferroni correction, cosine similarity for duplicate detection, and lookahead verification. This is the closest public analogue to DARWIN's evidence-gating philosophy.

---

### PARTIALLY AUTONOMOUS

**mdelaguera/trading-AgentQuant** — A fork/derivative of AgentQuant with LangChain/LangGraph agent architecture. Requires a human to configure the stock universe and trigger a run. The agent then handles all downstream work autonomously. No live-observation triggering.

**rmbell09-lang/tradesight** — Implements a rigorous strategy lifecycle (`Candidate → Backtest → Out-of-sample → Shadow paper → Qualified → Champion → Retired`) with evidence gates. Daily evaluation runs autonomously on new real data. However, full searches are evidence-triggered and require human review before promotion. Live trading is technically locked.

**HKUDS/Vibe-Trading** — A very large platform (28,646 stars, 1,114 commits) with a manual-first research loop. The system provides tools for hypothesis testing and backtesting but the research direction is human-driven. The platform is actively maintained with daily commits.

---

### EXECUTION-ONLY

**pixelwhiz/tasty-schwab-trader-BE** — A pure execution system. Runs EMA crossover, Supertrend, and 0DTE options strategies against live Databento data. No hypothesis generation, no finding storage, no research loop. The most MNQ-relevant system found, but architecturally the furthest from DARWIN's research model.

**lgreen95/M2K-MES-MNQ-Future-Trading** — Signal delivery service. No inspectable source code. Classified execution-only by default.

**virattt/ai-hedge-fund** — Multi-agent simulation for educational purposes. Agents represent named investors (Buffett, Munger, etc.) and generate trading signals. No autonomous research loop; no live execution.

---

## Classification Summary

| Repository | Classification | Loop Type | Trigger |
|-----------|---------------|-----------|---------|
| OnePunchMonk/AgentQuant | Fully Autonomous | ReAct (LangGraph) | Batch / manual start |
| microsoft/RD-Agent | Fully Autonomous | R→D iterative | Batch / scenario config |
| augiemazza/varrd | Fully Autonomous | Discovery + monitoring | Cron + live edge detection |
| mdelaguera/trading-AgentQuant | Partially Autonomous | LangChain agent | Human-triggered |
| rmbell09-lang/tradesight | Partially Autonomous | Evidence lifecycle | Daily cron + human gate |
| HKUDS/Vibe-Trading | Partially Autonomous | Manual-first | Human-driven |
| pixelwhiz/tasty-schwab-trader-BE | Execution-Only | Fixed strategy | Live data feed |
| lgreen95/M2K-MES-MNQ-Future-Trading | Execution-Only | Signal delivery | Unknown |
| virattt/ai-hedge-fund | Execution-Only | Agent simulation | Manual |

---

## Gap Finding

**No public system combines live-observation-triggered research with MNQ/CME futures native data.** Every fully autonomous research system found operates on equities. Every MNQ-native system found is execution-only. Atlas Nexus DARWIN occupies a unique position in this landscape: it is the only system identified that triggers research jobs from live MNQ observations, persists findings to a relational database, delivers notifications externally via Telegram, and commits daily reports to GitHub — all while keeping execution authority disabled.
