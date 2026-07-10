# TradingView Alert Configuration — Atlas Nexus M-15 Live Connection
**Sprint 077 | Prepared: 2026-07-10 | Status: READY TO CONFIGURE**

---

## Overview

This document records the exact configuration required to connect the TradingView ATLAS chart to the Atlas Nexus observability webhook. Once configured, every confirmed 5-minute MNQ1! bar will send a full PipelineReport JSON payload to Atlas Nexus, populating all dashboard panels in real time.

**Authentication model:** Dual-layer (TradingView cannot send custom HTTP headers)
- **Layer 1:** Secret path segment embedded in the webhook URL
- **Layer 2:** `webhook_secret` field inside the JSON payload body

Both layers must match the `ATLAS_WEBHOOK_TOKEN` environment secret. If either layer is missing or incorrect, the request is rejected with HTTP 403.

---

## Step 1 — Update M-15 Script Settings

In TradingView, open the ATLAS chart (Chart ID: `cDPu6HGG`) and open the M-15 indicator settings:

| Setting | Value |
|---|---|
| Enable Observability Webhook | ✅ ON |
| **Webhook Secret (ATLAS_WEBHOOK_TOKEN)** | **Paste the full ATLAS_WEBHOOK_TOKEN here** |
| Show JSON Preview Table | ✅ ON (optional, for verification) |
| Show Heartbeat Label | ✅ ON (optional) |

> **Security note:** The webhook secret is stored in the M-15 indicator settings on TradingView. It is embedded in the JSON payload body as `webhook_secret`. It is never displayed in the dashboard, never committed to git, and never logged in plaintext.

---

## Step 2 — Create the TradingView Alert

In TradingView on the ATLAS chart, create a new alert with these exact settings:

### Alert Condition
| Field | Value |
|---|---|
| Condition | `Atlas Observability Webhook — M-15` |
| Condition type | `alert() function calls only` |
| Frequency | `Once Per Bar Close` |

### Notifications — Webhook URL

```
https://atlasdash-j7nzp34b.manus.space/api/webhook/observe/<ATLAS_WEBHOOK_TOKEN>
```

> Replace `<ATLAS_WEBHOOK_TOKEN>` with the full 63-character hex token. The URL itself acts as Layer 1 authentication. Do not share this URL.

### Message Body

Leave the message field **empty** or set it to:
```
{{strategy.order.alert_message}}
```

The M-15 `alert()` function constructs and sends the full JSON payload automatically. TradingView will use the `alert()` message content as the POST body.

### Alert Name
```
ATLAS M-15 Observability — MNQ1! 5m
```

### Expiry
Set to maximum available (1 year or no expiry).

---

## Step 3 — Verify the Connection

After creating the alert, wait for the next confirmed 5-minute bar close (or trigger a manual test from TradingView). Then verify:

1. **Atlas Nexus Dashboard** → Overview Strip → `REPORTS` counter increments
2. **Atlas Nexus Dashboard** → Overview Strip → `DATA: LIVE` (green)
3. **Atlas Nexus Dashboard** → System Health → `LAST RECEIVED` shows recent timestamp
4. **Atlas Nexus Backend** → `GET https://atlasdash-j7nzp34b.manus.space/api/v1/health` returns `{"status":"ok","db":"ok"}`
5. **Atlas Nexus Backend** → `GET https://atlasdash-j7nzp34b.manus.space/api/v1/stats` shows `total_reports > 0`

---

## M-15 Payload Schema (v1.0.0)

The M-15 `alert()` fires once per confirmed bar close and sends a JSON payload with the following top-level fields:

| Field | Type | Description |
|---|---|---|
| `schema_version` | string | Always `"1.0.0"` |
| `payload_type` | string | Always `"OBSERVABILITY"` |
| `idempotency_key` | string | Unique per bar: `MNQ_5_<bar_index>_<timestamp>` |
| `webhook_secret` | string | Must match `ATLAS_WEBHOOK_TOKEN` (Layer 2 auth) |
| `pipeline_run_id` | string | Same as `idempotency_key` (pipeline run identifier) |
| `metadata` | object | `event_id`, `timestamp_utc`, `timestamp_et`, `bar_index`, `chart_id`, `ticker`, `timeframe`, `aps_version` |
| `pipeline_health` | object | Stage-by-stage health flags |
| `market_state` | object | Session, OHLCV, EMAs, ATR, ADX, volume, overnight levels |
| `model_evaluations` | object | A1, A3, B1 — signal, direction, entry/stop/target, edge score, basis |
| `ade_decision` | object | Candidate model, edge score, confidence, ranking, rationale |
| `ari_decision` | object | Approved/rejected, risk, contracts, daily P&L, drawdown, circuit breaker |
| `tvl_decision` | object | Status, 5 verification checks, blocking rule, execution permission |
| `position_state` | object | Trade ID, status, direction, entry/stop/target, P&L, MFE/MAE, bars |
| `reasoning` | object | Human-readable rationale for every pipeline stage |

---

## Backend Rejection Rules

The backend rejects payloads that fail any of these checks:

| Check | HTTP Response | Condition |
|---|---|---|
| Missing path token | 404 | URL does not include `/:token` |
| Incorrect path token | 403 | Path token ≠ `ATLAS_WEBHOOK_TOKEN` |
| Missing payload secret | 403 | `webhook_secret` field absent |
| Incorrect payload secret | 403 | `webhook_secret` ≠ `ATLAS_WEBHOOK_TOKEN` |
| Invalid JSON | 400 | Body is not valid JSON |
| Wrong symbol | 422 | `metadata.ticker` ≠ `MNQ1!` |
| Wrong timeframe | 422 | `metadata.timeframe` ≠ `5` |
| Wrong payload type | 422 | `payload_type` ≠ `OBSERVABILITY` |
| Unsupported schema version | 422 | `schema_version` ≠ `1.0.0` |
| Duplicate idempotency key | 200 | Same `idempotency_key` received again → `DUPLICATE_IGNORED` |

---

## Production Endpoints

| Endpoint | URL |
|---|---|
| **Dashboard** | `https://atlasdash-j7nzp34b.manus.space/` |
| **Webhook (POST)** | `https://atlasdash-j7nzp34b.manus.space/api/webhook/observe/<TOKEN>` |
| **SSE Stream (GET)** | `https://atlasdash-j7nzp34b.manus.space/api/events` |
| **Health Check (GET)** | `https://atlasdash-j7nzp34b.manus.space/api/v1/health` |
| **Stats (GET)** | `https://atlasdash-j7nzp34b.manus.space/api/v1/stats` |
| **Recent Reports (GET)** | `https://atlasdash-j7nzp34b.manus.space/api/v1/reports` |

---

## Security Checklist

- [ ] `ATLAS_WEBHOOK_TOKEN` pasted into M-15 indicator settings (TradingView)
- [ ] Webhook URL contains the full token as path segment
- [ ] Token never committed to git
- [ ] Token never displayed in dashboard UI
- [ ] Token never logged in plaintext
- [ ] TradingView alert set to `Once Per Bar Close`
- [ ] TradingView alert condition set to `alert() function calls only`
- [ ] First live report verified in Atlas Nexus dashboard

---

*Document prepared by Atlas Engineering | Sprint 077 | 2026-07-10*
