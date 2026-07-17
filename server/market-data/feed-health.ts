/**
 * Atlas Feed Health Monitor
 *
 * Implements the 6-state feed health state machine for monitoring DataBento
 * and TradingView M-16 feed health. Emits AtlasFeedHealthEvent on every
 * state transition.
 *
 * States:
 *   UNKNOWN → CONNECTED → DEGRADED → RECONNECTING → FALLBACK_ACTIVE → OFFLINE
 *
 * Design: ADR-008 — Dual-feed failover architecture
 *
 * Sprint 121 — Atlas Market Data Platform
 */

import {
  FeedHealthState,
  DataSource,
  AtlasFeedHealthEvent,
  ATLAS_EVENT_CHANNELS,
} from '../../shared/types/market-events.js';
import { AtlasEventBus } from './event-bus.js';

// ── Feed health entry ─────────────────────────────────────────────────────────

interface FeedHealthEntry {
  source: DataSource;
  state: FeedHealthState;
  lastMessageTs: number;
  reconnectAttempts: number;
  lastTransitionTs: number;
  lastError: string | null;
}

// ── Feed health monitor class ─────────────────────────────────────────────────

export class FeedHealthMonitor {
  private feeds: Map<DataSource, FeedHealthEntry> = new Map();

  constructor(private readonly eventBus: AtlasEventBus) {}

  /**
   * Register a feed source. Must be called before any state transitions.
   */
  registerFeed(source: DataSource): void {
    this.feeds.set(source, {
      source,
      state: 'UNKNOWN',
      lastMessageTs: 0,
      reconnectAttempts: 0,
      lastTransitionTs: Date.now(),
      lastError: null,
    });
  }

  /**
   * Record a message received from a feed source.
   * Transitions DEGRADED → CONNECTED if applicable.
   */
  recordMessage(source: DataSource, tsMs: number): void {
    const entry = this.getOrCreate(source);
    entry.lastMessageTs = tsMs;

    if (entry.state === 'DEGRADED' || entry.state === 'RECONNECTING') {
      this.transition(source, 'CONNECTED', 'Message received after degradation');
    }
  }

  /**
   * Mark a feed as CONNECTED.
   */
  setConnected(source: DataSource): void {
    const entry = this.getOrCreate(source);
    entry.reconnectAttempts = 0;
    entry.lastError = null;
    this.transition(source, 'CONNECTED', 'Connection established');
  }

  /**
   * Mark a feed as DEGRADED (messages arriving but slowly).
   */
  setDegraded(source: DataSource, silenceMs: number): void {
    this.transition(source, 'DEGRADED', `No messages for ${silenceMs}ms`);
  }

  /**
   * Mark a feed as RECONNECTING.
   */
  setDisconnected(source: DataSource, reason: string): void {
    const entry = this.getOrCreate(source);
    entry.reconnectAttempts++;
    this.transition(source, 'RECONNECTING', reason);
  }

  /**
   * Mark a feed as having an error.
   */
  setError(source: DataSource, error: string): void {
    const entry = this.getOrCreate(source);
    entry.lastError = error;
    this.transition(source, 'RECONNECTING', `Error: ${error}`);
  }

  /**
   * Mark the fallback as active (primary feed has failed multiple times).
   */
  setFallbackActive(source: DataSource): void {
    this.transition(source, 'FALLBACK_ACTIVE', 'Maximum reconnection attempts exceeded');
  }

  /**
   * Mark a feed as OFFLINE (manual shutdown or maintenance).
   */
  setOffline(source: DataSource, reason: string): void {
    this.transition(source, 'OFFLINE', reason);
  }

  /**
   * Get the current health state of a feed.
   */
  getState(source: DataSource): FeedHealthState {
    return this.feeds.get(source)?.state ?? 'UNKNOWN';
  }

  /**
   * Get the full health entry for a feed.
   */
  getEntry(source: DataSource): FeedHealthEntry | undefined {
    return this.feeds.get(source);
  }

  /**
   * Get all feed health entries.
   */
  getAllEntries(): FeedHealthEntry[] {
    return Array.from(this.feeds.values());
  }

  /**
   * Determine if the primary DataBento feed is healthy.
   */
  isPrimaryHealthy(): boolean {
    const state = this.getState('databento');
    return state === 'CONNECTED';
  }

  /**
   * Determine if the fallback TradingView feed should be active.
   */
  isFallbackActive(): boolean {
    const state = this.getState('databento');
    return state === 'FALLBACK_ACTIVE' || state === 'OFFLINE';
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private transition(source: DataSource, newState: FeedHealthState, reason: string): void {
    const entry = this.getOrCreate(source);
    const previousState = entry.state;

    if (previousState === newState) return; // No-op if same state

    entry.state = newState;
    entry.lastTransitionTs = Date.now();

    const event: AtlasFeedHealthEvent = {
      type: 'feed_health',
      source,
      state: newState,
      previousState,
      reason,
      atlasTs: Date.now(),
      silenceMs: entry.lastMessageTs > 0 ? Date.now() - entry.lastMessageTs : undefined,
      reconnectAttempt: entry.reconnectAttempts > 0 ? entry.reconnectAttempts : undefined,
    };

    console.log(`[FeedHealth] ${source}: ${previousState} → ${newState} (${reason})`);
    this.eventBus.emitFeedHealth(event);
  }

  private getOrCreate(source: DataSource): FeedHealthEntry {
    if (!this.feeds.has(source)) {
      this.registerFeed(source);
    }
    return this.feeds.get(source)!;
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

// Note: singleton is created in market-data/index.ts to avoid circular deps
