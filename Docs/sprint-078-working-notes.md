# Sprint 078 Working Notes

## APS Discrepancy 1: MarketState Field Count

### Pine Engineering Spec (sprint-065) defines exactly 40 fields:
- Temporal: 9 (ts_utc, session, is_rth, is_am_session, is_pm_session, is_overnight, hour_et, minute_et, day_of_week)
- Price: 5 (close, high, low, open, volume)
- Trend: 6 (ema9, ema21, ema50, ema_structure, ema_bull, ema_bear)
- Volatility: 8 (atr14, atr5, adx14, volcomp_ratio, is_compressed, is_expanding, adx_trending, volatility_state)
- Overnight: 5 (ov_range_pts, ov_range_vs_atr14, ov_direction, ov_close, ov_open)
- Participation: 3 (rel_txn, rel_vol_20, participation_surge)
- MVC States: 1 (mvc_003_active)
- Day Statistics: 4 (day_open, day_high, day_low, day_range_vs_atr14)
- TOTAL PINE SPEC: 41 fields

### M-03 implementation defines 40 fields:
- Temporal: 9
- Price: 5 (named bar_close, bar_high, etc. — different from Pine spec which uses close, high)
- Trend: 6
- Volatility: 8
- Overnight: 7 (adds ov_high, ov_low vs Pine spec which only has ov_range_pts, ov_range_vs_atr14, ov_direction, ov_close, ov_open)
- Participation: 3
- MVC States: 1
- Day Statistics: 4
- TOTAL M-03: 43 fields (but grouped as 40 in the header comment)

### APS v1.0 states: "56-field immutable snapshot"
- The APS does NOT enumerate the 56 fields anywhere in the document
- The 56-field claim appears in the APS overview text and Observatory section
- The Pine Engineering Spec (sprint-065) is the detailed implementation spec
- The Pine Engineering Spec defines 41 fields (counting carefully)
- The ADE spec (sprint-062) also says "56 specific fields"

### RESOLUTION RECOMMENDATION:
The "56-field" claim is likely an aspirational/future-state count that includes fields from downstream UDTs
that were originally planned to be in the MSO. The actual implemented field count is 40-43.
The correct resolution is to:
1. Ratify the Pine Engineering Spec field list as canonical (41 fields)
2. Update M-03 to match the Pine Spec field names exactly (bar_close → close, etc.)
3. Update APS to state "40-field" (or exact count after reconciliation)
4. Document the 16-field gap as "reserved for future expansion"

## APS Discrepancy 2: Session Naming
- APS defines 7 sessions: PRE_MARKET, AM_OPEN, AM_SESSION, MID_SESSION, PM_SESSION, AFTER_HOURS, OVERNIGHT
- M-01 f_get_session_name() returns only 5: AM_SESSION, MID_SESSION, PM_SESSION, AFTER_HOURS, OVERNIGHT
- PRE_MARKET (04:00-09:29) returns OVERNIGHT
- AM_OPEN (09:30-10:00) returns AM_SESSION
- RESOLUTION: M-01 and M-03 should both return all 7 APS session strings

## APS Discrepancy 3: M-01 var table
- M-01 has a var table for verification display
- This violates "no state" rule
- RESOLUTION: Wrap in `if i_debug_mode` or move to M-13 debug dashboard

## APS Discrepancy 4: v_equity_peak = 100000.0
- APS says base risk $800 Live / $400 Prop
- v_equity_peak hard-coded to 100000.0 as initial value
- RESOLUTION: Accept as Pine Script initialisation requirement, document that M-14 will
  override with strategy.initial_capital on first bar

## APS Discrepancy 5 (NEW - found during audit): Field naming inconsistency
- Pine Spec uses: close, high, low, open, volume
- M-03 uses: bar_close, bar_high, bar_low, bar_open, bar_volume
- These must be reconciled before M-04/M-05/M-06 are written
- RESOLUTION: M-03 should use the Pine Spec field names (close, high, low, open, volume)
  OR the Pine Spec should be updated to use bar_* prefix. Recommend bar_* prefix as it
  avoids shadowing Pine Script built-in variable names.

## APS Discrepancy 6 (NEW): Overnight field count
- Pine Spec: 5 overnight fields (ov_range_pts, ov_range_vs_atr14, ov_direction, ov_close, ov_open)
- M-03: 7 overnight fields (adds ov_high, ov_low)
- RESOLUTION: M-03 is more complete. Update Pine Spec to include ov_high and ov_low.
