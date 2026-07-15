/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ─── Unified Portfolio Proposal ───────────────────────────────────────────────

/**
 * ProposalCandidate — submitted by each eligible strategy on every bar.
 * ADE ranks all proposals; the highest-scoring one is approved.
 * Single-active-strategy rule is enforced before proposals are ranked.
 */
export interface ProposalCandidate {
  /** Strategy identifier: A1 | A3 | B1 | SB1 | ORB-1 | S109-001 */
  model: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  riskDollars: number;
  contracts: number;
  /**
   * ADE score — higher = higher conviction.
   * Computed server-side from bar data. Never hard-coded priority.
   */
  adeScore: number;
  /** Human-readable explanation of why this proposal was generated */
  reason: string;
}

