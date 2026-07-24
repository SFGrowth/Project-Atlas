import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

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
