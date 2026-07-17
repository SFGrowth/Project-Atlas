# Atlas Live Chart Design

**Document type:** Component Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-007

---

## Overview

This document specifies the design of the Atlas live chart — the real-time candlestick chart displayed on the Atlas Nexus dashboard. The live chart is the primary visual interface for monitoring MNQ price action, trade annotations, and market structure during active trading sessions.

The live chart replaces the current static "last bar" display on the dashboard with a continuously updating candlestick chart that shows the developing bar in real time, historical confirmed bars, and trade entry/exit annotations.

---

## Chart Library Selection: TradingView Lightweight Charts

Atlas will use **TradingView Lightweight Charts** (Apache 2.0 license) as the charting library. This library is selected because:

- It is purpose-built for financial time-series data with candlestick, line, area, histogram, and bar series types
- It supports real-time updates via `series.update()` for developing bars and `series.setData()` for historical data
- It supports series markers for trade annotations (entry, exit, stop, target)
- It is open source under the Apache 2.0 license, permitting commercial use without licensing fees
- It is maintained by TradingView and has an active development community
- It is lightweight (< 50KB gzipped) and performs well on mobile devices
- It does not require TradingView platform access, Pine Script, or TradingView alerts

The library requires attribution to TradingView per the NOTICE file. This attribution is displayed in the chart footer.

---

## Chart Architecture

The live chart is implemented as a React component (`client/src/components/LiveChart.tsx`) that:

1. Initialises the Lightweight Charts instance on mount
2. Loads historical confirmed bars from the tRPC API on mount
3. Subscribes to the SSE stream for real-time updates
4. Updates the developing bar on every `atlas_bar_developing` SSE event
5. Closes the developing bar and opens a new one on every `atlas_bar_confirmed` SSE event
6. Renders trade annotations from the paper trade and live trade records

### Component Interface

```typescript
interface LiveChartProps {
  symbol: string;           // "MNQ1!" — the instrument to display
  timeframe: number;        // 5 — minutes per bar
  lookbackBars?: number;    // Default: 200 — historical bars to load
  showVolume?: boolean;     // Default: true
  showVwap?: boolean;       // Default: true
  showEmas?: boolean;       // Default: true (EMA 9, 21, 50)
  showTradeAnnotations?: boolean; // Default: true
  height?: number;          // Default: 400 pixels
}
```

---

## Data Loading Strategy

### Historical Data (On Mount)

On component mount, the chart loads the last `lookbackBars` confirmed bars from the tRPC API:

```typescript
const { data: historicalBars } = trpc.marketData.getRecentBars.useQuery({
  symbol: 'MNQ1!',
  limit: 200,
});
```

The tRPC procedure returns bars from `atlas_memory` in ascending timestamp order. Each bar is converted to the Lightweight Charts `CandlestickData` format:

```typescript
interface CandlestickData {
  time: UTCTimestamp;  // Unix seconds (not milliseconds)
  open: number;
  high: number;
  low: number;
  close: number;
}
```

Note: Lightweight Charts uses Unix seconds for the `time` field, not milliseconds. The conversion is `time = barOpenTs / 1000`.

### Real-Time Updates (SSE)

The chart subscribes to the SSE stream and processes three event types:

**`atlas_bar_developing`:** Updates the current developing bar. The chart calls `series.update()` with the developing bar's current OHLCV:

```typescript
sseEventSource.addEventListener('atlas_bar_developing', (event) => {
  const bar = JSON.parse(event.data) as AtlasBarEvent;
  candlestickSeries.update({
    time: bar.barOpenTs / 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  });
});
```

**`atlas_bar_confirmed`:** Closes the developing bar and starts a new one. The chart calls `series.update()` with the confirmed bar's final OHLCV:

```typescript
sseEventSource.addEventListener('atlas_bar_confirmed', (event) => {
  const bar = JSON.parse(event.data) as AtlasBarEvent;
  candlestickSeries.update({
    time: bar.barOpenTs / 1000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  });
});
```

**`atlas_feed_health`:** Updates the feed health indicator displayed below the chart.

---

## Chart Overlays

The live chart displays the following overlays:

### VWAP Line

VWAP is displayed as a line series overlaid on the candlestick chart. The VWAP value is taken from the `indicators.vwap` field of the confirmed `AtlasBarEvent`. The VWAP line resets at the start of each RTH session (09:30 ET).

```typescript
const vwapSeries = chart.addLineSeries({
  color: '#00d4ff',
  lineWidth: 1,
  lineStyle: LineStyle.Dashed,
  title: 'VWAP',
});
```

### EMA Lines

EMA(9), EMA(21), and EMA(50) are displayed as line series. They are populated from the `indicators.ema9`, `indicators.ema21`, and `indicators.ema50` fields of confirmed bars.

| EMA | Colour | Line Width |
|---|---|---|
| EMA(9) | `#ff6b35` (orange) | 1px |
| EMA(21) | `#ffd700` (gold) | 1px |
| EMA(50) | `#00ff88` (green) | 1.5px |

### Volume Histogram

Volume is displayed as a histogram series below the candlestick chart. Bullish bars (close > open) are coloured green; bearish bars are coloured red.

---

## Chart Theming

The chart uses a dark theme consistent with the Atlas Nexus ORION design system:

```typescript
const chartOptions = {
  layout: {
    background: { color: '#0a0e1a' },  // Atlas dark background
    textColor: '#94a3b8',              // Slate-400
  },
  grid: {
    vertLines: { color: '#1e293b' },   // Slate-800
    horzLines: { color: '#1e293b' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#00d4ff', width: 1, style: LineStyle.Dashed },
    horzLine: { color: '#00d4ff', width: 1, style: LineStyle.Dashed },
  },
  rightPriceScale: {
    borderColor: '#1e293b',
  },
  timeScale: {
    borderColor: '#1e293b',
    timeVisible: true,
    secondsVisible: false,
  },
};
```

---

## Feed Health Indicator

A feed health indicator is displayed below the chart. It shows the current state of the DataBento feed and the M-16 fallback:

| State | Colour | Label |
|---|---|---|
| `CONNECTED` | Green | LIVE — DataBento |
| `DEGRADED` | Yellow | DEGRADED — DataBento |
| `RECONNECTING` | Orange | RECONNECTING |
| `FALLBACK_ACTIVE` | Yellow | FALLBACK — TradingView M-16 |
| `OFFLINE` | Red | OFFLINE |
| `UNKNOWN` | Grey | CONNECTING... |

The feed health indicator is updated by `atlas_feed_health` SSE events.

---

## Chart Placement in the Dashboard

The live chart is placed on the Home Dashboard page as the primary visual element. It occupies the full width of the main content area and is approximately 400px tall. The chart is visible without scrolling on a standard desktop viewport (1280×720).

The chart is also available as a full-screen view accessible from the Observatory page, where it occupies the full viewport height.

---

## Performance Considerations

The Lightweight Charts library is designed for high-frequency updates. However, the dashboard SSE stream is rate-limited to one developing-bar update per 100ms (as specified in `BAR_BUILDER_SPEC.md`). This means the chart receives at most 10 updates per second during active trading, which is well within the library's performance envelope.

The chart does not receive individual tick events. It receives only developing-bar updates (aggregated OHLCV) and confirmed-bar events. This design prevents the chart from becoming a performance bottleneck during high-tick-rate periods.

---

## Responsive Design

The chart is responsive and adapts to the container width. On mobile devices (< 768px), the chart height is reduced to 250px and the volume histogram is hidden. The EMA and VWAP overlays remain visible on all screen sizes.

---

*This document specifies the Atlas live chart implementation for Sprint 124.*
