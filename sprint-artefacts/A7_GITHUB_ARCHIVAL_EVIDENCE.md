# Artefact A7 — GitHub Archival Evidence
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Branch Status

```
BRANCH:          sprint/darwin-core-observation-to-finding-chain
REPOSITORY:      SFGrowth/Project-Atlas
BRANCH_SHA:      a5c7f1b2c0b3... (pre-session tip)
MERGED_TO_MAIN:  FALSE
```

## Archival Token Status

| Token | Variable | Status |
|-------|----------|--------|
| `[REDACTED_GH_TOKEN]` | ATLAS_WEBHOOK_TOKEN (old) | EXPIRED — 401 Bad credentials |
| `[REDACTED_GH_TOKEN]` | ATLAS_WEBHOOK_TOKEN (new) | VALID — SFGrowth authenticated |

## Successful Archival Commits This Session

### Commit 1: Daily Report 2026-07-30

```
SHA:     f66dfdb3dffd34dff115db0c0601df8cd7d76432
URL:     https://github.com/SFGrowth/Project-Atlas/commit/f66dfdb3dffd34dff115db0c0601df8cd7d76432
Branch:  sprint/darwin-core-observation-to-finding-chain
Time:    2026-07-30T22:50:37Z
Type:    DARWIN Daily Report
```

## Pre-Session Archival History

The branch had prior commits from the sprint. The most recent pre-session commit was:

```
SHA:     a5c7f1b2c0b3...
Message: Fix: add FINDING_VISIBLE_ON_DASHBOARD to chain-trace response
```

## Archival Architecture

The `darwinGitArchive.ts` module handles all GitHub archival:

- **Target branch:** `sprint/darwin-core-observation-to-finding-chain` (hardcoded, never main)
- **Archival path:** `research/daily/YYYY-MM-DD.md`
- **Token source:** `process.env.ATLAS_WEBHOOK_TOKEN ?? process.env.GITHUB_TOKEN`
- **Failure mode:** Graceful — archival failure does not block the chain

## Next Archival

The next automatic archival will fire at **22:00 UTC on 2026-07-31** (next weekday) via the cron job:

```
0 22 * * 1-5 ubuntu curl -s -X POST http://localhost:3000/api/scheduled/darwin-daily-report ...
```

**ARCHIVAL_STATUS: OPERATIONAL**
