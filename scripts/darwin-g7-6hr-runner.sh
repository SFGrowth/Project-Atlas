#!/bin/bash
# Sprint 123A.7 Gate G7 — Real 6-hour ops window runner
# 13 samples at 30-min intervals = 6 hours total
# Services have been running since 09:27:13 UTC (NRestarts=0)
# This runner starts at T+0 (current time) and runs for 6 hours

OPS_FILE="/home/ubuntu/atlas-nexus/docs/reports/darwin-g7-real-6hr-ops-window.json"
LOG_FILE="/tmp/g7-6hr-runner.log"
PROGRESS_FILE="/tmp/g7-6hr-progress.log"

WINDOW_START_UTC="2026-07-23T09:27:13Z"   # When services became active
RUNNER_START=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TOTAL_SAMPLES=13
INTERVAL_SECONDS=1800  # 30 minutes

echo "=== G7 6-hour ops window runner started at $RUNNER_START ===" | tee "$LOG_FILE"
echo "=== Services active since: $WINDOW_START_UTC ===" | tee -a "$LOG_FILE"
echo "=== Will collect $TOTAL_SAMPLES samples at ${INTERVAL_SECONDS}s intervals ===" | tee -a "$LOG_FILE"
echo "=== Window closes at: $(date -u -d "+$((TOTAL_SAMPLES * INTERVAL_SECONDS)) seconds" +"%Y-%m-%dT%H:%M:%SZ") ===" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Take sample 1 immediately (T+0)
echo "Taking sample 1 of $TOTAL_SAMPLES..." | tee -a "$LOG_FILE"
bash /home/ubuntu/atlas-nexus/scripts/darwin-g7-6hr-ops-sample.sh 1 "$OPS_FILE" 2>&1 | tee -a "$LOG_FILE"
echo "SAMPLE_1_DONE=$(date -u +%s)" >> "$PROGRESS_FILE"

# Take remaining samples at 30-min intervals
for i in $(seq 2 $TOTAL_SAMPLES); do
    echo "Waiting 30 minutes for sample $i..." | tee -a "$LOG_FILE"
    sleep $INTERVAL_SECONDS
    echo "Taking sample $i of $TOTAL_SAMPLES..." | tee -a "$LOG_FILE"
    bash /home/ubuntu/atlas-nexus/scripts/darwin-g7-6hr-ops-sample.sh $i "$OPS_FILE" 2>&1 | tee -a "$LOG_FILE"
    echo "SAMPLE_${i}_DONE=$(date -u +%s)" >> "$PROGRESS_FILE"
done

# Close the JSON array
echo "]" >> "$OPS_FILE"
# Remove trailing comma from last sample
sed -i '$ d' "$OPS_FILE"
# Re-add the closing bracket without trailing comma
echo "" >> "$OPS_FILE"
echo "]" >> "$OPS_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== 6-hour ops window COMPLETE at $(date -u +"%Y-%m-%dT%H:%M:%SZ") ===" | tee -a "$LOG_FILE"
echo "RUNNER_COMPLETE=$(date -u +%s)" >> "$PROGRESS_FILE"
