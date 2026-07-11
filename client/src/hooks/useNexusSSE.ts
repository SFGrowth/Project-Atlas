import { useEffect, useRef, useState, useCallback } from "react";
import type { PipelineReportPayload, NexusReport } from "@shared/pipelineTypes";

export type SSEStatus = "CONNECTING" | "CONNECTED" | "ERROR";
export type BackendStatus = "OK" | "DEGRADED" | "OFFLINE";
/**
 * Sprint 082 — Five data freshness states:
 * LIVE         — Last bar < 6 minutes ago, SSE connected, payload valid
 * STALE        — Last bar > 6 minutes ago (market likely closed or alert paused)
 * DEGRADED     — SSE reconnecting or backend returning errors; data may be delayed
 * OFFLINE      — SSE has been disconnected for > 2 minutes (backend unreachable)
 * DATA_INVALID — Payload received but failed schema validation or missing required fields
 * UNKNOWN      — Initial state before first data arrives
 */
export type DataFreshness = "LIVE" | "STALE" | "DEGRADED" | "OFFLINE" | "DATA_INVALID" | "UNKNOWN";

export interface NexusState {
  sseStatus: SSEStatus;
  backendStatus: BackendStatus;
  dataFreshness: DataFreshness;
  latestReport: NexusReport | null;
  clientId: string | null;
  sseClients: number;
  lastUpdated: number | null;
  /** Timestamp when SSE last had an error (for OFFLINE detection) */
  lastErrorAt: number | null;
}

const STALE_THRESHOLD_MS    = 6 * 60 * 1000;   // 6 minutes — one 5m bar + buffer
const OFFLINE_THRESHOLD_MS  = 2 * 60 * 1000;   // 2 minutes of SSE error → OFFLINE

/** Validate that a received payload has the minimum required fields */
function isPayloadValid(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return !!(p.symbol && p.master_state && (p.bar_time || p.timestamp_utc));
}

export function useNexusSSE() {
  const [state, setState] = useState<NexusState>({
    sseStatus: "CONNECTING",
    backendStatus: "OK",
    dataFreshness: "UNKNOWN",
    latestReport: null,
    clientId: null,
    sseClients: 0,
    lastUpdated: null,
    lastErrorAt: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const freshnessTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const computeFreshness = useCallback((
    lastUpdated: number | null,
    lastErrorAt: number | null,
    sseStatus: SSEStatus,
    backendStatus: BackendStatus,
  ): DataFreshness => {
    // OFFLINE: SSE has been in error state for > 2 minutes
    if (sseStatus === "ERROR" && lastErrorAt && (Date.now() - lastErrorAt) > OFFLINE_THRESHOLD_MS) {
      return "OFFLINE";
    }
    // DEGRADED: SSE is reconnecting or backend is not OK
    if (sseStatus === "ERROR" || backendStatus !== "OK") {
      return "DEGRADED";
    }
    // UNKNOWN: no data yet
    if (!lastUpdated) return "UNKNOWN";
    // LIVE / STALE based on age
    const age = Date.now() - lastUpdated;
    return age < STALE_THRESHOLD_MS ? "LIVE" : "STALE";
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setState((s) => ({ ...s, sseStatus: "CONNECTING" }));
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        reconnectDelay.current = 1000;
        setState((s) => ({
          ...s,
          sseStatus: "CONNECTED",
          backendStatus: "OK",
          lastErrorAt: null,
          clientId: data.client_id ?? null,
          dataFreshness: computeFreshness(s.lastUpdated, null, "CONNECTED", "OK"),
        }));
      } catch {}
    });

    es.addEventListener("catchup", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.payload) {
          const valid = isPayloadValid(data.payload);
          const now = Date.now();
          setState((s) => ({
            ...s,
            latestReport: {
              id: data.id,
              receivedAt: data.receivedAt,
              payload: data.payload as PipelineReportPayload,
            },
            lastUpdated: now,
            dataFreshness: valid ? "LIVE" : "DATA_INVALID",
          }));
        }
      } catch {}
    });

    es.addEventListener("pipeline_report", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.payload) {
          const valid = isPayloadValid(data.payload);
          const now = Date.now();
          setState((s) => ({
            ...s,
            latestReport: {
              id: data.id,
              receivedAt: data.receivedAt,
              payload: data.payload as PipelineReportPayload,
            },
            lastUpdated: now,
            dataFreshness: valid ? "LIVE" : "DATA_INVALID",
          }));
        }
      } catch {}
    });

    es.addEventListener("heartbeat", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setState((s) => ({
          ...s,
          backendStatus: "OK",
          sseClients: data.sse_clients ?? s.sseClients,
        }));
      } catch {}
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      const now = Date.now();
      setState((s) => {
        const errorAt = s.lastErrorAt ?? now;
        const freshness = computeFreshness(s.lastUpdated, errorAt, "ERROR", "DEGRADED");
        return {
          ...s,
          sseStatus: "ERROR",
          backendStatus: "DEGRADED",
          lastErrorAt: errorAt,
          dataFreshness: freshness,
        };
      });
      // Exponential backoff reconnect
      const delay = Math.min(reconnectDelay.current, 30000);
      reconnectDelay.current = Math.min(delay * 1.5, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [computeFreshness]);

  useEffect(() => {
    connect();

    // Freshness checker every 30s — re-evaluates LIVE/STALE/OFFLINE transitions
    freshnessTimer.current = setInterval(() => {
      setState((s) => ({
        ...s,
        dataFreshness: computeFreshness(s.lastUpdated, s.lastErrorAt, s.sseStatus, s.backendStatus),
      }));
    }, 30000);

    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (freshnessTimer.current) clearInterval(freshnessTimer.current);
    };
  }, [connect, computeFreshness]);

  return state;
}
