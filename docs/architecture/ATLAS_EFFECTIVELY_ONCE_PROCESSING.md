# Atlas Effectively-Once Processing
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18

---

## Overview

Atlas uses **effectively-once processing** — not exactly-once. The distinction is important and must be documented honestly.

**Exactly-once processing** is a theoretical guarantee that a message is processed precisely one time regardless of failures, retries, or replays. It is not achievable with at-least-once delivery without distributed transactions, and Atlas does not use distributed transactions.

**Effectively-once processing** is a practical guarantee achieved by combining at-least-once delivery with idempotent consumers. If a message is delivered multiple times, the consumer produces the same observable result as if it had been delivered once. This is achievable and is the correct model for Atlas.

---

## Delivery Guarantees

| Layer | Guarantee | Mechanism |
|---|---|---|
| Python → Bridge (WebSocket) | At-least-once | Bounded queue; backpressure; reconnect with replay |
| Bridge → `atlasEventBus` | At-most-once | In-process EventEmitter; no persistence |
| `atlasEventBus` → Bar builder | At-most-once | In-process; no persistence |
| Bar builder → Canonical router | At-least-once | `CanonicalBarConfirmed` written to `atlas_canonical_bars` before dispatch |
| Canonical router → Consumers | At-least-once | Consumer processing ledger; retry on failure |
| SSE → Browser | At-most-once | Browser reconnects and queries persisted state |

The critical boundary is the canonical router. Before dispatching to any consumer, the router persists the `CanonicalBarConfirmed` event to `atlas_canonical_bars` with a unique constraint on `(instrumentId, interval, barOpenTs)`. This ensures that even if the server restarts mid-dispatch, the event is not lost and consumers can be re-driven from the persisted record.

---

## Canonical Event ID

Every `CanonicalBarConfirmed` event carries a durable `CanonicalEventId` (see `ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md`). The serialised form is used as the basis for all consumer idempotency keys.

---

## Consumer Idempotency

Every consumer of `CanonicalBarConfirmed` must:

1. Compute its idempotency key: `{consumerName}_v{consumerVersion}:{serialisedCanonicalEventId}`
2. Check the `atlas_consumer_processing_ledger` for an existing record with this key
3. If a record exists with `status = 'completed'`, skip processing
4. If a record exists with `status = 'in_progress'`, the previous attempt may have failed — re-run (consumer must be idempotent)
5. If no record exists, insert a record with `status = 'in_progress'`, run processing, then update to `status = 'completed'`

### `atlas_consumer_processing_ledger` Schema

```sql
CREATE TABLE atlas_consumer_processing_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(512) NOT NULL UNIQUE,
  consumer_name VARCHAR(64) NOT NULL,
  consumer_version INT NOT NULL,
  canonical_event_id VARCHAR(512) NOT NULL,
  status ENUM('in_progress', 'completed', 'failed') NOT NULL DEFAULT 'in_progress',
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consumer_event (consumer_name, canonical_event_id),
  INDEX idx_status (status)
);
```

---

## Replay Behaviour

When the canonical router restarts, it queries `atlas_canonical_bars` for any bars where `atlas_consumer_processing_ledger` has no `completed` record for a required consumer. It re-dispatches those bars in order. This ensures no bar is silently skipped due to a mid-dispatch server restart.

Replay is bounded: only bars within the last 48 hours are replayed on startup. Older gaps are flagged for manual review.

---

## Processing Ledger

The `atlas_consumer_processing_ledger` table is the durable record of which consumers have processed which canonical events. It is the only mechanism for preventing duplicate processing across restarts.

The ledger is append-only. Records are never deleted. Retention policy: 30 days.

---

## Transaction Boundaries

The canonical router uses the following transaction pattern for each consumer dispatch:

1. Begin transaction
2. Insert `atlas_consumer_processing_ledger` record (`in_progress`)
3. Commit
4. Run consumer processing (outside transaction — may be async)
5. Begin transaction
6. Update `atlas_consumer_processing_ledger` record (`completed`)
7. Commit

If step 4 fails, the record remains `in_progress` and will be retried on next replay. If step 6 fails, the consumer ran successfully but the ledger was not updated — the consumer will run again on replay and must produce the same result (idempotent).

---

## Failure Recovery

| Failure | Detection | Recovery |
|---|---|---|
| Python service crash | Bridge health monitor | Restart Python service; request replay from last confirmed sequence |
| Bridge disconnect | WebSocket error handler | Reconnect; Python service re-sends from last acknowledged sequence |
| Server restart mid-dispatch | Startup replay scan | Re-dispatch all `in_progress` ledger records |
| Consumer failure | `in_progress` ledger record | Retry up to 3 times; mark `failed` and alert |
| Database constraint violation | Duplicate key error | Log and skip (idempotent by design) |
| Unresolved minute in 5-min bar | `containsUnresolvedMinutes = true` | Do not dispatch to production consumers; write to parity table only |

---

## What This Model Does Not Guarantee

This model does not guarantee that every consumer processes every event in the same wall-clock second it arrives. It guarantees that every consumer eventually processes every event exactly once (effectively), even across server restarts and network failures. Latency between event arrival and consumer processing may be seconds to minutes in failure scenarios.
