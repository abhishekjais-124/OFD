import type { Briefing, Item, Section } from "@shared/schema";

/** Everything searchable about an item, lowercased once. */
export function itemText(item: Item): string {
  const parts: string[] = [item.title ?? "", ...item.lines];
  for (const f of item.fields) parts.push(f.label, f.text);
  for (const l of item.links) parts.push(l.label ?? "", l.url);
  for (const t of item.tables) {
    parts.push(t.caption ?? "", ...t.header);
    for (const row of t.rows) for (const cell of row) parts.push(cell.text, ...cell.links.map((l) => l.url));
  }
  return parts.join("\n").toLowerCase();
}

export interface Filter {
  query: string;
  sectionId: string | null;
}

/** Sections with only the items matching the filter; empty sections are dropped. */
export function filterSections(briefing: Briefing, filter: Filter): Section[] {
  const q = filter.query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];
  return briefing.sections
    .filter((s) => !filter.sectionId || s.id === filter.sectionId)
    .map((s) => ({
      ...s,
      items: terms.length ? s.items.filter((it) => { const t = itemText(it); return terms.every((term) => t.includes(term)); }) : s.items,
    }))
    .filter((s) => s.items.length > 0);
}

export function countItems(sections: Section[]): number {
  return sections.reduce((n, s) => n + s.items.length, 0);
}
