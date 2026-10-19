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

const SPOKEN_PAIR_RE = /^(?:input:?\s*)?(.+?)\s+(?:gives|returns|yields|produces|outputs)\s+(?:the\s+)?(?:output:?\s*)?(.+?)\s*$/is;

/** "input [[1,3],[2,6]] gives output [[1,6]]. Input [[1,4],[4,5]] gives output [[1,5]]." into pairs. */
function parseSpoken(text: string): Example | null {
  if (!/\b(?:gives|returns|yields|produces|outputs)\b/i.test(text)) return null;
  // pairs are separated by "; " or by a sentence that starts with "Input"
  const parts = text.trim().split(/\s*;\s*|(?<=[.\])])\s+(?=input\b)/i).filter((x) => x.trim());
  const pairs: { pair: ExamplePair; note: string | null }[] = [];
  for (const part of parts) {
    const m = SPOKEN_PAIR_RE.exec(part.replace(/[\s.]+$/, ""));
    if (!m) return null;
    let output = m[2]!.trim();
    let note: string | null = null;
    const n = /^(.*?)\s*\(([^()]*)\)$/s.exec(output);
    if (n && n[1]!.trim()) {
      output = n[1]!.trim();
      note = n[2]!.trim() || null;
    }
    pairs.push({ pair: { input: m[1]!.trim(), output }, note });
  }
  const [first, ...rest] = pairs;
  return first ? { main: first.pair, note: first.note, more: rest.map((r) => r.pair) } : null;
}

/**
 * "Input: [73,74] → Output: [1,0] (why). Another: [30,40] → [1,0]." and
 * "head = [1], n = 1 -> []. Second: head = [2] -> [3]." into pairs.
 * Returns null when the text does not follow that shape, so the caller can show it as written.
 */
export function parseExample(text: string): Example | null {
  const spoken = parseSpoken(text);
  if (spoken) return spoken;
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
  return text.replace(/^posted\s+/i, "").replace(/\b0 days? ago\b/i, "today").trim();
}

const SUP: Record<string, string> = { "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "-": "\u207b" };

/** "1 <= n <= 10^4" into "1 \u2264 n \u2264 10\u2074". */
export function prettyMath(text: string): string {
  return text
    .replace(/<=/g, "\u2264")
    .replace(/>=/g, "\u2265")
    .replace(/!=/g, "\u2260")
    .replace(/\^(-?\d+)/g, (_m, d: string) => [...d].map((c) => SUP[c] ?? c).join(""))
    .replace(/\s*\*\s*/g, " \u00d7 ");
}

/** "1 <= a.length <= 10^4; each interval has 2 numbers; 0 <= x <= 10^4." into one tidy line per rule. */
export function splitConstraints(text: string | undefined): string[] {
  return (text ?? "")
    .split(/\s*;\s*|\.\s+(?=[A-Z0-9-])/)
    .map((c) => prettyMath(c.replace(/[\s.]+$/, "").trim()))
    .filter(Boolean);
}

/** "picked by date hash 36 of 39; topic intervals" into its parts, or null for other wording. */
export function parseWhyToday(text: string | undefined): { pick: number; of: number; topic: string | null } | null {
  const m = /hash\s+(\d+)\s+of\s+(\d+)\s*(?:[;,.]\s*topic\s+(.+?))?\s*\.?\s*$/i.exec((text ?? "").trim());
  return m ? { pick: Number(m[1]), of: Number(m[2]), topic: m[3]?.trim() || null } : null;
}

/** "Sorting (not verified)" into the plain text plus a flag, so the caveat can be shown once and quietly. */
export function stripUnverified(text: string): { text: string; unverified: boolean } {
  const m = /\s*\((?:not|un)\s*verified\)\s*\.?\s*$/i.exec(text);
  return m ? { text: text.slice(0, m.index).trim(), unverified: true } : { text, unverified: false };
}

/**
 * Requirement text into separate items: "a · b · c" first, else sentences. Notes about how the
 * text was fetched ("only a 300-character excerpt was fetched") are not requirements and are dropped.
 */
export function splitRequirements(text: string | undefined, max = 8): string[] {
  if (!text) return [];
  let parts = splitDots(text);
  if (parts.length < 2) parts = text.split(/(?<=[.;])\s+(?=[A-Z0-9(])|\s*;\s*/);
  return parts
    .map((p) => p.replace(/^[\s\u2022*-]+/, "").replace(/[\s.;]+$/, "").trim())
    .filter((p) => p.length > 2 && !/excerpt|fetched|truncated|not available|see the posting|apply link|full list|open the (?:posting|link)/i.test(p))
    .map((p) => (p.length > 140 ? `${p.slice(0, 137).trimEnd()}...` : p))
    .slice(0, max);
}
