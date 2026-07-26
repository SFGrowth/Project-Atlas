import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

const templateRoot = path.resolve(import.meta.dirname);

// Load .env so DATABASE_URL and other server-side vars are available in tests.
// This mirrors what the systemd service does via EnvironmentFile=.env.
function loadEnvFile(): Record<string, string> {
  const envFile = path.resolve(templateRoot, ".env");
  if (!fs.existsSync(envFile)) return {};
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

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
    env: loadEnvFile(),
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
  },
});
