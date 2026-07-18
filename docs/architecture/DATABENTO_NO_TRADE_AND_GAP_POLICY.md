# Databento No-Trade and Gap Recovery Policy
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

This document defines the authoritative policy for every case where a 1-minute or 5-minute bar cannot be confirmed from live Databento data. Three distinct cases exist. Each case has a different cause, a different resolution path, and a different persistence outcome. They must never be conflated.

---

## Case A — Confirmed No-Trade Minute

**Definition:** The exchange was in an active trading period, the Databento feed was `LIVE`, sequence continuity was unbroken, and historical reconciliation confirms that zero trades occurred in this minute.

**Conditions required before synthesising a bar:**

1. Feed health state is `LIVE` (not `DEGRADED`, `STALE`, `RECONNECTING`, `RECOVERING`, or `OFFLINE`)
2. Sequence continuity is verified — no gap in Databento sequence numbers spanning this minute
3. Historical API reconciliation confirms zero trades for this instrument in this minute
4. Exchange market schedule confirms an active trading period (not a scheduled pause or close)
5. The previous confirmed bar is within 2 minutes (no extended silence)

**If all conditions are met:** A synthetic flat continuity bar is generated with `open = high = low = close = previous_close`, `volume = 0`, `tickCount = 0`, `isSynthetic = true`, `isReconciled = true`. The bar is persisted to `atlas_bars_1m` with `bar_type = 'SYNTHETIC_NO_TRADE_BAR'`.

**Five-minute aggregation rule:** A synthetic no-trade bar may be included in 5-minute aggregation. The resulting 5-minute bar must have `containsSyntheticMinutes = true`. Downstream consumers must be aware of this flag.

**Production processing rule:** A 5-minute bar with `containsSyntheticMinutes = true` may be used for production processing. The synthetic minutes represent confirmed market inactivity, not data uncertainty.

---

## Case B — Exchange Closed or Scheduled Pause

**Definition:** The exchange was not in an active trading period (overnight close, weekend, holiday, scheduled maintenance, or CME Globex daily maintenance window 5:00–6:00 PM ET).

**Action:** Do not generate a bar of any kind. Do not persist a placeholder. Mark the market schedule state correctly in `atlas_market_schedule` (future table). The gap in `atlas_bars_1m` is expected and correct.

**Five-minute aggregation rule:** Do not aggregate across a scheduled close. The 5-minute bar boundary that spans a scheduled close must be split at the close boundary. Bars on either side of the close are independent.

**Production processing rule:** No production processing occurs during scheduled closes.

---

## Case C — Feed Uncertainty or Missing Data

**Definition:** The Databento feed was not `LIVE` during this minute, or sequence continuity was broken, or historical reconciliation has not yet been performed, or the result of reconciliation is uncertain.

**Sub-cases:**

| Sub-case | Feed State | Sequence | Reconciliation | Resolution |
|---|---|---|---|---|
| C1 — Feed degraded | `DEGRADED` or `STALE` | Unknown | Not performed | Mark `UNRESOLVED`; attempt recovery |
| C2 — Feed offline | `OFFLINE` | Broken | Not performed | Mark `UNRESOLVED`; attempt recovery |
| C3 — Reconnecting | `RECONNECTING` | Unknown | Not performed | Mark `UNRESOLVED`; attempt recovery after reconnect |
| C4 — Sequence gap | Any | Broken | Not performed | Mark `UNRESOLVED`; request replay |
| C5 — Reconciliation inconclusive | `LIVE` | Continuous | Inconclusive | Mark `UNRESOLVED`; alert |

**Action for all Case C sub-cases:** Mark the interval `UNRESOLVED` in `atlas_bars_1m`. Do not synthesise a bar. Do not aggregate this minute into a 5-minute bar until resolved.

**Recovery path:**

1. Request live replay from Databento for the affected time range
2. If live replay is unavailable, request historical data from Databento Historical API
3. Confirm the bar from the recovered data
4. Update `atlas_bars_1m` record from `UNRESOLVED` to `CONFIRMED` or `SYNTHETIC_NO_TRADE_BAR`
5. Re-evaluate any 5-minute bars that included this minute

**Five-minute aggregation rule:** A 5-minute bar must not be confirmed if it contains any `UNRESOLVED` minutes. The resulting 5-minute bar must have `containsUnresolvedMinutes = true` and must not be dispatched to production consumers.

**Production processing rule:** A `CanonicalBarConfirmed` event with `containsUnresolvedMinutes = true` must not trigger `processBar()`, `liveLearnEngine`, `onNewBarObservation()`, or any production execution path. It may be written to `atlas_bars_5m` for audit purposes only.

---

## Gap Recovery SLA

| Gap Duration | Recovery Method | SLA |
|---|---|---|
| < 5 minutes | Live replay | Automatic; within 60 seconds of reconnect |
| 5–60 minutes | Live replay | Automatic; within 5 minutes of reconnect |
| 60 minutes – 24 hours | Historical API | Automatic; within 15 minutes of reconnect |
| > 24 hours | Historical API + manual review | Manual; alert sent to Phil |

---

## Persistence Schema

### `atlas_bars_1m` — bar_type values

| Value | Meaning |
|---|---|
| `LIVE_CONFIRMED` | Confirmed from live Databento trades |
| `RECONCILED_CONFIRMED` | Confirmed from live trades + reconciled against `ohlcv-1m` |
| `SYNTHETIC_NO_TRADE_BAR` | Case A — confirmed no-trade minute |
| `RECOVERED_FROM_REPLAY` | Recovered from Databento live replay |
| `RECOVERED_FROM_HISTORICAL` | Recovered from Databento Historical API |
| `UNRESOLVED` | Case C — uncertainty; do not use for production |

### `atlas_bars_5m` — bar_type values

| Value | Meaning |
|---|---|
| `CANONICAL_CONFIRMED` | All 5 minutes confirmed (any combination of LIVE, RECONCILED, SYNTHETIC) |
| `CONTAINS_SYNTHETIC` | At least one synthetic no-trade minute |
| `CONTAINS_UNRESOLVED` | At least one unresolved minute — do not use for production |
| `RECOVERED` | Recovered after gap |

---

## Alert Thresholds

| Condition | Alert |
|---|---|
| Any `UNRESOLVED` minute during active trading | Immediate notification |
| `UNRESOLVED` minute not recovered within 15 minutes | Escalation alert |
| `containsUnresolvedMinutes` 5-min bar attempted for production dispatch | Hard error; block dispatch |
| > 3 consecutive `SYNTHETIC_NO_TRADE_BAR` minutes during active trading | Warning (unusual inactivity) |
| Feed `OFFLINE` for > 5 minutes during active trading | Immediate alert |
