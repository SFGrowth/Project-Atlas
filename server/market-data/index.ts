/**
 * Atlas Market Data Module — Entry Point
 *
 * Wires all market data components together and exports the singletons.
 * This is the only file that should be imported by the rest of the server.
 *
 * Sprint 121 — Atlas Market Data Platform
 * SPRINT 121 NOTE: DataBento client is instantiated but NOT started.
 * Call marketData.start() in Sprint 122 to activate the live feed.
 */

import { AtlasEventBus, atlasEventBus } from './event-bus.js';
import { FeedHealthMonitor } from './feed-health.js';
import { GapDetector } from './gap-detector.js';
import { SymbolRegistry, symbolRegistry } from './symbol-registry.js';
import { EventNormalizer } from './event-normalizer.js';
import { DatabentoClient, createDatabentoClient } from './databento-client.js';

// ── Singleton instances ───────────────────────────────────────────────────────

export const feedHealthMonitor = new FeedHealthMonitor(atlasEventBus);
export const gapDetector = new GapDetector();

// Register known feed sources
feedHealthMonitor.registerFeed('databento');
feedHealthMonitor.registerFeed('tradingview');

// Create the DataBento client (not started in Sprint 121)
export const databentoClient = createDatabentoClient(
  symbolRegistry,
  atlasEventBus,
  feedHealthMonitor,
  gapDetector,
);

// ── Market data facade ────────────────────────────────────────────────────────

export const marketData = {
  /**
   * Start the market data system.
   * In Sprint 121, this is a no-op (DATABENTO_ENABLED is not set).
   * In Sprint 122+, this activates the DataBento live feed.
   */
  start(): void {
    console.log('[MarketData] Starting market data system...');
    databentoClient.start();
  },

  /**
   * Stop the market data system cleanly.
   */
  stop(): void {
    console.log('[MarketData] Stopping market data system...');
    databentoClient.stop();
  },

  /** Get the event bus for subscribing to market events */
  get bus(): AtlasEventBus {
    return atlasEventBus;
  },

  /** Get the symbol registry */
  get symbols(): SymbolRegistry {
    return symbolRegistry;
  },

  /** Get the feed health monitor */
  get health(): FeedHealthMonitor {
    return feedHealthMonitor;
  },

  /** Get the gap detector */
  get gaps(): GapDetector {
    return gapDetector;
  },
};

// ── Re-exports ────────────────────────────────────────────────────────────────

export { atlasEventBus } from './event-bus.js';
export { symbolRegistry } from './symbol-registry.js';
export type { AtlasEventBus } from './event-bus.js';
export type { FeedHealthMonitor } from './feed-health.js';
export type { GapDetector } from './gap-detector.js';
export type { SymbolRegistry } from './symbol-registry.js';
export type { DatabentoClient } from './databento-client.js';
export type { EventNormalizer } from './event-normalizer.js';
