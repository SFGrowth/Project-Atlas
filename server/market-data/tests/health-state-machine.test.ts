/**
 * Sprint 123A.4 — Gate G4 Health State Machine Tests
 *
 *   TEST-123A4-HSM-001  Initial state is INITIALISING
 *   TEST-123A4-HSM-002  onBarReceived transitions to LIVE
 *   TEST-123A4-HSM-003  LIVE → DEGRADED when bar age > 2x interval
 *   TEST-123A4-HSM-004  LIVE → STALE when bar age > 5 minutes
 *   TEST-123A4-HSM-005  LIVE → OFFLINE when bar age > 15 minutes
 *   TEST-123A4-HSM-006  onBridgeDisconnected transitions to RECONNECTING
 *   TEST-123A4-HSM-007  onBridgeReconnected transitions back to LIVE (with bar)
 *   TEST-123A4-HSM-008  onGapRecoveryStarted transitions to GAP_RECOVERY
 *   TEST-123A4-HSM-009  onGapRecoveryCompleted transitions back to LIVE
 *   TEST-123A4-HSM-010  onContractRollStarted transitions to CONTRACT_ROLL
 *   TEST-123A4-HSM-011  onContractRollCompleted transitions back to LIVE
 *   TEST-123A4-HSM-012  onShutdown transitions to SHUTDOWN
 *   TEST-123A4-HSM-013  Chart source: LIVE → DATABENTO
 *   TEST-123A4-HSM-014  Chart source: DEGRADED → DATABENTO
 *   TEST-123A4-HSM-015  Chart source: GAP_RECOVERY → DATABENTO
 *   TEST-123A4-HSM-016  Chart source: CONTRACT_ROLL → DATABENTO
 *   TEST-123A4-HSM-017  Chart source: STALE → TRADINGVIEW
 *   TEST-123A4-HSM-018  Chart source: OFFLINE → TRADINGVIEW
 *   TEST-123A4-HSM-019  Chart source: RECONNECTING → TRADINGVIEW
 *   TEST-123A4-HSM-020  Chart source: INITIALISING → TRADINGVIEW
 *   TEST-123A4-HSM-021  Chart source: SHUTDOWN → NONE
 *   TEST-123A4-HSM-022  getSnapshot() returns correct fields
 *   TEST-123A4-HSM-023  tick() returns new state when staleness threshold crossed
 *   TEST-123A4-HSM-024  tick() returns null when state unchanged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthStateMachine, HEALTH_THRESHOLDS } from '../health-state-machine.js';

describe('Sprint 123A.4 — HealthStateMachine', () => {

  let sm: HealthStateMachine;

  beforeEach(() => {
    sm = new HealthStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TEST-123A4-HSM-001: Initial state is INITIALISING', () => {
    expect(sm.getState()).toBe('INITIALISING');
  });

  it('TEST-123A4-HSM-002: onBarReceived transitions to LIVE', () => {
    sm.onBarReceived(Date.now());
    expect(sm.getState()).toBe('LIVE');
  });

  it('TEST-123A4-HSM-003: LIVE → DEGRADED when bar age > 2x interval', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    expect(sm.getState()).toBe('LIVE');

    // Advance time past 2x interval (120s + 1ms)
    vi.setSystemTime(now + HEALTH_THRESHOLDS.barIntervalMs * HEALTH_THRESHOLDS.degradedMultiplier + 1);
    sm.tick();
    expect(sm.getState()).toBe('DEGRADED');
  });

  it('TEST-123A4-HSM-004: LIVE → STALE when bar age > 5 minutes', () => {
    const now = Date.now();
    sm.onBarReceived(now);

    vi.setSystemTime(now + HEALTH_THRESHOLDS.staleThresholdMs + 1);
    sm.tick();
    expect(sm.getState()).toBe('STALE');
  });

  it('TEST-123A4-HSM-005: LIVE → OFFLINE when bar age > 15 minutes', () => {
    const now = Date.now();
    sm.onBarReceived(now);

    vi.setSystemTime(now + HEALTH_THRESHOLDS.offlineThresholdMs + 1);
    sm.tick();
    expect(sm.getState()).toBe('OFFLINE');
  });

  it('TEST-123A4-HSM-006: onBridgeDisconnected transitions to RECONNECTING', () => {
    sm.onBarReceived(Date.now());
    sm.onBridgeDisconnected();
    expect(sm.getState()).toBe('RECONNECTING');
  });

  it('TEST-123A4-HSM-007: onBridgeReconnected transitions back to LIVE (with bar)', () => {
    sm.onBarReceived(Date.now());
    sm.onBridgeDisconnected();
    expect(sm.getState()).toBe('RECONNECTING');

    sm.onBridgeReconnected();
    sm.onBarReceived(Date.now());
    expect(sm.getState()).toBe('LIVE');
  });

  it('TEST-123A4-HSM-008: onGapRecoveryStarted transitions to GAP_RECOVERY', () => {
    sm.onBarReceived(Date.now());
    sm.onGapRecoveryStarted();
    expect(sm.getState()).toBe('GAP_RECOVERY');
  });

  it('TEST-123A4-HSM-009: onGapRecoveryCompleted transitions back to LIVE', () => {
    sm.onBarReceived(Date.now());
    sm.onGapRecoveryStarted();
    sm.onGapRecoveryCompleted();
    expect(sm.getState()).toBe('LIVE');
  });

  it('TEST-123A4-HSM-010: onContractRollStarted transitions to CONTRACT_ROLL', () => {
    sm.onBarReceived(Date.now());
    sm.onContractRollStarted();
    expect(sm.getState()).toBe('CONTRACT_ROLL');
  });

  it('TEST-123A4-HSM-011: onContractRollCompleted transitions back to LIVE', () => {
    sm.onBarReceived(Date.now());
    sm.onContractRollStarted();
    sm.onContractRollCompleted();
    expect(sm.getState()).toBe('LIVE');
  });

  it('TEST-123A4-HSM-012: onShutdown transitions to SHUTDOWN', () => {
    sm.onBarReceived(Date.now());
    sm.onShutdown();
    expect(sm.getState()).toBe('SHUTDOWN');
  });

  it('TEST-123A4-HSM-013: Chart source: LIVE → DATABENTO', () => {
    sm.onBarReceived(Date.now());
    expect(sm.getChartSource()).toBe('DATABENTO');
  });

  it('TEST-123A4-HSM-014: Chart source: DEGRADED → DATABENTO', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    vi.setSystemTime(now + HEALTH_THRESHOLDS.barIntervalMs * HEALTH_THRESHOLDS.degradedMultiplier + 1);
    sm.tick();
    expect(sm.getChartSource()).toBe('DATABENTO');
  });

  it('TEST-123A4-HSM-015: Chart source: GAP_RECOVERY → DATABENTO', () => {
    sm.onBarReceived(Date.now());
    sm.onGapRecoveryStarted();
    expect(sm.getChartSource()).toBe('DATABENTO');
  });

  it('TEST-123A4-HSM-016: Chart source: CONTRACT_ROLL → DATABENTO', () => {
    sm.onBarReceived(Date.now());
    sm.onContractRollStarted();
    expect(sm.getChartSource()).toBe('DATABENTO');
  });

  it('TEST-123A4-HSM-017: Chart source: STALE → TRADINGVIEW', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    vi.setSystemTime(now + HEALTH_THRESHOLDS.staleThresholdMs + 1);
    sm.tick();
    expect(sm.getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A4-HSM-018: Chart source: OFFLINE → TRADINGVIEW', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    vi.setSystemTime(now + HEALTH_THRESHOLDS.offlineThresholdMs + 1);
    sm.tick();
    expect(sm.getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A4-HSM-019: Chart source: RECONNECTING → TRADINGVIEW', () => {
    sm.onBarReceived(Date.now());
    sm.onBridgeDisconnected();
    expect(sm.getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A4-HSM-020: Chart source: INITIALISING → TRADINGVIEW', () => {
    // Initial state
    expect(sm.getChartSource()).toBe('TRADINGVIEW');
  });

  it('TEST-123A4-HSM-021: Chart source: SHUTDOWN → NONE', () => {
    sm.onShutdown();
    expect(sm.getChartSource()).toBe('NONE');
  });

  it('TEST-123A4-HSM-022: getSnapshot() returns correct fields', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    sm.onBarReceived(now);

    const snap = sm.getSnapshot();
    expect(snap.state).toBe('LIVE');
    expect(snap.chartSource).toBe('DATABENTO');
    expect(snap.lastBarTsMs).toBe(now);
    expect(snap.barCount).toBe(1);
    expect(snap.gapRecoveryActive).toBe(false);
    expect(snap.contractRollActive).toBe(false);
    expect(snap.reconnectCount).toBe(0);
  });

  it('TEST-123A4-HSM-023: tick() returns new state when staleness threshold crossed', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    vi.setSystemTime(now + HEALTH_THRESHOLDS.staleThresholdMs + 1);
    const newState = sm.tick();
    expect(newState).toBe('STALE');
  });

  it('TEST-123A4-HSM-024: tick() returns null when state unchanged', () => {
    const now = Date.now();
    sm.onBarReceived(now);
    // Advance time but not enough to trigger staleness
    vi.setSystemTime(now + 30_000);
    const newState = sm.tick();
    expect(newState).toBeNull();
  });
});
