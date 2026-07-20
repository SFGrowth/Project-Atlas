/**
 * Sprint 123A.4 — Gate G4 SSE Integration Tests
 *
 * Tests the ChartStreamService SSE delivery layer.
 *
 *   TEST-123A4-SSE-001  registerClient sends initial ping event
 *   TEST-123A4-SSE-002  registerClient sets correct SSE headers
 *   TEST-123A4-SSE-003  publishBar1m broadcasts bar:1m-confirmed event
 *   TEST-123A4-SSE-004  publishBar1m broadcasts bar:unresolved for non-CONFIRMED bar
 *   TEST-123A4-SSE-005  publishBar5m broadcasts bar:5m-confirmed event
 *   TEST-123A4-SSE-006  publishDeveloping broadcasts bar:developing event (not buffered)
 *   TEST-123A4-SSE-007  publishHealth broadcasts health event (not buffered)
 *   TEST-123A4-SSE-008  publishContractRoll broadcasts contract-roll event (buffered)
 *   TEST-123A4-SSE-009  Reconnect replays missed events from Last-Event-ID
 *   TEST-123A4-SSE-010  Expired cursor sends cursor-expired event
 *   TEST-123A4-SSE-011  Expired cursor: oldestAvailable in payload matches ring buffer
 *   TEST-123A4-SSE-012  Developing bars are NOT added to ring buffer
 *   TEST-123A4-SSE-013  Confirmed bars ARE added to ring buffer
 *   TEST-123A4-SSE-014  Ring buffer evicts oldest event when full (RING_BUFFER_SIZE exceeded)
 *   TEST-123A4-SSE-015  Backpressure: client with full queue is disconnected
 *   TEST-123A4-SSE-016  Client disconnect removes client from registry
 *   TEST-123A4-SSE-017  shutdown() ends all client connections and stops heartbeat
 *   TEST-123A4-SSE-018  Multiple clients all receive broadcast events
 *   TEST-123A4-SSE-019  SSE event format: id/event/data lines with double newline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChartStreamService } from '../chart-stream-service.js';
import {
  BarLifecycle,
  ReconciliationStatus,
  FiveMinBarType,
} from '../types/bar-lifecycle.js';
import type { MinuteBar, FiveMinBar } from '../types/bar-lifecycle.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockRes() {
  const written: string[] = [];
  let ended = false;
  const headers: Record<string, string> = {};
  return {
    written,
    headers,
    get ended() { return ended; },
    setHeader(k: string, v: string) { headers[k] = v; },
    flushHeaders() {},
    write(data: string) { written.push(data); return true; },
    end() { ended = true; },
  } as any;
}

function makeMockReq(lastEventId?: string) {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    headers: lastEventId ? { 'last-event-id': lastEventId } : {},
    on(event: string, cb: () => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    emit(event: string) {
      (listeners[event] ?? []).forEach(cb => cb());
    },
    _listeners: listeners,
  } as any;
}

function makeConfirmedBar(overrides: Partial<MinuteBar> = {}): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQM5',
    instrumentId: 12345,
    intervalMs: 60000,
    barOpenTsMs: 1_700_000_000_000,
    barCloseTsMs: 1_700_000_060_000,
    barOpenTsNs: BigInt('1700000000000000000'),
    ohlcv: {
      openPts100: 2_100_000,
      highPts100: 2_105_000,
      lowPts100:  2_098_000,
      closePts100: 2_103_000,
      volume: 1500,
      tradeCount: 120,
    },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDeltaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 500,
    },
    revision: 1,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
    ...overrides,
  } as MinuteBar;
}

function makeFiveMinBar(): FiveMinBar {
  return {
    source: 'DATABENTO',
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQM5',
    instrumentId: 12345,
    intervalMs: 300000,
    barOpenTsMs: 1_700_000_000_000,
    barCloseTsMs: 1_700_000_300_000,
    ohlcv: {
      openPts100: 2_100_000,
      highPts100: 2_110_000,
      lowPts100:  2_095_000,
      closePts100: 2_105_000,
      volume: 7500,
      tradeCount: 600,
    },
    minuteBarCount: 5,
    barType: FiveMinBarType.LIVE_CONFIRMED,
    revision: 1,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
  } as FiveMinBar;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 123A.4 — ChartStreamService SSE', () => {

  let svc: ChartStreamService;

  beforeEach(() => {
    svc = new ChartStreamService();
    svc.shutdown(); // stop heartbeat immediately for test isolation
    // Recreate without heartbeat interference
    svc = new ChartStreamService();
    // Immediately stop the heartbeat timer so tests are not affected
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    (svc as any).heartbeatTimer = null;
  });

  it('TEST-123A4-SSE-001: registerClient sends initial ping event', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);

    expect(res.written.length).toBeGreaterThanOrEqual(1);
    const pingLine = res.written.find(w => w.includes('"type":"ping"'));
    expect(pingLine).toBeDefined();
  });

  it('TEST-123A4-SSE-002: registerClient sets correct SSE headers', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);

    expect(res.headers['Content-Type']).toBe('text/event-stream');
    expect(res.headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(res.headers['Connection']).toBe('keep-alive');
    expect(res.headers['X-Accel-Buffering']).toBe('no');
  });

  it('TEST-123A4-SSE-003: publishBar1m broadcasts bar:1m-confirmed event', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    svc.publishBar1m(makeConfirmedBar());

    const newWrites = res.written.slice(initialCount);
    const confirmedWrite = newWrites.find(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedWrite).toBeDefined();
  });

  it('TEST-123A4-SSE-004: publishBar1m broadcasts bar:unresolved for non-CONFIRMED bar', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    const unresolvedBar = makeConfirmedBar({ lifecycle: BarLifecycle.UNRESOLVED });
    svc.publishBar1m(unresolvedBar);

    const newWrites = res.written.slice(initialCount);
    const unresolvedWrite = newWrites.find(w => w.includes('"type":"bar:unresolved"'));
    expect(unresolvedWrite).toBeDefined();
  });

  it('TEST-123A4-SSE-005: publishBar5m broadcasts bar:5m-confirmed event', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    svc.publishBar5m(makeFiveMinBar());

    const newWrites = res.written.slice(initialCount);
    const fiveMinWrite = newWrites.find(w => w.includes('"type":"bar:5m-confirmed"'));
    expect(fiveMinWrite).toBeDefined();
  });

  it('TEST-123A4-SSE-006: publishDeveloping broadcasts bar:developing event (not buffered)', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    const devBar = makeConfirmedBar({ lifecycle: BarLifecycle.DEVELOPING });
    svc.publishDeveloping(devBar);

    const newWrites = res.written.slice(initialCount);
    const devWrite = newWrites.find(w => w.includes('"type":"bar:developing"'));
    expect(devWrite).toBeDefined();

    // Developing bars must NOT be in the ring buffer
    expect(svc.getRingBufferSize()).toBe(0);
  });

  it('TEST-123A4-SSE-007: publishHealth broadcasts health event (not buffered)', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    svc.publishHealth({ status: 'LIVE' });

    const newWrites = res.written.slice(initialCount);
    const healthWrite = newWrites.find(w => w.includes('"type":"health"'));
    expect(healthWrite).toBeDefined();
    // Health events not buffered
    expect(svc.getRingBufferSize()).toBe(0);
  });

  it('TEST-123A4-SSE-008: publishContractRoll broadcasts contract-roll event (buffered)', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);

    svc.publishContractRoll({ oldSymbol: 'MNQM5', newSymbol: 'MNQU5' });

    expect(svc.getRingBufferSize()).toBe(1);
    const write = res.written.find(w => w.includes('"type":"contract-roll"'));
    expect(write).toBeDefined();
  });

  it('TEST-123A4-SSE-009: Reconnect replays missed events from Last-Event-ID', () => {
    // Publish 3 confirmed bars before the new client connects
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    const seqAfterFirst = svc.getSequence();
    // seqAfterFirst = 3 (bars 1, 2, 3)

    // New client reconnects with Last-Event-ID = 1 (missed bars 2 and 3)
    const req = makeMockReq('1');
    const res = makeMockRes();
    svc.registerClient(req, res);

    // Should have received: replay of bars 2+3, plus the initial ping
    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(2);
  });

  it('TEST-123A4-SSE-010: Expired cursor sends cursor-expired event', () => {
    // Fill the ring buffer past the cursor
    // Publish enough bars to push seq=1 out of the ring buffer
    // We'll simulate this by publishing bars and then checking cursor detection
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));
    // Oldest buffered seq is now 1

    // Client reconnects with Last-Event-ID = 0 (before oldest buffered)
    const req = makeMockReq('0');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const expiredWrite = res.written.find(w => w.includes('"type":"cursor-expired"'));
    expect(expiredWrite).toBeDefined();
  });

  it('TEST-123A4-SSE-011: Expired cursor: oldestAvailable in payload matches ring buffer', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));
    const oldestSeq = svc.getOldestBufferedSeq();

    const req = makeMockReq('0');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const expiredWrite = res.written.find(w => w.includes('"type":"cursor-expired"'));
    expect(expiredWrite).toBeDefined();
    const parsed = JSON.parse(expiredWrite!.match(/data: (.+)/)?.[1] ?? '{}');
    expect(parsed.payload.oldestAvailable).toBe(oldestSeq);
  });

  it('TEST-123A4-SSE-012: Developing bars are NOT added to ring buffer', () => {
    const devBar = makeConfirmedBar({ lifecycle: BarLifecycle.DEVELOPING });
    svc.publishDeveloping(devBar);
    svc.publishDeveloping(devBar);
    expect(svc.getRingBufferSize()).toBe(0);
  });

  it('TEST-123A4-SSE-013: Confirmed bars ARE added to ring buffer', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar5m(makeFiveMinBar());
    expect(svc.getRingBufferSize()).toBe(3);
  });

  it('TEST-123A4-SSE-014: Ring buffer evicts oldest event when full', () => {
    // Publish RING_BUFFER_SIZE + 5 events
    const RING_BUFFER_SIZE = 1000;
    for (let i = 0; i < RING_BUFFER_SIZE + 5; i++) {
      svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: i * 60_000 }));
    }
    expect(svc.getRingBufferSize()).toBe(RING_BUFFER_SIZE);
    // Oldest should be seq 6 (first 5 were evicted)
    const oldest = svc.getOldestBufferedSeq();
    expect(oldest).toBe(6);
  });

  it('TEST-123A4-SSE-015: Backpressure: client with full queue is disconnected', () => {
    const MAX_QUEUE_DEPTH = 50;
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    expect(svc.getClientCount()).toBe(1);

    // Force queueDepth to max by setting it directly
    const client = (svc as any).clients.values().next().value;
    client.queueDepth = MAX_QUEUE_DEPTH;

    // Next broadcast should disconnect the client
    svc.publishBar1m(makeConfirmedBar());
    expect(svc.getClientCount()).toBe(0);
  });

  it('TEST-123A4-SSE-016: Client disconnect removes client from registry', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    expect(svc.getClientCount()).toBe(1);

    // Simulate client disconnect
    req.emit('close');
    expect(svc.getClientCount()).toBe(0);
  });

  it('TEST-123A4-SSE-017: shutdown() ends all client connections and stops heartbeat', () => {
    const req1 = makeMockReq();
    const res1 = makeMockRes();
    const req2 = makeMockReq();
    const res2 = makeMockRes();
    svc.registerClient(req1, res1);
    svc.registerClient(req2, res2);
    expect(svc.getClientCount()).toBe(2);

    svc.shutdown();

    expect(svc.getClientCount()).toBe(0);
    expect(res1.ended).toBe(true);
    expect(res2.ended).toBe(true);
    expect((svc as any).heartbeatTimer).toBeNull();
    expect((svc as any).isShutdown).toBe(true);
  });

  it('TEST-123A4-SSE-018: Multiple clients all receive broadcast events', () => {
    const clients = Array.from({ length: 3 }, () => {
      const req = makeMockReq();
      const res = makeMockRes();
      svc.registerClient(req, res);
      return { req, res };
    });

    const initialCounts = clients.map(c => c.res.written.length);
    svc.publishBar1m(makeConfirmedBar());

    for (let i = 0; i < clients.length; i++) {
      const newWrites = clients[i].res.written.slice(initialCounts[i]);
      const confirmedWrite = newWrites.find(w => w.includes('"type":"bar:1m-confirmed"'));
      expect(confirmedWrite).toBeDefined();
    }
  });

  it('TEST-123A4-SSE-019: SSE event format: id/event/data lines with double newline', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);
    const initialCount = res.written.length;

    svc.publishBar1m(makeConfirmedBar());

    const newWrites = res.written.slice(initialCount);
    const eventWrite = newWrites.find(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(eventWrite).toBeDefined();

    // Must match SSE format: "id: N\nevent: TYPE\ndata: JSON\n\n"
    expect(eventWrite).toMatch(/^id: \d+\nevent: bar:1m-confirmed\ndata: \{.+\}\n\n$/);
  });
});
