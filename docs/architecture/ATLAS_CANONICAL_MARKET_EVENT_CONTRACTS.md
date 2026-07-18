# Atlas Canonical Market Event Contracts
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** PENDING APPROVAL  
**Date:** 2026-07-18 (Revision 2: Correction 6 applied — provisional vs confirmed 1-min bar lifecycle defined)

---

## Overview

This document defines every canonical market event contract used in Atlas. All events are versioned. Consumers must declare the contract version they consume. Breaking changes require a new version. Non-breaking additions (new optional fields) do not require a version bump.

The existing contracts in `shared/types/market-events.ts` are the authoritative TypeScript types. This document adds the canonical event ID specification, ownership, and the new contracts required for Sprint 123A.

---

## Existing Contracts (Sprint 121 — Verified)

These contracts exist in `shared/types/market-events.ts` and are verified correct.

### `AtlasTradeEvent` v1

Owner: Market-data service. Trigger: Databento `trades` record normalised by `event-normalizer.ts`.

| Field | Type | Description |
|---|---|---|
| `type` | `'trade'` | Discriminant |
| `source` | `DataSource` | `'databento'` or `'tradingview'` |
| `symbol` | string | Canonical symbol (`MNQ1!`) |
| `price` | `AtlasPrice` | Trade price in USD |
| `size` | `AtlasSize` | Contracts traded |
| `side` | `TradeSide` | `'buy'`, `'sell'`, or `'unknown'` |
| `aggressor` | `TradeSide` | Aggressor side |
| `tsEvent` | number | Exchange timestamp (ms UTC) |
| `tsRecv` | number? | DataBento receive timestamp (ms UTC) |
| `atlasTs` | number | Atlas receive timestamp (ms UTC) |
| `sequence` | number? | Exchange sequence number |
| `instrumentId` | number? | DataBento instrument_id |

### `AtlasQuoteEvent` v1

Owner: Market-data service. Reserved for future `mbp-1` schema use. Not used in Sprint 123A.

### `AtlasBarEvent` v1

Owner: Market-data service. Current use: 5-min bars only. Will be extended in Sprint 123A.3 to support 1-min bars.

### `AtlasFeedHealthEvent` v1

Owner: Market-data service. Trigger: Feed health state machine transition.

### `AtlasSymbolMappingEvent` v1

Owner: Market-data service. Trigger: Databento `SymbolMappingMsg` record.

---

## New Contracts Required for Sprint 123A

These contracts do not yet exist and must be added to `shared/types/canonical-events.ts` in Sprint 123A.1.

### `CanonicalEventId` v1

The durable identifier for every canonical market event. Used as the basis for all consumer idempotency keys.

```typescript
interface CanonicalEventId {
  source: 'databento' | 'tradingview';
  dataset: string;           // e.g. 'GLBX.MDP3'
  rawSymbol: string;         // e.g. 'MNQM5'
  instrumentId: number;      // Databento instrument_id
  interval: '1m' | '5m';
  barOpenTs: number;         // UTC milliseconds
  revision: number;          // 0 for first, incremented on correction
  mappingVersion: number;    // Incremented on contract roll
}
```

Serialised form: `{source}.{dataset}.{rawSymbol}.{instrumentId}.{interval}.{barOpenTs}.{revision}.{mappingVersion}`

### `AtlasBarDeveloping` v1 (1-min)

Owner: Market-data service (TypeScript bar builder). Trigger: Every normalised trade event, rate-limited to 1 per second per symbol.

| Field | Type | Description |
|---|---|---|
| `type` | `'bar_developing'` | Discriminant |
| `canonicalEventId` | `CanonicalEventId` | Durable event ID |
| `symbol` | string | Canonical symbol |
| `barOpenTs` | number | Bar open (ms UTC) |
| `barCloseTs` | number | Bar close = barOpenTs + 60_000 |
| `open` | number | First trade price |
| `high` | number | Highest trade price |
| `low` | number | Lowest trade price |
| `close` | number | Most recent trade price |
| `volume` | number | Total contracts |
| `tickCount` | number | Number of trades |
| `atlasTs` | number | Atlas timestamp (ms UTC) |

### `AtlasBarConfirmed` v1 (1-min)

Owner: Market-data service (TypeScript bar builder). Trigger: Bar boundary crossed or `ohlcv-1m` reconciliation confirms close.

**Provisional vs confirmed lifecycle:** A 1-minute bar passes through two states before it is eligible to contribute to a 5-minute bar.

1. **Provisional** (`reconciliationStatus = PROVISIONAL`): The bar boundary has been crossed (i.e., 60 seconds have elapsed since `barOpenTs`). The bar is persisted to `atlas_bars_1m` with `reconciliationStatus = PROVISIONAL`. It is **not** forwarded to the five-min aggregator at this stage. An `AtlasBarConfirmed` event with `isReconciled = false` is emitted for chart display only.

2. **Confirmed** (`reconciliationStatus = MATCHED`): The bar builder receives the official Databento `ohlcv-1m` record for the same interval and the OHLCV values agree within the defined tolerances (±1 tick OHLC, ±5% volume). The bar is updated to `reconciliationStatus = MATCHED`, and a revised `AtlasBarConfirmed` event with `isReconciled = true` is emitted. **Only confirmed bars are forwarded to the five-min aggregator.**

3. **Unresolved** (`reconciliationStatus = UNRESOLVED`): If the official `ohlcv-1m` record has not arrived within 30 minutes of the bar close, or if the OHLCV values disagree beyond tolerance, the bar is marked `UNRESOLVED`. Unresolved bars are **never** forwarded to the five-min aggregator. A 5-minute bar that would require an unresolved 1-min bar is held pending. If the unresolved bar is later recovered via Historical API, it is reclassified as `MATCHED` and the 5-minute bar is released.

This lifecycle ensures that `CanonicalBarConfirmed` (5-min) events are only emitted from fully reconciled data. The `containsUnresolvedMinutes` field on `CanonicalBarConfirmed` is always `false` in normal operation; it is only `true` if the 30-minute recovery window expires and the bar is released anyway under an explicit operator override (which requires Phil's written approval).

Same fields as `AtlasBarDeveloping` plus:

| Field | Type | Description |
|---|---|---|
| `type` | `'bar_confirmed'` | Discriminant |
| `isSynthetic` | boolean | True if `SYNTHETIC_NO_TRADE_BAR` |
| `isReconciled` | boolean | True if reconciled against `ohlcv-1m` |
| `reconciliationDelta` | number? | Price delta vs official bar (if reconciled) |

### `CanonicalBarConfirmed` v1 (5-min)

Owner: Market-data service (5-min aggregator). Trigger: 5 confirmed 1-min bars aggregated. This is the single trigger for all downstream processing.

| Field | Type | Description |
|---|---|---|
| `type` | `'canonical_bar_confirmed'` | Discriminant |
| `canonicalEventId` | `CanonicalEventId` | Durable event ID (interval = `5m`) |
| `symbol` | string | Canonical symbol |
| `barOpenTs` | number | Bar open (ms UTC) |
| `barCloseTs` | number | Bar close = barOpenTs + 300_000 |
| `open` | number | Open price |
| `high` | number | High price |
| `low` | number | Low price |
| `close` | number | Close price |
| `volume` | number | Total contracts |
| `tickCount` | number | Total trades |
| `containsSyntheticMinutes` | boolean | True if any 1-min bar was synthetic |
| `containsUnresolvedMinutes` | boolean | True if any 1-min bar was unresolved — **must not be used for production processing** |
| `atlasTs` | number | Atlas timestamp (ms UTC) |

### `AtlasContractRoll` v1

Owner: Market-data service (Contract Roll Manager). Trigger: Databento symbol-mapping change or definition record indicating new front month.

| Field | Type | Description |
|---|---|---|
| `type` | `'contract_roll'` | Discriminant |
| `parentSymbol` | string | `MNQ` |
| `previousRawSymbol` | string | e.g. `MNQM5` |
| `newRawSymbol` | string | e.g. `MNQU5` |
| `previousInstrumentId` | number | Previous Databento instrument_id |
| `newInstrumentId` | number | New Databento instrument_id |
| `rollTs` | number | Roll timestamp (ms UTC) |
| `mappingVersion` | number | New mapping version |
| `atlasTs` | number | Atlas timestamp |

---

## Consumer Idempotency Key Pattern

Every downstream consumer of `CanonicalBarConfirmed` must maintain an idempotency key in the `atlas_consumer_processing_ledger` table:

```
{consumerName}_v{consumerVersion}:{serialisedCanonicalEventId}
```

| Consumer | Key Prefix |
|---|---|
| `liveLearnEngine` | `live_learn_v1:` |
| `behaviourEngine` (canonical) | `behaviour_engine_v1:` |
| `onNewBarObservation` | `darwin_observation_v1:` |
| `certifyCandle` | `candle_cert_v1:` |
| `chart_sse` | `chart_sse_v1:` |
| `parity_monitor` | `parity_v1:` |

---

## SSE Channel Names

| Event | SSE Channel |
|---|---|
| `AtlasBarDeveloping` | `atlas_bar_developing` |
| `AtlasBarConfirmed` (1-min) | `atlas_bar_confirmed_1m` |
| `CanonicalBarConfirmed` (5-min) | `atlas_bar_confirmed` |
| `AtlasFeedHealthEvent` | `atlas_feed_health` |
| `AtlasContractRoll` | `atlas_contract_roll` |
| `AtlasTradeEvent` (rate-limited) | `atlas_market_trade` |
