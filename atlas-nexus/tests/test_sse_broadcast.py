"""
Focused SSE broadcast test — checks that a connected SSE client receives
a pipeline_report event when a webhook is posted.
"""
import json
import time
import uuid
import threading
import requests
import sseclient

BASE_URL = "http://localhost:8766"
AUTH_TOKEN = "atlas-nexus-sprint075-secret"
HEADERS = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}

VALID_PAYLOAD = {
    "schema_version": "1.0.0",
    "payload_type": "OBSERVABILITY",
    "event_id": "evt-test-base",
    "idempotency_key": "idem-test-base",
    "pipeline_run_id": "run-test-base",
    "timestamp_utc": "2026-07-10T14:30:05Z",
    "bar_time": "2026-07-10T14:30:00Z",
    "bar_index": 99999,
    "chart_id": "cDPu6HGG",
    "symbol": "MNQ1!",
    "timeframe": "5",
    "master_state": "ACTIVE",
}

# Step 1: Check current SSE client count
r = requests.get(f"{BASE_URL}/api/v1/health", timeout=5)
print(f"Initial SSE clients: {r.json()['sse_clients']}")

# Step 2: Start SSE listener
received = []
connected = threading.Event()

def listen():
    r = requests.get(f"{BASE_URL}/api/v1/events", stream=True, timeout=20)
    client = sseclient.SSEClient(r)
    for event in client.events():
        print(f"[SSE] event={event.event!r} data={event.data[:60]!r}")
        connected.set()
        if event.event in ("pipeline_report", "catchup") or (event.data and "pipeline_report" in event.data):
            received.append(event)
            break

t = threading.Thread(target=listen, daemon=True)
t.start()

# Step 3: Wait for SSE to connect
connected.wait(timeout=5)
print(f"SSE connected: {connected.is_set()}")

# Step 4: Check SSE client count after connection
time.sleep(0.5)
r = requests.get(f"{BASE_URL}/api/v1/health", timeout=5)
sse_count = r.json()['sse_clients']
print(f"SSE clients after connect: {sse_count}")

# Step 5: Send webhook
p = {**VALID_PAYLOAD,
     "idempotency_key": f"idem-sse-focused-{uuid.uuid4()}",
     "event_id": f"evt-sse-focused-{uuid.uuid4()}"}
r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                  headers=HEADERS, json=p, timeout=5)
print(f"Webhook status: {r.status_code}")
print(f"Webhook response: {r.json()}")

# Step 6: Wait for SSE event
t.join(timeout=5)
print(f"Received SSE events: {len(received)}")
if received:
    print(f"First event: {received[0].event!r}")
    print("✅ SSE BROADCAST TEST: PASS")
else:
    print("❌ SSE BROADCAST TEST: FAIL — no event received")
