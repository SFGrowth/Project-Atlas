# Payout Vault — Traceability Matrix v1.0.0
**Sprint:** 123A.9 | **Status:** INTAKE_DRAFT | **Date:** 2026-07-25

This matrix traces every concept and rule in the formalisation documents back to its primary source lesson(s) and supporting image(s), and forward to the detector primitive(s) it informs.

---

## Concept → Source → Detector Traceability

| Concept ID | Concept Name | Primary Lessons | Supporting Images | Detector Primitive |
|---|---|---|---|---|
| CD-01 | Draw on Liquidity (DOL) | 02a, 03a, 07a, 10a, 10b | 14, 19, 21 | `detect_dol()` |
| CD-02 | HTF / LTF | 02a, 07a, 07b | — | `resample_htf()`, `resample_ltf()` |
| CD-03 | Market Structure Unit (MSU) | 02b, 07b | — | `detect_msu()` |
| CD-04 | Market Structure Shift (MSS) | 02b, 04b, 09a | 2 | `detect_mss()` |
| CD-05 | Fake MSS / Double MSU | 02b, 04b, 09a | 12, 23 | `classify_mss()` |
| CD-06 | Inducement | 02c, 04a, 10b | 3, 11, 15 | `detect_inducement()` |
| CD-07 | CSD | 02d, 05a, 05b, 05c, 10b | 4, 5, 6, 13 | `detect_csd()` |
| CD-08 | SMT Divergence | 02e, 06a, 06b | 7, 8 | `detect_smt()` |
| CD-09a | EPA | 02f, 03a | 1 | `detect_epa()` |
| CD-09b | IPA | 02f, 03a | 1 | `detect_ipa()` |
| CD-09c | TQL | 02f | — | `detect_tql()` |
| CD-09d | FVG | 02f, 03b, 05b | 6, 10 | `detect_fvg()` |
| CD-09e | iFVG | 02f | — | `detect_ifvg()` |
| CD-09f | CME Gap | 02f, 03b | 10 | `detect_cme_gap()` |
| CD-09g | No-wick Candle | 02f, 03b | 10, 15 | DEFERRED |
| CD-10 | 3R Fix | 02g, 07d, 10a | — | `compute_trade_management()` |
| CD-11 | Entry Type 1 | 05c | 13 | `entry_type_1()` |
| CD-12 | Entry Type 2 | 05b, 05c | 13 | `entry_type_2()` |
| CD-13 | Q2 | 10b | — | DEFERRED (Tier 2) |
| CD-14 | 4-Step Process | 07a–07d, 10a | 14, 15, 16, 18 | `run_payout_vault_setup()` |

---

## Rule → Source → Ambiguity → Detector Traceability

| Rule ID | Rule Summary | Source | Ambiguity | Detector Impact |
|---|---|---|---|---|
| R-01 | HTF DOL must be defined first | 10a | None | Gate 1 in `run_payout_vault_setup()` |
| R-02 | DOL = nearest resting liquidity in HTF direction | 02a | AMB-03 | `detect_dol()` |
| R-03 | HTF structure must align with trade direction | 09c | None | `detect_dol()` bias filter |
| R-04 | Top-down evaluation order | 02a | None | Sequential gate logic |
| R-05 | DOL is scalar, not zone | 04a | AMB-03 | `detect_dol()` returns scalar |
| R-06 | DOL is the trade target direction | 02g | None | `compute_trade_management()` |
| R-07 | Every swing low in bullish trend = inducement | 02c, 04a | None | `detect_inducement()` bullish |
| R-08 | Every swing high in bearish trend = inducement | 02c, 04a | None | `detect_inducement()` bearish |
| R-09 | Inducement is scalar | 04a | None | `detect_inducement()` returns scalar |
| R-10 | Inducement swept = wick through level | 02c | AMB-04 | `detect_sweep()` |
| R-11 | MSU identified before inducement marked | 07b | None | Sequencing in `run_payout_vault_setup()` |
| R-12 | CSD requires body close, not wick | 02d, 05a | None | `detect_csd()` uses close price |
| R-13 | CSD Rule 1: close > 50% of sweep candle | 05a | AMB-05 | `detect_csd()` rule 1 |
| R-14 | CSD Rule 2: close > entire prior candle body | 02d, 05a | None | `detect_csd()` rule 2 |
| R-15 | Either CSD rule is sufficient | 02d | None | OR logic in `detect_csd()` |
| R-16 | CSD must occur after sweep | 02d | None | Sequencing gate |
| R-17 | MSS alone is not sufficient | 02d | None | Gate: MSS → wait for CSD |
| R-18 | CSD max wait window | Not stated | AMB-01 (BLOCKING) | Pre-registered variants |
| R-19 | Entry Type 1 = next candle open | 05c | None | `entry_type_1()` |
| R-20 | Entry Type 2 = FVG retracement | 05c | AMB-10 | `entry_type_2()` |
| R-21 | Stop = just beyond sweep level | 10a | AMB-07 | `compute_trade_management()` |
| R-22 | Target = 3R | 02g | None | `compute_trade_management()` |
| R-23 | Target direction = toward DOL | 02g | None | `compute_trade_management()` |
| R-24 | No partial exits | 02g | None | `compute_trade_management()` |
| R-25 | SMT = strongest optional confirmation | 02e | None | `detect_smt()` optional filter |
| R-26 | SMT = correlated instrument fails to confirm | 02e | AMB-08 | `detect_smt()` |
| R-27 | SMT is optional | 10a | None | Filter flag, not gate |
| R-28 | Do not enter on fMSS | 09c | None | Gate: MSS must be CSD-confirmed |
| R-29 | Avoid obvious/crowded setups | 09b | AMB (not machine-definable) | Not implemented in detector |
| R-30 | Double MSU trap awareness | 04b, 09a | None | `classify_mss()` double-MSU check |
| R-31 | Q2 definition | 10b | AMB-11 | DEFERRED |
| R-32 | No-wick candle threshold | 02f | AMB-06 | DEFERRED |
| R-33 | Stop buffer size | 10a | AMB-07 | Pre-registered variants |
| R-34 | FVG fill definition | 05b | AMB-10 | Pre-registered (midpoint) |

---

## Source Lesson Coverage Summary

| Lesson | Concepts Covered | Rules Covered | Fully Traced? |
|---|---|---|---|
| 00 | Course map | — | Yes |
| 01a | Model overview | — | Yes |
| 01b | Six building blocks (DOL, MSU/MSS, IND, CSD, SMT, 3R) | — | Yes |
| 01c | How to use the course | — | Yes |
| 02a | CD-01, CD-02 | R-01–R-04 | Yes |
| 02b | CD-03, CD-04, CD-05 | R-07–R-11, R-17, R-28 | Yes |
| 02c | CD-06 | R-07, R-08, R-09, R-10 | Yes |
| 02d | CD-07 | R-12–R-17 | Yes |
| 02e | CD-08 | R-25–R-27 | Yes |
| 02f | CD-09a–g | — | Yes |
| 02g | CD-10 | R-21–R-24 | Yes |
| 03a | CD-01, CD-09a, CD-09b | R-02, R-05 | Yes |
| 03b | CD-09d, CD-09f, CD-09g | — | Yes |
| 04a | CD-06 | R-07–R-09 | Yes |
| 04b | CD-05 | R-28, R-30 | Yes |
| 05a | CD-07 | R-12–R-15 | Yes |
| 05b | CD-12, CD-09d | R-20 | Yes |
| 05c | CD-11, CD-12 | R-19, R-20 | Yes |
| 06a | CD-08 | R-25, R-26 | Yes |
| 06b | CD-08 | R-25–R-27 | Yes |
| 07a | CD-14 | R-01–R-06 | Yes |
| 07b | CD-14 | R-11 | Yes |
| 07c | CD-14 | R-12–R-19 | Yes |
| 07d | CD-14, CD-10 | R-22–R-24 | Yes |
| 08a | Worked example (short) | All rules applied | Yes |
| 08b | Worked example (long) | All rules applied | Yes |
| 08c | Fractal nature | All rules applied | Yes |
| 09a | CD-05 | R-28, R-30 | Yes |
| 09b | — | R-29 | Yes |
| 09c | — | R-03, R-28 | Yes |
| 10a | CD-14 | All rules summarised | Yes |
| 10b | All concepts | All rules summarised | Yes |
| 11a | Tier structure | — | Yes |
| 11b | Tier 2 unlock | — | Yes |

**Coverage: 34/34 lessons traced. 0 lessons untraced.**

