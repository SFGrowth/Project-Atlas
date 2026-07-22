/**
 * DARWIN Research Dashboard Router — Sprint 123A.6 / Gate G6A
 *
 * Provides read-only research data to the DARWIN dashboard.
 * No actions here affect live trading.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { Router } from 'express';
import { getDarwinAuthorityStatus } from '../market-data/darwin-authority.js';
import { getSchedulerStatus } from './darwin-resource-scheduler.js';

const router = Router();

// ─── GET /api/darwin/research-dashboard ──────────────────────────────────────

router.get('/research-dashboard', async (req, res) => {
  try {
    const authorityStatus = getDarwinAuthorityStatus();
    const schedulerStatus = getSchedulerStatus();

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

export default router;
