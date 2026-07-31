/**
 * DARWIN Daily Queue Generator
 * Sprint: darwin-complete-edge-search-universe
 * Created: 2026-07-31T01:18:00Z
 * Status: LOCAL ONLY — not deployed until soak completion and evidence lock
 *
 * Generates the daily hypothesis queue JSON and Markdown report.
 * Called by the DARWIN Daily cron job at 21:45 UTC on weekdays.
 */

import { db } from '../../_core/db';
import { getStarvedFamilies, getDistinctFamiliesResearchedThisWeek } from '../coverage-registry/coverageRegistryService';

export interface DailyQueueSummary {
  queue_date: string;
  generated_at: string;
  hypotheses_created: number;
  hypotheses_rejected: number;
  experiments_queued: number;
  experiments_completed: number;
  promising_findings: number;
  families_researched: string[];
  starvation_risk_families: string[];
  data_blockers: string[];
}

/**
 * Generate the daily hypothesis queue and report.
 * Returns the queue JSON and Markdown report.
 */
export async function generateDailyQueue(): Promise<{ queue_json: object; report_md: string }> {
  const today = new Date().toISOString().slice(0, 10);

  // Gather today's activity
  const [budgetRows] = await db.execute(
    `SELECT * FROM darwin_experiment_budget_log WHERE log_date = ?`,
    [today]
  );
  const budget = (budgetRows as any[])[0] ?? {};

  const [newHypotheses] = await db.execute(
    `SELECT hypothesis_id, hypothesis_family, title, status, priority_level
     FROM darwin_hypotheses WHERE DATE(created_at) = ?`,
    [today]
  );

  const [activeExperiments] = await db.execute(
    `SELECT experiment_id, hypothesis_id, stage, status
     FROM darwin_experiments WHERE status IN ('QUEUED', 'RUNNING')`
  );

  const [completedToday] = await db.execute(
    `SELECT e.experiment_id, e.hypothesis_id, e.stage, e.classification,
            h.hypothesis_family, h.title
     FROM darwin_experiments e
     JOIN darwin_hypotheses h ON h.hypothesis_id = e.hypothesis_id
     WHERE DATE(e.completed_at) = ?`,
    [today]
  );

  const [promisingFindings] = await db.execute(
    `SELECT hypothesis_id, hypothesis_family, title
     FROM darwin_hypotheses WHERE status = 'PROMISING'`
  );

  const starvedFamilies = await getStarvedFamilies(14);
  const weeklyDiversity = await getDistinctFamiliesResearchedThisWeek();

  const [dataBlockers] = await db.execute(
    `SELECT family_id, blocker FROM darwin_research_coverage_registry
     WHERE status = 'BLOCKED_DATA_UNAVAILABLE'`
  );

  // Build queue JSON
  const queue_json = {
    queue_date: today,
    generated_at: new Date().toISOString(),
    new_hypotheses: newHypotheses,
    active_experiments: activeExperiments,
    completed_experiments: completedToday,
    promising_findings: promisingFindings,
    starvation_risks: starvedFamilies.map(f => f.family_id),
    data_blockers: (dataBlockers as any[]).map(r => ({ family_id: r.family_id, blocker: r.blocker })),
    budget_status: {
      hypotheses_created_today: budget.hypotheses_created ?? 0,
      hypotheses_remaining_today: 25 - (budget.hypotheses_created ?? 0),
      active_experiments: (activeExperiments as any[]).length,
      active_experiments_remaining: 10 - (activeExperiments as any[]).length,
      weekly_family_diversity: weeklyDiversity,
      post_hoc_changes: budget.post_hoc_changes ?? 0,
      unregistered_experiments: budget.unregistered_experiments ?? 0,
      runaway_loops: budget.runaway_loops ?? 0,
    },
  };

  // Build Markdown report
  const newH = newHypotheses as any[];
  const completed = completedToday as any[];
  const promising = promisingFindings as any[];

  const report_md = `# DARWIN Daily Research Report — ${today}

**Generated:** ${new Date().toISOString()}

---

## What Did DARWIN Notice?

${newH.length === 0 ? '_No new hypotheses created today._' : newH.map(h => `- **${h.hypothesis_id}** (Family ${h.hypothesis_family}): ${h.title}`).join('\n')}

---

## What Hypotheses Were Created?

| Hypothesis ID | Family | Title | Status | Priority |
|---|---|---|---|---|
${newH.length === 0 ? '| — | — | No new hypotheses | — | — |' : newH.map(h => `| ${h.hypothesis_id} | ${h.hypothesis_family} | ${h.title} | ${h.status} | ${h.priority_level} |`).join('\n')}

---

## What Was Tested?

| Experiment ID | Hypothesis | Stage | Classification |
|---|---|---|---|
${completed.length === 0 ? '| — | — | No experiments completed today | — |' : completed.map(e => `| ${e.experiment_id} | ${e.hypothesis_id} | ${e.stage} | ${e.classification ?? 'PENDING'} |`).join('\n')}

---

## What Looks Promising?

${promising.length === 0 ? '_No PROMISING findings yet._' : promising.map(h => `- **${h.hypothesis_id}** (Family ${h.hypothesis_family}): ${h.title}`).join('\n')}

---

## Which Families Are Under-Researched?

${starvedFamilies.length === 0 ? '_All families researched within the last 14 days._' : starvedFamilies.map(f => `- **Family ${f.family_id}** (${f.family_name}): last researched ${f.last_researched_at?.toISOString().slice(0, 10) ?? 'never'}`).join('\n')}

**Weekly family diversity:** ${weeklyDiversity}/5 minimum

---

## Budget Status

| Metric | Value |
|---|---|
| Hypotheses created today | ${budget.hypotheses_created ?? 0}/25 |
| Active experiments | ${(activeExperiments as any[]).length}/10 |
| Weekly family diversity | ${weeklyDiversity}/5 |
| POST_HOC_PARAMETER_CHANGES | ${budget.post_hoc_changes ?? 0} |
| UNREGISTERED_EXPERIMENTS | ${budget.unregistered_experiments ?? 0} |
| RUNAWAY_RESEARCH_LOOPS | ${budget.runaway_loops ?? 0} |

---

## Data Blockers

${(dataBlockers as any[]).length === 0 ? '_No data blockers._' : (dataBlockers as any[]).map(r => `- **Family ${r.family_id}:** ${r.blocker}`).join('\n')}
`;

  // Persist to database
  await db.execute(
    `INSERT INTO darwin_daily_hypothesis_queue
      (queue_date, queue_json, report_md, hypotheses_created, hypotheses_rejected,
       experiments_queued, experiments_completed, promising_findings,
       families_researched, starvation_risk_families, data_blockers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       queue_json = VALUES(queue_json),
       report_md = VALUES(report_md),
       hypotheses_created = VALUES(hypotheses_created),
       hypotheses_rejected = VALUES(hypotheses_rejected),
       experiments_queued = VALUES(experiments_queued),
       experiments_completed = VALUES(experiments_completed),
       promising_findings = VALUES(promising_findings),
       families_researched = VALUES(families_researched),
       starvation_risk_families = VALUES(starvation_risk_families),
       data_blockers = VALUES(data_blockers)`,
    [
      today,
      JSON.stringify(queue_json),
      report_md,
      budget.hypotheses_created ?? 0,
      budget.hypotheses_rejected ?? 0,
      (activeExperiments as any[]).length,
      completed.length,
      promising.length,
      JSON.stringify(newH.map(h => h.hypothesis_family)),
      JSON.stringify(starvedFamilies.map(f => f.family_id)),
      JSON.stringify((dataBlockers as any[]).map(r => r.family_id)),
    ]
  );

  return { queue_json, report_md };
}
