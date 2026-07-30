# A8 — Transferable Patterns and Implementation Recommendations
## Research Branch: github-mnq-autonomous-engine-discovery
**Date:** 2026-07-30 | **Classification:** READ-ONLY RESEARCH

---

## Pattern 1 — Reflect-Retry Loop (from AgentQuant)

**Source:** `OnePunchMonk/AgentQuant` — `src/agent/agent_graph.py`, `reflect_node()`

**Pattern:** After each backtest, compare the best result against a minimum acceptable threshold. If below threshold and iterations remain, loop back to hypothesis generation with the prior result injected into the context. Accept the best available result when max iterations is reached.

**Applicability to DARWIN:** DARWIN's J4 service currently runs a single experiment per observation. The reflect-retry pattern would allow DARWIN to automatically refine a hypothesis when the first experiment is INCONCLUSIVE. For example, if a range-expansion rule (bar_range ≥ 1.5 × ATR) is INCONCLUSIVE, the retry could test a tighter threshold (bar_range ≥ 2.0 × ATR) or a different window.

**Implementation complexity:** Low. The J4 service already has the experiment infrastructure. Adding a retry loop requires: (1) a `retry_count` field in `darwin_experiment_records`, (2) a `min_acceptable_confidence` threshold in the J4 config, and (3) a loop in `darwin-j4-pattern-discovery.ts` that generates a refined candidate if the result is INCONCLUSIVE and `retry_count < max_retries`.

**Risk:** Overfitting. Each retry must use a pre-registered parameter variation, not an optimised one. The retry hypothesis must be registered in `darwin_candidates` before the experiment runs.

---

## Pattern 2 — K-Tracking Anti-P-Hacking (from varrd)

**Source:** `augiemazza/varrd` — README, integrity section

**Pattern:** Every test run on a hypothesis is counted and fingerprinted. The significance threshold is adjusted using Bonferroni correction based on the number of tests. Cosine similarity on vectorised hypothesis embeddings detects when a new hypothesis overlaps with one already tested.

**Applicability to DARWIN:** DARWIN's current finding classification does not account for the number of times a given observation type has been tested. If the J4 service tests the same range-expansion rule 10 times with slightly different parameters, the effective significance threshold should be 0.05/10 = 0.005, not 0.05.

**Implementation complexity:** Medium. Requires: (1) a `test_count` field in `darwin_experiment_records` grouped by observation type, (2) a Bonferroni-corrected p-value threshold in the finding promotion logic, and (3) optionally, a vector embedding of the hypothesis description for duplicate detection.

**Risk:** Low. This is a conservative change that makes DARWIN's evidence standard stricter, not looser.

---

## Pattern 3 — Explicit Strategy Lifecycle (from tradesight)

**Source:** `rmbell09-lang/tradesight` — README, strategy lifecycle section

**Pattern:** `Candidate → Backtest → Out-of-sample → Shadow paper → Qualified → Champion → Retired`. Each stage requires explicit evidence gates. A challenger cannot promote automatically.

**Applicability to DARWIN:** DARWIN's current finding classification (INCONCLUSIVE / PROMISING / REJECTED) is a two-stage model. A multi-stage lifecycle would add: (1) an out-of-sample validation stage before PROMISING, (2) a shadow paper trading stage before a finding is recommended for strategy development, and (3) an explicit retirement mechanism for findings that decay over time.

**Implementation complexity:** High. Requires schema changes to `darwin_research_memory`, new job types (J5-OOS, J6-SHADOW), and a promotion workflow with Phil's approval gates.

**Risk:** Complexity. The current two-stage model is appropriate for the current research volume. This pattern should be considered when DARWIN has accumulated 50+ findings.

---

## Pattern 4 — Narrative Memory (from AgentQuant NLA)

**Source:** `OnePunchMonk/AgentQuant` — `src/research/nla_memory.py`

**Pattern:** Explicit NLA-style (Narrative Language Activation) memory stores research narratives alongside numerical results. Future research cycles can retrieve prior narratives and inject them into the hypothesis generation context.

**Applicability to DARWIN:** DARWIN's `darwin_research_memory` table stores findings with a `classification` and `evidence_json` field. Adding a `narrative` field (a human-readable description of what was learned and why) would allow future J4 runs to retrieve prior narratives and avoid re-testing known patterns.

**Implementation complexity:** Low. The schema already supports a `notes` or `evidence_json` field. Adding a `narrative` column and populating it from the J4 service requires minimal changes.

---

## Pattern 5 — Separation of AI from Computation (from varrd)

**Source:** `augiemazza/varrd` — README, "Full transparency" section

**Pattern:** The AI generates hypotheses. A deterministic backtesting engine computes all statistics. The AI never touches the numbers. This prevents hallucinated results.

**Applicability to DARWIN:** This principle is already partially implemented in DARWIN — the J4 service generates hypotheses and the backtest engine computes results. However, the finding classification (INCONCLUSIVE / PROMISING / REJECTED) is currently computed by the J4 service itself. A future enhancement could move the classification logic to a separate, deterministic module that receives raw backtest results and applies pre-registered classification rules.

**Implementation complexity:** Low. This is a refactoring task, not a new feature.

---

## Prioritised Recommendations

| Priority | Pattern | Complexity | Risk | Benefit |
|----------|---------|-----------|------|---------|
| 1 | K-Tracking Anti-P-Hacking | Medium | Low | Stronger evidence integrity |
| 2 | Narrative Memory | Low | Low | Avoids re-testing known patterns |
| 3 | AI/Computation Separation | Low | Low | Prevents hallucinated classifications |
| 4 | Reflect-Retry Loop | Low | Medium | Reduces INCONCLUSIVE rate |
| 5 | Explicit Strategy Lifecycle | High | Medium | More rigorous promotion path |

**All recommendations are for future sprints only. No changes to the current operational system are implied.**
