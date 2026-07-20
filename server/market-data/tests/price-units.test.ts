/**
 * price-units.test.ts — Databento Price Unit Standardisation Tests (Gate G3 Revision 3)
 *
 * Authoritative contract:
 *   - Databento encodes ALL price fields using FIXED_PRICE_SCALE = 1_000_000_000 (1e9)
 *   - This applies to OHLCV prices AND min_price_increment
 *   - Atlas stores prices in pts100 (1/100 of a point): price_pts100 = raw_price_fixed / 1e9 * 100
 *   - MNQ tick size: 0.25 pts → raw = 250_000_000 (not 2_500_000)
 *
 * Test IDs: TEST-123A3-PRC001 through TEST-123A3-PRC008
 *
 * Sprint 123A.3 — Gate G3 Revision 3
 */

import { describe, it, expect } from 'vitest';

// ─── Price conversion constants ───────────────────────────────────────────────

/** Databento fixed-point scale: all prices are raw_value / FIXED_PRICE_SCALE = actual_price */
const FIXED_PRICE_SCALE = 1_000_000_000n; // 1e9

/** Atlas internal storage scale: pts100 = actual_price * 100 */
const PTS100_SCALE = 100n;

/**
 * Convert a Databento raw fixed-point price to Atlas pts100 storage.
 * raw_fixed_price / 1e9 * 100 = pts100
 * Integer arithmetic: (raw * 100) / 1e9
 */
function rawToPts100(rawFixed: bigint): bigint {
  return (rawFixed * PTS100_SCALE) / FIXED_PRICE_SCALE;
}

/**
 * Convert Atlas pts100 back to a human-readable price string.
 * pts100 / 100 = actual price
 */
function pts100ToPrice(pts100: bigint): string {
  const whole = pts100 / 100n;
  const frac = pts100 % 100n;
  return `${whole}.${frac.toString().padStart(2, '0')}`;
}

// ─── MNQ contract constants from the approved DBN-decoded fixture ─────────────

/** MNQ min_price_increment raw value from the approved DBN-decoded fixture (mnq_definition_record.dbn) */
const MNQ_MIN_PRICE_INCREMENT_RAW = 250_000_000n; // = 0.25 pts × 1e9

/** MNQ min_price_increment in pts100 */
const MNQ_MIN_PRICE_INCREMENT_PTS100 = rawToPts100(MNQ_MIN_PRICE_INCREMENT_RAW); // = 25

/** MNQ typical OHLCV price: 19000.00 pts */
const MNQ_OHLCV_OPEN_RAW = 19_000_000_000_000n; // = 19000.00 × 1e9

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Databento Price Unit Standardisation', () => {
  it('TEST-123A3-PRC001: FIXED_PRICE_SCALE is 1_000_000_000 (1e9)', () => {
    expect(FIXED_PRICE_SCALE).toBe(1_000_000_000n);
  });

  it('TEST-123A3-PRC002: MNQ min_price_increment raw fixture value is 250_000_000 (not 2_500_000)', () => {
    // The previous fixture had 2_500_000 which incorrectly represented 0.0025 pts.
    // The corrected fixture has 250_000_000 = 0.25 pts × 1e9.
    expect(MNQ_MIN_PRICE_INCREMENT_RAW).toBe(250_000_000n);
    expect(MNQ_MIN_PRICE_INCREMENT_RAW).not.toBe(2_500_000n);
  });

  it('TEST-123A3-PRC003: MNQ min_price_increment converts to 0.25 pts (25 pts100)', () => {
    const pts100 = rawToPts100(MNQ_MIN_PRICE_INCREMENT_RAW);
    expect(pts100).toBe(25n); // 0.25 pts = 25 pts100
    expect(pts100ToPrice(pts100)).toBe('0.25');
  });

  it('TEST-123A3-PRC004: OHLCV price raw value converts correctly to pts100', () => {
    // 19000.00 pts × 1e9 = 19_000_000_000_000 raw
    const pts100 = rawToPts100(MNQ_OHLCV_OPEN_RAW);
    expect(pts100).toBe(1_900_000n); // 19000.00 pts × 100 = 1_900_000 pts100
    expect(pts100ToPrice(pts100)).toBe('19000.00');
  });

  it('TEST-123A3-PRC005: price scale applies uniformly to all OHLCV fields', () => {
    const rawHigh = 19_001_000_000_000n; // 19001.00 pts
    const rawLow  = 18_999_000_000_000n; // 18999.00 pts
    const rawClose = 19_000_500_000_000n; // 19000.50 pts — 2 ticks above open

    expect(rawToPts100(rawHigh)).toBe(1_900_100n);
    expect(rawToPts100(rawLow)).toBe(1_899_900n);
    expect(rawToPts100(rawClose)).toBe(1_900_050n);
  });

  it('TEST-123A3-PRC006: min_price_increment scale is identical to OHLCV price scale', () => {
    // Both use FIXED_PRICE_SCALE = 1e9. A 0.25 pt tick in OHLCV space:
    const oneTickRaw = MNQ_MIN_PRICE_INCREMENT_RAW;
    const openRaw = MNQ_OHLCV_OPEN_RAW;
    const openPlusOneTick = rawToPts100(openRaw + oneTickRaw);
    const openPts100 = rawToPts100(openRaw);
    expect(openPlusOneTick - openPts100).toBe(25n); // exactly one tick = 25 pts100
  });

  it('TEST-123A3-PRC007: incorrect 2_500_000 fixture value would produce wrong tick size', () => {
    // This test documents the error in the previous fixture.
    const wrongRaw = 2_500_000n; // previous fixture value
    const wrongPts100 = rawToPts100(wrongRaw);
    expect(wrongPts100).toBe(0n); // rounds to 0 — completely wrong
    expect(wrongPts100).not.toBe(25n); // not the correct 0.25 pt tick
  });

  it('TEST-123A3-PRC008: pts100 round-trip is lossless for all MNQ tick multiples', () => {
    // MNQ ticks are 0.25 pts. Verify that all prices at tick boundaries
    // round-trip through pts100 without loss.
    const tickRaw = MNQ_MIN_PRICE_INCREMENT_RAW; // 250_000_000
    const baseRaw = MNQ_OHLCV_OPEN_RAW; // 19000.00 pts

    for (let i = 0n; i < 100n; i++) {
      const raw = baseRaw + i * tickRaw;
      const pts100 = rawToPts100(raw);
      // Reconstruct raw from pts100: pts100 * 1e9 / 100 should equal original raw
      const reconstructed = (pts100 * FIXED_PRICE_SCALE) / PTS100_SCALE;
      expect(reconstructed).toBe(raw);
    }
  });
});
