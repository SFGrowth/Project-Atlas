/**
 * gap-recovery-orchestrator.test.ts — Gap Recovery Integration Tests
 *
 * Tests the end-to-end gap recovery integration between the TypeScript bar
 * pipeline and the Python RecoveryManager.
 *
 * TEST-123A3-GRO001..GRO009
 *
 * Sprint 123A.3 — Gate G3 Revision 2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GapRecoveryOrchestrator,
  RecoveryRecord,
  RecoveryCompletion,
} from '../gap-recovery-orchestrator.js';
import { TradeBarBuilder, BridgeOhlcv1mPayload } from '../trade-bar-builder.js';
import { BarGap, BarLifecycle } from '../types/bar-lifecycle.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_TS_MS = 1705323600000;

function makeGap(overrides: Partial<BarGap> = {}): BarGap {
  return {
    dataset: 'GLBX.MDP3',
    rawSymbol: 'MNQH4',
    instrumentId: 372107,
    gapStartTsMs: BASE_TS_MS + 60_000,
    gapEndTsMs: BASE_TS_MS + 120_000,
    missingBarCount: 2,
    detectedTsMs: BASE_TS_MS + 180_000,
    ...overrides,
  };
}

function makeRecoveryRecord(recoveryId: string, barOffsetMs = 0): RecoveryRecord {
  const tsMs = BASE_TS_MS + 60_000 + barOffsetMs;
  return {
    recoveryId,
    schema: 'ohlcv-1m',
    dataset: 'GLBX.MDP3',
    raw_symbol: 'MNQH4',
    instrument_id: 372107,
    ts_event_ns: String(BigInt(tsMs) * 1_000_000n),
    open_pts100: 1950000,
    high_pts100: 1951000,
    low_pts100: 1949500,
    close_pts100: 1950500,
    volume: 50,
    trade_count: 5,
    atlas_processing_ts_ms: tsMs + 100,
  };
}

function makeCompletion(
  recoveryId: string,
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED' = 'COMPLETE',
): RecoveryCompletion {
  return {
    recoveryId,
    status,
    recoveredCount: 2,
    completedTsMs: BASE_TS_MS + 300_000,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GapRecoveryOrchestrator (Gate G3 Revision 2)', () => {
  let injectedPayloads: BridgeOhlcv1mPayload[];
  let completedResults: Array<{ status: string }>;
  let orchestrator: GapRecoveryOrchestrator;

  beforeEach(() => {
    injectedPayloads = [];
    completedResults = [];
    orchestrator = new GapRecoveryOrchestrator({
      onRecoveredBar: (payload) => injectedPayloads.push(payload),
      onRecoveryComplete: (result) => completedResults.push({ status: result.status }),
    });
  });

  it('TEST-123A3-GRO001: gap detection emits recovery:requested event', () => {
    const events: string[] = [];
    orchestrator.on('recovery:requested', () => events.push('requested'));

    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap);

    expect(request).not.toBeNull();
    expect(events).toContain('requested');
    expect(request!.gap).toEqual(gap);
    expect(request!.recoveryId).toMatch(/^REC-GLBX\.MDP3-MNQH4-/);
    expect(orchestrator.getRecoveryRequestCount()).toBe(1);
  });

  it('TEST-123A3-GRO002: duplicate gap request is suppressed', () => {
    const gap = makeGap();
    const req1 = orchestrator.onGapDetected(gap);
    const req2 = orchestrator.onGapDetected(gap); // Same gap

    expect(req1).not.toBeNull();
    expect(req2).toBeNull(); // Suppressed
    expect(orchestrator.getRecoveryRequestCount()).toBe(1);
  });

  it('TEST-123A3-GRO003: recovery record is injected into bar pipeline via callback', () => {
    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap)!;

    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 0));

    expect(injectedPayloads.length).toBe(1);
    expect(injectedPayloads[0].schema).toBe('ohlcv-1m');
    expect(injectedPayloads[0].open_pts100).toBe(1950000);
    expect(injectedPayloads[0].volume).toBe(50);
  });

  it('TEST-123A3-GRO004: recovery:progress emitted for each record', () => {
    const progressCounts: number[] = [];
    orchestrator.on('recovery:progress', (e: { recoveredCount: number }) => {
      progressCounts.push(e.recoveredCount);
    });

    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap)!;

    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 0));
    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 60_000));

    expect(progressCounts).toEqual([1, 2]);
  });

  it('TEST-123A3-GRO005: COMPLETE recovery emits recovery:complete and invokes onRecoveryComplete', () => {
    const events: string[] = [];
    orchestrator.on('recovery:complete', () => events.push('complete'));

    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap)!;
    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 0));
    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 60_000));
    orchestrator.onRecoveryCompletion(makeCompletion(request.recoveryId, 'COMPLETE'));

    expect(events).toContain('complete');
    expect(completedResults.length).toBe(1);
    expect(completedResults[0].status).toBe('COMPLETE');
    expect(orchestrator.getRecoveryCompleteCount()).toBe(1);
    // Gap key should be cleared after completion
    expect(orchestrator.getPendingGapKeys().size).toBe(0);
  });

  it('TEST-123A3-GRO006: PARTIAL recovery emits recovery:partial and invokes onRecoveryComplete', () => {
    const events: string[] = [];
    orchestrator.on('recovery:partial', () => events.push('partial'));

    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap)!;
    orchestrator.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 0));
    orchestrator.onRecoveryCompletion(makeCompletion(request.recoveryId, 'PARTIAL'));

    expect(events).toContain('partial');
    expect(completedResults.length).toBe(1); // onRecoveryComplete IS called for PARTIAL
    expect(orchestrator.getRecoveryPartialCount()).toBe(1);
  });

  it('TEST-123A3-GRO007: FAILED recovery does NOT invoke onRecoveryComplete', () => {
    const events: string[] = [];
    orchestrator.on('recovery:failed', () => events.push('failed'));

    const gap = makeGap();
    const request = orchestrator.onGapDetected(gap)!;
    orchestrator.onRecoveryCompletion(makeCompletion(request.recoveryId, 'FAILED'));

    expect(events).toContain('failed');
    expect(completedResults.length).toBe(0); // onRecoveryComplete NOT called for FAILED
    expect(orchestrator.getRecoveryFailedCount()).toBe(1);
  });

  it('TEST-123A3-GRO008: end-to-end integration with TradeBarBuilder', () => {
    const builder = new TradeBarBuilder({
      dataset: 'GLBX.MDP3',
      rawSymbol: 'MNQH4',
      instrumentId: 372107,
      pendingTimeoutMs: 90_000,
    });

    const confirmedBars: Array<{ barOpenTsMs: number }> = [];
    builder.on('bar:confirmed', (e: { bar: { barOpenTsMs: number } }) => {
      confirmedBars.push({ barOpenTsMs: e.bar.barOpenTsMs });
    });

    // Wire orchestrator to inject recovered bars into builder
    const orch = new GapRecoveryOrchestrator({
      onRecoveredBar: (payload) => builder.processOfficialOhlcv1m(payload),
      onRecoveryComplete: () => {},
    });

    // Detect a gap
    const gap = makeGap();
    const request = orch.onGapDetected(gap)!;

    // Simulate recovery records arriving
    orch.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 0));
    orch.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 60_000));
    orch.onRecoveryCompletion(makeCompletion(request.recoveryId, 'COMPLETE'));

    // Both recovered bars should be CONFIRMED in the builder
    expect(confirmedBars.length).toBe(2);
    expect(confirmedBars[0].barOpenTsMs).toBe(BASE_TS_MS + 60_000);
    expect(confirmedBars[1].barOpenTsMs).toBe(BASE_TS_MS + 120_000);
  });

  it('TEST-123A3-GRO009: unknown recoveryId in record is ignored gracefully', () => {
    // Should not throw
    expect(() => {
      orchestrator.onRecoveryRecord(makeRecoveryRecord('UNKNOWN-ID', 0));
    }).not.toThrow();
    expect(injectedPayloads.length).toBe(0);
  });
});
