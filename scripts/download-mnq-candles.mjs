/**
 * download-mnq-candles.mjs
 * Downloads 2 years of MNQ 5-minute OHLCV data from Massive.com
 * and inserts every bar into the permanent mnq_candles database table.
 *
 * MNQ quarterly contracts:
 *   H=Mar, M=Jun, U=Sep, Z=Dec
 * Coverage: Jul 2024 – Jul 2026
 */
import mysql from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const API_KEY = process.env.MASSIVE_API_KEY;
const BASE_URL = 'https://api.massive.com';

// Contract schedule: ticker, start date (first trading day), end date (last trading day)
const CONTRACTS = [
  { ticker: 'MNQU4', start: '2024-06-21', end: '2024-09-20' },
  { ticker: 'MNQZ4', start: '2024-09-20', end: '2024-12-20' },
  { ticker: 'MNQH5', start: '2024-12-20', end: '2025-03-21' },
  { ticker: 'MNQM5', start: '2025-03-21', end: '2025-06-20' },
  { ticker: 'MNQU5', start: '2025-06-20', end: '2025-09-19' },
  { ticker: 'MNQZ5', start: '2025-09-19', end: '2025-12-19' },
  { ticker: 'MNQH6', start: '2025-12-19', end: '2026-03-20' },
  { ticker: 'MNQM6', start: '2026-03-20', end: '2026-07-15' },
];

// Classify session from bar time (ET hours)
function classifySession(windowStartNs) {
  // Convert nanoseconds to milliseconds
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  // Get ET hour (UTC-4 in summer, UTC-5 in winter — approximate)
  const utcHour = d.getUTCHours();
  const utcMin = d.getUTCMinutes();
  const etHour = utcHour - 4; // EDT approximation
  const etMin = utcMin;
  const etDecimal = etHour + etMin / 60;

  if (etDecimal >= -6 && etDecimal < -2) return 'OV'; // Overnight: 18:00-22:00 prev day
  if (etDecimal >= -2 && etDecimal < 4) return 'OV';  // Overnight continued
  if (etDecimal >= 4 && etDecimal < 9.5) return 'PRE'; // Pre-market: 4:00-9:30
  if (etDecimal >= 9.5 && etDecimal < 11) return 'AM_OPEN'; // AM Open: 9:30-11:00
  if (etDecimal >= 11 && etDecimal < 12) return 'AM_MID'; // AM Mid: 11:00-12:00
  if (etDecimal >= 12 && etDecimal < 13) return 'LUNCH'; // Lunch: 12:00-13:00
  if (etDecimal >= 13 && etDecimal < 15) return 'PM'; // PM: 13:00-15:00
  if (etDecimal >= 15 && etDecimal < 16) return 'PM_CLOSE'; // PM Close: 15:00-16:00
  return 'OV';
}

function formatBarTimeEt(windowStartNs) {
  const ms = Number(windowStartNs) / 1_000_000;
  const d = new Date(ms);
  // Format as YYYY-MM-DD HH:MM ET (approximate EDT)
  const etMs = ms - 4 * 3600 * 1000;
  const et = new Date(etMs);
  return et.toISOString().replace('T', ' ').substring(0, 16) + ' ET';
}

async function fetchAllBars(ticker, startDate, endDate) {
  const bars = [];
  let url = `${BASE_URL}/futures/v1/aggs/${ticker}?resolution=5min&limit=50000&window_start.gte=${startDate}&window_start.lte=${endDate}&sort=window_start.asc`;

  let page = 0;
  while (url) {
    page++;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} for ${ticker}: ${text}`);
    }
    const data = await res.json();
    if (data.status !== 'OK') {
      throw new Error(`API error for ${ticker}: ${JSON.stringify(data)}`);
    }
    bars.push(...(data.results || []));
    process.stdout.write(`  ${ticker} page ${page}: +${data.results?.length || 0} bars (total ${bars.length})\r`);

    // Follow pagination
    url = data.next_url || null;
    if (url && bars.length > 200000) {
      console.log(`\n  WARNING: ${ticker} exceeded 200k bars, stopping`);
      break;
    }
    // Small delay to be respectful
    if (url) await new Promise(r => setTimeout(r, 200));
  }
  console.log(`\n  ${ticker}: ${bars.length} bars fetched`);
  return bars;
}

async function insertBars(db, bars) {
  if (bars.length === 0) return 0;

  // Insert in batches of 1000
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < bars.length; i += BATCH) {
    const batch = bars.slice(i, i + BATCH);
    const values = batch.map(b => [
      b.ticker,
      b.window_start,
      b.session_end_date,
      b.open,
      b.high,
      b.low,
      b.close,
      b.volume || 0,
      b.transactions || 0,
      b.dollar_volume || null,
      formatBarTimeEt(b.window_start),
      classifySession(b.window_start),
    ]);

    await db.query(
      `INSERT IGNORE INTO mnq_candles 
       (ticker, window_start, session_end_date, open, high, low, close, volume, transactions, dollar_volume, bar_time_et, session)
       VALUES ?`,
      [values]
    );
    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${bars.length} rows\r`);
  }
  console.log(`\n  Inserted ${inserted} rows`);
  return inserted;
}

async function main() {
  console.log('=== MNQ 2-Year Candle Download ===');
  console.log(`API Key: ${API_KEY ? API_KEY.substring(0, 8) + '...' : 'MISSING'}`);

  if (!API_KEY) {
    throw new Error('MASSIVE_API_KEY not set');
  }

  const db = await mysql.createConnection(process.env.DATABASE_URL);

  // Check existing count
  const [existing] = await db.execute('SELECT COUNT(*) as n FROM mnq_candles');
  console.log(`Existing rows in mnq_candles: ${existing[0].n}`);

  let totalInserted = 0;
  const summary = [];

  for (const contract of CONTRACTS) {
    console.log(`\nDownloading ${contract.ticker} (${contract.start} → ${contract.end})...`);
    try {
      const bars = await fetchAllBars(contract.ticker, contract.start, contract.end);
      const inserted = await insertBars(db, bars);
      totalInserted += inserted;
      summary.push({ ticker: contract.ticker, bars: bars.length, inserted });
    } catch (err) {
      console.error(`  ERROR for ${contract.ticker}: ${err.message}`);
      summary.push({ ticker: contract.ticker, bars: 0, inserted: 0, error: err.message });
    }
  }

  // Final count
  const [final] = await db.execute('SELECT COUNT(*) as n, MIN(session_end_date) as earliest, MAX(session_end_date) as latest FROM mnq_candles');
  console.log('\n=== Download Complete ===');
  console.log(`Total rows in mnq_candles: ${final[0].n}`);
  console.log(`Date range: ${final[0].earliest} → ${final[0].latest}`);
  console.log('\nSummary:');
  for (const s of summary) {
    console.log(`  ${s.ticker}: ${s.bars} fetched, ${s.inserted} inserted${s.error ? ' ERROR: ' + s.error : ''}`);
  }

  await db.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
