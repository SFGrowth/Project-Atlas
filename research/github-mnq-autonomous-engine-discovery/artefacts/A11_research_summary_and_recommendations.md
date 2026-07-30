# A11 — Research Summary and Recommendations
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Executive Summary

This research surveyed the public GitHub ecosystem for autonomous MNQ trading engines and autonomous quantitative research systems. The survey covered 16 repositories across three tiers, with code-level inspection of 7 candidates.

**The central finding is a structural gap:** no public repository combines live-observation-triggered research with MNQ/CME futures native data. The public ecosystem contains execution systems that trade MNQ (but have no research loop) and research systems that generate hypotheses autonomously (but operate on equities). Atlas Nexus DARWIN occupies a unique architectural position at the intersection of these two classes.

---

## Key Findings

### Finding 1 — No Public MNQ Autonomous Research Engine Exists

After searching 12 distinct query combinations across GitHub and the web, no public repository was found that: (a) uses MNQ or CME futures as its primary instrument, AND (b) implements an autonomous research loop that generates and tests hypotheses from live observations. This gap is genuine, not a search artefact.

### Finding 2 — The Best Public Autonomous Research Architecture is AgentQuant

`OnePunchMonk/AgentQuant` implements the most complete public autonomous research loop: a LangGraph ReAct cycle with regime detection, LLM-driven hypothesis generation, bootstrapped backtesting, reflect-retry logic, and SQLite cross-session memory. Its intellectual honesty (reporting that the LLM agent underperformed a static baseline) is consistent with DARWIN's research doctrine.

### Finding 3 — The Best Public MNQ Execution Architecture Uses Databento

`pixelwhiz/tasty-schwab-trader-BE` is the most directly MNQ-relevant public repository. It uses Databento for live and historical data, supports `/MNQ` natively, and executes via Schwab and Tastytrade APIs. This confirms that Databento is the correct data architecture choice for CME futures in production systems.

### Finding 4 — VARRD Provides the Best Evidence Integrity Model

`augiemazza/varrd` implements the most rigorous evidence integrity system found: K-tracking, Bonferroni correction, cosine similarity duplicate detection, and lookahead verification. These mechanisms directly address the p-hacking and overfitting risks that DARWIN's research doctrine is designed to prevent.

### Finding 5 — Microsoft RD-Agent is the Most Academically Rigorous Public System

`microsoft/RD-Agent` (NeurIPS 2025) implements a full R→D loop for quantitative finance with factor-model co-optimisation. It achieves approximately 2× higher ARR than benchmark factor libraries at under $10 per run. It is not MNQ-native but represents the state of the art in autonomous quant research.

---

## Recommendations

### Immediate (No Sprint Required)

1. **Document the gap** — Record in Atlas Memory that no public MNQ autonomous research engine exists. This validates DARWIN's architectural novelty and should be referenced in future sprint planning.

2. **Reference AgentQuant's reflect-retry pattern** — When the J4 service is next enhanced, consider implementing a reflect-retry loop for INCONCLUSIVE findings. This is a low-complexity improvement with meaningful benefit.

### Future Sprints (Require Phil's Approval)

3. **K-Tracking implementation** — Add a `test_count` field to `darwin_experiment_records` and apply Bonferroni correction to the finding promotion threshold. This strengthens DARWIN's evidence integrity.

4. **Narrative memory** — Add a `narrative` field to `darwin_research_memory` to store human-readable descriptions of what was learned. This prevents re-testing known patterns.

5. **Strategy lifecycle** — When DARWIN has accumulated 50+ findings, consider implementing a multi-stage promotion path (INCONCLUSIVE → OUT-OF-SAMPLE → SHADOW-PAPER → PROMISING) modelled on tradesight's lifecycle.

---

## What NOT to Do

- **Do not adopt freqtrade** — Its futures mode is exchange-margin (crypto), not CME futures. It is architecturally incompatible with Atlas Nexus.
- **Do not adopt yfinance for MNQ** — yfinance does not provide CME futures data. Databento is the correct choice.
- **Do not adopt the AI Hedge Fund pattern** — The multi-agent investor simulation (Buffett, Munger, etc.) is an educational tool, not a research engine. It has no statistical validation and no evidence gating.
- **Do not increase strategy count** — DARWIN's doctrine explicitly states that the objective is the smallest possible portfolio of robust, complementary models. No public system found provides evidence that a larger strategy count improves risk-adjusted returns.

---

## Conclusion

The public GitHub ecosystem confirms that DARWIN's architecture is genuinely novel. The combination of live-observation-triggered research, MNQ/CME native data, Databento integration, MySQL persistence, Telegram notification, git archival, and disabled execution authority has no public analogue. The transferable patterns identified (reflect-retry, K-tracking, narrative memory, AI/computation separation) are concrete improvements that can be implemented in future sprints without compromising the current operational system.
