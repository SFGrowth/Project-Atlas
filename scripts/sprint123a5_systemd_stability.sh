#!/bin/bash
LOG_FILE="/tmp/sprint123a5_systemd_stability.log"
echo "=== Sprint 123A.5 Systemd Stability Validation ===" > "$LOG_FILE"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"
echo "Server managed by: systemd (atlas-nexus.service + atlas-feed-adapter.service)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
PASS=0; FAIL=0

check_sample() {
  local num=$1; local elapsed=$2
  local ts; ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  SESSION_TOKEN=$(node --input-type=module < /tmp/gen_token.mjs 2>/dev/null)
  HEALTH=$(curl -s -H "Cookie: app_session_id=$SESSION_TOKEN" http://localhost:3000/api/market-data/health 2>/dev/null)
  if [ -z "$HEALTH" ]; then
    echo "SYSTEMD-SAMPLE $num (T+${elapsed}m): FAIL — no response | ts=$ts" | tee -a "$LOG_FILE"
    FAIL=$((FAIL+1)); return
  fi
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['status'])" 2>/dev/null)
  AUTHORITY=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['authorityMode'])" 2>/dev/null)
  UNRESOLVED=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['unresolvedBars'])" 2>/dev/null)
  PERSIST=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['persistenceErrors'])" 2>/dev/null)
  LAST1M=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator'].get('lastConfirmed1mTs') or 'None')" 2>/dev/null)
  SVC_STATUS=$(systemctl is-active atlas-nexus 2>/dev/null)
  FEED_SVC=$(systemctl is-active atlas-feed-adapter 2>/dev/null)
  SERVER_PID=$(systemctl show atlas-nexus --property=MainPID --value 2>/dev/null | tr -d '[:space:]')
  MEM_MB=$(ps -o rss= -p "$SERVER_PID" 2>/dev/null | awk '{printf "%.0f",$1/1024}')
  CPU=$(ps -o %cpu= -p "$SERVER_PID" 2>/dev/null | tr -d ' ')
  BARS_1M=$(mysql -u atlas -patlas_staging_pass atlas_staging_g4 -sNe "SELECT COUNT(*) FROM atlas_bars_1m WHERE symbol='MNQU6' AND reconciliation_status='MATCHED';" 2>/dev/null || echo "N/A")
  BARS_5M=$(mysql -u atlas -patlas_staging_pass atlas_staging_g4 -sNe "SELECT COUNT(*) FROM atlas_bars_5m WHERE symbol='MNQU6';" 2>/dev/null || echo "N/A")
  # Use grep -E | wc -l to avoid BRE double-count bug
  SSE_ERRS=$(grep -E "SSE.*error|stream.*error" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l | tr -d ' ')
  RT_EX=$(grep -E "UnhandledPromiseRejection|uncaughtException|FATAL" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l | tr -d ' ')
  DB_PB=$(grep -E "databento.*processBar|processBar.*databento" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l | tr -d ' ')
  DB_PA=$(grep -E "databento.*postBarAutomation|postBarAutomation.*databento" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l | tr -d ' ')
  RESULT="PASS"
  [ "$STATUS" != "READY" ] && RESULT="FAIL"
  [ "$AUTHORITY" != "DATABENTO_CHART_AUTHORITY" ] && RESULT="FAIL"
  [ "$UNRESOLVED" != "0" ] && RESULT="FAIL"
  [ "$PERSIST" != "0" ] && RESULT="FAIL"
  [ "$SVC_STATUS" != "active" ] && RESULT="FAIL"
  [ "$DB_PB" != "0" ] && RESULT="FAIL"
  [ "$DB_PA" != "0" ] && RESULT="FAIL"
  echo "SYSTEMD-SAMPLE $num (T+${elapsed}m): $RESULT | ts=$ts | status=$STATUS | authority=$AUTHORITY | svcStatus=$SVC_STATUS | feedSvc=$FEED_SVC | confirmed1mBars=$BARS_1M | confirmed5mBars=$BARS_5M | unresolvedBars=$UNRESOLVED | persistErrors=$PERSIST | sseErrors=$SSE_ERRS | rtExceptions=$RT_EX | memMB=$MEM_MB | cpuPct=$CPU | dbProcessBarCalls=$DB_PB | dbPostBarCalls=$DB_PA | lastConfirmed1mTs=$LAST1M" | tee -a "$LOG_FILE"
  [ "$RESULT" = "PASS" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

check_sample 1 0
sleep 600
check_sample 2 10
sleep 600
check_sample 3 20

echo "" >> "$LOG_FILE"
echo "SYSTEMD_SAMPLES_COMPLETED: $((PASS+FAIL))/3" >> "$LOG_FILE"
echo "SYSTEMD_PASS: $PASS/3" >> "$LOG_FILE"
echo "SYSTEMD_FAIL: $FAIL/3" >> "$LOG_FILE"
echo "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG_FILE"
[ $FAIL -eq 0 ] && echo "SYSTEMD_STABILITY_RESULT: PASS" | tee -a "$LOG_FILE" || echo "SYSTEMD_STABILITY_RESULT: FAIL" | tee -a "$LOG_FILE"
