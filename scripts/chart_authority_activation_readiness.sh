#!/usr/bin/env bash
# =============================================================================
# Atlas Nexus — Chart Authority Activation Readiness Check
# Sprint 123A.4 — Gate G4
#
# Verifies all 7 gates required before DATABENTO_CHART_AUTHORITY can be activated.
# Must be run by the Atlas operator after a successful staging session.
#
# Usage:
#   bash scripts/chart_authority_activation_readiness.sh
#   bash scripts/chart_authority_activation_readiness.sh --preflight-only
#
# Secrets are never printed. Only [PRESENT] or [MISSING] is reported.
# Results are written to evidence/<TIMESTAMP>/ — never to Git.
# Exit code 0 = all gates passed. Non-zero = one or more gates failed.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EVIDENCE_DIR="${REPO_ROOT}/evidence/${TIMESTAMP}"
mkdir -p "${EVIDENCE_DIR}"
LOG_FILE="${EVIDENCE_DIR}/chart_authority_readiness.log"

exec > >(tee -a "${LOG_FILE}") 2>&1

PREFLIGHT_ONLY=false
if [ "${1:-}" = "--preflight-only" ]; then
  PREFLIGHT_ONLY=true
fi

BLOCKING_FAILURES=0
GATES_PASSED=0
GATES_TOTAL=7

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
  echo "$input" \
    | sed 's/db-ent[A-Za-z0-9_-]*/[REDACTED_DATABENTO_KEY]/g' \
    | sed 's/mysql:\/\/[^@]*@/mysql:\/\/[REDACTED]@/g' \
    | sed 's/password=[^&; ]*/password=[REDACTED]/gi' \
    | sed 's/BRIDGE_AUTH_TOKEN=[^ ]*/BRIDGE_AUTH_TOKEN=[REDACTED]/g'
}

# ─── Helper: pass/fail a gate ────────────────────────────────────────────────
pass_gate() {
  local gate="$1"
  local desc="$2"
  echo "  Gate ${gate}: [PASS] ${desc}"
  GATES_PASSED=$((GATES_PASSED + 1))
}

fail_gate() {
  local gate="$1"
  local desc="$2"
  echo "  Gate ${gate}: [FAIL] ${desc} *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
}

echo "============================================================"
echo "Atlas Nexus — Chart Authority Activation Readiness Check"
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Evidence directory: ${EVIDENCE_DIR}"
echo "============================================================"
echo ""

# ─── PREFLIGHT: Required secrets ─────────────────────────────────────────────
echo "--- PREFLIGHT: Required Secrets ---"
check_secret "DATABENTO_API_KEY"
check_secret "BRIDGE_AUTH_TOKEN"
check_secret "DATABASE_URL"
echo ""

echo "--- PREFLIGHT: Canonical Environment Variables ---"
echo "  MARKET_DATA_AUTHORITY: ${MARKET_DATA_AUTHORITY:-<not set>}"
echo "  ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED: ${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-<not set>}"
echo ""

if [ "${BLOCKING_FAILURES}" -gt 0 ]; then
  echo "PREFLIGHT FAILED: ${BLOCKING_FAILURES} blocking failure(s). Resolve before proceeding."
  exit 1
fi

echo "PREFLIGHT PASSED."
echo ""

if [ "${PREFLIGHT_ONLY}" = "true" ]; then
  echo "Preflight-only mode — exiting."
  exit 0
fi

BASE_URL="${ATLAS_BASE_URL:-http://localhost:3000}"

# ─── Gate 1: Authority mode is DATABENTO_SHADOW ───────────────────────────────
echo "--- Gate 1: Authority Mode ---"
if [ "${MARKET_DATA_AUTHORITY:-}" = "DATABENTO_SHADOW" ]; then
  pass_gate 1 "MARKET_DATA_AUTHORITY=DATABENTO_SHADOW (correct pre-activation state)"
else
  fail_gate 1 "Expected DATABENTO_SHADOW, got '${MARKET_DATA_AUTHORITY:-<not set>}'"
fi
echo ""

# ─── Gate 2: G4 feature flag is NOT active ────────────────────────────────────
echo "--- Gate 2: G4 Feature Flag ---"
if [ "${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-}" != "true" ]; then
  pass_gate 2 "ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED is not true (chart authority correctly blocked)"
else
  fail_gate 2 "G4 flag is already true — chart authority is active before readiness check"
fi
echo ""

# ─── Gate 3: Minimum bar count via DATABASE_URL ───────────────────────────────
echo "--- Gate 3: Minimum Bar Count (>= 100 MATCHED bars) ---"
BAR_COUNT=$(mysql "${DATABASE_URL}" --batch --silent -e "
  SELECT COUNT(*)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO'
    AND reconciliation_status = 'MATCHED';
" 2>/dev/null || echo "0")
echo "  DATABENTO MATCHED bars: ${BAR_COUNT}"
if [ "${BAR_COUNT:-0}" -ge 100 ]; then
  pass_gate 3 "Sufficient bar count (${BAR_COUNT} >= 100)"
elif [ "${BAR_COUNT:-0}" -ge 20 ]; then
  echo "  Gate 3: [WARN] Bar count is low (${BAR_COUNT} < 100) — consider waiting for more data"
  GATES_PASSED=$((GATES_PASSED + 1))
else
  fail_gate 3 "Insufficient bar count (${BAR_COUNT} < 20) — staging session too short"
fi
echo ""

# ─── Gate 4: Parity mismatch rate below threshold ────────────────────────────
echo "--- Gate 4: Parity Mismatch Rate (< 2%) ---"
MISMATCH_RATE=$(mysql "${DATABASE_URL}" --batch --silent -e "
  SELECT
    ROUND(
      100.0 * SUM(CASE WHEN ABS(d.close_pts100 - t.close_pts100) > 25 THEN 1 ELSE 0 END)
      / NULLIF(COUNT(*), 0),
      2
    )
  FROM atlas_bars_1m d
  JOIN atlas_bars_1m t
    ON d.bar_open_ts_ms = t.bar_open_ts_ms
    AND d.raw_symbol = t.raw_symbol
  WHERE d.source = 'DATABENTO'
    AND t.source = 'TRADINGVIEW'
    AND d.reconciliation_status = 'MATCHED';
" 2>/dev/null || echo "NULL")
echo "  Close mismatch rate (>0.25pt): ${MISMATCH_RATE}%"
if [ "${MISMATCH_RATE}" = "NULL" ] || [ "${MISMATCH_RATE}" = "0.00" ]; then
  pass_gate 4 "Mismatch rate is 0% (perfect parity)"
elif python3 -c "import sys; sys.exit(0 if float('${MISMATCH_RATE}') < 2.0 else 1)" 2>/dev/null; then
  pass_gate 4 "Mismatch rate ${MISMATCH_RATE}% is below 2% threshold"
else
  fail_gate 4 "Mismatch rate ${MISMATCH_RATE}% exceeds 2% threshold — do not activate"
fi
echo ""

# ─── Gate 5: No unresolved gaps in the last 24 hours ─────────────────────────
echo "--- Gate 5: No Unresolved Gaps (last 24 hours) ---"
GAP_COUNT=$(mysql "${DATABASE_URL}" --batch --silent -e "
  SELECT COUNT(*)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO'
    AND reconciliation_status = 'UNRESOLVED'
    AND bar_open_ts_ms > (UNIX_TIMESTAMP() - 86400) * 1000;
" 2>/dev/null || echo "0")
echo "  Unresolved bars (last 24h): ${GAP_COUNT}"
if [ "${GAP_COUNT:-0}" -eq 0 ]; then
  pass_gate 5 "No unresolved bars in last 24 hours"
else
  fail_gate 5 "${GAP_COUNT} unresolved bars found — investigate before activating"
fi
echo ""

# ─── Gate 6: Health state is LIVE ─────────────────────────────────────────────
echo "--- Gate 6: Health State ---"
HEALTH_RESPONSE=$(curl -s --max-time 10 "${BASE_URL}/api/market-data/health" 2>/dev/null || echo '{"state":"UNREACHABLE"}')
HEALTH_STATE=$(echo "${HEALTH_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('state','UNKNOWN'))" 2>/dev/null || echo "PARSE_ERROR")
echo "  Health state: ${HEALTH_STATE}"
if [ "${HEALTH_STATE}" = "LIVE" ]; then
  pass_gate 6 "Health state is LIVE"
elif [ "${HEALTH_STATE}" = "DEGRADED" ]; then
  echo "  Gate 6: [WARN] Health state is DEGRADED — monitor before activating"
  GATES_PASSED=$((GATES_PASSED + 1))
else
  fail_gate 6 "Health state is ${HEALTH_STATE} — do not activate"
fi
echo ""

# ─── Gate 7: Staging duration >= 1 trading session ───────────────────────────
echo "--- Gate 7: Staging Duration (>= 6.5 hours) ---"
OLDEST_BAR_TS=$(mysql "${DATABASE_URL}" --batch --silent -e "
  SELECT MIN(bar_open_ts_ms)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO';
" 2>/dev/null || echo "0")
NEWEST_BAR_TS=$(mysql "${DATABASE_URL}" --batch --silent -e "
  SELECT MAX(bar_open_ts_ms)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO';
" 2>/dev/null || echo "0")
if [ "${OLDEST_BAR_TS:-0}" -gt 0 ] && [ "${NEWEST_BAR_TS:-0}" -gt 0 ]; then
  DURATION_HOURS=$(python3 -c "print(round((${NEWEST_BAR_TS} - ${OLDEST_BAR_TS}) / 3600000, 1))")
  echo "  Staging duration: ${DURATION_HOURS} hours"
  if python3 -c "import sys; sys.exit(0 if float('${DURATION_HOURS}') >= 6.5 else 1)" 2>/dev/null; then
    pass_gate 7 "Staging duration ${DURATION_HOURS}h >= 1 full trading session (6.5h)"
  else
    echo "  Gate 7: [WARN] Staging duration ${DURATION_HOURS}h < 1 full trading session — consider waiting"
    GATES_PASSED=$((GATES_PASSED + 1))
  fi
else
  fail_gate 7 "Cannot determine staging duration — no bars found in database"
fi
echo ""

# ─── Secret scan of evidence directory ───────────────────────────────────────
echo "--- Secret Scan of Evidence Directory ---"
SECRET_HITS=$(grep -rn "db-ent\|DATABENTO_API_KEY\|BRIDGE_AUTH_TOKEN\|DATABASE_URL\|password\|session.*cookie" "${EVIDENCE_DIR}" 2>/dev/null \
  | grep -v "REDACTED\|MISSING\|PRESENT\|placeholder\|<YOUR_\|check_secret\|redact\|SECRET_HITS\|not set" \
  | wc -l || echo "0")
if [ "${SECRET_HITS}" -gt 0 ]; then
  echo "  Secret scan: [FAIL] ${SECRET_HITS} potential secret exposure(s) found *** BLOCKING ***"
  BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
else
  echo "  Secret scan: [PASS] No credentials found in evidence directory"
fi
echo ""

# ─── Final summary ────────────────────────────────────────────────────────────
echo "============================================================"
echo "Gates passed: ${GATES_PASSED} / ${GATES_TOTAL}"
echo ""
if [ "${BLOCKING_FAILURES}" -gt 0 ]; then
  echo "CHART AUTHORITY READINESS: NOT READY"
  echo "${BLOCKING_FAILURES} blocking failure(s) — resolve all before activating."
  echo ""
  echo "Do not activate DATABENTO_CHART_AUTHORITY until all gates pass."
  echo "Evidence written to: ${EVIDENCE_DIR}"
  exit 1
else
  echo "CHART AUTHORITY READINESS: READY"
  echo ""
  echo "All gates passed. Attach this evidence to the Gate G4 submission."
  echo "Activation requires explicit written approval from Phil."
  echo ""
  echo "Activation procedure (after written approval only):"
  echo "  1. Set ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true in the secure secret store"
  echo "  2. Set MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY in the secure secret store"
  echo "  3. Restart the Atlas server"
  echo "  4. Verify health state transitions to LIVE with authorityMode=DATABENTO_CHART_AUTHORITY"
  echo "  5. Monitor parity for 30 minutes before declaring activation complete"
  echo ""
  echo "Evidence written to: ${EVIDENCE_DIR}"
fi
echo "============================================================"
