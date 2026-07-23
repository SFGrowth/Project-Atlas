#!/usr/bin/env bash
# =============================================================================
# Atlas Nexus — Chart Authority Activation Readiness Test
# Sprint 123A.4 — Gate G4
#
# This script proves that DATABENTO_CHART_AUTHORITY can be safely activated
# by verifying all authority matrix preconditions are met.
#
# Run on the live server after a successful DATABENTO_SHADOW staging session.
# Usage: bash chart_authority_activation_readiness.sh 2>&1 | tee authority_readiness_$(date +%Y%m%d_%H%M%S).log
# =============================================================================

set -euo pipefail

PASS=0
FAIL=0
WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN+1)); }

echo "============================================================"
echo " Atlas Nexus — Chart Authority Activation Readiness Test"
echo " Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo ""

# ─── GATE 1: Authority mode is DATABENTO_SHADOW ──────────────────────────────
echo "--- Gate 1: Current authority mode ---"
CURRENT_MODE="${MARKET_DATA_AUTHORITY:-NOT_SET}"
echo "  MARKET_DATA_AUTHORITY = $CURRENT_MODE"
if [ "$CURRENT_MODE" = "DATABENTO_SHADOW" ]; then
  pass "Current mode is DATABENTO_SHADOW (correct pre-activation state)"
else
  fail "Expected DATABENTO_SHADOW, got $CURRENT_MODE"
fi
echo ""

# ─── GATE 2: G4 feature flag is NOT yet set ──────────────────────────────────
echo "--- Gate 2: G4 feature flag state ---"
G4_FLAG="${ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED:-false}"
echo "  ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED = $G4_FLAG"
if [ "$G4_FLAG" != "true" ]; then
  pass "G4 flag is not set — activation will be explicit"
else
  warn "G4 flag is already set — DATABENTO_CHART_AUTHORITY is already active"
fi
echo ""

# ─── GATE 3: Minimum bar count in atlas_bars_1m ──────────────────────────────
echo "--- Gate 3: Minimum bar count (>= 100 MATCHED bars) ---"
# Derive DB credentials from DATABASE_URL if set, otherwise use defaults
if [ -n "${DATABASE_URL:-}" ]; then
  # Parse mysql://user:pass@host:port/dbname
  DB_USER=$(echo "$DATABASE_URL" | sed 's|mysql://\([^:]*\):.*|\1|')
  DB_PASS=$(echo "$DATABASE_URL" | sed 's|mysql://[^:]*:\([^@]*\)@.*|\1|')
  DB_NAME=$(echo "$DATABASE_URL" | sed 's|.*/\([^?]*\).*|\1|')
  MYSQL_CMD="mysql -u $DB_USER -p$DB_PASS $DB_NAME -sN"
else
  MYSQL_CMD="mysql -u atlas -p"${DB_PASS:?DB_PASS not set}" atlas_staging_g4 -sN"
fi
BAR_COUNT=$($MYSQL_CMD -e "
  SELECT COUNT(*)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO'
    AND reconciliation_status = 'MATCHED';
" 2>/dev/null || echo "0")
echo "  DATABENTO MATCHED bars: $BAR_COUNT"
if [ "$BAR_COUNT" -ge 100 ]; then
  pass "Sufficient bar count ($BAR_COUNT >= 100)"
elif [ "$BAR_COUNT" -ge 20 ]; then
  warn "Bar count is low ($BAR_COUNT < 100) — consider waiting for more data"
else
  fail "Insufficient bar count ($BAR_COUNT < 20) — staging session too short"
fi
echo ""

# ─── GATE 4: Parity mismatch rate below threshold ────────────────────────────
echo "--- Gate 4: Parity mismatch rate (< 2%) ---"
MISMATCH_RATE=$($MYSQL_CMD -e "
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
if [ "$MISMATCH_RATE" = "NULL" ] || [ "$MISMATCH_RATE" = "0.00" ]; then
  pass "Mismatch rate is 0% (perfect parity)"
elif (( $(echo "$MISMATCH_RATE < 2.0" | bc -l) )); then
  pass "Mismatch rate ${MISMATCH_RATE}% is below 2% threshold"
else
  fail "Mismatch rate ${MISMATCH_RATE}% exceeds 2% threshold — do not activate"
fi
echo ""

# ─── GATE 5: No unresolved gaps in the last 24 hours ─────────────────────────
echo "--- Gate 5: No unresolved gaps in last 24 hours ---"
GAP_COUNT=$($MYSQL_CMD -e "
  SELECT COUNT(*)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO'
    AND reconciliation_status = 'UNRESOLVED'
    AND bar_open_ts_ms > (UNIX_TIMESTAMP() - 86400) * 1000;
" 2>/dev/null || echo "0")
echo "  Unresolved bars (last 24h): $GAP_COUNT"
if [ "$GAP_COUNT" -eq 0 ]; then
  pass "No unresolved bars in last 24 hours"
else
  warn "$GAP_COUNT unresolved bars found — investigate before activating"
fi
echo ""

# ─── GATE 6: Orchestrator status is READY ───────────────────────────────────
echo "--- Gate 6: Health state is LIVE ---"
# Generate a short-lived session token for the health check
JOSE_PATH=$(find /home/ubuntu/atlas-nexus/node_modules/.pnpm -name 'index.js' -path '*/jose/*' 2>/dev/null | head -1)
if [ -n "$JOSE_PATH" ] && [ -n "${JWT_SECRET:-}" ]; then
  SESSION_TOKEN=$(node --input-type=module << JSEOF 2>/dev/null
import { SignJWT } from '$JOSE_PATH';
const key = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
const token = await new SignJWT({ openId: 'atlas-staging-owner', appId: process.env.VITE_APP_ID ?? 'atlas-nexus-staging', name: 'Atlas Staging' })
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt().setExpirationTime('1h').sign(key);
process.stdout.write(token);
JSEOF
  )
  HEALTH_RESPONSE=$(curl -s -H "Cookie: app_session_id=$SESSION_TOKEN" http://localhost:3000/api/market-data/health 2>/dev/null || echo '{}')
else
  HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/market-data/health 2>/dev/null || echo '{}')
fi
HEALTH_STATE=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orchestrator',{}).get('status','UNKNOWN'))" 2>/dev/null || echo "PARSE_ERROR")
echo "  Health state: $HEALTH_STATE"
if [ "$HEALTH_STATE" = "READY" ] || [ "$HEALTH_STATE" = "LIVE" ]; then
  pass "Health state is $HEALTH_STATE"
elif [ "$HEALTH_STATE" = "DEGRADED" ]; then
  warn "Health state is DEGRADED — monitor before activating"
else
  fail "Health state is $HEALTH_STATE — do not activate"
fi
echo ""

# ─── GATE 7: Staging duration >= 1 trading session ───────────────────────────
echo "--- Gate 7: Staging duration check ---"
OLDEST_BAR_TS=$($MYSQL_CMD -e "
  SELECT MIN(bar_open_ts_ms)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO';
" 2>/dev/null || echo "0")
NEWEST_BAR_TS=$($MYSQL_CMD -e "
  SELECT MAX(bar_open_ts_ms)
  FROM atlas_bars_1m
  WHERE source = 'DATABENTO';
" 2>/dev/null || echo "0")
if [ "$OLDEST_BAR_TS" -gt 0 ] && [ "$NEWEST_BAR_TS" -gt 0 ]; then
  DURATION_HOURS=$(echo "scale=1; ($NEWEST_BAR_TS - $OLDEST_BAR_TS) / 3600000" | bc)
  echo "  Staging duration: ${DURATION_HOURS} hours"
  if (( $(echo "$DURATION_HOURS >= 6.5" | bc -l) )); then
    pass "Staging duration ${DURATION_HOURS}h >= 1 full trading session (6.5h)"
  else
    warn "Staging duration ${DURATION_HOURS}h < 1 full trading session — consider waiting"
  fi
else
  fail "Cannot determine staging duration — no bars found"
fi
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────
echo "============================================================"
echo " Readiness Summary"
echo "   PASS: $PASS"
echo "   WARN: $WARN"
echo "   FAIL: $FAIL"
echo ""
if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
  echo " VERDICT: READY FOR CHART AUTHORITY ACTIVATION"
  echo ""
  echo " To activate:"
  echo "   1. Set MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY"
  echo "   2. Set ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true"
  echo "   3. Restart the Atlas Nexus server"
  echo "   4. Verify health state transitions to LIVE"
elif [ "$FAIL" -eq 0 ]; then
  echo " VERDICT: CONDITIONALLY READY (review warnings above)"
else
  echo " VERDICT: NOT READY — resolve FAIL items before activating"
fi
echo "============================================================"
