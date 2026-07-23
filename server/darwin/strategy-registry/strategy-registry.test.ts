/**
 * Strategy Registry Tests — Sprint 123A.7 Gate G7
 * Verifies the canonical TypeScript strategy registry is correct and complete.
 */
import { describe, it, expect } from 'vitest';
import {
  STRATEGY_REGISTRY,
  ADE_SELECTION_ORDER,
  REGISTRY_METADATA,
  generateFidelityProofTemplate,
  validateFidelityProof,
  type StrategyId,
} from './index';

describe('Strategy Registry — G7 Canonical Definitions', () => {

  it('REG-001: registry contains all 5 canonical strategies', () => {
    const ids = Object.keys(STRATEGY_REGISTRY) as StrategyId[];
    expect(ids).toContain('A1');
    expect(ids).toContain('A3');
    expect(ids).toContain('B1');
    expect(ids).toContain('SB1');
    expect(ids).toContain('ORB-1');
    expect(ids).toHaveLength(5);
  });

  it('REG-002: all strategies use DATABENTO as data source', () => {
    for (const [id, spec] of Object.entries(STRATEGY_REGISTRY)) {
      expect(spec.dataSource).toBe('DATABENTO');
    }
  });

  it('REG-003: no strategy references Pine Script or TradingView', () => {
    const json = JSON.stringify(STRATEGY_REGISTRY);
    expect(json).not.toContain('PINE_SCRIPT');
    expect(json).not.toContain('TradingView');
    expect(json).not.toContain('ACTIVE_TEMPORARY');
  });

  it('REG-004: registry metadata declares TYPESCRIPT_BACKTEST_FIDELITY', () => {
    expect(REGISTRY_METADATA.fidelityTarget).toBe('TYPESCRIPT_BACKTEST_FIDELITY');
    expect(REGISTRY_METADATA.pineScriptStatus).toBe('NON_CANONICAL_LEGACY_REFERENCE');
    expect(REGISTRY_METADATA.dataSource).toBe('DATABENTO');
  });

  it('REG-005: B1 is the only fallback strategy', () => {
    const fallbacks = Object.values(STRATEGY_REGISTRY).filter(s => s.isFallback);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].id).toBe('B1');
  });

  it('REG-006: B1 is last in ADE selection order', () => {
    expect(ADE_SELECTION_ORDER[ADE_SELECTION_ORDER.length - 1]).toBe('B1');
  });

  it('REG-007: commission is $1.24 round-trip for all strategies', () => {
    for (const [id, spec] of Object.entries(STRATEGY_REGISTRY)) {
      expect(spec.commissionPerRoundTrip).toBe(1.24);
    }
  });

  it('REG-008: A3 ADE score is 5% below A1 (A3 never beats A1)', () => {
    expect(STRATEGY_REGISTRY.A3.adeScoreFormula).toContain('0.95');
    expect(STRATEGY_REGISTRY.A1.adeScoreFormula).toBe('adx_value');
  });

  it('REG-009: fidelity proof template generates all required fields', () => {
    const proof = generateFidelityProofTemplate('A1');
    const fieldNames = proof.fidelityFields.map(f => f.field);
    expect(fieldNames).toContain('session');
    expect(fieldNames).toContain('regime');
    expect(fieldNames).toContain('directionFilter');
    expect(fieldNames).toContain('stopAtrMultiplier');
    expect(fieldNames).toContain('targetRRMultiplier');
    expect(fieldNames).toContain('commissionPerRoundTrip');
    expect(fieldNames).toContain('dataSource');
    expect(fieldNames).toContain('featureVersion');
  });

  it('REG-010: incomplete fidelity proof fails validation', () => {
    const proof = generateFidelityProofTemplate('A1');
    // All matches are false by default
    expect(validateFidelityProof(proof)).toBe(false);
  });

  it('REG-011: A1 session is RTH, regime is TRENDING, direction is DMI', () => {
    const a1 = STRATEGY_REGISTRY.A1;
    expect(a1.session).toBe('RTH');
    expect(a1.regime).toBe('TRENDING');
    expect(a1.directionFilter).toBe('DMI_PLUS_OVER_MINUS');
    expect(a1.stopAtrMultiplier).toBe(2.0);
    expect(a1.targetRRMultiplier).toBe(2.0);
  });

  it('REG-012: ORB-1 session is AM_OPEN, regime is VOLATILE, direction is BAR_DIRECTION', () => {
    const orb = STRATEGY_REGISTRY['ORB-1'];
    expect(orb.session).toBe('AM_OPEN');
    expect(orb.regime).toBe('VOLATILE');
    expect(orb.directionFilter).toBe('BAR_DIRECTION');
    expect(orb.stopAtrMultiplier).toBe(1.8);
    expect(orb.targetRRMultiplier).toBe(2.0);
  });

  it('REG-013: SB1 session is AM_MID, direction is EMA9_SLOPE', () => {
    const sb1 = STRATEGY_REGISTRY.SB1;
    expect(sb1.session).toBe('AM_MID');
    expect(sb1.directionFilter).toBe('EMA9_SLOPE');
    expect(sb1.stopAtrMultiplier).toBe(1.5);
    expect(sb1.targetRRMultiplier).toBe(2.5);
  });

  it('REG-014: all strategies have a version string', () => {
    for (const [id, spec] of Object.entries(STRATEGY_REGISTRY)) {
      expect(spec.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('REG-015: registry strategy count matches metadata', () => {
    expect(REGISTRY_METADATA.strategyCount).toBe(Object.keys(STRATEGY_REGISTRY).length);
  });
});
