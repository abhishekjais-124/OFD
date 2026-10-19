import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Briefing, Item } from "../../shared/schema.ts";
import { extractPdf } from "../extract/index.ts";
import type { ExtractedDocument } from "../extract/types.ts";
import { PARSER_VERSION, normalizeBriefing, validateBriefing } from "./index.ts";
import { parseFields, parseTimestampLine } from "./fields.ts";

const fixture = path.resolve(import.meta.dirname, "..", "..", "fixtures", "synthetic", "Morning-Briefing-2026-01-15.pdf");

function normalize(extracted: ExtractedDocument, fileNameDate: string | null = "2026-01-15"): Briefing {
  return normalizeBriefing({
    extracted,
    key: "drive:test",
    fileNameDate,
    processedAt: new Date("2026-01-15T04:00:00Z"),
    imageUrl: (id) => `/api/images/${id}.png`,
    pdfUrl: "/api/documents/drive:test/pdf",
    source: { kind: "drive", fileId: "test", fileName: "Morning-Briefing-2026-01-15.pdf", modifiedTime: "2026-01-15T03:35:00Z", size: 1, webViewLink: null },
  });
}

function items(b: Briefing, kind: Item["kind"]): Item[] {
  return b.sections.flatMap((s) => s.items).filter((i) => i.kind === kind);
}

describe("normalizeBriefing on the synthetic briefing", () => {
  let extracted: ExtractedDocument;
  let b: Briefing;
  beforeAll(async () => {
    extracted = await extractPdf(fs.readFileSync(fixture));
    b = normalize(extracted);
  });

  it("produces a valid briefing with title, date and sections in order", () => {
    expect(() => validateBriefing(b)).not.toThrow();
    expect(b.parserVersion).toBe(PARSER_VERSION);
    expect(b.title).toContain("Good morning, Sample");
    expect(b.subtitle).toContain("Thursday, 15 January 2026");
    expect(b.date).toBe("2026-01-15");
    expect(b.dateSource).toBe("filename");
    expect(b.confidence).toBe("high");
    expect(b.sections.map((s) => s.kind)).toEqual([
      "glance", "mail", "calendar", "slack", "headlines", "headlines", "question", "job", "routine", "unknown",
    ]);
    expect(b.sections.map((s) => s.title)).toContain("Reading list");
  });

  it("reads the glance table", () => {
    const glance = items(b, "glance")[0]!;
    const table = glance.tables[0]!;
    expect(table.header).toEqual(["Area", "Status"]);
    expect(table.rows.map((r) => r[0]!.text)).toEqual(["Mail", "Calendar", "Headlines", "Question", "Job"]);
    expect(table.rows[0]![1]!.text).toContain("expense report due 17 Jan 2026 EOD");
  });

  it("turns the important mail into an action item with deadline, steps and labelled links", () => {
    const action = items(b, "action")[0]!;
    expect(action.page).toBe(1);
    expect(action.title).toBe("Expense report for December must be filed before payroll closes");
    expect(action.action).toMatchObject({ deadlineDate: "2026-01-17", priority: "important", received: "15 Jan 2026, 9:02 AM IST" });
    expect(action.action!.from).toContain("finance@example.com");
    expect(action.action!.steps).toHaveLength(3);
    expect(action.action!.steps[2]).toContain("Late claims are not accepted after the deadline.");
    const labels = Object.fromEntries(action.links.map((l) => [l.label, l.url]));
    expect(labels["Reference sheet shared by Finance"]).toBe("https://docs.example.com/spreadsheets/d/EXAMPLE-SHEET-ID/edit?usp=sharing");
    expect(labels["Open mail (15 Jan)"]).toContain("thread-f:1000000000000000001");
    expect(action.links.every((l) => l.source === "annotation" && l.confidence === "high")).toBe(true);
  });

  it("classifies github and drive share cards and the alerts table", () => {
    expect(items(b, "github")[0]!.links.map((l) => l.label)).toEqual(["PR", "Hotfix PR", "Mail"]);
    expect(items(b, "share")[0]!.links[0]!.url).toBe("https://drive.google.com/drive/folders/EXAMPLE-FOLDER-ID");
    const alerts = items(b, "alerts")[0]!;
    const table = alerts.tables[0]!;
    expect(table.caption).toBe("Automated alerts (low priority, unread)");
    expect(table.header).toEqual(["Alert", "Detail", "Mail"]);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]![0]!.text).toBe("Sentry GO-1AAA");
    expect(table.rows[0]![2]!.links[0]!.url).toContain("thread-f:1000000000000000004");
    expect(table.rows[2]![2]!.text).toBe("(ignore)");
    // the subheading was consumed as the caption, not shown twice
    expect(items(b, "note").some((n) => n.title === "Automated alerts (low priority, unread)")).toBe(false);
  });

  it("turns Slack cards into mentions with sender, place, text, time and link", () => {
    const mentions = items(b, "mention");
    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.mention).toMatchObject({
      from: "Priya Rao",
      where: "#payments-dev",
      text: "@sample can you review the refund retry change before the 4 PM release?",
      timeText: "Thu, 15 Jan 2026 10:42 IST",
      timestamp: "2026-01-15T05:12:00.000Z",
      url: "https://example.slack.com/archives/C0PAY/p1768453920000100",
    });
    expect(mentions[1]!.mention).toMatchObject({ from: "Dev Mehta", where: "DM", timestamp: "2026-01-14T12:35:00.000Z" });
  });

  it("builds headline cards with image, summary, timestamp and article URL", () => {
    const heads = items(b, "headline");
    expect(heads).toHaveLength(5);
    const first = heads[0]!;
    expect(first.headline).toMatchObject({
      title: "Coastal city votes on new harbour plan after years of debate",
      summary: "Residents will decide whether the port expansion goes ahead, a project that has divided the town.",
      timestampText: "Thu, 15 Jan 2026 07:46:54 UTC",
      timestamp: "2026-01-15T07:46:54.000Z",
      source: "Example News",
      url: "https://news.example.com/articles/world-001",
    });
    expect(first.images).toHaveLength(1);
    expect(first.images[0]!.url).toMatch(/^\/api\/images\/[0-9a-f]{40}\.png$/);
    expect(heads.every((h) => h.images.length === 1 && h.headline?.url)).toBe(true);
    const india = b.sections.filter((s) => s.kind === "headlines")[1]!;
    expect(india.items.filter((i) => i.kind === "headline")).toHaveLength(2);
    expect(india.items.find((i) => i.kind === "note")?.links.map((l) => l.url)).toEqual([
      "https://news.example.com/world/rss.xml",
      "https://news.example.com/india/rss.xml",
    ]);
  });

  it("parses the question card", () => {
    const q = items(b, "question")[0]!.question!;
    expect(q).toMatchObject({ number: "1", title: "Two Sum", difficulty: "Easy", problemUrl: "https://leetcode.com/problems/two-sum/" });
    expect(q.topics).toEqual(["Array", "Hash Table"]);
    expect(q.companies).toEqual(["Example Corp", "Sample Inc"]);
    expect(q.fields.map((f) => f.label)).toEqual([
      "In simple words", "Example", "Constraints (from a mirror; confirm on LeetCode)", "Why today", "Study guide (hash maps)", "Full problem list",
    ]);
    expect(q.fields[1]!.text).toContain("[0,1]");
    expect(q.fields[2]!.text).toBe("2 ≤ length ≤ 10^4, exactly one valid answer.");
  });

  it("parses the job card and the roles table with the best-match badge", () => {
    const job = items(b, "job")[0]!.job!;
    expect(job).toMatchObject({ title: "Backend Engineer", location: "Bengaluru, Karnataka, India", applyUrl: "https://careers.example.com/jobs/results/1001" });
    expect(job.fields.map((f) => f.label)).toEqual(["Minimum qualifications", "Why it fits you"]);
    const table = items(b, "jobs")[0]!.tables[0]!;
    expect(table.caption).toBe("Other recent Example India roles worth a look");
    expect(table.header).toEqual(["Role", "Location", "Posted", "Link"]);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]![0]).toMatchObject({ text: "Backend Engineer", badge: "BEST MATCH" });
    expect(table.rows[1]![0]!.text).toBe("Site Reliability Engineer, Platform");
    expect(table.rows[1]![2]!.text).toBe("3.4 days ago");
    expect(table.rows.map((r) => r[3]!.links[0]!.url)).toEqual([
      "https://careers.example.com/jobs/results/1001",
      "https://careers.example.com/jobs/results/1002",
      "https://careers.example.com/jobs/results/1003",
    ]);
  });

  it("keeps unknown sections as generic content and notes them", () => {
    const unknown = b.sections.find((s) => s.kind === "unknown")!;
    expect(unknown.title).toBe("Reading list");
    expect(unknown.items[0]!.flags).toContain("unrecognized");
    expect(unknown.items[0]!.links[0]!.url).toBe("https://blog.example.com/posts/unknown-section");
    expect(b.notes.some((n) => n.code === "unrecognized_section" && n.message.includes("Reading list"))).toBe(true);
  });

  it("falls back to the document date when the file name has none, and flags mismatches", () => {
    const fromContent = normalize(extracted, null);
    expect(fromContent.date).toBe("2026-01-15");
    expect(fromContent.dateSource).toBe("content");
    const mismatch = normalize(extracted, "2026-01-16");
    expect(mismatch.date).toBe("2026-01-16");
    expect(mismatch.notes.some((n) => n.code === "date_mismatch")).toBe(true);
  });

  it("marks OCR pages as low confidence and partial pages when text is missing", async () => {
    const scanned = await extractPdf(fs.readFileSync(path.join(path.dirname(fixture), "scanned.pdf")), { ocr: null });
    const partial = normalize(scanned, null);
    expect(partial.confidence).toBe("partial");
    expect(partial.notes.filter((n) => n.code === "no_text")).toHaveLength(2);
    expect(partial.notes.some((n) => n.code === "no_known_sections")).toBe(true);
    const ocrDoc: ExtractedDocument = {
      ...extracted,
      ocrUsed: true,
      warnings: [{ code: "ocr", message: "page 1 came from OCR", page: 1 }],
      pages: extracted.pages.map((p) => ({ ...p, ocr: true, lines: p.lines.map((l) => ({ ...l, ocrConfidence: 70 })) })),
    };
    const low = normalize(ocrDoc);
    expect(low.confidence).toBe("low");
    expect(low.ocrUsed).toBe(true);
    expect(low.sections.flatMap((s) => s.items).every((i) => i.flags.includes("ocr") && i.flags.includes("low_confidence"))).toBe(true);
  });
});

describe("field helpers", () => {
  it("splits label/value pairs including ones separated by middle dots", () => {
    const { preamble, fields } = parseFields([
      "739. Daily Temperatures · Medium",
      "Topics: Array, Stack · Companies: Amazon, Google · Why today: day 292 of the year,",
      "so the topic rotation lands on Stack.",
      "Thu, 15 Jan 2026 07:46:54 UTC · BBC News",
    ]);
    expect(preamble).toEqual(["739. Daily Temperatures · Medium"]);
    expect(fields).toEqual([
      { label: "Topics", text: "Array, Stack" },
      { label: "Companies", text: "Amazon, Google" },
      { label: "Why today", text: "day 292 of the year, so the topic rotation lands on Stack. Thu, 15 Jan 2026 07:46:54 UTC · BBC News" },
    ]);
  });
  it("parses timestamp lines", () => {
    expect(parseTimestampLine("Mon, 19 Oct 2026 07:46:54 UTC · BBC News")).toEqual({ timestampText: "Mon, 19 Oct 2026 07:46:54 UTC", timestamp: "2026-10-19T07:46:54.000Z", source: "BBC News" });
    expect(parseTimestampLine("Problem: https://leetcode.com")).toBeNull();
  });
});
