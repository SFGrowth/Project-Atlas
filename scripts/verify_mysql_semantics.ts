/**
 * Empirical MySQL driver semantics verification
 * Gate G3 Revision 4 — Sprint 123A.3
 *
 * Tests all 5 insert scenarios and records exact driver response fields.
 * Run: npx tsx scripts/verify_mysql_semantics.ts
 *
 * Actual atlas_bars_1m unique key (7 columns — interval_ms does NOT exist):
 *   uq_atlas_bars_1m_canonical_identity (source, dataset, raw_symbol,
 *     instrument_id, bar_open_ts_ms, revision, mapping_version)
 */
import * as mysql2 from 'mysql2/promise';

const SOCKET = '/tmp/mysql_test.sock';
const DATABASE = 'atlas_test_123a3';

async function run() {
  const pool = mysql2.createPool({
    socketPath: SOCKET,
    user: 'root',
    database: DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    // CLIENT_FOUND_ROWS is NOT set — default behaviour
  });

  // Clean slate
  await pool.execute('TRUNCATE TABLE atlas_bars_1m');

  // Correct column names from DESCRIBE atlas_bars_1m:
  // source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, bar_open_ts_ns,
  // bar_close_ts_ms, open_price_pts100, high_price_pts100, low_price_pts100,
  // close_price_pts100, volume, trade_count, reconciliation_status,
  // revision, mapping_version, atlas_ts_ms
  const INSERT_SQL = `
    INSERT INTO atlas_bars_1m
      (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, bar_open_ts_ns,
       bar_close_ts_ms, open_price_pts100, high_price_pts100, low_price_pts100,
       close_price_pts100, volume, trade_count, reconciliation_status,
       revision, mapping_version, atlas_ts_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id = id
  `;

  // Base values: source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, bar_open_ts_ns,
  //              bar_close_ts_ms, open, high, low, close, volume, trade_count,
  //              reconciliation_status, revision, mapping_version, atlas_ts_ms
  const BASE_VALUES: unknown[] = [
    'databento', 'GLBX.MDP3', 'MNQM5', 10001,
    1700000000000, BigInt('1700000000000000000'), 1700000060000,
    1850000, 1851000, 1849000, 1850500,
    250, 10, 'MATCHED',
    1, 'v1', Date.now(),
  ];

  const results: Record<string, unknown>[] = [];

  async function runInsert(label: string, values: unknown[]) {
    const [result] = await pool.execute(INSERT_SQL, values) as any[];
    const [warnings] = await pool.query('SHOW WARNINGS') as any[];
    const [countResult] = await pool.execute('SELECT COUNT(*) as cnt FROM atlas_bars_1m') as any[];
    const row = {
      scenario: label,
      affectedRows: result.affectedRows,
      changedRows: result.changedRows,
      insertId: result.insertId,
      warningStatus: result.warningStatus,
      warningCount: warnings.length,
      rowCount: countResult[0].cnt,
    };
    results.push(row);
    console.log(`\n=== ${label} ===`);
    console.log(`  affectedRows:  ${result.affectedRows}`);
    console.log(`  changedRows:   ${result.changedRows}`);
    console.log(`  insertId:      ${result.insertId}`);
    console.log(`  warningStatus: ${result.warningStatus}`);
    console.log(`  warningCount:  ${warnings.length}`);
    console.log(`  rowCount:      ${countResult[0].cnt}`);
    return row;
  }

  // A. First insert
  await runInsert('A: first insert', BASE_VALUES);

  // B. Exact duplicate (ON DUPLICATE KEY UPDATE id = id)
  await runInsert('B: exact duplicate', BASE_VALUES);

  // C. CLIENT_FOUND_ROWS documentation
  console.log('\n=== C: CLIENT_FOUND_ROWS flag ===');
  console.log('  CLIENT_FOUND_ROWS is NOT set in connection options.');
  console.log('  Default: affectedRows counts rows actually changed (not just found).');
  console.log('  With CLIENT_FOUND_ROWS: affectedRows would count rows found (matched).');
  console.log('  This pool does NOT set CLIENT_FOUND_ROWS.');

  // D. Non-duplicate new revision
  const valD = [...BASE_VALUES]; valD[14] = 2; // revision=2 (index 14)
  await runInsert('D: new revision (revision=2)', valD);

  // E. Non-duplicate new mapping version
  const valE = [...BASE_VALUES]; valE[15] = 'v2'; // mapping_version='v2' (index 15)
  await runInsert('E: new mapping version (mapping_version=v2)', valE);

  // Summary table
  console.log('\n=== SUMMARY TABLE ===');
  console.log('scenario                                   | affectedRows | changedRows | insertId | warningStatus | rowCount');
  console.log('-------------------------------------------|--------------|-------------|----------|---------------|----------');
  for (const r of results) {
    const s = String(r.scenario).padEnd(42);
    console.log(`${s} | ${String(r.affectedRows).padEnd(12)} | ${String(r.changedRows).padEnd(11)} | ${String(r.insertId).padEnd(8)} | ${String(r.warningStatus).padEnd(13)} | ${r.rowCount}`);
  }

  // Classification rule
  const a = results[0];
  const b = results[1];
  console.log('\n=== CLASSIFICATION RULE (empirically derived) ===');
  console.log(`First insert:    affectedRows=${a.affectedRows} → inserted=true`);
  console.log(`Exact duplicate: affectedRows=${b.affectedRows} → inserted=false (duplicate)`);
  if (Number(a.affectedRows) > 0 && Number(b.affectedRows) === 0) {
    console.log('RULE: affectedRows > 0 → inserted=true; affectedRows === 0 → inserted=false');
    console.log('SAFE: ON DUPLICATE KEY UPDATE id=id returns 0 for exact duplicates with this driver/config.');
  } else if (Number(a.affectedRows) > 0 && Number(b.affectedRows) > 0) {
    console.log('WARNING: affectedRows is non-zero for both insert and duplicate.');
    console.log('RECOMMENDATION: Use ER_DUP_ENTRY catch instead of affectedRows for classification.');
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
