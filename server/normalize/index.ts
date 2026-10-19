/**
 * normalize: extracted pages → typed Briefing. Sections are detected from heading text,
 * known sections get dedicated parsers, everything else lands in a generic section.
 */
import { SCHEMA_VERSION, type Briefing, type BriefingSource, type ExtractionNote, type Section } from "../../shared/schema.ts";
import { parseHumanDate } from "../../shared/ist.ts";
import type { ExtractedDocument } from "../extract/types.ts";
import { layoutDocument, type LayoutItem } from "./layout.ts";
import { PARSERS, sectionKindFor, type ParseContext } from "./parsers.ts";
import { validateBriefing } from "./validate.ts";

export { validateBriefing, ValidationError } from "./validate.ts";
export { layoutDocument } from "./layout.ts";

/** Bump when the parser output changes so cached results are reprocessed. */
export const PARSER_VERSION = "2026.10.19-3";

export interface NormalizeInput {
  extracted: ExtractedDocument;
  source: BriefingSource;
  key: string;
  /** Date taken from the file name when it follows the pattern. */
  fileNameDate: string | null;
  processedAt: Date;
  imageUrl: (id: string) => string;
  pdfUrl: string;
}

export function normalizeBriefing(input: NormalizeInput): Briefing {
  const { extracted } = input;
  const items = layoutDocument(extracted.pages);
  let counter = 0;
  const ctx: ParseContext = {
    nextId: (kind) => `${kind}-${++counter}`,
    imageUrl: input.imageUrl,
  };

  const notes: ExtractionNote[] = extracted.warnings.map((w) => ({
    level: w.code === "ocr" || w.code === "no_text" || w.code === "ocr_failed" || w.code === "page_unreadable" ? "warn" : "info",
    code: w.code,
    message: w.message,
    page: w.page,
  }));

  // front matter: title and subtitle before the first heading
  let title = "Briefing";
  let subtitle: string | undefined;
  const front: LayoutItem[] = [];
  let firstHeading = items.findIndex((it) => it.type === "heading");
  if (firstHeading < 0) firstHeading = items.length;
  for (const it of items.slice(0, firstHeading)) {
    if (it.type === "title") {
      title = it.lines.map((l) => l.text).join(" ");
      continue;
    }
    const dateLine = !subtitle && it.type === "block" ? it.lines.findIndex((l) => parseHumanDate(l.text)) : -1;
    if (dateLine >= 0) {
      subtitle = it.lines[dateLine]!.text;
      const rest = it.lines.filter((_, i) => i !== dateLine);
      if (rest.length) front.push({ ...it, lines: rest });
      continue;
    }
    front.push(it);
  }

  // group items under headings; small print before the first heading becomes a note
  const groups: { title: string; page: number; items: LayoutItem[] }[] = [];
  const smallPrint = front.filter((it) => it.type === "block" && it.lines.every((l) => l.size < 8.5));
  for (const it of smallPrint) {
    notes.push({ level: "info", code: "front_matter", message: it.lines.map((l) => l.text).join(" "), page: it.page });
  }
  const rest = front.filter((it) => !smallPrint.includes(it));
  if (rest.length) groups.push({ title: "Front matter", page: rest[0]!.page, items: rest });
  for (const it of items.slice(firstHeading)) {
    if (it.type === "heading") groups.push({ title: it.lines.map((l) => l.text).join(" "), page: it.page, items: [] });
    else if (groups.length) groups[groups.length - 1]!.items.push(it);
    else groups.push({ title: "Front matter", page: it.page, items: [it] });
  }

  const sections: Section[] = groups.map((g, i) => {
    const kind = sectionKindFor(g.title);
    if (kind === "unknown" && g.items.length && g.title !== "Front matter") {
      notes.push({ level: "info", code: "unrecognized_section", message: `"${g.title}" (p. ${g.page}) is not a known section; it is shown as-is.`, page: g.page });
    }
    return { id: `section-${i + 1}-${kind}`, kind, title: g.title, page: g.page, items: PARSERS[kind](ctx, g.items) };
  }).filter((s) => s.items.length > 0 || s.kind !== "unknown");

  for (const s of sections) {
    for (const it of s.items) {
      if (it.flags.includes("wrapped_url")) {
        notes.push({ level: "warn", code: "wrapped_url", message: `a URL in "${it.title ?? it.kind}" (p. ${it.page}) was joined across lines without a link annotation; check it before trusting it.`, page: it.page });
      }
      if (it.images.length === 0 && it.kind === "headline" && s.kind === "headlines") {
        notes.push({ level: "info", code: "headline_without_image", message: `headline "${it.title}" (p. ${it.page}) has no image.`, page: it.page });
      }
    }
  }

  let date = input.fileNameDate;
  let dateSource: Briefing["dateSource"] = date ? "filename" : "unknown";
  if (!date && subtitle) {
    const fromContent = parseHumanDate(subtitle);
    if (fromContent) {
      date = fromContent;
      dateSource = "content";
    }
  }
  if (date && subtitle) {
    const fromContent = parseHumanDate(subtitle);
    if (fromContent && fromContent !== date) {
      notes.push({ level: "warn", code: "date_mismatch", message: `the file name says ${date} but the document says ${fromContent}.`, page: 1 });
    }
  }

  const badPages = extracted.warnings.filter((w) => w.code === "no_text" || w.code === "ocr_failed" || w.code === "page_unreadable").length;
  const confidence: Briefing["confidence"] = badPages > 0 ? "partial" : extracted.ocrUsed ? "low" : "high";
  if (!sections.some((s) => s.kind !== "unknown")) {
    notes.push({ level: "warn", code: "no_known_sections", message: "no known section heading was found; the document is shown as generic content." });
  }

  return validateBriefing({
    schemaVersion: SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
    key: input.key,
    date,
    dateSource,
    title,
    subtitle,
    pageCount: extracted.pageCount,
    sections,
    notes,
    source: input.source,
    processedAt: input.processedAt.toISOString(),
    ocrUsed: extracted.ocrUsed,
    confidence,
    pdfUrl: input.pdfUrl,
  });
}
