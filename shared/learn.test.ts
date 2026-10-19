import { describe, expect, it } from "vitest";
import { parseExample, splitDots, tidyPosted } from "./learn.ts";

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
