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
  return !v || NONE_RE.test(v) ? null : v;
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
