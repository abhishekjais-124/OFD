import { useEffect, useMemo, useRef, useState } from "react";
import type { Briefing, Item, Section } from "@shared/schema";
import { formatDateTimeIST, formatLongDateIST, greetingIST, nameFromGreetingTitle } from "@shared/ist";
import { formatBytes } from "@shared/more";
import { Segmented } from "../components/nav.tsx";
import { AlertList, UpdateRow } from "../components/mail.tsx";
import { JobView, QuestionView } from "../components/learn.tsx";
import { MentionList } from "../components/mentions.tsx";
import { NewsCarousel, StoryRow } from "../components/news.tsx";
import { mixStories } from "@shared/news";
import { ItemView } from "../components/sections.tsx";
import { Chip, Icon } from "../components/ui.tsx";
import { ActionRow, AboutRow, BriefingHeader, DayPills, NotesRow, SettingsGroup, SourcesRow, UploadRow } from "../components/more.tsx";
import { SkyScene, WeatherIcon, type WeatherState } from "../weather.tsx";
import { filterSections, countItems } from "../search.ts";

export interface PageProps {
  briefing: Briefing;
  todayIST: string;
  now: Date;
  cached: boolean;
  notices: string[];
  sourceKind: "drive" | "upload" | null;
  weather: WeatherState;
  onLocate: () => void;
}

const ctxOf = (p: PageProps) => ({ pdfUrl: p.briefing.pdfUrl, now: p.now });
const sectionsOf = (b: Briefing, ...kinds: Section["kind"][]) => b.sections.filter((s) => kinds.includes(s.kind));
const allItems = (sections: Section[]) => sections.flatMap((s) => s.items);

function Empty({ text }: { text: string }) {
  return <div className="state"><p>{text}</p></div>;
}

function Group({ title, count, pill, children }: { title: string; count?: number; pill?: "danger" | "accent"; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{count !== undefined && <span className={`count${pill ? ` pill ${pill}` : ""}`}>{count}</span>}</div>
      <div className="stack">{children}</div>
    </section>
  );
}

/* ---------------- Today ---------------- */
/** Shown by the refresh toast already, so it is not repeated as a banner. */
const NO_NEWER = "Drive has no newer version of this file.";

function WeatherReadout({ state, onLocate }: { state: WeatherState; onLocate: () => void }) {
  if (state.status === "locating" || state.status === "loading") {
    return <div className="wx"><span className="skeleton" style={{ width: 180, height: 44, borderRadius: 14 }} /></div>;
  }
  if (state.status !== "ok") {
    return (
      <div className="wx wx-ask">
        <span className="small">{"message" in state ? state.message : ""}</span>
        <button className="btn sm" type="button" onClick={onLocate}>{Icon.pin()} Use my location for weather</button>
      </div>
    );
  }
  const w = state.weather;
  return (
    <div className="wx">
      <span className="wx-icon"><WeatherIcon sky={w.sky} isDay={w.isDay} /></span>
      <span className="wx-temp">{w.tempC}°</span>
      <div className="wx-meta">
        <strong>{w.label}{w.place && <span className="wx-place"> · {w.place}</span>}</strong>
        <span>{[`Feels ${w.feelsC}°`, w.highC !== null && w.lowC !== null ? `H ${w.highC}° · L ${w.lowC}°` : null].filter(Boolean).join(" · ")}</span>
      </div>
    </div>
  );
}

/** Salutation for the current IST hour, with the name taken from the document title. */
function greeting(title: string, now: Date): string {
  const name = nameFromGreetingTitle(title);
  return `${greetingIST(now)}${name ? `, ${name}` : ""}`;
}

export function TodayPage(p: PageProps) {
  const { briefing: b } = p;
  const ctx = ctxOf(p);
  const isToday = b.date === p.todayIST;
  const wx = p.weather.status === "ok" ? p.weather.weather : null;
  const actions = allItems(sectionsOf(b, "mail")).filter((i) => i.kind === "action" && i.action);
  actions.sort((x, y) => (x.action!.deadlineDate ?? "9999").localeCompare(y.action!.deadlineDate ?? "9999"));
  const glance = allItems(sectionsOf(b, "glance"));
  const calendar = allItems(sectionsOf(b, "calendar"));
  const slackSection = sectionsOf(b, "slack");
  const mentions = allItems(slackSection);
  return (
    <>
      <div className="hero fade-in" data-sky={wx?.sky ?? "none"} data-day={wx ? (wx.isDay ? "day" : "night") : "none"}>
        {wx && <SkyScene sky={wx.sky} isDay={wx.isDay} />}
        <span className="eyebrow">{p.sourceKind === "upload" ? "Uploaded file" : isToday ? "Today" : "Not today"}</span>
        <h2 className="hero-title">{greeting(b.title, p.now)}</h2>
        <p className="date">{b.date ? formatLongDateIST(b.date) : "Date unknown"}{b.dateSource === "content" ? " (read from the document)" : ""}</p>
        <WeatherReadout state={p.weather} onLocate={p.onLocate} />
        <div className="meta-row">
          {!isToday && p.sourceKind !== "upload" && <Chip tone="warn">Showing {b.date ?? "an undated file"}, today is {p.todayIST}</Chip>}
          {p.sourceKind === "upload" && <Chip tone="accent">{b.source.fileName}</Chip>}
          {b.ocrUsed && <Chip tone="warn">OCR, lower confidence</Chip>}
          {b.confidence === "partial" && <Chip tone="danger">partial extraction</Chip>}
        </div>
      </div>
      {p.notices.filter((n) => n !== NO_NEWER).map((n, i) => <div className="banner info" key={i}>{Icon.warn()}<div className="grow">{n}</div></div>)}
      {actions.length > 0 && <Group title="Needs action" count={actions.length}>{actions.map((it) => <ItemView key={it.id} item={it} ctx={ctx} compact />)}</Group>}
      {slackSection.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Slack mentions</h2>{mentions.some((i) => i.mention) && <span className="count">{Math.min(3, mentions.filter((i) => i.mention).length)}</span>}</div>
          <MentionList items={mentions} now={p.now} pdfUrl={b.pdfUrl} max={3} />
        </section>
      )}
      {glance.length > 0 && (
        <details className="glance-fold">
          <summary><span>At a glance</span>{Icon.chev()}</summary>
          <div className="stack">{glance.map((it) => <ItemView key={it.id} item={it} ctx={ctx} />)}</div>
        </details>
      )}
      {calendar.length > 0 && <Group title="Calendar">{calendar.map((it) => <ItemView key={it.id} item={it} ctx={ctx} />)}</Group>}
      {actions.length + glance.length + calendar.length + slackSection.length === 0 && <Empty text="Nothing recognised for the Today page. Open More for every section." />}
    </>
  );
}

/* ---------------- Mail ---------------- */
export function MailPage(p: PageProps) {
  const ctx = ctxOf(p);
  const items = allItems(sectionsOf(p.briefing, "mail"));
  const important = items.filter((i) => i.kind === "action");
  const alerts = items.filter((i) => i.kind === "alerts");
  const updates = items.filter((i) => i.kind === "github" || i.kind === "share");
  const rest = items.filter((i) => !important.includes(i) && !alerts.includes(i) && !updates.includes(i));
  if (!items.length) return <Empty text="No mail section in this briefing." />;
  return (
    <>
      {important.length > 0 && <Group title="Needs action" count={important.length} pill="danger">{important.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
      {updates.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Updates</h2><span className="count pill accent">{updates.length}</span></div>
          <div className="mlist">{updates.map((i) => <UpdateRow key={i.id} item={i} ctx={ctx} />)}</div>
        </section>
      )}
      {alerts.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Alerts</h2></div>
          <div className="mlist">{alerts.map((i) => <AlertList key={i.id} item={i} ctx={ctx} />)}</div>
        </section>
      )}
      {rest.length > 0 && <Group title="Other">{rest.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
    </>
  );
}

/* ---------------- News ---------------- */
const CAROUSEL_COUNT = 3;

function shortTitle(t: string): string {
  return t.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*headlines\s*/i, " ").trim() || t;
}

/** Most world and India stories shown on the News page: a short, mixed list rather than every headline. */
const NEWS_MAX = 5;
/** Tech and AI stories get their own carousel at the bottom. */
const TECH_MAX = 4;
const isTech = (title: string) => /\b(tech|ai)\b/i.test(title);

export function NewsPage(p: PageProps) {
  const ctx = ctxOf(p);
  const sections = sectionsOf(p.briefing, "headlines");
  if (!sections.length) return <Empty text="No headlines section in this briefing." />;
  const storiesOf = (s: (typeof sections)[number]) => s.items.filter((i) => i.kind === "headline" && i.headline).map((item) => ({ item, time: item.headline!.timestamp ? Date.parse(item.headline!.timestamp) : null }));
  const main = sections.filter((s) => !isTech(s.title));
  const techSections = sections.filter((s) => isTech(s.title));
  const picked = mixStories(main.map(storiesOf), NEWS_MAX);
  const tags = main.map((s) => shortTitle(s.title));
  // the top stories swipe as cards; the rest stay as the compact list underneath
  const featured = picked.slice(0, CAROUSEL_COUNT);
  const rest = picked.slice(CAROUSEL_COUNT);
  const tech = techSections
    .flatMap((s) => storiesOf(s))
    .sort((a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity))
    .slice(0, TECH_MAX);
  return (
    <>
      {featured.length > 0 && (
        <section className="news-block">
          <div className="section-head"><h2>Top stories</h2></div>
          <NewsCarousel stories={featured.map((r) => ({ item: r.story.item, tag: tags[r.group] }))} ctx={ctx} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="section news-block">
          <div className="section-head"><h2>Also today</h2><span className="count">{rest.length}</span></div>
          <div className="stories">{rest.map((r) => <StoryRow key={r.story.item.id} item={r.story.item} ctx={ctx} tag={tags[r.group]} />)}</div>
        </section>
      )}
      {tech.length > 0 && (
        <section className="section news-tech">
          <div className="section-head"><h2>Tech &amp; AI</h2><span className="count pill accent">{tech.length}</span></div>
          <NewsCarousel stories={tech.map((t) => ({ item: t.item, tag: "Tech & AI" }))} ctx={ctx} label="Tech and AI stories" />
        </section>
      )}
      {picked.length + tech.length === 0 && <Empty text="No stories in this briefing." />}
    </>
  );
}

/* ---------------- Learn ---------------- */
export function LearnPage(p: PageProps) {
  const ctx = ctxOf(p);
  const q = allItems(sectionsOf(p.briefing, "question")).find((i) => i.kind === "question" && i.question);
  const jobs = allItems(sectionsOf(p.briefing, "job"));
  const hasJob = jobs.some((i) => i.kind === "job" && i.job);
  const tabs = [
    ...(q ? [{ id: "question", label: "Question" }] : []),
    ...(hasJob ? [{ id: "job", label: "Job" }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "question");
  if (!tabs.length) return <Empty text="No question or job in this briefing." />;
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;
  return (
    <>
      <Segmented value={active} onChange={setTab} options={tabs} />
      {active === "question" && q && <QuestionView item={q} ctx={ctx} />}
      {active === "job" && <JobView items={jobs} ctx={ctx} />}
    </>
  );
}

/* ---------------- Search ---------------- */
const RECENT_KEY = "ofd.recent";
function loadRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 6) : []; } catch { return []; }
}
function saveRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/** Highlights every search term in the rendered results with the CSS Custom Highlight API. */
function useHighlight(container: React.RefObject<HTMLElement | null>, query: string, deps: unknown[]) {
  useEffect(() => {
    const css = CSS as unknown as { highlights?: Map<string, unknown> };
    const Highlight = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
    const el = container.current;
    if (!css.highlights || !Highlight || !el) return;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    css.highlights.delete("ofd-search");
    if (!terms.length) return;
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").toLowerCase();
      for (const term of terms) {
        for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + term.length)) {
          const r = new Range();
          r.setStart(n, i);
          r.setEnd(n, i + term.length);
          ranges.push(r);
        }
      }
    }
    if (ranges.length) css.highlights.set("ofd-search", new Highlight(...ranges));
    return () => { css.highlights?.delete("ofd-search"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ...deps]);
}

/** Suggestions drawn from the briefing itself: the sites its links point to and its section names. */
function suggestionsFor(b: Briefing): string[] {
  const hosts = new Map<string, number>();
  for (const s of b.sections) for (const i of s.items) for (const l of i.links) {
    try { const h = new URL(l.url).hostname.replace(/^www\./, ""); hosts.set(h, (hosts.get(h) ?? 0) + 1); } catch { /* skip */ }
  }
  const top = [...hosts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([h]) => h);
  return [...top, "deadline", "apply"];
}

export function SearchPage({ briefing, now, query, setQuery }: { briefing: Briefing; now: Date; query: string; setQuery: (q: string) => void }) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterSections(briefing, { query, sectionId }), [briefing, query, sectionId]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const active = query.trim().length > 0;
  const showing = active || sectionId !== null;
  const total = countItems(results);
  const ctx = { pdfUrl: briefing.pdfUrl, now };
  useHighlight(resultsRef, query, [results]);

  const remember = (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    setRecent(next);
    saveRecent(next);
  };
  // remember a search once the user pauses on a query that found something
  useEffect(() => {
    if (!active || total === 0) return;
    const t = setTimeout(() => remember(query), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, total]);

  const pick = (q: string) => { setQuery(q); input.current?.blur(); };

  return (
    <>
      <form className="search big" onSubmit={(e) => { e.preventDefault(); remember(query); input.current?.blur(); }} role="search">
        {Icon.search()}
        <input ref={input} autoFocus type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links, text, tables" aria-label="Search this briefing" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {query && <button className="btn ghost icon clear" type="button" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Clear search">{Icon.x()}</button>}
      </form>
      <div className="chips" aria-label="Limit to a section">
        <button className={`btn sm${sectionId === null ? " on" : ""}`} type="button" onClick={() => setSectionId(null)}>All</button>
        {briefing.sections.map((s) => <button key={s.id} className={`btn sm${sectionId === s.id ? " on" : ""}`} type="button" onClick={() => setSectionId(sectionId === s.id ? null : s.id)}>{s.title}</button>)}
      </div>

      {!showing && (
        <>
          {recent.length > 0 && (
            <div className="search-section">
              <h2>Recent <button type="button" onClick={() => { setRecent([]); saveRecent([]); }}>Clear</button></h2>
              <div className="chips wrap">{recent.map((r) => <button key={r} className="btn sm hist" type="button" onClick={() => pick(r)}>{Icon.reprocess()} {r}</button>)}</div>
            </div>
          )}
          <div className="search-section">
            <h2>Try</h2>
            <div className="chips wrap">{suggestionsFor(briefing).map((q) => <button key={q} className="btn sm" type="button" onClick={() => pick(q)}>{q}</button>)}</div>
          </div>
        </>
      )}

      {showing && (
        <p className="search-summary" role="status">
          {total === 0 ? <>No matches{active ? <> for <strong>{query.trim()}</strong></> : null}.</> : <><strong>{total}</strong> match{total === 1 ? "" : "es"} in {results.length} section{results.length === 1 ? "" : "s"}</>}
        </p>
      )}
      {showing && total === 0 && (
        <div className="state"><p>Try fewer words, or clear the section filter.</p>
          <div className="actions-row"><button className="btn" type="button" onClick={() => { setQuery(""); setSectionId(null); input.current?.focus(); }}>Reset search</button></div>
        </div>
      )}
      <div ref={resultsRef}>
        {showing && results.map((s) => (
          <Group key={s.id} title={s.title} count={s.items.length}>{s.items.map((i: Item) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>
        ))}
      </div>
    </>
  );
}

/* ---------------- More ---------------- */
export interface MoreProps extends PageProps {
  busy: "refresh" | "reprocess" | "upload" | null;
  availableDates: string[];
  onRefresh: () => void;
  onReprocess: () => void;
  onUpload: (f: File) => void;
  onOpenDate: (d: string | "today") => void;
}

export function MorePage(p: MoreProps) {
  const b = p.briefing;
  const ctx = ctxOf(p);
  const upload = p.sourceKind === "upload";
  const routine = b.sections.filter((s) => s.kind === "routine").flatMap((s) => s.items);
  const extra = b.sections.filter((s) => s.kind === "unknown");
  const pick = (d: string) => p.onOpenDate(d === p.todayIST ? "today" : d);
  return (
    <>
      <BriefingHeader briefing={b} cached={p.cached} now={p.now} busy={p.busy} canRefresh={!upload} onRefresh={p.onRefresh} onReprocess={p.onReprocess} />

      <SettingsGroup title="Open">
        <div className="mlist">
          <ActionRow icon={Icon.pdf()} title="Original PDF" sub={[b.source.fileName, formatBytes(b.source.size)].filter(Boolean).join(" · ")} href={b.pdfUrl} />
          {b.source.webViewLink && <ActionRow icon={Icon.open()} title="On Google Drive" sub="Opens the file in Drive" href={b.source.webViewLink} />}
        </div>
      </SettingsGroup>

      {p.availableDates.length > 1 && (
        <SettingsGroup title="Days">
          <DayPills dates={p.availableDates} today={p.todayIST} current={upload ? null : b.date} onPick={pick} />
        </SettingsGroup>
      )}

      <SettingsGroup>
        <div className="mlist"><UploadRow onFile={p.onUpload} busy={p.busy !== null} /></div>
      </SettingsGroup>

      <SettingsGroup title="Behind the scenes">
        <div className="mlist">
          {routine.map((i) => <SourcesRow key={i.id} item={i} />)}
          <NotesRow briefing={b} />
          <AboutRow briefing={b} />
        </div>
      </SettingsGroup>

      {extra.map((s) => (
        <Group key={s.id} title={s.title} count={s.items.length}>{s.items.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>
      ))}
      <Signature />
    </>
  );
}

/** The maker's mark at the very end of the app. */
function Signature() {
  return (
    <footer className="signature" aria-label="Made by AJ">
      <span className="sig-mark" aria-hidden="true">AJ</span>
      <span className="sig-text">OFD · Of the Day</span>
    </footer>
  );
}

/** More page when there is no briefing to show (missing, error): days and upload still work. */
export function MoreLite(p: Pick<MoreProps, "busy" | "availableDates" | "onUpload" | "onOpenDate" | "todayIST">) {
  return (
    <>
      {p.availableDates.length > 0 && (
        <SettingsGroup title="Days in the folder">
          <DayPills dates={p.availableDates} today={p.todayIST} current={null} onPick={(d) => p.onOpenDate(d === p.todayIST ? "today" : d)} />
        </SettingsGroup>
      )}
      <SettingsGroup title="Read a PDF"><div className="mlist"><UploadRow onFile={p.onUpload} busy={p.busy !== null} /></div></SettingsGroup>
      <Signature />
    </>
  );
}
