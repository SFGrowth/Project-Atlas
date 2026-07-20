/**
 * Atlas Market Data Router
 * Sprint 123A.4 — Live Chart and Databento Shadow Integration
 *
 * Provides authenticated REST and SSE endpoints for the Atlas live chart.
 *
 * ENDPOINTS
 * ---------
 *   GET /api/market-data/bars
 *     Query confirmed historical bars.
 *     Auth: session cookie (sdk.authenticateRequest)
 *     Params: symbol, interval, startTsMs, endTsMs, limit?, cursor?
 *
 *   GET /api/market-data/stream
 *     SSE stream of live confirmed bars, developing bars, and health events.
 *     Auth: session cookie (sdk.authenticateRequest)
 *     Headers: Last-Event-ID (for reconnect cursor)
 *
 *   GET /api/market-data/health
 *     Orchestrator and parity health. Auth: session cookie.
 *
 *   GET /api/market-data/parity
 *     TradingView-Databento parity metrics. Auth: session cookie.
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * These endpoints are READ-ONLY. They MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - expose DATABENTO_API_KEY or BRIDGE_AUTH_TOKEN
 *   - activate any authority mode
 *
 * Sprint 123A.4 — Gate G3 Approved
 */

import { Router, Request, Response } from 'express';
import { sdk } from '../_core/sdk.js';
import { ChartHistoryService, ValidationError } from './chart-history-service.js';
import { ChartStreamService } from './chart-stream-service.js';
import { ParityService } from './parity-service.js';
import type { MarketDataRuntimeOrchestrator } from './runtime-orchestrator.js';
import { isDatabentoShadow, isDatabentoChartAuthorityActive } from './config.js';

// ─── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req: Request, res: Response): Promise<boolean> {
  try {
    await sdk.authenticateRequest(req);
    return true;
  } catch {
    res.status(401).json({
      error: 'Unauthorised',
      code: 'AUTH_REQUIRED',
      message: 'Valid session required to access market data endpoints.',
    });
    return false;
  }
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function createMarketDataRouter(
  historyService: ChartHistoryService,
  streamService: ChartStreamService,
  parityService: ParityService,
  orchestrator: MarketDataRuntimeOrchestrator,
): Router {
  const router = Router();

  // ── GET /api/market-data/bars ─────────────────────────────────────────────
  router.get('/bars', async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    // Only available in DATABENTO_SHADOW or DATABENTO_CHART_AUTHORITY (G4 flag required)
    if (!isDatabentoShadow() && !isDatabentoChartAuthorityActive()) {
      res.status(503).json({
        error: 'Service unavailable',
        code: 'DATABENTO_REQUIRED',
        message: 'Historical Databento bars require DATABENTO_SHADOW or DATABENTO_CHART_AUTHORITY mode.',
      });
      return;
    }

    try {
      const {
        symbol,
        interval,
        startTsMs,
        endTsMs,
        limit,
        cursor,
      } = req.query as Record<string, string>;

      const response = await historyService.query({
        symbol,
        interval: interval as '1m' | '5m',
        startTsMs: Number(startTsMs),
        endTsMs: Number(endTsMs),
        limit: limit !== undefined ? Number(limit) : undefined,
        cursor: cursor !== undefined ? Number(cursor) : undefined,
      });

      res.json(response);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({
          error: 'Bad request',
          code: 'VALIDATION_ERROR',
          message: err.message,
        });
        return;
      }
      console.error('[MarketDataRouter] /bars error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'QUERY_ERROR',
        message: 'Failed to query historical bars.',
      });
    }
  });

  // ── GET /api/market-data/stream (SSE) ─────────────────────────────────────
  router.get('/stream', async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    // Only available in DATABENTO_SHADOW or DATABENTO_CHART_AUTHORITY (G4 flag required)
    if (!isDatabentoShadow() && !isDatabentoChartAuthorityActive()) {
      res.status(503).json({
        error: 'Service unavailable',
        code: 'DATABENTO_REQUIRED',
        message: 'Live chart stream requires DATABENTO_SHADOW or DATABENTO_CHART_AUTHORITY mode.',
      });
      return;
    }

    // Option B: accept afterEventId query param as cursor (client-controlled reconnect)
    // This is more reliable than relying on the browser to send Last-Event-ID automatically
    // because EventSource does not allow application code to set custom headers.
    const afterEventId = req.query['afterEventId'];
    if (afterEventId && typeof afterEventId === 'string' && !req.headers['last-event-id']) {
      req.headers['last-event-id'] = afterEventId;
    }

    // Register SSE client — handles headers, replay, and disconnect
    streamService.registerClient(req, res);
  });

  // ── GET /api/market-data/health ───────────────────────────────────────────
  router.get('/health', async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    const health = orchestrator.getHealth();
    const parityMetrics = parityService.getMetrics();

    res.json({
      orchestrator: health,
      parity: parityMetrics,
      streamClients: streamService.getClientCount(),
      ringBufferSize: streamService.getRingBufferSize(),
      sequence: streamService.getSequence(),
      requestedAt: Date.now(),
    });
  });

  // ── GET /api/market-data/parity ───────────────────────────────────────────
  router.get('/parity', async (req: Request, res: Response) => {
    if (!(await requireAuth(req, res))) return;

    if (!isDatabentoShadow() && !isDatabentoChartAuthorityActive()) {
      res.status(503).json({
        error: 'Service unavailable',
        code: 'DATABENTO_REQUIRED',
        message: 'Parity metrics require DATABENTO_SHADOW or DATABENTO_CHART_AUTHORITY mode.',
      });
      return;
    }

    res.json({
      ...parityService.getMetrics(),
      requestedAt: Date.now(),
    });
  });

  return router;
}
