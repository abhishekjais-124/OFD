import { describe, expect, it } from "vitest";
import { normalizeBrief } from "./brief.ts";

const sample = {
  v: 1,
  t: "Good morning, Abhishek",
  d: "Tuesday, 20 October 2026 \u00b7 IST \u00b7 Mailbox: me@example.com",
  n: "Every source link is printed in full.",
  s: [
    ["At a glance", { T: [["Area", "Status"], ["Mail", "1 needs action"], ["Job", "Stripe, Backend"]] }],
    ["Mail", ["**IMPORTANT \u00b7 ACTION NEEDED BY 21 Oct 2026, EOD", "**Attendance process", "From: Priya g@x.com \u00b7 Received Mon, 19 Oct 2026 12:34 IST", "**Steps:", "~1. Get approval", "~2. Send emails", "Open mail:", "https://mail.google.com/mail/#all/thread-f:1"]],
    ["Calendar & invites", ["Checked: 19-26 Oct.", "Meetings: none. Interviews: none. On call: none. RSVP needed: none."]],
    ["World headlines (BBC)", { H: ["Kenya cult leader guilty", "Court ne leader ko guilty paya.", "Mon, 19 Oct 2026 07:46:54 UTC \u00b7 BBC News", "https://bbc.co.uk/news/a", "Original: Kenya cult leader guilty", "Image: https://ichef.bbci.co.uk/x.jpg"] }],
    ["Special day", ["Today is World Statistics Day"]],
    ["Daily extras", ["Word: serendipity", "Meaning: a happy accident.", "Riddle: What has keys but no locks?", "Answer: A piano"]],
  ],
};

const meta = { key: "drive:x", source: { kind: "drive" as const, fileId: "x", fileName: "Morning-Briefing-2026-10-20.json", modifiedTime: null, size: 100, webViewLink: null }, fileNameDate: "2026-10-20", processedAt: new Date("2026-10-20T01:00:00Z"), imageUrl: (id: string) => `/api/images/${id}.png` };

describe("compact briefing", () => {
  const b = normalizeBrief(JSON.stringify(sample), meta);
  it("reads the title, date and sections", () => {
    expect(b.title).toBe("Good morning, Abhishek");
    expect(b.date).toBe("2026-10-20");
    expect(b.confidence).toBe("high");
    expect(b.sections.map((s) => s.kind)).toEqual(["glance", "mail", "calendar", "headlines", "special", "extras"]);
  });
  it("parses the action card with steps, deadline and link", () => {
    const a = b.sections.find((s) => s.kind === "mail")!.items[0]!;
    expect(a.kind).toBe("action");
    expect(a.action?.steps).toEqual(["Get approval", "Send emails"]);
    expect(a.action?.deadlineDate).toBe("2026-10-21");
    expect(a.links[0]?.url).toContain("mail.google.com");
  });
  it("parses a headline with its article link and image field", () => {
    const h = b.sections.find((s) => s.kind === "headlines")!.items[0]!;
    expect(h.headline?.title).toBe("Kenya cult leader guilty");
    expect(h.headline?.url).toBe("https://bbc.co.uk/news/a");
    expect(h.headline?.source).toBe("BBC News");
    expect(h.fields.find((f) => f.label === "Image")?.text).toContain("ichef");
  });
  it("rejects broken files with a clear error", () => {
    expect(() => normalizeBrief("{not json", meta)).toThrow(/not valid JSON/);
    expect(() => normalizeBrief(JSON.stringify({ v: 2 }), meta)).toThrow(/wrong shape/);
  });
});
