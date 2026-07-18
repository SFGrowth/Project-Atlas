/**
 * Atlas Databento Bridge Server Tests
 * Sprint 123A.2 — Fixture-based unit tests
 *
 * Tests the DatabentoBridgeServer, BridgeReadinessReporter, and
 * bridge protocol validation using mocked dependencies.
 *
 * All tests use fixtures only — no live Databento connection.
 * No authority mode changes. No processBar or postBarAutomation calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set env before any module is evaluated
process.env.BRIDGE_AUTH_TOKEN = 'test-bridge-token-not-real';
process.env.MARKET_DATA_AUTHORITY = 'TRADINGVIEW_ONLY';

// ── Hoisted mocks (must be defined before vi.mock factories run) ───────────────
const { mockGetMarketDataAuthority, mockWssClients, mockWssClose, mockWssSend } =
  vi.hoisted(() => ({
    mockGetMarketDataAuthority: vi.fn(() => 'TRADINGVIEW_ONLY' as const),
    mockWssClients: new Set<object>(),
    mockWssClose: vi.fn(),
    mockWssSend: vi.fn(),
  }));

// ── Mock ws module ─────────────────────────────────────────────────────────────
vi.mock('ws', () => {
  const { EventEmitter } = require('events');
  class MockWebSocketServer extends EventEmitter {
    clients = mockWssClients;
    close = mockWssClose;
    constructor(_opts?: object) {
      super();
    }
  }
  class MockWebSocket extends EventEmitter {
    send = mockWssSend;
    close = vi.fn();
    readyState = 1;
  }
  return { WebSocketServer: MockWebSocketServer, WebSocket: MockWebSocket };
});

// ── Mock config ────────────────────────────────────────────────────────────────
vi.mock('./market-data/config.js', () => ({
  getMarketDataAuthority: () => mockGetMarketDataAuthority(),
  assertSprint123A1Invariants: vi.fn(),
  validatePostBarTrigger: vi.fn(() => ({ valid: true })),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────
import {
  BRIDGE_PROTOCOL_VERSION,
  DatabentoBridgeServer,
  createBridgeServer,
} from './market-data/bridge-server.js';
import { BridgeReadinessReporter } from './market-data/bridge-readiness.js';
import { AtlasEventBus } from './market-data/event-bus.js';
import { FeedHealthMonitor } from './market-data/feed-health.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEnvelope(
  schema: string,
  payload: object,
  version = BRIDGE_PROTOCOL_VERSION,
) {
  return JSON.stringify({ version, schema, ts_sent_ms: Date.now(), payload });
}

function makeTradePayload() {
  return {
    instrument_id: 12345,
    raw_symbol: 'MNQM5',
    canonical_symbol: 'MNQ1!',
    ts_event_ns: 1_700_000_000_000_000_000,
    ts_recv_ns: 1_700_000_000_001_000_000,
    price_usd: 18500.25,
    size: 2,
    side: 'B',
    sequence: 100001,
    flags: 0,
  };
}

function makeOhlcvPayload() {
  return {
    instrument_id: 12345,
    raw_symbol: 'MNQM5',
    canonical_symbol: 'MNQ1!',
    ts_event_ns: 1_700_000_000_000_000_000,
    open_usd: 18490.0,
    high_usd: 18510.0,
    low_usd: 18485.0,
    close_usd: 18500.25,
    volume: 150,
    vwap_usd: null,
  };
}

type HandleMessageFn = { handleMessage: (d: Buffer) => void };

// ── Test setup ─────────────────────────────────────────────────────────────────

let eventBus: AtlasEventBus;
let feedHealth: FeedHealthMonitor;
let bridgeServer: DatabentoBridgeServer;

beforeEach(() => {
  vi.clearAllMocks();
  mockWssClients.clear();
  mockGetMarketDataAuthority.mockReturnValue('TRADINGVIEW_ONLY');
  process.env.BRIDGE_AUTH_TOKEN = 'test-bridge-token-not-real';
  eventBus = new AtlasEventBus();
  feedHealth = new FeedHealthMonitor();
  bridgeServer = new DatabentoBridgeServer(eventBus, feedHealth);
});

afterEach(() => {
  bridgeServer.stop();
});

// ── TEST-123A2-001: Bridge protocol version ────────────────────────────────────

describe('TEST-123A2-001: Bridge protocol version', () => {
  it('BRIDGE_PROTOCOL_VERSION is 123A.2', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe('123A.2');
  });

  it('Protocol version is a non-empty string', () => {
    expect(typeof BRIDGE_PROTOCOL_VERSION).toBe('string');
    expect(BRIDGE_PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });
});

// ── TEST-123A2-002: Bridge server construction ─────────────────────────────────

describe('TEST-123A2-002: Bridge server construction', () => {
  it('Throws if BRIDGE_AUTH_TOKEN is not set', () => {
    const saved = process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_AUTH_TOKEN;
    expect(() => new DatabentoBridgeServer(eventBus, feedHealth)).toThrow(
      'BRIDGE_AUTH_TOKEN',
    );
    process.env.BRIDGE_AUTH_TOKEN = saved;
  });

  it('Does not throw when BRIDGE_AUTH_TOKEN is set', () => {
    expect(() => new DatabentoBridgeServer(eventBus, feedHealth)).not.toThrow();
  });

  it('Auth token is not exposed in any serialised property', () => {
    const server = new DatabentoBridgeServer(eventBus, feedHealth);
    const serialised = JSON.stringify(server);
    expect(serialised).not.toContain('test-bridge-token-not-real');
  });
});

// ── TEST-123A2-003: createBridgeServer factory ─────────────────────────────────

describe('TEST-123A2-003: createBridgeServer factory', () => {
  it('Returns null when BRIDGE_AUTH_TOKEN is not set', () => {
    const saved = process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_AUTH_TOKEN;
    const result = createBridgeServer(eventBus, feedHealth);
    expect(result).toBeNull();
    process.env.BRIDGE_AUTH_TOKEN = saved;
  });

  it('Returns a DatabentoBridgeServer when BRIDGE_AUTH_TOKEN is set', () => {
    const result = createBridgeServer(eventBus, feedHealth);
    expect(result).toBeInstanceOf(DatabentoBridgeServer);
  });
});

// ── TEST-123A2-004: Message validation — invalid JSON ─────────────────────────

describe('TEST-123A2-004: Message validation — invalid JSON', () => {
  it('Rejects invalid JSON without throwing', () => {
    const before = bridgeServer.getStats().recordsRejected;
    (bridgeServer as unknown as HandleMessageFn).handleMessage(
      Buffer.from('not valid json'),
    );
    expect(bridgeServer.getStats().recordsRejected).toBe(before + 1);
  });
});

// ── TEST-123A2-005: Message validation — wrong protocol version ───────────────

describe('TEST-123A2-005: Message validation — wrong protocol version', () => {
  it('Rejects records with wrong protocol version', () => {
    const msg = makeEnvelope('trades', makeTradePayload(), '0.0.0-wrong');
    const before = bridgeServer.getStats().recordsRejected;
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));
    expect(bridgeServer.getStats().recordsRejected).toBe(before + 1);
    expect(bridgeServer.getStats().recordsReceived).toBe(0);
  });
});

// ── TEST-123A2-006: Message validation — unknown schema ───────────────────────

describe('TEST-123A2-006: Message validation — unknown schema', () => {
  it('Rejects records with unknown schema', () => {
    const msg = makeEnvelope('unknown-schema', { test: true });
    const before = bridgeServer.getStats().recordsRejected;
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));
    expect(bridgeServer.getStats().recordsRejected).toBe(before + 1);
  });
});

// ── TEST-123A2-007: Valid trade record accepted ────────────────────────────────

describe('TEST-123A2-007: Valid trade record accepted', () => {
  it('Accepts valid trades record and emits to event bus', () => {
    const emitted: object[] = [];
    eventBus.on('databento:trade', (payload) => emitted.push(payload));

    const msg = makeEnvelope('trades', makeTradePayload());
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));

    expect(bridgeServer.getStats().recordsReceived).toBe(1);
    expect(emitted).toHaveLength(1);
    expect(
      (emitted[0] as { canonical_symbol: string }).canonical_symbol,
    ).toBe('MNQ1!');
  });
});

// ── TEST-123A2-008: Valid ohlcv-1m record accepted ────────────────────────────

describe('TEST-123A2-008: Valid ohlcv-1m record accepted', () => {
  it('Accepts valid ohlcv-1m record and emits to event bus', () => {
    const emitted: object[] = [];
    eventBus.on('databento:ohlcv-1m', (payload) => emitted.push(payload));

    const msg = makeEnvelope('ohlcv-1m', makeOhlcvPayload());
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));

    expect(bridgeServer.getStats().recordsReceived).toBe(1);
    expect(emitted).toHaveLength(1);
  });
});

// ── TEST-123A2-009: ohlcv-1m does not trigger processBar ─────────────────────

describe('TEST-123A2-009: ohlcv-1m record does not trigger processBar', () => {
  it('Bridge server emits to databento:ohlcv-1m only — bar channel not triggered', () => {
    const processBarCalled = vi.fn();
    eventBus.on('bar', processBarCalled);

    const msg = makeEnvelope('ohlcv-1m', makeOhlcvPayload());
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));

    expect(processBarCalled).not.toHaveBeenCalled();
  });
});

// ── TEST-123A2-010: Bridge server source does not import processBar ────────────

describe('TEST-123A2-010: Bridge server source does not reference processBar or postBarAutomation', () => {
  it('bridge-server.ts non-comment source contains no processBar or postBarAutomation', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const dir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(dir, 'market-data', 'bridge-server.ts'),
      'utf8',
    );
    const nonCommentLines = source
      .split('\n')
      .filter(
        (line) =>
          !line.trim().startsWith('//') && !line.trim().startsWith('*'),
      )
      .join('\n');
    expect(nonCommentLines).not.toContain('postBarAutomation');
    expect(nonCommentLines).not.toContain('processBar(');
  });
});

// ── TEST-123A2-011: Bridge server stats ───────────────────────────────────────

describe('TEST-123A2-011: Bridge server stats', () => {
  it('Stats start at zero', () => {
    const stats = bridgeServer.getStats();
    expect(stats.recordsReceived).toBe(0);
    expect(stats.recordsRejected).toBe(0);
    expect(stats.connectedClients).toBe(0);
    expect(stats.lastRecordTs).toBeNull();
    expect(stats.lastRecordSchema).toBeNull();
  });

  it('recordsReceived increments on valid record', () => {
    const msg = makeEnvelope('trades', makeTradePayload());
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));
    expect(bridgeServer.getStats().recordsReceived).toBe(1);
  });

  it('lastRecordSchema is updated on valid record', () => {
    const msg = makeEnvelope('ohlcv-1m', makeOhlcvPayload());
    (bridgeServer as unknown as HandleMessageFn).handleMessage(Buffer.from(msg));
    expect(bridgeServer.getStats().lastRecordSchema).toBe('ohlcv-1m');
  });
});

// ── TEST-123A2-012: BridgeReadinessReporter — DISABLED in TRADINGVIEW_ONLY ────

describe('TEST-123A2-012: BridgeReadinessReporter — DISABLED in TRADINGVIEW_ONLY', () => {
  it('Reports DISABLED when authority is TRADINGVIEW_ONLY', () => {
    mockGetMarketDataAuthority.mockReturnValue('TRADINGVIEW_ONLY');
    const reporter = new BridgeReadinessReporter(null, feedHealth);
    expect(reporter.getReport().status).toBe('DISABLED');
    expect(reporter.getReport().bridgeServer).toBeNull();
  });

  it('isReady returns false when DISABLED', () => {
    mockGetMarketDataAuthority.mockReturnValue('TRADINGVIEW_ONLY');
    const reporter = new BridgeReadinessReporter(null, feedHealth);
    expect(reporter.isReady()).toBe(false);
  });
});

// ── TEST-123A2-013: BridgeReadinessReporter — STARTING when no clients ────────

describe('TEST-123A2-013: BridgeReadinessReporter — STARTING when no clients connected', () => {
  it('Reports STARTING or ERROR when bridge is running but no adapter connected', () => {
    mockGetMarketDataAuthority.mockReturnValue('DATABENTO_SHADOW' as ReturnType<typeof mockGetMarketDataAuthority>);
    bridgeServer.start();
    const reporter = new BridgeReadinessReporter(bridgeServer, feedHealth);
    const report = reporter.getReport();
    expect(['STARTING', 'ERROR']).toContain(report.status);
  });
});

// ── TEST-123A2-014: Authority boundary — readiness DISABLED when bridge null ──

describe('TEST-123A2-014: Authority boundary — readiness DISABLED when bridge server is null', () => {
  it('Readiness reporter reports DISABLED when bridge server is null', () => {
    mockGetMarketDataAuthority.mockReturnValue('TRADINGVIEW_ONLY');
    const reporter = new BridgeReadinessReporter(null, feedHealth);
    expect(reporter.getReport().status).toBe('DISABLED');
  });
});

// ── TEST-123A2-015: All valid schemas are accepted ────────────────────────────

describe('TEST-123A2-015: All valid schemas are accepted', () => {
  const validSchemas = [
    'trades',
    'ohlcv-1m',
    'definition',
    'symbol-mapping',
    'feed-health',
  ];

  for (const schema of validSchemas) {
    it(`Accepts schema: ${schema}`, () => {
      const msg = makeEnvelope(schema, { test: true });
      const before = bridgeServer.getStats().recordsReceived;
      (bridgeServer as unknown as HandleMessageFn).handleMessage(
        Buffer.from(msg),
      );
      expect(bridgeServer.getStats().recordsReceived).toBe(before + 1);
    });
  }
});

// ── TEST-123A2-016: Multiple records increment counter correctly ───────────────

describe('TEST-123A2-016: Multiple records increment counter correctly', () => {
  it('recordsReceived increments for each valid record', () => {
    for (let i = 0; i < 5; i++) {
      const msg = makeEnvelope('trades', makeTradePayload());
      (bridgeServer as unknown as HandleMessageFn).handleMessage(
        Buffer.from(msg),
      );
    }
    expect(bridgeServer.getStats().recordsReceived).toBe(5);
  });
});

// ── TEST-123A2-017: Mixed valid and invalid records ────────────────────────────

describe('TEST-123A2-017: Mixed valid and invalid records', () => {
  it('Counts valid and rejected records independently', () => {
    (bridgeServer as unknown as HandleMessageFn).handleMessage(
      Buffer.from(makeEnvelope('trades', makeTradePayload())),
    );
    (bridgeServer as unknown as HandleMessageFn).handleMessage(
      Buffer.from('bad json'),
    );
    (bridgeServer as unknown as HandleMessageFn).handleMessage(
      Buffer.from(makeEnvelope('ohlcv-1m', makeOhlcvPayload())),
    );
    (bridgeServer as unknown as HandleMessageFn).handleMessage(
      Buffer.from(makeEnvelope('bad-schema', {})),
    );

    expect(bridgeServer.getStats().recordsReceived).toBe(2);
    expect(bridgeServer.getStats().recordsRejected).toBe(2);
  });
});
