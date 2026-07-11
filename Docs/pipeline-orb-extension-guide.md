# ORION Pipeline Orb — Extension Guide

**Last Updated:** Sprint 083 (2026-07-11)
**Location:** `atlas-nexus/client/src/components/PipelineOrb.tsx`
**Related:** `atlas-nexus/client/src/pages/Home.tsx` → `PipelineOrbLive`

---

## Overview

The Pipeline Orb is the animated 14-node visualization on the Home dashboard that shows the real-time state of the ORION execution pipeline. Each node represents one pipeline stage. When a live webhook fires, the orb updates instantly via SSE — nodes turn green as each stage passes, red on failure, and the core explodes when all 14 pass and a trade is approved.

---

## How to Add a New Pipeline Stage

If a new stage is added to the ORION pipeline (e.g. a new risk rule, a new model evaluation, a new verification layer), it **must** be reflected in the Pipeline Orb. Follow these steps:

### Step 1 — Add the stage to `STAGES` in `PipelineOrb.tsx`

```ts
// In client/src/components/PipelineOrb.tsx
const STAGES: Stage[] = [
  { id: 1,  label: "CFG", name: "Configuration Update",       module: "M-14" },
  { id: 2,  label: "STA", name: "State Manager Refresh",      module: "M-14" },
  // ... existing stages ...
  { id: 15, label: "XYZ", name: "Your New Stage Name",        module: "M-XX" }, // ← add here
];
```

- `label` — 3-character abbreviation shown on the orb node
- `name` — full stage name shown in the tooltip/legend
- `module` — Pine Script module responsible (e.g. `M-08`, `M-09`)

The orb layout automatically recalculates positions for any number of stages — no geometry changes needed.

### Step 2 — Add detection logic in `PipelineOrbLive` in `Home.tsx`

The `PipelineOrbLive` wrapper in `client/src/pages/Home.tsx` determines how many stages have passed based on fields present in the webhook payload. Add a new detection block:

```ts
// In the PipelineOrbLive function, after the last existing stage check:

// Stage 15: Your New Stage — detect via a field that only appears when this stage runs
if (stages >= 14 && p.your_new_field !== undefined) stages = 15;
```

**Rules for detection:**
- Only advance `stages` if the *previous* stage passed (`stages >= N-1`)
- Use a field that is **always present** in the payload when the stage runs (even if the value is null/false)
- Only set `failed = N` if the stage explicitly reports a rejection — do **not** treat a missing field as a failure

### Step 3 — Add the field to `normalisePayload` in `server/nexusRoutes.ts`

If the new stage sends a new field in the webhook JSON, extract it in `normalisePayload()` so it is stored in the database and returned by `trpc.nexus.latestReport`:

```ts
// In server/nexusRoutes.ts → normalisePayload()
your_new_field: raw?.your_section?.your_new_field ?? null,
```

### Step 4 — Update the Pine Script webhook payload

In `atlas_observability_webhook.pine` (M-15), add the new field to the relevant JSON block so it is included in every webhook fire.

### Step 5 — Update the demo sequence

In `Home.tsx` → `runDemo()`, add a new delay entry for the new stage so the demo animation includes it:

```ts
const DELAYS = [0, 280, 380, ..., 3050, 3350]; // add new delay at the end
```

---

## Current Stage Map (Sprint 083)

| # | Label | Name | Module | Detection Field |
|---|---|---|---|---|
| 1 | CFG | Configuration Update | M-14 | payload received |
| 2 | STA | State Manager Refresh | M-14 | `master_state` |
| 3 | MKT | Market State Engine | M-03 | `market_regime` or `session` |
| 4 | A1 | Model A1 Evaluation | M-04 | `a1_signal` |
| 5 | A3 | Model A3 Evaluation | M-05 | `a3_signal` |
| 6 | B1 | Model B1 Evaluation | M-06 | `b1_signal` |
| 7 | ADE | Atlas Decision Engine | M-07 | `ade_decision` |
| 8 | ARI | Atlas Risk Intelligence | M-08 | `ari_approved` |
| 9 | TVL | Trade Verification Layer | M-09 | `tvl_status` |
| 10 | EXE | Execution Engine | M-10 | `ari_contracts` |
| 11 | OBS | Observatory Event Gen | M-14 | `pipeline_run_id` |
| 12 | BRN | Atlas Brain Update | M-14 | `brain_view` |
| 13 | MIS | Mission Control Update | M-14 | `bar_time` |
| 14 | HBT | Heartbeat | M-14 | always passes if stage 13 passed |

---

## Failure States

A node turns **red** only when the pipeline explicitly reports a rejection:

| Stage | Failure Condition |
|---|---|
| 7 (ADE) | `ade_decision === "NO_TRADE"` |
| 8 (ARI) | `ari_approved === false && ari_rejection` present |
| 9 (TVL) | `tvl_status === "FAIL"` |

All other stages are either green (passed) or orange (not yet reached / idle). Missing fields are never treated as failures.

---

## Trade Approved — Core Explosion

The core explosion fires when all three conditions are true in the same payload:

```ts
const tradeApproved =
  p?.ari_approved === true &&
  p?.tvl_status === "PASS" &&
  (p?.ade_decision === "LONG" || p?.ade_decision === "SHORT");
```

If a new approval condition is added to the pipeline (e.g. a new gate that must pass before execution), add it to this expression.

---

## Notes

- The orb is a pure SVG canvas rendered at 60fps via `requestAnimationFrame`. All node positions are computed from trigonometry — adding more stages automatically redistributes them around the orbit.
- The electric tether arcs use cubic Bézier curves with per-frame jitter. The stretch bias increases when an orb drifts further from the core, simulating tension.
- The explosion uses particle physics with random velocity vectors. It fires once per `tradeApproved` transition and resets automatically.
