import type { Item } from "@shared/schema";
import { formatDateTimeIST, timeAgo } from "@shared/ist";
import { Icon, PageRef, copyText, useToast } from "./ui.tsx";

interface Ctx { pdfUrl: string; now: Date }

const line = (parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ");

function meta(item: Item, now: Date): { ago: string; full: string | undefined; source: string | undefined } {
  const h = item.headline!;
  const when = h.timestamp ? new Date(h.timestamp) : null;
  return {
    ago: when ? timeAgo(when, now) : h.timestampText ?? "",
    full: when ? formatDateTimeIST(when) : h.timestampText,
    source: h.source,
  };
}

function Actions({ url }: { url: string | null }) {
  const toast = useToast();
  if (!url) return null;
  return (
    <div className="news-actions">
      <a className="btn quiet" href={url} target="_blank" rel="noreferrer" title={url}>{Icon.open()} Read article</a>
      <button className="btn icon quiet" type="button" aria-label="Copy article link" title="Copy link" onClick={async () => toast((await copyText(url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
    </div>
  );
}

/** The top story: a wide image with the headline over it, then the summary. */
export function LeadStory({ item, ctx, tag }: { item: Item; ctx: Ctx; tag?: string }) {
  const h = item.headline!;
  const img = item.images[0];
  const m = meta(item, ctx.now);
  return (
    <article className="lead fade-in">
      <div className="lead-media">
        {img ? <img src={img.url} alt="" loading="eager" /> : <div className="lead-empty">{Icon.news()}</div>}
        <div className="lead-shade" />
        <div className="lead-over">
          <span className="lead-meta" title={m.full}>{tag && <b className="tag">{tag}</b>}{line([m.ago, m.source])}</span>
          <h3>{h.title}</h3>
        </div>
        <span className="lead-page"><PageRef page={item.page} pdfUrl={ctx.pdfUrl} /></span>
      </div>
      <div className="lead-body">
        {h.summary && <p>{h.summary}</p>}
        <Actions url={h.url} />
      </div>
    </article>
  );
}

/** One story as a compact row; tap to read the summary and open or copy the article. */
export function StoryRow({ item, ctx, tag }: { item: Item; ctx: Ctx; tag?: string }) {
  const h = item.headline!;
  const img = item.images[0];
  const m = meta(item, ctx.now);
  return (
    <details className="story">
      <summary>
        {img ? <img className="story-thumb" src={img.url} alt="" loading="lazy" /> : <span className="story-thumb empty">{Icon.news()}</span>}
        <span className="story-text">
          <span className="story-title">{h.title}</span>
          <span className="story-meta" title={m.full}>{tag && <b className="tag">{tag}</b>}{line([m.ago, m.source])}</span>
        </span>
        {Icon.chev()}
      </summary>
      <div className="story-body">
        {h.summary && <p>{h.summary}</p>}
        <div className="story-foot">
          <Actions url={h.url} />
          <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
        </div>
      </div>
    </details>
  );
}
