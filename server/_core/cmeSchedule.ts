/**
 * Atlas Nexus — CME Globex 24/5 Market-Aware Schedule Utility
 *
 * MNQ (Micro E-mini Nasdaq) trades on CME Globex under the following schedule:
 *
 *   OPEN:  Sunday 18:00 ET (23:00 UTC standard / 22:00 UTC DST)
 *   CLOSE: Friday 17:00 ET (22:00 UTC standard / 21:00 UTC DST)
 *
 *   DAILY MAINTENANCE WINDOW: 17:00–18:00 ET (Mon–Thu)
 *     Standard time: 22:00–23:00 UTC
 *     DST (Mar–Nov):  21:00–22:00 UTC
 *
 * DST Rules (US Eastern):
 *   DST begins: Second Sunday in March at 02:00 ET → clocks spring forward
 *   DST ends:   First Sunday in November at 02:00 ET → clocks fall back
 *
 * All functions accept a UTC Date object and return boolean or string.
 * No external dependencies — pure date arithmetic only.
 */

// ─── DST Detection ───────────────────────────────────────────────────────────

/**
 * Returns the UTC timestamp (ms) of the second Sunday in March for a given year.
 * This is when US DST begins (clocks spring forward at 02:00 ET = 07:00 UTC).
 */
function dstStartUtcMs(year: number): number {
  // Find first Sunday in March
  const mar1 = new Date(Date.UTC(year, 2, 1)); // March 1
  const dayOfWeek = mar1.getUTCDay(); // 0=Sun
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const secondSunday = firstSunday + 7;
  // DST begins at 02:00 ET = 07:00 UTC (ET is UTC-5 in standard time)
  return Date.UTC(year, 2, secondSunday, 7, 0, 0);
}

/**
 * Returns the UTC timestamp (ms) of the first Sunday in November for a given year.
 * This is when US DST ends (clocks fall back at 02:00 ET = 06:00 UTC).
 */
function dstEndUtcMs(year: number): number {
  const nov1 = new Date(Date.UTC(year, 10, 1)); // November 1
  const dayOfWeek = nov1.getUTCDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  // DST ends at 02:00 ET = 06:00 UTC (ET is UTC-4 in DST)
  return Date.UTC(year, 10, firstSunday, 6, 0, 0);
}

/**
 * Returns true if the given UTC Date falls within US Eastern Daylight Time.
 */
export function isEasternDST(utcDate: Date): boolean {
  const ms = utcDate.getTime();
  const year = utcDate.getUTCFullYear();
  return ms >= dstStartUtcMs(year) && ms < dstEndUtcMs(year);
}

/**
 * Returns the ET offset from UTC in hours (negative).
 * -4 during DST (EDT), -5 during standard time (EST).
 */
export function etOffsetHours(utcDate: Date): -4 | -5 {
  return isEasternDST(utcDate) ? -4 : -5;
}

/**
 * Convert a UTC Date to ET hours and minutes.
 */
export function toEasternTime(utcDate: Date): { hour: number; minute: number; dow: number } {
  const offset = etOffsetHours(utcDate);
  const etMs = utcDate.getTime() + offset * 3_600_000;
  const etDate = new Date(etMs);
  return {
    hour: etDate.getUTCHours(),
    minute: etDate.getUTCMinutes(),
    dow: etDate.getUTCDay(), // 0=Sun, 1=Mon, ..., 6=Sat
  };
}

// ─── CME Session State ────────────────────────────────────────────────────────

export type CmeSessionState =
  | "OPEN"                  // CME Globex is trading
  | "MAINTENANCE"           // Daily 17:00–18:00 ET maintenance window
  | "WEEKEND_CLOSED"        // Friday 17:00 ET → Sunday 18:00 ET
  | "HOLIDAY_CLOSED";       // Exchange holiday (not yet implemented — returns OPEN)

export interface CmeSessionInfo {
  state: CmeSessionState;
  isDST: boolean;
  etOffsetHours: number;
  etTimeString: string;   // "HH:MM ET"
  utcTimeString: string;  // "HH:MM UTC"
  nextOpenUtc?: string;   // ISO string of next session open (when CLOSED)
  maintenanceWindowUtc?: string; // "HH:MM–HH:MM UTC" (when MAINTENANCE)
}

/**
 * Returns the current CME Globex session state for MNQ.
 */
export function getCmeSessionState(utcDate: Date = new Date()): CmeSessionInfo {
  const dst = isEasternDST(utcDate);
  const offset = dst ? -4 : -5;
  const { hour, minute, dow } = toEasternTime(utcDate);
  const etMinutes = hour * 60 + minute;

  // Maintenance window: 17:00–18:00 ET, Mon–Thu only
  const MAINTENANCE_START = 17 * 60; // 17:00 ET
  const MAINTENANCE_END = 18 * 60;   // 18:00 ET
  const SESSION_OPEN = 18 * 60;      // 18:00 ET (Sun open / daily reopen)
  const SESSION_CLOSE = 17 * 60;     // 17:00 ET (Fri close / daily close)

  const etTimeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ET`;
  const utcH = utcDate.getUTCHours();
  const utcM = utcDate.getUTCMinutes();
  const utcTimeStr = `${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")} UTC`;
  const maintWindowUtc = dst
    ? "21:00–22:00 UTC"
    : "22:00–23:00 UTC";

  // Saturday: always closed
  if (dow === 6) {
    return {
      state: "WEEKEND_CLOSED",
      isDST: dst,
      etOffsetHours: offset,
      etTimeString: etTimeStr,
      utcTimeString: utcTimeStr,
      nextOpenUtc: nextSundayOpenUtc(utcDate, dst),
    };
  }

  // Sunday: closed before 18:00 ET, open at/after 18:00 ET
  if (dow === 0) {
    if (etMinutes < SESSION_OPEN) {
      return {
        state: "WEEKEND_CLOSED",
        isDST: dst,
        etOffsetHours: offset,
        etTimeString: etTimeStr,
        utcTimeString: utcTimeStr,
        nextOpenUtc: sundayOpenUtc(utcDate, dst),
      };
    }
    return {
      state: "OPEN",
      isDST: dst,
      etOffsetHours: offset,
      etTimeString: etTimeStr,
      utcTimeString: utcTimeStr,
    };
  }

  // Friday: closed at/after 17:00 ET
  if (dow === 5 && etMinutes >= SESSION_CLOSE) {
    return {
      state: "WEEKEND_CLOSED",
      isDST: dst,
      etOffsetHours: offset,
      etTimeString: etTimeStr,
      utcTimeString: utcTimeStr,
      nextOpenUtc: nextSundayOpenUtc(utcDate, dst),
    };
  }

  // Mon–Thu (and Fri before 17:00): check maintenance window
  if (etMinutes >= MAINTENANCE_START && etMinutes < MAINTENANCE_END) {
    return {
      state: "MAINTENANCE",
      isDST: dst,
      etOffsetHours: offset,
      etTimeString: etTimeStr,
      utcTimeString: utcTimeStr,
      maintenanceWindowUtc: maintWindowUtc,
    };
  }

  // All other times: OPEN
  return {
    state: "OPEN",
    isDST: dst,
    etOffsetHours: offset,
    etTimeString: etTimeStr,
    utcTimeString: utcTimeStr,
  };
}

/**
 * Returns true if CME Globex is currently open for trading (not in maintenance or weekend).
 */
export function isCmeOpen(utcDate: Date = new Date()): boolean {
  return getCmeSessionState(utcDate).state === "OPEN";
}

/**
 * Returns true if DARWIN should run its hourly analysis at this time.
 * DARWIN runs during all CME open hours (not maintenance, not weekend).
 */
export function isDarwinHourlyActive(utcDate: Date = new Date()): boolean {
  return isCmeOpen(utcDate);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sundayOpenUtc(utcDate: Date, dst: boolean): string {
  const offset = dst ? -4 : -5;
  // Sunday 18:00 ET = Sunday 22:00 UTC (standard) or 22:00 UTC (DST)
  const openHourUtc = 18 - offset; // 18 - (-5) = 23 standard, 18 - (-4) = 22 DST
  const d = new Date(utcDate);
  d.setUTCHours(openHourUtc, 0, 0, 0);
  return d.toISOString();
}

function nextSundayOpenUtc(utcDate: Date, dst: boolean): string {
  const d = new Date(utcDate);
  // Advance to next Sunday
  const daysUntilSunday = (7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSunday);
  return sundayOpenUtc(d, dst);
}

/**
 * Returns a human-readable description of the current CME session state.
 */
export function describeCmeSession(utcDate: Date = new Date()): string {
  const info = getCmeSessionState(utcDate);
  const dstLabel = info.isDST ? "EDT (UTC-4)" : "EST (UTC-5)";
  switch (info.state) {
    case "OPEN":
      return `CME Globex OPEN — ${info.etTimeString} / ${info.utcTimeString} / ${dstLabel}`;
    case "MAINTENANCE":
      return `CME Globex MAINTENANCE — ${info.etTimeString} / ${info.utcTimeString} / ${dstLabel} — window: ${info.maintenanceWindowUtc}`;
    case "WEEKEND_CLOSED":
      return `CME Globex CLOSED (weekend) — next open: ${info.nextOpenUtc}`;
    case "HOLIDAY_CLOSED":
      return `CME Globex CLOSED (holiday) — next open: ${info.nextOpenUtc}`;
  }
}
