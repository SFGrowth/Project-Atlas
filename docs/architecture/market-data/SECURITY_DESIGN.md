# Atlas Market Data Security Design

**Document type:** Security Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-011

---

## Overview

This document specifies the security design for the Atlas market data system. The primary security concern is the protection of the DataBento API key, which grants access to live market data and has a monthly cost. Secondary concerns include the protection of the TradersPost webhook tokens, the Atlas webhook token, and the prevention of unauthorised access to the Atlas dashboard.

---

## DataBento API Key Security

The DataBento API key is the most sensitive credential in the Atlas system. It must be treated with the same care as a financial account password.

### Storage

The DataBento API key is stored exclusively as a server-side environment variable (`DATABENTO_API_KEY`). It is never:

- Stored in the database
- Logged to any log file
- Included in any API response
- Sent to the browser in any form
- Committed to any version control repository

The key is added to the Atlas environment via `webdev_request_secrets` and is available only in the server-side Node.js process.

### Transmission

DataBento's challenge-response authentication protocol ensures that the API key is never transmitted over the network. The key is used only to compute an HMAC-SHA256 response to a server-provided challenge. The challenge response is transmitted, not the key itself.

### Rotation

If the DataBento API key is compromised:

1. Immediately revoke the key in the DataBento dashboard
2. Generate a new key
3. Update the Atlas environment via `webdev_request_secrets`
4. Restart the Atlas server to apply the new key
5. Verify that the DataBento client reconnects successfully

### Access Control

Only the `databento-client.ts` module may access `process.env.DATABENTO_API_KEY`. No other module may read this environment variable. This is enforced by code review policy, not by technical controls (Node.js does not support per-module environment variable access control).

---

## Browser Security

No market data credentials are ever sent to the browser. The browser receives only:

- Normalised `AtlasMarketEvent` objects via SSE (no DataBento-specific fields)
- Aggregated bar data via tRPC (no raw tick data)
- Feed health status (no credential information)

The SSE endpoint (`/api/events`) is protected by the Atlas session cookie. Unauthenticated requests receive a 401 response.

---

## Webhook Token Security

The Atlas webhook token (`ATLAS_WEBHOOK_TOKEN`) is used to authenticate TradingView M-16 webhook requests. It is stored as a server-side environment variable and validated on every webhook request. The token is never logged or included in API responses.

The TradersPost webhook tokens (`TRADERSPOST_RISK_APEX_EVAL`, `TRADERSPOST_RISK_APEX_FUNDED`, `TRADERSPOST_RISK_LIVE`) are stored as server-side environment variables and used only in outbound HTTP requests to TradersPost. They are never sent to the browser.

---

## Rate Limiting

The DataBento live API connection is a single persistent TCP session. There is no per-request rate limiting concern. However, the DataBento historical API (used for gap-fill and DARWIN research) has rate limits that must be respected:

- Maximum 10 concurrent historical API requests
- Maximum 100 GB per day of historical data download

The gap-fill request rate is limited to 1 request per 5 seconds to avoid hitting DataBento's rate limits.

---

## Audit Logging

All DataBento connection events are logged to the Atlas server log with the following information:

- Connection established (timestamp, session ID)
- Authentication result (success/failure — no key details)
- Subscription confirmed (symbols, schema)
- Disconnection (timestamp, reason)
- Reconnection attempt (attempt number, delay)
- Gap detected (sequence range, timestamp range)
- Gap-fill requested (timestamp range)
- Contract roll detected (old symbol, new symbol)

No market data is logged in the connection audit log (only metadata).

---

*This document specifies the security design for Sprint 121. The DataBento API key must be obtained and stored before Sprint 121 implementation begins.*
