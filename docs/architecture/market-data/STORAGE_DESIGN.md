# Atlas Market Data Storage Design

**Document type:** Storage Architecture Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-005

---

## Overview

This document specifies the tiered storage architecture for Atlas market data. The design must satisfy three competing requirements: real-time query performance for the dashboard and strategy engine, sufficient history for DARWIN research, and cost-effective long-term retention for backtesting.

The storage architecture uses three tiers: a hot tier in MySQL for recent data, a warm tier in MySQL for medium-term data, and a cold tier in S3-compatible object storage for long-term data.

---

## Storage Tier Definitions

| Tier | Storage | Retention | Data Types | Primary Use |
|---|---|---|---|---|
| Hot | MySQL (existing) | 0–7 days | Ticks, quotes, bars, indicators | Dashboard, strategy engine, DARWIN |
| Warm | MySQL (existing) | 7–90 days | 1-minute bars, confirmed 5-min bars | DARWIN research, replay |
| Cold | S3 object storage | 90+ days | Compressed Parquet files | Long-term backtesting, DARWIN deep research |

---

## Hot Tier: New Tables

The hot tier adds three new tables to the existing MySQL schema. The existing `atlas_memory` table continues to serve as the primary bar store.

### `atlas_ticks`

Stores every individual trade event from the DataBento feed. This is the highest-resolution data available.

```sql
CREATE TABLE atlas_ticks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(36) NOT NULL UNIQUE,
  atlas_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ1!',
  raw_symbol VARCHAR(16) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  size INT NOT NULL,
  side CHAR(1) NOT NULL,          -- 'A', 'B', 'N'
  sequence INT UNSIGNED NOT NULL,
  ts_event BIGINT UNSIGNED NOT NULL,  -- nanoseconds
  ts_recv BIGINT UNSIGNED NOT NULL,   -- nanoseconds
  atlas_ts BIGINT NOT NULL,           -- milliseconds
  source VARCHAR(32) NOT NULL DEFAULT 'databento',
  INDEX idx_atlas_symbol_ts (atlas_symbol, atlas_ts),
  INDEX idx_ts_event (ts_event),
  INDEX idx_sequence (sequence)
) ENGINE=InnoDB;
```

**Retention:** 7 days. A nightly job deletes ticks older than 7 days. At 500–2,000 ticks/minute during RTH (6.5 hours/day), this produces approximately 200,000–780,000 ticks per day. At 7 days, the table holds approximately 1.4–5.5 million rows. At ~50 bytes per row, this is 70–275 MB — well within MySQL's capacity.

### `atlas_quotes`

Stores BBO (best bid/offer) updates from the DataBento feed.

```sql
CREATE TABLE atlas_quotes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(36) NOT NULL UNIQUE,
  atlas_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ1!',
  raw_symbol VARCHAR(16) NOT NULL,
  bid_px DECIMAL(10, 2) NOT NULL,
  ask_px DECIMAL(10, 2) NOT NULL,
  bid_sz INT UNSIGNED NOT NULL,
  ask_sz INT UNSIGNED NOT NULL,
  bid_ct INT UNSIGNED NOT NULL,
  ask_ct INT UNSIGNED NOT NULL,
  action CHAR(1) NOT NULL,        -- 'A', 'C', 'M', 'R'
  side CHAR(1) NOT NULL,
  sequence INT UNSIGNED NOT NULL,
  ts_event BIGINT UNSIGNED NOT NULL,
  ts_recv BIGINT UNSIGNED NOT NULL,
  atlas_ts BIGINT NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'databento',
  INDEX idx_atlas_symbol_ts (atlas_symbol, atlas_ts),
  INDEX idx_ts_event (ts_event)
) ENGINE=InnoDB;
```

**Retention:** 3 days. Quote data is higher volume than trade data (approximately 3–5× more BBO updates than trades). At 3 days, the table holds approximately 1–3 million rows.

### `atlas_bars_1m`

Stores 1-minute OHLCV bars aggregated from tick data. This is the warm-tier representation of intrabar data.

```sql
CREATE TABLE atlas_bars_1m (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  atlas_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ1!',
  raw_symbol VARCHAR(16) NOT NULL,
  bar_open_ts BIGINT NOT NULL,    -- UTC milliseconds
  bar_close_ts BIGINT NOT NULL,   -- UTC milliseconds
  open DECIMAL(10, 2) NOT NULL,
  high DECIMAL(10, 2) NOT NULL,
  low DECIMAL(10, 2) NOT NULL,
  close DECIMAL(10, 2) NOT NULL,
  volume INT UNSIGNED NOT NULL,
  tick_count INT UNSIGNED NOT NULL,
  session VARCHAR(16),
  is_rth BOOLEAN DEFAULT FALSE,
  source VARCHAR(32) NOT NULL DEFAULT 'databento',
  UNIQUE KEY uq_symbol_bar (atlas_symbol, bar_open_ts),
  INDEX idx_bar_open_ts (bar_open_ts)
) ENGINE=InnoDB;
```

**Retention:** 90 days. At 390 trading minutes per RTH session and 5 trading days per week, this is approximately 8,580 1-minute bars per 4-week period. At 90 days, the table holds approximately 19,305 rows — trivially small.

---

## Warm Tier: Existing `atlas_memory` Extension

The existing `atlas_memory` table serves as the warm tier for confirmed 5-minute bars. Its retention is currently unlimited (no purge policy). The following changes are made in Sprint 122:

1. Add an index on `bar_time` for range queries: `INDEX idx_bar_time (bar_time)`
2. Add a `source` column to distinguish DataBento bars from M-16 bars: `source VARCHAR(32) DEFAULT 'tradingview'`
3. Add a `contract_roll` boolean column to flag bars that span a contract roll
4. Add a `parity_status` column for the M-16 watchdog comparison

No data is deleted from `atlas_memory`. All confirmed bars are retained indefinitely in MySQL.

---

## Cold Tier: S3 Object Storage

The cold tier stores compressed Parquet files in S3-compatible object storage. The cold tier is populated by a nightly export job that runs at 03:00 UTC.

### Export Schedule

| Data Type | Export Trigger | File Format | Compression |
|---|---|---|---|
| Tick data | Nightly (ticks > 7 days old) | Parquet | Snappy |
| Quote data | Nightly (quotes > 3 days old) | Parquet | Snappy |
| 5-min bars | Monthly (bars > 90 days old) | Parquet | Snappy |

### S3 Key Structure

```
atlas-market-data/
  ticks/
    MNQ1!/
      2025/06/15/
        ticks_MNQ1!_20250615.parquet
  quotes/
    MNQ1!/
      2025/06/15/
        quotes_MNQ1!_20250615.parquet
  bars-5m/
    MNQ1!/
      2025/06/
        bars_5m_MNQ1!_202506.parquet
  bars-1m/
    MNQ1!/
      2025/06/
        bars_1m_MNQ1!_202506.parquet
```

### Cold Tier Access

Cold tier data is accessed by DARWIN research scripts and the replay engine. Access is via the S3 API using the existing `storagePut`/`storageGet` helpers from the Atlas storage module. Cold tier data is read-only after export.

---

## Data Lifecycle Summary

```
DataBento Live Feed
        ↓
atlas_ticks (7 days, hot)
atlas_quotes (3 days, hot)
        ↓ (nightly export)
S3 Parquet files (cold, indefinite)

DataBento Live Feed → Bar Builder
        ↓
atlas_memory (indefinite, warm)
atlas_bars_1m (90 days, warm)
        ↓ (monthly export)
S3 Parquet files (cold, indefinite)
```

---

## Storage Capacity Estimates

| Table | Rows/Day | Row Size | 7-Day Size | 90-Day Size |
|---|---|---|---|---|
| `atlas_ticks` | ~500,000 | ~50 bytes | ~175 MB | — |
| `atlas_quotes` | ~1,500,000 | ~60 bytes | ~630 MB | — |
| `atlas_bars_1m` | ~390 | ~100 bytes | ~274 KB | ~3.5 MB |
| `atlas_memory` (5m bars) | ~78 | ~500 bytes | ~273 KB | ~3.5 MB |

Total MySQL hot-tier growth: approximately 800 MB per week. This is within the capacity of the existing MySQL instance and does not require any infrastructure changes.

---

## Query Performance Requirements

| Query | Target Latency | Index |
|---|---|---|
| Latest bar (dashboard) | < 10ms | `idx_bar_time` |
| Last N bars (feature engine) | < 50ms | `idx_bar_time` |
| Ticks for a bar window | < 100ms | `idx_atlas_symbol_ts` |
| BBO at a timestamp | < 50ms | `idx_ts_event` |
| DARWIN session query (1 day) | < 500ms | `idx_atlas_symbol_ts` |
| DARWIN range query (30 days) | < 5,000ms | `idx_bar_time` |

---

## Idempotency and Deduplication

All storage operations are idempotent. Duplicate events are detected by the `event_id` unique constraint on `atlas_ticks` and `atlas_quotes`. Duplicate bars are detected by the `UNIQUE KEY uq_symbol_bar` on `atlas_bars_1m` and the `idempotency_key` unique constraint on `atlas_memory`.

On duplicate detection, the insert is silently ignored (MySQL `INSERT IGNORE` or `ON DUPLICATE KEY UPDATE`). No error is raised and no alert is sent for expected duplicates (e.g., from intraday replay on reconnect).

---

*This storage design is the authoritative specification for Sprint 122. The cold tier implementation is deferred to Sprint 127 (replay engine) as it is not required for the initial live feed deployment.*
