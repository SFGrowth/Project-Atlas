import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";

// ---------------------------------------------------------------------------
// Trusted-proxy bypass: requests forwarded by nginx include the custom header
// X-Atlas-Trusted-Proxy: true. When present AND the socket originates from
// localhost (127.0.0.1 / ::1), the request is auto-authenticated as the
// staging admin user without requiring OAuth.
//
// This allows direct access to the dashboard at http://35.231.100.83 without
// the Manus OAuth portal. The test suite makes direct localhost requests
// WITHOUT going through nginx, so they do NOT carry this header and are NOT
// affected by this bypass.
// ---------------------------------------------------------------------------
const TRUSTED_SOCKET_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const BYPASS_OPEN_ID = "atlas-staging-owner";

function isTrustedProxyRequest(req: CreateExpressContextOptions["req"]): boolean {
  const header = req.headers["x-atlas-trusted-proxy"];
  if (header !== "true") return false;
  const socketIp = req.socket?.remoteAddress ?? "";
  return TRUSTED_SOCKET_IPS.has(socketIp);
}

async function getTrustedUser(): Promise<User | null> {
  try {
    const user = await db.getUserByOpenId(BYPASS_OPEN_ID);
    return user ?? null;
  } catch {
    return null;
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Check for trusted nginx proxy bypass first
  if (isTrustedProxyRequest(opts.req)) {
    user = await getTrustedUser();
  }

  // Fall back to normal OAuth session validation
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
