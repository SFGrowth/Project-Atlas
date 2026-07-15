#!/usr/bin/env node
/**
 * ATLAS CANONICAL DATASET VERIFICATION SCRIPT
 * Dataset: ATLAS-MNQ-5M-V1 v1.0
 *
 * Verifies the mnq_candles table matches the canonical dataset by:
 *   1. Checking row count (expected: 136,198)
 *   2. Checking date range (expected: 2024-07-15 → 2026-06-18 UTC)
 *   3. Computing SHA-256 checksum and comparing to canonical value
 *
 * Usage:
 *   cd /home/ubuntu/atlas-nexus
 *   node /home/ubuntu/Project-Atlas/data/verify.mjs
 *
 * Exit codes:
 *   0 = PASS (all checks pass)
 *   1 = FAIL (one or more checks failed)
 */

import mysql from 'mysql2/promise';
import { createHash } from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('dotenv').config({ path: '/home/ubuntu/atlas-nexus/.env' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set.');
  process.exit(1);
}

// Canonical values
const CANONICAL = {
  dataset_id: 'ATLAS-MNQ-5M-V1',
  version: 'v1.0',
  row_count: 136198,
  checksum: '663893c56e6e6001f937f7e11ed76bd4238e21f387fd7a9de9dcf8ea44df06ff',
  date_start_utc: '2024-07-15T00:00:00.000Z',
  date_end_utc: '2026-06-18T13:25:00.000Z',
};

const conn = await mysql.createConnection(DATABASE_URL);
console.log('ATLAS CANONICAL DATASET VERIFICATION');
console.log('Dataset: ATLAS-MNQ-5M-V1 v1.0');
console.log('─────────────────────────────────────\n');

let allPass = true;

// Check 1: Row count
const [countResult] = await conn.execute('SELECT COUNT(*) AS cnt FROM mnq_candles');
const rowCount = Number(countResult[0].cnt);
const countPass = rowCount === CANONICAL.row_count;
allPass = allPass && countPass;
console.log(`[${countPass ? 'PASS' : 'FAIL'}] Row count: ${rowCount.toLocaleString()} (expected: ${CANONICAL.row_count.toLocaleString()})`);

// Check 2: Date range
const [rangeResult] = await conn.execute(`
  SELECT
    FROM_UNIXTIME(MIN(window_start)/1000000000) AS date_start,
    FROM_UNIXTIME(MAX(window_start)/1000000000) AS date_end
  FROM mnq_candles
`);
const dateStartActual = new Date(rangeResult[0].date_start).toISOString();
const dateEndActual = new Date(rangeResult[0].date_end).toISOString();
const dateStartPass = dateStartActual === CANONICAL.date_start_utc;
const dateEndPass = dateEndActual === CANONICAL.date_end_utc;
allPass = allPass && dateStartPass && dateEndPass;
console.log(`[${dateStartPass ? 'PASS' : 'FAIL'}] Date start: ${dateStartActual} (expected: ${CANONICAL.date_start_utc})`);
console.log(`[${dateEndPass ? 'PASS' : 'FAIL'}] Date end:   ${dateEndActual} (expected: ${CANONICAL.date_end_utc})`);

// Check 3: Checksum
console.log('\nComputing SHA-256 checksum (may take 30-60 seconds)...');
const [rows] = await conn.execute(`
  SELECT window_start, close
  FROM mnq_candles
  ORDER BY window_start, ticker
`);
const hash = createHash('sha256');
for (const row of rows) {
  hash.update(`${row.window_start}:${row.close}\n`);
}
const checksum = hash.digest('hex');
const checksumPass = checksum === CANONICAL.checksum;
allPass = allPass && checksumPass;
console.log(`[${checksumPass ? 'PASS' : 'FAIL'}] Checksum: ${checksum}`);
if (!checksumPass) {
  console.log(`         Expected: ${CANONICAL.checksum}`);
}

// Summary
console.log('\n─────────────────────────────────────');
if (allPass) {
  console.log('RESULT: PASS — Dataset matches canonical ATLAS-MNQ-5M-V1 v1.0');
  console.log('Safe to use for backtests. Cite dataset_id = ATLAS-MNQ-5M-V1, version = v1.0');
} else {
  console.log('RESULT: FAIL — Dataset does NOT match canonical values');
  console.log('Do NOT use for backtests until discrepancies are resolved.');
  console.log('Run recovery.mjs to rebuild the dataset from Massive.com API.');
}

await conn.end();
process.exit(allPass ? 0 : 1);
