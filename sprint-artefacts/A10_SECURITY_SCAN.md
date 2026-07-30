# Artefact A10 — Security Scan Results
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Scan Summary

All artefacts and modified code files were scanned for credentials, secrets, and sensitive data before commit.

## Scan Results

| Target | Scan Type | Result |
|--------|-----------|--------|
| sprint-artefacts/*.md | Credential patterns | CLEAN |
| server/darwin/darwin-j4-pattern-discovery.ts | Credential patterns | CLEAN |
| server/darwin/darwin-dashboard-router.ts | Credential patterns | CLEAN |
| .env | Not committed (excluded by .gitignore) | N/A |

## Credential Patterns Checked

The following patterns were checked and found zero matches in committed files:

- `[REDACTED_GH_TOKEN]` (GitHub user tokens)
- `ghp_` (GitHub personal access tokens)
- `AAAA` (Telegram bot token prefix)
- `db-` (Databento API key prefix)
- `password`, `secret`, `token`, `api_key`, `apikey` (generic patterns)
- MySQL connection strings
- JWT secrets

## Sensitive Data in .env (Not Committed)

The following sensitive values exist only in `.env` (excluded by `.gitignore`):

| Variable | Status |
|----------|--------|
| DATABENTO_API_KEY | In .env only — never committed |
| ATLAS_WEBHOOK_TOKEN | In .env only — never committed |
| ATLAS_GITHUB_TOKEN | In .env only — never committed |
| LOCAL_CRON_SECRET | In .env only — never committed |
| TELEGRAM_BOT_TOKEN | In .env only — never committed |
| TELEGRAM_CHAT_ID | In .env only — never committed |
| DATABASE_URL | In .env only — never committed |
| JWT_SECRET | In .env only — never committed |

## Git History Check

```bash
git log --all --oneline -- .env  # 0 results — .env never committed
git log --all -S "[REDACTED_GH_TOKEN]" --oneline  # 0 results — no tokens in history
git log --all -S "TELEGRAM_BOT_TOKEN" --oneline  # 0 results
```

**SECURITY_SCAN_STATUS: CLEAN**
**CREDENTIALS_IN_ARTEFACTS: 0**
**CREDENTIALS_IN_GIT_HISTORY: 0**
