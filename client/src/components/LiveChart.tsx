/**
 * LiveChart — Sprint 123
 * Real-time MNQ candlestick chart powered by Lightweight Charts v5.
 *
 * Data flow:
 *   1. Seeds last 200 bars from trpc.nexus.getRecentBars (REST, once on mount)
 *   2. atlas_bar_confirmed SSE → series.update() (confirmed closed bar)
 *   3. atlas_bar_developing SSE → series.update() (live developing bar, suppressed if ≤ last confirmed)
 *   4. atlas_feed_health SSE → feed status badge
 *
 * Overlays:
 *   VWAP  — arc-cyan solid line
 *   EMA9  — stark-gold dashed line
 *   EMA21 — purple dashed line
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BarPayload {
  time: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number;
  vwap?: number | null;
  ema9?: number | null;
  ema21?: number | null;
  session?: string | null;
  regime?: string | null;
}

type FeedStatus = "LIVE" | "DELAYED" | "OFFLINE" | "SEEDING";

// ─── Constants ────────────────────────────────────────────────────────────────

const LIVE_THRESHOLD_MS   = 6 * 60 * 1000;   // 6 min
const DELAYED_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

const CHART_THEME = {
  bg:          "oklch(0.10 0.04 220)",
  grid:        "oklch(0.18 0.06 220 / 0.4)",
  border:      "oklch(0.22 0.06 220 / 0.5)",
  text:        "oklch(0.65 0.08 220)",
  arcCyan:     "#4dd9f0",
  starkGold:   "#f0c040",
  purple:      "#a78bfa",
  bullCandle:  "#4ade80",
  bearCandle:  "#f87171",
  wickBull:    "#22c55e",
  wickBear:    "#ef4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCandle(b: BarPayload): CandlestickData<Time> | null {
  if (b.open == null || b.high == null || b.low == null || b.close == null) return null;
  return { time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close };
}

function feedStatusClass(s: FeedStatus): string {
  switch (s) {
    case "LIVE":    return "status-live";
    case "DELAYED": return "status-warn";
    case "OFFLINE": return "status-error";
    default:        return "status-warn";
  }
}

function feedStatusDot(s: FeedStatus): string {
  switch (s) {
    case "LIVE":    return "bg-[var(--arc-cyan)] shadow-[0_0_6px_var(--arc-cyan)]";
    case "DELAYED": return "bg-[var(--stark-gold)] shadow-[0_0_6px_var(--stark-gold)]";
    case "OFFLINE": return "bg-[var(--danger-red)] shadow-[0_0_6px_var(--danger-red)]";
    default:        return "bg-[var(--stark-gold)]";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vwapRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref     = useRef<ISeriesApi<"Line"> | null>(null);

  // Track the timestamp of the last confirmed bar to suppress stale developing events
  const lastConfirmedTs = useRef<number>(0);

  const [feedStatus, setFeedStatus] = useState<FeedStatus>("SEEDING");
  const [lastBarIso, setLastBarIso] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  // ── Seed data from tRPC ──────────────────────────────────────────────────
  const { data: seedBars } = trpc.nexus.getRecentBars.useQuery(
    { limit: 200 },
    { refetchOnWindowFocus: false, staleTime: Infinity },
  );

  // ── Chart initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_THEME.bg },
        textColor: CHART_THEME.text,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid },
        horzLines: { color: CHART_THEME.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: CHART_THEME.border,
        textColor: CHART_THEME.text,
      },
      timeScale: {
        borderColor: CHART_THEME.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          const hh = d.getUTCHours().toString().padStart(2, "0");
          const mm = d.getUTCMinutes().toString().padStart(2, "0");
          return `${hh}:${mm}`;
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // Candlestick series
    const candles = chart.addSeries(CandlestickSeries, {
      upColor:          CHART_THEME.bullCandle,
      downColor:        CHART_THEME.bearCandle,
      wickUpColor:      CHART_THEME.wickBull,
      wickDownColor:    CHART_THEME.wickBear,
      borderUpColor:    CHART_THEME.bullCandle,
      borderDownColor:  CHART_THEME.bearCandle,
    });
    candleRef.current = candles;

    // VWAP overlay — arc-cyan solid
    const vwap = chart.addSeries(LineSeries, {
      color:     CHART_THEME.arcCyan,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    vwapRef.current = vwap;

    // EMA9 overlay — stark-gold dashed
    const ema9 = chart.addSeries(LineSeries, {
      color:     CHART_THEME.starkGold,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema9Ref.current = ema9;

    // EMA21 overlay — purple dashed
    const ema21 = chart.addSeries(LineSeries, {
      color:     CHART_THEME.purple,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema21Ref.current = ema21;

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      vwapRef.current   = null;
      ema9Ref.current   = null;
      ema21Ref.current  = null;
    };
  }, []);

  // ── Seed bars into chart ─────────────────────────────────────────────────
  useEffect(() => {
    if (!seedBars || !candleRef.current || seeded) return;

    const candles: CandlestickData<Time>[] = [];
    const vwapPts: LineData<Time>[]        = [];
    const ema9Pts: LineData<Time>[]        = [];
    const ema21Pts: LineData<Time>[]       = [];

    for (const b of seedBars) {
      const c = toCandle(b);
      if (c) candles.push(c);
      if (b.vwap  != null) vwapPts.push({ time: b.time as Time, value: b.vwap });
      if (b.ema9  != null) ema9Pts.push({ time: b.time as Time, value: b.ema9 });
      if (b.ema21 != null) ema21Pts.push({ time: b.time as Time, value: b.ema21 });
    }

    if (candles.length > 0) {
      candleRef.current.setData(candles);
      vwapRef.current?.setData(vwapPts);
      ema9Ref.current?.setData(ema9Pts);
      ema21Ref.current?.setData(ema21Pts);
      chartRef.current?.timeScale().fitContent();

      const last = seedBars[seedBars.length - 1];
      if (last) {
        lastConfirmedTs.current = last.time;
        const ageMs = Date.now() - last.time * 1000;
        if (ageMs < LIVE_THRESHOLD_MS)        setFeedStatus("LIVE");
        else if (ageMs < DELAYED_THRESHOLD_MS) setFeedStatus("DELAYED");
        else                                   setFeedStatus("OFFLINE");
        setLastBarIso(new Date(last.time * 1000).toISOString());
      }
    }

    setSeeded(true);
  }, [seedBars, seeded]);

  // ── SSE subscription ─────────────────────────────────────────────────────
  const applyBar = useCallback((b: BarPayload, confirmed: boolean) => {
    if (!candleRef.current) return;
    const c = toCandle(b);
    if (!c) return;

    if (confirmed) {
      candleRef.current.update(c);
      if (b.vwap  != null) vwapRef.current?.update({ time: b.time as Time, value: b.vwap });
      if (b.ema9  != null) ema9Ref.current?.update({ time: b.time as Time, value: b.ema9 });
      if (b.ema21 != null) ema21Ref.current?.update({ time: b.time as Time, value: b.ema21 });
      lastConfirmedTs.current = b.time;
    } else {
      // Developing bar: only show if newer than last confirmed
      if (b.time > lastConfirmedTs.current) {
        candleRef.current.update(c);
      }
    }
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("atlas_bar_confirmed", (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as BarPayload;
        applyBar(data, true);
        setLastBarIso(new Date(data.time * 1000).toISOString());
        setFeedStatus("LIVE");
      } catch {}
    });

    es.addEventListener("atlas_bar_developing", (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as BarPayload;
        applyBar(data, false);
      } catch {}
    });

    es.addEventListener("atlas_feed_health", (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as {
          status: string;
          lastBarTime: number;
          lastBarTimeIso: string;
        };
        const ageMs = Date.now() - data.lastBarTime;
        if (ageMs < LIVE_THRESHOLD_MS)        setFeedStatus("LIVE");
        else if (ageMs < DELAYED_THRESHOLD_MS) setFeedStatus("DELAYED");
        else                                   setFeedStatus("OFFLINE");
        setLastBarIso(data.lastBarTimeIso);
      } catch {}
    });

    return () => es.close();
  }, [applyBar]);

  // ── Feed health staleness check (every 60s) ──────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (!lastBarIso) return;
      const ageMs = Date.now() - new Date(lastBarIso).getTime();
      if (ageMs >= DELAYED_THRESHOLD_MS) setFeedStatus("OFFLINE");
      else if (ageMs >= LIVE_THRESHOLD_MS) setFeedStatus("DELAYED");
    }, 60_000);
    return () => clearInterval(t);
  }, [lastBarIso]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="hud-panel hud-panel-br flex flex-col">
      {/* Header */}
      <div className="hud-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="hud-header-dot" />
          MNQ1! — 5-Min Live Chart
          <span className="text-[9px] font-mono text-[var(--color-muted-foreground)] ml-1 tracking-wider">
            VWAP · EMA9 · EMA21
          </span>
        </div>
        <div className="flex items-center gap-2 mr-1">
          {/* Feed status badge */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${feedStatusDot(feedStatus)}`} />
            <span className={`status-badge ${feedStatusClass(feedStatus)} text-[10px]`}>
              {feedStatus}
            </span>
          </div>
          {/* Last bar time */}
          {lastBarIso && (
            <span className="text-[9px] font-mono text-[var(--color-muted-foreground)]">
              {new Date(lastBarIso).toUTCString().slice(17, 22)} UTC
            </span>
          )}
          {/* Legend */}
          <div className="flex items-center gap-2 text-[9px] font-mono ml-2">
            <span style={{ color: CHART_THEME.arcCyan }}>── VWAP</span>
            <span style={{ color: CHART_THEME.starkGold }}>-- EMA9</span>
            <span style={{ color: CHART_THEME.purple }}>-- EMA21</span>
          </div>
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: "320px", minHeight: "240px" }}
      />

      {/* Empty state */}
      {!seeded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[var(--color-muted-foreground)] text-xs font-mono animate-pulse">
            Seeding chart data…
          </span>
        </div>
      )}
    </div>
  );
}
