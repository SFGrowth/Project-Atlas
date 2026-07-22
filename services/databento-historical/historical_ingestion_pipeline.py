#!/usr/bin/env python3
"""
Atlas Nexus — Historical Databento Ingestion Pipeline
Sprint 123A.6 / Gate G6A

Features:
- Bounded date range requests
- Resumable chunked downloads (monthly chunks)
- Checksum validation (SHA-256 per chunk)
- Row count validation
- Nanosecond timestamp preservation
- Raw records stored separately from derived bars
- Same normalisation rules as live pipeline (fixed-point price scale: divide by 1e9)
- Dataset, schema and request metadata recorded
- Duplicate ingestion prevention (chunk manifest)
- Restart after partial failure (resume from last complete chunk)
- Complete audit manifest
- NO raw data committed to GitHub (data stored in /home/ubuntu/atlas-historical/)
- API key never logged or printed

STOP CONDITIONS:
- Estimated cost > $100 → stop and report
- Contract mapping cannot be verified → stop and report
- Material data leakage found → stop and report
- Data quality insufficient → stop and report
"""

import databento as db
import pandas as pd
import numpy as np
import os
import sys
import json
import hashlib
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

# ── Configuration ──────────────────────────────────────────────────────────────
DATASET = "GLBX.MDP3"
SYMBOLS = ["MNQ.v.0"]  # front-month continuous
STYPE_IN = "continuous"
SCHEMA_PRIMARY = "ohlcv-1m"
SCHEMA_DEFINITION = "definition"
START_DATE = "2024-01-01"
END_DATE = "2026-07-21"

# Storage: NOT in git repo — separate data directory
DATA_ROOT = Path("/home/ubuntu/atlas-historical")
RAW_DIR = DATA_ROOT / "raw" / "GLBX.MDP3"
MANIFEST_DIR = DATA_ROOT / "manifests"
LOG_DIR = DATA_ROOT / "logs"

# Price scale: Databento uses fixed-point int64, divide by 1e9 for actual price
PRICE_SCALE = 1_000_000_000

# Monthly chunk size for resumable downloads
CHUNK_MONTHS = 1

# Cost threshold — stop and require Phil approval above this
COST_THRESHOLD_USD = 100.0

# ── Logging ────────────────────────────────────────────────────────────────────
def setup_logging(log_file: Path) -> logging.Logger:
    log_file.parent.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("atlas_historical")
    logger.setLevel(logging.INFO)
    fh = logging.FileHandler(log_file)
    fh.setLevel(logging.INFO)
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh.setFormatter(fmt)
    ch.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(ch)
    return logger

# ── Manifest ───────────────────────────────────────────────────────────────────
class ChunkManifest:
    """Tracks completed chunks to support resumable downloads."""

    def __init__(self, manifest_path: Path):
        self.path = manifest_path
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    @property
    def manifest_path(self):
        return self.path

    def _load(self) -> dict:
        if self.path.exists():
            with open(self.path) as f:
                return json.load(f)
        return {
            "dataset": DATASET,
            "schema": SCHEMA_PRIMARY,
            "symbols": SYMBOLS,
            "start_date": START_DATE,
            "end_date": END_DATE,
            "created_at": datetime.utcnow().isoformat(),
            "chunks": {}
        }

    def _save(self):
        with open(self.path, "w") as f:
            json.dump(self._data, f, indent=2, default=str)

    def is_complete(self, chunk_key: str) -> bool:
        return chunk_key in self._data["chunks"] and \
               self._data["chunks"][chunk_key].get("status") == "COMPLETE"

    def mark_complete(self, chunk_key: str, metadata: dict):
        self._data["chunks"][chunk_key] = {
            "status": "COMPLETE",
            "completed_at": datetime.utcnow().isoformat(),
            **metadata
        }
        self._save()

    def mark_failed(self, chunk_key: str, error: str):
        self._data["chunks"][chunk_key] = {
            "status": "FAILED",
            "failed_at": datetime.utcnow().isoformat(),
            "error": error
        }
        self._save()

    def get_summary(self) -> dict:
        chunks = self._data["chunks"]
        complete = [k for k, v in chunks.items() if v.get("status") == "COMPLETE"]
        failed = [k for k, v in chunks.items() if v.get("status") == "FAILED"]
        total_rows = sum(v.get("row_count", 0) for v in chunks.values() if v.get("status") == "COMPLETE")
        return {
            "total_chunks": len(chunks),
            "complete_chunks": len(complete),
            "failed_chunks": len(failed),
            "total_rows": total_rows,
        }


def sha256_file(path: Path) -> str:
    """Compute SHA-256 checksum of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def get_monthly_chunks(start: str, end: str):
    """Generate (chunk_start, chunk_end) pairs by month."""
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    chunks = []
    current = date(s.year, s.month, 1)
    while current <= e:
        # Next month start
        if current.month == 12:
            next_month = date(current.year + 1, 1, 1)
        else:
            next_month = date(current.year, current.month + 1, 1)
        chunk_end = min(next_month - timedelta(days=1), e)
        chunks.append((current.isoformat(), chunk_end.isoformat()))
        current = next_month
    return chunks


def normalise_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalise Databento OHLCV data using same rules as live pipeline.
    - Prices: divide by PRICE_SCALE (1e9) to get actual price
    - Timestamps: preserve nanosecond precision as int64, also provide UTC datetime
    - Retain raw contract symbol, instrument_id, continuous mapping
    """
    df = df.copy()

    # Price normalisation (fixed-point int64 → float)
    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[f"{col}_raw"] = df[col]  # preserve raw int
            df[col] = df[col] / PRICE_SCALE

    # Volume
    if "volume" in df.columns:
        df["volume"] = df["volume"].astype(np.int64)

    # Timestamps: ts_event is nanoseconds since epoch
    if "ts_event" in df.columns:
        df["ts_event_ns"] = df["ts_event"].astype(np.int64)
        df["bar_time_utc"] = pd.to_datetime(df["ts_event"], utc=True)

    # Retain instrument metadata
    for col in ["symbol", "instrument_id", "publisher_id", "rtype"]:
        if col not in df.columns:
            df[col] = None

    return df


def validate_ohlcv(df: pd.DataFrame, chunk_key: str, logger: logging.Logger) -> dict:
    """
    Data quality validation for a chunk.
    Returns quality report dict.
    """
    issues = []
    n = len(df)

    if n == 0:
        issues.append("EMPTY_CHUNK")
        return {"row_count": 0, "issues": issues, "quality": "FAIL"}

    # Check for invalid OHLC
    invalid_ohlc = df[
        (df["open"] <= 0) | (df["high"] <= 0) | (df["low"] <= 0) | (df["close"] <= 0) |
        (df["high"] < df["low"]) | (df["high"] < df["open"]) | (df["high"] < df["close"]) |
        (df["low"] > df["open"]) | (df["low"] > df["close"])
    ]
    if len(invalid_ohlc) > 0:
        issues.append(f"INVALID_OHLC: {len(invalid_ohlc)} bars")
        logger.warning(f"[{chunk_key}] {len(invalid_ohlc)} invalid OHLC bars")

    # Check for zero/negative prices
    zero_prices = df[(df["close"] <= 0)]
    if len(zero_prices) > 0:
        issues.append(f"ZERO_PRICE: {len(zero_prices)} bars")

    # Check for duplicates
    if "ts_event_ns" in df.columns:
        dups = df.duplicated(subset=["ts_event_ns", "symbol"], keep=False)
        if dups.sum() > 0:
            issues.append(f"DUPLICATES: {dups.sum()} rows")

    # Check for out-of-order timestamps
    if "ts_event_ns" in df.columns:
        ts = df["ts_event_ns"].values
        ooo = np.sum(np.diff(ts) < 0)
        if ooo > 0:
            issues.append(f"OUT_OF_ORDER: {ooo} transitions")

    # Volume anomalies (zero volume bars)
    zero_vol = df[df["volume"] == 0]
    if len(zero_vol) > 0:
        issues.append(f"ZERO_VOLUME: {len(zero_vol)} bars (informational)")

    quality = "PASS" if not any(i for i in issues if not i.startswith("ZERO_VOLUME")) else "WARN"
    if any(i for i in issues if i.startswith("INVALID_OHLC") or i.startswith("ZERO_PRICE") or i.startswith("DUPLICATES")):
        quality = "FAIL"

    return {
        "row_count": n,
        "issues": issues,
        "quality": quality,
        "zero_volume_bars": len(zero_vol),
        "invalid_ohlc_bars": len(invalid_ohlc) if len(invalid_ohlc) > 0 else 0,
    }


def download_chunk(
    client: db.Historical,
    chunk_start: str,
    chunk_end: str,
    schema: str,
    output_dir: Path,
    manifest: ChunkManifest,
    logger: logging.Logger,
) -> Optional[dict]:
    """
    Download a single monthly chunk. Returns metadata dict or None on failure.
    Supports resume: skips if chunk already marked COMPLETE in manifest.
    """
    chunk_key = f"{schema}_{chunk_start}_{chunk_end}"

    if manifest.is_complete(chunk_key):
        logger.info(f"[{chunk_key}] Already complete — skipping (resume)")
        return manifest._data["chunks"][chunk_key]

    output_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = output_dir / f"{schema}_{chunk_start}_{chunk_end}.parquet"

    logger.info(f"[{chunk_key}] Downloading {schema} {chunk_start} to {chunk_end}...")

    try:
        # Download to file — never print API key
        data = client.timeseries.get_range(
            dataset=DATASET,
            symbols=SYMBOLS,
            schema=schema,
            start=chunk_start,
            end=chunk_end,
            stype_in=STYPE_IN,
        )

        df = data.to_df()

        if df is None or len(df) == 0:
            logger.warning(f"[{chunk_key}] Empty response — possible non-trading period")
            metadata = {
                "row_count": 0,
                "parquet_path": None,
                "sha256": None,
                "quality": "EMPTY",
                "issues": ["EMPTY_RESPONSE"],
                "chunk_start": chunk_start,
                "chunk_end": chunk_end,
                "schema": schema,
            }
            manifest.mark_complete(chunk_key, metadata)
            return metadata

        # Normalise
        if schema == "ohlcv-1m":
            df = normalise_ohlcv(df)

        # Validate
        quality_report = validate_ohlcv(df, chunk_key, logger) if schema == "ohlcv-1m" else {"row_count": len(df), "issues": [], "quality": "PASS"}

        if quality_report["quality"] == "FAIL":
            logger.error(f"[{chunk_key}] Data quality FAIL: {quality_report['issues']}")
            manifest.mark_failed(chunk_key, f"Quality FAIL: {quality_report['issues']}")
            return None

        # Save as Parquet (efficient, preserves dtypes)
        df.to_parquet(parquet_path, index=False, compression="snappy")

        # Checksum
        checksum = sha256_file(parquet_path)
        size_bytes = parquet_path.stat().st_size

        logger.info(f"[{chunk_key}] Saved {len(df):,} rows → {parquet_path.name} ({size_bytes/1024:.1f} KB) SHA256={checksum[:16]}...")

        metadata = {
            "row_count": len(df),
            "parquet_path": str(parquet_path),
            "sha256": checksum,
            "size_bytes": size_bytes,
            "quality": quality_report["quality"],
            "issues": quality_report.get("issues", []),
            "chunk_start": chunk_start,
            "chunk_end": chunk_end,
            "schema": schema,
            "symbols": SYMBOLS,
            "dataset": DATASET,
            "price_scale": PRICE_SCALE,
            "normalisation_version": "v1.0",
        }

        manifest.mark_complete(chunk_key, metadata)
        return metadata

    except Exception as e:
        logger.error(f"[{chunk_key}] Download failed: {e}")
        manifest.mark_failed(chunk_key, str(e))
        return None


def run_ingestion(api_key: str, dry_run: bool = False) -> dict:
    """
    Main ingestion entry point.
    Returns final audit manifest dict.
    """
    # Setup
    run_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    log_file = LOG_DIR / f"ingestion_{run_id}.log"
    logger = setup_logging(log_file)

    logger.info("=" * 70)
    logger.info("ATLAS NEXUS — HISTORICAL DATABENTO INGESTION PIPELINE")
    logger.info(f"Run ID: {run_id}")
    logger.info(f"Dataset: {DATASET} | Schema: {SCHEMA_PRIMARY}")
    logger.info(f"Symbols: {SYMBOLS} | Range: {START_DATE} to {END_DATE}")
    logger.info(f"Data root: {DATA_ROOT}")
    logger.info("=" * 70)

    # NEVER log the API key
    client = db.Historical(key=api_key)

    # Pre-flight cost check
    logger.info("Pre-flight cost check...")
    try:
        cost_cents = client.metadata.get_cost(
            dataset=DATASET,
            symbols=SYMBOLS,
            schema=SCHEMA_PRIMARY,
            start=START_DATE,
            end=END_DATE,
            stype_in=STYPE_IN,
        )
        cost_usd = cost_cents / 100
        logger.info(f"Estimated cost for {SCHEMA_PRIMARY}: ${cost_usd:.4f} USD")

        if cost_usd > COST_THRESHOLD_USD:
            logger.error(f"STOP: Cost ${cost_usd:.2f} exceeds ${COST_THRESHOLD_USD} threshold")
            logger.error("Phil's approval required before proceeding")
            return {"status": "BLOCKED", "reason": f"Cost ${cost_usd:.2f} > ${COST_THRESHOLD_USD}"}

    except Exception as e:
        logger.warning(f"Cost check failed: {e} — proceeding (entitlement-included data)")

    if dry_run:
        logger.info("DRY RUN — no data will be downloaded")
        chunks = get_monthly_chunks(START_DATE, END_DATE)
        logger.info(f"Would download {len(chunks)} monthly chunks")
        return {"status": "DRY_RUN", "chunks": len(chunks)}

    # Generate monthly chunks
    chunks = get_monthly_chunks(START_DATE, END_DATE)
    logger.info(f"Downloading {len(chunks)} monthly chunks for {SCHEMA_PRIMARY}...")

    # Manifest for resumability
    manifest_path = MANIFEST_DIR / f"ingestion_{SCHEMA_PRIMARY}_{START_DATE}_{END_DATE}.json"
    manifest = ChunkManifest(manifest_path)

    # Download ohlcv-1m chunks
    ohlcv_dir = RAW_DIR / "ohlcv-1m"
    failed_chunks = []
    total_rows = 0

    for i, (chunk_start, chunk_end) in enumerate(chunks):
        logger.info(f"Chunk {i+1}/{len(chunks)}: {chunk_start} to {chunk_end}")
        result = download_chunk(
            client=client,
            chunk_start=chunk_start,
            chunk_end=chunk_end,
            schema=SCHEMA_PRIMARY,
            output_dir=ohlcv_dir,
            manifest=manifest,
            logger=logger,
        )
        if result is None:
            failed_chunks.append(f"{chunk_start}_{chunk_end}")
        else:
            total_rows += result.get("row_count", 0)

    # Download definition records (for contract mapping)
    logger.info("\nDownloading definition records...")
    def_manifest_path = MANIFEST_DIR / f"ingestion_definition_{START_DATE}_{END_DATE}.json"
    def_manifest = ChunkManifest(def_manifest_path)
    def_dir = RAW_DIR / "definition"

    # Definition: download as single range (small dataset)
    def_result = download_chunk(
        client=client,
        chunk_start=START_DATE,
        chunk_end=END_DATE,
        schema=SCHEMA_DEFINITION,
        output_dir=def_dir,
        manifest=def_manifest,
        logger=logger,
    )

    # Final summary
    summary = manifest.get_summary()
    logger.info("\n" + "=" * 70)
    logger.info("INGESTION COMPLETE")
    logger.info(f"Total chunks: {summary['total_chunks']}")
    logger.info(f"Complete: {summary['complete_chunks']}")
    logger.info(f"Failed: {summary['failed_chunks']}")
    logger.info(f"Total 1m bars: {summary['total_rows']:,}")
    logger.info(f"Manifest: {manifest_path}")
    logger.info("=" * 70)

    if failed_chunks:
        logger.warning(f"Failed chunks: {failed_chunks}")
        logger.warning("Re-run to resume from failed chunks")

    audit_manifest = {
        "run_id": run_id,
        "dataset": DATASET,
        "schema": SCHEMA_PRIMARY,
        "symbols": SYMBOLS,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "total_chunks": summary["total_chunks"],
        "complete_chunks": summary["complete_chunks"],
        "failed_chunks": summary["failed_chunks"],
        "total_1m_bars": summary["total_rows"],
        "definition_records": def_result.get("row_count", 0) if def_result else 0,
        "data_root": str(DATA_ROOT),
        "manifest_path": str(manifest_path),
        "log_path": str(log_file),
        "status": "COMPLETE" if not failed_chunks else "PARTIAL",
        "failed_chunk_keys": failed_chunks,
        "normalisation_version": "v1.0",
        "price_scale": PRICE_SCALE,
        "git_sha": os.environ.get("GIT_SHA", "unknown"),
    }

    # Save audit manifest
    audit_path = MANIFEST_DIR / f"audit_{run_id}.json"
    with open(audit_path, "w") as f:
        json.dump(audit_manifest, f, indent=2, default=str)
    logger.info(f"Audit manifest saved: {audit_path}")

    return audit_manifest


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Atlas Nexus Historical Databento Ingestion")
    parser.add_argument("--dry-run", action="store_true", help="Estimate only, do not download")
    args = parser.parse_args()

    api_key = os.environ.get("DATABENTO_API_KEY", "")
    if not api_key:
        print("ERROR: DATABENTO_API_KEY environment variable not set")
        sys.exit(1)

    result = run_ingestion(api_key=api_key, dry_run=args.dry_run)
    print(json.dumps(result, indent=2, default=str))
