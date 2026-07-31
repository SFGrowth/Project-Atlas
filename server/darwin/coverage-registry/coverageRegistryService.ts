/**
 * DARWIN Coverage Registry Service
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Manages the research coverage registry (24 families A–X).
 * Tracks which families have been researched, when, and how many rules are active.
 */

import { db } from '../../_core/db';

export interface FamilyCoverageRecord {
  family_id: string;
  family_name: string;
  total_defined_rules: number;
  active_rules: number;
  inactive_rules: number;
  blocked_rules: number;
  tested_hypotheses: number;
  rejected_hypotheses: number;
  inconclusive_hypotheses: number;
  promising_hypotheses: number;
  supported_hypotheses: number;
  last_researched_at: Date | null;
  next_activation_priority: number;
  data_available: boolean;
  status: string;
}

/**
 * Get all family coverage records, ordered by priority.
 */
export async function getAllFamilyCoverage(): Promise<FamilyCoverageRecord[]> {
  const [rows] = await db.execute(
    `SELECT * FROM darwin_research_coverage_registry ORDER BY next_activation_priority ASC`
  );
  return rows as FamilyCoverageRecord[];
}

/**
 * Get families that have not been researched in the last N days.
 * Used for starvation prevention.
 */
export async function getStarvedFamilies(maxDaysWithoutResearch: number = 14): Promise<FamilyCoverageRecord[]> {
  const [rows] = await db.execute(
    `SELECT * FROM darwin_research_coverage_registry
     WHERE status IN ('QUEUED_FOR_ACTIVATION', 'ACTIVE')
       AND (
         last_researched_at IS NULL
         OR last_researched_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       )
     ORDER BY next_activation_priority ASC`,
    [maxDaysWithoutResearch]
  );
  return rows as FamilyCoverageRecord[];
}

/**
 * Update family coverage counters after a hypothesis is created or classified.
 */
export async function updateFamilyCoverage(
  family_id: string,
  action: 'hypothesis_created' | 'rejected' | 'inconclusive' | 'promising' | 'supported'
): Promise<void> {
  const fieldMap: Record<string, string> = {
    hypothesis_created: 'tested_hypotheses',
    rejected: 'rejected_hypotheses',
    inconclusive: 'inconclusive_hypotheses',
    promising: 'promising_hypotheses',
    supported: 'supported_hypotheses',
  };
  const field = fieldMap[action];
  if (!field) return;

  await db.execute(
    `UPDATE darwin_research_coverage_registry
     SET ${field} = ${field} + 1,
         last_researched_at = NOW(3),
         updated_at = NOW(3)
     WHERE family_id = ?`,
    [family_id]
  );
}

/**
 * Get the family research share for the current day.
 * Used to enforce MAX_RESEARCH_SHARE_PER_FAMILY.
 */
export async function getFamilyResearchShare(family_id: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [totalRows] = await db.execute(
    `SELECT SUM(hypotheses_created) AS total FROM darwin_experiment_budget_log WHERE log_date = ?`,
    [today]
  );
  const total = (totalRows as any[])[0]?.total ?? 0;
  if (total === 0) return 0;

  const [familyRows] = await db.execute(
    `SELECT COUNT(*) AS family_count FROM darwin_hypotheses
     WHERE hypothesis_family = ? AND DATE(created_at) = ?`,
    [family_id, today]
  );
  const familyCount = (familyRows as any[])[0]?.family_count ?? 0;
  return familyCount / total;
}

/**
 * Check if a family has exceeded its daily research share.
 */
export async function isFamilyBudgetExceeded(family_id: string): Promise<boolean> {
  const share = await getFamilyResearchShare(family_id);
  return share >= 0.20; // MAX_RESEARCH_SHARE_PER_FAMILY
}

/**
 * Get the count of distinct families researched this week.
 * Used to enforce MIN_DISTINCT_FAMILIES_RESEARCHED_PER_WEEK.
 */
export async function getDistinctFamiliesResearchedThisWeek(): Promise<number> {
  const [rows] = await db.execute(
    `SELECT COUNT(DISTINCT hypothesis_family) AS count FROM darwin_hypotheses
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
  );
  return (rows as any[])[0]?.count ?? 0;
}
