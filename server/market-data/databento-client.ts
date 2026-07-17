/**
 * DataBento Live TCP Client
 *
 * Implements the DataBento Raw TCP API for the GLBX.MDP3 MBP-1 live feed.
 * Uses challenge-response authentication (HMAC-SHA256) — the API key is
 * never transmitted over the network.
 *
 * SPRINT 121 NOTE: This client is instantiated but NOT started.
 * The `start()` method is a no-op in Sprint 121 (DATABENTO_ENABLED=false).
 * The client will be activated in Sprint 122 (shadow mode).
 *
 * Reference: https://databento.com/docs/api-reference-live
 *
 * Sprint 121 — Atlas Market Data Platform
 */

import * as net from 'net';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { DbnParser, ParsedMbp1Record, ParsedSymbolMappingMsg } from './dbn-parser.js';
import { EventNormalizer } from './event-normalizer.js';
import { SymbolRegistry } from './symbol-registry.js';
import { AtlasEventBus } from './event-bus.js';
import { FeedHealthMonitor } from './feed-health.js';
import { GapDetector } from './gap-detector.js';
import { ATLAS_EVENT_CHANNELS } from '../../shared/types/market-events.js';

// ── DataBento connection constants ────────────────────────────────────────────

const DATABENTO_HOST = 'live.databento.com';
const DATABENTO_PORT = 13000;
const DATABENTO_DATASET = 'GLBX.MDP3';
const DATABENTO_SCHEMA = 'mbp-1';
const DATABENTO_ENCODING = 'dbn';

/** Maximum reconnection delay in milliseconds (60 seconds) */
const MAX_RECONNECT_DELAY_MS = 60_000;

/** Initial reconnection delay in milliseconds */
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/** Maximum reconnection attempts before activating fallback */
const MAX_RECONNECT_ATTEMPTS_BEFORE_FALLBACK = 3;

// ── Client configuration ──────────────────────────────────────────────────────

export interface DatabentoClientConfig {
  /** DataBento API key (from DATABENTO_API_KEY env var) */
  apiKey: string;

  /** Symbols to subscribe to (e.g. ["MNQ.v.0"]) */
  symbols: string[];

  /** Whether to start the client immediately (false in Sprint 121) */
  enabled: boolean;

  /** Start timestamp for replay (undefined = live, 0 = session start) */
  startTs?: number;
}

// ── Client state ──────────────────────────────────────────────────────────────

type ClientState = 'idle' | 'connecting' | 'authenticating' | 'subscribing' | 'live' | 'reconnecting' | 'stopped';

// ── DataBento client class ────────────────────────────────────────────────────

export class DatabentoClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser: DbnParser;
  private state: ClientState = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageTs = 0;

  constructor(
    private readonly config: DatabentoClientConfig,
    private readonly normalizer: EventNormalizer,
    private readonly symbolRegistry: SymbolRegistry,
    private readonly eventBus: AtlasEventBus,
    private readonly feedHealth: FeedHealthMonitor,
    private readonly gapDetector: GapDetector,
  ) {
    super();
    this.parser = new DbnParser();
    this.setupParserHandlers();
  }

  /**
   * Start the DataBento client.
   * In Sprint 121, this is a no-op if config.enabled === false.
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[DatabentoClient] Sprint 121: client is disabled (DATABENTO_ENABLED=false). No live connection.');
      return;
    }

    if (this.state !== 'idle') {
      console.warn('[DatabentoClient] start() called while not idle, state:', this.state);
      return;
    }

    console.log('[DatabentoClient] Starting live connection to DataBento...');
    this.connect();
  }

  /**
   * Stop the DataBento client and clean up resources.
   */
  stop(): void {
    console.log('[DatabentoClient] Stopping...');
    this.state = 'stopped';
    this.clearTimers();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.parser.reset();
  }

  /** Get the current client state */
  getState(): ClientState {
    return this.state;
  }

  /** Get milliseconds since the last message was received */
  getSilenceMs(): number {
    if (this.lastMessageTs === 0) return Infinity;
    return Date.now() - this.lastMessageTs;
  }

  // ── Private connection logic ────────────────────────────────────────────────

  private connect(): void {
    if (this.state === 'stopped') return;

    this.state = 'connecting';
    this.parser.reset();

    console.log(`[DatabentoClient] Connecting to ${DATABENTO_HOST}:${DATABENTO_PORT}...`);

    this.socket = new net.Socket();

    this.socket.on('connect', () => this.onConnect());
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk));
    this.socket.on('close', () => this.onClose());
    this.socket.on('error', (err: Error) => this.onError(err));
    this.socket.setTimeout(30_000);
    this.socket.on('timeout', () => {
      console.warn('[DatabentoClient] Socket timeout');
      this.socket?.destroy();
    });

    this.socket.connect(DATABENTO_PORT, DATABENTO_HOST);
  }

  private onConnect(): void {
    console.log('[DatabentoClient] TCP connected');
    this.state = 'authenticating';
    this.reconnectAttempts = 0;
    // Authentication is challenge-response: wait for server challenge
  }

  private onData(chunk: Buffer): void {
    this.lastMessageTs = Date.now();
    this.feedHealth.recordMessage('databento', this.lastMessageTs);

    if (this.state === 'authenticating') {
      this.handleAuthChallenge(chunk);
      return;
    }

    if (this.state === 'subscribing') {
      this.handleSubscribeResponse(chunk);
      return;
    }

    // Normal live data — push to DBN parser
    this.parser.push(chunk);
  }

  private handleAuthChallenge(chunk: Buffer): void {
    // DataBento challenge format: "lsg-challenge <challenge_string>\n"
    const msg = chunk.toString('ascii').trim();
    const match = msg.match(/^lsg-challenge\s+(\S+)$/);

    if (!match) {
      console.error('[DatabentoClient] Unexpected auth challenge format:', msg);
      this.socket?.destroy();
      return;
    }

    const challenge = match[1];
    console.log('[DatabentoClient] Received auth challenge, computing HMAC response...');

    // HMAC-SHA256(challenge, apiKey) — key is never transmitted
    const hmac = crypto.createHmac('sha256', this.config.apiKey);
    hmac.update(challenge);
    const response = hmac.digest('hex');

    // Send auth response: "auth <response>|<dataset>\n"
    const authMsg = `auth ${response}|${DATABENTO_DATASET}\n`;
    this.socket?.write(authMsg);
  }

  private handleSubscribeResponse(chunk: Buffer): void {
    const msg = chunk.toString('ascii').trim();

    if (msg.includes('success')) {
      console.log('[DatabentoClient] Authenticated successfully');
      this.sendSubscription();
    } else if (msg.includes('error') || msg.includes('fail')) {
      console.error('[DatabentoClient] Authentication failed:', msg);
      this.feedHealth.setError('databento', 'Authentication failed');
      this.socket?.destroy();
    } else {
      // May be subscription confirmation — check for "session_start"
      if (msg.includes('session_start') || msg.length === 0) {
        console.log('[DatabentoClient] Subscription confirmed, entering live mode');
        this.state = 'live';
        this.feedHealth.setConnected('databento');
        this.startHeartbeatMonitor();
      }
    }
  }

  private sendSubscription(): void {
    this.state = 'subscribing';

    const startParam = this.config.startTs !== undefined
      ? `|start=${this.config.startTs}`
      : '';

    // Subscribe: "sub <symbols>|schema=<schema>|encoding=<encoding>|start=<ts>\n"
    const subMsg = `sub ${this.config.symbols.join(',')}|schema=${DATABENTO_SCHEMA}|encoding=${DATABENTO_ENCODING}${startParam}\n`;
    console.log('[DatabentoClient] Sending subscription:', subMsg.trim());
    this.socket?.write(subMsg);
  }

  private onClose(): void {
    if (this.state === 'stopped') return;

    console.warn('[DatabentoClient] Connection closed');
    this.clearTimers();
    this.feedHealth.setDisconnected('databento', 'TCP socket closed');
    this.scheduleReconnect();
  }

  private onError(err: Error): void {
    console.error('[DatabentoClient] Socket error:', err.message);
    this.feedHealth.setError('databento', err.message);
  }

  private scheduleReconnect(): void {
    if (this.state === 'stopped') return;

    this.reconnectAttempts++;
    this.state = 'reconnecting';

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS_BEFORE_FALLBACK) {
      console.warn(`[DatabentoClient] ${this.reconnectAttempts} failed attempts — activating M-16 fallback`);
      this.feedHealth.setFallbackActive('databento');
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    );

    console.log(`[DatabentoClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      if (this.state !== 'stopped') {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const silenceMs = this.getSilenceMs();

      if (silenceMs > 120_000) {
        console.warn(`[DatabentoClient] No messages for ${silenceMs}ms — reconnecting`);
        this.socket?.destroy();
      } else if (silenceMs > 30_000) {
        console.warn(`[DatabentoClient] No messages for ${silenceMs}ms — DEGRADED`);
        this.feedHealth.setDegraded('databento', silenceMs);
      }
    }, 10_000); // Check every 10 seconds
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setupParserHandlers(): void {
    this.parser.on('mbp1', (record: unknown) => {
      const r = record as ParsedMbp1Record;
      const { trade, quote } = this.normalizer.normalizeMbp1(r);

      if (trade) {
        this.gapDetector.checkSequence(r.sequence);
        this.eventBus.emit(ATLAS_EVENT_CHANNELS.TRADE, trade);
      }

      if (quote) {
        this.eventBus.emit(ATLAS_EVENT_CHANNELS.QUOTE, quote);
      }
    });

    this.parser.on('symbolMapping', (msg: unknown) => {
      const m = msg as ParsedSymbolMappingMsg;
      const event = this.normalizer.normalizeSymbolMapping(m);
      this.symbolRegistry.processSymbolMapping(event);
      this.eventBus.emit(ATLAS_EVENT_CHANNELS.SYMBOL_MAPPING, event);
      console.log(`[DatabentoClient] Symbol mapping: ${m.stype_out_symbol} → instrument_id=${m.instrumentId}`);
    });

    this.parser.on('error', (err: unknown) => {
      console.error('[DatabentoClient] Parser error:', err instanceof Error ? err.message : String(err));
    });
  }
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * Create a DatabentoClient from environment variables.
 * In Sprint 121, enabled=false so no live connection is made.
 */
export function createDatabentoClient(
  symbolRegistry: SymbolRegistry,
  eventBus: AtlasEventBus,
  feedHealth: FeedHealthMonitor,
  gapDetector: GapDetector,
): DatabentoClient {
  const apiKey = process.env.DATABENTO_API_KEY ?? '';
  const enabled = process.env.DATABENTO_ENABLED === 'true';

  if (!apiKey) {
    console.warn('[DatabentoClient] DATABENTO_API_KEY not set — client will not connect');
  }

  const normalizer = new EventNormalizer(symbolRegistry);

  const config: DatabentoClientConfig = {
    apiKey,
    symbols: ['MNQ.v.0'],
    enabled,
  };

  return new DatabentoClient(config, normalizer, symbolRegistry, eventBus, feedHealth, gapDetector);
}

// Re-export for convenience
export { MNQ_SPEC } from './symbol-registry.js';

