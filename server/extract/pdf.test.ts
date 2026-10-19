import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdf } from "./pdf.ts";
import type { ExtractedLine, OcrEngine } from "./types.ts";

const fixtures = path.resolve(import.meta.dirname, "..", "..", "fixtures", "synthetic");
const read = (name: string) => fs.readFileSync(path.join(fixtures, name));

describe("extractPdf on the synthetic briefing", () => {
  it("extracts text with font info, link annotations and images per page", async () => {
    const doc = await extractPdf(read("Morning-Briefing-2026-01-15.pdf"));
    expect(doc.pageCount).toBeGreaterThanOrEqual(3);
    expect(doc.ocrUsed).toBe(false);
    expect(doc.warnings).toEqual([]);

    const p1 = doc.pages[0]!;
    expect(p1.number).toBe(1);
    const title = p1.lines[0]!;
    expect(title.text).toContain("Good morning, Sample");
    expect(title.bold).toBe(true);
    expect(title.size).toBeGreaterThan(14);
    const heading = p1.lines.find((l) => l.text === "At a glance")!;
    expect(heading.bold).toBe(true);
    expect(heading.size).toBeGreaterThan(10);

    const urls = p1.links.map((l) => l.url);
    expect(urls).toContain("https://github.com/example-org/widgets/pull/42");
    expect(urls).toContain("https://docs.example.com/spreadsheets/d/EXAMPLE-SHEET-ID/edit?usp=sharing");
    const link = p1.links.find((l) => l.url.endsWith("/pull/42"))!;
    const line = p1.lines.find((l) => l.text.startsWith("PR: https://github.com"))!;
    // the annotation sits on the line that prints the URL
    expect(Math.abs(link.bbox.y - line.bbox.y)).toBeLessThan(4);

    const allImages = doc.pages.flatMap((p) => p.images);
    expect(allImages.length).toBe(5);
    for (const img of allImages) {
      expect(img.png.subarray(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      expect(img.width).toBe(300);
      expect(img.height).toBe(168);
      expect(img.id).toMatch(/^[0-9a-f]{40}$/);
    }
    const page2Images = doc.pages[1]!.images;
    expect(page2Images.length).toBeGreaterThan(0);
    // image sits left of the headline text block
    const headlineLine = doc.pages[1]!.lines.find((l) => l.text.startsWith("Coastal city votes"))!;
    expect(page2Images[0]!.bbox.x).toBeLessThan(headlineLine.bbox.x);
  });
});

describe("extractPdf failure states", () => {
  it("rejects a password protected PDF", async () => {
    await expect(extractPdf(read("password.pdf"))).rejects.toMatchObject({ code: "password_protected" });
  });
  it("rejects a corrupted PDF", async () => {
    await expect(extractPdf(read("corrupted.pdf"))).rejects.toMatchObject({ code: "corrupted" });
  });
  it("rejects a file that is not a PDF", async () => {
    await expect(extractPdf(read("not-a-pdf.pdf"))).rejects.toMatchObject({ code: "not_pdf" });
  });
  it("flags image-only pages when OCR is off", async () => {
    const doc = await extractPdf(read("scanned.pdf"), { ocr: null });
    expect(doc.pages.every((p) => p.lines.length === 0)).toBe(true);
    expect(doc.warnings.map((w) => w.code)).toEqual(["no_text", "no_text"]);
  });
  it("falls back to the OCR engine for image-only pages and marks the lines", async () => {
    const fake: OcrEngine = {
      async recognize(png, scale) {
        expect(png.length).toBeGreaterThan(1000);
        const line: ExtractedLine = { text: "At a glance", bbox: { x: 40 * scale, y: 120 * scale, w: 60, h: 12 }, bold: false, size: 12, fontName: "ocr", block: 0, ocrConfidence: 88 };
        return [line];
      },
    };
    const doc = await extractPdf(read("scanned.pdf"), { ocr: fake });
    expect(doc.ocrUsed).toBe(true);
    expect(doc.pages[0]!.ocr).toBe(true);
    expect(doc.pages[0]!.lines[0]!.ocrConfidence).toBe(88);
    expect(doc.warnings.map((w) => w.code)).toEqual(["ocr", "ocr"]);
  });
});
