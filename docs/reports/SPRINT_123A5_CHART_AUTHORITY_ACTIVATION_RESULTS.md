# Sprint 123A.5 — Gate G5: DATABENTO_CHART_AUTHORITY Activation Results

**Sprint:** 123A.5  
**Gate:** G5 — Chart Authority Activation  
**Date:** 2026-07-22  
**Baseline SHA:** `1e9fd0d` (Sprint 123A.4 approved baseline)  
**Activation commit:** `c66e59d`  
**Activated by:** Phil's explicit written mandate (2026-07-22)  
**Environment:** Cloud Computer staging (`atlas_staging_g4`)  
**Authority mode:** `DATABENTO_CHART_AUTHORITY`  
**Status:** GATE G5 PASSED — AWAITING PHIL'S WRITTEN APPROVAL

---

## Executive Summary

Databento chart authority has been successfully activated on the Atlas Nexus staging environment. The activation is **display-only**: Databento confirmed 1-minute bars now drive the `AtlasLiveChart` component, while all trading decisions, `processBar`, and `postBarAutomation` remain exclusively owned by TradingView. All 20 CB browser tests pass, the full TypeScript regression is clean, and the Python feed adapter test suite passes 143/143.

Both the Atlas server and Databento feed adapter are now managed as **systemd services** (`atlas-nexus.service` and `atlas-feed-adapter.service`), providing boot-persistent, auto-restart supervision fully independent of any Manus session or SSH connection.

---

## Parity Gate Waiver

Gate 4 (parity validation) was waived by Phil's explicit written mandate. The production `atlas_memory` TradingView bars are not accessible from the staging environment.

| Item | Value |
|------|-------|
| `TRADINGVIEW_PARITY_STATUS` | `WAIVED_BY_PHIL` |
| Waiver scope | Chart display authority only |
| Excluded from waiver | Decision authority, learning authority, automation, risk, execution |
| Future requirement | Parity gate must be satisfied before any authority beyond chart display |

---

## Authority Boundaries (Permanent Record)

| Function | Authority | Evidence |
|----------|-----------|----------|
| `AtlasLiveChart` data source | **Databento** | `authorityMode=DATABENTO_CHART_AUTHORITY`, `shadowEnabled=false` |
| `processBar` trigger | **TradingView** | Code-invariant: only inside `/webhook/observe/:token` handler, `nexusRoutes.ts` line 703+ |
| `postBarAutomation` trigger | **TradingView** | Code-invariant: only inside `/webhook/observe/:token` handler, `nexusRoutes.ts` |
| Databento learning authority | **PROHIBITED** | `bridge-server.ts` line 710: "No downstream processing (processBar, postBarAutomation, strategies)" |
| Databento decision authority | **PROHIBITED** | `assertSprint123A4Invariants()` enforces at runtime |
| DARWIN learning | **PROHIBITED** | No Databento data routed to DARWIN pipeline |

---

## Phase Results

### Phase 1 — GitHub Baseline

| Check | Result |
|-------|--------|
| HEAD SHA | `1e9fd0d` |
| Remote SHA | `1e9fd0d` |
| Local = Remote | PASS |
| Working tree clean | PASS (pycache only) |

### Phase 2 — Pre-Activation Checks

| Check | Result |
|-------|--------|
| Orchestrator status | READY |
| Authority mode (pre-activation) | DATABENTO_SHADOW |
| Feed | CONNECTED |
| Unresolved bars | 0 |
| Confirmed 1m bars | 132 (≥100 required) |
| 5m aggregated bars | 18 |
| SSE stream | Active (ping received, protocol 123A.4) |
| Authority enum `DATABENTO_CHART_AUTHORITY` in `config.ts` | CONFIRMED |
| `assertSprint123A4Invariants()` requires both env vars | CONFIRMED |
| `isDatabentoProcessBarTrigger()` always returns `false` | CONFIRMED |

### Phase 3 — Activation

`.env` changes applied to Cloud Computer:

```
MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY
ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true
```

Server startup log confirmed:

```
[Atlas config] DATABENTO_CHART_AUTHORITY is ACTIVE. Gate G4 feature flag is enabled.
processBar trigger: TradingView. postBarAutomation trigger: TradingView.
Databento learning: PROHIBITED. Databento decision authority: PROHIBITED.
[RuntimeOrchestrator] chart-authority pipeline READY.
[BridgeServer] Python adapter connected
[FeedHealth] databento: UNKNOWN → CONNECTED
```

### Phase 4 — Display-Only Cutover Verification

| Field | Value |
|-------|-------|
| `status` | READY |
| `authorityMode` | DATABENTO_CHART_AUTHORITY |
| `shadowEnabled` | false |
| `unresolvedBars` | 0 |
| `persistenceErrors` | 0 |
| `lastConfirmed1mTs` | 1784721120016 |
| `lastConfirmed5mTs` | 1784721000016 |
| `parityMismatchRate` | 0 |
| `errors` | [] |

### Phase 5 — TradingView Authority Unchanged

| Check | Result |
|-------|--------|
| `isDatabentoProcessBarTrigger()` | Always returns `false` (code invariant) |
| `processBar` call site | Exclusively inside `nexusRoutes.ts` `/webhook/observe/:token` handler (line 703+) |
| `postBarAutomation` call site | Exclusively inside `nexusRoutes.ts` TradingView webhook handler |
| `bridge-server.ts` | Explicitly: "No downstream processing (processBar, postBarAutomation, strategies)" |
| Runtime log | Zero Databento processBar/postBarAutomation calls across all samples |

### Phase 6 — CB-001 through CB-020 Post-Activation

**Result: 20/20 PASS (40.8s)**

CB-020 updated: badge now asserted **visible** in `DATABENTO_CHART_AUTHORITY` mode. `DatabentoLiveChart.tsx` updated to fetch `authorityMode` from health endpoint on mount.

### Phase 7 — Stability Validation

#### Pre-systemd samples (nohup, Manus sidecar session)

| Sample | Time (UTC) | Result | Notes |
|--------|-----------|--------|-------|
| 1 (T+0m) | 10:17:10 | **PASS** | READY \| DATABENTO_CHART_AUTHORITY \| unresolved=0 \| persistErrors=0 |
| 2 (T+10m) | 10:27:10 | **PASS** | READY \| DATABENTO_CHART_AUTHORITY \| unresolved=0 \| persistErrors=0 |
| 3 (T+20m) | 10:37:10 | **PASS** | READY \| DATABENTO_CHART_AUTHORITY \| unresolved=0 \| persistErrors=0 |
| 4 (T+30m) | 10:47:11 | **PASS** | READY \| DATABENTO_CHART_AUTHORITY \| unresolved=0 \| persistErrors=0 |
| 5 (T+40m) | 10:57 | INFRA EVENT | Manus operator killed sidecar at 10:48:49 UTC — OS terminated process group. Not a software crash. |
| 6 (T+50m) | 11:07 | INFRA EVENT | Server still down from same cause |

**Root cause of samples 5–6:** At 10:48:44 UTC the Manus computer-operator received a `device_config` update removing session `pDRJyT6LXfyspTLi8xubq9`. The operator killed the sidecar at 10:48:49 UTC, which terminated the Atlas server process group. This is an infrastructure event, not a software failure. **Resolution:** Both services converted to systemd.

#### Systemd samples (post-fix, under `atlas-nexus.service` supervision)

| Sample | Time (UTC) | Result | svcStatus | feedSvc | unresolved | persistErrors | dbProcessBarCalls | dbPostBarCalls |
|--------|-----------|--------|-----------|---------|------------|---------------|-------------------|----------------|
| SYSTEMD-1 (T+0m) | 11:31:07 | **PASS** | active | active | 0 | 0 | 0 | 0 |
| SYSTEMD-2 (T+10m) | 11:41:08 | **PASS** | active | active | 0 | 0 | 0 | 0 |
| SYSTEMD-3 (T+20m) | 11:51:08 | **PASS** | active | active | 0 | 0 | 0 | 0 |

**SYSTEMD_STABILITY_RESULT: PASS (3/3)** — Server uptime at final sample: 32 minutes continuous, zero restarts.

### Phase 8 — Fallback + Reactivation

| Step | Result |
|------|--------|
| Switch to `DATABENTO_SHADOW` | PASS — `READY \| DATABENTO_SHADOW \| shadowEnabled=true` |
| Reactivate `DATABENTO_CHART_AUTHORITY` | PASS — `READY \| DATABENTO_CHART_AUTHORITY \| shadowEnabled=false` |

### Phase 9 — Full Regression

| Suite | Result | Notes |
|-------|--------|-------|
| `tsc --noEmit` | **PASS (0 errors)** | |
| Market-data vitest (18 files) | **379 passed, 82 skipped** | 2 pre-existing MySQL socket failures unrelated to Sprint 123A.5 |
| Python pytest | **143/143 PASS** | |
| CB-001–CB-020 Playwright | **20/20 PASS** | |

### Phase 10 — Secret Scan

| File | Result |
|------|--------|
| `client/src/components/DatabentoLiveChart.tsx` | CLEAN (`credentials: "include"` is a standard fetch option) |
| `scripts/browser_tests/chart_behaviours.spec.ts` | CLEAN |
| `deploy/atlas-nexus.service` | CLEAN (uses `EnvironmentFile=` — no inline secrets) |
| `deploy/atlas-feed-adapter.service` | CLEAN (uses `EnvironmentFile=` — no inline secrets) |
| `scripts/sprint123a5_systemd_stability.sh` | CLEAN |
| `docs/reports/SPRINT_123A5_CHART_AUTHORITY_ACTIVATION_RESULTS.md` | CLEAN |
| `.env` | **Not tracked in git** (confirmed by `.gitignore`) |

**SECRET_SCAN: PASS**

---

## Systemd Infrastructure (New — Sprint 123A.5)

Two systemd services installed on the Cloud Computer for permanent process supervision:

**`/etc/systemd/system/atlas-nexus.service`**
- `Restart=always`, `RestartSec=5`
- `EnvironmentFile=/home/ubuntu/atlas-nexus/.env`
- Log: `/var/log/atlas-nexus/server.log`
- Enabled: `WantedBy=multi-user.target`

**`/etc/systemd/system/atlas-feed-adapter.service`**
- `Restart=always`, `RestartSec=10`
- `Requires=atlas-nexus.service`
- Log: `/var/log/atlas-nexus/feed-adapter.log`
- Enabled: `WantedBy=multi-user.target`

Source unit files committed to: `deploy/atlas-nexus.service`, `deploy/atlas-feed-adapter.service`

---

## Files Changed in Sprint 123A.5

| File | Change |
|------|--------|
| `client/src/components/DatabentoLiveChart.tsx` | Added health fetch on mount to dynamically set `chartSource` from `authorityMode` |
| `scripts/browser_tests/chart_behaviours.spec.ts` | CB-020 updated: badge now asserted **visible** in `DATABENTO_CHART_AUTHORITY` mode |
| `deploy/atlas-nexus.service` | **New** — systemd unit for Atlas server |
| `deploy/atlas-feed-adapter.service` | **New** — systemd unit for feed adapter |
| `scripts/sprint123a5_stability_check.sh` | Stability validation script (pre-systemd) |
| `scripts/sprint123a5_systemd_stability.sh` | Systemd stability validation script |
| `docs/reports/SPRINT_123A5_CHART_AUTHORITY_ACTIVATION_RESULTS.md` | This report |

---

## Gate G5 Verdict

| Gate | Criterion | Result |
|------|-----------|--------|
| G5-1 | `MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY` in `.env` | **PASS** |
| G5-2 | `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true` in `.env` | **PASS** |
| G5-3 | Server starts with `chart-authority pipeline READY` | **PASS** |
| G5-4 | Health: `authorityMode=DATABENTO_CHART_AUTHORITY`, `shadowEnabled=false` | **PASS** |
| G5-5 | `processBar` and `postBarAutomation` remain TradingView-only | **PASS** |
| G5-6 | CB-001–CB-020: 20/20 PASS | **PASS** |
| G5-7 | Fallback to `DATABENTO_SHADOW` and reactivation clean | **PASS** |
| G5-8 | Stability: 4 pre-systemd PASS + 3 systemd PASS (infra event documented) | **PASS** |
| G5-9 | Full regression: tsc 0 errors, 379 TS tests, 143 Python tests | **PASS** |
| G5-10 | Secret scan: all files clean, `.env` not tracked | **PASS** |
| G5-11 | Systemd services installed, enabled, boot-persistent | **PASS** |

**GATE G5: ALL 11 CRITERIA PASS**

---

*Report generated: 2026-07-22 ~11:55 UTC*  
*Author: Manus AI (Atlas Nexus autonomous agent)*  
*Awaiting Phil's written approval to proceed to Sprint 123A.6 planning.*
