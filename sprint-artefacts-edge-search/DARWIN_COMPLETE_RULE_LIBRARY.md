# DARWIN Complete Rule Library

**Version:** 1.0.0
**Created:** 2026-07-31T01:18:00Z
**Sprint:** darwin-complete-edge-search-universe
**Status:** PRE-REGISTRATION — THRESHOLDS FROZEN, DO NOT TUNE DURING THIS SPRINT

---

## Overview

| Category | Rules |
|---|---|
| Range and Volatility (F) | RULE-RV-001 to RULE-RV-004 |
| Market Structure (B) | RULE-MS-001 to RULE-MS-008 |
| VWAP (H) | RULE-VW-001 to RULE-VW-004 |
| Session (J) | RULE-SESS-001 to RULE-SESS-005 |
| Entry Quality (P) | RULE-EQ-001 to RULE-EQ-005 |
| Trend (C) | RULE-TR-001 to RULE-TR-003 |
| Momentum (E) | RULE-MOM-001 to RULE-MOM-003 |
| Volume (G) | RULE-VOL-001 to RULE-VOL-003 |
| Reversal (O) | RULE-REV-001 to RULE-REV-003 |
| **Total** | **35** |

---

## RANGE AND VOLATILITY

### RULE-RV-001
| Field | Value |
|---|---|
| RULE_ID | RULE-RV-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | F |
| TITLE | 1m bar range expansion relative to ATR |
| MARKET_MECHANISM | A bar whose range materially exceeds the recent ATR signals unusual participation or directional conviction. The direction of the expansion (close location) may predict short-term continuation. |
| EXACT_TRIGGER | 1m bar range ≥ 1.5 × atr14. Close-location-value ≥ 0.7 (bullish) or ≤ 0.3 (bearish). |
| CONTEXT | Any session, any regime. |
| TIMEFRAME | 1m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate, reversal_rate |
| CONDITION_SIGNATURE | sha256("F\|1m\|ALL\|BOTH\|range>=1.5atr14\|clv>=0.7_or_<=0.3\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 1m OHLCV; ATR14 |
| KNOWN_LIMITATIONS | High-frequency signal; may be noisy in low-participation sessions |
| STATUS | INACTIVE |

### RULE-RV-002
| Field | Value |
|---|---|
| RULE_ID | RULE-RV-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | F |
| TITLE | 5m volatility compression followed by expansion |
| MARKET_MECHANISM | A sequence of narrow-range bars (compression) followed by a wide-range bar (expansion) signals a breakout from a consolidation. The direction of expansion may predict continuation. |
| EXACT_TRIGGER | 5 consecutive 5m bars with range ≤ 0.7 × atr14, followed by a bar with range ≥ 1.3 × atr14. |
| CONTEXT | Any session, any regime. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("F\|5m\|ALL\|BOTH\|5bars_range<=0.7atr14_then_range>=1.3atr14\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; ATR14 |
| KNOWN_LIMITATIONS | Compression definition is approximate; lookback is fixed at 5 bars |
| STATUS | INACTIVE |

### RULE-RV-003
| Field | Value |
|---|---|
| RULE_ID | RULE-RV-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | F |
| TITLE | 15m ATR regime acceleration |
| MARKET_MECHANISM | A rapid increase in ATR on the 15m timeframe signals a regime transition from low to high volatility. Entering in the direction of the acceleration may capture the early part of the expansion. |
| EXACT_TRIGGER | 15m atr14 ≥ 1.4 × atr14[5] (5-bar-ago ATR). |
| CONTEXT | Any session. |
| TIMEFRAME | 15m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 2, 4] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, vol_regime_persistence |
| CONDITION_SIGNATURE | sha256("F\|15m\|ALL\|BOTH\|atr14>=1.4*atr14[5]\|[1,2,4]") |
| DATA_REQUIREMENTS | 15m OHLCV; ATR14 |
| KNOWN_LIMITATIONS | ATR acceleration may lag the actual volatility event |
| STATUS | INACTIVE |

### RULE-RV-004
| Field | Value |
|---|---|
| RULE_ID | RULE-RV-004 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | F |
| TITLE | Failed expansion with close back inside prior range |
| MARKET_MECHANISM | A bar that breaks outside the prior bar's range but closes back inside it signals a failed expansion. Trapped breakout traders may reverse, creating a mean-reversion opportunity. |
| EXACT_TRIGGER | 5m bar high > prior bar high AND close < prior bar high (bearish failure), OR 5m bar low < prior bar low AND close > prior bar low (bullish failure). |
| CONTEXT | Any session, any regime. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("F\|5m\|ALL\|BOTH\|failed_expansion_close_inside\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV |
| KNOWN_LIMITATIONS | Requires clean bar data; noisy in high-spread environments |
| STATUS | INACTIVE |

---

## MARKET STRUCTURE

### RULE-MS-001
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Prior-day high break and close above |
| MARKET_MECHANISM | A close above the prior-day high confirms acceptance above a key structural level. Buyers who were stopped out at the prior-day high may now re-enter, and sellers who shorted the level are trapped. |
| EXACT_TRIGGER | 5m bar close > prior_day_high. Prior bar close ≤ prior_day_high. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | LONG |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|LONG\|close>pdh_prev_close<=pdh\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; prior_day_high |
| KNOWN_LIMITATIONS | Prior-day high must be from a completed RTH session |
| STATUS | INACTIVE |

### RULE-MS-002
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Prior-day low break and close below |
| MARKET_MECHANISM | Symmetric to RULE-MS-001 for the bearish direction. |
| EXACT_TRIGGER | 5m bar close < prior_day_low. Prior bar close ≥ prior_day_low. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | SHORT |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|SHORT\|close<pdl_prev_close>=pdl\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; prior_day_low |
| KNOWN_LIMITATIONS | Prior-day low must be from a completed RTH session |
| STATUS | INACTIVE |

### RULE-MS-003
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Failed prior-day high break and reclaim below |
| MARKET_MECHANISM | Price breaks above the prior-day high but fails to close above it, then closes back below. Trapped longs create selling pressure. |
| EXACT_TRIGGER | 5m bar high > prior_day_high AND close < prior_day_high. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | SHORT |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|SHORT\|high>pdh_close<pdh\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; prior_day_high |
| KNOWN_LIMITATIONS | Single-bar definition; may miss multi-bar failed breakouts |
| STATUS | INACTIVE |

### RULE-MS-004
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-004 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Failed prior-day low break and reclaim above |
| MARKET_MECHANISM | Symmetric to RULE-MS-003 for the bullish direction. |
| EXACT_TRIGGER | 5m bar low < prior_day_low AND close > prior_day_low. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | LONG |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|LONG\|low<pdl_close>pdl\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; prior_day_low |
| KNOWN_LIMITATIONS | Single-bar definition; may miss multi-bar failed breakouts |
| STATUS | INACTIVE |

### RULE-MS-005
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-005 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Overnight high break during RTH |
| MARKET_MECHANISM | A break above the overnight high during RTH signals that RTH participants are accepting prices above the overnight range, potentially initiating a directional move. |
| EXACT_TRIGGER | 5m bar close > overnight_high. Prior bar close ≤ overnight_high. Session = NY_RTH. |
| CONTEXT | NY_RTH session. Overnight high must be established (time_from_rth_open_min ≥ 0). |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | LONG |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|LONG\|close>overnight_high_prev_close<=oh\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; overnight_high |
| KNOWN_LIMITATIONS | Overnight high definition: ETH session high before RTH open |
| STATUS | INACTIVE |

### RULE-MS-006
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-006 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Overnight low break during RTH |
| MARKET_MECHANISM | Symmetric to RULE-MS-005 for the bearish direction. |
| EXACT_TRIGGER | 5m bar close < overnight_low. Prior bar close ≥ overnight_low. Session = NY_RTH. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | SHORT |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|NY_RTH\|SHORT\|close<overnight_low_prev_close>=ol\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; overnight_low |
| KNOWN_LIMITATIONS | Overnight low definition: ETH session low before RTH open |
| STATUS | INACTIVE |

### RULE-MS-007
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-007 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Break and retest continuation |
| MARKET_MECHANISM | After a structural level is broken, price retests the level from the new side. If the level holds as support/resistance, continuation in the breakout direction is expected. |
| EXACT_TRIGGER | A structural level was broken in the last 12 bars. Price has returned to within 0.1 × atr14 of the level. Current bar closes in the breakout direction away from the level. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|ALL\|BOTH\|break_retest_within_12bars_0.1atr\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; structural levels; ATR14 |
| KNOWN_LIMITATIONS | Retest definition requires precise level tracking |
| STATUS | INACTIVE |

### RULE-MS-008
| Field | Value |
|---|---|
| RULE_ID | RULE-MS-008 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | B |
| TITLE | Repeated level testing before breakout |
| MARKET_MECHANISM | Multiple tests of a level without breaking it indicate accumulation of orders at that level. When the level finally breaks, the breakout may be more sustained due to the clearing of resting orders. |
| EXACT_TRIGGER | A structural level has been tested (price within 0.1 × atr14) at least 3 times in the last 30 bars without a close beyond it. Current bar closes beyond the level. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("B\|5m\|ALL\|BOTH\|3tests_30bars_0.1atr_then_close_beyond\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; structural levels; ATR14 |
| KNOWN_LIMITATIONS | Level identification requires consistent structural level tracking |
| STATUS | INACTIVE |

---

## VWAP

### RULE-VW-001
| Field | Value |
|---|---|
| RULE_ID | RULE-VW-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | H |
| TITLE | VWAP reclaim from below |
| MARKET_MECHANISM | Price trading below VWAP and then closing above it signals a shift in fair-value perception. Short sellers positioned below VWAP may cover, adding buying pressure. |
| EXACT_TRIGGER | 5m bar close > session_vwap. Prior bar close ≤ session_vwap. |
| CONTEXT | NY_RTH session. time_from_rth_open_min ≥ 30 (VWAP established). |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | LONG |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("H\|5m\|NY_RTH\|LONG\|close>vwap_prev_close<=vwap\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; session VWAP |
| KNOWN_LIMITATIONS | Frequent signal in choppy conditions; cross count matters |
| STATUS | INACTIVE |

### RULE-VW-002
| Field | Value |
|---|---|
| RULE_ID | RULE-VW-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | H |
| TITLE | VWAP rejection from above |
| MARKET_MECHANISM | Symmetric to RULE-VW-001 for the bearish direction. |
| EXACT_TRIGGER | 5m bar close < session_vwap. Prior bar close ≥ session_vwap. |
| CONTEXT | NY_RTH session. time_from_rth_open_min ≥ 30. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | SHORT |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("H\|5m\|NY_RTH\|SHORT\|close<vwap_prev_close>=vwap\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; session VWAP |
| KNOWN_LIMITATIONS | Frequent signal in choppy conditions |
| STATUS | INACTIVE |

### RULE-VW-003
| Field | Value |
|---|---|
| RULE_ID | RULE-VW-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | H |
| TITLE | VWAP overextension beyond frozen ATR distance |
| MARKET_MECHANISM | Price far from VWAP (overextended) has a higher probability of mean reversion as it represents an extreme deviation from fair value. |
| EXACT_TRIGGER | abs(close − session_vwap) ≥ 2.0 × atr14. |
| CONTEXT | NY_RTH session. time_from_rth_open_min ≥ 30. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return (mean reversion), MFE, MAE, reversion_rate |
| CONDITION_SIGNATURE | sha256("H\|5m\|NY_RTH\|BOTH\|abs_dist_vwap>=2.0atr14\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; session VWAP; ATR14 |
| KNOWN_LIMITATIONS | In strong trends, overextension may persist |
| STATUS | INACTIVE |

### RULE-VW-004
| Field | Value |
|---|---|
| RULE_ID | RULE-VW-004 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | H |
| TITLE | Repeated VWAP crossing followed by expansion |
| MARKET_MECHANISM | Multiple VWAP crossings in a session indicate indecision. When price finally moves away from VWAP with conviction (range expansion), it may signal the end of the choppy phase and the start of a directional move. |
| EXACT_TRIGGER | vwap_cross_count ≥ 4 in current session. Current bar range ≥ 1.3 × atr14. Close-location-value ≥ 0.7 (bullish) or ≤ 0.3 (bearish). |
| CONTEXT | NY_RTH session. time_from_rth_open_min ≥ 60. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("H\|5m\|NY_RTH\|BOTH\|vwap_cross>=4_range>=1.3atr_clv_extreme\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; session VWAP; ATR14 |
| KNOWN_LIMITATIONS | Cross count resets at session open |
| STATUS | INACTIVE |

---

## SESSION

### RULE-SESS-001
| Field | Value |
|---|---|
| RULE_ID | RULE-SESS-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | J |
| TITLE | Asia range break during London |
| MARKET_MECHANISM | The Asia session establishes a range. When London participants break above or below that range, it signals directional intent from a major market participant group. |
| EXACT_TRIGGER | 5m bar close > asia_session_high (bullish) or < asia_session_low (bearish) during London session. Prior bar close within Asia range. |
| CONTEXT | LONDON session. Asia session must be complete. |
| TIMEFRAME | 5m |
| SESSION | LONDON |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("J\|5m\|LONDON\|BOTH\|close_outside_asia_range\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; Asia session high/low |
| KNOWN_LIMITATIONS | Asia session definition: 00:00–08:00 UTC |
| STATUS | INACTIVE |

### RULE-SESS-002
| Field | Value |
|---|---|
| RULE_ID | RULE-SESS-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | J |
| TITLE | London range break during New York |
| MARKET_MECHANISM | Symmetric to RULE-SESS-001 for London→New York handoff. |
| EXACT_TRIGGER | 5m bar close > london_session_high or < london_session_low during NY_RTH. Prior bar close within London range. |
| CONTEXT | NY_RTH session. London session must be complete. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("J\|5m\|NY_RTH\|BOTH\|close_outside_london_range\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; London session high/low |
| KNOWN_LIMITATIONS | London session definition: 08:00–13:00 UTC |
| STATUS | INACTIVE |

### RULE-SESS-003
| Field | Value |
|---|---|
| RULE_ID | RULE-SESS-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | J |
| TITLE | New York opening-drive continuation |
| MARKET_MECHANISM | The first 30 minutes of RTH often establish a directional bias. If price continues in the opening-drive direction after the opening range is set, the drive may sustain for the first hour. |
| EXACT_TRIGGER | time_from_rth_open_min = 30 (opening range complete). Price is above opening_range_high (bullish) or below opening_range_low (bearish). First bar after opening range closes in the same direction. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("J\|5m\|NY_RTH\|BOTH\|or_complete_price_outside_or_direction\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; opening_range_high; opening_range_low |
| KNOWN_LIMITATIONS | Opening range defined as first 30 minutes of RTH |
| STATUS | INACTIVE |

### RULE-SESS-004
| Field | Value |
|---|---|
| RULE_ID | RULE-SESS-004 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | J |
| TITLE | New York failed opening drive |
| MARKET_MECHANISM | Price breaks the opening range but fails to close beyond it, returning inside. Trapped breakout traders may reverse, creating a mean-reversion opportunity. |
| EXACT_TRIGGER | time_from_rth_open_min between 30 and 60. Price broke opening_range_high or opening_range_low within last 6 bars but current bar closes back inside the opening range. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("J\|5m\|NY_RTH\|BOTH\|failed_or_break_close_inside_30-60min\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; opening_range_high; opening_range_low |
| KNOWN_LIMITATIONS | Requires opening range to be established first |
| STATUS | INACTIVE |

### RULE-SESS-005
| Field | Value |
|---|---|
| RULE_ID | RULE-SESS-005 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | J |
| TITLE | Lunch compression followed by power-hour expansion |
| MARKET_MECHANISM | The NY lunch period (12:00–14:00 ET) often sees reduced participation and range compression. When the power hour (14:00–16:00 ET) begins, participation increases and a directional move may emerge from the compressed range. |
| EXACT_TRIGGER | 5m ATR during 12:00–14:00 ET ≤ 0.7 × session ATR. First bar of 14:00 ET hour has range ≥ 1.3 × lunch ATR. |
| CONTEXT | NY_RTH session. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("J\|5m\|NY_RTH\|BOTH\|lunch_compress_power_hour_expand\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; session time labels (ET) |
| KNOWN_LIMITATIONS | Lunch and power-hour windows are fixed; DST must be handled |
| STATUS | INACTIVE |

---

## ENTRY QUALITY

### RULE-EQ-001
| Field | Value |
|---|---|
| RULE_ID | RULE-EQ-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | P |
| TITLE | Immediate adverse excursion after a qualifying signal |
| MARKET_MECHANISM | Signals followed by immediate adverse movement (price moves against the trade before any favourable movement) are lower-quality entries. Identifying the conditions under which IAE is elevated allows filtering of low-quality signals. |
| EXACT_TRIGGER | After any qualifying signal bar, the next bar's low (long) or high (short) exceeds the signal bar's stop level before reaching any favourable target. |
| CONTEXT | Any session, any family signal. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | IAE_rate, MAE_1bar, forward_return |
| CONDITION_SIGNATURE | sha256("P\|5m\|ALL\|BOTH\|immediate_adverse_excursion\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; qualifying signal definition |
| KNOWN_LIMITATIONS | Requires a parent signal hypothesis to be defined first |
| STATUS | INACTIVE |

### RULE-EQ-002
| Field | Value |
|---|---|
| RULE_ID | RULE-EQ-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | P |
| TITLE | Large-winner take-off comparison |
| MARKET_MECHANISM | Large winners (top quartile by MFE) may share common entry conditions that differ from average trades. Identifying these conditions may improve entry quality. |
| EXACT_TRIGGER | Retrospective analysis: for a given signal family, compare the top 25% MFE trades against the bottom 25% MFE trades. |
| CONTEXT | Any session, any family signal. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 100 (50 per quartile) |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | MFE, MAE, forward_return, feature_differences |
| CONDITION_SIGNATURE | sha256("P\|5m\|ALL\|BOTH\|large_winner_comparison_top25_vs_bottom25\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; completed experiment results from parent family |
| KNOWN_LIMITATIONS | Descriptive differences must not become filters until separately pre-registered |
| STATUS | INACTIVE |

### RULE-EQ-003
| Field | Value |
|---|---|
| RULE_ID | RULE-EQ-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | P |
| TITLE | Entry into opposing structural level |
| MARKET_MECHANISM | Entering in a direction where an opposing structural level (resistance for longs, support for shorts) is within 0.5 × atr14 reduces the available reward-to-risk ratio and increases the probability of a reversal at the level. |
| EXACT_TRIGGER | Signal bar close is within 0.5 × atr14 of an opposing structural level (prior_day_high for longs, prior_day_low for shorts, or opening_range extremes). |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, hit_rate_at_level |
| CONDITION_SIGNATURE | sha256("P\|5m\|ALL\|BOTH\|entry_within_0.5atr_opposing_structure\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; structural levels; ATR14 |
| KNOWN_LIMITATIONS | Structural level proximity is approximate |
| STATUS | INACTIVE |

### RULE-EQ-004
| Field | Value |
|---|---|
| RULE_ID | RULE-EQ-004 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | P |
| TITLE | Entry after excessive distance from EMA or VWAP |
| MARKET_MECHANISM | Entering when price is already far from its mean (EMA or VWAP) increases the probability of mean reversion against the trade. |
| EXACT_TRIGGER | abs(close − ema20) ≥ 2.0 × atr14 OR abs(close − session_vwap) ≥ 2.0 × atr14 at signal bar. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversion_rate |
| CONDITION_SIGNATURE | sha256("P\|5m\|ALL\|BOTH\|dist_ema20_or_vwap>=2.0atr14\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; EMA20; session VWAP; ATR14 |
| KNOWN_LIMITATIONS | Both EMA and VWAP overextension may not occur simultaneously |
| STATUS | INACTIVE |

### RULE-EQ-005
| Field | Value |
|---|---|
| RULE_ID | RULE-EQ-005 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | P |
| TITLE | Entry following repeated EMA crossings |
| MARKET_MECHANISM | Multiple EMA crossings in a short period indicate choppy, indecisive price action. Entering after repeated crossings increases the probability of a losing trade. |
| EXACT_TRIGGER | ema_cross_count_20 ≥ 3 (three or more EMA9/20 crossings in the last 20 bars). |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, win_rate |
| CONDITION_SIGNATURE | sha256("P\|5m\|ALL\|BOTH\|ema_cross_count_20>=3\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; EMA9; EMA20 |
| KNOWN_LIMITATIONS | Cross count window is fixed at 20 bars |
| STATUS | INACTIVE |

---

## TREND

### RULE-TR-001
| Field | Value |
|---|---|
| RULE_ID | RULE-TR-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | C |
| TITLE | EMA9/20/50 alignment continuation |
| MARKET_MECHANISM | When EMA9 > EMA20 > EMA50 (bullish) or EMA9 < EMA20 < EMA50 (bearish), the trend is aligned across three timeframes. Entering in the direction of alignment has a higher probability of continuation. |
| EXACT_TRIGGER | ema9 > ema20 > ema50 (bullish) or ema9 < ema20 < ema50 (bearish). All three EMAs have positive (bullish) or negative (bearish) slope. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("C\|5m\|ALL\|BOTH\|ema9_ema20_ema50_aligned_same_slope\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; EMA9; EMA20; EMA50 |
| KNOWN_LIMITATIONS | Alignment is a broad condition; many bars qualify |
| STATUS | INACTIVE |

### RULE-TR-002
| Field | Value |
|---|---|
| RULE_ID | RULE-TR-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | C |
| TITLE | First pullback in aligned trend |
| MARKET_MECHANISM | The first pullback after a trend is established often provides the highest-quality entry. Price retraces to EMA support/resistance and resumes the trend direction. |
| EXACT_TRIGGER | EMA alignment condition (RULE-TR-001) is active. bars_above_ema20 ≥ 5 (bullish) or bars_below_ema20 ≥ 5 (bearish). Current bar closes back above ema20 (bullish) or below ema20 (bearish) after touching it within last 3 bars. bars_since_ema_cross ≥ 5. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6, 12] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("C\|5m\|ALL\|BOTH\|first_pullback_ema20_aligned_trend\|[1,3,6,12]") |
| DATA_REQUIREMENTS | 5m OHLCV; EMA9; EMA20; EMA50 |
| KNOWN_LIMITATIONS | First pullback definition requires counting bars since trend establishment |
| STATUS | INACTIVE |

### RULE-TR-003
| Field | Value |
|---|---|
| RULE_ID | RULE-TR-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | C |
| TITLE | Trend exhaustion after slope deceleration |
| MARKET_MECHANISM | When EMA slope decelerates significantly (trend is losing momentum), the probability of a trend reversal or consolidation increases. |
| EXACT_TRIGGER | ema20_slope[0] < 0.5 × ema20_slope[5] (slope has halved in 5 bars). EMA alignment was active 5 bars ago. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("C\|5m\|ALL\|BOTH\|ema20_slope_halved_5bars_aligned_prior\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; EMA20 slope |
| KNOWN_LIMITATIONS | Slope deceleration may not always precede reversal |
| STATUS | INACTIVE |

---

## MOMENTUM

### RULE-MOM-001
| Field | Value |
|---|---|
| RULE_ID | RULE-MOM-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | E |
| TITLE | Impulse continuation |
| MARKET_MECHANISM | A strong directional bar (impulse) may be followed by continuation as momentum carries price further. |
| EXACT_TRIGGER | 5m bar range ≥ 1.5 × atr14. close_location_value ≥ 0.7 (bullish) or ≤ 0.3 (bearish). |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("E\|5m\|ALL\|BOTH\|range>=1.5atr_clv_extreme\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; ATR14 |
| KNOWN_LIMITATIONS | Similar to RULE-RV-001 on 5m; differentiated by family and context |
| STATUS | INACTIVE |

### RULE-MOM-002
| Field | Value |
|---|---|
| RULE_ID | RULE-MOM-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | E |
| TITLE | Impulse failure |
| MARKET_MECHANISM | A strong directional bar that fails to follow through (next bar reverses or is narrow) signals that the impulse was not sustained. Trapped momentum traders may reverse. |
| EXACT_TRIGGER | 5m bar range ≥ 1.5 × atr14. close_location_value ≥ 0.7 (bullish) or ≤ 0.3 (bearish). Next bar range ≤ 0.5 × atr14 AND next bar closes in opposite direction. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("E\|5m\|ALL\|BOTH\|impulse_then_narrow_reverse\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; ATR14 |
| KNOWN_LIMITATIONS | Two-bar pattern; requires sequential bar evaluation |
| STATUS | INACTIVE |

### RULE-MOM-003
| Field | Value |
|---|---|
| RULE_ID | RULE-MOM-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | E |
| TITLE | Close-near-extreme follow-through |
| MARKET_MECHANISM | A bar that closes near its high (bullish) or low (bearish) indicates strong directional conviction. The next bar may continue in the same direction. |
| EXACT_TRIGGER | close_location_value ≥ 0.8 (bullish) or ≤ 0.2 (bearish). |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("E\|5m\|ALL\|BOTH\|clv>=0.8_or_<=0.2\|[1,3]") |
| DATA_REQUIREMENTS | 5m OHLCV |
| KNOWN_LIMITATIONS | High-frequency signal; may be noisy |
| STATUS | INACTIVE |

---

## VOLUME

### RULE-VOL-001
| Field | Value |
|---|---|
| RULE_ID | RULE-VOL-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | G |
| TITLE | Relative-volume breakout confirmation |
| MARKET_MECHANISM | A structural breakout accompanied by above-average volume confirms genuine participation. Low-volume breakouts are more likely to fail. |
| EXACT_TRIGGER | Structural level broken (close beyond prior_day_high, prior_day_low, opening_range_high, or opening_range_low). relative_volume ≥ 1.5 on the breakout bar. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, continuation_rate |
| CONDITION_SIGNATURE | sha256("G\|5m\|ALL\|BOTH\|structural_break_rvol>=1.5\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; structural levels |
| KNOWN_LIMITATIONS | Relative volume baseline is 20-bar average |
| STATUS | INACTIVE |

### RULE-VOL-002
| Field | Value |
|---|---|
| RULE_ID | RULE-VOL-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | G |
| TITLE | Price expansion without volume confirmation |
| MARKET_MECHANISM | Price expanding without volume support suggests the move lacks genuine participation and may be more likely to reverse. |
| EXACT_TRIGGER | 5m bar range ≥ 1.3 × atr14. relative_volume ≤ 0.7. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH (negative edge) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("G\|5m\|ALL\|BOTH\|range>=1.3atr_rvol<=0.7\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; ATR14 |
| KNOWN_LIMITATIONS | Low volume may reflect time-of-day effects |
| STATUS | INACTIVE |

### RULE-VOL-003
| Field | Value |
|---|---|
| RULE_ID | RULE-VOL-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | G |
| TITLE | High volume without price progress |
| MARKET_MECHANISM | High volume with minimal price movement suggests absorption — one side is absorbing the other's orders. This may signal an impending reversal. |
| EXACT_TRIGGER | relative_volume ≥ 1.5. 5m bar range ≤ 0.5 × atr14. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("G\|5m\|ALL\|BOTH\|rvol>=1.5_range<=0.5atr\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV with volume; ATR14 |
| KNOWN_LIMITATIONS | Absorption interpretation requires context |
| STATUS | INACTIVE |

---

## REVERSAL

### RULE-REV-001
| Field | Value |
|---|---|
| RULE_ID | RULE-REV-001 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | O |
| TITLE | Liquidity sweep and reclaim |
| MARKET_MECHANISM | Price sweeps below a key structural low (or above a key high), triggering stop orders, then immediately reclaims the level. The sweep clears liquidity and trapped traders reverse, creating a directional move. |
| EXACT_TRIGGER | 5m bar low < recent_swing_low by at least 0.1 × atr14 AND close > recent_swing_low (bullish sweep), OR 5m bar high > recent_swing_high by at least 0.1 × atr14 AND close < recent_swing_high (bearish sweep). |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("O\|5m\|ALL\|BOTH\|sweep_0.1atr_reclaim_same_bar\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; recent_swing_high; recent_swing_low; ATR14 |
| KNOWN_LIMITATIONS | Swing high/low confirmation lag applies |
| STATUS | INACTIVE |

### RULE-REV-002
| Field | Value |
|---|---|
| RULE_ID | RULE-REV-002 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | O |
| TITLE | Failed breakout reversal |
| MARKET_MECHANISM | A breakout that fails to sustain (price returns inside the broken level within 3 bars) traps breakout traders. Their stop-outs create a reversal move. |
| EXACT_TRIGGER | Structural level broken within last 3 bars. Current bar closes back inside the level. |
| CONTEXT | Any session. |
| TIMEFRAME | 5m |
| SESSION | ALL |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("O\|5m\|ALL\|BOTH\|breakout_failed_close_inside_3bars\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; structural levels |
| KNOWN_LIMITATIONS | Requires structural level tracking |
| STATUS | INACTIVE |

### RULE-REV-003
| Field | Value |
|---|---|
| RULE_ID | RULE-REV-003 |
| RULE_VERSION | 1.0.0 |
| FAMILY_ID | O |
| TITLE | Session-extreme rejection |
| MARKET_MECHANISM | Price reaching a session extreme (high or low) and then reversing signals that the session extreme is acting as resistance or support. The rejection may initiate a mean-reversion move. |
| EXACT_TRIGGER | 5m bar high = session high (within 0.1 × atr14) AND close < session high − 0.3 × atr14 (bearish rejection), OR 5m bar low = session low (within 0.1 × atr14) AND close > session low + 0.3 × atr14 (bullish rejection). |
| CONTEXT | NY_RTH session. time_from_rth_open_min ≥ 60. |
| TIMEFRAME | 5m |
| SESSION | NY_RTH |
| DIRECTION | BOTH (fade direction) |
| MINIMUM_SAMPLE | 50 |
| FORWARD_HORIZONS | [1, 3, 6] bars |
| OUTCOME_MEASURES | forward_return, MFE, MAE, reversal_rate |
| CONDITION_SIGNATURE | sha256("O\|5m\|NY_RTH\|BOTH\|session_extreme_rejection_0.3atr\|[1,3,6]") |
| DATA_REQUIREMENTS | 5m OHLCV; session high/low; ATR14 |
| KNOWN_LIMITATIONS | Session extreme updates throughout the session |
| STATUS | INACTIVE |
