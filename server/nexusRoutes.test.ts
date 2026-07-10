/**
 * Atlas Nexus — Webhook authentication and schema validation tests.
 * Tests the dual-layer auth: secret path segment + payload field.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import express from "express";
import { Router } from "express";
import { createServer, Server } from "http";
import { registerNexusRoutes } from "./nexusRoutes";

// Use a test token that matches what the server will see
const TEST_TOKEN = "test-atlas-secret-token-abc123xyz";

function buildTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerNexusRoutes(router);
  app.use("/api", router);
  return app;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    payload_type: "OBSERVABILITY",
    event_id: "evt-test-001",
    idempotency_key: `idem-${Date.now()}-${Math.random()}`,
    pipeline_run_id: "run-test-001",
    timestamp_utc: new Date().toISOString(),
    bar_time: new Date().toISOString(),
    bar_index: 1000,
    chart_id: "chart-test",
    symbol: "MNQ1!",
    timeframe: "5",
    master_state: "ACTIVE",
    webhook_secret: TEST_TOKEN,
    ...overrides,
  };
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Set the test token in the environment
  process.env.ATLAS_WEBHOOK_TOKEN = TEST_TOKEN;

  const app = buildTestApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://localhost:${addr.port}`;
});

afterAll(() => {
  server.close();
  delete process.env.ATLAS_WEBHOOK_TOKEN;
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

// ─── Layer 1: Path Token Tests ────────────────────────────────────────────────

describe("Layer 1 — Secret path token", () => {
  it("returns 404 when no token in path", async () => {
    const r = await post("/api/webhook/observe", validPayload());
    expect(r.status).toBe(404);
  });

  it("returns 404 when wrong token in path", async () => {
    const r = await post("/api/webhook/observe/wrong-token-xyz", validPayload());
    expect(r.status).toBe(404);
  });

  it("returns 404 when path token is empty string", async () => {
    const r = await post("/api/webhook/observe/", validPayload());
    expect(r.status).toBe(404);
  });
});

// ─── Layer 2: Payload Field Tests ────────────────────────────────────────────

describe("Layer 2 — Payload webhook_secret field", () => {
  it("returns 403 when webhook_secret is missing from payload", async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).webhook_secret;
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, payload);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/webhook_secret/);
  });

  it("returns 403 when webhook_secret is wrong", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload({ webhook_secret: "wrong-secret" }));
    expect(r.status).toBe(403);
  });

  it("returns 403 when webhook_secret is empty string", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload({ webhook_secret: "" }));
    expect(r.status).toBe(403);
  });
});

// ─── Content-Type Tests ───────────────────────────────────────────────────────

describe("Content-Type validation", () => {
  it("returns 415 when Content-Type is text/plain", async () => {
    const res = await fetch(`${baseUrl}/api/webhook/observe/${TEST_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(415);
  });
});

// ─── Schema Validation Tests ──────────────────────────────────────────────────

describe("Schema validation", () => {
  it("returns 422 when symbol is not MNQ1!", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload({ symbol: "ES1!" }));
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/symbol/);
  });

  it("returns 422 when schema_version is wrong", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload({ schema_version: "2.0.0" }));
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/schema_version/);
  });

  it("returns 422 when payload_type is wrong", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload({ payload_type: "EXECUTION" }));
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/payload_type/);
  });

  it("returns 422 when required field is missing", async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).master_state;
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, payload);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/master_state/);
  });
});

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe("Happy path", () => {
  it("returns 201 for a valid payload with correct dual-layer auth", async () => {
    const r = await post(`/api/webhook/observe/${TEST_TOKEN}`, validPayload());
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("accepted");
    expect(r.body.id).toBeTruthy();
    expect(r.body.idempotency_key).toBeTruthy();
  });

  it("returns 200 DUPLICATE_IGNORED for the same idempotency_key", async () => {
    const key = `idem-dedup-${Date.now()}`;
    const payload = validPayload({ idempotency_key: key });
    const r1 = await post(`/api/webhook/observe/${TEST_TOKEN}`, payload);
    expect(r1.status).toBe(201);
    const r2 = await post(`/api/webhook/observe/${TEST_TOKEN}`, payload);
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe("DUPLICATE_IGNORED");
  });
});

// ─── Health endpoint ──────────────────────────────────────────────────────────

describe("Health endpoint", () => {
  it("GET /api/v1/health returns 200 ok", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
