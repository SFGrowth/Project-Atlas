/**
 * Playwright Configuration
 * Sprint 123A.7 Gate G7 — Seventh Withhold
 *
 * Runs dashboard lineage proof tests against the live Atlas Nexus server.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './server/darwin/strategy-registry',
  testMatch: '**/*.test.ts',
  // Only run playwright tests (not vitest tests)
  grep: /PW-G7/,
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/reports/g7-playwright-results.json' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    // Headless mode for CI
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Do not start a local server — the Atlas Nexus server is already running
  webServer: undefined,
});
