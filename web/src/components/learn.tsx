import { useState } from "react";
import type { Item } from "@shared/schema";
import { parseExample, splitDots, tidyPosted } from "@shared/learn";
import { Icon, LinkChips, PageRef, copyText, useToast } from "./ui.tsx";

interface Ctx { pdfUrl: string }

const field = (item: Item, ...labels: string[]) =>
  item.fields.find((f) => labels.some((l) => f.label.toLowerCase().startsWith(l.toLowerCase())))?.text;

function OpenButtons({ url, open, copy }: { url: string | null | undefined; open: string; copy: string }) {
  const toast = useToast();
  if (!url) return null;
  return (
    <div className="learn-actions">
      <a className="btn quiet" href={url} target="_blank" rel="noreferrer" title={url}>{Icon.open()} {open}</a>
      <button className="btn icon quiet" type="button" aria-label={copy} title="Copy link" onClick={async () => toast((await copyText(url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
    </div>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="fold">
      <summary>{title}{Icon.chev()}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** The question of the day as one calm card: what it is, an example, and how to open it. */
export function QuestionView({ item, ctx }: { item: Item; ctx: Ctx }) {
  const q = item.question!;
  const tone = q.difficulty === "Hard" ? "hard" : q.difficulty === "Medium" ? "medium" : "easy";
  const simple = field(item, "In simple words");
  const exampleText = field(item, "Example");
  const example = exampleText ? parseExample(exampleText) : null;
  const constraints = field(item, "Constraints");
  const constraintsLabel = item.fields.find((f) => /^constraints/i.test(f.label))?.label ?? "Constraints";
  const why = field(item, "Why today");
  const extraLinks = item.links.filter((l) => l.url !== q.problemUrl);
  // a sentence such as "commonly asked at large tech companies" is text, not a list of names
  const sentence = q.companies.length === 1 && (q.companies[0]!.length > 40 || /[().]/.test(q.companies[0]!));
  return (
    <article className="learn-card fade-in">
      <div className="learn-top">
        <span className="learn-meta">
          {q.number && <span className="learn-num">#{q.number}</span>}
          {q.difficulty && <span className={`diff ${tone}`}>{q.difficulty}</span>}
        </span>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
      </div>
      <h2 className="learn-title">{q.title}</h2>
      {q.topics.length > 0 && <div className="learn-tags">{q.topics.map((t) => <span className="tagp" key={t}>{t}</span>)}</div>}
      {simple && <p className="learn-simple">{simple}</p>}

      {example ? (
        <div className="ex">
          <p className="ex-head">Example</p>
          <dl className="ex-pair">
            <dt>Input</dt><dd>{example.main.input}</dd>
            <dt>Output</dt><dd>{example.main.output}</dd>
          </dl>
          {example.note && <p className="ex-note">{example.note}</p>}
          {example.more.map((m, i) => (
            <dl className="ex-pair more" key={i}>
              <dt>Input</dt><dd>{m.input}</dd>
              <dt>Output</dt><dd>{m.output}</dd>
            </dl>
          ))}
        </div>
      ) : exampleText ? (
        <div className="ex"><p className="ex-head">Example</p><p className="ex-note">{exampleText}</p></div>
      ) : null}

      <OpenButtons url={q.problemUrl} open="Open problem" copy="Copy problem link" />

      {constraints && <Fold title="Constraints"><p>{constraints}</p>{/mirror|unconfirmed|confirm/i.test(constraintsLabel) && <p className="fold-hint">Not confirmed on LeetCode, so check there.</p>}</Fold>}
      {why && <Fold title="Why this one today"><p>{why}</p></Fold>}
      {q.companies.length > 0 && (sentence ? (
        <Fold title="Who asks this"><p>{q.companies.join(", ")}</p></Fold>
      ) : (
        <Fold title={`Asked at ${q.companies.length} compan${q.companies.length === 1 ? "y" : "ies"}`}><div className="learn-tags">{q.companies.map((c) => <span className="tagp quiet" key={c}>{c}</span>)}</div></Fold>
      ))}
      {extraLinks.length > 0 && <Fold title="Study material"><LinkChips links={extraLinks} /></Fold>}
    </article>
  );
}

const ROLE_LIMIT = 5;

interface Role {
  title: string;
  where: string;
  posted: string;
  url: string | null;
  best: boolean;
}

function rolesFrom(items: Item[], skipUrl: string | null, skipTitle: string | null): Role[] {
  const out: Role[] = [];
  for (const it of items.filter((i) => i.kind === "jobs")) {
    for (const t of it.tables) {
      for (const row of t.rows) {
        const url = row.find((c) => c.links.length)?.links[0]?.url ?? null;
        const title = row[0]?.text ?? "";
        const best = Boolean(row[0]?.badge);
        // the best match already has its own card above
        if ((skipUrl || skipTitle) && (best || (url && url === skipUrl) || (skipTitle && title === skipTitle))) continue;
        out.push({ title, where: row[1]?.text ?? "", posted: row[2]?.text ?? "", url, best });
      }
    }
  }
  return out.filter((r) => r.title);
}

function RoleRow({ role }: { role: Role }) {
  const toast = useToast();
  return (
    <li className="role">
      <a className="role-main" href={role.url ?? undefined} target="_blank" rel="noreferrer" title={role.url ?? undefined}>
        <span className="role-title">{role.title}</span>
        <span className="role-sub">{[role.where, role.posted].filter(Boolean).join(" · ")}</span>
      </a>
      {role.url && (
        <>
          <a className="btn ghost icon" href={role.url} target="_blank" rel="noreferrer" aria-label={`Open ${role.title}`}>{Icon.open()}</a>
          <button className="btn ghost icon" type="button" aria-label={`Copy link to ${role.title}`} title="Copy link" onClick={async () => toast((await copyText(role.url!)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
        </>
      )}
    </li>
  );
}

/** The best job match as a card, then a short list of other roles. */
export function JobView({ items, ctx }: { items: Item[]; ctx: Ctx }) {
  const [all, setAll] = useState(false);
  const job = items.find((i) => i.kind === "job" && i.job);
  const j = job?.job;
  const qualsText = job ? field(job, "Minimum qualifications", "Requirements", "Qualifications") : undefined;
  const quals = splitDots(qualsText);
  const source = job ? field(job, "Source") : undefined;
  const fit = job ? field(job, "Why it fits") : undefined;
  const roles = rolesFrom(items, j?.applyUrl ?? null, j?.title ?? null);
  const shown = all ? roles : roles.slice(0, ROLE_LIMIT);
  const notes = items.filter((i) => i.kind === "note" || i.kind === "paragraph");
  const noteLinks = notes.flatMap((i) => i.links).map((l) => ({ ...l, label: /search/i.test(l.label ?? "") ? "Search more roles" : l.label }));
  return (
    <>
      {job && j && (
        <article className="learn-card fade-in">
          <div className="learn-top">
            <span className="learn-meta"><span className="best">Best match</span></span>
            <PageRef page={job.page} pdfUrl={ctx.pdfUrl} />
          </div>
          <h2 className="learn-title">{j.title}</h2>
          <p className="job-sub">{[j.location, tidyPosted(j.postedText), source && `via ${source}`].filter(Boolean).join(" · ")}</p>
          {fit && <p className="fit">{Icon.check()}<span>{fit}</span></p>}
          <OpenButtons url={j.applyUrl} open="Apply / details" copy="Copy job link" />
          {quals.length > 0 && (
            <Fold title="What they ask for">
              {quals.length > 1 ? <ul className="quals">{quals.map((q, i) => <li key={i}>{q}</li>)}</ul> : <p>{quals[0]}</p>}
            </Fold>
          )}
        </article>
      )}
      {roles.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Other roles</h2><span className="count">{roles.length}</span></div>
          <ul className="roles">{shown.map((r, i) => <RoleRow key={`${r.url}-${i}`} role={r} />)}</ul>
          {roles.length > ROLE_LIMIT && (
            <button className="btn quiet more-btn" type="button" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show ${roles.length - ROLE_LIMIT} more`}</button>
          )}
        </section>
      )}
      {noteLinks.length > 0 && <LinkChips links={noteLinks} />}
    </>
  );
}
