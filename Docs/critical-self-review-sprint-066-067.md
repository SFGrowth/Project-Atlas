# Atlas Critical Self Review
**Sprints:** 066, 067  
**Date:** 10 July 2026  
**Author:** Manus AI  

This document satisfies **Rule 17: Before marking any sprint complete, perform a Critical Self Review.**

## M-00: Atlas Configuration
*   **Logic Errors:** None detected. The module is purely declarative.
*   **Edge Cases:** Extreme input values (e.g., negative max contracts). Mitigated by `minval`/`maxval` constraints in the `input.*` calls.
*   **State Transition Failures:** N/A.
*   **Race Conditions:** N/A.
*   **Pine Script Limitations:** TradingView UI limits the grouping of inputs. Addressed by logical prefixing.
*   **Performance Bottlenecks:** None.
*   **Future Maintenance Risks:** If new models are added (e.g., C1), M-00 must be manually updated to include toggle switches.

## M-01: Atlas Utilities
*   **Logic Errors:** The `f_is_overnight` function logic (`h >= 18 or h < 9 or (h == 9 and m < 30)`) correctly captures the cross-midnight boundary.
*   **Edge Cases:** Daylight Saving Time transitions. Mitigated by enforcing the `America/New_York` timezone at the chart level.
*   **State Transition Failures:** N/A.
*   **Race Conditions:** N/A.
*   **Pine Script Limitations:** Lack of native ISO 8601 day-of-week. Addressed by `f_day_of_week_iso`.
*   **Performance Bottlenecks:** None. Pure math operations.
*   **Future Maintenance Risks:** The hardcoded session strings in `f_get_session_name` may cause issues if downstream models require `PRE_MARKET` granularity.

## M-02: Atlas State Manager
*   **Logic Errors:** The daily reset logic relies on detecting the 09:30 ET bar. If a data gap causes the 09:30 bar to be missing, the daily reset will fail.
    *   *Mitigation Required:* Update `f_detect_new_rth_day()` to trigger on the *first available bar* $\ge$ 09:30 ET.
*   **Edge Cases:** Consecutive loss counters must not increment if a trade is closed at exactly breakeven.
*   **State Transition Failures:** Circuit breaker state requires explicit manual reset. This is intended behaviour.
*   **Race Conditions:** N/A (Pine Script is single-threaded).
*   **Pine Script Limitations:** `strategy.equity` is unavailable in library scripts.
*   **Performance Bottlenecks:** Array operations (`array.push`, `array.shift`) on every bar. Mitigated by strict size limits (max 20/50).
*   **Future Maintenance Risks:** Centralised state means M-02 will become very large as new models are added.

## M-03: Atlas Market State Engine
*   **Logic Errors:** MVC-003 relies on `rel_txn`, which is a proxy calculation. If volume data is missing or anomalous, `rel_txn` will spike.
*   **Edge Cases:** Start-of-series warm-up for ADX and EMA. The first 50 bars will have inaccurate trend and volatility states.
*   **State Transition Failures:** The overnight close price (`ov_close`) is finalised at the 09:30 ET bar open. If the 09:30 bar is missing, `ov_close` will remain `na`.
*   **Race Conditions:** N/A.
*   **Pine Script Limitations:** Cannot access raw tick data for true transaction counts.
*   **Performance Bottlenecks:** Calculating 14-period ADX on every 5-minute bar. Acceptable within Pine Script limits.
*   **Future Maintenance Risks:** The standalone verification block contains `var` state that must be manually removed before final integration.
