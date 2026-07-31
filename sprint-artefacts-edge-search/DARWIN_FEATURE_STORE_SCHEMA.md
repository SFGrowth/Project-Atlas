# DARWIN Canonical Feature Store Schema

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION

---

## Purpose

The canonical feature store provides a single, versioned, causally-clean snapshot of all market features at each bar boundary. Every feature is computed from data available strictly before or at the bar close timestamp. No future data is used.

**FUTURE_DATA_USES=0**
**DUPLICATE_FEATURE_SNAPSHOTS=0**
**ORPHAN_FEATURE_SNAPSHOTS=0**
**FEATURE_CAUSALITY_TESTS=PASS**

---

## Table: darwin_feature_snapshots

| Column | Type | Description |
|---|---|---|
| feature_snapshot_id | BIGINT UNSIGNED AUTO_INCREMENT PK | Unique row identifier |
| source_event_id | BIGINT UNSIGNED | FK to atlas_bars_1m or aggregated bar event |
| market_timestamp | DATETIME(3) NOT NULL | Bar close timestamp (UTC) |
| instrument | VARCHAR(20) DEFAULT 'MNQ' | Instrument symbol |
| contract | VARCHAR(20) NOT NULL | Active contract (e.g. MNQU25) |
| timeframe | ENUM('1m','5m','15m','30m','60m') NOT NULL | Bar timeframe |
| feature_version | VARCHAR(20) DEFAULT '1.0.0' | Feature computation version |
| features_json | JSON NOT NULL | All feature groups (see below) |
| data_quality_status | ENUM('OK','STALE','MISSING','ROLL') DEFAULT 'OK' | Data quality flag |
| created_at | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) | Row creation time |

**Indexes:** (market_timestamp, timeframe), (contract, market_timestamp)

---

## Feature Groups (features_json structure)

### PRICE
| Feature | Description | Causal? |
|---|---|---|
| open | Bar open price | YES |
| high | Bar high price | YES |
| low | Bar low price | YES |
| close | Bar close price | YES |
| range | high − low | YES |
| body | abs(close − open) | YES |
| upper_wick | high − max(open, close) | YES |
| lower_wick | min(open, close) − low | YES |
| close_location_value | (close − low) / range | YES |
| returns_1bar | (close − prev_close) / prev_close | YES |
| gap | open − prev_close | YES |
| inside_bar | high < prev_high AND low > prev_low | YES |
| outside_bar | high > prev_high AND low < prev_low | YES |

### VOLATILITY
| Feature | Description | Causal? |
|---|---|---|
| atr14 | 14-bar ATR (Wilder) | YES |
| atr_percentile | ATR percentile vs 252-bar rolling window | YES |
| rolling_range_10 | 10-bar average range | YES |
| realised_vol_20 | 20-bar realised volatility (close returns) | YES |
| vol_acceleration | atr14 / atr14[5] − 1 | YES |
| compression_score | 1 − (atr14 / atr14_20bar_max) | YES |
| expansion_score | atr14 / atr14_20bar_min − 1 | YES |
| vol_regime | ENUM: LOW, NORMAL, HIGH, EXTREME | YES |

### TREND
| Feature | Description | Causal? |
|---|---|---|
| ema9 | 9-bar EMA of close | YES |
| ema20 | 20-bar EMA of close | YES |
| ema50 | 50-bar EMA of close | YES |
| ema200 | 200-bar EMA (where history exists) | YES |
| ema9_slope | (ema9 − ema9[3]) / 3 | YES |
| ema20_slope | (ema20 − ema20[3]) / 3 | YES |
| ema_separation | (ema9 − ema50) / atr14 | YES |
| trend_strength | ADX-equivalent composite | YES |
| bars_above_ema20 | Consecutive bars with close > ema20 | YES |
| bars_below_ema20 | Consecutive bars with close < ema20 | YES |
| ema_cross_count_20 | EMA9/20 cross count in last 20 bars | YES |
| bars_since_ema_cross | Bars since last EMA9/20 cross | YES |

### VWAP
| Feature | Description | Causal? |
|---|---|---|
| session_vwap | Session VWAP (cumulative from session open) | YES |
| distance_from_vwap | (close − vwap) / atr14 | YES |
| vwap_slope | (vwap − vwap[5]) / 5 | YES |
| vwap_cross_count | VWAP cross count in current session | YES |
| bars_since_vwap_cross | Bars since last VWAP cross | YES |
| vwap_reclaim_state | BOOLEAN: price reclaimed VWAP from below | YES |
| vwap_rejection_state | BOOLEAN: price rejected at VWAP from above | YES |

### VOLUME
| Feature | Description | Causal? |
|---|---|---|
| volume | Bar volume | YES |
| relative_volume | volume / 20-bar avg volume | YES |
| volume_percentile | Volume percentile vs 252-bar rolling window | YES |
| volume_acceleration | volume / volume[5] − 1 | YES |
| volume_deceleration | 1 − volume / volume[5] (when declining) | YES |
| price_volume_agreement | BOOLEAN: price direction matches volume direction | YES |
| price_volume_divergence | BOOLEAN: price expands but volume contracts | YES |

### STRUCTURE
| Feature | Description | Causal? |
|---|---|---|
| prior_day_high | Previous RTH session high | YES |
| prior_day_low | Previous RTH session low | YES |
| prior_week_high | Previous week high | YES |
| prior_week_low | Previous week low | YES |
| overnight_high | Current overnight (ETH) high | YES |
| overnight_low | Current overnight (ETH) low | YES |
| opening_range_high | First 30-min RTH high | YES |
| opening_range_low | First 30-min RTH low | YES |
| recent_swing_high | Most recent confirmed swing high | YES |
| recent_swing_low | Most recent confirmed swing low | YES |
| range_centre | (recent_swing_high + recent_swing_low) / 2 | YES |
| dist_from_pdh | (close − prior_day_high) / atr14 | YES |
| dist_from_pdl | (close − prior_day_low) / atr14 | YES |
| dist_from_orh | (close − opening_range_high) / atr14 | YES |
| dist_from_orl | (close − opening_range_low) / atr14 | YES |
| break_state | ENUM: NONE, ABOVE_PDH, BELOW_PDL, ABOVE_ORH, BELOW_ORL | YES |
| reclaim_state | BOOLEAN: price reclaimed a broken level | YES |
| retest_state | BOOLEAN: price is retesting a broken level | YES |
| retest_count | Number of retests of current level | YES |

### SESSION
| Feature | Description | Causal? |
|---|---|---|
| session | ENUM: ASIA, LONDON, NY_PREMARKET, NY_RTH, NY_CLOSE, MAINTENANCE | YES |
| minute_within_session | Minutes elapsed since session open | YES |
| weekday | 0=Monday … 4=Friday | YES |
| week_of_month | 1–5 | YES |
| month | 1–12 | YES |
| time_to_rth_open_min | Minutes until RTH open (negative after open) | YES |
| time_from_rth_open_min | Minutes since RTH open | YES |
| time_to_maintenance_min | Minutes until maintenance break | YES |
| time_from_maintenance_min | Minutes since maintenance break | YES |

### REGIME
| Feature | Description | Causal? |
|---|---|---|
| trend_regime | ENUM: BULLISH, BEARISH, NEUTRAL | YES |
| vol_regime | ENUM: LOW, NORMAL, HIGH, EXTREME | YES |
| market_regime | ENUM: TRENDING, RANGING, COMPRESSION, EXPANSION, TRANSITION | YES |
| regime_confidence | 0.0–1.0 composite confidence score | YES |

### QUALITY
| Feature | Description | Causal? |
|---|---|---|
| missing_data_flag | BOOLEAN: any required input was missing | YES |
| stale_data_flag | BOOLEAN: any input was stale | YES |
| feed_health_state | ENUM: OK, DEGRADED, DOWN | YES |
| contract_roll_flag | BOOLEAN: contract rolled within last 3 bars | YES |
| spread_quality_flag | BOOLEAN (where spread data exists) | YES |
| microstructure_quality_flag | BOOLEAN (where MBO/MBP data exists) | YES |

---

## Timeframes Supported

| Timeframe | Source | Aggregation |
|---|---|---|
| 1m | atlas_bars_1m (live feed) | Native |
| 5m | Aggregated from 1m | 5-bar OHLCV aggregation |
| 15m | Aggregated from 1m | 15-bar OHLCV aggregation |
| 30m | Aggregated from 1m | 30-bar OHLCV aggregation |
| 60m | Aggregated from 1m | 60-bar OHLCV aggregation (where history sufficient) |

---

## Causality Invariants

Every feature in `features_json` must satisfy:

1. **Temporal causality:** computed exclusively from data at or before `market_timestamp`.
2. **No look-ahead:** no future close, high, low, or volume is referenced.
3. **Versioned:** `feature_version` increments on any formula change.
4. **Auditable:** the computation formula is frozen in code and testable.
5. **Quality-flagged:** any missing or stale input sets `data_quality_status` accordingly.

Causality is validated by the `test_feature_causality` test suite (see DARWIN_COMPLETE_EDGE_SEARCH_TEST_REPORT.md).
