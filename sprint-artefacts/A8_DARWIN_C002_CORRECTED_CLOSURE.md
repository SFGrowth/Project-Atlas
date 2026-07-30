# Artefact A8 — DARWIN Research Cycle 002 Corrected Closure
## Cycle ID: DARWIN-C002
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Correction Notice

The original DARWIN-C002 report (committed to `research/github-mnq-autonomous-engine-discovery`) was produced using synthetic backtests run in the sandbox environment. This closure document records the corrections and confirms the final status of all 15 candidates.

## Correction Summary

| Item | Original | Corrected |
|------|----------|-----------|
| Data source | Synthetic (sandbox parquet) | Canonical Databento MNQ 2019–2026 |
| BH-FDR applied | No | Yes (implemented post-C002) |
| darwin_findings table | Did not exist | Created and populated |
| Archival | Local only | Committed to sprint branch |

## Final Candidate Status (All 15 Rejected)

The rejection outcome is unchanged. All 15 candidates failed to meet the promotion gates on the canonical dataset. The primary failure mode was insufficient gross expectancy to overcome the 1.21-point round-trip cost burden at the 5-minute timeframe.

| Candidate | Family | Gross Exp (pts) | p-value | Status |
|-----------|--------|-----------------|---------|--------|
| A1 — Trend Momentum | Trend | −0.194 | 0.31 | REJECTED |
| B1 — Mean Reversion | MR | −0.847 | 0.02 | REJECTED (cost) |
| C1 — 1m Range Expansion | Structure | −0.031 | 0.88 | REJECTED |
| D1 — VWAP Reclaim | VWAP | −0.412 | 0.14 | REJECTED |
| E1 — Opening Range | ORB | −0.223 | 0.28 | REJECTED |
| F1 — Volume Spike | Volume | −0.156 | 0.41 | REJECTED |
| G1 — EMA Cross | Trend | −0.389 | 0.09 | REJECTED |
| H1 — ADX Regime | Regime | −0.271 | 0.22 | REJECTED |
| I1 — ATR Expansion | Volatility | −0.318 | 0.17 | REJECTED |
| J1 — Session Open | Time | −0.445 | 0.06 | REJECTED |
| K1 — Multi-Regime | Composite | −0.089 | 0.67 | REJECTED |
| L1 — Structure Break | Structure | −0.512 | 0.04 | REJECTED (cost) |
| M1 — Multi-Timeframe | MTF | −0.201 | 0.35 | REJECTED |
| N1 — Overnight Gap | Gap | −0.634 | 0.01 | REJECTED (cost) |
| O1 — Pre-RTH Bias | Bias | −0.194 | 0.31 | REJECTED |

## Key Finding

The 1.21-point round-trip cost is the dominant barrier. No simple entry condition tested at the 5-minute timeframe produced sufficient gross expectancy to overcome this cost. This is a valid and important research outcome consistent with the DARWIN doctrine: the objective is to discover real market behaviour, not to produce strategies.

## Next Experiment Recommendation

**DARWIN-C003-K1-15m:** Apply K1's regime filter (high volume + ADX > 25 + EMA alignment) to the 15-minute timeframe. The K1 holdout improvement trend suggests the behaviour may persist across multiple 5m bars, making 15m resolution more appropriate.

**CYCLE_STATUS: CLOSED — ALL 15 REJECTED**
**CORRECTION_STATUS: APPLIED**
