import { describe, expect, it } from "vitest";
import { dayLabel } from "./ist.ts";
import { formatBytes, parseRoutineDetails, sourcesSummary } from "./more.ts";

describe("parseRoutineDetails", () => {
  const lines = [
    "Routine runs daily at 9:00 AM IST.",
    "Reports folder: https://drive.google.com/drive/folders/1RpOr2HsXSGuFpeSaVzYJssvmxzY0HhNG",
    "OK en.wikipedia.org",
    "OK boards-api.greenhouse.io (HTTP 404 on probe path)",
    "BLOCKED www.reuters.com",
    "Something else",
  ];
  it("splits schedule, folder, reachable and blocked hosts", () => {
    const d = parseRoutineDetails(lines);
    expect(d.schedule).toBe("Routine runs daily at 9:00 AM IST");
    expect(d.folderUrl).toBe("https://drive.google.com/drive/folders/1RpOr2HsXSGuFpeSaVzYJssvmxzY0HhNG");
    expect(d.ok).toEqual([{ host: "en.wikipedia.org", note: null }, { host: "boards-api.greenhouse.io", note: "HTTP 404 on probe path" }]);
    expect(d.blocked).toEqual([{ host: "www.reuters.com", note: null }]);
    expect(d.other).toEqual(["Something else"]);
    expect(sourcesSummary(d)).toBe("2 reachable, 1 blocked");
  });
  it("summarises all-OK and empty checks", () => {
    expect(sourcesSummary({ ok: [{ host: "a", note: null }], blocked: [] })).toBe("1 source reachable");
    expect(sourcesSummary({ ok: [], blocked: [] })).toBe("No source check in this briefing");
  });
});

describe("formatBytes and dayLabel", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(26_000)).toBe("25 KB");
    expect(formatBytes(2_500_000)).toBe("2.4 MB");
    expect(formatBytes(null)).toBeNull();
  });
  it("labels days relative to today", () => {
    expect(dayLabel("2026-10-19", "2026-10-19")).toBe("Today");
    expect(dayLabel("2026-10-18", "2026-10-19")).toBe("Yesterday");
    expect(dayLabel("2026-10-20", "2026-10-19")).toBe("Tomorrow");
    expect(dayLabel("2026-10-11", "2026-10-19")).toBe("Sun 11 Oct");
  });
});
