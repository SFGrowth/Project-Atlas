/**
 * DARWIN Shadow Signal Store — Sprint 123A.6 / Gate G6A
 *
 * Stores research-only shadow signals. These signals are never transmitted.
 * They are visible in the DARWIN research dashboard only.
 *
 * Authority guards are checked on every write.
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 */

import { randomUUID } from 'crypto';
import {
  assertShadowSignalStorageOnly,
  isDarwinProcessBarTrigger,
  isDarwinPostBarAutomationTrigger,
  isDarwinTradersPostTrigger,
  isDarwinTradovateOrderTrigger,
} from '../market-data/darwin-authority.js';
import type { InsertDarwinShadowSignal } from '../../drizzle/schema.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShadowSignalInput {
  candidateId: string;
  timestamp: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  theoreticalEntry: number;
  theoreticalStop: number;
  theoreticalTarget: number;
  confidence: number;
  reasonCodesJson: string[];
  featureSnapshotJson: Record<string, unknown>;
  regime?: string;
  expectedHoldingPeriodMinutes?: number;
  experimentVersion: string;
  codeSha: string;
}

// ─── Shadow signal builder ────────────────────────────────────────────────────

/**
 * Builds a shadow signal record with all authority guards checked.
 * Throws if any transmission flag is set.
 *
 * This function enforces the permanent invariant:
 *   processBarCalled = false
 *   postBarAutomationCalled = false
 *   tradersPostSent = false
 *   tradovateOrderSubmitted = false
 */
export function buildShadowSignal(input: ShadowSignalInput): InsertDarwinShadowSignal {
  // Check authority guards
  assertShadowSignalStorageOnly({
    candidateId: input.candidateId,
    timestamp: input.timestamp,
    symbol: input.symbol,
  });

  // Verify permanent invariants
  const processBarCalled = isDarwinProcessBarTrigger();
  const postBarAutomationCalled = isDarwinPostBarAutomationTrigger();
  const tradersPostSent = isDarwinTradersPostTrigger();
  const tradovateOrderSubmitted = isDarwinTradovateOrderTrigger();

  // These must always be false — if any are true, something is very wrong
  if (processBarCalled) {
    throw new Error('[DARWIN shadow store] CRITICAL: isDarwinProcessBarTrigger() returned true. This must never happen.');
  }
  if (postBarAutomationCalled) {
    throw new Error('[DARWIN shadow store] CRITICAL: isDarwinPostBarAutomationTrigger() returned true. This must never happen.');
  }
  if (tradersPostSent) {
    throw new Error('[DARWIN shadow store] CRITICAL: isDarwinTradersPostTrigger() returned true. This must never happen.');
  }
  if (tradovateOrderSubmitted) {
    throw new Error('[DARWIN shadow store] CRITICAL: isDarwinTradovateOrderTrigger() returned true. This must never happen.');
  }

  return {
    signalId: randomUUID(),
    candidateId: input.candidateId,
    timestamp: input.timestamp,
    symbol: input.symbol,
    direction: input.direction,
    theoreticalEntry: String(input.theoreticalEntry),
    theoreticalStop: String(input.theoreticalStop),
    theoreticalTarget: String(input.theoreticalTarget),
    confidence: String(input.confidence),
    reasonCodesJson: input.reasonCodesJson,
    featureSnapshotJson: input.featureSnapshotJson,
    experimentVersion: input.experimentVersion,
    codeSha: input.codeSha,
    // Authority guards — permanently false
    processBarCalled: false,
    postBarAutomationCalled: false,
    tradersPostSent: false,
    tradovateOrderSubmitted: false,
    // Research-only label
    researchOnlyLabel: 'RESEARCH ONLY — NO LIVE EXECUTION',
  };
}

/**
 * Validates a shadow signal record before database insertion.
 * Throws if any authority guard has been violated.
 */
export function validateShadowSignalBeforeInsert(signal: InsertDarwinShadowSignal): void {
  if (signal.processBarCalled) {
    throw new Error(`[DARWIN shadow store] Authority violation: processBarCalled=true on signal ${signal.signalId}`);
  }
  if (signal.postBarAutomationCalled) {
    throw new Error(`[DARWIN shadow store] Authority violation: postBarAutomationCalled=true on signal ${signal.signalId}`);
  }
  if (signal.tradersPostSent) {
    throw new Error(`[DARWIN shadow store] Authority violation: tradersPostSent=true on signal ${signal.signalId}`);
  }
  if (signal.tradovateOrderSubmitted) {
    throw new Error(`[DARWIN shadow store] Authority violation: tradovateOrderSubmitted=true on signal ${signal.signalId}`);
  }
  if (signal.researchOnlyLabel !== 'RESEARCH ONLY — NO LIVE EXECUTION') {
    throw new Error(`[DARWIN shadow store] Authority violation: researchOnlyLabel has been modified on signal ${signal.signalId}`);
  }
}
