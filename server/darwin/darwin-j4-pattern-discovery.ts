/**
 * darwin-j4-pattern-discovery.ts
 * Sprint: darwin-core-observation-to-finding-chain
 *
 * J4 Pattern Discovery Service — implements the full research chain:
 *   SOURCE_EVENT_ID (atlas_bars_1m.id)
 *   → OBSERVATION_ID (darwin_observations.observation_id)
 *   → HYPOTHESIS_ID  (darwin_candidates.candidate_id)
 *   → JOB_ID         (darwin_job_run_history.run_id)
 *   → RESULT_ID      (darwin_experiment_records.experiment_id)
 *   → FINDING_ID     (darwin_research_memory.memory_id)
 *   → NOTIFICATION_ID (notification_log.id)
 *
 * AUTHORITY BOUNDARIES:
 *   processBar:          NEVER called
 *   postBarAutomation:   NEVER called
 *   tradersPost:         NEVER called
 *   live_chart_affected: always false
 *
 * RULE: RULE-J4-001 v1.0.0 (frozen 2026-07-30)
 *   A 1m MNQ bar qualifies when: bar_range >= 1.5 × ATR(14) AND ATR > 0
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';

// ─── Constants ───────────────────────────────────────────────────────────────
export const RULE_ID = 'RULE-J4-001';
export const RULE_VERSION = '1.0.0';
export const RANGE_EXPANSION_MULTIPLIER = 1.5;
export const MIN_SAMPLE_SIZE = 30;
export const FORWARD_HORIZONS = [5, 15, 30]; // bars
export const P_VALUE_THRESHOLD = 0.05;
export const WIN_RATE_THRESHOLD = 0.55;
export const EXPECTANCY_THRESHOLD = 0.5; // pts

// ─── Types ───────────────────────────────────────────────────────────────────
export interface J4ChainResult {
  sourceEventId: number;
  observationId: string;
  hypothesisId: string;
  jobId: string;
  resultId: string;
  findingId: string;
  notificationId: number;
  telegramMessageId: number | null;
  resultClassification: string;
  plainEnglishFinding: string;
  historicalSampleSize: number;
  bullishSampleSize: number;
  bearishSampleSize: number;
  historicalPeriodStart: number;
  historicalPeriodEnd: number;
  nextRequiredTest: string;
}

export interface J4RunResult {
  status: 'COMPLETE' | 'BLOCKED' | 'SKIPPED';
  reason?: string;
  chain?: J4ChainResult;
  duplicatePrevented?: boolean;
}

// ─── DB Pool ─────────────────────────────────────────────────────────────────
let _pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const u = new URL(url);
    _pool = mysql.createPool({
      host: u.hostname,
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
      port: parseInt(u.port || '3306', 10),
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return _pool;
}

// ─── Condition Signature ─────────────────────────────────────────────────────
export function buildConditionSignature(params: {
  market: string;
  instrument: string;
  timeframe: string;
  direction: string;
  ruleId: string;
  ruleVersion: string;
  thresholdMultiplier: number;
  session: string | null;
  regime: string | null;
}): string {
  const raw = [
    params.market,
    params.instrument,
    params.timeframe,
    params.direction,
    params.ruleId,
    params.ruleVersion,
    String(params.thresholdMultiplier),
    params.session ?? 'ANY',
    params.regime ?? 'ANY',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ─── Step 1: Find the most recent qualifying observation ─────────────────────
export async function findLatestQualifyingObservation(): Promise<{
  sourceEventId: number;
  observationId: string;
  barTimestamp: number;
  barDirection: string;
  barRange: number;
  atr: number;
  session: string | null;
  volatilityRegime: string | null;
} | null> {
  const pool = getPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
    SELECT
      b.id            AS source_event_id,
      o.observation_id,
      o.bar_timestamp,
      o.bar_direction,
      o.bar_range,
      o.atr,
      o.session,
      o.volatility_regime
    FROM atlas_bars_1m b
    JOIN darwin_observations o ON o.bar_timestamp = b.bar_open_ts_ms
    WHERE o.bar_range >= ? * o.atr
      AND o.atr > 0
      AND o.bar_interval = '1m'
    ORDER BY o.bar_timestamp DESC
    LIMIT 1
  `, [RANGE_EXPANSION_MULTIPLIER]);

  if (!rows.length) return null;
  const r = rows[0];
  return {
    sourceEventId: r.source_event_id,
    observationId: r.observation_id,
    barTimestamp: r.bar_timestamp,
    barDirection: r.bar_direction ?? 'UNKNOWN',
    barRange: parseFloat(r.bar_range),
    atr: parseFloat(r.atr),
    session: r.session,
    volatilityRegime: r.volatility_regime,
  };
}

// ─── Step 2: Duplicate candidate prevention ──────────────────────────────────
export async function findExistingCandidate(signature: string): Promise<{
  candidateId: string;
  candidateVersion: number;
  governanceStage: string;
  lastObserved: number | null;
} | null> {
  const pool = getPool();
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
    SELECT candidate_id, candidate_version, governance_stage, last_observed
    FROM darwin_candidates
    WHERE condition_signature = ?
    ORDER BY candidate_version DESC
    LIMIT 1
  `, [signature]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    candidateId: r.candidate_id,
    candidateVersion: r.candidate_version,
    governanceStage: r.governance_stage,
    lastObserved: r.last_observed,
  };
}

// ─── Step 3: Create candidate ────────────────────────────────────────────────
export async function createCandidate(obs: {
  sourceEventId: number;
  observationId: string;
  barTimestamp: number;
  barDirection: string;
  barRange: number;
  atr: number;
  session: string | null;
  volatilityRegime: string | null;
}, signature: string): Promise<string> {
  const pool = getPool();
  const candidateId = randomUUID();
  const now = Date.now();

  await pool.execute(`
    INSERT INTO darwin_candidates (
      candidate_id, behaviour_class, behaviour_description,
      occurrence_count, research_priority, governance_stage,
      source_observation_id, source_event_id,
      rule_id, rule_version, condition_signature,
      candidate_version, discovered_by,
      first_observed, last_observed,
      supporting_sessions, supporting_regimes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    candidateId,
    'RANGE_EXPANSION_1M',
    `1m bar range >= ${RANGE_EXPANSION_MULTIPLIER}x ATR(14). Direction: ${obs.barDirection}. ` +
    `Range: ${obs.barRange.toFixed(4)} pts, ATR: ${obs.atr.toFixed(4)} pts. ` +
    `Session: ${obs.session ?? 'UNKNOWN'}. Regime: ${obs.volatilityRegime ?? 'UNKNOWN'}.`,
    1,
    10,
    'HYPOTHESIS',
    obs.observationId,
    obs.sourceEventId,
    RULE_ID,
    RULE_VERSION,
    signature,
    1,
    'DARWIN-J4',
    now,
    now,
    obs.session ?? 'UNKNOWN',
    obs.volatilityRegime ?? 'UNKNOWN',
  ]);

  // Link observation to candidate
  await pool.execute(`
    INSERT INTO darwin_candidate_observations (
      candidate_id, observation_id, source_event_id,
      bar_timestamp, bar_direction, bar_range, atr, session, volatility_regime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE linked_at = linked_at
  `, [
    candidateId, obs.observationId, obs.sourceEventId,
    obs.barTimestamp, obs.barDirection, obs.barRange, obs.atr,
    obs.session, obs.volatilityRegime,
  ]);

  return candidateId;
}

// ─── Step 4: Create job record ───────────────────────────────────────────────
export async function createJobRecord(candidateId: string, sourceObservationId: string): Promise<string> {
  const pool = getPool();
  const runId = `J4-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const now = Date.now();

  await pool.execute(`
    INSERT INTO darwin_job_run_history (
      run_id, job_type, status, started_at,
      triggered_by, rows_processed, bars_observed,
      live_chart_affected, service_pid
    ) VALUES (?, 'J4', 'RUNNING', ?, ?, 0, 0, 0, ?)
  `, [runId, now, `OBSERVATION:${sourceObservationId}:CANDIDATE:${candidateId}`, process.pid]);

  return runId;
}

// ─── Step 5: Historical experiment ───────────────────────────────────────────
interface BarReturn {
  direction: string;
  h1: number;
  h2: number;
  h3: number;
  mfe: number;
  mae: number;
}

export async function runHistoricalExperiment(candidateId: string): Promise<{
  experimentId: string;
  sampleSize: number;
  bullishSampleSize: number;
  bearishSampleSize: number;
  historicalPeriodStart: number;
  historicalPeriodEnd: number;
  h1MeanReturn: number;
  h2MeanReturn: number;
  h3MeanReturn: number;
  h1WinRate: number;
  h2WinRate: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  winRate: number;
  expectancyPts: number;
  classification: string;
  conclusion: string;
}> {
  const pool = getPool();

  // Fetch all qualifying historical bars with forward returns
  // We use a self-join to get forward close prices
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(`
    SELECT
      o.observation_id,
      o.bar_timestamp,
      o.bar_direction,
      o.bar_range,
      o.atr,
      o.close_price,
      f5.close_price  AS close_h1,
      f15.close_price AS close_h2,
      f30.close_price AS close_h3
    FROM darwin_observations o
    LEFT JOIN darwin_observations f5
      ON f5.bar_timestamp = o.bar_timestamp + (5 * 60000)
      AND f5.bar_interval = '1m'
    LEFT JOIN darwin_observations f15
      ON f15.bar_timestamp = o.bar_timestamp + (15 * 60000)
      AND f15.bar_interval = '1m'
    LEFT JOIN darwin_observations f30
      ON f30.bar_timestamp = o.bar_timestamp + (30 * 60000)
      AND f30.bar_interval = '1m'
    WHERE o.bar_range >= ? * o.atr
      AND o.atr > 0
      AND o.bar_interval = '1m'
      AND o.close_price IS NOT NULL
    ORDER BY o.bar_timestamp ASC
  `, [RANGE_EXPANSION_MULTIPLIER]);

  // Filter to rows with at least h1 forward data
  const valid = rows.filter(r => r.close_h1 !== null);

  const returns: BarReturn[] = valid.map(r => {
    const close = parseFloat(r.close_price);
    const h1 = r.close_h1 ? parseFloat(r.close_h1) - close : 0;
    const h2 = r.close_h2 ? parseFloat(r.close_h2) - close : h1;
    const h3 = r.close_h3 ? parseFloat(r.close_h3) - close : h2;
    const mfe = Math.max(h1, h2, h3);
    const mae = Math.min(h1, h2, h3);
    return { direction: r.bar_direction ?? 'UNKNOWN', h1, h2, h3, mfe, mae };
  });

  const bullReturns = returns.filter(r => r.direction === 'BULL');
  const bearReturns = returns.filter(r => r.direction === 'BEAR');

  const mean = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const winRate = (arr: number[]) => arr.length ? arr.filter(v => v > 0).length / arr.length : 0;

  const allH1 = returns.map(r => r.h1);
  const allH2 = returns.map(r => r.h2);
  const allH3 = returns.map(r => r.h3);

  const h1Mean = mean(allH1);
  const h2Mean = mean(allH2);
  const h3Mean = mean(allH3);
  const h1WR = winRate(allH1);
  const h2WR = winRate(allH2);

  // Bootstrap 95% CI on h1 returns (1000 resamples)
  const { ciLower, ciUpper, pValue } = bootstrapCI(allH1, 1000);

  const sampleSize = returns.length;
  const bullSize = bullReturns.length;
  const bearSize = bearReturns.length;

  // Classification
  let classification: string;
  let conclusion: string;
  const ciSpansZero = ciLower < 0 && ciUpper > 0;

  if (sampleSize < MIN_SAMPLE_SIZE) {
    classification = 'FAIL_SAMPLE_SIZE';
    conclusion = `Insufficient sample size: ${sampleSize} bars (minimum ${MIN_SAMPLE_SIZE} required).`;
  } else if (pValue >= P_VALUE_THRESHOLD || ciSpansZero) {
    classification = 'INCONCLUSIVE';
    conclusion = `No statistically significant edge detected. p=${pValue.toFixed(4)}, CI=[${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]. ` +
      `H1 mean return: ${h1Mean.toFixed(4)} pts. Win rate: ${(h1WR * 100).toFixed(1)}%.`;
  } else if (h1WR >= WIN_RATE_THRESHOLD || Math.abs(h1Mean) >= EXPECTANCY_THRESHOLD) {
    classification = 'EDGE_DETECTED';
    conclusion = `Statistically significant edge detected. p=${pValue.toFixed(4)}, CI=[${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]. ` +
      `H1 mean return: ${h1Mean.toFixed(4)} pts. Win rate: ${(h1WR * 100).toFixed(1)}%. ` +
      `Sample: ${sampleSize} bars (Bull: ${bullSize}, Bear: ${bearSize}).`;
  } else {
    classification = 'INCONCLUSIVE';
    conclusion = `Edge below threshold. p=${pValue.toFixed(4)}, H1 mean: ${h1Mean.toFixed(4)} pts, WR: ${(h1WR * 100).toFixed(1)}%.`;
  }

  const experimentId = randomUUID();
  const periodStart = valid.length ? valid[0].bar_timestamp : 0;
  const periodEnd = valid.length ? valid[valid.length - 1].bar_timestamp : 0;

  // Persist experiment record
  const codeSha = await getCodeSha();
  await pool.execute(`
    INSERT INTO darwin_experiment_records (
      experiment_id, experiment_label, hypothesis, behaviour_observed,
      regime, session, sample_size, win_rate, expectancy_pts,
      p_value, statistical_gate_passed, stability_gate_passed,
      novelty_gate_passed, all_gates_passed, outcome,
      conclusion, code_sha, run_id,
      date_range_start, date_range_end, live_chart_affected,
      candidate_id, source_observation_id, source_event_id,
      rule_id, rule_version,
      bullish_sample_size, bearish_sample_size,
      h1_mean_return, h2_mean_return, h3_mean_return,
      h1_win_rate, h2_win_rate, ci_lower, ci_upper
    ) VALUES (
      ?, 'J4-RANGE-EXP-1M', ?, ?,
      'ALL', 'ALL', ?, ?, ?,
      ?, ?, ?,
      0, ?, ?,
      ?, ?, NULL,
      ?, ?, 0,
      ?, ?, NULL,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `, [
    experimentId,
    `Range expansion (bar_range >= ${RANGE_EXPANSION_MULTIPLIER}x ATR) on 1m MNQ bars — forward return analysis`,
    `${sampleSize} qualifying bars observed. ${bullSize} BULL, ${bearSize} BEAR.`,
    sampleSize, h1WR, h1Mean,
    pValue,
    pValue < P_VALUE_THRESHOLD ? 1 : 0,
    0, // stability gate — requires out-of-sample, not yet run
    classification === 'EDGE_DETECTED' ? 1 : 0,
    // Map internal classification to DB enum values
    classification === 'EDGE_DETECTED' ? 'PASS_ALL_GATES' :
    classification === 'FAIL_SAMPLE_SIZE' ? 'FAIL_SAMPLE_SIZE' :
    'FAIL_STATISTICAL', // INCONCLUSIVE → FAIL_STATISTICAL
    conclusion,
    codeSha,
    periodStart, periodEnd,
    candidateId, null, // source_observation_id filled from candidate
    RULE_ID, RULE_VERSION,
    bullSize, bearSize,
    h1Mean, h2Mean, h3Mean,
    h1WR, h2WR, ciLower, ciUpper,
  ]);

  return {
    experimentId,
    sampleSize,
    bullishSampleSize: bullSize,
    bearishSampleSize: bearSize,
    historicalPeriodStart: periodStart,
    historicalPeriodEnd: periodEnd,
    h1MeanReturn: h1Mean,
    h2MeanReturn: h2Mean,
    h3MeanReturn: h3Mean,
    h1WinRate: h1WR,
    h2WinRate: h2WR,
    pValue,
    ciLower,
    ciUpper,
    winRate: h1WR,
    expectancyPts: h1Mean,
    classification,
    conclusion,
  };
}

// ─── Bootstrap CI ────────────────────────────────────────────────────────────
function bootstrapCI(data: number[], nResamples: number): { ciLower: number; ciUpper: number; pValue: number } {
  if (data.length < 2) return { ciLower: 0, ciUpper: 0, pValue: 1 };
  const n = data.length;
  const means: number[] = [];
  for (let i = 0; i < nResamples; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += data[Math.floor(Math.random() * n)];
    }
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  const ciLower = means[Math.floor(0.025 * nResamples)];
  const ciUpper = means[Math.floor(0.975 * nResamples)];

  // Approximate p-value: proportion of bootstrap means on the opposite side of zero
  const observedMean = data.reduce((a, b) => a + b, 0) / n;
  const pValue = observedMean >= 0
    ? means.filter(m => m <= 0).length / nResamples * 2
    : means.filter(m => m >= 0).length / nResamples * 2;

  return { ciLower, ciUpper, pValue: Math.min(pValue, 1) };
}

// ─── Step 6: Persist finding to research memory ──────────────────────────────
export async function persistFinding(params: {
  candidateId: string;
  experimentId: string;
  sourceObservationId: string;
  sourceEventId: number;
  classification: string;
  conclusion: string;
  sampleSize: number;
  bullishSampleSize: number;
  bearishSampleSize: number;
  h1MeanReturn: number;
  h1WinRate: number;
  ciLower: number;
  ciUpper: number;
  pValue: number;
}): Promise<string> {
  const pool = getPool();
  const memoryId = randomUUID();

  const classMap: Record<string, string> = {
    'EDGE_DETECTED': 'PASS_ALL_GATES',
    'INCONCLUSIVE': 'ARCHIVED',
    'FAIL_SAMPLE_SIZE': 'ARCHIVED',
    'FAIL_STATISTICAL': 'ARCHIVED',
  };

  await pool.execute(`
    INSERT INTO darwin_research_memory (
      memory_id, candidate_id, behaviour_class,
      hypothesis_description, supporting_evidence,
      backtest_summary, final_outcome,
      experiment_id, source_observation_id, source_event_id,
      rule_id, rule_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    memoryId,
    params.candidateId,
    'RANGE_EXPANSION_1M',
    `Range expansion (bar_range >= ${RANGE_EXPANSION_MULTIPLIER}x ATR) on 1m MNQ bars.`,
    `Sample: ${params.sampleSize} bars. Bull: ${params.bullishSampleSize}, Bear: ${params.bearishSampleSize}. ` +
    `H1 mean: ${params.h1MeanReturn.toFixed(4)} pts. WR: ${(params.h1WinRate * 100).toFixed(1)}%. ` +
    `p=${params.pValue.toFixed(4)}. CI=[${params.ciLower.toFixed(4)}, ${params.ciUpper.toFixed(4)}].`,
    params.conclusion,
    classMap[params.classification] ?? 'ARCHIVED',
    params.experimentId,
    params.sourceObservationId,
    params.sourceEventId,
    RULE_ID,
    RULE_VERSION,
  ]);

  // Back-link experiment to finding
  await pool.execute(`
    UPDATE darwin_experiment_records SET finding_id = ? WHERE experiment_id = ?
  `, [memoryId, params.experimentId]);

  // Back-link candidate to experiment and finding
  await pool.execute(`
    UPDATE darwin_candidates SET experiment_id = ?, finding_id = ? WHERE candidate_id = ?
  `, [params.experimentId, memoryId, params.candidateId]);

  return memoryId;
}

// ─── Step 7: Send Telegram notification ──────────────────────────────────────
export async function sendFindingNotification(params: {
  findingId: string;
  candidateId: string;
  experimentId: string;
  sourceObservationId: string;
  sourceEventId: number;
  classification: string;
  conclusion: string;
  sampleSize: number;
  bullishSampleSize: number;
  bearishSampleSize: number;
  h1MeanReturn: number;
  h1WinRate: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  nextRequiredTest: string;
}): Promise<{ notificationId: number; telegramMessageId: number | null }> {
  const pool = getPool();

  const classLabel: Record<string, string> = {
    'EDGE_DETECTED': '⚠️ EDGE DETECTED — REQUIRES FURTHER VALIDATION',
    'INCONCLUSIVE': '📊 INCONCLUSIVE — NO EDGE CONFIRMED',
    'FAIL_SAMPLE_SIZE': '📉 INSUFFICIENT SAMPLE — MONITORING',
    'FAIL_STATISTICAL': '❌ REJECTED — NO STATISTICAL SIGNIFICANCE',
  };

  const title = `DARWIN Finding: RANGE_EXPANSION_1M [${params.classification}]`;
  const body = [
    `🔬 DARWIN Autonomous Research Finding`,
    ``,
    `Rule: ${RULE_ID} v${RULE_VERSION}`,
    `Classification: ${classLabel[params.classification] ?? params.classification}`,
    ``,
    `📌 Observation: 1m MNQ bar range ≥ ${RANGE_EXPANSION_MULTIPLIER}× ATR(14)`,
    `Source Event: atlas_bars_1m.id=${params.sourceEventId}`,
    `Observation ID: ${params.sourceObservationId.slice(0, 8)}...`,
    ``,
    `📊 Historical Test Results`,
    `Sample: ${params.sampleSize} bars (Bull: ${params.bullishSampleSize}, Bear: ${params.bearishSampleSize})`,
    `H1 Mean Return: ${params.h1MeanReturn.toFixed(4)} pts`,
    `H1 Win Rate: ${(params.h1WinRate * 100).toFixed(1)}%`,
    `p-value: ${params.pValue.toFixed(4)}`,
    `95% CI: [${params.ciLower.toFixed(4)}, ${params.ciUpper.toFixed(4)}]`,
    ``,
    `⚠️ Key Caveat: Historical analysis only. No edge claimed. No trades initiated.`,
    ``,
    `🔜 Next Required Test: ${params.nextRequiredTest}`,
    ``,
    `📁 Finding ID: ${params.findingId.slice(0, 8)}...`,
    `📁 Experiment ID: ${params.experimentId.slice(0, 8)}...`,
    `🖥️ Dashboard: http://35.231.100.83/darwin/chain-trace`,
  ].join('\n');

  // Persist to notification_log
  const [result] = await pool.execute<mysql.ResultSetHeader>(`
    INSERT INTO notification_log (type, title, body, delivered, metadata)
    VALUES ('DARWIN_FINDING', ?, ?, 0, ?)
  `, [title, body, JSON.stringify({
    finding_id: params.findingId,
    candidate_id: params.candidateId,
    experiment_id: params.experimentId,
    source_observation_id: params.sourceObservationId,
    source_event_id: params.sourceEventId,
    classification: params.classification,
    rule_id: RULE_ID,
    rule_version: RULE_VERSION,
  })]);

  const notificationId = result.insertId;
  let telegramMessageId: number | null = null;

  // Send via Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    try {
      const { sendTelegramMessage } = await import('../_core/telegramNotifier.js');
      const tgResult = await sendTelegramMessage(body);
      if (tgResult && typeof tgResult === 'object' && 'message_id' in tgResult) {
        telegramMessageId = (tgResult as { message_id: number }).message_id;
      }
      // Mark delivered
      await pool.execute(`UPDATE notification_log SET delivered = 1 WHERE id = ?`, [notificationId]);
    } catch (err) {
      console.error('[J4] Telegram delivery failed:', err);
    }
  }

  // Back-link notification to finding and candidate
  await pool.execute(`
    UPDATE darwin_research_memory
    SET notification_id = ?, telegram_message_id = ?
    WHERE memory_id = ?
  `, [notificationId, telegramMessageId, params.findingId]);

  await pool.execute(`
    UPDATE darwin_candidates SET notification_id = ? WHERE candidate_id = ?
  `, [notificationId, params.candidateId]);

  return { notificationId, telegramMessageId };
}

// ─── Step 8: Complete job record ─────────────────────────────────────────────
export async function completeJobRecord(runId: string, candidateId: string, experimentId: string, durationMs: number, status: 'COMPLETED' | 'FAILED', summary?: string): Promise<void> {
  const pool = getPool();
  await pool.execute(`
    UPDATE darwin_job_run_history
    SET status = ?, completed_at = ?, duration_ms = ?, result_summary = ?
    WHERE run_id = ?
  `, [status, Date.now(), durationMs, summary ?? null, runId]);
}

// ─── Utility: get current git SHA ────────────────────────────────────────────
async function getCodeSha(): Promise<string> {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse HEAD', { cwd: '/home/ubuntu/atlas-nexus' }).toString().trim().slice(0, 40);
  } catch {
    return 'unknown';
  }
}

// ─── Main J4 entry point ─────────────────────────────────────────────────────
export async function runJ4PatternDiscovery(): Promise<J4RunResult> {
  const start = Date.now();

  // Step 1: Find qualifying observation
  const obs = await findLatestQualifyingObservation();
  if (!obs) {
    return { status: 'BLOCKED', reason: 'No qualifying observation found (no bar_range >= 1.5x ATR in darwin_observations)' };
  }

  // Step 2: Build condition signature and check for duplicates
  const signature = buildConditionSignature({
    market: 'CME',
    instrument: 'MNQ',
    timeframe: '1m',
    direction: obs.barDirection,
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    thresholdMultiplier: RANGE_EXPANSION_MULTIPLIER,
    session: obs.session,
    regime: obs.volatilityRegime,
  });

  const existing = await findExistingCandidate(signature);
  let candidateId: string;
  if (existing && existing.governanceStage !== 'REJECTED') {
    // Link this observation to the existing candidate instead of creating a duplicate
    const pool2 = getPool();
    await pool2.execute(`
      INSERT INTO darwin_candidate_observations (
        candidate_id, observation_id, source_event_id,
        bar_timestamp, bar_direction, bar_range, atr, session, volatility_regime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE linked_at = linked_at
    `, [
      existing.candidateId, obs.observationId, obs.sourceEventId,
      obs.barTimestamp, obs.barDirection, obs.barRange, obs.atr,
      obs.session, obs.volatilityRegime,
    ]);
    await pool2.execute(`
      UPDATE darwin_candidates SET last_observed = ?, occurrence_count = occurrence_count + 1
      WHERE candidate_id = ?
    `, [obs.barTimestamp, existing.candidateId]);
    // If candidate already has an experiment, true duplicate — skip
    if (existing.experimentId) {
      return {
        status: 'SKIPPED',
        reason: `Duplicate prevented: existing candidate ${existing.candidateId} (stage: ${existing.governanceStage}). Observation linked.`,
        duplicatePrevented: true,
      };
    }
    // No experiment yet (previous run failed mid-chain) — resume chain
    console.log(`[J4] Resuming chain for candidate ${existing.candidateId.slice(0,8)} (no experiment yet).`);
    candidateId = existing.candidateId;
  } else {
    // Step 3: Create new candidate
    candidateId = await createCandidate(obs, signature);
  }

  // Step 4: Create job record
  const runId = await createJobRecord(candidateId, obs.observationId);

  try {
    // Step 5: Run historical experiment
    const exp = await runHistoricalExperiment(candidateId);

    // Update experiment with source observation linkage
    const pool = getPool();
    await pool.execute(`
      UPDATE darwin_experiment_records
      SET source_observation_id = ?, source_event_id = ?
      WHERE experiment_id = ?
    `, [obs.observationId, obs.sourceEventId, exp.experimentId]);

    // Step 6: Persist finding to research memory
    const findingId = await persistFinding({
      candidateId,
      experimentId: exp.experimentId,
      sourceObservationId: obs.observationId,
      sourceEventId: obs.sourceEventId,
      classification: exp.classification,
      conclusion: exp.conclusion,
      sampleSize: exp.sampleSize,
      bullishSampleSize: exp.bullishSampleSize,
      bearishSampleSize: exp.bearishSampleSize,
      h1MeanReturn: exp.h1MeanReturn,
      h1WinRate: exp.h1WinRate,
      ciLower: exp.ciLower,
      ciUpper: exp.ciUpper,
      pValue: exp.pValue,
    });

    const nextTest = exp.classification === 'EDGE_DETECTED'
      ? 'Out-of-sample validation on held-out period (split at 2026-01-01)'
      : 'Accumulate more observations; re-test when sample size >= 100 per direction';

    // Step 7: Send notification
    const { notificationId, telegramMessageId } = await sendFindingNotification({
      findingId,
      candidateId,
      experimentId: exp.experimentId,
      sourceObservationId: obs.observationId,
      sourceEventId: obs.sourceEventId,
      classification: exp.classification,
      conclusion: exp.conclusion,
      sampleSize: exp.sampleSize,
      bullishSampleSize: exp.bullishSampleSize,
      bearishSampleSize: exp.bearishSampleSize,
      h1MeanReturn: exp.h1MeanReturn,
      h1WinRate: exp.h1WinRate,
      pValue: exp.pValue,
      ciLower: exp.ciLower,
      ciUpper: exp.ciUpper,
      nextRequiredTest: nextTest,
    });

    // Step 8: Complete job
    const durationMs = Date.now() - start;
    await completeJobRecord(runId, candidateId, exp.experimentId, durationMs, 'COMPLETED',
      `Chain complete: candidate=${candidateId.slice(0,8)} exp=${exp.experimentId.slice(0,8)} finding=${findingId.slice(0,8)} notif=${notificationId}`);

    return {
      status: 'COMPLETE',
      chain: {
        sourceEventId: obs.sourceEventId,
        observationId: obs.observationId,
        hypothesisId: candidateId,
        jobId: runId,
        resultId: exp.experimentId,
        findingId,
        notificationId,
        telegramMessageId,
        resultClassification: exp.classification,
        plainEnglishFinding: exp.conclusion,
        historicalSampleSize: exp.sampleSize,
        bullishSampleSize: exp.bullishSampleSize,
        bearishSampleSize: exp.bearishSampleSize,
        historicalPeriodStart: exp.historicalPeriodStart,
        historicalPeriodEnd: exp.historicalPeriodEnd,
        nextRequiredTest: nextTest,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    await completeJobRecord(runId, candidateId, '', durationMs, 'FAILED',
      err instanceof Error ? err.message : String(err));
    throw err;
  }
}
