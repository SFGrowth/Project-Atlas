# Atlas Market Data Observability Plan

**Document type:** Observability Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17

---

## Overview

This document specifies the observability plan for the Atlas market data system. Observability is the ability to understand the internal state of the system from its external outputs. For a live trading system, observability is not optional — it is the mechanism by which the operator knows whether the system is functioning correctly and whether trades are being executed as intended.

---

## Observability Layers

Atlas market data observability is implemented at three layers:

**Layer 1: Dashboard indicators.** Real-time status indicators visible on the Atlas Nexus dashboard. These provide immediate visual feedback on feed health, parity status, and bar processing.

**Layer 2: Server logs.** Structured JSON logs written to the Atlas server log. These provide detailed event history for debugging and post-incident analysis.

**Layer 3: Database metrics.** Metrics stored in the `atlas_system_metrics` table. These provide historical trend data for DARWIN research and capacity planning.

---

## Dashboard Indicators

The following indicators are displayed on the Atlas Nexus dashboard:

| Indicator | Location | Update Frequency | Description |
|---|---|---|---|
| DataBento feed health | Header status bar | Real-time (SSE) | CONNECTED / DEGRADED / RECONNECTING / FALLBACK / OFFLINE |
| M-16 last webhook | Header status bar | Real-time (SSE) | Time since last M-16 webhook received |
| Parity status | Header status bar | Per bar | MATCH / MISMATCH / PENDING |
| Last bar time | Header status bar | Per bar | UTC timestamp of last confirmed bar |
| Developing bar | Live chart | Per trade (100ms rate-limited) | Current OHLCV of developing bar |
| Tick count | Live chart | Per trade | Number of ticks in current bar |
| Spread | Live chart | Per quote | Current bid-ask spread in points |
| Feed latency | Footer | Per message | DataBento ts_recv to Atlas atlasTs latency |

---

## Server Log Events

The following events are logged to the Atlas server log with structured JSON:

### DataBento Client Events

```json
{ "level": "info", "component": "databento-client", "event": "connected", "sessionId": "...", "ts": 1750000000000 }
{ "level": "info", "component": "databento-client", "event": "authenticated", "ts": 1750000001000 }
{ "level": "info", "component": "databento-client", "event": "subscribed", "symbols": ["MNQ.v.0"], "schema": "mbp-1", "ts": 1750000002000 }
{ "level": "warn", "component": "databento-client", "event": "gap_detected", "fromSeq": 12345, "toSeq": 12400, "gapSize": 55, "ts": 1750000100000 }
{ "level": "error", "component": "databento-client", "event": "disconnected", "reason": "TCP socket closed", "ts": 1750000200000 }
{ "level": "info", "component": "databento-client", "event": "reconnecting", "attempt": 1, "delayMs": 1000, "ts": 1750000201000 }
```

### Bar Builder Events

```json
{ "level": "info", "component": "bar-builder", "event": "bar_confirmed", "symbol": "MNQ1!", "barOpenTs": 1750000000000, "ohlcv": [21450.25, 21475.00, 21440.00, 21460.75, 1250], "tickCount": 847, "ts": 1750000300050 }
{ "level": "warn", "component": "bar-builder", "event": "late_trade", "symbol": "MNQ1!", "tradeTs": 1749999999000, "currentBarTs": 1750000000000, "ts": 1750000000100 }
{ "level": "info", "component": "bar-builder", "event": "contract_roll", "oldSymbol": "MNQH5", "newSymbol": "MNQM5", "ts": 1750000000000 }
```

### Parity Monitor Events

```json
{ "level": "info", "component": "parity-monitor", "event": "parity_check", "barOpenTs": 1750000000000, "status": "MATCH", "ts": 1750000305000 }
{ "level": "error", "component": "parity-monitor", "event": "parity_mismatch", "barOpenTs": 1750000000000, "databento": { "open": 21450.25, "high": 21475.00, "low": 21440.00, "close": 21460.75 }, "m16": { "open": 21450.25, "high": 21476.00, "low": 21440.00, "close": 21460.75 }, "maxDelta": 1.00, "ts": 1750000305000 }
```

---

## Database Metrics

A new `atlas_system_metrics` table stores time-series metrics for trend analysis:

```sql
CREATE TABLE atlas_system_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  metric_name VARCHAR(64) NOT NULL,
  metric_value DECIMAL(20, 6) NOT NULL,
  labels JSON,
  ts BIGINT NOT NULL,
  INDEX idx_metric_ts (metric_name, ts)
) ENGINE=InnoDB;
```

The following metrics are recorded every 5 minutes:

| Metric Name | Description | Labels |
|---|---|---|
| `feed.databento.message_rate` | Messages per second | `{ symbol: "MNQ1!" }` |
| `feed.databento.latency_p50_ms` | Median exchange-to-Atlas latency | `{ symbol: "MNQ1!" }` |
| `feed.databento.latency_p99_ms` | 99th percentile latency | `{ symbol: "MNQ1!" }` |
| `feed.databento.gap_count` | Sequence gaps in last 5 minutes | `{ symbol: "MNQ1!" }` |
| `feed.databento.uptime_pct` | Feed uptime percentage | `{}` |
| `bar.parity_match_rate` | Percentage of bars with MATCH status | `{}` |
| `bar.tick_count_avg` | Average ticks per bar | `{ symbol: "MNQ1!" }` |
| `storage.ticks_inserted` | Ticks inserted in last 5 minutes | `{}` |
| `storage.quotes_inserted` | Quotes inserted in last 5 minutes | `{}` |

---

## Alert Thresholds

| Alert | Condition | Severity | Notification |
|---|---|---|---|
| Feed silence (RTH) | Both feeds silent > 5 min | CRITICAL | Owner push notification |
| DataBento disconnected | Feed state = RECONNECTING | ERROR | Owner push notification |
| Parity mismatch | Any OHLCV delta > 0.25 pts | ERROR | Owner push notification |
| High gap rate | Gap count > 10 in 5 min | WARN | Dashboard indicator |
| High latency | p99 latency > 500ms | WARN | Dashboard indicator |
| Storage error | Insert failure rate > 1% | ERROR | Owner push notification |

---

## Observatory Dashboard Integration

The existing Atlas Observatory dashboard is extended with a new "Market Data Health" panel that displays:

- DataBento feed health timeline (last 24 hours)
- Bar parity history (last 100 bars)
- Tick rate chart (last 1 hour)
- Latency histogram (last 1 hour)
- Gap count chart (last 24 hours)
- Contract roll history

This panel is visible on the Observatory page and is updated in real-time via SSE.

---

*This observability plan is implemented progressively across Sprints 121–126.*
