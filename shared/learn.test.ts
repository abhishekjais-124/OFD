import { describe, expect, it } from "vitest";
import { parseExample, parseWhyToday, prettyMath, splitConstraints, splitDots, splitRequirements, stripUnverified, tidyPosted } from "./learn.ts";

describe("parseExample", () => {
  it("reads the real briefing's example with its note and a second pair", () => {
    const e = parseExample("Input: [73,74,75,71,69,72,76,73] → Output: [1,1,4,2,1,1,0,0] (day 3 has 75; the next warmer day, 76, is 4 days later). Another: [30,40,50,60] → [1,1,1,0] .");
    expect(e).toEqual({
      main: { input: "[73,74,75,71,69,72,76,73]", output: "[1,1,4,2,1,1,0,0]" },
      note: "day 3 has 75; the next warmer day, 76, is 4 days later",
      more: [{ input: "[30,40,50,60]", output: "[1,1,1,0]" }],
    });
  });
  it("reads the synthetic fixture's named inputs", () => {
    const e = parseExample("Input: nums = [2,7,11,15], target = 9 → Output: [0,1] (2 + 7 = 9). Another: [3,2,4], 6 → [1,2].");
    expect(e?.main).toEqual({ input: "nums = [2,7,11,15], target = 9", output: "[0,1]" });
    expect(e?.more).toEqual([{ input: "[3,2,4], 6", output: "[1,2]" }]);
  });
  it("reads the arrow-only wording used on other days", () => {
    const e = parseExample("head = [1,2,3,4,5], n = 2 -> [1,2,3,5]. Second: head = [1], n = 1 -> [].");
    expect(e).toEqual({
      main: { input: "head = [1,2,3,4,5], n = 2", output: "[1,2,3,5]" },
      note: null,
      more: [{ input: "head = [1], n = 1", output: "[]" }],
    });
  });
  it("reads the spoken wording: input X gives output Y", () => {
    const e = parseExample("input [[1,3],[2,6],[8,10],[15,18]] gives output [[1,6],[8,10],[15,18]]. Input [[1,4],[4,5]] gives output [[1,5]].");
    expect(e).toEqual({
      main: { input: "[[1,3],[2,6],[8,10],[15,18]]", output: "[[1,6],[8,10],[15,18]]" },
      note: null,
      more: [{ input: "[[1,4],[4,5]]", output: "[[1,5]]" }],
    });
  });
  it("reads 'X gives Y; X2 gives Y2' without the word input", () => {
    const e = parseExample("l1 = [2,4,3], l2 = [5,6,4] gives [7,0,8]; l1 = [0], l2 = [0] gives [0].");
    expect(e).toEqual({
      main: { input: "l1 = [2,4,3], l2 = [5,6,4]", output: "[7,0,8]" },
      note: null,
      more: [{ input: "l1 = [0], l2 = [0]", output: "[0]" }],
    });
  });
  it("works without a note or extra pair, and returns null for other shapes", () => {
    expect(parseExample("Input: abc → Output: 3")).toEqual({ main: { input: "abc", output: "3" }, note: null, more: [] });
    expect(parseExample("Just a sentence about the example.")).toBeNull();
  });
});

describe("splitDots and tidyPosted", () => {
  it("splits the qualifications", () => {
    expect(splitDots("Bachelor's degree · 5 years of software development · 3 years testing")).toEqual(["Bachelor's degree", "5 years of software development", "3 years testing"]);
    expect(splitDots(undefined)).toEqual([]);
  });
  it("tidies the posted text", () => {
    expect(tidyPosted("posted about 3 days ago (around 16 Oct 2026)")).toBe("3 days ago · 16 Oct 2026");
    expect(tidyPosted("posted yesterday")).toBe("yesterday");
    expect(tidyPosted(undefined)).toBeUndefined();
  });
});

describe("constraints, why-today and caveats", () => {
  it("writes constraints as maths, one rule per line", () => {
    expect(prettyMath("1 <= n <= 10^4")).toBe("1 \u2264 n \u2264 10\u2074");
    expect(splitConstraints("1 <= intervals.length <= 10^4; each interval has 2 numbers; 0 <= start <= end <= 10^4.")).toEqual([
      "1 \u2264 intervals.length \u2264 10\u2074",
      "each interval has 2 numbers",
      "0 \u2264 start \u2264 end \u2264 10\u2074",
    ]);
    expect(splitConstraints(undefined)).toEqual([]);
  });
  it("reads the date-hash explanation", () => {
    expect(parseWhyToday("picked by date hash 36 of 39; topic intervals")).toEqual({ pick: 36, of: 39, topic: "intervals" });
    expect(parseWhyToday("picked by date hash 3 of 39")).toEqual({ pick: 3, of: 39, topic: null });
    expect(parseWhyToday("because it is Monday")).toBeNull();
  });
  it("splits off the not-verified caveat", () => {
    expect(stripUnverified("Sorting (not verified)")).toEqual({ text: "Sorting", unverified: true });
    expect(stripUnverified("Array")).toEqual({ text: "Array", unverified: false });
    expect(stripUnverified("commonly asked at large tech companies (not verified)")).toEqual({ text: "commonly asked at large tech companies", unverified: true });
  });
});

describe("splitRequirements", () => {
  it("splits dot-separated items and sentences, and drops fetch notes", () => {
    expect(splitRequirements("5+ years of backend experience \u00b7 Strong Go skills \u00b7 Experience with AWS")).toEqual(["5+ years of backend experience", "Strong Go skills", "Experience with AWS"]);
    expect(splitRequirements("Build services in Go. Own on-call for the platform; mentor juniors.")).toEqual(["Build services in Go", "Own on-call for the platform", "mentor juniors"]);
    expect(splitRequirements("only a 300-character excerpt was fetched: a backend role building Databri...")).toEqual([]);
    expect(splitRequirements("open the apply link for the full list")).toEqual([]);
    expect(splitRequirements(undefined)).toEqual([]);
  });
});
