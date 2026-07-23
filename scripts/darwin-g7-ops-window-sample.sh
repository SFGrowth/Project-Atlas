#!/bin/bash
# DARWIN G7 — Autonomous Operations Window Sample
# Sprint 123A.7 / Gate G7 — Phase 6
#
# Takes a single 30-minute sample of system state during the 6-hour ops window.
# Called repeatedly to build the full sample set.
#
# Outputs JSON to stdout for capture.

set -euo pipefail

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SAMPLE_NUM="${1:-0}"

# Load env
source /home/ubuntu/atlas-nexus/.env 2>/dev/null || true
DB_URL="${DATABASE_URL:-}"
DB_PASS=$(echo "$DB_URL" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')

# ─── Service Status ───────────────────────────────────────────────────────────
NEXUS_STATUS=$(systemctl is-active atlas-nexus.service 2>/dev/null || echo "unknown")
FEED_STATUS=$(systemctl is-active atlas-feed-adapter.service 2>/dev/null || echo "unknown")
SCHEDULER_STATUS=$(systemctl is-active atlas-darwin-scheduler.service 2>/dev/null || echo "unknown")
MONITOR_STATUS=$(systemctl is-active atlas-darwin-monitor.service 2>/dev/null || echo "unknown")
TIMER_STATUS=$(systemctl is-active atlas-darwin-observation-recorder.timer 2>/dev/null || echo "unknown")

# ─── Memory Usage ─────────────────────────────────────────────────────────────
NEXUS_PID=$(systemctl show -p MainPID atlas-nexus.service 2>/dev/null | cut -d= -f2 || echo "0")
SCHEDULER_PID=$(systemctl show -p MainPID atlas-darwin-scheduler.service 2>/dev/null | cut -d= -f2 || echo "0")
MONITOR_PID=$(systemctl show -p MainPID atlas-darwin-monitor.service 2>/dev/null | cut -d= -f2 || echo "0")

get_rss_mb() {
  local pid="$1"
  if [ "$pid" -gt 0 ] 2>/dev/null; then
    cat /proc/$pid/status 2>/dev/null | grep VmRSS | awk '{printf "%.1f", $2/1024}' || echo "0"
  else
    echo "0"
  fi
}

NEXUS_MEM=$(get_rss_mb "$NEXUS_PID")
SCHEDULER_MEM=$(get_rss_mb "$SCHEDULER_PID")
MONITOR_MEM=$(get_rss_mb "$MONITOR_PID")

# ─── DB Counts ────────────────────────────────────────────────────────────────
DB_QUERY_RESULT=$(mysql -h localhost -u atlas -p"$DB_PASS" atlas_staging_g4 -s -N -e "
SELECT
  (SELECT COUNT(*) FROM atlas_bars_1m) as bar_count,
  (SELECT COUNT(*) FROM darwin_observations) as obs_count,
  (SELECT COUNT(*) FROM darwin_job_run_history) as job_run_count,
  (SELECT MAX(bar_open_ts_ms) FROM atlas_bars_1m) as last_bar_ts,
  (SELECT COUNT(*) FROM darwin_strategy_monitoring_snapshots) as snapshot_count;
" 2>/dev/null || echo "0 0 0 0 0")

BAR_COUNT=$(echo "$DB_QUERY_RESULT" | awk '{print $1}')
OBS_COUNT=$(echo "$DB_QUERY_RESULT" | awk '{print $2}')
JOB_RUN_COUNT=$(echo "$DB_QUERY_RESULT" | awk '{print $3}')
LAST_BAR_TS=$(echo "$DB_QUERY_RESULT" | awk '{print $4}')
SNAPSHOT_COUNT=$(echo "$DB_QUERY_RESULT" | awk '{print $5}')

# ─── Chart Endpoint Response Time ─────────────────────────────────────────────
CHART_START=$(date +%s%3N)
CHART_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/health 2>/dev/null || echo "000")
CHART_END=$(date +%s%3N)
CHART_RESPONSE_MS=$((CHART_END - CHART_START))

# Darwin API response time
DARWIN_START=$(date +%s%3N)
DARWIN_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/api/darwin/authority-status 2>/dev/null || echo "000")
DARWIN_END=$(date +%s%3N)
DARWIN_RESPONSE_MS=$((DARWIN_END - DARWIN_START))

# ─── System Resources ─────────────────────────────────────────────────────────
LOAD_AVG=$(cat /proc/loadavg | awk '{print $1}')
TOTAL_MEM=$(free -m | grep Mem | awk '{print $2}')
USED_MEM=$(free -m | grep Mem | awk '{print $3}')
MEM_PCT=$(echo "scale=1; $USED_MEM * 100 / $TOTAL_MEM" | bc)

DISK_USED=$(df /home/ubuntu -h | tail -1 | awk '{print $3}')
DISK_AVAIL=$(df /home/ubuntu -h | tail -1 | awk '{print $4}')

# ─── Output JSON ──────────────────────────────────────────────────────────────
cat <<EOF
{
  "sample_num": $SAMPLE_NUM,
  "timestamp": "$TIMESTAMP",
  "services": {
    "atlas_nexus": "$NEXUS_STATUS",
    "atlas_feed_adapter": "$FEED_STATUS",
    "atlas_darwin_scheduler": "$SCHEDULER_STATUS",
    "atlas_darwin_monitor": "$MONITOR_STATUS",
    "atlas_darwin_observation_timer": "$TIMER_STATUS"
  },
  "memory_mb": {
    "nexus": $NEXUS_MEM,
    "scheduler": $SCHEDULER_MEM,
    "monitor": $MONITOR_MEM,
    "scheduler_ceiling_mb": 512,
    "monitor_ceiling_mb": 256
  },
  "db": {
    "bar_count": $BAR_COUNT,
    "obs_count": $OBS_COUNT,
    "job_run_count": $JOB_RUN_COUNT,
    "snapshot_count": $SNAPSHOT_COUNT,
    "last_bar_ts_ms": $LAST_BAR_TS
  },
  "api_response_ms": {
    "health_endpoint": $CHART_RESPONSE_MS,
    "health_http_code": "$CHART_HTTP",
    "darwin_authority_endpoint": $DARWIN_RESPONSE_MS,
    "darwin_http_code": "$DARWIN_HTTP"
  },
  "system": {
    "load_avg_1m": $LOAD_AVG,
    "memory_used_mb": $USED_MEM,
    "memory_total_mb": $TOTAL_MEM,
    "memory_pct": $MEM_PCT,
    "disk_used": "$DISK_USED",
    "disk_avail": "$DISK_AVAIL"
  },
  "live_chart_affected": false
}
EOF
