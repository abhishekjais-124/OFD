/**
 * Companies that candidates most often report seeing each daily problem at. LeetCode's own company
 * tags are a paid feature, so this is a hand-kept list of widely reported ones, not an official source.
 * Used only when the briefing itself names no real companies.
 */
const REPORTED: Record<number, string> = {
  238: "Amazon, Meta, Microsoft, Apple, Google",
  53: "Amazon, Microsoft, Apple, Google, Bloomberg",
  189: "Microsoft, Amazon, Apple, Google, Adobe",
  49: "Amazon, Meta, Google, Microsoft, Apple",
  560: "Meta, Google, Amazon, Microsoft, Goldman Sachs",
  347: "Amazon, Meta, Google, Microsoft, Apple",
  15: "Amazon, Meta, Google, Microsoft, Apple",
  11: "Amazon, Google, Meta, Microsoft, Goldman Sachs",
  167: "Amazon, Meta, Google, Microsoft, Apple",
  3: "Amazon, Google, Meta, Microsoft, Bloomberg",
  424: "Google, Amazon, Meta, Microsoft",
  567: "Microsoft, Meta, Google, Amazon, Bloomberg",
  739: "Amazon, Google, Meta, Microsoft, Bloomberg",
  150: "Amazon, LinkedIn, Google, Meta, Microsoft",
  853: "Google, Amazon, Meta, Microsoft",
  33: "Amazon, Meta, Google, Microsoft, LinkedIn",
  153: "Amazon, Microsoft, Meta, Google, Apple",
  875: "Amazon, Google, Meta, Microsoft, Goldman Sachs",
  19: "Amazon, Meta, Google, Microsoft, Apple",
  2: "Amazon, Microsoft, Google, Meta, Apple",
  143: "Amazon, Meta, Microsoft, Google, Apple",
  102: "Amazon, Meta, Microsoft, Google, LinkedIn",
  98: "Amazon, Meta, Microsoft, Google, Bloomberg",
  236: "Meta, Amazon, Microsoft, Google, LinkedIn",
  200: "Amazon, Meta, Google, Microsoft, Bloomberg",
  133: "Meta, Amazon, Google, Microsoft, Uber",
  207: "Amazon, Google, Meta, Microsoft, Uber",
  215: "Amazon, Meta, Google, Microsoft, Apple",
  621: "Meta, Amazon, Google, Microsoft, Uber",
  973: "Amazon, Meta, Google, Microsoft, LinkedIn",
  322: "Amazon, Google, Meta, Microsoft, Apple",
  300: "Amazon, Google, Microsoft, Meta, Apple",
  198: "Amazon, Google, Microsoft, Meta, Apple",
  78: "Amazon, Meta, Google, Microsoft, Apple",
  39: "Amazon, Meta, Google, Microsoft, Apple",
  46: "Amazon, Meta, Google, Microsoft, Apple",
  56: "Amazon, Meta, Google, Microsoft, Bloomberg",
  57: "Meta, Google, Amazon, Microsoft, LinkedIn",
  435: "Amazon, Google, Meta, Microsoft, Uber"
};

export function reportedCompanies(problemNumber: string | number | null | undefined): string[] {
  const list = REPORTED[Number(problemNumber)];
  return list ? list.split(", ") : [];
}
