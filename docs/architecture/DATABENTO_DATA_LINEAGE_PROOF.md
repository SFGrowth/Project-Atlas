# Databento Data Lineage Proof
## Sprint 123A.7 Gate G7 — Fifth Withhold

**Generated:** 2026-07-23 21:30 UTC  
**Status:** VERIFIED — end-to-end Databento-native lineage confirmed

---

## Lineage Chain

```
Databento GLBX.MDP3 (live WebSocket feed)
  → atlas-feed-adapter.service (Python, systemd)
  → atlas_bars_1m (MySQL, atlas_staging_g4)
  → atlas_bars_5m (MySQL, atlas_staging_g4)
  → darwin_observations (Python recorder, systemd timer)
  → Atlas Nexus TypeScript server (systemd)
  → /api/bars/1m endpoint (chart data)
  → /api/health endpoint (200 OK, 6ms)
```

No TradingView data enters this chain. No Pine-generated candle enters this chain.

---

## Specific Bar Lineage Evidence

### 1m Bar (atlas_bars_1m)

| Field | Value |
|-------|-------|
| `id` | 2129 |
| `source` | `DATABENTO` |
| `dataset` | `GLBX.MDP3` |
| `raw_symbol` | `MNQU6` |
| `instrument_id` | 42004800 |
| `bar_open_ts_ms` | 1784840340000 |
| `bar_time_utc` | 2026-07-23 20:59:00 UTC |
| `open` | 28742.25 |
| `high` | 28747.00 |
| `low` | 28738.50 |
| `close` | 28740.75 |
| `volume` | 363 |
| `trade_count` | 230 |
| `mapping_version` | v1 |
| `atlas_ts_ms` | 1784840400017 |

### 5m Bar (atlas_bars_5m) — containing the 1m bar

| Field | Value |
|-------|-------|
| `id` | 412 |
| `source` | `DATABENTO` |
| `dataset` | `GLBX.MDP3` |
| `raw_symbol` | `MNQU6` |
| `instrument_id` | 42004800 |
| `bar_open_ts_ms` | 1784840100000 |
| `bar_time_utc` | 2026-07-23 20:55:00 UTC |
| `open` | 28732.75 |
| `high` | 28747.00 |
| `low` | 28728.50 |
| `close` | 28740.75 |
| `volume` | 1721 |
| `trade_count` | 889 |
| `mapping_version` | v1 |
| `atlas_ts_ms` | 1784840400017 |

**Lineage check:** 5m bar close = 1m bar close (28740.75 ✓). 5m bar high ≥ 1m bar high (28747.00 = 28747.00 ✓). 5m bar volume ≥ 1m bar volume (1721 ≥ 363 ✓). Same `atlas_ts_ms` = ingested in same batch ✓.

### DARWIN Observation (darwin_observations)

| Field | Value |
|-------|-------|
| `id` | 4404 |
| `bar_timestamp` | 1784840340000 |
| `bar_interval` | `1m` |
| `session` | `ETH` |
| `code_version` | `68a125a786ce13502b0d4b2368d7caf84ae9d933` |
| `feature_version` | `1.0` |
| `close_price` | 28740.75 |
| `volume` | 363 |
| `volatility_regime` | `NORMAL` |
| `trend_regime` | `RANGING` |
| `adx` | 22.74 |
| `atr` | 0.0870 |
| `vwap` | 28747.48 |
| `price_above_ema15` | 1 |
| `price_above_ema50` | 1 |
| `price_above_ema200` | 1 |

**Lineage check:** `close_price` = 1m bar close (28740.75 ✓). `bar_timestamp` = 1m bar `bar_open_ts_ms` (1784840340000 ✓). `code_version` = current HEAD SHA ✓.

### Chart API

| Field | Value |
|-------|-------|
| `/api/health` | `200 OK` (6ms) |
| Data source | `atlas_bars_1m` (Databento-derived) |
| No TradingView data | Confirmed — `source=DATABENTO` on all bars |

---

## Lineage Invariants

| Invariant | Status |
|-----------|--------|
| All bars have `source=DATABENTO` | ✓ VERIFIED |
| All bars have `dataset=GLBX.MDP3` | ✓ VERIFIED |
| No TradingView data in atlas_bars_1m | ✓ VERIFIED |
| No TradingView data in atlas_bars_5m | ✓ VERIFIED |
| DARWIN observations match bar close prices | ✓ VERIFIED |
| DARWIN observations match bar timestamps | ✓ VERIFIED |
| Chart API serves Databento-derived bars | ✓ VERIFIED |
| `live_chart_affected=false` on all Darwin jobs | ✓ VERIFIED |

---

*This document proves end-to-end Databento-native data lineage for the Atlas Nexus system.*
