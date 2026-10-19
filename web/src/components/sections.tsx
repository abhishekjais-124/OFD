import type { ReactNode } from "react";
import type { Briefing, Item, Section } from "@shared/schema";
import { countdownIST, formatDateTimeIST, formatShortDateIST } from "@shared/ist";
import { Chip, DataTable, FieldList, Flags, Icon, LinkList, PageRef } from "./ui.tsx";

interface Ctx {
  pdfUrl: string;
  now: Date;
}

/* ---------- action items on top ---------- */
export function ActionSummary({ briefing, now }: { briefing: Briefing; now: Date }) {
  const actions = briefing.sections.flatMap((s) => s.items).filter((i) => i.kind === "action" && i.action);
  if (!actions.length) return null;
  actions.sort((a, b) => (a.action!.deadlineDate ?? "9999").localeCompare(b.action!.deadlineDate ?? "9999"));
  return (
    <section className="section" aria-label="Needs action">
      <div className="section-head"><h2>Needs action</h2><span className="count">{actions.length}</span></div>
      <div className="stack">
        {actions.map((it) => <ActionCard key={it.id} item={it} ctx={{ pdfUrl: briefing.pdfUrl, now }} />)}
      </div>
    </section>
  );
}

function Countdown({ date, now, text }: { date: string | null; now: Date; text?: string }) {
  if (!date) return text ? <Chip tone="warn">{text}</Chip> : null;
  const c = countdownIST(date, now);
  return <span className={`countdown ${c.state}`} title={text}>{c.label} · {formatShortDateIST(date)}{/eod/i.test(text ?? "") ? " EOD" : ""}</span>;
}

function ActionCard({ item, ctx, compact = false }: { item: Item; ctx: Ctx; compact?: boolean }) {
  const a = item.action!;
  return (
    <article className={`card${a.priority === "important" ? " danger" : ""} fade-in`}>
      <div className="card-top">
        <div className="grow">
          <div className="meta-row" style={{ marginBottom: 6 }}>
            {a.priority === "important" && <span className="badge danger">Important</span>}
            <Countdown date={a.deadlineDate} now={ctx.now} text={a.deadlineText} />
            <Flags flags={item.flags} />
          </div>
          <h3>{item.title}</h3>
        </div>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
      </div>
      <details>
        <summary className="btn ghost sm" style={{ marginTop: 8 }}>Details {Icon.chev()}</summary>
        <div className="body">
          {(a.from || a.received) && <p className="sub" style={{ marginTop: 0 }}>{a.from && <>From {a.from}</>}{a.from && a.received && " · "}{a.received && <>received {a.received}</>}</p>}
          <FieldList fields={item.fields} skip={["From", "Cc", "Steps", "Open mail", "Earlier cop", "Reference"]} />
          {a.steps.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: 10 }}>Steps</p>
              <ol className="steps">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </>
          )}
        </div>
      </details>
      {compact
        ? <div className="actions-row" style={{ marginTop: 10 }}><button className="btn sm" type="button" onClick={() => goTab("mail")}>{Icon.mail()} Open in Mail · {item.links.length} link{item.links.length === 1 ? "" : "s"}</button></div>
        : <LinkList links={item.links} />}
    </article>
  );
}

/* ---------- generic card ---------- */
const LABEL_LINE = /^[A-Z][A-Za-z0-9 /()'’;,-]{0,58}[A-Za-z)]:(\s|$)/;

function GenericCard({ item, ctx, title }: { item: Item; ctx: Ctx; title?: string }) {
  const heading = title ?? item.title;
  const rest = item.lines.filter((l) => l !== heading && !/^https?:\/\/\S+$/.test(l));
  const hasFields = item.fields.length > 0 && item.kind !== "note" && item.kind !== "paragraph";
  // with fields, only the free text before the first "Label:" line is shown as a paragraph
  const firstLabel = hasFields ? rest.findIndex((l) => LABEL_LINE.test(l) || /\s·\s[A-Z][^:]{0,44}:\s/.test(l)) : -1;
  const bodyLines = hasFields && firstLabel >= 0 ? rest.slice(0, firstLabel) : rest;
  return (
    <article className="card fade-in">
      <div className="card-top">
        <div className="grow">
          {heading && <h3>{heading}</h3>}
          <Flags flags={item.flags} />
        </div>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
      </div>
      {item.images.map((im) => <img key={im.id} src={im.url} alt="" width={im.width} height={im.height} style={{ marginTop: 10, borderRadius: 10, maxHeight: 320, width: "auto" }} loading="lazy" />)}
      {bodyLines.length > 0 && <div className="body"><p>{bodyLines.join(" ")}</p></div>}
      {hasFields && <FieldList fields={item.fields} />}
      {item.tables.map((t, i) => <div key={i}>{t.caption && t.caption !== heading && <p className="eyebrow" style={{ marginTop: 10 }}>{t.caption}</p>}<DataTable table={t} /></div>)}
      <LinkList links={item.links} />
    </article>
  );
}

/* ---------- glance ---------- */
const GLANCE_TARGET: Record<string, { tab: string; icon: () => ReactNode }> = {
  mail: { tab: "mail", icon: Icon.mail },
  calendar: { tab: "today", icon: Icon.calendar },
  headlines: { tab: "news", icon: Icon.news },
  question: { tab: "learn", icon: Icon.learn },
  job: { tab: "learn", icon: Icon.briefcase },
};

function goTab(tab: string) {
  const query = /\?.*$/.exec(location.hash)?.[0] ?? "";
  location.hash = `#/${tab}${query}`;
}

/** The summary table as tappable tiles that open the matching tab. */
function GlanceItem({ item, ctx }: { item: Item; ctx: Ctx }) {
  const table = item.tables[0];
  if (!table) return <GenericCard item={item} ctx={ctx} />;
  return (
    <div className="tiles fade-in">
      {table.rows.map((row, i) => {
        const label = row[0]?.text ?? "";
        const target = GLANCE_TARGET[label.toLowerCase()];
        const text = row.slice(1).map((c) => c.text).join(" ");
        const urgent = /action item/i.test(text);
        const inner = (
          <>
            <span className="tile-icon">{target ? target.icon() : null}</span>
            <span className="tile-label">{label}</span>
            <span className="tile-text">{text}</span>
          </>
        );
        return target && target.tab !== "today"
          ? <button key={i} type="button" className={`tile${urgent ? " urgent" : ""}`} onClick={() => goTab(target.tab)}>{inner}</button>
          : <div key={i} className="tile">{inner}</div>;
      })}
    </div>
  );
}

/* ---------- headlines ---------- */
function HeadlineCard({ item, ctx }: { item: Item; ctx: Ctx }) {
  const h = item.headline!;
  const img = item.images[0];
  const when = h.timestamp ? formatDateTimeIST(new Date(h.timestamp)) : h.timestampText;
  return (
    <article className="card headline fade-in">
      {img ? <img className="thumb" src={img.url} alt="" loading="lazy" /> : <div className="thumb empty">no image</div>}
      <div style={{ minWidth: 0 }}>
        <div className="card-top">
          <div className="grow"><h3>{h.url ? <a href={h.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{h.title}</a> : h.title}</h3></div>
          <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
        </div>
        {h.summary && <p className="sum">{h.summary}</p>}
        <p className="when">{when}{h.source ? ` · ${h.source}` : ""} <Flags flags={item.flags} /></p>
      </div>
      <LinkList links={item.links} />
    </article>
  );
}

/* ---------- question ---------- */
function QuestionCard({ item, ctx }: { item: Item; ctx: Ctx }) {
  const q = item.question!;
  const tone = q.difficulty === "Hard" ? "danger" : q.difficulty === "Medium" ? "warn" : "ok";
  const primary = item.links.find((l) => l.url === q.problemUrl);
  const others = item.links.filter((l) => l.url !== q.problemUrl);
  return (
    <details className="card fade-in" open>
      <summary>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="meta-row" style={{ marginBottom: 4 }}>
            {q.number && <span className="muted small mono">#{q.number}</span>}
            {q.difficulty && <span className={`badge ${tone}`}>{q.difficulty}</span>}
            <Flags flags={item.flags} />
          </div>
          <h3>{q.title}</h3>
        </div>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
        {Icon.chev()}
      </summary>
      <div className="body">
        {q.problemUrl && (
          <div className="actions-row" style={{ marginBottom: 10 }}>
            <a className="btn primary" href={q.problemUrl} target="_blank" rel="noreferrer">{Icon.open()} Open problem</a>
          </div>
        )}
        <FieldList fields={q.fields.filter((f) => !/study guide|problem list/i.test(f.label))} />
        {(q.topics.length > 0 || q.companies.length > 0) && (
          <div className="tags">
            {q.topics.map((t) => <Chip key={t} tone="accent">{t}</Chip>)}
            {q.companies.map((c) => <Chip key={c}>{c}</Chip>)}
          </div>
        )}
        <LinkList links={primary ? [primary, ...others] : others} />
      </div>
    </details>
  );
}

/* ---------- job ---------- */
function JobCard({ item, ctx }: { item: Item; ctx: Ctx }) {
  const j = item.job!;
  return (
    <article className="card fade-in">
      <div className="card-top">
        <div className="grow">
          <div className="meta-row" style={{ marginBottom: 4 }}><span className="badge">Job of the day</span><Flags flags={item.flags} /></div>
          <h3>{j.title}</h3>
          <p className="sub">{[j.location, j.postedText].filter(Boolean).join(" · ")}</p>
        </div>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
      </div>
      {j.applyUrl && <div className="actions-row" style={{ marginTop: 12 }}><a className="btn primary" href={j.applyUrl} target="_blank" rel="noreferrer">{Icon.open()} Apply / details</a></div>}
      <FieldList fields={j.fields} />
      <LinkList links={item.links} />
    </article>
  );
}

function JobsTable({ item, ctx }: { item: Item; ctx: Ctx }) {
  const table = item.tables[0];
  if (!table) return <GenericCard item={item} ctx={ctx} />;
  return (
    <article className="card fade-in">
      <div className="card-top"><div className="grow"><h3>{table.caption ?? item.title ?? "Other roles"}</h3><Flags flags={item.flags} /></div><PageRef page={item.page} pdfUrl={ctx.pdfUrl} /></div>
      <DataTable table={table} />
    </article>
  );
}

/* ---------- dispatch ---------- */
export function ItemView({ item, ctx, compact = false }: { item: Item; ctx: Ctx; compact?: boolean }) {
  switch (item.kind) {
    case "action": return <ActionCard item={item} ctx={ctx} compact={compact} />;
    case "glance": return <GlanceItem item={item} ctx={ctx} />;
    case "headline": return <HeadlineCard item={item} ctx={ctx} />;
    case "question": return <QuestionCard item={item} ctx={ctx} />;
    case "job": return <JobCard item={item} ctx={ctx} />;
    case "jobs": return <JobsTable item={item} ctx={ctx} />;
    case "alerts": return <GenericCard item={item} ctx={ctx} title={item.tables[0]?.caption ?? "Alerts"} />;
    default: return <GenericCard item={item} ctx={ctx} />;
  }
}

export function SectionView({ section, ctx, hideActions }: { section: Section; ctx: Ctx; hideActions: boolean }) {
  const items = hideActions ? section.items.filter((i) => i.kind !== "action") : section.items;
  if (!items.length) return null;
  return (
    <section className="section" id={section.id} aria-label={section.title}>
      <div className="section-head">
        <h2>{section.title}</h2>
        <span className="count">{items.length}</span>
        <span style={{ marginLeft: "auto" }}><PageRef page={section.page} pdfUrl={ctx.pdfUrl} /></span>
      </div>
      <div className="stack">
        {items.map((it) => <ItemView key={it.id} item={it} ctx={ctx} />)}
      </div>
    </section>
  );
}

/* ---------- extraction notes ---------- */
export function NotesPanel({ briefing }: { briefing: Briefing }) {
  const tone = briefing.confidence === "high" ? "ok" : briefing.confidence === "low" ? "warn" : "danger";
  return (
    <details className="card notes">
      <summary>
        <div className="grow"><h3>Extraction notes</h3></div>
        <Chip tone={tone}>{briefing.confidence === "high" ? "all pages had a text layer" : briefing.confidence === "low" ? "OCR used" : "partial extraction"}</Chip>
        {Icon.chev()}
      </summary>
      <div className="body">
        <p className="small muted">Parser {briefing.parserVersion} · {briefing.pageCount} page{briefing.pageCount === 1 ? "" : "s"} · processed {formatDateTimeIST(new Date(briefing.processedAt))}</p>
        {briefing.notes.length === 0 ? <p className="small" style={{ marginTop: 8 }}>Nothing to report.</p> : (
          <ul>
            {briefing.notes.map((n, i) => (
              <li key={i}><span className={`lvl ${n.level}`} /><span>{n.message}{n.page ? <> <PageRef page={n.page} pdfUrl={briefing.pdfUrl} /></> : null}</span></li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
