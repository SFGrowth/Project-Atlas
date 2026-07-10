import { useEffect, useRef, useState, useCallback } from "react";
import type { PipelineReportPayload, NexusReport } from "@shared/pipelineTypes";

export type SSEStatus = "CONNECTING" | "CONNECTED" | "ERROR";
export type BackendStatus = "OK" | "DEGRADED" | "OFFLINE";
export type DataFreshness = "LIVE" | "STALE" | "UNKNOWN";

export interface NexusState {
  sseStatus: SSEStatus;
  backendStatus: BackendStatus;
  dataFreshness: DataFreshness;
  latestReport: NexusReport | null;
  clientId: string | null;
  sseClients: number;
  lastUpdated: number | null;
}

const STALE_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes (one 5m bar + buffer)

export function useNexusSSE() {
  const [state, setState] = useState<NexusState>({
    sseStatus: "CONNECTING",
    backendStatus: "OK",
    dataFreshness: "UNKNOWN",
    latestReport: null,
    clientId: null,
    sseClients: 0,
    lastUpdated: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const freshnessTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateFreshness = useCallback((lastUpdated: number | null) => {
    if (!lastUpdated) return;
    const age = Date.now() - lastUpdated;
    setState((s) => ({
      ...s,
      dataFreshness: age < STALE_THRESHOLD_MS ? "LIVE" : "STALE",
    }));
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
          clientId: data.client_id ?? null,
        }));
      } catch {}
    });

    es.addEventListener("catchup", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.payload) {
          const now = Date.now();
          setState((s) => ({
            ...s,
            latestReport: {
              id: data.id,
              receivedAt: data.receivedAt,
              payload: data.payload as PipelineReportPayload,
            },
            lastUpdated: now,
            dataFreshness: "LIVE",
          }));
        }
      } catch {}
    });

    es.addEventListener("pipeline_report", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        if (data.payload) {
          const now = Date.now();
          setState((s) => ({
            ...s,
            latestReport: {
              id: data.id,
              receivedAt: data.receivedAt,
              payload: data.payload as PipelineReportPayload,
            },
            lastUpdated: now,
            dataFreshness: "LIVE",
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
      setState((s) => ({
        ...s,
        sseStatus: "ERROR",
        backendStatus: "DEGRADED",
      }));
      // Exponential backoff reconnect
      const delay = Math.min(reconnectDelay.current, 30000);
      reconnectDelay.current = Math.min(delay * 1.5, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, []);

  useEffect(() => {
    connect();

    // Freshness checker every 30s
    freshnessTimer.current = setInterval(() => {
      setState((s) => {
        if (!s.lastUpdated) return s;
        const age = Date.now() - s.lastUpdated;
        return {
          ...s,
          dataFreshness: age < STALE_THRESHOLD_MS ? "LIVE" : "STALE",
        };
      });
    }, 30000);

    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (freshnessTimer.current) clearInterval(freshnessTimer.current);
    };
  }, [connect]);

  return state;
}
