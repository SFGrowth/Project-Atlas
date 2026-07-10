"""
Atlas Nexus — Database Migration Script
Sprint 075: Add idempotency_key, pipeline_run_id, chart_id, ingestion_latency_ms columns
and new tables: integrity_violations, rejected_payloads
"""
import sqlite3
import os

DB_PATH = os.environ.get("ATLAS_DB_PATH", "atlas_nexus.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get existing columns in pipeline_reports
    existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(pipeline_reports)").fetchall()}
    print(f"Existing columns: {existing_cols}")

    # Add missing columns
    new_cols = {
        "idempotency_key": "TEXT",
        "pipeline_run_id": "TEXT",
        "chart_id": "TEXT",
        "ingestion_latency_ms": "INTEGER",
    }
    for col, col_type in new_cols.items():
        if col not in existing_cols:
            cursor.execute(f"ALTER TABLE pipeline_reports ADD COLUMN {col} {col_type}")
            print(f"Added column: {col}")
        else:
            print(f"Column already exists: {col}")

    # Populate idempotency_key for existing rows (use id as fallback)
    cursor.execute(
        "UPDATE pipeline_reports SET idempotency_key = id WHERE idempotency_key IS NULL"
    )
    print(f"Backfilled idempotency_key for {cursor.rowcount} rows")

    # Create new tables
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS integrity_violations (
            id           TEXT PRIMARY KEY,
            occurred_at  TEXT NOT NULL,
            violation    TEXT NOT NULL,
            detail       TEXT
        );

        CREATE TABLE IF NOT EXISTS rejected_payloads (
            id           TEXT PRIMARY KEY,
            received_at  TEXT NOT NULL,
            rejection_code TEXT NOT NULL,
            detail       TEXT,
            source_ip    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_idempotency_key  ON pipeline_reports(idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_pipeline_run_id  ON pipeline_reports(pipeline_run_id);
    """)
    print("Created new tables and indexes")

    conn.commit()
    conn.close()
    print("Migration complete")

if __name__ == "__main__":
    migrate()
