# Sprint 123A.8 — Gate G8 Final Evidence Lock Record

**Document type:** Immutable gate evidence lock  
**Sprint:** 123A.8 — Canonical Backtest Regeneration  
**Gate:** G8  
**Locked at:** 2026-07-25T03:30:00Z  
**Branch:** `sprint/123a-8-canonical-backtest-regeneration`  
**Remote HEAD:** `1cc2341c7cb8684b768d358595818e8fc3f4027a`  
**G7 Baseline SHA:** `17360ad6f638ddafa791274a455483e3b936fd4b`  

---

## Section 1: G7 Baseline Ancestry

The G8 branch descends directly from the G7 final lock commit.

```
git merge-base --is-ancestor 17360ad6f638ddafa791274a455483e3b936fd4b HEAD
Exit code: 0 (confirmed ancestor)
```

G7 gate documents confirmed present:
- `docs/reports/SPRINT_123A7_GATE_G7_AUTONOMOUS_RESEARCH_EVIDENCE.md`
- `docs/reports/SPRINT_123A7_GATE_G7_FINAL_LOCK_RECORD.md`

---

## Section 2: Frozen TypeScript Strategy Registry

The strategy registry TypeScript module is frozen and unchanged from G7.

| Field | Value |
|---|---|
| File | `server/darwin/strategy-registry/index.ts` |
| Git blob SHA | `6549df15ed8cc8e351d82e8dc647bb9c75f0dd69` |
| SHA-256 | `8d8de7c4dcdcf8ec3cc5f049e1f5315d4f096a212a1c1eb08b73fc1966aa7a39` |
| Contract content SHA-256 | `cb5c58947d04d8d41c5164e2563cedbb816c969500cef003c611f2a078f042fd` |
| Contract file SHA-256 | `0f9832059ee22d095a9dfc4322eda2f31dfc84d6e5b839c4756290aab6878284` |

All 5 strategies confirmed: version=1.0.0, data_source=DATABENTO, approved_sprint=123A.7.

---

## Section 3: Canonical Databento Dataset

| Field | Value |
|---|---|
| Source | Databento GLBX.MDP3 |
| Symbol | MNQ continuous (11 contract IDs) |
| Timeframe | 1m OHLCV → aggregated to 5m |
| Date range | 2024-01-01 to 2026-07-20 |
| Raw 1m bars | 902,065 |
| Canonical 5m bars | 180,414 |
| Download cost | $0.00 |
| Dataset SHA-256 | `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623` |
| Manifest SHA-256 | `9d60cac84434551d12021c67431af57a8a5fcb801807ad369426c98207096f15` |
| Quality | PASS — 0 nulls, 0 duplicates, 0 out-of-order bars |

---

## Section 4: Versioned Split Manifest v1.0.0

The split manifest was defined before any backtest execution and is immutable.

| Period | Start | End |
|---|---|---|
| Train | 2024-01-01 | 2025-03-31 |
| Validation | 2025-04-01 | 2025-09-30 |
| OOS (primary) | 2025-10-01 | 2026-07-20 |

**Split manifest SHA-256 (canonical serialization):** `5115e7fdfbc28170a6f28d501d88e34bd9511399b944359cdec1f7ff486f391d`  
**Split manifest file SHA-256:** `526c5ef3a5e40786227af91db24adfbb52778f66c2c55158fce287f3c23c71f5`  
**Roll policy:** RWP-001 (±3 CME trading days around quarterly roll dates)  
**Primary results:** ROLL_EXCLUDED | **Secondary results:** ROLL_INCLUSIVE

---

## Section 5: Deterministic Reproducibility — Three Independent Runs

The backtest engine is deterministic. Three independent runs on the same dataset produce identical trade ledger SHA-256 hashes.

| Run | Timestamp | Trade Ledger SHA-256 | Match |
|---|---|---|---|
| Run 1 | 2026-07-24T04:53:34Z | `670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22` | — |
| Run 2 | 2026-07-24T04:53:34Z | `670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22` | ✓ |
| Run 3 | 2026-07-25T03:17:00Z | `670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22` | ✓ |

**RUN_3_DETERMINISTIC_MATCH=TRUE**  
Run 3 used the identical engine (imported directly from `sprint-123a8-implementation.py`). All 2,856 trades match field-by-field.

---

## Section 6: Portfolio OOS Performance (2025-10-01 to 2026-07-20)

Primary results: roll-excluded, canonical commission ($5.00 RT), 0 slippage.

| Metric | Value |
|---|---|
| Total trades | 859 |
| Win rate | 37.8% |
| Profit factor | 0.9844 |
| Expectancy | −$3.34/trade |
| Net P&L | −$2,867 |
| Max drawdown | −$18,130 |

---

## Section 7: Per-Strategy OOS Classifications (Research Only)

> These are research classifications only. No live/paper status, risk, capital, or execution authority changes. DARWIN_DECISION_AUTHORITY=DISABLED. DARWIN_EXECUTION_AUTHORITY=DISABLED.

| Strategy | OOS Trades | Win Rate | Profit Factor | Expectancy | Classification |
|---|---|---|---|---|---|
| A1 | 187 | 33.7% | 0.8043 | −$38/trade | RESEARCH_FAIL |
| A3 | 0 | — | — | — | NO_TRADES (expected by design) |
| SB1 | 102 | 31.4% | 0.8551 | −$36/trade | RESEARCH_FAIL |
| ORB-1 | 314 | 33.4% | 0.9662 | −$8/trade | RESEARCH_FAIL |
| **B1** | **256** | **48.8%** | **1.2442** | **+$41/trade** | **RESEARCH_CAUTION** |
| Portfolio | 859 | 37.8% | 0.9844 | −$3/trade | RESEARCH_FAIL |

**A3 NO_TRADES is expected by design:** A3 score is always < A1 score when A1 is eligible under the ADE hierarchy. This confirms the hierarchy is functioning correctly.

---

## Section 8: Walk-Forward Validation (5 Folds)

| Fold | Train End | Val Period | Val PF | Profitable |
|---|---|---|---|---|
| 1 | 2024-06-30 | 2024-07-01–2024-09-30 | 1.1153 | ✓ |
| 2 | 2024-09-30 | 2024-10-01–2024-12-31 | 1.0418 | ✓ |
| 3 | 2024-12-31 | 2025-01-01–2025-03-31 | 0.8525 | ✗ |
| 4 | 2025-03-31 | 2025-04-01–2025-06-30 | 0.9103 | ✗ |
| 5 | 2025-06-30 | 2025-07-01–2025-09-30 | 0.9392 | ✗ |

**Profitable folds: 2/5.** The portfolio is not robustly profitable across walk-forward folds.

---

## Section 9: Cost/Slippage Sensitivity

20 scenarios tested (commission ×0.5–×2.0, slippage 0–3 ticks). **No scenario produces a profitable OOS portfolio.** The portfolio is not robust to realistic execution costs.

---

## Section 10: Leakage Audit

| Check | Result |
|---|---|
| Lookahead leakage | NONE — all features computed from data available at bar close |
| Target leakage | NONE — exit prices not used in entry signals |
| OOS contamination | NONE — OOS period not inspected before split definition |
| Feature engineering | NONE — all indicators use only past data |

---

## Section 11: Authority Checks

| Authority | Status |
|---|---|
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
| Automatic promotions | 0 |
| Automatic demotions | 0 |
| Automatic retirements | 0 |
| Capital reallocations | 0 |
| TradersPost API calls | 0 |
| Tradovate API calls | 0 |

All strategy statuses, risk parameters, and execution authorities are **unchanged** from the G7 baseline.

---

## Section 12: Test Suite Results

### TypeScript / Vitest (with DATABASE_URL set to live MySQL)

| Test Suite | Files | Tests | Result |
|---|---|---|---|
| G8 canonical backtest | 1 | 156 | ✓ PASS |
| G7 bar accounting | 1 | 7 | ✓ PASS |
| G7 Pine checksum | 1 | 15 | ✓ PASS |
| G6A authority | 1 | 48 | ✓ PASS |
| Strategy registry | 1 | 15 | ✓ PASS |
| ARD / ORACLE (DB) | 1 | 11 | ✓ PASS |
| Nexus routes (DB) | 1 | 16 | ✓ PASS |
| SB1 (DB) | 1 | 8 | ✓ PASS |
| All other suites | 30 | 806 | ✓ PASS |
| **Total** | **38** | **1,082** | **✓ ALL PASS** |

**Note:** The 16 DB-dependent tests require `DATABASE_URL` to be set. Without it, they fail with "DB unavailable" — this is expected behaviour and not a regression. The tests pass against the live MySQL instance on the Cloud Computer.

### Python / pytest

143 tests across 11 test files in `services/databento-feed/tests/`: **143 passed, 0 failed**.

### TypeScript type check

`npx tsc --noEmit` exit code: **0** (no type errors).

### Frontend build

`npx vite build` exit code: **0** (built in 1m 10s, 6,311 modules transformed).

### Secret scan

No hardcoded secrets, API keys, passwords, or tokens found in any G8-committed files.

---

## Section 13: Artefact Hash Manifest

All artefacts are stored on the Cloud Computer at `/home/ubuntu/atlas-historical/`.

| Artefact | SHA-256 | Size |
|---|---|---|
| `trade_ledger_full.json` | `a14454ceefc5a52989223628df744c1e0f9c2c6e32b4423302a5ca7d7f6266a4` | 2.1 MB |
| `split_manifest.json` | `526c5ef3a5e40786227af91db24adfbb52778f66c2c55158fce287f3c23c71f5` | 1.5 KB |
| `classification_results.json` | `a729a3ed0601aaa92eaa55ccca8db210e140292bce73fd354eda302729e8f11b` | 3.3 KB |
| `monitoring_baselines.json` | `29c3cec48ebed85a340350717f84a5573f3dbb56e38db201960f5d6310bfa20a` | 3.6 KB |
| `sensitivity_matrix.json` | `c367682c834fb5a950c4f989ba4744b7e57a780e9f491cb7f15d7053054a6ed7` | 4.4 KB |
| `walk_forward_results.json` | `efced0da84e49a4d760ff06f790155de185a19fd96cd52019c9ab843adee86f0` | 2.0 KB |
| `run3_verification.json` | `12b275e3fe868abbdc4b5b6be35084e6e95a8e6e18e0c17740cbfc53efd4b59b` | 1.2 KB |
| `canonical_backtest_results.json` | `9ec2aeb2e106b427e297d74784522d623a7f01bbf71842b0e3d9d6f20aa8a8cd` | 73 KB |
| `mnq_5m_features.parquet` | `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623` | 32.8 MB |
| `mnq_5m_manifest.json` | `9d60cac84434551d12021c67431af57a8a5fcb801807ad369426c98207096f15` | 1.5 KB |
| `canonical_strategy_contract.json` | `0f9832059ee22d095a9dfc4322eda2f31dfc84d6e5b839c4756290aab6878284` | 5.1 KB |
| `SPRINT_123A8_GATE_G8_EVIDENCE.md` | `9174fd7e8784f05b6e2b47ac510c30e7fa1ae3c83b21003b33bab80b82099fc8` | 12.3 KB |
| `index.ts` (strategy registry) | `8d8de7c4dcdcf8ec3cc5f049e1f5315d4f096a212a1c1eb08b73fc1966aa7a39` | 8.2 KB |
| `sprint-123a8-implementation.py` | `56fdc0b4919ba360f982f8f105fd2b8ba8958a56b1fbdfa4b6a17322c690a8af` | 52.7 KB |
| `sprint-123a8-run3-v2.py` | `9e2412c6d4236dd11b664e4cbc81118ae66bf5304f457b5b3f634a678a61523e` | 9.3 KB |

**Canonical trade ledger SHA-256 (deterministic serialization):** `670c3f7e59d82b3069df1ebcefdb9221a219ad73783618e7b35eca7864072e22`

---

## Section 14: GitHub Verification Record

| Field | Value |
|---|---|
| Repository | `atlas-nexus` (private) |
| Branch | `sprint/123a-8-canonical-backtest-regeneration` |
| Remote HEAD | `1cc2341c7cb8684b768d358595818e8fc3f4027a` |
| COMMIT-1 | `9f2466e11ef013a2db967ed71f84cd0d16dad139` — feat(g8): canonical backtest regeneration implementation |
| COMMIT-2 | `a613ab56f80e04d918ca5cd084ee97d4716cf2d9` — docs(g8): Gate G8 evidence report and handoff |
| COMMIT-3 | `1cc2341c7cb8684b768d358595818e8fc3f4027a` — chore(g8): update todo.md |
| LOCAL_SHA=REMOTE_SHA | ✓ VERIFIED |

---

## Section 15: DARWIN Research Implications

B1 is the single highest-value next experiment. It is the only strategy with a positive OOS profit factor (1.24, 256 trades, +$41/trade expectancy) and the lowest max drawdown (−$5,996) of all strategies. DARWIN's next cycle must investigate whether B1's edge is:

1. **Regime-dependent** — does it only work in volatile regimes, and is that regime identifiable in advance?
2. **Stable across sub-periods** — does the edge persist across all five OOS sub-quarters, or is it concentrated in one period?
3. **Transferable** — can the underlying market behaviour be converted into a more robust model that passes all strategy creation gates?

DARWIN must not create a new strategy or change any strategy status until this investigation is complete. The objective is to discover the market behaviour, not to produce more strategies.

---

## Gate G8 Status

**GATE G8: COMPLETE**

All 15 sections verified. Three deterministic runs confirmed. Full test suite passing. No authority changes. No regressions. Artefact manifest sealed.

---

*This document is immutable. Generated by Atlas Nexus DARWIN research engine, Sprint 123A.8.*
