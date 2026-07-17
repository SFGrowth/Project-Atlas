# Atlas Live Bar Builder Specification

**Document type:** Component Specification  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-006

---

## Overview

The Atlas Live Bar Builder is the component responsible for constructing confirmed 5-minute OHLCV bars from the stream of individual trade events produced by the DataBento normalisation layer. It is the sole authorised source of confirmed `AtlasBarEvent` records and the sole component that triggers the `processBar()` execution pipeline.

The bar builder must produce bars that are numerically identical to TradingView's 5-minute bars for the same instrument and time period. This parity requirement is the primary acceptance gate for Sprint 123 (shadow mode) and Sprint 125 (production certification).

---

## Bar Boundary Definition

Atlas 5-minute bars are aligned to the UTC clock, not to the exchange session. The bar boundaries are:

- Bar 0: 00:00:00 UTC – 00:04:59.999 UTC
- Bar 1: 00:05:00 UTC – 00:09:59.999 UTC
- Bar N: N×5 minutes UTC – (N×5 + 4:59.999) UTC

This alignment is consistent with TradingView's default 5-minute bar alignment for CME futures. The bar open timestamp is the start of the 5-minute window (inclusive). The bar close timestamp is the end of the 5-minute window (exclusive).

### Bar Timestamp Convention

| Field | Value | Example |
|---|---|---|
| `barOpenTs` | UTC milliseconds of bar open | 1750000000000 |
| `barCloseTs` | UTC milliseconds of bar close (= barOpenTs + 300,000) | 1750000300000 |
| `atlas_memory.bar_time` | UTC milliseconds of bar open | 1750000000000 |
| `atlas_memory.bar_time_et` | Eastern Time string of bar open | "2025-06-15 09:30:00 ET" |

---

## Bar Building Algorithm

The bar builder maintains a `DevelopingBar` state for each active symbol. The state is updated on every `AtlasTradeEvent` and finalised on the 5-minute boundary.

### DevelopingBar State

```typescript
interface DevelopingBar {
  symbol: string;
  atlasSymbol: string;
  rawSymbol: string;
  barOpenTs: number;       // UTC milliseconds
  barCloseTs: number;      // UTC milliseconds (barOpenTs + 300,000)
  open: number;            // First trade price in this bar
  high: number;            // Highest trade price in this bar
  low: number;             // Lowest trade price in this bar
  close: number;           // Most recent trade price
  volume: number;          // Total contracts traded
  tickCount: number;       // Number of individual trades
  firstTradeTs: bigint;    // Exchange timestamp of first trade (nanoseconds)
  lastTradeTs: bigint;     // Exchange timestamp of last trade (nanoseconds)
  lastSequence: number;    // Last exchange sequence number
}
```

### Trade Processing

On receiving an `AtlasTradeEvent`:

1. Determine the bar window for the trade: `barOpenTs = Math.floor(tsEvent_ms / 300_000) * 300_000`
2. If `barOpenTs` matches the current developing bar's `barOpenTs`, update the developing bar:
   - `high = Math.max(high, trade.price)`
   - `low = Math.min(low, trade.price)`
   - `close = trade.price`
   - `volume += trade.size`
   - `tickCount += 1`
   - `lastTradeTs = trade.tsEvent`
   - `lastSequence = trade.sequence`
3. If `barOpenTs` is greater than the current developing bar's `barOpenTs`, the previous bar is complete:
   - Finalise the previous developing bar as a confirmed `AtlasBarEvent`
   - Start a new developing bar with `open = trade.price`, `high = trade.price`, `low = trade.price`
4. If `barOpenTs` is less than the current developing bar's `barOpenTs`, the trade is late-arriving:
   - Log the late trade with its sequence number and timestamp
   - Do not update the confirmed bar (bars are immutable once confirmed)
   - If the late trade belongs to the current developing bar, update the developing bar

### Bar Finalisation

When a bar is finalised:

1. Create a confirmed `AtlasBarEvent` with `status: 'confirmed'`
2. Publish the event to the event bus
3. Reset the developing bar state for the new window
4. Emit a developing bar event for the new window with the first trade's data

### Empty Bar Handling

If a 5-minute window passes with no trades, the bar builder does not emit a confirmed bar for that window. Empty bars are not stored in `atlas_memory`. This is consistent with TradingView's behaviour for illiquid periods (e.g., overnight session with no activity).

However, if the previous bar's `close` is needed for indicator calculations during an empty period, the feature engine uses the last known close price.

---

## Developing Bar Publishing

The bar builder publishes a developing `AtlasBarEvent` on every trade event. This provides the dashboard with a continuously updating candlestick. The developing bar event has `status: 'developing'` and does not include `indicators`.

The developing bar is published at most once per 100ms to prevent overwhelming the SSE stream during high-frequency periods. If more than one trade arrives within a 100ms window, only the final state of the developing bar is published at the end of the window.

---

## Bar Close Trigger

The bar builder uses a timer-based trigger to detect bar close. The timer fires at each 5-minute UTC boundary. The timer is set with a 50ms buffer to ensure all late-arriving trades from the closing bar have been processed before the bar is finalised.

```
Timer fires at: barCloseTs + 50ms
  → Finalise developing bar
  → Publish confirmed AtlasBarEvent
  → Reset developing bar state
```

The 50ms buffer is a design parameter. If DataBento's intraday replay shows that late-arriving trades consistently arrive more than 50ms after the bar boundary, this buffer must be increased.

---

## Session and RTH Classification

The bar builder classifies each confirmed bar into a session and RTH/ETH category. The classification is based on the bar's `barOpenTs` and the CME Globex trading schedule for MNQ:

| Session | Hours (ET) | RTH | Description |
|---|---|---|---|
| `PRE_OPEN` | 18:00–09:29 | No | Overnight/pre-market |
| `AM_OPEN` | 09:30–10:29 | Yes | Opening hour |
| `AM_CORE` | 10:30–11:59 | Yes | Morning core |
| `LUNCH` | 12:00–13:29 | Yes | Midday |
| `PM_CORE` | 13:30–15:59 | Yes | Afternoon core |
| `PM_CLOSE` | 16:00–16:59 | Yes | Closing hour |
| `ETH` | 17:00–17:59 | No | Extended trading hours |
| `CLOSED` | — | No | Daily maintenance break (17:00–18:00 ET) |

The `isRth` flag is `true` for all sessions from `AM_OPEN` through `PM_CLOSE` (09:30–16:59 ET). The `CLOSED` session (17:00–18:00 ET) produces no bars as the exchange is closed.

---

## Parity Requirements

The bar builder must produce bars that are numerically identical to TradingView's 5-minute bars. The parity requirements are:

| Field | Parity Tolerance | Measurement |
|---|---|---|
| `open` | 0.00 (exact match) | Absolute difference |
| `high` | 0.00 (exact match) | Absolute difference |
| `low` | 0.00 (exact match) | Absolute difference |
| `close` | 0.00 (exact match) | Absolute difference |
| `volume` | ≤ 0.1% | Relative difference |

The volume tolerance of 0.1% accounts for the possibility that TradingView and DataBento use slightly different volume aggregation rules (e.g., whether to include cancelled trades or auction trades).

OHLCV prices must be exact matches. Any OHLCV discrepancy triggers a parity alert and must be investigated before DataBento can be promoted to primary feed.

---

## Bar Builder State Persistence

The bar builder state (developing bar) is in-memory only. If the Atlas server restarts mid-bar, the developing bar is lost. On restart:

1. The bar builder connects to DataBento and requests intraday replay from the start of the current session (`start=0`)
2. DataBento replays all trades from the session start
3. The bar builder reconstructs all confirmed bars from the replay
4. The bar builder resumes the developing bar from the last trade in the replay
5. The `atlas_memory` table is checked for existing confirmed bars to avoid duplicates

The intraday replay ensures that no confirmed bars are lost on restart. The idempotency key for each bar is `{atlasSymbol}_{barOpenTs}`, preventing duplicate inserts.

---

## Error Handling

| Error Condition | Handling |
|---|---|
| Trade price outside valid range (< 0 or > 100,000) | Log and discard trade |
| Trade size = 0 | Log and discard trade |
| Sequence gap detected | Log gap, continue processing, trigger gap-fill request |
| Late trade (> 5 minutes old) | Log and discard |
| Contract roll mid-bar | Close current bar, start new bar |
| DataBento disconnect mid-bar | Retain developing bar state, resume on reconnect |
| Timer fires with no trades | Do not emit empty bar, reset timer |

---

## Feature Engine Integration

The bar builder emits confirmed `AtlasBarEvent` records to the event bus. The feature engine subscribes to these events and calculates all indicators. The feature engine then emits a new `AtlasBarEvent` with `indicators` populated. Only this featured bar triggers `processBar()`.

The bar builder has no knowledge of indicator calculations. It is responsible only for OHLCV construction and session classification.

---

*This specification governs the Atlas bar builder implementation in Sprint 122.*
