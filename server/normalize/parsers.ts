/** Section parsers: turn layout items into typed briefing items. Unknown content stays generic. */
import type { Item, ItemFlag, ItemKind, Link, SectionKind, Table } from "../../shared/schema.ts";
import { parseHumanDate } from "../../shared/ist.ts";
import { field, hostname, parseFields, parseSteps, parseTimestampLine, splitList } from "./fields.ts";
import type { LayoutItem, LayoutLink, LayoutTable } from "./layout.ts";

export function sectionKindFor(title: string): SectionKind {
  const t = title.toLowerCase();
  if (/alerts summary/.test(t)) return "alerts";
  if (/at a glance|summary|overview/.test(t)) return "glance";
  if (/special day|today is/.test(t)) return "special";
  if (/daily extras|extras/.test(t)) return "extras";
  if (/my updates|updates/.test(t) && !/mail/.test(t)) return "updates";
  if (/^mail\b|inbox|e-?mail/.test(t)) return "mail";
  if (/slack|mention/.test(t)) return "slack";
  if (/calendar|invite|meeting/.test(t)) return "calendar";
  if (/headline|news/.test(t)) return "headlines";
  if (/question|problem|leetcode/.test(t)) return "question";
  if (/\bjob|career|role/.test(t)) return "job";
  if (/routine|about this|details/.test(t)) return "routine";
  return "unknown";
}

export interface ParseContext {
  nextId(kind: string): string;
  imageUrl(id: string): string;
}

function toLink(l: LayoutLink): Link {
  return { url: l.url, label: l.label ?? hostname(l.url), page: l.page, source: l.source, confidence: l.confidence };
}

function toTable(t: LayoutTable): Table {
  return {
    header: t.header,
    page: t.page,
    caption: t.caption,
    rows: t.rows.map((row) => row.map((cell) => {
      const badge = /\bBEST MATCH\b/i.exec(cell.text)?.[0];
      return { text: badge ? cell.text.replace(/\s*BEST MATCH\s*/i, " ").trim() : cell.text, links: cell.links.map(toLink), badge: badge?.toUpperCase() };
    })),
  };
}

function baseItem(ctx: ParseContext, item: LayoutItem, kind: ItemKind, extraFlags: ItemFlag[] = []): Item {
  const flags: ItemFlag[] = [...extraFlags];
  if (item.ocr) flags.push("ocr", "low_confidence");
  if (item.wrappedUrl) flags.push("wrapped_url");
  const texts = item.lines.map((l) => l.text);
  // a bold first line is the card's title, not a "Label: value" field
  const { fields } = parseFields(item.lines[0]?.bold ? texts.slice(1) : texts);
  return {
    id: ctx.nextId(kind),
    kind,
    page: item.page,
    lines: texts,
    fields,
    links: item.links.map(toLink),
    images: item.images.map((im) => ({ id: im.id, page: item.page, width: im.width, height: im.height, url: ctx.imageUrl(im.id), bbox: im.bbox })),
    tables: item.table ? [toTable(item.table)] : [],
    flags: [...new Set(flags)],
  };
}

function genericItems(ctx: ParseContext, items: LayoutItem[], flags: ItemFlag[] = []): Item[] {
  return items.map((it) => {
    if (it.type === "table") return baseItem(ctx, it, "table", flags);
    if (it.type === "subheading") return { ...baseItem(ctx, it, "note", flags), title: it.lines.map((l) => l.text).join(" ") };
    const small = it.lines.length > 0 && it.lines.every((l) => l.size < 8.5);
    return baseItem(ctx, it, small ? "note" : "paragraph", flags);
  });
}

export function parseGlance(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => (it.type === "table" ? { ...baseItem(ctx, it, "glance"), title: "At a glance" } : genericItems(ctx, [it])[0]!));
}

export function parseMail(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => {
    if (it.type === "table") return { ...baseItem(ctx, it, "alerts"), title: it.table?.caption ?? "Alerts" };
    if (it.type === "subheading") return genericItems(ctx, [it])[0]!;
    const first = it.lines[0]?.text ?? "";
    if (/^important\b|action needed|action required|deadline/i.test(first)) {
      const base = baseItem(ctx, it, "action");
      const titleLine = it.lines.find((l, i) => i > 0 && l.bold)?.text ?? it.lines[1]?.text ?? first;
      const deadlineText = /(?:by|before|due)\s+(.+)$/i.exec(first)?.[1] ?? first;
      return {
        ...base,
        title: titleLine,
        action: {
          deadlineDate: parseHumanDate(deadlineText) ?? parseHumanDate(first),
          deadlineText: deadlineText.trim(),
          priority: /important/i.test(first) ? "important" : "normal",
          from: field(base.fields, "From")?.split(/\s+·\s+/)[0],
          received: /received\s+(.+?)(?:\s*\(|$)/i.exec(it.lines.map((l) => l.text).join(" "))?.[1]?.trim(),
          steps: parseSteps(it.lines),
        },
      };
    }
    if (/^github\b|pull request|\bPR #\d+/i.test(first)) return { ...baseItem(ctx, it, "github"), title: first };
    if (/^google drive\b|shared with you|\bshared\b.*\bfolder\b/i.test(first)) return { ...baseItem(ctx, it, "share"), title: first };
    const base = baseItem(ctx, it, it.lines.every((l) => l.size < 8.5) ? "note" : "mail");
    return { ...base, title: it.lines[0]?.bold ? first : undefined };
  });
}

export function parseCalendar(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => (it.type === "block" ? baseItem(ctx, it, "calendar") : genericItems(ctx, [it])[0]!));
}

/** Slack mentions: one card each, "**Sender · #channel", "Text: ...", "Time: ...", "Open: <link>". */
export function parseSlack(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => {
    if (it.type !== "block" || !it.lines.length) return genericItems(ctx, [it])[0]!;
    const base = baseItem(ctx, it, "mention");
    const text = field(base.fields, "Text", "Message");
    if (!text) return genericItems(ctx, [it])[0]!;
    const [from, where] = it.lines[0]!.text.split(/\s+·\s+/);
    const timeText = field(base.fields, "Time", "When");
    const ts = timeText ? parseTimestampLine(timeText) : null;
    const link = base.links.find((l) => l.label && /^open/i.test(l.label)) ?? base.links[0];
    return {
      ...base,
      title: from,
      mention: { from: from ?? "", where, text, timeText: ts?.timestampText ?? timeText, timestamp: ts?.timestamp ?? null, url: link?.url ?? null },
    };
  });
}

export function parseHeadlines(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => {
    if (it.type !== "block" || !it.lines.length) return genericItems(ctx, [it])[0]!;
    const texts = it.lines.map((l) => l.text);
    const tsIndex = it.lines.findIndex((l) => parseTimestampLine(l.text));
    const looksLikeHeadline = it.images.length > 0 || tsIndex >= 0;
    if (!looksLikeHeadline) return genericItems(ctx, [it])[0]!;
    const base = baseItem(ctx, it, "headline");
    const titleLines: string[] = [];
    const summaryLines: string[] = [];
    it.lines.forEach((l, i) => {
      if (tsIndex >= 0 && i >= tsIndex) return;
      if (/^https?:\/\//.test(l.text)) return;
      if (l.bold && summaryLines.length === 0) titleLines.push(l.text);
      else summaryLines.push(l.text);
    });
    const ts = tsIndex >= 0 ? parseTimestampLine(texts[tsIndex]!) : null;
    const article = base.links.find((l) => l.source === "annotation") ?? base.links[0];
    return {
      ...base,
      title: titleLines.join(" ") || summaryLines[0],
      headline: {
        title: titleLines.join(" ") || summaryLines.shift() || "",
        summary: summaryLines.join(" ") || undefined,
        timestampText: ts?.timestampText,
        timestamp: ts?.timestamp ?? null,
        source: ts?.source,
        url: article?.url ?? null,
      },
    };
  });
}

export function parseQuestion(ctx: ParseContext, items: LayoutItem[]): Item[] {
  let done = false;
  return items.map((it) => {
    if (done || it.type !== "block" || !it.lines.length) return genericItems(ctx, [it])[0]!;
    done = true;
    const base = baseItem(ctx, it, "question");
    const first = it.lines[0]!.text;
    const m = /^(?:(\d+)\.\s+)?(.+?)(?:\s+·\s+(Easy|Medium|Hard))?$/.exec(first);
    const problem = base.links.find((l) => /problem/i.test(l.label ?? "") || /leetcode\.com\/problems\//.test(l.url)) ?? base.links[0];
    return {
      ...base,
      title: first,
      question: {
        number: m?.[1],
        title: m?.[2] ?? first,
        difficulty: m?.[3],
        problemUrl: problem?.url ?? null,
        fields: base.fields.filter((f) => !/^(Problem|Topics|Companies)$/i.test(f.label)),
        topics: splitList(field(base.fields, "Topics")),
        companies: splitList(field(base.fields, "Companies")),
      },
    };
  });
}

export function parseJob(ctx: ParseContext, items: LayoutItem[]): Item[] {
  let done = false;
  return items.map((it) => {
    if (it.type === "table") return { ...baseItem(ctx, it, "jobs"), title: it.table?.caption ?? "Other roles" };
    if (done || it.type !== "block" || !it.lines.length) return genericItems(ctx, [it])[0]!;
    if (it.lines.every((l) => l.size < 8.5)) return genericItems(ctx, [it])[0]!;
    done = true;
    const base = baseItem(ctx, it, "job");
    const [title, location, posted] = it.lines[0]!.text.split(/\s+·\s+/);
    const apply = base.links.find((l) => /apply|details/i.test(l.label ?? "")) ?? base.links[0];
    return {
      ...base,
      title,
      job: {
        title: title ?? "",
        location,
        postedText: posted,
        applyUrl: apply?.url ?? null,
        fields: base.fields.filter((f) => !/^Apply/i.test(f.label)),
      },
    };
  });
}

export function parseRoutine(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return items.map((it) => (it.type === "block" ? baseItem(ctx, it, "routine") : genericItems(ctx, [it])[0]!));
}

export function parseUnknown(ctx: ParseContext, items: LayoutItem[]): Item[] {
  return genericItems(ctx, items, ["unrecognized"]);
}

export const PARSERS: Record<SectionKind, (ctx: ParseContext, items: LayoutItem[]) => Item[]> = {
  glance: parseGlance,
  mail: parseMail,
  calendar: parseCalendar,
  slack: parseSlack,
  special: parseRoutine,
  extras: parseRoutine,
  updates: parseRoutine,
  alerts: parseRoutine,
  headlines: parseHeadlines,
  question: parseQuestion,
  job: parseJob,
  routine: parseRoutine,
  unknown: parseUnknown,
};
