# Atlas Replay Architecture

**Document type:** Component Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-012

---

## Overview

This document specifies the design of the Atlas Replay Engine — the "Time Machine" capability that allows DARWIN and the dashboard to replay any historical trading session using the same event contracts, bar builder, and feature engine as the live system. Replay is the foundation of DARWIN's research capability and the mechanism by which strategy behaviour can be validated against historical data.

The replay engine is deferred to Sprint 127. This document defines the architecture so that all earlier sprints build replay-compatible components.

---

## Replay Design Principles

**Determinism.** Replay must produce exactly the same bars, indicators, and strategy signals as the live system would have produced if it had been running at that time. Given the same sequence of market events, the replay engine must produce identical output every time.

**Provider independence.** The replay engine uses the same Atlas event contracts as the live system. It does not depend on DataBento or TradingView. Historical data is sourced from the Atlas storage tiers (MySQL hot/warm, S3 cold).

**Same code path.** The replay engine feeds events into the same event bus, bar builder, and feature engine as the live system. It does not have a separate "backtest" code path. This is the critical property that eliminates the live/backtest divergence problem.

**Controlled time.** The replay engine controls the clock. All time-dependent calculations (bar boundaries, session classification, VWAP reset) use the replay clock, not the wall clock.

---

## Replay Architecture

```
Historical Data Source
  ├── atlas_ticks (MySQL hot tier, last 7 days)
  ├── atlas_bars_1m (MySQL warm tier, last 90 days)
  ├── S3 Parquet files (cold tier, 90+ days)
        ↓
Replay Event Generator
  ├── Reads historical events in chronological order
  ├── Converts to AtlasTradeEvent and AtlasQuoteEvent
  ├── Controls replay clock (wall time or accelerated)
  └── Publishes to Replay Event Bus
        ↓
Replay Event Bus (separate instance from live bus)
        ↓
Same Consumers as Live System:
  ├── Bar Builder (with replay clock)
  ├── Feature Engine
  ├── DARWIN Research Engine
  └── Replay Dashboard (optional)
        ↓
Replay Results:
  ├── Confirmed bars stored in replay_sessions table
  ├── Strategy signals stored in replay_signals table
  └── Performance metrics computed and stored
```

---

## Replay Session Model

A replay session is a bounded historical period replayed with specific parameters:

```typescript
interface ReplaySession {
  sessionId: string;           // UUID
  name: string;                // Human-readable name
  symbol: string;              // "MNQ1!"
  startTs: number;             // UTC milliseconds
  endTs: number;               // UTC milliseconds
  speedMultiplier: number;     // 1.0 = real-time, 10.0 = 10x, 0 = instant
  dataSource: 'ticks' | 'bars_1m' | 'bars_5m'; // Resolution
  models: string[];            // Models to evaluate: ["A1", "A3", "B1"]
  status: 'pending' | 'running' | 'complete' | 'failed';
  createdAt: number;
  completedAt?: number;
  resultSummary?: ReplayResultSummary;
}
```

### Replay Data Sources

| Source | Resolution | Availability | Use Case |
|---|---|---|---|
| `ticks` | Individual trades | Last 7 days (MySQL) or cold tier | Highest fidelity, DARWIN tick research |
| `bars_1m` | 1-minute OHLCV | Last 90 days (MySQL) or cold tier | Indicator validation, medium-term research |
| `bars_5m` | 5-minute OHLCV | All time (MySQL atlas_memory) | Strategy backtesting, long-term research |

For `bars_5m` replay, the replay engine synthesises trade events from bar OHLCV data (open, high, low, close in sequence) to feed the bar builder. This is less accurate than tick replay but is sufficient for strategy signal validation.

---

## Replay Clock

The replay engine maintains a virtual clock that controls the timing of event delivery:

- **Instant mode** (`speedMultiplier = 0`): Events are delivered as fast as the system can process them. Used for DARWIN research and backtesting.
- **Real-time mode** (`speedMultiplier = 1.0`): Events are delivered at the same rate as they occurred historically. Used for dashboard replay and training.
- **Accelerated mode** (`speedMultiplier > 1.0`): Events are delivered faster than real-time. Used for rapid strategy validation.

The replay clock is injected into the bar builder and feature engine as a dependency, replacing the wall clock. All time-dependent calculations use the replay clock.

---

## Replay Isolation

Replay sessions run in isolation from the live system. They use a separate event bus instance and do not affect the live `atlas_memory` table. Replay results are stored in separate tables:

```sql
CREATE TABLE replay_sessions (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(128),
  symbol VARCHAR(16) NOT NULL,
  start_ts BIGINT NOT NULL,
  end_ts BIGINT NOT NULL,
  speed_multiplier DECIMAL(8, 2) NOT NULL DEFAULT 1.0,
  data_source VARCHAR(16) NOT NULL DEFAULT 'bars_5m',
  models JSON,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  result_summary JSON
);

CREATE TABLE replay_bars (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  bar_open_ts BIGINT NOT NULL,
  open DECIMAL(10, 2), high DECIMAL(10, 2),
  low DECIMAL(10, 2), close DECIMAL(10, 2),
  volume INT, tick_count INT,
  indicators JSON,
  INDEX idx_session_bar (session_id, bar_open_ts)
);

CREATE TABLE replay_signals (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  bar_open_ts BIGINT NOT NULL,
  model VARCHAR(16) NOT NULL,
  direction VARCHAR(8),
  ade_decision VARCHAR(32),
  ari_approved BOOLEAN,
  tvl_status VARCHAR(16),
  entry_price DECIMAL(10, 2),
  stop_price DECIMAL(10, 2),
  target_price DECIMAL(10, 2),
  exit_price DECIMAL(10, 2),
  exit_reason VARCHAR(32),
  pnl_dollars DECIMAL(10, 2),
  r_multiple DECIMAL(8, 4),
  INDEX idx_session_model (session_id, model)
);
```

---

## DARWIN Research Integration

The DARWIN research engine uses the replay engine to test hypotheses against historical data. The workflow is:

1. DARWIN identifies a market behaviour hypothesis
2. DARWIN defines a replay session covering the relevant historical period
3. The replay engine runs the session in instant mode
4. DARWIN analyses the replay results for evidence supporting or disproving the hypothesis
5. DARWIN records findings in `darwin_research_findings` with references to the replay session ID

This workflow ensures that all DARWIN research is grounded in the same data and code as the live system.

---

*This document defines the replay architecture for Sprint 127. All earlier sprints must build replay-compatible components by using the replay clock abstraction and event bus interface.*
