/**
 * Atlas Nexus — Telegram Notification Channel
 *
 * Delivers DARWIN research alerts and system notifications to Phil via Telegram.
 *
 * Credentials are read from environment variables only:
 *   TELEGRAM_BOT_TOKEN  — bot token from BotFather (never logged, never committed)
 *   TELEGRAM_CHAT_ID    — Phil's personal chat ID  (never logged, never committed)
 *
 * Security guarantees:
 *   - Token and chat ID are never printed in logs, reports or artefacts
 *   - All log lines use only delivery status (SENT / FAILED / SKIPPED)
 *   - The module fails gracefully when credentials are absent
 *   - No outbound connection is made when credentials are not set
 */

export interface TelegramResult {
  sent: boolean;
  messageId?: number;
  error?: string;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;

function getCredentials(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (!token || !chatId) return null;
  return { token, chatId };
}

function truncateMessage(text: string): string {
  if (text.length <= MAX_MESSAGE_LENGTH) return text;
  const suffix = "\n\n…[truncated]";
  return text.slice(0, MAX_MESSAGE_LENGTH - suffix.length) + suffix;
}

/**
 * Send a plain-text message to Phil via Telegram.
 * Returns { sent: true, messageId } on success, { sent: false, error } on failure.
 * Never throws — callers can safely fire-and-forget.
 */
export async function sendTelegramMessage(
  text: string
): Promise<TelegramResult> {
  const creds = getCredentials();
  if (!creds) {
    console.warn("[Telegram] SKIPPED — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set");
    return { sent: false, error: "credentials_not_configured" };
  }

  const body = {
    chat_id: creds.chatId,
    text: truncateMessage(text),
    parse_mode: "HTML",
  };

  try {
    const url = `${TELEGRAM_API_BASE}/bot${creds.token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Telegram] FAILED — HTTP ${res.status}`);
      return { sent: false, error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as { ok: boolean; result?: { message_id?: number } };
    if (!data.ok) {
      console.error("[Telegram] FAILED — API returned ok:false");
      return { sent: false, error: "api_returned_not_ok" };
    }

    const messageId = data.result?.message_id;
    console.log(`[Telegram] SENT — message_id: ${messageId}`);
    return { sent: true, messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[Telegram] FAILED — ${error}`);
    return { sent: false, error };
  }
}

/**
 * Send a DARWIN research alert with standard formatting.
 */
export async function sendDarwinAlert(
  title: string,
  body: string,
  severity: "INFO" | "WARNING" | "CRITICAL" = "INFO"
): Promise<TelegramResult> {
  const icons: Record<string, string> = {
    INFO: "ℹ️",
    WARNING: "⚠️",
    CRITICAL: "🚨",
  };
  const icon = icons[severity] ?? "ℹ️";
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const message = `${icon} <b>DARWIN — ${title}</b>\n\n${body}\n\n<i>${timestamp}</i>`;
  return sendTelegramMessage(message);
}

/**
 * Send a heartbeat silence alert.
 */
export async function sendHeartbeatAlert(
  silenceMinutes: number,
  lastBarTime: string
): Promise<TelegramResult> {
  return sendDarwinAlert(
    "Webhook Silence Detected",
    `No candles received for <b>${silenceMinutes} minutes</b>.\nLast bar: ${lastBarTime}\n\nCheck TradingView M-16 alert immediately.`,
    "CRITICAL"
  );
}

/**
 * Send a DARWIN daily summary notification.
 */
export async function sendDailyReportAlert(
  reportDate: string,
  newObservations: number,
  candidateUpdates: number,
  githubUrl?: string
): Promise<TelegramResult> {
  const githubLine = githubUrl
    ? `\n📎 <a href="${githubUrl}">View report on GitHub</a>`
    : "";
  return sendDarwinAlert(
    `Daily Research Report — ${reportDate}`,
    `New observations: <b>${newObservations}</b>\nCandidate updates: <b>${candidateUpdates}</b>${githubLine}`,
    "INFO"
  );
}
