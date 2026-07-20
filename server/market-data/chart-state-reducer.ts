/**
 * Chart State Reducer — Sprint 123A.4 Gate G4
 *
 * Pure state machine for the DatabentoLiveChart component.
 * Extracted as a standalone module so it can be unit-tested
 * without a DOM or chart rendering environment.
 *
 * Requirements:
 *   FE-003  Chart state reducer (useReducer) — single source of truth
 *   FE-004  Developing-candle updates (live partial bar)
 *   FE-005  Provisional-to-confirmed replacement (revision=1 replaces revision=0)
 *   FE-006  Corrected-revision replacement (revision=N replaces revision=N-1)
 *   FE-009  Duplicate suppression (same barOpenTsMs + revision already applied)
 *   FE-010  Contract-roll handling (rawSymbol change → clear chart, re-seed)
 *   FE-014  MNQ 0.25-point price snapping (pts100 → points conversion)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarRecord {
  barOpenTsMs: number;
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
  revision: number;
  rawSymbol: string;
  intervalMs: number;
}

export interface DevelopingBar {
  barOpenTsMs: number;
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
}

export interface ChartState {
  bars: Map<number, BarRecord>;       // barOpenTsMs → BarRecord
  developing: DevelopingBar | null;
  currentSymbol: string | null;
  lastConfirmedTsMs: number;
  lastSeq: number;
  seeded: boolean;
}

export type ChartAction =
  | { type: "SEED"; bars: BarRecord[] }
  | { type: "CONFIRMED"; bar: BarRecord; seq: number }
  | { type: "DEVELOPING"; bar: DevelopingBar; seq: number }
  | { type: "SYMBOL_CHANGE"; symbol: string }
  | { type: "RESET" };

// ─── Initial state ────────────────────────────────────────────────────────────

export const initialChartState: ChartState = {
  bars: new Map(),
  developing: null,
  currentSymbol: null,
  lastConfirmedTsMs: 0,
  lastSeq: 0,
  seeded: false,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function chartReducer(state: ChartState, action: ChartAction): ChartState {
  switch (action.type) {

    case "SEED": {
      const bars = new Map<number, BarRecord>();
      let lastTs = 0;
      let lastSymbol: string | null = state.currentSymbol;
      for (const b of action.bars) {
        bars.set(b.barOpenTsMs, b);
        if (b.barOpenTsMs > lastTs) {
          lastTs = b.barOpenTsMs;
          lastSymbol = b.rawSymbol;
        }
      }
      return {
        ...state,
        bars,
        developing: null,
        currentSymbol: lastSymbol,
        lastConfirmedTsMs: lastTs,
        seeded: true,
      };
    }

    case "CONFIRMED": {
      // FE-009: Duplicate suppression — same ts + same or higher revision already applied
      const existing = state.bars.get(action.bar.barOpenTsMs);
      if (existing && existing.revision >= action.bar.revision) return state;

      // FE-010: Contract-roll detection — rawSymbol change clears chart
      if (
        state.currentSymbol !== null &&
        action.bar.rawSymbol !== state.currentSymbol
      ) {
        const bars = new Map<number, BarRecord>();
        bars.set(action.bar.barOpenTsMs, action.bar);
        return {
          ...state,
          bars,
          developing: null,
          currentSymbol: action.bar.rawSymbol,
          lastConfirmedTsMs: action.bar.barOpenTsMs,
          lastSeq: action.seq,
        };
      }

      const bars = new Map(state.bars);
      bars.set(action.bar.barOpenTsMs, action.bar);

      return {
        ...state,
        bars,
        // Clear developing bar if it was for this same timestamp
        developing:
          state.developing?.barOpenTsMs === action.bar.barOpenTsMs
            ? null
            : state.developing,
        currentSymbol: action.bar.rawSymbol,
        lastConfirmedTsMs: action.bar.barOpenTsMs,
        lastSeq: action.seq,
      };
    }

    case "DEVELOPING": {
      // FE-004: Only show developing bar if newer than last confirmed
      if (action.bar.barOpenTsMs <= state.lastConfirmedTsMs) return state;
      return { ...state, developing: action.bar, lastSeq: action.seq };
    }

    case "SYMBOL_CHANGE":
      return { ...state, currentSymbol: action.symbol };

    case "RESET":
      return {
        bars: new Map(),
        developing: null,
        currentSymbol: null,
        lastConfirmedTsMs: 0,
        lastSeq: 0,
        seeded: false,
      };

    default:
      return state;
  }
}

// ─── FE-014: Price conversion ─────────────────────────────────────────────────

/** Convert pts100 (integer hundredths of a point) to MNQ points (0.25 minimum tick). */
export function pts100ToPoints(pts100: number): number {
  const raw = pts100 / 100;
  // Snap to nearest 0.25 tick
  return Math.round(raw * 4) / 4;
}
