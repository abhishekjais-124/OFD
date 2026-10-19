import { useMemo, useState } from "react";
import type { Briefing, Item, Section } from "@shared/schema";
import { formatDateTimeIST, formatLongDateIST } from "@shared/ist";
import { Segmented } from "../components/nav.tsx";
import { ItemView, NotesPanel } from "../components/sections.tsx";
import { Chip, Icon } from "../components/ui.tsx";
import { Upload } from "../components/Upload.tsx";
import { filterSections, countItems } from "../search.ts";

export interface PageProps {
  briefing: Briefing;
  todayIST: string;
  now: Date;
  cached: boolean;
  notices: string[];
  sourceKind: "drive" | "upload" | null;
}

const ctxOf = (p: PageProps) => ({ pdfUrl: p.briefing.pdfUrl, now: p.now });
const sectionsOf = (b: Briefing, ...kinds: Section["kind"][]) => b.sections.filter((s) => kinds.includes(s.kind));
const allItems = (sections: Section[]) => sections.flatMap((s) => s.items);

function Empty({ text }: { text: string }) {
  return <div className="state"><p>{text}</p></div>;
}

function Group({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head"><h2>{title}</h2>{count !== undefined && <span className="count">{count}</span>}</div>
      <div className="stack">{children}</div>
    </section>
  );
}

/* ---------------- Today ---------------- */
export function TodayPage(p: PageProps) {
  const { briefing: b } = p;
  const ctx = ctxOf(p);
  const isToday = b.date === p.todayIST;
  const actions = allItems(sectionsOf(b, "mail")).filter((i) => i.kind === "action" && i.action);
  actions.sort((x, y) => (x.action!.deadlineDate ?? "9999").localeCompare(y.action!.deadlineDate ?? "9999"));
  const glance = allItems(sectionsOf(b, "glance"));
  const calendar = allItems(sectionsOf(b, "calendar"));
  return (
    <>
      <div className="hero fade-in">
        <span className="eyebrow">{p.sourceKind === "upload" ? "Uploaded file" : isToday ? "Today" : "Not today"}</span>
        <h2 className="hero-title">{b.title}</h2>
        <p className="date">{b.date ? formatLongDateIST(b.date) : "Date unknown"}{b.dateSource === "content" ? " (read from the document)" : ""}</p>
        <div className="meta-row">
          {!isToday && p.sourceKind !== "upload" && <Chip tone="warn">Showing {b.date ?? "an undated file"}, today is {p.todayIST}</Chip>}
          {p.sourceKind === "upload" && <Chip tone="accent">{b.source.fileName}</Chip>}
          <Chip title={b.processedAt}>processed {formatDateTimeIST(new Date(b.processedAt))}</Chip>
          {p.cached && <Chip tone="quiet">cached</Chip>}
          {b.ocrUsed && <Chip tone="warn">OCR, lower confidence</Chip>}
          {b.confidence === "partial" && <Chip tone="danger">partial extraction</Chip>}
        </div>
      </div>
      {p.notices.map((n, i) => <div className="banner info" key={i}>{Icon.warn()}<div className="grow">{n}</div></div>)}
      {actions.length > 0 && <Group title="Needs action" count={actions.length}>{actions.map((it) => <ItemView key={it.id} item={it} ctx={ctx} compact />)}</Group>}
      {glance.length > 0 && <Group title="At a glance">{glance.map((it) => <ItemView key={it.id} item={it} ctx={ctx} />)}</Group>}
      {calendar.length > 0 && <Group title="Calendar">{calendar.map((it) => <ItemView key={it.id} item={it} ctx={ctx} />)}</Group>}
      {actions.length + glance.length + calendar.length === 0 && <Empty text="Nothing recognised for the Today page. Open More for every section." />}
    </>
  );
}

/* ---------------- Mail ---------------- */
export function MailPage(p: PageProps) {
  const ctx = ctxOf(p);
  const items = allItems(sectionsOf(p.briefing, "mail"));
  const important = items.filter((i) => i.kind === "action");
  const alerts = items.filter((i) => i.kind === "alerts");
  const rest = items.filter((i) => i.kind !== "action" && i.kind !== "alerts");
  if (!items.length) return <Empty text="No mail section in this briefing." />;
  return (
    <>
      {important.length > 0 && <Group title="Action needed" count={important.length}>{important.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
      {rest.length > 0 && <Group title="Updates" count={rest.length}>{rest.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
      {alerts.length > 0 && <Group title="Automated alerts">{alerts.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
    </>
  );
}

/* ---------------- News ---------------- */
function shortTitle(t: string): string {
  return t.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*headlines\s*/i, " ").trim() || t;
}

export function NewsPage(p: PageProps) {
  const ctx = ctxOf(p);
  const sections = sectionsOf(p.briefing, "headlines");
  const [id, setId] = useState<string>(sections[0]?.id ?? "");
  if (!sections.length) return <Empty text="No headlines section in this briefing." />;
  const active = sections.find((s) => s.id === id) ?? sections[0]!;
  const stories = active.items.filter((i) => i.kind === "headline");
  const other = active.items.filter((i) => i.kind !== "headline");
  return (
    <>
      <Segmented value={active.id} onChange={setId} options={sections.map((s) => ({ id: s.id, label: `${shortTitle(s.title)}` }))} />
      <div className="section"><div className="section-head"><h2>{active.title}</h2><span className="count">{stories.length}</span></div>
        <div className="stack">{stories.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</div>
      </div>
      {other.length > 0 && <Group title="Sources">{other.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>}
    </>
  );
}

/* ---------------- Learn ---------------- */
export function LearnPage(p: PageProps) {
  const ctx = ctxOf(p);
  const q = allItems(sectionsOf(p.briefing, "question"));
  const jobs = allItems(sectionsOf(p.briefing, "job"));
  const tabs = [
    ...(q.length ? [{ id: "question", label: "Question" }] : []),
    ...(jobs.length ? [{ id: "job", label: "Job" }] : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id ?? "question");
  if (!tabs.length) return <Empty text="No question or job in this briefing." />;
  const shown = tab === "job" && jobs.length ? jobs : q.length ? q : jobs;
  const title = shown === jobs ? "Job of the day" : "Question of the day";
  return (
    <>
      <Segmented value={tab} onChange={setTab} options={tabs} />
      <Group title={title}>{shown.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>
    </>
  );
}

/* ---------------- Search ---------------- */
export function SearchPage({ briefing, now, query, setQuery }: { briefing: Briefing; now: Date; query: string; setQuery: (q: string) => void }) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const results = useMemo(() => filterSections(briefing, { query, sectionId }), [briefing, query, sectionId]);
  const active = query.trim().length > 0;
  const ctx = { pdfUrl: briefing.pdfUrl, now };
  return (
    <>
      <div className="search big">
        {Icon.search()}
        <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links, text, tables" aria-label="Search" autoComplete="off" />
        {query && <button className="btn ghost icon clear" type="button" onClick={() => setQuery("")} aria-label="Clear search">{Icon.x()}</button>}
      </div>
      <div className="chips" aria-label="Sections">
        <button className={`btn sm${sectionId === null ? " on" : ""}`} type="button" onClick={() => setSectionId(null)}>All</button>
        {briefing.sections.map((s) => <button key={s.id} className={`btn sm${sectionId === s.id ? " on" : ""}`} type="button" onClick={() => setSectionId(sectionId === s.id ? null : s.id)}>{s.title}</button>)}
      </div>
      {!active && sectionId === null && <div className="state"><p>Type to search every section of this briefing.</p></div>}
      {(active || sectionId !== null) && results.length === 0 && <div className="state"><h2>No matches</h2><p>Nothing matches "{query}".</p></div>}
      {(active || sectionId !== null) && results.map((s) => (
        <Group key={s.id} title={s.title} count={s.items.length}>{s.items.map((i: Item) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>
      ))}
      {(active || sectionId !== null) && results.length > 0 && <p className="small muted" style={{ marginTop: 14 }}>{countItems(results)} matching item{countItems(results) === 1 ? "" : "s"}</p>}
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
  const other = b.sections.filter((s) => s.kind === "routine" || s.kind === "unknown");
  const cached = p.sourceKind !== "upload";
  return (
    <>
      <Group title="This briefing">
        <article className="card">
          <dl className="fields" style={{ marginTop: 0 }}>
            <dt>Date</dt><dd>{b.date ? formatLongDateIST(b.date) : "unknown"}</dd>
            <dt>File</dt><dd>{b.source.fileName}</dd>
            <dt>Processed</dt><dd>{formatDateTimeIST(new Date(b.processedAt))}</dd>
            {b.source.modifiedTime && <><dt>Drive version</dt><dd>{formatDateTimeIST(new Date(b.source.modifiedTime))}</dd></>}
            <dt>Pages</dt><dd>{b.pageCount}</dd>
          </dl>
          <div className="actions-row" style={{ marginTop: 14 }}>
            {cached && <button className="btn" type="button" onClick={p.onRefresh} disabled={p.busy !== null}>{Icon.refresh(p.busy === "refresh" ? "spin" : undefined)} Refresh</button>}
            <button className="btn" type="button" onClick={p.onReprocess} disabled={p.busy !== null}>{Icon.reprocess(p.busy === "reprocess" ? "spin" : undefined)} Reprocess</button>
            <a className="btn" href={b.pdfUrl} target="_blank" rel="noreferrer">{Icon.pdf()} Original PDF</a>
            {b.source.webViewLink && <a className="btn ghost" href={b.source.webViewLink} target="_blank" rel="noreferrer">{Icon.open()} On Drive</a>}
          </div>
        </article>
      </Group>

      {p.availableDates.length > 0 && (
        <Group title="Other days">
          <div className="chips wrap">
            {p.availableDates.map((d) => (
              <button key={d} className={`btn sm${b.date === d && p.sourceKind !== "upload" ? " on" : ""}`} type="button" onClick={() => p.onOpenDate(d === p.todayIST ? "today" : d)}>{d === p.todayIST ? "Today" : d}</button>
            ))}
          </div>
        </Group>
      )}

      <Group title="Read another PDF"><Upload onFile={p.onUpload} busy={p.busy !== null} /></Group>

      {other.length > 0 && other.map((s) => (
        <Group key={s.id} title={s.title} count={s.items.length}>{s.items.map((i) => <ItemView key={i.id} item={i} ctx={ctx} />)}</Group>
      ))}

      <NotesPanel briefing={b} />
    </>
  );
}


/** More page when there is no briefing to show (missing, error): days, upload and appearance still work. */
export function MoreLite(p: Pick<MoreProps, "busy" | "availableDates" | "onUpload" | "onOpenDate" | "todayIST">) {
  return (
    <>
      {p.availableDates.length > 0 && (
        <Group title="Days in the folder">
          <div className="chips wrap">
            {p.availableDates.map((d) => <button key={d} className="btn sm" type="button" onClick={() => p.onOpenDate(d === p.todayIST ? "today" : d)}>{d === p.todayIST ? "Today" : d}</button>)}
          </div>
        </Group>
      )}
      <Group title="Read a PDF"><Upload onFile={p.onUpload} busy={p.busy !== null} /></Group>
    </>
  );
}
