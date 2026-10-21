import type { Item } from "@shared/schema";
import { formatDateTimeIST, timeAgo } from "@shared/ist";
import { Icon } from "./ui.tsx";

/** "Mon, 19 Oct 2026 14:05 IST" at the start of the card's first line. */
const STAMP = /^[A-Z][a-z]{2},\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}\s*(?:IST|UTC)?/;

const HEADING = /^(?:[A-Za-z][\w ]{1,24}:|in progress|done|completed|worked on)$/i;

function groupParts(list: string[]): { head?: string; items: string[] }[] {
  const out: { head?: string; items: string[] }[] = [];
  for (const p of list) {
    if (HEADING.test(p)) out.push({ head: p, items: [] });
    else (out.length ? out[out.length - 1]! : out[out.push({ items: [] }) - 1]!).items.push(p.replace(/\s*\(in progress\)\.?$/i, ""));
  }
  return out.filter((g) => g.items.length || g.head);
}

function parts(text: string): string[] {
  return text.split(/\s*\u2022\s*/).map((p) => p.replace(/^[\s*\-\u2013]+/, "").trim()).filter(Boolean);
}

/** The latest updates posted in the team channel, newest first, each as a small card with bullets. */
export function UpdateCards({ items, now }: { items: Item[]; now: Date }) {
  return (
    <div className="upd-list">
      {items.map((it) => {
        const stamp = STAMP.exec(it.lines[0] ?? "")?.[0] ?? it.lines[0] ?? "";
        const parsed = Date.parse(stamp.replace(/\s+IST$/, " +0530"));
        const when = Number.isNaN(parsed) ? stamp : timeAgo(new Date(parsed), now);
        const full = Number.isNaN(parsed) ? undefined : formatDateTimeIST(new Date(parsed));
        const text = it.fields.find((f) => /^text$/i.test(f.label))?.text ?? it.lines.filter((l, i) => i > 0 && !/^open:/i.test(l) && !/^https?:/.test(l)).join(" ");
        const bullets = parts(text);
        const url = it.links[0]?.url;
        return (
          <article className="upd fade-in" key={it.id}>
            <div className="upd-top">
              <span className="upd-when" title={full}>{when}</span>
              {url && <a className="btn ghost icon" href={url} target="_blank" rel="noreferrer" aria-label="Open in Slack" title="Open in Slack">{Icon.open()}</a>}
            </div>
            <div className="upd-groups">{groupParts(bullets).map((g, gi) => (
              <section className="upd-g" key={gi}>
                {g.head && <h3 className={`upd-h${/progress|todo|next/i.test(g.head) ? " prog" : ""}`}>{g.head.replace(/:$/, "")}</h3>}
                <ul>{g.items.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </section>
            ))}</div>
          </article>
        );
      })}
    </div>
  );
}

const label = (it: Item, name: RegExp) => it.fields.find((f) => name.test(f.label))?.text;

/** Short view of the latest unique alerts: one compact list, a status dot, title, when, one-line summary. */
export function AlertCards({ items, now }: { items: Item[]; now: Date }) {
  return (
    <div className="alerts">
      {items.map((it) => {
        const title = (it.lines[0] ?? "").replace(/^\*+/, "");
        const stamp = label(it, /^time$/i) ?? "";
        const parsed = Date.parse(stamp.replace(/\s+IST$/, " +0530"));
        const when = Number.isNaN(parsed) ? stamp : timeAgo(new Date(parsed), now);
        const summary = label(it, /^summary$/i) ?? it.lines.slice(1).filter((l) => !/^(open|time):/i.test(l) && !/^https?:/.test(l)).join(" ");
        const url = it.links[0]?.url;
        const resolved = /^\s*(resolved|cleared|ok|recovered)/i.test(summary);
        const row = (
          <>
            <span className={`al-dot${resolved ? " ok" : ""}`} aria-label={resolved ? "Resolved" : "Firing"} />
            <span className="al-main">
              <span className="al-top"><b>{title}</b><span className="al-when">{when}</span></span>
              {summary && <span className="al-sum">{summary}</span>}
            </span>
          </>
        );
        return url
          ? <a className="al-row" key={it.id} href={url} target="_blank" rel="noreferrer">{row}</a>
          : <div className="al-row" key={it.id}>{row}</div>;
      })}
    </div>
  );
}
