/**
 * Sprint 123A.1 — Nexus Webhook Integration Tests
 *
 * These tests invoke the actual TradingView bar-handling route
 * (POST /webhook/atlas-memory/:token) using a real Express app instance
 * with mocked dependencies.
 *
 * Proves:
 *   INT-001: processBar called exactly once per valid bar
 *   INT-002: runPostBarAutomation called exactly once per valid bar
 *   INT-003: liveLearnEngine.processLiveBar NOT called directly from nexusRoutes
 *   INT-004: persisted bar payload passed correctly to postBarAutomation
 *   INT-005: webhook response is not blocked by post-bar processing
 *   INT-006: automation failure does not suppress processBar
 *   INT-007: duplicate webhook returns 200 duplicate — no second postBarAutomation call
 *
 * Static source-boundary safeguards remain in sprint-123a1.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mock all dynamic imports used inside nexusRoutes ─────────────────────────

// Track calls to processBar and runPostBarAutomation
const mockProcessBar = vi.fn().mockResolvedValue({
  signalFired: false,
  signalModel: null,
  signalDirection: null,
});
const mockEvaluate = vi.fn().mockResolvedValue({
  eligible: false,
  model: null,
  direction: null,
  entry: null,
  stop: null,
  target: null,
});
const mockRunPostBarAutomation = vi.fn().mockResolvedValue(undefined);
const mockInsertAtlasMemory = vi.fn();
const mockInsertHealthEvent = vi.fn().mockResolvedValue(undefined);
const mockSendNotification = vi.fn().mockResolvedValue(undefined);
const mockRecordDiscoveryEvent = vi.fn().mockResolvedValue(undefined);
const mockUpsertWfSession = vi.fn().mockResolvedValue(undefined);
const mockUpsertWfDailyReport = vi.fn().mockResolvedValue(undefined);
const mockGetWfStats = vi.fn().mockResolvedValue({
  totalTrades: 0, wins: 0, winRate: 0, pf: 0, totalPnl: 0, maxDd: 0,
  calendarDaysElapsed: 0, promotionGateStatus: "PENDING",
});
const mockGetWfAlerts = vi.fn().mockResolvedValue([]);
const mockGetWfSessionCount = vi.fn().mockResolvedValue(0);
const mockRecordPortfolioIntelligence = vi.fn().mockResolvedValue(undefined);
const mockGetActiveModels = vi.fn().mockResolvedValue([]);

vi.mock("./atlasMemoryDb", () => ({
  insertAtlasMemory: (...args: unknown[]) => mockInsertAtlasMemory(...args),
  getRecentMemory: vi.fn().mockResolvedValue([]),
}));
vi.mock("./healthDb", () => ({
  insertHealthEvent: (...args: unknown[]) => mockInsertHealthEvent(...args),
}));
vi.mock("./notificationService", () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));
vi.mock("./monitor/barEvaluator", () => ({
  evaluate: (...args: unknown[]) => mockEvaluate(...args),
}));
vi.mock("./monitor/paperTradeEngine", () => ({
  processBar: (...args: unknown[]) => mockProcessBar(...args),
  getOpenTrade: vi.fn().mockResolvedValue(null),
  getStats: vi.fn().mockResolvedValue({ totalTrades: 0, wins: 0, winRate: 0, pf: 0, totalPnl: 0, maxDd: 0 }),
}));
vi.mock("./automation/postBarAutomation", () => ({
  runPostBarAutomation: (...args: unknown[]) => mockRunPostBarAutomation(...args),
}));
vi.mock("./arp1Db", () => ({
  recordDiscoveryEvent: (...args: unknown[]) => mockRecordDiscoveryEvent(...args),
  getActiveModels: (...args: unknown[]) => mockGetActiveModels(...args),
  recordPortfolioIntelligence: (...args: unknown[]) => mockRecordPortfolioIntelligence(...args),
}));
vi.mock("./wfDb", () => ({
  upsertWfSession: (...args: unknown[]) => mockUpsertWfSession(...args),
  upsertWfDailyReport: (...args: unknown[]) => mockUpsertWfDailyReport(...args),
  getWfStats: (...args: unknown[]) => mockGetWfStats(...args),
  getWfAlerts: (...args: unknown[]) => mockGetWfAlerts(...args),
  getWfSessionCount: (...args: unknown[]) => mockGetWfSessionCount(...args),
}));
vi.mock("./liveLearnEngine", () => ({
  processLiveBar: vi.fn().mockResolvedValue(undefined),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_TOKEN = "test-atlas-token-123a1";
const VALID_BAR_PAYLOAD = {
  event_type: "BAR_OBSERVATION",
  webhook_secret: TEST_TOKEN,
  bar_time: 1720000000000,
  symbol: "MNQ1!",
  memory_id: "MEM_MNQ1!_1720000000000",
  idempotency_key: "MNQ1!_1720000000000",
  open: "19500.00",
  high: "19520.00",
  low: "19480.00",
  close: "19510.00",
  volume: "1234",
  session: "RTH",
  regime_classification: "TRENDING_UP",
  adx: "28.5",
  atr: "12.5",
  a1_eligible: true,
  a3_eligible: false,
  b1_eligible: false,
  sb1_eligible: false,
};

// Build a fresh Express app for each test
async function buildApp() {
  process.env.ATLAS_WEBHOOK_TOKEN = TEST_TOKEN;
  const app = express();
  app.use(express.json());
  const { Router } = await import("express");
  const router = Router();
  const { registerNexusRoutes } = await import("./nexusRoutes");
  registerNexusRoutes(router);
  app.use("/api", router);
  return app;
}

// Flush all pending setImmediate callbacks
function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe("Sprint 123A.1 — Nexus Webhook Integration Tests", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore default resolved values after clearAllMocks() (which clears implementations)
    mockProcessBar.mockResolvedValue({
      signalFired: false,
      signalModel: null,
      signalDirection: null,
      signalEntry: null,
      signalStop: null,
      signalTarget: null,
    });
    mockEvaluate.mockResolvedValue({
      eligible: false,
      model: null,
      direction: null,
      entry: null,
      stop: null,
      target: null,
    });
    mockRunPostBarAutomation.mockResolvedValue(undefined);
    mockInsertHealthEvent.mockResolvedValue(undefined);
    mockSendNotification.mockResolvedValue(undefined);
    mockGetWfStats.mockResolvedValue({
      totalTrades: 0, wins: 0, winRate: 0, pf: 0, totalPnl: 0, maxDd: 0,
      calendarDaysElapsed: 0, promotionGateStatus: "PENDING",
    });
    mockGetWfAlerts.mockResolvedValue([]);
    mockGetWfSessionCount.mockResolvedValue(0);
    mockGetActiveModels.mockResolvedValue([]);
    // Default: first call = new insert, second call = duplicate
    mockInsertAtlasMemory
      .mockResolvedValueOnce({ inserted: true, id: 42 })
      .mockResolvedValue({ inserted: false, id: 42 });
    app = await buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── INT-001 ────────────────────────────────────────────────────────────────
  it("INT-001: processBar called exactly once per valid TradingView bar", async () => {
    const res = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    // Flush setImmediate queue so processBar fires
    await flushSetImmediate();
    await flushSetImmediate();

    expect(mockProcessBar).toHaveBeenCalledTimes(1);
  });

  // ── INT-002 ────────────────────────────────────────────────────────────────
  it("INT-002: runPostBarAutomation called exactly once per valid TradingView bar", async () => {
    const res = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    await flushSetImmediate();
    await flushSetImmediate();

    expect(mockRunPostBarAutomation).toHaveBeenCalledTimes(1);
  });

  // ── INT-003 ────────────────────────────────────────────────────────────────
  it("INT-003: liveLearnEngine.processLiveBar NOT called directly from nexusRoutes", async () => {
    const { processLiveBar } = await import("./liveLearnEngine");
    const mockDirectCall = vi.mocked(processLiveBar);

    await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");

    await flushSetImmediate();
    await flushSetImmediate();

    // liveLearnEngine must never be called directly from nexusRoutes.
    // It is called only via postBarAutomation (which is mocked here).
    expect(mockDirectCall).not.toHaveBeenCalled();
  });

  // ── INT-004 ────────────────────────────────────────────────────────────────
  it("INT-004: persisted bar payload passed correctly to runPostBarAutomation", async () => {
    await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");

    await flushSetImmediate();
    await flushSetImmediate();

    expect(mockRunPostBarAutomation).toHaveBeenCalledTimes(1);
    const callArg = mockRunPostBarAutomation.mock.calls[0][0] as Record<string, unknown>;

    // Verify key fields from the persisted bar are passed correctly
    expect(callArg.id).toBe(42); // DB-assigned id from insertAtlasMemory
    expect(callArg.memoryId).toBe("MEM_MNQ1!_1720000000000");
    expect(callArg.barTime).toBe(1720000000000);
    expect(callArg.symbol).toBe("MNQ1!");
    expect(callArg.close).toBe("19510.00");
    expect(callArg.triggerSource).toBe("TRADINGVIEW");
    expect(callArg.authorityMode).toBe("TRADINGVIEW_ONLY");
  });

  // ── INT-005 ────────────────────────────────────────────────────────────────
  it("INT-005: webhook response is not blocked by post-bar processing", async () => {
    // Make postBarAutomation take a long time — response must still be immediate
    mockRunPostBarAutomation.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 5000))
    );

    const start = Date.now();
    const res = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");
    const elapsed = Date.now() - start;

    expect(res.status).toBe(201);
    // Response must arrive well before the 5s postBarAutomation delay
    expect(elapsed).toBeLessThan(2000);
  });

  // ── INT-006 ────────────────────────────────────────────────────────────────
  it("INT-006: automation failure does not suppress processBar", async () => {
    // postBarAutomation throws — processBar must still be called
    mockRunPostBarAutomation.mockRejectedValue(new Error("Automation failure"));

    const res = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);
    await flushSetImmediate();
    await flushSetImmediate();

    // processBar runs in its own setImmediate block — independent of postBarAutomation
    expect(mockProcessBar).toHaveBeenCalledTimes(1);
    // postBarAutomation was attempted (and failed)
    expect(mockRunPostBarAutomation).toHaveBeenCalledTimes(1);
  });

  // ── INT-007 ────────────────────────────────────────────────────────────────
  it("INT-007: duplicate webhook returns 200 duplicate — no second postBarAutomation call", async () => {
    // First call: new insert
    const res1 = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");
    await flushSetImmediate();
    await flushSetImmediate();

    expect(res1.status).toBe(201);
    expect(mockRunPostBarAutomation).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    // Second call: duplicate (insertAtlasMemory returns inserted: false)
    mockInsertAtlasMemory.mockResolvedValue({ inserted: false, id: 42 });

    const res2 = await request(app)
      .post(`/api/webhook/atlas-memory/${TEST_TOKEN}`)
      .send(VALID_BAR_PAYLOAD)
      .set("Content-Type", "application/json");
    await flushSetImmediate();
    await flushSetImmediate();

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe("duplicate");
    // Duplicate: no processBar, no postBarAutomation
    expect(mockProcessBar).not.toHaveBeenCalled();
    expect(mockRunPostBarAutomation).not.toHaveBeenCalled();
  });
});
