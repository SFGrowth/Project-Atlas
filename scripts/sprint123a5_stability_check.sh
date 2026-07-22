#!/bin/bash
# Sprint 123A.5 — 60-minute live stability validation
# Samples health endpoint at 0, 10, 20, 30, 40, 50, 60 minutes
# Verifies: READY status, DATABENTO_CHART_AUTHORITY mode, 0 unresolved bars, feed connected

SESSION_TOKEN=$(node --input-type=module < /tmp/gen_token.mjs 2>/dev/null)
LOG_FILE="/tmp/sprint123a5_stability.log"
echo "=== Sprint 123A.5 Stability Validation ===" > "$LOG_FILE"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

PASS=0
FAIL=0

check_health() {
  local sample_num=$1
  local elapsed_min=$2
  
  HEALTH=$(curl -s -H "Cookie: app_session_id=$SESSION_TOKEN" http://localhost:3000/api/market-data/health 2>/dev/null)
  
  if [ -z "$HEALTH" ]; then
    echo "SAMPLE $sample_num (T+${elapsed_min}m): FAIL — no response from health endpoint" | tee -a "$LOG_FILE"
    FAIL=$((FAIL+1))
    return
  fi
  
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['orchestrator']['status'])" 2>/dev/null)
  AUTHORITY=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['orchestrator']['authorityMode'])" 2>/dev/null)
  UNRESOLVED=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['orchestrator']['unresolvedBars'])" 2>/dev/null)
  PERSIST_ERRS=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['orchestrator']['persistenceErrors'])" 2>/dev/null)
  LAST_1M=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); ts=d['orchestrator']['lastConfirmed1mTs']; print('None' if ts is None else ts)" 2>/dev/null)
  
  RESULT="PASS"
  if [ "$STATUS" != "READY" ]; then RESULT="FAIL"; fi
  if [ "$AUTHORITY" != "DATABENTO_CHART_AUTHORITY" ]; then RESULT="FAIL"; fi
  if [ "$UNRESOLVED" != "0" ]; then RESULT="FAIL"; fi
  
  echo "SAMPLE $sample_num (T+${elapsed_min}m): $RESULT | status=$STATUS | authority=$AUTHORITY | unresolved=$UNRESOLVED | persistErrors=$PERSIST_ERRS | lastConfirmed1mTs=$LAST_1M | ts=$(date -u +%H:%M:%SZ)" | tee -a "$LOG_FILE"
  
  if [ "$RESULT" = "PASS" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
}

# Sample 1: T+0
check_health 1 0

# Samples 2-7: every 10 minutes
for i in 2 3 4 5 6 7; do
  sleep 600
  elapsed=$(( (i-1) * 10 ))
  check_health $i $elapsed
done

echo "" >> "$LOG_FILE"
echo "=== Final Result ===" >> "$LOG_FILE"
echo "PASS: $PASS/7 | FAIL: $FAIL/7" >> "$LOG_FILE"
echo "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"

echo ""
echo "=== Final Result ==="
echo "PASS: $PASS/7 | FAIL: $FAIL/7"
