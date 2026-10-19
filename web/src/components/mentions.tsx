import type { Item } from "@shared/schema";
import { formatDateTimeIST, timeAgo } from "@shared/ist";
import { Icon, PageRef } from "./ui.tsx";

const TONES = ["#8b9dff", "#6ee0a3", "#ffc069", "#ff8a80", "#c79bff", "#7fd6e8"];

/** A stable colour per person, so the same sender always looks the same. */
function toneFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length]!;
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

/** One Slack mention: who, where, what, when. The whole row opens the message. */
export function MentionRow({ item, now, pdfUrl }: { item: Item; now: Date; pdfUrl: string }) {
  const m = item.mention!;
  const when = m.timestamp ? timeAgo(new Date(m.timestamp), now) : m.timeText ?? "";
  const full = m.timestamp ? formatDateTimeIST(new Date(m.timestamp)) : m.timeText;
  const tone = toneFor(m.from);
  const body = (
    <>
      <span className="avatar" style={{ background: `color-mix(in srgb, ${tone} 22%, transparent)`, color: tone }} aria-hidden="true">{initials(m.from)}</span>
      <span className="mention-text">
        <span className="mention-top">
          <strong>{m.from}</strong>
          {m.where && <span className="mention-where">{m.where}</span>}
          <span className="mention-when" title={full}>{when}</span>
        </span>
        <span className="mention-msg">{m.text}</span>
      </span>
    </>
  );
  return (
    <div className="mention">
      {m.url ? <a className="mention-main" href={m.url} target="_blank" rel="noreferrer" title="Open in Slack">{body}</a> : <div className="mention-main">{body}</div>}
      <span className="mention-side">
        <PageRef page={item.page} pdfUrl={pdfUrl} />
        {m.url && <a className="btn ghost icon" href={m.url} target="_blank" rel="noreferrer" aria-label={`Open ${m.from}'s message in Slack`}>{Icon.open()}</a>}
      </span>
    </div>
  );
}

/** The newest few mentions, in a single quiet list. */
export function MentionList({ items, now, pdfUrl, max = 3 }: { items: Item[]; now: Date; pdfUrl: string; max?: number }) {
  const sorted = items
    .filter((i) => i.mention)
    .sort((a, b) => Date.parse(b.mention!.timestamp ?? "") - Date.parse(a.mention!.timestamp ?? "") || 0)
    .slice(0, max);
  if (!sorted.length) return <div className="mlist"><p className="mention-empty">No new mentions</p></div>;
  return <div className="mlist">{sorted.map((i) => <MentionRow key={i.id} item={i} now={now} pdfUrl={pdfUrl} />)}</div>;
}
