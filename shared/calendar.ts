/** Reads the calendar card text: "Checked: ... Meetings: ... On call: ... RSVP needed: ... Calendar: <url>". */

export interface CalendarStatus {
  /** What was checked (the long sentence), if present. */
  checked: string | null;
  /** Null means "none" for each of the three statuses; otherwise the text found. */
  meetings: string | null;
  onCall: string | null;
  rsvp: string | null;
  /** Interviews, when the briefing has an "Interviews:" line; null means none. */
  interviews: string | null;
  /** False when the briefing has no Interviews line at all, so "none" must not be claimed. */
  interviewsReported: boolean;
  /** True when at least one of the three labels was found. */
  recognized: boolean;
}

const LABELS = ["Checked", "Meetings", "Interviews", "On call", "RSVP needed", "Calendar"] as const;
const NONE_RE = /^(none|no|nil|n\/a|nothing|-)$/i;

function clean(value: string): string | null {
  const v = value.trim().replace(/[.;,\s]+$/, "").trim();
  return !v || NONE_RE.test(v) || /^none\b/i.test(v) ? null : v;
}

export function parseCalendarStatus(lines: string[]): CalendarStatus {
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  const hits = LABELS.flatMap((label) => {
    const re = new RegExp(`(?:^|[\\s.;·])${label}:\\s`, "gi");
    const out: { label: (typeof LABELS)[number]; start: number; valueStart: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ label, start: m.index, valueStart: m.index + m[0].length });
    return out;
  }).sort((a, b) => a.start - b.start);

  const values = new Map<string, string>();
  hits.forEach((h, i) => {
    if (!values.has(h.label)) values.set(h.label, text.slice(h.valueStart, hits[i + 1]?.start ?? text.length));
  });
  const get = (label: string) => (values.has(label) ? clean(values.get(label)!) : null);
  return {
    checked: values.has("Checked") ? values.get("Checked")!.trim().replace(/\s+$/, "") : null,
    meetings: get("Meetings"),
    onCall: get("On call"),
    rsvp: get("RSVP needed"),
    interviews: get("Interviews"),
    interviewsReported: values.has("Interviews"),
    recognized: ["Meetings", "On call", "RSVP needed"].some((l) => values.has(l)),
  };
}

export interface AgendaEntry {
  /** "10:30" or "10:30-11:00" when the text starts with a time. */
  time: string | null;
  title: string;
}

/** "10:30-11:00 Standup (6 people); 15:00 Design review" into one entry per meeting, times first. */
export function agendaEntries(value: string | null): AgendaEntry[] {
  if (!value) return [];
  return value
    .split(/\s*;\s*|\s+\|\s+|,\s+(?=\d{1,2}[:.]\d{2})/)
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .map((part) => {
      const m = /^(\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?(?:\s*[-\u2013to]+\s*\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?)?)(?:\s*IST)?\s*[-\u2013:\u00b7,]?\s*(.*)$/i.exec(part);
      return m && m[2] ? { time: m[1]!.replace(/\s+/g, "").replace(/to/i, "\u2013").replace("-", "\u2013"), title: m[2] } : { time: null, title: part };
    });
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface OnCallWindow {
  /** Start and end as IST dates "YYYY-MM-DD" when the text names them. */
  start: string | null;
  end: string | null;
  /** "active" between start and end (inclusive), "upcoming" before it, "unknown" when no dates were found. */
  state: "active" | "upcoming" | "ended" | "unknown";
  /** Whole days from today to the end (active) or to the start (upcoming). */
  days: number | null;
}

/** "shift started Wed 28 Oct 12:00 IST and runs to 11 Nov 12:00 IST" against today's IST date. */
export function onCallWindow(text: string | null, today: string): OnCallWindow | null {
  if (!text) return null;
  const year = Number(today.slice(0, 4));
  const dates = [...text.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi)].map((m) => {
    const month = MONTHS.indexOf(m[2]!.toLowerCase().slice(0, 3));
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  });
  const start = dates[0] ?? null;
  const end = dates[1] ?? null;
  const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  if (!start) return { start: null, end: null, state: "unknown", days: null };
  if (today < start) return { start, end, state: "upcoming", days: dayDiff(today, start) };
  if (end && today > end) return { start, end, state: "ended", days: null };
  return { start, end, state: "active", days: end ? dayDiff(today, end) : null };
}
