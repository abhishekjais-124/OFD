import { describe, expect, it } from "vitest";
import { alertTone, parseGithubTitle, parseShareTitle } from "./mail.ts";

describe("parseGithubTitle", () => {
  it("splits the real card title", () => {
    expect(parseGithubTitle("GitHub · [Airlearn-Org/Apollo] PROD PR #9198 · merged into master")).toEqual({
      repo: "Airlearn-Org/Apollo", ref: "PROD PR #9198", status: "merged into master",
    });
  });
  it("copes with no repo or status, and rejects other cards", () => {
    expect(parseGithubTitle("GitHub · PR #5")).toEqual({ repo: null, ref: "PR #5", status: null });
    expect(parseGithubTitle("Google Drive · Folder shared")).toBeNull();
  });
});

describe("parseShareTitle", () => {
  it("reads the folder, sender and org note", () => {
    expect(parseShareTitle('Google Drive · Folder shared with you: "Routines" (shared by Abhishek Jaiswal, abhishekjais124124@gmail.com, outside your organization)'))
      .toEqual({ folder: "Routines", by: "Abhishek Jaiswal", note: "outside your organization" });
  });
  it("returns null for other titles", () => {
    expect(parseShareTitle("GitHub · PR")).toBeNull();
  });
});

describe("alertTone", () => {
  it("marks errors, ignorable mail and the rest", () => {
    expect(alertTone("Sentry GO-6FS7", "*errors.errorString: context canceled", "https://x")).toBe("error");
    expect(alertTone("Postman", "Marketing: 7-day free trial", "(ignore)")).toBe("muted");
    expect(alertTone("Deploy bot", "Release 12 finished", "https://x")).toBe("info");
  });
});
