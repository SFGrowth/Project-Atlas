/**
 * notificationRetryService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bounded delivery protection for the Atlas Nexus notification system.
 *
 * Implements:
 *   - Exponential backoff with jitter (base 30s, max 1h)
 *   - Per-type maximum retry counts (CRITICAL=5, NORMAL=3, LOW=2)
 *   - Deduplication via dedupe_key
 *   - Priority queue (1=CRITICAL, 3=NORMAL, 5=LOW)
 *   - Aggregation of low-priority notifications (priority >= 5)
 *   - Critical alerts (priority=1) are NEVER silently dropped
 *   - Permanent failure marking when max_retries exceeded
 *
 * Sprint: darwin-core-observation-to-finding-chain
 * Added: 2026-07-31
 */

import mysql from 'mysql2/promise';
import { sendTelegramMessage } from './telegramNotifier.js';

// ─── DB pool (local to this module) ──────────────────────────────────────────
let _retryPool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_retryPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const u = new URL(url);
    _retryPool = mysql.createPool({
      host: u.hostname,
      user: u.username,
      password: decodeURIComponent(u.password),
      database: u.pathname.slice(1),
      port: parseInt(u.port || '3306', 10),
      waitForConnections: true,
      connectionLimit: 2,
    });
  }
  return _retryPool;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base backoff interval in milliseconds */
const BACKOFF_BASE_MS = 30_000; // 30 seconds

/** Maximum backoff interval in milliseconds */
const BACKOFF_MAX_MS = 3_600_000; // 1 hour

/** Jitter factor (0–1): adds randomness to prevent thundering herd */
const JITTER_FACTOR = 0.25;

/** Priority levels */
export const PRIORITY = {
  CRITICAL: 1,
  NORMAL: 3,
  LOW: 5,
} as const;

/** Max retries per priority level */
const MAX_RETRIES_BY_PRIORITY: Record<number, number> = {
  1: 5, // CRITICAL
  3: 3, // NORMAL
  5: 2, // LOW
};

/** Types that are always CRITICAL priority */
const CRITICAL_TYPES = new Set([
  'DARWIN_FINDING',
  'CIRCUIT_BREAKER',
  'SYSTEM_OFFLINE',
  'WEBHOOK_FAILURE',
]);

// ─── Backoff Calculator ───────────────────────────────────────────────────────

/**
 * Compute the next retry timestamp using exponential backoff with jitter.
 * Formula: base × 2^attempt × (1 + jitter × random)
 */
export function computeNextRetryMs(attempt: number): number {
  const exponential = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, BACKOFF_MAX_MS);
  const jitter = capped * JITTER_FACTOR * Math.random();
  return Math.round(capped + jitter);
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Generate a deduplication key for a notification.
 * Prevents the same finding from being delivered twice.
 */
export function buildDedupeKey(type: string, metadata: Record<string, unknown>): string {
  if (type === 'DARWIN_FINDING' && metadata.finding_id) {
    return `DARWIN_FINDING:${metadata.finding_id}`;
  }
  if (type === 'CIRCUIT_BREAKER') {
    return `CIRCUIT_BREAKER:${new Date().toISOString().slice(0, 10)}`;
  }
  return `${type}:${Date.now()}`;
}

// ─── Retry Worker ─────────────────────────────────────────────────────────────

/**
 * Process the retry queue: attempt delivery for all due undelivered notifications.
 * Processes CRITICAL (priority=1) first, then NORMAL, then LOW.
 * Aggregates LOW priority notifications into a single digest.
 * Never drops CRITICAL notifications without exhausting all retries.
 */
export async function processRetryQueue(): Promise<{
  attempted: number;
  delivered: number;
  permanentlyFailed: number;
  aggregated: number;
}> {
  const pool = getPool();
  const now = new Date();

  // Fetch due notifications ordered by priority (lowest number = highest priority)
  type RDP = import('mysql2').RowDataPacket;
  const [rows] = await pool.execute<RDP[]>(`
    SELECT id, type, title, body, metadata, retry_count, max_retries, priority, dedupe_key
    FROM notification_log
    WHERE delivered = 0
      AND permanently_failed = 0
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY priority ASC, id ASC
    LIMIT 50
  `, [now]);

  let attempted = 0;
  let delivered = 0;
  let permanentlyFailed = 0;
  let aggregated = 0;

  // Separate low-priority for aggregation
  const criticalAndNormal = rows.filter((r: RDP) => (r.priority as number) < 5);
  const lowPriority = rows.filter((r: RDP) => (r.priority as number) >= 5);

  // Process CRITICAL and NORMAL individually
  for (const row of criticalAndNormal) {
    attempted++;
    const result = await attemptDelivery(pool, row);
    if (result === 'DELIVERED') delivered++;
    else if (result === 'PERMANENT_FAIL') permanentlyFailed++;
  }

  // Aggregate LOW priority notifications into a single digest
  if (lowPriority.length > 0) {
    const digest = buildDigest(lowPriority);
    const tgResult = await sendTelegramMessage(digest);
    if (tgResult.sent) {
      // Mark all as delivered
      const ids = lowPriority.map((r: RDP) => r.id as number);
      await pool.execute(`
        UPDATE notification_log 
        SET delivered = 1, telegram_message_id = ?, retry_count = retry_count + 1
        WHERE id IN (${ids.map(() => '?').join(',')})
      `, [tgResult.messageId, ...ids]);
      delivered += lowPriority.length;
      aggregated = lowPriority.length;
    } else {
      // Schedule retry for each
      for (const row of lowPriority) {
        attempted++;
        const result = await attemptDelivery(pool, row);
        if (result === 'DELIVERED') delivered++;
        else if (result === 'PERMANENT_FAIL') permanentlyFailed++;
      }
    }
  }

  return { attempted, delivered, permanentlyFailed, aggregated };
}

/**
 * Attempt delivery of a single notification.
 * Returns 'DELIVERED', 'RETRY_SCHEDULED', or 'PERMANENT_FAIL'.
 */
async function attemptDelivery(
  pool: mysql.Pool,
  row: Record<string, unknown>
): Promise<'DELIVERED' | 'RETRY_SCHEDULED' | 'PERMANENT_FAIL'> {
  const id = row.id as number;
  const retryCount = (row.retry_count as number) + 1;
  const maxRetries = row.max_retries as number;

  const tgResult = await sendTelegramMessage(row.body as string);

  if (tgResult.sent) {
    await pool.execute(`
      UPDATE notification_log 
      SET delivered = 1, telegram_message_id = ?, retry_count = ?, failure_reason = NULL
      WHERE id = ?
    `, [tgResult.messageId, retryCount, id]);
    return 'DELIVERED';
  }

  // Delivery failed
  const failureReason = tgResult.error ?? 'unknown';

  if (retryCount >= maxRetries) {
    // Permanent failure — but CRITICAL notifications get an escalation alert
    await pool.execute(`
      UPDATE notification_log 
      SET retry_count = ?, permanently_failed = 1, failure_reason = ?
      WHERE id = ?
    `, [retryCount, failureReason.slice(0, 255), id]);

    if ((row.priority as number) === PRIORITY.CRITICAL) {
      // Escalate: send a meta-alert about the permanently failed critical notification
      await sendTelegramMessage(
        `🚨 ATLAS NEXUS — CRITICAL NOTIFICATION PERMANENTLY UNDELIVERED\n\n` +
        `Type: ${row.type}\nTitle: ${row.title}\nAttempts: ${retryCount}\n` +
        `Failure: ${failureReason}\n\nOriginal message archived in notification_log.id=${id}`
      ).catch(() => {}); // best-effort escalation
    }
    return 'PERMANENT_FAIL';
  }

  // Schedule next retry with exponential backoff
  const nextRetryMs = computeNextRetryMs(retryCount);
  const nextRetryAt = new Date(Date.now() + nextRetryMs);
  await pool.execute(`
    UPDATE notification_log 
    SET retry_count = ?, next_retry_at = ?, failure_reason = ?
    WHERE id = ?
  `, [retryCount, nextRetryAt, failureReason.slice(0, 255), id]);

  return 'RETRY_SCHEDULED';
}

/**
 * Build a digest message from multiple low-priority notifications.
 */
function buildDigest(rows: Record<string, unknown>[]): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [
    `📋 <b>Atlas Nexus — Notification Digest</b>`,
    `<i>${rows.length} pending notifications — ${timestamp}</i>`,
    ``,
  ];
  for (const row of rows.slice(0, 10)) {
    lines.push(`• <b>${row.type}</b>: ${(row.title as string).slice(0, 80)}`);
  }
  if (rows.length > 10) {
    lines.push(`• … and ${rows.length - 10} more`);
  }
  return lines.join('\n');
}

// ─── Retry Scheduler ─────────────────────────────────────────────────────────

let retryIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background retry scheduler.
 * Runs every 5 minutes to process the retry queue.
 * Safe to call multiple times — only one interval will run.
 */
export function startNotificationRetryScheduler(): void {
  if (retryIntervalHandle) return;
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  retryIntervalHandle = setInterval(async () => {
    try {
      const result = await processRetryQueue();
      if (result.attempted > 0) {
        console.log(
          `[NotificationRetry] Processed: attempted=${result.attempted} ` +
          `delivered=${result.delivered} permanentlyFailed=${result.permanentlyFailed} ` +
          `aggregated=${result.aggregated}`
        );
      }
    } catch (err) {
      console.error('[NotificationRetry] Retry queue processing failed:', err);
    }
  }, INTERVAL_MS);
  console.log('[NotificationRetry] Retry scheduler started (5-min interval)');
}

/**
 * Stop the background retry scheduler.
 */
export function stopNotificationRetryScheduler(): void {
  if (retryIntervalHandle) {
    clearInterval(retryIntervalHandle);
    retryIntervalHandle = null;
    console.log('[NotificationRetry] Retry scheduler stopped');
  }
}

// ─── Fix: mark delivered correctly in J4 ─────────────────────────────────────

/**
 * Correct delivery marking: only set delivered=1 when Telegram actually confirms.
 * Also sets failure_reason and schedules retry when delivery fails.
 *
 * This replaces the unconditional `delivered=1` in sendFindingNotification.
 */
export async function markNotificationDelivery(
  notificationId: number,
  tgResult: { sent: boolean; messageId?: number; error?: string },
  priority: number = PRIORITY.CRITICAL
): Promise<void> {
  const pool = getPool();
  const maxRetries = MAX_RETRIES_BY_PRIORITY[priority] ?? 3;

  if (tgResult.sent && tgResult.messageId) {
    await pool.execute(`
      UPDATE notification_log 
      SET delivered = 1, telegram_message_id = ?, retry_count = 1
      WHERE id = ?
    `, [tgResult.messageId, notificationId]);
  } else {
    // Schedule first retry in 30 seconds
    const nextRetryAt = new Date(Date.now() + BACKOFF_BASE_MS);
    await pool.execute(`
      UPDATE notification_log 
      SET retry_count = 1, next_retry_at = ?, failure_reason = ?, max_retries = ?
      WHERE id = ?
    `, [nextRetryAt, (tgResult.error ?? 'delivery_failed').slice(0, 255), maxRetries, notificationId]);
  }
}
