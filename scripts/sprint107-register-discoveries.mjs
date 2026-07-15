/**
 * Sprint 107 — DARWIN Discovery Registration (corrected column names)
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = Date.now();
const nowDate = new Date(now);

console.log("=== Sprint 107 — DARWIN Discovery Registration ===\n");

// ─── 1. Update BL-009 (VWAP_DEVIATION) ───────────────────────────────────────
console.log("Updating BL-009 VWAP_DEVIATION...");
await conn.execute(`
  UPDATE behaviour_library SET
    total_observations = 293,
    continuation_rate = 0.9000,
    last_observed_at = ?,
    last_updated_at = ?,
    description = 'Price deviating from VWAP. Sprint 107 decomposition: 10 episodes, avg duration 26.3 bars, 90% resolve via VWAP_CONTINUATION. True mean reversion (VWAP_MEAN_REVERSION) = only 1 episode. VWAP deviation is a structural state of MNQ, not a temporary anomaly. Dominant behaviour is continuation, not reversion.'
  WHERE behaviour_id = 'BL-009'
`, [nowDate, nowDate]);

// ─── 2. Add BL-017 VWAP_CONTINUATION ─────────────────────────────────────────
console.log("Adding BL-017 VWAP_CONTINUATION...");
await conn.execute(`
  INSERT IGNORE INTO behaviour_library (
    behaviour_id, behaviour_name, description,
    total_observations, continuation_rate,
    last_observed_at, last_updated_at, created_at
  ) VALUES (
    'BL-017', 'VWAP_CONTINUATION',
    'Price deviates from VWAP and continues moving away. Sprint 107: 10 of 10 episodes showed continuation maintenance. Avg episode duration: 26.3 bars. Avg max deviation: 2.97xATR. Dominant in all regimes and sessions. PRIMARY VWAP behaviour in MNQ 5-min data. Not mean reversion — this is a trend-holding state.',
    293, 0.9000, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate]);

// ─── 3. Add BL-018 VWAP_REJECTION_RETURN ─────────────────────────────────────
console.log("Adding BL-018 VWAP_REJECTION_RETURN...");
await conn.execute(`
  INSERT IGNORE INTO behaviour_library (
    behaviour_id, behaviour_name, description,
    total_observations, continuation_rate,
    last_observed_at, last_updated_at, created_at
  ) VALUES (
    'BL-018', 'VWAP_REJECTION_RETURN',
    'Short VWAP deviation episodes (avg 2.3 bars) resolved by wick rejections at the deviation extreme. 3 episodes observed. Distinct from VWAP_CONTINUATION: shorter duration, lower max deviation (0.85 vs 2.97xATR), driven by rejection wicks. Best mean-reversion analogue in the dataset. CHOPPY/TRANSITIONAL regime, OV session dominant.',
    3, 0.7500, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate]);

// ─── 4. Add BL-019 VWAP_EPISODE_STRUCTURE ────────────────────────────────────
console.log("Adding BL-019 VWAP_EPISODE_STRUCTURE...");
await conn.execute(`
  INSERT IGNORE INTO behaviour_library (
    behaviour_id, behaviour_name, description,
    total_observations, continuation_rate,
    last_observed_at, last_updated_at, created_at
  ) VALUES (
    'BL-019', 'VWAP_EPISODE_STRUCTURE',
    'VWAP deviation occurs in discrete episodes separated by brief returns to VWAP. Sprint 107: 10 episodes in 293 bars. Episodes last 2-119 bars (avg 26.3). Inter-episode gaps are the true mean-reversion events. Key insight: VWAP is not a magnet — it is a boundary that price crosses and then holds away from.',
    293, 0.9000, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate]);

// ─── 5. Add Sequence Library entries ─────────────────────────────────────────
console.log("\nAdding sequences to tie_sequence_library...");

const sequences = [
  ['VWAP_CONTINUATION_LONG_EPISODE', 'VWAP Continuation Long Episode',
   'VWAP deviation episode lasting 11+ bars. Price holds away from VWAP for extended periods. Avg max deviation 4.7xATR. Dominant in TRENDING and CHOPPY regimes. Sprint 107: 4 episodes.',
   4, 1.00, 51.0, 'candidate'],
  ['VWAP_REJECTION_SHORT_EPISODE', 'VWAP Rejection Short Episode',
   'Short VWAP deviation episode (2-5 bars) resolved by wick rejections. Best mean-reversion analogue in dataset. Sprint 107: 3 episodes, 75% resolution rate.',
   3, 0.75, 2.3, 'candidate'],
  ['VWAP_EXPANSION_ONSET_EPISODE', 'VWAP Expansion Onset Episode',
   'VWAP deviation triggered by an expansion bar (range > 1.5xATR). Sprint 107: 2 episodes, avg duration 13.5 bars.',
   2, 0.50, 13.5, 'active'],
];

for (const [type, display, desc, occ, wr, dur, status] of sequences) {
  await conn.execute(`
    INSERT IGNORE INTO tie_sequence_library (
      sequence_type, display_name, description,
      occurrences, win_rate, avg_duration_bars,
      research_status, first_observed, last_observed, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [type, display, desc, occ, wr, dur, status, nowDate, nowDate, nowDate]);
  console.log(`  Added: ${type}`);
}

// ─── 6. Update DARWIN-S106-001 (VWAP_GRAVITY_MEAN_REVERSION) — REVISED ───────
console.log("\nRevising DARWIN-S106-001 (Sprint 107 disproves original hypothesis)...");
await conn.execute(`
  UPDATE darwin_candidates SET
    governance_stage = 'INVESTIGATING',
    confidence = 28.00,
    occurrence_count = 1,
    behaviour_description = 'Sprint 107 REVISED: Original hypothesis assumed VWAP deviation = mean reversion opportunity. Sprint 107 decomposition disproves this. Only 1 of 10 episodes (10%) showed mean reversion. Dominant behaviour is VWAP_CONTINUATION (90%). Original candidate redesigned — see DARWIN-S107-001 and DARWIN-S107-002.',
    research_priority = 8,
    updated_at = ?
  WHERE candidate_id = 'DARWIN-S106-001'
`, [nowDate]);

// ─── 7. Add DARWIN-S107-001 (VWAP_REJECTION_RETURN) ──────────────────────────
console.log("Adding DARWIN-S107-001 VWAP_REJECTION_RETURN...");
await conn.execute(`
  INSERT IGNORE INTO darwin_candidates (
    candidate_id, behaviour_class, behaviour_description,
    occurrence_count, confidence, governance_stage,
    research_priority, estimated_win_rate, estimated_pf,
    estimated_frequency, supporting_regimes, supporting_sessions,
    discovered_by, first_observed, last_observed, created_at, updated_at
  ) VALUES (
    'DARWIN-S107-001', 'VWAP_REJECTION_RETURN',
    'The only genuine mean-reversion analogue found in Sprint 107. Short VWAP deviation episodes (2-5 bars) resolved by wick rejections at the deviation extreme. Entry: wick rejection bar at deviation extreme. Stop: beyond the wick. Target: VWAP. 3 episodes, 75% resolution rate. CHOPPY/TRANSITIONAL regime only. OV session dominant. Requires 20+ observations before promotion.',
    3, 45.00, 'HYPOTHESIS',
    2, 0.68, 1.45,
    1.0, 'CHOPPY,TRANSITIONAL', 'OV',
    'DARWIN-S107', ?, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate, nowDate]);

// ─── 8. Add DARWIN-S107-002 (VWAP_CONTINUATION_TREND_RIDER) ──────────────────
console.log("Adding DARWIN-S107-002 VWAP_CONTINUATION_TREND_RIDER...");
await conn.execute(`
  INSERT IGNORE INTO darwin_candidates (
    candidate_id, behaviour_class, behaviour_description,
    occurrence_count, confidence, governance_stage,
    research_priority, estimated_win_rate, estimated_pf,
    estimated_frequency, supporting_regimes, supporting_sessions,
    discovered_by, first_observed, last_observed, created_at, updated_at
  ) VALUES (
    'DARWIN-S107-002', 'VWAP_CONTINUATION_TREND_RIDER',
    'Sprint 107: VWAP_CONTINUATION is the dominant VWAP behaviour (90% of episodes, 10/10). Price deviates and continues moving away for 11-119 bars (avg 26.3). This is a trend-riding opportunity, not mean reversion. Entry: continuation bar after VWAP deviation onset in TRENDING regime. Stop: return to VWAP. Target: 2xATR extension. Highest-coverage VWAP candidate. Estimated 22.9% portfolio coverage in TRENDING regime.',
    10, 58.00, 'INVESTIGATING',
    1, 0.65, 1.55,
    22.9, 'TRENDING_BULL,TRENDING_BEAR', 'OV,AM,RTH',
    'DARWIN-S107', ?, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate, nowDate]);

// ─── 9. Add DARWIN-S107-003 (VWAP_EPISODE_BOUNDARY) ─────────────────────────
console.log("Adding DARWIN-S107-003 VWAP_EPISODE_BOUNDARY...");
await conn.execute(`
  INSERT IGNORE INTO darwin_candidates (
    candidate_id, behaviour_class, behaviour_description,
    occurrence_count, confidence, governance_stage,
    research_priority, estimated_win_rate, estimated_pf,
    estimated_frequency, supporting_regimes, supporting_sessions,
    discovered_by, first_observed, last_observed, created_at, updated_at
  ) VALUES (
    'DARWIN-S107-003', 'VWAP_EPISODE_BOUNDARY',
    'Sprint 107: The brief non-deviating periods between VWAP episodes are the true mean-reversion events. Entry: first bar of a new deviation episode (price just crossed VWAP). Direction: with the new deviation. Stop: return through VWAP. Target: 1xATR in deviation direction. This is a VWAP-cross breakout strategy. Requires VWAP cross detection. All regimes, all sessions.',
    10, 42.00, 'HYPOTHESIS',
    3, 0.60, 1.30,
    8.0, 'ALL', 'ALL',
    'DARWIN-S107', ?, ?, ?, ?
  )
`, [nowDate, nowDate, nowDate, nowDate]);

// ─── 10. Verify ───────────────────────────────────────────────────────────────
console.log("\n=== Verification ===");
const [blCount] = await conn.execute('SELECT COUNT(*) as n FROM behaviour_library');
const [slCount] = await conn.execute('SELECT COUNT(*) as n FROM tie_sequence_library');
const [dcCount] = await conn.execute('SELECT COUNT(*) as n FROM darwin_candidates');

console.log(`Behaviour Library: ${blCount[0].n} entries`);
console.log(`Sequence Library: ${slCount[0].n} entries`);
console.log(`Darwin Candidates: ${dcCount[0].n} entries`);

const [newCandidates] = await conn.execute(`
  SELECT candidate_id, behaviour_class, confidence, governance_stage 
  FROM darwin_candidates 
  WHERE candidate_id LIKE 'DARWIN-S107-%'
  ORDER BY candidate_id
`);
console.log("\nSprint 107 DARWIN Candidates:");
newCandidates.forEach(c => console.log(`  ${c.candidate_id}: ${c.behaviour_class} conf=${c.confidence} stage=${c.governance_stage}`));

const [newBL] = await conn.execute(`
  SELECT behaviour_id, behaviour_name, total_observations 
  FROM behaviour_library 
  WHERE behaviour_id IN ('BL-017', 'BL-018', 'BL-019')
  ORDER BY behaviour_id
`);
console.log("\nSprint 107 Behaviour Library entries:");
newBL.forEach(b => console.log(`  ${b.behaviour_id}: ${b.behaviour_name} obs=${b.total_observations}`));

await conn.end();
console.log("\nRegistration complete.");
