# DARWIN Research Memory Policy

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

Research memory prevents DARWIN from repeating failed research paths, ensures that every hypothesis benefits from prior knowledge, and maintains an auditable record of all research decisions.

---

## 2. Memory Lookup Requirement

Every hypothesis must perform a memory lookup before testing. The lookup compares the new hypothesis against all existing memory records on:

| Dimension | Comparison |
|---|---|
| condition_signature | Exact SHA-256 match → DUPLICATE, reject immediately |
| hypothesis_family | Same family → check K count and prior results |
| timeframe | Same timeframe → compare trigger conditions |
| session | Same session → compare context conditions |
| direction | Same direction → compare outcome definitions |
| regime | Same regime → compare context conditions |
| forward_horizon | Same horizons → compare outcome definitions |
| dataset_period | Overlapping period → flag potential data reuse |
| outcome_definition | Similar outcome → compare for near-duplicates |
| parameter_version | Different version → may be valid retest |
| prior_classification | REJECTED → requires new evidence to retest |
| prior_refinements | K count → enforce MAX_VARIANTS_PER_HYPOTHESIS |

**PRIOR_MEMORY_LOOKUP_RATE=100%** — no hypothesis may be created without a completed memory lookup.

---

## 3. Memory Record Structure

Each memory record stores:

```
memory_id
hypothesis_id
condition_signature
hypothesis_family
hypothesis_family_k
timeframe
session
direction
regime
forward_horizons
dataset_period_start
dataset_period_end
outcome_definition
parameter_version
classification
rejection_reason
refinement_count
parent_memory_id
key_findings_summary
created_at
updated_at
```

---

## 4. Memory Invariants

```
PRIOR_MEMORY_LOOKUP_RATE=100%
DUPLICATE_RESEARCH_RATE=0
OVERWRITTEN_RESEARCH_RECORDS=0
```

Memory records are immutable after creation. Updates are append-only (new records reference parent_memory_id). No record may be deleted or overwritten.

---

## 5. What DARWIN Must Know

Before creating any hypothesis, DARWIN must be able to answer:

- What was tested in this family?
- What failed and why?
- What refinements were attempted?
- Which regimes behaved differently?
- Whether the new evidence is genuinely novel.
- Whether an old edge is emerging or decaying.

If DARWIN cannot answer these questions from memory, it must search the memory before proceeding.

---

## 6. Memory Lookup Response

The memory lookup returns one of:

| Result | Action |
|---|---|
| EXACT_DUPLICATE | Reject hypothesis; log as DUPLICATE_RESEARCH |
| NEAR_DUPLICATE | Flag for human review; do not auto-reject |
| PRIOR_REJECTED | Require new evidence documentation before proceeding |
| PRIOR_INCONCLUSIVE | Note prior result; proceed with new pre-registration |
| NO_MATCH | Proceed with pre-registration |
