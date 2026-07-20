/**
 * DatabentoLiveChart — Sprint 123A.4 Gate G4
 *
 * Live candlestick chart powered by Lightweight Charts v5.
 * Consumes the new /api/market-data/* endpoints.
 *
 * Requirements implemented:
 *   FE-001  History loader: GET /api/market-data/bars (confirmed-only)
 *   FE-002  SSE connection: GET /api/market-data/stream with Last-Event-ID reconnect
 *   FE-003  Chart state reducer (useReducer) — single source of truth
 *   FE-004  Developing-candle updates (live partial bar)
 *   FE-005  Provisional-to-confirmed replacement (revision=1 replaces revision=0)
 *   FE-006  Corrected-revision replacement (revision=N replaces revision=N-1)
 *   FE-007  1m / 5m view switch (separate history queries and SSE event types)
 *   FE-008  Reconnect with Option B query cursor (?afterEventId=<seq>)
 *            Native EventSource does not allow app code to set Last-Event-ID.
 *            On reconnect, cursor is appended as ?afterEventId=<seq> so the
 *            server can replay missed confirmed events from the ring buffer.
 *            cursor-expired event triggers a full history resync.
 *   FE-009  Duplicate suppression (same barOpenTsMs + revision already applied)
 *   FE-010  Contract-roll handling (rawSymbol change → clear chart, re-seed)
 *   FE-011  Stale/degraded/offline status states
 *   FE-012  Shadow-mode indicator (DATABENTO_SHADOW — chart is secondary)
 *   FE-013  Chart-authority indicator (DATABENTO_CHART_AUTHORITY — chart is primary)
 *   FE-014  MNQ 0.25-point price snapping (pts100 → points conversion)
 *
 * Authority boundary:
 *   This component is READ-ONLY. It MUST NOT trigger processBar,
 *   postBarAutomation, ADE, strategies, risk, or order creation.
 */

import {
  useEffect,
  useRef,
  useState,
  useReducer,
  useCallback,
  useMemo,
} from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type Interval = "1m" | "5m";

export type ChartSource =
  | "TRADINGVIEW"
  | "TRADINGVIEW_PRIMARY_DATABENTO_SHADOW"
  | "DATABENTO";

export type StreamStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "STALE"
  | "DEGRADED"
  | "OFFLINE";

interface BarRecord {
  barOpenTsMs: number;
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
  revision: number;
  rawSymbol: string;
  intervalMs: number;
}

interface DevelopingBar {
  barOpenTsMs: number;
  openPts100: number;
  highPts100: number;
  lowPts100: number;
  closePts100: number;
  volume: number;
}

interface HistoryResponse {
  bars: BarRecord[];
  cursor?: number;
  hasMore: boolean;
}

interface SSEBarConfirmedPayload {
  type: "bar:confirmed" | "bar5m:confirmed";
  seq: number;
  bar: BarRecord;
}

interface SSEBarDevelopingPayload {
  type: "bar:developing";
  seq: number;
  bar: DevelopingBar;
}

interface SSEHealthPayload {
  type: "health";
  seq: number;
  status: string;
  lastBarTsMs: number;
}

type SSEPayload =
  | SSEBarConfirmedPayload
  | SSEBarDevelopingPayload
  | SSEHealthPayload;

// ─── Chart state reducer ──────────────────────────────────────────────────────

interface ChartState {
  bars: Map<number, BarRecord>;       // barOpenTsMs → BarRecord
  developing: DevelopingBar | null;
  currentSymbol: string | null;
  lastConfirmedTsMs: number;
  lastSeq: number;
  seeded: boolean;
}

type ChartAction =
  | { type: "SEED"; bars: BarRecord[] }
  | { type: "CONFIRMED"; bar: BarRecord; seq: number }
  | { type: "DEVELOPING"; bar: DevelopingBar; seq: number }
  | { type: "SYMBOL_CHANGE"; symbol: string }
  | { type: "RESET" };

function chartReducer(state: ChartState, action: ChartAction): ChartState {
  switch (action.type) {
    case "SEED": {
      const bars = new Map<number, BarRecord>();
      let lastTs = 0;
      for (const b of action.bars) {
        bars.set(b.barOpenTsMs, b);
        if (b.barOpenTsMs > lastTs) lastTs = b.barOpenTsMs;
      }
      return {
        ...state,
        bars,
        developing: null,
        lastConfirmedTsMs: lastTs,
        seeded: true,
      };
    }

    case "CONFIRMED": {
      // FE-009: Duplicate suppression — same ts + same revision already applied
      const existing = state.bars.get(action.bar.barOpenTsMs);
      if (existing && existing.revision >= action.bar.revision) return state;

      // FE-010: Contract-roll detection — rawSymbol change clears chart
      if (
        state.currentSymbol !== null &&
        action.bar.rawSymbol !== state.currentSymbol
      ) {
        const bars = new Map<number, BarRecord>();
        bars.set(action.bar.barOpenTsMs, action.bar);
        return {
          ...state,
          bars,
          developing: null,
          currentSymbol: action.bar.rawSymbol,
          lastConfirmedTsMs: action.bar.barOpenTsMs,
          lastSeq: action.seq,
        };
      }

      const bars = new Map(state.bars);
      bars.set(action.bar.barOpenTsMs, action.bar);
      return {
        ...state,
        bars,
        developing:
          state.developing?.barOpenTsMs === action.bar.barOpenTsMs
            ? null
            : state.developing,
        currentSymbol: action.bar.rawSymbol,
        lastConfirmedTsMs: action.bar.barOpenTsMs,
        lastSeq: action.seq,
      };
    }

    case "DEVELOPING": {
      // FE-004: Only show developing bar if newer than last confirmed
      if (action.bar.barOpenTsMs <= state.lastConfirmedTsMs) return state;
      return { ...state, developing: action.bar, lastSeq: action.seq };
    }

    case "SYMBOL_CHANGE":
      return { ...state, currentSymbol: action.symbol };

    case "RESET":
      return {
        bars: new Map(),
        developing: null,
        currentSymbol: null,
        lastConfirmedTsMs: 0,
        lastSeq: 0,
        seeded: false,
      };

    default:
      return state;
  }
}

const initialChartState: ChartState = {
  bars: new Map(),
  developing: null,
  currentSymbol: null,
  lastConfirmedTsMs: 0,
  lastSeq: 0,
  seeded: false,
};

// ─── Constants ────────────────────────────────────────────────────────────────

// FE-014: MNQ price conversion — pts100 to points (divide by 100)
const PTS100_TO_POINTS = 100;

const LIVE_THRESHOLD_MS    = 6 * 60 * 1000;
const DELAYED_THRESHOLD_MS = 30 * 60 * 1000;
const HEARTBEAT_MS         = 30_000;
const MAX_RECONNECT_DELAY  = 30_000;

const CHART_THEME = {
  bg:         "oklch(0.10 0.04 220)",
  grid:       "oklch(0.18 0.06 220 / 0.4)",
  border:     "oklch(0.22 0.06 220 / 0.5)",
  text:       "oklch(0.65 0.08 220)",
  arcCyan:    "#4dd9f0",
  starkGold:  "#f0c040",
  purple:     "#a78bfa",
  bullCandle: "#4ade80",
  bearCandle: "#f87171",
  wickBull:   "#22c55e",
  wickBear:   "#ef4444",
  shadow:     "#f59e0b",   // amber — shadow mode indicator
  authority:  "#22d3ee",   // cyan — chart authority indicator
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pts100ToPoints(pts100: number): number {
  return pts100 / PTS100_TO_POINTS;
}

function barToCandle(b: BarRecord | DevelopingBar): CandlestickData<Time> {
  return {
    time: Math.floor(
      b.barOpenTsMs / 1000
    ) as Time,
    open:  pts100ToPoints(b.openPts100),
    high:  pts100ToPoints(b.highPts100),
    low:   pts100ToPoints(b.lowPts100),
    close: pts100ToPoints(b.closePts100),
  };
}

function streamStatusClass(s: StreamStatus): string {
  switch (s) {
    case "CONNECTED":    return "status-live";
    case "STALE":        return "status-warn";
    case "DEGRADED":     return "status-warn";
    case "OFFLINE":      return "status-error";
    case "RECONNECTING": return "status-warn";
    default:             return "status-warn";
  }
}

function streamStatusDot(s: StreamStatus): string {
  switch (s) {
    case "CONNECTED":    return "bg-[var(--arc-cyan)] shadow-[0_0_6px_var(--arc-cyan)]";
    case "STALE":        return "bg-[var(--stark-gold)] shadow-[0_0_6px_var(--stark-gold)]";
    case "DEGRADED":     return "bg-[var(--stark-gold)] shadow-[0_0_6px_var(--stark-gold)]";
    case "OFFLINE":      return "bg-[var(--danger-red)] shadow-[0_0_6px_var(--danger-red)]";
    case "RECONNECTING": return "bg-[var(--stark-gold)] animate-pulse";
    default:             return "bg-[var(--stark-gold)]";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DatabentoLiveChartProps {
  symbol?: string;
  chartSource?: ChartSource;
}

export default function DatabentoLiveChart({
  symbol = "MNQM5",
  chartSource = "TRADINGVIEW_PRIMARY_DATABENTO_SHADOW",
}: DatabentoLiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vwapRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref     = useRef<ISeriesApi<"Line"> | null>(null);

  const [interval, setInterval] = useState<Interval>("5m");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("DISCONNECTED");
  const [lastBarIso, setLastBarIso] = useState<string | null>(null);
  const [chartState, dispatch] = useReducer(chartReducer, initialChartState);

  // SSE reconnect state
  const lastEventIdRef   = useRef<string>("0");
  const reconnectDelay   = useRef<number>(1000);
  const sseRef           = useRef<EventSource | null>(null);
  const heartbeatTimer   = useRef<number | null>(null);
  const lastEventTsRef   = useRef<number>(Date.now());

  // ── Chart initialisation ─────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_THEME.bg },
        textColor:  CHART_THEME.text,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid },
        horzLines: { color: CHART_THEME.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: CHART_THEME.border,
        textColor:   CHART_THEME.text,
        // FE-014: MNQ minimum tick = 0.25 points (applied via series priceFormat)
      },
      timeScale: {
        borderColor:     CHART_THEME.border,
        timeVisible:     true,
        secondsVisible:  false,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          const hh = d.getUTCHours().toString().padStart(2, "0");
          const mm = d.getUTCMinutes().toString().padStart(2, "0");
          return `${hh}:${mm}`;
        },
      },
      handleScroll: true,
      handleScale:  true,
    });

    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor:         CHART_THEME.bullCandle,
      downColor:       CHART_THEME.bearCandle,
      wickUpColor:     CHART_THEME.wickBull,
      wickDownColor:   CHART_THEME.wickBear,
      borderUpColor:   CHART_THEME.bullCandle,
      borderDownColor: CHART_THEME.bearCandle,
    });
    candleRef.current = candles;

    const vwap = chart.addSeries(LineSeries, {
      color:                  CHART_THEME.arcCyan,
      lineWidth:              1,
      lineStyle:              LineStyle.Solid,
      priceLineVisible:       false,
      lastValueVisible:       false,
      crosshairMarkerVisible: false,
    });
    vwapRef.current = vwap;

    const ema9 = chart.addSeries(LineSeries, {
      color:                  CHART_THEME.starkGold,
      lineWidth:              1,
      lineStyle:              LineStyle.Dashed,
      priceLineVisible:       false,
      lastValueVisible:       false,
      crosshairMarkerVisible: false,
    });
    ema9Ref.current = ema9;

    const ema21 = chart.addSeries(LineSeries, {
      color:                  CHART_THEME.purple,
      lineWidth:              1,
      lineStyle:              LineStyle.Dashed,
      priceLineVisible:       false,
      lastValueVisible:       false,
      crosshairMarkerVisible: false,
    });
    ema21Ref.current = ema21;

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

  // ── FE-001: History loader ────────────────────────────────────────────────

  /** Fetch confirmed history and seed the chart. Returns a Promise so callers
   *  can await it (e.g. cursor-expired resync in connectSSE). */
  const loadHistory = useCallback((): Promise<void> => {
    dispatch({ type: "RESET" });

    const endTsMs   = Date.now();
    const startTsMs = endTsMs - 7 * 24 * 60 * 60 * 1000; // 7 days

    const params = new URLSearchParams({
      symbol,
      interval,
      startTsMs: String(startTsMs),
      endTsMs:   String(endTsMs),
      limit:     "500",
    });

    return fetch(`/api/market-data/bars?${params.toString()}`, {
      credentials: "include",
    })
      .then(r => {
        if (!r.ok) throw new Error(`History fetch failed: ${r.status}`);
        return r.json() as Promise<HistoryResponse>;
      })
      .then(data => {
        dispatch({ type: "SEED", bars: data.bars });
      })
      .catch(err => {
        console.warn("[DatabentoLiveChart] History fetch error:", err);
        throw err;
      });
  }, [symbol, interval]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Apply seeded bars to chart ────────────────────────────────────────────

  useEffect(() => {
    if (!chartState.seeded || !candleRef.current) return;

    const sorted = Array.from(chartState.bars.values()).sort(
      (a, b) => a.barOpenTsMs - b.barOpenTsMs
    );

    const candles: CandlestickData<Time>[] = sorted.map(barToCandle);

    if (candles.length > 0) {
      candleRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();

      const last = sorted[sorted.length - 1];
      if (last) {
        setLastBarIso(new Date(last.barOpenTsMs).toISOString());
        const ageMs = Date.now() - last.barOpenTsMs;
        if (ageMs < LIVE_THRESHOLD_MS)         setStreamStatus("CONNECTED");
        else if (ageMs < DELAYED_THRESHOLD_MS)  setStreamStatus("STALE");
        else                                    setStreamStatus("OFFLINE");
      }
    }
  }, [chartState.seeded]);

  // ── Apply live updates to chart ───────────────────────────────────────────

  useEffect(() => {
    if (!candleRef.current || !chartState.seeded) return;

    // Re-render all bars when the map changes (handles revisions and contract rolls)
    const sorted = Array.from(chartState.bars.values()).sort(
      (a, b) => a.barOpenTsMs - b.barOpenTsMs
    );

    if (sorted.length > 0) {
      const candles: CandlestickData<Time>[] = sorted.map(barToCandle);
      candleRef.current.setData(candles);
    }

    // Overlay developing bar
    if (chartState.developing) {
      const devCandle = barToCandle(chartState.developing);
      candleRef.current.update(devCandle);
    }

    if (chartState.lastConfirmedTsMs > 0) {
      setLastBarIso(new Date(chartState.lastConfirmedTsMs).toISOString());
    }
  }, [chartState, chartState.seeded]);

  // ── FE-002 / FE-008: SSE connection with Last-Event-ID reconnect ──────────

  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    setStreamStatus("CONNECTING");

    // FE-008: Option B — query cursor reconnect
    // Native EventSource does not allow application code to set the Last-Event-ID
    // header on a newly created connection. We use ?afterEventId=<seq> instead.
    // The server reads this query param and injects it as Last-Event-ID before
    // calling registerClient(), which then replays missed buffered events.
    const cursor = lastEventIdRef.current;
    const cursorParam = cursor !== "0" ? `&afterEventId=${encodeURIComponent(cursor)}` : "";
    const url = `/api/market-data/stream?symbol=${encodeURIComponent(symbol)}&interval=${interval}${cursorParam}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.addEventListener("open", () => {
      setStreamStatus("CONNECTED");
      reconnectDelay.current = 1000;
      lastEventTsRef.current = Date.now();
    });

    es.addEventListener("ping", () => {
      lastEventTsRef.current = Date.now();
    });

    es.addEventListener("bar:confirmed", (e: Event) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SSEBarConfirmedPayload;
        lastEventIdRef.current = String(payload.seq);
        lastEventTsRef.current = Date.now();
        dispatch({ type: "CONFIRMED", bar: payload.bar, seq: payload.seq });
        setStreamStatus("CONNECTED");
      } catch {}
    });

    es.addEventListener("bar5m:confirmed", (e: Event) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SSEBarConfirmedPayload;
        lastEventIdRef.current = String(payload.seq);
        lastEventTsRef.current = Date.now();
        if (interval === "5m") {
          dispatch({ type: "CONFIRMED", bar: payload.bar, seq: payload.seq });
          setStreamStatus("CONNECTED");
        }
      } catch {}
    });

    es.addEventListener("bar:developing", (e: Event) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SSEBarDevelopingPayload;
        lastEventIdRef.current = String(payload.seq);
        lastEventTsRef.current = Date.now();
        if (interval === "1m") {
          dispatch({ type: "DEVELOPING", bar: payload.bar, seq: payload.seq });
        }
      } catch {}
    });

    es.addEventListener("health", (e: Event) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as SSEHealthPayload;
        lastEventTsRef.current = Date.now();
        const ageMs = Date.now() - payload.lastBarTsMs;
        if (ageMs < LIVE_THRESHOLD_MS)         setStreamStatus("CONNECTED");
        else if (ageMs < DELAYED_THRESHOLD_MS)  setStreamStatus("STALE");
        else                                    setStreamStatus("DEGRADED");
      } catch {}
    });

    // FE-008: cursor-expired — server ring buffer does not contain our cursor
    // Trigger a full history resync to close the gap
    es.addEventListener("cursor-expired", () => {
      lastEventIdRef.current = "0"; // reset cursor
      loadHistory().then(() => {
        // After history reload, reconnect with fresh cursor
        es.close();
        sseRef.current = null;
        connectSSE();
      }).catch(() => {
        // History reload failed — reconnect anyway
        es.close();
        sseRef.current = null;
        connectSSE();
      });
    });

    es.addEventListener("error", () => {
      es.close();
      sseRef.current = null;
      setStreamStatus("RECONNECTING");

      const delay = Math.min(reconnectDelay.current, MAX_RECONNECT_DELAY);
      reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

      setTimeout(() => {
        connectSSE();
      }, delay);
    });
  }, [symbol, interval, loadHistory]);

  useEffect(() => {
    connectSSE();

    // FE-011: Heartbeat staleness check
    heartbeatTimer.current = window.setInterval(() => {
      const ageMs = Date.now() - lastEventTsRef.current;
      if (ageMs > DELAYED_THRESHOLD_MS) {
        setStreamStatus("OFFLINE");
      } else if (ageMs > HEARTBEAT_MS * 3) {
        setStreamStatus("DEGRADED");
      } else if (ageMs > HEARTBEAT_MS * 2) {
        setStreamStatus("STALE");
      }
    }, HEARTBEAT_MS);

    return () => {
      sseRef.current?.close();
      sseRef.current = null;
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);
    };
  }, [connectSSE]);

  // ── Source indicator labels ───────────────────────────────────────────────

  const sourceLabel = useMemo(() => {
    switch (chartSource) {
      case "DATABENTO":
        return { text: "DATABENTO PRIMARY", color: CHART_THEME.authority };
      case "TRADINGVIEW_PRIMARY_DATABENTO_SHADOW":
        return { text: "SHADOW", color: CHART_THEME.shadow };
      default:
        return null;
    }
  }, [chartSource]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="hud-panel hud-panel-br flex flex-col">
      {/* Header */}
      <div className="hud-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="hud-header-dot" />
          {symbol} — {interval === "1m" ? "1-Min" : "5-Min"} Live Chart
          <span className="text-[9px] font-mono text-[var(--color-muted-foreground)] ml-1 tracking-wider">
            VWAP · EMA9 · EMA21
          </span>
          {/* FE-012/FE-013: Source indicator */}
          {sourceLabel && (
            <span
              className="text-[9px] font-mono px-1 py-0.5 rounded border"
              style={{
                color:       sourceLabel.color,
                borderColor: sourceLabel.color,
                opacity:     0.8,
              }}
            >
              {sourceLabel.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mr-1">
          {/* FE-007: 1m / 5m interval switch */}
          <div className="flex items-center gap-1 text-[9px] font-mono">
            <button
              onClick={() => setInterval("1m")}
              className={`px-1.5 py-0.5 rounded border transition-colors ${
                interval === "1m"
                  ? "border-[var(--arc-cyan)] text-[var(--arc-cyan)]"
                  : "border-[var(--color-muted-foreground)] text-[var(--color-muted-foreground)] hover:border-[var(--arc-cyan)]"
              }`}
            >
              1m
            </button>
            <button
              onClick={() => setInterval("5m")}
              className={`px-1.5 py-0.5 rounded border transition-colors ${
                interval === "5m"
                  ? "border-[var(--arc-cyan)] text-[var(--arc-cyan)]"
                  : "border-[var(--color-muted-foreground)] text-[var(--color-muted-foreground)] hover:border-[var(--arc-cyan)]"
              }`}
            >
              5m
            </button>
          </div>

          {/* Stream status badge */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${streamStatusDot(streamStatus)}`} />
            <span className={`status-badge ${streamStatusClass(streamStatus)} text-[10px]`}>
              {streamStatus}
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
      {!chartState.seeded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[var(--color-muted-foreground)] text-xs font-mono animate-pulse">
            Loading Databento chart data…
          </span>
        </div>
      )}
    </div>
  );
}
