import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { Router } from "express";
import { registerNexusRoutes } from "../nexusRoutes";
import { registerScheduledJobs } from "../scheduledJobs";

// ── Sprint 123A.4 — Market Data Pipeline ─────────────────────────────────────
import mysql from "mysql2/promise";
import { atlasEventBus, feedHealthMonitor } from "../market-data/index.js";
import { ContractManager } from "../market-data/contract-manager.js";
import { TradeBarBuilder } from "../market-data/trade-bar-builder.js";
import { BarReconciler } from "../market-data/bar-reconciler.js";
import { GapRecoveryOrchestrator } from "../market-data/gap-recovery-orchestrator.js";
import { FiveMinAggregator, WindowAccumulator } from "../market-data/five-min-aggregator.js";
import { MySQLBarDatabaseAdapter, BarPersistence } from "../market-data/bar-persistence.js";
import { ChartStreamService } from "../market-data/chart-stream-service.js";
import { ChartHistoryService } from "../market-data/chart-history-service.js";
import { ParityService } from "../market-data/parity-service.js";
import { MarketDataRuntimeOrchestrator } from "../market-data/runtime-orchestrator.js";
import { createBridgeServer } from "../market-data/bridge-server.js";
import { createMarketDataRouter } from "../market-data/market-data-router.js";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Sprint 123A.4 — Wire the full Databento shadow pipeline.
 *
 * Authority boundary:
 *   TRADINGVIEW_ONLY  → bridge disabled, orchestrator is a no-op
 *   DATABENTO_SHADOW  → bridge + orchestrator + persistence active (Gate G3 approved)
 *   DATABENTO_CHART_AUTHORITY → requires ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true (Gate G4)
 *
 * This function MUST NOT:
 *   - call processBar / postBarAutomation / ADE / strategies
 *   - activate DATABENTO_CHART_AUTHORITY without the Gate G4 flag
 *
 * Returns the market-data Express Router for mounting at /api/market-data.
 */
async function createMarketDataPipeline(pool: mysql.Pool): Promise<Router> {
  // ── 1. Persistence adapter ────────────────────────────────────────────────
  const mysqlAdapter = new MySQLBarDatabaseAdapter(pool);
  const barDb = new BarPersistence(mysqlAdapter, 'v1');

  // ── 2. Chart services ─────────────────────────────────────────────────────
  const chartStream = new ChartStreamService();
  const historyService = new ChartHistoryService(pool);
  const parityService = new ParityService();

  // ── 3. Bar pipeline components ────────────────────────────────────────────
  const contractManager = new ContractManager();

  // Bootstrap config — dataset/rawSymbol/instrumentId are overridden by the
  // first definition record sent by the Python adapter (GLBX.MDP3 / MNQ.v.0 / 0
  // are safe placeholders that will never be persisted before the real values arrive).
  const tradeBarBuilder = new TradeBarBuilder({
    dataset: process.env.BRIDGE_DATASET ?? 'GLBX.MDP3',
    rawSymbol: process.env.BRIDGE_RAW_SYMBOL ?? 'MNQ.v.0',
    instrumentId: parseInt(process.env.BRIDGE_INSTRUMENT_ID ?? '0', 10),
  });

  const barReconciler = new BarReconciler();
  const fiveMinAggregator = new FiveMinAggregator();
  const windowAccumulator = new WindowAccumulator(fiveMinAggregator);

  const gapRecovery = new GapRecoveryOrchestrator({
    // Inject recovered bars back into the TradeBarBuilder as official ohlcv-1m records
    onRecoveredBar: (payload) => {
      tradeBarBuilder.processOfficialOhlcv1m(payload);
    },
    // When a recovery window completes, the recovered bars have already been
    // injected via onRecoveredBar → tradeBarBuilder → bar:confirmed events.
    // No additional action needed here; the WindowAccumulator handles the
    // BLOCKED_UNRESOLVED → EMITTED transition automatically via addBar().
    onRecoveryComplete: (_result) => {
      // no-op: recovery bars flow through tradeBarBuilder → bar:confirmed
    },
  });

  // ── 4. Runtime orchestrator ───────────────────────────────────────────────
  const orchestrator = new MarketDataRuntimeOrchestrator({
    eventBus: atlasEventBus,
    feedHealth: feedHealthMonitor,
    contractManager,
    tradeBarBuilder,
    barReconciler,
    gapRecovery,
    windowAccumulator,
    barDb,
    chartStream,
  });

  // ── 5. Bridge server ──────────────────────────────────────────────────────
  // createBridgeServer returns null if BRIDGE_AUTH_TOKEN is not set.
  // In TRADINGVIEW_ONLY mode the bridge is disabled and the orchestrator
  // start() call is a no-op — no records will flow.
  const bridgeServer = createBridgeServer(atlasEventBus, feedHealthMonitor);

  // ── 6. Start pipeline ─────────────────────────────────────────────────────
  orchestrator.start();
  if (bridgeServer) {
    bridgeServer.start();
  }

  // ── 7. Market-data Express router ────────────────────────────────────────
  return createMarketDataRouter(historyService, chartStream, parityService, orchestrator);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ── Sprint 123A.4 — Market Data Pipeline ──────────────────────────────────
  // Create a shared mysql2 pool from DATABASE_URL for the market-data pipeline.
  // The pool is shared between MySQLBarDatabaseAdapter and ChartHistoryService.
  let marketDataRouter: Router | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const dbUrl = new URL(process.env.DATABASE_URL);
      const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: decodeURIComponent(dbUrl.password),
        database: dbUrl.pathname.slice(1),
        port: parseInt(dbUrl.port || '3306', 10),
        waitForConnections: true,
        connectionLimit: 10,
      });
      marketDataRouter = await createMarketDataPipeline(pool);
      console.log('[MarketData] Pipeline wired successfully.');
    } catch (err) {
      console.error('[MarketData] Failed to wire pipeline — market-data routes will be unavailable:', err);
    }
  } else {
    console.warn('[MarketData] DATABASE_URL not set — market-data pipeline disabled.');
  }

  // Atlas Nexus raw API routes
  const nexusRouter = Router();
  registerNexusRoutes(nexusRouter);
  app.use("/api", nexusRouter);

  // ── /api/market-data routes (Sprint 123A.4) ───────────────────────────────
  if (marketDataRouter) {
    app.use("/api/market-data", marketDataRouter);
    console.log('[MarketData] Routes mounted at /api/market-data');
  }

  // Atlas scheduled job endpoints (must be before Vite/static fallthrough)
  registerScheduledJobs(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
