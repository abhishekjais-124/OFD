import { describe, expect, it } from "vitest";
import { mixStories } from "./news.ts";

const s = (id: string, time: number | null) => ({ id, time });

describe("mixStories", () => {
  const world = [s("w1", 10), s("w2", 90), s("w3", 80), s("w4", 70)];
  const india = [s("i1", 95), s("i2", 20), s("i3", 15)];

  it("picks five, takes turns between groups, and orders newest first", () => {
    const out = mixStories([world, india], 5);
    // turn 1: i1, w2 · turn 2: i2, w3 · turn 3: i3
    expect(out.map((o) => o.story.id)).toEqual(["i1", "w2", "w3", "i2", "i3"]);
    expect(out.map((o) => o.group)).toEqual([1, 0, 0, 1, 1]);
  });

  it("lets an older group in even when the other group has newer stories", () => {
    const out = mixStories([[s("a1", 100), s("a2", 99), s("a3", 98), s("a4", 97)], [s("b1", 1)]], 4);
    expect(out.map((o) => o.story.id)).toEqual(["a1", "a2", "a3", "b1"]);
  });

  it("copes with short lists, empty groups and missing times", () => {
    expect(mixStories([[], []], 5)).toEqual([]);
    expect(mixStories([[s("x", null)], [s("y", 5)]], 5).map((o) => o.story.id)).toEqual(["y", "x"]);
    expect(mixStories([[s("only", 1)]], 5)).toHaveLength(1);
  });
});
