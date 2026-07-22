#!/bin/bash
# G5 Final Verification Script
set -e

SESSION_TOKEN=$(node --input-type=module < /tmp/gen_token.mjs 2>/dev/null)
echo "=== FINAL LIVE CHART STATE ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

echo "--- Health Endpoint ---"
HEALTH=$(curl -s --max-time 8 -H "Cookie: app_session_id=$SESSION_TOKEN" http://localhost:3000/api/market-data/health 2>/dev/null)
echo "$HEALTH" | python3 << 'PYEOF'
import sys, json
data = sys.stdin.read()
d = json.loads(data)
o = d['orchestrator']
print('status:', o['status'])
print('authorityMode:', o['authorityMode'])
print('shadowEnabled:', o['shadowEnabled'])
print('unresolvedBars:', o['unresolvedBars'])
print('persistenceErrors:', o['persistenceErrors'])
print('errors:', o['errors'])
print('ringBufferSize:', d.get('ringBufferSize'))
print('streamClients:', d.get('streamClients'))
print('lastConfirmed1mTs:', o.get('lastConfirmed1mTs'))
print('lastConfirmed5mTs:', o.get('lastConfirmed5mTs'))
PYEOF

echo ""
echo "--- Service Status ---"
systemctl show atlas-nexus.service -p MainPID -p NRestarts -p ActiveEnterTimestamp --no-pager
systemctl show atlas-feed-adapter.service -p MainPID -p NRestarts -p ActiveEnterTimestamp --no-pager

echo ""
echo "--- Authority Boundary Scan (60-min log) ---"
EXCEPTION_COUNT=$(grep -E "UnhandledPromiseRejection|FATAL|uncaughtException" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
DB_PROCESSBAR=$(grep -E "processBar.*(databento|DATABENTO)|databento.*processBar" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
DB_POSTBAR=$(grep -E "postBarAutomation.*(databento|DATABENTO)|databento.*postBarAutomation" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
DB_STRATEGY=$(grep -E "strategy.*(databento|DATABENTO)|databento.*strategy" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
DB_ORDER=$(grep -E "order.*(databento|DATABENTO)|databento.*order" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
DB_BROKER=$(grep -E "broker.*(databento|DATABENTO)|databento.*broker" /var/log/atlas-nexus/server.log 2>/dev/null | wc -l)
echo "runtime_exceptions: $EXCEPTION_COUNT"
echo "db_processBar_calls: $DB_PROCESSBAR"
echo "db_postBarAuto_calls: $DB_POSTBAR"
echo "db_strategy_calls: $DB_STRATEGY"
echo "db_order_calls: $DB_ORDER"
echo "db_broker_calls: $DB_BROKER"

echo ""
echo "--- DB Final Counts ---"
mysql -u atlas -patlas_staging_pass atlas_staging_g4 -sNe \
  "SELECT 'confirmed_1m', COUNT(*) FROM atlas_bars_1m WHERE reconciliation_status='MATCHED'
   UNION ALL SELECT 'confirmed_5m', COUNT(*) FROM atlas_bars_5m
   UNION ALL SELECT 'unresolved', COUNT(*) FROM atlas_bars_1m WHERE reconciliation_status='UNRESOLVED';" 2>/dev/null | grep -v Warning

echo ""
echo "=== VERIFICATION COMPLETE ==="
