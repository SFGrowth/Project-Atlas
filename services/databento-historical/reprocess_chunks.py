#!/usr/bin/env python3
"""
Re-process the downloaded parquet chunks to preserve the ts_event timestamp.
The original download saved the Databento DataFrame without resetting the index,
so ts_event (the datetime index) was dropped.

This script re-downloads all chunks with reset_index() to preserve ts_event.
Uses the same chunked/resumable approach as the original pipeline.
"""

import databento as db
import pandas as pd
import numpy as np
import json
import hashlib
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

DATA_ROOT = Path("/home/ubuntu/atlas-historical")
RAW_DIR = DATA_ROOT / "raw" / "GLBX.MDP3" / "ohlcv-1m"
MANIFESTS_DIR = DATA_ROOT / "manifests"

API_KEY = os.environ.get("DATABENTO_API_KEY", "")

# Generate monthly chunks from 2024-01-01 to 2026-07-21
def get_monthly_chunks():
    chunks = []
    start = datetime(2024, 1, 1)
    end_limit = datetime(2026, 7, 21)
    
    current = start
    while current <= end_limit:
        # End of month
        if current.month == 12:
            next_month = datetime(current.year + 1, 1, 1)
        else:
            next_month = datetime(current.year, current.month + 1, 1)
        
        chunk_end = min(next_month - timedelta(days=1), end_limit)
        chunks.append((current.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        current = next_month
    
    return chunks


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def download_chunk(client, start_date: str, end_date: str) -> pd.DataFrame:
    """Download one monthly chunk and return DataFrame with ts_event as column."""
    data = client.timeseries.get_range(
        dataset="GLBX.MDP3",
        schema="ohlcv-1m",
        symbols=["MNQ.v.0"],
        stype_in="continuous",
        start=start_date,
        end=end_date,
    )
    
    df = data.to_df()
    # Reset index to make ts_event a column
    df = df.reset_index()
    # Rename ts_event to bar_time for clarity
    if "ts_event" in df.columns:
        df = df.rename(columns={"ts_event": "bar_time"})
    
    # Keep only the columns we need
    keep_cols = ["bar_time", "open", "high", "low", "close", "volume", "symbol", "instrument_id"]
    df = df[[c for c in keep_cols if c in df.columns]]
    
    return df


def main():
    log.info("=" * 70)
    log.info("ATLAS NEXUS — REPROCESS CHUNKS (preserve ts_event)")
    log.info(f"Run time: {datetime.now(timezone.utc).isoformat()}")
    log.info("=" * 70)
    
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)
    
    client = db.Historical(key=API_KEY)
    chunks = get_monthly_chunks()
    
    log.info(f"Total chunks to download: {len(chunks)}")
    
    results = []
    total_bars = 0
    failed = []
    
    for i, (start_date, end_date) in enumerate(chunks, 1):
        chunk_key = f"ohlcv-1m_{start_date}_{end_date}"
        output_path = RAW_DIR / f"{chunk_key}.parquet"
        
        log.info(f"Chunk {i}/{len(chunks)}: {start_date} to {end_date}")
        
        try:
            df = download_chunk(client, start_date, end_date)
            n_rows = len(df)
            
            # Save with timestamp preserved
            df.to_parquet(output_path, index=False, compression="snappy")
            checksum = sha256_file(output_path)
            
            log.info(f"  [{chunk_key}] Saved {n_rows:,} rows → {output_path.name} SHA256={checksum[:16]}...")
            
            total_bars += n_rows
            results.append({
                "chunk_key": chunk_key,
                "start_date": start_date,
                "end_date": end_date,
                "rows": n_rows,
                "sha256": checksum,
                "status": "complete",
            })
            
        except Exception as e:
            log.error(f"  [{chunk_key}] FAILED: {e}")
            failed.append(chunk_key)
            results.append({
                "chunk_key": chunk_key,
                "start_date": start_date,
                "end_date": end_date,
                "rows": 0,
                "status": "failed",
                "error": str(e),
            })
    
    log.info("")
    log.info("=" * 70)
    log.info("REPROCESS COMPLETE")
    log.info(f"Total chunks: {len(chunks)}")
    log.info(f"Complete: {len(chunks) - len(failed)}")
    log.info(f"Failed: {len(failed)}")
    log.info(f"Total 1m bars: {total_bars:,}")
    log.info("=" * 70)
    
    # Save updated manifest
    manifest = {
        "run_id": datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S"),
        "dataset": "GLBX.MDP3",
        "schema": "ohlcv-1m",
        "symbols": ["MNQ.v.0"],
        "start_date": "2024-01-01",
        "end_date": "2026-07-21",
        "total_chunks": len(chunks),
        "complete_chunks": len(chunks) - len(failed),
        "failed_chunks": len(failed),
        "total_1m_bars": total_bars,
        "status": "COMPLETE" if not failed else "PARTIAL",
        "failed_chunk_keys": failed,
        "normalisation_version": "v1.1",
        "timestamp_column": "bar_time",
        "price_columns": "raw_float_from_databento",
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
    }
    
    manifest_path = MANIFESTS_DIR / "ingestion_ohlcv-1m_v1.1_reprocessed.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2, default=str)
    
    log.info(f"Manifest: {manifest_path}")
    
    return manifest


if __name__ == "__main__":
    result = main()
    import json
    print(json.dumps(result, indent=2, default=str))
