/**
 * Atlas Nexus — Local Cron Authentication Bypass
 *
 * The Manus Forge API (BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY) is only
 * available in Manus-hosted WebDev projects. On the standalone cloud PC server,
 * these credentials are absent, so sdk.authenticateRequest() cannot authenticate
 * cron callbacks.
 *
 * This module provides a LOCAL_CRON_SECRET bypass: when a request carries the
 * header `X-Local-Cron-Secret: <secret>` matching the value in .env, it is
 * treated as an authenticated cron callback (isCron=true) without requiring
 * Manus Forge infrastructure.
 *
 * Security: The secret is only accessible on localhost (cron jobs run on the
 * same machine as the server). The server only listens on 127.0.0.1:3000 for
 * direct connections; nginx proxies port 80 but does NOT forward this header.
 *
 * Usage in scheduledJobs.ts:
 *   const isCron = isLocalCronRequest(req) || (await authenticateAsCron(req));
 *
 * Added: Sprint DARWIN-OPS-RECOVERY (2026-07-30)
 */
import type { Request } from "express";
import { ENV } from "./env.js";

const LOCAL_CRON_HEADER = "x-local-cron-secret";

/**
 * Returns true if the request carries a valid local cron secret.
 * Fails closed: returns false if LOCAL_CRON_SECRET is not configured.
 */
export function isLocalCronRequest(req: Request): boolean {
  const secret = ENV.localCronSecret;
  if (!secret || secret.length < 32) {
    // Not configured or too short — refuse to bypass
    return false;
  }
  const header = req.headers[LOCAL_CRON_HEADER];
  if (typeof header !== "string") return false;
  // Constant-time comparison to prevent timing attacks
  if (header.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= header.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}
