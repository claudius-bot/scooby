import type { CronSchedule } from '../config/schema.js';

const DURATION_RE = /^(\d+)\s*(s|sec|m|min|h|hr|d|day)s?$/i;

const UNIT_SECONDS: Record<string, number> = {
  s: 1, sec: 1,
  m: 60, min: 60,
  h: 3600, hr: 3600,
  d: 86400, day: 86400,
};

/**
 * Parse a relative shorthand ("20m", "2h") or ISO timestamp into a concrete Date.
 * Returns null if unparseable.
 */
export function parseScheduleAt(input: string): Date | null {
  const trimmed = input.trim();

  // ISO 8601
  const iso = Date.parse(trimmed);
  if (!isNaN(iso)) {
    return new Date(iso);
  }

  // Relative shorthand: "20m", "2h", "30s", "1d"
  const match = trimmed.match(DURATION_RE);
  if (match) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const seconds = UNIT_SECONDS[unit];
    if (seconds) {
      return new Date(Date.now() + value * seconds * 1000);
    }
  }

  // "tomorrow at HH:MM" or "tomorrow at Ham/Hpm"
  const tomorrowMatch = trimmed.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (tomorrowMatch) {
    let hours = Number(tomorrowMatch[1]);
    const minutes = Number(tomorrowMatch[2] ?? '0');
    const ampm = tomorrowMatch[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  return null;
}

/**
 * Parse a freeform schedule string into a typed CronSchedule.
 *
 * Formats:
 *  - "in 20m" / "20m"                → { kind: 'at', at: isoTimestamp }
 *  - "every 5m"                      → { kind: 'every', interval: '5m' }
 *  - "daily 09:00" / "09:00"         → { kind: 'daily', time: '09:00' }
 *  - "0 9 * * *" (5-field cron)      → { kind: 'cron', expression: ... }
 *  - "at <ISO>" / "at <timestamp>"   → { kind: 'at', at: timestamp }
 *  - "tomorrow at 9am"               → { kind: 'at', at: computedIso }
 */
export function parseScheduleString(input: string): CronSchedule {
  const trimmed = input.trim();

  // "every <interval>"
  const everyMatch = trimmed.match(/^every\s+(.+)$/i);
  if (everyMatch) {
    const intervalStr = everyMatch[1].trim();
    if (!DURATION_RE.test(intervalStr)) {
      throw new Error(`Invalid interval format: "${intervalStr}". Use e.g. "5m", "1h", "30s".`);
    }
    return { kind: 'every', interval: intervalStr };
  }

  // "daily HH:MM" or bare "HH:MM"
  const dailyMatch = trimmed.match(/^(?:daily\s+)?(\d{1,2}:\d{2})$/i);
  if (dailyMatch) {
    return { kind: 'daily', time: dailyMatch[1] };
  }

  // 5-field cron expression (e.g. "0 9 * * *")
  const cronFields = trimmed.split(/\s+/);
  if (cronFields.length === 5 && /^[\d*,/\-]+$/.test(cronFields[0])) {
    return { kind: 'cron', expression: trimmed };
  }

  // "at <something>" or "in <something>"
  const atMatch = trimmed.match(/^(?:at|in)\s+(.+)$/i);
  if (atMatch) {
    const target = atMatch[1].trim();
    const date = parseScheduleAt(target);
    if (date) {
      return { kind: 'at', at: date.toISOString() };
    }
    throw new Error(`Cannot parse schedule target: "${target}"`);
  }

  // "tomorrow at ..."
  if (/^tomorrow\s+at\s+/i.test(trimmed)) {
    const date = parseScheduleAt(trimmed);
    if (date) {
      return { kind: 'at', at: date.toISOString() };
    }
  }

  // Bare duration like "20m" → treat as one-shot
  if (DURATION_RE.test(trimmed)) {
    const date = parseScheduleAt(trimmed);
    if (date) {
      return { kind: 'at', at: date.toISOString() };
    }
  }

  throw new Error(`Cannot parse schedule: "${trimmed}". Use "in 20m", "every 5m", "daily 09:00", "0 9 * * *", or an ISO timestamp.`);
}
