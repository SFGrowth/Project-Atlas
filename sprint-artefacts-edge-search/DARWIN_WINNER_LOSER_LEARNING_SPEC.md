# DARWIN Winner and Loser Learning Specification

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Purpose

For every tested strategy or directional hypothesis, DARWIN must compare the feature environment of winning trades against losing trades. This analysis may reveal conditions that improve entry quality, but descriptive differences must not become filters until separately pre-registered.

---

## 2. Winner and Loser Definitions

**Winners** (top 25% by MFE, or trades with positive net return after costs):
- Immediate continuation after entry
- Delayed continuation (within 3 bars)
- Regime-supported trend
- Session expansion
- Structural breakout
- Volatility expansion
- Liquidity-sweep reversal
- Sustained movement
- Clean retest
- Strong participation (relative_volume ≥ 1.2)

**Losers** (bottom 25% by MFE, or trades with negative net return after costs):
- Immediate adverse excursion
- Stopped before favourable movement
- No momentum (narrow follow-through bars)
- Partial progress then reversal
- Reversal after entry
- Entry into opposing structure
- Entry during chop (ema_cross_count_20 ≥ 3)
- Cost-dominated movement
- Delayed confirmation
- Failed breakout
- Failed retest

---

## 3. Required Analysis Questions

For every completed experiment, DARWIN must answer:

| Question | Method |
|---|---|
| WHAT WAS PRESENT BEFORE WINNERS? | Feature distribution comparison: winners vs all |
| WHAT WAS PRESENT BEFORE LOSERS? | Feature distribution comparison: losers vs all |
| WHICH FEATURES DIFFERED MATERIALLY? | Cohen's d or Mann-Whitney U test per feature |
| WERE THE FEATURES AVAILABLE BEFORE ENTRY? | Causality check: all features must be pre-entry |
| DID THE DIFFERENCE SURVIVE VALIDATION? | Repeat analysis on Stage 2 (chronological) data |
| WAS THE DIFFERENCE LARGE ENOUGH AFTER COSTS? | Effect size × expected move vs round-trip cost |

---

## 4. Governance Rules

1. Winner/loser analysis is descriptive only until separately pre-registered.
2. Any feature difference that appears meaningful must be registered as a new hypothesis with a new HYPOTHESIS_ID before being tested as a filter.
3. The parent experiment record is immutable after completion.
4. Winner/loser analysis results are stored in `results_json` of the parent experiment.
5. If a winner/loser difference is registered as a new hypothesis, the parent experiment ID is recorded in `parent_finding_id`.

---

## 5. Output Format

Winner/loser analysis is stored in `results_json.winner_loser_analysis`:

```json
{
  "winner_count": 45,
  "loser_count": 45,
  "winner_threshold": "MFE >= 75th percentile",
  "loser_threshold": "MFE <= 25th percentile",
  "feature_differences": [
    {
      "feature": "relative_volume",
      "winner_mean": 1.42,
      "loser_mean": 0.87,
      "cohen_d": 0.84,
      "p_value": 0.003,
      "causal": true,
      "registered_as_hypothesis": null
    }
  ],
  "analysis_timestamp": "2026-07-31T01:18:00Z"
}
```
