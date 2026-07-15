# TradersPost Multi-Strategy Alert Audit — Part 1 (Pine Repository Audit)

**Date:** 2026-07-15  
**Status:** COMPLETE  
**Auditor:** Atlas Nexus Autonomous Research Engine  

---

## Audit Scope

This audit answers the 9 required questions from the TradersPost Multi-Strategy Alert Implementation brief before any new code is written. All answers are backed by code evidence from the live project at `/home/ubuntu/atlas-nexus/`.

---

## Q1 — Do A1, A3, and B1 have complete Pine Script entry logic in the repository?

**Answer: NO.**

There are **zero `.pine` files** in the `SFGrowth/Project-Atlas` repository. The entire repository contains only:

| Path | Type | Purpose |
|---|---|---|
| `nexusRoutes.ts` | TypeScript | Snapshot of the live webhook handler |
| `server/monitor/barEvaluator.ts` | TypeScript | A1/A3/B1 eligibility evaluation (server-side) |
| `server/monitor/paperTradeEngine.ts` | TypeScript | Paper trade lifecycle engine |
| `server/wfDb.ts` | TypeScript | Frozen S109-001 signal engine |
| `reports/*.md` | Markdown | Sprint closure reports |
| `docs/*.md` | Markdown | Execution workflow documentation |
| `scripts/*.mjs / *.py` | Scripts | Historical analysis scripts |
| `data/*.json / *.mjs` | Data | Canonical dataset manifest and verification |

**Evidence:** `find /home/ubuntu/Project-Atlas -name "*.pine"` → zero results.

Pine Script M-16 lives exclusively in TradingView cloud. It is not version-controlled in `Project-Atlas`.

---

## Q2 — What are the exact repository file paths for A1/A3/B1 entry logic?

**Answer: The eligibility evaluation logic lives in two server-side files.**

| File | Location | Role |
|---|---|---|
| `server/monitor/barEvaluator.ts` | `/home/ubuntu/atlas-nexus/server/monitor/barEvaluator.ts` | Derives A1/A3/B1/SB1/ORB-1 eligibility from `atlas_memory` flags sent by M-16 |
| `server/monitor/paperTradeEngine.ts` | `/home/ubuntu/atlas-nexus/server/monitor/paperTradeEngine.ts` | Applies single-active-strategy rule; opens paper trades when eligible |
| `server/nexusRoutes.ts` | `/home/ubuntu/atlas-nexus/server/nexusRoutes.ts` | Main webhook handler; wires M-16 bar data into all downstream engines |

**Key code evidence from `barEvaluator.ts`:**

```typescript
// NOTE: These rules are derived from the existing Pine Script M-16 logic.
// They are observation-only — never modify strategy entry/exit rules here.

function evaluateA1(bar: BarRow): { eligible: boolean; reason: string } {
  // Use Pine Script's own flag as primary source of truth
  if (bar.a1Eligible === true) {
    return { eligible: true, reason: `TRENDING regime (${bar.regimeClassification}), session ${session}` };
  }
  // ...
}

function evaluateB1(bar: BarRow): { eligible: boolean; reason: string } {
  // Source: atlas_memory.b1_eligible.
  if (bar.b1Eligible === true) {
    return { eligible: true, reason: `B1 eligible per M-16, session ${session}` };
  }
  return { eligible: false, reason: `Not eligible per Pine Script M-16 evaluation` };
}
```

The server-side code **defers to M-16's flags** (`a1_eligible`, `a3_eligible`, `b1_eligible`) as the primary source of truth. The server does not independently compute entry conditions — it reads M-16's decision.

---

## Q3 — Are A1/A3/B1 scripts attached to TradingView? Do they send orders or only observability?

**Answer: ONE script is confirmed attached to TradingView — Pine Script M-16 (observability only). No separate A1/A3/B1 scripts exist.**

| Script | TradingView Status | Sends Orders | Sends Observability |
|---|---|---|---|
| M-16 (Atlas Memory Observer) | ACTIVE — confirmed live | NO | YES — every 5-min MNQ bar |
| A1 Pine Script | NOT FOUND | N/A | N/A |
| A3 Pine Script | NOT FOUND | N/A | N/A |
| B1 Pine Script | NOT FOUND | N/A | N/A |

**Evidence from `ATLAS-DAILY-OPS-2026-07-14.md`:**

```
| M-16 Webhook | OPERATIONAL |
| A1 paper trade engine | OPERATIONAL (2 valid trades) |
| A3 paper trade engine | OPERATIONAL (no signal, correct) |
| B1 paper trade engine | OPERATIONAL (1 closed + 1 open) |
```

The "A1/A3/B1 paper trade engine" is the **server-side** `paperTradeEngine.ts` — not a Pine Script. M-16 is the only TradingView script.

**Evidence from `barEvaluator.ts` comment:**

```typescript
// NOTE: These rules are derived from the existing Pine Script M-16 logic.
// They are observation-only — never modify strategy entry/exit rules here.
```

M-16 sends raw bar data plus pre-computed eligibility flags (`a1_eligible`, `a3_eligible`, `b1_eligible`, `sb1_eligible`) to the Atlas webhook. The Atlas server then decides which model fires.

---

## Q4 — Is M-16 the source of the A1/A3/B1 eligibility flags?

**Answer: YES — M-16 is the authoritative source of all eligibility flags.**

M-16 computes and sends the following fields on every bar:

| Field | Type | Computed by |
|---|---|---|
| `a1_eligible` | boolean | M-16 Pine Script |
| `a3_eligible` | boolean | M-16 Pine Script |
| `b1_eligible` | boolean | M-16 Pine Script |
| `sb1_eligible` | boolean | M-16 Pine Script |
| `regime_classification` | string | M-16 Pine Script |
| `trend_direction` | string | M-16 Pine Script |
| `session` | string | M-16 Pine Script |
| `adx`, `rsi`, `vwap`, `atr`, `ema9/21/50` | numbers | M-16 Pine Script |

**Evidence from `nexusRoutes.ts` (atlas-memory webhook handler):**

```typescript
a1Eligible: bool(body.a1_eligible), a3Eligible: bool(body.a3_eligible),
b1Eligible: bool(body.b1_eligible), sb1Eligible: bool(body.sb1_eligible),
```

These fields are received from M-16 and stored verbatim in `atlas_memory`. The server-side `barEvaluator.ts` reads them back and uses them as the primary eligibility signal.

---

## Q5 — How does the ADE/ARI/TVL decision pipeline work for A1/A3/B1?

**Answer: The ADE/ARI/TVL pipeline is the M-15 (nested JSON) pipeline — separate from the M-16 (flat bar) pipeline. A1/A3/B1 currently operate on the M-16 pipeline only.**

The Atlas webhook has two distinct pipelines:

| Pipeline | Endpoint | Script | Decision Logic |
|---|---|---|---|
| **Pipeline A (M-15)** | `/api/webhook/observe/:token` | M-15 (nested JSON) | ADE selects candidate model, ARI approves risk, TVL verifies execution. `adeDecision !== "NO_TRADE" && ariApproval === "APPROVED" && tvlStatus === "PASS"` → paper trade opens |
| **Pipeline B (M-16)** | `/api/webhook/atlas-memory/:token` | M-16 (flat bar) | `a1_eligible`, `a3_eligible`, `b1_eligible` flags from M-16 → `barEvaluator.ts` → `paperTradeEngine.ts` → paper trade opens |

**Evidence from `nexusRoutes.ts` (M-15 pipeline, lines 551–553):**

```typescript
if (adeDecision !== "NO_TRADE" && ariApproval === "APPROVED" && tvlStatus === "PASS") {
  const candidateModel = String(ade?.candidate_model ?? "A1");
  // ... opens paper trade
}
```

**Evidence from `nexusRoutes.ts` (M-16 pipeline, lines 1023–1024):**

```typescript
a1Eligible: bool(body.a1_eligible), a3Eligible: bool(body.a3_eligible),
b1Eligible: bool(body.b1_eligible), sb1Eligible: bool(body.sb1_eligible),
```

The M-16 pipeline does **not** use ADE/ARI/TVL. It uses the eligibility flags directly. The M-15 pipeline uses ADE/ARI/TVL but is a separate, older pipeline.

**Critical implication for TradersPost:** TradersPost alerts for A1/A3/B1 must hook into the **M-16 pipeline** (the `atlas-memory` webhook handler), not the M-15 pipeline. The correct trigger point is: `a1_eligible == true` (or a3/b1) AND no position currently open AND safety not halted.

---

## Q6 — What is the single-active-strategy rule and where is it enforced?

**Answer: The single-active-strategy rule is enforced server-side in `paperTradeEngine.ts`.**

**Evidence from `paperTradeEngine.ts` (lines 506–530):**

```typescript
// ── Step 2: Check for new signal (single-active-strategy rule) ───────────
const positionOpen = await hasOpenPosition();
if (!positionOpen && evaluation.integrityOk && barClose > 1000) {
  // Priority order: A1 > A3 > SB1 > ORB-1 > B1
  const eligibleModels: string[] = [];
  if (evaluation.a1Eligible) eligibleModels.push("A1");
  if (evaluation.a3Eligible) eligibleModels.push("A3");
  if (evaluation.sb1Eligible) eligibleModels.push("SB1");
  if (evaluation.orb1Eligible) eligibleModels.push("ORB-1");
  if (evaluation.b1Eligible) eligibleModels.push("B1");
  if (eligibleModels.length > 0) {
    const chosenModel = eligibleModels[0]; // highest priority
    // ...
  }
}
```

**Priority order:** A1 > A3 > SB1 > ORB-1 > B1.

Only one model fires per bar. If A1 is eligible, A3 and B1 are suppressed. This rule must be preserved in the TradersPost integration.

---

## Q7 — Does any existing TradersPost webhook infrastructure exist?

**Answer: NO — zero TradersPost webhook code exists anywhere in the project.**

**Evidence:**

```bash
grep -rn "traderspost|TradersPost" /home/ubuntu/atlas-nexus/server/ → zero results
grep -rn "traderspost|TradersPost" /home/ubuntu/atlas-nexus/client/ → 3 results (UI text only)
```

The 3 UI references are in `ExecutionProfiles.tsx` — they are display text describing future DISARMED profiles, not functional webhook code:

```typescript
description: "Apex 50K evaluation account. Dedicated TradersPost strategy. DISARMED until deployment sprint approved."
```

No TradersPost URLs, API keys, strategy IDs, or webhook payloads exist anywhere in the codebase.

---

## Q8 — What governance constraints must TradersPost alerts preserve?

**Answer: Five governance constraints must be preserved.**

| Constraint | Source | Enforcement Point |
|---|---|---|
| **Single-active-strategy rule** | `paperTradeEngine.ts` | Only one model fires per bar; priority A1 > A3 > SB1 > ORB-1 > B1 |
| **Safety lockout** | `execCertDb.ts` + `nexusRoutes.ts` | `getSafetyState().isHalted === true` → skip signal evaluation |
| **PRE_LIVE_GATE** | `execCertDb.ts` | All 15 certification stages must PASS before first live order |
| **S109-001 execution disabled by default** | User requirement | S109-001 TradersPost output must be FROZEN until owner approval |
| **Idempotency** | `nexusRoutes.ts` | Every order must carry a unique idempotency key to prevent duplicate fills |

---

## Q9 — What is the recommended architecture for TradersPost integration?

**Answer: Server-side webhook dispatch from `nexusRoutes.ts`, triggered AFTER the eligibility + safety check, NOT from Pine Script.**

### Architecture Decision

Since A1/A3/B1 entry decisions are made **server-side** (M-16 sends eligibility flags → Atlas server selects the winning model → paper trade opens), the cleanest and safest architecture is:

**Atlas server sends the TradersPost webhook AFTER making the ADE/safety decision.**

This approach:
1. Preserves all governance (single-active-strategy, safety lockout, PRE_LIVE_GATE) in one place
2. Requires NO new Pine Scripts — M-16 continues unchanged
3. Eliminates the risk of Pine-side alerts firing independently of server-side decisions
4. Allows idempotency keys to be generated server-side with full context
5. Keeps Pipeline A (M-16 → Atlas) and Pipeline B (Atlas → TradersPost) completely separate

### Dual-Pipeline Architecture

```
Pipeline A (unchanged):
  TradingView M-16
    → 5-min MNQ bar fires
    → POST /api/webhook/atlas-memory/:token
    → Atlas stores bar in atlas_memory
    → barEvaluator.ts evaluates A1/A3/B1 eligibility
    → paperTradeEngine.ts applies single-active-strategy rule
    → Selected model paper trade opens (PAPER provenance)

Pipeline B (NEW — server-side only):
  Atlas nexusRoutes.ts (inside atlas-memory webhook handler)
    → After paper trade opens (model selected, safety cleared)
    → If tpEnabled[selectedModel] === true
    → AND safetyState.isHalted === false
    → AND PRE_LIVE_GATE passed (for live accounts)
    → POST https://traderspost.io/trading/webhook/{strategy_uuid}
    → Payload: { ticker, action, quantity, stopLoss, takeProfit, ... }
    → Log to tp_dispatch_log table (idempotency_key, model, direction, status)
```

### 4 TradersPost Strategies Required

| Strategy | TradersPost Name | Default State | Trigger Condition |
|---|---|---|---|
| ATLAS-A1-TRADERSPOST | Atlas A1 MNQ | DISARMED | `a1Eligible && !positionOpen && !safetyHalted && tpArmed.a1` |
| ATLAS-A3-TRADERSPOST | Atlas A3 MNQ | DISARMED | `a3Eligible && !positionOpen && !safetyHalted && tpArmed.a3` |
| ATLAS-B1-TRADERSPOST | Atlas B1 MNQ | DISARMED | `b1Eligible && !positionOpen && !safetyHalted && tpArmed.b1` |
| ATLAS-S109-001-TRADERSPOST | Atlas S109-001 MNQ | FROZEN (disabled) | `s109Signal && !positionOpen && !safetyHalted && tpArmed.s109 && preLiveGatePassed` |

---

## Summary Table — All 9 Questions

| Q | Question | Answer |
|---|---|---|
| Q1 | Do A1/A3/B1 have complete Pine entry logic? | **NO** — server-side only |
| Q2 | Exact repository file paths? | `barEvaluator.ts`, `paperTradeEngine.ts`, `nexusRoutes.ts` |
| Q3 | Are A1/A3/B1 scripts attached to TradingView? | **NO** — only M-16 exists |
| Q4 | Is M-16 the source of eligibility flags? | **YES** — `a1_eligible`, `a3_eligible`, `b1_eligible` |
| Q5 | How does ADE/ARI/TVL work for A1/A3/B1? | M-16 pipeline (flat bar) — ADE/ARI/TVL is M-15 pipeline only |
| Q6 | Where is the single-active-strategy rule enforced? | `paperTradeEngine.ts` — priority A1 > A3 > SB1 > ORB-1 > B1 |
| Q7 | Does TradersPost webhook infrastructure exist? | **NO** — zero code exists |
| Q8 | What governance constraints must be preserved? | 5 constraints: single-strategy, safety lockout, PRE_LIVE_GATE, S109 frozen, idempotency |
| Q9 | Recommended architecture? | **Server-side dispatch** from `nexusRoutes.ts` after eligibility + safety check |

---

## Owner Action Required Before Implementation

1. **Confirm architecture decision:** Server-side TradersPost dispatch (recommended) vs Pine Script approach.
2. **Provide TradersPost strategy UUIDs** for all 4 strategies (create them in TradersPost dashboard first).
3. **Confirm DISARMED default** for A1/A3/B1 and FROZEN for S109-001.
4. **Confirm account routing:** Which TradersPost strategy connects to which Apex account.

---

*Audit completed 2026-07-15 — All 9 questions answered with code evidence.*  
*No new code written. Implementation blocked on owner confirmation of architecture decision.*
