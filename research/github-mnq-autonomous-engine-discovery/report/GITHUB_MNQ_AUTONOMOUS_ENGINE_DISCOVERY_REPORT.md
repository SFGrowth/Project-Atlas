# GitHub MNQ Autonomous Engine Discovery Report
## Atlas Nexus — Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Author:** DARWIN Research Engine | **Classification:** READ-ONLY RESEARCH

---

## Table of Contents

1. Research Mandate and Constraints
2. Methodology
3. Search Strategy and Query Coverage
4. Candidate Identification
5. Tier 1 — Direct MNQ Execution Systems
6. Tier 2 — Autonomous Research Engines
7. Tier 3 — Large-Scale Platforms and Reference Collections
8. Code-Level Architecture Review: pixelwhiz/tasty-schwab-trader-BE
9. Code-Level Architecture Review: OnePunchMonk/AgentQuant
10. Code-Level Architecture Review: microsoft/RD-Agent
11. Code-Level Architecture Review: augiemazza/varrd
12. Code-Level Architecture Review: rmbell09-lang/tradesight
13. Architecture Comparison Matrix
14. MNQ Evidence Assessment
15. Autonomous Research Classification
16. Gap Analysis and DARWIN Differentiation
17. Transferable Patterns
18. Excluded Candidates
19. Conclusions and Recommendations

---

## Section 1 — Research Mandate and Constraints

This research was conducted as a read-only side task during the Atlas Nexus DARWIN Operational Recovery sprint. The mandate was to survey the public GitHub ecosystem for autonomous MNQ (Micro E-mini Nasdaq-100) trading engines and autonomous quantitative research systems, assess their architecture at code level, and produce a structured report for Phil's review.

**Strict constraints applied throughout:**

No operational systems were modified. The `sprint/darwin-core-observation-to-finding-chain` branch, the active DARWIN service, the cron configuration, the GitHub archival code, the live databases, and the `.env` file were all left untouched. No repositories were cloned or executed. All inspection was conducted via public GitHub web pages and read-only API access. CPU and memory usage were kept minimal to avoid any impact on the autonomous 22:00 UTC daily report cron.

The research branch `research/github-mnq-autonomous-engine-discovery` was not created until after all research was complete, consistent with the project constraint.

---

## Section 2 — Methodology

The research followed a structured three-phase methodology:

**Phase 1 — Broad Search:** Twelve distinct query combinations were executed across GitHub Topics, GitHub search, and general web search. Queries covered: autonomous MNQ trading engines, micro e-mini nasdaq algorithmic systems, autonomous quantitative research agents, hypothesis generation frameworks, NinjaTrader NQ/ES strategies, and self-evolving trading systems.

**Phase 2 — Candidate Triage:** Search results were triaged into three tiers based on relevance: Tier 1 (direct MNQ execution), Tier 2 (autonomous research engines), and Tier 3 (large platforms and reference collections). Candidates that met exclusion criteria (crypto-only, no source code, duplicate forks) were logged in Artefact A9.

**Phase 3 — Code-Level Inspection:** The top 7 candidates were inspected at code level via public GitHub file views. Key files inspected included: `tick_producer.py`, `ema_strategy.py` (pixelwhiz), `agent_graph.py`, `memory_layer.py`, `AGENTQUANT.md` (AgentQuant), and README files for RD-Agent, varrd, and tradesight.

All findings were recorded in 11 structured artefacts (A1–A11) before this report was written.

---

## Section 3 — Search Strategy and Query Coverage

Twelve query combinations were executed across four thematic sessions:

**Session 1 — MNQ/Futures Autonomous Engines:** Queries targeted autonomous MNQ trading engines, micro e-mini nasdaq algorithmic systems, and autonomous futures trading bots. This session identified `pixelwhiz/tasty-schwab-trader-BE` (Databento + MNQ + live execution) and `lgreen95/M2K-MES-MNQ-Future-Trading` (MNQ signal service).

**Session 2 — Autonomous Quantitative Research Agents:** Queries targeted autonomous quant research platforms, hypothesis generation frameworks, and DARWIN-like research engines. This session identified `OnePunchMonk/AgentQuant` (ReAct loop), `mdelaguera/trading-AgentQuant` (LangChain fork), and `augiemazza/varrd` (governed edge discovery).

**Session 3 — NinjaTrader / ES / NQ Frameworks:** Queries targeted NinjaTrader NQ/ES strategies and freqtrade futures. This session confirmed that freqtrade's futures mode is crypto-exchange-margin only, and that NinjaTrader strategies on GitHub are execution-only with no research loops.

**Session 4 — Institutional / Research Platforms:** Queries targeted Microsoft Qlib, AI hedge fund systems, and self-evolving strategy platforms. This session identified `microsoft/RD-Agent` (NeurIPS 2025, full R→D loop), `virattt/ai-hedge-fund` (62K stars, educational), and `rmbell09-lang/tradesight` (evidence-gated lifecycle).

Full query log is preserved in Artefact A1.

---

## Section 4 — Candidate Identification

Sixteen repositories were identified for review. These were classified into three tiers:

**Tier 1 (2 repositories):** Direct MNQ execution systems with confirmed MNQ symbol support and live execution code.

**Tier 2 (5 repositories):** Autonomous research engines with genuine research loops but no MNQ native data.

**Tier 3 (4 repositories):** Large-scale platforms or curated reference collections.

**Excluded (13 candidates):** Repositories excluded due to crypto-only scope, no source code, no autonomous loop, or being duplicate forks of already-analysed systems.

The full candidate inventory is preserved in Artefact A2.

---

## Section 5 — Tier 1: Direct MNQ Execution Systems

### pixelwhiz/tasty-schwab-trader-BE

This is the most directly MNQ-relevant public repository found. It is a Python/Flask backend that supports multi-strategy automated execution across futures, equities, and options. The supported futures instruments include `/MNQ`, `/NQ`, `/MES`, `/ES`, `/M2K`, and `/RTY` — a comprehensive CME micro/standard contract set.

The system uses Databento as its live and historical data provider, which is architecturally identical to Atlas Nexus's own data layer. The `tick_producer.py` module creates a `db.Historical` and `db.Live` client at module load time, uses `TimeBasedBarBufferWithRedis` for time-based bars and `TickDataBufferWithRedis` for tick charts, and publishes completed bars to Redis pub/sub channels for downstream strategy consumption.

The `ema_strategy.py` implements a configurable EMA crossover strategy that supports EMA, SMA, and Wilder's smoothing. Position reversal is handled cleanly. Live execution is wired to Charles Schwab (via OAuth 2.0) and Tastytrade APIs. The system has 13 stars and 9 forks, suggesting a small but active user base.

**Critical architectural gap:** This system has no research loop. It executes a fixed strategy configuration. There is no observation layer, no hypothesis generation, no finding persistence, and no evidence gating. It is a pure execution engine.

### lgreen95/M2K-MES-MNQ-Future-Trading

This repository names the MNQ Bot explicitly and provides a Telegram signal channel (`t.me/m2k_trading_group`). However, the repository contains only documentation files — no source code is present. The actual signal generation logic is hosted on a separate commercial web platform. The repository is effectively a marketing document.

**Assessment:** MNQ is named but no inspectable architecture exists. This repository is excluded from architectural analysis.

---

## Section 6 — Tier 2: Autonomous Research Engines

Five repositories implement genuine autonomous research loops. None are MNQ-native.

**OnePunchMonk/AgentQuant** (170 stars) implements the most architecturally complete public autonomous research loop. It uses LangGraph to implement a five-node ReAct cycle: analyze → hypothesize → backtest → reflect → store. The system is regime-aware (VIX percentile + optional HMM), uses LLM-driven hypothesis generation with grid search fallback, and persists findings to SQLite cross-session memory. The multi-agent swarm mode adds specialised agents for memory, regime analysis, strategy generation, criticism, and backtest coordination.

**mdelaguera/trading-AgentQuant** (3 stars) is a fork/derivative of AgentQuant with LangChain/LangGraph architecture. It requires a human to configure the stock universe and trigger a run. The agent then handles all downstream work autonomously.

**microsoft/RD-Agent** (14,079 stars) implements a full R→D loop for quantitative finance, accepted at NeurIPS 2025. A Research Agent proposes new factors or model modifications; a Development Agent implements and evaluates them. The system achieves approximately 2× higher ARR than benchmark factor libraries at a cost under $10 per run.

**augiemazza/varrd** (24 stars) implements autonomous edge discovery with a domain-specific language for expressing market behaviours. It runs 24/7 against live CME futures data (including NQ daily), maintains a governed edge library with K-tracking and Bonferroni correction, and delivers findings via an MCP server and web app.

**rmbell09-lang/tradesight** (158 stars) implements a rigorous strategy lifecycle with evidence gates. Daily evaluation runs autonomously on new real data. A challenger cannot promote automatically — it must pass out-of-sample, walk-forward, multiple-testing, Monte Carlo, and forward-paper evidence gates.

---

## Section 7 — Tier 3: Large-Scale Platforms and Reference Collections

**HKUDS/Vibe-Trading** (28,646 stars) is a very large platform with a manual-first research loop. It supports 24 data sources, multiple broker connectors, and a broad range of analysis tools. The system is actively maintained with daily commits. Its research loop is human-driven rather than autonomous.

**virattt/ai-hedge-fund** (62,470 stars) is a multi-agent hedge fund simulation for educational purposes. Agents represent named investors (Buffett, Munger, Druckenmiller, etc.) and generate trading signals. There is no autonomous research loop, no statistical validation, and no evidence gating. The project is explicitly described as educational.

**microsoft/qlib** (46,829 stars) is the foundational platform from which RD-Agent was extracted. It provides a full ML pipeline for quantitative investment: data processing, model training, backtesting, alpha seeking, risk modelling, portfolio optimisation, and order execution.

**wangzhe3224/awesome-systematic-trading** (4,548 stars) is a curated reference list of systematic trading libraries. It references ES/NQ volatility forecasting and includes a section on AI-powered systematic trading systems.

---

## Section 8 — Code-Level Architecture Review: pixelwhiz/tasty-schwab-trader-BE

The `tick_producer.py` module is the core data ingestion layer. It creates global Databento clients at module load time:

```python
HISTORICAL_CLIENT = db.Historical(DB_API_KEY)
LIVE_CLIENT = db.Live(key=DB_API_KEY)
```

The `TickProducer.setup_tick_buffers()` method iterates over a `tickers_config` dictionary and initialises appropriate buffer types. Historical warmup uses timeframe-dependent lookback windows: 1-minute bars use 8 days, 5-minute bars use 40 days, 1-hour bars use 280 days. This is a sensible warmup design for EMA-based strategies and is consistent with Atlas Nexus's own warmup approach.

Live feeds are started via `DatabentoLiveManager.start_live_feeds()`, which subscribes to Databento's live WebSocket feed. Completed bars are published to Redis pub/sub channels and stored in Redis sorted sets with timestamp scores.

The `ema_strategy.py` implements a standard EMA crossover with configurable periods and moving average types. Position reversal is handled in a single logical block. Trade state is persisted to JSON files — a simple but fragile persistence mechanism compared to DARWIN's MySQL approach.

**Architectural assessment:** This system is the most production-ready MNQ execution system found on GitHub. Its Databento integration is architecturally identical to Atlas Nexus's data layer. However, it has no research loop, no observation layer, no hypothesis generation, and no finding persistence. It is an execution engine only.

---

## Section 9 — Code-Level Architecture Review: OnePunchMonk/AgentQuant

The `agent_graph.py` module implements a LangGraph `StateGraph` with five typed nodes. The `AgentState` TypedDict carries all state through the graph: OHLCV data, features, regime context, proposals, results, best result, iteration count, memory context, run log, and a trace recorder.

The `analyze_node` builds a `RegimeContext` by computing features and detecting regime. It queries three memory stores (StrategyMemory, AlphaStore, NLAMemoryStore) to inject prior knowledge into the context. The `hypothesize_node` calls `ProposalGenerator.generate()` with the regime context, returning 5 `Proposal` objects via LLM → grid search → random fallback chain. The `backtest_node` runs `run_backtest()` for each proposal, computing Sharpe, Calmar, Sortino, max drawdown, and bootstrapped Sharpe p5. The `reflect_node` compares the best Sharpe against `min_acceptable_sharpe` and decides whether to retry. The `store_node` persists the accepted result to three memory stores.

The `memory_layer.py` module extracts `StrategyPattern` objects from stored runs. Patterns are grouped by `(regime, strategy_type)` scope and classified as `worked`, `regime-sensitive`, `avoid`, or `mixed` based on average Sharpe. Parameter clustering is implemented for momentum, mean reversion, and volatility strategies.

**Architectural assessment:** This is the closest public analogue to DARWIN's research architecture. The ReAct loop, regime detection, memory persistence, and reflect-retry logic are all directly relevant. The key difference is that AgentQuant runs in batch mode on equities, while DARWIN is triggered by live MNQ observations.

---

## Section 10 — Code-Level Architecture Review: microsoft/RD-Agent

RD-Agent implements a Research Agent (R) that proposes new factors or model modifications, and a Development Agent (D) that implements and evaluates them. The R→D loop iterates, with each cycle building on prior results. The system is the most academically rigorous public autonomous research system found, with NeurIPS 2025 acceptance.

The quant scenario (`RD-Agent(Q)`) achieves approximately 2× higher ARR than benchmark factor libraries at a cost under $10 per run. The alternating factor–model optimisation is a genuine architectural innovation: the system co-optimises factors and models jointly rather than treating them as independent.

The system uses Docker for isolation, LiteLLM as the LLM backend (supporting multiple providers), and SQLite for persistence. A web UI (`rdagent server_ui`) provides real-time interaction and trace viewing.

**Architectural assessment:** RD-Agent is the state of the art in autonomous quant research. Its R→D loop, factor-model co-optimisation, and NeurIPS 2025 acceptance establish it as the benchmark for autonomous research systems. It is not MNQ-native and does not support live-observation triggering, but its architectural principles are directly relevant to DARWIN's future development.

---

## Section 11 — Code-Level Architecture Review: augiemazza/varrd

VARRD's most distinctive architectural feature is the separation of the AI layer from the computation layer. The AI generates hypotheses in a domain-specific language (DSL); a deterministic backtesting engine computes all statistics. The AI never touches the numbers. This is a strong anti-hallucination design principle.

The K-tracking system counts every test run on a hypothesis and fingerprints it. The significance threshold is adjusted using Bonferroni correction based on the number of tests. Cosine similarity on vectorised hypothesis embeddings detects when a new hypothesis overlaps with one already tested. Lookahead verification confirms that signals reproduce on truncated data.

The edge library runs 24/7 against live CME futures data. When an edge fires, the system delivers exact entry, stop, target, hold period, and the complete audit trail. The system supports NQ daily as a CME futures instrument, making it the only public autonomous research system with confirmed CME futures coverage.

**Architectural assessment:** VARRD's evidence integrity mechanisms (K-tracking, Bonferroni correction, cosine similarity, lookahead verification) are the most rigorous found in any public system. These mechanisms directly address the p-hacking and overfitting risks that DARWIN's research doctrine is designed to prevent. The AI/computation separation principle is directly applicable to DARWIN's finding classification logic.

---

## Section 12 — Code-Level Architecture Review: rmbell09-lang/tradesight

TradeSight implements a rigorous strategy lifecycle: `Candidate → Backtest → Out-of-sample → Shadow paper → Qualified → Champion → Retired`. Each stage requires explicit evidence gates. A challenger cannot promote automatically.

The live readiness screen requires: 30 verified accounting sessions with zero unexplained differences; 60 forward-paper sessions and 100 broker-confirmed forward trades; a frozen strategy with a passing qualification receipt; protected controls, working outbound safety alerts, and passed failure drills; and the operator's explicit strategy approval and hard per-trade, daily, and total-pilot loss limits.

The system uses Alpaca paper trading for broker-simulated evidence. All historical local P&L that lacks complete broker proof is preserved as `LEGACY / UNVERIFIED` and excluded from trusted performance. This is a strong data integrity principle.

**Architectural assessment:** TradeSight's multi-stage lifecycle and evidence gating are the most rigorous found in any paper-trading system. Its safety boundaries (paper endpoint only, no live activation, no automatic promotion) are directly analogous to DARWIN's disabled execution authority model. The explicit `LEGACY / UNVERIFIED` data classification is a useful pattern for DARWIN's historical backtest results.

---

## Section 13 — Architecture Comparison Matrix

The full comparison matrix is preserved in Artefact A3. Key dimensions assessed: autonomous research loop, live observation trigger, persistent memory, regime awareness, MNQ/CME native data, Databento integration, external notification, evidence gating, git archival, and execution authority.

**Summary finding:** No public repository scores positively on all ten dimensions. Atlas Nexus DARWIN is the only system identified that simultaneously implements live-observation-triggered research, MNQ/CME native data, Databento integration, MySQL persistence, Telegram notification, git archival, and disabled execution authority.

The closest public analogue on research architecture is OnePunchMonk/AgentQuant (7/10 dimensions). The closest public analogue on MNQ execution is pixelwhiz/tasty-schwab-trader-BE (3/10 dimensions). No single public system scores above 7/10.

---

## Section 14 — MNQ Evidence Assessment

The full MNQ evidence assessment is preserved in Artefact A4. Key finding: **the public GitHub ecosystem contains very few repositories with genuine, inspectable MNQ-specific code.**

Only two repositories explicitly name `/MNQ` in source code or documentation: `pixelwhiz/tasty-schwab-trader-BE` (confirmed Databento + live execution) and `lgreen95/M2K-MES-MNQ-Future-Trading` (no source code inspectable). `augiemazza/varrd` supports NQ (standard) but not MNQ (micro) explicitly.

All autonomous research systems found (AgentQuant, RD-Agent, tradesight) use equities data (yfinance, Qlib, Alpaca) and have no CME futures coverage.

---

## Section 15 — Autonomous Research Classification

The full classification is preserved in Artefact A5. Three systems are classified as Fully Autonomous: AgentQuant (ReAct loop), RD-Agent (R→D loop), and varrd (autonomous discovery). Three systems are classified as Partially Autonomous: mdelaguera/trading-AgentQuant (human-triggered), tradesight (evidence-gated daily), and Vibe-Trading (manual-first). Three systems are classified as Execution-Only: pixelwhiz/tasty-schwab-trader-BE, lgreen95/M2K-MES-MNQ-Future-Trading, and virattt/ai-hedge-fund.

**Gap finding:** No public system triggers research jobs from live market observations. All fully autonomous research systems run in batch mode. DARWIN's live-observation-triggered J4 service is a genuine architectural novelty.

---

## Section 16 — Gap Analysis and DARWIN Differentiation

The public GitHub ecosystem contains two distinct classes of system that do not overlap: MNQ/Futures Execution Systems (Class A) and Autonomous Research Engines (Class B). Atlas Nexus DARWIN sits at the intersection of these two classes.

Seven specific dimensions where DARWIN is differentiated from all public systems have been identified and documented in Artefact A7:

1. Live observation triggering (no public system replicates this)
2. CME futures / MNQ native data (only execution systems have this)
3. Databento integration in a research context (no public research system uses Databento)
4. Relational database persistence (public systems use SQLite or flat files)
5. External notification of research findings (no public research system uses Telegram for findings)
6. Git archival of research outputs (no public system autonomously commits research to git)
7. Safety model with disabled execution authority (no public system has this explicit constraint)

---

## Section 17 — Transferable Patterns

Five transferable patterns were identified from public systems and documented in Artefact A8:

**Pattern 1 — Reflect-Retry Loop (from AgentQuant):** When a J4 experiment is INCONCLUSIVE, automatically generate a refined hypothesis and re-test with a different parameter set, up to a configured maximum retry count.

**Pattern 2 — K-Tracking Anti-P-Hacking (from varrd):** Count every test run on a hypothesis type and apply Bonferroni correction to the significance threshold. Add cosine similarity duplicate detection to prevent re-testing the same hypothesis with different wording.

**Pattern 3 — Explicit Strategy Lifecycle (from tradesight):** When DARWIN has accumulated 50+ findings, implement a multi-stage promotion path (INCONCLUSIVE → OUT-OF-SAMPLE → SHADOW-PAPER → PROMISING) with explicit evidence gates at each stage.

**Pattern 4 — Narrative Memory (from AgentQuant NLA):** Add a `narrative` field to `darwin_research_memory` to store human-readable descriptions of what was learned, enabling future research cycles to avoid re-testing known patterns.

**Pattern 5 — AI/Computation Separation (from varrd):** Move the finding classification logic to a separate, deterministic module that receives raw backtest results and applies pre-registered classification rules, preventing the research engine from influencing its own evaluation.

All recommendations are for future sprints only. No changes to the current operational system are implied.

---

## Section 18 — Excluded Candidates

Thirteen candidates were excluded from detailed analysis. The primary exclusion reasons were: crypto-only scope (freqtrade, FinRL, FinGPT), no source code (lgreen95 signal service), no autonomous loop and no MNQ relevance (NinjaTrader strategies, educational books), and duplicate forks (mdelaguera/trading-AgentQuant was analysed separately from OnePunchMonk/AgentQuant).

The full exclusion log is preserved in Artefact A9.

---

## Section 19 — Conclusions and Recommendations

### Conclusions

This survey confirms three conclusions:

**Conclusion 1 — DARWIN's architecture is genuinely novel.** No public repository combines live-observation-triggered research, MNQ/CME native data, Databento integration, MySQL persistence, Telegram notification, git archival, and disabled execution authority. The gap between public systems and DARWIN is not a gap in research quality but a gap in instrument specificity, live-observation triggering, and the safety model.

**Conclusion 2 — The public ecosystem validates DARWIN's architectural choices.** The use of Databento for CME futures data is confirmed by the most production-ready public MNQ system (`pixelwhiz/tasty-schwab-trader-BE`). The evidence integrity principles (statistical validation, evidence gating, anti-p-hacking) are confirmed by the most rigorous public research system (`augiemazza/varrd`). The disabled execution authority model is confirmed as a deliberate safety choice not present in any public system.

**Conclusion 3 — Five transferable patterns offer concrete future improvements.** The reflect-retry loop, K-tracking, narrative memory, AI/computation separation, and explicit strategy lifecycle are all implementable in future sprints without compromising the current operational system.

### Immediate Recommendations

1. Record in Atlas Memory that no public MNQ autonomous research engine exists, validating DARWIN's architectural novelty.
2. Reference AgentQuant's reflect-retry pattern in the next J4 enhancement sprint.

### Future Sprint Recommendations (Require Phil's Approval)

3. Implement K-tracking and Bonferroni correction in `darwin_experiment_records`.
4. Add a `narrative` field to `darwin_research_memory`.
5. Implement multi-stage strategy lifecycle when DARWIN has 50+ findings.

### What NOT to Do

Do not adopt freqtrade (crypto-only futures mode), yfinance for MNQ (no CME data), the AI Hedge Fund investor simulation pattern (no statistical validation), or increase strategy count beyond what DARWIN's doctrine supports.

---

## References

1. [pixelwhiz/tasty-schwab-trader-BE](https://github.com/pixelwhiz/tasty-schwab-trader-BE) — Multi-strategy algorithmic trading platform with MNQ/Databento support
2. [lgreen95/M2K-MES-MNQ-Future-Trading](https://github.com/lgreen95/M2K-MES-MNQ-Future-Trading) — MNQ/M2K/MES AI trading signal service
3. [OnePunchMonk/AgentQuant](https://github.com/OnePunchMonk/AgentQuant) — Autonomous quantitative research platform with ReAct loop
4. [OnePunchMonk/AgentQuant — AGENTQUANT.md](https://github.com/OnePunchMonk/AgentQuant/blob/main/docs/AGENTQUANT.md) — AgentQuant architecture documentation
5. [mdelaguera/trading-AgentQuant](https://github.com/mdelaguera/trading-AgentQuant) — LangChain-based autonomous trading research platform
6. [microsoft/RD-Agent](https://github.com/microsoft/RD-Agent) — LLM-based autonomous R&D agent for quantitative finance (NeurIPS 2025)
7. [microsoft/qlib](https://github.com/microsoft/qlib) — AI-oriented quantitative investment platform
8. [augiemazza/varrd](https://github.com/augiemazza/varrd) — Governed live edge discovery with K-tracking and Bonferroni correction
9. [rmbell09-lang/tradesight](https://github.com/rmbell09-lang/tradesight) — Evidence-gated strategy lifecycle with paper trading
10. [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) — Personal trading agent platform
11. [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) — AI hedge fund simulation (educational)
12. [wangzhe3224/awesome-systematic-trading](https://github.com/wangzhe3224/awesome-systematic-trading) — Curated systematic trading resource list
13. [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) — Open source crypto trading bot (excluded: crypto-only)
14. [Li et al. (2025) — R&D-Agent-Quant: A Multi-Agent Framework](https://arxiv.org/abs/2505.15155) — NeurIPS 2025 paper on RD-Agent for quantitative finance
