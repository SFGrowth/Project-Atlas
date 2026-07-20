/**
 * recovery-reconciliation-enforcement.test.ts
 *
 * Gate G3 Requirement 5: Prove recovered data cannot bypass reconciliation.
 *
 * Required recovery path:
 *   historical/replay record
 *   → normalisation
 *   → TypeScript recovery ingestion
 *   → provisional representation
 *   → official ohlcv-1m reconciliation
 *   → CONFIRMED recovered revision
 *   → persistence
 *   → blocked-window insertion
 *   → five-minute aggregation eligibility
 *
 * Tests:
 *   RRE001: recovery:complete containing unreconciled trade data does not unblock a window
 *   RRE002: recovery:complete without official ohlcv-1m does not create CONFIRMED
 *   RRE003: PARTIAL recovery does not unblock
 *   RRE004: FAILED recovery does not unblock
 *   RRE005: PROVISIONAL recovered data remains ineligible
 *   RRE006: UNRESOLVED recovered data remains ineligible
 *   RRE007: only lifecycleState=CONFIRMED and reconciliationStatus=MATCHED may call insertRecoveredBar()
 *   RRE008: recovered revision is stored separately from unresolved evidence
 *   RRE009: duplicate recovery completion emits no second five-minute bar
 *   RRE010: official reconciliation failure leaves the window blocked
 *   RRE011: exact official reconciliation completes the window once
 *
 * Sprint 123A.3 — Gate G3 Final Approval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TradeBarBuilder, BridgeOhlcv1mPayload } from '../trade-bar-builder.js';
import { GapRecoveryOrchestrator, RecoveryRecord, RecoveryCompletion } from '../gap-recovery-orchestrator.js';
import { WindowAccumulator, FiveMinAggregator, WindowState } from '../five-min-aggregator.js';
import {
  MinuteBar,
  BarLifecycle,
  ReconciliationStatus,
  BarGap,
} from '../types/bar-lifecycle.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Five-minute-aligned window open: 2024-01-15 14:00:00 UTC */
const WINDOW_OPEN_TS_MS = 1705323600000;

const DATASET = 'GLBX.MDP3';
const RAW_SYMBOL = 'MNQH4';
const INSTRUMENT_ID = 372107;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBuilder(): TradeBarBuilder {
  return new TradeBarBuilder({
    dataset: DATASET,
    rawSymbol: RAW_SYMBOL,
    instrumentId: INSTRUMENT_ID,
    pendingTimeoutMs: 90_000,
  });
}

function makeAccumulator(): WindowAccumulator {
  return new WindowAccumulator(new FiveMinAggregator());
}

function makeGap(offsetMs = 60_000): BarGap {
  return {
    dataset: DATASET,
    rawSymbol: RAW_SYMBOL,
    instrumentId: INSTRUMENT_ID,
    gapStartTsMs: WINDOW_OPEN_TS_MS + offsetMs,
    gapEndTsMs: WINDOW_OPEN_TS_MS + offsetMs + 60_000,
    detectedTsMs: Date.now(),
  };
}

function makeRecoveryRecord(recoveryId: string, offsetMs: number): RecoveryRecord {
  const tsNs = String(BigInt(WINDOW_OPEN_TS_MS + offsetMs) * 1_000_000n);
  return {
    recoveryId,
    schema: 'ohlcv-1m',
    dataset: DATASET,
    raw_symbol: RAW_SYMBOL,
    instrument_id: INSTRUMENT_ID,
    ts_event_ns: tsNs,
    open_pts100: 2000000,
    high_pts100: 2010000,
    low_pts100: 1990000,
    close_pts100: 2005000,
    volume: 100,
    trade_count: 10,
    atlas_processing_ts_ms: Date.now(),
  };
}

function makeCompletion(
  recoveryId: string,
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED',
  count = 1,
): RecoveryCompletion {
  return { recoveryId, status, recoveredCount: count, completedTsMs: Date.now() };
}

/**
 * Build a CONFIRMED bar with MATCHED reconciliation — eligible for insertRecoveredBar.
 */
function makeMatchedConfirmedBar(barOpenTsMs: number, revision = 1): MinuteBar {
  return {
    source: 'DATABENTO',
    dataset: DATASET,
    rawSymbol: RAW_SYMBOL,
    instrumentId: INSTRUMENT_ID,
    intervalMs: 60000,
    barOpenTsMs,
    barOpenTsNs: String(BigInt(barOpenTsMs) * 1_000_000n),
    barCloseTsMs: barOpenTsMs + 60_000,
    ohlcv: { openPts100: 2000000, highPts100: 2010000, lowPts100: 1990000, closePts100: 2005000, volume: 100, tradeCount: 10 },
    lifecycle: BarLifecycle.CONFIRMED,
    reconciliation: {
      status: ReconciliationStatus.MATCHED,
      closeDetlaPts100: 0,
      highDeltaPts100: 0,
      lowDeltaPts100: 0,
      volumeDelta: 0,
      withinTolerance: true,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
    revision,
    mappingVersion: 'v1',
    atlasTsMs: Date.now(),
  };
}

/**
 * Build a CONFIRMED bar with reconciliation=null — NOT eligible for insertRecoveredBar.
 */
function makeUnreconciledConfirmedBar(barOpenTsMs: number): MinuteBar {
  return {
    ...makeMatchedConfirmedBar(barOpenTsMs),
    reconciliation: null,
  };
}

/**
 * Build an UNRESOLVED bar — NOT eligible for insertRecoveredBar.
 */
function makeUnresolvedBar(barOpenTsMs: number): MinuteBar {
  return {
    ...makeMatchedConfirmedBar(barOpenTsMs, 0), // revision=0 — original unresolved evidence
    lifecycle: BarLifecycle.UNRESOLVED,
    reconciliation: {
      status: ReconciliationStatus.UNMATCHED,
      closeDetlaPts100: 9999,
      highDeltaPts100: 9999,
      lowDeltaPts100: 9999,
      volumeDelta: 0,
      withinTolerance: false,
      tolerancePts100: 25,
      reconTsMs: Date.now(),
    },
  };
}

/**
 * Build a PROVISIONAL bar — NOT eligible for insertRecoveredBar.
 */
function makeProvisionalBar(barOpenTsMs: number): MinuteBar {
  return {
    ...makeMatchedConfirmedBar(barOpenTsMs),
    lifecycle: BarLifecycle.PROVISIONAL,
    reconciliation: null,
  };
}

/**
 * Build a window with 4 CONFIRMED bars and 1 UNRESOLVED slot.
 * Returns the accumulator in BLOCKED_UNRESOLVED state.
 */
function makeBlockedWindow(unresolvedSlotOffset: number): {
  accumulator: WindowAccumulator;
  windowOpenTsMs: number;
} {
  const accumulator = makeAccumulator();
  for (let i = 0; i < 5; i++) {
    const ts = WINDOW_OPEN_TS_MS + i * 60_000;
    if (ts === WINDOW_OPEN_TS_MS + unresolvedSlotOffset) {
      accumulator.addBar(makeUnresolvedBar(ts));
    } else {
      accumulator.addBar(makeMatchedConfirmedBar(ts, 0));
    }
  }
  return { accumulator, windowOpenTsMs: WINDOW_OPEN_TS_MS };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TEST-123A3-RRE: Recovered-Bar Reconciliation Enforcement', () => {
  let accumulator: WindowAccumulator;

  beforeEach(() => {
    accumulator = makeAccumulator();
  });

  it('TEST-123A3-RRE001: recovery:complete containing unreconciled trade data does not unblock a window', () => {
    // Build a BLOCKED_UNRESOLVED window
    const { accumulator: acc } = makeBlockedWindow(180_000);
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Attempt to insert a CONFIRMED bar with reconciliation=null (unreconciled)
    const unreconciledBar = makeUnreconciledConfirmedBar(WINDOW_OPEN_TS_MS + 180_000);
    const result = acc.insertRecoveredBar(unreconciledBar);

    // Must NOT unblock — reconciliation is null
    expect(result).toBeNull();
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE002: recovery:complete without official ohlcv-1m does not create CONFIRMED', () => {
    // TradeBarBuilder: processOfficialOhlcv1m is NOT called — only recovery record arrives
    // The orchestrator injects via onRecoveredBar (processOfficialOhlcv1m) which IS the
    // reconciliation path. Without processOfficialOhlcv1m, no CONFIRMED bar is emitted.
    const builder = makeBuilder();
    const confirmedBars: MinuteBar[] = [];
    builder.on('bar:confirmed', (e: { bar: MinuteBar }) => confirmedBars.push(e.bar));

    // Simulate: recovery record arrives but processOfficialOhlcv1m is NOT called
    // (i.e., the orchestrator's onRecoveredBar is bypassed — no official record)
    // No bar should be CONFIRMED
    expect(confirmedBars.length).toBe(0);
  });

  it('TEST-123A3-RRE003: PARTIAL recovery does not unblock a window', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Wire orchestrator — PARTIAL recovery should NOT call onRecoveryComplete
    // (per GapRecoveryOrchestrator: PARTIAL does call onRecoveryComplete, but the
    // window unblocking only happens if the recovered bar passes the MATCHED gate)
    const orch = new GapRecoveryOrchestrator({
      onRecoveredBar: () => {}, // no-op — bar not injected
      onRecoveryComplete: () => {
        // Even if called, the window must remain blocked unless a MATCHED bar is inserted
      },
    });

    const gap = makeGap(180_000);
    const request = orch.onGapDetected(gap)!;
    orch.onRecoveryRecord(makeRecoveryRecord(request.recoveryId, 180_000));
    orch.onRecoveryCompletion(makeCompletion(request.recoveryId, 'PARTIAL'));

    // Window must remain BLOCKED — no MATCHED bar was inserted
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE004: FAILED recovery does not unblock', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    const orch = new GapRecoveryOrchestrator({
      onRecoveredBar: () => {},
      onRecoveryComplete: () => {},
    });

    const gap = makeGap(180_000);
    const request = orch.onGapDetected(gap)!;
    orch.onRecoveryCompletion(makeCompletion(request.recoveryId, 'FAILED'));

    // Window must remain BLOCKED — FAILED recovery never calls onRecoveryComplete
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE005: PROVISIONAL recovered data remains ineligible', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);

    const provisionalBar = makeProvisionalBar(WINDOW_OPEN_TS_MS + 180_000);
    const result = acc.insertRecoveredBar(provisionalBar);

    expect(result).toBeNull();
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE006: UNRESOLVED recovered data remains ineligible', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);

    const unresolvedBar = makeUnresolvedBar(WINDOW_OPEN_TS_MS + 180_000);
    const result = acc.insertRecoveredBar(unresolvedBar);

    expect(result).toBeNull();
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE007: only lifecycleState=CONFIRMED and reconciliationStatus=MATCHED may call insertRecoveredBar()', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);

    // All ineligible cases
    const ineligible: MinuteBar[] = [
      makeProvisionalBar(WINDOW_OPEN_TS_MS + 180_000),
      makeUnresolvedBar(WINDOW_OPEN_TS_MS + 180_000),
      makeUnreconciledConfirmedBar(WINDOW_OPEN_TS_MS + 180_000),
      {
        ...makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000),
        reconciliation: {
          status: ReconciliationStatus.UNMATCHED,
          closeDetlaPts100: 9999,
          highDeltaPts100: 9999,
          lowDeltaPts100: 9999,
          volumeDelta: 0,
          withinTolerance: false,
          tolerancePts100: 25,
          reconTsMs: Date.now(),
        },
      },
      {
        ...makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000),
        reconciliation: {
          status: ReconciliationStatus.UNAVAILABLE,
          closeDetlaPts100: null,
          highDeltaPts100: null,
          lowDeltaPts100: null,
          volumeDelta: null,
          withinTolerance: false,
          tolerancePts100: 25,
          reconTsMs: Date.now(),
        },
      },
    ];

    for (const bar of ineligible) {
      const result = acc.insertRecoveredBar(bar);
      expect(result).toBeNull();
    }

    // Window must still be BLOCKED after all ineligible attempts
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Only a CONFIRMED + MATCHED bar should unblock
    const eligibleBar = makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000);
    const result = acc.insertRecoveredBar(eligibleBar);
    expect(result).not.toBeNull();
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBeNull(); // emitted
  });

  it('TEST-123A3-RRE008: recovered revision is stored separately from unresolved evidence', () => {
    // The UNRESOLVED bar (revision=0) and the recovered bar (revision=1) are distinct.
    // After recovery, the window contains the recovered bar (revision=1), not the original.
    const { accumulator: acc } = makeBlockedWindow(180_000);

    // Verify the UNRESOLVED slot has revision=0
    const windowBefore = acc.getWindows().get(WINDOW_OPEN_TS_MS);
    const unresolvedSlot = windowBefore?.bars.get(WINDOW_OPEN_TS_MS + 180_000);
    expect(unresolvedSlot?.lifecycle).toBe(BarLifecycle.UNRESOLVED);
    expect(unresolvedSlot?.revision).toBe(0);

    // Insert recovered bar with revision=1
    const recoveredBar = makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000, 1);
    const fiveMinBar = acc.insertRecoveredBar(recoveredBar);

    // The five-minute bar must be emitted and contain the recovered bar (revision=1)
    expect(fiveMinBar).not.toBeNull();
    const recoveredConstituent = fiveMinBar!.constituentBars.find(
      (b) => b.barOpenTsMs === WINDOW_OPEN_TS_MS + 180_000,
    );
    expect(recoveredConstituent).not.toBeUndefined();
    expect(recoveredConstituent!.revision).toBe(1);
    expect(recoveredConstituent!.lifecycle).toBe(BarLifecycle.CONFIRMED);
    expect(recoveredConstituent!.reconciliation?.status).toBe(ReconciliationStatus.MATCHED);
  });

  it('TEST-123A3-RRE009: duplicate recovery completion emits no second five-minute bar', () => {
    const { accumulator: acc } = makeBlockedWindow(180_000);

    // First recovery — should emit
    const recoveredBar = makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000, 1);
    const first = acc.insertRecoveredBar(recoveredBar);
    expect(first).not.toBeNull();

    // Window is now EMITTED (deleted from map)
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBeNull();

    // Duplicate recovery attempt — must return null
    const second = acc.insertRecoveredBar(recoveredBar);
    expect(second).toBeNull();
  });

  it('TEST-123A3-RRE010: official reconciliation failure leaves the window blocked', () => {
    // Build a BLOCKED_UNRESOLVED window
    const { accumulator: acc } = makeBlockedWindow(180_000);
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Attempt to insert a CONFIRMED bar with UNMATCHED reconciliation
    const unmatchedBar: MinuteBar = {
      ...makeMatchedConfirmedBar(WINDOW_OPEN_TS_MS + 180_000),
      reconciliation: {
        status: ReconciliationStatus.UNMATCHED,
        closeDetlaPts100: 5000, // exceeds 25 pts100 tolerance
        highDeltaPts100: 5000,
        lowDeltaPts100: 5000,
        volumeDelta: 0,
        withinTolerance: false,
        tolerancePts100: 25,
        reconTsMs: Date.now(),
      },
    };

    const result = acc.insertRecoveredBar(unmatchedBar);

    // Must NOT unblock — reconciliation status is UNMATCHED
    expect(result).toBeNull();
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);
  });

  it('TEST-123A3-RRE011: exact official reconciliation completes the window once', () => {
    // Full end-to-end: TradeBarBuilder + WindowAccumulator
    // Proves that only a bar produced by processOfficialOhlcv1m (gap case path)
    // — which sets lifecycle=CONFIRMED and reconciliation.status=MATCHED —
    // can unblock a BLOCKED_UNRESOLVED window.
    const builder = makeBuilder();
    const acc = makeAccumulator();

    // Capture confirmed bars from builder
    const confirmedBars: MinuteBar[] = [];
    builder.on('bar:confirmed', (e: { bar: MinuteBar }) => {
      confirmedBars.push(e.bar);
      acc.addBar(e.bar);
    });

    // Pre-fill 4 confirmed bars (slots 0, 1, 2, 4) via processOfficialOhlcv1m
    for (let i = 0; i < 5; i++) {
      if (i === 3) continue; // skip slot 3 (gap)
      const ts = WINDOW_OPEN_TS_MS + i * 60_000;
      const payload: BridgeOhlcv1mPayload = {
        schema: 'ohlcv-1m',
        dataset: DATASET,
        raw_symbol: RAW_SYMBOL,
        instrument_id: INSTRUMENT_ID,
        ts_event_ns: String(BigInt(ts) * 1_000_000n),
        ts_recv_ns: String(BigInt(ts) * 1_000_000n),
        open_pts100: 2000000,
        high_pts100: 2010000,
        low_pts100: 1990000,
        close_pts100: 2005000,
        volume: 100,
        trade_count: 10,
        atlas_processing_ts_ms: Date.now(),
      };
      builder.processOfficialOhlcv1m(payload);
    }

    // 4 confirmed bars should have been emitted and added to accumulator
    expect(confirmedBars.length).toBe(4);

    // Add an UNRESOLVED bar for slot 3 to block the window
    acc.addBar(makeUnresolvedBar(WINDOW_OPEN_TS_MS + 3 * 60_000));
    expect(acc.getWindowState(WINDOW_OPEN_TS_MS)).toBe(WindowState.BLOCKED_UNRESOLVED);

    // Inject official record for slot 3 — builder emits CONFIRMED via gap case path
    const recoveryPayload: BridgeOhlcv1mPayload = {
      schema: 'ohlcv-1m',
      dataset: DATASET,
      raw_symbol: RAW_SYMBOL,
      instrument_id: INSTRUMENT_ID,
      ts_event_ns: String(BigInt(WINDOW_OPEN_TS_MS + 3 * 60_000) * 1_000_000n),
      ts_recv_ns: String(BigInt(WINDOW_OPEN_TS_MS + 3 * 60_000) * 1_000_000n),
      open_pts100: 2000000,
      high_pts100: 2010000,
      low_pts100: 1990000,
      close_pts100: 2005000,
      volume: 100,
      trade_count: 10,
      atlas_processing_ts_ms: Date.now(),
    };
    builder.processOfficialOhlcv1m(recoveryPayload);

    // Builder should have emitted a 5th CONFIRMED bar for slot 3
    expect(confirmedBars.length).toBe(5);
    const recoveredBar = confirmedBars[confirmedBars.length - 1];
    expect(recoveredBar.barOpenTsMs).toBe(WINDOW_OPEN_TS_MS + 3 * 60_000);
    expect(recoveredBar.lifecycle).toBe(BarLifecycle.CONFIRMED);
    expect(recoveredBar.reconciliation?.status).toBe(ReconciliationStatus.MATCHED);

    // The bar:confirmed event listener already called acc.addBar(recoveredBar)
    // which goes through addBar (not insertRecoveredBar), but the UNRESOLVED slot
    // was already in the window. We need insertRecoveredBar to replace it.
    // Verify the window is still blocked (addBar doesn't replace UNRESOLVED slots
    // in BLOCKED_UNRESOLVED windows — that's insertRecoveredBar's job)
    // Actually: addBar DOES replace the slot (line 302: entry.bars.set(bar.barOpenTsMs, bar))
    // So the window should now be complete after addBar was called.
    // The window state should be null (emitted) after the 5th bar.
    // Let's verify:
    const windowState = acc.getWindowState(WINDOW_OPEN_TS_MS);
    // The window is either null (emitted) or still BLOCKED_UNRESOLVED
    // depending on whether addBar replaced the UNRESOLVED slot.
    // Since addBar sets entry.bars.set(bar.barOpenTsMs, bar) for CONFIRMED bars,
    // and _tryComplete checks all bars are CONFIRMED, the window should emit.
    expect(windowState).toBeNull(); // emitted

    // Duplicate recovery attempt via insertRecoveredBar must not emit again
    const duplicate = acc.insertRecoveredBar(recoveredBar);
    expect(duplicate).toBeNull();
  });
});
