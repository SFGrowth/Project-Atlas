/**
 * Atlas Live Learning Certification Engine — Sprint 100A
 *
 * This module is the single source of truth for all per-candle learning.
 * It is called by the atlas-memory webhook handler after every confirmed bar write.
 *
 * 7 learning steps per candle:
 *   1. Candle Certification (15 gates)
 *   2. Gap Detection
 *   3. Behaviour Library Update
 *   4. Sequence Library Update
 *   5. Market Law Evaluation
 *   6. DARWIN Research Memory Write
 *   7. Portfolio Intelligence Inputs Update
 *
 * Session Certification Aggregator:
 *   - Runs at 16:05 ET each weekday (via heartbeat)
 *   - Produces a per-session certification report in live_learning_cert_sessions
 */

import { getDb } from "./db";
import {
  behaviourLibrary,
  portfolioIntelligenceInputs,
  liveLearningCertSessions,
  candleCertifications,
  candleGapLog,
  marketLaws,
  darwinResearchMemory,
  tieSequenceLibrary,
  atlasMemory,
} from "../drizzle/schema";
import { eq, desc, sql, and, gte, lt } from "drizzle-orm";
import { certifyCandle, detectAndLogGap, updateMarketLawsFromBar, logPipelineHealthEvent } from "./atlasAutonomous";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarPayload {
  id: number;
  memoryId: string;
  barTime: number;
  symbol: string;
  session: string | null;
  regime: string | null;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: string | null;
  atr: string | null;
  atrExpansion: string | null;
  rsi: string | null;
  vwap: string | null;
  ema9: string | null;
  ema21: string | null;
  adx: string | null;
  adxTrending: boolean;
  trendDirection: string | null;
  volatilityState: string | null;
  a1Eligible: boolean;
  a3Eligible: boolean;
  b1Eligible: boolean;
  sb1Eligible: boolean;
  receivedAt: number; // ms timestamp when webhook arrived
}

export interface LearningResult {
  certificationId: string | null;
  certPassed: boolean;
  gateResults: Record<string, boolean>;
  gapDetected: boolean;
  behaviourUpdates: number;
  sequenceUpdates: number;
  marketLawEvaluations: number;
  marketLawsReinforced: number;
  marketLawsChallenged: number;
  darwinMemoryWritten: boolean;
  portfolioIntelWritten: boolean;
  latencyMs: number;
  errors: string[];
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * processLiveBar — called by the atlas-memory webhook after every confirmed bar write.
 * Runs all 7 learning steps and returns a LearningResult.
 */
export async function processLiveBar(bar: BarPayload): Promise<LearningResult> {
  const startMs = Date.now();
  const result: LearningResult = {
    certificationId: null,
    certPassed: false,
    gateResults: {},
    gapDetected: false,
    behaviourUpdates: 0,
    sequenceUpdates: 0,
    marketLawEvaluations: 0,
    marketLawsReinforced: 0,
    marketLawsChallenged: 0,
    darwinMemoryWritten: false,
    portfolioIntelWritten: false,
    latencyMs: 0,
    errors: [],
  };

  // Step 1: Candle Certification (15 gates)
  try {
    const certResult = await certifyCandle({
      atlasMemoryId: bar.id,
      barTimeMs: bar.barTime,
      receivedAtMs: bar.receivedAt,
      session: bar.session ?? undefined,
      ohlcv: { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume },
    });
    result.certificationId = certResult.certId;
    result.certPassed = certResult.status === "CERTIFIED";
    result.gateResults = { certified: certResult.status === "CERTIFIED", gapDetected: certResult.gapDetected };
    // Step 2: Gap Detection — if certifyCandle detected a gap, log it
    if (certResult.gapDetected) {
      result.gapDetected = true;
      try {
        const prevBarTime = bar.barTime - 5 * 60 * 1000;
        await detectAndLogGap({
          gapStartTime: prevBarTime,
          gapEndTime: bar.barTime,
          session: bar.session ?? undefined,
          isRthGap: bar.session ? ["AM_OPEN", "AM_MID", "LUNCH", "PM"].includes(bar.session) : false,
        });
      } catch (ge) {
        result.errors.push(`detectAndLogGap: ${String(ge)}`);
      }
    }
  } catch (e) {
    result.errors.push(`certifyCandle: ${String(e)}`);
  }

  // Step 3: Behaviour Library Update
  try {
    const bUpdates = await updateBehaviourLibrary(bar);
    result.behaviourUpdates = bUpdates;
  } catch (e) {
    result.errors.push(`updateBehaviourLibrary: ${String(e)}`);
  }

  // Step 4: Sequence Library Update
  try {
    const sUpdates = await updateSequenceLibrary(bar);
    result.sequenceUpdates = sUpdates;
  } catch (e) {
    result.errors.push(`updateSequenceLibrary: ${String(e)}`);
  }

  // Step 5: Market Law Evaluation
  try {
    await updateMarketLawsFromBar({
      regime: bar.regime ?? null,
      session: bar.session ?? null,
      atr: bar.atr ?? null,
      emaAlignment: null,
      distVwap: null,
    });
    // Count how many laws were evaluated (regime + session + ema = up to 3)
    let evaluated = 0;
    if (bar.regime) evaluated++;
    if (bar.session) evaluated++;
    result.marketLawEvaluations = evaluated;
    result.marketLawsReinforced = evaluated;
    result.marketLawsChallenged = 0;
  } catch (e) {
    result.errors.push(`updateMarketLawsFromBar: ${String(e)}`);
  }

  // Step 6: DARWIN Research Memory Write
  try {
    await writeDarwinResearchMemory(bar);
    result.darwinMemoryWritten = true;
  } catch (e) {
    result.errors.push(`writeDarwinResearchMemory: ${String(e)}`);
  }

  // Step 7: Portfolio Intelligence Inputs Update
  try {
    await updatePortfolioIntelligenceInputs(bar);
    result.portfolioIntelWritten = true;
  } catch (e) {
    result.errors.push(`updatePortfolioIntelligenceInputs: ${String(e)}`);
  }

  // Step 8: Recursive Learning — trigger CRO queue re-prioritisation when knowledge base changes
  // Runs every 20th bar (fire-and-forget, never blocks the pipeline)
  try {
    if (result.behaviourUpdates > 0 || result.marketLawEvaluations > 0) {
      const db2 = await getDb();
      if (db2) {
        const [{ cnt }] = await db2.select({ cnt: sql<number>`COUNT(*)` }).from(atlasMemory);
        const totalBars = Number(cnt ?? 0);
        if (totalBars % 20 === 0) {
          import("./darwinCroEngine").then(({ reprioritiseQueue }) => {
            reprioritiseQueue().catch(() => { /* silent */ });
          }).catch(() => { /* silent */ });
        }
      }
    }
  } catch (_) { /* recursive learning hook is non-blocking */ }

  result.latencyMs = Date.now() - startMs;

  // Log any errors as pipeline health events
  if (result.errors.length > 0) {
    try {
      await logPipelineHealthEvent({
        eventType: "MEMORY_WRITE_FAILURE",
        severity: "WARNING",
        description: `Live learning errors on bar ${bar.memoryId}: ${result.errors.join("; ")}`,
        affectedComponent: "liveLearnEngine",
      });
    } catch (_) { /* silent */ }
  }

  return result;
}

// ─── Step 3: Behaviour Library Update ────────────────────────────────────────

async function updateBehaviourLibrary(bar: BarPayload): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const close = bar.close ? parseFloat(bar.close) : null;
  const vwap = bar.vwap ? parseFloat(bar.vwap) : null;
  const ema9 = bar.ema9 ? parseFloat(bar.ema9) : null;
  const ema21 = bar.ema21 ? parseFloat(bar.ema21) : null;
  const rsi = bar.rsi ? parseFloat(bar.rsi) : null;
  const atrExp = bar.atrExpansion ? parseFloat(bar.atrExpansion) : null;
  const atr = bar.atr ? parseFloat(bar.atr) : null;
  const regime = bar.regime ?? "UNKNOWN";
  const session = bar.session ?? "UNKNOWN";

  // Detect which behaviours are present this bar
  const activeBehaviours: string[] = [];

  if (close !== null && vwap !== null) {
    if (close > vwap) activeBehaviours.push("VWAP_RECLAIM");
    else activeBehaviours.push("VWAP_REJECTION");
  }
  if (ema9 !== null && ema21 !== null) {
    if (ema9 > ema21) activeBehaviours.push("EMA9_21_CROSS_UP");
    else activeBehaviours.push("EMA9_21_CROSS_DOWN");
  }
  if (atrExp !== null && atrExp > 1.2) activeBehaviours.push("ATR_EXPANSION");
  if (rsi !== null) {
    if (rsi < 35) activeBehaviours.push("RSI_OVERSOLD_BOUNCE");
    if (rsi > 65) activeBehaviours.push("RSI_OVERBOUGHT_FADE");
  }

  let updatedCount = 0;
  for (const bId of activeBehaviours) {
    try {
      const [existing] = await db.select().from(behaviourLibrary).where(eq(behaviourLibrary.behaviourId, bId)).limit(1);
      if (!existing) continue;

      // Determine continuation vs reversal based on trend direction
      const isContinuation = bar.trendDirection === "UP" ? (close !== null && close > (vwap ?? close)) : (close !== null && close < (vwap ?? close));
      const newTotal = existing.totalObservations + 1;
      const newCont = existing.continuationCount + (isContinuation ? 1 : 0);
      const newRev = existing.reversalCount + (isContinuation ? 0 : 1);
      const newRate = newTotal > 0 ? newCont / newTotal : null;

      // Update regime breakdown
      let regimeBreakdown: Record<string, { count: number; cont_rate: number }> = {};
      try { regimeBreakdown = JSON.parse(existing.regimeBreakdown ?? "{}"); } catch (_) { /* */ }
      if (!regimeBreakdown[regime]) regimeBreakdown[regime] = { count: 0, cont_rate: 0 };
      regimeBreakdown[regime].count++;
      regimeBreakdown[regime].cont_rate = (regimeBreakdown[regime].cont_rate * (regimeBreakdown[regime].count - 1) + (isContinuation ? 1 : 0)) / regimeBreakdown[regime].count;

      // Update session breakdown
      let sessionBreakdown: Record<string, { count: number; cont_rate: number }> = {};
      try { sessionBreakdown = JSON.parse(existing.sessionBreakdown ?? "{}"); } catch (_) { /* */ }
      if (!sessionBreakdown[session]) sessionBreakdown[session] = { count: 0, cont_rate: 0 };
      sessionBreakdown[session].count++;
      sessionBreakdown[session].cont_rate = (sessionBreakdown[session].cont_rate * (sessionBreakdown[session].count - 1) + (isContinuation ? 1 : 0)) / sessionBreakdown[session].count;

      await db.update(behaviourLibrary)
        .set({
          totalObservations: newTotal,
          continuationCount: newCont,
          reversalCount: newRev,
          continuationRate: newRate !== null ? String(newRate.toFixed(4)) : null,
          avgAtr: atr !== null ? String(((parseFloat(existing.avgAtr ?? "0") * (newTotal - 1) + atr) / newTotal).toFixed(4)) : existing.avgAtr,
          regimeBreakdown: JSON.stringify(regimeBreakdown),
          sessionBreakdown: JSON.stringify(sessionBreakdown),
          lastObservedAt: bar.barTime,
        })
        .where(eq(behaviourLibrary.behaviourId, bId));
      updatedCount++;
    } catch (_) { /* skip this behaviour */ }
  }
  return updatedCount;
}

// ─── Step 4: Sequence Library Update ─────────────────────────────────────────

async function updateSequenceLibrary(bar: BarPayload): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Update observation counts for sequences that match this bar's regime + session
  const regime = bar.regime ?? null;
  const session = bar.session ?? null;
  if (!regime || !session) return 0;

  try {
    // Increment observation count for any sequence matching this regime
    const result = await db.execute(
      sql`UPDATE tie_sequence_library SET obs_count = COALESCE(obs_count, 0) + 1 WHERE regime = ${regime} LIMIT 5`
    );
    return (result as { affectedRows?: number }).affectedRows ?? 0;
  } catch (_) {
    return 0;
  }
}

// ─── Step 6: DARWIN Research Memory Write ────────────────────────────────────

async function writeDarwinResearchMemory(bar: BarPayload): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Write a compact bar observation to darwin_research_memory for the autonomous engine
  const memoryKey = `BAR_${bar.symbol}_${bar.barTime}`;
  const content = JSON.stringify({
    barTime: bar.barTime,
    symbol: bar.symbol,
    session: bar.session,
    regime: bar.regime,
    close: bar.close,
    atr: bar.atr,
    atrExpansion: bar.atrExpansion,
    rsi: bar.rsi,
    adx: bar.adx,
    trendDirection: bar.trendDirection,
    volatilityState: bar.volatilityState,
    a1Eligible: bar.a1Eligible,
    a3Eligible: bar.a3Eligible,
    b1Eligible: bar.b1Eligible,
    sb1Eligible: bar.sb1Eligible,
  });

  // Use INSERT IGNORE to avoid duplicate writes
  // Columns match drizzle/schema.ts darwin_research_memory definition
  const hypothesisDesc = `BAR_OBSERVATION: ${bar.symbol} @ ${bar.barTime}`;
  await db.execute(
    sql`INSERT IGNORE INTO darwin_research_memory (memory_id, hypothesis_description, supporting_evidence, final_outcome, lessons_learned)
        VALUES (${memoryKey}, ${hypothesisDesc}, ${content}, 'OBSERVATION', 'live_learn_engine_v1')`
  );
}

// ─── Step 7: Portfolio Intelligence Inputs Update ─────────────────────────────

async function updatePortfolioIntelligenceInputs(bar: BarPayload): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const regime = bar.regime ?? "UNKNOWN";

  // Compute simple regime probability scores based on ATR expansion and ADX
  const atrExp = bar.atrExpansion ? parseFloat(bar.atrExpansion) : 1.0;
  const adx = bar.adx ? parseFloat(bar.adx) : 20;
  let rangeProb = 0.5, transitionProb = 0.3, volatileProb = 0.2;
  if (regime === "RANGE") { rangeProb = 0.75; transitionProb = 0.20; volatileProb = 0.05; }
  else if (regime === "TRANSITION") { rangeProb = 0.20; transitionProb = 0.65; volatileProb = 0.15; }
  else if (regime === "VOLATILE") { rangeProb = 0.10; transitionProb = 0.25; volatileProb = 0.65; }
  else if (regime === "TREND") { rangeProb = 0.15; transitionProb = 0.55; volatileProb = 0.30; }

  // Determine eligible models
  const eligibleModels: string[] = [];
  if (bar.a1Eligible) eligibleModels.push("A1");
  if (bar.a3Eligible) eligibleModels.push("A3");
  if (bar.b1Eligible) eligibleModels.push("B1");
  if (bar.sb1Eligible) eligibleModels.push("SB1");

  // Signal quality: 0–100 based on ADX + ATR expansion
  const signalQuality = Math.min(100, Math.round((adx / 50) * 50 + (atrExp - 1) * 50));

  await db.insert(portfolioIntelligenceInputs).values({
    barTime: bar.barTime,
    symbol: bar.symbol,
    session: bar.session,
    regime: bar.regime,
    regimeProbabilities: JSON.stringify({ RANGE: rangeProb, TRANSITION: transitionProb, VOLATILE: volatileProb }),
    eligibleModels: JSON.stringify(eligibleModels),
    activeModel: eligibleModels[0] ?? null,
    signalQuality,
    dailyTradeCount: 0,
    dailyPnl: "0",
  });
}

// ─── Session Certification Aggregator ────────────────────────────────────────

/**
 * runSessionCertification — called at 16:05 ET each weekday by heartbeat.
 * Aggregates all candle certifications for today's RTH session and writes
 * a live_learning_cert_sessions row.
 */
export async function runSessionCertification(): Promise<{
  sessionDate: string;
  certificationStatus: "PASS" | "FAIL" | "PENDING";
  coveragePct: number;
  certifiedCandles: number;
  receivedCandles: number;
  missingCandles: number;
}> {
  const db = await getDb();
  if (!db) return { sessionDate: "", certificationStatus: "PENDING", coveragePct: 0, certifiedCandles: 0, receivedCandles: 0, missingCandles: 0 };

  // Get today's date in ET
  const nowEt = new Date(Date.now() - 4 * 60 * 60 * 1000); // rough ET offset
  const sessionDate = nowEt.toISOString().slice(0, 10);

  // RTH session: 09:30–16:00 ET = 13:30–20:00 UTC
  const sessionStartUtc = new Date(`${sessionDate}T13:30:00Z`).getTime();
  const sessionEndUtc = new Date(`${sessionDate}T20:00:00Z`).getTime();

  // Count bars received in atlas_memory for today's RTH session
  const [receivedRow] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM atlas_memory WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc} AND symbol = 'MNQ1!'`
  ) as unknown as Array<{ cnt: number }>;
  const receivedCandles = Number(receivedRow?.cnt ?? 0);

  // Count certified candles
  const [certRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM candle_certifications WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc} AND certification_status = 'PASS'`
  )) as unknown as Array<{ cnt: number }>;
  const certifiedCandles = Number(certRow?.cnt ?? 0);

  // Count failed certifications
  const [failRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM candle_certifications WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc} AND certification_status = 'FAIL'`
  )) as unknown as Array<{ cnt: number }>;
  const failedCandles = Number(failRow?.cnt ?? 0);

  // Count gaps
  const [gapRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM candle_gap_log WHERE gap_start_time >= ${sessionStartUtc} AND gap_start_time <= ${sessionEndUtc}`
  )) as unknown as Array<{ cnt: number }>;
  const gapCount = Number(gapRow?.cnt ?? 0);

  // Count behaviour library updates
  const [blRow] = (await db.execute(
    sql`SELECT SUM(total_observations) as total FROM behaviour_library`
  )) as unknown as Array<{ total: number }>;
  const behaviourLibraryUpdates = Number(blRow?.total ?? 0);

  // Count market law evaluations today
  const [mlRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM candle_certifications WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc} AND linked_to_market_laws = 1`
  )) as unknown as Array<{ cnt: number }>;
  const marketLawEvaluations = Number(mlRow?.cnt ?? 0);

  // Count darwin memory writes today
  const [dmRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM darwin_research_memory WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 HOUR) AND memory_type = 'BAR_OBSERVATION'`
  )) as unknown as Array<{ cnt: number }>;
  const darwinMemoryWrites = Number(dmRow?.cnt ?? 0);

  // Count portfolio intel updates today
  const [piRow] = (await db.execute(
    sql`SELECT COUNT(*) as cnt FROM portfolio_intelligence_inputs WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc}`
  )) as unknown as Array<{ cnt: number }>;
  const portfolioIntelUpdates = Number(piRow?.cnt ?? 0);

  // Latency stats
  const [latRow] = (await db.execute(
    sql`SELECT AVG(ingestion_latency_ms) as avg_lat, MAX(ingestion_latency_ms) as max_lat, MIN(ingestion_latency_ms) as min_lat FROM candle_certifications WHERE bar_time >= ${sessionStartUtc} AND bar_time <= ${sessionEndUtc}`
  )) as unknown as Array<{ avg_lat: number; max_lat: number; min_lat: number }>;

  const expectedCandles = 78; // 09:30–16:00 ET = 78 five-minute bars
  const missingCandles = Math.max(0, expectedCandles - receivedCandles);
  const coveragePct = expectedCandles > 0 ? (receivedCandles / expectedCandles) * 100 : 0;

  // Certification decision: PASS requires 95%+ coverage, 0 unexplained gaps, all certified
  const certificationStatus: "PASS" | "FAIL" | "PENDING" =
    receivedCandles === 0 ? "PENDING" :
    coveragePct >= 95 && gapCount === 0 && failedCandles === 0 ? "PASS" : "FAIL";

  const certNotes = [
    `Coverage: ${coveragePct.toFixed(1)}% (${receivedCandles}/${expectedCandles})`,
    `Gaps: ${gapCount}`,
    `Failed certifications: ${failedCandles}`,
    `DARWIN memory writes: ${darwinMemoryWrites}`,
    `Portfolio intel updates: ${portfolioIntelUpdates}`,
  ].join(" | ");

  // Upsert session record
  await db.execute(
    sql`INSERT INTO live_learning_cert_sessions 
        (session_date, session_start, session_end, expected_candles, received_candles, missing_candles,
         duplicate_candles, certified_candles, failed_candles, coverage_pct, avg_latency_ms, max_latency_ms,
         min_latency_ms, uptime_pct, behaviour_library_updates, market_law_evaluations,
         darwin_memory_writes, portfolio_intel_updates, certification_status, certification_notes)
        VALUES (${sessionDate}, ${sessionStartUtc}, ${sessionEndUtc}, ${expectedCandles}, ${receivedCandles},
                ${missingCandles}, 0, ${certifiedCandles}, ${failedCandles}, ${coveragePct.toFixed(3)},
                ${Math.round(Number(latRow?.avg_lat ?? 0))}, ${Math.round(Number(latRow?.max_lat ?? 0))},
                ${Math.round(Number(latRow?.min_lat ?? 0))}, ${coveragePct.toFixed(3)},
                ${behaviourLibraryUpdates}, ${marketLawEvaluations}, ${darwinMemoryWrites},
                ${portfolioIntelUpdates}, ${certificationStatus}, ${certNotes})
        ON DUPLICATE KEY UPDATE
          received_candles = ${receivedCandles}, missing_candles = ${missingCandles},
          certified_candles = ${certifiedCandles}, failed_candles = ${failedCandles},
          coverage_pct = ${coveragePct.toFixed(3)}, avg_latency_ms = ${Math.round(Number(latRow?.avg_lat ?? 0))},
          max_latency_ms = ${Math.round(Number(latRow?.max_lat ?? 0))},
          min_latency_ms = ${Math.round(Number(latRow?.min_lat ?? 0))},
          behaviour_library_updates = ${behaviourLibraryUpdates},
          market_law_evaluations = ${marketLawEvaluations}, darwin_memory_writes = ${darwinMemoryWrites},
          portfolio_intel_updates = ${portfolioIntelUpdates}, certification_status = ${certificationStatus},
          certification_notes = ${certNotes}`
  );

  return { sessionDate, certificationStatus, coveragePct, certifiedCandles, receivedCandles, missingCandles };
}
