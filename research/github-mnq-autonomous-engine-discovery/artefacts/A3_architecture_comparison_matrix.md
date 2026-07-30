# A3 — Architecture Comparison Matrix
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Dimension Definitions

| Dimension | Description |
|-----------|-------------|
| **Autonomous Research Loop** | Does the system autonomously generate hypotheses, test them, and store findings without human intervention per cycle? |
| **Live Observation Trigger** | Are research jobs triggered by live market observations (not just a fixed schedule)? |
| **Persistent Memory** | Does the system persist findings across sessions for future recall? |
| **Regime Awareness** | Does the system classify market regime and adapt behaviour accordingly? |
| **MNQ / CME Futures Native** | Is MNQ or CME futures data a first-class supported instrument? |
| **Databento Integration** | Does the system use Databento as a data source? |
| **Notification Channel** | Does the system deliver findings to an external channel (Telegram, email, etc.)? |
| **Evidence Gating** | Does the system require statistical evidence gates before promoting a finding? |
| **Git Archival** | Does the system commit research outputs to a git repository autonomously? |
| **Execution Authority** | Can the system place live trades autonomously? |

---

## Full Comparison Matrix

| Repository | Autonomous Research Loop | Live Obs Trigger | Persistent Memory | Regime Aware | MNQ/CME Native | Databento | Notification | Evidence Gating | Git Archival | Execution Authority |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Atlas Nexus DARWIN** (this system) | ✅ Full | ✅ Yes | ✅ MySQL | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Telegram | ✅ Yes | ✅ Yes | ❌ DISABLED |
| pixelwhiz/tasty-schwab-trader-BE | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ✅ Yes (live) |
| lgreen95/M2K-MES-MNQ-Future-Trading | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Telegram | ❌ No | ❌ No | ❌ Signal-only |
| OnePunchMonk/AgentQuant | ✅ Full ReAct | ❌ No (batch) | ✅ SQLite | ✅ Yes | ❌ No | ❌ No | ❌ No | ✅ Partial | ❌ No | ❌ No |
| mdelaguera/trading-AgentQuant | ✅ LangChain | ❌ No (batch) | ✅ Parquet | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| microsoft/RD-Agent | ✅ Full R→D | ❌ No (batch) | ✅ SQLite | ✅ Factor | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No |
| augiemazza/varrd | ✅ Autonomous | ❌ No (cron) | ✅ K-tracking | ✅ Yes | ✅ NQ (CME) | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ No |
| rmbell09-lang/tradesight | ✅ Lifecycle | ❌ No (daily) | ✅ Champion DB | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No | ❌ Paper only |
| HKUDS/Vibe-Trading | ✅ Partial | ❌ Manual | ✅ Tier 2 | ✅ Yes | ❌ No | ❌ No | ✅ Feishu | ❌ No | ❌ No | ✅ Live (opt-in) |
| virattt/ai-hedge-fund | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| microsoft/qlib | ✅ ML pipeline | ❌ No | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ No | ✅ Yes |

---

## Key Observations

**No public repository combines all ten dimensions.** Atlas Nexus DARWIN is the only system identified that simultaneously implements: live-observation-triggered research, MNQ/CME native data, Databento integration, Telegram notification, git archival, and disabled execution authority (paper-first safety model).

The closest public analogue to DARWIN's research architecture is **OnePunchMonk/AgentQuant**, which implements a genuine ReAct loop with SQLite memory and regime detection. However, it operates on equities via yfinance, runs in batch mode (not triggered by live observations), and has no notification or git archival layer.

**microsoft/RD-Agent** is the most architecturally sophisticated public system, with a full R→D loop, NeurIPS 2025 acceptance, and factor-model co-optimisation. It is not MNQ-native and does not support live-observation triggering.

**augiemazza/varrd** is the only public system that explicitly lists NQ (CME) futures as a supported instrument within an autonomous discovery context, though its discovery loop runs on a cron schedule rather than being triggered by live observations.
