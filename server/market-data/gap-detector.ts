/**
 * Atlas Gap Detector
 *
 * Monitors DataBento MBP-1 sequence numbers to detect gaps in the live feed.
 * A gap indicates missed messages — either a network issue or a DataBento
 * retransmission failure.
 *
 * Gap detection is advisory: Atlas logs gaps but does not halt processing.
 * Gaps during reconnection are expected and suppressed for 5 seconds after
 * a new connection is established.
 *
 * Sprint 121 — Atlas Market Data Platform
 */

// ── Gap event ─────────────────────────────────────────────────────────────────

export interface SequenceGapEvent {
  expectedSequence: number;
  receivedSequence: number;
  gapSize: number;
  detectedAt: number;
}

// ── Gap detector class ────────────────────────────────────────────────────────

export class GapDetector {
  private lastSequence: number | null = null;
  private gapCount = 0;
  private totalGapSize = 0;
  private suppressUntilTs = 0;
  private gapListeners: Array<(event: SequenceGapEvent) => void> = [];

  /**
   * Check a new sequence number for gaps.
   * Call this on every trade event (F_LAST records only).
   */
  checkSequence(sequence: number): void {
    const now = Date.now();

    if (this.lastSequence === null) {
      // First message — no gap possible
      this.lastSequence = sequence;
      return;
    }

    // Suppress gap detection for 5 seconds after reconnection
    if (now < this.suppressUntilTs) {
      this.lastSequence = sequence;
      return;
    }

    const expected = (this.lastSequence + 1) & 0xFFFFFFFF; // 32-bit wrap

    if (sequence !== expected) {
      // Handle sequence wrap-around (32-bit counter)
      const gapSize = (sequence - expected + 0x100000000) & 0xFFFFFFFF;

      // Only report gaps < 10000 (larger gaps are likely reconnections)
      if (gapSize > 0 && gapSize < 10_000) {
        this.gapCount++;
        this.totalGapSize += gapSize;

        const event: SequenceGapEvent = {
          expectedSequence: expected,
          receivedSequence: sequence,
          gapSize,
          detectedAt: now,
        };

        console.warn(
          `[GapDetector] Sequence gap: expected=${expected} received=${sequence} gap=${gapSize}`,
        );

        this.emitGap(event);
      }
    }

    this.lastSequence = sequence;
  }

  /**
   * Reset the detector after a reconnection.
   * Suppresses gap detection for 5 seconds to allow the new session to stabilise.
   */
  reset(): void {
    this.lastSequence = null;
    this.suppressUntilTs = Date.now() + 5_000;
    console.log('[GapDetector] Reset — suppressing gap detection for 5s');
  }

  /** Register a gap event listener */
  onGap(listener: (event: SequenceGapEvent) => void): void {
    this.gapListeners.push(listener);
  }

  /** Get gap statistics */
  getStats(): { gapCount: number; totalGapSize: number; lastSequence: number | null } {
    return {
      gapCount: this.gapCount,
      totalGapSize: this.totalGapSize,
      lastSequence: this.lastSequence,
    };
  }

  /** Reset statistics */
  resetStats(): void {
    this.gapCount = 0;
    this.totalGapSize = 0;
  }

  private emitGap(event: SequenceGapEvent): void {
    for (const listener of this.gapListeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

// Note: singleton is created in market-data/index.ts to avoid circular deps
