import { describe, expect, it } from "vitest";
import { dateFromFileName, selectBriefing } from "./select.ts";
import type { DriveFile } from "./types.ts";

function file(name: string, modifiedTime: string | null = "2026-10-19T04:30:00Z", id = name): DriveFile {
  return { id, name, modifiedTime, size: 1, md5Checksum: null, webViewLink: null };
}

describe("dateFromFileName", () => {
  it("accepts the exact pattern only", () => {
    expect(dateFromFileName("Morning-Briefing-2026-10-19.pdf")).toBe("2026-10-19");
    expect(dateFromFileName("morning-briefing-2026-10-19.PDF")).toBe("2026-10-19");
    expect(dateFromFileName("Morning-Briefing-2026-10-19 (1).pdf")).toBeNull();
    expect(dateFromFileName("Morning-Briefing-2026-13-40.pdf")).toBeNull();
    expect(dateFromFileName("Evening-Briefing-2026-10-19.pdf")).toBeNull();
  });
});

describe("selectBriefing", () => {
  it("finds the file for the requested date and lists other dates", () => {
    const sel = selectBriefing(
      [file("Morning-Briefing-2026-10-18.pdf"), file("Morning-Briefing-2026-10-19.pdf"), file("notes.txt")],
      "2026-10-19",
    );
    expect(sel.file?.name).toBe("Morning-Briefing-2026-10-19.pdf");
    expect(sel.duplicates).toEqual([]);
    expect(sel.availableDates).toEqual(["2026-10-19", "2026-10-18"]);
    expect(sel.latestDate).toBe("2026-10-19");
  });

  it("reports a missing day without falling back silently", () => {
    const sel = selectBriefing([file("Morning-Briefing-2026-10-18.pdf")], "2026-10-19");
    expect(sel.file).toBeNull();
    expect(sel.latestDate).toBe("2026-10-18");
  });

  it("never returns another day's file for the requested date", () => {
    const sel = selectBriefing(
      [file("Morning-Briefing-2026-10-18.pdf", "2026-10-19T09:00:00Z"), file("Morning-Briefing-2026-10-20.pdf")],
      "2026-10-19",
    );
    expect(sel.file).toBeNull();
    expect(sel.availableDates).toEqual(["2026-10-20", "2026-10-18"]);
  });

  it("picks the newest modifiedTime among duplicates and reports the rest", () => {
    const sel = selectBriefing(
      [
        file("Morning-Briefing-2026-10-19.pdf", "2026-10-19T03:30:00Z", "old"),
        file("Morning-Briefing-2026-10-19.pdf", "2026-10-19T05:10:00Z", "new"),
        file("morning-briefing-2026-10-19.pdf", null, "unknown-time"),
      ],
      "2026-10-19",
    );
    expect(sel.file?.id).toBe("new");
    expect(sel.duplicates.map((d) => d.id)).toEqual(["old", "unknown-time"]);
  });

  it("lists near-miss names as ignored so the UI can explain them", () => {
    const sel = selectBriefing([file("Morning-Briefing-2026-10-19 (1).pdf")], "2026-10-19");
    expect(sel.file).toBeNull();
    expect(sel.ignored.map((f) => f.name)).toEqual(["Morning-Briefing-2026-10-19 (1).pdf"]);
  });
});
