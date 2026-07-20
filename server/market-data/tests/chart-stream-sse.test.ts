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

// ─── Option B reconnect scenario tests (SSE-020 through SSE-031) ─────────────
// These tests prove the query cursor (?afterEventId=<seq>) design.
// The server-side router injects ?afterEventId into Last-Event-ID header
// before calling registerClient(). These tests prove the full round-trip
// behaviour at the ChartStreamService level.

describe('Sprint 123A.4 — ChartStreamService Option B Reconnect Scenarios', () => {

  let svc: ChartStreamService;

  beforeEach(() => {
    svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    (svc as any).heartbeatTimer = null;
  });

  it('TEST-123A4-SSE-020: Initial connection (no cursor) receives no replay — only ping', () => {
    // Pre-publish 3 confirmed bars before client connects
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    // New client with no Last-Event-ID (first connection, cursor = "0")
    const req = makeMockReq(); // no lastEventId
    const res = makeMockRes();
    svc.registerClient(req, res);

    // Should only receive the initial ping — no replay of pre-existing bars
    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(0);
    const pings = res.written.filter(w => w.includes('"type":"ping"'));
    expect(pings.length).toBe(1);
  });

  it('TEST-123A4-SSE-021: Each confirmed event has a monotonically increasing id field', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);

    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    const confirmedWrites = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedWrites.length).toBe(3);

    const ids = confirmedWrites.map(w => {
      const match = w.match(/^id: (\d+)/);
      return match ? parseInt(match[1], 10) : -1;
    });

    // IDs must be strictly increasing
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });

  it('TEST-123A4-SSE-022: Reconnect with cursor replays only missed confirmed bars', () => {
    // Publish bars 1, 2, 3 (seq 1, 2, 3)
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    // Client reconnects with afterEventId=2 (missed bar 3 only)
    const req = makeMockReq('2'); // Last-Event-ID = 2 (injected from ?afterEventId=2)
    const res = makeMockRes();
    svc.registerClient(req, res);

    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(1); // only bar 3 replayed

    const parsed = JSON.parse(confirmedReplays[0].match(/data: (.+)/)?.[1] ?? '{}');
    expect(parsed.barOpenTsMs).toBe(3_000);
  });

  it('TEST-123A4-SSE-023: Reconnect replays all missed events when cursor is 1 behind', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 4_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 5_000 }));

    // Client missed bars 3, 4, 5 (cursor = 2)
    const req = makeMockReq('2');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(3);
  });

  it('TEST-123A4-SSE-024: Developing bars are NOT replayed on reconnect', () => {
    // Publish a confirmed anchor bar first (seq=1) so the ring buffer is non-empty
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 500 })); // seq=1 — anchor

    // Publish a developing bar — this increments sequence but does NOT go into the ring buffer
    const devBar = makeConfirmedBar({ lifecycle: BarLifecycle.DEVELOPING, barOpenTsMs: 1_000 });
    svc.publishDeveloping(devBar); // seq=2 — NOT buffered

    // Publish a confirmed bar — this DOES go into the ring buffer (seq=3)
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 })); // seq=3

    // Reconnect with cursor=1 (oldest buffered = seq=1, so cursor=1 is within range)
    // Replay: events with id > 1 that are in the ring buffer = seq=3 (confirmed bar only)
    const req = makeMockReq('1');
    const res = makeMockRes();
    svc.registerClient(req, res);

    // Developing bar must NOT be replayed (it was never buffered)
    const developingReplays = res.written.filter(w => w.includes('"type":"bar:developing"'));
    expect(developingReplays.length).toBe(0);

    // Confirmed bars replayed: anchor (seq=1 is NOT > 1) and the second bar (seq=3 IS > 1)
    // So only 1 confirmed bar replayed
    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(1);
  });

  it('TEST-123A4-SSE-025: Expired cursor sends cursor-expired with expiredCursor in payload', () => {
    // Publish 2 bars (seq 1, 2)
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));

    // Client reconnects with cursor=0 (before oldest buffered seq=1)
    const req = makeMockReq('0');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const expiredWrite = res.written.find(w => w.includes('"type":"cursor-expired"'));
    expect(expiredWrite).toBeDefined();

    const parsed = JSON.parse(expiredWrite!.match(/data: (.+)/)?.[1] ?? '{}');
    expect(parsed.payload.expiredCursor).toBe(0);
    expect(typeof parsed.payload.oldestAvailable).toBe('number');
    expect(parsed.payload.oldestAvailable).toBeGreaterThan(0);
  });

  it('TEST-123A4-SSE-026: After cursor-expired, client can re-register with fresh cursor and get replay', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    // First: expired cursor
    const req1 = makeMockReq('0');
    const res1 = makeMockRes();
    svc.registerClient(req1, res1);
    req1.emit('close'); // disconnect

    // After history reload, reconnect with cursor = oldest available
    const oldestSeq = svc.getOldestBufferedSeq()!;
    const req2 = makeMockReq(String(oldestSeq)); // cursor = oldest seq
    const res2 = makeMockRes();
    svc.registerClient(req2, res2);

    // Should replay bars after oldestSeq (bars 2 and 3)
    const confirmedReplays = res2.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(2);
  });

  it('TEST-123A4-SSE-027: No duplicate confirmed candles on reconnect (cursor is exact)', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 3_000 }));

    const seqAfterThree = svc.getSequence(); // = 3

    // Client reconnects with cursor = seqAfterThree (has all bars)
    const req = makeMockReq(String(seqAfterThree));
    const res = makeMockRes();
    svc.registerClient(req, res);

    // Should receive NO confirmed replays (already has all bars)
    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(0);
  });

  it('TEST-123A4-SSE-028: Malformed cursor (non-numeric) is ignored — no replay, no crash', () => {
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 }));
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 2_000 }));

    // Malformed cursor
    const req = makeMockReq('not-a-number');
    const res = makeMockRes();
    expect(() => svc.registerClient(req, res)).not.toThrow();

    // No replay should occur (cursor ignored)
    const confirmedReplays = res.written.filter(w => w.includes('"type":"bar:1m-confirmed"'));
    expect(confirmedReplays.length).toBe(0);
  });

  it('TEST-123A4-SSE-029: 5m confirmed bars are replayed on reconnect', () => {
    // Publish a 1m bar first to establish seq=1 as the oldest buffered event
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 })); // seq=1
    svc.publishBar5m(makeFiveMinBar()); // seq=2
    svc.publishBar5m(makeFiveMinBar()); // seq=3

    // Client reconnects with cursor=1 (within ring buffer range)
    // Should replay: 5m bar at seq=2 and seq=3
    const req = makeMockReq('1');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const fiveMinReplays = res.written.filter(w => w.includes('"type":"bar:5m-confirmed"'));
    expect(fiveMinReplays.length).toBe(2);
  });

  it('TEST-123A4-SSE-030: contract-roll events are replayed on reconnect', () => {
    // Publish a 1m bar first to establish seq=1 as oldest buffered
    svc.publishBar1m(makeConfirmedBar({ barOpenTsMs: 1_000 })); // seq=1
    svc.publishContractRoll({ oldSymbol: 'MNQM5', newSymbol: 'MNQU5' }); // seq=2

    // Client reconnects with cursor=1 (within ring buffer range)
    // Should replay: contract-roll at seq=2
    const req = makeMockReq('1');
    const res = makeMockRes();
    svc.registerClient(req, res);

    const rollReplays = res.written.filter(w => w.includes('"type":"contract-roll"'));
    expect(rollReplays.length).toBe(1);
  });

  it('TEST-123A4-SSE-031: SSE event data never contains DATABENTO_API_KEY or BRIDGE_AUTH_TOKEN', () => {
    const req = makeMockReq();
    const res = makeMockRes();
    svc.registerClient(req, res);

    svc.publishBar1m(makeConfirmedBar());
    svc.publishBar5m(makeFiveMinBar());
    svc.publishHealth({ status: 'LIVE' });
    svc.publishContractRoll({ oldSymbol: 'MNQM5', newSymbol: 'MNQU5' });

    const allData = res.written.join('\n');
    expect(allData).not.toContain('DATABENTO_API_KEY');
    expect(allData).not.toContain('BRIDGE_AUTH_TOKEN');
    expect(allData).not.toContain('api_key');
    expect(allData).not.toContain('auth_token');
  });
});
