/**
 * Atlas Health State Machine
 * Sprint 123A.4 — Gate G4
 *
 * Tracks the health of the Databento feed pipeline and determines
 * the appropriate chart source for the live chart.
 *
 * STATES (9)
 * ----------
 *   INITIALISING       — Service starting up, no data yet
 *   LIVE               — Feed active, bars arriving on schedule
 *   DEGRADED           — Feed active but bars delayed (> 2x interval)
 *   STALE              — No bars received for > 5 minutes
 *   OFFLINE            — No bars received for > 15 minutes
 *   RECONNECTING       — Bridge reconnect in progress
 *   GAP_RECOVERY       — Gap recovery in progress
 *   CONTRACT_ROLL      — Contract roll in progress
 *   SHUTDOWN           — Service shutting down
 *
 * CHART SOURCE FAILOVER POLICY
 * ----------------------------
 *   LIVE / DEGRADED / GAP_RECOVERY / CONTRACT_ROLL
 *     → DATABENTO (primary)
 *   STALE / OFFLINE / RECONNECTING / INITIALISING
 *     → TRADINGVIEW (fallback)
 *   SHUTDOWN
 *     → NONE
 *
 * AUTHORITY BOUNDARY
 * ------------------
 * This state machine is READ-ONLY observability. It MUST NOT:
 *   - trigger processBar
 *   - trigger postBarAutomation
 *   - activate any authority mode
 *   - make trading decisions
 *
 * Sprint 123A.4 — Gate G4
 */

// ─── State definitions ────────────────────────────────────────────────────────

export type HealthState =
  | 'INITIALISING'
  | 'LIVE'
  | 'DEGRADED'
  | 'STALE'
  | 'OFFLINE'
  | 'RECONNECTING'
  | 'GAP_RECOVERY'
  | 'CONTRACT_ROLL'
  | 'SHUTDOWN';

export type ChartSource = 'DATABENTO' | 'TRADINGVIEW' | 'NONE';

export interface HealthSnapshot {
  state: HealthState;
  chartSource: ChartSource;
  lastBarTsMs: number | null;
  lastBarAgeMs: number | null;
  stateEnteredAt: number;
  stateDurationMs: number;
  barCount: number;
  gapRecoveryActive: boolean;
  contractRollActive: boolean;
  reconnectCount: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const HEALTH_THRESHOLDS = {
  /** Bar interval for 1m bars in ms. */
  barIntervalMs: 60_000,
  /** Multiplier above which the feed is considered DEGRADED. */
  degradedMultiplier: 2,
  /** Time with no bars before STALE (ms). */
  staleThresholdMs: 5 * 60_000,
  /** Time with no bars before OFFLINE (ms). */
  offlineThresholdMs: 15 * 60_000,
} as const;

// ─── HealthStateMachine ───────────────────────────────────────────────────────

export class HealthStateMachine {
  private state: HealthState = 'INITIALISING';
  private lastBarTsMs: number | null = null;
  private stateEnteredAt: number = Date.now();
  private barCount = 0;
  private gapRecoveryActive = false;
  private contractRollActive = false;
  private reconnectCount = 0;

  // ─── Event handlers ─────────────────────────────────────────────────────

  /** Called when a new bar is received from the pipeline. */
  onBarReceived(barTsMs: number): void {
    this.lastBarTsMs = barTsMs;
    this.barCount++;
    this._updateLiveState();
  }

  /** Called when the bridge connection is lost. */
  onBridgeDisconnected(): void {
    this._transition('RECONNECTING');
  }

  /** Called when the bridge connection is restored. */
  onBridgeReconnected(): void {
    this.reconnectCount++;
    this._updateLiveState();
  }

  /** Called when gap recovery starts. */
  onGapRecoveryStarted(): void {
    this.gapRecoveryActive = true;
    if (this.state !== 'SHUTDOWN') {
      this._transition('GAP_RECOVERY');
    }
  }

  /** Called when gap recovery completes. */
  onGapRecoveryCompleted(): void {
    this.gapRecoveryActive = false;
    this._updateLiveState();
  }

  /** Called when a contract roll starts. */
  onContractRollStarted(): void {
    this.contractRollActive = true;
    if (this.state !== 'SHUTDOWN') {
      this._transition('CONTRACT_ROLL');
    }
  }

  /** Called when a contract roll completes. */
  onContractRollCompleted(): void {
    this.contractRollActive = false;
    this._updateLiveState();
  }

  /** Called to initiate graceful shutdown. */
  onShutdown(): void {
    this._transition('SHUTDOWN');
  }

  /**
   * Called periodically (e.g. every 30s) to check for staleness.
   * Returns the new state if a transition occurred, null otherwise.
   */
  tick(): HealthState | null {
    if (this.state === 'SHUTDOWN') return null;
    if (this.state === 'RECONNECTING') return null;
    if (this.state === 'INITIALISING') return null;

    const ageMs = this.getLastBarAgeMs();
    if (ageMs === null) return null;

    const prev = this.state;
    this._updateLiveState();
    return this.state !== prev ? this.state : null;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getState(): HealthState {
    return this.state;
  }

  getChartSource(): ChartSource {
    return HealthStateMachine.chartSourceForState(this.state);
  }

  static chartSourceForState(state: HealthState): ChartSource {
    switch (state) {
      case 'LIVE':
      case 'DEGRADED':
      case 'GAP_RECOVERY':
      case 'CONTRACT_ROLL':
        return 'DATABENTO';
      case 'STALE':
      case 'OFFLINE':
      case 'RECONNECTING':
      case 'INITIALISING':
        return 'TRADINGVIEW';
      case 'SHUTDOWN':
        return 'NONE';
    }
  }

  getLastBarAgeMs(): number | null {
    if (this.lastBarTsMs === null) return null;
    return Date.now() - this.lastBarTsMs;
  }

  getSnapshot(): HealthSnapshot {
    const now = Date.now();
    return {
      state: this.state,
      chartSource: this.getChartSource(),
      lastBarTsMs: this.lastBarTsMs,
      lastBarAgeMs: this.getLastBarAgeMs(),
      stateEnteredAt: this.stateEnteredAt,
      stateDurationMs: now - this.stateEnteredAt,
      barCount: this.barCount,
      gapRecoveryActive: this.gapRecoveryActive,
      contractRollActive: this.contractRollActive,
      reconnectCount: this.reconnectCount,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private _updateLiveState(): void {
    if (this.state === 'SHUTDOWN') return;
    if (this.gapRecoveryActive) {
      this._transition('GAP_RECOVERY');
      return;
    }
    if (this.contractRollActive) {
      this._transition('CONTRACT_ROLL');
      return;
    }

    const ageMs = this.getLastBarAgeMs();
    if (ageMs === null) {
      // No bars received yet
      this._transition('INITIALISING');
      return;
    }

    if (ageMs >= HEALTH_THRESHOLDS.offlineThresholdMs) {
      this._transition('OFFLINE');
    } else if (ageMs >= HEALTH_THRESHOLDS.staleThresholdMs) {
      this._transition('STALE');
    } else if (ageMs >= HEALTH_THRESHOLDS.barIntervalMs * HEALTH_THRESHOLDS.degradedMultiplier) {
      this._transition('DEGRADED');
    } else {
      this._transition('LIVE');
    }
  }

  private _transition(newState: HealthState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.stateEnteredAt = Date.now();
  }
}
