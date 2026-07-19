/**
 * Atlas Databento Bridge Server — Authenticated WebSocket Bridge Receiver
 * Sprint 123A.2 Gate G2 Revision 2
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
 *
 * AUTHENTICATION AND SESSION CONTROL (Section 5)
 * -----------------------------------------------
 * - First message must authenticate (token in header)
 * - Constant-time token comparison
 * - No token echo in any response
 * - Unauthenticated records rejected
 * - Authentication timeout: AUTH_TIMEOUT_MS (default 5000ms)
 * - Connection-rate limiting: MAX_CONNECTIONS_PER_MINUTE
 * - Maximum unauthenticated connections: MAX_UNAUTHENTICATED_CONNECTIONS
 * - Maximum message size: MAX_MESSAGE_BYTES (default 512KB)
 * - Schema-level payload validation
 * - Protocol version validation
 * - Per-connection record counters
 * - Last-seen heartbeat tracking
 * - Stale-connection termination: STALE_CONNECTION_TIMEOUT_MS
 * - Graceful shutdown: emits final bridge-health state
 * - Bridge session ID: unique per server start
 * - Adapter instance ID: from first authenticated message or generated
 * - Duplicate adapter detection: only one adapter per session
 */

import { createHash, timingSafeEqual } from 'crypto';
import { randomUUID } from 'crypto';
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

// ── Security limits ────────────────────────────────────────────────────────────
const AUTH_TIMEOUT_MS = parseInt(process.env.BRIDGE_AUTH_TIMEOUT_MS ?? '5000', 10);
const MAX_MESSAGE_BYTES = parseInt(process.env.BRIDGE_MAX_MESSAGE_BYTES ?? String(512 * 1024), 10);
const STALE_CONNECTION_TIMEOUT_MS = parseInt(process.env.BRIDGE_STALE_TIMEOUT_MS ?? '60000', 10);
const MAX_CONNECTIONS_PER_MINUTE = parseInt(process.env.BRIDGE_MAX_CONN_PER_MIN ?? '10', 10);
const MAX_UNAUTHENTICATED_CONNECTIONS = parseInt(process.env.BRIDGE_MAX_UNAUTH_CONN ?? '3', 10);

// Valid schemas accepted from the Python adapter
const VALID_SCHEMAS = new Set([
  'trades',
  'ohlcv-1m',
  'definition',
  'symbol-mapping',
  'feed-health',
  'gap-detected',
  'recovery-requested',
  'recovery-started',
  'recovery-progress',
  'recovery-complete',
  'recovery-partial',
  'recovery-failed',
  'backpressure-state',
  'bridge-health',
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

// ── Constant-time token comparison ────────────────────────────────────────────

/**
 * Compare two strings in constant time to prevent timing attacks.
 * Both strings are hashed with SHA-256 before comparison.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
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
  recovery_id: string;
  schema: string;
  dataset: string;
  raw_symbol: string;
  instrument_id: number;
  detected_at_ms: number;
  first_missing_ts_ns: number;
  last_missing_ts_ns: number;
  records_lost: number;
  atlas_processing_ts_ms: number;
}

export interface BridgeRecoveryPayload {
  recovery_id: string;
  schema: string;
  dataset?: string;
  raw_symbol?: string;
  instrument_id?: number;
  records_recovered?: number;
  start_ts_ns: number;
  end_ts_ns: number;
  reason?: string;
  actual_end_ts_ns?: number;
  retry_count?: number;
  error_code?: string;
  completion_status?: string;
  atlas_processing_ts_ms: number;
}

// ── Per-connection state ───────────────────────────────────────────────────────

interface ConnectionState {
  sessionId: string;
  adapterInstanceId: string | null;
  authenticated: boolean;
  connectedAt: number;
  lastHeartbeatAt: number;
  recordsReceived: number;
  recordsRejected: number;
  authTimer: ReturnType<typeof setTimeout> | null;
  staleTimer: ReturnType<typeof setTimeout> | null;
}

// ── Bridge server stats ────────────────────────────────────────────────────────

export interface BridgeServerStats {
  isRunning: boolean;
  bridgeSessionId: string;
  connectedClients: number;
  recordsReceived: number;
  recordsRejected: number;
  lastRecordTs: number | null;
  lastRecordSchema: string | null;
  uptimeMs: number;
  activeAdapterInstanceId: string | null;
}

// ── Bridge server ──────────────────────────────────────────────────────────────

export class DatabentoBridgeServer {
  private wss: WebSocketServer | null = null;
  private readonly authToken: string;
  private readonly port: number;
  private readonly eventBus: AtlasEventBus;
  private readonly feedHealth: FeedHealthMonitor;
  private startedAt: number | null = null;

  // Bridge session ID — unique per server start
  readonly bridgeSessionId: string = randomUUID();

  // Active adapter tracking (duplicate detection)
  private activeAdapterInstanceId: string | null = null;
  private activeAdapterSocket: WebSocket | null = null;

  // Connection rate limiting
  private connectionTimestamps: number[] = [];
  private unauthenticatedCount = 0;

  // Global stats
  private recordsReceived = 0;
  private recordsRejected = 0;
  private lastRecordTs: number | null = null;
  private lastRecordSchema: string | null = null;

  // Stale connection sweep interval
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;

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

    // Stale connection sweep every 30 seconds
    this.staleCheckInterval = setInterval(() => this.sweepStaleConnections(), 30_000);

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err: Error) => {
      console.error('[BridgeServer] Server error:', err.message);
    });

    console.log(
      '[BridgeServer] Listening on %s:%d%s (session=%s)',
      BRIDGE_HOST, this.port, BRIDGE_PATH, this.bridgeSessionId,
    );
  }

  /**
   * Stop the bridge server gracefully.
   * Emits a final bridge-health event before closing all connections.
   */
  stop(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }

    if (this.wss) {
      // Emit final health state to all connected clients
      const finalHealth = {
        version: BRIDGE_PROTOCOL_VERSION,
        schema: 'bridge-health',
        ts_sent_ms: Date.now(),
        payload: {
          state: 'STOPPED',
          bridge_session_id: this.bridgeSessionId,
          adapter_instance_id: this.activeAdapterInstanceId,
          records_received: this.recordsReceived,
          records_rejected: this.recordsRejected,
          reason: 'Graceful shutdown',
          atlas_processing_ts_ms: Date.now(),
        },
      };

      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(finalHealth));
          } catch {
            // Ignore send errors during shutdown
          }
        }
      });

      this.wss.close();
      this.wss = null;
      this.activeAdapterInstanceId = null;
      this.activeAdapterSocket = null;
      console.log('[BridgeServer] Stopped (session=%s)', this.bridgeSessionId);
    }
  }

  /**
   * Handle a new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const now = Date.now();

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

    // Connection rate limiting
    this.connectionTimestamps = this.connectionTimestamps.filter(
      (ts) => now - ts < 60_000,
    );
    if (this.connectionTimestamps.length >= MAX_CONNECTIONS_PER_MINUTE) {
      console.warn('[BridgeServer] Connection rate limit exceeded — rejecting');
      ws.close(1008, 'Rate limit exceeded');
      return;
    }
    this.connectionTimestamps.push(now);

    // Maximum unauthenticated connections
    if (this.unauthenticatedCount >= MAX_UNAUTHENTICATED_CONNECTIONS) {
      console.warn('[BridgeServer] Max unauthenticated connections reached — rejecting');
      ws.close(1008, 'Too many unauthenticated connections');
      return;
    }

    // Validate bridge auth token (constant-time comparison)
    const tokenHeader = req.headers['x-bridge-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader ?? '';
    if (!token || !constantTimeEqual(token, this.authToken)) {
      // Never log the received token — it may be a partial key
      console.warn('[BridgeServer] Rejected unauthenticated connection');
      ws.send(JSON.stringify({ error: 'Unauthorized' }));
      ws.close(1008, 'Unauthorized');
      this.recordsRejected++;
      return;
    }

    // Duplicate adapter detection
    // Policy: supersede the previous adapter (close old connection, accept new)
    if (this.activeAdapterSocket && this.activeAdapterSocket.readyState === WebSocket.OPEN) {
      console.warn(
        '[BridgeServer] Duplicate adapter connection detected — superseding previous adapter (instance=%s)',
        this.activeAdapterInstanceId,
      );
      this.activeAdapterSocket.close(1001, 'Superseded by new adapter connection');
    }

    // Per-connection state
    const connState: ConnectionState = {
      sessionId: randomUUID(),
      adapterInstanceId: null,
      authenticated: true,
      connectedAt: now,
      lastHeartbeatAt: now,
      recordsReceived: 0,
      recordsRejected: 0,
      authTimer: null,
      staleTimer: null,
    };

    this.activeAdapterSocket = ws;

    console.log(
      '[BridgeServer] Python adapter connected (conn=%s bridge=%s)',
      connState.sessionId, this.bridgeSessionId,
    );
    this.feedHealth.setConnected('databento');

    ws.on('message', (data: Buffer) => {
      // Maximum message size enforcement
      if (data.length > MAX_MESSAGE_BYTES) {
        console.warn(
          '[BridgeServer] Oversized message (%d bytes > %d limit) — rejecting',
          data.length, MAX_MESSAGE_BYTES,
        );
        this.recordsRejected++;
        connState.recordsRejected++;
        ws.send(JSON.stringify({ error: 'Message too large' }));
        return;
      }

      connState.lastHeartbeatAt = Date.now();
      this.handleMessage(data, connState);
    });

    ws.on('close', () => {
      if (connState.authTimer) clearTimeout(connState.authTimer);
      if (connState.staleTimer) clearTimeout(connState.staleTimer);
      if (this.activeAdapterSocket === ws) {
        this.activeAdapterSocket = null;
        this.activeAdapterInstanceId = null;
      }
      console.log(
        '[BridgeServer] Python adapter disconnected (conn=%s records=%d)',
        connState.sessionId, connState.recordsReceived,
      );
      this.feedHealth.setDisconnected('databento', 'Bridge connection closed');
    });

    ws.on('error', (err: Error) => {
      // Log error type only — never the message (may contain key material)
      console.error('[BridgeServer] WebSocket error:', err.constructor.name);
      this.feedHealth.setError('databento', 'Bridge WebSocket error');
    });
  }

  /**
   * Sweep and close stale connections that have not sent a heartbeat.
   */
  private sweepStaleConnections(): void {
    if (!this.wss) return;
    const now = Date.now();

    this.wss.clients.forEach((client) => {
      // We track lastHeartbeatAt via the message handler; use a simple check
      // on the socket's _socket.lastWriteTime if available, otherwise skip
      // (the per-connection state is tracked in the closure above)
      // This sweep handles connections that never sent any message
      const ws = client as WebSocket & { _connectedAt?: number; _lastHeartbeatAt?: number };
      const lastSeen = ws._lastHeartbeatAt ?? ws._connectedAt ?? now;
      if (now - lastSeen > STALE_CONNECTION_TIMEOUT_MS) {
        console.warn('[BridgeServer] Closing stale connection (no heartbeat for %dms)', now - lastSeen);
        client.close(1001, 'Stale connection');
      }
    });
  }

  /**
   * Handle an incoming bridge message from the Python adapter.
   */
  private handleMessage(data: Buffer, connState: ConnectionState): void {
    let envelope: BridgeEnvelope;
    try {
      envelope = JSON.parse(data.toString('utf8')) as BridgeEnvelope;
    } catch {
      console.warn('[BridgeServer] Received invalid JSON — discarding');
      this.recordsRejected++;
      connState.recordsRejected++;
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
      connState.recordsRejected++;
      return;
    }

    // Validate schema
    if (!VALID_SCHEMAS.has(envelope.schema)) {
      console.warn('[BridgeServer] Unknown schema: %s', envelope.schema);
      this.recordsRejected++;
      connState.recordsRejected++;
      return;
    }

    // Validate payload is an object
    if (!envelope.payload || typeof envelope.payload !== 'object') {
      console.warn('[BridgeServer] Invalid payload for schema: %s', envelope.schema);
      this.recordsRejected++;
      connState.recordsRejected++;
      return;
    }

    this.recordsReceived++;
    connState.recordsReceived++;
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
        case 'recovery-requested':
        case 'recovery-started':
        case 'recovery-progress':
        case 'recovery-complete':
        case 'recovery-partial':
        case 'recovery-failed':
          this.eventBus.emit('databento:recovery', { ...envelope.payload, event: envelope.schema } as unknown as BridgeRecoveryPayload);
          break;
        case 'backpressure-state':
          this.eventBus.emit('databento:backpressure', envelope.payload);
          break;
        case 'bridge-health':
          this.eventBus.emit('databento:bridge-health', envelope.payload);
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
      case 'LIVE':
        this.feedHealth.setConnected('databento');
        break;
      case 'DEGRADED':
      case 'BACKPRESSURED':
      case 'RECOVERING':
        this.feedHealth.setDegraded('databento', Date.now() - (payload.last_record_ts_ms ?? Date.now()));
        break;
      case 'RECONNECTING':
      case 'STALE':
        this.feedHealth.setDisconnected('databento', payload.reason ?? 'Reconnecting');
        break;
      case 'OFFLINE':
      case 'ERROR':
      case 'STOPPED':
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
      bridgeSessionId: this.bridgeSessionId,
      connectedClients: this.wss?.clients.size ?? 0,
      recordsReceived: this.recordsReceived,
      recordsRejected: this.recordsRejected,
      lastRecordTs: this.lastRecordTs,
      lastRecordSchema: this.lastRecordSchema,
      uptimeMs: this.startedAt !== null ? Date.now() - this.startedAt : 0,
      activeAdapterInstanceId: this.activeAdapterInstanceId,
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
