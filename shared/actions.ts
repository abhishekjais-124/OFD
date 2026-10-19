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
