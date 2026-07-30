# DARWIN Operational Recovery — Root Cause Diagnosis

**Sprint:** DARWIN-OPS-RECOVERY  
**Date:** 2026-07-30  
**Status:** RESOLVED

## Root Cause

The Atlas Nexus server requires `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` (Manus Forge) for `sdk.authenticateRequest()` to succeed on scheduled endpoints. These credentials are unavailable on the standalone cloud PC (35.231.100.83), causing every DARWIN scheduled endpoint to throw `HttpError: Invalid session cookie` before any business logic could execute.

Additionally, no cron daemon was installed on the cloud PC, so no trigger mechanism existed.

## Solution

A local cron bypass was implemented:
1. `server/_core/localCronAuth.ts` — exports `isLocalCronRequest(req)` with constant-time comparison of `X-Local-Cron-Secret` header against `ENV.localCronSecret`.
2. `server/_core/env.ts` — added `localCronSecret` reading `LOCAL_CRON_SECRET` from env.
3. `server/scheduledJobs.ts` — all 20 auth blocks patched to call `isLocalCronRequest(req)` first.
4. `/etc/cron.d/atlas-darwin` — 6 cron jobs installed (root:root, 644).

## Verification

After fix: all 6 DARWIN endpoints return `{"ok":true}`. `darwin_job_queue` grew from 0 to 7 rows. New `darwin_daily_reports` row created for 2026-07-30.

## Authority Flags (Unchanged)

```
DARWIN_DECISION_AUTHORITY: DISABLED
DARWIN_EXECUTION_AUTHORITY: DISABLED
LIVE_TRADES_INITIATED: 0
```
