# A4 — MNQ Evidence Assessment
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Assessment Criteria

For each candidate, MNQ evidence is assessed across four dimensions:

1. **Symbol Reference** — Does the repository explicitly name `/MNQ` or `MNQ` in code or documentation?
2. **Data Source** — What data provider is used for MNQ/NQ data?
3. **Execution Path** — Is there a live execution path for MNQ trades?
4. **Backtest Evidence** — Are there backtested results specifically for MNQ?

---

## Per-Repository Assessment

### pixelwhiz/tasty-schwab-trader-BE

**MNQ Evidence: STRONG**

The repository's README explicitly lists `/MNQ` (Micro E-mini Nasdaq-100) as a supported instrument. The `tick_producer.py` file uses Databento as the live data source, with `get_dataset(ticker)` and `get_symbol_for_data(ticker)` utility functions that map `/MNQ` to the appropriate Databento dataset (`GLBX.MDP3`). The `ema_strategy.py` implements a live EMA crossover strategy that can be configured for any listed symbol including `/MNQ`. Live execution is wired to both Charles Schwab and Tastytrade broker APIs.

**Code evidence (tick_producer.py):**
```python
HISTORICAL_CLIENT = db.Historical(DB_API_KEY)
LIVE_CLIENT = db.Live(key=DB_API_KEY)
```
Databento is used for both historical warmup and live feed — consistent with Atlas Nexus's own data architecture.

**Assessment:** This is the most directly MNQ-relevant public repository found. It uses Databento (same as Atlas Nexus), supports `/MNQ` natively, and has a live execution path. However, it has no autonomous research loop — it is a pure execution system.

---

### lgreen95/M2K-MES-MNQ-Future-Trading

**MNQ Evidence: MODERATE**

The repository explicitly names the MNQ Bot in its README and provides a Telegram signal channel. However, the repository contains only documentation files (`M2K-Bot.md`, `MES-Bot.md`, `README.md`) and a `test.txt` — no source code is present. The actual signal generation logic is hosted on a separate web platform (`future-trading-omega.vercel.app`). The repository is effectively a marketing document for a commercial signal service.

**Assessment:** MNQ is named but no inspectable source code exists. The autonomous classification is not verifiable. This repository is excluded from architectural analysis.

---

### augiemazza/varrd

**MNQ Evidence: INDIRECT (NQ)**

The VARRD data coverage table lists `NQ daily` as a supported CME futures instrument. The example output shows `NQ daily LONG | FIRING` with entry, stop, and target levels. However, `/MNQ` (Micro E-mini) is not explicitly listed — only the standard `/NQ` contract. The system uses its own proprietary backtesting engine, not Databento.

**Assessment:** NQ (standard) is supported; MNQ (micro) is not explicitly confirmed. The autonomous discovery architecture is relevant but the instrument coverage is at the full-size contract level.

---

### OnePunchMonk/AgentQuant

**MNQ Evidence: NONE**

The system uses `yfinance` for data, which does not provide CME futures data. All examples use equities (SPY, AAPL, MSFT). No reference to MNQ, NQ, ES, or CME futures exists in the codebase.

**Assessment:** No MNQ evidence. Architecture is relevant; instrument coverage is not.

---

### microsoft/RD-Agent

**MNQ Evidence: NONE**

RD-Agent operates on equity markets via Qlib's data infrastructure. No CME futures instruments are referenced. The quant scenario uses Chinese A-share and US equity data.

**Assessment:** No MNQ evidence. Architecture is highly relevant; instrument coverage is not applicable.

---

### rmbell09-lang/tradesight

**MNQ Evidence: NONE**

TradeSight uses Alpaca paper trading, which supports equities and some ETFs but not CME futures. No reference to MNQ, NQ, or futures contracts exists.

**Assessment:** No MNQ evidence.

---

### HKUDS/Vibe-Trading

**MNQ Evidence: NONE (indirect)**

Vibe-Trading supports 24 data sources including some futures, but no explicit MNQ reference was found in the inspected documentation. The system is primarily equities and crypto-focused.

**Assessment:** No confirmed MNQ evidence.

---

## Summary Table

| Repository | MNQ Symbol | Data Source | Live Execution | Backtest Evidence |
|-----------|-----------|-------------|----------------|------------------|
| pixelwhiz/tasty-schwab-trader-BE | ✅ `/MNQ` explicit | Databento | ✅ Yes | Not published |
| lgreen95/M2K-MES-MNQ-Future-Trading | ✅ MNQ named | Unknown (web platform) | Signal-only | Not inspectable |
| augiemazza/varrd | ⚠️ NQ only | Proprietary | No | Yes (NQ daily) |
| OnePunchMonk/AgentQuant | ❌ None | yfinance | No | Equities only |
| microsoft/RD-Agent | ❌ None | Qlib/A-share | No | Equities only |
| rmbell09-lang/tradesight | ❌ None | Alpaca | Paper only | Equities only |
| HKUDS/Vibe-Trading | ❌ Not confirmed | Multiple | Yes (opt-in) | Not MNQ |
| virattt/ai-hedge-fund | ❌ None | Financial Datasets API | No | Equities only |

---

## Finding

**The public GitHub ecosystem contains very few repositories with genuine, inspectable MNQ-specific code.** The only system with confirmed MNQ source code, Databento integration, and live execution is `pixelwhiz/tasty-schwab-trader-BE`. This system is an execution engine only — it has no autonomous research capability. The gap between MNQ execution systems and autonomous research systems on GitHub is wide and represents a genuine architectural novelty in Atlas Nexus DARWIN.
