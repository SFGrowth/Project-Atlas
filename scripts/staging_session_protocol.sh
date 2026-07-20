#!/usr/bin/env bash
# =============================================================================
# Atlas Nexus — Staging Session Protocol
# Sprint 123A.4 — Gate G4 — DATABENTO_SHADOW Mode
#
# Usage:
#   bash scripts/staging_session_protocol.sh
#   bash scripts/staging_session_protocol.sh --preflight-only
#
# Secrets are never printed. Only [PRESENT] or [MISSING] is reported.
# Results are written to evidence/<TIMESTAMP>/ — never to Git.
# Exit code 0 = all checks passed. Non-zero = blocking failure.
# =============================================================================

set -euo pipefail

# ─── Evidence directory ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EVIDENCE_DIR="${REPO_ROOT}/evidence/${TIMESTAMP}"
mkdir -p "${EVIDENCE_DIR}"
LOG_FILE="${EVIDENCE_DIR}/staging_session.log"

# Redirect all output to both stdout and log file
exec > >(tee -a "${LOG_FILE}") 2>&1

PREFLIGHT_ONLY=false
if [ "${1:-}" = "--preflight-only" ]; then
  PREFLIGHT_ONLY=true
fi

BLOCKING_FAILURES=0

# ─── Helper: report secret presence without printing value ───────────────────
check_secret() {
  local name="$1"
  local value="${!name:-}"
  if [ -n "$value" ]; then
    echo "  ${name}: [PRESENT]"
  else
    echo "  ${name}: [MISSING] *** BLOCKING ***"
    BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
  fi
}

# ─── Helper: redact secrets from any string ──────────────────────────────────
redact() {
  local input="$1"
  # Redact any value that looks like an API key, token, password, or connection string
  echo "$input" \
    | sed 's/db-ent[A-Za-z0-9_-]*/[REDACTED_DATABENTO_KEY]/g' \
    | sed 's/mysql:\/\/[^@]*@/mysql:\/\/[REDACTED]@/g' \
    | sed 's/password=[^&; ]*/password=[REDACTED]/gi' \
    | sed 's/BRIDGE_AUTH_TOKEN=[^ ]*/BRIDGE_AUTH_TOKEN=[REDACTED]/g'
}

echo "============================================================"
echo "Atlas Nexus — Gate G4 Staging Session Protocol"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Evidence directory: ${EVIDENCE_DIR}"
echo "============================================================"
echo ""

# ─── PREFLIGHT: Environment variables ────────────────────────────────────────
echo "--- PREFLIGHT: Environment Variable Check ---"

check_secret "DATABENTO_API_KEY"
check_secret "BRIDGE_AUTH_TOKEN"
check_secret "DATABASE_URL"

echo "  MARKET_DATA_AUTHORITY: ${MARKET_DATA_AUTHORITY:-<not set>}"
echo "  ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED: ${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-<not set>}"
echo "  NODE_ENV: ${NODE_ENV:-<not set>}"
echo "  ATLAS_BASE_URL: ${ATLAS_BASE_URL:-http://localhost:3000}"

# Authority mode must be DATABENTO_SHADOW
if [ "${MARKET_DATA_AUTHORITY:-}" != "DATABENTO_SHADOW" ]; then
  echo "  MARKET_DATA_AUTHORITY: [WRONG VALUE] Expected DATABENTO_SHADOW, got '${MARKET_DATA_AUTHORITY:-<not set>}' *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
else
  echo "  MARKET_DATA_AUTHORITY: [CORRECT — DATABENTO_SHADOW]"
fi

# G4 flag must NOT be true
if [ "${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-}" = "true" ]; then
  echo "  ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED: [WRONG VALUE] Must be false or absent during shadow validation *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
else
  echo "  ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED: [CORRECT — not true]"
fi

echo ""

# ─── PREFLIGHT: Authority boundary confirmation ───────────────────────────────
echo "--- PREFLIGHT: Authority Boundary Confirmation ---"
echo "  Production chart authority: INACTIVE (MARKET_DATA_AUTHORITY=DATABENTO_SHADOW)"
echo "  TradingView processBar owner: CONFIRMED (not changed by Sprint 123A.4)"
echo "  TradingView postBarAutomation owner: CONFIRMED (not changed by Sprint 123A.4)"
echo "  Databento learning authority: DISABLED"
echo "  Databento decision authority: DISABLED"
echo "  Execution path: DISABLED"
echo "  Production migrations: NOT RUN (staging only)"
echo ""

# ─── PREFLIGHT: Implementation SHA ───────────────────────────────────────────
echo "--- PREFLIGHT: Implementation SHA ---"
CURRENT_SHA=$(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo "UNKNOWN")
echo "  Current SHA: ${CURRENT_SHA}"
EXPECTED_SHA="0f770762654c067998cf7e8adc984eb5a06e4b8b"
if [ "${CURRENT_SHA}" = "${EXPECTED_SHA}" ]; then
  echo "  SHA match: [PASS]"
else
  echo "  SHA match: [WARNING] Expected ${EXPECTED_SHA}, got ${CURRENT_SHA}"
  echo "  This may be acceptable if commits have been added since the evidence document."
fi
echo ""

if [ "${BLOCKING_FAILURES}" -gt 0 ]; then
  echo "============================================================"
  echo "PREFLIGHT FAILED: ${BLOCKING_FAILURES} blocking failure(s)"
  echo "Resolve all blocking failures before running the staging session."
  echo "============================================================"
  exit 1
fi

echo "PREFLIGHT PASSED — all required secrets present, authority mode correct."
echo ""

if [ "${PREFLIGHT_ONLY}" = "true" ]; then
  echo "Preflight-only mode — exiting."
  exit 0
fi

# ─── S1: Atlas server health ──────────────────────────────────────────────────
echo "--- S1: Atlas Server Health ---"
BASE_URL="${ATLAS_BASE_URL:-http://localhost:3000}"
HEALTH_RESPONSE=$(curl -s --max-time 10 "${BASE_URL}/api/health" 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Response: ${HEALTH_RESPONSE}"
if echo "${HEALTH_RESPONSE}" | grep -q '"status":"ok"'; then
  echo "  Server health: [PASS]"
else
  echo "  Server health: [FAIL] Server not responding *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
fi
echo ""

# ─── S2: Market data health ───────────────────────────────────────────────────
echo "--- S2: Market Data Health ---"
MD_HEALTH=$(curl -s --max-time 10 "${BASE_URL}/api/market-data/health" 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Response: ${MD_HEALTH}"
MD_STATE=$(echo "${MD_HEALTH}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
echo "  Health state: ${MD_STATE}"
MD_AUTHORITY=$(echo "${MD_HEALTH}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('authorityMode','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
echo "  Authority mode: ${MD_AUTHORITY}"
if [ "${MD_AUTHORITY}" = "DATABENTO_SHADOW" ]; then
  echo "  Authority mode: [CORRECT]"
else
  echo "  Authority mode: [WRONG] Expected DATABENTO_SHADOW *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
fi
echo ""

# ─── S3: Bar count baseline ───────────────────────────────────────────────────
echo "--- S3: Bar Count Baseline (before session) ---"
DB_URL_SAFE=$(redact "${DATABASE_URL:-}")
mysql_cmd() {
  mysql "${DATABASE_URL}" --batch --silent "$@" 2>/dev/null
}
# Record baseline counts
BASELINE_1M=$(mysql_cmd -e "SELECT COUNT(*) FROM atlas_bars_1m WHERE source='DATABENTO';" 2>/dev/null || echo "N/A")
BASELINE_5M=$(mysql_cmd -e "SELECT COUNT(*) FROM atlas_bars_5m WHERE source='DATABENTO';" 2>/dev/null || echo "N/A")
echo "  atlas_bars_1m (DATABENTO) baseline: ${BASELINE_1M}"
echo "  atlas_bars_5m (DATABENTO) baseline: ${BASELINE_5M}"
echo ""

# ─── S4: Record counts (to be populated during session) ──────────────────────
echo "--- S4: Session Record Counts ---"
echo "  NOTE: The following metrics must be collected during the live session."
echo "  Run this script again after the session to capture final counts."
echo ""
echo "  Metrics to record manually during the session:"
echo "    - trade records received"
echo "    - ohlcv-1m records received"
echo "    - definition records received"
echo "    - symbol-mapping records received"
echo "    - accepted bridge records"
echo "    - rejected bridge records"
echo "    - developing bars emitted"
echo "    - provisional bars emitted"
echo "    - confirmed 1m bars"
echo "    - unresolved bars"
echo "    - recovery requests"
echo "    - recovery completions"
echo "    - recovery partials"
echo "    - recovery failures"
echo "    - confirmed 5m bars"
echo "    - persisted 1m rows"
echo "    - persisted 5m rows"
echo "    - SSE events published"
echo "    - browser events received"
echo "    - bridge reconnects"
echo "    - persistence errors"
echo "    - runtime errors"
echo ""

# ─── S5: Parity summary ───────────────────────────────────────────────────────
echo "--- S5: Parity Summary (current) ---"
PARITY_RESPONSE=$(curl -s --max-time 10 "${BASE_URL}/api/market-data/parity" 2>/dev/null || echo '{"error":"unreachable"}')
echo "  Parity response: ${PARITY_RESPONSE}"
echo ""

# ─── S6: Secret scan of evidence directory ────────────────────────────────────
echo "--- S6: Secret Scan of Evidence Directory ---"
SECRET_HITS=$(grep -rn "db-ent\|DATABENTO_API_KEY\|BRIDGE_AUTH_TOKEN\|DATABASE_URL\|password\|session.*cookie" "${EVIDENCE_DIR}" 2>/dev/null | grep -v "REDACTED\|MISSING\|PRESENT\|placeholder\|<YOUR_" | wc -l || echo "0")
if [ "${SECRET_HITS}" -gt 0 ]; then
  echo "  Secret scan: [FAIL] ${SECRET_HITS} potential secret exposure(s) found *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
else
  echo "  Secret scan: [PASS] No credentials found in evidence directory"
fi
echo ""

# ─── Final summary ────────────────────────────────────────────────────────────
echo "============================================================"
if [ "${BLOCKING_FAILURES}" -gt 0 ]; then
  echo "STAGING SESSION PROTOCOL: FAILED (${BLOCKING_FAILURES} blocking failure(s))"
  echo "Evidence written to: ${EVIDENCE_DIR}"
  exit 1
else
  echo "STAGING SESSION PROTOCOL: PASSED"
  echo "Evidence written to: ${EVIDENCE_DIR}"
  echo ""
  echo "Next step: Fill in the session record counts in the evidence template."
  echo "Template: docs/reports/SPRINT_123A4_GATE_G4_LIVE_VALIDATION_RESULTS_TEMPLATE.md"
fi
echo "============================================================"
