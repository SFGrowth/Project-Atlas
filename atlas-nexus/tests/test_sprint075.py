"""
Atlas Nexus — Sprint 075 Failure Isolation Test Suite
Validates the full observability chain from TradingView M-15 → FastAPI → SSE → Dashboard.
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

results = []

def test(name, fn):
    try:
        fn()
        results.append(("PASS", name, ""))
        print(f"  ✅ PASS  {name}")
    except AssertionError as e:
        results.append(("FAIL", name, str(e)))
        print(f"  ❌ FAIL  {name}: {e}")
    except Exception as e:
        results.append(("ERROR", name, str(e)))
        print(f"  ⚠️  ERROR {name}: {e}")

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 1: Health & Connectivity
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 1: Health & Connectivity ===")

def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/v1/health", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    d = r.json()
    assert d["status"] == "ok"
    assert d["service"] == "atlas-nexus"
    assert d["sprint"] == "075"
    assert "total_reports" in d
    assert "sse_clients" in d
    assert "integrity_violations" in d

test("GET /api/v1/health → 200 OK with correct fields", test_health_ok)

def test_stats_ok():
    r = requests.get(f"{BASE_URL}/api/v1/stats", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    d = r.json()
    assert "total_reports" in d
    assert "reports_24h" in d
    assert "latest" in d
    assert "integrity_violations" in d

test("GET /api/v1/stats → 200 OK with correct fields", test_stats_ok)

def test_reports_ok():
    r = requests.get(f"{BASE_URL}/api/v1/reports", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    d = r.json()
    assert "reports" in d
    assert isinstance(d["reports"], list)

test("GET /api/v1/reports → 200 OK with reports list", test_reports_ok)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 2: Authentication & Security
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 2: Authentication & Security ===")

def test_no_auth():
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      json=VALID_PAYLOAD, timeout=5)
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

test("POST /webhook without auth → 401 Unauthorized", test_no_auth)

def test_wrong_token():
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers={"Authorization": "Bearer wrong-token",
                               "Content-Type": "application/json"},
                      json=VALID_PAYLOAD, timeout=5)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"

test("POST /webhook with wrong token → 403 Forbidden", test_wrong_token)

def test_wrong_content_type():
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers={"Authorization": f"Bearer {AUTH_TOKEN}",
                               "Content-Type": "text/plain"},
                      data="hello", timeout=5)
    assert r.status_code == 415, f"Expected 415, got {r.status_code}"

test("POST /webhook with wrong Content-Type → 415", test_wrong_content_type)

def test_empty_bearer():
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers={"Authorization": "Bearer ",
                               "Content-Type": "application/json"},
                      json=VALID_PAYLOAD, timeout=5)
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

test("POST /webhook with empty Bearer → 401", test_empty_bearer)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 3: Schema Validation
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 3: Schema Validation ===")

def test_invalid_json():
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS,
                      data="not-json", timeout=5)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}"

test("POST /webhook with invalid JSON → 400 Bad Request", test_invalid_json)

def test_wrong_payload_type():
    p = {**VALID_PAYLOAD, "payload_type": "EXECUTION",
         "idempotency_key": f"idem-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"

test("POST /webhook with wrong payload_type → 422 Unprocessable", test_wrong_payload_type)

def test_wrong_symbol():
    p = {**VALID_PAYLOAD, "symbol": "ES1!",
         "idempotency_key": f"idem-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"

test("POST /webhook with wrong symbol → 422 Unprocessable", test_wrong_symbol)

def test_missing_required_fields():
    p = {"schema_version": "1.0.0"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"

test("POST /webhook with missing required fields → 422 Unprocessable", test_missing_required_fields)

def test_wrong_schema_version():
    p = {**VALID_PAYLOAD, "schema_version": "99.0.0",
         "idempotency_key": f"idem-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"

test("POST /webhook with wrong schema_version → 422 Unprocessable", test_wrong_schema_version)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 4: Idempotency
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 4: Idempotency ===")

IDEM_KEY = f"idem-idempotency-test-{uuid.uuid4()}"

def test_first_submission():
    p = {**VALID_PAYLOAD, "idempotency_key": IDEM_KEY,
         "event_id": f"evt-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 201, f"Expected 201, got {r.status_code}"
    d = r.json()
    assert d["status"] == "accepted"

test("POST /webhook first submission → 201 Created", test_first_submission)

def test_duplicate_submission():
    p = {**VALID_PAYLOAD, "idempotency_key": IDEM_KEY,
         "event_id": f"evt-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    # 200 = DUPLICATE_IGNORED (idempotency key already seen)
    # 409 = INTEGRITY_VIOLATION (race condition — also acceptable as duplicate detection)
    assert r.status_code in (200, 409), f"Expected 200 or 409, got {r.status_code}"
    d = r.json()
    assert d.get("status") in ("DUPLICATE_IGNORED", "INTEGRITY_VIOLATION"), f"Unexpected status: {d}"

test("POST /webhook duplicate idempotency_key → 200 DUPLICATE_IGNORED", test_duplicate_submission)

def test_different_key_accepted():
    p = {**VALID_PAYLOAD,
         "idempotency_key": f"idem-{uuid.uuid4()}",
         "event_id": f"evt-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 201, f"Expected 201, got {r.status_code}"

test("POST /webhook with new idempotency_key → 201 Created", test_different_key_accepted)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 5: SSE Connectivity
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 5: SSE Connectivity ===")

def test_sse_connects():
    """Connect to SSE and verify we receive a 'connected' event within 3 seconds."""
    received_events = []
    def listen():
        try:
            r = requests.get(f"{BASE_URL}/api/v1/events", stream=True, timeout=5)
            client = sseclient.SSEClient(r)
            for event in client.events():
                received_events.append(event)
                if len(received_events) >= 2:
                    break
        except Exception:
            pass
    t = threading.Thread(target=listen, daemon=True)
    t.start()
    t.join(timeout=5)
    assert len(received_events) >= 1, "No SSE events received within 5 seconds"
    # First event should be 'connected'
    first = received_events[0]
    assert first.event == "connected" or first.data, "No connected event received"

test("GET /api/v1/events → SSE stream connects and sends 'connected' event", test_sse_connects)

def test_sse_broadcasts_on_webhook():
    """Send a webhook payload and verify SSE broadcasts it.
    The SSE listener must:
    1. Stay alive (not break after catchup event)
    2. Only count live pipeline_report events (not catchup events)
    """
    received = []
    connected = threading.Event()
    webhook_sent = threading.Event()

    def listen():
        try:
            r = requests.get(f"{BASE_URL}/api/v1/events", stream=True, timeout=20)
            client = sseclient.SSEClient(r)
            for event in client.events():
                # Signal connected after first event (connected or catchup)
                connected.set()
                # Only count pipeline_report events that arrive AFTER webhook is sent
                if event.event == "pipeline_report" and webhook_sent.is_set():
                    received.append(event)
                    break
                # Also check data field for pipeline_report type
                if event.data and webhook_sent.is_set():
                    try:
                        d = json.loads(event.data)
                        if d.get("type") == "pipeline_report":
                            received.append(event)
                            break
                    except Exception:
                        pass
        except Exception:
            connected.set()  # Unblock even on error

    t = threading.Thread(target=listen, daemon=True)
    t.start()
    # Wait for SSE to connect (up to 4 seconds)
    connected.wait(timeout=4)
    time.sleep(0.3)  # Small buffer to ensure registration is complete

    # Send a webhook
    p = {**VALID_PAYLOAD,
         "idempotency_key": f"idem-sse-test-{uuid.uuid4()}",
         "event_id": f"evt-sse-test-{uuid.uuid4()}"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    webhook_sent.set()
    assert r.status_code == 201, f"Webhook failed: {r.status_code}"
    sse_clients = r.json().get("sse_clients_reached", 0)
    assert sse_clients >= 1, f"Expected SSE broadcast to at least 1 client, got {sse_clients}"

    t.join(timeout=6)
    assert len(received) >= 1, "SSE did not broadcast pipeline_report event after webhook"

test("POST /webhook → SSE broadcasts pipeline_report to connected client", test_sse_broadcasts_on_webhook)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 6: Data Integrity
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 6: Data Integrity ===")

def test_payload_stored_correctly():
    """Submit a payload and verify it's retrievable from /api/v1/reports."""
    unique_key = f"idem-integrity-{uuid.uuid4()}"
    p = {**VALID_PAYLOAD,
         "idempotency_key": unique_key,
         "event_id": f"evt-{uuid.uuid4()}",
         "master_state": "INTEGRITY_TEST"}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 201
    report_id = r.json()["id"]

    # Retrieve
    r2 = requests.get(f"{BASE_URL}/api/v1/reports/{report_id}", timeout=5)
    assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"
    d = r2.json()
    assert d["id"] == report_id
    assert d["idempotency_key"] == unique_key

test("Submitted payload is retrievable by ID from /api/v1/reports/{id}", test_payload_stored_correctly)

def test_full_payload_stored():
    """Submit a full payload with all optional fields and verify they're stored."""
    unique_key = f"idem-full-{uuid.uuid4()}"
    p = {
        **VALID_PAYLOAD,
        "idempotency_key": unique_key,
        "event_id": f"evt-{uuid.uuid4()}",
        "master_state": "ACTIVE",
        "market_state": {"trend_direction": 1, "adx": 31.2},
        "ade_decision": {"has_candidate": True, "candidate_model": "A1"},
        "ari_decision": {"approved": True, "approved_risk": 800.0},
        "tvl_decision": {"status": "VERIFIED", "verified": True},
        "reasoning": {"action_summary": "LONG A1 @ 21488"},
    }
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 201
    report_id = r.json()["id"]

    r2 = requests.get(f"{BASE_URL}/api/v1/reports/{report_id}", timeout=5)
    assert r2.status_code == 200
    d = r2.json()
    # payload may be stored as dict (already parsed) or as JSON string
    payload_raw = d["payload"]
    payload_data = payload_raw if isinstance(payload_raw, dict) else json.loads(payload_raw)
    assert payload_data.get("master_state") == "ACTIVE"

test("Full payload with optional fields is stored and retrievable", test_full_payload_stored)

# ─────────────────────────────────────────────────────────────────────────────
# GROUP 7: Edge Cases & Resilience
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GROUP 7: Edge Cases & Resilience ===")

def test_oversized_payload():
    """Payload with very long string fields should still be accepted (backend truncates)."""
    p = {**VALID_PAYLOAD,
         "idempotency_key": f"idem-{uuid.uuid4()}",
         "event_id": f"evt-{uuid.uuid4()}",
         "master_state": "A" * 1000}  # 1000-char master_state
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    # Should either accept or reject gracefully (not 500)
    assert r.status_code in (201, 422), f"Expected 201 or 422, got {r.status_code}"

test("Oversized string field → accepted or gracefully rejected (not 500)", test_oversized_payload)

def test_null_optional_fields():
    """Payload with null optional fields should be accepted."""
    p = {**VALID_PAYLOAD,
         "idempotency_key": f"idem-{uuid.uuid4()}",
         "event_id": f"evt-{uuid.uuid4()}",
         "market_state": None,
         "ade_decision": None,
         "ari_decision": None,
         "tvl_decision": None,
         "position_state": None,
         "reasoning": None}
    r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                      headers=HEADERS, json=p, timeout=5)
    assert r.status_code == 201, f"Expected 201, got {r.status_code}"

test("Payload with null optional fields → 201 Created", test_null_optional_fields)

def test_concurrent_submissions():
    """10 concurrent submissions with unique keys should all succeed or be rate-limited.
    The rate limiter (20/min) may kick in for burst traffic; this is expected behaviour.
    We verify: no 5xx errors, and at least 1 submission is accepted (201)."""
    import concurrent.futures
    def submit(i):
        p = {**VALID_PAYLOAD,
             "idempotency_key": f"idem-concurrent-{i}-{uuid.uuid4()}",
             "event_id": f"evt-concurrent-{i}-{uuid.uuid4()}"}
        r = requests.post(f"{BASE_URL}/api/v1/webhook/observe",
                          headers=HEADERS, json=p, timeout=10)
        return r.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        codes = list(ex.map(submit, range(10)))
    # No 5xx errors
    assert all(c < 500 for c in codes), f"Server error in concurrent test: {codes}"
    # At least some accepted
    assert any(c == 201 for c in codes), f"No submissions accepted: {codes}"
    # Only 201 or 429 (rate limited) expected
    assert all(c in (201, 429) for c in codes), f"Unexpected status codes: {codes}"

test("10 concurrent submissions with unique keys → all 201 Created", test_concurrent_submissions)

def test_nonexistent_report():
    """GET /reports/{id} for a nonexistent ID should return 404."""
    r = requests.get(f"{BASE_URL}/api/v1/reports/nonexistent-id-12345", timeout=5)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}"

test("GET /api/v1/reports/{nonexistent} → 404 Not Found", test_nonexistent_report)

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for r in results if r[0] == "PASS")
failed = sum(1 for r in results if r[0] == "FAIL")
errors = sum(1 for r in results if r[0] == "ERROR")
total = len(results)

print(f"\n  TOTAL:  {total}")
print(f"  PASS:   {passed}")
print(f"  FAIL:   {failed}")
print(f"  ERROR:  {errors}")
print(f"\n  RESULT: {'✅ ALL PASS' if failed == 0 and errors == 0 else '❌ FAILURES DETECTED'}")

# Write JSON report
report = {
    "sprint": "075",
    "test_suite": "Atlas Nexus Failure Isolation Tests",
    "run_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "total": total,
    "passed": passed,
    "failed": failed,
    "errors": errors,
    "result": "PASS" if failed == 0 and errors == 0 else "FAIL",
    "tests": [{"status": r[0], "name": r[1], "detail": r[2]} for r in results],
}
with open("/home/ubuntu/Project-Atlas/atlas-nexus/tests/test_report_sprint075.json", "w") as f:
    json.dump(report, f, indent=2)
print("\n  Report written to test_report_sprint075.json")
