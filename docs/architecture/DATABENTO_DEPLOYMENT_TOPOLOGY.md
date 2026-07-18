# Databento Deployment Topology
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

This document defines the deployment topology for the Databento market-data pipeline in both local development and production (Manus webdev) environments. The Python feed service and TypeScript Atlas server are separate processes that communicate via an authenticated private WebSocket bridge.

---

## Component Responsibilities

| Component | Language | Process | Responsibility |
|---|---|---|---|
| Databento Feed Service | Python | Separate process | Official Databento client, raw record normalisation, bridge publication |
| Bridge Server | TypeScript | Atlas server process | Authenticated WebSocket receiver, event bus publication |
| Bar Builder | TypeScript | Atlas server process | 1-min developing/confirmed candle construction |
| Five-Min Aggregator | TypeScript | Atlas server process | 5-min canonical bar aggregation |
| Contract Roll Manager | TypeScript | Atlas server process | Contract resolution, roll detection |
| Canonical Router | TypeScript | Atlas server process | Effectively-once dispatch to consumers |
| Tick Storage | TypeScript | Atlas server process | Async tick persistence |
| Atlas Event Bus | TypeScript | Atlas server process | In-process pub/sub |

---

## Local Development Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│  Developer Machine                                                   │
│                                                                      │
│  ┌─────────────────────────────┐   WebSocket (127.0.0.1:7890)       │
│  │  Python Feed Service        │◄──────────────────────────────┐    │
│  │  services/databento-feed/   │                               │    │
│  │                             │──────────────────────────────►│    │
│  │  • databento-live client    │   Authenticated               │    │
│  │  • trades normaliser        │   BRIDGE_AUTH_TOKEN           │    │
│  │  • ohlcv-1m publisher       │                               │    │
│  │  • definition publisher     │                               │    │
│  │  • symbol-mapping publisher │                               │    │
│  └─────────────────────────────┘                               │    │
│                                                                 │    │
│  ┌──────────────────────────────────────────────────────────────┘    │
│  │  Atlas Node.js Server (port 3000)                                 │
│  │                                                                   │
│  │  ┌─────────────────┐    ┌──────────────────────────────────┐     │
│  │  │  Bridge Server  │───►│  atlasEventBus (in-process)      │     │
│  │  │  :7890 (priv.)  │    └──────────────────────────────────┘     │
│  │  └─────────────────┘                    │                        │
│  │                                          │                        │
│  │                    ┌─────────────────────┼──────────────────┐    │
│  │                    │                     │                  │    │
│  │               ┌────▼────┐         ┌──────▼──────┐   ┌──────▼──┐ │
│  │               │  Bar    │         │  Contract   │   │  Tick   │ │
│  │               │ Builder │         │ Roll Manager│   │ Storage │ │
│  │               └────┬────┘         └─────────────┘   └─────────┘ │
│  │                    │                                              │
│  │               ┌────▼────────┐                                    │
│  │               │  5-Min Agg  │                                    │
│  │               └────┬────────┘                                    │
│  │                    │                                              │
│  │               ┌────▼────────────┐                                │
│  │               │ Canonical Router│                                │
│  │               └────┬────────────┘                                │
│  │                    │                                              │
│  │      ┌─────────────┼──────────────────────────┐                 │
│  │      │             │                          │                 │
│  │  ┌───▼────┐  ┌─────▼──────┐  ┌───────────────▼──────────────┐  │
│  │  │ Live   │  │ Behaviour  │  │ postBarAutomation             │  │
│  │  │ Learn  │  │  Engine    │  │ (DARWIN + certifyCandle etc.) │  │
│  │  └────────┘  └────────────┘  └──────────────────────────────┘  │
│  └───────────────────────────────────────────────────────────────── │
└─────────────────────────────────────────────────────────────────────┘
```

**Local startup sequence:**

1. `pnpm dev` starts the Atlas Node.js server (bridge server starts on `127.0.0.1:7890`)
2. `python services/databento-feed/main.py` starts the Python feed service
3. Python service connects to bridge on `127.0.0.1:7890` with `BRIDGE_AUTH_TOKEN`
4. Python service authenticates and begins streaming normalised records
5. Bridge server publishes records to `atlasEventBus`

Alternatively, `pnpm dev:full` starts both processes together (to be configured in Sprint 123A.2).

---

## Production Topology (Manus Webdev)

The Manus webdev platform runs a single container. The Python service and Node.js server share the same container. The bridge binds to `127.0.0.1:7890` and is never exposed externally.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Manus Webdev Container (atlasdash-j7nzp34b.manus.space)            │
│                                                                      │
│  ┌─────────────────────────────┐                                    │
│  │  Python Feed Service        │                                    │
│  │  (subprocess of Node.js     │                                    │
│  │   or separate process)      │                                    │
│  │                             │──► WebSocket 127.0.0.1:7890        │
│  └─────────────────────────────┘         │                         │
│                                           │                         │
│  ┌────────────────────────────────────────▼────────────────────┐   │
│  │  Atlas Node.js Server                                        │   │
│  │  Bridge Server (127.0.0.1:7890 — private, never public)      │   │
│  │  All downstream TypeScript components                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  TiDB (MySQL-compatible) — atlas_memory, atlas_bars_1m,    │     │
│  │  atlas_bars_5m, atlas_canonical_bars, etc.                 │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  External access: HTTPS only (port 443 via Manus proxy)             │
│  Bridge: 127.0.0.1:7890 — NEVER exposed externally                  │
└─────────────────────────────────────────────────────────────────────┘
                │
                │ HTTPS SSE
                ▼
         Browser (AtlasLiveChart.tsx)
```

---

## Bridge Authentication

The bridge uses token-based authentication. The `BRIDGE_AUTH_TOKEN` environment variable must be set in both the Python service and the Node.js server. The token is a random 32-byte hex string generated at deployment time.

**Authentication handshake:**

1. Python service connects to bridge WebSocket
2. Bridge server sends a challenge: `{ "type": "auth_challenge", "nonce": "<random>" }`
3. Python service responds: `{ "type": "auth_response", "token": "<BRIDGE_AUTH_TOKEN>" }`
4. Bridge server verifies the token
5. If valid: `{ "type": "auth_ok" }` — streaming begins
6. If invalid: connection closed immediately

**Security requirements:**

- `BRIDGE_AUTH_TOKEN` must never appear in logs
- `BRIDGE_AUTH_TOKEN` must never be sent to the browser
- The bridge must only accept connections from `127.0.0.1`
- The bridge port (`7890`) must never be exposed in any firewall rule or reverse proxy

---

## Environment Variables

| Variable | Process | Required | Notes |
|---|---|---|---|
| `DATABENTO_API_KEY` | Python | Required | Never logged, never sent to browser |
| `BRIDGE_AUTH_TOKEN` | Python + Node.js | Required | Must match in both processes |
| `DATABENTO_LIVE_ENABLED` | Python | Required | `false` until Sprint 123A.2 |
| `DATABENTO_TRADES_SCHEMA` | Python | Optional | Default: `trades` |
| `DATABENTO_BAR_SCHEMA` | Python | Optional | Default: `ohlcv-1m` |
| `BRIDGE_HOST` | Python | Optional | Default: `127.0.0.1` |
| `BRIDGE_PORT` | Python | Optional | Default: `7890` |
| `MARKET_DATA_AUTHORITY` | Node.js | Required | Default: `TRADINGVIEW_ONLY` |

---

## Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| Python service crash | Bridge connection drop | Node.js logs warning; feed health → `OFFLINE`; auto-restart if configured |
| Bridge connection refused | Python connection error | Python retries with exponential backoff (max 60s) |
| Bridge authentication failure | Auth response rejected | Python logs error; does not retry; alert |
| Node.js restart | Bridge server restarts | Python reconnects automatically |
| Container restart | Both processes restart | Python reconnects; replay requested for gap period |
