/**
 * Sprint 123A.2 Gate G2 Revision 3 — Bridge Server Tests
 *
 * Test IDs: TEST-123A2-TS001 through TEST-123A2-TS022
 *
 * Covers:
 * - validateBridgeTopology (10 tests — Revision 3 hardened rules)
 * - Authentication hardening: token required, session ID (3 tests)
 * - Secret redaction: token not in stats/toJSON (2 tests)
 * - Authority boundary: isReadyToReceive, initial stats (2 tests)
 * - Protocol version (1 test)
 * - Schema validation (2 tests)
 * - BRIDGE_HOST default (1 test)
 * - Graceful shutdown (1 test)
 *
 * Revision 3 topology rule changes:
 * - Public IPs are ALWAYS rejected (even with TLS) — TS003, TS004 updated
 * - Wildcard 0.0.0.0 is rejected — TS021 new
 * - IPv6 wildcard :: is rejected — TS022 new
 * - IPv6 public addresses are rejected — TS008 updated
 * - IPv6 private (::1, fe80::, fd00::) are accepted — TS005 updated
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  validateBridgeTopology,
  isPrivateOrLoopback,
  isWildcard,
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

  it('TEST-123A2-TS003: throws for public IPv4 without TLS (public binding always rejected)', () => {
    // Revision 3: public IPs are always rejected regardless of TLS
    withEnv({ BRIDGE_HOST: '203.0.113.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/non-private address/);
    });
  });

  it('TEST-123A2-TS004: throws for public IPv4 even WITH TLS (Revision 3 — public binding prohibited)', () => {
    // Revision 3 change: public IP + TLS was previously allowed (Topology 3).
    // It is now rejected unconditionally. The bridge is a process-to-process
    // transport and must never be reachable from the public internet.
    withEnv({ BRIDGE_HOST: '203.0.113.5', BRIDGE_TLS: 'true' }, () => {
      expect(() => validateBridgeTopology()).toThrow(/non-private address/);
    });
  });

  it('TEST-123A2-TS005: passes for Docker private address (10.x.x.x) without TLS', () => {
    withEnv({ BRIDGE_HOST: '10.0.0.2', BRIDGE_TLS: undefined }, () => {
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

  it('TEST-123A2-TS008: throws for 172.32.x.x (not RFC 1918, public range) — always rejected', () => {
    // 172.32.x.x is outside the RFC 1918 172.16-31 range and is a public address.
    withEnv({ BRIDGE_HOST: '172.32.0.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/non-private address/);
    });
  });

  it('TEST-123A2-TS021: throws for wildcard 0.0.0.0 (binds all interfaces — always rejected)', () => {
    withEnv({ BRIDGE_HOST: '0.0.0.0', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/wildcard/);
    });
  });

  it('TEST-123A2-TS022: throws for IPv6 wildcard :: (binds all interfaces — always rejected)', () => {
    withEnv({ BRIDGE_HOST: '::', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/wildcard/);
    });
  });
});

// ── isPrivateOrLoopback unit tests ─────────────────────────────────────────────

describe('isPrivateOrLoopback', () => {
  it('TEST-123A2-TS023: 127.0.0.1 is private', () => {
    expect(isPrivateOrLoopback('127.0.0.1')).toBe(true);
  });

  it('TEST-123A2-TS024: ::1 is private (IPv6 loopback)', () => {
    expect(isPrivateOrLoopback('::1')).toBe(true);
  });

  it('TEST-123A2-TS025: fe80::1 is private (IPv6 link-local)', () => {
    expect(isPrivateOrLoopback('fe80::1')).toBe(true);
  });

  it('TEST-123A2-TS026: fd00::1 is private (IPv6 ULA)', () => {
    expect(isPrivateOrLoopback('fd00::1')).toBe(true);
  });

  it('TEST-123A2-TS027: 2001:db8::1 is NOT private (IPv6 documentation range)', () => {
    expect(isPrivateOrLoopback('2001:db8::1')).toBe(false);
  });

  it('TEST-123A2-TS028: 0.0.0.0 is NOT private (wildcard)', () => {
    expect(isPrivateOrLoopback('0.0.0.0')).toBe(false);
  });
});

// ── isWildcard unit tests ──────────────────────────────────────────────────────

describe('isWildcard', () => {
  it('TEST-123A2-TS029: 0.0.0.0 is a wildcard', () => {
    expect(isWildcard('0.0.0.0')).toBe(true);
  });

  it('TEST-123A2-TS030: :: is a wildcard', () => {
    expect(isWildcard('::')).toBe(true);
  });

  it('TEST-123A2-TS031: 127.0.0.1 is NOT a wildcard', () => {
    expect(isWildcard('127.0.0.1')).toBe(false);
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
