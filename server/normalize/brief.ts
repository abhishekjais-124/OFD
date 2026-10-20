/**
 * The compact briefing format: one small JSON file instead of a PDF. It carries the same
 * lines a PDF card would print, so the section parsers run unchanged. No PDF extraction,
 * layout analysis or OCR is needed, which makes the file ~3x smaller and parsing instant.
 *
 *   {"v":1,"t":"Good morning, Abhishek","d":"Tuesday, 20 October 2026 · IST · Mailbox: …","n":"small print",
 *    "s":[["At a glance", {"T":[["Area","Status"],["Mail","…"]]}],
 *         ["Mail", ["**IMPORTANT · ACTION NEEDED BY 21 Oct 2026, EOD","**Subject","From: …","~1. step"]],
 *         ["World headlines (BBC)", {"H":["Title","Summary","Mon, 19 Oct 2026 07:46 UTC · BBC","https://url","Original: …","Image: https://…"]}]]}
 *
 * An item is a card (array of lines), a table ({"T": rows, first row = header}), a headline
 * ({"H": [title, summary, dateline, url, ...extra lines]}) or a string (small print).
 * Card lines: "**" prefix = bold, "~" prefix = numbered step, "-" prefix = small grey text.
 */
import { z } from "zod";
import type { ExtractedImage } from "../extract/types.ts";
import { buildBriefing, type NormalizeInput } from "./index.ts";
import { recoverTextLinks, type LayoutCell, type LayoutItem, type LayoutLine, type LayoutLink, type LayoutTable } from "./layout.ts";
import type { Briefing } from "../../shared/schema.ts";

const itemSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.object({ T: z.array(z.array(z.string())).min(1) }),
  z.object({ H: z.array(z.string()).min(1) }),
]);
const briefSchema = z.object({
  v: z.literal(1),
  t: z.string().min(1),
  d: z.string().optional(),
  n: z.string().optional(),
  s: z.array(z.tuple([z.string().min(1)]).rest(itemSchema)).min(1),
});
type Brief = z.infer<typeof briefSchema>;

export function isBriefText(bytes: Uint8Array): boolean {
  for (const b of bytes.slice(0, 64)) {
    if (b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0xef || b === 0xbb || b === 0xbf) continue;
    return b === 0x7b; // "{"
  }
  return false;
}

const BOX = { x: 0, y: 0, w: 0, h: 0 };
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const NO_IMAGES: ExtractedImage[] = [];

function line(text: string, size: number, bold: boolean, block: number): LayoutLine {
  return { text, bbox: BOX, bold, size, fontName: bold ? "Helvetica-Bold" : "Helvetica", block, page: 1 };
}

function item(type: LayoutItem["type"], lines: LayoutLine[], extra: Partial<LayoutItem> = {}): LayoutItem {
  return { type, page: 1, lines, links: [], images: NO_IMAGES, bbox: BOX, ocr: false, wrappedUrl: false, ...extra };
}

function withLinks(it: LayoutItem): LayoutItem {
  recoverTextLinks(it, 1);
  return it;
}

function cardLines(raw: string[], block: number): LayoutLine[] {
  return raw.map((r) => {
    if (r.startsWith("**")) return line(r.slice(2).trim(), 9, true, block);
    if (r.startsWith("~")) return line(r.slice(1).trim(), 9, false, block);
    if (r.startsWith("-")) return line(r.slice(1).trim(), 8, false, block);
    return line(r, 9, false, block);
  });
}

function tableOf(rows: string[][]): LayoutItem {
  const header = rows[0]!;
  const mk = (text: string): LayoutCell => {
    const l = line(text, 9, false, 0);
    const links: LayoutLink[] = [...text.matchAll(URL_RE)].map((m) => ({ url: m[0].replace(/[.,;]+$/, ""), label: undefined, page: 1, source: "text" as const, confidence: "high" as const, bbox: BOX }));
    return { text, lines: [l], links };
  };
  const table: LayoutTable = { page: 1, header, columns: header.map((_, i) => i), rows: rows.slice(1).map((r) => header.map((_, i) => mk(r[i] ?? ""))), bbox: BOX };
  const links = table.rows.flatMap((r) => r.flatMap((c) => c.links));
  return item("table", [], { table, links });
}

function headlineOf(h: string[], block: number): LayoutItem {
  const [title = "", summary = "", dateline = "", url = "", ...extra] = h;
  const lines = [line(title, 9, true, block), line(summary, 9, false, block), line(dateline, 8, false, block)];
  if (url) lines.push(line(url, 8, false, block));
  for (const e of extra) lines.push(line(e, 8, false, block));
  return withLinks(item("block", lines));
}

export function briefToLayout(brief: Brief): LayoutItem[] {
  const out: LayoutItem[] = [item("title", [line(brief.t, 18, true, 0)])];
  if (brief.d) out.push(item("block", [line(brief.d, 9, false, 1)]));
  if (brief.n) out.push(item("block", [line(brief.n, 7, false, 2)]));
  let block = 10;
  for (const [title, ...items] of brief.s) {
    out.push(item("heading", [line(title, 12, true, block++)]));
    for (const it of items) {
      block += 1;
      if (typeof it === "string") out.push(item("block", [line(it, 8, false, block)]));
      else if (Array.isArray(it)) out.push(withLinks(item("block", cardLines(it, block))));
      else if ("T" in it) out.push(tableOf(it.T));
      else out.push(headlineOf(it.H, block));
    }
  }
  return out;
}

export function parseBrief(text: string): Brief {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch (err) {
    throw new BriefError(`the briefing file is not valid JSON (${(err as Error).message})`);
  }
  const r = briefSchema.safeParse(json);
  if (!r.success) throw new BriefError(`the briefing file has the wrong shape: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

/** Compact JSON briefing → typed Briefing, through the same parsers the PDF path uses. */
export function normalizeBrief(text: string, input: Omit<NormalizeInput, "extracted" | "pdfUrl">): Briefing {
  const brief = parseBrief(text);
  const extracted = { pageCount: 1, pages: [], meta: { title: brief.t, producer: "ofd-brief", creationDate: null }, ocrUsed: false, warnings: [] };
  return buildBriefing(briefToLayout(brief), { ...input, extracted, pdfUrl: "" });
}
