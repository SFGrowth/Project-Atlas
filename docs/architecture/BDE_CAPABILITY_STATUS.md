# BDE Capability Status
**Document type:** Architecture Reference  
**Sprint:** 123A.1  
**Status:** VERIFIED  
**Date:** 2026-07-18

---

## Overview

This document records the verified implementation status of every capability claimed for the Atlas BDE (Behaviour-Driven Execution) engine. Each entry was verified by direct source-code search on 2026-07-18. No fake implementations exist or will be created.

The file `server/bdeEngine.ts` does not exist. No import of any BDE function was found in `server/scheduledJobs.ts` or anywhere in the server codebase. The verification document `ATLAS_AUTONOMOUS_SYSTEMS_VERIFICATION.md` (G-006) referenced an earlier version of the codebase.

---

## Capability Status Table

### `computeMarketIntent()`

| Field | Value |
|---|---|
| **Claimed purpose** | Compute a holistic market intent signal from behaviour classifications, regime, session, and trend state |
| **Source-code search performed** | `grep -rn "computeMarketIntent" server/` — no results |
| **Implementation found?** | **NO** |
| **Verified active call site?** | **NO** |
| **Inputs** | Unknown (not specified) |
| **Outputs** | Unknown (not specified) |
| **Persistence** | Unknown |
| **Consumers** | Unknown |
| **Status** | **NOT_IMPLEMENTED** |
| **Reason disabled** | Function was never implemented. Referenced in architecture documents only. |
| **Owning future sprint** | To be assigned after Behaviour Engine canonical certification |

---

### `runBehaviourClustering()`

| Field | Value |
|---|---|
| **Claimed purpose** | Cluster detected behaviour instances to identify co-occurring patterns and regime signatures |
| **Source-code search performed** | `grep -rn "runBehaviourClustering" server/` — no results |
| **Implementation found?** | **NO** |
| **Verified active call site?** | **NO** |
| **Inputs** | Unknown |
| **Outputs** | Unknown |
| **Persistence** | Unknown |
| **Consumers** | Unknown |
| **Status** | **NOT_IMPLEMENTED** |
| **Reason disabled** | Function was never implemented. Referenced in architecture documents only. |
| **Owning future sprint** | To be assigned after canonical Behaviour Engine has ≥ 20 trading days of shadow data |

---

### `buildPortfolioCoverageMap()`

| Field | Value |
|---|---|
| **Claimed purpose** | Map current strategy portfolio against detected market behaviours to identify coverage gaps |
| **Source-code search performed** | `grep -rn "buildPortfolioCoverageMap" server/` — no results |
| **Implementation found?** | **NO** |
| **Verified active call site?** | **NO** |
| **Inputs** | Unknown |
| **Outputs** | Unknown |
| **Persistence** | Unknown |
| **Consumers** | Unknown |
| **Status** | **NOT_IMPLEMENTED** |
| **Reason disabled** | Function was never implemented. Referenced in architecture documents only. |
| **Owning future sprint** | To be assigned. Requires `computeMarketIntent` and `runBehaviourClustering` first. |

---

### `runStrategyInteractionAnalysis()`

| Field | Value |
|---|---|
| **Claimed purpose** | Analyse interactions between active strategies to detect correlation, redundancy, and conflict |
| **Source-code search performed** | `grep -rn "runStrategyInteractionAnalysis" server/` — no results |
| **Implementation found?** | **NO** |
| **Verified active call site?** | **NO** |
| **Inputs** | Unknown |
| **Outputs** | Unknown |
| **Persistence** | Unknown |
| **Consumers** | Unknown |
| **Status** | **NOT_IMPLEMENTED** |
| **Reason disabled** | Function was never implemented. Referenced in architecture documents only. |
| **Owning future sprint** | To be assigned. Requires `buildPortfolioCoverageMap` first. |

---

## Allowed Status Values

| Status | Meaning |
|---|---|
| `VERIFIED_OPERATIONAL` | Implementation found, active call site verified, tests pass |
| `IMPLEMENTED_NOT_WIRED` | Implementation found, no active call site |
| `PARTIAL` | Partial implementation found |
| `NOT_IMPLEMENTED` | No implementation found anywhere in codebase |
| `DEPRECATED` | Was implemented, intentionally removed |
| `DOCUMENTATION_ONLY` | Exists only in architecture documents |

---

## Runtime Capability Registry

A runtime capability registry may expose these statuses via a tRPC procedure or REST endpoint for the Observatory dashboard. The registry must not pretend to implement missing functionality. It must report the honest status from this document.

Proposed endpoint: `GET /api/capabilities` or `trpc.executive.getCapabilityStatus`

This endpoint is not required for Sprint 123A.1 but should be added before any BDE capability is claimed as operational.
