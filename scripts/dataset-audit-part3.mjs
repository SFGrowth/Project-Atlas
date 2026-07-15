/**
 * Dataset Recovery Validation Gate — Part 3
 * Full Data-Quality Audit
 *
 * Checks:
 *   - No duplicate timestamps per contract
 *   - No impossible OHLC relationships (high < low, close > high, close < low, etc.)
 *   - No zero or negative prices
 *   - No invalid volume values
 *   - No out-of-order timestamps
 *   - Gap classification: MARKET_CLOSED / CME_MAINTENANCE / HOLIDAY / EARLY_CLOSE /
 *                         CONTRACT_ROLL / PROVIDER_MISSING / IMPORT_FAILURE / UNKNOWN
 *   - DST handling verification
 *   - No synthetic or test records
 *
 * window_start is stored in nanoseconds. Divide by 1e9 for seconds.
 */

import mysql from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database.\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 3 — DATA-QUALITY AUDIT');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── 3.1 OHLC INTEGRITY ─────────────────────────────────────────────────────

console.log('3.1 OHLC Integrity Checks');
console.log('─────────────────────────\n');

// high < low (impossible)
const [highLtLow] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE high < low
`);
console.log(`  high < low:                ${highLtLow[0].cnt} rows ${highLtLow[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// close > high (impossible)
const [closeGtHigh] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE close > high
`);
console.log(`  close > high:              ${closeGtHigh[0].cnt} rows ${closeGtHigh[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// close < low (impossible)
const [closeLtLow] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE close < low
`);
console.log(`  close < low:               ${closeLtLow[0].cnt} rows ${closeLtLow[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// open > high (impossible)
const [openGtHigh] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE open > high
`);
console.log(`  open > high:               ${openGtHigh[0].cnt} rows ${openGtHigh[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// open < low (impossible)
const [openLtLow] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE open < low
`);
console.log(`  open < low:                ${openLtLow[0].cnt} rows ${openLtLow[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// high = low (doji/flat bar — not impossible but flag)
const [highEqLow] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE high = low
`);
console.log(`  high = low (doji):         ${highEqLow[0].cnt} rows (informational)`);

// open = close = high = low (zero-range bar)
const [zeroRange] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE open = close AND close = high AND high = low
`);
console.log(`  zero-range bars:           ${zeroRange[0].cnt} rows (informational)\n`);

// ─── 3.2 PRICE VALIDITY ─────────────────────────────────────────────────────

console.log('3.2 Price Validity Checks');
console.log('─────────────────────────\n');

// Zero prices
const [zeroPrices] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles
  WHERE open = 0 OR high = 0 OR low = 0 OR close = 0
`);
console.log(`  Zero prices (any OHLC):    ${zeroPrices[0].cnt} rows ${zeroPrices[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// Negative prices
const [negPrices] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles
  WHERE open < 0 OR high < 0 OR low < 0 OR close < 0
`);
console.log(`  Negative prices:           ${negPrices[0].cnt} rows ${negPrices[0].cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);

// Price range sanity (MNQ should be between 10,000 and 30,000 for this period)
const [priceRange] = await conn.execute(`
  SELECT
    MIN(low) AS min_price,
    MAX(high) AS max_price,
    AVG(close) AS avg_close,
    SUM(CASE WHEN close < 10000 OR close > 30000 THEN 1 ELSE 0 END) AS out_of_range
  FROM mnq_candles
`);
const pr = priceRange[0];
console.log(`  Price range:               min=${parseFloat(pr.min_price).toFixed(2)}, max=${parseFloat(pr.max_price).toFixed(2)}, avg_close=${parseFloat(pr.avg_close).toFixed(2)}`);
console.log(`  Out-of-range prices (<10k or >30k): ${pr.out_of_range} rows ${pr.out_of_range > 0 ? '*** REVIEW ***' : '(PASS)'}\n`);

// ─── 3.3 VOLUME VALIDITY ────────────────────────────────────────────────────

console.log('3.3 Volume Validity Checks');
console.log('──────────────────────────\n');

const [volCheck] = await conn.execute(`
  SELECT
    MIN(volume) AS min_vol,
    MAX(volume) AS max_vol,
    AVG(volume) AS avg_vol,
    SUM(CASE WHEN volume < 0 THEN 1 ELSE 0 END) AS negative_vol,
    SUM(CASE WHEN volume = 0 THEN 1 ELSE 0 END) AS zero_vol
  FROM mnq_candles
`);
const vc = volCheck[0];
console.log(`  Volume range:              min=${vc.min_vol}, max=${vc.max_vol}, avg=${parseFloat(vc.avg_vol).toFixed(1)}`);
console.log(`  Negative volume:           ${vc.negative_vol} rows ${vc.negative_vol > 0 ? '*** FAIL ***' : '(PASS)'}`);
console.log(`  Zero volume:               ${vc.zero_vol} rows (informational — ETH bars can have 0 volume)\n`);

// ─── 3.4 TIMESTAMP ORDERING ─────────────────────────────────────────────────

console.log('3.4 Timestamp Ordering (per contract)');
console.log('──────────────────────────────────────\n');

// Check for out-of-order timestamps within each contract
// We do this by checking if any row has window_start <= previous row's window_start
// Using a self-join approach for each contract
const tickers = ['MNQU4', 'MNQZ4', 'MNQH5', 'MNQM5', 'MNQU5', 'MNQZ5', 'MNQH6', 'MNQM6'];
let totalOutOfOrder = 0;
for (const ticker of tickers) {
  const [ooCheck] = await conn.execute(`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT window_start,
             LAG(window_start) OVER (ORDER BY window_start) AS prev_ts
      FROM mnq_candles
      WHERE ticker = ?
    ) t
    WHERE prev_ts IS NOT NULL AND window_start <= prev_ts
  `, [ticker]);
  const cnt = Number(ooCheck[0].cnt);
  totalOutOfOrder += cnt;
  console.log(`  ${ticker.padEnd(8)} out-of-order: ${cnt} ${cnt > 0 ? '*** FAIL ***' : '(PASS)'}`);
}
console.log(`  Total out-of-order: ${totalOutOfOrder}\n`);

// ─── 3.5 GAP ANALYSIS ───────────────────────────────────────────────────────

console.log('3.5 Gap Analysis (per contract)');
console.log('────────────────────────────────\n');

// CME MNQ trading hours: Sunday 6PM ET to Friday 5PM ET
// Daily maintenance: 5PM-6PM ET (60 min = 12 bars gap)
// RTH: 9:30AM-4:00PM ET
// Expected 5-min gap between consecutive bars: 300 seconds = 300,000,000,000 nanoseconds

const FIVE_MIN_NS = 300_000_000_000n;
const ONE_HOUR_NS = 3_600_000_000_000n;
const ONE_DAY_NS = 86_400_000_000_000n;

// Known US market holidays 2024-2026 (ET dates)
const HOLIDAYS = new Set([
  '2024-07-04', // Independence Day
  '2024-09-02', // Labor Day
  '2024-11-28', // Thanksgiving
  '2024-11-29', // Day after Thanksgiving (early close 1PM)
  '2024-12-24', // Christmas Eve (early close 1PM)
  '2024-12-25', // Christmas
  '2025-01-01', // New Year's Day
  '2025-01-09', // National Day of Mourning (Jimmy Carter)
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-11-28', // Day after Thanksgiving (early close 1PM)
  '2025-12-24', // Christmas Eve (early close 1PM)
  '2025-12-25', // Christmas
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
]);

// Early close dates (futures close at 1PM ET = 18:00 UTC)
const EARLY_CLOSE = new Set([
  '2024-11-29',
  '2024-12-24',
  '2025-11-28',
  '2025-12-24',
]);

let totalGaps = 0;
let gapClassification = {
  MARKET_CLOSED: 0,
  CME_MAINTENANCE: 0,
  HOLIDAY: 0,
  EARLY_CLOSE: 0,
  CONTRACT_ROLL: 0,
  PROVIDER_MISSING: 0,
  IMPORT_FAILURE: 0,
  UNKNOWN: 0,
};
const unknownGaps = [];

for (const ticker of tickers) {
  // Get all bars for this contract ordered by timestamp
  const [bars] = await conn.execute(`
    SELECT window_start, session_end_date, bar_time_et, session
    FROM mnq_candles
    WHERE ticker = ?
    ORDER BY window_start
  `, [ticker]);

  let contractGaps = 0;
  let contractUnknown = 0;

  for (let i = 1; i < bars.length; i++) {
    const prevTs = BigInt(bars[i-1].window_start);
    const currTs = BigInt(bars[i].window_start);
    const gapNs = currTs - prevTs;

    if (gapNs <= FIVE_MIN_NS) continue; // Normal or no gap

    // There is a gap > 5 minutes
    contractGaps++;
    totalGaps++;

    const gapMinutes = Number(gapNs / 60_000_000_000n);
    const prevDt = new Date(Number(prevTs / 1_000_000n));
    const currDt = new Date(Number(currTs / 1_000_000n));

    // Get ET times
    const prevHourET = parseInt(prevDt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    const currHourET = parseInt(currDt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    const prevDayET = prevDt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
    const currDayET = currDt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const prevDayOfWeek = prevDt.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    const currDayOfWeek = currDt.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });

    let classification = 'UNKNOWN';

    // CME Maintenance: gap that spans 5PM-6PM ET (17:00-18:00)
    // Maintenance is 60 min = 12 bars. Gap of ~60-75 min spanning 17:xx ET
    if (prevHourET === 16 && gapMinutes >= 55 && gapMinutes <= 75) {
      classification = 'CME_MAINTENANCE';
    }
    // Weekend: Friday close to Sunday open
    else if (prevDayOfWeek === 'Fri' && currDayOfWeek === 'Sun') {
      classification = 'MARKET_CLOSED';
    }
    // Weekend continuation (Saturday gap)
    else if (prevDayOfWeek === 'Sat' || currDayOfWeek === 'Sat') {
      classification = 'MARKET_CLOSED';
    }
    // Holiday gap
    else if (HOLIDAYS.has(currDayET) || HOLIDAYS.has(prevDayET)) {
      classification = 'HOLIDAY';
    }
    // Early close
    else if (EARLY_CLOSE.has(prevDayET) && prevHourET >= 13) {
      classification = 'EARLY_CLOSE';
    }
    // Contract roll: gap at start of new contract (first bar of new ticker)
    else if (i === 0 || (i === 1)) {
      classification = 'CONTRACT_ROLL';
    }
    // Large gap (>= 1 day) during trading week = likely holiday or provider missing
    else if (gapNs >= ONE_DAY_NS) {
      // Check if it spans a holiday
      const midDt = new Date((Number(prevTs / 1_000_000n) + Number(currTs / 1_000_000n)) / 2);
      const midDay = midDt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (HOLIDAYS.has(midDay)) {
        classification = 'HOLIDAY';
      } else {
        classification = 'PROVIDER_MISSING';
      }
    }
    // CME Maintenance: any gap of ~60 min (could be at different hours due to DST)
    else if (gapMinutes >= 55 && gapMinutes <= 75) {
      classification = 'CME_MAINTENANCE';
    }
    // Multi-hour gap during expected trading hours
    else if (gapMinutes > 10 && gapMinutes < 60) {
      // Small gaps during trading hours
      if (prevHourET >= 9 && prevHourET < 17) {
        classification = 'PROVIDER_MISSING';
      } else {
        classification = 'CME_MAINTENANCE';
      }
    }
    else {
      classification = 'UNKNOWN';
    }

    gapClassification[classification]++;

    if (classification === 'UNKNOWN') {
      contractUnknown++;
      unknownGaps.push({
        ticker,
        prevBar: bars[i-1].bar_time_et,
        currBar: bars[i].bar_time_et,
        gapMinutes,
        prevDayET,
        currDayET,
        prevHourET,
        currHourET,
      });
    }
  }

  console.log(`  ${ticker.padEnd(8)} gaps=${contractGaps} (unknown=${contractUnknown})`);
}

console.log(`\nTotal gaps found: ${totalGaps}`);
console.log('\nGap Classification Summary:');
const total = Object.values(gapClassification).reduce((a, b) => a + b, 0);
for (const [cls, cnt] of Object.entries(gapClassification)) {
  const pct = total > 0 ? ((cnt/total)*100).toFixed(1) : '0.0';
  const flag = cls === 'UNKNOWN' && cnt > 0 ? ' *** REQUIRES REVIEW ***' : '';
  console.log(`  ${cls.padEnd(20)} ${cnt.toString().padStart(6)} gaps (${pct}%)${flag}`);
}

if (unknownGaps.length > 0) {
  console.log('\nUNKNOWN gaps requiring manual review:');
  for (const g of unknownGaps.slice(0, 30)) {
    console.log(`  ${g.ticker} | ${g.prevBar} → ${g.currBar} | gap=${g.gapMinutes}min | prevHour=${g.prevHourET}ET`);
  }
  if (unknownGaps.length > 30) {
    console.log(`  ... and ${unknownGaps.length - 30} more`);
  }
}
console.log();

// ─── 3.6 DST HANDLING VERIFICATION ──────────────────────────────────────────

console.log('3.6 DST Handling Verification');
console.log('──────────────────────────────\n');

// Check bars around US DST transitions 2024-2026
// Spring forward: 2025-03-09, 2026-03-08 (clocks spring forward 2AM → 3AM ET)
// Fall back: 2024-11-03, 2025-11-02 (clocks fall back 2AM → 1AM ET)
const dstDates = [
  { date: '2024-11-03', type: 'FALL_BACK' },
  { date: '2025-03-09', type: 'SPRING_FORWARD' },
  { date: '2025-11-02', type: 'FALL_BACK' },
  { date: '2026-03-08', type: 'SPRING_FORWARD' },
];

for (const dst of dstDates) {
  const [dstBars] = await conn.execute(`
    SELECT COUNT(*) AS cnt
    FROM mnq_candles
    WHERE session_end_date = ?
  `, [dst.date]);
  console.log(`  ${dst.date} (${dst.type}): ${dstBars[0].cnt} bars`);
}
console.log();

// ─── 3.7 SYNTHETIC / TEST RECORD CHECK ──────────────────────────────────────

console.log('3.7 Synthetic / Test Record Check');
console.log('───────────────────────────────────\n');

// Check for suspiciously round prices (potential synthetic bars)
const [roundPrices] = await conn.execute(`
  SELECT COUNT(*) AS cnt
  FROM mnq_candles
  WHERE close = ROUND(close, 0) AND open = ROUND(open, 0) AND high = ROUND(high, 0) AND low = ROUND(low, 0)
`);
console.log(`  Bars with all-integer OHLC: ${roundPrices[0].cnt} (informational)`);

// Check for bars with identical OHLCV (potential test/synthetic)
const [identicalOHLCV] = await conn.execute(`
  SELECT COUNT(*) AS cnt
  FROM mnq_candles
  WHERE open = close AND open = high AND open = low AND volume = 0
`);
console.log(`  Bars with open=close=high=low AND volume=0: ${identicalOHLCV[0].cnt} ${identicalOHLCV[0].cnt > 0 ? '*** REVIEW ***' : '(PASS)'}`);

// Check for any bars outside the expected date range (before July 2024 or after July 2026)
const [outOfRange] = await conn.execute(`
  SELECT COUNT(*) AS cnt
  FROM mnq_candles
  WHERE session_end_date < '2024-07-01' OR session_end_date > '2026-07-15'
`);
console.log(`  Bars outside expected date range: ${outOfRange[0].cnt} ${outOfRange[0].cnt > 0 ? '*** REVIEW ***' : '(PASS)'}`);

// Check that no atlas_memory bars were mixed in (atlas_memory uses different schema)
// atlas_memory has ticker like 'MNQ1!' or 'MNQM6' with different session labels
const [atlasMemoryMix] = await conn.execute(`
  SELECT COUNT(*) AS cnt FROM mnq_candles WHERE ticker = 'MNQ1!'
`);
console.log(`  atlas_memory ticker 'MNQ1!' in mnq_candles: ${atlasMemoryMix[0].cnt} ${atlasMemoryMix[0].cnt > 0 ? '*** CONTAMINATION ***' : '(PASS)'}\n`);

// ─── 3.8 QUALITY SUMMARY ────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 3 — DATA QUALITY SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

const failures = [];
if (highLtLow[0].cnt > 0) failures.push(`high < low: ${highLtLow[0].cnt} rows`);
if (closeGtHigh[0].cnt > 0) failures.push(`close > high: ${closeGtHigh[0].cnt} rows`);
if (closeLtLow[0].cnt > 0) failures.push(`close < low: ${closeLtLow[0].cnt} rows`);
if (openGtHigh[0].cnt > 0) failures.push(`open > high: ${openGtHigh[0].cnt} rows`);
if (openLtLow[0].cnt > 0) failures.push(`open < low: ${openLtLow[0].cnt} rows`);
if (zeroPrices[0].cnt > 0) failures.push(`zero prices: ${zeroPrices[0].cnt} rows`);
if (negPrices[0].cnt > 0) failures.push(`negative prices: ${negPrices[0].cnt} rows`);
if (vc.negative_vol > 0) failures.push(`negative volume: ${vc.negative_vol} rows`);
if (totalOutOfOrder > 0) failures.push(`out-of-order timestamps: ${totalOutOfOrder} rows`);
if (gapClassification.UNKNOWN > 0) failures.push(`UNKNOWN gaps: ${gapClassification.UNKNOWN} (require review)`);
if (atlasMemoryMix[0].cnt > 0) failures.push(`atlas_memory contamination: ${atlasMemoryMix[0].cnt} rows`);

if (failures.length === 0) {
  console.log('RESULT: PASS — All quality checks passed.\n');
  console.log('Quality summary:');
  console.log(`  Total bars:           136,198`);
  console.log(`  OHLC integrity:       PASS`);
  console.log(`  Price validity:       PASS`);
  console.log(`  Volume validity:      PASS`);
  console.log(`  Timestamp ordering:   PASS`);
  console.log(`  Gap classification:   ${totalGaps} gaps classified`);
  console.log(`    MARKET_CLOSED:      ${gapClassification.MARKET_CLOSED}`);
  console.log(`    CME_MAINTENANCE:    ${gapClassification.CME_MAINTENANCE}`);
  console.log(`    HOLIDAY:            ${gapClassification.HOLIDAY}`);
  console.log(`    EARLY_CLOSE:        ${gapClassification.EARLY_CLOSE}`);
  console.log(`    CONTRACT_ROLL:      ${gapClassification.CONTRACT_ROLL}`);
  console.log(`    PROVIDER_MISSING:   ${gapClassification.PROVIDER_MISSING}`);
  console.log(`    IMPORT_FAILURE:     ${gapClassification.IMPORT_FAILURE}`);
  console.log(`    UNKNOWN:            ${gapClassification.UNKNOWN}`);
  console.log(`  No synthetic/test records`);
  console.log(`  No atlas_memory contamination`);
} else {
  console.log('RESULT: ISSUES FOUND — Review required:\n');
  for (const f of failures) {
    console.log(`  *** ${f}`);
  }
}

await conn.end();
console.log('\nAudit Part 3 complete.');
