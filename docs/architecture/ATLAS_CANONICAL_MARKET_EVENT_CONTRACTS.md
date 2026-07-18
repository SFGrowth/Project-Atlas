# Atlas Canonical Market Event Contracts
**Revision:** 5  
**Sprint:** 123A  
**Status:** PENDING GATE G0 APPROVAL  
**Date:** 2026-07-18  
**Supersedes:** Revision 4

---

## 1. Purpose

This document defines the canonical event contracts for all market data events emitted by the Atlas Nexus market-data pipeline. These contracts govern the precise semantics of every event type, the fields and units of every event, the eligibility of each event for downstream canonical processing, and the timestamp unit standard for all Atlas events.

All implementations must conform to these contracts. No event may be consumed by canonical downstream systems unless it is explicitly listed as eligible in this document.

---

## 2. Timestamp Unit Standard

**All canonical Atlas timestamps use UTC milliseconds (integer).**

| Field name | Type | Unit | Description |
|---|---|---|---|
| `barOpenTsMs` | `number` | UTC ms | Start of the bar's time window (floor to interval boundary) |
| `barCloseTsMs` | `number` | UTC ms | End of the bar's time window (exclusive) |
| `atlasTsMs` | `number` | UTC ms | Timestamp at which Atlas processed or emitted the event |
| `rollTsMs` | `number` | UTC ms | Timestamp of the contract roll event |

**Raw Databento nanosecond timestamps are preserved separately and never used as canonical identifiers.**

| Field name | Type | Unit | Description |
|---|---|---|---|
| `tsEventNs` | `bigint` | UTC ns | Raw Databento `ts_event` field (nanoseconds since Unix epoch) |
| `tsRecvNs` | `bigint` | UTC ns | Raw Databento `ts_recv` field (nanoseconds since Unix epoch) |

**Conversion rule:** Nanoseconds are converted to milliseconds exactly once, at the Python/feed-adapter boundary, before any event is published to the Atlas Event Bus.

**Python (authoritative conversion):**
```python
barOpenTsMs: int = ts_event_ns // 1_000_000  # integer division — no floating-point
```

**TypeScript (bridge-side conversion only, if required):**
```typescript
const barOpenTsMs: number = Number(tsEventNs / 1_000_000n);  // BigInt division before Number()
```

**Prohibited conversion pattern:**
```typescript
// PROHIBITED — tsEventNs exceeds Number.MAX_SAFE_INTEGER (2^53 - 1)
// Math.floor(Number(tsEventNs) / 1_000_000)  // DO NOT USE
```

The prohibited pattern converts the nanosecond value to a JavaScript `Number` before division. Because current-epoch nanosecond timestamps (e.g. `1_753_000_000_000_000_000`) exceed `Number.MAX_SAFE_INTEGER` (`9_007_199_254_740_991`), this conversion loses precision and produces incorrect millisecond values. The Python integer-division path is preferred. If TypeScript must perform the conversion, BigInt arithmetic must be used throughout until the final `Number()` cast.

**WebSocket wire format for nanosecond fields:** Standard JSON cannot serialise `bigint`. Nanosecond timestamp fields transmitted over the Python→TypeScript bridge WebSocket must be serialised as base-10 decimal strings:

```json
{
  "tsEventNs": "1753000000123456789",
  "tsRecvNs": "1753000000123500000"
}
```

The TypeScript bridge validates the string format and reconstructs the `BigInt` value:
```typescript
const tsEventNs: bigint = BigInt(payload.tsEventNs);  // safe for any magnitude
```

Nanosecond timestamps must never be transmitted as floating-point JSON numbers.

**Prohibited field names:** `barOpenTs`, `barCloseTs`, `atlasTs`, `rollTs` without explicit unit suffix are prohibited. All new code must use the `*Ms` or `*Ns` suffix.

---

## 3. Canonical Event ID — Source-Safe Discriminated Union

The `CanonicalEventId` is a discriminated union. The `source` field is the discriminant. No field from one source variant is required by the other.

### 3.1 DatabentoEventId

Used when the event originates from the Databento feed.

```typescript
interface DatabentoEventId {
  source: 'DATABENTO';
  dataset: string;           // e.g. "GLBX.MDP3"
  rawSymbol: string;         // resolved dynamically — see TEST-INT-001; never hardcoded
  instrumentId: number;      // Databento numeric instrument ID
  interval: '1m' | '5m';
  barOpenTsMs: number;       // UTC milliseconds
  revision: number;          // 0 for original; increments on correction
  mappingVersion: string;    // Databento symbol mapping version at time of event
}
```

### 3.2 TradingViewEventId

Used when the event originates from the TradingView webhook (Pine Script M-16).

```typescript
interface TradingViewEventId {
  source: 'TRADINGVIEW';
  sourceInstrumentKey: string;  // e.g. "CME_MINI:MNQ1!"
  interval: '5m';
  barOpenTsMs: number;          // UTC milliseconds
  revision: number;             // 0 for original; increments on correction
}
```

### 3.3 Discriminated Union Type

```typescript
type CanonicalEventId = DatabentoEventId | TradingViewEventId;
```

### 3.4 Deterministic Serialisation

Both forms must serialise deterministically. The canonical serialisation is:

```
DATABENTO:{dataset}:{rawSymbol}:{instrumentId}:{interval}:{barOpenTsMs}:{revision}:{mappingVersion}
TRADINGVIEW:{sourceInstrumentKey}:{interval}:{barOpenTsMs}:{revision}
```

No collision is possible between sources because the `source` prefix is always distinct. The serialisation is used as the idempotency key for the consumer processing ledger.

---

## 4. Bar Event Lifecycle

The 1-minute bar lifecycle has five distinct states, each with a unique event type and unique `type` discriminant. No state may be skipped. The lifecycle is strictly sequential.

```
TRADE records arrive
        │
        ▼
AtlasBarDeveloping  (repeated on each trade)
        │
        ▼  (minute boundary crossed)
AtlasBarProvisionalClosed  (chart display only — NOT canonical)
        │
        ├──► ohlcv-1m arrives ≤30 min, values agree within tolerance
        │           │
        │           ▼
        │    AtlasBarConfirmed  ──► five-minute aggregator ──► CanonicalBarConfirmed
        │
        ├──► ohlcv-1m arrives ≤30 min, values disagree beyond tolerance
        │           │
        │           ▼
        │    AtlasBarUnresolved (UNRESOLVED_DISCREPANCY) + alert
        │
        └──► no ohlcv-1m within 30 min
                    │
                    ▼
             AtlasBarUnresolved (UNRESOLVED_MISSING) + alert
                    │
                    └──► Phil approves inspection (written)
                                │
                                ▼
                         AtlasBarReleasedForInspection
                         (chart/diagnostics/research only)
```

---

## 5. Event Definitions

### 5.1 AtlasBarDeveloping

Emitted on every trade record received for the current open 1-minute bar. Represents the live, in-progress state of the bar. Not persisted to `atlas_bars_1m`.

```typescript
interface AtlasBarDeveloping {
  type: 'ATLAS_BAR_DEVELOPING';
  id: DatabentoEventId;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  atlasTsMs: number;
  tsEventNs: bigint;
}
```

| Eligibility | Decision |
|---|---|
| Chart display | YES — live developing bar |
| `atlas_bars_1m` persistence | NO |
| Five-minute aggregation | NO |
| `postBarAutomation` | NO |
| `liveLearnEngine` | NO |
| DARWIN canonical observation | NO |

---

### 5.2 AtlasBarProvisionalClosed

Emitted exactly once when the 1-minute boundary is crossed. Represents the bar as seen from trade data alone, before official Databento reconciliation. **This event is not canonical.** It is for chart display only.

```typescript
interface AtlasBarProvisionalClosed {
  type: 'ATLAS_BAR_PROVISIONAL_CLOSED';
  id: DatabentoEventId;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  reconciliationStatus: 'PROVISIONAL';
}
```

| Eligibility | Decision |
|---|---|
| Chart display | YES — provisional display pending confirmation |
| `atlas_bars_1m` persistence | YES — with `reconciliationStatus = 'PROVISIONAL'` |
| Five-minute aggregation | **NO** |
| `postBarAutomation` | **NO** |
| `liveLearnEngine` | **NO** |
| DARWIN canonical observation | **NO** |

**Invariant:** `AtlasBarProvisionalClosed` is never forwarded to the five-minute aggregator. It is never used as input to any canonical computation. `AtlasBarConfirmed` is never emitted at the minute boundary — only `AtlasBarProvisionalClosed` is emitted at the boundary.

---

### 5.3 AtlasBarConfirmed

Emitted after the official Databento `ohlcv-1m` record arrives and reconciliation passes. This is the only 1-minute event eligible for five-minute aggregation and canonical downstream processing. **This event is never emitted from trade records alone.**

```typescript
interface AtlasBarConfirmed {
  type: 'ATLAS_BAR_CONFIRMED';
  id: DatabentoEventId;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  reconciliationStatus: 'MATCHED';
  tsEventNs: bigint;
  tsRecvNs: bigint;
}
```

| Eligibility | Decision |
|---|---|
| Chart display | YES — replaces provisional display |
| `atlas_bars_1m` persistence | YES — updates existing row to `MATCHED` |
| Five-minute aggregation | **YES** |
| `postBarAutomation` | YES — via five-minute aggregator only |
| `liveLearnEngine` | YES — via `postBarAutomation` only |
| DARWIN canonical observation | YES — via `postBarAutomation` only |

**Invariant:** `AtlasBarConfirmed` requires a passing `ohlcv-1m` reconciliation. It is never emitted from trade records alone. The field `isReconciled` does not exist on this type — the event type itself is the confirmation. `AtlasBarConfirmed` with `isReconciled=false` is not a valid event.

---

### 5.4 AtlasBarUnresolved

Emitted when either (a) no `ohlcv-1m` record arrives within 30 minutes of bar close, or (b) the `ohlcv-1m` record arrives but OHLCV values disagree beyond tolerance. This event is never eligible for canonical downstream processing.

```typescript
interface AtlasBarUnresolved {
  type: 'ATLAS_BAR_UNRESOLVED';
  id: DatabentoEventId;
  symbol: string;
  provisionalOpen: number;
  provisionalHigh: number;
  provisionalLow: number;
  provisionalClose: number;
  provisionalVolume: number;
  officialOpen?: number;
  officialHigh?: number;
  officialLow?: number;
  officialClose?: number;
  officialVolume?: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  reconciliationStatus: 'UNRESOLVED_MISSING' | 'UNRESOLVED_DISCREPANCY';
  discrepancyFields?: string[];
  alertEmitted: boolean;
}
```

| Eligibility | Decision |
|---|---|
| Chart display | YES — marked as unresolved |
| `atlas_bars_1m` persistence | YES — with `reconciliationStatus = 'UNRESOLVED_*'` |
| Five-minute aggregation | **NEVER** |
| `postBarAutomation` | **NEVER** |
| `liveLearnEngine` | **NEVER** |
| DARWIN canonical observation | **NEVER** |

**Invariant:** An `AtlasBarUnresolved` event always triggers an alert. The five-minute aggregator holds any pending 5-minute bar that contains this 1-minute slot until the bar is either confirmed (via historical recovery) or explicitly released for inspection.

---

### 5.5 AtlasBarReleasedForInspection

A non-canonical event emitted only with Phil's explicit written approval when an unresolved bar needs to be inspected. This event is never eligible for canonical downstream processing.

```typescript
interface AtlasBarReleasedForInspection {
  type: 'ATLAS_BAR_RELEASED_FOR_INSPECTION';
  id: DatabentoEventId;
  symbol: string;
  provisionalOpen: number;
  provisionalHigh: number;
  provisionalLow: number;
  provisionalClose: number;
  provisionalVolume: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  reconciliationStatus: 'UNRESOLVED_MISSING' | 'UNRESOLVED_DISCREPANCY';
  releaseApprovedBy: 'PHIL';
  releaseReason: string;
}
```

| Eligibility | Decision |
|---|---|
| Chart inspection | YES |
| Diagnostics | YES |
| Research tooling | YES |
| `postBarAutomation` | **NEVER** |
| `liveLearnEngine` | **NEVER** |
| Behaviour Engine canonical processing | **NEVER** |
| DARWIN canonical observation | **NEVER** |
| ADE | **NEVER** |
| Strategies | **NEVER** |
| Execution | **NEVER** |

**Invariant:** Emitting `AtlasBarReleasedForInspection` does not change the `reconciliationStatus` of the underlying `atlas_bars_1m` row. The row remains `UNRESOLVED_*`. The five-minute aggregator does not receive this event.

---

## 6. CanonicalBarConfirmed Invariant

`CanonicalBarConfirmed` (the five-minute canonical event emitted by the five-minute aggregator) always has:

```
containsUnresolvedMinutes = false
```

This invariant is unconditional. There is no operator override path. No `CanonicalBarConfirmed` event may be emitted if any of its constituent 1-minute bars has `reconciliationStatus` other than `'MATCHED'`.

If Phil approves inspection of data that contains unresolved minutes, the `AtlasBarReleasedForInspection` event is used. The five-minute aggregator does not participate in this path.

---

## 7. CanonicalBarConfirmed (5-min)

Owner: Market-data service (five-minute aggregator). Trigger: 5 consecutive `AtlasBarConfirmed` events aggregated. This is the single trigger for all downstream processing.

```typescript
interface CanonicalBarConfirmed {
  type: 'CANONICAL_BAR_CONFIRMED';
  id: DatabentoEventId | TradingViewEventId;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  containsSyntheticMinutes: boolean;
  containsUnresolvedMinutes: false;   // ALWAYS false — see Section 6
  vwap?: number;
  ema9?: number;
  ema21?: number;
}
```

---

## 8. TradingView Bar Event

TradingView events use the `TradingViewEventId` discriminant. The bar lifecycle is simpler because TradingView delivers only closed 5-minute bars.

```typescript
interface TradingViewBarConfirmed {
  type: 'TRADINGVIEW_BAR_CONFIRMED';
  id: TradingViewEventId;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  barOpenTsMs: number;
  barCloseTsMs: number;
  atlasTsMs: number;
  vwap?: number;
  ema9?: number;
  ema21?: number;
}
```

When `MARKET_DATA_AUTHORITY = TRADINGVIEW_ONLY`, `TradingViewBarConfirmed` is the sole input to `postBarAutomation`. When `MARKET_DATA_AUTHORITY = DATABENTO_LEARNING_AUTHORITY`, `CanonicalBarConfirmed` is the sole input to `postBarAutomation`. The two paths are mutually exclusive.

> **Authority value definitions (Sprint 123A authority order):**
>
> | Value | Chart | `processBar` | `postBarAutomation` | `liveLearnEngine` | Behaviour Engine | DARWIN | ADE / Strategy / Execution |
> |---|---|---|---|---|---|---|---|
> | `TRADINGVIEW_ONLY` | TradingView | TradingView | TradingView | TradingView | TradingView | TradingView | TradingView |
> | `DATABENTO_SHADOW` | TradingView | TradingView | TradingView | TradingView | TradingView | TradingView | TradingView |
> | `DATABENTO_CHART_AUTHORITY` | **Databento** | TradingView | TradingView | TradingView | TradingView | TradingView | TradingView |
> | `DATABENTO_LEARNING_AUTHORITY` | **Databento** | TradingView | **Databento** | **Databento** | **Databento** | **Databento** | TradingView |
> | `DATABENTO_DECISION_AUTHORITY` | — | — | — | — | — | — | — |
>
> **Critical invariant:** `processBar` is **always** owned by TradingView in Sprint 123A. Databento must never trigger `processBar` under any authority level, including `DATABENTO_LEARNING_AUTHORITY`.
>
> - **`TRADINGVIEW_ONLY`** — TradingView is the sole canonical source. Databento runs in shadow mode only (no downstream effects on any system).
> - **`DATABENTO_SHADOW`** — Databento is active and persisting bars to `atlas_bars_1m` and `atlas_bars_5m`. TradingView remains the canonical source for all downstream systems.
> - **`DATABENTO_CHART_AUTHORITY`** — Databento-derived bars are authoritative for `AtlasLiveChart` and chart SSE events. TradingView remains authoritative for `processBar`, `postBarAutomation`, and all learning systems. Databento does **not** trigger `liveLearnEngine`, Behaviour Engine learning, DARWIN observation, ADE, strategy processing, or execution.
> - **`DATABENTO_LEARNING_AUTHORITY`** — Databento-derived `CanonicalBarConfirmed` is the sole input to `postBarAutomation`. `postBarAutomation` then drives `liveLearnEngine`, Behaviour Engine learning, and DARWIN canonical observation. **`processBar` continues to be triggered by TradingView only.** ADE, strategy processing, and execution remain TradingView-owned. Requires Gate G6A approval. This is the maximum authority level available in Sprint 123A.
> - **`DATABENTO_DECISION_AUTHORITY`** — **Reserved for Sprint 123B.** Not defined, not implemented, and not reachable in Sprint 123A. Strategy and `processBar` consumption of Databento bars is reserved exclusively for Sprint 123B and `DATABENTO_DECISION_AUTHORITY`. This value must not appear in any Sprint 123A feature flag, configuration, or code path.

---

## 9. AtlasContractRoll

Owner: Market-data service (Contract Roll Manager). Trigger: Databento symbol-mapping change or definition record indicating new front month.

```typescript
interface AtlasContractRoll {
  type: 'ATLAS_CONTRACT_ROLL';
  parentSymbol: string;
  previousRawSymbol: string;
  newRawSymbol: string;
  previousInstrumentId: number;
  newInstrumentId: number;
  rollTsMs: number;
  mappingVersion: string;
  atlasTsMs: number;
}
```

---

## 10. SSE Channel Names

| Event type | SSE channel | Consumers |
|---|---|---|
| `ATLAS_BAR_DEVELOPING` | `atlas_bar_developing` | `AtlasLiveChart` only |
| `ATLAS_BAR_PROVISIONAL_CLOSED` | `atlas_bar_provisional_closed` | `AtlasLiveChart` only |
| `ATLAS_BAR_CONFIRMED` | `atlas_bar_confirmed_1m` | `AtlasLiveChart`, parity monitor |
| `ATLAS_BAR_UNRESOLVED` | `atlas_bar_unresolved` | `AtlasLiveChart`, alert system |
| `ATLAS_BAR_RELEASED_FOR_INSPECTION` | `atlas_bar_released_for_inspection` | `AtlasLiveChart` (inspection mode), diagnostics |
| `TRADINGVIEW_BAR_CONFIRMED` | `atlas_bar_confirmed` | `AtlasLiveChart`, parity monitor |
| `CANONICAL_BAR_CONFIRMED` | `atlas_canonical_bar` | `AtlasLiveChart`; `postBarAutomation` (after Gate G6A); DARWIN and learning systems via `postBarAutomation` |
| `ATLAS_CONTRACT_ROLL` | `atlas_contract_roll` | All consumers |
| `ATLAS_FEED_HEALTH` | `atlas_feed_health` | `AtlasLiveChart`, ops |

**Invariant:** `AtlasLiveChart` is a pure SSE consumer. It never publishes to any SSE channel or the Atlas Event Bus.

**Sprint 123B boundary:** Strategy and `processBar` consumption of `CANONICAL_BAR_CONFIRMED` is reserved exclusively for Sprint 123B and `DATABENTO_DECISION_AUTHORITY`. No Sprint 123A code path may route a Databento-derived bar into `processBar`, ADE, strategy evaluation, or execution.

---

## 11. Consumer Idempotency Key Pattern

Every downstream consumer of `CanonicalBarConfirmed` must maintain an idempotency key in the `atlas_consumer_processing_ledger` table:

```
{consumerName}_v{consumerVersion}:{serialisedCanonicalEventId}
```

| Consumer | Key prefix |
|---|---|
| `liveLearnEngine` | `live_learn_v1:` |
| `behaviourEngine` (canonical) | `behaviour_engine_v1:` |
| `onNewBarObservation` | `darwin_observation_v1:` |
| `certifyCandle` | `candle_cert_v1:` |
| `chart_sse` | `chart_sse_v1:` |
| `parity_monitor` | `parity_v1:` |

---

## 12. Revision History

| Revision | Date | Changes |
|---|---|---|
| 1 | 2026-07-18 | Initial document — basic event contracts |
| 2 | 2026-07-18 | Added provisional/confirmed/unresolved 1-min bar lifecycle |
| 3 | 2026-07-18 | Added `AtlasBarReleasedForInspection`; removed operator override path |
| 4 | 2026-07-18 | Full rewrite: 5 distinct events with unique `type` discriminants; timestamp unit standard (UTC ms with `*Ms`/`*Ns` suffixes); source-safe `CanonicalEventId` discriminated union; `AtlasBarProvisionalClosed` strictly separated from `AtlasBarConfirmed`; `AtlasBarConfirmed` never emitted from trade records alone; `isReconciled` field removed; `containsUnresolvedMinutes` invariant hardened to unconditional `false`; TradingView bar event added; SSE channel table updated; `AtlasContractRoll` timestamp field renamed to `rollTsMs` |
