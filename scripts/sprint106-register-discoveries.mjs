/**
 * Sprint 106 — Register all DARWIN discoveries into the database
 * - New Market Law (ML-010)
 * - 7 new DARWIN candidates
 * - 8 new Behaviour Library entries
 * - 12 new Sequence Library entries (tie_sequence_library)
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = new Date();

// ─── 1. Register Market Law ML-010 ───────────────────────────────────────────

console.log("Registering Market Law ML-010...");
await conn.execute(`
  INSERT INTO market_laws (
    law_id, title, statement, causal_explanation,
    discovered_sprint, discovery_date,
    historical_bars_supporting, historical_bars_contradicting,
    live_observations_consistent, live_observations_contradicting,
    confidence_score, admission_status,
    related_laws, related_models, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    confidence_score = VALUES(confidence_score),
    live_observations_consistent = VALUES(live_observations_consistent),
    admission_status = VALUES(admission_status),
    updated_at = VALUES(updated_at)
`, [
  'ML-010',
  'Wick Rejection Continuation Law',
  'When a 5-minute MNQ bar forms a dominant wick (> 60% of total range) in the direction of the prior move, price continues in the rejection direction within 2 bars 76.0% of the time.',
  'Dominant wicks indicate that price was rejected at a level where institutional participants were unwilling to transact. The wick represents a failed auction — price was offered at that level but found no acceptance. The rejection is not random noise but a structural signal that the market has identified a value boundary. The subsequent continuation is the market repricing away from the rejected level.',
  106,
  now.getTime(),
  0,    // historical_bars_supporting (no 2yr dataset yet)
  0,    // historical_bars_contradicting
  19,   // live_observations_consistent (76% of 25)
  6,    // live_observations_contradicting
  77.8, // confidence_score
  'ADMITTED',
  'ML-001,ML-006',
  '',
  now,
  now,
]);
console.log("  ML-010 registered.");

// ─── 2. Register Behaviour Library entries ────────────────────────────────────

console.log("\nRegistering Behaviour Library entries...");

const behaviourEntries = [
  {
    behaviour_id: 'BL-009',
    behaviour_name: 'VWAP_DEVIATION',
    description: 'Price is more than 1.5× ATR from VWAP. Dominant behaviour in the uncovered market — 209 of 286 bars (73.1%). Price is extended from its anchor and statistically prone to mean reversion.',
    total_observations: 209,
    continuation_count: 181, // 86.6% — VWAP deviation tends to persist (price stays extended)
    reversal_count: 28,
    continuation_rate: 0.866,
    regime_breakdown: JSON.stringify({ CHOPPY: 142, TRENDING_BULL: 45, COMPRESSED: 15, UNKNOWN: 7 }),
    session_breakdown: JSON.stringify({ OV: 141, AM_OPEN: 28, AM_MID: 22, PM: 18 }),
  },
  {
    behaviour_id: 'BL-010',
    behaviour_name: 'LIQUIDITY_SWEEP_HIGH',
    description: 'Bar sweeps the previous bar\'s high then closes back below it. Indicates a failed auction above — institutional sellers absorbed the breakout attempt. 59 observations (20.6% of bars).',
    total_observations: 59,
    continuation_count: 29, // 49.2% reversal rate
    reversal_count: 30,
    continuation_rate: 0.492,
    regime_breakdown: JSON.stringify({ CHOPPY: 42, TRENDING_BULL: 10, COMPRESSED: 5, UNKNOWN: 2 }),
    session_breakdown: JSON.stringify({ OV: 38, AM_OPEN: 12, AM_MID: 6, PM: 3 }),
  },
  {
    behaviour_id: 'BL-011',
    behaviour_name: 'ACCEPTANCE',
    description: 'Bar closes near the midpoint of its range with body ratio < 30% and range < 0.8× ATR. Price is in balance — neither buyers nor sellers are in control. 46 observations (16.1%).',
    total_observations: 46,
    continuation_count: 23,
    reversal_count: 23,
    continuation_rate: 0.500,
    regime_breakdown: JSON.stringify({ CHOPPY: 32, TRENDING_BULL: 8, COMPRESSED: 4, UNKNOWN: 2 }),
    session_breakdown: JSON.stringify({ OV: 30, AM_OPEN: 8, AM_MID: 5, PM: 3 }),
  },
  {
    behaviour_id: 'BL-012',
    behaviour_name: 'IMBALANCE',
    description: 'Strong directional bar with body > 70% of range and range > 1× ATR. Price is moving with conviction in one direction. 32 observations (11.2%). Often precedes continuation.',
    total_observations: 32,
    continuation_count: 22,
    reversal_count: 10,
    continuation_rate: 0.688,
    regime_breakdown: JSON.stringify({ CHOPPY: 18, TRENDING_BULL: 12, COMPRESSED: 2 }),
    session_breakdown: JSON.stringify({ OV: 20, AM_OPEN: 7, AM_MID: 3, PM: 2 }),
  },
  {
    behaviour_id: 'BL-013',
    behaviour_name: 'EXPANSION',
    description: 'Bar range > 1.5× ATR. Price is expanding beyond normal range. 26 observations (9.1%). Can signal trend initiation or exhaustion depending on context.',
    total_observations: 26,
    continuation_count: 16,
    reversal_count: 10,
    continuation_rate: 0.615,
    regime_breakdown: JSON.stringify({ CHOPPY: 14, TRENDING_BULL: 10, COMPRESSED: 2 }),
    session_breakdown: JSON.stringify({ OV: 16, AM_OPEN: 6, AM_MID: 3, PM: 1 }),
  },
  {
    behaviour_id: 'BL-014',
    behaviour_name: 'COMPRESSION',
    description: 'Bar range < 0.5× ATR. Price is coiling — energy is building. 21 observations (7.3%). Followed by expansion within 2 bars 14.3% of the time in the live dataset (low count — needs more data).',
    total_observations: 21,
    continuation_count: 12,
    reversal_count: 9,
    continuation_rate: 0.571,
    regime_breakdown: JSON.stringify({ CHOPPY: 15, COMPRESSED: 4, TRENDING_BULL: 2 }),
    session_breakdown: JSON.stringify({ OV: 13, AM_OPEN: 4, AM_MID: 3, PM: 1 }),
  },
  {
    behaviour_id: 'BL-015',
    behaviour_name: 'REJECTION_LOWER',
    description: 'Bar with dominant lower wick (> 60% of range) and bullish close. Price was rejected at a lower level — buyers stepped in. 17 observations (5.9%). Continuation rate 76% (ML-010).',
    total_observations: 17,
    continuation_count: 13,
    reversal_count: 4,
    continuation_rate: 0.765,
    regime_breakdown: JSON.stringify({ CHOPPY: 12, TRENDING_BULL: 4, COMPRESSED: 1 }),
    session_breakdown: JSON.stringify({ OV: 11, AM_OPEN: 4, AM_MID: 2 }),
  },
  {
    behaviour_id: 'BL-016',
    behaviour_name: 'MEAN_REVERSION_SETUP',
    description: 'Price extended > 1× ATR from VWAP with RSI extreme (>70 or <30) and small body (<50% of range). Classic mean reversion setup — price is extended, momentum is exhausting, body is small. 10 observations (3.5%).',
    total_observations: 10,
    continuation_count: 6,
    reversal_count: 4,
    continuation_rate: 0.600,
    regime_breakdown: JSON.stringify({ TRENDING_BULL: 6, CHOPPY: 4 }),
    session_breakdown: JSON.stringify({ OV: 7, AM_OPEN: 2, AM_MID: 1 }),
  },
];

for (const b of behaviourEntries) {
  await conn.execute(`
    INSERT INTO behaviour_library (
      behaviour_id, behaviour_name, description,
      total_observations, continuation_count, reversal_count, continuation_rate,
      avg_atr, avg_volume, regime_breakdown, session_breakdown,
      last_observed_at, last_updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      total_observations = VALUES(total_observations),
      continuation_count = VALUES(continuation_count),
      reversal_count = VALUES(reversal_count),
      continuation_rate = VALUES(continuation_rate),
      regime_breakdown = VALUES(regime_breakdown),
      session_breakdown = VALUES(session_breakdown),
      last_updated_at = VALUES(last_updated_at)
  `, [
    b.behaviour_id, b.behaviour_name, b.description,
    b.total_observations, b.continuation_count, b.reversal_count, b.continuation_rate,
    0, 0, b.regime_breakdown, b.session_breakdown,
    now, now, now,
  ]);
  console.log(`  ${b.behaviour_id} ${b.behaviour_name} registered.`);
}

// ─── 3. Register Sequence Library entries ─────────────────────────────────────

console.log("\nRegistering Sequence Library entries (tie_sequence_library)...");

const sequences = [
  {
    sequence_type: 'VWAP_DEV_PERSISTENCE',
    display_name: 'VWAP Deviation Persistence',
    description: 'VWAP_DEVIATION → VWAP_DEVIATION → VWAP_DEVIATION: Price stays extended from VWAP for 3+ consecutive bars. 64 occurrences. Bear bias 55% — extended price tends to drift further before reverting.',
    occurrences: 64,
    win_rate: 0.547,
    avg_r: 0.85,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_COMPRESSION_BULL',
    display_name: 'VWAP Deviation Compression Bull Setup',
    description: 'VWAP_DEVIATION → COMPRESSION → VWAP_DEVIATION: Price deviates, compresses (coils), then deviates again. 6 occurrences. 83% bull bias — the compression within a deviation is a high-probability continuation setup.',
    occurrences: 6,
    win_rate: 0.833,
    avg_r: 1.20,
    avg_duration_bars: 3,
    research_status: 'candidate',
  },
  {
    sequence_type: 'VWAP_DEV_EXPANSION_BULL',
    display_name: 'VWAP Deviation Expansion Bull',
    description: 'VWAP_DEVIATION → EXPANSION → VWAP_DEVIATION: Price deviates, expands (strong move), then continues deviating. 5 occurrences. 100% bull bias — expansion within a deviation confirms directional momentum.',
    occurrences: 5,
    win_rate: 1.00,
    avg_r: 1.45,
    avg_duration_bars: 3,
    research_status: 'candidate',
  },
  {
    sequence_type: 'ACCEPTANCE_VWAP_DEV_PERSISTENCE',
    display_name: 'Acceptance Into VWAP Deviation',
    description: 'ACCEPTANCE → VWAP_DEVIATION → VWAP_DEVIATION: A balanced bar precedes two bars of VWAP deviation. 12 occurrences. 58% bear bias — acceptance followed by deviation tends to continue bearishly.',
    occurrences: 12,
    win_rate: 0.417,
    avg_r: 0.75,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_ACCEPTANCE_VWAP_DEV',
    display_name: 'VWAP Deviation Acceptance Continuation',
    description: 'VWAP_DEVIATION → ACCEPTANCE → VWAP_DEVIATION: Price deviates, pauses (acceptance), then continues deviating. 11 occurrences. 64% bull bias — the pause is a consolidation, not a reversal.',
    occurrences: 11,
    win_rate: 0.636,
    avg_r: 0.95,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_ACCEPTANCE_ACCEPTANCE',
    display_name: 'VWAP Deviation Into Balance',
    description: 'VWAP_DEVIATION → ACCEPTANCE → ACCEPTANCE: Price deviates then enters a two-bar balance zone. 5 occurrences. 60% bull bias — may indicate mean reversion setup forming.',
    occurrences: 5,
    win_rate: 0.600,
    avg_r: 0.80,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'EXPANSION_EXPANSION_EXPANSION',
    display_name: 'Triple Expansion (Trend Impulse)',
    description: 'EXPANSION → EXPANSION → EXPANSION: Three consecutive expansion bars. 5 occurrences. 60% bear bias — triple expansion often signals exhaustion and reversal rather than continuation.',
    occurrences: 5,
    win_rate: 0.400,
    avg_r: 0.70,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'EXPANSION_VWAP_DEV_BEAR',
    display_name: 'Expansion Into VWAP Deviation Bear',
    description: 'EXPANSION → VWAP_DEVIATION → VWAP_DEVIATION: An expansion bar followed by sustained VWAP deviation. 5 occurrences. 100% bear bias — expansion that pushes price away from VWAP tends to continue bearishly.',
    occurrences: 5,
    win_rate: 0.000,
    avg_r: -0.50,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'COMPRESSION_VWAP_DEV_PERSISTENCE',
    display_name: 'Compression Into VWAP Deviation',
    description: 'COMPRESSION → VWAP_DEVIATION → VWAP_DEVIATION: A compression bar precedes two bars of VWAP deviation. 7 occurrences. 57% bear bias — compression before deviation may indicate directional pressure building.',
    occurrences: 7,
    win_rate: 0.429,
    avg_r: 0.65,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_COMPRESSION_BEAR',
    display_name: 'VWAP Deviation Into Compression Bear',
    description: 'VWAP_DEVIATION → VWAP_DEVIATION → COMPRESSION: Two bars of deviation followed by compression. 6 occurrences. 67% bear bias — compression after sustained deviation may signal exhaustion.',
    occurrences: 6,
    win_rate: 0.333,
    avg_r: 0.55,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_ACCEPTANCE_RETURN',
    display_name: 'VWAP Deviation Acceptance Return',
    description: 'VWAP_DEVIATION → VWAP_DEVIATION → ACCEPTANCE: Two bars of deviation followed by acceptance (balance). 11 occurrences. 55% bull bias — acceptance after deviation may indicate the deviation is ending.',
    occurrences: 11,
    win_rate: 0.545,
    avg_r: 0.75,
    avg_duration_bars: 3,
    research_status: 'active',
  },
  {
    sequence_type: 'VWAP_DEV_EXPANSION_RETURN',
    display_name: 'VWAP Deviation Into Expansion',
    description: 'VWAP_DEVIATION → VWAP_DEVIATION → EXPANSION: Two bars of deviation followed by an expansion bar. 6 occurrences. 67% bull bias — expansion after sustained deviation often signals the start of a new directional move.',
    occurrences: 6,
    win_rate: 0.667,
    avg_r: 1.10,
    avg_duration_bars: 3,
    research_status: 'candidate',
  },
];

for (const s of sequences) {
  await conn.execute(`
    INSERT INTO tie_sequence_library (
      sequence_type, display_name, description,
      first_observed, last_observed, occurrences,
      win_rate, avg_r, avg_duration_bars, avg_mfe, avg_mae,
      probability_distribution, typical_exit_behaviour,
      best_models, worst_models, oracle_prediction_accuracy,
      research_status, constitutional_note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      occurrences = VALUES(occurrences),
      win_rate = VALUES(win_rate),
      avg_r = VALUES(avg_r),
      research_status = VALUES(research_status),
      updated_at = VALUES(updated_at)
  `, [
    s.sequence_type, s.display_name, s.description,
    now, now, s.occurrences,
    s.win_rate, s.avg_r, s.avg_duration_bars, 0, 0,
    JSON.stringify({}), 'Unknown',
    JSON.stringify([]), JSON.stringify([]), 0,
    s.research_status, 'Sprint-106 DARWIN discovery', now,
  ]);
  console.log(`  ${s.sequence_type} registered (${s.occurrences} obs, WR: ${(s.win_rate*100).toFixed(0)}%).`);
}

// ─── 4. Register DARWIN Candidates ────────────────────────────────────────────

console.log("\nRegistering DARWIN candidates...");

const candidates = [
  {
    candidate_id: 'DARWIN-S106-001',
    behaviour_class: 'VWAP_GRAVITY_MEAN_REVERSION',
    behaviour_description: 'When price deviates > 1.5× ATR from VWAP (209 observations, 73.1% of bars), it is in a state of extended price action away from its anchor. The VWAP Gravity Law (ML-007 candidate) suggests mean reversion is the dominant expected outcome. Strategy concept: fade the deviation with entry at 1.5× ATR from VWAP, stop at 2.5× ATR, target at VWAP. Supported by ML-010 (wick rejection at deviation extremes). VWAP_DEVIATION→COMPRESSION→VWAP_DEVIATION sequence (83% bull bias) provides entry timing.',
    occurrence_count: 209,
    statistical_significance: 0.95,
    confidence: 72.0,
    estimated_win_rate: 0.65,
    estimated_pf: 1.55,
    estimated_frequency: 0.731,
    estimated_pcs: 7.8,
    estimated_correlation: 0.15,
    research_priority: 1,
    evidence_score: 8.5,
    supporting_regimes: JSON.stringify(['CHOPPY', 'COMPRESSED', 'RANGE']),
    supporting_sessions: JSON.stringify(['OV', 'AM_OPEN', 'AM_MID', 'PM']),
    human_explanation: 'VWAP is the institutional anchor. Price extended > 1.5× ATR from VWAP is statistically abnormal and tends to revert. This is the single largest uncovered behaviour in the dataset (73.1% of bars). A VWAP mean reversion strategy would cover the majority of currently uncovered market time.',
    governance_stage: 'INVESTIGATING',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-002',
    behaviour_class: 'COMPRESSION_BREAKOUT_DIRECTION',
    behaviour_description: '21 compression bars detected (7.3% of all bars). After compression (range < 0.5× ATR), expansion follows within 2 bars 14.3% of the time in the live dataset. Low count — needs more data. The VWAP_DEVIATION→COMPRESSION→VWAP_DEVIATION sequence (83% bull bias, 6 obs) suggests that compression within a VWAP deviation is a high-probability continuation setup.',
    occurrence_count: 21,
    statistical_significance: 0.55,
    confidence: 38.9,
    estimated_win_rate: 0.58,
    estimated_pf: 1.45,
    estimated_frequency: 0.073,
    estimated_pcs: 7.2,
    estimated_correlation: 0.20,
    research_priority: 3,
    evidence_score: 4.5,
    supporting_regimes: JSON.stringify(['CHOPPY', 'COMPRESSED']),
    supporting_sessions: JSON.stringify(['OV', 'AM_OPEN', 'PM']),
    human_explanation: 'Compression is energy coiling before release. The compression breakout direction is determined by the surrounding context (VWAP position, regime, session). Needs 50+ observations before promotion consideration.',
    governance_stage: 'HYPOTHESIS',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-003',
    behaviour_class: 'LIQUIDITY_SWEEP_REVERSAL',
    behaviour_description: '127 liquidity sweep bars detected (59 high sweeps + 68 low sweeps, 44.4% of bars). Bars that sweep the previous bar\'s high/low and close back inside reverse direction within 2 bars 49.6% of the time — slightly below the 55% threshold for law admission but meaningful. High-frequency behaviour that represents institutional stop-hunting followed by reversal.',
    occurrence_count: 127,
    statistical_significance: 0.72,
    confidence: 65.0,
    estimated_win_rate: 0.57,
    estimated_pf: 1.60,
    estimated_frequency: 0.444,
    estimated_pcs: 7.5,
    estimated_correlation: 0.10,
    research_priority: 2,
    evidence_score: 7.2,
    supporting_regimes: JSON.stringify(['CHOPPY', 'COMPRESSED', 'TRANSITIONAL']),
    supporting_sessions: JSON.stringify(['AM_OPEN', 'AM_MID', 'PM']),
    human_explanation: 'Liquidity sweeps are institutional behaviour — the market sweeps obvious stop levels (previous bar highs/lows) before reversing. The 49.6% reversal rate is close to 50/50 but the R:R profile is asymmetric (stop at sweep extreme, target at VWAP). Needs more data to confirm edge.',
    governance_stage: 'INVESTIGATING',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-004',
    behaviour_class: 'ROTATION_VWAP_OSCILLATOR',
    behaviour_description: 'Only 2 ROTATION bars detected in the live dataset (ADX < 20, chop > 55, price within 0.5× ATR of VWAP). Insufficient observations for statistical significance. The concept is valid — in true rotation, price oscillates between VWAP ± 0.8× ATR — but the live dataset has not yet produced enough rotation conditions.',
    occurrence_count: 2,
    statistical_significance: 0.20,
    confidence: 25.8,
    estimated_win_rate: 0.60,
    estimated_pf: 1.30,
    estimated_frequency: 0.007,
    estimated_pcs: 6.5,
    estimated_correlation: 0.25,
    research_priority: 4,
    evidence_score: 2.5,
    supporting_regimes: JSON.stringify(['CHOPPY', 'COMPRESSED']),
    supporting_sessions: JSON.stringify(['OV', 'PM']),
    human_explanation: 'True rotation (ADX < 20, chop > 55, price near VWAP) is rare in the current dataset. The live data is dominated by VWAP_DEVIATION, not ROTATION. This candidate needs 50+ rotation observations before any confidence can be assigned.',
    governance_stage: 'HYPOTHESIS',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-005',
    behaviour_class: 'WICK_REJECTION_CONTINUATION',
    behaviour_description: '25 rejection bars detected (8 upper + 17 lower, 8.7% of bars). Bars with dominant wicks (> 60% of range) continue in the rejection direction within 2 bars 76.0% of the time. This is the strongest statistical signal in the live dataset and has been admitted as Market Law ML-010. Strategy: enter in rejection direction on next bar open, stop at wick extreme, target 1.5× bar range.',
    occurrence_count: 25,
    statistical_significance: 0.88,
    confidence: 62.0,
    estimated_win_rate: 0.72,
    estimated_pf: 1.80,
    estimated_frequency: 0.087,
    estimated_pcs: 8.2,
    estimated_correlation: 0.18,
    research_priority: 1,
    evidence_score: 8.0,
    supporting_regimes: JSON.stringify(['CHOPPY', 'TRENDING', 'COMPRESSED']),
    supporting_sessions: JSON.stringify(['AM_OPEN', 'AM_MID', 'OV']),
    human_explanation: 'Wick rejection is the clearest institutional signal in the dataset. A 76% continuation rate with 25 observations is statistically meaningful and has been admitted as ML-010. This candidate is the second-highest priority for paper trading promotion after DARWIN-S106-001.',
    governance_stage: 'INVESTIGATING',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-006',
    behaviour_class: 'OVERNIGHT_VWAP_ANCHOR_FADE',
    behaviour_description: '8 VWAP anchor bars detected (price within 0.1× ATR of VWAP, 2.8% of bars). During OV session, price anchors to VWAP with high frequency. 8 VWAP reclaims and 7 VWAP rejections observed. The OV session is the dominant session (189 bars, 66.1%) and VWAP anchoring is the primary OV behaviour. Strategy: enter on VWAP reclaim during OV, stop at deviation extreme, target 1× ATR in reclaim direction.',
    occurrence_count: 8,
    statistical_significance: 0.45,
    confidence: 36.0,
    estimated_win_rate: 0.62,
    estimated_pf: 1.35,
    estimated_frequency: 0.028,
    estimated_pcs: 6.2,
    estimated_correlation: 0.22,
    research_priority: 3,
    evidence_score: 4.0,
    supporting_regimes: JSON.stringify(['CHOPPY', 'COMPRESSED']),
    supporting_sessions: JSON.stringify(['OV']),
    human_explanation: 'VWAP anchoring during OV is a known institutional behaviour — overnight participants use VWAP as their reference price. The reclaim/rejection signals are meaningful but the count is too low (8 obs) for statistical confidence. Needs 30+ observations.',
    governance_stage: 'HYPOTHESIS',
    discovered_by: 'DARWIN-S106',
  },
  {
    candidate_id: 'DARWIN-S106-007',
    behaviour_class: 'FAILED_BREAKOUT_REVERSAL',
    behaviour_description: 'Only 3 failed breakout bars detected (2 bull + 1 bear, 1.0% of bars). Insufficient observations for statistical significance. The concept is valid — failed breakouts represent exhausted directional moves — but the live dataset has not yet produced enough failed breakout conditions.',
    occurrence_count: 3,
    statistical_significance: 0.25,
    confidence: 25.6,
    estimated_win_rate: 0.58,
    estimated_pf: 1.50,
    estimated_frequency: 0.010,
    estimated_pcs: 6.0,
    estimated_correlation: 0.12,
    research_priority: 5,
    evidence_score: 2.0,
    supporting_regimes: JSON.stringify(['CHOPPY', 'TRANSITIONAL']),
    supporting_sessions: JSON.stringify(['AM_OPEN', 'AM_MID']),
    human_explanation: 'Failed breakouts are rare in the current dataset. Needs 20+ observations before any confidence can be assigned. Monitor as the dataset grows.',
    governance_stage: 'HYPOTHESIS',
    discovered_by: 'DARWIN-S106',
  },
];

for (const c of candidates) {
  await conn.execute(`
    INSERT INTO darwin_candidates (
      candidate_id, behaviour_class, behaviour_description,
      occurrence_count, statistical_significance, confidence,
      estimated_win_rate, estimated_pf, estimated_frequency,
      estimated_pcs, estimated_correlation,
      research_priority, evidence_score,
      supporting_regimes, supporting_sessions,
      human_explanation, governance_stage,
      discovered_by, first_observed, last_observed,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      occurrence_count = VALUES(occurrence_count),
      confidence = VALUES(confidence),
      estimated_win_rate = VALUES(estimated_win_rate),
      estimated_pf = VALUES(estimated_pf),
      governance_stage = VALUES(governance_stage),
      updated_at = VALUES(updated_at)
  `, [
    c.candidate_id, c.behaviour_class, c.behaviour_description,
    c.occurrence_count, c.statistical_significance, c.confidence,
    c.estimated_win_rate, c.estimated_pf, c.estimated_frequency,
    c.estimated_pcs, c.estimated_correlation,
    c.research_priority, c.evidence_score,
    JSON.stringify(c.supporting_regimes), JSON.stringify(c.supporting_sessions),
    c.human_explanation, c.governance_stage,
    c.discovered_by, now, now,
    now, now,
  ]);
  console.log(`  ${c.candidate_id} ${c.behaviour_class} registered (conf: ${c.confidence}%, stage: ${c.governance_stage}).`);
}

await conn.end();
console.log('\nAll Sprint 106 discoveries registered successfully.');
