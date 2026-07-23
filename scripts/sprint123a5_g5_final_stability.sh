#!/bin/bash
# Sprint 123A.5 Gate G5 Final Stability Script (v2 — fixed grep handling)
# 7 samples over 60 minutes under systemd supervision
# Per Phil's mandate: one uninterrupted systemd run, all metrics required

LOG=/tmp/sprint123a5_g5_final_stability.log
ATLAS_PID_INITIAL=$(systemctl show atlas-nexus.service -p MainPID --value | tr -d '[:space:]')
FEED_PID_INITIAL=$(systemctl show atlas-feed-adapter.service -p MainPID --value | tr -d '[:space:]')

echo "=== SPRINT 123A.5 GATE G5 FINAL STABILITY RUN ===" > "$LOG"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "atlas-nexus initial PID: $ATLAS_PID_INITIAL" >> "$LOG"
echo "atlas-feed-adapter initial PID: $FEED_PID_INITIAL" >> "$LOG"
echo "" >> "$LOG"

take_sample() {
    local SAMPLE_NUM=$1
    local SAMPLE_LABEL=$2
    local TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo "--- SAMPLE $SAMPLE_NUM ($SAMPLE_LABEL): $TIMESTAMP ---" >> "$LOG"

    # Service status
    ATLAS_ACTIVE=$(systemctl is-active atlas-nexus.service 2>/dev/null)
    FEED_ACTIVE=$(systemctl is-active atlas-feed-adapter.service 2>/dev/null)
    ATLAS_PID=$(systemctl show atlas-nexus.service -p MainPID --value 2>/dev/null | tr -d '[:space:]')
    FEED_PID=$(systemctl show atlas-feed-adapter.service -p MainPID --value 2>/dev/null | tr -d '[:space:]')
    ATLAS_NRESTARTS=$(systemctl show atlas-nexus.service -p NRestarts --value 2>/dev/null | tr -d '[:space:]')
    FEED_NRESTARTS=$(systemctl show atlas-feed-adapter.service -p NRestarts --value 2>/dev/null | tr -d '[:space:]')

    echo "atlas-nexus.service: $ATLAS_ACTIVE | PID=$ATLAS_PID | NRestarts=$ATLAS_NRESTARTS" >> "$LOG"
    echo "atlas-feed-adapter.service: $FEED_ACTIVE | PID=$FEED_PID | NRestarts=$FEED_NRESTARTS" >> "$LOG"

    # PID continuity check
    PID_MATCH="PASS"
    if [ "$ATLAS_PID" != "$ATLAS_PID_INITIAL" ]; then
        PID_MATCH="RESTART_DETECTED (was $ATLAS_PID_INITIAL, now $ATLAS_PID)"
    fi
    echo "atlas-nexus PID continuity: $PID_MATCH" >> "$LOG"

    # Health endpoint
    SESSION_TOKEN=$(node --input-type=module < /tmp/gen_token.mjs 2>/dev/null)
    HEALTH=$(curl -s --max-time 5 -H "Cookie: app_session_id=$SESSION_TOKEN" http://localhost:3000/api/market-data/health 2>/dev/null)

    if [ -z "$HEALTH" ]; then
        echo "HEALTH_ENDPOINT: UNREACHABLE" >> "$LOG"
        echo "SAMPLE_$SAMPLE_NUM: FAIL (health endpoint unreachable)" >> "$LOG"
        echo "" >> "$LOG"
        return 1
    fi

    # Parse health fields
    STATUS=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['status'])" 2>/dev/null)
    AUTH_MODE=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['authorityMode'])" 2>/dev/null)
    SHADOW=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['shadowEnabled'])" 2>/dev/null)
    UNRESOLVED=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['unresolvedBars'])" 2>/dev/null)
    PERSIST_ERR=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator']['persistenceErrors'])" 2>/dev/null)
    ERRORS=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['orchestrator']['errors']))" 2>/dev/null)
    RING_BUF=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('ringBufferSize',0))" 2>/dev/null)
    STREAM_CLIENTS=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('streamClients',0))" 2>/dev/null)
    LAST_1M=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator'].get('lastConfirmed1mTs','N/A'))" 2>/dev/null)
    LAST_5M=$(echo "$HEALTH" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['orchestrator'].get('lastConfirmed5mTs','N/A'))" 2>/dev/null)

    echo "status: $STATUS | authorityMode: $AUTH_MODE | shadowEnabled: $SHADOW" >> "$LOG"
    echo "unresolvedBars: $UNRESOLVED | persistenceErrors: $PERSIST_ERR | errors: $ERRORS" >> "$LOG"
    echo "ringBufferSize: $RING_BUF | streamClients: $STREAM_CLIENTS" >> "$LOG"
    echo "lastConfirmed1mTs: $LAST_1M | lastConfirmed5mTs: $LAST_5M" >> "$LOG"

    # DB counts
    DB_1M=$(mysql -u atlas -p"${DB_PASS:?DB_PASS not set}" atlas_staging_g4 -sNe \
        "SELECT COUNT(*) FROM atlas_bars_1m WHERE reconciliation_status='MATCHED';" 2>/dev/null | grep -v Warning | tail -1)
    DB_5M=$(mysql -u atlas -p"${DB_PASS:?DB_PASS not set}" atlas_staging_g4 -sNe \
        "SELECT COUNT(*) FROM atlas_bars_5m;" 2>/dev/null | grep -v Warning | tail -1)
    DB_UNRESOLVED=$(mysql -u atlas -p"${DB_PASS:?DB_PASS not set}" atlas_staging_g4 -sNe \
        "SELECT COUNT(*) FROM atlas_bars_1m WHERE reconciliation_status='UNRESOLVED';" 2>/dev/null | grep -v Warning | tail -1)
    echo "db_confirmed_1m: $DB_1M | db_confirmed_5m: $DB_5M | db_unresolved: $DB_UNRESOLVED" >> "$LOG"

    # Process memory/CPU
    ATLAS_MEM=$(ps -o rss= -p $ATLAS_PID 2>/dev/null | awk '{printf "%dMB",$1/1024}')
    ATLAS_CPU=$(ps -o pcpu= -p $ATLAS_PID 2>/dev/null | tr -d ' ')
    FEED_MEM=$(ps -o rss= -p $FEED_PID 2>/dev/null | awk '{printf "%dMB",$1/1024}')
    FEED_CPU=$(ps -o pcpu= -p $FEED_PID 2>/dev/null | tr -d ' ')
    echo "atlas-nexus: mem=$ATLAS_MEM cpu=${ATLAS_CPU}% | feed-adapter: mem=$FEED_MEM cpu=${FEED_CPU}%" >> "$LOG"

    # Check server log for exceptions and Databento trading calls
    # Use grep -E with wc -l to avoid multi-line count issues
    EXCEPTION_COUNT=$(grep -E "UnhandledPromiseRejection|FATAL|uncaughtException" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
    DB_PROCESSBAR=$(grep -E "processBar.*(databento|DATABENTO)|databento.*processBar" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
    DB_POSTBAR=$(grep -E "postBarAutomation.*(databento|DATABENTO)|databento.*postBarAutomation" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
    SSE_ERRORS=$(grep -E "SSE.*(error|Error)|stream.*(error|Error)" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
    echo "runtime_exceptions: $EXCEPTION_COUNT | db_processBar_calls: $DB_PROCESSBAR | db_postBarAuto_calls: $DB_POSTBAR | sse_errors: $SSE_ERRORS" >> "$LOG"

    # Evaluate pass/fail
    PASS=true
    FAIL_REASONS=""

    [ "$ATLAS_ACTIVE" != "active" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS atlas-nexus not active;"
    [ "$FEED_ACTIVE" != "active" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS feed-adapter not active;"
    [ "$ATLAS_NRESTARTS" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS atlas NRestarts=$ATLAS_NRESTARTS;"
    [ "$FEED_NRESTARTS" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS feed NRestarts=$FEED_NRESTARTS;"
    [ "$STATUS" != "READY" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS status=$STATUS;"
    [ "$AUTH_MODE" != "DATABENTO_CHART_AUTHORITY" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS authMode=$AUTH_MODE;"
    [ "$UNRESOLVED" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS unresolved=$UNRESOLVED;"
    [ "$PERSIST_ERR" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS persistErrors=$PERSIST_ERR;"
    [ "$DB_PROCESSBAR" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS db_processBar=$DB_PROCESSBAR;"
    [ "$DB_POSTBAR" != "0" ] && PASS=false && FAIL_REASONS="$FAIL_REASONS db_postBarAuto=$DB_POSTBAR;"

    if [ "$PASS" = "true" ]; then
        echo "SAMPLE_$SAMPLE_NUM: PASS" >> "$LOG"
    else
        echo "SAMPLE_$SAMPLE_NUM: FAIL ($FAIL_REASONS)" >> "$LOG"
        # Trigger fallback if blocking failure
        echo "BLOCKING_FAILURE_DETECTED — initiating fallback to DATABENTO_SHADOW" >> "$LOG"
        sed -i 's/MARKET_DATA_AUTHORITY=DATABENTO_CHART_AUTHORITY/MARKET_DATA_AUTHORITY=DATABENTO_SHADOW/' /home/ubuntu/atlas-nexus/.env
        sed -i 's/ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=true/ATLAS_GATE_G4_CHART_AUTHORITY_ENABLED=false/' /home/ubuntu/atlas-nexus/.env
        sudo systemctl restart atlas-nexus
        sudo systemctl restart atlas-feed-adapter
        echo "FALLBACK_COMPLETE: DATABENTO_SHADOW activated" >> "$LOG"
    fi

    echo "" >> "$LOG"
    return 0
}

# T+0 sample immediately
take_sample 1 "T+0m"

# Wait and sample T+10 through T+60
for i in 2 3 4 5 6 7; do
    sleep 600
    LABEL="T+$(( (i-1) * 10 ))m"
    take_sample $i "$LABEL"
done

echo "=== STABILITY RUN COMPLETE: $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" >> "$LOG"

# Final verdict
PASS_COUNT=$(grep -E "^SAMPLE_[0-9]+: PASS$" "$LOG" 2>/dev/null | wc -l)
FAIL_COUNT=$(grep -E "^SAMPLE_[0-9]+: FAIL" "$LOG" 2>/dev/null | wc -l)

if [ "$PASS_COUNT" -eq 7 ] && [ "$FAIL_COUNT" -eq 0 ]; then
    echo "SYSTEMD_STABILITY_RESULT: PASS (7/7)" >> "$LOG"
else
    echo "SYSTEMD_STABILITY_RESULT: FAIL ($PASS_COUNT/7 pass, $FAIL_COUNT fail)" >> "$LOG"
fi

echo "Run complete. Log: $LOG"
