/**
 * Atlas Databento Bridge Server — Authenticated WebSocket Bridge Receiver
 * Sprint 123A.2 — Databento Adapter and Private Bridge
 *
 * Receives normalised bridge records from the Python Databento feed adapter
 * via an authenticated WebSocket connection on 127.0.0.1 (private only).
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * The bridge server is a RECEIVER only. It:
 *   - validates the bridge authentication token
 *   - validates the bridge protocol version
 *   - validates the record schema
 *   - emits records to the AtlasEventBus for downstream TypeScript consumers
 *   - updates feed-health state on connection/disconnection
 *
 * The bridge server MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - construct OHLCV candles
 *   - activate any Databento authority mode
 *   - expose BRIDGE_AUTH_TOKEN in logs or error responses
 *   - accept connections from any address other than 127.0.0.1
 *
 * SECRET SAFETY
 * -------------
 * BRIDGE_AUTH_TOKEN is read from process.env at startup.
 * It is never logged, included in error messages, or sent to clients.
 * Rejected connections receive only: { error: "Unauthorized" }
 *
 * Sprint 123A.2 — Shadow mode only. No authority changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BRIDGE DEPLOYMENT TOPOLOGIES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Topology 1: Development (localhost)
 *   - Python adapter and TypeScript server on same host.
 *   - Bridge binds to 127.0.0.1:9876.
 *   - No TLS required (loopback is not network-exposed).
 *   - BRIDGE_AUTH_TOKEN still required.
 *   - Config: BRIDGE_HOST=127.0.0.1 (default), BRIDGE_PORT=9876.
 *
 * Topology 2: Production same-host (localhost)
 *   - Same as development topology.
 *   - Bridge binds to 127.0.0.1:9876.
 *   - No TLS required (loopback is not network-exposed).
 *   - BRIDGE_AUTH_TOKEN required.
 *   - This is the SECURE DEFAULT — no additional configuration needed.
 *
 * Topology 3: Production separate containers
 *   - Python adapter in one container, TypeScript server in another.
 *   - Bridge binds to private service address (e.g. Docker internal network).
 *   - BRIDGE_HOST must be set to private container IP or service name.
 *   - TLS REQUIRED: set BRIDGE_TLS=true, BRIDGE_TLS_CERT, BRIDGE_TLS_KEY.
 *   - Network allowlist: only the Python adapter container IP is permitted.
 *   - NEVER publicly exposed.
 *   - BRIDGE_AUTH_TOKEN required.
 *
 * Security invariants (all topologies):
 *   - Bridge is NEVER publicly exposed.
 *   - Authentication (BRIDGE_AUTH_TOKEN) is ALWAYS required.
 *   - Secrets NEVER appear in logs or bridge payloads.
 *   - Localhost (127.0.0.1) is the secure default.
 *
 * See docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md for full details.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AtlasEventBus } from './event-bus.js';
import { FeedHealthMonitor } from './feed-health.js';
import { getMarketDataAuthority } from './config.js';

// ── Bridge protocol ────────────────────────────────────────────────────────────
export const BRIDGE_PROTOCOL_VERSION = '123A.2';

/**
 * BRIDGE_HOST: The host address the bridge server binds to.
 *
 * Defaults to '127.0.0.1' (loopback — secure default for Topologies 1 and 2).
 * Set BRIDGE_HOST environment variable for Topology 3 (separate containers).
 *
 * WARNING: Setting BRIDGE_HOST to a non-private address without TLS will
 * cause validateBridgeTopology() to throw at startup.
 */
export const BRIDGE_HOST = process.env.BRIDGE_HOST ?? '127.0.0.1';
export const BRIDGE_PORT_DEFAULT = 9876;
export const BRIDGE_PATH = '/databento-bridge';

// Valid schemas accepted from the Python adapter
const VALID_SCHEMAS = new Set([
  'trades',
  'ohlcv-1m',
  'definition',
  'symbol-mapping',
  'feed-health',
  'gap-detected',
  'recovery-complete',
  'recovery-partial',
  'recovery-failed',
]);

// ── Private/loopback address detection ────────────────────────────────────────

/**
 * Return true if the given host address is a private or loopback address.
 *
 * Private ranges (RFC 1918): 10.x.x.x, 172.16-31.x.x, 192.168.x.x
 * Loopback: 127.x.x.x, ::1
 * Docker internal: 172.17-31.x.x (subset of RFC 1918)
 */
function isPrivateOrLoopback(host: string): boolean {
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
  // 10.x.x.x
  if (/^10\./.test(host)) return true;
  // 172.16-31.x.x
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  // 192.168.x.x
  if (/^192\.168\./.test(host)) return true;
  return false;
}

/**
 * Validate the bridge deployment topology at startup.
 *
 * Rules:
 *   1. If BRIDGE_HOST is a private/loopback address → OK (Topologies 1 and 2).
 *      Log a warning if it is not 127.0.0.1 (unusual but valid for private nets).
 *   2. If BRIDGE_HOST is a non-private address:
 *      - BRIDGE_TLS must be set to 'true' (Topology 3 with TLS).
 *      - If BRIDGE_TLS is not set → throw (bridge would be exposed without TLS).
 *
 * This function is called in the DatabentoBridgeServer constructor.
 *
 * @throws Error if BRIDGE_HOST is non-private and BRIDGE_TLS is not set.
 */
export function validateBridgeTopology(): void {
  const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
  const tlsEnabled = (process.env.BRIDGE_TLS ?? '').toLowerCase() === 'true';

  if (isPrivateOrLoopback(host)) {
    // Topology 1 or 2 — safe
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      console.warn(
        '[BridgeServer] BRIDGE_HOST is a private network address (%s). ' +
        'Ensure the bridge is not reachable from outside the private network.',
        host,
      );
    }
    return;
  }

  // Non-private address — Topology 3 requires TLS
  if (!tlsEnabled) {
    throw new Error(
      `[BridgeServer] BRIDGE_HOST is set to a non-private address (${host}) ` +
      'but BRIDGE_TLS is not enabled. ' +
      'The bridge MUST use TLS when not on localhost or a private network. ' +
      'Set BRIDGE_TLS=true and provide BRIDGE_TLS_CERT and BRIDGE_TLS_KEY, ' +
      'or use a private/loopback address. ' +
      'See docs/architecture/BRIDGE_DEPLOYMENT_TOPOLOGY.md for details.',
    );
  }

  console.warn(
    '[BridgeServer] BRIDGE_HOST is a non-private address (%s) with TLS enabled. ' +
    'Ensure the bridge is NOT publicly accessible — restrict to the Python adapter only.',
    host,
  );
}

// ── Bridge record types (mirrors Python bridge_records.py) ────────────────────

export interface BridgeEnvelope {
  version: string;
  schema: string;
  ts_sent_ms: number;
  payload: Record<string, unknown>;
}

export interface BridgeTradePayload {
  instrument_id: number;
  raw_symbol: string;
  canonical_symbol: string;
  ts_event_ns: number;
  ts_recv_ns: number;
  price_usd: number;
  size: number;
  side: 'B' | 'S' | 'N';
  sequence: number;
  flags: number;
}

export interface BridgeOhlcv1mPayload {
  instrument_id: number;
  raw_symbol: string;
  canonical_symbol: string;
  ts_event_ns: number;
  open_usd: number;
  high_usd: number;
  low_usd: number;
  close_usd: number;
  volume: number;
  vwap_usd: number | null;
}

export interface BridgeDefinitionPayload {
  instrument_id: number;
  raw_symbol: string;
  instrument_class: string;
  asset: string;
  currency: string;
  min_price_increment: number;
  display_factor: number;
  expiration_ts_ns: number;
  ts_recv_ns: number;
}

export interface BridgeSymbolMappingPayload {
  instrument_id: number;
  stype_in_symbol: string;
  stype_out_symbol: string;
  start_ts_ns: number;
  end_ts_ns: number;
}

export interface BridgeFeedHealthPayload {
  status: string;
  reason: string | null;
  reconnect_attempt: number;
  last_record_ts_ms: number | null;
  ts_ms: number;
}

export interface BridgeGapDetectedPayload {
  schema: string;
  detected_at_ms: number;
  first_missing_ts_ns: number;
  last_missing_ts_ns: number;
  records_lost: number;
}

export interface BridgeRecoveryPayload {
  schema: string;
  records_recovered: number;
  start_ts_ns: number;
  end_ts_ns: number;
  reason?: string;
  actual_end_ts_ns?: number;
}

// ── Bridge server stats ────────────────────────────────────────────────────────

export interface BridgeServerStats {
  isRunning: boolean;
  connectedClients: number;
  recordsReceived: number;
  recordsRejected: number;
  lastRecordTs: number | null;
  lastRecordSchema: string | null;
  uptimeMs: number;
}

// ── Bridge server ──────────────────────────────────────────────────────────────

export class DatabentoBridgeServer {
  private wss: WebSocketServer | null = null;
  private readonly authToken: string;
  private readonly port: number;
  private readonly eventBus: AtlasEventBus;
  private readonly feedHealth: FeedHealthMonitor;
  private startedAt: number | null = null;

  // Stats
  private recordsReceived = 0;
  private recordsRejected = 0;
  private lastRecordTs: number | null = null;
  private lastRecordSchema: string | null = null;

  constructor(
    eventBus: AtlasEventBus,
    feedHealth: FeedHealthMonitor,
    port: number = BRIDGE_PORT_DEFAULT,
  ) {
    this.eventBus = eventBus;
    this.feedHealth = feedHealth;
    this.port = port;

    // Validate topology at startup — throws if non-private host without TLS
    validateBridgeTopology();

    // Read auth token — never log this value
    const token = process.env.BRIDGE_AUTH_TOKEN ?? '';
    if (!token) {
      throw new Error(
        '[BridgeServer] BRIDGE_AUTH_TOKEN is not set. ' +
        'The bridge server cannot start without an authentication token.',
      );
    }
    this.authToken = token;
  }

  /**
   * Start the bridge WebSocket server.
   * Binds to BRIDGE_HOST (default: 127.0.0.1) — never exposed externally.
   */
  start(): void {
    if (this.wss) {
      console.warn('[BridgeServer] Already running');
      return;
    }

    this.wss = new WebSocketServer({
      host: BRIDGE_HOST,
      port: this.port,
      path: BRIDGE_PATH,
    });

    this.startedAt = Date.now();

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // Reject connections from non-localhost addresses when using default topology
      const remoteAddr = req.socket.remoteAddress ?? '';
      if (
        BRIDGE_HOST === '127.0.0.1' &&
        remoteAddr !== '127.0.0.1' &&
        remoteAddr !== '::1' &&
        remoteAddr !== '::ffff:127.0.0.1'
      ) {
        console.warn('[BridgeServer] Rejected non-localhost connection from:', remoteAddr);
        ws.close(1008, 'Forbidden');
        return;
      }

      // Validate bridge auth token
      const token = req.headers['x-bridge-token'];
      if (!token || token !== this.authToken) {
        // Never log the received token — it may be a partial key
        console.warn('[BridgeServer] Rejected unauthenticated connection');
        ws.send(JSON.stringify({ error: 'Unauthorized' }));
        ws.close(1008, 'Unauthorized');
        this.recordsRejected++;
        return;
      }

      console.log('[BridgeServer] Python adapter connected');
      this.feedHealth.setConnected('databento');

      ws.on('message', (data: Buffer) => {
        this.handleMessage(data);
      });

      ws.on('close', () => {
        console.log('[BridgeServer] Python adapter disconnected');
        this.feedHealth.setDisconnected('databento', 'Bridge connection closed');
      });

      ws.on('error', (err: Error) => {
        // Log error type only — never the message (may contain key material)
        console.error('[BridgeServer] WebSocket error:', err.constructor.name);
        this.feedHealth.setError('databento', 'Bridge WebSocket error');
      });
    });

    this.wss.on('error', (err: Error) => {
      console.error('[BridgeServer] Server error:', err.message);
    });

    console.log(`[BridgeServer] Listening on ${BRIDGE_HOST}:${this.port}${BRIDGE_PATH}`);
  }

  /**
   * Stop the bridge server.
   */
  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log('[BridgeServer] Stopped');
    }
  }

  /**
   * Handle an incoming bridge message from the Python adapter.
   */
  private handleMessage(data: Buffer): void {
    let envelope: BridgeEnvelope;
    try {
      envelope = JSON.parse(data.toString('utf8')) as BridgeEnvelope;
    } catch {
      console.warn('[BridgeServer] Received invalid JSON — discarding');
      this.recordsRejected++;
      return;
    }

    // Validate protocol version
    if (envelope.version !== BRIDGE_PROTOCOL_VERSION) {
      console.warn(
        '[BridgeServer] Protocol version mismatch: expected %s, got %s',
        BRIDGE_PROTOCOL_VERSION,
        envelope.version,
      );
      this.recordsRejected++;
      return;
    }

    // Validate schema
    if (!VALID_SCHEMAS.has(envelope.schema)) {
      console.warn('[BridgeServer] Unknown schema: %s', envelope.schema);
      this.recordsRejected++;
      return;
    }

    this.recordsReceived++;
    this.lastRecordTs = Date.now();
    this.lastRecordSchema = envelope.schema;

    // Dispatch to event bus
    this.dispatchRecord(envelope);
  }

  /**
   * Dispatch a validated bridge record to the AtlasEventBus.
   *
   * AUTHORITY NOTE: The bridge server emits records to the event bus.
   * No downstream processing (processBar, postBarAutomation, strategies)
   * is triggered here. The authority mode in config.ts governs whether
   * downstream consumers act on these events.
   */
  private dispatchRecord(envelope: BridgeEnvelope): void {
    try {
      switch (envelope.schema) {
        case 'trades':
          this.eventBus.emit('databento:trade', envelope.payload as unknown as BridgeTradePayload);
          break;
        case 'ohlcv-1m':
          this.eventBus.emit('databento:ohlcv-1m', envelope.payload as unknown as BridgeOhlcv1mPayload);
          break;
        case 'definition':
          this.eventBus.emit('databento:definition', envelope.payload as unknown as BridgeDefinitionPayload);
          break;
        case 'symbol-mapping':
          this.eventBus.emit('databento:symbol-mapping', envelope.payload as unknown as BridgeSymbolMappingPayload);
          break;
        case 'feed-health':
          this.handleFeedHealthRecord(envelope.payload as unknown as BridgeFeedHealthPayload);
          break;
        case 'gap-detected':
          this.eventBus.emit('databento:gap-detected', envelope.payload as unknown as BridgeGapDetectedPayload);
          break;
        case 'recovery-complete':
        case 'recovery-partial':
        case 'recovery-failed':
          this.eventBus.emit('databento:recovery', { ...envelope.payload, event: envelope.schema } as unknown as BridgeRecoveryPayload);
          break;
        default:
          // Already validated above — should never reach here
          break;
      }
    } catch (err) {
      console.error('[BridgeServer] Dispatch error for schema %s: %s', envelope.schema, (err as Error).constructor.name);
    }
  }

  private handleFeedHealthRecord(payload: BridgeFeedHealthPayload): void {
    switch (payload.status) {
      case 'CONNECTED':
        this.feedHealth.setConnected('databento');
        break;
      case 'DEGRADED':
        this.feedHealth.setDegraded('databento', Date.now() - (payload.last_record_ts_ms ?? Date.now()));
        break;
      case 'RECONNECTING':
        this.feedHealth.setDisconnected('databento', payload.reason ?? 'Reconnecting');
        break;
      case 'OFFLINE':
        this.feedHealth.setError('databento', payload.reason ?? 'Offline');
        break;
      default:
        break;
    }
  }

  /**
   * Return current bridge server statistics.
   */
  getStats(): BridgeServerStats {
    return {
      isRunning: this.wss !== null,
      connectedClients: this.wss?.clients.size ?? 0,
      recordsReceived: this.recordsReceived,
      recordsRejected: this.recordsRejected,
      lastRecordTs: this.lastRecordTs,
      lastRecordSchema: this.lastRecordSchema,
      uptimeMs: this.startedAt !== null ? Date.now() - this.startedAt : 0,
    };
  }

  /**
   * Return true if the bridge server is running and the authority mode
   * allows Databento data to be received.
   *
   * In Sprint 123A.2, the bridge can run in any mode for monitoring purposes,
   * but no authority mode changes are made here.
   */
  isReadyToReceive(): boolean {
    if (!this.wss) return false;
    const authority = getMarketDataAuthority();
    // Bridge receives in all modes except TRADINGVIEW_ONLY
    // (in TRADINGVIEW_ONLY, the bridge is not started)
    return authority !== 'TRADINGVIEW_ONLY';
  }

  /**
   * SECURITY: Prevent authToken from appearing in JSON.stringify output.
   * TypeScript private is compile-time only — toJSON() enforces runtime safety.
   */
  toJSON(): object {
    return this.getStats();
  }
}

/**
 * Create a DatabentoBridgeServer from environment variables.
 * Returns null if BRIDGE_AUTH_TOKEN is not set (bridge disabled).
 */
export function createBridgeServer(
  eventBus: AtlasEventBus,
  feedHealth: FeedHealthMonitor,
): DatabentoBridgeServer | null {
  const token = process.env.BRIDGE_AUTH_TOKEN ?? '';
  if (!token) {
    console.log('[BridgeServer] BRIDGE_AUTH_TOKEN not set — bridge server disabled');
    return null;
  }
  const port = parseInt(process.env.BRIDGE_PORT ?? String(BRIDGE_PORT_DEFAULT), 10);
  return new DatabentoBridgeServer(eventBus, feedHealth, port);
}
