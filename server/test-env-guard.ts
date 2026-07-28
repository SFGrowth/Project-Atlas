/**
 * test-env-guard.ts — Atlas Nexus Fail-Closed Test Environment Guard
 *
 * Sprint 123A.10 Gate G10 — Test Environment Isolation Lock
 *
 * This file is a Vitest globalSetup module. It runs ONCE before all test files.
 * It enforces that the test environment contains only isolated, fake credentials
 * and terminates the test run immediately if any operational indicator is found.
 *
 * AUTHORITY COUNTERS (Gate G10 invariant — this file must never change these):
 *   DARWIN_PROCESSBAR_CALLS:          0
 *   DARWIN_POSTBARAUTOMATION_CALLS:   0
 *   DARWIN_TRADERSPOST_CALLS:         0
 *   DARWIN_TRADOVATE_CALLS:           0
 */

// ─── Operational indicators that must never appear in the test environment ────

/** Database/schema names that indicate an operational (non-test) database */
const OPERATIONAL_DB_NAMES = [
  "atlas_staging_g4",
  "atlas_prod",
  "atlas_production",
  "atlas_staging",
];

/** Hostname patterns that indicate a remote operational database */
const OPERATIONAL_DB_HOSTNAMES = [
  "35.231.100.83",
  "34.",  // GCP external IPs
  "rds.amazonaws.com",
  "cloudsql",
];

/** URL patterns that indicate live external services */
const LIVE_SERVICE_PATTERNS = [
  "databento.com",
  "traderspost.io",
  "tradovate.com",
  "api.manus.im",
];

/** Known live Databento API key prefix */
const LIVE_DATABENTO_PREFIX = "db-";

/** Known live bridge token indicators */
const LIVE_BRIDGE_INDICATORS = [
  "atlas-staging",
  "atlas-prod",
  "atlas-live",
];

// ─── Database client registry ─────────────────────────────────────────────────
//
// This registry is populated by instrumented database clients during the test run.
// It is exported so test files can inspect it.

export interface DbClientRecord {
  clientId: string;
  hostname: string;
  database: string;
  source: string;
  firstConnectionTs: string;
  isIsolated: boolean;
}

export const DB_CLIENT_REGISTRY: DbClientRecord[] = [];

export function registerDbClient(record: Omit<DbClientRecord, "isIsolated">): void {
  const isIsolated =
    record.database.includes("test") &&
    !OPERATIONAL_DB_NAMES.some(n => record.database.includes(n)) &&
    !OPERATIONAL_DB_HOSTNAMES.some(h => record.hostname.includes(h));
  DB_CLIENT_REGISTRY.push({ ...record, isIsolated });
}

// ─── Guard function ───────────────────────────────────────────────────────────

function guardFail(message: string): never {
  console.error(`\n[Atlas Test Guard] FATAL: ${message}\n`);
  process.exit(1);
}

function checkDatabaseUrl(dbUrl: string, source: string): void {
  if (!dbUrl) return; // Empty DATABASE_URL is safe — db.ts skips connection

  // Must contain "test"
  if (!dbUrl.includes("test")) {
    guardFail(
      `${source} DATABASE_URL does not contain "test". ` +
      `Refusing to run tests against a non-test database. ` +
      `Schema name must contain "test" (e.g. atlas_test_123a3).`
    );
  }

  // Must not reference operational database names
  for (const opDb of OPERATIONAL_DB_NAMES) {
    if (dbUrl.includes(opDb)) {
      guardFail(
        `${source} DATABASE_URL references operational database "${opDb}". ` +
        `Refusing to run tests.`
      );
    }
  }

  // Must not reference operational hostnames
  for (const opHost of OPERATIONAL_DB_HOSTNAMES) {
    if (dbUrl.includes(opHost)) {
      guardFail(
        `${source} DATABASE_URL references operational hostname "${opHost}". ` +
        `Refusing to run tests.`
      );
    }
  }
}

function checkExternalServices(env: NodeJS.ProcessEnv): void {
  // Databento: fake keys start with "db-test-" or are empty
  const dataBentoKey = env.DATABENTO_API_KEY ?? "";
  if (dataBentoKey && dataBentoKey.startsWith(LIVE_DATABENTO_PREFIX) && !dataBentoKey.includes("test") && !dataBentoKey.includes("fake")) {
    guardFail(
      `DATABENTO_API_KEY appears to be a live credential (starts with "${LIVE_DATABENTO_PREFIX}" and does not contain "test" or "fake"). ` +
      `Refusing to run tests with live Databento credentials.`
    );
  }

  // Bridge token: must not contain operational indicators
  const bridgeToken = env.BRIDGE_AUTH_TOKEN ?? "";
  for (const indicator of LIVE_BRIDGE_INDICATORS) {
    if (bridgeToken.includes(indicator)) {
      guardFail(
        `BRIDGE_AUTH_TOKEN contains operational indicator "${indicator}". ` +
        `Refusing to run tests with live bridge credentials.`
      );
    }
  }

  // OAuth server URL: must not be a live production endpoint
  const oauthUrl = env.OAUTH_SERVER_URL ?? "";
  for (const pattern of LIVE_SERVICE_PATTERNS) {
    if (oauthUrl.includes(pattern)) {
      guardFail(
        `OAUTH_SERVER_URL references live service "${pattern}". ` +
        `Refusing to run tests with live OAuth credentials.`
      );
    }
  }
}

function checkNodeEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "test") {
    guardFail(
      `NODE_ENV is "${env.NODE_ENV}" but must be "test". ` +
      `The test environment must explicitly set NODE_ENV=test.`
    );
  }
}

// ─── Vitest globalSetup export ────────────────────────────────────────────────

export async function setup(): Promise<void> {
  const env = process.env;

  // 1. Enforce NODE_ENV=test
  checkNodeEnv(env);

  // 2. Check DATABASE_URL
  checkDatabaseUrl(env.DATABASE_URL ?? "", "process.env");

  // 3. Check external service credentials
  checkExternalServices(env);

  // 4. Log the confirmed test environment (keys only, no values)
  const confirmedKeys = [
    "NODE_ENV",
    "DATABASE_URL",
    "OAUTH_SERVER_URL",
    "OWNER_OPEN_ID",
    "DATABENTO_API_KEY",
    "BRIDGE_AUTH_TOKEN",
  ];

  console.log("\n[Atlas Test Guard] Test environment isolation confirmed:");
  for (const key of confirmedKeys) {
    const val = env[key];
    if (val) {
      // Show first 8 chars only — enough to confirm it is fake
      const preview = val.length > 8 ? `${val.slice(0, 8)}...` : val;
      console.log(`  ${key}: ${preview}`);
    } else {
      console.log(`  ${key}: (not set)`);
    }
  }

  // 5. Confirm DATABASE_URL schema name
  const dbUrl = env.DATABASE_URL ?? "";
  if (dbUrl) {
    try {
      // Extract database name from URL
      const urlForParsing = dbUrl.replace("mysql://", "http://").replace(/\?.*$/, "");
      const parsed = new URL(urlForParsing);
      const dbName = parsed.pathname.slice(1);
      console.log(`  DATABASE_NAME: ${dbName}`);
      if (!dbName.includes("test")) {
        guardFail(`DATABASE_NAME "${dbName}" does not contain "test".`);
      }
    } catch {
      // URL parsing failed — check raw string
      if (!dbUrl.includes("test")) {
        guardFail(`DATABASE_URL does not contain "test".`);
      }
    }
  }

  console.log("[Atlas Test Guard] All checks passed. Proceeding with test run.\n");
}

export async function teardown(): Promise<void> {
  // Report database client registry after all tests complete
  const total = DB_CLIENT_REGISTRY.length;
  const isolated = DB_CLIENT_REGISTRY.filter(r => r.isIsolated).length;
  const staging = DB_CLIENT_REGISTRY.filter(r =>
    OPERATIONAL_DB_NAMES.some(n => r.database.includes(n))
  ).length;
  const production = DB_CLIENT_REGISTRY.filter(r =>
    r.database.includes("prod")
  ).length;
  const unknown = DB_CLIENT_REGISTRY.filter(r =>
    !r.isIsolated && !OPERATIONAL_DB_NAMES.some(n => r.database.includes(n))
  ).length;

  console.log("\n[Atlas Test Guard] Database Client Registry:");
  console.log(`  TOTAL_TEST_DATABASE_CLIENTS:     ${total}`);
  console.log(`  ISOLATED_TEST_DATABASE_CLIENTS:  ${isolated}`);
  console.log(`  STAGING_DATABASE_CLIENTS:        ${staging}`);
  console.log(`  PRODUCTION_DATABASE_CLIENTS:     ${production}`);
  console.log(`  UNKNOWN_DATABASE_CLIENTS:        ${unknown}`);

  if (staging > 0 || production > 0 || unknown > 0) {
    console.error(
      `[Atlas Test Guard] FATAL: Non-isolated database clients detected. ` +
      `staging=${staging}, production=${production}, unknown=${unknown}`
    );
    process.exit(1);
  }
}
