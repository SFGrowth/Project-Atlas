# Atlas Failover and Recovery Architecture

**Document type:** Reliability Design  
**Sprint:** 120  
**Status:** DESIGN — Pending Review and Approval  
**Date:** 2026-07-17  
**Implements:** ADR-008

---

## Overview

This document specifies the failover and recovery architecture for the Atlas market data system. The design ensures that `processBar()` is never silently skipped due to a data feed failure. The dual-feed design — DataBento as primary, TradingView M-16 as fallback — provides redundancy without requiring manual intervention.

---

## Failure Modes and Responses

The Atlas market data system must handle the following failure modes:

| Failure Mode | Detection | Response | Recovery |
|---|---|---|---|
| DataBento TCP disconnect | Socket close event | Activate M-16 fallback, begin reconnection | Auto-reconnect, deactivate fallback |
| DataBento silence > 30s | Heartbeat timer | Transition to DEGRADED state, alert | Resume on next message |
| DataBento silence > 120s | Heartbeat timer | Activate M-16 fallback, begin reconnection | Auto-reconnect, deactivate fallback |
| DataBento sequence gap | Sequence counter | Log gap, request gap-fill, continue | Gap-fill from historical API |
| DataBento authentication failure | Auth response | Log error, notify owner, retry with backoff | Manual API key rotation |
| M-16 webhook silence > 15 min (RTH) | Heartbeat timer | Alert owner: "Both feeds silent" | Manual investigation |
| Atlas server restart | Process startup | Intraday replay from DataBento, reconstruct bars | Auto-recovery on startup |
| MySQL connection failure | Query error | Log error, retry with backoff, alert | Auto-reconnect |
| processBar() exception | Try-catch | Log error, skip bar, alert | Next bar |

---

## Feed Health State Machine

The feed health state machine governs the transition between DataBento primary and M-16 fallback modes.

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐                                    │
              │ UNKNOWN  │ ─── first message ──────────────► │
              └──────────┘                                    │
                                                              ▼
                                                        ┌──────────┐
              ┌──────────────────────────────────────── │CONNECTED │
              │                                         └──────────┘
              │ silence > 30s                                 │
              │ OR gap rate > 0.1%                            │ TCP disconnect
              ▼                                               │
        ┌──────────┐                                         ▼
        │ DEGRADED │ ─── message received ──────────► ┌─────────────┐
        └──────────┘                                   │RECONNECTING │
              │                                        └─────────────┘
              │ silence > 120s                                │
              ▼                                               │ attempts > 3
        ┌──────────┐                                         ▼
        │RECONNECT │ ─── reconnected ──────────────► ┌──────────────────┐
        └──────────┘                                  │ FALLBACK_ACTIVE  │
                                                      └──────────────────┘
                                                              │
                                                              │ DataBento reconnected
                                                              ▼
                                                        ┌──────────┐
                                                        │CONNECTED │
                                                        └──────────┘
```

---

## M-16 Fallback Activation

When the feed health state machine enters `FALLBACK_ACTIVE`, the following changes occur:

1. The M-16 webhook receiver is promoted to primary: `processBar()` is called from the webhook handler instead of the bar builder
2. The bar builder continues to run but its confirmed bars are not used to trigger `processBar()` (they are stored for parity monitoring when DataBento reconnects)
3. The dashboard displays a `FALLBACK — TradingView M-16` indicator
4. An owner notification is sent: "DataBento offline — M-16 fallback active"

The fallback activation is transparent to all downstream consumers. `processBar()` receives the same `BarData` interface regardless of whether the bar came from DataBento or M-16.

---

## M-16 Watchdog Mode

When DataBento is the primary feed, M-16 continues to fire on every bar close. The M-16 webhook receiver operates in watchdog mode:

1. The M-16 bar is received and stored in `atlas_memory` with `source = 'tradingview'`
2. The parity monitor compares the M-16 bar against the Atlas bar for the same `barOpenTs`
3. If the OHLCV values agree within tolerance (0.00 for prices, 0.1% for volume), the parity check passes
4. If the OHLCV values disagree beyond tolerance, a parity alert is raised and the discrepancy is logged
5. `processBar()` is NOT called from the M-16 webhook in watchdog mode

The watchdog mode provides continuous validation that the DataBento bar builder is producing correct bars.

---

## Dual-Feed Silence Detection

The most dangerous failure mode is when both feeds are silent simultaneously. This can occur if:

- Atlas server loses internet connectivity
- TradingView Pine Script M-16 is disabled or has an error
- Both DataBento and TradingView have simultaneous outages (extremely unlikely)
- The market is closed (expected silence outside trading hours)

The dual-feed silence detector monitors both feeds and alerts if both are silent during RTH:

```typescript
function checkDualFeedSilence(): void {
  const now = Date.now();
  const isRth = isRegularTradingHours(now);
  
  if (!isRth) return; // Expected silence outside RTH
  
  const databentoPrimaryLastMsg = feedHealth.databento.lastMessageTs;
  const m16LastWebhook = feedHealth.tradingview.lastMessageTs;
  
  const databentoPrimarySilence = now - databentoPrimaryLastMsg;
  const m16Silence = now - m16LastWebhook;
  
  if (databentoPrimarySilence > 15 * 60 * 1000 && m16Silence > 15 * 60 * 1000) {
    notifyOwner('CRITICAL: Both DataBento and M-16 silent for 15+ minutes during RTH');
  }
}
```

---

## Recovery Procedures

### DataBento Reconnection

On reconnection after a gap:

1. DataBento client sends `start = <last_received_ts_event>` to request replay from the gap
2. DataBento replays all missed records
3. The bar builder processes the replayed records and reconstructs any bars that were missed
4. If the gap spans a completed bar, the reconstructed bar is compared against the M-16 bar stored during the gap
5. If the bars agree, the DataBento bar replaces the M-16 bar in `atlas_memory` with `source = 'databento'`
6. If the bars disagree, both bars are retained and a parity alert is raised

### Server Restart Recovery

On Atlas server restart:

1. The symbol registry loads the last known `instrument_id` from `atlas_symbol_registry`
2. The DataBento client connects and requests intraday replay from `start = 0` (session start)
3. The bar builder processes the replay and reconstructs all bars for the current session
4. Bars that already exist in `atlas_memory` are skipped (idempotency key check)
5. The developing bar state is reconstructed from the most recent trades in the replay
6. Normal operation resumes from the current bar

---

## Notification Policy

| Event | Notification Type | Recipient |
|---|---|---|
| DataBento DEGRADED | In-app warning | Dashboard |
| DataBento RECONNECTING | Push notification | Owner |
| M-16 fallback activated | Push notification + In-app | Owner + Dashboard |
| Parity mismatch detected | Push notification | Owner |
| Both feeds silent (RTH) | Push notification (CRITICAL) | Owner |
| DataBento reconnected | Push notification | Owner |
| Contract roll detected | In-app info | Dashboard |

All notifications use the Atlas owner notification system (`server/_core/notification.ts`).

---

*This document specifies the failover and recovery architecture for Sprint 121–122. The dual-feed design is the primary safety mechanism for the Atlas live trading system.*
