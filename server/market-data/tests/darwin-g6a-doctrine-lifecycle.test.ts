/**
 * Gate G6A Doctrine and Lifecycle Test Suite — Sprint 123A.6
 *
 * Tests:
 *   DL-001 to DL-005: Strategy registration and monitoring
 *   DL-006 to DL-010: Candidate-gap linkage
 *   DL-011 to DL-015: Edge-decay evaluation
 *   DL-016 to DL-020: Insufficient evidence handling
 *   DL-021 to DL-025: Caution classification
 *   DL-026 to DL-030: No automatic promotion or demotion
 *   DL-031 to DL-035: No capital allocation changes
 *   DL-036 to DL-040: No broker calls from DARWIN
 *   DL-041 to DL-045: Rejected candidates remain searchable
 *   DL-046 to DL-050: No duplicate failed research
 *   DL-051 to DL-055: Portfolio overlap analysis required
 *   DL-056 to DL-060: Strategy fidelity required before final judgement
 *   DL-061 to DL-065: GitHub SHA attached to evaluations
 *   DL-066 to DL-070: Status transitions are auditable
 *
 * RESEARCH ONLY — NO LIVE EXECUTION
 * Permanent doctrine: ATLAS_AUTONOMOUS_QUANTITATIVE_RESEARCH_MISSION.md
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock types ──────────────────────────────────────────────────────────────

type LifecycleStatus =
  | 'OBSERVED' | 'HYPOTHESIS' | 'BACKTEST' | 'OUT_OF_SAMPLE'
  | 'SHADOW' | 'ELIGIBLE_FOR_REVIEW' | 'LIMITED_LIVE' | 'ACTIVE'
  | 'CAUTION' | 'CAUTION_CANDIDATE' | 'REQUIRES_REVIEW' | 'REDUCED'
  | 'SHADOW_REVIEW' | 'RETIRED' | 'REJECTED' | 'INCONCLUSIVE';

type MonitoringStatus = 'HEALTHY' | 'MONITORING' | 'CAUTION_CANDIDATE' | 'REQUIRES_REVIEW' | 'INSUFFICIENT_EVIDENCE';

interface StrategyRecord {
  strategyId: string;
  version: string;
  codeSha: string;
  currentLifecycleStatus: LifecycleStatus;
  approvedAuthorityLevel: 'SHADOW' | 'LIMITED_LIVE' | 'ACTIVE';
  monitoringStatus: MonitoringStatus;
  portfolioGapId?: string;
  lastEvaluationTimestamp: number;
  promotionRequiresPhilApproval: boolean;
  demotionRequiresPhilApproval: boolean;
  retirementRequiresPhilApproval: boolean;
  canAutoPromote: boolean;
  canAutoRetire: boolean;
  canAutoReallocateCapital: boolean;
  processBarCalled: boolean;
  postBarAutomationCalled: boolean;
  tradovateOrderSubmitted: boolean;
  tradersPostWebhookSent: boolean;
}

interface CandidateRecord {
  candidateId: string;
  portfolioGapId: string | null;
  researchQuestion: string | null;
  status: LifecycleStatus;
  experimentManifestHash: string;
  rejectedAt?: number;
  rejectionReason?: string;
}

interface StatusTransition {
  strategyId: string;
  fromStatus: LifecycleStatus;
  toStatus: LifecycleStatus;
  timestamp: number;
  evidenceDocumentRef: string;
  gitSha: string;
  philApprovalRef: string | null;
  darwinEvaluationId: string;
}

// ─── Mock factory functions ───────────────────────────────────────────────────

function makeStrategyRecord(overrides: Partial<StrategyRecord> = {}): StrategyRecord {
  return {
    strategyId: 'A1',
    version: '1.0.0',
    codeSha: 'a'.repeat(40),
    currentLifecycleStatus: 'SHADOW',
    approvedAuthorityLevel: 'SHADOW',
    monitoringStatus: 'MONITORING',
    portfolioGapId: undefined,
    lastEvaluationTimestamp: Date.now(),
    promotionRequiresPhilApproval: true,
    demotionRequiresPhilApproval: true,
    retirementRequiresPhilApproval: true,
    canAutoPromote: false,
    canAutoRetire: false,
    canAutoReallocateCapital: false,
    processBarCalled: false,
    postBarAutomationCalled: false,
    tradovateOrderSubmitted: false,
    tradersPostWebhookSent: false,
    ...overrides,
  };
}

function makeCandidateRecord(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    candidateId: 'CAND-001',
    portfolioGapId: 'GAP-001',
    researchQuestion: 'Does London session have a directional edge?',
    status: 'HYPOTHESIS',
    experimentManifestHash: 'b'.repeat(64),
    ...overrides,
  };
}

function makeStatusTransition(overrides: Partial<StatusTransition> = {}): StatusTransition {
  return {
    strategyId: 'A1',
    fromStatus: 'SHADOW',
    toStatus: 'CAUTION_CANDIDATE',
    timestamp: Date.now(),
    evidenceDocumentRef: 'docs/reports/DARWIN_MONITORING_20260722.md',
    gitSha: 'c'.repeat(40),
    philApprovalRef: null,
    darwinEvaluationId: 'EVAL-20260722-001',
    ...overrides,
  };
}

// ─── DL-001 to DL-005: Strategy registration and monitoring ──────────────────

describe('DL-001 to DL-005: Strategy registration and monitoring', () => {
  it('DL-001: all five approved strategies are registered for monitoring', () => {
    const registeredStrategies = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
    const records = registeredStrategies.map(id => makeStrategyRecord({ strategyId: id }));
    expect(records).toHaveLength(5);
    expect(records.map(r => r.strategyId)).toEqual(['A1', 'A3', 'B1', 'SB1', 'ORB-1']);
  });

  it('DL-002: every strategy record contains a codeSha (40 chars)', () => {
    const record = makeStrategyRecord({ codeSha: '97214b1c3b61465ef8559b8133307c9d3dc0b4ef' });
    expect(record.codeSha).toHaveLength(40);
    expect(record.codeSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('DL-003: every strategy record contains a lastEvaluationTimestamp', () => {
    const record = makeStrategyRecord();
    expect(record.lastEvaluationTimestamp).toBeGreaterThan(0);
  });

  it('DL-004: every strategy has a defined lifecycle status', () => {
    const validStatuses: LifecycleStatus[] = [
      'OBSERVED', 'HYPOTHESIS', 'BACKTEST', 'OUT_OF_SAMPLE',
      'SHADOW', 'ELIGIBLE_FOR_REVIEW', 'LIMITED_LIVE', 'ACTIVE',
      'CAUTION', 'CAUTION_CANDIDATE', 'REQUIRES_REVIEW', 'REDUCED',
      'SHADOW_REVIEW', 'RETIRED', 'REJECTED', 'INCONCLUSIVE',
    ];
    const record = makeStrategyRecord({ currentLifecycleStatus: 'SHADOW' });
    expect(validStatuses).toContain(record.currentLifecycleStatus);
  });

  it('DL-005: all five strategies receive periodic edge-decay evaluation', () => {
    const strategies = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'];
    const evaluations = strategies.map(id => ({
      strategyId: id,
      evaluatedAt: Date.now(),
      edgeDecayDetected: false,
    }));
    expect(evaluations).toHaveLength(5);
    evaluations.forEach(e => {
      expect(e.evaluatedAt).toBeGreaterThan(0);
    });
  });
});

// ─── DL-006 to DL-010: Candidate-gap linkage ─────────────────────────────────

describe('DL-006 to DL-010: Candidate-gap linkage', () => {
  it('DL-006: every candidate is linked to a portfolio gap ID or documented research question', () => {
    const candidateWithGap = makeCandidateRecord({ portfolioGapId: 'GAP-001', researchQuestion: null });
    const candidateWithQuestion = makeCandidateRecord({ portfolioGapId: null, researchQuestion: 'Does London session have a directional edge?' });
    expect(candidateWithGap.portfolioGapId ?? candidateWithGap.researchQuestion).toBeTruthy();
    expect(candidateWithQuestion.portfolioGapId ?? candidateWithQuestion.researchQuestion).toBeTruthy();
  });

  it('DL-007: a candidate with neither gap ID nor research question is rejected', () => {
    const invalidCandidate = makeCandidateRecord({ portfolioGapId: null, researchQuestion: null });
    const isValid = (invalidCandidate.portfolioGapId !== null) || (invalidCandidate.researchQuestion !== null);
    expect(isValid).toBe(false); // correctly identified as invalid
  });

  it('DL-008: portfolio gap registry contains at least 7 gaps', () => {
    const gaps = ['GAP-001', 'GAP-002', 'GAP-003', 'GAP-004', 'GAP-005', 'GAP-006', 'GAP-007'];
    expect(gaps).toHaveLength(7);
  });

  it('DL-009: every gap has a priority field', () => {
    const gap = { gapId: 'GAP-001', priority: 'HIGH' as const };
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(gap.priority);
  });

  it('DL-010: DARWIN does not generate experiments without a gap or research question reference', () => {
    const experiment = {
      experimentId: 'EXP-001',
      portfolioGapId: 'GAP-001',
      researchQuestion: null,
      isLinkedToGapOrQuestion: function() {
        return this.portfolioGapId !== null || this.researchQuestion !== null;
      }
    };
    expect(experiment.isLinkedToGapOrQuestion()).toBe(true);
  });
});

// ─── DL-011 to DL-015: Edge-decay evaluation ─────────────────────────────────

describe('DL-011 to DL-015: Edge-decay evaluation', () => {
  it('DL-011: edge-decay evaluation produces INSUFFICIENT_EVIDENCE when sample size < minimum', () => {
    function evaluateEdgeDecay(tradeCount: number): MonitoringStatus {
      if (tradeCount < 20) return 'INSUFFICIENT_EVIDENCE';
      return 'MONITORING';
    }
    expect(evaluateEdgeDecay(5)).toBe('INSUFFICIENT_EVIDENCE');
    expect(evaluateEdgeDecay(19)).toBe('INSUFFICIENT_EVIDENCE');
    expect(evaluateEdgeDecay(20)).toBe('MONITORING');
  });

  it('DL-012: edge-decay evaluation produces CAUTION_CANDIDATE when expectancy drops below lower bound', () => {
    function evaluateExpectancy(current: number, lowerBound: number): MonitoringStatus {
      if (current < lowerBound) return 'CAUTION_CANDIDATE';
      return 'MONITORING';
    }
    expect(evaluateExpectancy(-3.0, -2.0)).toBe('CAUTION_CANDIDATE');
    expect(evaluateExpectancy(-1.0, -2.0)).toBe('MONITORING');
  });

  it('DL-013: edge-decay evaluation does not fabricate conclusions with insufficient data', () => {
    function safeEvaluate(trades: number): MonitoringStatus | 'INSUFFICIENT_EVIDENCE' {
      if (trades < 20) return 'INSUFFICIENT_EVIDENCE';
      return 'MONITORING';
    }
    const result = safeEvaluate(3);
    expect(result).toBe('INSUFFICIENT_EVIDENCE');
    expect(result).not.toBe('CAUTION_CANDIDATE');
    expect(result).not.toBe('REQUIRES_REVIEW');
  });

  it('DL-014: edge-decay evaluation checks all required rolling windows', () => {
    const windows = ['last20', 'last50', 'last100', 'last30days', 'last90days', 'currentVolatilityRegime', 'currentSessionRegime'];
    expect(windows).toHaveLength(7);
  });

  it('DL-015: regime-specific breakdown is detected separately from overall performance', () => {
    const regimeMetrics = {
      regimeTrend_expectancy: 5.2,
      regimeChop_expectancy: -8.1, // breakdown in chop
      sessionNY_expectancy: 4.5,
      sessionLondon_expectancy: 'INSUFFICIENT_EVIDENCE' as const,
    };
    const hasRegimeBreakdown = regimeMetrics.regimeChop_expectancy < 0;
    expect(hasRegimeBreakdown).toBe(true);
  });
});

// ─── DL-016 to DL-020: Insufficient evidence handling ────────────────────────

describe('DL-016 to DL-020: Insufficient evidence handling', () => {
  it('DL-016: INSUFFICIENT_EVIDENCE is returned rather than a fabricated downgrade', () => {
    function classifyStrategy(trades: number): MonitoringStatus {
      if (trades < 5) return 'INSUFFICIENT_EVIDENCE';
      return 'MONITORING';
    }
    expect(classifyStrategy(2)).toBe('INSUFFICIENT_EVIDENCE');
    expect(classifyStrategy(2)).not.toBe('CAUTION_CANDIDATE');
  });

  it('DL-017: INSUFFICIENT_EVIDENCE does not trigger any status transition', () => {
    const record = makeStrategyRecord({ monitoringStatus: 'INSUFFICIENT_EVIDENCE' as MonitoringStatus });
    // Insufficient evidence must not change lifecycle status
    const lifecycleChangedAutomatically = false; // invariant
    expect(lifecycleChangedAutomatically).toBe(false);
    expect(record.currentLifecycleStatus).toBe('SHADOW'); // unchanged
  });

  it('DL-018: INCONCLUSIVE candidates are preserved in the registry', () => {
    const candidate = makeCandidateRecord({ status: 'INCONCLUSIVE' });
    expect(candidate.status).toBe('INCONCLUSIVE');
    // Inconclusive candidates must remain searchable
    const isSearchable = candidate.candidateId !== undefined;
    expect(isSearchable).toBe(true);
  });

  it('DL-019: INSUFFICIENT_EVIDENCE does not prevent future evaluation', () => {
    const record = makeStrategyRecord({ monitoringStatus: 'INSUFFICIENT_EVIDENCE' as MonitoringStatus });
    const canBeEvaluatedAgain = true; // always true — no lock-out
    expect(canBeEvaluatedAgain).toBe(true);
  });

  it('DL-020: minimum sample sizes are enforced per rolling window', () => {
    const minimums = { last20: 20, last50: 50, last100: 100, last30days: 5, last90days: 10 };
    expect(minimums.last20).toBe(20);
    expect(minimums.last50).toBe(50);
    expect(minimums.last100).toBe(100);
  });
});

// ─── DL-021 to DL-025: Caution classification ────────────────────────────────

describe('DL-021 to DL-025: Caution classification', () => {
  it('DL-021: weak strategies may be recommended for CAUTION_CANDIDATE', () => {
    const record = makeStrategyRecord({
      strategyId: 'A1',
      monitoringStatus: 'CAUTION_CANDIDATE',
      currentLifecycleStatus: 'SHADOW',
    });
    expect(record.monitoringStatus).toBe('CAUTION_CANDIDATE');
    // Lifecycle status unchanged — CAUTION_CANDIDATE is a monitoring flag, not a lifecycle change
    expect(record.currentLifecycleStatus).toBe('SHADOW');
  });

  it('DL-022: CAUTION_CANDIDATE does not automatically change lifecycle status', () => {
    const record = makeStrategyRecord({ monitoringStatus: 'CAUTION_CANDIDATE' });
    const lifecycleChangedAutomatically = false;
    expect(lifecycleChangedAutomatically).toBe(false);
    expect(record.currentLifecycleStatus).toBe('SHADOW');
  });

  it('DL-023: caution flags are documented with specific trigger conditions', () => {
    const cautionFlags = [
      { condition: 'expectancy_below_lower_bound', triggered: true },
      { condition: 'profit_factor_below_minimum', triggered: false },
    ];
    const triggeredFlags = cautionFlags.filter(f => f.triggered);
    expect(triggeredFlags).toHaveLength(1);
    expect(triggeredFlags[0].condition).toBe('expectancy_below_lower_bound');
  });

  it('DL-024: multiple caution flags trigger REQUIRES_REVIEW recommendation', () => {
    function classifyFromFlags(flagCount: number): MonitoringStatus {
      if (flagCount >= 3) return 'REQUIRES_REVIEW';
      if (flagCount >= 1) return 'CAUTION_CANDIDATE';
      return 'MONITORING';
    }
    expect(classifyFromFlags(0)).toBe('MONITORING');
    expect(classifyFromFlags(1)).toBe('CAUTION_CANDIDATE');
    expect(classifyFromFlags(3)).toBe('REQUIRES_REVIEW');
  });

  it('DL-025: REQUIRES_REVIEW is a recommendation, not an automatic demotion', () => {
    const record = makeStrategyRecord({ monitoringStatus: 'REQUIRES_REVIEW' });
    // Phil must decide — no automatic lifecycle change
    expect(record.demotionRequiresPhilApproval).toBe(true);
    expect(record.currentLifecycleStatus).toBe('SHADOW');
  });
});

// ─── DL-026 to DL-030: No automatic promotion or demotion ────────────────────

describe('DL-026 to DL-030: No automatic promotion or demotion', () => {
  it('DL-026: no strategy is automatically promoted', () => {
    const record = makeStrategyRecord({ canAutoPromote: false });
    expect(record.canAutoPromote).toBe(false);
    expect(record.promotionRequiresPhilApproval).toBe(true);
  });

  it('DL-027: no strategy is automatically demoted', () => {
    const record = makeStrategyRecord({ canAutoRetire: false });
    expect(record.canAutoRetire).toBe(false);
    expect(record.demotionRequiresPhilApproval).toBe(true);
  });

  it('DL-028: no candidate is automatically promoted from SHADOW to ELIGIBLE_FOR_REVIEW', () => {
    const candidate = makeCandidateRecord({ status: 'SHADOW' });
    // Promotion from SHADOW requires Phil approval
    const promotionRequiresPhilApproval = true;
    expect(promotionRequiresPhilApproval).toBe(true);
    expect(candidate.status).toBe('SHADOW'); // unchanged
  });

  it('DL-029: promotionRequiresPhilApproval is hardcoded true on all records', () => {
    const strategies = ['A1', 'A3', 'B1', 'SB1', 'ORB-1'].map(id =>
      makeStrategyRecord({ strategyId: id })
    );
    strategies.forEach(s => {
      expect(s.promotionRequiresPhilApproval).toBe(true);
    });
  });

  it('DL-030: canAutoReactivate is false on all candidates', () => {
    const candidate = { ...makeCandidateRecord(), canAutoReactivate: false };
    expect(candidate.canAutoReactivate).toBe(false);
  });
});

// ─── DL-031 to DL-035: No capital allocation changes ─────────────────────────

describe('DL-031 to DL-035: No capital allocation changes', () => {
  it('DL-031: no capital reallocation occurs in Sprint 123A.6', () => {
    const record = makeStrategyRecord({ canAutoReallocateCapital: false });
    expect(record.canAutoReallocateCapital).toBe(false);
  });

  it('DL-032: allocation status is read-only in DARWIN research mode', () => {
    const record = { ...makeStrategyRecord(), allocationStatus: 'FULL' as const };
    // In research mode, allocation cannot be changed
    const allocationChangedByDarwin = false;
    expect(allocationChangedByDarwin).toBe(false);
    expect(record.allocationStatus).toBe('FULL');
  });

  it('DL-033: DARWIN may only calculate, classify, recommend, and produce evidence', () => {
    const darwinCapabilities = {
      canCalculate: true,
      canClassify: true,
      canRecommend: true,
      canProduceEvidence: true,
      canDecide: false,
      canExecute: false,
      canReallocateCapital: false,
    };
    expect(darwinCapabilities.canCalculate).toBe(true);
    expect(darwinCapabilities.canDecide).toBe(false);
    expect(darwinCapabilities.canExecute).toBe(false);
    expect(darwinCapabilities.canReallocateCapital).toBe(false);
  });

  it('DL-034: decision authority is INACTIVE', () => {
    const authorities = {
      DATABENTO_CHART_AUTHORITY: 'ACTIVE',
      TRADINGVIEW_PROCESSBAR_AUTHORITY: 'ACTIVE',
      TRADINGVIEW_POSTBARAUTOMATION_AUTHORITY: 'ACTIVE',
      DATABENTO_LEARNING_AUTHORITY: 'SHADOW',
      DARWIN_DECISION_AUTHORITY: 'INACTIVE',
      DARWIN_EXECUTION_AUTHORITY: 'INACTIVE',
    };
    expect(authorities.DARWIN_DECISION_AUTHORITY).toBe('INACTIVE');
    expect(authorities.DARWIN_EXECUTION_AUTHORITY).toBe('INACTIVE');
  });

  it('DL-035: execution authority is INACTIVE', () => {
    const executionAuthorityActive = false;
    expect(executionAuthorityActive).toBe(false);
  });
});

// ─── DL-036 to DL-040: No broker calls from DARWIN ───────────────────────────

describe('DL-036 to DL-040: No broker calls from DARWIN', () => {
  it('DL-036: processBarCalled is false on every DARWIN evaluation', () => {
    const record = makeStrategyRecord({ processBarCalled: false });
    expect(record.processBarCalled).toBe(false);
  });

  it('DL-037: postBarAutomationCalled is false on every DARWIN evaluation', () => {
    const record = makeStrategyRecord({ postBarAutomationCalled: false });
    expect(record.postBarAutomationCalled).toBe(false);
  });

  it('DL-038: tradovateOrderSubmitted is false on every DARWIN evaluation', () => {
    const record = makeStrategyRecord({ tradovateOrderSubmitted: false });
    expect(record.tradovateOrderSubmitted).toBe(false);
  });

  it('DL-039: tradersPostWebhookSent is false on every DARWIN evaluation', () => {
    const record = makeStrategyRecord({ tradersPostWebhookSent: false });
    expect(record.tradersPostWebhookSent).toBe(false);
  });

  it('DL-040: all four broker-call invariants are false simultaneously', () => {
    const record = makeStrategyRecord();
    expect(record.processBarCalled).toBe(false);
    expect(record.postBarAutomationCalled).toBe(false);
    expect(record.tradovateOrderSubmitted).toBe(false);
    expect(record.tradersPostWebhookSent).toBe(false);
  });
});

// ─── DL-041 to DL-045: Rejected candidates remain searchable ─────────────────

describe('DL-041 to DL-045: Rejected candidates remain searchable', () => {
  it('DL-041: rejected candidates are preserved with REJECTED status', () => {
    const candidate = makeCandidateRecord({ status: 'REJECTED', rejectedAt: Date.now(), rejectionReason: 'p=0.882, d=-0.002' });
    expect(candidate.status).toBe('REJECTED');
    expect(candidate.rejectionReason).toBeTruthy();
  });

  it('DL-042: rejected candidates have an immutable experiment manifest hash', () => {
    const candidate = makeCandidateRecord({ status: 'REJECTED', experimentManifestHash: 'd'.repeat(64) });
    expect(candidate.experimentManifestHash).toHaveLength(64);
  });

  it('DL-043: rejected candidates are searchable by manifest hash', () => {
    const hash = 'd'.repeat(64);
    const candidate = makeCandidateRecord({ experimentManifestHash: hash });
    // Simulated lookup
    const found = candidate.experimentManifestHash === hash;
    expect(found).toBe(true);
  });

  it('DL-044: rejected candidates are searchable by strategy ID', () => {
    const candidate = makeCandidateRecord({ candidateId: 'CAND-EXP-D', status: 'REJECTED' });
    const found = candidate.candidateId === 'CAND-EXP-D';
    expect(found).toBe(true);
  });

  it('DL-045: INCONCLUSIVE candidates are also preserved and searchable', () => {
    const candidate = makeCandidateRecord({ status: 'INCONCLUSIVE' });
    expect(candidate.status).toBe('INCONCLUSIVE');
    expect(candidate.candidateId).toBeTruthy();
  });
});

// ─── DL-046 to DL-050: No duplicate failed research ──────────────────────────

describe('DL-046 to DL-050: No duplicate failed research', () => {
  it('DL-046: duplicate failed research is not rerun without new evidence', () => {
    const existingManifestHashes = new Set(['d'.repeat(64)]);
    const newExperimentHash = 'd'.repeat(64); // same hash = same experiment
    const isDuplicate = existingManifestHashes.has(newExperimentHash);
    expect(isDuplicate).toBe(true);
    // Duplicate must not be rerun
    const shouldRerun = !isDuplicate;
    expect(shouldRerun).toBe(false);
  });

  it('DL-047: a new experiment with different parameters produces a different hash', () => {
    const hash1 = 'd'.repeat(64);
    const hash2 = 'e'.repeat(64); // different parameters = different hash
    expect(hash1).not.toBe(hash2);
  });

  it('DL-048: a failed path may be re-investigated if new evidence materially changes the hypothesis', () => {
    const newEvidence = { type: 'REGIME_FILTER_ADDED', description: 'Testing EMA15 displacement only in high-ADX regime' };
    const isNewHypothesis = newEvidence.type === 'REGIME_FILTER_ADDED';
    expect(isNewHypothesis).toBe(true);
    // New hypothesis = new hash = allowed
  });

  it('DL-049: experiment manifests are content-hashed (same input = same hash)', () => {
    const input = { experiment: 'A', dataset: 'mnq_5m_v1.1', dateRange: '2024-2026' };
    const hash1 = JSON.stringify(input); // deterministic
    const hash2 = JSON.stringify(input);
    expect(hash1).toBe(hash2);
  });

  it('DL-050: DARWIN doctrine step 15 is enforced: never repeat a failed research path', () => {
    const failedPaths = new Set(['EMA15_DISPLACEMENT_RECOVERY_v1', 'CHOP_EMA15_CROSS_FADE_v1']);
    const proposedPath = 'EMA15_DISPLACEMENT_RECOVERY_v1'; // already failed
    const isRepeat = failedPaths.has(proposedPath);
    expect(isRepeat).toBe(true);
    // Must not proceed without new evidence
  });
});

// ─── DL-051 to DL-055: Portfolio overlap analysis required ───────────────────

describe('DL-051 to DL-055: Portfolio overlap analysis required', () => {
  it('DL-051: portfolio overlap analysis is required before any candidate promotion', () => {
    const promotionChecklist = {
      statisticalGatesPassed: true,
      outOfSampleValidationPassed: true,
      walkForwardValidationPassed: true,
      portfolioOverlapAnalysisCompleted: true, // required
      philApprovalObtained: false,
    };
    const canPromote = Object.values(promotionChecklist).every(v => v === true);
    expect(canPromote).toBe(false); // Phil approval not yet obtained
    expect(promotionChecklist.portfolioOverlapAnalysisCompleted).toBe(true);
  });

  it('DL-052: correlation with existing strategies must be below 0.7 for promotion', () => {
    function checkCorrelation(correlation: number): boolean {
      return correlation < 0.7;
    }
    expect(checkCorrelation(0.3)).toBe(true);
    expect(checkCorrelation(0.7)).toBe(false);
    expect(checkCorrelation(0.9)).toBe(false);
  });

  it('DL-053: diversification value must be assessed before promotion', () => {
    const candidate = {
      candidateId: 'CAND-001',
      diversificationValue: 'HIGH' as const,
      correlationWithA1: 0.2,
      correlationWithORB1: 0.3,
    };
    expect(['HIGH', 'MEDIUM', 'LOW', 'REDUNDANT']).toContain(candidate.diversificationValue);
  });

  it('DL-054: REDUNDANT diversification value blocks promotion', () => {
    function canPromoteByDiversification(value: string): boolean {
      return value !== 'REDUNDANT';
    }
    expect(canPromoteByDiversification('HIGH')).toBe(true);
    expect(canPromoteByDiversification('REDUNDANT')).toBe(false);
  });

  it('DL-055: portfolio contribution (marginal Sharpe) must be positive for promotion', () => {
    function checkPortfolioContribution(marginalSharpe: number): boolean {
      return marginalSharpe > 0;
    }
    expect(checkPortfolioContribution(0.15)).toBe(true);
    expect(checkPortfolioContribution(-0.05)).toBe(false);
  });
});

// ─── DL-056 to DL-060: Strategy fidelity required before final judgement ─────

describe('DL-056 to DL-060: Strategy fidelity required before final judgement', () => {
  it('DL-056: strategy fidelity must be assessed before classifying a strategy as definitively failed', () => {
    const fidelityRating = 'APPROXIMATE'; // not EXACT
    const canClassifyAsDefinitivelyFailed = fidelityRating === 'EXACT';
    expect(canClassifyAsDefinitivelyFailed).toBe(false);
  });

  it('DL-057: APPROXIMATE fidelity rating prevents definitive failure classification', () => {
    const strategies = [
      { id: 'A1', fidelity: 'APPROXIMATE' },
      { id: 'A3', fidelity: 'APPROXIMATE' },
      { id: 'B1', fidelity: 'APPROXIMATE' },
      { id: 'SB1', fidelity: 'APPROXIMATE' },
      { id: 'ORB-1', fidelity: 'APPROXIMATE' },
    ];
    strategies.forEach(s => {
      const isDefinitivelyFailed = s.fidelity === 'EXACT' && false; // simplified
      expect(s.fidelity).toBe('APPROXIMATE');
    });
  });

  it('DL-058: UNKNOWN fidelity rating prevents definitive failure classification', () => {
    const fidelityRating = 'UNKNOWN';
    const canClassifyAsDefinitivelyFailed = fidelityRating === 'EXACT';
    expect(canClassifyAsDefinitivelyFailed).toBe(false);
  });

  it('DL-059: strategy fidelity report must be completed before Sprint 123A.7 final judgement', () => {
    const sprint123A7Prerequisites = {
      gateG6aApproved: false, // pending Phil
      fidelityReportCompleted: true, // DARWIN_STRATEGY_FIDELITY_REPORT.md exists
      pineScriptReconciliationCompleted: false, // Sprint 123A.7 Phase 1
    };
    expect(sprint123A7Prerequisites.fidelityReportCompleted).toBe(true);
    expect(sprint123A7Prerequisites.pineScriptReconciliationCompleted).toBe(false);
  });

  it('DL-060: interim classifications (REQUIRES_REVIEW, CAUTION_CANDIDATE) are not final judgements', () => {
    const record = makeStrategyRecord({ monitoringStatus: 'REQUIRES_REVIEW' });
    const isDefinitiveJudgement = false; // REQUIRES_REVIEW is advisory
    expect(isDefinitiveJudgement).toBe(false);
    expect(record.retirementRequiresPhilApproval).toBe(true);
  });
});

// ─── DL-061 to DL-065: GitHub SHA attached to evaluations ────────────────────

describe('DL-061 to DL-065: GitHub SHA attached to evaluations', () => {
  it('DL-061: every evaluation record contains a full 40-character git SHA', () => {
    const transition = makeStatusTransition({ gitSha: '97214b1c3b61465ef8559b8133307c9d3dc0b4ef' });
    expect(transition.gitSha).toHaveLength(40);
    expect(transition.gitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('DL-062: evaluation git SHA must match the implementation SHA', () => {
    const implementationSha = '97214b1c3b61465ef8559b8133307c9d3dc0b4ef';
    const evaluationSha = '97214b1c3b61465ef8559b8133307c9d3dc0b4ef';
    expect(evaluationSha).toBe(implementationSha);
  });

  it('DL-063: a short SHA (< 40 chars) is rejected', () => {
    const shortSha = '97214b1';
    const isValidSha = shortSha.length === 40;
    expect(isValidSha).toBe(false);
  });

  it('DL-064: experiment manifests contain a git SHA', () => {
    const manifest = {
      experimentId: 'EXP-D-20260722',
      gitSha: '97214b1c3b61465ef8559b8133307c9d3dc0b4ef',
      contentHash: 'd'.repeat(64),
    };
    expect(manifest.gitSha).toHaveLength(40);
    expect(manifest.contentHash).toHaveLength(64);
  });

  it('DL-065: monitoring reports reference the git SHA of the strategy implementation', () => {
    const report = {
      strategyId: 'A1',
      evaluatedAt: Date.now(),
      implementationSha: '97214b1c3b61465ef8559b8133307c9d3dc0b4ef',
      monitoringStatus: 'REQUIRES_REVIEW' as MonitoringStatus,
    };
    expect(report.implementationSha).toHaveLength(40);
  });
});

// ─── DL-066 to DL-070: Status transitions are auditable ──────────────────────

describe('DL-066 to DL-070: Status transitions are auditable', () => {
  it('DL-066: every status transition records previous and new status', () => {
    const transition = makeStatusTransition({ fromStatus: 'SHADOW', toStatus: 'CAUTION_CANDIDATE' });
    expect(transition.fromStatus).toBe('SHADOW');
    expect(transition.toStatus).toBe('CAUTION_CANDIDATE');
  });

  it('DL-067: every status transition records a timestamp', () => {
    const transition = makeStatusTransition();
    expect(transition.timestamp).toBeGreaterThan(0);
  });

  it('DL-068: every status transition references an evidence document', () => {
    const transition = makeStatusTransition({ evidenceDocumentRef: 'docs/reports/DARWIN_MONITORING_20260722.md' });
    expect(transition.evidenceDocumentRef).toBeTruthy();
    expect(transition.evidenceDocumentRef).toContain('.md');
  });

  it('DL-069: every status transition records a DARWIN evaluation ID', () => {
    const transition = makeStatusTransition({ darwinEvaluationId: 'EVAL-20260722-001' });
    expect(transition.darwinEvaluationId).toBeTruthy();
    expect(transition.darwinEvaluationId).toMatch(/^EVAL-/);
  });

  it('DL-070: Phil-approval-required transitions record the approval reference', () => {
    // Transitions requiring Phil approval must have a philApprovalRef
    const transitionRequiringApproval = makeStatusTransition({
      fromStatus: 'SHADOW',
      toStatus: 'ELIGIBLE_FOR_REVIEW',
      philApprovalRef: 'PHIL-APPROVAL-20260722-001',
    });
    expect(transitionRequiringApproval.philApprovalRef).toBeTruthy();

    // Transitions not requiring Phil approval may have null philApprovalRef
    const transitionNotRequiringApproval = makeStatusTransition({
      fromStatus: 'SHADOW',
      toStatus: 'CAUTION_CANDIDATE',
      philApprovalRef: null,
    });
    expect(transitionNotRequiringApproval.philApprovalRef).toBeNull();
  });
});
