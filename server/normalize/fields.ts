/** Helpers that read "Label: value" fields, numbered steps and timestamps out of card text. */
import type { Field } from "../../shared/schema.ts";
import type { LayoutLine } from "./layout.ts";

// A label starts with a capital, is short, and does not end in a digit (so "Thu, 15 Jan 2026 07:46" is not one).
const LABEL_RE = /^([A-Z][A-Za-z0-9 /()'’;,-]{0,58}[A-Za-z)]):\s*(.*)$/;
const SPLIT_RE = /\s+·\s+(?=[A-Z][A-Za-z0-9 /()'’;,-]{0,58}[A-Za-z)]:(?:\s|$))/;

export interface ParsedFields {
  /** Lines before the first label (titles, free text). */
  preamble: string[];
  fields: Field[];
}

/** Splits lines into "Label: value" fields; a segment without a label continues the previous value. */
export function parseFields(lines: string[]): ParsedFields {
  const preamble: string[] = [];
  const fields: Field[] = [];
  let current: Field | null = null;
  for (const line of lines) {
    for (const segment of line.split(SPLIT_RE)) {
      const seg = segment.trim();
      if (!seg) continue;
      const m = LABEL_RE.exec(seg);
      if (m && !/^https?$/i.test(m[1]!)) {
        current = { label: m[1]!.trim(), text: m[2]!.trim() };
        fields.push(current);
      } else if (current) {
        current.text = current.text ? `${current.text} ${seg}` : seg;
      } else {
        preamble.push(seg);
      }
    }
  }
  return { preamble, fields };
}

export function field(fields: Field[], ...labels: string[]): string | undefined {
  const wanted = labels.map((l) => l.toLowerCase());
  return fields.find((f) => wanted.some((w) => f.label.toLowerCase().startsWith(w)))?.text;
}

/** Numbered steps ("1. ...") with their wrapped continuation lines (indented further than the number). */
export function parseSteps(lines: LayoutLine[]): string[] {
  const steps: string[] = [];
  let stepX: number | null = null;
  for (const l of lines) {
    const m = /^(\d{1,2})[.)]\s+(.*)$/.exec(l.text);
    if (m) {
      steps.push(m[2]!);
      stepX = l.bbox.x;
    } else if (stepX !== null && steps.length && l.bbox.x > stepX + 3) {
      steps[steps.length - 1] += ` ${l.text}`;
    } else {
      stepX = null;
    }
  }
  return steps;
}

/** "Mon, 19 Oct 2026 07:46:54 UTC · BBC News" → timestamp text, ISO instant and source. */
export function parseTimestampLine(text: string): { timestampText: string; timestamp: string | null; source?: string } | null {
  const m = /^([A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s*(?:UTC|GMT|IST|[+-]\d{4})?)(?:\s*·\s*(.+))?$/.exec(text.trim());
  if (!m) return null;
  const parsed = Date.parse(m[1]!.replace(/\s+IST$/, " +0530"));
  return { timestampText: m[1]!, timestamp: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(), source: m[2]?.trim() };
}

export function splitList(text: string | undefined): string[] {
  if (!text) return [];
  return text.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
