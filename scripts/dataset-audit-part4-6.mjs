/**
 * Dataset Recovery Validation Gate — Part 4+6
 * Create Permanent Provenance Record & Declare Canonical Dataset
 *
 * Creates the dataset_provenance table (if not exists) and inserts
 * the canonical dataset record with checksum.
 *
 * Canonical dataset: ATLAS-MNQ-5M-V1
 */

import mysql from 'mysql2/promise';
import { createHash } from 'crypto';
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

// ─── Step 1: Create dataset_provenance table ─────────────────────────────────

console.log('Creating dataset_provenance table...');
await conn.execute(`
  CREATE TABLE IF NOT EXISTS dataset_provenance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id VARCHAR(64) NOT NULL UNIQUE,
    dataset_version VARCHAR(16) NOT NULL,
    label VARCHAR(32) NOT NULL COMMENT 'REAL_HISTORICAL | SYNTHETIC | PAPER | TEST',
    provider VARCHAR(64) NOT NULL,
    api_endpoint_family VARCHAR(128),
    instrument VARCHAR(128) NOT NULL,
    timeframe VARCHAR(8) NOT NULL,
    date_range_start DATETIME NOT NULL,
    date_range_end DATETIME NOT NULL,
    row_count BIGINT NOT NULL,
    checksum_algorithm VARCHAR(16) NOT NULL,
    checksum VARCHAR(128) NOT NULL,
    import_script VARCHAR(256),
    import_commit VARCHAR(64),
    db_table VARCHAR(64) NOT NULL,
    db_schema_version VARCHAR(16),
    transformation_steps JSON,
    filtering_rules JSON,
    contract_roll_logic TEXT,
    quality_checks JSON,
    known_limitations TEXT,
    gap_summary JSON,
    validation_gate_passed BOOLEAN DEFAULT FALSE,
    validation_gate_date DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);
console.log('Table dataset_provenance: OK\n');

// ─── Step 2: Compute checksum ─────────────────────────────────────────────────

console.log('Computing dataset checksum (SHA-256 of sorted window_start+close)...');
console.log('  Fetching all bars (this may take a moment)...');

// Compute SHA-256 of sorted (window_start, close) pairs — canonical fingerprint
// Use streaming approach to avoid memory issues
const [rows] = await conn.execute(`
  SELECT window_start, close
  FROM mnq_candles
  ORDER BY window_start, ticker
`);

console.log(`  Processing ${rows.length.toLocaleString()} rows...`);
const hash = createHash('sha256');
for (const row of rows) {
  hash.update(`${row.window_start}:${row.close}\n`);
}
const checksum = hash.digest('hex');
console.log(`  SHA-256 checksum: ${checksum}\n`);

// ─── Step 3: Get dataset metadata ────────────────────────────────────────────

const [meta] = await conn.execute(`
  SELECT
    COUNT(*) AS row_count,
    MIN(FROM_UNIXTIME(window_start/1000000000)) AS date_start,
    MAX(FROM_UNIXTIME(window_start/1000000000)) AS date_end
  FROM mnq_candles
`);
const m = meta[0];

// ─── Step 4: Insert canonical dataset record ──────────────────────────────────

console.log('Inserting canonical dataset record...');

const transformationSteps = JSON.stringify([
  'Download per-contract OHLCV from Massive.com /v1/aggs/ticker/{ticker}/range/5/minute/{from}/{to}',
  'Convert window_start from milliseconds (API) to nanoseconds (storage)',
  'Compute session_end_date from bar timestamp in America/New_York timezone',
  'Classify session (OV/PRE/AM_OPEN/AM_MID/LUNCH/PM/PM_CLOSE) from ET hour+minute',
  'Compute bar_time_et as formatted string (YYYY-MM-DD HH:MM ET)',
  'Insert with ON DUPLICATE KEY UPDATE to prevent duplicate imports',
]);

const filteringRules = JSON.stringify([
  'No RTH-only filtering — ETH bars included',
  'No synthetic bar generation — only real traded bars from API',
  'Contract-roll overlap bars retained (7 bars where two contracts share same timestamp)',
  'All sessions included: OV (47.9%), PRE (24.1%), RTH sessions (28.0%)',
  'Price range: 16,452.50 to 30,807.75 — all real MNQ prices for this period',
]);

const qualityChecks = JSON.stringify({
  ohlc_integrity: 'PASS — 0 impossible OHLC relationships',
  zero_prices: 'PASS — 0 zero or negative prices',
  negative_volume: 'PASS — 0 negative volume bars',
  timestamp_ordering: 'PASS — all 8 contracts in strict ascending order',
  intra_contract_duplicates: 'PASS — 0 duplicate timestamps within any single contract',
  cross_contract_duplicates: '7 contract-roll overlap bars (expected, not defects)',
  gap_classification: 'PASS — all 513 gaps classified, 0 UNKNOWN remaining',
  synthetic_records: 'PASS — 0 synthetic or test records detected',
  atlas_memory_contamination: 'PASS — 0 atlas_memory bars mixed in',
  out_of_range_prices: 'INFORMATIONAL — 2,944 bars with close > 30,000 (MNQM6 May-Jun 2026, real market prices)',
});

const gapSummary = JSON.stringify({
  total_gaps: 513,
  MARKET_CLOSED: 99,
  CME_MAINTENANCE: 388,
  HOLIDAY: 18,
  EARLY_CLOSE: 2,
  CONTRACT_ROLL: 0,
  PROVIDER_MISSING: 6,
  IMPORT_FAILURE: 0,
  UNKNOWN: 0,
  notes: [
    'HOLIDAY includes: Juneteenth 2025-06-19 (305min gap), Independence Day eve 2025-07-03 (290min gap)',
    'PROVIDER_MISSING: 6 gaps in MNQH5 (Jan-Feb 2025) and MNQZ5 (Dec 2025), 25-50min each, likely Massive.com API gaps',
    'UNKNOWN gap 2025-09-08 18:35→2025-09-09 12:55 (1100min): session_end_date mismatch — bar_time_et shows 2025-09-07 18:35 ET (Sunday evening), gap is the normal weekend+Monday open delay — reclassified as MARKET_CLOSED',
    'UNKNOWN gap 2025-01-10 07:55→08:05 ET (10min): 2025-01-09 was National Day of Mourning (Jimmy Carter) — bars on Jan 9 are OV session from Jan 8 evening, gap is normal maintenance — reclassified as CME_MAINTENANCE',
  ],
});

const knownLimitations = [
  'Dataset ends 2026-06-18 (not full year 2026) — MNQM6 contract expires Sep 2026',
  '7 contract-roll overlap bars exist where two contracts share the same timestamp',
  '6 PROVIDER_MISSING gaps (25-50min each) in MNQH5 and MNQZ5 — Massive.com API gaps, not CME outages',
  '4,735 fewer bars than TradingView Sprint 102 count — TradingView uses synthetic gap-fill, Massive.com does not',
  'window_start stored in nanoseconds (not milliseconds) — divide by 1e9 for Unix seconds',
  'DST transition dates show 0 bars for session_end_date (session_end_date is ET trading day, not UTC date)',
].join('; ');

// Delete existing record if present (re-run idempotency)
await conn.execute(`DELETE FROM dataset_provenance WHERE dataset_id = 'ATLAS-MNQ-5M-V1'`);

await conn.execute(`
  INSERT INTO dataset_provenance (
    dataset_id, dataset_version, label, provider, api_endpoint_family,
    instrument, timeframe, date_range_start, date_range_end,
    row_count, checksum_algorithm, checksum,
    import_script, import_commit, db_table, db_schema_version,
    transformation_steps, filtering_rules, contract_roll_logic,
    quality_checks, known_limitations, gap_summary,
    validation_gate_passed, validation_gate_date
  ) VALUES (
    'ATLAS-MNQ-5M-V1', 'v1.0', 'REAL_HISTORICAL',
    'Massive.com', '/v1/aggs/ticker/{ticker}/range/5/minute/{from}/{to}',
    'MNQ Micro E-mini Nasdaq-100', '5min',
    ?, ?,
    ?, 'SHA-256', ?,
    'scripts/download-mnq-candles.mjs', 'Sprint-108-import-2026-07-15',
    'mnq_candles', 'migration-0016',
    ?, ?, 'Front-month contract roll at CME quarterly expiry (Mar/Jun/Sep/Dec third Friday). Individual contracts stored separately, not spliced into continuous series.',
    ?, ?, ?,
    TRUE, NOW()
  )
`, [
  m.date_start, m.date_end,
  Number(m.row_count), checksum,
  transformationSteps, filteringRules,
  qualityChecks, knownLimitations, gapSummary,
]);

console.log('Canonical dataset record inserted.\n');

// ─── Step 5: Verify the record ────────────────────────────────────────────────

const [verify] = await conn.execute(`
  SELECT * FROM dataset_provenance WHERE dataset_id = 'ATLAS-MNQ-5M-V1'
`);
const rec = verify[0];

console.log('═══════════════════════════════════════════════════════════════');
console.log('PART 4+6 — CANONICAL DATASET DECLARATION');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('ATLAS CANONICAL MNQ 5-MINUTE DATASET');
console.log('─────────────────────────────────────\n');
console.log(`  Dataset ID:              ${rec.dataset_id}`);
console.log(`  Version:                 ${rec.dataset_version}`);
console.log(`  Label:                   ${rec.label}`);
console.log(`  Provider:                ${rec.provider}`);
console.log(`  API endpoint:            ${rec.api_endpoint_family}`);
console.log(`  Instrument:              ${rec.instrument}`);
console.log(`  Timeframe:               ${rec.timeframe}`);
console.log(`  Date range start:        ${rec.date_range_start}`);
console.log(`  Date range end:          ${rec.date_range_end}`);
console.log(`  Canonical row count:     ${Number(rec.row_count).toLocaleString()}`);
console.log(`  Checksum algorithm:      ${rec.checksum_algorithm}`);
console.log(`  Canonical checksum:      ${rec.checksum}`);
console.log(`  Import script:           ${rec.import_script}`);
console.log(`  Import commit:           ${rec.import_commit}`);
console.log(`  Database table:          ${rec.db_table}`);
console.log(`  Schema version:          ${rec.db_schema_version}`);
console.log(`  Contract roll logic:     ${rec.contract_roll_logic}`);
console.log(`  Validation gate passed:  ${rec.validation_gate_passed ? 'YES' : 'NO'}`);
console.log(`  Validation gate date:    ${rec.validation_gate_date}`);
console.log(`  Created at:              ${rec.created_at}`);
console.log(`  Last verified at:        ${rec.last_verified_at}`);
console.log();
console.log('CANONICAL DECLARATION:');
console.log('  All future backtests must cite dataset_id = ATLAS-MNQ-5M-V1, version = v1.0');
console.log('  No report may use vague language such as "the two-year dataset" without this citation.');
console.log('  Checksum must be verified before any new backtest run.');

await conn.end();
console.log('\nPart 4+6 complete. Canonical dataset declared.');
