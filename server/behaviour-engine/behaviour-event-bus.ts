/**
 * Atlas Behaviour Engine — Behaviour Event Bus
 * Sprint 122B | ORION-DIRECTIVE-001
 *
 * Typed in-process EventEmitter for all behaviour lifecycle events.
 * Shadow mode: events are emitted but NOT consumed by ADE or execution engine.
 */

import { EventEmitter } from 'events';
import type {
  AtlasBehaviourEvent,
  AtlasBehaviourDetected,
  AtlasBehaviourUpdated,
  AtlasBehaviourConfirmed,
  AtlasBehaviourExpired,
  AtlasBehaviourRejected,
} from './types.js';

export type BehaviourEventChannel =
  | 'behaviour_detected'
  | 'behaviour_updated'
  | 'behaviour_confirmed'
  | 'behaviour_expired'
  | 'behaviour_rejected'
  | 'behaviour_engine_bar_complete';

export interface BehaviourBarCompleteEvent {
  barOpenTs: number;
  symbol: string;
  activeCount: number;
  newDetections: number;
  resolutions: number;
  processingMs: number;
}

class BehaviourEventBusImpl extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitDetected(event: AtlasBehaviourDetected): void {
    this.emit('behaviour_detected', event);
    this.emit('behaviour_any', event);
  }

  emitUpdated(event: AtlasBehaviourUpdated): void {
    this.emit('behaviour_updated', event);
    this.emit('behaviour_any', event);
  }

  emitConfirmed(event: AtlasBehaviourConfirmed): void {
    this.emit('behaviour_confirmed', event);
    this.emit('behaviour_any', event);
  }

  emitExpired(event: AtlasBehaviourExpired): void {
    this.emit('behaviour_expired', event);
    this.emit('behaviour_any', event);
  }

  emitRejected(event: AtlasBehaviourRejected): void {
    this.emit('behaviour_rejected', event);
    this.emit('behaviour_any', event);
  }

  emitBarComplete(event: BehaviourBarCompleteEvent): void {
    this.emit('behaviour_engine_bar_complete', event);
  }

  onAny(listener: (event: AtlasBehaviourEvent) => void): void {
    this.on('behaviour_any', listener);
  }

  offAny(listener: (event: AtlasBehaviourEvent) => void): void {
    this.off('behaviour_any', listener);
  }

  onBarComplete(listener: (event: BehaviourBarCompleteEvent) => void): void {
    this.on('behaviour_engine_bar_complete', listener);
  }
}

// Singleton export
export const behaviourEventBus = new BehaviourEventBusImpl();
