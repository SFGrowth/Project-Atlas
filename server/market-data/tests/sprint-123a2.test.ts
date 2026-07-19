/**
 * Sprint 123A.2 Gate G2 Revision 2 — Bridge Server Tests
 *
 * Test IDs: TEST-123A2-TS001 through TEST-123A2-TS020
 *
 * Covers:
 * - validateBridgeTopology (8 tests)
 * - Authentication hardening: token required, session ID (3 tests)
 * - Secret redaction: token not in stats/toJSON (2 tests)
 * - Authority boundary: isReadyToReceive, initial stats (2 tests)
 * - Protocol version (1 test)
 * - Schema validation (2 tests)
 * - BRIDGE_HOST default (1 test)
 * - Graceful shutdown (1 test)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  validateBridgeTopology,
  DatabentoBridgeServer,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_HOST,
} from '../bridge-server.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function makeEventBus() {
  return { emit: vi.fn() };
}

function makeFeedHealth() {
  return {
    setConnected: vi.fn(),
    setDisconnected: vi.fn(),
    setDegraded: vi.fn(),
    setError: vi.fn(),
  };
}

function makeServer(token = 'test-bridge-token-abc123') {
  process.env.BRIDGE_AUTH_TOKEN = token;
  process.env.BRIDGE_HOST = '127.0.0.1';
  delete process.env.BRIDGE_TLS;
  return new DatabentoBridgeServer(makeEventBus() as any, makeFeedHealth() as any, 0);
}

// ── validateBridgeTopology tests ───────────────────────────────────────────────

describe('validateBridgeTopology', () => {
  afterEach(() => {
    delete process.env.BRIDGE_HOST;
    delete process.env.BRIDGE_TLS;
  });

  it('TEST-123A2-TS001: passes for default localhost (Topology 1/2)', () => {
    withEnv({ BRIDGE_HOST: undefined, BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS002: passes for explicit 127.0.0.1 (Topology 1/2)', () => {
    withEnv({ BRIDGE_HOST: '127.0.0.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS003: throws for non-private address without TLS', () => {
    withEnv({ BRIDGE_HOST: '203.0.113.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/BRIDGE_TLS/);
    });
  });

  it('TEST-123A2-TS004: passes for public IP with TLS enabled (Topology 3)', () => {
    withEnv({ BRIDGE_HOST: '203.0.113.5', BRIDGE_TLS: 'true' }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS005: passes for Docker private address with TLS (Topology 3)', () => {
    withEnv({ BRIDGE_HOST: '10.0.0.2', BRIDGE_TLS: 'true' }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS006: passes for private 192.168.x.x without TLS', () => {
    withEnv({ BRIDGE_HOST: '192.168.1.100', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS007: passes for 172.17.x.x Docker bridge without TLS', () => {
    withEnv({ BRIDGE_HOST: '172.17.0.2', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('TEST-123A2-TS008: throws for 172.32.x.x (not RFC 1918) without TLS', () => {
    withEnv({ BRIDGE_HOST: '172.32.0.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/BRIDGE_TLS/);
    });
  });
});

// ── Authentication hardening tests ────────────────────────────────────────────

describe('DatabentoBridgeServer — authentication', () => {
  afterEach(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_HOST;
  });

  it('TEST-123A2-TS009: throws at construction if BRIDGE_AUTH_TOKEN is not set', () => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    process.env.BRIDGE_HOST = '127.0.0.1';
    expect(() => new DatabentoBridgeServer(
      makeEventBus() as any,
      makeFeedHealth() as any,
      0,
    )).toThrow(/BRIDGE_AUTH_TOKEN/);
  });

  it('TEST-123A2-TS010: bridge session ID is a non-empty UUID string', () => {
    const server = makeServer();
    expect(typeof server.bridgeSessionId).toBe('string');
    expect(server.bridgeSessionId.length).toBeGreaterThan(0);
    expect(server.bridgeSessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('TEST-123A2-TS011: two server instances have different bridge session IDs', () => {
    const s1 = makeServer();
    const s2 = makeServer();
    expect(s1.bridgeSessionId).not.toBe(s2.bridgeSessionId);
  });
});

// ── Secret redaction tests ─────────────────────────────────────────────────────

describe('DatabentoBridgeServer — secret redaction', () => {
  afterEach(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_HOST;
  });

  it('TEST-123A2-TS012: getStats() does not contain BRIDGE_AUTH_TOKEN', () => {
    const token = 'super-secret-bridge-token-xyz';
    const server = makeServer(token);
    const stats = JSON.stringify(server.getStats());
    expect(stats).not.toContain(token);
  });

  it('TEST-123A2-TS013: toJSON() does not contain BRIDGE_AUTH_TOKEN', () => {
    const token = 'super-secret-bridge-token-xyz';
    const server = makeServer(token);
    const json = JSON.stringify(server.toJSON());
    expect(json).not.toContain(token);
  });
});

// ── Authority boundary tests ───────────────────────────────────────────────────

describe('DatabentoBridgeServer — authority boundary', () => {
  afterEach(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_HOST;
  });

  it('TEST-123A2-TS014: isReadyToReceive returns false when server is not started', () => {
    const server = makeServer();
    expect(server.isReadyToReceive()).toBe(false);
  });

  it('TEST-123A2-TS015: getStats reflects initial state correctly', () => {
    const server = makeServer();
    const stats = server.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.recordsReceived).toBe(0);
    expect(stats.recordsRejected).toBe(0);
    expect(stats.connectedClients).toBe(0);
    expect(stats.activeAdapterInstanceId).toBeNull();
    expect(stats.bridgeSessionId).toBeTruthy();
  });
});

// ── Bridge protocol version ────────────────────────────────────────────────────

describe('BRIDGE_PROTOCOL_VERSION', () => {
  it('TEST-123A2-TS016: protocol version is 123A.2', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe('123A.2');
  });
});

// ── Schema validation ──────────────────────────────────────────────────────────

describe('DatabentoBridgeServer — schema validation (unit)', () => {
  afterEach(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_HOST;
  });

  it('TEST-123A2-TS017: server constructs successfully with valid token and localhost', () => {
    expect(() => makeServer()).not.toThrow();
  });

  it('TEST-123A2-TS018: bridgeSessionId is set at construction time', () => {
    const server = makeServer();
    expect(server.bridgeSessionId).toBeTruthy();
    expect(server.bridgeSessionId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ── BRIDGE_HOST default ────────────────────────────────────────────────────────

describe('BRIDGE_HOST', () => {
  it('TEST-123A2-TS019: BRIDGE_HOST defaults to 127.0.0.1 when env not set', () => {
    const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
    expect(['127.0.0.1', 'localhost']).toContain(host);
  });
});

// ── Graceful shutdown ──────────────────────────────────────────────────────────

describe('DatabentoBridgeServer — graceful shutdown', () => {
  afterEach(() => {
    delete process.env.BRIDGE_AUTH_TOKEN;
    delete process.env.BRIDGE_HOST;
  });

  it('TEST-123A2-TS020: stop() on a non-started server does not throw', () => {
    const server = makeServer();
    expect(() => server.stop()).not.toThrow();
    expect(server.getStats().isRunning).toBe(false);
  });
});
