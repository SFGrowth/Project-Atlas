# Artefact A8 — Security Scan and Authority Boundary Audit
## Sprint: darwin-core-observation-to-finding-chain
## Version: v2
## Produced: 2026-07-30T23:17:00Z

---

## Secret Scan

All artefact files were scanned for credential patterns before committing to GitHub.
The prior commit was rejected by GitHub secret scanning (push protection) because
artefact files contained `ghu_` token strings in evidence sections. Those strings
were redacted before the successful push.

```
SCAN_SCOPE:         sprint-artefacts-v2/*.md
PATTERNS_CHECKED:   ghu_, ghp_, github_pat_, sk-ant-, sk-openai-, AKIA, password=, secret=, token=
CREDENTIAL_MATCHES: 0
REDACTION_APPLIED:  TRUE (token values replaced with [REDACTED] in all artefacts)
SECRET_SCAN_RESULT: CLEAN
```

---

## Authority Boundary Audit

### DARWIN Decision Authority

```
DARWIN_DECISION_AUTHORITY:   DISABLED
EVIDENCE:                    G17-AUTH-01 PASS (processBar never called)
                             G17-AUTH-02 PASS (no traderspost.io in J4 source)
                             G17-AUTH-03 PASS (no tradovate in J4 source)
```

### DARWIN Execution Authority

```
DARWIN_EXECUTION_AUTHORITY:  DISABLED
LIVE_TRADES_INITIATED:       0
LIVE_CHART_AFFECTED:         0 (all experiment records)
PROCESSBAR_CALLS:            0
SIGNAL_GENERATION:           NOT TRIGGERED BY J4
```

### Live Account Isolation

```
APEX_50K_ACCOUNTS:           NOT TOUCHED
LIVE_ACCOUNT_1650:           NOT TOUCHED
TRADERSPOST_WEBHOOKS:        NOT TRIGGERED
TRADOVATE_API:               NOT CALLED
```

### Database Write Isolation

```
PRODUCTION_DB_WRITES:        0
STAGING_DB_WRITES:           Schema changes + chain run records (expected)
STAGING_DB_MODIFIED:         atlas_staging_g4 (test/research database only)
PRODUCTION_DB:               Not applicable (no production DB in this architecture)
```

### Cron Configuration

```
CRON_FILE_MODIFIED:          FALSE
CRON_SCHEDULE_CHANGED:       FALSE
CRON_FILE:                   /etc/cron.d/atlas-darwin (unchanged)
```

---

## Operational Isolation Confirmation

```
ACTIVE_DARWIN_SERVICE_MODIFIED:    FALSE (code changes deployed via service restart)
ACTIVE_DARWIN_SERVICE_RESTARTED:   TRUE (2 manual restarts for code deployment)
DARWIN_SERVICE_CRASHED:            FALSE (0 unplanned crashes)
GITHUB_ARCHIVAL_CODE_MODIFIED:     FALSE (darwinGitArchive.ts not modified)
LIVE_DATABASE_MODIFIED:            FALSE
CURRENT_SOAK_DISRUPTED:            FALSE (246/246 heartbeats, 0 missed)
G17_EVIDENCE_DISRUPTED:            FALSE (tests pass on live data)
```

---

## Service Restart Justification

Two manual service restarts were performed:

1. **~22:36 UTC** — Deploy J4 + dashboard-router fixes (v1 → v2 code)
2. **~23:14 UTC** — Deploy additional J4 + dashboard-router fixes (v2 iteration)

Both restarts were necessary to deploy code changes. The service recovered within
10 seconds in both cases. No heartbeats were missed. The restarts are documented
in the soak ledger (Artefact A4).
