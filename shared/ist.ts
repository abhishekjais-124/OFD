/**
 * Every date decision in OFD goes through this module so "today" always means
 * today in Asia/Kolkata (IST, UTC+05:30, no daylight saving), regardless of the
 * timezone of the machine or browser that runs the app.
 */

export const IST_ZONE = "Asia/Kolkata";
export const IST_OFFSET_MINUTES = 330;

/** ISO calendar date, e.g. "2026-10-19". */
export type IsoDate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parts of an instant expressed in IST. */
export interface IstParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

export function istParts(instant: Date): IstParts {
  // Shift the instant by the fixed IST offset and read UTC fields; IST has no DST.
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Calendar date of an instant in IST, as "YYYY-MM-DD". */
export function toIsoDateIST(instant: Date): IsoDate {
  const p = istParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today's calendar date in IST. `now` is injectable for tests. */
export function todayIST(now: Date = new Date()): IsoDate {
  return toIsoDateIST(now);
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() + 1 === Number(mo) && date.getUTCDate() === Number(d);
}

/** Instant at which the given IST calendar date starts (00:00:00 IST). */
export function startOfDayIST(date: IsoDate): Date {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new Error(`invalid ISO date: ${date}`);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)) - IST_OFFSET_MINUTES * 60_000);
}

/** Instant at which the given IST calendar date ends (23:59:59.999 IST). */
export function endOfDayIST(date: IsoDate): Date {
  return new Date(startOfDayIST(date).getTime() + 24 * 60 * 60_000 - 1);
}

/** Adds (or subtracts) whole calendar days to an IST date. */
export function addDaysIST(date: IsoDate, days: number): IsoDate {
  const start = startOfDayIST(date);
  return toIsoDateIST(new Date(start.getTime() + days * 24 * 60 * 60_000 + 12 * 60 * 60_000));
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INDEX: Record<string, number> = {};
MONTHS.forEach((m, i) => {
  MONTH_INDEX[m.toLowerCase()] = i;
});
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
LONG_MONTHS.forEach((m, i) => {
  MONTH_INDEX[m.toLowerCase()] = i;
});
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Monday, 19 October 2026" style label for an IST date. */
export function formatLongDateIST(date: IsoDate): string {
  const start = startOfDayIST(date);
  const p = istParts(new Date(start.getTime() + 12 * 60 * 60_000));
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${p.day} ${LONG_MONTHS[p.month - 1]} ${p.year}`;
}

/** "19 Oct 2026" style label. */
export function formatShortDateIST(date: IsoDate): string {
  const p = istParts(new Date(startOfDayIST(date).getTime() + 12 * 60 * 60_000));
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "19 Oct 2026, 3:46 PM IST" style label for an instant. */
export function formatDateTimeIST(instant: Date): string {
  const p = istParts(instant);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour < 12 ? "AM" : "PM";
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${h12}:${pad(p.minute)} ${ampm} IST`;
}

/**
 * Parses a human date such as "21 Oct 2026", "21 October 2026, EOD",
 * "21 OCT 2026, EOD" or "2026-10-21". Returns null when nothing matches.
 */
export function parseHumanDate(text: string): IsoDate | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso && isIsoDate(iso[0])) return iso[0];
  const m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(text);
  if (!m) return null;
  const month = MONTH_INDEX[m[2]!.toLowerCase()];
  if (month === undefined) return null;
  const candidate = `${m[3]}-${pad(month + 1)}-${pad(Number(m[1]))}`;
  return isIsoDate(candidate) ? candidate : null;
}

export interface Countdown {
  /** Whole days from today (IST) to the deadline date; negative when past. */
  days: number;
  /** Milliseconds until end of the deadline day in IST; negative when past. */
  msRemaining: number;
  state: "overdue" | "today" | "tomorrow" | "upcoming";
  label: string;
}

/** Countdown from `now` to the end of an IST deadline date. */
export function countdownIST(deadline: IsoDate, now: Date = new Date()): Countdown {
  const today = todayIST(now);
  const days = Math.round((startOfDayIST(deadline).getTime() - startOfDayIST(today).getTime()) / 86_400_000);
  const msRemaining = endOfDayIST(deadline).getTime() - now.getTime();
  if (days < 0) {
    const n = -days;
    return { days, msRemaining, state: "overdue", label: n === 1 ? "1 day overdue" : `${n} days overdue` };
  }
  if (days === 0) return { days, msRemaining, state: "today", label: "due today" };
  if (days === 1) return { days, msRemaining, state: "tomorrow", label: "due tomorrow" };
  return { days, msRemaining, state: "upcoming", label: `${days} days left` };
}
