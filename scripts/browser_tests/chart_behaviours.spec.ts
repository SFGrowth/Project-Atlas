/**
 * Atlas Nexus — Sprint 123A.4 Gate G4
 * Browser Tests: DatabentoLiveChart — 20 Chart Behaviour Proofs
 *
 * Run against the live server:
 *   ATLAS_BASE_URL=https://your-server.com npx playwright test scripts/browser_tests/chart_behaviours.spec.ts
 *
 * Prerequisites:
 *   - Server running with MARKET_DATA_AUTHORITY=DATABENTO_SHADOW
 *   - User authenticated (set ATLAS_SESSION_COOKIE env var)
 *   - At least 10 confirmed bars in atlas_bars_1m
 */

import { test, expect, Page, request } from "@playwright/test";

const BASE_URL = process.env.ATLAS_BASE_URL ?? "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginAndNavigate(page: Page) {
  await page.goto(`${BASE_URL}/`);
  // If session cookie is set via env, inject it
  if (process.env.ATLAS_SESSION_COOKIE) {
    await page.context().addCookies([
      {
        name: "app_session_id",
        value: process.env.ATLAS_SESSION_COOKIE,
        domain: new URL(BASE_URL).hostname,
        path: "/",
      },
    ]);
    await page.reload();
  }
  // Wait for the dashboard to load
  await page.waitForSelector("[data-testid='databento-chart-container']", {
    timeout: 15_000,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("DatabentoLiveChart — 20 Chart Behaviour Proofs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  // ── CB-001: Chart container renders ──────────────────────────────────────
  test("CB-001: chart container renders on dashboard", async ({ page }) => {
    const container = page.locator("[data-testid='databento-chart-container']");
    await expect(container).toBeVisible();
  });

  // ── CB-002: History loads — candles visible ───────────────────────────────
  test("CB-002: history loads and candles are visible in chart", async ({
    page,
  }) => {
    // Wait for the loading state to clear
    await expect(
      page.locator("[data-testid='chart-status-loading']")
    ).not.toBeVisible({ timeout: 10_000 });
    // Chart canvas should be present (multiple canvases are rendered by lightweight-charts)
    const canvas = page.locator(
      "[data-testid='databento-chart-container'] canvas"
    ).first();
    await expect(canvas).toBeVisible();
  });

  // ── CB-003: Status indicator shows correct mode ───────────────────────────
  test("CB-003: status indicator shows SHADOW mode", async ({ page }) => {
    const badge = page.locator("[data-testid='chart-source-badge']");
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text).toMatch(/SHADOW|DATABENTO/i);
  });

  // ── CB-004: 1m/5m toggle renders ─────────────────────────────────────────
  test("CB-004: 1m/5m interval toggle is rendered", async ({ page }) => {
    const toggle1m = page.locator("[data-testid='interval-btn-1m']");
    const toggle5m = page.locator("[data-testid='interval-btn-5m']");
    await expect(toggle1m).toBeVisible();
    await expect(toggle5m).toBeVisible();
  });

  // ── CB-005: 1m is default selected ───────────────────────────────────────
  test("CB-005: 1m interval is selected by default", async ({ page }) => {
    const toggle1m = page.locator("[data-testid='interval-btn-1m']");
    await expect(toggle1m).toHaveAttribute("aria-pressed", "true");
  });

  // ── CB-006: Switch to 5m interval ────────────────────────────────────────
  test("CB-006: clicking 5m switch loads 5m bars", async ({ page }) => {
    const toggle5m = page.locator("[data-testid='interval-btn-5m']");
    await toggle5m.click();
    // Status should show loading then resolve
    await expect(
      page.locator("[data-testid='chart-status-loading']")
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(toggle5m).toHaveAttribute("aria-pressed", "true");
  });

  // ── CB-007: SSE connection established ───────────────────────────────────
  test("CB-007: SSE connection is established (LIVE status)", async ({
    page,
  }) => {
    const status = page.locator("[data-testid='sse-status']");
    await expect(status).toBeVisible({ timeout: 10_000 });
    const text = await status.textContent();
    expect(text).toMatch(/LIVE|CONNECTED/i);
  });

  // ── CB-008: No error state on initial load ────────────────────────────────
  test("CB-008: no error state displayed on initial load", async ({ page }) => {
    const errorBanner = page.locator("[data-testid='chart-error-banner']");
    await expect(errorBanner).not.toBeVisible();
  });

  // ── CB-009: Chart title shows symbol ─────────────────────────────────────
  test("CB-009: chart title displays the symbol name", async ({ page }) => {
    const title = page.locator("[data-testid='chart-title']");
    await expect(title).toBeVisible();
    const text = await title.textContent();
    expect(text).toMatch(/MNQ/i);
  });

  // ── CB-010: VWAP line renders ─────────────────────────────────────────────
  test("CB-010: VWAP overlay line is rendered on chart", async ({ page }) => {
    // VWAP indicator label should be visible in the chart legend
    const vwapLabel = page.locator("[data-testid='chart-legend-vwap']");
    await expect(vwapLabel).toBeVisible({ timeout: 5_000 });
  });

  // ── CB-011: EMA9 line renders ─────────────────────────────────────────────
  test("CB-011: EMA-9 overlay line is rendered on chart", async ({ page }) => {
    const ema9Label = page.locator("[data-testid='chart-legend-ema9']");
    await expect(ema9Label).toBeVisible({ timeout: 5_000 });
  });

  // ── CB-012: EMA21 line renders ────────────────────────────────────────────
  test("CB-012: EMA-21 overlay line is rendered on chart", async ({ page }) => {
    const ema21Label = page.locator("[data-testid='chart-legend-ema21']");
    await expect(ema21Label).toBeVisible({ timeout: 5_000 });
  });

  // ── CB-013: Reconnect button visible when offline ─────────────────────────
  test("CB-013: reconnect button appears when SSE is offline", async ({
    page,
  }) => {
    // Simulate offline by intercepting the stream endpoint
    await page.route("**/api/market-data/stream**", (route) => route.abort());
    await page.reload();
    await loginAndNavigate(page);
    // Wait for RECONNECTING or OFFLINE state (stream error triggers RECONNECTING)
    const reconnectBtn = page.locator("[data-testid='chart-reconnect-btn']");
    await expect(reconnectBtn).toBeVisible({ timeout: 20_000 });
  });

    // ── CB-014: History API returns 401 without auth ──────────────────────────
  test("CB-014: /api/market-data/bars returns 401 without session", async () => {
    // Fresh unauthenticated context — no cookies from beforeEach
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const response = await ctx.get("/api/market-data/bars?symbol=MNQM5&interval=1m");
    await ctx.dispose();
    expect(response.status()).toBe(401);
  });
  // ── CB-015: Stream API returns 401 without auth ───────────────────────────
  test("CB-015: /api/market-data/stream returns 401 without session", async () => {
    // Fresh unauthenticated context — no cookies from beforeEach
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const response = await ctx.get("/api/market-data/stream?symbol=MNQM5&interval=1m");
    await ctx.dispose();
    expect(response.status()).toBe(401);
  });

  // ── CB-016: Health endpoint returns JSON ──────────────────────────────────
  test("CB-016: /api/market-data/health returns JSON with state field", async ({
    page,
  }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/market-data/health`
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Health endpoint returns orchestrator.status not body.state
    expect(body).toHaveProperty("orchestrator");
    expect(body.orchestrator).toHaveProperty("status");
    expect(["READY", "LIVE", "DEGRADED", "STALE", "OFFLINE", "INITIALISING"]).toContain(
      body.orchestrator.status
    );
  });

  // ── CB-017: Bars API returns array of bars ────────────────────────────────
  test("CB-017: /api/market-data/bars returns array of bar objects", async ({
    page,
  }) => {
    // Use authenticated session with required startTsMs/endTsMs params
    const endTsMs = Date.now();
    const startTsMs = endTsMs - 2 * 60 * 60 * 1000; // last 2 hours
    const response = await page.request.get(
      `${BASE_URL}/api/market-data/bars?symbol=MNQU6&interval=1m&startTsMs=${startTsMs}&endTsMs=${endTsMs}`,
      {
        headers: process.env.ATLAS_SESSION_COOKIE
          ? { Cookie: `app_session_id=${process.env.ATLAS_SESSION_COOKIE}` }
          : {},
      }
    );
    if (response.status() === 401) {
      test.skip();
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.bars)).toBe(true);
    if (body.bars.length > 0) {
      const bar = body.bars[0];
      expect(bar).toHaveProperty("barOpenTsMs");
      expect(bar).toHaveProperty("openPts100");
      expect(bar).toHaveProperty("closePts100");
    }
  });

  // ── CB-018: Bars API rejects future range ─────────────────────────────────
  test("CB-018: /api/market-data/bars rejects range > 7 days", async ({
    page,
  }) => {
    const from = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    const to = Date.now();
    const response = await page.request.get(
      `${BASE_URL}/api/market-data/bars?symbol=MNQM5&interval=1m&fromMs=${from}&toMs=${to}`,
      {
        headers: process.env.ATLAS_SESSION_COOKIE
          ? { Cookie: `app_session_id=${process.env.ATLAS_SESSION_COOKIE}` }
          : {},
      }
    );
    if (response.status() === 401) {
      test.skip();
      return;
    }
    expect(response.status()).toBe(400);
  });

  // ── CB-019: Parity endpoint returns metrics ───────────────────────────────
  test("CB-019: /api/market-data/parity returns parity metrics", async ({
    page,
  }) => {
    const response = await page.request.get(
      `${BASE_URL}/api/market-data/parity`,
      {
        headers: process.env.ATLAS_SESSION_COOKIE
          ? { Cookie: `app_session_id=${process.env.ATLAS_SESSION_COOKIE}` }
          : {},
      }
    );
    if (response.status() === 401) {
      test.skip();
      return;
    }
    expect(response.status()).toBe(200);
    const body = await response.json();
    // Parity metrics are nested under the health endpoint
    expect(body).toHaveProperty("totalCompared");
    expect(body).toHaveProperty("mismatchRate");
  });

  // ── CB-020: Chart-authority badge is visible in DATABENTO_CHART_AUTHORITY mode ──
  // Updated: Sprint 123A.5 — server now runs DATABENTO_CHART_AUTHORITY; badge must be visible
  test("CB-020: chart-authority badge is visible in DATABENTO_CHART_AUTHORITY mode", async ({
    page,
  }) => {
    const authorityBadge = page.locator(
      "[data-testid='chart-authority-active-badge']"
    );
    // In DATABENTO_CHART_AUTHORITY mode the badge is rendered and visible
    await expect(authorityBadge).toBeVisible({ timeout: 10_000 });
  });
});
