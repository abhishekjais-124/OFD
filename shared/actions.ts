/** Picks the steps of an action item that ask the reader to do something or carry a hard rule. */

const IMPERATIVE_RE = /^(get|send|submit|file|reply|respond|confirm|complete|approve|share|attach|upload|fill|raise|book|regularize|regularise|update|pay|call|email|forward|review|sign|register|apply|collect)\b/i;
const CLAUSE_RE = /[.,;]\s*(?:then\s+)?(regularize|regularise|submit|send|get|file|reply|confirm|complete|approve|apply|upload|pay)\b/i;
const RULE_RE = /\b(must|strictly|required|mandatory|deadline|no .{0,40}accepted|not accepted|last date|by \d{1,2}\s+[A-Za-z]{3,9})\b/i;
/** Steps where somebody else does the work. */
const THIRD_PARTY_RE = /^(hr|the team|finance|it|admin|support|they|we)\b.*\b(updates?|processes|reviews?|handles?|will)\b/i;

export interface Step {
  /** 1-based position in the original list. */
  n: number;
  text: string;
}

export function isKeyStep(text: string): boolean {
  const t = text.trim();
  if (THIRD_PARTY_RE.test(t)) return false;
  return IMPERATIVE_RE.test(t) || CLAUSE_RE.test(t) || RULE_RE.test(t);
}

/** Splits steps into the ones to act on and the rest, keeping the original numbers. */
export function splitSteps(steps: string[]): { key: Step[]; other: Step[] } {
  const all = steps.map((text, i) => ({ n: i + 1, text }));
  const key = all.filter((s) => isKeyStep(s.text));
  return { key, other: all.filter((s) => !key.includes(s)) };
}

const DEADLINE_RE = /\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b|\bEOD\b|\bdeadline\b|\btoday\b|\btomorrow\b/i;

/** How much a step matters: doing words and hard dates weigh most. */
function weight(text: string): number {
  let w = 0;
  if (IMPERATIVE_RE.test(text.trim())) w += 3;
  if (DEADLINE_RE.test(text)) w += 3;
  if (/\b(must|strictly|mandatory)\b/i.test(text)) w += 2;
  else if (/\brequired\b/i.test(text)) w += 1;
  if (CLAUSE_RE.test(text)) w += 1;
  return w;
}

/**
 * The few steps worth showing in a small space: highest weight first, then shown in their
 * original order. `hidden` is how many key steps were left out.
 */
export function topSteps(key: Step[], max = 3): { shown: Step[]; hidden: number } {
  if (key.length <= max) return { shown: key, hidden: 0 };
  const picked = key
    .map((s) => ({ s, w: weight(s.text) }))
    .sort((a, b) => b.w - a.w || a.s.n - b.s.n)
    .slice(0, max)
    .map((x) => x.s)
    .sort((a, b) => a.n - b.n);
  return { shown: picked, hidden: key.length - picked.length };
}
