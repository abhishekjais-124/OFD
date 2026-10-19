/**
 * Layout analysis: turns the positioned lines of a page into headings, tables and
 * "items" (cards and paragraphs), and attaches link annotations and images to them.
 * Nothing here knows what a briefing is; the section parsers do.
 */
import type { ExtractedImage, ExtractedLine, ExtractedLink, ExtractedPage, Rect } from "../extract/types.ts";

export interface LayoutLine extends ExtractedLine {
  page: number;
}

export interface LayoutLink {
  url: string;
  label: string | undefined;
  page: number;
  source: "annotation" | "text";
  confidence: "high" | "low";
  bbox: Rect;
}

export interface LayoutCell {
  text: string;
  lines: LayoutLine[];
  links: LayoutLink[];
}

export interface LayoutTable {
  page: number;
  header: string[];
  columns: number[];
  rows: LayoutCell[][];
  bbox: Rect;
  caption?: string;
}

export type LayoutItemType = "title" | "heading" | "subheading" | "block" | "table";

export interface LayoutItem {
  type: LayoutItemType;
  page: number;
  lines: LayoutLine[];
  links: LayoutLink[];
  images: ExtractedImage[];
  table?: LayoutTable;
  bbox: Rect;
  /** True when any line came from OCR. */
  ocr: boolean;
  /** True when a URL had to be joined across wrapped lines without an annotation. */
  wrappedUrl: boolean;
}

const X_TOL = 3;
/** A new table row starts when baselines are further apart than this many font sizes. */
const ROW_GAP_FACTOR = 1.5;
const ITEM_GAP = 18;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function bboxOf(lines: { bbox: Rect }[]): Rect {
  return lines.slice(1).reduce((acc, l) => union(acc, l.bbox), { ...lines[0]!.bbox });
}

function vOverlap(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}
function hOverlap(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
}

function sameRow(a: LayoutLine, b: LayoutLine): boolean {
  return Math.abs(a.bbox.y - b.bbox.y) <= 2;
}

/** Sorts lines in reading order: top to bottom, then left to right. */
function readingOrder(lines: LayoutLine[]): LayoutLine[] {
  return [...lines].sort((a, b) => (Math.abs(a.bbox.y - b.bbox.y) <= 2 ? a.bbox.x - b.bbox.x : a.bbox.y - b.bbox.y));
}

export interface PageContext {
  bodySize: number;
  headingSize: number;
  leftMargin: number;
}

/** Sizes are judged against the whole document so a table-heavy page does not hide headings. */
export function documentContext(pages: ExtractedPage[]): Omit<PageContext, "leftMargin"> {
  const sizes = pages.flatMap((p) => p.lines.map((l) => l.size)).sort((a, b) => a - b);
  const bodySize = sizes.length ? sizes[Math.floor(sizes.length * 0.25)]! : 9;
  return { bodySize, headingSize: Math.max(bodySize * 1.2, 11) };
}

export function pageContext(lines: LayoutLine[], doc: Omit<PageContext, "leftMargin">): PageContext {
  return { ...doc, leftMargin: Math.min(...lines.map((l) => l.bbox.x)) };
}

function aloneOnRow(l: LayoutLine, lines: LayoutLine[]): boolean {
  return !lines.some((o) => o !== l && sameRow(o, l));
}

function isHeading(l: LayoutLine, ctx: PageContext, lines: LayoutLine[]): boolean {
  return l.bold && l.size >= ctx.headingSize && l.text.length <= 80 && !/https?:\/\//.test(l.text) && aloneOnRow(l, lines);
}

function columnIndex(x: number, columns: number[]): number {
  for (let i = 0; i < columns.length; i++) if (Math.abs(x - columns[i]!) <= X_TOL) return i;
  return -1;
}

/**
 * Finds a table that starts at `start` in reading-ordered `lines`: a bold header row of
 * at least two cells on one baseline, followed by lines that all start on a column.
 */
function detectTable(lines: LayoutLine[], start: number, ctx: PageContext, columnsHint?: number[]): { table: LayoutTable; end: number } | null {
  let columns: number[];
  let header: string[] = [];
  let i = start;
  if (columnsHint) {
    columns = columnsHint;
  } else {
    const first = lines[start]!;
    if (!first.bold || isHeading(first, ctx, lines)) return null;
    const headerCells: LayoutLine[] = [first];
    let j = start + 1;
    while (j < lines.length && sameRow(first, lines[j]!) && lines[j]!.bold) {
      headerCells.push(lines[j]!);
      j++;
    }
    if (headerCells.length < 2) return null;
    columns = headerCells.map((c) => c.bbox.x);
    header = headerCells.map((c) => c.text);
    i = j;
  }

  // collect body lines while they start on a column, or sit inside a column span right
  // below the previous table line (badges and indented cell content)
  const body: LayoutLine[] = [];
  const assigned = new Map<LayoutLine, number>();
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (isHeading(l, ctx, lines)) break;
    let col = columnIndex(l.bbox.x, columns);
    if (col < 0) {
      const prev = body[body.length - 1];
      const close = prev ? l.bbox.y - prev.bbox.y <= Math.max(l.size, prev.size) * 1.6 : false;
      const span = columns.findIndex((c, k) => l.bbox.x > c && (k + 1 >= columns.length || l.bbox.x < columns[k + 1]!));
      if (!close || span < 0) break;
      col = span;
    }
    assigned.set(l, col);
    body.push(l);
  }
  if (!body.length) return null;
  if (!columnsHint && body.every((l) => assigned.get(l) === 0)) return null; // single column: not a table

  // split rows on vertical gaps larger than the usual line pitch
  const ys = [...new Set(body.map((l) => Math.round(l.bbox.y)))].sort((a, b) => a - b);
  // Wrapped lines inside a cell sit about 1.2 font sizes apart; a new row adds the cell
  // padding on top of that, so anything beyond 1.5 font sizes starts a row.
  const sizes = body.map((l) => l.size).sort((a, b) => a - b);
  const cellSize = sizes[Math.floor(sizes.length / 2)]!;
  const breaks = new Set<number>();
  for (let k = 1; k < ys.length; k++) {
    if (ys[k]! - ys[k - 1]! > cellSize * ROW_GAP_FACTOR) breaks.add(ys[k]!);
  }

  const rows: LayoutCell[][] = [];
  let current: LayoutCell[] | null = null;
  let lastY = -Infinity;
  for (const l of body) {
    const y = Math.round(l.bbox.y);
    if (!current || (breaks.has(y) && y !== lastY)) {
      current = columns.map(() => ({ text: "", lines: [], links: [] }));
      rows.push(current);
    }
    lastY = y;
    const cell = current[assigned.get(l) ?? 0]!;
    cell.lines.push(l);
  }
  for (const row of rows) for (const cell of row) cell.text = joinWrapped(cell.lines.map((l) => l.text));

  const all = header.length ? [...body] : body;
  return {
    table: { page: body[0]!.page, header, columns, rows, bbox: bboxOf(all) },
    end: start + (header.length ? header.length : 0) + body.length,
  };
}

/** Joins wrapped lines; glues URL fragments without a space. */
export function joinWrapped(lines: string[]): string {
  let out = "";
  for (const line of lines) {
    if (!out) { out = line; continue; }
    const tail = out.slice(-40);
    const continuesUrl = /https?:\/\/\S*$/.test(tail) && /^[^\s]+$/.test(line.split(" ")[0] ?? "") && !/^[A-Z][a-z]+:/.test(line);
    out += continuesUrl ? line : ` ${line}`;
  }
  return out;
}

function attachLinks(items: LayoutItem[], links: ExtractedLink[], page: number): void {
  for (const link of links) {
    let best: { item: LayoutItem; line: LayoutLine; score: number } | null = null;
    for (const item of items) {
      const candidates = item.table ? item.table.rows.flatMap((r) => r.flatMap((c) => c.lines)) : item.lines;
      for (const line of candidates) {
        const v = vOverlap(line.bbox, link.bbox);
        const h = hOverlap(line.bbox, link.bbox);
        if (v <= 0 || h <= 0) continue;
        const score = v * h;
        if (!best || score > best.score) best = { item, line, score };
      }
    }
    if (!best) continue;
    const label = labelFor(best.item, best.line, link.url);
    const layoutLink: LayoutLink = { url: link.url, label, page, source: "annotation", confidence: "high", bbox: link.bbox };
    if (best.item.table) {
      for (const row of best.item.table.rows) for (const cell of row) {
        if (cell.lines.includes(best.line) && !cell.links.some((l) => l.url === link.url)) cell.links.push(layoutLink);
      }
    }
    if (!best.item.links.some((l) => l.url === link.url)) best.item.links.push(layoutLink);
  }
}

/** The text printed before the URL on its line, else the previous line when it ends with ":", else undefined. */
function labelFor(item: LayoutItem, line: LayoutLine, url: string): string | undefined {
  const text = line.text;
  const idx = text.indexOf(url.slice(0, 30));
  if (idx > 0) {
    const before = text.slice(0, idx).trim().replace(/[:：]$/, "").trim();
    if (before) return lastClause(before);
  }
  if (idx === 0 || !/https?:\/\//.test(text)) {
    const i = item.lines.indexOf(line);
    const prev = i > 0 ? item.lines[i - 1] : undefined;
    if (prev && /:$/.test(prev.text.trim())) return prev.text.trim().replace(/:$/, "");
  }
  return undefined;
}

function lastClause(s: string): string | undefined {
  const parts = s.replace(/[\s·]+$/, "").split(/\s+·\s+|\s{2,}/);
  const last = parts[parts.length - 1]!.trim();
  if (!last || /https?:\/\//.test(last)) return undefined;
  return last;
}

/** URLs printed as text that have no annotation: recovered with lower confidence. */
function recoverTextLinks(item: LayoutItem, page: number): void {
  const known = item.links.map((l) => l.url);
  const texts = item.lines.map((l) => l.text);
  const joined = joinWrapped(texts);
  const wrapped = texts.some((t, i) => /https?:\/\/\S*$/.test(t) && i + 1 < texts.length && /^\S+$/.test(texts[i + 1]!));
  for (const m of joined.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (known.some((k) => k === url || k.startsWith(url) || url.startsWith(k))) continue;
    const covered = item.lines.find((l) => l.text.includes(url.slice(0, 20)));
    item.links.push({
      url,
      label: covered ? labelFor(item, covered, url) : undefined,
      page,
      source: "text",
      confidence: wrapped ? "low" : "high",
      bbox: covered?.bbox ?? item.bbox,
    });
    if (wrapped) item.wrappedUrl = true;
  }
}

function attachImages(items: LayoutItem[], images: ExtractedImage[], page: number): void {
  for (const image of images) {
    let best: { item: LayoutItem; score: number } | null = null;
    for (const item of items) {
      if (item.type === "heading" || item.type === "title") continue;
      const v = vOverlap(item.bbox, image.bbox);
      if (v <= 0) continue;
      const score = v - (hOverlap(item.bbox, image.bbox) > 0 ? 0 : 0.5);
      if (!best || score > best.score) best = { item, score };
    }
    if (best) best.item.images.push(image);
    else items.push({ type: "block", page, lines: [], links: [], images: [image], bbox: image.bbox, ocr: false, wrappedUrl: false });
  }
}

/**
 * Lays out one page. `continueTable` carries the column positions of a table that
 * ended at the bottom of the previous page, so its remaining rows are recognised.
 */
export function layoutPage(page: ExtractedPage, doc: Omit<PageContext, "leftMargin">, continueTable?: LayoutTable): LayoutItem[] {
  const lines = readingOrder(page.lines.map((l) => ({ ...l, page: page.number })));
  if (!lines.length) return [];
  const ctx = pageContext(lines, doc);
  const items: LayoutItem[] = [];
  let i = 0;

  // continuation rows of a table split across pages
  if (continueTable) {
    const cont = detectTable(lines, 0, ctx, continueTable.columns);
    if (cont && cont.table.rows.length) {
      items.push({ type: "table", page: page.number, lines: [], links: [], images: [], table: { ...cont.table, header: continueTable.header }, bbox: cont.table.bbox, ocr: page.ocr, wrappedUrl: false });
      i = cont.end;
    }
  }

  let current: LayoutItem | null = null;
  const flush = () => { if (current) items.push(current); current = null; };

  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const biggest = page.number === 1 && l.size >= ctx.headingSize * 1.3 && i === 0;
    if (biggest) {
      flush();
      items.push({ type: "title", page: page.number, lines: [l], links: [], images: [], bbox: l.bbox, ocr: page.ocr, wrappedUrl: false });
      continue;
    }
    if (isHeading(l, ctx, lines)) {
      flush();
      items.push({ type: "heading", page: page.number, lines: [l], links: [], images: [], bbox: l.bbox, ocr: page.ocr, wrappedUrl: false });
      continue;
    }
    const table = detectTable(lines, i, ctx);
    if (table) {
      flush();
      items.push({ type: "table", page: page.number, lines: [], links: [], images: [], table: table.table, bbox: table.table.bbox, ocr: page.ocr, wrappedUrl: false });
      i = table.end - 1;
      continue;
    }
    const gap = current ? l.bbox.y - (current.bbox.y + current.bbox.h) : Infinity;
    const atMargin = Math.abs(l.bbox.x - ctx.leftMargin) <= X_TOL;
    const standaloneBold = l.bold && atMargin && (i + 1 >= lines.length || lines[i + 1]!.bbox.y - (l.bbox.y + l.bbox.h) > 4);
    const currentAtMargin = current ? current.lines.every((c) => Math.abs(c.bbox.x - ctx.leftMargin) <= X_TOL) : false;
    const indentChange = current ? atMargin !== currentAtMargin : false;
    if (current && gap <= ITEM_GAP && !standaloneBold && !indentChange && current.type !== "subheading") {
      current.lines.push(l);
      current.bbox = union(current.bbox, l.bbox);
      continue;
    }
    flush();
    current = {
      type: standaloneBold ? "subheading" : "block",
      page: page.number,
      lines: [l],
      links: [],
      images: [],
      bbox: { ...l.bbox },
      ocr: page.ocr,
      wrappedUrl: false,
    };
  }
  flush();

  attachLinks(items, page.links, page.number);
  for (const item of items) if (item.type === "block" || item.type === "subheading") recoverTextLinks(item, page.number);
  attachImages(items, page.images, page.number);
  return items;
}

/** Lays out every page, carrying tables across page breaks. */
export function layoutDocument(pages: ExtractedPage[]): LayoutItem[] {
  const out: LayoutItem[] = [];
  const doc = documentContext(pages);
  let lastTable: LayoutTable | undefined;
  for (const page of pages) {
    const items = layoutPage(page, doc, lastTable);
    if (lastTable && items[0]?.type === "table" && items[0].table && items[0].table.header === lastTable.header) {
      const prev = out[out.length - 1]!;
      prev.table!.rows.push(...items[0].table.rows);
      prev.links.push(...items[0].links);
      items.shift();
    }
    out.push(...items);
    const last = items[items.length - 1] ?? out[out.length - 1];
    lastTable = last?.type === "table" ? last.table : undefined;
  }
  // a subheading directly followed by a table (even across a page break) is its caption
  const consumed = new Set<LayoutItem>();
  for (let k = 0; k + 1 < out.length; k++) {
    const a = out[k]!;
    const b = out[k + 1]!;
    if (a.type === "subheading" && b.type === "table" && b.table && !b.table.caption) {
      b.table.caption = a.lines.map((l) => l.text).join(" ");
      consumed.add(a);
    }
  }
  return out.filter((it) => !consumed.has(it));
}
