# Atlas Unified Portfolio Strategy — Pine Script v1.0.0

**Sprint 117 · Build 2026-07-15**

One script. One webhook. One alert. Complete portfolio.

---

## Overview

`atlas_portfolio_v1.pine` is the single, authoritative TradingView Pine Script for the Atlas portfolio. It replaces all per-strategy scripts with a unified ADE-parity selection engine that mirrors the Atlas server-side `paperTradeEngine.ts` logic exactly.

| Property | Value |
|---|---|
| Script version | 1.0.0 |
| Pine version | 5 |
| Timeframe | 5-minute MNQ |
| Strategies included | A1, A3, SB1, ORB-1, S109-001, B1 |
| ADE version | ADE-v2.0 |
| Portfolio version | PORT-v1.0 |
| Rule hash | ATLAS-PORT-117-A1-A3-SB1-ORB1-S109-B1-2026-07-15 |

---

## Architecture

```
TradingView (Pine Script)
  ↓  alert fires (JSON webhook)
Atlas Nexus Webhook Receiver (/api/webhook/atlas-bar)
  ↓  barEvaluator.ts evaluates eligibility
  ↓  paperTradeEngine.ts runs ADE ranking
  ↓  ARI applies portfolio risk constraints
  ↓  TVL validates the top-ranked proposal
  ↓  tpDispatch.ts dispatches to TradersPost
TradersPost → MNQ Execution
```

**The Pine Script is the signal generator. The Atlas server is the decision authority.**

Pine generates proposals. The server runs ADE, ARI, and TVL. Only the server dispatches to TradersPost. The Pine `strategy.*` calls are for backtesting visualisation only.

---

## Included Strategies

| Strategy | Regime | Session | ADE Score | Stop | Target |
|---|---|---|---|---|---|
| **A1** | TRENDING | RTH | ADX value | 2.5×ATR | 2.0×ATR |
| **A3** | TRENDING | RTH | ADX × 0.95 | 2.5×ATR | 2.0×ATR |
| **SB1** | TRENDING | AM_MID (10–11 ET) | 50.0 (fixed) | 2.5×ATR | 2.0×ATR |
| **ORB-1** | VOLATILE | AM_OPEN (09:30–10 ET) | 45.0 (fixed) | 2.5×ATR | 2.0×ATR |
| **S109-001** | Any | RTH | \|VWAP_dev\| / ATR × 100 | 2.5×ATR | 2.0×ATR |
| **B1** | Any | RTH | 1.0 (fixed) | 2.5×ATR | 2.0×ATR |

---

## ADE Scoring — Pine Parity

The Pine ADE scoring is **exact parity** with `server/monitor/paperTradeEngine.ts`:

```pine
// A1
a1Score = a1Eligible ? adx : 0.0

// A3
a3Score = a3Eligible ? adx * 0.95 : 0.0

// SB1
sb1Score = sb1Eligible ? 50.0 : 0.0

// ORB-1
orb1Score = orb1Eligible ? 45.0 : 0.0

// S109-001
s109Score = s109Eligible ? (absVwapDev / atr * 100) : 0.0

// B1
b1Score = b1Eligible ? 1.0 : 0.0

// Winner = highest score
winnerScore = math.max(a1Score, a3Score, sb1Score, orb1Score, s109Score, b1Score)
```

**Server-side equivalent (paperTradeEngine.ts):**

```typescript
proposals.push({ model: "A1",      adeScore: adx });
proposals.push({ model: "A3",      adeScore: adx * 0.95 });
proposals.push({ model: "SB1",     adeScore: 50 });
proposals.push({ model: "ORB-1",   adeScore: 45 });
proposals.push({ model: "S109-001", adeScore: Math.abs(s109.vwapDeviation) / atr109 * 100 });
proposals.push({ model: "B1",      adeScore: 1.0 });
proposals.sort((a, b) => b.adeScore - a.adeScore);
```

---

## S109-001 Signal Rules (Frozen DARWIN Parameters)

| Filter | Rule |
|---|---|
| Session | RTH only |
| VWAP deviation | \|close − VWAP\| ≥ 0.5 × ATR14 |
| Direction | close > VWAP → LONG; close < VWAP → SHORT |
| OV inventory | EMA9 slope > 0 → LONG bias; < 0 → SHORT bias |
| VWAP slope | Same as OV inventory (EMA9 3-bar slope) |
| RSI confirmation | LONG: RSI > 50; SHORT: RSI < 50 |
| Stop | 2.5 × ATR14 from entry |
| Target | 2.0 × ATR14 from entry |

**These parameters are frozen. Do not optimise.**

---

## Single-Active-Strategy Rule

```pine
hasOpenPos = strategy.position_size != 0
canEnter   = i_enable_portfolio and hasWinner and not hasOpenPos
```

No entry is permitted while any portfolio position is open. This invariant is enforced in both Pine (for backtesting) and on the server (for live dispatch).

---

## Confirmed-Bar Logic

All signals use `bar[1]` values when `i_confirmed_bar = true` (default). This prevents repainting — the signal only fires after the bar that generated the condition has **closed**.

```pine
_adx   = i_confirmed_bar ? adxVal[1]  : adxVal
_close = i_confirmed_bar ? close[1]   : close
// etc.
```

---

## Chart Visualisation

| Feature | Description |
|---|---|
| Entry labels | Strategy name + direction arrow + ADE score |
| Exit labels | Strategy name + exit type (TARGET/STOP) + P&L pts + R-multiple |
| Blocked markers | Grey ⊘ label when a signal fires but position is already open |
| Trade lines | Dashed entry line, dotted stop/target lines, extended while open |
| R/R boxes | Coloured box showing entry-to-target range |
| Regime background | Blue = TRENDING, Orange = VOLATILE (optional) |
| VWAP | Plotted as thin gold line |
| EMA9 | Optional pink line (VWAP slope proxy) |
| Debug table | Top-right: all 6 models, eligibility, scores, winner, position state |

**Strategy colours:**

| Strategy | Colour |
|---|---|
| A1 | Cyan `#00B4D8` |
| A3 | Deep blue `#0077B6` |
| SB1 | Purple `#7B2FBE` |
| ORB-1 | Orange `#FF6B35` |
| S109-001 | Teal-green `#06D6A0` |
| B1 | Grey `#ADB5BD` |

---

## Webhook Setup

1. Add the script to a 5-minute MNQ chart in TradingView.
2. Create **two alerts** (one for Long Entry, one for Short Entry):
   - Alert condition: `ATLAS PORTFOLIO LONG ENTRY` / `ATLAS PORTFOLIO SHORT ENTRY`
   - Message: leave as `{{strategy.order.alert_message}}` — Pine generates the full JSON payload
   - Webhook URL: your Atlas Nexus webhook endpoint
3. Set `i_webhook_enabled = true`, `i_mode = PAPER` (or `APEX`/`LIVE`).
4. Set `i_account_alias` to match your TradersPost account alias.

**Never put API keys or webhook URLs in Pine source code.**

See `WEBHOOK_SCHEMA.md` for the full payload specification.

---

## Drift Protection

The script embeds a **Rule Hash** in the manifest comment (Section 10). When any of the following change, the hash must be updated and `pine_parity_status` set to `PENDING_VALIDATION` in the Atlas dashboard:

- Strategy eligibility rules
- ADE scoring thresholds
- Stop/target parameters
- Session restrictions
- New strategy added or removed

The Atlas dashboard (Portfolio Intelligence → Pine Status) tracks `pine_parity_status` and alerts when the server-side rules have changed but the Pine version is stale.

---

## Files

| File | Purpose |
|---|---|
| `atlas_portfolio_v1.pine` | The Pine Script |
| `README.md` | This document |
| `WEBHOOK_SCHEMA.md` | Full webhook payload specification |
| `ADE_PARITY_SPEC.md` | Formal ADE parity specification |
| `CHANGELOG.md` | Version history |
| `strategy_manifest.json` | Machine-readable strategy manifest |

---

## Version History

See `CHANGELOG.md`.

---

## Invariants (Never Violate)

1. **One active portfolio position at a time** — enforced in Pine and on the server.
2. **Highest ADE score wins** — no manual override, no hard-coded priority.
3. **Pine is signal-generation only** — the server is the decision authority.
4. **No repainting** — confirmed-bar logic is always on by default.
5. **Frozen S109-001 parameters** — never optimise stop/target/thresholds.
6. **Rule hash must match** — Pine and server must be in parity at all times.
