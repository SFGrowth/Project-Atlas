"""
Pipeline Observability Soak Collector
Sprint: darwin-core-observation-to-finding-chain
Collects /api/darwin/pipeline-metrics every 5 minutes for 4 hours.
Writes results to soak_ledger.json and soak_summary.md.
"""
import json
import time
import subprocess
import os
from datetime import datetime, timezone

ENDPOINT = "http://localhost:3000/api/darwin/pipeline-metrics"
CRON_SECRET_CMD = "grep LOCAL_CRON_SECRET /home/ubuntu/atlas-nexus/.env | cut -d= -f2"
OUTPUT_DIR = "/home/ubuntu/atlas-nexus/sprint-artefacts-v3"
LEDGER_PATH = os.path.join(OUTPUT_DIR, "soak_ledger.json")
SUMMARY_PATH = os.path.join(OUTPUT_DIR, "soak_summary.md")

INTERVAL_SECONDS = 300  # 5 minutes
DURATION_SECONDS = 4 * 3600  # 4 hours
MAX_SAMPLES = DURATION_SECONDS // INTERVAL_SECONDS  # 48 samples

def get_cron_secret():
    result = subprocess.run(CRON_SECRET_CMD, shell=True, capture_output=True, text=True)
    return result.stdout.strip()

def fetch_metrics(secret):
    cmd = [
        "curl", "-s", "-m", "10",
        "-H", f"X-Local-Cron-Secret: {secret}",
        ENDPOINT
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None, f"curl error: {result.returncode}"
    try:
        return json.loads(result.stdout), None
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e} — raw: {result.stdout[:200]}"

def main():
    secret = get_cron_secret()
    if not secret:
        print("ERROR: Could not read LOCAL_CRON_SECRET")
        return

    start_ts = datetime.now(timezone.utc)
    print(f"[Soak] Starting at {start_ts.isoformat()} — collecting {MAX_SAMPLES} samples over 4 hours")

    samples = []
    errors = []
    sample_num = 0

    while sample_num < MAX_SAMPLES:
        sample_num += 1
        now = datetime.now(timezone.utc)
        metrics, err = fetch_metrics(secret)

        if err:
            print(f"[Soak] Sample {sample_num}/{MAX_SAMPLES} ERROR: {err}")
            errors.append({"sample": sample_num, "ts": now.isoformat(), "error": err})
        else:
            samples.append({
                "sample": sample_num,
                "collected_at": now.isoformat(),
                "metrics": metrics,
            })
            print(
                f"[Soak] {sample_num}/{MAX_SAMPLES} "
                f"FEED={metrics.get('FEED_STATE','?')} "
                f"BARS={metrics.get('EVENTS_PERSISTED_TOTAL','?')} "
                f"OBS={metrics.get('OBSERVATIONS_TOTAL','?')} "
                f"J4_AUTO={metrics.get('AUTONOMOUS_J4_RUN_COUNT','?')} "
                f"Q_DEPTH={metrics.get('QUEUE_DEPTH','?')} "
                f"DROPPED={metrics.get('DROPPED_EVENT_COUNT','?')}"
            )

        # Write ledger after every sample (atomic via temp file)
        ledger = {
            "soak_start_utc": start_ts.isoformat(),
            "interval_seconds": INTERVAL_SECONDS,
            "target_samples": MAX_SAMPLES,
            "samples_collected": len(samples),
            "errors": errors,
            "samples": samples,
        }
        tmp = LEDGER_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(ledger, f, indent=2)
        os.replace(tmp, LEDGER_PATH)

        if sample_num < MAX_SAMPLES:
            time.sleep(INTERVAL_SECONDS)

    # Write summary
    end_ts = datetime.now(timezone.utc)
    duration_h = (end_ts - start_ts).total_seconds() / 3600

    if samples:
        last = samples[-1]["metrics"]
        first = samples[0]["metrics"]
        bars_delta = (last.get("EVENTS_PERSISTED_TOTAL") or 0) - (first.get("EVENTS_PERSISTED_TOTAL") or 0)
        obs_delta = (last.get("OBSERVATIONS_TOTAL") or 0) - (first.get("OBSERVATIONS_TOTAL") or 0)
        j4_auto = last.get("AUTONOMOUS_J4_RUN_COUNT") or 0
        j4_fail = last.get("J4_FAILURE_COUNT") or 0
        notif_del = last.get("NOTIFICATIONS_DELIVERED") or 0
        notif_fail = last.get("NOTIFICATIONS_FAILED") or 0
        dropped = last.get("DROPPED_EVENT_COUNT") or 0
        feed_states = [s["metrics"].get("FEED_STATE", "UNKNOWN") for s in samples]
        unique_states = list(dict.fromkeys(feed_states))
    else:
        bars_delta = obs_delta = j4_auto = j4_fail = notif_del = notif_fail = dropped = 0
        unique_states = []

    summary = f"""# Pipeline Observability Soak — 4-Hour Ledger Summary
## Sprint: darwin-core-observation-to-finding-chain
## Soak Window: {start_ts.isoformat()} → {end_ts.isoformat()}
## Duration: {duration_h:.2f} hours
## Samples Collected: {len(samples)}/{MAX_SAMPLES}
## Sample Errors: {len(errors)}

## Pipeline Throughput (delta over soak window)
| Metric | Value |
|--------|-------|
| EVENTS_PERSISTED_DELTA | {bars_delta} bars |
| OBSERVATIONS_DELTA | {obs_delta} observations |
| AUTONOMOUS_J4_RUNS | {j4_auto} |
| J4_FAILURES | {j4_fail} |
| NOTIFICATIONS_DELIVERED | {notif_del} |
| NOTIFICATIONS_FAILED | {notif_fail} |
| DROPPED_EVENTS | {dropped} |

## Feed Adapter State (observed states during soak)
{chr(10).join(f'- {s}' for s in unique_states)}

## Metrics NOT Collected (honest statement)
The following 4 metrics are not available from the current instrumentation:
- EVENTS_RECEIVED_TOTAL — bridge-server counter not exposed via HTTP
- WRITE_FAILURE_COUNT — no explicit counter in mysql-bar-persistence.ts
- DUPLICATE_EVENT_COUNT — idempotency enforced at DB level; no explicit counter
- CONSUMER_LAG_MS — bar ts_event not stored in atlas_bars_1m

## Soak Result
{"PASS" if len(errors) == 0 and len(samples) >= MAX_SAMPLES * 0.9 else "PARTIAL"} — {len(samples)} of {MAX_SAMPLES} samples collected, {len(errors)} errors
"""

    with open(SUMMARY_PATH, "w") as f:
        f.write(summary)

    print(f"\n[Soak] Complete. Ledger: {LEDGER_PATH}")
    print(f"[Soak] Summary: {SUMMARY_PATH}")
    print(f"[Soak] Samples: {len(samples)}/{MAX_SAMPLES}, Errors: {len(errors)}")

if __name__ == "__main__":
    main()
