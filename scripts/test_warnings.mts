import * as mysql from 'mysql2/promise';

const pool = mysql.createPool({
  socketPath: '/tmp/mysql_test.sock',
  user: 'root',
  database: 'atlas_test_123a3',
  connectionLimit: 1,
});

const conn = await pool.getConnection();
await conn.execute('DELETE FROM atlas_bars_1m');

// Clean insert
await conn.execute(
  `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
   VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,1705323600000,'0',1705323660000,'MATCHED',0,'v1',1705323600001)`,
);
const [w1] = await conn.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
console.log('After clean insert:', JSON.stringify(w1));

// Duplicate (will throw)
try {
  await conn.execute(
    `INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, bar_open_ts_ms, bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms)
     VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,1705323600000,'0',1705323660000,'MATCHED',0,'v1',1705323600001)`,
  );
} catch (e: any) {
  console.log('Caught:', e.code, e.errno);
}
const [w2] = await conn.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
console.log('After duplicate (caught):', JSON.stringify(w2));

conn.release();
await pool.end();
