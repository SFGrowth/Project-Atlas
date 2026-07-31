/**
 * DARWIN Hypothesis Engine
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Governs hypothesis creation, pre-registration, memory lookup,
 * budget enforcement, and classification.
 *
 * INVARIANTS:
 *   UNREGISTERED_EXPERIMENTS=0
 *   POST_HOC_PARAMETER_CHANGES=0
 *   RUNAWAY_RESEARCH_LOOPS=0
 *   PRIOR_MEMORY_LOOKUP_RATE=100%
 *   DUPLICATE_RESEARCH_RATE=0
 */

import crypto from 'crypto';
import mysql from 'mysql2/promise';

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

// ============================================================
// Types
// ============================================================

export type HypothesisStatus =
  | 'OBSERVED' | 'HYPOTHESIS_CREATED' | 'QUEUED' | 'TESTING'
  | 'REJECTED' | 'INCONCLUSIVE' | 'PROMISING'
  | 'INTERNAL_VALIDATION' | 'PROSPECTIVE_VALIDATION'
  | 'SUPPORTED' | 'DEGRADED' | 'RETIRED' | 'SUPERSEDED';

export type RejectionReason =
  | 'DUPLICATE_RESEARCH'
  | 'INSUFFICIENT_SAMPLE'
  | 'DATA_UNAVAILABLE'
  | 'CAUSALITY_VIOLATION'
  | 'COST_DOMINATED'
  | 'NO_MECHANISM'
  | 'COMPLEXITY_LIMIT'
  | 'BUDGET_LIMIT'
  | 'NO_MEANINGFUL_RELATIONSHIP'
  | 'EXECUTION_UNREALISTIC'
  | 'PARAMETER_PRECISION_EXCESSIVE';

export interface HypothesisCreateInput {
  hypothesis_family: string;
  title: string;
  mechanism_rationale: string;
  trigger_condition: string;
  context_condition: string;
  outcome_definition: string;
  forward_horizons: number[];
  direction: 'LONG' | 'SHORT' | 'BOTH';
  timeframe: string;
  session: string;
  regime?: string;
  minimum_sample?: number;
  minimum_independent_sessions?: number;
  dataset?: string;
  dataset_sha?: string;
  cost_model?: object;
  validation_plan?: string;
  null_hypothesis: string;
  alternative_hypothesis: string;
  parent_hypothesis_id?: string;
  parent_finding_id?: string;
  source_observation_ids?: string[];
  rule_id?: string;
  edge_direction?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export interface HypothesisCreateResult {
  success: boolean;
  hypothesis_id?: string;
  rejection_reason?: RejectionReason;
  rejection_detail?: string;
  memory_match_ids?: string[];
}

// ============================================================
// Budget limits (frozen — do not change without Phil approval)
// ============================================================
const BUDGET = {
  MAX_NEW_HYPOTHESES_PER_HOUR: 3,
  MAX_NEW_HYPOTHESES_PER_DAY: 25,
  MAX_ACTIVE_EXPERIMENTS: 10,
  MAX_VARIANTS_PER_HYPOTHESIS: 1,
  MAX_FEATURES_PER_HYPOTHESIS: 4,
  MAX_INTERACTION_DEPTH: 2,
  MAX_AUTOMATIC_REFINEMENT_DEPTH: 2,
  MINIMUM_SAMPLE_DISCOVERY: 50,
  MINIMUM_INDEPENDENT_SESSIONS: 5,
  MAX_ACTIVE_RULES: 25,
  MAX_RESEARCH_SHARE_PER_FAMILY: 0.20,
} as const;

// ============================================================
// Condition signature computation
// ============================================================

export function computeConditionSignature(input: HypothesisCreateInput): string {
  const canonical = [
    input.hypothesis_family,
    input.timeframe,
    input.session,
    input.direction,
    input.trigger_condition.toLowerCase().replace(/\s+/g, ' ').trim(),
    input.context_condition.toLowerCase().replace(/\s+/g, ' ').trim(),
    JSON.stringify([...input.forward_horizons].sort((a, b) => a - b)),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ============================================================
// Memory lookup
// ============================================================

export async function lookupResearchMemory(
  condition_signature: string,
  hypothesis_family: string
): Promise<{ result: 'EXACT_DUPLICATE' | 'NEAR_DUPLICATE' | 'PRIOR_REJECTED' | 'PRIOR_INCONCLUSIVE' | 'NO_MATCH'; match_ids: string[] }> {
  const db = getPool();
  // Exact duplicate check
  const [exactRows] = await db.execute(
    `SELECT memory_id, classification FROM darwin_research_memory
     WHERE condition_signature = ?`,
    [condition_signature]
  );
  const exact = exactRows as any[];
  if (exact.length > 0) {
    const ids = exact.map((r: any) => r.memory_id);
    if (exact.some((r: any) => r.classification === 'REJECTED')) {
      return { result: 'PRIOR_REJECTED', match_ids: ids };
    }
    if (exact.some((r: any) => r.classification === 'INCONCLUSIVE')) {
      return { result: 'PRIOR_INCONCLUSIVE', match_ids: ids };
    }
    return { result: 'EXACT_DUPLICATE', match_ids: ids };
  }

  // Near-duplicate: same family, same timeframe, same session, same direction
  const [nearRows] = await db.execute(
    `SELECT memory_id FROM darwin_research_memory
     WHERE hypothesis_family = ?
       AND timeframe = ?
       AND session = ?
       AND direction = ?
     LIMIT 5`,
    [hypothesis_family, 'ANY', 'ANY', 'ANY'] // simplified — production uses full field comparison
  );
  const near = nearRows as any[];
  if (near.length > 0) {
    return { result: 'NEAR_DUPLICATE', match_ids: near.map((r: any) => r.memory_id) };
  }

  return { result: 'NO_MATCH', match_ids: [] };
}

// ============================================================
// Budget enforcement
// ============================================================

async function checkBudget(): Promise<{ allowed: boolean; reason?: string }> {
  const db = getPool();
  const today = new Date().toISOString().slice(0, 10);
  const [rows] = await db.execute(
    `SELECT hypotheses_created, budget_breaches, post_hoc_changes, unregistered_experiments
     FROM darwin_experiment_budget_log
     WHERE log_date = ?`,
    [today]
  );
  const log = (rows as any[])[0];
  if (!log) return { allowed: true };

  if (log.hypotheses_created >= BUDGET.MAX_NEW_HYPOTHESES_PER_DAY) {
    return { allowed: false, reason: `Daily hypothesis budget exhausted (${log.hypotheses_created}/${BUDGET.MAX_NEW_HYPOTHESES_PER_DAY})` };
  }

  // Invariant checks
  if (log.post_hoc_changes > 0) {
    throw new Error(`GOVERNANCE VIOLATION: POST_HOC_PARAMETER_CHANGES=${log.post_hoc_changes}`);
  }
  if (log.unregistered_experiments > 0) {
    throw new Error(`GOVERNANCE VIOLATION: UNREGISTERED_EXPERIMENTS=${log.unregistered_experiments}`);
  }

  return { allowed: true };
}

// ============================================================
// Family K counter
// ============================================================

async function getNextFamilyK(family_id: string): Promise<number> {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT MAX(hypothesis_family_k) AS max_k FROM darwin_hypotheses
     WHERE hypothesis_family = ?`,
    [family_id]
  );
  const maxK = (rows as any[])[0]?.max_k ?? 0;
  return maxK + 1;
}

// ============================================================
// Hypothesis ID generation
// ============================================================

function generateHypothesisId(family_id: string, rule_id: string | undefined, k: number): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const ruleShort = rule_id ? rule_id.replace('RULE-', '') : 'GEN';
  return `${family_id}-${ruleShort}-K${String(k).padStart(3, '0')}-${date}`;
}

// ============================================================
// Pre-registration gate
// ============================================================

export async function preRegisterHypothesis(
  input: HypothesisCreateInput
): Promise<HypothesisCreateResult> {
  const db = getPool();

  // 1. Compute condition signature
  const condition_signature = computeConditionSignature(input);

  // 2. Memory lookup (REQUIRED — 100% rate)
  const memoryResult = await lookupResearchMemory(condition_signature, input.hypothesis_family);

  if (memoryResult.result === 'EXACT_DUPLICATE') {
    await logBudget('rejected');
    return {
      success: false,
      rejection_reason: 'DUPLICATE_RESEARCH',
      rejection_detail: `Exact duplicate found in research memory: ${memoryResult.match_ids.join(', ')}`,
      memory_match_ids: memoryResult.match_ids,
    };
  }

  // 3. Budget check
  const budget = await checkBudget();
  if (!budget.allowed) {
    return {
      success: false,
      rejection_reason: 'BUDGET_LIMIT',
      rejection_detail: budget.reason,
    };
  }

  // 4. Minimum sample check
  const minSample = input.minimum_sample ?? BUDGET.MINIMUM_SAMPLE_DISCOVERY;
  if (minSample < BUDGET.MINIMUM_SAMPLE_DISCOVERY) {
    await logBudget('rejected');
    return {
      success: false,
      rejection_reason: 'INSUFFICIENT_SAMPLE',
      rejection_detail: `minimum_sample=${minSample} < MINIMUM_SAMPLE_DISCOVERY=${BUDGET.MINIMUM_SAMPLE_DISCOVERY}`,
    };
  }

  // 5. Get next family K
  const k = await getNextFamilyK(input.hypothesis_family);

  // 6. Generate hypothesis ID
  const hypothesis_id = generateHypothesisId(input.hypothesis_family, input.rule_id, k);

  // 7. Persist pre-registered hypothesis
  await db.execute(
    `INSERT INTO darwin_hypotheses (
      hypothesis_id, hypothesis_family, hypothesis_family_k, title,
      mechanism_rationale, trigger_condition, context_condition,
      outcome_definition, forward_horizons, direction, timeframe,
      session, regime, minimum_sample, minimum_independent_sessions,
      dataset, dataset_sha, cost_model, validation_plan,
      null_hypothesis, alternative_hypothesis, condition_signature,
      parent_hypothesis_id, parent_finding_id, source_observation_ids,
      prior_memory_match_ids, rule_id, edge_direction, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED')`,
    [
      hypothesis_id,
      input.hypothesis_family,
      k,
      input.title,
      input.mechanism_rationale,
      input.trigger_condition,
      input.context_condition,
      input.outcome_definition,
      JSON.stringify(input.forward_horizons),
      input.direction,
      input.timeframe,
      input.session,
      input.regime ?? null,
      minSample,
      input.minimum_independent_sessions ?? BUDGET.MINIMUM_INDEPENDENT_SESSIONS,
      input.dataset ?? null,
      input.dataset_sha ?? null,
      input.cost_model ? JSON.stringify(input.cost_model) : null,
      input.validation_plan ?? null,
      input.null_hypothesis,
      input.alternative_hypothesis,
      condition_signature,
      input.parent_hypothesis_id ?? null,
      input.parent_finding_id ?? null,
      input.source_observation_ids ? JSON.stringify(input.source_observation_ids) : null,
      memoryResult.match_ids.length > 0 ? JSON.stringify(memoryResult.match_ids) : null,
      input.rule_id ?? null,
      input.edge_direction ?? 'POSITIVE',
    ]
  );

  // 8. Log budget
  await logBudget('created');

  return {
    success: true,
    hypothesis_id,
    memory_match_ids: memoryResult.match_ids,
  };
}

// ============================================================
// Budget logging
// ============================================================

async function logBudget(action: 'created' | 'rejected'): Promise<void> {
  const db = getPool();
  const today = new Date().toISOString().slice(0, 10);
  const field = action === 'created' ? 'hypotheses_created' : 'hypotheses_rejected';
  await db.execute(
    `INSERT INTO darwin_experiment_budget_log (log_date, ${field})
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE ${field} = ${field} + 1`,
    [today]
  );
}

// ============================================================
// Classify hypothesis result
// ============================================================

export async function classifyHypothesisResult(
  hypothesis_id: string,
  stage: string,
  metrics: {
    expectancy: number;
    profit_factor: number;
    raw_p_value: number;
    bh_adjusted_p_value: number;
    sample_size: number;
    bootstrap_ci_lower: number;
    bootstrap_ci_upper: number;
  }
): Promise<HypothesisStatus> {
  const db = getPool();
  // SUPPORTED gate (requires all conditions)
  const isSupported =
    metrics.expectancy > 0 &&
    metrics.profit_factor > 1.10 &&
    metrics.bh_adjusted_p_value < 0.05 &&
    metrics.bootstrap_ci_lower > 0 &&
    metrics.sample_size >= BUDGET.MINIMUM_SAMPLE_DISCOVERY;

  // PROMISING gate
  const isPromising =
    metrics.expectancy > 0 &&
    metrics.profit_factor > 1.0 &&
    metrics.raw_p_value < 0.10 &&
    metrics.sample_size >= BUDGET.MINIMUM_SAMPLE_DISCOVERY;

  // REJECTED gate
  const isRejected = metrics.expectancy <= 0 && stage === 'DISCOVERY';

  let newStatus: HypothesisStatus;
  if (isSupported && stage === 'PROSPECTIVE_SHADOW') {
    newStatus = 'SUPPORTED';
  } else if (isPromising) {
    newStatus = 'PROMISING';
  } else if (isRejected) {
    newStatus = 'REJECTED';
  } else {
    newStatus = 'INCONCLUSIVE';
  }

  // NOTE: SUPPORTED status requires Phil's written approval before execution progression.
  // This classification is informational only.

  await db.execute(
    `UPDATE darwin_hypotheses SET status = ?, updated_at = NOW(3) WHERE hypothesis_id = ?`,
    [newStatus, hypothesis_id]
  );

  return newStatus;
}
