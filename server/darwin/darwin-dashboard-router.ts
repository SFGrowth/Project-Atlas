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

export default router;
