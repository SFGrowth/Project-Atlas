# Atlas Trade Annotation Specification

**Document type:** Feature Specification  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17

---

## Overview

This document specifies the design of the Atlas trade annotation system — the mechanism by which paper trade and live trade entries, exits, stops, and targets are displayed as markers on the live chart. Trade annotations are a critical operational tool: they allow the trader to immediately see where Atlas entered and exited the market, whether stops were hit or targets were reached, and how each trade performed relative to the bar structure.

---

## Annotation Types

The following annotation types are supported:

| Type | Symbol | Colour | Position | Description |
|---|---|---|---|---|
| `ENTRY_LONG` | ▲ (up arrow) | Green | Below bar | Long entry signal |
| `ENTRY_SHORT` | ▼ (down arrow) | Red | Above bar | Short entry signal |
| `EXIT_TARGET` | ★ (star) | Gold | At target price | Target reached, position closed |
| `EXIT_STOP` | ✕ (cross) | Red | At stop price | Stop hit, position closed |
| `EXIT_MANUAL` | ◆ (diamond) | Grey | At exit price | Manual or time-based exit |
| `SIGNAL_REJECTED` | ○ (circle) | Orange | Below/above bar | Signal generated but rejected (ARI/TVL) |
| `CONTRACT_ROLL` | ↕ (double arrow) | Cyan | At roll bar | Contract roll detected |
| `FEED_RESTORED` | ⚡ (lightning) | Blue | At restoration bar | DataBento feed restored after outage |

---

## Annotation Data Model

Each annotation is stored in a new `atlas_chart_annotations` table:

```sql
CREATE TABLE atlas_chart_annotations (
  id VARCHAR(36) PRIMARY KEY,
  atlas_symbol VARCHAR(16) NOT NULL DEFAULT 'MNQ1!',
  bar_open_ts BIGINT NOT NULL,      -- UTC milliseconds of the bar this annotation belongs to
  annotation_type VARCHAR(32) NOT NULL,
  price DECIMAL(10, 2),             -- Price level for the annotation (null for bar-level annotations)
  label TEXT,                       -- Short label displayed on the chart
  tooltip TEXT,                     -- Full detail shown on hover
  model VARCHAR(16),                -- Strategy model: "A1", "A3", "B1", "SB1", "ORB1"
  direction VARCHAR(8),             -- "LONG" or "SHORT"
  trade_id VARCHAR(36),             -- Reference to paper_trades or wf_live_trades
  source VARCHAR(32) NOT NULL DEFAULT 'paper',  -- "paper", "live", "system"
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_symbol_bar (atlas_symbol, bar_open_ts),
  INDEX idx_trade_id (trade_id)
) ENGINE=InnoDB;
```

---

## Annotation Generation

Annotations are generated automatically by the following processes:

**Trade entry:** When `paperTradeEngine.ts` opens a new paper trade, it inserts an `ENTRY_LONG` or `ENTRY_SHORT` annotation at the bar's `barOpenTs`.

**Trade exit (target):** When a paper trade closes with `exitReason = 'TARGET'`, it inserts an `EXIT_TARGET` annotation at the exit bar's `barOpenTs`.

**Trade exit (stop):** When a paper trade closes with `exitReason = 'STOP'`, it inserts an `EXIT_STOP` annotation at the exit bar's `barOpenTs`.

**Signal rejected:** When ARI or TVL rejects a signal, an `SIGNAL_REJECTED` annotation is inserted with the rejection reason in the tooltip.

**Contract roll:** When the symbol registry detects a contract roll, a `CONTRACT_ROLL` annotation is inserted at the first bar of the new contract.

**Feed restored:** When the DataBento feed transitions from `RECONNECTING` to `CONNECTED`, a `FEED_RESTORED` annotation is inserted at the first bar received after restoration.

---

## Annotation Rendering

Annotations are rendered on the live chart using Lightweight Charts' series markers API:

```typescript
// Load annotations from tRPC API
const { data: annotations } = trpc.marketData.getAnnotations.useQuery({
  symbol: 'MNQ1!',
  fromTs: earliestBarTs,
  toTs: Date.now(),
});

// Convert to Lightweight Charts markers
const markers: SeriesMarker<Time>[] = annotations.map(ann => ({
  time: ann.barOpenTs / 1000,
  position: ann.annotationType.includes('LONG') ? 'belowBar' : 'aboveBar',
  color: getAnnotationColour(ann.annotationType),
  shape: getAnnotationShape(ann.annotationType),
  text: ann.label,
}));

candlestickSeries.setMarkers(markers);
```

### Marker Shape Mapping

| Annotation Type | Lightweight Charts Shape |
|---|---|
| `ENTRY_LONG` | `arrowUp` |
| `ENTRY_SHORT` | `arrowDown` |
| `EXIT_TARGET` | `circle` |
| `EXIT_STOP` | `square` |
| `EXIT_MANUAL` | `circle` |
| `SIGNAL_REJECTED` | `circle` |
| `CONTRACT_ROLL` | `square` |
| `FEED_RESTORED` | `arrowUp` |

---

## Annotation Tooltip

When the user hovers over a trade annotation, a tooltip displays the full trade details:

```
A1 — LONG ENTRY
Entry: 21,450.25
Stop: 21,420.00 (−30.25 pts, −$60.50)
Target: 21,510.75 (+60.50 pts, +$121.00)
Risk: $60.50 | Reward: $121.00 | R:R 2.0
Bar: 2025-06-15 09:35 ET
```

The tooltip is implemented as a custom HTML overlay positioned relative to the marker. It is shown on `mouseover` and hidden on `mouseout`.

---

## Real-Time Annotation Updates

New annotations are delivered to the chart via the SSE stream. When a new annotation is inserted into `atlas_chart_annotations`, the server broadcasts an `atlas_annotation` SSE event:

```typescript
sseEventSource.addEventListener('atlas_annotation', (event) => {
  const annotation = JSON.parse(event.data);
  // Add to existing markers array
  const newMarker = convertToMarker(annotation);
  const updatedMarkers = [...currentMarkers, newMarker];
  candlestickSeries.setMarkers(updatedMarkers);
});
```

---

## Annotation Filtering

The chart provides controls to filter which annotation types are displayed:

- Toggle paper trade annotations on/off
- Toggle live trade annotations on/off
- Toggle rejected signal annotations on/off
- Toggle system annotations (contract roll, feed restored) on/off
- Filter by model (A1, A3, B1, SB1, ORB-1)

These filters are stored in the user's browser localStorage and persist across sessions.

---

*This specification governs trade annotation implementation in Sprint 124.*
