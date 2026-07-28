import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const templateRoot = path.resolve(import.meta.dirname);

// ─── Operational .env is NEVER loaded in test mode ───────────────────────────
//
// Sprint 123A.10 Gate G10 — Test Environment Isolation Lock
//
// The operational .env file contains live credentials (DATABASE_URL pointing to
// atlas_staging_g4, DATABENTO_API_KEY, BRIDGE_AUTH_TOKEN, OAuth secrets, etc.).
// Loading it in tests would violate TESTS_USE_OPERATIONAL_ENV=FALSE.
//
// Tests load ONLY .env.test (gitignored, fake credentials).
// If .env.test does not exist, falls back to .env.test.example.
// The fail-closed guard in server/test-env-guard.ts rejects any environment
// containing operational indicators before any connection is attempted.

/**
 * Load .env.test (test-only fake credentials).
 * Falls back to .env.test.example if .env.test does not exist.
 * NEVER loads .env, .env.local, or any operational environment file.
 */
function loadTestEnvFile(): Record<string, string> {
  // Candidate files in priority order — operational .env is NOT in this list
  const candidates = [
    path.resolve(templateRoot, ".env.test"),
    path.resolve(templateRoot, ".env.test.example"),
  ];

  for (const envFile of candidates) {
    if (!fs.existsSync(envFile)) continue;

    const vars: Record<string, string> = {};
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }

    // Enforce NODE_ENV=test
    vars["NODE_ENV"] = "test";

    // Fail-closed: reject any DATABASE_URL that does not contain "test"
    const dbUrl = vars["DATABASE_URL"] ?? "";
    if (dbUrl && !dbUrl.includes("test")) {
      throw new Error(
        `[Atlas Test Guard] FATAL: DATABASE_URL in ${envFile} does not contain "test". ` +
        `Refusing to run tests against a non-test database. ` +
        `DATABASE_URL must reference a schema/database name containing "test" ` +
        `(e.g. atlas_test_123a3). Got: ${dbUrl.replace(/:[^@]*@/, ":***@")}`
      );
    }

    // Fail-closed: reject known operational database names
    const OPERATIONAL_DB_NAMES = [
      "atlas_staging_g4",
      "atlas_prod",
      "atlas_production",
    ];
    for (const opDb of OPERATIONAL_DB_NAMES) {
      if (dbUrl.includes(opDb)) {
        throw new Error(
          `[Atlas Test Guard] FATAL: DATABASE_URL references operational database "${opDb}". ` +
          `Refusing to run tests. Use an isolated test database (name must contain "test").`
        );
      }
    }

    return vars;
  }

  // No .env.test or .env.test.example found — return safe defaults
  console.warn(
    "[Atlas Vitest] WARNING: No .env.test or .env.test.example found. " +
    "Tests will run with empty environment. " +
    "Copy .env.test.example to .env.test to configure the test environment."
  );
  return { NODE_ENV: "test" };
}

const testEnv = loadTestEnvFile();

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    env: testEnv,
    // Increase default timeout from 5000ms to 15000ms to accommodate tests that
    // use dynamic imports (e.g. TEST-123A4-043 which imports market-data-router).
    // This was a pre-existing flakiness issue on the G9 baseline.
    testTimeout: 15000,
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    exclude: [
      // Legacy tests from retired sprints — not part of gate-targeted test suite
      "server/legacy-tests/**",
      // Playwright tests use @playwright/test runner, not Vitest
      "**/*playwright*",
      "**/*.playwright.test.ts",
      "**/node_modules/**",
    ],
    // Global setup runs before all test files — enforces environment isolation
    globalSetup: ["server/test-env-guard.ts"],
  },
});
