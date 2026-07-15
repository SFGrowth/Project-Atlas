#!/usr/bin/env node
/**
 * ATLAS CANONICAL DATASET RECOVERY SCRIPT
 * Dataset: ATLAS-MNQ-5M-V1 v1.0
 *
 * This script re-downloads the canonical MNQ 5-minute dataset from Massive.com
 * and rebuilds the mnq_candles table from scratch.
 *
 * Usage:
 *   cd /home/ubuntu/atlas-nexus
 *   node /home/ubuntu/Project-Atlas/data/recovery.mjs
 *
 * Prerequisites:
 *   - DATABASE_URL environment variable set (or .env file in atlas-nexus/)
 *   - MASSIVE_API_KEY environment variable set (or .env file in atlas-nexus/)
 *   - mnq_candles table exists (migration-0016 applied)
 *
 * After recovery, run verify.mjs to confirm the checksum matches.
 *
 * CANONICAL DATASET FACTS:
 *   Dataset ID:    ATLAS-MNQ-5M-V1
 *   Version:       v1.0
 *   Row count:     136,198
 *   Date range:    2024-07-15 → 2026-06-18 UTC
 *   Checksum:      663893c56e6e6001f937f7e11ed76bd4238e21f387fd7a9de9dcf8ea44df06ff
 */

import mysql from 'mysql2/promise';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load .env from atlas-nexus project
require('dotenv').config({ path: '/home/ubuntu/atlas-nexus/.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set. Set it in /home/ubuntu/atlas-nexus/.env');
  process.exit(1);
}
if (!MASSIVE_API_KEY) {
  console.error('ERROR: MASSIVE_API_KEY not set. Set it in /home/ubuntu/atlas-nexus/.env or as env var.');
  process.exit(1);
}

// Contract definitions — canonical quarterly contracts
const CONTRACTS = [
  { ticker: 'MNQU4', from: '2024-07-01', to: '2024-09-21' },
  { ticker: 'MNQZ4', from: '2024-09-20', to: '2024-12-21' },
  { ticker: 'MNQH5', from: '2024-12-20', to: '2025-03-22' },
  { ticker: 'MNQM5', from: '2025-03-21', to: '2025-06-21' },
  { ticker: 'MNQU5', from: '2025-06-20', to: '2025-09-20' },
  { ticker: 'MNQZ5', from: '2025-09-19', to: '2025-12-20' },
  { ticker: 'MNQH6', from: '2025-12-19', to: '2026-03-21' },
  { ticker: 'MNQM6', from: '2026-03-20', to: '2026-06-19' },
];

const SESSION_LABELS = {
  OV: (h, m) => (h >= 20 || h < 4),
  PRE: (h, m) => (h >= 4 && h < 9) || (h === 9 && m < 30),
  AM_OPEN: (h, m) => (h === 9 && m >= 30) || (h === 10 && m < 30),
  AM_MID: (h, m) => (h >= 10 && h < 12) && !(h === 10 && m < 30),
  LUNCH: (h, m) => (h >= 12 && h < 13),
  PM: (h, m) => (h >= 13 && h < 15) || (h === 15 && m < 30),
  PM_CLOSE: (h, m) => (h === 15 && m >= 30) || (h === 16 && m < 1),
};

function getSession(barTimeEt) {
  const match = barTimeEt.match(/(\d{2}):(\d{2})/);
  if (!match) return 'OV';
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  for (const [sess, fn] of Object.entries(SESSION_LABELS)) {
    if (fn(h, m)) return sess;
  }
  return 'OV';
}

async function fetchBars(ticker, from, to) {
  const url = `https://api.massive.com/v1/aggs/ticker/${ticker}/range/5/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${MASSIVE_API_KEY}` },
  });
  if (!resp.ok) {
    throw new Error(`Massive.com API error: ${resp.status} ${resp.statusText} for ${ticker}`);
  }
  const data = await resp.json();
  return data.results || [];
}

const conn = await mysql.createConnection(DATABASE_URL);
console.log('Connected to database.');
console.log('Starting canonical dataset recovery...\n');

let totalInserted = 0;
for (const contract of CONTRACTS) {
  console.log(`Downloading ${contract.ticker} (${contract.from} → ${contract.to})...`);
  const bars = await fetchBars(contract.ticker, contract.from, contract.to);
  console.log(`  Fetched ${bars.length} bars`);

  let inserted = 0;
  for (const bar of bars) {
    const windowStartNs = BigInt(bar.t) * 1_000_000n; // ms → ns
    const windowStartMs = bar.t;
    const dt = new Date(windowStartMs);
    const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const barTimeEt = etStr.replace(/(\d+)\/(\d+)\/(\d+),\s*/, '$3-$1-$2 ') + ' ET';
    const session = getSession(barTimeEt);
    // session_end_date: the ET trading day this bar belongs to
    const etDate = dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    await conn.execute(`
      INSERT INTO mnq_candles (ticker, window_start, session_end_date, open, high, low, close, volume, transactions, dollar_volume, bar_time_et, session)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        open = VALUES(open), high = VALUES(high), low = VALUES(low), close = VALUES(close),
        volume = VALUES(volume), transactions = VALUES(transactions), dollar_volume = VALUES(dollar_volume),
        bar_time_et = VALUES(bar_time_et), session = VALUES(session)
    `, [
      contract.ticker,
      windowStartNs.toString(),
      etDate,
      bar.o, bar.h, bar.l, bar.c,
      bar.v || 0,
      bar.n || 0,
      bar.vw ? (bar.vw * bar.v) : null,
      barTimeEt,
      session,
    ]);
    inserted++;
  }
  totalInserted += inserted;
  console.log(`  Inserted/updated ${inserted} bars\n`);
}

console.log(`Recovery complete. Total bars processed: ${totalInserted.toLocaleString()}`);
console.log('\nNext step: Run verify.mjs to confirm checksum matches canonical value.');
console.log('Expected: 663893c56e6e6001f937f7e11ed76bd4238e21f387fd7a9de9dcf8ea44df06ff');

await conn.end();
