# DARWIN Negative Edge Policy

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## 1. Principle

A reliable no-trade filter is an edge. Conditions that consistently predict poor trade outcomes are as valuable as conditions that predict good outcomes. DARWIN must actively research negative edges (Family V) alongside positive edges.

---

## 2. Negative Edge Definition

A negative edge is a condition that, when present at signal time, consistently produces:

- Negative net expectancy after costs.
- Excessive MAE (adverse excursion exceeds expected MFE).
- Low MFE (favourable excursion insufficient to cover costs).
- High immediate-adverse-excursion rate.
- Reversal rate significantly above the unconditional base rate.

---

## 3. No-Trade Condition Definition

A no-trade condition is a negative edge that has been:

1. Pre-registered as a hypothesis.
2. Tested historically.
3. Validated chronologically.
4. Classified as SUPPORTED (negative expectancy confirmed).
5. Approved by Phil for use as a filter.

No-trade conditions are stored in the research memory with `classification=NEGATIVE_EDGE`.

---

## 4. Research Targets (Family V)

| Condition | Research Priority |
|---|---|
| Setup failure rate by session | HIGH |
| Immediate reversal after signal | HIGH |
| Excessive MAE in specific regimes | HIGH |
| Low MFE in specific sessions | MEDIUM |
| Cost-dominated movement (small ATR) | HIGH |
| Entries during chop (ema_cross_count ≥ 3) | HIGH |
| Entries after overextension (dist_vwap ≥ 2 ATR) | MEDIUM |
| Entries near opposing structure | HIGH |
| Entries after repeated EMA crossing | HIGH |
| Session-specific underperformance | MEDIUM |
| Regime-specific underperformance | MEDIUM |
| Delayed entries (signal age > 3 bars) | MEDIUM |
| Repeated low-quality signals | MEDIUM |
| False breakouts (failed within 3 bars) | HIGH |
| Low-participation moves (rvol < 0.6) | MEDIUM |

---

## 5. Classification

Negative edge findings use the same classification system as positive edges, with an additional field:

```
edge_direction: NEGATIVE
no_trade_filter_candidate: TRUE/FALSE
```

A negative edge classified as SUPPORTED and approved by Phil may be encoded as a no-trade filter in the hypothesis engine.

---

## 6. Governance

- Negative edges are pre-registered before testing (same process as positive edges).
- No-trade filters may not be applied to live trading without Phil's written approval.
- Negative edge findings are stored in research memory with the same immutability guarantees as positive edges.
