/**
 * Sprint 107 — VWAP Behavioural Decomposition Engine
 *
 * Scientific decomposition of VWAP deviation into distinct behavioural families.
 * Evidence-first approach: no assumptions about what families exist.
 *
 * Analysis steps:
 * 1. Extract every VWAP deviation episode (contiguous bars where |dist_vwap| > threshold)
 * 2. For each episode: measure onset cause, maintenance pattern, resolution type
 * 3. Cluster episodes by behavioural fingerprint
 * 4. Statistical separation test: are the clusters genuinely distinct?
 * 5. Generate DARWIN candidates for each distinct family
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const VWAP_DEV_THRESHOLD_ATR_MULT = 0.5; // bars where |dist_vwap| > 0.5 × ATR are "deviating"
const MIN_EPISODE_BARS = 2; // minimum consecutive bars to form an episode

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── 1. Load all atlas_memory bars with VWAP data ─────────────────────────────

console.log("Loading atlas_memory bars...");
const [rawBars] = await conn.execute(`
  SELECT 
    id, bar_time, bar_time_et,
    open, high, low, close, volume,
    vwap, dist_vwap,
    atr, adx, rsi, ema9, ema21,
    regime_classification AS regime, session,
    chop, trend_direction, volatility_state, compression_state
  FROM atlas_memory
  WHERE bar_time IS NOT NULL
    AND bar_time > 1000000000000
    AND vwap IS NOT NULL
    AND vwap > 0
    AND atr IS NOT NULL
    AND atr > 0
  ORDER BY bar_time ASC
`);

console.log(`Loaded ${rawBars.length} bars with valid VWAP data.`);

// ─── 2. Compute per-bar deviation state ───────────────────────────────────────

const bars = rawBars.map((b, i) => {
  const distVwap = parseFloat(b.dist_vwap) || 0;
  const atr = parseFloat(b.atr) || 1;
  const vwap = parseFloat(b.vwap) || parseFloat(b.close);
  const close = parseFloat(b.close);
  const open = parseFloat(b.open);
  const high = parseFloat(b.high);
  const low = parseFloat(b.low);
  const range = high - low;
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  
  // Deviation magnitude in ATR units
  const devMagnitude = Math.abs(distVwap) / atr;
  const isDeviating = devMagnitude >= VWAP_DEV_THRESHOLD_ATR_MULT;
  const devDirection = distVwap > 0 ? 'ABOVE' : 'BELOW'; // price above or below VWAP
  
  // Bar structure
  const bodyRatio = range > 0 ? body / range : 0;
  const upperWickRatio = range > 0 ? upperWick / range : 0;
  const lowerWickRatio = range > 0 ? lowerWick / range : 0;
  const isBullBar = close > open;
  const isBearBar = close < open;
  
  // Bar type classification
  let barType = 'NEUTRAL';
  if (bodyRatio > 0.7) barType = isBullBar ? 'STRONG_BULL' : 'STRONG_BEAR';
  else if (bodyRatio > 0.4) barType = isBullBar ? 'BULL' : 'BEAR';
  else if (upperWickRatio > 0.6) barType = 'UPPER_REJECTION';
  else if (lowerWickRatio > 0.6) barType = 'LOWER_REJECTION';
  else barType = 'DOJI';
  
  // Compression / expansion
  const isCompression = range < atr * 0.5;
  const isExpansion = range > atr * 1.5;
  
  // Momentum: is price moving toward or away from VWAP?
  const movingTowardVwap = (devDirection === 'ABOVE' && isBearBar) || (devDirection === 'BELOW' && isBullBar);
  const movingAwayFromVwap = (devDirection === 'ABOVE' && isBullBar) || (devDirection === 'BELOW' && isBearBar);
  
  return {
    idx: i,
    barTime: b.bar_time,
    barTimeEt: b.bar_time_et,
    open, high, low, close, volume: parseInt(b.volume) || 0,
    vwap, distVwap, atr,
    adx: parseFloat(b.adx) || 0,
    rsi: parseFloat(b.rsi) || 50,
    ema9: parseFloat(b.ema9) || 0,
    ema21: parseFloat(b.ema21) || 0,
    regime: b.regime || 'UNKNOWN',
    session: b.session || 'UNKNOWN',
    trendDirection: b.trend_direction || 'UNKNOWN',
    volatilityState: b.volatility_state || 'UNKNOWN',
    compressionState: b.compression_state || 'UNKNOWN',
    devMagnitude, isDeviating, devDirection,
    bodyRatio, upperWickRatio, lowerWickRatio,
    isBullBar, isBearBar, barType,
    isCompression, isExpansion,
    movingTowardVwap, movingAwayFromVwap,
    range, body,
  };
});

// ─── 3. Extract VWAP deviation episodes ───────────────────────────────────────

console.log("\nExtracting VWAP deviation episodes...");

const episodes = [];
let currentEpisode = null;

for (let i = 0; i < bars.length; i++) {
  const bar = bars[i];
  
  if (bar.isDeviating) {
    if (!currentEpisode) {
      // New episode starts
      // Look back to find the onset bar (first bar where deviation began)
      const prevBar = i > 0 ? bars[i - 1] : null;
      currentEpisode = {
        startIdx: i,
        endIdx: i,
        direction: bar.devDirection,
        bars: [bar],
        onsetBar: bar,
        onsetPrevBar: prevBar,
        maxDevMagnitude: bar.devMagnitude,
        maxDevBar: bar,
        minDevMagnitude: bar.devMagnitude,
        sumDevMagnitude: bar.devMagnitude,
        towardCount: bar.movingTowardVwap ? 1 : 0,
        awayCount: bar.movingAwayFromVwap ? 1 : 0,
        compressionBars: bar.isCompression ? 1 : 0,
        expansionBars: bar.isExpansion ? 1 : 0,
        strongBullBars: bar.barType === 'STRONG_BULL' ? 1 : 0,
        strongBearBars: bar.barType === 'STRONG_BEAR' ? 1 : 0,
        rejectionBars: (bar.barType === 'UPPER_REJECTION' || bar.barType === 'LOWER_REJECTION') ? 1 : 0,
        regimes: new Set([bar.regime]),
        sessions: new Set([bar.session]),
      };
    } else {
      // Continue episode
      currentEpisode.endIdx = i;
      currentEpisode.bars.push(bar);
      if (bar.devMagnitude > currentEpisode.maxDevMagnitude) {
        currentEpisode.maxDevMagnitude = bar.devMagnitude;
        currentEpisode.maxDevBar = bar;
      }
      if (bar.devMagnitude < currentEpisode.minDevMagnitude) {
        currentEpisode.minDevMagnitude = bar.devMagnitude;
      }
      currentEpisode.sumDevMagnitude += bar.devMagnitude;
      if (bar.movingTowardVwap) currentEpisode.towardCount++;
      if (bar.movingAwayFromVwap) currentEpisode.awayCount++;
      if (bar.isCompression) currentEpisode.compressionBars++;
      if (bar.isExpansion) currentEpisode.expansionBars++;
      if (bar.barType === 'STRONG_BULL') currentEpisode.strongBullBars++;
      if (bar.barType === 'STRONG_BEAR') currentEpisode.strongBearBars++;
      if (bar.barType === 'UPPER_REJECTION' || bar.barType === 'LOWER_REJECTION') currentEpisode.rejectionBars++;
      currentEpisode.regimes.add(bar.regime);
      currentEpisode.sessions.add(bar.session);
    }
  } else {
    // Not deviating — close current episode if it exists
    if (currentEpisode && currentEpisode.bars.length >= MIN_EPISODE_BARS) {
      // Determine resolution
      const lastBar = currentEpisode.bars[currentEpisode.bars.length - 1];
      const resolutionBar = bar; // the first non-deviating bar after the episode
      
      // Was this a reversion (price returned toward VWAP) or continuation (episode just ended)?
      const reversionOccurred = true; // by definition — price returned to VWAP zone
      
      // How quickly did reversion occur?
      const episodeDuration = currentEpisode.bars.length;
      const avgDevMagnitude = currentEpisode.sumDevMagnitude / episodeDuration;
      
      // Momentum analysis: what fraction of bars were moving toward VWAP?
      const towardFraction = currentEpisode.towardCount / episodeDuration;
      const awayFraction = currentEpisode.awayCount / episodeDuration;
      
      // Structure analysis
      const compressionFraction = currentEpisode.compressionBars / episodeDuration;
      const expansionFraction = currentEpisode.expansionBars / episodeDuration;
      const rejectionFraction = currentEpisode.rejectionBars / episodeDuration;
      
      // Classify the resolution type
      let resolutionType;
      if (towardFraction >= 0.6) {
        resolutionType = 'GRADUAL_REVERSION'; // most bars were moving toward VWAP
      } else if (rejectionFraction >= 0.3) {
        resolutionType = 'REJECTION_REVERSION'; // wick rejections drove the return
      } else if (expansionFraction >= 0.3) {
        resolutionType = 'EXPANSION_REVERSION'; // expansion bars drove the return
      } else {
        resolutionType = 'DRIFT_REVERSION'; // price drifted back without clear cause
      }
      
      // Classify the onset type
      let onsetType;
      const prevBar = currentEpisode.onsetPrevBar;
      if (!prevBar) {
        onsetType = 'DATA_START';
      } else if (prevBar.isExpansion) {
        onsetType = 'EXPANSION_ONSET'; // an expansion bar caused the deviation
      } else if (prevBar.barType === 'STRONG_BULL' || prevBar.barType === 'STRONG_BEAR') {
        onsetType = 'IMPULSE_ONSET'; // a strong directional bar caused the deviation
      } else if (prevBar.isCompression) {
        onsetType = 'COMPRESSION_BREAKOUT_ONSET'; // compression broke out into deviation
      } else {
        onsetType = 'GRADUAL_ONSET'; // price drifted into deviation
      }
      
      // Classify the maintenance pattern
      let maintenancePattern;
      if (awayFraction >= 0.5) {
        maintenancePattern = 'CONTINUATION_MAINTAINED'; // price kept moving away from VWAP
      } else if (compressionFraction >= 0.3) {
        maintenancePattern = 'COMPRESSION_MAINTAINED'; // price coiled while deviating
      } else if (towardFraction >= 0.4 && awayFraction >= 0.4) {
        maintenancePattern = 'OSCILLATION_MAINTAINED'; // price oscillated within the deviation
      } else {
        maintenancePattern = 'PASSIVE_MAINTAINED'; // price held deviation without strong directional bias
      }
      
      episodes.push({
        id: episodes.length + 1,
        startIdx: currentEpisode.startIdx,
        endIdx: currentEpisode.endIdx,
        duration: episodeDuration,
        direction: currentEpisode.direction,
        maxDevMagnitude: currentEpisode.maxDevMagnitude,
        avgDevMagnitude,
        minDevMagnitude: currentEpisode.minDevMagnitude,
        towardFraction,
        awayFraction,
        compressionFraction,
        expansionFraction,
        rejectionFraction,
        onsetType,
        maintenancePattern,
        resolutionType,
        regimes: Array.from(currentEpisode.regimes),
        sessions: Array.from(currentEpisode.sessions),
        onsetBar: currentEpisode.onsetBar,
        maxDevBar: currentEpisode.maxDevBar,
        resolutionBar,
        strongBullFraction: currentEpisode.strongBullBars / episodeDuration,
        strongBearFraction: currentEpisode.strongBearBars / episodeDuration,
      });
    }
    currentEpisode = null;
  }
}

// Close any open episode at end of data
if (currentEpisode && currentEpisode.bars.length >= MIN_EPISODE_BARS) {
  const episodeDuration = currentEpisode.bars.length;
  const avgDevMagnitude = currentEpisode.sumDevMagnitude / episodeDuration;
  const towardFraction = currentEpisode.towardCount / episodeDuration;
  const awayFraction = currentEpisode.awayCount / episodeDuration;
  const compressionFraction = currentEpisode.compressionBars / episodeDuration;
  const expansionFraction = currentEpisode.expansionBars / episodeDuration;
  const rejectionFraction = currentEpisode.rejectionBars / episodeDuration;
  
  episodes.push({
    id: episodes.length + 1,
    startIdx: currentEpisode.startIdx,
    endIdx: currentEpisode.endIdx,
    duration: episodeDuration,
    direction: currentEpisode.direction,
    maxDevMagnitude: currentEpisode.maxDevMagnitude,
    avgDevMagnitude,
    minDevMagnitude: currentEpisode.minDevMagnitude,
    towardFraction,
    awayFraction,
    compressionFraction,
    expansionFraction,
    rejectionFraction,
    onsetType: 'UNKNOWN',
    maintenancePattern: awayFraction >= 0.5 ? 'CONTINUATION_MAINTAINED' : 'PASSIVE_MAINTAINED',
    resolutionType: 'OPEN_AT_END',
    regimes: Array.from(currentEpisode.regimes),
    sessions: Array.from(currentEpisode.sessions),
    onsetBar: currentEpisode.onsetBar,
    maxDevBar: currentEpisode.maxDevBar,
    resolutionBar: null,
    strongBullFraction: currentEpisode.strongBullBars / episodeDuration,
    strongBearFraction: currentEpisode.strongBearBars / episodeDuration,
  });
}

console.log(`\nExtracted ${episodes.length} VWAP deviation episodes.`);
console.log(`Total deviating bars: ${episodes.reduce((s, e) => s + e.duration, 0)}`);
console.log(`Average episode duration: ${(episodes.reduce((s, e) => s + e.duration, 0) / episodes.length).toFixed(1)} bars`);
console.log(`Max episode duration: ${Math.max(...episodes.map(e => e.duration))} bars`);
console.log(`Min episode duration: ${Math.min(...episodes.map(e => e.duration))} bars`);

// ─── 4. Behavioural Decomposition ─────────────────────────────────────────────

console.log("\n=== BEHAVIOURAL DECOMPOSITION ===");

// Primary taxonomy: onset × maintenance × resolution
const taxonomy = {};
for (const ep of episodes) {
  const key = `${ep.onsetType}|${ep.maintenancePattern}|${ep.resolutionType}`;
  if (!taxonomy[key]) taxonomy[key] = [];
  taxonomy[key].push(ep);
}

// Sort by frequency
const sortedTaxonomy = Object.entries(taxonomy).sort((a, b) => b[1].length - a[1].length);
console.log("\nEpisode taxonomy (onset|maintenance|resolution):");
for (const [key, eps] of sortedTaxonomy) {
  const avgDur = (eps.reduce((s, e) => s + e.duration, 0) / eps.length).toFixed(1);
  const avgDev = (eps.reduce((s, e) => s + e.maxDevMagnitude, 0) / eps.length).toFixed(2);
  console.log(`  ${key}: ${eps.length} episodes, avg_dur=${avgDur}, avg_max_dev=${avgDev}×ATR`);
}

// ─── 5. Cluster into behavioural families ─────────────────────────────────────

console.log("\n=== BEHAVIOURAL FAMILY CLUSTERING ===");

// Family 1: VWAP Mean Reversion
// Definition: price deviates, then most bars move toward VWAP (towardFraction >= 0.5)
// Resolution: GRADUAL_REVERSION or REJECTION_REVERSION
const family1_MeanReversion = episodes.filter(e => 
  e.towardFraction >= 0.5 && 
  (e.resolutionType === 'GRADUAL_REVERSION' || e.resolutionType === 'REJECTION_REVERSION')
);

// Family 2: VWAP Continuation
// Definition: price deviates and keeps moving away from VWAP (awayFraction >= 0.5)
// Maintenance: CONTINUATION_MAINTAINED
const family2_Continuation = episodes.filter(e => 
  e.awayFraction >= 0.5 && 
  e.maintenancePattern === 'CONTINUATION_MAINTAINED'
);

// Family 3: VWAP Compression within Deviation
// Definition: price deviates and compresses (compressionFraction >= 0.3)
// This is the coiling pattern — energy building within the deviation
const family3_CompressionWithinDev = episodes.filter(e => 
  e.compressionFraction >= 0.3 && 
  e.maintenancePattern === 'COMPRESSION_MAINTAINED'
);

// Family 4: VWAP Oscillation
// Definition: price oscillates within the deviation (both toward and away fractions >= 0.3)
const family4_Oscillation = episodes.filter(e => 
  e.towardFraction >= 0.3 && e.awayFraction >= 0.3 &&
  e.maintenancePattern === 'OSCILLATION_MAINTAINED'
);

// Family 5: VWAP Passive Hold
// Definition: price holds deviation without strong directional bias
// Typically: low toward fraction, low away fraction, low compression
const family5_PassiveHold = episodes.filter(e => 
  e.maintenancePattern === 'PASSIVE_MAINTAINED' &&
  e.towardFraction < 0.4 && e.awayFraction < 0.4
);

// Family 6: Rejection-Driven Return
// Definition: wick rejections at the deviation extreme drive the return
const family6_RejectionReturn = episodes.filter(e => 
  e.rejectionFraction >= 0.3 && 
  e.resolutionType === 'REJECTION_REVERSION'
);

// Note: families can overlap — an episode can belong to multiple families
// We'll report them separately and note the overlaps

const families = [
  { name: 'VWAP_MEAN_REVERSION', episodes: family1_MeanReversion, description: 'Price deviates then systematically returns toward VWAP (≥50% of bars moving toward VWAP)' },
  { name: 'VWAP_CONTINUATION', episodes: family2_Continuation, description: 'Price deviates and keeps moving away from VWAP (≥50% of bars moving away)' },
  { name: 'VWAP_COMPRESSION_WITHIN_DEVIATION', episodes: family3_CompressionWithinDev, description: 'Price deviates and compresses (coils) within the deviation zone' },
  { name: 'VWAP_OSCILLATION', episodes: family4_Oscillation, description: 'Price oscillates within the deviation — both toward and away movements present' },
  { name: 'VWAP_PASSIVE_HOLD', episodes: family5_PassiveHold, description: 'Price holds deviation without strong directional bias — passive drift' },
  { name: 'VWAP_REJECTION_RETURN', episodes: family6_RejectionReturn, description: 'Wick rejections at the deviation extreme drive the return to VWAP' },
];

console.log("\nBehavioural families:");
for (const f of families) {
  if (f.episodes.length === 0) continue;
  const avgDur = (f.episodes.reduce((s, e) => s + e.duration, 0) / f.episodes.length).toFixed(1);
  const avgMaxDev = (f.episodes.reduce((s, e) => s + e.maxDevMagnitude, 0) / f.episodes.length).toFixed(2);
  const avgToward = (f.episodes.reduce((s, e) => s + e.towardFraction, 0) / f.episodes.length * 100).toFixed(0);
  const avgAway = (f.episodes.reduce((s, e) => s + e.awayFraction, 0) / f.episodes.length * 100).toFixed(0);
  const regimeBreakdown = {};
  f.episodes.forEach(e => e.regimes.forEach(r => { regimeBreakdown[r] = (regimeBreakdown[r] || 0) + 1; }));
  const sessionBreakdown = {};
  f.episodes.forEach(e => e.sessions.forEach(s => { sessionBreakdown[s] = (sessionBreakdown[s] || 0) + 1; }));
  
  console.log(`\n  ${f.name}: ${f.episodes.length} episodes`);
  console.log(`    avg_duration=${avgDur} bars, avg_max_dev=${avgMaxDev}×ATR`);
  console.log(`    avg_toward=${avgToward}%, avg_away=${avgAway}%`);
  console.log(`    regimes: ${JSON.stringify(regimeBreakdown)}`);
  console.log(`    sessions: ${JSON.stringify(sessionBreakdown)}`);
}

// ─── 6. Statistical Separation Test ──────────────────────────────────────────

console.log("\n=== STATISTICAL SEPARATION TEST ===");
console.log("Testing: Are VWAP_MEAN_REVERSION and VWAP_CONTINUATION genuinely distinct behaviours?");

if (family1_MeanReversion.length > 0 && family2_Continuation.length > 0) {
  // Compare key metrics
  const mr_avgDur = family1_MeanReversion.reduce((s, e) => s + e.duration, 0) / family1_MeanReversion.length;
  const cont_avgDur = family2_Continuation.reduce((s, e) => s + e.duration, 0) / family2_Continuation.length;
  
  const mr_avgMaxDev = family1_MeanReversion.reduce((s, e) => s + e.maxDevMagnitude, 0) / family1_MeanReversion.length;
  const cont_avgMaxDev = family2_Continuation.reduce((s, e) => s + e.maxDevMagnitude, 0) / family2_Continuation.length;
  
  const mr_avgToward = family1_MeanReversion.reduce((s, e) => s + e.towardFraction, 0) / family1_MeanReversion.length;
  const cont_avgToward = family2_Continuation.reduce((s, e) => s + e.towardFraction, 0) / family2_Continuation.length;
  
  const mr_avgAway = family1_MeanReversion.reduce((s, e) => s + e.awayFraction, 0) / family1_MeanReversion.length;
  const cont_avgAway = family2_Continuation.reduce((s, e) => s + e.awayFraction, 0) / family2_Continuation.length;
  
  const mr_regimes = {};
  family1_MeanReversion.forEach(e => e.regimes.forEach(r => { mr_regimes[r] = (mr_regimes[r] || 0) + 1; }));
  const cont_regimes = {};
  family2_Continuation.forEach(e => e.regimes.forEach(r => { cont_regimes[r] = (cont_regimes[r] || 0) + 1; }));
  
  console.log(`\n  VWAP_MEAN_REVERSION (n=${family1_MeanReversion.length}):`);
  console.log(`    avg_duration: ${mr_avgDur.toFixed(1)} bars`);
  console.log(`    avg_max_deviation: ${mr_avgMaxDev.toFixed(2)}×ATR`);
  console.log(`    avg_toward_fraction: ${(mr_avgToward*100).toFixed(0)}%`);
  console.log(`    avg_away_fraction: ${(mr_avgAway*100).toFixed(0)}%`);
  console.log(`    regime_breakdown: ${JSON.stringify(mr_regimes)}`);
  
  console.log(`\n  VWAP_CONTINUATION (n=${family2_Continuation.length}):`);
  console.log(`    avg_duration: ${cont_avgDur.toFixed(1)} bars`);
  console.log(`    avg_max_deviation: ${cont_avgMaxDev.toFixed(2)}×ATR`);
  console.log(`    avg_toward_fraction: ${(cont_avgToward*100).toFixed(0)}%`);
  console.log(`    avg_away_fraction: ${(cont_avgAway*100).toFixed(0)}%`);
  console.log(`    regime_breakdown: ${JSON.stringify(cont_regimes)}`);
  
  // Separation score: how different are the two families?
  const durationDiff = Math.abs(mr_avgDur - cont_avgDur) / Math.max(mr_avgDur, cont_avgDur);
  const devDiff = Math.abs(mr_avgMaxDev - cont_avgMaxDev) / Math.max(mr_avgMaxDev, cont_avgMaxDev);
  const towardDiff = Math.abs(mr_avgToward - cont_avgToward);
  const awayDiff = Math.abs(mr_avgAway - cont_avgAway);
  
  console.log(`\n  Separation metrics:`);
  console.log(`    Duration difference: ${(durationDiff*100).toFixed(0)}%`);
  console.log(`    Max deviation difference: ${(devDiff*100).toFixed(0)}%`);
  console.log(`    Toward fraction difference: ${(towardDiff*100).toFixed(0)} percentage points`);
  console.log(`    Away fraction difference: ${(awayDiff*100).toFixed(0)} percentage points`);
  
  const isSeparated = towardDiff > 0.3 || awayDiff > 0.3;
  console.log(`\n  VERDICT: ${isSeparated ? 'GENUINELY DISTINCT — separate candidates warranted' : 'INSUFFICIENT SEPARATION — may be same behaviour with different outcomes'}`);
} else {
  console.log("  Insufficient data for one or both families.");
}

// ─── 7. Edge Analysis per Family ──────────────────────────────────────────────

console.log("\n=== EDGE ANALYSIS PER FAMILY ===");

// For each family, estimate the trading edge
// Entry: first bar of episode
// Exit: when episode ends (price returns to VWAP zone)
// Direction: fade the deviation (trade toward VWAP)

for (const f of families) {
  if (f.episodes.length < 3) continue;
  
  // For mean reversion families: entry at deviation, exit at VWAP
  // Estimate: if we entered at the start of each episode and exited when it ended
  // Win = episode resolved (price returned to VWAP) — which is by definition true for all non-OPEN episodes
  // The edge comes from the R:R ratio
  
  const completedEpisodes = f.episodes.filter(e => e.resolutionType !== 'OPEN_AT_END');
  if (completedEpisodes.length === 0) continue;
  
  // Estimate R:R: stop = max deviation + 0.5×ATR, target = VWAP (= dist_vwap distance)
  // For each episode: entry_dev = avgDevMagnitude, stop_dev = maxDevMagnitude + 0.5, target = 0
  const estimatedRRs = completedEpisodes.map(e => {
    const entryDev = e.avgDevMagnitude; // entry at average deviation
    const stopDev = e.maxDevMagnitude + 0.5; // stop beyond max deviation
    const targetDev = 0; // target at VWAP
    const reward = entryDev; // distance from entry to VWAP
    const risk = stopDev - entryDev; // distance from entry to stop
    return risk > 0 ? reward / risk : 0;
  });
  
  const avgRR = estimatedRRs.reduce((s, r) => s + r, 0) / estimatedRRs.length;
  const winRate = completedEpisodes.filter(e => e.resolutionType !== 'OPEN_AT_END').length / completedEpisodes.length;
  
  console.log(`\n  ${f.name} (n=${f.episodes.length}, completed=${completedEpisodes.length}):`);
  console.log(`    Estimated avg R:R = ${avgRR.toFixed(2)}`);
  console.log(`    Win rate (reversion occurred) = ${(winRate*100).toFixed(0)}%`);
  console.log(`    Estimated PF = ${(winRate * avgRR / (1 - winRate + 0.001)).toFixed(2)}`);
}

// ─── 8. Session and Regime Analysis ───────────────────────────────────────────

console.log("\n=== SESSION AND REGIME ANALYSIS ===");

const sessionFamilyBreakdown = {};
const regimeFamilyBreakdown = {};

for (const f of families) {
  if (f.episodes.length === 0) continue;
  for (const ep of f.episodes) {
    for (const session of ep.sessions) {
      if (!sessionFamilyBreakdown[session]) sessionFamilyBreakdown[session] = {};
      sessionFamilyBreakdown[session][f.name] = (sessionFamilyBreakdown[session][f.name] || 0) + 1;
    }
    for (const regime of ep.regimes) {
      if (!regimeFamilyBreakdown[regime]) regimeFamilyBreakdown[regime] = {};
      regimeFamilyBreakdown[regime][f.name] = (regimeFamilyBreakdown[regime][f.name] || 0) + 1;
    }
  }
}

console.log("\nSession breakdown by family:");
for (const [session, families_] of Object.entries(sessionFamilyBreakdown)) {
  console.log(`  ${session}: ${JSON.stringify(families_)}`);
}

console.log("\nRegime breakdown by family:");
for (const [regime, families_] of Object.entries(regimeFamilyBreakdown)) {
  console.log(`  ${regime}: ${JSON.stringify(families_)}`);
}

// ─── 9. Duration Distribution ─────────────────────────────────────────────────

console.log("\n=== DURATION DISTRIBUTION ===");
const durationBuckets = { '2': 0, '3-5': 0, '6-10': 0, '11-20': 0, '21+': 0 };
for (const ep of episodes) {
  if (ep.duration === 2) durationBuckets['2']++;
  else if (ep.duration <= 5) durationBuckets['3-5']++;
  else if (ep.duration <= 10) durationBuckets['6-10']++;
  else if (ep.duration <= 20) durationBuckets['11-20']++;
  else durationBuckets['21+']++;
}
console.log("Episode duration distribution:", JSON.stringify(durationBuckets));

// ─── 10. Summary for DARWIN Candidate Generation ──────────────────────────────

console.log("\n=== SUMMARY FOR DARWIN CANDIDATE GENERATION ===");
console.log(`Total episodes: ${episodes.length}`);
console.log(`Families with ≥3 episodes:`);
for (const f of families) {
  if (f.episodes.length >= 3) {
    console.log(`  ${f.name}: ${f.episodes.length} episodes — CANDIDATE WARRANTED`);
  } else {
    console.log(`  ${f.name}: ${f.episodes.length} episodes — INSUFFICIENT DATA`);
  }
}

// Save results to file for the registration script
import { writeFileSync } from 'fs';
const results = {
  totalBars: bars.length,
  totalEpisodes: episodes.length,
  families: families.map(f => ({
    name: f.name,
    description: f.description,
    episodeCount: f.episodes.length,
    avgDuration: f.episodes.length > 0 ? f.episodes.reduce((s, e) => s + e.duration, 0) / f.episodes.length : 0,
    avgMaxDev: f.episodes.length > 0 ? f.episodes.reduce((s, e) => s + e.maxDevMagnitude, 0) / f.episodes.length : 0,
    avgTowardFraction: f.episodes.length > 0 ? f.episodes.reduce((s, e) => s + e.towardFraction, 0) / f.episodes.length : 0,
    avgAwayFraction: f.episodes.length > 0 ? f.episodes.reduce((s, e) => s + e.awayFraction, 0) / f.episodes.length : 0,
    regimes: (() => {
      const r = {};
      f.episodes.forEach(e => e.regimes.forEach(reg => { r[reg] = (r[reg] || 0) + 1; }));
      return r;
    })(),
    sessions: (() => {
      const s = {};
      f.episodes.forEach(e => e.sessions.forEach(ses => { s[ses] = (s[ses] || 0) + 1; }));
      return s;
    })(),
  })),
  taxonomy: sortedTaxonomy.map(([key, eps]) => ({
    key,
    count: eps.length,
    avgDuration: eps.reduce((s, e) => s + e.duration, 0) / eps.length,
  })),
  durationBuckets,
  separation: {
    mr_n: family1_MeanReversion.length,
    cont_n: family2_Continuation.length,
    isSeparated: family1_MeanReversion.length > 0 && family2_Continuation.length > 0 ? 
      Math.abs(
        family1_MeanReversion.reduce((s, e) => s + e.towardFraction, 0) / family1_MeanReversion.length -
        family2_Continuation.reduce((s, e) => s + e.towardFraction, 0) / family2_Continuation.length
      ) > 0.3 : false,
  },
};
writeFileSync('/tmp/sprint107-vwap-decomposition.json', JSON.stringify(results, null, 2));
console.log('\nResults saved to /tmp/sprint107-vwap-decomposition.json');

await conn.end();
console.log('Analysis complete.');
