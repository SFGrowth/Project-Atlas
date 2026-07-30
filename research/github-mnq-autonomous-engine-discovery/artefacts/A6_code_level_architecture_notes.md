# A6 — Code-Level Architecture Notes
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## pixelwhiz/tasty-schwab-trader-BE — Detailed Architecture

**Language:** Python | **Framework:** Flask + asyncio | **Data:** Databento | **Broker:** Schwab + Tastytrade

### Data Pipeline

The `tick_producer.py` module is the core data ingestion layer. It creates a single `HISTORICAL_CLIENT` and `LIVE_CLIENT` from the Databento SDK at module load time. The `TickProducer.setup_tick_buffers()` method iterates over a `tickers_config` dictionary, determines whether each symbol uses tick-based or time-based bars, and initialises a `TimeBasedBarBufferWithRedis` or `TickDataBufferWithRedis` accordingly.

Historical warmup uses `warmup_with_historical_timebars()` or `warmup_with_historical_ticks()`, which fetches a lookback window from Databento's historical API. The lookback window is timeframe-dependent: 1-minute bars use 8 days, 5-minute bars use 40 days, 1-hour bars use 280 days. This is a sensible warmup design for EMA-based strategies.

Live feeds are started via `DatabentoLiveManager.start_live_feeds()`, which subscribes to Databento's live WebSocket feed. Completed bars are published to Redis pub/sub channels (`tick_bars:{ticker}`) and stored in Redis sorted sets (`bars_history:{strategy}{ticker}`).

### Strategy Execution

The `ema_strategy.py` module implements a standard EMA crossover: fast EMA crosses above slow EMA → long; fast EMA crosses below slow EMA → short. The strategy supports configurable EMA periods, SMA, and Wilder's smoothing. Position reversal is handled cleanly: when a long is open and a short signal fires, the system closes the long and opens the short in a single logical block.

The strategy is stateless between calls — trade state is persisted to JSON files in `trades/ema/`. This is a simple but fragile persistence mechanism (no atomic writes, no crash recovery).

### Architectural Gaps Relative to DARWIN

1. **No observation layer** — The system executes a fixed strategy; it does not detect or record market observations.
2. **No hypothesis generation** — Strategy parameters are configured statically; no automated parameter search.
3. **No finding persistence** — Results are not stored in a queryable database; only trade JSON files.
4. **No research memory** — No cross-session learning or pattern recall.
5. **No evidence gating** — No statistical validation before a strategy is deployed.
6. **No notification of findings** — Telegram is used only for signal delivery, not research findings.
7. **No git archival** — No autonomous commit of research outputs.

---

## OnePunchMonk/AgentQuant — Detailed Architecture

**Language:** Python | **Framework:** LangGraph + LangChain | **Data:** yfinance + FRED | **Memory:** SQLite

### ReAct Loop (agent_graph.py)

The `AgentState` TypedDict flows through five nodes in a LangGraph `StateGraph`:

1. **`analyze_node`** — Calls `compute_features()` and `detect_regime()` to build a `RegimeContext`. Queries `StrategyMemory`, `AlphaStore`, and `NLAMemoryStore` to inject prior knowledge into the context. Emits a trace event.

2. **`hypothesize_node`** — Calls `ProposalGenerator.generate()` with the regime context. The generator tries LLM (Gemini/OpenAI) first, falls back to grid search, then random sampling. Returns 5 `Proposal` objects with parameters, confidence, and reasoning.

3. **`backtest_node`** — Runs `run_backtest()` for each proposal. Computes Sharpe, Calmar, Sortino, max drawdown, and bootstrapped Sharpe p5. Sorts by Sharpe. The `WarmupEnforcer` (ancestor of the `peek` library) prevents look-ahead bias by enforcing minimum warmup periods.

4. **`reflect_node`** — Compares best Sharpe against `min_acceptable_sharpe` (default 0.3). If below threshold and iterations remain, sets `should_continue=True` to loop back to `hypothesize_node`. If at max iterations, accepts best available.

5. **`store_node`** — Persists the accepted result to `StrategyMemory` (SQLite), `AlphaStore` (SQLite alpha candidates), and `NLAMemoryStore` (explicit narrative memory). Records `run_id`, `alpha_id`, and `record_id`.

### Memory Layer (memory_layer.py)

The `AgenticMemoryLayer` class extracts `StrategyPattern` objects from stored runs. Patterns are grouped by `(regime, strategy_type)` scope. For each scope, the layer computes average Sharpe, best Sharpe, and a verdict (`worked` / `regime-sensitive` / `avoid` / `mixed`). Parameter clustering is implemented for momentum (slow_window buckets), mean reversion (window buckets), and volatility (vol_threshold buckets). Patterns are serialised to a prompt-injectable string for the next `hypothesize_node` call.

### Key Architectural Insight

The `reflect → retry` loop is the most important architectural feature. The agent does not simply run once and report — it iterates up to `max_iterations` times, improving proposals based on backtest feedback. This is the closest public analogue to DARWIN's J4 pattern discovery service, though DARWIN's loop is triggered by live observations rather than running in batch mode.

### Architectural Gaps Relative to DARWIN

1. **No live observation trigger** — The loop runs in batch mode; it is not triggered by a live market event.
2. **No CME futures data** — yfinance does not provide MNQ data.
3. **No external notification** — No Telegram, email, or webhook delivery of findings.
4. **No git archival** — No autonomous commit of research outputs.
5. **No scheduled cron** — The loop must be manually started.

---

## microsoft/RD-Agent — Architectural Summary

**Language:** Python | **Framework:** Custom multi-agent | **Data:** Qlib/A-share | **Memory:** SQLite + vector

RD-Agent implements a Research Agent (R) that proposes new factors or model modifications, and a Development Agent (D) that implements and evaluates them. The R→D loop iterates, with each cycle building on prior results. The system is the most academically rigorous public autonomous research system found, with NeurIPS 2025 acceptance and a live demo at `rdagent.azurewebsites.net`.

The quant scenario (`RD-Agent(Q)`) achieves approximately 2× higher ARR than benchmark factor libraries at a cost under $10 per run. The alternating factor–model optimisation is a genuine architectural innovation not present in other public systems.

**Architectural gap relative to DARWIN:** No live-observation trigger, no CME futures support, no Telegram notification, no git archival of daily reports.

---

## augiemazza/varrd — Architectural Summary

**Language:** Python | **Framework:** Custom DSL + backtesting kernel | **Data:** Proprietary CME feed | **Memory:** K-tracking + cosine similarity

VARRD's most distinctive architectural feature is its separation of the AI layer from the computation layer: "The AI generates hypotheses. A purpose-built backtesting engine does the math. The AI never calculates statistics, never fabricates results, and never touches the numbers." This is a strong anti-hallucination design principle directly analogous to DARWIN's separation of observation detection from finding classification.

The K-tracking system counts every test run on a hypothesis and applies Bonferroni correction, preventing p-hacking by penalising repeated testing of the same idea. Cosine similarity on vectorised embeddings detects when a new hypothesis overlaps with one already tested. These are production-grade evidence integrity mechanisms.

**Architectural gap relative to DARWIN:** No live-observation trigger (cron-based), no Databento integration, no Telegram notification, no git archival.
