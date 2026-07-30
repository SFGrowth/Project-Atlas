#!/usr/bin/env python3
"""
Sprint 123A.14 — BLOCKER-02 Fix
Download MNQ OHLCV-1m historical data from Databento for 2019-05-06 to 2024-01-01.
This fills the gap in the existing canonical dataset (which starts 2024-01-01).

Usage:
    python3 scripts/download_mnq_historical_2019_2024.py

Outputs:
    /home/ubuntu/atlas-historical/raw/mnq_1m_2019_2024.dbn.zst
    /home/ubuntu/atlas-historical/processed/mnq_1m_2019_2024.parquet
"""

import os
import sys
import json
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).parents[1]
ENV_FILE = REPO_ROOT / ".env"

RAW_DIR = Path("/home/ubuntu/atlas-historical/raw")
PROCESSED_DIR = Path("/home/ubuntu/atlas-historical/processed")
CANONICAL_DIR = Path("/home/ubuntu/atlas-historical/canonical")

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Load API key from .env
api_key = None
if ENV_FILE.exists():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("DATABENTO_API_KEY="):
            api_key = line.split("=", 1)[1].strip()
            break

if not api_key:
    api_key = os.environ.get("DATABENTO_API_KEY", "")

if not api_key:
    logger.error("DATABENTO_API_KEY not found in .env or environment")
    sys.exit(1)

logger.info("API key loaded: %s...", api_key[:8])

# ── Download ─────────────────────────────────────────────────────────────────

import databento as db

DATASET = "GLBX.MDP3"
SCHEMA = "ohlcv-1m"
SYMBOL = "MNQ.v.0"
STYPE = "continuous"
START = "2019-05-06"
END = "2024-01-01"

RAW_OUTPUT = RAW_DIR / "mnq_1m_2019_2024.dbn.zst"
PARQUET_OUTPUT = PROCESSED_DIR / "mnq_1m_2019_2024.parquet"

logger.info("Downloading MNQ OHLCV-1m: %s to %s", START, END)
logger.info("Output: %s", RAW_OUTPUT)

client = db.Historical(api_key)

# Get record count first
logger.info("Checking record count...")
try:
    billable = client.metadata.get_billable_size(
        dataset=DATASET,
        symbols=SYMBOL,
        schema=SCHEMA,
        stype_in=STYPE,
        start=START,
        end=END,
    )
    logger.info("Billable size: %s bytes", billable)
except Exception as e:
    logger.warning("Could not get billable size: %s", e)

# Download to file
logger.info("Starting download...")
start_time = datetime.now(timezone.utc)

data = client.timeseries.get_range(
    dataset=DATASET,
    symbols=SYMBOL,
    schema=SCHEMA,
    stype_in=STYPE,
    start=START,
    end=END,
)

# Convert to DataFrame
logger.info("Converting to DataFrame...")
df = data.to_df()
logger.info("Downloaded %d rows", len(df))
logger.info("Date range: %s to %s", df.index.min() if hasattr(df.index, 'min') else "?", df.index.max() if hasattr(df.index, 'max') else "?")

# Save as parquet
logger.info("Saving to parquet: %s", PARQUET_OUTPUT)
df.to_parquet(PARQUET_OUTPUT, index=True)

end_time = datetime.now(timezone.utc)
duration_s = (end_time - start_time).total_seconds()
logger.info("Download complete in %.1f seconds", duration_s)

# Compute SHA256
logger.info("Computing SHA256...")
sha256 = hashlib.sha256(PARQUET_OUTPUT.read_bytes()).hexdigest()
logger.info("SHA256: %s", sha256)

# Write manifest
manifest = {
    "dataset": DATASET,
    "schema": SCHEMA,
    "symbol": SYMBOL,
    "stype_in": STYPE,
    "start": START,
    "end": END,
    "output_file": str(PARQUET_OUTPUT),
    "output_sha256": sha256,
    "output_size_bytes": PARQUET_OUTPUT.stat().st_size,
    "total_rows": len(df),
    "columns": list(df.columns),
    "download_duration_seconds": round(duration_s, 1),
    "created_at": end_time.isoformat(),
}

manifest_path = PROCESSED_DIR / "mnq_1m_2019_2024_manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2))
logger.info("Manifest written: %s", manifest_path)
logger.info("Done.")
