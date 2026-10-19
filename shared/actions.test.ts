import { describe, expect, it } from "vitest";
import { splitSteps, topSteps } from "./actions.ts";

describe("splitSteps", () => {
  it("separates what to do from background in the real HR notice", () => {
    const steps = [
      "Get email approval from your reporting manager for every day that needs regularization or should count as leave.",
      "HR Ops updates leave records in the backend for approved days.",
      "All requests and approvals must go strictly through email. Other channels are not considered.",
      "The regularization and leave window is enabled for the last 7 days. For dates inside this window, regularize on DarwinBox.",
      "For dates beyond 7 days, email approvals are required.",
      "Send every approval email to hr.ops@unacademy.com.",
      "All email approvals must be completed by 21 October 2026, EOD. No LOP reversal requests are accepted after the deadline.",
    ];
    const { key, other } = splitSteps(steps);
    expect(key.map((s) => s.n)).toEqual([1, 3, 4, 5, 6, 7]);
    expect(other.map((s) => s.n)).toEqual([2]);
    expect(key[0]!.text).toMatch(/^Get email approval/);
  });

  it("returns everything as other when nothing is actionable", () => {
    const { key, other } = splitSteps(["The portal is hosted in Mumbai.", "Reports are archived monthly."]);
    expect(key).toEqual([]);
    expect(other).toHaveLength(2);
  });
});

describe("topSteps", () => {
  const steps = [
    "Get email approval from your reporting manager for every day that needs regularization or should count as leave.",
    "HR Ops updates leave records in the backend for approved days.",
    "All requests and approvals must go strictly through email. Other channels are not considered.",
    "The regularization and leave window is enabled for the last 7 days. For dates inside this window, regularize on DarwinBox.",
    "For dates beyond 7 days, email approvals are required.",
    "Send every approval email to hr.ops@unacademy.com.",
    "All email approvals must be completed by 21 October 2026, EOD. No LOP reversal requests are accepted after the deadline.",
  ];
  it("keeps the three that matter most, in their original order", () => {
    const { shown, hidden } = topSteps(splitSteps(steps).key, 3);
    expect(shown.map((s) => s.n)).toEqual([1, 6, 7]);
    expect(hidden).toBe(3);
  });
  it("shows everything when there are few", () => {
    const key = splitSteps(steps.slice(0, 2)).key;
    expect(topSteps(key, 3)).toEqual({ shown: key, hidden: 0 });
  });
});
