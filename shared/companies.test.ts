import { describe, expect, it } from "vitest";
import { reportedCompanies } from "./companies.ts";

describe("reportedCompanies", () => {
  it("lists companies for a known problem, by number or text", () => {
    expect(reportedCompanies(56)).toEqual(["Amazon", "Meta", "Google", "Microsoft", "Bloomberg"]);
    expect(reportedCompanies("56")).toHaveLength(5);
  });
  it("returns nothing for an unknown or missing number", () => {
    expect(reportedCompanies(99999)).toEqual([]);
    expect(reportedCompanies(undefined)).toEqual([]);
  });
});
