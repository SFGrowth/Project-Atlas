# Atlas Portfolio Webhook Schema v1.0

**Sprint 117 · Build 2026-07-15**

---

## Overview

Every alert fired by `atlas_portfolio_v1.pine` sends a JSON payload to the Atlas Nexus webhook receiver at `/api/webhook/atlas-bar`. The payload identifies the winning strategy, the signal details, and the portfolio context.

The Atlas server uses this payload to:
1. Store the bar in `atlas_memory`
2. Run `barEvaluator.ts` and `paperTradeEngine.ts` (ADE ranking)
3. Apply ARI portfolio risk constraints
4. Apply TVL validation gates
5. Dispatch to TradersPost if all gates pass

---

## Entry Payload

```json
{
  "source": "tradingview",
  "system": "atlas",
  "script": "atlas_portfolio",
  "script_version": "1.0.0",
  "event_id": "MNQ_A1_L_1752580800000",
  "event": "entry",
  "strategy_id": "A1",
  "symbol": "MNQ",
  "ticker": "MNQ1!",
  "timeframe": "5",
  "market_time": "2026-07-15T14:30:00Z",
  "side": "buy",
  "quantity": 1,
  "entry_price": 21450.25,
  "stop_price": 21397.75,
  "target_price": 21492.25,
  "risk_points": 52.5,
  "risk_dollars": 105.0,
  "regime": "TRENDING_BULL",
  "session": "RTH",
  "score": 47.3,
  "reason": "A1 selected by ADE portfolio ranking",
  "bar_time": 1752580800000,
  "mode": "PAPER",
  "account": "ATLAS_MNQ"
}
```

---

## Field Specification

| Field | Type | Description |
|---|---|---|
| `source` | string | Always `"tradingview"` |
| `system` | string | Always `"atlas"` |
| `script` | string | Always `"atlas_portfolio"` |
| `script_version` | string | Pine script semantic version (e.g. `"1.0.0"`) |
| `event_id` | string | Deterministic ID: `{ticker}_{strategy}_{L\|S}_{bar_time_unix}` |
| `event` | string | `"entry"` \| `"exit"` \| `"cancel"` \| `"flatten"` |
| `strategy_id` | string | Winning model: `"A1"` \| `"A3"` \| `"SB1"` \| `"ORB-1"` \| `"S109-001"` \| `"B1"` |
| `symbol` | string | Always `"MNQ"` |
| `ticker` | string | TradingView ticker symbol (e.g. `"MNQ1!"`) |
| `timeframe` | string | Bar timeframe in minutes (e.g. `"5"`) |
| `market_time` | string | ISO 8601 UTC timestamp from TradingView |
| `side` | string | `"buy"` (LONG) \| `"sell"` (SHORT) |
| `quantity` | integer | Number of contracts |
| `entry_price` | float | Approximate entry price (current close of confirmed bar) |
| `stop_price` | float | Stop loss price (entry ± 2.5×ATR14) |
| `target_price` | float | Profit target price (entry ± 2.0×ATR14) |
| `risk_points` | float | Stop distance in points (2.5×ATR14) |
| `risk_dollars` | float | Dollar risk = quantity × risk_points × point_value |
| `regime` | string | Market regime: `"TRENDING_BULL"` \| `"TRENDING_BEAR"` \| `"VOLATILE"` \| `"CHOPPY"` \| `"RANGING"` |
| `session` | string | Session: `"AM_OPEN"` \| `"AM_MID"` \| `"RTH"` \| `"OV"` |
| `score` | float | ADE score of the winning model (rounded to 2dp) |
| `reason` | string | Human-readable selection reason |
| `bar_time` | integer | Bar open time as Unix milliseconds |
| `mode` | string | `"PAPER"` \| `"APEX"` \| `"LIVE"` |
| `account` | string | TradersPost account alias |

---

## Event Types

| Event | When | Key Fields |
|---|---|---|
| `entry` | Strategy entry signal fires | `strategy_id`, `side`, `entry_price`, `stop_price`, `target_price`, `score` |
| `exit` | Position closed (stop or target hit) | `strategy_id`, `bar_time` |
| `cancel` | Signal cancelled before fill | `strategy_id`, `reason` |
| `flatten` | Session flatten at 15:55 ET | `strategy_id` = `"PORTFOLIO"` |

---

## Event ID Format

```
{TICKER}_{STRATEGY}_{DIRECTION}_{BAR_TIME_UNIX}
```

Examples:
- `MNQ_A1_L_1752580800000` — A1 LONG entry at bar 1752580800000
- `MNQ_S109-001_S_1752580800000` — S109-001 SHORT entry
- `MNQ_EXIT_1752581100000` — Exit event

The Atlas webhook receiver uses `event_id` for **idempotent deduplication**. Duplicate payloads with the same `event_id` are silently ignored.

---

## ADE Score Reference

| Strategy | Score Formula | Typical Range |
|---|---|---|
| A1 | ADX value | 25–80 |
| A3 | ADX × 0.95 | 23–76 |
| SB1 | 50.0 (fixed) | 50 |
| ORB-1 | 45.0 (fixed) | 45 |
| S109-001 | \|VWAP_dev\| / ATR × 100 | 50–150+ |
| B1 | 1.0 (fixed) | 1 |

When ADX > 52.6, A1 outscores S109-001 unless VWAP deviation is very large (> 0.526×ATR). When ADX is 25–52, S109-001 typically wins if its filters pass.

---

## Webhook Receiver Behaviour

The Atlas webhook receiver at `/api/webhook/atlas-bar` does **not** execute trades directly from this payload. It:

1. Stores the bar data in `atlas_memory`
2. Runs the full server-side ADE pipeline independently
3. Uses the `strategy_id` field for logging and correlation only
4. The server's own ADE ranking is the authoritative decision

This design ensures that even if the Pine script has a drift (stale rules), the server-side ADE will catch it and may select a different strategy.

---

## Security

- The webhook URL must be kept secret (TradingView alert configuration only)
- The payload is validated against `ATLAS_WEBHOOK_TOKEN` on the server
- Never embed API keys or webhook URLs in Pine source code
- The `mode` field is validated — only `PAPER` mode dispatches to TradersPost in the current configuration
