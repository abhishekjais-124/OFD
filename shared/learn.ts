/** Helpers for the Learn page: reading the example and the qualification list out of plain text. */

export interface ExamplePair {
  input: string;
  output: string;
}

export interface Example {
  main: ExamplePair;
  /** Explanation in brackets after the first output, if any. */
  note: string | null;
  more: ExamplePair[];
}

const SEPARATOR_RE = /\.?\s*\b(?:Another|Also|Second|Third|Example\s*\d+)\s*:\s*/i;

/** One "input → output" pair, with or without "Input:" and "Output:" labels; a trailing "(note)" on the output is split off. */
function parsePair(part: string): { pair: ExamplePair; note: string | null } | null {
  const m = /^(.+?)\s*(?:→|->)\s*(.+?)\s*$/s.exec(part.trim());
  if (!m) return null;
  const input = m[1]!.replace(/^Input:\s*/i, "").trim();
  let output = m[2]!.replace(/^Output:\s*/i, "").replace(/[\s.]+$/, "").trim();
  let note: string | null = null;
  const n = /^(.*?)\s*\(([^()]*)\)$/s.exec(output);
  if (n && n[1]!.trim()) {
    output = n[1]!.trim();
    note = n[2]!.trim() || null;
  }
  return input && output ? { pair: { input, output }, note } : null;
}

/**
 * "Input: [73,74] → Output: [1,0] (why). Another: [30,40] → [1,0]." and
 * "head = [1], n = 1 -> []. Second: head = [2] -> [3]." into pairs.
 * Returns null when the text does not follow that shape, so the caller can show it as written.
 */
export function parseExample(text: string): Example | null {
  const [first, ...rest] = text.trim().split(SEPARATOR_RE);
  const main = first ? parsePair(first) : null;
  if (!main) return null;
  const more = rest.map((r) => parsePair(r)?.pair).filter((x): x is ExamplePair => Boolean(x));
  return { main: main.pair, note: main.note, more };
}

/** "A · B · C" into ["A", "B", "C"]. */
export function splitDots(text: string | undefined): string[] {
  return (text ?? "").split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
}

/** "posted about 3 days ago (around 16 Oct 2026)" into "3 days ago · 16 Oct 2026"; unknown shapes pass through. */
export function tidyPosted(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = /^posted\s+(?:about\s+)?(.+?)\s*\((?:around\s+)?([^)]+)\)\s*$/i.exec(text.trim());
  if (m) return `${m[1]} · ${m[2]}`;
  return text.replace(/^posted\s+/i, "").trim();
}
