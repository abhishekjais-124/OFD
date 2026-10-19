import { describe, expect, it } from "vitest";
import { companyFromSource, companyFromUrl, describeJob, experienceFrom, skillsFrom, workModeFrom } from "./job.ts";

describe("job facts", () => {
  it("finds the company in the source", () => {
    expect(companyFromSource("Greenhouse (databricks board)")).toBe("Databricks");
    expect(companyFromSource("Lever (cred)")).toBe("Cred");
    expect(companyFromSource("Greenhouse API, board databricks")).toBe("Databricks");
    expect(companyFromSource("Google Careers")).toBe("Google");
    expect(companyFromSource(undefined)).toBeNull();
  });
  it("reads work mode only when it is stated", () => {
    expect(workModeFrom("Bengaluru, India (Hybrid)")).toBe("Hybrid");
    expect(workModeFrom("Remote - India")).toBe("Remote");
    expect(workModeFrom("Bengaluru, India")).toBeNull();
  });
  it("reads years of experience", () => {
    expect(experienceFrom("5+ years of backend development")).toBe("5+ yrs");
    expect(experienceFrom("3-5 years in distributed systems")).toBe("3–5 yrs");
    expect(experienceFrom("Bachelor's degree")).toBeNull();
  });
  it("picks known skills without false hits on the word go", () => {
    expect(skillsFrom("Strong Go and Python, Kubernetes on AWS; let's go to market")).toEqual(["Go", "Python", "Kubernetes", "AWS"]);
    expect(skillsFrom("experience with microservices and distributed systems")).toEqual(["Microservices", "Distributed systems"]);
  });
  it("prefers the routine's own lines over guesses", () => {
    const f = describeJob({
      title: "Senior Software Engineer - Backend",
      location: "Bengaluru, India",
      postedText: "updated 0 days ago",
      fields: [{ label: "Company", text: "Databricks" }, { label: "Work mode", text: "Hybrid" }, { label: "Experience", text: "5+ years" }, { label: "Skills", text: "Go, MySQL, AWS" }],
      source: "Greenhouse (databricks board)",
    });
    expect(f).toMatchObject({ company: "Databricks", workMode: "Hybrid", experience: "5+ years", skills: ["Go", "MySQL", "AWS"], location: "Bengaluru, India" });
  });
});

describe("companyFromUrl", () => {
  it("reads the company out of common job board links", () => {
    expect(companyFromUrl("https://job-boards.greenhouse.io/databricks/jobs/8123")).toBe("Databricks");
    expect(companyFromUrl("https://jobs.lever.co/cred/abc")).toBe("Cred");
    expect(companyFromUrl("https://www.google.com/about/careers/applications/jobs/results/1")).toBe("Google");
    expect(companyFromUrl("https://www.databricks.com/company/careers/engineering/role-123")).toBe("Databricks");
    expect(companyFromUrl("https://example.com/job")).toBeNull();
    expect(companyFromUrl(null)).toBeNull();
  });
});

describe("placeholder values", () => {
  it("ignores 'not named' style answers and falls back to what can be read", () => {
    const f = describeJob({
      title: "Backend Engineer",
      fields: [{ label: "Skills", text: "not named in the fetched excerpt" }, { label: "Work mode", text: "n/a" }],
      requirements: "Strong Go and Kubernetes; hybrid in Bengaluru",
    });
    expect(f.skills).toEqual(["Go", "Kubernetes"]);
    expect(f.workMode).toBe("Hybrid");
  });
});

describe("company fallbacks", () => {
  it("uses the apply link when no company line or source board is given", () => {
    const f = describeJob({ title: "Backend Engineer", fields: [{ label: "Company", text: "not stated" }], source: "Greenhouse", applyUrl: "https://job-boards.greenhouse.io/databricks/jobs/1" });
    expect(f.company).toBe("Databricks");
  });
  it("leaves the company empty when nothing says", () => {
    expect(describeJob({ title: "Backend Engineer", fields: [], applyUrl: "https://example.com/x" }).company).toBeNull();
  });
});
