/**
 * Sprint 123A.4 — Gate G4 Security Tests
 *
 * Verifies that the Databento integration does not leak credentials,
 * does not expose internal authority modes, and maintains correct
 * isolation between the bridge, pipeline, and chart layers.
 *
 *   TEST-123A4-SEC-001  SSE events never contain DATABENTO_API_KEY
 *   TEST-123A4-SEC-002  SSE events never contain BRIDGE_AUTH_TOKEN
 *   TEST-123A4-SEC-003  SSE events never contain any key matching /api[_-]?key/i
 *   TEST-123A4-SEC-004  SSE events never contain any key matching /auth[_-]?token/i
 *   TEST-123A4-SEC-005  SSE events never contain any key matching /secret/i
 *   TEST-123A4-SEC-006  SSE events never contain any key matching /password/i
 *   TEST-123A4-SEC-007  ChartStreamEvent source field is always 'DATABENTO' (not a credential)
 *   TEST-123A4-SEC-008  Parity records never contain raw API credentials
 *   TEST-123A4-SEC-009  HealthSnapshot never contains raw API credentials
 *   TEST-123A4-SEC-010  assertSprint123A4Invariants throws on DATABENTO_CHART_AUTHORITY without flag
 *   TEST-123A4-SEC-011  assertSprint123A4Invariants throws on DATABENTO_LEARNING_AUTHORITY
 *   TEST-123A4-SEC-012  assertSprint123A4Invariants throws on DATABENTO_DECISION_AUTHORITY
 *   TEST-123A4-SEC-013  isDatabentoProcessBarTrigger returns false for TradingView source
 *   TEST-123A4-SEC-014  validatePostBarTrigger rejects Databento source in TRADINGVIEW_ONLY mode
 *   TEST-123A4-SEC-015  ChartHistoryService query returns only MATCHED bars (no PENDING/UNMATCHED)
 *   TEST-123A4-SEC-016  ChartStreamService does not expose internal pipeline state in SSE payload
 */

import { describe, it, expect } from 'vitest';
import { ChartStreamService } from '../chart-stream-service.js';
import { ParityService } from '../parity-service.js';
import { HealthStateMachine } from '../health-state-machine.js';
import {
  assertSprint123A4Invariants,
  isDatabentoProcessBarTrigger,
  validatePostBarTrigger,
} from '../config.js';
import { BarLifecycle, ReconciliationStatus, FiveMinBarType } from '../types/bar-lifecycle.js';
import type { MinuteBar, FiveMinBar } from '../types/bar-lifecycle.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockRes() {
  const written: string[] = [];
  return {
    written,
    setHeader() {},
    flushHeaders() {},
    write(data: string) { written.push(data); return true; },
    end() {},
  } as any;
}

function makeMockReq() {
  return {
    headers: {},
    on() {},
  } as any;
}

function makeConfirmedBar(): MinuteBar {
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
  } as MinuteBar;
}

/** Extract all JSON payloads from SSE writes and return as flat string. */
function extractSsePayloads(written: string[]): string {
  return written
    .filter(w => w.includes('data: '))
    .map(w => w.match(/data: (.+)/)?.[1] ?? '')
    .join('\n');
}

// ─── Credential patterns ──────────────────────────────────────────────────────

const CREDENTIAL_PATTERNS = [
  /DATABENTO_API_KEY/i,
  /BRIDGE_AUTH_TOKEN/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /secret/i,
  /password/i,
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sprint 123A.4 — Security', () => {

  it('TEST-123A4-SEC-001: SSE events never contain DATABENTO_API_KEY', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.publishHealth({ status: 'LIVE' });
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    expect(payload).not.toMatch(/DATABENTO_API_KEY/i);
  });

  it('TEST-123A4-SEC-002: SSE events never contain BRIDGE_AUTH_TOKEN', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    expect(payload).not.toMatch(/BRIDGE_AUTH_TOKEN/i);
  });

  it('TEST-123A4-SEC-003: SSE events never contain any key matching /api[_-]?key/i', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    // Should not contain "apiKey", "api_key", "API_KEY" etc as a value
    // (the key name "rawSymbol" is fine; we're checking for credential values)
    expect(payload).not.toMatch(/"api[_-]?key"\s*:/i);
  });

  it('TEST-123A4-SEC-004: SSE events never contain any key matching /auth[_-]?token/i', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    expect(payload).not.toMatch(/"auth[_-]?token"\s*:/i);
  });

  it('TEST-123A4-SEC-005: SSE events never contain any key matching /secret/i', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    expect(payload).not.toMatch(/"secret"\s*:/i);
  });

  it('TEST-123A4-SEC-006: SSE events never contain any key matching /password/i', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    expect(payload).not.toMatch(/"password"\s*:/i);
  });

  it('TEST-123A4-SEC-007: ChartStreamEvent source field is always "DATABENTO" (not a credential)', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    const parsed = JSON.parse(payload.split('\n').find(l => l.includes('"type":"bar:1m-confirmed"')) ?? '{}');
    expect(parsed.source).toBe('DATABENTO');
    // source is a label, not a credential
    for (const pattern of CREDENTIAL_PATTERNS) {
      expect(JSON.stringify(parsed)).not.toMatch(pattern.source ? new RegExp(`"(${pattern.source})"\\s*:`) : pattern);
    }
  });

  it('TEST-123A4-SEC-008: Parity records never contain raw API credentials', () => {
    const svc = new ParityService();
    svc.registerTradingViewBar({
      barOpenTsMs: 1_700_000_000_000,
      openPts100: 2_100_000,
      highPts100: 2_105_000,
      lowPts100: 2_098_000,
      closePts100: 2_103_000,
      volume: 1500,
      symbol: 'MNQM5',
      atlasTsMs: Date.now(),
    });
    const record = svc.compareConfirmedBar(makeConfirmedBar());
    expect(record).not.toBeNull();
    const serialized = JSON.stringify(record);
    for (const pattern of CREDENTIAL_PATTERNS) {
      expect(serialized).not.toMatch(pattern);
    }
  });

  it('TEST-123A4-SEC-009: HealthSnapshot never contains raw API credentials', () => {
    const sm = new HealthStateMachine();
    sm.onBarReceived(Date.now());
    const snap = sm.getSnapshot();
    const serialized = JSON.stringify(snap);
    for (const pattern of CREDENTIAL_PATTERNS) {
      expect(serialized).not.toMatch(pattern);
    }
  });

  it('TEST-123A4-SEC-010: assertSprint123A4Invariants throws on DATABENTO_CHART_AUTHORITY without flag', () => {
    // Without the G4 feature flag env var, DATABENTO_CHART_AUTHORITY must be blocked
    const prev = process.env.MARKET_DATA_AUTHORITY;
    const prevFlag = process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED;
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_CHART_AUTHORITY';
    delete process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED; // correct env var name
    try {
      expect(() => assertSprint123A4Invariants()).toThrow(/Gate G4/i);
    } finally {
      if (prev === undefined) delete process.env.MARKET_DATA_AUTHORITY;
      else process.env.MARKET_DATA_AUTHORITY = prev;
      if (prevFlag !== undefined) process.env.ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = prevFlag;
    }
  });

  it('TEST-123A4-SEC-011: assertSprint123A4Invariants throws on DATABENTO_LEARNING_AUTHORITY', () => {
    const prev = process.env.MARKET_DATA_AUTHORITY;
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_LEARNING_AUTHORITY';
    try {
      expect(() => assertSprint123A4Invariants()).toThrow(/not authorised/i);
    } finally {
      if (prev === undefined) delete process.env.MARKET_DATA_AUTHORITY;
      else process.env.MARKET_DATA_AUTHORITY = prev;
    }
  });

  it('TEST-123A4-SEC-012: assertSprint123A4Invariants throws on DATABENTO_DECISION_AUTHORITY', () => {
    const prev = process.env.MARKET_DATA_AUTHORITY;
    process.env.MARKET_DATA_AUTHORITY = 'DATABENTO_DECISION_AUTHORITY';
    try {
      expect(() => assertSprint123A4Invariants()).toThrow(/Sprint 123B/i);
    } finally {
      if (prev === undefined) delete process.env.MARKET_DATA_AUTHORITY;
      else process.env.MARKET_DATA_AUTHORITY = prev;
    }
  });

  it('TEST-123A4-SEC-013: isDatabentoProcessBarTrigger always returns false (Databento never triggers processBar)', () => {
    const result = isDatabentoProcessBarTrigger();
    expect(result).toBe(false);
  });

  it('TEST-123A4-SEC-014: validatePostBarTrigger returns error string when Databento source in TRADINGVIEW_ONLY mode', () => {
    // validatePostBarTrigger returns a string on violation, null on success
    const prev = process.env.MARKET_DATA_AUTHORITY;
    process.env.MARKET_DATA_AUTHORITY = 'TRADINGVIEW_ONLY';
    try {
      const result = validatePostBarTrigger('DATABENTO', 'TRADINGVIEW_ONLY');
      // In TRADINGVIEW_ONLY mode, DATABENTO trigger source is invalid
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
    } finally {
      if (prev === undefined) delete process.env.MARKET_DATA_AUTHORITY;
      else process.env.MARKET_DATA_AUTHORITY = prev;
    }
  });

  it('TEST-123A4-SEC-015: ChartHistoryService query returns only MATCHED bars (no PENDING/UNMATCHED)', async () => {
    // This is a design-level test: the ChartHistoryService SQL always includes
    // WHERE reconciliation_status = 'MATCHED' for 1m bars.
    // We verify this by inspecting the SQL template directly.
    const { ChartHistoryService } = await import('../chart-history-service.js');
    const svcSource = ChartHistoryService.toString();
    // The query must reference 'MATCHED'
    expect(svcSource).toContain("'MATCHED'");
    // Must NOT reference 'PENDING' or 'UNMATCHED' as allowed values
    expect(svcSource).not.toContain("'PENDING'");
    expect(svcSource).not.toContain("'UNMATCHED'");
  });

  it('TEST-123A4-SEC-016: ChartStreamService does not expose internal pipeline state in SSE payload', () => {
    const svc = new ChartStreamService();
    (svc as any).heartbeatTimer && clearInterval((svc as any).heartbeatTimer);
    const res = makeMockRes();
    svc.registerClient(makeMockReq(), res);
    svc.publishBar1m(makeConfirmedBar());
    svc.shutdown();

    const payload = extractSsePayloads(res.written);
    // Must not expose internal pipeline fields
    expect(payload).not.toContain('ringBuffer');
    expect(payload).not.toContain('clientIdCounter');
    expect(payload).not.toContain('heartbeatTimer');
    expect(payload).not.toContain('isShutdown');
  });
});
