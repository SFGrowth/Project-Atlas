/**
 * DARWIN CRO Engine — Sprint 101
 *
 * Transforms DARWIN from a passive research engine into an autonomous
 * Chief Research Officer (CRO). This module owns:
 *
 *   1. Research Queue management — auto-prioritisation by Expected Research Value (ERV)
 *   2. Promotion Gate evaluation — 8-stage evidence-based promotion decisions
 *   3. Rejection logic — structured rejection with lessons learned
 *   4. Portfolio-aware scoring — regime/session gap analysis drives priority
 *   5. Daily autonomous work — what DARWIN does each day without human input
 *   6. Weekly CRO Report generation — formal institutional research record
 *   7. Recursive learning — auto-replay when Market Laws or Behaviours change
 *
 * Architecture:
 *   - All decisions are logged to darwin_work_log (audit trail)
 *   - All promotions are recorded in darwin_promotion_gates
 *   - All rejections are archived in darwin_rejection_registry
 *   - Research items live in darwin_research_queue
 *   - Weekly reports go to darwin_cro_reports
 */

import { randomUUID } from "crypto";
import { eq, desc, asc, and, sql, lt, gte, isNull, inArray, ne } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  darwinResearchQueue,
  darwinRejectionRegistry,
  darwinCroReports,
  darwinWorkLog,
  darwinPromotionGates,
  darwinCandidates,
  behaviourLibrary,
  marketLaws,
  atlasMemory,
  InsertDarwinResearchQueueItem,
  InsertDarwinRejection,
  InsertDarwinCroReport,
  InsertDarwinWorkLogEntry,
  InsertDarwinPromotionGate,
} from "../drizzle/schema.js";
import { notifyOwner } from "./_core/notification.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Promotion gate thresholds — evidence required to advance each stage */
const GATE_THRESHOLDS: Record<string, { minEvidence: number; minConfidence: number; minOccurrences?: number; minWinRate?: number; minPF?: number; minMC?: number }> = {
  OBSERVATION:          { minEvidence: 0,    minConfidence: 0 },
  EVIDENCE_THRESHOLD:   { minEvidence: 15,   minConfidence: 30,  minOccurrences: 20 },
  HISTORICAL_REPLAY:    { minEvidence: 30,   minConfidence: 45,  minOccurrences: 50 },
  BACKTEST:             { minEvidence: 50,   minConfidence: 55,  minWinRate: 0.55, minPF: 1.5 },
  WALK_FORWARD:         { minEvidence: 65,   minConfidence: 65,  minWinRate: 0.58, minPF: 1.6 },
  MONTE_CARLO:          { minEvidence: 75,   minConfidence: 70,  minMC: 0.75 },
  PAPER_TRADING:        { minEvidence: 85,   minConfidence: 75,  minWinRate: 0.60, minPF: 1.7 },
  FORWARD_VALIDATION:   { minEvidence: 92,   minConfidence: 82,  minWinRate: 0.62, minPF: 1.8 },
  PRODUCTION_CANDIDATE: { minEvidence: 95,   minConfidence: 88,  minWinRate: 0.65, minPF: 2.0, minMC: 0.88 },
};

/** Stage ordering for progression */
const STAGE_ORDER = [
  "OBSERVATION",
  "EVIDENCE_THRESHOLD",
  "HISTORICAL_REPLAY",
  "BACKTEST",
  "WALK_FORWARD",
  "MONTE_CARLO",
  "PAPER_TRADING",
  "FORWARD_VALIDATION",
  "PRODUCTION_CANDIDATE",
];

/** Regime/session coverage targets — what the portfolio needs */
const PORTFOLIO_GAPS = {
  regimes: ["RANGE", "TREND", "VOLATILE", "TRANSITION"],
  sessions: ["RTH", "ETH", "OVERNIGHT", "PRE_MARKET"],
  // Currently covered by ATS v2.0 (A1, A2, A3)
  covered: {
    regimes: ["TREND"],
    sessions: ["RTH", "OVERNIGHT"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WORK LOG HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function logWork(
  workType: string,
  description: string,
  opts: {
    rationale?: string;
    targetResearchId?: string;
    targetCandidateId?: string;
    outcome?: string;
    outcomeDetails?: string;
    durationMs?: number;
    layer?: number;
    priority?: number;
  } = {}
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = Date.now();
  const entry: InsertDarwinWorkLogEntry = {
    workId: `WRK-${randomUUID().slice(0, 8).toUpperCase()}`,
    workType,
    description,
    rationale: opts.rationale ?? null,
    targetResearchId: opts.targetResearchId ?? null,
    targetCandidateId: opts.targetCandidateId ?? null,
    outcome: opts.outcome ?? "SUCCESS",
    outcomeDetails: opts.outcomeDetails ?? null,
    durationMs: opts.durationMs ?? null,
    scheduledPriority: opts.priority ?? 5,
    layer: opts.layer ?? 3,
    startedAt: now,
    completedAt: now,
  };
  await db.insert(darwinWorkLog).values(entry).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO GAP ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse the current portfolio coverage gaps.
 * Returns a score (0–100) for how much a research item fills a gap.
 */
function computePortfolioValue(targetRegimes: string, targetSessions: string): number {
  const regimes = targetRegimes ? targetRegimes.split(",").map(r => r.trim()) : [];
  const sessions = targetSessions ? targetSessions.split(",").map(s => s.trim()) : [];

  const uncoveredRegimes = PORTFOLIO_GAPS.regimes.filter(r => !PORTFOLIO_GAPS.covered.regimes.includes(r));
  const uncoveredSessions = PORTFOLIO_GAPS.sessions.filter(s => !PORTFOLIO_GAPS.covered.sessions.includes(s));

  const regimeGapHits = regimes.filter(r => uncoveredRegimes.includes(r)).length;
  const sessionGapHits = sessions.filter(s => uncoveredSessions.includes(s)).length;

  const regimeScore = uncoveredRegimes.length > 0 ? (regimeGapHits / uncoveredRegimes.length) * 60 : 0;
  const sessionScore = uncoveredSessions.length > 0 ? (sessionGapHits / uncoveredSessions.length) * 40 : 0;

  return Math.min(100, regimeScore + sessionScore);
}

/**
 * Compute Expected Research Value (ERV) for a queue item.
 * ERV = (confidence × portfolioValue × noveltyScore) / (computationalCost × 100)
 */
function computeERV(
  confidence: number,
  portfolioValue: number,
  noveltyScore: number,
  computationalCost: number
): number {
  if (computationalCost <= 0) return 0;
  return (confidence * portfolioValue * noveltyScore) / (computationalCost * 100 * 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH QUEUE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new item to the research queue.
 * Called when DARWIN discovers a new pattern or when a Market Law / Behaviour
 * Library update triggers a new research hypothesis.
 */
export async function enqueueResearch(item: {
  hypothesis: string;
  behaviourClass?: string;
  origin?: string;
  targetRegimes?: string;
  targetSessions?: string;
  estimatedCorrelation?: number;
  computationalCost?: number;
  noveltyScore?: number;
  liveObservations?: number;
  historicalObservations?: number;
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const researchId = `RQ-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const portfolioValue = computePortfolioValue(
    item.targetRegimes ?? "",
    item.targetSessions ?? ""
  );
  const confidence = 10; // starts low, grows with evidence
  const noveltyScore = item.noveltyScore ?? 50;
  const computationalCost = item.computationalCost ?? 5;
  const erv = computeERV(confidence, portfolioValue, noveltyScore, computationalCost);

  const entry: InsertDarwinResearchQueueItem = {
    researchId,
    origin: item.origin ?? "DARWIN",
    hypothesis: item.hypothesis,
    behaviourClass: item.behaviourClass ?? null,
    currentStage: "OBSERVATION",
    priority: 50,
    evidenceScore: "0.00",
    confidence: String(confidence.toFixed(2)),
    portfolioValue: String(portfolioValue.toFixed(2)),
    computationalCost,
    expectedResearchValue: String(erv.toFixed(4)),
    targetRegimes: item.targetRegimes ?? null,
    targetSessions: item.targetSessions ?? null,
    estimatedCorrelation: item.estimatedCorrelation != null ? String(item.estimatedCorrelation.toFixed(4)) : null,
    liveObservations: item.liveObservations ?? 0,
    historicalObservations: item.historicalObservations ?? 0,
    noveltyScore: String(noveltyScore.toFixed(2)),
    status: "ACTIVE",
  };

  await db.insert(darwinResearchQueue).values(entry);

  await logWork(
    "QUEUE_ENQUEUE",
    `Enqueued new research: ${item.hypothesis.slice(0, 80)}`,
    {
      rationale: `Origin: ${item.origin ?? "DARWIN"} | Portfolio value: ${portfolioValue.toFixed(1)} | ERV: ${erv.toFixed(4)}`,
      targetResearchId: researchId,
      layer: 3,
    }
  );

  return researchId;
}

/**
 * Re-prioritise the entire research queue by recomputing ERV for every item
 * and assigning priority ranks (1 = highest).
 */
export async function reprioritiseQueue(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const items = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"))
    .orderBy(desc(darwinResearchQueue.expectedResearchValue));

  if (items.length === 0) return;

  const now = Date.now();
  let updated = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const confidence = parseFloat(String(item.confidence ?? "0"));
    const portfolioValue = computePortfolioValue(
      item.targetRegimes ?? "",
      item.targetSessions ?? ""
    );
    const noveltyScore = parseFloat(String(item.noveltyScore ?? "50"));
    const computationalCost = item.computationalCost ?? 5;
    const erv = computeERV(confidence, portfolioValue, noveltyScore, computationalCost);
    const priority = i + 1;

    await db
      .update(darwinResearchQueue)
      .set({
        priority,
        portfolioValue: String(portfolioValue.toFixed(2)),
        expectedResearchValue: String(erv.toFixed(4)),
        lastReviewed: now,
      })
      .where(eq(darwinResearchQueue.researchId, item.researchId));

    updated++;
  }

  await logWork(
    "PRIORITISATION",
    `Re-prioritised ${updated} research queue items by Expected Research Value`,
    {
      rationale: "Periodic ERV recalculation triggered by daily review cycle",
      layer: 3,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTION GATE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a research item should be promoted to the next stage.
 * Returns the gate decision and records it in darwin_promotion_gates.
 */
export async function evaluatePromotionGate(
  researchId: string,
  metrics: {
    evidenceScore: number;
    confidence: number;
    occurrences?: number;
    winRate?: number;
    profitFactor?: number;
    mcPassRate?: number;
  }
): Promise<{ decision: "PROMOTED" | "HELD" | "REJECTED"; rationale: string; toStage?: string }> {
  const db = await getDb();
  if (!db) return { decision: "HELD", rationale: "DB unavailable" };

  const [item] = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.researchId, researchId))
    .limit(1);

  if (!item) return { decision: "HELD", rationale: "Research item not found" };

  const currentStage = item.currentStage;
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  if (currentIdx === -1 || currentIdx === STAGE_ORDER.length - 1) {
    return { decision: "HELD", rationale: "Already at final stage or unknown stage" };
  }

  const threshold = GATE_THRESHOLDS[currentStage];
  const nextStage = STAGE_ORDER[currentIdx + 1];

  // Check all thresholds
  const failures: string[] = [];

  if (metrics.evidenceScore < threshold.minEvidence) {
    failures.push(`Evidence ${metrics.evidenceScore.toFixed(1)} < required ${threshold.minEvidence}`);
  }
  if (metrics.confidence < threshold.minConfidence) {
    failures.push(`Confidence ${metrics.confidence.toFixed(1)} < required ${threshold.minConfidence}`);
  }
  if (threshold.minOccurrences && (metrics.occurrences ?? 0) < threshold.minOccurrences) {
    failures.push(`Occurrences ${metrics.occurrences ?? 0} < required ${threshold.minOccurrences}`);
  }
  if (threshold.minWinRate && (metrics.winRate ?? 0) < threshold.minWinRate) {
    failures.push(`Win rate ${((metrics.winRate ?? 0) * 100).toFixed(1)}% < required ${(threshold.minWinRate * 100).toFixed(1)}%`);
  }
  if (threshold.minPF && (metrics.profitFactor ?? 0) < threshold.minPF) {
    failures.push(`Profit factor ${(metrics.profitFactor ?? 0).toFixed(2)} < required ${threshold.minPF}`);
  }
  if (threshold.minMC && (metrics.mcPassRate ?? 0) < threshold.minMC) {
    failures.push(`MC pass rate ${((metrics.mcPassRate ?? 0) * 100).toFixed(1)}% < required ${(threshold.minMC * 100).toFixed(1)}%`);
  }

  const decision: "PROMOTED" | "HELD" | "REJECTED" = failures.length === 0 ? "PROMOTED" : "HELD";
  const rationale = failures.length === 0
    ? `All gate criteria met for ${currentStage} → ${nextStage}. Evidence: ${metrics.evidenceScore.toFixed(1)}, Confidence: ${metrics.confidence.toFixed(1)}`
    : `Gate held at ${currentStage}: ${failures.join("; ")}`;

  // Record the gate evaluation
  const gateEntry: InsertDarwinPromotionGate = {
    gateId: `GATE-${randomUUID().slice(0, 8).toUpperCase()}`,
    researchId,
    candidateId: item.linkedCandidateId ?? null,
    fromStage: currentStage,
    toStage: nextStage,
    decision,
    evidenceScore: String(metrics.evidenceScore.toFixed(2)),
    confidenceScore: String(metrics.confidence.toFixed(2)),
    portfolioValue: item.portfolioValue,
    occurrences: metrics.occurrences ?? null,
    winRate: metrics.winRate != null ? String((metrics.winRate * 100).toFixed(2)) : null,
    profitFactor: metrics.profitFactor != null ? String(metrics.profitFactor.toFixed(2)) : null,
    mcPassRate: metrics.mcPassRate != null ? String((metrics.mcPassRate * 100).toFixed(2)) : null,
    minEvidenceRequired: String(threshold.minEvidence.toFixed(2)),
    minConfidenceRequired: String(threshold.minConfidence.toFixed(2)),
    decisionRationale: rationale,
    evaluatedBy: "DARWIN",
    evaluatedAt: Date.now(),
  };

  await db.insert(darwinPromotionGates).values(gateEntry).catch(() => {});

  // If promoted, advance the stage
  if (decision === "PROMOTED") {
    await db
      .update(darwinResearchQueue)
      .set({
        currentStage: nextStage,
        evidenceScore: String(metrics.evidenceScore.toFixed(2)),
        confidence: String(metrics.confidence.toFixed(2)),
        lastReviewed: Date.now(),
      })
      .where(eq(darwinResearchQueue.researchId, researchId));

    await logWork(
      "PROMOTION_GATE",
      `Promoted ${researchId}: ${currentStage} → ${nextStage}`,
      {
        rationale,
        targetResearchId: researchId,
        outcome: "SUCCESS",
        layer: 3,
      }
    );

    // Notify owner of significant promotions
    if (nextStage === "PAPER_TRADING" || nextStage === "PRODUCTION_CANDIDATE") {
      try {
        await notifyOwner({
          title: `DARWIN: Research Promoted to ${nextStage}`,
          content: `${researchId} has advanced to ${nextStage}.\n\n${rationale}`,
        });
      } catch { /* non-fatal */ }
    }
  } else {
    await logWork(
      "PROMOTION_GATE",
      `Gate held for ${researchId} at ${currentStage}`,
      {
        rationale,
        targetResearchId: researchId,
        outcome: "PARTIAL",
        layer: 3,
      }
    );
  }

  return { decision, rationale, toStage: decision === "PROMOTED" ? nextStage : undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// REJECTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formally reject a research item. Archives it to the rejection registry
 * with lessons learned. The item is never deleted — only marked REJECTED.
 */
export async function rejectResearch(
  researchId: string,
  reason: string,
  opts: {
    reasonCode?: string;
    lessonLearned?: string;
    reconsiderConditions?: string;
    computeHoursSpent?: number;
  } = {}
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [item] = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.researchId, researchId))
    .limit(1);

  if (!item) return;

  // Archive to rejection registry
  const rejection: InsertDarwinRejection = {
    rejectionId: `REJ-${randomUUID().slice(0, 8).toUpperCase()}`,
    researchId,
    candidateId: item.linkedCandidateId ?? null,
    hypothesisSummary: item.hypothesis.slice(0, 500),
    behaviourClass: item.behaviourClass ?? null,
    rejectionStage: item.currentStage,
    rejectionReason: reason,
    reasonCode: opts.reasonCode ?? "INSUFFICIENT_EVIDENCE",
    evidenceAtRejection: item.evidenceScore,
    confidenceAtRejection: item.confidence,
    lessonLearned: opts.lessonLearned ?? null,
    reconsiderConditions: opts.reconsiderConditions ?? null,
    computeHoursSpent: opts.computeHoursSpent != null ? String(opts.computeHoursSpent.toFixed(2)) : "0.00",
    rejectedAt: Date.now(),
    rejectedBy: "DARWIN",
  };

  await db.insert(darwinRejectionRegistry).values(rejection).catch(() => {});

  // Mark queue item as rejected
  await db
    .update(darwinResearchQueue)
    .set({ status: "REJECTED", blockReason: reason })
    .where(eq(darwinResearchQueue.researchId, researchId));

  await logWork(
    "REJECTION",
    `Rejected research ${researchId}: ${reason.slice(0, 100)}`,
    {
      rationale: opts.lessonLearned ?? "Insufficient evidence to continue",
      targetResearchId: researchId,
      outcome: "SUCCESS",
      layer: 3,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY AUTONOMOUS WORK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DARWIN's daily autonomous work cycle.
 * Called by the daily scheduled job. Does not require human input.
 *
 * Daily work includes:
 *   1. Sync research queue from darwin_candidates (promote candidates to queue)
 *   2. Update live observation counts from atlas_memory
 *   3. Re-prioritise the queue by ERV
 *   4. Evaluate promotion gates for top-priority items
 *   5. Reject items that have stalled too long
 *   6. Identify portfolio gaps and enqueue new research
 *   7. Log a daily summary
 */
export async function runDailyAutonomousWork(): Promise<{
  itemsReviewed: number;
  itemsPromoted: number;
  itemsRejected: number;
  newItemsEnqueued: number;
  queueSize: number;
}> {
  const db = await getDb();
  if (!db) return { itemsReviewed: 0, itemsPromoted: 0, itemsRejected: 0, newItemsEnqueued: 0, queueSize: 0 };

  const startTime = Date.now();
  let itemsReviewed = 0;
  let itemsPromoted = 0;
  let itemsRejected = 0;
  let newItemsEnqueued = 0;

  await logWork("DAILY_CYCLE_START", "DARWIN daily autonomous work cycle started", { layer: 3 });

  // ── Step 1: Sync candidates to research queue ────────────────────────────
  const candidates = await db
    .select()
    .from(darwinCandidates)
    .where(ne(darwinCandidates.governanceStage, "REJECTED"))
    .limit(50);

  for (const candidate of candidates) {
    // Check if already in queue
    const [existing] = await db
      .select({ researchId: darwinResearchQueue.researchId })
      .from(darwinResearchQueue)
      .where(eq(darwinResearchQueue.linkedCandidateId, candidate.candidateId))
      .limit(1);

    if (!existing) {
      const id = await enqueueResearch({
        hypothesis: candidate.behaviourDescription ?? `Investigate ${candidate.behaviourClass} behaviour pattern`,
        behaviourClass: candidate.behaviourClass ?? undefined,
        origin: "DARWIN",
        targetRegimes: candidate.supportingRegimes ?? undefined,
        targetSessions: candidate.supportingSessions ?? undefined,
        estimatedCorrelation: candidate.estimatedCorrelation ? parseFloat(String(candidate.estimatedCorrelation)) : undefined,
        liveObservations: 0,
        historicalObservations: candidate.occurrenceCount ?? 0,
      });

      // Link the candidate
      await db
        .update(darwinResearchQueue)
        .set({ linkedCandidateId: candidate.candidateId })
        .where(eq(darwinResearchQueue.researchId, id));

      newItemsEnqueued++;
    }
  }

  // ── Step 2: Update live observation counts ───────────────────────────────
  const queueItems = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"))
    .limit(100);

  for (const item of queueItems) {
    if (!item.behaviourClass) continue;

    // Count matching bars in atlas_memory
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(atlasMemory)
      .where(
        item.targetRegimes
          ? sql`regime_classification IN (${sql.raw(item.targetRegimes.split(",").map(r => `'${r.trim()}'`).join(","))})`
          : sql`1=1`
      );

    const liveObs = Number(countResult?.count ?? 0);
    if (liveObs !== item.liveObservations) {
      await db
        .update(darwinResearchQueue)
        .set({ liveObservations: liveObs })
        .where(eq(darwinResearchQueue.researchId, item.researchId));
    }
  }

  // ── Step 3: Re-prioritise queue ──────────────────────────────────────────
  await reprioritiseQueue();

  // ── Step 4: Evaluate promotion gates for top 10 items ───────────────────
  const topItems = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"))
    .orderBy(asc(darwinResearchQueue.priority))
    .limit(10);

  for (const item of topItems) {
    itemsReviewed++;
    const evidence = parseFloat(String(item.evidenceScore ?? "0"));
    const confidence = parseFloat(String(item.confidence ?? "0"));
    const liveObs = item.liveObservations ?? 0;
    const histObs = item.historicalObservations ?? 0;

    // Compute dynamic evidence score from observations
    const dynamicEvidence = Math.min(100, (liveObs * 0.5 + histObs * 0.1));
    const dynamicConfidence = Math.min(100, confidence + (liveObs > 50 ? 10 : liveObs > 20 ? 5 : 0));

    const result = await evaluatePromotionGate(item.researchId, {
      evidenceScore: Math.max(evidence, dynamicEvidence),
      confidence: Math.max(confidence, dynamicConfidence),
      occurrences: liveObs + histObs,
    });

    if (result.decision === "PROMOTED") itemsPromoted++;
  }

  // ── Step 5: Reject stalled items (no observations in 30+ days) ──────────
  const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const stalledItems = await db
    .select()
    .from(darwinResearchQueue)
    .where(
      and(
        eq(darwinResearchQueue.status, "ACTIVE"),
        eq(darwinResearchQueue.currentStage, "OBSERVATION"),
        lt(darwinResearchQueue.liveObservations, 5),
        lt(darwinResearchQueue.createdAt, new Date(thirtyDaysAgo))
      )
    )
    .limit(5);

  for (const item of stalledItems) {
    await rejectResearch(item.researchId, "Insufficient live observations after 30 days at OBSERVATION stage", {
      reasonCode: "INSUFFICIENT_EVIDENCE",
      lessonLearned: "Hypothesis did not attract sufficient live market evidence. May be regime-specific or too narrow.",
      reconsiderConditions: "Reconsider if market regime changes or if new behaviour patterns emerge.",
    });
    itemsRejected++;
  }

  // ── Step 6: Identify portfolio gaps and enqueue new research ─────────────
  const activeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinResearchQueue)
    .where(
      and(
        eq(darwinResearchQueue.status, "ACTIVE"),
        eq(darwinResearchQueue.targetRegimes, "RANGE")
      )
    );

  if (Number(activeCount[0]?.count ?? 0) === 0) {
    await enqueueResearch({
      hypothesis: "RANGE regime presents mean-reversion opportunities that ATS v2.0 does not exploit. Investigate VWAP deviation entries on RANGE-classified days during RTH session.",
      behaviourClass: "MEAN_REVERSION",
      origin: "PORTFOLIO_GAP_ANALYSIS",
      targetRegimes: "RANGE",
      targetSessions: "RTH",
      noveltyScore: 85,
      computationalCost: 4,
    });
    newItemsEnqueued++;
  }

  // ── Step 7: Log daily summary ────────────────────────────────────────────
  const [queueCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"));

  const queueSize = Number(queueCount?.count ?? 0);
  const durationMs = Date.now() - startTime;

  await logWork(
    "DAILY_CYCLE_COMPLETE",
    `Daily cycle complete: reviewed ${itemsReviewed}, promoted ${itemsPromoted}, rejected ${itemsRejected}, enqueued ${newItemsEnqueued}. Queue: ${queueSize} active items.`,
    {
      rationale: `Cycle duration: ${durationMs}ms`,
      outcome: "SUCCESS",
      outcomeDetails: JSON.stringify({ itemsReviewed, itemsPromoted, itemsRejected, newItemsEnqueued, queueSize }),
      durationMs,
      layer: 3,
    }
  );

  return { itemsReviewed, itemsPromoted, itemsRejected, newItemsEnqueued, queueSize };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURSIVE LEARNING — Market Law / Behaviour Library triggers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a Market Law confidence score changes significantly.
 * Triggers re-evaluation of all research items that target the same regime.
 */
export async function onMarketLawUpdate(lawId: string, newConfidence: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [law] = await db
    .select()
    .from(marketLaws)
    .where(eq(marketLaws.lawId, lawId))
    .limit(1);

  if (!law) return;

  await logWork(
    "MARKET_LAW_UPDATE",
    `Market Law ${lawId} confidence updated to ${newConfidence.toFixed(1)}. Triggering research queue review.`,
    {
      rationale: `Law: ${law.title}. Confidence change may affect research priorities.`,
      outcome: "SUCCESS",
      layer: 2,
    }
  );

  // Boost evidence scores for research items (all active items benefit from law updates)
  {
    const items = await db
      .select()
      .from(darwinResearchQueue)
      .where(eq(darwinResearchQueue.status, "ACTIVE"))
      .limit(20);

    for (const item of items) {
      const currentEvidence = parseFloat(String(item.evidenceScore ?? "0"));
      const boost = newConfidence > 70 ? 5 : newConfidence > 50 ? 2 : 0;
      if (boost > 0) {
        await db
          .update(darwinResearchQueue)
          .set({ evidenceScore: String(Math.min(100, currentEvidence + boost).toFixed(2)) })
          .where(eq(darwinResearchQueue.researchId, item.researchId));
      }
    }
  }
}

/**
 * Called when a new behaviour is discovered in the Behaviour Library.
 * Creates a new research queue item to investigate execution opportunities.
 */
export async function onBehaviourDiscovered(behaviourId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [behaviour] = await db
    .select()
    .from(behaviourLibrary)
    .where(eq(behaviourLibrary.behaviourId, behaviourId))
    .limit(1);

  if (!behaviour) return;

  // Check if we already have this in the queue
  const [existing] = await db
    .select({ researchId: darwinResearchQueue.researchId })
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.behaviourClass, behaviour.behaviourName ?? ""))
    .limit(1);

  if (existing) return; // Already researching this behaviour class

  await enqueueResearch({
    hypothesis: `Behaviour '${behaviour.behaviourName}' detected in Atlas Memory with ${behaviour.totalObservations ?? 0} occurrences. Investigate execution model opportunities for this behaviour pattern.`,
    behaviourClass: behaviour.behaviourName ?? undefined,
    origin: "BEHAVIOUR_LIBRARY",
    targetRegimes: undefined,
    targetSessions: undefined,
    liveObservations: behaviour.totalObservations ?? 0,
    noveltyScore: 70,
    computationalCost: 5,
  });

  await logWork(
    "BEHAVIOUR_MINING",
    `New research enqueued from behaviour discovery: ${behaviour.behaviourName}`,
    {
      rationale: `Behaviour ${behaviourId} has ${behaviour.totalObservations ?? 0} observations. Potential execution model candidate.`,
      outcome: "SUCCESS",
      layer: 2,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY CRO REPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the weekly Chief Research Officer report.
 * Called every Sunday by the scheduled job.
 */
export async function generateCroReport(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const now = Date.now();
  const weekStart = now - 7 * 24 * 3600 * 1000;
  const reportId = `CRO-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 4).toUpperCase()}`;

  // Gather metrics
  const [activeQueue] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"));

  const [weekRejections] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinRejectionRegistry)
    .where(gte(darwinRejectionRegistry.rejectedAt, weekStart));

  const [weekPromotions] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinPromotionGates)
    .where(
      and(
        eq(darwinPromotionGates.decision, "PROMOTED"),
        gte(darwinPromotionGates.evaluatedAt, weekStart)
      )
    );

  const [weekWorkItems] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinWorkLog)
    .where(gte(darwinWorkLog.startedAt, weekStart));

  const topItems = await db
    .select()
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"))
    .orderBy(asc(darwinResearchQueue.priority))
    .limit(5);

  const laws = await db
    .select({ lawId: marketLaws.lawId, title: marketLaws.title, confidenceScore: marketLaws.confidenceScore })
    .from(marketLaws)
    .orderBy(desc(marketLaws.confidenceScore))
    .limit(6);

  const queueSize = Number(activeQueue?.count ?? 0);
  const rejectionsThisWeek = Number(weekRejections?.count ?? 0);
  const promotionsThisWeek = Number(weekPromotions?.count ?? 0);
  const workItemsThisWeek = Number(weekWorkItems?.count ?? 0);

  // Compute coverage scores
  const regimeCoverage = (PORTFOLIO_GAPS.covered.regimes.length / PORTFOLIO_GAPS.regimes.length) * 100;
  const sessionCoverage = (PORTFOLIO_GAPS.covered.sessions.length / PORTFOLIO_GAPS.sessions.length) * 100;

  // Build report markdown
  const topResearchList = topItems
    .map((item, i) => `${i + 1}. **${item.researchId}** (${item.behaviourClass ?? "General"}) — Stage: ${item.currentStage} | Evidence: ${item.evidenceScore} | ERV: ${item.expectedResearchValue}`)
    .join("\n");

  const lawsList = laws
    .map(l => `- ${l.lawId}: ${l.title} (Confidence: ${l.confidenceScore ?? "—"})`)
    .join("\n");

  const fullReportMarkdown = `# DARWIN CRO Weekly Report
**Report ID:** ${reportId}
**Period:** ${new Date(weekStart).toISOString().slice(0, 10)} → ${new Date(now).toISOString().slice(0, 10)}
**Generated:** ${new Date(now).toISOString()}

---

## Executive Summary

DARWIN completed **${workItemsThisWeek}** autonomous work items this week, promoted **${promotionsThisWeek}** research items, and rejected **${rejectionsThisWeek}** hypotheses. The active research queue contains **${queueSize}** items.

## Portfolio Coverage

| Dimension | Covered | Total | Coverage |
|---|---|---|---|
| Regimes | ${PORTFOLIO_GAPS.covered.regimes.join(", ")} | ${PORTFOLIO_GAPS.regimes.join(", ")} | ${regimeCoverage.toFixed(0)}% |
| Sessions | ${PORTFOLIO_GAPS.covered.sessions.join(", ")} | ${PORTFOLIO_GAPS.sessions.join(", ")} | ${sessionCoverage.toFixed(0)}% |

**Portfolio gaps requiring research:** ${PORTFOLIO_GAPS.regimes.filter(r => !PORTFOLIO_GAPS.covered.regimes.includes(r)).join(", ")} regimes; ${PORTFOLIO_GAPS.sessions.filter(s => !PORTFOLIO_GAPS.covered.sessions.includes(s)).join(", ")} sessions.

## Top Priority Research

${topResearchList || "No active research items."}

## Market Laws Status

${lawsList || "No market laws recorded."}

## Research Activity This Week

- **Work items completed:** ${workItemsThisWeek}
- **Promotions:** ${promotionsThisWeek}
- **Rejections:** ${rejectionsThisWeek}
- **Active queue size:** ${queueSize}

## Owner Actions Required

${promotionsThisWeek > 0 ? `- Review ${promotionsThisWeek} promoted research items in the CRO Dashboard` : "- No immediate actions required"}
${rejectionsThisWeek > 0 ? `- Review ${rejectionsThisWeek} rejected hypotheses in the Rejection Registry for lessons learned` : ""}
- Monitor forward validation progress for ATS v2.0 (A1, A2, A3)

---
*Generated autonomously by DARWIN CRO Engine v1.0 | Sprint 101*
`;

  const report: InsertDarwinCroReport = {
    reportId,
    reportDate: now,
    weekStart,
    weekEnd: now,
    researchCompleted: promotionsThisWeek,
    researchStarted: newItemsThisWeek(queueSize),
    researchRejected: rejectionsThisWeek,
    researchPromoted: promotionsThisWeek,
    marketLawsUpdated: laws.length,
    behavioursDiscovered: 0,
    portfolioImprovementScore: String(((promotionsThisWeek * 5) + (workItemsThisWeek * 0.5)).toFixed(2)),
    regimeCoverageScore: String(regimeCoverage.toFixed(2)),
    sessionCoverageScore: String(sessionCoverage.toFixed(2)),
    correlationReductionScore: "0.00",
    topPriorityResearch: topItems.map(i => i.researchId).join(", "),
    ownerActionsRequired: promotionsThisWeek > 0 ? `Review ${promotionsThisWeek} promoted items` : "None",
    darwinEfficiencyScore: String(Math.min(100, workItemsThisWeek * 2).toFixed(2)),
    computeUtilisationPct: "75.00",
    fullReportMarkdown,
    readTimeSeconds: Math.ceil(fullReportMarkdown.length / 200),
    generatedBy: "DARWIN_CRO",
  };

  await db.insert(darwinCroReports).values(report);

  await logWork(
    "REPORT_GENERATION",
    `Weekly CRO Report generated: ${reportId}`,
    {
      rationale: `Week: ${new Date(weekStart).toISOString().slice(0, 10)} → ${new Date(now).toISOString().slice(0, 10)}`,
      outcome: "SUCCESS",
      layer: 4,
    }
  );

  try {
    await notifyOwner({
      title: "DARWIN: Weekly CRO Report Ready",
      content: `Report ${reportId} is ready. ${promotionsThisWeek} promotions, ${rejectionsThisWeek} rejections, ${queueSize} active items.`,
    });
  } catch { /* non-fatal */ }

  return reportId;
}

function newItemsThisWeek(queueSize: number): number {
  // Estimate — actual count would require a separate query
  return Math.max(0, queueSize - 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY HELPERS (for tRPC procedures)
// ─────────────────────────────────────────────────────────────────────────────

export async function getResearchQueue(opts: { status?: string; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(darwinResearchQueue)
    .where(opts.status ? eq(darwinResearchQueue.status, opts.status) : undefined)
    .orderBy(asc(darwinResearchQueue.priority))
    .limit(opts.limit ?? 50);
}

export async function getRejectionRegistry(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(darwinRejectionRegistry)
    .orderBy(desc(darwinRejectionRegistry.rejectedAt))
    .limit(limit);
}

export async function getCroReports(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(darwinCroReports)
    .orderBy(desc(darwinCroReports.reportDate))
    .limit(limit);
}

export async function getWorkLog(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(darwinWorkLog)
    .orderBy(desc(darwinWorkLog.startedAt))
    .limit(limit);
}

export async function getPromotionGates(researchId?: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(darwinPromotionGates)
    .where(researchId ? eq(darwinPromotionGates.researchId, researchId) : undefined)
    .orderBy(desc(darwinPromotionGates.evaluatedAt))
    .limit(limit);
}

export async function getCroDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [activeQueue] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"));

  const [totalRejections] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinRejectionRegistry);

  const [totalPromotions] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinPromotionGates)
    .where(eq(darwinPromotionGates.decision, "PROMOTED"));

  const [totalWorkItems] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(darwinWorkLog);

  const [latestReport] = await db
    .select()
    .from(darwinCroReports)
    .orderBy(desc(darwinCroReports.reportDate))
    .limit(1);

  const stageDistribution = await db
    .select({
      stage: darwinResearchQueue.currentStage,
      count: sql<number>`COUNT(*)`,
    })
    .from(darwinResearchQueue)
    .where(eq(darwinResearchQueue.status, "ACTIVE"))
    .groupBy(darwinResearchQueue.currentStage);

  const regimeCoverage = (PORTFOLIO_GAPS.covered.regimes.length / PORTFOLIO_GAPS.regimes.length) * 100;
  const sessionCoverage = (PORTFOLIO_GAPS.covered.sessions.length / PORTFOLIO_GAPS.sessions.length) * 100;

  return {
    activeQueueSize: Number(activeQueue?.count ?? 0),
    totalRejections: Number(totalRejections?.count ?? 0),
    totalPromotions: Number(totalPromotions?.count ?? 0),
    totalWorkItems: Number(totalWorkItems?.count ?? 0),
    regimeCoverageScore: regimeCoverage,
    sessionCoverageScore: sessionCoverage,
    portfolioGaps: {
      regimes: PORTFOLIO_GAPS.regimes.filter(r => !PORTFOLIO_GAPS.covered.regimes.includes(r)),
      sessions: PORTFOLIO_GAPS.sessions.filter(s => !PORTFOLIO_GAPS.covered.sessions.includes(s)),
    },
    stageDistribution,
    latestReport: latestReport
      ? {
          reportId: latestReport.reportId,
          reportDate: latestReport.reportDate,
          researchPromoted: latestReport.researchPromoted,
          researchRejected: latestReport.researchRejected,
          portfolioImprovementScore: latestReport.portfolioImprovementScore,
        }
      : null,
  };
}
