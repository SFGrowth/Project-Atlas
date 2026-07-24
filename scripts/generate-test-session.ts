/**
 * Generate a test session token for Playwright browser tests.
 * Sprint 123A.7 Gate G7 — Seventh Withhold
 *
 * Creates a valid JWT session token using the same algorithm as sdk.createSessionToken().
 * The token is written to /tmp/atlas-test-session.json for use by Playwright tests.
 *
 * Usage:
 *   npx tsx scripts/generate-test-session.ts
 */

import { SignJWT } from 'jose';
import * as fs from 'fs';

const JWT_SECRET = process.env.JWT_SECRET ?? 'atlas-staging-jwt-secret-gate-g4';
const APP_ID = process.env.VITE_APP_ID ?? 'atlas-nexus-staging';
const OPEN_ID = 'test-playwright-g7-user';
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

async function main() {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  const issuedAt = Date.now();
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  const token = await new SignJWT({
    openId: OPEN_ID,
    appId: APP_ID,
    name: 'Playwright G7 Test User',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);

  const output = {
    token,
    cookieName: 'app_session_id',
    openId: OPEN_ID,
    appId: APP_ID,
    expiresAt: new Date(issuedAt + expiresInMs).toISOString(),
    generatedAt: new Date(issuedAt).toISOString(),
  };

  fs.writeFileSync('/tmp/atlas-test-session.json', JSON.stringify(output, null, 2));
  console.log('Session token generated:');
  console.log(`  Cookie: app_session_id=${token.substring(0, 30)}...`);
  console.log(`  Expires: ${output.expiresAt}`);
  console.log('  Written to: /tmp/atlas-test-session.json');
}

main().catch(console.error);
