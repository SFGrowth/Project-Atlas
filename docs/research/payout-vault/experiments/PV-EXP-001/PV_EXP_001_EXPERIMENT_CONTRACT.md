# PV-EXP-001 — Baseline Frequency Scan: Experiment Contract

**Sprint:** 123A.10  
**Experiment:** PV-EXP-001  
**Date:** 2026-07-25  
**DARWIN_DECISION_AUTHORITY:** DISABLED  
**DARWIN_EXECUTION_AUTHORITY:** DISABLED  

---

## 1. Purpose

Determine how often the approved Payout Vault detector identifies qualifying setup events on the canonical historical MNQ dataset (OOS partition: 2025-10-01 to 2026-07-20).

**This experiment does not test profitability.**  
**This experiment does not test expectancy.**  
**This experiment does not test parameter optimisation.**

---

## 2. Approved Baseline

| Field | Value |
|---|---|
| G9 Branch | `sprint/123a-9-payout-vault-research-intake` |
| G9 Final HEAD | `469fcdd270cd44d54888194e466a5fe61af444b4` |
| G9 Implementation SHA | `8219bb0601983c7ceff738377cf7ad391210e2e9` |
| G9 Evidence SHA | `ce2a083a78c74c34c2f07418142e0880676ad8e3` |
| Final Lock Manifest SHA-256 | `f8efc45d70ae6a0f1874d072ad9b21d0d3f6f94982ff422b8b6ea256d213ad1b` |
| Approved Detector | `docs/research/payout-vault/payout_vault_detector.py` |
| Approved Detector SHA-256 | `946b806fb563d4ef37018a05da70fc326e1564ca40c8c206be29b76666b717ec` |
| Approved Specification | `docs/research/payout-vault/payout_vault_research_spec_v2.json` |
| Approved Specification SHA-256 | `e40ad744a18cc117976c6fedd58619f90b1d73bd6e9bddd0293ff0be0b4fce22` |
| Approved Hypothesis Registry | `docs/research/payout-vault/hypothesis_registry_v4.json` |
| Approved Hypothesis Registry SHA-256 | `46489b97d1775fcb48b93b556e49c2c6f40601dfe4cf395599cd6bf25654bc4f` |

---

## 3. Canonical Dataset

| Field | Value |
|---|---|
| Instrument | MNQ (Micro E-mini NASDAQ-100) |
| Venue | GLBX.MDP3 |
| Timeframe | 5-minute canonical bars |
| OOS Date Range | 2025-10-01 to 2026-07-20 |
| Dataset File | `/home/ubuntu/atlas-historical/canonical/mnq_5m_features.parquet` |
| Full Dataset SHA-256 | `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623` |
| Full Dataset Bars | 180,414 |
| OOS Bars | 56,532 |
| OOS First Timestamp | 2025-10-01 00:00:00+00:00 |
| OOS Last Timestamp | 2026-07-20 23:55:00+00:00 |
| Null OHLC Bars | 0 |
| Duplicate Timestamps | 0 |
| Out-of-Order Timestamps | 0 |
| Is-Degraded Bars | 0 |
| Data Quality Gate | PASS |

**Prohibited data sources:** TradingView, Pine Script output, chart screenshots, manually edited OHLC, alternative vendor data, reconstructed candles.

---

## 4. Detector Freeze

The detector is frozen at the approved G9 version. The following parameters are locked and must not be altered:

| Parameter | Locked Value |
|---|---|
| htf_lookback | 20 |
| ltf_swing_lookback | 3 |
| csd_window | 3 (csd-window-3) |
| sweep_variant | sweep-wick |
| stop_buffer_ticks | 4 |
| entry_type | 1 |
| smt_enabled | False |
| smt_window_bars | 3 |
| tick_size | 0.25 |

`DETECTOR_SHA256_BEFORE` must equal `DETECTOR_SHA256_AFTER`.

---

## 5. HTF/LTF Mapping

The detector requires both an HTF (higher timeframe) and LTF (lower timeframe) bar window. For the 5-minute canonical dataset:

- **LTF bars:** 5-minute bars (the canonical OOS partition)
- **HTF bars:** 15-minute bars derived from the same canonical dataset (3× aggregation of the 5-minute bars)
- **HTF lookback:** 20 HTF bars (= 300 minutes = 5 hours of context)
- **LTF window per evaluation:** 60 LTF bars (= 300 minutes, matching HTF context)

Each evaluation point uses only bars with `bar_time <= cutoff_time` (no lookahead).

---

## 6. Deduplication Policy

**Rule:** One unique causal setup sequence = one qualifying event.

| Scenario | Policy |
|---|---|
| Repeated CSD confirmations from the same sweep | Count as ONE event (first confirmation only) |
| Overlapping setups in the same direction within 12 bars of a prior qualifying event | DEDUPLICATED — only first event counts |
| Long and short setups | May coexist — counted independently |
| Cooldown after qualifying event | 12 LTF bars (60 minutes) per direction |
| Multiple FVGs from one displacement | Only the first FVG post-CSD counts |
| Contract-roll boundaries | Events spanning a roll boundary are excluded |
| Session boundaries | Each session is independent; no cross-session deduplication |
| Repeated CSD candles | Only the first CSD candle within the window counts |

Event IDs are deterministic: `PV-{YYYYMMDD}-{HHMM}-{DIR}-{SEQ:04d}` where SEQ is a zero-padded sequence number within the day.

---

## 7. Scope Restrictions

This experiment produces **frequency counts only**. The following are explicitly prohibited:

- Strategy profit factor
- Strategy expectancy
- Strategy Sharpe ratio
- Strategy Sortino ratio
- Strategy capital curve
- Portfolio contribution
- Optimal parameters
- Best session / direction / timeframe / stop / target / CSD window / FVG entry
- Parameter ranking
- Any profitability conclusion

Basic forward-price fields (next-bar open, high, low, close) may be retained in the event ledger for later reproducibility but must not be analysed or reported as performance evidence in this sprint.

---

## 8. Authority Boundaries

| Counter | Required |
|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 |
| DARWIN_TRADERSPOST_CALLS | 0 |
| DARWIN_TRADOVATE_CALLS | 0 |
| STRATEGY_STATUS_CHANGES | 0 |
| CAPITAL_REALLOCATIONS | 0 |
| LIVE_TRADES_INITIATED | 0 |

The detector must not be connected to processBar, postBarAutomation, TradersPost, or Tradovate.

---

## 9. Frequency Classification (Pre-Registered)

| Condition | Classification |
|---|---|
| Total qualifying events < 30 | `INSUFFICIENT_SAMPLE` |
| Total qualifying events ≥ 30 AND mean < 2 setups/week | `LOW_FREQUENCY` |
| Mean ≥ 2 setups/week | `ADEQUATE_FREQUENCY` |

`LOW_FREQUENCY` does not mean rejected. `INSUFFICIENT_SAMPLE` does not prove no edge. PV-EXP-002 requires a separate sprint and Phil's written approval regardless of classification.

---

## 10. Stop Conditions

Stop and report SPRINT_BLOCKED if:

- G9 baseline cannot be verified
- Detector hash differs from approved
- Specification hash differs from approved
- Dataset hash differs from approved
- Data quality is not clean
- Event IDs are not deterministic
- Repeated scans disagree (DETERMINISM_FAILURE)
- Rejection accounting does not reconcile
- Look-ahead leakage detected (LOOKAHEAD_VIOLATIONS > 0)
- Detector is altered
- Profitability analysis is invoked
- Authority counters are non-zero
- Required regression test fails
- Secrets are exposed
- GitHub LOCAL ≠ REMOTE

---

*Contract version: 1.0 | Sprint 123A.10 | DARWIN_DECISION_AUTHORITY=DISABLED | DARWIN_EXECUTION_AUTHORITY=DISABLED*
