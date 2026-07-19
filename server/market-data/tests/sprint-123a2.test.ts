/**
 * Sprint 123A.2 — Bridge Topology Tests
 * Gate G2 Round 2 — Workstream 4
 *
 * Tests for validateBridgeTopology() in bridge-server.ts.
 * Verifies that the topology validation function correctly enforces
 * the security invariants for all three deployment topologies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateBridgeTopology, BRIDGE_PROTOCOL_VERSION } from '../bridge-server.js';

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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('validateBridgeTopology', () => {
  it('passes for default localhost (Topology 1/2)', () => {
    withEnv({ BRIDGE_HOST: undefined, BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('passes for explicit 127.0.0.1 (Topology 1/2)', () => {
    withEnv({ BRIDGE_HOST: '127.0.0.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('passes for private network address with TLS (Topology 3)', () => {
    withEnv({ BRIDGE_HOST: '10.0.0.2', BRIDGE_TLS: 'true' }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('passes for Docker private address with TLS (Topology 3)', () => {
    withEnv({ BRIDGE_HOST: '172.17.0.2', BRIDGE_TLS: 'true' }, () => {
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });

  it('throws for non-private address without TLS', () => {
    withEnv({ BRIDGE_HOST: '203.0.113.1', BRIDGE_TLS: undefined }, () => {
      expect(() => validateBridgeTopology()).toThrow(/BRIDGE_TLS/);
    });
  });

  it('throws for non-private address with TLS=false', () => {
    withEnv({ BRIDGE_HOST: '203.0.113.1', BRIDGE_TLS: 'false' }, () => {
      expect(() => validateBridgeTopology()).toThrow(/BRIDGE_TLS/);
    });
  });

  it('passes for private 192.168.x.x without TLS', () => {
    withEnv({ BRIDGE_HOST: '192.168.1.100', BRIDGE_TLS: undefined }, () => {
      // Private network — TLS not required (but recommended)
      expect(() => validateBridgeTopology()).not.toThrow();
    });
  });
});

describe('BRIDGE_PROTOCOL_VERSION', () => {
  it('is set to 123A.2', () => {
    expect(BRIDGE_PROTOCOL_VERSION).toBe('123A.2');
  });
});
