/**
 * DARWIN Autonomous Coverage Scheduler
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Governs which research families and rules are researched each DARWIN hourly cycle.
 * Prevents permanent focus on one family, ensures broad coverage, and enforces
 * all budget controls.
 *
 * AUTHORITY:
 *   DARWIN_DECISION_AUTHORITY=DISABLED
 *   DARWIN_EXECUTION_AUTHORITY=DISABLED
 *   No paper trading, no live trading without Phil's written approval.
 */

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
import { getAllFamilyCoverage, getStarvedFamilies, isFamilyBudgetExceeded, getDistinctFamiliesResearchedThisWeek } from '../coverage-registry/coverageRegistryService';
import { preRegisterHypothesis } from '../hypothesis-engine/hypothesisEngine';

// ============================================================
// Scheduler configuration (frozen — do not change without Phil approval)
// ============================================================
const SCHEDULER_CONFIG = {
  MAX_HYPOTHESES_PER_CYCLE: 3,
  STARVATION_AGE_LIMIT_DAYS: 14,
  MIN_DISTINCT_FAMILIES_PER_WEEK: 5,
  WAVE_1_FAMILIES: ['B', 'C', 'E', 'F', 'G', 'H', 'J', 'N', 'O', 'P', 'V'],
  WAVE_2_FAMILIES: ['D', 'K', 'L', 'M', 'Q', 'R', 'T', 'U', 'X'],
  WAVE_3_FAMILIES: ['S', 'W'],
  BLOCKED_FAMILIES: ['I'], // requires Phil approval + paid schema
} as const;

// ============================================================
// Scheduling score computation
// ============================================================

interface FamilySchedulingScore {
  family_id: string;
  score: number;
  reasons: string[];
}

async function computeFamilySchedulingScore(
  family: Awaited<ReturnType<typeof getAllFamilyCoverage>>[0]
): Promise<FamilySchedulingScore> {
  const reasons: string[] = [];
  let score = 0;

  // Days since last researched (weight: 30)
  if (family.last_researched_at === null) {
    score += 30;
    reasons.push('never_researched: +30');
  } else {
    const daysSince = Math.floor((Date.now() - family.last_researched_at.getTime()) / 86400000);
    const dayScore = Math.min(30, daysSince * 2);
    score += dayScore;
    reasons.push(`days_since_researched=${daysSince}: +${dayScore}`);
  }

  // Untested rules (weight: 20)
  const untestedRules = family.inactive_rules;
  const untestedScore = Math.min(20, untestedRules * 2);
  score += untestedScore;
  reasons.push(`untested_rules=${untestedRules}: +${untestedScore}`);

  // Data availability (weight: 15)
  if (family.data_available) {
    score += 15;
    reasons.push('data_available: +15');
  }

  // Active rules (weight: 10)
  const activeScore = Math.min(10, family.active_rules * 3);
  score += activeScore;
  reasons.push(`active_rules=${family.active_rules}: +${activeScore}`);

  return { family_id: family.family_id, score, reasons };
}

// ============================================================
// Main scheduler cycle
// ============================================================

export interface SchedulerCycleResult {
  hypotheses_created: number;
  hypotheses_rejected: number;
  families_researched: string[];
  starvation_alerts: string[];
  budget_blocks: string[];
  errors: string[];
  cycle_timestamp: string;
}

export async function runSchedulerCycle(): Promise<SchedulerCycleResult> {
  const result: SchedulerCycleResult = {
    hypotheses_created: 0,
    hypotheses_rejected: 0,
    families_researched: [],
    starvation_alerts: [],
    budget_blocks: [],
    errors: [],
    cycle_timestamp: new Date().toISOString(),
  };

  try {
    // 1. Check starvation
    const starvedFamilies = await getStarvedFamilies(SCHEDULER_CONFIG.STARVATION_AGE_LIMIT_DAYS);
    for (const family of starvedFamilies) {
      result.starvation_alerts.push(`${family.family_id}: not researched in >${SCHEDULER_CONFIG.STARVATION_AGE_LIMIT_DAYS} days`);
    }

    // 2. Check weekly diversity
    const weeklyFamilies = await getDistinctFamiliesResearchedThisWeek();
    if (weeklyFamilies < SCHEDULER_CONFIG.MIN_DISTINCT_FAMILIES_PER_WEEK) {
      result.starvation_alerts.push(`Weekly diversity: ${weeklyFamilies}/${SCHEDULER_CONFIG.MIN_DISTINCT_FAMILIES_PER_WEEK} families researched`);
    }

    // 3. Get all active/queued families
    const allFamilies = await getAllFamilyCoverage();
    const eligibleFamilies = allFamilies.filter(f =>
      ['QUEUED_FOR_ACTIVATION', 'ACTIVE'].includes(f.status) &&
      !SCHEDULER_CONFIG.BLOCKED_FAMILIES.includes(f.family_id as any) &&
      f.data_available
    );

    // 4. Score families
    const scores: FamilySchedulingScore[] = [];
    for (const family of eligibleFamilies) {
      const score = await computeFamilySchedulingScore(family);
      scores.push(score);
    }
    scores.sort((a, b) => b.score - a.score);

    // 5. Select top families for this cycle
    let hypothesesThisCycle = 0;
    for (const scoredFamily of scores) {
      if (hypothesesThisCycle >= SCHEDULER_CONFIG.MAX_HYPOTHESES_PER_CYCLE) break;

      // Check family budget
      const budgetExceeded = await isFamilyBudgetExceeded(scoredFamily.family_id);
      if (budgetExceeded) {
        result.budget_blocks.push(`${scoredFamily.family_id}: daily share exceeded`);
        continue;
      }

      // Get next untested rule for this family
      const nextRule = await getNextUntestedRule(scoredFamily.family_id);
      if (!nextRule) continue;

      // Create hypothesis from rule
      const hypothesisInput = buildHypothesisFromRule(nextRule);
      if (!hypothesisInput) continue;

      const createResult = await preRegisterHypothesis(hypothesisInput);
      if (createResult.success) {
        hypothesesThisCycle++;
        result.hypotheses_created++;
        result.families_researched.push(scoredFamily.family_id);
      } else {
        result.hypotheses_rejected++;
      }
    }

  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

// ============================================================
// Get next untested rule for a family
// ============================================================

async function getNextUntestedRule(family_id: string): Promise<any | null> {
  const db = getPool();
  const [rows] = await db.execute(
    `SELECT r.* FROM darwin_rule_library r
     WHERE r.family_id = ?
       AND r.status = 'INACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM darwin_hypotheses h
         WHERE h.rule_id = r.rule_id
           AND h.status NOT IN ('REJECTED')
       )
     ORDER BY r.rule_id ASC
     LIMIT 1`,
    [family_id]
  );
  const rules = rows as any[];
  return rules.length > 0 ? rules[0] : null;
}

// ============================================================
// Build hypothesis input from rule
// ============================================================

function buildHypothesisFromRule(rule: any): Parameters<typeof preRegisterHypothesis>[0] | null {
  if (!rule) return null;

  return {
    hypothesis_family: rule.family_id,
    title: rule.title,
    mechanism_rationale: rule.market_mechanism,
    trigger_condition: rule.exact_trigger,
    context_condition: rule.context,
    outcome_definition: `Forward return measured as (close[T+N] - close[T]) / atr14[T] for N in ${JSON.stringify(JSON.parse(rule.forward_horizons))}`,
    forward_horizons: JSON.parse(rule.forward_horizons),
    direction: rule.direction,
    timeframe: rule.timeframe,
    session: rule.session,
    minimum_sample: rule.minimum_sample,
    null_hypothesis: `H0: The forward return distribution after "${rule.title}" is not materially different from the unconditional distribution.`,
    alternative_hypothesis: `H1: The forward return distribution after "${rule.title}" has a positive (or negative) mean that exceeds round-trip costs after BH-FDR correction.`,
    rule_id: rule.rule_id,
    edge_direction: 'POSITIVE',
  };
}
