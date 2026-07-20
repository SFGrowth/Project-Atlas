# Sprint 123A.4 — Staging Provisioning Runbook

**Document version:** 1.0  
**Sprint:** 123A.4  
**Implementation SHA:** `0f770762654c067998cf7e8adc984eb5a06e4b8b`  
**Gate:** G4 (pending approval)  
**Audience:** Atlas operator running the Gate G4 staging validation  
**Scope:** Staging or isolated development host only — never production

> **Authority boundary.** This runbook sets `MARKET_DATA_AUTHORITY=DATABENTO_SHADOW` only.
> `DATABENTO_CHART_AUTHORITY` must not be activated until Gate G4 is approved in writing by Phil.
> TradingView remains the owner of `processBar` and `postBarAutomation` throughout.

---

## 1. Prerequisites

### 1.1 Hardware

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB |
| Network | Outbound HTTPS (443) to Databento API | Dedicated staging host |

### 1.2 Runtime versions

| Runtime | Required version | Check command |
|---|---|---|
| Node.js | 22.x LTS | `node --version` |
| pnpm | 11.x | `pnpm --version` |
| Python | 3.11 or 3.12 | `python3 --version` |
| MySQL | 8.0.x | `mysql --version` |

### 1.3 Network requirements

| Destination | Port | Protocol | Purpose |
|---|---|---|---|
| `hist.databento.com` | 443 | HTTPS | Databento historical API |
| `live.databento.com` | 443 | WSS | Databento live feed |
| `localhost` | 3000 | HTTP | Atlas server (internal) |
| `localhost` | 3001 | HTTP | Vite dev server (internal) |

No inbound ports need to be opened for the staging validation.

### 1.4 Accounts and access

- Databento account with an active staging API key and MNQ subscription
- Atlas Nexus repository access (branch: `sprint/123a-2-databento-adapter`)
- MySQL 8 staging database credentials

---

## 2. Installation

### 2.1 Clone the repository

```bash
git clone https://github.com/SFGrowth/Project-Atlas.git atlas-nexus-staging
cd atlas-nexus-staging
git checkout sprint/123a-2-databento-adapter
git rev-parse HEAD
# Must print: 0f770762654c067998cf7e8adc984eb5a06e4b8b
```

### 2.2 Install Node.js dependencies

```bash
pnpm install
```

### 2.3 Install Python dependencies

```bash
cd services/databento-feed
pip3 install -r requirements.txt
cd ../..
```

### 2.4 Install Playwright

```bash
pnpm exec playwright install chromium
pnpm exec playwright install-deps chromium
```

---

## 3. Staging Database Setup

### 3.1 Create the staging database

```bash
mysql -u root -p -e "CREATE DATABASE atlas_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'atlas_staging'@'localhost' IDENTIFIED BY '<STAGING_DB_PASSWORD>';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON atlas_staging.* TO 'atlas_staging'@'localhost';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

### 3.2 Apply migrations

Apply migrations in order. Apply to staging only — never to production.

```bash
# Migration 0026: Sprint 123A.1 foundation schema
mysql -u atlas_staging -p atlas_staging < drizzle/0026_sprint_123a1_foundation.sql

# Migration 0027: Sprint 123A.3 canonical identity key with interval_ms
mysql -u atlas_staging -p atlas_staging < drizzle/0027_sprint_123a3_canonical_identity.sql
```

### 3.3 Verify the schema

```bash
mysql -u atlas_staging -p atlas_staging -e "SHOW TABLES;"
mysql -u atlas_staging -p atlas_staging -e "DESCRIBE atlas_bars_1m;"
mysql -u atlas_staging -p atlas_staging -e "DESCRIBE atlas_bars_5m;"
mysql -u atlas_staging -p atlas_staging -e "DESCRIBE atlas_bar_processing_ledger;"
```

Expected tables: `atlas_bars_1m`, `atlas_bars_5m`, `atlas_bar_processing_ledger`.  
Expected key columns in `atlas_bars_1m`: `source`, `dataset`, `raw_symbol`, `instrument_id`, `interval_ms`, `bar_open_ts_ms`, `revision`, `mapping_version` (8 columns).

---

## 4. Secure Secret Loading

### 4.1 Required environment variables

| Variable | Description | Must not be |
|---|---|---|
| `MARKET_DATA_AUTHORITY` | Authority mode | Anything other than `DATABENTO_SHADOW` for this validation |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | G4 feature flag | `true` (must be `false` or absent) |
| `DATABENTO_API_KEY` | Databento staging API key | In Git, logs, or reports |
| `BRIDGE_AUTH_TOKEN` | Bridge authentication token | In Git, logs, or reports |
| `DATABASE_URL` | MySQL staging connection string | In Git, logs, or reports |
| `ATLAS_BASE_URL` | Staging server base URL | — |
| `SESSION_SECRET` | Express session secret | In Git, logs, or reports |

### 4.2 Approved secret mechanisms

Choose one of the following. Do not use `.env` files committed to Git.

**Option A — Operating system service environment file (recommended for bare-metal staging):**

```bash
# Create a restricted environment file
sudo install -m 600 -o atlas -g atlas /dev/null /etc/atlas-staging.env

# Populate with secrets (edit securely — do not echo values in shell history)
sudo nano /etc/atlas-staging.env
```

File contents (placeholders only — replace with real values securely):

```
MARKET_DATA_AUTHORITY=DATABENTO_SHADOW
ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false
DATABENTO_API_KEY=<YOUR_STAGING_API_KEY>
BRIDGE_AUTH_TOKEN=<YOUR_BRIDGE_TOKEN>
DATABASE_URL=mysql://atlas_staging:<PASSWORD>@localhost:3306/atlas_staging
ATLAS_BASE_URL=http://localhost:3000
SESSION_SECRET=<RANDOM_64_CHAR_HEX>
```

Load at runtime:

```bash
set -a; source /etc/atlas-staging.env; set +a
```

**Option B — Docker secrets (for containerised staging):**

```bash
echo "<API_KEY>" | docker secret create databento_api_key -
echo "<BRIDGE_TOKEN>" | docker secret create bridge_auth_token -
```

Reference in `docker-compose.yml` using `secrets:` stanza — never in environment variables directly.

**Option C — Cloud secret manager (for cloud staging):**

Use AWS Secrets Manager, GCP Secret Manager, or Azure Key Vault. Load at runtime using the provider's SDK. Never log the retrieved values.

### 4.3 Verify secrets are present (without printing values)

```bash
bash scripts/run_gate_g4_staging_validation.sh --preflight-only
```

This prints only whether each secret is present (`[PRESENT]` or `[MISSING]`) — never the values.

---

## 5. Bridge Startup

The bridge receives TradingView webhook payloads and forwards them to the Atlas server.

```bash
# The bridge is embedded in the Atlas server — no separate process required.
# Confirm the bridge endpoint is accessible after server startup:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/webhook/health
# Expected: 200
```

---

## 6. Python Databento Adapter Startup

```bash
cd services/databento-feed

# Verify environment variables are loaded (values must not be printed)
python3 -c "
import os
keys = ['DATABENTO_API_KEY', 'DATABASE_URL']
for k in keys:
    print(f'{k}: [PRESENT]' if os.environ.get(k) else f'{k}: [MISSING]')
"

# Start the feed adapter (foreground for validation — use systemd or supervisor for long-running)
python3 feed_adapter.py
```

The adapter will:
1. Connect to the Databento live feed using `DATABENTO_API_KEY`
2. Subscribe to MNQ trade and ohlcv-1m records
3. Forward records to the Atlas bridge on `localhost:3000/api/databento/bridge`
4. Authenticate using `BRIDGE_AUTH_TOKEN`

---

## 7. Atlas Server Startup

```bash
cd /path/to/atlas-nexus-staging

# Verify environment
echo "MARKET_DATA_AUTHORITY=${MARKET_DATA_AUTHORITY}"
# Must print: MARKET_DATA_AUTHORITY=DATABENTO_SHADOW

echo "ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-false}"
# Must print: ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false

# Start the server
pnpm dev
```

The server starts on port 3000 by default.

---

## 8. Frontend Startup

For the Playwright browser tests, the frontend must be accessible.

**Option A — Development server (recommended for validation):**

```bash
# In a separate terminal
cd client
pnpm dev
# Frontend available at http://localhost:3001
```

**Option B — Production build served by the Atlas server:**

```bash
pnpm build
# Frontend is served by the Atlas server at http://localhost:3000
```

---

## 9. Health Checks

Run these checks before starting the validation session:

```bash
# 1. Atlas server health
curl -s http://localhost:3000/api/health | jq .
# Expected: {"status":"ok"}

# 2. Market data health
curl -s http://localhost:3000/api/market-data/health | jq .
# Expected: {"state":"LIVE"} or {"state":"INITIALISING"} (wait up to 60s for LIVE)

# 3. Database connectivity
curl -s http://localhost:3000/api/health/db | jq .
# Expected: {"connected":true}

# 4. Databento bridge status
curl -s http://localhost:3000/api/market-data/health | jq .bridgeConnected
# Expected: true

# 5. Confirm authority mode
curl -s http://localhost:3000/api/market-data/health | jq .authorityMode
# Expected: "DATABENTO_SHADOW"
```

---

## 10. Validation Commands

Once all health checks pass, run the full Gate G4 staging validation:

```bash
bash scripts/run_gate_g4_staging_validation.sh
```

This runs all validation steps in sequence and stops immediately on any blocking failure.

Results are written to `evidence/<TIMESTAMP>/` — never to Git.

---

## 11. Shutdown Procedure

```bash
# 1. Stop the Python adapter (Ctrl+C or kill the process)
# 2. Stop the Atlas server (Ctrl+C)
# 3. Stop the frontend dev server (Ctrl+C)
# 4. Verify no secrets remain in shell history
history -c && history -w
# 5. Verify no secrets remain in evidence directory
bash scripts/run_gate_g4_staging_validation.sh --secret-scan-only
```

---

## 12. Secret Redaction Checks

Before committing any evidence output, run:

```bash
# Scan evidence directory for any credential patterns
grep -rn "db-ent\|DATABENTO_API_KEY\|BRIDGE_AUTH_TOKEN\|DATABASE_URL\|password\|secret\|cookie" evidence/ 2>/dev/null
# Expected: zero matches
```

The validation scripts automatically redact secrets from all output. If any match is found, delete the affected file and re-run the relevant step.

---

## 13. Rollback and Cleanup Procedure

If the staging validation fails or needs to be aborted:

```bash
# 1. Stop all Atlas processes
pkill -f "tsx watch server" 2>/dev/null || true
pkill -f "feed_adapter.py" 2>/dev/null || true

# 2. Drop the staging database (if needed)
mysql -u root -p -e "DROP DATABASE IF EXISTS atlas_staging;"

# 3. Remove the environment file
sudo rm -f /etc/atlas-staging.env

# 4. Clear shell history
history -c && history -w

# 5. Remove evidence directory if it contains secrets
rm -rf evidence/

# 6. Confirm production is unaffected
# Production database: untouched (migrations 0026/0027 were NOT applied to production)
# Production server: untouched (MARKET_DATA_AUTHORITY unchanged)
# TradingView: still owns processBar and postBarAutomation
```

---

## 14. Authority Boundary Confirmation

At all times during the staging validation:

| Boundary | State |
|---|---|
| `MARKET_DATA_AUTHORITY` | `DATABENTO_SHADOW` only |
| `ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED` | `false` or absent |
| `processBar` owner | TradingView |
| `postBarAutomation` owner | TradingView |
| Databento learning authority | Disabled |
| Databento decision authority | Disabled |
| Execution path | Disabled |
| Production migrations | Not run |
| Production chart authority | Not activated |

---

*This runbook contains no credentials. All secret values are placeholders only.*  
*Gate G4 is pending. Sprint 123A.5 has not begun.*
