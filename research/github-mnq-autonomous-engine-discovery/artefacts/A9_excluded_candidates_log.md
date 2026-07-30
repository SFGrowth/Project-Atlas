# A9 — Excluded Candidates Log
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Exclusion Criteria

A candidate was excluded from detailed analysis if it met any of the following criteria:

- **E1** — No inspectable source code (documentation-only or commercial service)
- **E2** — Instrument scope limited to crypto or non-CME assets
- **E3** — No autonomous loop and no MNQ relevance
- **E4** — Duplicate / fork of an already-analysed repository

---

## Excluded Candidates

| Repository | Stars | Exclusion Reason | Notes |
|-----------|-------|-----------------|-------|
| freqtrade/freqtrade | 35,000+ | E2 — Crypto-focused | Futures mode is exchange-margin (Binance/Bybit), not CME futures |
| freqtrade/freqtrade-strategies | — | E2 — Crypto-focused | Strategy library for freqtrade; no CME futures strategies |
| ayb/ninjatrader-automated-trading-strategy | — | E3 — No loop, no MNQ | Inside-bar NinjaScript strategy; no autonomous research |
| njmathews/AlgoTrading | — | E3 — No loop, no MNQ | E-mini S&P 500 NinjaTrader strategy; equities-adjacent |
| rock-mind/autoquant | — | E2 — A-share focused | Chinese equities (A-share); not applicable to MNQ |
| AI4Finance-Foundation/FinRL | 10,000+ | E2 — Equities/crypto | Deep RL for equities; no CME futures |
| AI4Finance-Foundation/FinGPT | 14,000+ | E3 — No loop | LLM financial model; no trading loop |
| PacktPublishing/Machine-Learning-for-Algorithmic-Trading | — | E3 — Educational | Book companion code; no autonomous loop |
| stefan-jansen/machine-learning-for-trading | — | E3 — Educational | Book companion code; no autonomous loop |
| leoncuhk/awesome-quant-ai | — | E3 — Curated list | Reference list only; no code |
| georgezouq/awesome-ai-in-finance | — | E3 — Curated list | Reference list only; no code |
| UFund-Me/Qbot | — | E2 — Chinese market | A-share focused; not applicable to MNQ |
| mdelaguera/trading-AgentQuant | 3 | E4 — Fork of AgentQuant | Derivative of OnePunchMonk/AgentQuant; analysed separately |

---

## Near-Miss Candidates

These candidates were reviewed but did not meet the threshold for detailed analysis:

**HKUDS/AI-Trader** — An agent-native trading platform where AI agents compete on a virtual leaderboard. Not a research engine; no autonomous hypothesis generation.

**DunkinGuys/bullbear** — Open-source AI agent stock trading battle platform. Virtual cash only; no research loop; equities only.

**augiemazza/varrd skills/** — The `skills/` directory in varrd contains domain-specific language skill files for various asset classes. These were not inspected in detail as they are proprietary DSL files, not general-purpose code.

**awesome-autoresearch/categories/finance-trading.md** — A curated list of autonomous research systems for finance. Referenced but not inspected in detail as it is a reference document, not a code repository.
