import mysql from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Investigate out-of-range prices (close > 30000)
console.log('=== Out-of-range prices (close > 30000) ===');
const [oor] = await conn.execute(`
  SELECT ticker, COUNT(*) AS cnt, MIN(close) AS min_close, MAX(close) AS max_close,
    MIN(session_end_date) AS first_date, MAX(session_end_date) AS last_date
  FROM mnq_candles
  WHERE close > 30000
  GROUP BY ticker
  ORDER BY MIN(session_end_date)
`);
for (const r of oor) {
  console.log(`  ${r.ticker}: cnt=${r.cnt}, min=${r.min_close}, max=${r.max_close}, ${r.first_date} → ${r.last_date}`);
}

// 2. UNKNOWN gap 1: MNQH5 2025-01-10 07:55→08:05 ET (10min gap at 6ET)
console.log('\n=== UNKNOWN gap 1: MNQH5 2025-01-10 07:55→08:05 ET (10min gap) ===');
const [g1] = await conn.execute(`
  SELECT bar_time_et, session, close
  FROM mnq_candles
  WHERE ticker = 'MNQH5' AND session_end_date = '2025-01-10'
  ORDER BY window_start
  LIMIT 20
`);
for (const r of g1) console.log(`  ${r.bar_time_et}  ${r.session}  ${r.close}`);

// 3. UNKNOWN gap 2: MNQM5 2025-06-19 12:55→18:00 ET (305min)
// June 19, 2025 = Juneteenth (federal holiday)
console.log('\n=== UNKNOWN gap 2: MNQM5 2025-06-19 12:55→18:00 ET (305min) ===');
console.log('  NOTE: June 19 = Juneteenth (federal holiday) — early close expected');
const [g2] = await conn.execute(`
  SELECT bar_time_et, session, close
  FROM mnq_candles
  WHERE ticker = 'MNQM5' AND session_end_date = '2025-06-19'
  ORDER BY window_start
`);
for (const r of g2) console.log(`  ${r.bar_time_et}  ${r.session}  ${r.close}`);

// 4. UNKNOWN gap 3: MNQU5 2025-07-03 13:10→18:00 ET (290min)
// July 3, 2025 = Day before Independence Day — early close 1PM ET
console.log('\n=== UNKNOWN gap 3: MNQU5 2025-07-03 13:10→18:00 ET (290min) ===');
console.log('  NOTE: July 3 = Day before Independence Day — early close 1PM ET expected');
const [g3] = await conn.execute(`
  SELECT bar_time_et, session, close
  FROM mnq_candles
  WHERE ticker = 'MNQU5' AND session_end_date = '2025-07-03'
  ORDER BY window_start
`);
for (const r of g3) console.log(`  ${r.bar_time_et}  ${r.session}  ${r.close}`);

// 5. UNKNOWN gap 4: MNQU5 2025-09-08 18:35→2025-09-09 12:55 ET (1100min)
// Sept 8 = Labor Day eve? Sept 1 = Labor Day 2025. Sept 8 is a Monday.
// 1100 min = 18.3 hours — this is a large gap on a Monday
console.log('\n=== UNKNOWN gap 4: MNQU5 2025-09-08 18:35→2025-09-09 12:55 ET (1100min) ===');
console.log('  NOTE: 2025-09-01 = Labor Day. Sept 8 is a regular Monday.');
console.log('  1100 min = 18.3 hours. This spans overnight into Tuesday morning.');
const [g4] = await conn.execute(`
  SELECT bar_time_et, session, session_end_date, close
  FROM mnq_candles
  WHERE ticker = 'MNQU5' AND session_end_date IN ('2025-09-08', '2025-09-09')
  ORDER BY window_start
`);
for (const r of g4) console.log(`  ${r.bar_time_et}  ${r.session_end_date}  ${r.session}  ${r.close}`);

// Also check what's around Sept 8-9 2025
console.log('\n  Context: bars around 2025-09-07 to 2025-09-10:');
const [g4ctx] = await conn.execute(`
  SELECT bar_time_et, session, session_end_date, close
  FROM mnq_candles
  WHERE ticker = 'MNQU5' AND session_end_date BETWEEN '2025-09-07' AND '2025-09-10'
  ORDER BY window_start
  LIMIT 30
`);
for (const r of g4ctx) console.log(`  ${r.bar_time_et}  ${r.session_end_date}  ${r.session}  ${r.close}`);

// 6. Check the 6 PROVIDER_MISSING gaps
console.log('\n=== PROVIDER_MISSING gaps (6 total) ===');
// These are gaps > 10min during trading hours that are not holidays/weekends/maintenance
// Let me find them by looking at large gaps during RTH
for (const ticker of ['MNQU4', 'MNQZ4', 'MNQH5', 'MNQM5', 'MNQU5', 'MNQZ5', 'MNQH6', 'MNQM6']) {
  const [bars] = await conn.execute(`
    SELECT window_start, bar_time_et, session, session_end_date
    FROM mnq_candles
    WHERE ticker = ?
    ORDER BY window_start
  `, [ticker]);

  const FIVE_MIN_NS = 300_000_000_000n;
  for (let i = 1; i < bars.length; i++) {
    const prevTs = BigInt(bars[i-1].window_start);
    const currTs = BigInt(bars[i].window_start);
    const gapNs = currTs - prevTs;
    if (gapNs <= FIVE_MIN_NS) continue;

    const gapMin = Number(gapNs / 60_000_000_000n);
    const prevDt = new Date(Number(prevTs / 1_000_000n));
    const prevHour = parseInt(prevDt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    const prevDay = prevDt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const prevDow = prevDt.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });

    // Only show gaps that aren't obvious maintenance or weekend
    const isMaintenance = (prevHour === 16 && gapMin >= 55 && gapMin <= 75) || (gapMin >= 55 && gapMin <= 75);
    const isWeekend = prevDow === 'Fri' || prevDow === 'Sat';
    const isHoliday = ['2024-07-04','2024-09-02','2024-11-28','2024-12-25','2025-01-01','2025-01-09',
      '2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-07-04','2025-09-01',
      '2025-11-27','2025-12-25','2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25'].includes(prevDay);

    if (!isMaintenance && !isWeekend && !isHoliday && gapMin > 10 && gapMin < 55) {
      console.log(`  ${ticker}: ${bars[i-1].bar_time_et} → ${bars[i].bar_time_et} | gap=${gapMin}min | prevHour=${prevHour}ET | prevDay=${prevDay} (${prevDow})`);
    }
  }
}

await conn.end();
console.log('\nInvestigation complete.');
