import type { Item } from "@shared/schema";
import { formatDateTimeIST, timeAgo } from "@shared/ist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, copyText, useToast } from "./ui.tsx";

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

function Actions({ url, iconOnly = false }: { url: string | null; iconOnly?: boolean }) {
  const toast = useToast();
  if (!url) return null;
  if (iconOnly) {
    return (
      <div className="news-actions icons">
        <a className="btn icon quiet" href={url} target="_blank" rel="noreferrer" aria-label="Read article" title="Read article">{Icon.open()}</a>
        <button className="btn icon quiet" type="button" aria-label="Copy article link" title="Copy link" onClick={async () => toast((await copyText(url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
      </div>
    );
  }
  return (
    <div className="news-actions">
      <a className="btn quiet" href={url} target="_blank" rel="noreferrer" title={url}>{Icon.open()} Read article</a>
      <button className="btn icon quiet" type="button" aria-label="Copy article link" title="Copy link" onClick={async () => toast((await copyText(url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
    </div>
  );
}

/** The top story: a wide image with the headline over it, then the summary. */
export function LeadStory({ item, ctx, tag, eager = true, compact = false }: { item: Item; ctx: Ctx; tag?: string; eager?: boolean; compact?: boolean }) {
  const h = item.headline!;
  const img = item.images[0];
  const m = meta(item, ctx.now);
  return (
    <article className={`lead fade-in${compact ? " compact" : ""}`}>
      <div className="lead-media">
        {img ? <img src={img.url} alt="" loading={eager ? "eager" : "lazy"} /> : <div className="lead-empty">{Icon.news()}</div>}
        <div className="lead-shade" />
        <div className="lead-over">
          <span className="lead-meta" title={m.full}>{tag && <b className="tag">{tag}</b>}{line([m.ago, m.source])}</span>
          <h3>{h.title}</h3>
        </div>
      </div>
      <div className="lead-body">
        {h.summary && <p>{h.summary}</p>}
        <Actions url={h.url} iconOnly={compact} />
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
          <Actions url={h.url} iconOnly />
        </div>
      </div>
    </details>
  );
}

/** All stories as swipeable cards that snap into place, with dots to show and jump to the current one. */
export function NewsCarousel({ stories, ctx, label = "Top stories" }: { stories: { item: Item; tag?: string }[]; ctx: Ctx; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || !el.firstElementChild) return;
    const card = el.firstElementChild as HTMLElement;
    const step = card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    setActive(Math.max(0, Math.min(stories.length - 1, Math.round(el.scrollLeft / step))));
  }, [stories.length]);

  useEffect(() => { track.current?.scrollTo({ left: 0 }); setActive(0); }, [stories.length]);

  const go = (i: number) => {
    (track.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({
      inline: "start",
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  // advance every 3 s, looping; a touch, hover or focus holds it for a few seconds, and it never runs in the background or with reduced motion
  const holdUntil = useRef(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  useEffect(() => {
    if (stories.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.hidden || Date.now() < holdUntil.current) return;
      go((activeRef.current + 1) % stories.length);
    }, 3000);
    return () => clearInterval(id);
  }, [stories.length]);
  const hold = () => { holdUntil.current = Date.now() + 6000; };

  return (
    <section className="carousel" onPointerDown={hold} onPointerEnter={hold} onFocusCapture={hold} onWheel={hold} onTouchMove={hold} aria-roledescription="carousel" aria-label={label}>
      <div className="carousel-track" ref={track} onScroll={onScroll}>
        {stories.map((st, i) => (
          <div className="carousel-slide" key={st.item.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${stories.length}`}>
            <LeadStory item={st.item} ctx={ctx} tag={st.tag} eager={i < 2 && label === "Top stories"} compact />
          </div>
        ))}
      </div>
      {stories.length > 1 && (
        <div className="carousel-dots" role="tablist" aria-label="Choose story">
          {stories.map((st, i) => (
            <button key={st.item.id} type="button" role="tab" aria-selected={i === active} aria-label={`Story ${i + 1}`} className={i === active ? "on" : ""} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </section>
  );
}
