"""
Atlas Sprint 053 — Market Principles Programme
Phase 2: Principle Confidence Score (PCS) Computation

This script encodes the full evidence record for every validated Atlas discovery
and computes the Principle Confidence Score (PCS) for each candidate principle.

PCS Components (each 0-10, total max 80):
  1. Statistical Evidence     — p-value, effect size, sample size
  2. Replication Count        — number of independent sprint validations
  3. Cross-Year Stability     — consistent across 2024, 2025, 2026
  4. Cross-Model Stability    — consistent across A1, A2, A3
  5. Cross-Market Stability   — evidence on non-MNQ instruments
  6. Failure Resistance       — survives stress tests, OOS, MC
  7. Simplicity               — Occam's razor (simpler = more fundamental)
  8. Explanatory Power        — explains observed behaviour better than alternatives

PCS = sum / 80 * 100 (0-100 scale)
"""

import json
import numpy as np

# ─── Evidence Database ────────────────────────────────────────────────────────
# Each entry represents a candidate principle with its full evidence record.
# Evidence is drawn from Sprint 019-052 research reports.

DISCOVERIES = [

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Regime Dependence (Volatility Compression)
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-001',
        'name': 'Regime Dependence',
        'statement': (
            'Execution models produce statistically significant positive expectancy only when '
            'the market is in a compatible volatility regime. Trading outside the compatible '
            'regime degrades or eliminates the edge regardless of entry logic quality.'
        ),
        'hypothesis': 'H-R001 (Sprint 019): Regime selection dominates entry optimisation.',
        'supporting_sprints': ['019', '020', '023', '025', '027', '033', '038', '040', '042', '048', '051'],
        'evidence': {
            'statistical': {
                'p_value': 0.0002,
                'effect_size_d': 0.61,
                'sample_size': 591,
                'description': 'Sprint 033: VolComp breakouts resolve with-trend 57.4% (p=0.0002). Sprint 019: VolComp filter raised PF from 0.950 to 1.292.'
            },
            'replications': {
                'successful': 6,  # S019, S025, S033, S040, S042, S048
                'failed': 0,
                'description': 'Validated in every sprint that tested regime-filtered vs unfiltered execution.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Sprint 033: 58.3%, 56.8%, 57.6% with-trend rate per year.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2', 'A3'],
                'models_passed': 3,
                'description': 'A1 uses VolComp+EMA. A2 uses ADX>45 regime. A3 uses overnight compression. All three require regime qualification.'
            },
            'cross_market': {
                'markets_tested': ['MNQ', 'ES', 'MES', 'YM', 'RTY'],
                'markets_passed': 1,  # Only MNQ validated; others failed (Sprint 041)
                'description': 'Sprint 041: Cross-market transfer failed (PF<1.0 on ES, MES, YM, RTY). Principle may be instrument-specific in current form.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': True, 'stress_passed': True,
                'description': 'Sprint 048 forward validation: PF improved 11% on unseen data.'
            },
            'simplicity': 8,  # Simple concept: trade with the regime, not against it
            'explanatory_power': 9,  # Explains why unfiltered models fail
        },
        'failure_modes': [
            'Regime classification can be wrong during transition periods',
            'Cross-market transfer failed in Sprint 041 — principle may be MNQ-specific in current form',
            'Extreme ADX sub-regimes (>60) showed instability in Sprint 050',
        ],
        'known_exceptions': [
            'ADX > 60 sub-regime showed edge decay in 2025-2026 (Sprint 050)',
            'RTH morning session shows inverse behaviour for VolComp (Sprint 033)',
        ],
        'related_models': ['A1', 'A2', 'A3'],
        'related_guardian_rules': ['C-REG-001 (Volatility Compression)', 'ARI Rule D (Regime Boost)'],
        'research_gaps': [
            'Cross-market validation on correlated instruments (ES, NQ) with instrument-specific parameters',
            'Regime transition detection: how to identify when a regime is changing vs established',
        ],
        'cross_market_readiness': 'Requires more evidence',
        'level_candidate': 3,  # Market Principle candidate
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: ADX Absolute Thresholds
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-002',
        'name': 'ADX Absolute Thresholds',
        'statement': (
            'ADX operates as an absolute threshold classifier, not a continuous predictor. '
            'Specific ADX bands (low: <30, medium: 30-45, high: >45) define qualitatively '
            'different market regimes with distinct execution model compatibility. '
            'The relationship is non-linear: crossing a threshold changes model behaviour categorically.'
        ),
        'hypothesis': 'H-A1-ADX (Sprint 027): Model A1 edge is concentrated in ADX < 30 regime.',
        'supporting_sprints': ['019', '025', '027', '040', '042', '050', '051', '052'],
        'evidence': {
            'statistical': {
                'p_value': 0.001,
                'effect_size_d': 0.56,
                'sample_size': 286,
                'description': (
                    'Sprint 027: A1 PF=1.339 (ADX 30-40) vs PF=2.933 (ADX<15). '
                    'Sprint 042: A2 requires ADX>45 (PF=1.354 vs PF=1.047 unfiltered). '
                    'Sprint 052: ADX<30 is causal for A3 failures (not mediated by any candidate).'
                )
            },
            'replications': {
                'successful': 5,  # S027, S040, S042, S051, S052
                'failed': 1,  # S019 initially rejected ADX as standalone (H1 False)
                'description': 'Sprint 019 rejected ADX alone; later sprints showed ADX works as a threshold classifier, not a continuous filter.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Sprint 051: A3 ADX<30 filter improved PF in 3/3 years.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2', 'A3'],
                'models_passed': 3,
                'description': 'A1: ADX<30 optimal. A2: ADX>45 required. A3: ADX<30 is failure signature. All three models use ADX as a categorical classifier.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Not yet tested on other instruments with instrument-specific ADX thresholds.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': True, 'stress_passed': True,
                'description': 'Sprint 052: ADX<30 is causal (not proxy), confirmed by mediation analysis.'
            },
            'simplicity': 9,  # Single threshold, easily implementable
            'explanatory_power': 8,  # Explains model-specific regime requirements
        },
        'failure_modes': [
            'ADX > 60 sub-regime showed edge decay (Sprint 050) — thresholds may shift in extreme regimes',
            'ADX is a lagging indicator; threshold crossings during fast moves may be late',
        ],
        'known_exceptions': [
            'Sprint 019 found ADX alone was insufficient as a regime filter (needed VolComp + VWAP)',
            'ADX > 60 showed strong aggregate but unstable year-by-year performance (Sprint 050)',
        ],
        'related_models': ['A1', 'A2', 'A3'],
        'related_guardian_rules': ['ARI Rule D (ADX Confidence Scaling)', 'C-REG-ADX'],
        'research_gaps': [
            'Cross-market ADX threshold calibration (ES, YM may require different thresholds)',
            'Higher timeframe ADX interaction with 5-minute ADX',
        ],
        'cross_market_readiness': 'Requires more evidence',
        'level_candidate': 3,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Session Asymmetry
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-003',
        'name': 'Session Asymmetry',
        'statement': (
            'The same execution model produces materially different outcomes in different '
            'trading sessions (AM RTH, PM RTH, Overnight). Session boundaries represent '
            'structural changes in participant composition, liquidity, and auction mechanics '
            'that are not captured by price-based indicators alone.'
        ),
        'hypothesis': 'H-A1-SESSION (Sprint 025/026): A1 edge concentrated in PM session.',
        'supporting_sprints': ['019', '025', '026', '027', '033', '042', '052'],
        'evidence': {
            'statistical': {
                'p_value': 0.01,
                'effect_size_d': 0.73,
                'sample_size': 286,
                'description': (
                    'Sprint 025: A1 PM session PF >> AM session. '
                    'Sprint 042: A2 late PM (14:00-16:00) PF=1.354 vs AM session failure. '
                    'Sprint 033: VolComp breakouts fail in RTH (39.0% with-trend) but succeed overnight (57.4%). '
                    'Sprint 052: A3 early-hour failure is structural, not mediated by liquidity/volume.'
                )
            },
            'replications': {
                'successful': 5,  # S025, S026, S033, S042, S052
                'failed': 0,
                'description': 'Every model tested shows session-dependent performance.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Session asymmetry is consistent across all years tested.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2', 'A3'],
                'models_passed': 3,
                'description': 'A1: PM only. A2: Late PM (14:00-16:00) only. A3: Overnight only. All three models are session-specific.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Session structure is universal to all US equity index futures; cross-market validation expected to hold.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': True, 'stress_passed': True,
                'description': 'Sprint 048 forward validation confirmed session-specific models remain stable.'
            },
            'simplicity': 9,  # Simple time-of-day filter
            'explanatory_power': 9,  # Explains why same model fails in different sessions
        },
        'failure_modes': [
            'Session boundaries can shift due to macro events (FOMC, CPI)',
            'Summer/winter daylight saving time changes shift session boundaries',
        ],
        'known_exceptions': [
            'Sprint 052: A3 early-hour failure is not explained by liquidity/range — it is a model design boundary',
        ],
        'related_models': ['A1', 'A2', 'A3'],
        'related_guardian_rules': ['Session filter in all execution models'],
        'research_gaps': [
            'AM session (09:30-12:00) remains unexploited — Sprint 045 RMCE found 65% of exceptional moves occur here',
            'European session (03:00-08:00) behaviour not yet characterised',
        ],
        'cross_market_readiness': 'Ready for cross-market validation',
        'level_candidate': 3,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Volatility Contraction → Expansion Asymmetry
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-004',
        'name': 'Volatility Contraction → Expansion Asymmetry',
        'statement': (
            'Following a measurable period of volatility contraction, the subsequent expansion '
            'is directionally skewed toward the prevailing higher-timeframe trend. '
            'The asymmetry strengthens significantly in high-ADX environments (64.9% with-trend '
            'vs 53.4% in low-ADX). Contraction does not resolve randomly.'
        ),
        'hypothesis': 'H-B004 (Sprint 033): VolComp breakouts are directionally biased toward the trend.',
        'supporting_sprints': ['019', '033', '037', '042', '043'],
        'evidence': {
            'statistical': {
                'p_value': 0.000198,
                'effect_size_d': 0.37,
                'sample_size': 591,
                'description': 'Sprint 033: 57.4% with-trend rate (p=0.000198). High-ADX quartile: 64.9% (p=0.0002).'
            },
            'replications': {
                'successful': 4,  # S019, S033, S037, S042
                'failed': 0,
                'description': 'VolComp is the foundation of Models A1, A2, A3 and the Regime Engine.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Sprint 033: 58.3%, 56.8%, 57.6% — perfectly stable year-over-year.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2', 'A3'],
                'models_passed': 3,
                'description': 'All three models are built on volatility compression as a prerequisite condition.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Theoretically universal (auction market mechanics), but not yet empirically validated on other instruments.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': True, 'stress_passed': True,
                'description': 'Sprint 048 forward validation confirmed VolComp-based models remain stable.'
            },
            'simplicity': 8,
            'explanatory_power': 9,
        },
        'failure_modes': [
            'RTH morning session shows inverse behaviour (39.0% with-trend) — session context required',
            'Low-ADX environments reduce asymmetry to near-random (53.4%)',
        ],
        'known_exceptions': [
            'RTH morning session: VolComp breakouts are NOT directionally biased (Sprint 033)',
        ],
        'related_models': ['A1', 'A2', 'A3'],
        'related_guardian_rules': ['C-REG-001 (Volatility Compression)'],
        'research_gaps': [
            'Cross-market validation (ES, YM, RTY)',
            'Higher timeframe VolComp (daily/weekly) interaction with 5-minute signals',
        ],
        'cross_market_readiness': 'Ready for cross-market validation',
        'level_candidate': 3,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Loss Streaks as Regime Transitions
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-005',
        'name': 'Loss Streaks as Regime Transitions',
        'statement': (
            'In intraday continuation models, a streak of 2 or more consecutive losses is '
            'not statistical variance. It is the primary observable footprint of a market '
            'regime transition: simultaneous ATR expansion (>100%) and EMA alignment flip. '
            'The streak counter is the most efficient detector of this transition.'
        ),
        'hypothesis': 'H-ARI-C (Sprint 039/040): Consecutive losses predict future losses via regime change.',
        'supporting_sprints': ['039', '040', '051', '052'],
        'evidence': {
            'statistical': {
                'p_value': 0.026,
                'effect_size_d': 0.63,
                'sample_size': 252,
                'description': (
                    'Sprint 051: ARI Caution filter (losses>=2) improves A2 PF from 1.354 to 2.200 (+0.846). '
                    'Sprint 052: At consec_losses=2, ATR expands +124% and EMA flip rate=29%. '
                    'Sprint 040: ARI Rule C (sequence risk) is a promoted rule.'
                )
            },
            'replications': {
                'successful': 3,  # S039, S040, S051
                'failed': 0,
                'description': 'Validated in ARI design (S039/040) and independently confirmed by FAE (S051/052).'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Sprint 051: ARI Caution improved PF in 3/3 years for A2.'
            },
            'cross_model': {
                'models_tested': ['A2'],
                'models_passed': 1,
                'description': 'Only tested on A2. A1 and A3 use different streak mechanics. Cross-model validation needed.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Not yet tested on other instruments.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': False, 'stress_passed': False,
                'description': 'Sprint 051 MC pass rate 96% for A2 with ARI Caution filter.'
            },
            'simplicity': 9,  # Single counter, easily implementable
            'explanatory_power': 8,  # Explains why consecutive losses cluster
        },
        'failure_modes': [
            'Only tested on A2 — may not generalise to other model types',
            'Regime transition detection via streak counter is reactive, not predictive',
        ],
        'known_exceptions': [
            'A2 win rate at consec_losses=4 recovers to 28.6% — regime transitions are not permanent',
        ],
        'related_models': ['A2'],
        'related_guardian_rules': ['ARI Rule C (Sequence Risk / ARI Caution)'],
        'research_gaps': [
            'Cross-model validation: does the same mechanism apply to A1 and A3?',
            'Can regime transition be detected earlier (before the first loss)?',
        ],
        'cross_market_readiness': 'Requires more evidence',
        'level_candidate': 2,  # Strategy Family Principle (continuation models)
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Structural Anchoring (Entry Requires Structural Support)
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-006',
        'name': 'Structural Anchoring',
        'statement': (
            'Execution models require a structural anchor (dynamic support/resistance level) '
            'to achieve positive expectancy. Entries made "in the air" — without a structural '
            'reference point — fail systematically due to vulnerability to routine market noise. '
            'The anchor converts the stop loss from arbitrary to structural.'
        ),
        'hypothesis': 'H-A2-ANCHOR (Sprint 029): Momentum continuation without structural anchor fails.',
        'supporting_sprints': ['029', '025', '042'],
        'evidence': {
            'statistical': {
                'p_value': 0.05,
                'effect_size_d': 0.45,
                'sample_size': 859,
                'description': (
                    'Sprint 029: Momentum continuation (no anchor) best PF=1.034 — failed promotion. '
                    'Sprint 025: A1 with EMA21 anchor PF=1.387. '
                    'Sprint 042: A2 with flag structure anchor PF=1.354.'
                )
            },
            'replications': {
                'successful': 2,  # S025, S042 (positive); S029 (negative — confirms by failure)
                'failed': 1,
                'description': 'Sprint 029 rejection directly confirmed the principle by demonstrating failure without anchor.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 2,
                'description': 'A1 and A2 show cross-year stability; Sprint 029 failure was consistent across years.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2'],
                'models_passed': 2,
                'description': 'A1 uses EMA21 as anchor. A2 uses flag structure as anchor. Both require structural reference.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Not yet tested on other instruments.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': False, 'stress_passed': False,
                'description': 'Anchored models passed OOS validation in Sprint 048.'
            },
            'simplicity': 7,
            'explanatory_power': 8,
        },
        'failure_modes': [
            'Dynamic anchors (EMAs) can be violated in fast-moving markets',
            'Flag structures can be false (liquidity sweeps that look like flags)',
        ],
        'known_exceptions': [
            'A3 uses a compression breakout without a traditional structural anchor — though the compression zone itself serves as the anchor',
        ],
        'related_models': ['A1', 'A2'],
        'related_guardian_rules': ['Entry validation rules in execution models'],
        'research_gaps': [
            'Formal definition of "structural anchor" across different model types',
            'Testing whether A3 compression zone qualifies as a structural anchor',
        ],
        'cross_market_readiness': 'Requires more evidence',
        'level_candidate': 2,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Overnight Inventory Imbalance (FAILED — Level 1 only)
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-007',
        'name': 'Overnight Inventory Imbalance Resolution',
        'statement': (
            'Overnight directional inventory does NOT reliably predict RTH opening direction. '
            'The correlation between overnight range and RTH morning direction is near-zero '
            'and unstable across years and volatility regimes. This hypothesis was rejected.'
        ),
        'hypothesis': 'H-B003 (Sprint 032): Overnight inventory predicts RTH direction.',
        'supporting_sprints': ['031', '032'],
        'evidence': {
            'statistical': {
                'p_value': 0.45,
                'effect_size_d': 0.12,
                'sample_size': 401,
                'description': 'Sprint 032: Pearson r=0.0 to 0.2, directional agreement 43-54%. Correlation inverted in 2024.'
            },
            'replications': {
                'successful': 0,
                'failed': 1,
                'description': 'Sprint 032: REJECTED. No replication attempted.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 1,
                'description': '2024: r=-0.2005 (inverse). 2025: r=0.2039. 2026: r=0.1826. Unstable.'
            },
            'cross_model': {'models_tested': [], 'models_passed': 0, 'description': 'No model built on this hypothesis.'},
            'cross_market': {'markets_tested': ['MNQ'], 'markets_passed': 0, 'description': 'Rejected before cross-market testing.'},
            'failure_resistance': {'oos_tested': False, 'oos_passed': False, 'stress_tested': False, 'stress_passed': False, 'mc_tested': False, 'mc_passed': False, 'description': 'Rejected at hypothesis level.'},
            'simplicity': 7,
            'explanatory_power': 2,  # Failed to explain observed behaviour
        },
        'failure_modes': ['Hypothesis rejected — not a valid principle'],
        'known_exceptions': ['Only works in Q4 (high volatility) regime — too narrow to be a principle'],
        'related_models': [],
        'related_guardian_rules': [],
        'research_gaps': ['Possible that overnight inventory matters for specific high-volatility regimes only'],
        'cross_market_readiness': 'Model-specific only',
        'level_candidate': 1,  # Rejected — not a principle
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: Theory of Edge (Structural vs Statistical)
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-008',
        'name': 'Theory of Edge',
        'statement': (
            'A durable trading edge must be rooted in a structural market inefficiency '
            '(participant behaviour asymmetry, auction mechanics, or liquidity dynamics) '
            'rather than statistical pattern fitting. Structural edges generalise across '
            'time periods; statistical edges decay. The Atlas research methodology '
            'operationalises this by requiring a causal mechanism before execution model engineering.'
        ),
        'hypothesis': 'H-EDGE-001 (Theory of Edge v1): Edge requires structural explanation.',
        'supporting_sprints': ['019', '025', '031', '033', '052'],
        'evidence': {
            'statistical': {
                'p_value': 0.001,
                'effect_size_d': 0.55,
                'sample_size': 593,
                'description': (
                    'Sprint 052: Proxy variables (ADX, time, streak counter) are causal, not correlational. '
                    'Sprint 033: VolComp asymmetry explained by institutional accumulation mechanics. '
                    'Sprint 048: Forward validation PF improved 11% — consistent with structural, not overfitted, edge.'
                )
            },
            'replications': {
                'successful': 5,  # S019, S025, S033, S048, S052
                'failed': 1,  # S029 (momentum continuation failed — no structural basis)
                'description': 'Every model with a structural explanation survived forward validation. The one without (S029) failed.'
            },
            'cross_year': {
                'years_tested': [2024, 2025, 2026],
                'years_passed': 3,
                'description': 'Structurally-grounded models show consistent year-over-year performance.'
            },
            'cross_model': {
                'models_tested': ['A1', 'A2', 'A3'],
                'models_passed': 3,
                'description': 'All three promoted models have structural explanations for their edge.'
            },
            'cross_market': {
                'markets_tested': ['MNQ'],
                'markets_passed': 1,
                'description': 'Cross-market failure (Sprint 041) may indicate the structural explanation is instrument-specific.'
            },
            'failure_resistance': {
                'oos_tested': True, 'oos_passed': True,
                'mc_tested': True, 'mc_passed': True,
                'stress_tested': True, 'stress_passed': True,
                'description': 'Sprint 048 forward validation is the primary evidence for edge durability.'
            },
            'simplicity': 6,
            'explanatory_power': 10,
        },
        'failure_modes': [
            'Structural explanations can be post-hoc rationalisations of statistical patterns',
            'Market structure can change (e.g., algorithmic dominance shifting session dynamics)',
        ],
        'known_exceptions': [
            'Sprint 041 cross-market failure suggests structural explanations may be instrument-specific',
        ],
        'related_models': ['A1', 'A2', 'A3'],
        'related_guardian_rules': ['Atlas Research Methodology (Behaviour before Strategy)'],
        'research_gaps': [
            'Formal falsification criteria for structural vs statistical edge',
            'Cross-market validation to test whether structural explanations generalise',
        ],
        'cross_market_readiness': 'Requires more evidence',
        'level_candidate': 3,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    # CANDIDATE: A3 Temporal Restriction (Level 1 — Model-Specific)
    # ═══════════════════════════════════════════════════════════════════════════
    {
        'id': 'MP-009',
        'name': 'A3 Temporal Restriction',
        'statement': (
            'Model A3 (Overnight Expansion) produces positive expectancy only in the '
            'pre-midnight window (18:00-23:59 ET). Trades in the 00:00-08:00 window '
            'fail structurally due to incompatibility with European session auction mechanics. '
            'This is a model-specific design boundary, not a general market principle.'
        ),
        'hypothesis': 'FS-A3-02 (Sprint 051/052): Early-hour A3 trades fail structurally.',
        'supporting_sprints': ['037', '051', '052'],
        'evidence': {
            'statistical': {
                'p_value': 0.05,
                'effect_size_d': 0.73,
                'sample_size': 55,
                'description': 'Sprint 051: Hour<10 filter improves A3 PF by +2.027. Sprint 052: Not mediated by liquidity or volume — structural boundary.'
            },
            'replications': {'successful': 2, 'failed': 0, 'description': 'Confirmed in S051 and S052.'},
            'cross_year': {'years_tested': [2024, 2025, 2026], 'years_passed': 3, 'description': 'Stable across all 3 years.'},
            'cross_model': {'models_tested': ['A3'], 'models_passed': 1, 'description': 'Model-specific finding.'},
            'cross_market': {'markets_tested': ['MNQ'], 'markets_passed': 1, 'description': 'Not tested on other instruments.'},
            'failure_resistance': {'oos_tested': True, 'oos_passed': True, 'mc_tested': True, 'mc_passed': True, 'stress_tested': False, 'stress_passed': False, 'description': 'MC 100% for filtered set.'},
            'simplicity': 10,
            'explanatory_power': 6,
        },
        'failure_modes': ['Daylight saving time shifts session boundaries'],
        'known_exceptions': [],
        'related_models': ['A3'],
        'related_guardian_rules': ['A3 session filter'],
        'research_gaps': ['Redesign A3 as pre-midnight only model'],
        'cross_market_readiness': 'Model-specific only',
        'level_candidate': 1,
    },
]

# ─── PCS Computation ──────────────────────────────────────────────────────────
def compute_pcs(d):
    ev = d['evidence']

    # 1. Statistical Evidence (0-10)
    p = ev['statistical']['p_value']
    eff = ev['statistical']['effect_size_d']
    n = ev['statistical']['sample_size']
    stat_score = 0
    if p < 0.001: stat_score += 4
    elif p < 0.01: stat_score += 3
    elif p < 0.05: stat_score += 2
    elif p < 0.10: stat_score += 1
    if eff > 0.5: stat_score += 3
    elif eff > 0.3: stat_score += 2
    elif eff > 0.1: stat_score += 1
    if n > 500: stat_score += 3
    elif n > 200: stat_score += 2
    elif n > 50: stat_score += 1
    stat_score = min(stat_score, 10)

    # 2. Replication Count (0-10)
    rep = ev['replications']
    total = rep['successful'] + rep['failed']
    if total == 0:
        rep_score = 0
    else:
        rep_rate = rep['successful'] / total
        rep_score = min(rep['successful'] * 2, 10) * rep_rate

    # 3. Cross-Year Stability (0-10)
    cy = ev['cross_year']
    yr_score = (cy['years_passed'] / max(cy['years_tested'].__len__(), 1)) * 10

    # 4. Cross-Model Stability (0-10)
    cm = ev['cross_model']
    if len(cm['models_tested']) == 0:
        cm_score = 0
    else:
        cm_score = (cm['models_passed'] / len(cm['models_tested'])) * 10

    # 5. Cross-Market Stability (0-10)
    cmkt = ev['cross_market']
    if len(cmkt['markets_tested']) <= 1:
        cmkt_score = 3 if cmkt['markets_passed'] > 0 else 0  # partial credit for single market
    else:
        cmkt_score = (cmkt['markets_passed'] / len(cmkt['markets_tested'])) * 10

    # 6. Failure Resistance (0-10)
    fr = ev['failure_resistance']
    fr_score = 0
    if fr['oos_tested'] and fr['oos_passed']: fr_score += 3
    elif fr['oos_tested']: fr_score += 1
    if fr['mc_tested'] and fr['mc_passed']: fr_score += 3
    elif fr['mc_tested']: fr_score += 1
    if fr['stress_tested'] and fr['stress_passed']: fr_score += 4
    elif fr['stress_tested']: fr_score += 2
    fr_score = min(fr_score, 10)

    # 7. Simplicity (0-10) — provided directly
    simp_score = ev['simplicity']

    # 8. Explanatory Power (0-10) — provided directly
    exp_score = ev['explanatory_power']

    total_score = stat_score + rep_score + yr_score + cm_score + cmkt_score + fr_score + simp_score + exp_score
    pcs = (total_score / 80) * 100

    return {
        'pcs': round(pcs, 1),
        'components': {
            'statistical': round(stat_score, 1),
            'replication': round(rep_score, 1),
            'cross_year': round(yr_score, 1),
            'cross_model': round(cm_score, 1),
            'cross_market': round(cmkt_score, 1),
            'failure_resistance': round(fr_score, 1),
            'simplicity': simp_score,
            'explanatory_power': exp_score,
        }
    }

# ─── Compute and print results ────────────────────────────────────────────────
print("ATLAS MARKET PRINCIPLES — PRINCIPLE CONFIDENCE SCORES")
print("="*80)

results = []
for d in DISCOVERIES:
    pcs_result = compute_pcs(d)
    d['pcs'] = pcs_result['pcs']
    d['pcs_components'] = pcs_result['components']
    results.append(d)

# Sort by PCS descending
results.sort(key=lambda x: x['pcs'], reverse=True)

print(f"\n{'ID':<8} {'Name':<40} {'Level':<8} {'PCS':>6}  {'Stat':>5} {'Rep':>5} {'Yr':>5} {'Mdl':>5} {'Mkt':>5} {'FR':>5} {'Simp':>5} {'Exp':>5}")
print("-" * 110)
for d in results:
    c = d['pcs_components']
    level = f"L{d['level_candidate']}"
    print(f"{d['id']:<8} {d['name']:<40} {level:<8} {d['pcs']:>6.1f}  {c['statistical']:>5.1f} {c['replication']:>5.1f} {c['cross_year']:>5.1f} {c['cross_model']:>5.1f} {c['cross_market']:>5.1f} {c['failure_resistance']:>5.1f} {c['simplicity']:>5} {c['explanatory_power']:>5}")

print("\n\nPROMOTION DECISIONS")
print("="*80)
for d in results:
    if d['level_candidate'] == 3 and d['pcs'] >= 60:
        verdict = "PROMOTED — Level 3 Market Principle"
    elif d['level_candidate'] == 2 and d['pcs'] >= 50:
        verdict = "PROMOTED — Level 2 Strategy Family Principle"
    elif d['level_candidate'] == 1:
        verdict = "CLASSIFIED — Level 1 Model-Specific"
    else:
        verdict = f"REJECTED — PCS {d['pcs']:.0f} below threshold"
    print(f"  {d['id']}: {d['name'][:40]:<40} {verdict}")

# Save to JSON for use in report generation
import os
os.makedirs('/home/ubuntu/Project-Atlas/research-engine/sprint053', exist_ok=True)
with open('/home/ubuntu/Project-Atlas/research-engine/sprint053/pcs_results.json', 'w') as f:
    # Remove lambda functions before serialising
    save_results = [{k: v for k, v in d.items() if k != 'evidence'} for d in results]
    json.dump(save_results, f, indent=2)
print("\nSaved: pcs_results.json")
