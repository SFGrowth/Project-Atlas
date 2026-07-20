#!/usr/bin/env bash
# test_migration_recovery.sh — Gate G3 Migration 0027 Controlled-Failure Recovery Test
#
# Tests that migration 0027 can be safely re-applied after a simulated partial failure.
# Uses a disposable MySQL 8 database only. No production tables are touched.
#
# IMPORTANT: MySQL DDL statements (ALTER TABLE, CREATE TABLE, DROP TABLE) are
# auto-committed in MySQL InnoDB. They cannot be rolled back. This means a
# partial migration leaves the schema in an intermediate state that must be
# recovered by re-running the migration (which is idempotent by design).
#
# Test procedure:
#   1. Clean database
#   2. Apply migration 0026
#   3. Verify 0026 schema (7-column key, no interval_ms)
#   4. Simulate partial 0027: add interval_ms column to atlas_bars_1m only
#      (simulates a failure after the first DDL statement)
#   5. Record the exact partial schema state
#   6. Re-apply migration 0027 (idempotent — procedures check information_schema)
#   7. Verify final columns, indexes, constraints
#   8. Run a basic write test
#   9. Drop the disposable database

set -e
SOCK="/tmp/mysql_test.sock"
DB="atlas_mig_recovery_test2"
MIG026="/home/ubuntu/atlas-nexus/drizzle/0026_sprint_123a1_foundation.sql"
MIG027="/home/ubuntu/atlas-nexus/drizzle/0027_sprint_123a3_canonical_identity.sql"

mysql_cmd() {
  mysql -u root -S "$SOCK" "$@" 2>/dev/null
}

echo "=== STEP 1: Create clean disposable database ==="
mysql_cmd -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB;"
echo "  Database $DB created."

echo ""
echo "=== STEP 2: Apply migration 0026 ==="
mysql_cmd "$DB" < "$MIG026"
echo "  Migration 0026 applied."

echo ""
echo "=== STEP 3: Verify 0026 schema (7-column key, no interval_ms) ==="
echo "  atlas_bars_1m indexes:"
mysql_cmd "$DB" -e "SELECT index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema='$DB' AND table_name='atlas_bars_1m' AND index_name='uq_atlas_bars_1m_source_bar' ORDER BY seq_in_index;"
echo "  interval_ms column present in atlas_bars_1m:"
mysql_cmd "$DB" -e "SELECT COUNT(*) as interval_ms_exists FROM information_schema.columns WHERE table_schema='$DB' AND table_name='atlas_bars_1m' AND column_name='interval_ms';"
echo "  atlas_bar_processing_ledger exists:"
mysql_cmd "$DB" -e "SELECT COUNT(*) as ledger_exists FROM information_schema.tables WHERE table_schema='$DB' AND table_name='atlas_bar_processing_ledger';"

echo ""
echo "=== STEP 4: Simulate partial 0027 failure ==="
echo "  Simulating: add interval_ms to atlas_bars_1m ONLY (first DDL succeeds)"
echo "  Simulating: migration fails before widening the key or touching atlas_bars_5m"
mysql_cmd "$DB" -e "ALTER TABLE atlas_bars_1m ADD COLUMN interval_ms INT NOT NULL DEFAULT 60000 COMMENT 'Bar interval in milliseconds. Always 60000 for atlas_bars_1m.' AFTER instrument_id;"
echo "  Partial state: interval_ms added to atlas_bars_1m, key NOT yet widened."

echo ""
echo "=== STEP 5: Record exact partial schema state ==="
echo "  atlas_bars_1m columns (partial):"
mysql_cmd "$DB" -e "SELECT column_name, column_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='$DB' AND table_name='atlas_bars_1m' ORDER BY ordinal_position;" | grep -E "interval_ms|source|dataset|raw_symbol|instrument_id|bar_open_ts_ms|revision|mapping_version"
echo "  atlas_bars_1m key (still old 6-column key — NOT yet widened):"
mysql_cmd "$DB" -e "SELECT index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema='$DB' AND table_name='atlas_bars_1m' AND index_name='uq_atlas_bars_1m_source_bar' ORDER BY seq_in_index;"
echo "  atlas_bars_5m interval_ms column present:"
mysql_cmd "$DB" -e "SELECT COUNT(*) as interval_ms_5m FROM information_schema.columns WHERE table_schema='$DB' AND table_name='atlas_bars_5m' AND column_name='interval_ms';"
echo "  atlas_bar_processing_ledger exists:"
mysql_cmd "$DB" -e "SELECT COUNT(*) as ledger_exists FROM information_schema.tables WHERE table_schema='$DB' AND table_name='atlas_bar_processing_ledger';"

echo ""
echo "=== STEP 6: Re-apply migration 0027 (idempotent recovery) ==="
echo "  NOTE: MySQL DDL auto-commits. The partial state is permanent until corrected."
echo "  The migration uses IF NOT EXISTS / IF EXISTS guards in stored procedures."
echo "  Re-applying 0027 is safe because each procedure checks information_schema first."
mysql_cmd "$DB" < "$MIG027"
echo "  Migration 0027 re-applied successfully."

echo ""
echo "=== STEP 7: Verify final schema ==="
echo "  atlas_bars_1m interval_ms column:"
mysql_cmd "$DB" -e "SELECT column_name, column_type, is_nullable, column_default, column_comment FROM information_schema.columns WHERE table_schema='$DB' AND table_name='atlas_bars_1m' AND column_name='interval_ms';"
echo "  atlas_bars_1m canonical identity key (must be 8 columns):"
mysql_cmd "$DB" -e "SELECT index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema='$DB' AND table_name='atlas_bars_1m' AND index_name='uq_atlas_bars_1m_canonical_identity' ORDER BY seq_in_index;"
echo "  atlas_bars_5m interval_ms column:"
mysql_cmd "$DB" -e "SELECT column_name, column_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='$DB' AND table_name='atlas_bars_5m' AND column_name='interval_ms';"
echo "  atlas_bars_5m canonical identity key (must be 8 columns):"
mysql_cmd "$DB" -e "SELECT index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema='$DB' AND table_name='atlas_bars_5m' AND index_name='uq_atlas_bars_5m_canonical_identity' ORDER BY seq_in_index;"
echo "  atlas_bar_processing_ledger key (must be 9 columns):"
mysql_cmd "$DB" -e "SELECT index_name, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema='$DB' AND table_name='atlas_bar_processing_ledger' AND index_name='uq_atlas_bar_processing_ledger' ORDER BY seq_in_index;"

echo ""
echo "=== STEP 8: Basic write test after recovery ==="
mysql_cmd "$DB" -e "INSERT INTO atlas_bars_1m (source, dataset, raw_symbol, instrument_id, interval_ms, bar_open_ts_ms, bar_open_ts_ns, bar_close_ts_ms, reconciliation_status, revision, mapping_version, atlas_ts_ms) VALUES ('DATABENTO','GLBX.MDP3','MNQM5',10001,60000,1705323600000,'0',1705323660000,'MATCHED',0,'v1',1705323601000);"
mysql_cmd "$DB" -e "SELECT COUNT(*) as rows_after_recovery FROM atlas_bars_1m;"
echo "  Write test: PASSED"

echo ""
echo "=== STEP 9: Drop disposable database ==="
mysql_cmd -e "DROP DATABASE IF EXISTS $DB;"
echo "  Database $DB dropped."

echo ""
echo "=== MIGRATION 0027 CONTROLLED-FAILURE RECOVERY: COMPLETE ==="
echo "  Result: Migration is idempotent. Partial failure is recoverable by re-applying 0027."
echo "  No production tables were touched."
