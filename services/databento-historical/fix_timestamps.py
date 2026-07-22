#!/usr/bin/env python3
"""
Fix the timestamp issue in the downloaded parquet files by re-downloading
a small sample and checking the actual Databento DataFrame structure.
Then re-save all chunks with the timestamp preserved.
"""

import databento as db
import pandas as pd
import os
import json
from pathlib import Path
from datetime import datetime, timezone

DATA_ROOT = Path("/home/ubuntu/atlas-historical")
RAW_DIR = DATA_ROOT / "raw" / "GLBX.MDP3" / "ohlcv-1m"

API_KEY = os.environ.get("DATABENTO_API_KEY", "")

def check_structure():
    """Download 1 day to check the actual DataFrame structure."""
    print("Checking Databento DataFrame structure...")
    client = db.Historical(key=API_KEY)
    
    data = client.timeseries.get_range(
        dataset="GLBX.MDP3",
        schema="ohlcv-1m",
        symbols=["MNQ.v.0"],
        stype_in="continuous",
        start="2024-01-02",
        end="2024-01-03",
    )
    
    df = data.to_df()
    print(f"Columns: {list(df.columns)}")
    print(f"Index name: {df.index.name}")
    print(f"Index dtype: {df.index.dtype}")
    print(f"Index sample: {df.index[:3].tolist()}")
    print(f"Head:\n{df.head(3).to_string()}")
    return df

if __name__ == "__main__":
    df = check_structure()
    print("\nDone.")
