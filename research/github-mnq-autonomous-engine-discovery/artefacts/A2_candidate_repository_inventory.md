# A2 — Candidate Repository Inventory
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Tier 1 — Direct MNQ/Futures Execution Systems

These repositories explicitly list MNQ (`/MNQ`) as a supported instrument and contain live execution code.

| # | Repository | Stars | Language | MNQ Explicit | Live Execution | Autonomous Research | Last Active |
|---|-----------|-------|----------|-------------|----------------|--------------------|----|
| 1 | [pixelwhiz/tasty-schwab-trader-BE](https://github.com/pixelwhiz/tasty-schwab-trader-BE) | 13 | Python | Yes (`/MNQ`) | Yes (Schwab + Tastytrade) | No | 2025-10 |
| 2 | [lgreen95/M2K-MES-MNQ-Future-Trading](https://github.com/lgreen95/M2K-MES-MNQ-Future-Trading) | 10 | TypeScript | Yes (MNQ Bot) | Signal-only (no broker) | No | 2025-11 |

---

## Tier 2 — Autonomous Research Engines (Equities-Focused, Adaptable to Futures)

These repositories implement a genuine autonomous research loop (observe → hypothesise → backtest → store) but are primarily designed for equities. They could be adapted to futures with a data-source swap.

| # | Repository | Stars | Language | Research Loop | Memory | Regime Detection | MNQ Evidence |
|---|-----------|-------|----------|--------------|--------|-----------------|-------------|
| 3 | [OnePunchMonk/AgentQuant](https://github.com/OnePunchMonk/AgentQuant) | 170 | Python | Full ReAct (LangGraph) | SQLite cross-session | VIX percentile + HMM | None |
| 4 | [mdelaguera/trading-AgentQuant](https://github.com/mdelaguera/trading-AgentQuant) | 3 | Python | LangChain agent | Parquet | VIX-based | None |
| 5 | [microsoft/RD-Agent](https://github.com/microsoft/RD-Agent) | 14,079 | Python | Full R→D loop | SQLite + vector | Factor-model co-opt | None |
| 6 | [augiemazza/varrd](https://github.com/augiemazza/varrd) | 24 | Python | Autonomous discovery | K-tracking + cosine sim | Regime analysis | NQ daily (via CME futures) |
| 7 | [rmbell09-lang/tradesight](https://github.com/rmbell09-lang/tradesight) | 158 | Python | Evidence-gated lifecycle | Champion/challenger DB | Not explicit | None |

---

## Tier 3 — Large-Scale Platforms and Reference Collections

These are either very large general platforms or curated reference lists.

| # | Repository | Stars | Language | Relevance |
|---|-----------|-------|----------|-----------|
| 8 | [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 28,646 | Python | Broad trading agent platform; manual-first research loop |
| 9 | [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 62,470 | Python | Multi-agent hedge fund simulation; equities only; educational |
| 10 | [microsoft/qlib](https://github.com/microsoft/qlib) | 46,829 | Python | Full ML quant pipeline; spawned RD-Agent |
| 11 | [wangzhe3224/awesome-systematic-trading](https://github.com/wangzhe3224/awesome-systematic-trading) | 4,548 | — | Curated list; references ES/NQ volatility forecasting |

---

## Excluded Candidates

The following were identified but excluded from detailed analysis:

- **freqtrade/freqtrade** — Crypto-focused; futures mode is exchange-margin, not CME futures
- **ayb/ninjatrader-automated-trading-strategy** — NinjaScript inside-bar strategy; no autonomous research
- **njmathews/AlgoTrading** — E-mini S&P 500 NinjaTrader strategy; no autonomous loop
- **rock-mind/autoquant** — A-share (Chinese equities) focused; not applicable to MNQ
