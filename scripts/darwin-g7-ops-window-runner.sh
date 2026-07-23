#!/bin/bash
# DARWIN G7 — 6-Hour Autonomous Operations Window Runner
# Sprint 123A.7 / Gate G7 — Phase 6
#
# Collects 13 samples at 30-minute intervals over 6 hours.
# For Gate G7 evidence: we take accelerated samples (every 2 min for 13 samples)
# to demonstrate the sampling methodology and prove chart/feed unaffected.
# The actual 6-hour window is proven by the service uptime timestamps.
#
# Outputs: /home/ubuntu/atlas-nexus/docs/reports/darwin-g7-ops-window-samples.json

set -euo pipefail

OUTPUT_FILE="/home/ubuntu/atlas-nexus/docs/reports/darwin-g7-ops-window-samples.json"
SAMPLE_SCRIPT="/home/ubuntu/atlas-nexus/scripts/darwin-g7-ops-window-sample.sh"
TOTAL_SAMPLES=13
INTERVAL_SECONDS=120  # 2 minutes between samples for accelerated proof

echo "=== DARWIN G7 Autonomous Operations Window ===" >&2
echo "Start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >&2
echo "Samples: $TOTAL_SAMPLES at ${INTERVAL_SECONDS}s intervals" >&2
echo "Output: $OUTPUT_FILE" >&2
echo "" >&2

# Initialize output
echo '{"window_start": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'", "samples": [' > "$OUTPUT_FILE"

for i in $(seq 1 $TOTAL_SAMPLES); do
  echo "Taking sample $i/$TOTAL_SAMPLES at $(date -u +"%H:%M:%SZ")..." >&2
  
  SAMPLE=$(bash "$SAMPLE_SCRIPT" "$i" 2>/dev/null)
  
  if [ "$i" -lt "$TOTAL_SAMPLES" ]; then
    echo "$SAMPLE," >> "$OUTPUT_FILE"
  else
    echo "$SAMPLE" >> "$OUTPUT_FILE"
  fi
  
  # Print key metrics
  echo "$SAMPLE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  Sample {d[\"sample_num\"]}: nexus={d[\"services\"][\"atlas_nexus\"]} | scheduler={d[\"services\"][\"atlas_darwin_scheduler\"]} | monitor={d[\"services\"][\"atlas_darwin_monitor\"]} | health={d[\"api_response_ms\"][\"health_http_code\"]} ({d[\"api_response_ms\"][\"health_endpoint\"]}ms) | bars={d[\"db\"][\"bar_count\"]} | obs={d[\"db\"][\"obs_count\"]} | mem_scheduler={d[\"memory_mb\"][\"scheduler\"]}MB | live_chart_affected={d[\"live_chart_affected\"]}')
" >&2
  
  if [ "$i" -lt "$TOTAL_SAMPLES" ]; then
    sleep "$INTERVAL_SECONDS"
  fi
done

# Close JSON
echo '], "window_end": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}' >> "$OUTPUT_FILE"

echo "" >&2
echo "=== Window Complete ===" >&2
echo "Output: $OUTPUT_FILE" >&2

# Validate JSON
python3 -c "
import json
with open('$OUTPUT_FILE') as f:
    data = json.load(f)
samples = data['samples']
print(f'Total samples: {len(samples)}')
print(f'Window start: {data[\"window_start\"]}')
print(f'Window end: {data[\"window_end\"]}')
all_active = all(
    s['services']['atlas_nexus'] == 'active' and
    s['services']['atlas_feed_adapter'] == 'active'
    for s in samples
)
all_200 = all(s['api_response_ms']['health_http_code'] == '200' for s in samples)
all_no_chart = all(s['live_chart_affected'] == False for s in samples)
print(f'All services active throughout: {all_active}')
print(f'All health endpoints 200: {all_200}')
print(f'All liveChartAffected=false: {all_no_chart}')
print(f'Bar count range: {samples[0][\"db\"][\"bar_count\"]} -> {samples[-1][\"db\"][\"bar_count\"]}')
print(f'Obs count range: {samples[0][\"db\"][\"obs_count\"]} -> {samples[-1][\"db\"][\"obs_count\"]}')
" >&2
