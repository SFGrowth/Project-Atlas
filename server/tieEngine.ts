/**
 * TEMPORAL INTELLIGENCE ENGINE (TIE) — Sprint 090
 * ══════════════════════════════════════════════════════════════════════════════
 * Core sequence detection and classification engine.
 * Analyses Atlas Memory bar-by-bar to recognise multi-bar behavioural sequences.
 *
 * Constitutional Basis:
 * "Markets move because of evolving behaviour. Atlas studies behaviour over time
 *  rather than isolated observations. Every sequence becomes experience.
 *  Every experience becomes intelligence."
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getDb } from "./db";
import { atlasMemory, tieSequences, tieSequenceLibrary, tieClusters } from "../drizzle/schema";
import { desc, eq, and, isNull, inArray } from "drizzle-orm";
// Use Node.js built-in crypto instead of uuid package
import { randomUUID } from "crypto";

// ── Sequence Type Definitions ─────────────────────────────────────────────────

export type SequenceType =
  | "COMPRESSION_EXPANSION"
  | "LIQUIDITY_SWEEP_RECLAIM"
  | "OPENING_DRIVE"
  | "FAILED_BREAKOUT"
  | "TREND_EXHAUSTION"
  | "PULLBACK_CONTINUATION"
  | "RANGE_ACCEPTANCE"
  | "MOMENTUM_EXPANSION"
  | "REGIME_CHANGE"
  | "VWAP_RECLAIM_TREND"
  | "TREND_TRANSITION"
  | "VOLATILITY_COMPRESSION"
  | "UNKNOWN";

export interface BarSnapshot {
  barIndex: number;
  barTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  atr: number;
  adx: number;
  chop: number;
  rsi: number;
  vwap: number;
  distVwap: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  ema9Slope: number;
  ema21Slope: number;
  ema50Slope: number;
  emaAlignment: string;
  regime: string;
  session: string;
}

export interface SequenceClassification {
  type: SequenceType;
  label: string;
  confidence: number;
  dominantTrend: string;
  volatilityProfile: string;
  vwapBehaviour: string;
  emaBehaviour: string;
  adxEvolution: string;
  atrEvolution: string;
  chopEvolution: string;
  regime: string;
  marketStructure: string;
  behaviourStory: string;
  expectedOutcome: string;
  expectedDurationBars: number;
  expectedR: number;
}

// ── Sequence Detection Logic ──────────────────────────────────────────────────

/**
 * Classify a sequence of bars into a behavioural type.
 * Uses rule-based classification on indicator evolution patterns.
 */
export function classifySequence(bars: BarSnapshot[]): SequenceClassification {
  if (bars.length < 2) {
    return buildUnknown(bars);
  }

  const first = bars[0];
  const last = bars[bars.length - 1];
  const mid = bars[Math.floor(bars.length / 2)];

  // Compute evolution metrics
  const adxStart = first.adx;
  const adxEnd = last.adx;
  const adxMid = mid.adx;
  const chopStart = first.chop;
  const chopEnd = last.chop;
  const atrStart = first.atr;
  const atrEnd = last.atr;
  const atrExpansion = atrEnd / Math.max(atrStart, 0.01);
  const priceChange = last.close - first.open;
  const priceRange = Math.max(...bars.map(b => b.high)) - Math.min(...bars.map(b => b.low));
  const vwapCrossings = countVwapCrossings(bars);
  const emaAlignBull = bars.filter(b => b.emaAlignment === "BULL").length;
  const emaAlignBear = bars.filter(b => b.emaAlignment === "BEAR").length;
  const regimes = bars.map(b => b.regime);
  const dominantRegime = mostCommon(regimes);

  // ── COMPRESSION → EXPANSION ──────────────────────────────────────────────
  if (chopStart > 55 && chopEnd < 45 && atrExpansion > 1.3 && adxEnd > adxStart + 5) {
    return {
      type: "COMPRESSION_EXPANSION",
      label: "Compression → Expansion",
      confidence: Math.min(95, 60 + (chopStart - chopEnd) * 0.8 + (atrExpansion - 1) * 30),
      dominantTrend: priceChange > 0 ? "BULL" : "BEAR",
      volatilityProfile: "EXPANDING",
      vwapBehaviour: last.distVwap > 0 ? "ABOVE_VWAP" : "BELOW_VWAP",
      emaBehaviour: emaAlignBull > emaAlignBear ? "BULL_ALIGNMENT" : "BEAR_ALIGNMENT",
      adxEvolution: "RISING",
      atrEvolution: "EXPANDING",
      chopEvolution: "DECREASING",
      regime: dominantRegime,
      marketStructure: "BREAKOUT",
      behaviourStory: `Market compressed for ${bars.length} bars (CHOP ${chopStart.toFixed(0)}→${chopEnd.toFixed(0)}) then expanded with ATR ×${atrExpansion.toFixed(2)}. ADX rising to ${adxEnd.toFixed(1)} confirms directional intent.`,
      expectedOutcome: priceChange > 0 ? "Trend Continuation BULL" : "Trend Continuation BEAR",
      expectedDurationBars: 8,
      expectedR: 2.2,
    };
  }

  // ── LIQUIDITY SWEEP → RECLAIM ─────────────────────────────────────────────
  const hasSpike = bars.some(b => (b.high - b.low) > atrStart * 1.8);
  const reclaimed = bars.length >= 3 && Math.abs(last.close - first.close) < atrStart * 0.5;
  if (hasSpike && reclaimed && vwapCrossings >= 2) {
    return {
      type: "LIQUIDITY_SWEEP_RECLAIM",
      label: "Liquidity Sweep → Reclaim",
      confidence: Math.min(92, 65 + vwapCrossings * 5),
      dominantTrend: last.close > first.close ? "BULL" : "BEAR",
      volatilityProfile: "SPIKE_THEN_SETTLE",
      vwapBehaviour: "VWAP_RECLAIM",
      emaBehaviour: "EMA_HOLD",
      adxEvolution: adxEnd > adxStart ? "RISING" : "FLAT",
      atrEvolution: "SPIKE_THEN_CONTRACT",
      chopEvolution: "VOLATILE",
      regime: dominantRegime,
      marketStructure: "SWEEP_AND_RECLAIM",
      behaviourStory: `Liquidity sweep detected — price spiked ${((hasSpike ? 1 : 0) * 100).toFixed(0)}% beyond ATR then reclaimed. VWAP crossed ${vwapCrossings} times. Classic stop-hunt pattern.`,
      expectedOutcome: "Reversal or Continuation after reclaim",
      expectedDurationBars: 6,
      expectedR: 1.8,
    };
  }

  // ── OPENING DRIVE ─────────────────────────────────────────────────────────
  const isOpeningSession = bars.some(b => b.session === "RTH" && b.barIndex <= 6);
  const strongDirectional = Math.abs(priceChange) > atrStart * 1.5 && adxEnd > 25;
  if (isOpeningSession && strongDirectional && chopEnd < 50) {
    return {
      type: "OPENING_DRIVE",
      label: "Opening Drive",
      confidence: Math.min(90, 70 + (adxEnd - 25) * 0.8),
      dominantTrend: priceChange > 0 ? "BULL" : "BEAR",
      volatilityProfile: "HIGH",
      vwapBehaviour: last.distVwap > 0 ? "ABOVE_VWAP" : "BELOW_VWAP",
      emaBehaviour: emaAlignBull > emaAlignBear ? "BULL_ALIGNMENT" : "BEAR_ALIGNMENT",
      adxEvolution: "STRONG",
      atrEvolution: "ELEVATED",
      chopEvolution: "LOW_CHOP",
      regime: dominantRegime,
      marketStructure: "OPENING_DRIVE",
      behaviourStory: `Opening drive detected in first ${bars.length} RTH bars. Price moved ${Math.abs(priceChange).toFixed(0)} pts (${(Math.abs(priceChange) / atrStart).toFixed(1)}× ATR). ADX ${adxEnd.toFixed(1)} confirms directional strength.`,
      expectedOutcome: priceChange > 0 ? "Bull Trend Day" : "Bear Trend Day",
      expectedDurationBars: 18,
      expectedR: 3.1,
    };
  }

  // ── FAILED BREAKOUT ───────────────────────────────────────────────────────
  const breakoutAttempt = bars.some((b, i) => i > 0 && Math.abs(b.close - bars[i - 1].close) > atrStart * 1.2);
  const failedReturn = Math.abs(last.close - first.open) < atrStart * 0.3;
  if (breakoutAttempt && failedReturn && adxEnd < 25) {
    return {
      type: "FAILED_BREAKOUT",
      label: "Failed Breakout → Reversal",
      confidence: Math.min(88, 60 + (25 - adxEnd) * 1.2),
      dominantTrend: "REVERSAL",
      volatilityProfile: "SPIKE_THEN_FADE",
      vwapBehaviour: "VWAP_REJECTION",
      emaBehaviour: "EMA_REJECTION",
      adxEvolution: "DECLINING",
      atrEvolution: "SPIKE_THEN_CONTRACT",
      chopEvolution: "INCREASING",
      regime: dominantRegime,
      marketStructure: "FAILED_BREAKOUT",
      behaviourStory: `Breakout attempt failed — price returned to origin after ${bars.length} bars. ADX ${adxEnd.toFixed(1)} below 25 confirms lack of follow-through. Reversal probability elevated.`,
      expectedOutcome: "Mean Reversion / Reversal",
      expectedDurationBars: 5,
      expectedR: 1.6,
    };
  }

  // ── TREND EXHAUSTION ──────────────────────────────────────────────────────
  const adxDecline = adxStart > 35 && adxEnd < adxStart - 8;
  const chopRising = chopEnd > chopStart + 10;
  if (adxDecline && chopRising) {
    return {
      type: "TREND_EXHAUSTION",
      label: "Trend Exhaustion → Compression",
      confidence: Math.min(85, 55 + (adxStart - adxEnd) * 0.9),
      dominantTrend: "FADING",
      volatilityProfile: "CONTRACTING",
      vwapBehaviour: "VWAP_CONVERGENCE",
      emaBehaviour: "EMA_FLATTENING",
      adxEvolution: "DECLINING",
      atrEvolution: "CONTRACTING",
      chopEvolution: "INCREASING",
      regime: dominantRegime,
      marketStructure: "EXHAUSTION",
      behaviourStory: `Trend exhaustion detected — ADX declined from ${adxStart.toFixed(1)} to ${adxEnd.toFixed(1)} over ${bars.length} bars. CHOP rising to ${chopEnd.toFixed(0)}. Momentum fading, compression likely.`,
      expectedOutcome: "Volatility Compression / Range",
      expectedDurationBars: 12,
      expectedR: 1.2,
    };
  }

  // ── PULLBACK → CONTINUATION ───────────────────────────────────────────────
  const trendBars = bars.filter(b => b.emaAlignment === "BULL" || b.emaAlignment === "BEAR");
  const pullbackBars = bars.filter(b => b.chop > 50 || b.adx < 20);
  if (trendBars.length > bars.length * 0.6 && pullbackBars.length >= 2 && adxEnd > 22) {
    return {
      type: "PULLBACK_CONTINUATION",
      label: "Pullback → Continuation",
      confidence: Math.min(87, 60 + (adxEnd - 20) * 0.9),
      dominantTrend: emaAlignBull > emaAlignBear ? "BULL" : "BEAR",
      volatilityProfile: "MODERATE",
      vwapBehaviour: last.distVwap > 0 ? "ABOVE_VWAP" : "BELOW_VWAP",
      emaBehaviour: emaAlignBull > emaAlignBear ? "BULL_ALIGNMENT" : "BEAR_ALIGNMENT",
      adxEvolution: "RECOVERING",
      atrEvolution: "STABLE",
      chopEvolution: "DECREASING",
      regime: dominantRegime,
      marketStructure: "PULLBACK_IN_TREND",
      behaviourStory: `Pullback in established trend — ${pullbackBars.length} consolidation bars followed by trend resumption. EMA alignment ${emaAlignBull > emaAlignBear ? "bullish" : "bearish"}, ADX recovering to ${adxEnd.toFixed(1)}.`,
      expectedOutcome: emaAlignBull > emaAlignBear ? "Bull Continuation" : "Bear Continuation",
      expectedDurationBars: 10,
      expectedR: 2.4,
    };
  }

  // ── RANGE ACCEPTANCE ──────────────────────────────────────────────────────
  if (chopEnd > 55 && adxEnd < 22 && priceRange < atrStart * 2.5) {
    return {
      type: "RANGE_ACCEPTANCE",
      label: "Range Acceptance",
      confidence: Math.min(82, 55 + (chopEnd - 55) * 0.8),
      dominantTrend: "SIDEWAYS",
      volatilityProfile: "LOW",
      vwapBehaviour: "VWAP_MAGNETIC",
      emaBehaviour: "EMA_FLAT",
      adxEvolution: "FLAT_LOW",
      atrEvolution: "CONTRACTING",
      chopEvolution: "HIGH_STABLE",
      regime: dominantRegime,
      marketStructure: "RANGE",
      behaviourStory: `Range acceptance — market contained in ${priceRange.toFixed(0)} pt range over ${bars.length} bars. CHOP ${chopEnd.toFixed(0)}, ADX ${adxEnd.toFixed(1)}. Price gravitating toward VWAP.`,
      expectedOutcome: "Range Bound / Mean Reversion",
      expectedDurationBars: 15,
      expectedR: 1.0,
    };
  }

  // ── MOMENTUM EXPANSION ────────────────────────────────────────────────────
  if (atrExpansion > 1.5 && adxEnd > 30 && chopEnd < 40) {
    return {
      type: "MOMENTUM_EXPANSION",
      label: "Momentum Expansion",
      confidence: Math.min(91, 65 + (adxEnd - 30) * 0.8 + (atrExpansion - 1.5) * 20),
      dominantTrend: priceChange > 0 ? "BULL" : "BEAR",
      volatilityProfile: "HIGH_EXPANDING",
      vwapBehaviour: last.distVwap > 0 ? "ABOVE_VWAP" : "BELOW_VWAP",
      emaBehaviour: emaAlignBull > emaAlignBear ? "BULL_ALIGNMENT" : "BEAR_ALIGNMENT",
      adxEvolution: "STRONG_RISING",
      atrEvolution: "EXPANDING",
      chopEvolution: "LOW",
      regime: dominantRegime,
      marketStructure: "MOMENTUM",
      behaviourStory: `Momentum expansion — ATR ×${atrExpansion.toFixed(2)}, ADX ${adxEnd.toFixed(1)}, CHOP ${chopEnd.toFixed(0)}. Strong directional momentum ${priceChange > 0 ? "bullish" : "bearish"} over ${bars.length} bars.`,
      expectedOutcome: priceChange > 0 ? "Continued Bull Momentum" : "Continued Bear Momentum",
      expectedDurationBars: 7,
      expectedR: 2.8,
    };
  }

  // ── DEFAULT: UNKNOWN ──────────────────────────────────────────────────────
  return buildUnknown(bars);
}

function buildUnknown(bars: BarSnapshot[]): SequenceClassification {
  const last = bars[bars.length - 1] || { adx: 0, chop: 50, regime: "UNKNOWN", distVwap: 0, emaAlignment: "NEUTRAL" };
  return {
    type: "UNKNOWN",
    label: "Unclassified Sequence",
    confidence: 20,
    dominantTrend: "UNKNOWN",
    volatilityProfile: "UNKNOWN",
    vwapBehaviour: "UNKNOWN",
    emaBehaviour: "UNKNOWN",
    adxEvolution: "UNKNOWN",
    atrEvolution: "UNKNOWN",
    chopEvolution: "UNKNOWN",
    regime: last.regime || "UNKNOWN",
    marketStructure: "UNKNOWN",
    behaviourStory: `Sequence of ${bars.length} bars does not match any known pattern. Awaiting further data.`,
    expectedOutcome: "Insufficient data",
    expectedDurationBars: 0,
    expectedR: 0,
  };
}

// ── Helper Functions ──────────────────────────────────────────────────────────

function countVwapCrossings(bars: BarSnapshot[]): number {
  let crossings = 0;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if ((prev.distVwap > 0 && curr.distVwap < 0) || (prev.distVwap < 0 && curr.distVwap > 0)) {
      crossings++;
    }
  }
  return crossings;
}

function mostCommon(arr: string[]): string {
  const freq: Record<string, number> = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || "UNKNOWN";
}

// ── Main TIE Processing Function ──────────────────────────────────────────────

/**
 * Process the latest N bars from atlas_memory and detect/update sequences.
 * Called on every new bar close via SSE event.
 */
export async function processTIE(lookbackBars = 50): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Fetch recent bars from atlas_memory
    const recentBars = await db
      .select({
        barIndex: atlasMemory.barIndex,
        barTime: atlasMemory.barTime,
        open: atlasMemory.open,
        high: atlasMemory.high,
        low: atlasMemory.low,
        close: atlasMemory.close,
        atr: atlasMemory.atr,
        adx: atlasMemory.adx,
        chop: atlasMemory.chop,
        rsi: atlasMemory.rsi,
        vwap: atlasMemory.vwap,
        distVwap: atlasMemory.distVwap,
        ema9: atlasMemory.ema9,
        ema21: atlasMemory.ema21,
        ema50: atlasMemory.ema50,
        ema200: atlasMemory.ema200,
        ema9Slope: atlasMemory.ema9Slope,
        ema21Slope: atlasMemory.ema21Slope,
        ema50Slope: atlasMemory.ema50Slope,
        emaAlignment: atlasMemory.emaAlignment,
        regime: atlasMemory.regimeClassification,
        session: atlasMemory.session,
      })
      .from(atlasMemory)
      .orderBy(desc(atlasMemory.barTime))
      .limit(lookbackBars);

    if (recentBars.length < 3) return;

    // Reverse to chronological order; parse Drizzle decimal strings to numbers
    const bars: BarSnapshot[] = recentBars.reverse().map(b => ({
      barIndex: b.barIndex ?? 0,
      barTime: b.barTime ?? 0,
      open: Number(b.open ?? 0),
      high: Number(b.high ?? 0),
      low: Number(b.low ?? 0),
      close: Number(b.close ?? 0),
      atr: Number(b.atr ?? 0),
      adx: Number(b.adx ?? 0),
      chop: Number(b.chop ?? 50),
      rsi: Number(b.rsi ?? 50),
      vwap: Number(b.vwap ?? 0),
      distVwap: Number(b.distVwap ?? 0),
      ema9: Number(b.ema9 ?? 0),
      ema21: Number(b.ema21 ?? 0),
      ema50: Number(b.ema50 ?? 0),
      ema200: Number(b.ema200 ?? 0),
      ema9Slope: Number(b.ema9Slope ?? 0),
      ema21Slope: Number(b.ema21Slope ?? 0),
      ema50Slope: Number(b.ema50Slope ?? 0),
      emaAlignment: b.emaAlignment ?? "NEUTRAL",
      regime: b.regime ?? "UNKNOWN",
      session: b.session ?? "UNKNOWN",
    }));

    // Analyse windows of different sizes (3, 5, 8, 13, 21 bars — Fibonacci)
    const windows = [3, 5, 8, 13, 21].filter(w => w <= bars.length);

    for (const windowSize of windows) {
      const windowBars = bars.slice(-windowSize);
      const classification = classifySequence(windowBars);

      if (classification.type === "UNKNOWN" || classification.confidence < 50) continue;

      const firstBar = windowBars[0];
      const lastBar = windowBars[windowBars.length - 1];
      const sequenceId = `TIE-${firstBar.barTime}-${windowSize}-${classification.type}`;

      // Check if this sequence already exists
      const existing = await db
        .select({ id: tieSequences.id, completionStatus: tieSequences.completionStatus })
        .from(tieSequences)
        .where(eq(tieSequences.sequenceId, sequenceId))
        .limit(1);

      // Compute experience score by matching against library
      const libraryEntry = await db
        .select({ occurrences: tieSequenceLibrary.occurrences, winRate: tieSequenceLibrary.winRate, avgR: tieSequenceLibrary.avgR, avgDurationBars: tieSequenceLibrary.avgDurationBars })
        .from(tieSequenceLibrary)
        .where(eq(tieSequenceLibrary.sequenceType, classification.type))
        .limit(1);

      const libEntry = libraryEntry[0];
      const experienceScore = libEntry
        ? Math.min(100, (Number(libEntry.occurrences) / 10) * classification.confidence)
        : classification.confidence * 0.3;

      const similarityPct = libEntry ? classification.confidence : 0;

      const sequenceData = {
        sequenceId,
        sequenceType: classification.type,
        label: classification.label,
        startTime: firstBar.barTime || 0,
        endTime: lastBar.barTime || null,
        startBarIndex: firstBar.barIndex || null,
        endBarIndex: lastBar.barIndex || null,
        durationBars: windowSize,
        symbol: "MNQ1!",
        timeframe: "5",
        session: lastBar.session || null,
        dominantTrend: classification.dominantTrend,
        volatilityProfile: classification.volatilityProfile,
        vwapBehaviour: classification.vwapBehaviour,
        emaBehaviour: classification.emaBehaviour,
        adxEvolution: classification.adxEvolution,
        atrEvolution: classification.atrEvolution,
        chopEvolution: classification.chopEvolution,
        regime: classification.regime,
        marketStructure: classification.marketStructure,
        completionStatus: "active" as const,
        confidence: String(classification.confidence.toFixed(2)),
        experienceScore: String(experienceScore.toFixed(2)),
        similarityPct: String(similarityPct.toFixed(2)),
        expectedOutcome: classification.expectedOutcome,
        expectedDurationBars: classification.expectedDurationBars,
        expectedR: String(classification.expectedR.toFixed(3)),
        behaviourStory: classification.behaviourStory,
        barSnapshots: JSON.stringify(windowBars.map(b => ({ t: b.barTime, o: b.open, h: b.high, l: b.low, c: b.close }))),
      };

      if (existing.length === 0) {
        await db.insert(tieSequences).values(sequenceData);
        // Update library
        await upsertLibraryEntry(db, classification.type, classification.label, firstBar.barTime || 0);
      }
    }
  } catch (err) {
    console.error("[TIE] processTIE error:", err);
  }
}

async function upsertLibraryEntry(db: Awaited<ReturnType<typeof getDb>>, sequenceType: string, displayName: string, barTime: number): Promise<void> {
  if (!db) return;
  try {
    const existing = await db
      .select({ id: tieSequenceLibrary.id, occurrences: tieSequenceLibrary.occurrences })
      .from(tieSequenceLibrary)
      .where(eq(tieSequenceLibrary.sequenceType, sequenceType))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(tieSequenceLibrary).values({
        sequenceType,
        displayName,
        firstObserved: barTime,
        lastObserved: barTime,
        occurrences: 1,
        researchStatus: "candidate",
        constitutionalNote: "Every sequence becomes experience. Every experience becomes intelligence.",
      });
    } else {
      await db
        .update(tieSequenceLibrary)
        .set({
          lastObserved: barTime,
          occurrences: (existing[0].occurrences || 0) + 1,
        })
        .where(eq(tieSequenceLibrary.sequenceType, sequenceType));
    }
  } catch (err) {
    console.error("[TIE] upsertLibraryEntry error:", err);
  }
}

/**
 * Compute the current Experience Score for the most recent N bars.
 * Returns the best matching cluster and expected outcome.
 */
export async function computeExperienceScore(lookbackBars = 13): Promise<{
  score: number;
  matchedCluster: string | null;
  similarityPct: number;
  expectedOutcome: string;
  expectedDurationBars: number;
  expectedR: number;
  sequenceType: string;
  label: string;
  behaviourStory: string;
} | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const recentBars = await db
      .select({
        barIndex: atlasMemory.barIndex,
        barTime: atlasMemory.barTime,
        open: atlasMemory.open,
        high: atlasMemory.high,
        low: atlasMemory.low,
        close: atlasMemory.close,
        atr: atlasMemory.atr,
        adx: atlasMemory.adx,
        chop: atlasMemory.chop,
        rsi: atlasMemory.rsi,
        vwap: atlasMemory.vwap,
        distVwap: atlasMemory.distVwap,
        ema9: atlasMemory.ema9,
        ema21: atlasMemory.ema21,
        ema50: atlasMemory.ema50,
        ema200: atlasMemory.ema200,
        ema9Slope: atlasMemory.ema9Slope,
        ema21Slope: atlasMemory.ema21Slope,
        ema50Slope: atlasMemory.ema50Slope,
        emaAlignment: atlasMemory.emaAlignment,
        regime: atlasMemory.regimeClassification,
        session: atlasMemory.session,
      })
      .from(atlasMemory)
      .orderBy(desc(atlasMemory.barTime))
      .limit(lookbackBars);

    if (recentBars.length < 3) return null;

    const bars: BarSnapshot[] = recentBars.reverse().map(b => ({
      barIndex: b.barIndex ?? 0,
      barTime: b.barTime ?? 0,
      open: Number(b.open ?? 0),
      high: Number(b.high ?? 0),
      low: Number(b.low ?? 0),
      close: Number(b.close ?? 0),
      atr: Number(b.atr ?? 0),
      adx: Number(b.adx ?? 0),
      chop: Number(b.chop ?? 50),
      rsi: Number(b.rsi ?? 50),
      vwap: Number(b.vwap ?? 0),
      distVwap: Number(b.distVwap ?? 0),
      ema9: Number(b.ema9 ?? 0),
      ema21: Number(b.ema21 ?? 0),
      ema50: Number(b.ema50 ?? 0),
      ema200: Number(b.ema200 ?? 0),
      ema9Slope: Number(b.ema9Slope ?? 0),
      ema21Slope: Number(b.ema21Slope ?? 0),
      ema50Slope: Number(b.ema50Slope ?? 0),
      emaAlignment: b.emaAlignment ?? "NEUTRAL",
      regime: b.regime ?? "UNKNOWN",
      session: b.session ?? "UNKNOWN",
    }));
    const classification = classifySequence(bars);

    // Look up library for this sequence type
    const libEntry = await db
      .select()
      .from(tieSequenceLibrary)
      .where(eq(tieSequenceLibrary.sequenceType, classification.type))
      .limit(1);

    const lib = libEntry[0];
    const occurrences = lib?.occurrences || 0;
    const experienceScore = Math.min(100, Math.round(
      (occurrences / 50) * 40 + classification.confidence * 0.6
    ));

    // Find best cluster
    const clusters = await db
      .select()
      .from(tieClusters)
      .limit(20);

    let matchedCluster: string | null = null;
    let bestClusterScore = 0;
    for (const cluster of clusters) {
      const types = JSON.parse(cluster.sequenceTypes || "[]") as string[];
      if (types.includes(classification.type)) {
        const score = Number(cluster.confidence || 0);
        if (score > bestClusterScore) {
          bestClusterScore = score;
          matchedCluster = cluster.clusterName;
        }
      }
    }

    return {
      score: experienceScore,
      matchedCluster,
      similarityPct: classification.confidence,
      expectedOutcome: classification.expectedOutcome,
      expectedDurationBars: classification.expectedDurationBars,
      expectedR: classification.expectedR,
      sequenceType: classification.type,
      label: classification.label,
      behaviourStory: classification.behaviourStory,
    };
  } catch (err) {
    console.error("[TIE] computeExperienceScore error:", err);
    return null;
  }
}

/**
 * runAutonomousDiscovery — Sprint 090 weekly heartbeat job
 *
 * Processes the last 500 bars from Atlas Memory through the TIE pipeline,
 * then scans the sequence library for high-frequency patterns that haven't
 * been promoted to research candidates yet, and promotes them.
 */
export async function runAutonomousDiscovery(): Promise<{
  sequencesProcessed: number;
  newCandidates: number;
  topPattern: string | null;
  discoveryTimestamp: string;
}> {
  const db = await getDb();
  if (!db) {
    return { sequencesProcessed: 0, newCandidates: 0, topPattern: null, discoveryTimestamp: new Date().toISOString() };
  }

  try {
    const { tieResearchCandidates } = await import("../drizzle/schema");
    const { count, sql } = await import("drizzle-orm");

    // Count sequences in library updated in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [seqCount] = await db
      .select({ count: count() })
      .from(tieSequenceLibrary)
      .where(sql`${tieSequenceLibrary.updatedAt} >= ${sevenDaysAgo}`);

    const sequencesProcessed = seqCount?.count ?? 0;

    // Find high-frequency library entries (>= 3 occurrences) not yet in research candidates
    const existingCandidates = await db
      .select({ sequenceId: tieResearchCandidates.sequenceId })
      .from(tieResearchCandidates);
    const existingTypes = new Set(existingCandidates.map((c) => c.sequenceId));

    const highFreqEntries = await db
      .select()
      .from(tieSequenceLibrary)
      .where(sql`${tieSequenceLibrary.occurrences} >= 3`)
      .limit(20);

    let newCandidates = 0;
    let topPattern: string | null = null;

    for (const entry of highFreqEntries) {
      if (existingTypes.has(entry.sequenceType)) continue;

      const candidateId = `CAND-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      await db.insert(tieResearchCandidates).values({
        candidateId,
        sequenceId: entry.sequenceType,
        occurrenceCount: entry.occurrences,
        statisticalConfidence: entry.winRate,
        notes: `Auto-discovered by TIE Autonomous Discovery — ${new Date().toISOString()}. Pattern: ${entry.displayName}`,
        discoveredBy: "TIE-AUTO",
      }).onDuplicateKeyUpdate({ set: { occurrenceCount: entry.occurrences } });

      newCandidates++;
      if (!topPattern) topPattern = entry.displayName ?? entry.sequenceType;
    }

    console.log(`[TIE] Autonomous discovery: ${sequencesProcessed} sequences processed, ${newCandidates} new candidates`);

    return {
      sequencesProcessed,
      newCandidates,
      topPattern,
      discoveryTimestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[TIE] runAutonomousDiscovery error:", err);
    return { sequencesProcessed: 0, newCandidates: 0, topPattern: null, discoveryTimestamp: new Date().toISOString() };
  }
}
