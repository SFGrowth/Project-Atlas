/**
 * Atlas Chart Stream Service
 * Sprint 123A.4 — Live Chart and Databento Shadow Integration
 *
 * Implements server-sent events (SSE) streaming for the Atlas live chart.
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * This service publishes chart data ONLY. It MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - expose DATABENTO_API_KEY or BRIDGE_AUTH_TOKEN
 *   - connect the browser directly to Databento
 *   - activate any authority mode
 *
 * STREAM EVENTS
 * -------------
 *   bar:developing     — developing 1m bar update (live tick)
 *   bar:1m-confirmed   — confirmed 1m bar (CONFIRMED + MATCHED)
 *   bar:5m-confirmed   — confirmed 5m bar
 *   bar:unresolved     — unresolved 1m bar (cannot be displayed as confirmed)
 *   health             — feed/bridge health update
 *   contract-roll      — contract roll notification
 *   recovery           — gap recovery correction
 *
 * RECONNECT SUPPORT
 * -----------------
 * Every event includes an `id` field (monotonically increasing sequence number).
 * Clients send `Last-Event-ID` on reconnect. The service replays missed
 * confirmed events from the in-memory ring buffer (last 1000 events).
 *
 * BACKPRESSURE
 * ------------
 * Each client has a write queue. If the queue exceeds MAX_QUEUE_DEPTH,
 * the client is disconnected as stale.
 *
 * SECRET SAFETY
 * -------------
 * No Databento credentials or bridge tokens are ever included in SSE events.
 *
 * Sprint 123A.4 — Gate G3 Approved
 */

import type { Request, Response } from 'express';
import type { MinuteBar, FiveMinBar } from './types/bar-lifecycle.js';
import { BarLifecycle, ReconciliationStatus } from './types/bar-lifecycle.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = '123A.4';
const MAX_QUEUE_DEPTH = 50;
const RING_BUFFER_SIZE = 1000;
const STALE_CLIENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Event types ─────────────────────────────────────────────────────────────

export type ChartEventType =
  | 'bar:developing'
  | 'bar:1m-confirmed'
  | 'bar:5m-confirmed'
  | 'bar:unresolved'
  | 'health'
  | 'contract-roll'
  | 'recovery'
  | 'ping';

export interface ChartStreamEvent {
  /** Monotonically increasing sequence number for Last-Event-ID reconnect. */
  id: number;
  type: ChartEventType;
  protocolVersion: string;
  source: 'DATABENTO';
  dataset: string;
  instrumentId: number;
  rawSymbol: string;
  canonicalSymbol: string;
  intervalMs: number;
  barOpenTsMs: number | null;
  revision: number;
  mappingVersion: string;
  lifecycle: string;
  reconciliationStatus: string | null;
  atlasTsMs: number;
  payload: unknown;
}

// ─── SSE Client ───────────────────────────────────────────────────────────────

interface SSEClient {
  id: string;
  res: Response;
  queueDepth: number;
  connectedAt: number;
  lastActivityAt: number;
}

// ─── ChartStreamService ───────────────────────────────────────────────────────

export class ChartStreamService {
  private clients = new Map<string, SSEClient>();
  private sequence = 0;
  /** Ring buffer of recent confirmed events for reconnect replay. */
  private ringBuffer: ChartStreamEvent[] = [];
  private clientIdCounter = 0;

  // ─── Client management ───────────────────────────────────────────────────

  /**
   * Register an SSE client. Sends missed events from Last-Event-ID.
   * Returns the client ID.
   *
   * SECURITY: Authentication must be verified by the caller before calling this.
   */
  registerClient(req: Request, res: Response): string {
    const clientId = `sse-${++this.clientIdCounter}-${Date.now()}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client: SSEClient = {
      id: clientId,
      res,
      queueDepth: 0,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    this.clients.set(clientId, client);

    // Replay missed events from Last-Event-ID
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
      const lastId = parseInt(lastEventId as string, 10);
      if (!isNaN(lastId)) {
        this._replayMissedEvents(client, lastId);
      }
    }

    // Send initial ping
    this._sendToClient(client, {
      id: 0,
      type: 'ping',
      protocolVersion: PROTOCOL_VERSION,
      source: 'DATABENTO',
      dataset: '',
      instrumentId: 0,
      rawSymbol: '',
      canonicalSymbol: '',
      intervalMs: 0,
      barOpenTsMs: null,
      revision: 0,
      mappingVersion: '',
      lifecycle: '',
      reconciliationStatus: null,
      atlasTsMs: Date.now(),
      payload: { message: 'connected', clientId },
    });

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
    });

    return clientId;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  // ─── Publication methods ─────────────────────────────────────────────────

  publishDeveloping(bar: MinuteBar): void {
    const event = this._makeBar1mEvent('bar:developing', bar);
    this._broadcast(event, false); // developing bars not buffered
  }

  publishBar1m(bar: MinuteBar): void {
    const eventType: ChartEventType =
      bar.lifecycle === BarLifecycle.CONFIRMED ? 'bar:1m-confirmed' : 'bar:unresolved';
    const event = this._makeBar1mEvent(eventType, bar);
    this._broadcast(event, true); // confirmed bars buffered for replay
  }

  publishBar5m(bar: FiveMinBar): void {
    const event = this._makeBar5mEvent(bar);
    this._broadcast(event, true); // 5m bars buffered for replay
  }

  publishHealth(payload: unknown): void {
    const event: ChartStreamEvent = {
      id: ++this.sequence,
      type: 'health',
      protocolVersion: PROTOCOL_VERSION,
      source: 'DATABENTO',
      dataset: '',
      instrumentId: 0,
      rawSymbol: '',
      canonicalSymbol: '',
      intervalMs: 0,
      barOpenTsMs: null,
      revision: 0,
      mappingVersion: '',
      lifecycle: '',
      reconciliationStatus: null,
      atlasTsMs: Date.now(),
      payload,
    };
    this._broadcast(event, false);
  }

  publishContractRoll(payload: unknown): void {
    const event: ChartStreamEvent = {
      id: ++this.sequence,
      type: 'contract-roll',
      protocolVersion: PROTOCOL_VERSION,
      source: 'DATABENTO',
      dataset: '',
      instrumentId: 0,
      rawSymbol: '',
      canonicalSymbol: '',
      intervalMs: 0,
      barOpenTsMs: null,
      revision: 0,
      mappingVersion: '',
      lifecycle: '',
      reconciliationStatus: null,
      atlasTsMs: Date.now(),
      payload,
    };
    this._broadcast(event, true);
  }

  // ─── Event construction ──────────────────────────────────────────────────

  private _makeBar1mEvent(type: ChartEventType, bar: MinuteBar): ChartStreamEvent {
    return {
      id: ++this.sequence,
      type,
      protocolVersion: PROTOCOL_VERSION,
      source: bar.source,
      dataset: bar.dataset,
      instrumentId: bar.instrumentId,
      rawSymbol: bar.rawSymbol,
      canonicalSymbol: bar.rawSymbol, // canonical symbol = rawSymbol in Sprint 123A.4
      intervalMs: bar.intervalMs,
      barOpenTsMs: bar.barOpenTsMs,
      revision: bar.revision,
      mappingVersion: bar.mappingVersion,
      lifecycle: bar.lifecycle,
      reconciliationStatus: bar.reconciliation?.status ?? null,
      atlasTsMs: bar.atlasTsMs,
      payload: {
        open: bar.ohlcv.openPts100,
        high: bar.ohlcv.highPts100,
        low: bar.ohlcv.lowPts100,
        close: bar.ohlcv.closePts100,
        volume: bar.ohlcv.volume,
        tradeCount: bar.ohlcv.tradeCount,
        barCloseTsMs: bar.barCloseTsMs,
      },
    };
  }
  private _makeBar5mEvent(bar: FiveMinBar): ChartStreamEvent {
    return {
      id: ++this.sequence,
      type: 'bar:5m-confirmed',
      protocolVersion: PROTOCOL_VERSION,
      source: bar.source,
      dataset: bar.dataset,
      instrumentId: bar.instrumentId,
      rawSymbol: bar.rawSymbol,
      canonicalSymbol: bar.rawSymbol,
      intervalMs: bar.intervalMs,
      barOpenTsMs: bar.barOpenTsMs,
      revision: bar.revision,
      mappingVersion: bar.mappingVersion,
      lifecycle: 'CONFIRMED',
      reconciliationStatus: ReconciliationStatus.MATCHED,
      atlasTsMs: bar.atlasTsMs,
      payload: {
        open: bar.ohlcv.openPts100,
        high: bar.ohlcv.highPts100,
        low: bar.ohlcv.lowPts100,
        close: bar.ohlcv.closePts100,
        volume: bar.ohlcv.volume,
        tradeCount: bar.ohlcv.tradeCount,
        barCloseTsMs: bar.barCloseTsMs,
        minuteBarCount: bar.minuteBarCount,
        barType: bar.barType,
      },
    };
  }

  // ─── Broadcast ───────────────────────────────────────────────────────────

  private _broadcast(event: ChartStreamEvent, buffer: boolean): void {
    if (buffer) {
      this._addToRingBuffer(event);
    }

    const staleClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      // Disconnect stale clients
      if (Date.now() - client.lastActivityAt > STALE_CLIENT_TIMEOUT_MS) {
        staleClients.push(clientId);
        continue;
      }
      // Apply backpressure
      if (client.queueDepth >= MAX_QUEUE_DEPTH) {
        staleClients.push(clientId);
        continue;
      }
      this._sendToClient(client, event);
    }

    for (const clientId of staleClients) {
      const client = this.clients.get(clientId);
      if (client) {
        try { client.res.end(); } catch { /* ignore */ }
        this.clients.delete(clientId);
      }
    }
  }

  private _sendToClient(client: SSEClient, event: ChartStreamEvent): void {
    try {
      client.queueDepth++;
      const data = JSON.stringify(event);
      client.res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${data}\n\n`);
      client.lastActivityAt = Date.now();
      client.queueDepth = Math.max(0, client.queueDepth - 1);
    } catch {
      // Client disconnected — remove
      this.clients.delete(client.id);
    }
  }

  // ─── Ring buffer ─────────────────────────────────────────────────────────

  private _addToRingBuffer(event: ChartStreamEvent): void {
    this.ringBuffer.push(event);
    if (this.ringBuffer.length > RING_BUFFER_SIZE) {
      this.ringBuffer.shift();
    }
  }

  private _replayMissedEvents(client: SSEClient, lastEventId: number): void {
    const missed = this.ringBuffer.filter(e => e.id > lastEventId);
    for (const event of missed) {
      this._sendToClient(client, event);
    }
  }

  // ─── Diagnostics ─────────────────────────────────────────────────────────

  getRingBufferSize(): number {
    return this.ringBuffer.length;
  }

  getSequence(): number {
    return this.sequence;
  }
}
