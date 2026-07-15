# ADE Parity Specification — Atlas Portfolio Pine v1.0

**Sprint 117 · Build 2026-07-15**

This document is the formal specification for ADE (Autonomous Decision Engine) parity between the Pine Script and the Atlas server-side implementation. Both must produce identical strategy selections on the same bar data.

---

## Parity Requirement

For any given bar, if the Pine Script selects strategy X with score S, the server-side `paperTradeEngine.ts` must also select strategy X with score S (within floating-point tolerance of ±0.01).

**Parity status: PENDING_VALIDATION** (awaiting formal fixture test run)

---

## ADE Scoring — Formal Specification

### A1

```
eligible = a1_eligible_flag AND session == RTH
score    = eligible ? ADX : 0.0
```

**Pine:**
```pine
a1Eligible = i_enable_a1 and _isTrend and _isRth
a1Score    = a1Eligible ? _adx : 0.0
```

**Server (paperTradeEngine.ts):**
```typescript
if (evaluation.a1Eligible) {
  proposals.push({ model: "A1", adeScore: adx });
}
```

### A3

```
eligible = a3_eligible_flag AND session == RTH
score    = eligible ? ADX × 0.95 : 0.0
```

**Pine:**
```pine
a3Eligible = i_enable_a3 and _isTrend and _isRth
a3Score    = a3Eligible ? _adx * 0.95 : 0.0
```

**Server:**
```typescript
if (evaluation.a3Eligible) {
  proposals.push({ model: "A3", adeScore: adx * 0.95 });
}
```

### SB1

```
eligible = sb1_eligible_flag AND session == AM_MID AND RAS_activated
score    = eligible ? 50.0 : 0.0
```

**Pine:**
```pine
rasActivated = _adx > 30.0 and _isTrend  // simplified RAS proxy
sb1Eligible  = i_enable_sb1 and _isTrend and _isAmMid and rasActivated
sb1Score     = sb1Eligible ? 50.0 : 0.0
```

**Server:**
```typescript
if (evaluation.sb1Eligible) {
  proposals.push({ model: "SB1", adeScore: 50 });
}
```

**Note:** The Pine RAS proxy (ADX > 30 + TRENDING) is a simplification. The full server-side RAS uses 9 components from M-16. Pine may show SB1 eligible when the server does not. This is a known parity gap — the server is authoritative.

### ORB-1

```
eligible = regime == VOLATILE AND session == AM_OPEN AND RTH
score    = eligible ? 45.0 : 0.0
```

**Pine:**
```pine
orb1Eligible = i_enable_orb1 and _isVol and _isAmOpen and _isRth
orb1Score    = orb1Eligible ? 45.0 : 0.0
```

**Server:**
```typescript
if (evaluation.orb1Eligible) {
  proposals.push({ model: "ORB-1", adeScore: 45 });
}
```

### S109-001 (Frozen DARWIN Parameters)

```
eligible = session == RTH
         AND |close - VWAP| >= 0.5 × ATR14
         AND OV_inventory aligned with direction
         AND VWAP_slope aligned with direction
         AND RSI confirmation

score    = eligible ? (|close - VWAP| / ATR14 × 100) : 0.0

direction = close > VWAP ? LONG : SHORT
stop      = entry ± 2.5 × ATR14
target    = entry ± 2.0 × ATR14
```

**Pine:**
```pine
vwapDev     = _close - _vwap
absVwapDev  = math.abs(vwapDev)
s109DevOk   = absVwapDev >= i_vwap_dev_min * _atr   // default 0.5
s109Dir     = vwapDev > 0 ? 1 : -1
s109OvOk    = (s109Dir == 1 and ovLong) or (s109Dir == -1 and ovShort)
s109SlopeOk = s109OvOk
s109RsiOk   = (s109Dir == 1 and _rsi > 50) or (s109Dir == -1 and _rsi < 50)
s109Eligible = i_enable_s109 and _isRth and s109DevOk and s109OvOk and s109SlopeOk and s109RsiOk
s109Score   = s109Eligible ? (absVwapDev / _atr * 100) : 0.0
```

**Server (wfDb.ts — evaluateS109001Signal):**
```typescript
if (session !== "RTH") return NOT_RTH;
const vwapDeviation = close - vwap;
if (Math.abs(vwapDeviation) < 0.5 * atr14) return DEVIATION_BELOW_THRESHOLD;
const direction = vwapDeviation > 0 ? "LONG" : "SHORT";
const filterOvInventory = (direction === "LONG" && ovInventory === "LONG") || ...;
const filterVwapSlope = (direction === "LONG" && vwapSlope3Bar > 0) || ...;
const filterRsi = (direction === "LONG" && rsi14 > 50) || ...;
// All three must pass
const adeScore = Math.abs(vwapDeviation) / atr109 * 100;
```

**OV Inventory Proxy:** The server derives `ovInventory` from `trendDirection` (BULLISH→LONG, BEARISH→SHORT, else NEUTRAL). The Pine script uses EMA9 3-bar slope as the proxy (positive slope → LONG, negative → SHORT). These are equivalent when the trend direction is consistent with the EMA9 slope.

### B1

```
eligible = b1_eligible_flag AND session == RTH
score    = eligible ? 1.0 : 0.0
```

**Pine:**
```pine
b1Eligible = i_enable_b1 and _isRth
b1Score    = b1Eligible ? 1.0 : 0.0
```

**Server:**
```typescript
if (evaluation.b1Eligible) {
  proposals.push({ model: "B1", adeScore: 1.0 });
}
```

---

## Winner Selection

```
winner = argmax(a1Score, a3Score, sb1Score, orb1Score, s109Score, b1Score)
```

Tie-breaking (when two models have identical scores, which is rare by design):
- A1 > A3 > SB1 > ORB-1 > S109-001 > B1

**Pine:**
```pine
winnerScore = math.max(a1Score, a3Score, sb1Score, orb1Score, s109Score, b1Score)
winnerIsA1  = a1Score == winnerScore and a1Eligible
winnerIsA3  = not winnerIsA1 and a3Score == winnerScore and a3Eligible
// etc.
```

**Server:**
```typescript
proposals.sort((a, b) => b.adeScore - a.adeScore);
const winner = proposals[0];
```

---

## Known Parity Gaps

| Gap | Description | Impact |
|---|---|---|
| SB1 RAS | Pine uses ADX > 30 proxy; server uses full 9-component RAS | Pine may show SB1 eligible when server does not |
| OV Inventory | Pine uses EMA9 slope; server uses `trendDirection` from M-16 | Minor divergence in choppy conditions |
| A1/A3 eligibility | Pine derives from ADX + regime; server uses M-16 `a1_eligible` flag | Pine may differ from M-16 in edge cases |

**Resolution:** The server is always authoritative. Pine divergences are acceptable because the server runs its own independent ADE evaluation. Pine is for signal generation and chart visualisation only.

---

## Parity Validation Procedure

To formally validate parity:

1. Export 100 historical bars from `atlas_memory` as a fixture dataset
2. Run the Pine Script on the same bars in TradingView (replay mode)
3. Record Pine winner + score for each bar
4. Run `paperTradeEngine.processBar()` on the same bars
5. Compare winners and scores — must match within ±0.01 on score
6. Document any divergences in this file
7. Update `pine_parity_status` to `VALIDATED` in the Atlas dashboard

**Parity test frequency:** After any rule change to either Pine or the server.

---

## Drift Detection

A drift occurs when:
- The server-side ADE rules change (new thresholds, new strategy, removed strategy)
- The Pine script is not updated to match

Drift is detected by:
1. The `pine_rule_hash` in `strategy_registry` — must match the hash in the Pine manifest comment
2. The `pine_parity_status` field — set to `PENDING_VALIDATION` when drift is suspected
3. The Atlas dashboard Pine Status panel — shows a DRIFT DETECTED warning

When drift is detected:
1. Update the Pine script to match the new server-side rules
2. Increment `script_version` (semantic versioning)
3. Update the rule hash in the Pine manifest comment
4. Run the parity validation procedure
5. Update `pine_parity_status` to `VALIDATED`
