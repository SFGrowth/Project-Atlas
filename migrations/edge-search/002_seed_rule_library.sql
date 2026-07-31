-- DARWIN Rule Library Seed — 35 Frozen Initial Rules
-- Migration: 002_seed_rule_library.sql
-- Sprint: darwin-complete-edge-search-universe
-- Status: DEPLOY AFTER SOAK COMPLETION
-- All thresholds frozen. DO NOT TUNE during this sprint.

USE atlas_staging_g4;

INSERT IGNORE INTO darwin_rule_library
  (rule_id, rule_version, family_id, title, market_mechanism, exact_trigger, context, timeframe, session, direction, minimum_sample, forward_horizons, outcome_measures, condition_signature, data_requirements, known_limitations, status)
VALUES

-- ============================================================
-- RANGE AND VOLATILITY (F) — 4 rules
-- ============================================================
('RULE-RV-001','1.0.0','F',
 '1m bar range expansion relative to ATR',
 'A bar whose range materially exceeds the recent ATR signals unusual participation or directional conviction. The direction of the expansion (close location) may predict short-term continuation.',
 '1m bar range >= 1.5 x atr14. Close-location-value >= 0.7 (bullish) or <= 0.3 (bearish).',
 'Any session, any regime.',
 '1m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","continuation_rate","reversal_rate"]',
 'sha256_F_1m_ALL_BOTH_range_gte_1p5atr14_clv_gte0p7_or_lte0p3_1_3_6_12',
 '1m OHLCV; ATR14','High-frequency signal; may be noisy in low-participation sessions','INACTIVE'),

('RULE-RV-002','1.0.0','F',
 '5m volatility compression followed by expansion',
 'A sequence of narrow-range bars (compression) followed by a wide-range bar (expansion) signals a breakout from a consolidation. The direction of expansion may predict continuation.',
 '5 consecutive 5m bars with range <= 0.7 x atr14, followed by a bar with range >= 1.3 x atr14.',
 'Any session, any regime.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","continuation_rate"]',
 'sha256_F_5m_ALL_BOTH_5bar_compression_lte0p7atr14_then_expansion_gte1p3atr14',
 '5m OHLCV; ATR14','Requires 5-bar lookback; may miss fast breakouts','INACTIVE'),

('RULE-RV-003','1.0.0','F',
 'ATR regime classification — low vs high volatility',
 'The current ATR relative to its 20-period average classifies the volatility regime. Low-vol regimes may favour mean-reversion entries; high-vol regimes may favour momentum.',
 'atr14 <= 0.7 x atr14_ma20 (LOW) or atr14 >= 1.3 x atr14_ma20 (HIGH).',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[3,6,12,24]','["forward_return","regime_persistence","MFE","MAE"]',
 'sha256_F_5m_ALL_BOTH_atr14_vs_atr14ma20_low_lte0p7_high_gte1p3',
 '5m OHLCV; ATR14; ATR14_MA20','Regime may persist or flip quickly; classification is lagging','INACTIVE'),

('RULE-RV-004','1.0.0','F',
 'Gap open relative to prior ATR',
 'An opening gap larger than 0.5 x prior-day ATR signals a directional bias at the open. The gap may fill (mean-reversion) or extend (continuation) depending on regime.',
 'abs(open - prior_close) >= 0.5 x prior_atr14 at session open.',
 'RTH open only.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["gap_fill_rate","continuation_rate","forward_return","MFE","MAE"]',
 'sha256_F_5m_RTH_BOTH_gap_gte_0p5_prior_atr14_at_open',
 '5m OHLCV; prior-day ATR14; session labels','Gap fill vs extension depends heavily on news context not captured here','INACTIVE'),

-- ============================================================
-- MARKET STRUCTURE (B) — 8 rules
-- ============================================================
('RULE-MS-001','1.0.0','B',
 'Prior-day high/low as resistance/support',
 'Price approaching the prior-day high or low often encounters order flow from participants who placed stops or limits at those levels. A reaction at these levels may signal a tradeable edge.',
 'Price within 2 ticks of prior-day high or low on a 5m bar.',
 'RTH session.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["forward_return","rejection_rate","breakout_rate","MFE","MAE"]',
 'sha256_B_5m_RTH_BOTH_price_within_2ticks_prior_day_HL',
 '5m OHLCV; prior-day OHLC; session labels','Level significance degrades if prior day was low-range','INACTIVE'),

('RULE-MS-002','1.0.0','B',
 'Opening range breakout (ORB) — first 15 minutes',
 'The high and low of the first 15 minutes of RTH define the opening range. A breakout above or below this range with momentum may predict continuation.',
 'Price closes above ORH or below ORL on a 5m bar after 09:45 ET. ORH/ORL defined from 09:30–09:45 ET.',
 'RTH session, after 09:45 ET.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["continuation_rate","forward_return","MFE","MAE"]',
 'sha256_B_5m_RTH_BOTH_ORB_15min_breakout_close_above_ORH_or_below_ORL',
 '5m OHLCV; session labels; time-of-day','ORB quality varies with gap size and overnight inventory','INACTIVE'),

('RULE-MS-003','1.0.0','B',
 'Opening range breakout (ORB) — first 30 minutes',
 'The high and low of the first 30 minutes of RTH define a wider opening range. Breakout from this range may have higher reliability than the 15-minute version.',
 'Price closes above ORH or below ORL on a 5m bar after 10:00 ET. ORH/ORL defined from 09:30–10:00 ET.',
 'RTH session, after 10:00 ET.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["continuation_rate","forward_return","MFE","MAE"]',
 'sha256_B_5m_RTH_BOTH_ORB_30min_breakout_close_above_ORH_or_below_ORL',
 '5m OHLCV; session labels; time-of-day','Wider range reduces signal frequency','INACTIVE'),

('RULE-MS-004','1.0.0','B',
 'Prior swing high/low test',
 'A test of a prior swing high or low (defined as a local extreme over the last 20 bars) may attract order flow. Reaction at these levels may predict a short-term reversal or continuation.',
 'Price within 3 ticks of a 20-bar swing high or low on a 5m bar.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["rejection_rate","breakout_rate","forward_return","MFE","MAE"]',
 'sha256_B_5m_ALL_BOTH_price_within_3ticks_20bar_swing_HL',
 '5m OHLCV','Swing definition is sensitive to lookback period','INACTIVE'),

('RULE-MS-005','1.0.0','B',
 'Overnight high/low as intraday reference',
 'The overnight session high and low often act as reference levels during RTH. Price reacting at these levels may predict a short-term edge.',
 'Price within 2 ticks of overnight high or low during RTH on a 5m bar.',
 'RTH session.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["rejection_rate","breakout_rate","forward_return","MFE","MAE"]',
 'sha256_B_5m_RTH_BOTH_price_within_2ticks_overnight_HL',
 '5m OHLCV; session labels; overnight OHLC','Overnight range quality varies with participation','INACTIVE'),

('RULE-MS-006','1.0.0','B',
 'Weekly high/low as structural reference',
 'The current week high and low accumulate significant order flow. Price reacting at these levels during RTH may predict a short-term edge.',
 'Price within 3 ticks of current-week high or low on a 5m bar.',
 'RTH session.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["rejection_rate","breakout_rate","forward_return","MFE","MAE"]',
 'sha256_B_5m_RTH_BOTH_price_within_3ticks_weekly_HL',
 '5m OHLCV; weekly OHLC; session labels','Weekly levels are only meaningful mid-to-late week','INACTIVE'),

('RULE-MS-007','1.0.0','B',
 'Failed breakout above prior-day high',
 'A bar that closes above the prior-day high but then reverses and closes back below it within 3 bars may signal a failed breakout and short-term reversal opportunity.',
 'Bar closes above prior-day high, then within 3 subsequent bars closes back below prior-day high.',
 'RTH session.',
 '5m','RTH','SHORT',50,
 '[1,3,6,12]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_B_5m_RTH_SHORT_failed_breakout_above_prior_day_high_within_3bars',
 '5m OHLCV; prior-day high; session labels','Requires sequential bar logic; small sample in some periods','INACTIVE'),

('RULE-MS-008','1.0.0','B',
 'Failed breakdown below prior-day low',
 'A bar that closes below the prior-day low but then reverses and closes back above it within 3 bars may signal a failed breakdown and short-term reversal opportunity.',
 'Bar closes below prior-day low, then within 3 subsequent bars closes back above prior-day low.',
 'RTH session.',
 '5m','RTH','LONG',50,
 '[1,3,6,12]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_B_5m_RTH_LONG_failed_breakdown_below_prior_day_low_within_3bars',
 '5m OHLCV; prior-day low; session labels','Requires sequential bar logic; small sample in some periods','INACTIVE'),

-- ============================================================
-- VWAP (H) — 4 rules
-- ============================================================
('RULE-VW-001','1.0.0','H',
 'First touch of VWAP after extended deviation',
 'Price that has been trading more than 1.5 x ATR away from VWAP for at least 6 bars and then returns to VWAP may exhibit mean-reversion continuation through VWAP.',
 'abs(close - vwap) >= 1.5 x atr14 for 6 consecutive bars, then abs(close - vwap) <= 0.5 x atr14.',
 'RTH session.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["forward_return","vwap_cross_rate","MFE","MAE"]',
 'sha256_H_5m_RTH_BOTH_vwap_return_after_6bar_1p5atr14_deviation',
 '5m OHLCV; VWAP; ATR14; session labels','VWAP resets at session open; only valid intraday','INACTIVE'),

('RULE-VW-002','1.0.0','H',
 'VWAP reclaim after brief dip below',
 'Price dips below VWAP for 1–3 bars and then reclaims it with a close above. This may signal bullish continuation.',
 'Close below VWAP for 1–3 consecutive bars, then close above VWAP.',
 'RTH session.',
 '5m','RTH','LONG',50,
 '[1,3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_H_5m_RTH_LONG_vwap_reclaim_after_1_to_3bar_dip',
 '5m OHLCV; VWAP; session labels','Signal quality degrades in choppy sessions','INACTIVE'),

('RULE-VW-003','1.0.0','H',
 'VWAP rejection after brief pop above',
 'Price pops above VWAP for 1–3 bars and then closes back below. This may signal bearish continuation.',
 'Close above VWAP for 1–3 consecutive bars, then close below VWAP.',
 'RTH session.',
 '5m','RTH','SHORT',50,
 '[1,3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_H_5m_RTH_SHORT_vwap_rejection_after_1_to_3bar_pop',
 '5m OHLCV; VWAP; session labels','Signal quality degrades in choppy sessions','INACTIVE'),

('RULE-VW-004','1.0.0','H',
 'Price far above VWAP at session close — mean reversion overnight',
 'Price closing RTH more than 2 x ATR above VWAP may revert toward VWAP in the overnight session.',
 'At RTH close: close - vwap >= 2 x atr14.',
 'RTH close; overnight session.',
 '5m','RTH','SHORT',50,
 '[3,6,12,24]','["overnight_return","vwap_approach_rate","MFE","MAE"]',
 'sha256_H_5m_RTH_SHORT_close_2atr14_above_vwap_at_rth_close',
 '5m OHLCV; VWAP; ATR14; session labels','Overnight session has lower participation; wider spreads','INACTIVE'),

-- ============================================================
-- SESSION AND TIME (J) — 5 rules
-- ============================================================
('RULE-SESS-001','1.0.0','J',
 'First 5 minutes of RTH direction continuation',
 'The direction of the first 5m bar of RTH (09:30–09:35 ET) may predict the direction of the next 15–30 minutes.',
 'First 5m bar of RTH closes up (bullish) or down (bearish). Measure forward return over next 3 and 6 bars.',
 'RTH session; first bar only.',
 '5m','RTH','BOTH',50,
 '[3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_J_5m_RTH_BOTH_first_bar_direction_continuation',
 '5m OHLCV; session labels; time-of-day','First bar direction may be dominated by gap fill dynamics','INACTIVE'),

('RULE-SESS-002','1.0.0','J',
 'Lunch-hour chop — reduced edge 11:30–13:00 ET',
 'The 11:30–13:00 ET window typically has lower participation and higher noise. Entries during this window may have reduced expectancy.',
 'Bar timestamp between 11:30 and 13:00 ET.',
 'RTH session; lunch window.',
 '5m','RTH','BOTH',50,
 '[1,3,6]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_J_5m_RTH_BOTH_lunch_window_1130_1300_ET',
 '5m OHLCV; session labels; time-of-day','Lunch chop may vary by day-of-week and news calendar','INACTIVE'),

('RULE-SESS-003','1.0.0','J',
 'Power hour — increased edge 15:00–16:00 ET',
 'The final hour of RTH (15:00–16:00 ET) often sees increased participation and directional moves as institutions rebalance. Entries aligned with the prevailing intraday trend during this window may have higher expectancy.',
 'Bar timestamp between 15:00 and 16:00 ET. Intraday trend defined by EMA9 vs EMA21 on 5m.',
 'RTH session; power hour.',
 '5m','RTH','BOTH',50,
 '[1,3,6]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_J_5m_RTH_BOTH_power_hour_1500_1600_ET_ema9_vs_ema21',
 '5m OHLCV; EMA9; EMA21; session labels; time-of-day','Power hour dynamics vary with macro calendar','INACTIVE'),

('RULE-SESS-004','1.0.0','J',
 'Overnight session directional bias',
 'The overnight session (18:00–09:30 ET) often trends in one direction. The direction of the overnight move may predict the early RTH bias.',
 'Overnight return = (RTH open - prior RTH close) / prior_atr14. Positive = bullish overnight; negative = bearish.',
 'RTH open; overnight session.',
 '5m','RTH','BOTH',50,
 '[1,3,6,12]','["forward_return","gap_fill_rate","continuation_rate","MFE","MAE"]',
 'sha256_J_5m_RTH_BOTH_overnight_directional_bias_vs_prior_atr14',
 '5m OHLCV; session labels; prior-day close','Overnight direction may be reversed by RTH news','INACTIVE'),

('RULE-SESS-005','1.0.0','J',
 'Monday open — weekly inventory reset',
 'Monday RTH open often reflects the resolution of weekend inventory. The direction of the first 30 minutes on Monday may have a different distribution than other days.',
 'Day-of-week = Monday. First 6 bars of RTH (09:30–10:00 ET).',
 'RTH session; Monday only.',
 '5m','RTH','BOTH',50,
 '[3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_J_5m_RTH_BOTH_monday_open_first_6bars_weekly_inventory',
 '5m OHLCV; session labels; day-of-week','Small sample per year; Monday dynamics may shift with macro regime','INACTIVE'),

-- ============================================================
-- ENTRY QUALITY (P) — 5 rules
-- ============================================================
('RULE-EQ-001','1.0.0','P',
 'Entry after excessive move away from EMA21 — negative edge',
 'Entering in the direction of a move after price has already moved more than 2 x ATR away from EMA21 may have negative expectancy due to mean-reversion pressure.',
 'abs(close - ema21) >= 2 x atr14 at entry bar.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_P_5m_ALL_BOTH_entry_after_2atr14_from_ema21_negative_edge',
 '5m OHLCV; EMA21; ATR14','Negative edge candidate; may be used as no-trade filter','INACTIVE'),

('RULE-EQ-002','1.0.0','P',
 'Entry near opposing structure — negative edge',
 'Entering a long position within 3 ticks of a known resistance level (prior-day high, swing high, weekly high) may have negative expectancy.',
 'Long entry with close within 3 ticks of prior-day high, 20-bar swing high, or weekly high.',
 'RTH session.',
 '5m','RTH','LONG',50,
 '[1,3,6,12]','["forward_return","rejection_rate","MFE","MAE"]',
 'sha256_P_5m_RTH_LONG_entry_within_3ticks_resistance_negative_edge',
 '5m OHLCV; prior-day high; swing high; weekly high; session labels','Resistance quality varies; may not apply in strong trend','INACTIVE'),

('RULE-EQ-003','1.0.0','P',
 'Entry near opposing structure — short near support',
 'Entering a short position within 3 ticks of a known support level (prior-day low, swing low, weekly low) may have negative expectancy.',
 'Short entry with close within 3 ticks of prior-day low, 20-bar swing low, or weekly low.',
 'RTH session.',
 '5m','RTH','SHORT',50,
 '[1,3,6,12]','["forward_return","rejection_rate","MFE","MAE"]',
 'sha256_P_5m_RTH_SHORT_entry_within_3ticks_support_negative_edge',
 '5m OHLCV; prior-day low; swing low; weekly low; session labels','Support quality varies; may not apply in strong downtrend','INACTIVE'),

('RULE-EQ-004','1.0.0','P',
 'Delayed entry — chasing a move already in progress',
 'Entering after a move has already extended 1.5 x ATR in one direction without a pullback may have negative expectancy due to late entry and adverse excursion risk.',
 '5 consecutive bars in one direction with cumulative move >= 1.5 x atr14, no pullback > 0.3 x atr14.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_P_5m_ALL_BOTH_delayed_entry_5bar_1p5atr14_no_pullback_negative_edge',
 '5m OHLCV; ATR14','Negative edge candidate; may be used as no-trade filter','INACTIVE'),

('RULE-EQ-005','1.0.0','P',
 'Entry during repeated EMA crossing — chop filter',
 'When EMA9 and EMA21 have crossed more than 3 times in the last 20 bars, the market is in a choppy regime. Entries during this condition may have negative expectancy.',
 'EMA9 and EMA21 have crossed >= 3 times in the last 20 bars.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_P_5m_ALL_BOTH_ema9_ema21_cross_gte3_in_20bars_chop_filter',
 '5m OHLCV; EMA9; EMA21','Negative edge candidate; may be used as no-trade filter','INACTIVE'),

-- ============================================================
-- TREND (C) — 3 rules
-- ============================================================
('RULE-TR-001','1.0.0','C',
 'EMA9 above EMA21 — bullish trend continuation',
 'When EMA9 is above EMA21 and both are rising, the short-term trend is bullish. Entries in the direction of the trend may have positive expectancy.',
 'EMA9 > EMA21. EMA21 slope positive (EMA21 > EMA21 5 bars ago). Close > EMA9.',
 'Any session.',
 '5m','ALL','LONG',50,
 '[3,6,12,24]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_C_5m_ALL_LONG_ema9_above_ema21_both_rising_close_above_ema9',
 '5m OHLCV; EMA9; EMA21','Trend may reverse; lagging indicator','INACTIVE'),

('RULE-TR-002','1.0.0','C',
 'EMA9 below EMA21 — bearish trend continuation',
 'When EMA9 is below EMA21 and both are falling, the short-term trend is bearish. Entries in the direction of the trend may have positive expectancy.',
 'EMA9 < EMA21. EMA21 slope negative (EMA21 < EMA21 5 bars ago). Close < EMA9.',
 'Any session.',
 '5m','ALL','SHORT',50,
 '[3,6,12,24]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_C_5m_ALL_SHORT_ema9_below_ema21_both_falling_close_below_ema9',
 '5m OHLCV; EMA9; EMA21','Trend may reverse; lagging indicator','INACTIVE'),

('RULE-TR-003','1.0.0','C',
 'EMA crossover — trend change signal',
 'When EMA9 crosses above or below EMA21, it signals a potential trend change. The first bar after the crossover may predict short-term continuation.',
 'EMA9 crosses above EMA21 (bullish) or below EMA21 (bearish) on the current bar.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_C_5m_ALL_BOTH_ema9_crosses_ema21_crossover_signal',
 '5m OHLCV; EMA9; EMA21','Crossovers are frequent in choppy markets; high false-positive rate','INACTIVE'),

-- ============================================================
-- MOMENTUM (E) — 3 rules
-- ============================================================
('RULE-MOM-001','1.0.0','E',
 'RSI oversold bounce — 5m',
 'When RSI14 falls below 30 on a 5m bar and then closes above 30, a short-term mean-reversion bounce may follow.',
 'RSI14 < 30 on bar N, then RSI14 > 30 on bar N+1.',
 'Any session.',
 '5m','ALL','LONG',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_E_5m_ALL_LONG_rsi14_below30_then_above30_oversold_bounce',
 '5m OHLCV; RSI14','RSI oversold can persist in strong downtrends','INACTIVE'),

('RULE-MOM-002','1.0.0','E',
 'RSI overbought reversal — 5m',
 'When RSI14 rises above 70 on a 5m bar and then closes below 70, a short-term mean-reversion reversal may follow.',
 'RSI14 > 70 on bar N, then RSI14 < 70 on bar N+1.',
 'Any session.',
 '5m','ALL','SHORT',50,
 '[1,3,6,12]','["forward_return","MFE","MAE","win_rate"]',
 'sha256_E_5m_ALL_SHORT_rsi14_above70_then_below70_overbought_reversal',
 '5m OHLCV; RSI14','RSI overbought can persist in strong uptrends','INACTIVE'),

('RULE-MOM-003','1.0.0','E',
 'Momentum divergence — price new high, RSI lower high',
 'When price makes a new 20-bar high but RSI14 makes a lower high, bearish divergence may predict a short-term reversal.',
 'Close >= 20-bar high. RSI14 < RSI14 at prior 20-bar high.',
 'Any session.',
 '5m','ALL','SHORT',50,
 '[3,6,12,24]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_E_5m_ALL_SHORT_price_20bar_high_rsi14_lower_high_bearish_divergence',
 '5m OHLCV; RSI14; 20-bar rolling high','Divergence requires two swing points; small sample','INACTIVE'),

-- ============================================================
-- VOLUME AND PARTICIPATION (G) — 3 rules
-- ============================================================
('RULE-VOL-001','1.0.0','G',
 'Volume spike — bar volume >= 2x 20-bar average',
 'A bar with volume more than twice the 20-bar average signals unusual participation. The direction of the bar may predict short-term continuation.',
 'volume >= 2 x vol_ma20. Measure forward return in bar direction.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","continuation_rate","MFE","MAE"]',
 'sha256_G_5m_ALL_BOTH_volume_gte_2x_vol_ma20_spike',
 '5m OHLCV with volume; vol_ma20','Volume data quality must be verified; may include roll-day anomalies','INACTIVE'),

('RULE-VOL-002','1.0.0','G',
 'Low volume consolidation — volume < 0.5x 20-bar average',
 'A sequence of bars with volume below half the 20-bar average signals low participation and potential consolidation. Breakouts from low-volume consolidations may have higher reliability.',
 '3 consecutive bars with volume < 0.5 x vol_ma20.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","breakout_rate","MFE","MAE"]',
 'sha256_G_5m_ALL_BOTH_3bar_volume_lt_0p5x_vol_ma20_consolidation',
 '5m OHLCV with volume; vol_ma20','Low volume may persist; does not guarantee breakout','INACTIVE'),

('RULE-VOL-003','1.0.0','G',
 'Volume climax at swing extreme — potential reversal',
 'A volume spike (>= 2x average) at a 20-bar swing high or low may signal a climax and potential reversal.',
 'volume >= 2 x vol_ma20 AND (close >= 20-bar high OR close <= 20-bar low).',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_G_5m_ALL_BOTH_volume_climax_at_20bar_swing_extreme',
 '5m OHLCV with volume; vol_ma20; 20-bar swing HL','Climax reversals require confirmation; may continue','INACTIVE'),

-- ============================================================
-- REVERSAL (O) — 3 rules
-- ============================================================
('RULE-REV-001','1.0.0','O',
 'Hammer candle at support — bullish reversal',
 'A hammer candle (lower wick >= 2x body, small upper wick) at or near a support level may signal a bullish reversal.',
 'Lower wick >= 2 x abs(open - close). Upper wick <= 0.3 x lower wick. Close within 3 ticks of prior-day low, swing low, or VWAP.',
 'Any session.',
 '5m','ALL','LONG',50,
 '[1,3,6,12]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_O_5m_ALL_LONG_hammer_at_support_lower_wick_2x_body',
 '5m OHLCV; VWAP; prior-day low; swing low','Hammer quality varies; context is critical','INACTIVE'),

('RULE-REV-002','1.0.0','O',
 'Shooting star candle at resistance — bearish reversal',
 'A shooting star candle (upper wick >= 2x body, small lower wick) at or near a resistance level may signal a bearish reversal.',
 'Upper wick >= 2 x abs(open - close). Lower wick <= 0.3 x upper wick. Close within 3 ticks of prior-day high, swing high, or VWAP.',
 'Any session.',
 '5m','ALL','SHORT',50,
 '[1,3,6,12]','["forward_return","reversal_rate","MFE","MAE"]',
 'sha256_O_5m_ALL_SHORT_shooting_star_at_resistance_upper_wick_2x_body',
 '5m OHLCV; VWAP; prior-day high; swing high','Shooting star quality varies; context is critical','INACTIVE'),

('RULE-REV-003','1.0.0','O',
 'Engulfing candle — momentum reversal',
 'A bullish or bearish engulfing candle (current bar body fully engulfs prior bar body) may signal a short-term momentum reversal.',
 'Bullish: open <= prior close AND close >= prior open AND close > open. Bearish: open >= prior close AND close <= prior open AND close < open.',
 'Any session.',
 '5m','ALL','BOTH',50,
 '[1,3,6,12]','["forward_return","reversal_rate","continuation_rate","MFE","MAE"]',
 'sha256_O_5m_ALL_BOTH_engulfing_candle_body_engulfs_prior_body',
 '5m OHLCV','Engulfing patterns are common; context filtering is important','INACTIVE');

-- Update family rule counts
UPDATE darwin_research_coverage_registry SET total_defined_rules=4, inactive_rules=4 WHERE family_id='F';
UPDATE darwin_research_coverage_registry SET total_defined_rules=8, inactive_rules=8 WHERE family_id='B';
UPDATE darwin_research_coverage_registry SET total_defined_rules=4, inactive_rules=4 WHERE family_id='H';
UPDATE darwin_research_coverage_registry SET total_defined_rules=5, inactive_rules=5 WHERE family_id='J';
UPDATE darwin_research_coverage_registry SET total_defined_rules=5, inactive_rules=5 WHERE family_id='P';
UPDATE darwin_research_coverage_registry SET total_defined_rules=3, inactive_rules=3 WHERE family_id='C';
UPDATE darwin_research_coverage_registry SET total_defined_rules=3, inactive_rules=3 WHERE family_id='E';
UPDATE darwin_research_coverage_registry SET total_defined_rules=3, inactive_rules=3 WHERE family_id='G';
UPDATE darwin_research_coverage_registry SET total_defined_rules=3, inactive_rules=3 WHERE family_id='O';
