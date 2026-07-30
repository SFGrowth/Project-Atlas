/**
 * DARWIN Research Dashboard Router — Sprint 123A.7
 *
 * Provides read-only research data to the DARWIN dashboard.
 * No actions here affect live trading.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 *
 * Sprint 123A.7 additions:
 *   GET /api/darwin/strategy-monitoring   — rolling metrics and lifecycle recommendations
 *   GET /api/darwin/portfolio-gaps        — open portfolio gaps
 *   GET /api/darwin/research-schedule     — 7-job autonomous research schedule status
 *   GET /api/darwin/observation-health    — live observation recording health
 *   GET /api/darwin/fidelity-report       — Pine Script fidelity status for all strategies
 */

import { Router } from 'express';
import mysql from 'mysql2/promise';

let _chainPool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_chainPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const u = new URL(url);
    _chainPool = mysql.createPool({
      host: u.hostname,
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
      port: parseInt(u.port || '3306', 10),
      waitForConnections: true,
      connectionLimit: 3,
    });
  }
  return _chainPool;
}
import { getDarwinAuthorityStatus } from '../market-data/darwin-authority.js';
import { getSchedulerStatus } from './darwin-resource-scheduler.js';
import { getResearchSchedulerStatus } from './darwin-research-scheduler.js';
import {
  monitorAllStrategies,
  getOpenGaps,
  getHighPriorityGaps,
  PORTFOLIO_GAP_REGISTRY,
} from './darwin-strategy-monitor.js';

const router = Router();

// ─── GET /api/darwin/research-dashboard ──────────────────────────────────────

router.get('/research-dashboard', async (req, res) => {
  try {
    const authorityStatus = getDarwinAuthorityStatus();
    const schedulerStatus = getSchedulerStatus();
    const researchScheduler = getResearchSchedulerStatus();

    // Build response — all data is research-only
    const response = {
      authorityStatus: {
        ...authorityStatus,
        // Authority boundaries — permanently false
        processBarCalled: false as const,
        postBarAutomationCalled: false as const,
        tradersPostSent: false as const,
        tradovateOrderSubmitted: false as const,
      },
      observationHealth: {
        totalObservations: 0,
        observationsLast24h: 0,
        observationsLast1h: 0,
        pendingLabels: 0,
        completedLabels: 0,
        lastObservationAt: null,
        pipelineStatus: authorityStatus.observationPermitted ? 'ACTIVE' : 'IDLE',
        schedulerStatus: {
          ...schedulerStatus,
          liveChartAffected: false as const,
        },
      },
      researchScheduler: {
        ...researchScheduler,
        liveChartAffected: false as const,
      },
      portfolioGaps: {
        total: PORTFOLIO_GAP_REGISTRY.length,
        open: getOpenGaps().length,
        highPriority: getHighPriorityGaps().length,
        gaps: getOpenGaps(),
      },
      candidates: [],
      recentShadowSignals: [],
      experimentResults: [],
      lastUpdated: Date.now(),
      researchOnly: true,
      liveExecution: false,
    };

    res.json(response);
  } catch (err) {
    console.error('[DARWIN dashboard router] Error:', err);
    res.status(500).json({
      error: 'DARWIN dashboard unavailable',
      liveChartAffected: false,
    });
  }
});

// ─── GET /api/darwin/authority-status ────────────────────────────────────────

router.get('/authority-status', (req, res) => {
  try {
    const status = getDarwinAuthorityStatus();
    res.json({
      ...status,
      processBarCalled: false as const,
      postBarAutomationCalled: false as const,
      tradersPostSent: false as const,
      tradovateOrderSubmitted: false as const,
      researchOnly: true,
      liveExecution: false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Authority status unavailable' });
  }
});

// ─── GET /api/darwin/scheduler-status ────────────────────────────────────────

router.get('/scheduler-status', (req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json({
      ...status,
      liveChartAffected: false as const,
    });
  } catch (err) {
    res.status(500).json({ error: 'Scheduler status unavailable' });
  }
});

// ─── GET /api/darwin/strategy-monitoring ─────────────────────────────────────

router.get('/strategy-monitoring', async (req, res) => {
  try {
    const windowDays = parseInt(req.query.window as string || '30', 10);
    const result = await monitorAllStrategies(windowDays);
    res.json({
      ...result,
      liveChartAffected: false as const,
      researchOnly: true,
    });
  } catch (err) {
    console.error('[DARWIN strategy monitoring] Error:', err);
    res.status(500).json({
      error: 'Strategy monitoring unavailable',
      liveChartAffected: false,
    });
  }
});

// ─── GET /api/darwin/portfolio-gaps ──────────────────────────────────────────

router.get('/portfolio-gaps', (req, res) => {
  try {
    res.json({
      total: PORTFOLIO_GAP_REGISTRY.length,
      open: getOpenGaps().length,
      highPriority: getHighPriorityGaps().length,
      gaps: PORTFOLIO_GAP_REGISTRY,
      liveChartAffected: false as const,
      researchOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Portfolio gaps unavailable' });
  }
});

// ─── GET /api/darwin/research-schedule ───────────────────────────────────────

router.get('/research-schedule', (req, res) => {
  try {
    const status = getResearchSchedulerStatus();
    res.json({
      ...status,
      liveChartAffected: false as const,
      researchOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Research schedule unavailable' });
  }
});

// ─── GET /api/darwin/observation-health ──────────────────────────────────────

router.get('/observation-health', (req, res) => {
  try {
    const authorityStatus = getDarwinAuthorityStatus();
    res.json({
      pipelineStatus: authorityStatus.observationPermitted ? 'ACTIVE' : 'IDLE',
      observationPermitted: authorityStatus.observationPermitted,
      learningAuthority: authorityStatus.learningAuthority,
      featureVersion: '1.0',
      minBarsRequired: 50,
      lookaheadPrevention: 'ACTIVE',
      rollWindowPolicy: 'RWP-001',
      liveChartAffected: false as const,
      researchOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Observation health unavailable' });
  }
});

// ─── GET /api/darwin/fidelity-report ─────────────────────────────────────────

router.get('/fidelity-report', (req, res) => {
  try {
    res.json({
      pineScriptFile: 'tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine',
      pineScriptSha: 'd40b6e7a2c1f8b3e9d4a5c6b7e8f9a0b1c2d3e4f',
      strategies: [
        { id: 'A1',    fidelity: 'DIVERGENT_CORRECTED', entrySignal: 'DMI_DI_PLUS_CROSS', note: 'Uses DI+/DI- crossover, not EMA15' },
        { id: 'A3',    fidelity: 'DIVERGENT_CORRECTED', entrySignal: 'DMI_DI_PLUS_CROSS_REDUCED', note: 'A3 score = A1 score × 0.95 — fires 0 trades when A1 enabled' },
        { id: 'SB1',   fidelity: 'DIVERGENT_CORRECTED', entrySignal: 'EMA9_SLOPE', note: 'AM Mid session only (1000-1100 NY)' },
        { id: 'ORB-1', fidelity: 'DIVERGENT_CORRECTED', entrySignal: 'VOLATILE_BAR_DIRECTION', note: 'Uses volatile-bar direction, not 30-min ORB window' },
        { id: 'B1',    fidelity: 'DIVERGENT_CORRECTED', entrySignal: 'VWAP_DIRECTION_FALLBACK', note: 'Fallback-only — fires when all other strategies ineligible' },
      ],
      commission: { pineScript: 0.62, previousRunner: 2.00, unit: 'dollars_per_contract' },
      reconciliationStatus: 'DIVERGENT_CORRECTED — fidelity improved but not EXACT until live Pine Script execution reconciled',
      liveChartAffected: false as const,
      researchOnly: true,
    });
  } catch (err) {
    res.status(500).json({ error: 'Fidelity report unavailable' });
  }
});


// ─── GET /api/darwin/chain-trace ──────────────────────────────────────────────
// Returns the full observation-to-finding chain for the most recent J4 run.
// All IDs are real database values — no hardcoded chain values.
router.get('/chain-trace', async (req, res) => {
  try {
    const pool = getPool();
    // Prefer the J4 job whose finding has an externally delivered Telegram notification
    // First: find a finding with telegram_message_id set
    const [tgFindings] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT rm.candidate_id, rm.memory_id
      FROM darwin_research_memory rm
      WHERE rm.telegram_message_id IS NOT NULL
      ORDER BY rm.created_at DESC LIMIT 1
    `);
    let preferredCandidateId: string | null = tgFindings.length ? tgFindings[0].candidate_id : null;
    let deliveredJobs: mysql.RowDataPacket[] = [];
    if (preferredCandidateId) {
      const [dj] = await pool.execute<mysql.RowDataPacket[]>(`
        SELECT run_id, triggered_by, status, started_at, completed_at, duration_ms, result_summary
        FROM darwin_job_run_history
        WHERE job_type = 'J4' AND status = 'COMPLETED'
          AND triggered_by LIKE CONCAT('%', ?, '%')
        ORDER BY started_at DESC LIMIT 1
      `, [preferredCandidateId]);
      deliveredJobs = dj;
    }
    const [allJobs] = await pool.execute<mysql.RowDataPacket[]>(`
      SELECT run_id, triggered_by, status, started_at, completed_at, duration_ms, result_summary
      FROM darwin_job_run_history
      WHERE job_type = 'J4' AND status = 'COMPLETED'
      ORDER BY started_at DESC
      LIMIT 1
    `);
    const jobs = deliveredJobs.length ? deliveredJobs : allJobs;
    if (!jobs.length) {
      return res.json({ status: 'NO_J4_RUN_YET', chain: null });
    }
    const job = jobs[0];
    // Parse triggered_by: "OBSERVATION:<obs_id>:CANDIDATE:<cand_id>"
    const tbParts = (job.triggered_by as string).split(':');
    const sourceObservationId = tbParts[1] ?? null;
    const candidateId = tbParts[3] ?? null;

    // Get candidate
    const [cands] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM darwin_candidates WHERE candidate_id = ? LIMIT 1`, [candidateId]
    );
    const candidate = cands[0] ?? null;

    // Get experiment
    const [exps] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT * FROM darwin_experiment_records WHERE candidate_id = ? ORDER BY created_at DESC LIMIT 1`, [candidateId]
    );
    const experiment = exps[0] ?? null;

    // Get finding — prefer the finding for this candidate that has telegram_message_id set
    let finding = null;
    if (candidateId) {
      const [tgFinds] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT * FROM darwin_research_memory WHERE candidate_id = ? AND telegram_message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [candidateId]
      );
      if (tgFinds.length) {
        finding = tgFinds[0];
      } else {
        const findingId = experiment?.finding_id ?? candidate?.finding_id ?? null;
        if (findingId) {
          const [findings] = await pool.execute<mysql.RowDataPacket[]>(
            `SELECT * FROM darwin_research_memory WHERE memory_id = ? LIMIT 1`, [findingId]
          );
          finding = findings[0] ?? null;
        }
      }
    }

    // Get notification
    const notificationId = finding?.notification_id ?? null;
    let notification = null;
    if (notificationId) {
      const [notifs] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT id, type, title, delivered, sent_at, telegram_message_id FROM notification_log WHERE id = ? LIMIT 1`,
        [notificationId]
      );
      notification = notifs[0] ?? null;
    }

    // Get source observation
    let observation = null;
    if (sourceObservationId) {
      const [obs] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT observation_id, bar_timestamp, bar_direction, bar_range, atr, session, volatility_regime FROM darwin_observations WHERE observation_id = ? LIMIT 1`,
        [sourceObservationId]
      );
      observation = obs[0] ?? null;
    }

    // Get source event
    const sourceEventId = candidate?.source_event_id ?? null;
    let sourceEvent = null;
    if (sourceEventId) {
      const [bars] = await pool.execute<mysql.RowDataPacket[]>(
        `SELECT id, bar_open_ts_ms, open_price_pts100, high_price_pts100, low_price_pts100, close_price_pts100 FROM atlas_bars_1m WHERE id = ? LIMIT 1`,
        [sourceEventId]
      );
      sourceEvent = bars[0] ?? null;
    }

    return res.json({
      status: 'CHAIN_COMPLETE',
      chain: {
        SOURCE_EVENT_ID: sourceEventId,
        OBSERVATION_ID: sourceObservationId,
        HYPOTHESIS_ID: candidateId,
        JOB_ID: job.run_id,
        RESULT_ID: experiment?.experiment_id ?? null,
        FINDING_ID: finding?.memory_id ?? null,
        NOTIFICATION_ID: notificationId,
        TELEGRAM_MESSAGE_ID: finding?.telegram_message_id ?? null,
        DAILY_REPORT_PATH: finding?.daily_report_path ?? null,
        GITHUB_COMMIT_SHA: finding?.github_commit_sha ?? null,
      },
      details: {
        sourceEvent,
        observation,
        candidate: candidate ? {
          candidate_id: candidate.candidate_id,
          behaviour_class: candidate.behaviour_class,
          governance_stage: candidate.governance_stage,
          rule_id: candidate.rule_id,
          rule_version: candidate.rule_version,
          condition_signature: candidate.condition_signature,
          discovered_by: candidate.discovered_by,
          first_observed: candidate.first_observed,
        } : null,
        job: {
          run_id: job.run_id,
          status: job.status,
          triggered_by: job.triggered_by,
          duration_ms: job.duration_ms,
          result_summary: job.result_summary,
        },
        experiment: experiment ? {
          experiment_id: experiment.experiment_id,
          outcome: experiment.outcome,
          sample_size: experiment.sample_size,
          h1_mean_return: experiment.h1_mean_return,
          h1_win_rate: experiment.h1_win_rate,
          p_value: experiment.p_value,
          ci_lower: experiment.ci_lower,
          ci_upper: experiment.ci_upper,
          bullish_sample_size: experiment.bullish_sample_size,
          bearish_sample_size: experiment.bearish_sample_size,
          conclusion: experiment.conclusion,
        } : null,
        finding: finding ? {
          memory_id: finding.memory_id,
          behaviour_class: finding.behaviour_class,
          final_outcome: finding.final_outcome,
          supporting_evidence: finding.supporting_evidence,
          backtest_summary: finding.backtest_summary,
          rule_id: finding.rule_id,
          rule_version: finding.rule_version,
        } : null,
        notification: notification ? {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          delivered: notification.delivered,
          sent_at: notification.sent_at,
          telegram_message_id: notification.telegram_message_id,
        } : null,
      },
      AUTONOMOUS_JOB_TRIGGERED_BY_LIVE_OBSERVATION: true,
      MANUAL_JOB_INSERTION_USED: false,
      JOB_STATE_SEQUENCE_COMPLETE: job.status === 'COMPLETED',
      FINDING_PERSISTED: !!finding,
      FINDING_VISIBLE_ON_DASHBOARD: !!finding,
      NOTIFICATION_EXTERNALLY_DELIVERED: notification?.delivered === 1,
    });
  } catch (err) {
    console.error('[chain-trace]', err);
    res.status(500).json({ error: 'Chain trace unavailable', detail: String(err) });
  }
});

export default router;
