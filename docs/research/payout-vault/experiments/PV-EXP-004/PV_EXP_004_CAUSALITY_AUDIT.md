# PV-EXP-004 Causality Audit
## Sprint 123A.13

**Generated:** 2026-07-29T22:06:30.756770+00:00

## Causality Checks

| Check | Result |
|---|---|
| FUTURE_BAR_USES | 0 |
| LOOKAHEAD_VIOLATIONS | 0 |
| ENTRY_BEFORE_SIGNAL | 0 |
| EXIT_BEFORE_ENTRY | 0 |
| DUPLICATE_TRADE_IDS | 0 |
| UNEXPLAINED_EVENT_LOSS | 0 |
| EVENTS_WITH_ZERO_TERMINAL_OUTCOMES | 0 |
| EVENTS_WITH_MULTIPLE_TERMINAL_OUTCOMES | 0 |
| OUTCOME_ACCOUNTING_RECONCILES | TRUE |
| DATASET_HASH_MATCH | TRUE |
| INPUT_LEDGER_HASH_MATCH | TRUE |
| INVALID_RISK_DISTANCE_EVENTS | 0 |

## Dataset Integrity

| Input | SHA-256 |
|---|---|
| PV_EXP_002_OUTCOME_LEDGER.json | `741e153ee454d2b080dd413d170436abb1400ecae3fbc10f627bffce9acf0989` |
| mnq_5m_features.parquet | `c970675391b970956f38d419ef95ff3e116e61ab8874eca7df2ab4334e715623` |
| PV_EXP_003_CANONICAL_BASELINE_PNL_LEDGER.json | `7f33cbf1dffed46604790e96abb57bc5036b4029d1bbe280a92266710db26eb6` |

## Execution Assumptions

| Parameter | Value |
|---|---|
| Same-bar rule | STOP_FIRST (conservative) |
| Gap-through rule | Fill at bar open |
| Target fill | Price must trade through target |
| Slippage | 2 ticks adverse on stop |
| Commission | $1.24 RT |
| Entry convention | Next bar after signal |

## Future-Mutation Test

Changing bars after a trade exit does not alter its outcome. All exit decisions
are based on bars up to and including the exit bar. No bar data after the exit
bar is accessed during simulation.

## Dataset-Truncation Test

The simulation uses only bars within the OOS window (2025-10-01 to 2026-07-20 UTC).
No bars outside this window are accessed.

## Authority Boundaries

| Boundary | Status |
|---|---|
| DARWIN_PROCESSBAR_CALLS | 0 |
| DARWIN_POSTBARAUTOMATION_CALLS | 0 |
| DARWIN_TRADERSPOST_CALLS | 0 |
| DARWIN_TRADOVATE_CALLS | 0 |
| LIVE_TRADES_INITIATED | 0 |
| STRATEGY_STATUS_CHANGES | 0 |
| CAPITAL_REALLOCATIONS | 0 |
| DARWIN_DECISION_AUTHORITY | DISABLED |
| DARWIN_EXECUTION_AUTHORITY | DISABLED |
