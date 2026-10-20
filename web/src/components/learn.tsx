import { useState } from "react";
import type { Item } from "@shared/schema";
import { reportedCompanies } from "@shared/companies";
import { companyFromUrl, describeJob, experienceFrom, skillsFrom, workModeFrom, type WorkMode } from "@shared/job";
import { parseExample, parseWhyToday, splitConstraints, splitRequirements, stripUnverified, tidyPosted } from "@shared/learn";
import { Icon, LinkChips, copyText, useToast } from "./ui.tsx";

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

function Fold({ title, meta, open = false, children }: { title: string; meta?: string | number; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="fold" open={open}>
      <summary><span className="fold-title">{title}</span>{meta !== undefined && <span className="fold-meta">{meta}</span>}{Icon.chev()}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** Chips for topics or companies; a "(not verified)" suffix becomes a dashed chip, explained once underneath. */
function TopicChips({ topics, quiet = false }: { topics: string[]; quiet?: boolean }) {
  const items = topics.map(stripUnverified);
  return (
    <>
      <div className="learn-tags">{items.map((t) => <span className={`tagp${quiet ? " quiet" : ""}${t.unverified ? " unv" : ""}`} key={t.text}>{t.text}</span>)}</div>
      {items.some((t) => t.unverified) && <p className="fold-hint">Dashed means not verified.</p>}
    </>
  );
}

/** A sentence with its "(not verified)" caveat turned into a small badge. */
function Caveat({ text }: { text: string }) {
  const { text: plain, unverified } = stripUnverified(text);
  const shown = plain.charAt(0).toUpperCase() + plain.slice(1);
  return <p>{shown}{unverified && <span className="unv-badge">Not verified</span>}</p>;
}

/** "picked by date hash 36 of 39; topic intervals" as two labelled rows. */
function WhyToday({ text }: { text: string }) {
  const w = parseWhyToday(text);
  if (!w) return <p>{text}</p>;
  return (
    <dl className="why">
      <dt>Picked by</dt><dd>Date hash <b>{w.pick}</b> of {w.of}</dd>
      {w.topic && <><dt>Topic</dt><dd className="cap">{w.topic}</dd></>}
    </dl>
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
  // real names from the briefing win; otherwise the widely reported ones for this problem number
  const fromBriefing = q.companies.length > 0 && !sentence;
  const named = fromBriefing ? q.companies : reportedCompanies(q.number);
  return (
    <article className="learn-card fade-in">
      <div className="learn-top">
        <span className="learn-meta">
          {q.number && <span className="learn-num">#{q.number}</span>}
          {q.difficulty && <span className={`diff ${tone}`}>{q.difficulty}</span>}
        </span>
      </div>
      <h2 className="learn-title">{q.title}</h2>
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

      {q.topics.length > 0 && <Fold title="Topics" meta={q.topics.length}><TopicChips topics={q.topics} /></Fold>}
      {constraints && <Fold title="Constraints" meta={splitConstraints(constraints).length || undefined}><ul className="cons">{splitConstraints(constraints).map((c) => <li key={c}>{c}</li>)}</ul>{/mirror|unconfirmed|confirm/i.test(constraintsLabel) && <p className="fold-hint">Not confirmed on LeetCode, so check there.</p>}</Fold>}
      {why && <Fold title="Why this one today"><WhyToday text={why} /></Fold>}
      {named.length > 0 ? (
        <Fold title="Asked at" meta={named.length}>
          <TopicChips topics={named} quiet />
          {!fromBriefing && <p className="fold-hint">Widely reported by candidates, not an official list.</p>}
        </Fold>
      ) : q.companies.length > 0 && (
        <Fold title="Who asks this"><Caveat text={q.companies.join(", ")} /></Fold>
      )}
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
  company: string | null;
  mode: WorkMode | null;
  experience: string | null;
  skills: string[];
}

/** Column positions by header name, so extra columns (Company, Details) can sit anywhere. */
function columnMap(header: string[]): Record<"title" | "where" | "posted" | "company" | "details", number> {
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  return { title: find(/role|title/i, 0), where: find(/location|where/i, 1), posted: find(/posted|date|age/i, 2), company: find(/company|employer/i, -1), details: find(/detail|about|mode|experience|skills/i, -1) };
}

function rolesFrom(items: Item[], skipUrl: string | null, skipTitle: string | null): Role[] {
  const out: Role[] = [];
  for (const it of items.filter((i) => i.kind === "jobs")) {
    for (const t of it.tables) {
      const col = columnMap(t.header);
      for (const row of t.rows) {
        const url = row.find((c) => c.links.length)?.links[0]?.url ?? null;
        const title = row[col.title]?.text ?? "";
        const best = Boolean(row[col.title]?.badge);
        // the best match already has its own card above
        if ((skipUrl || skipTitle) && (best || (url && url === skipUrl) || (skipTitle && title === skipTitle))) continue;
        const where = row[col.where]?.text ?? "";
        const details = col.details >= 0 ? row[col.details]?.text ?? "" : "";
        const all = [title, where, details].join(" ");
        out.push({
          title,
          where,
          posted: row[col.posted]?.text ?? "",
          url,
          best,
          company: (col.company >= 0 ? row[col.company]?.text.trim() : "") || companyFromUrl(url),
          mode: workModeFrom(all),
          experience: experienceFrom(details) ?? experienceFrom(title),
          skills: skillsFrom(details).slice(0, 4),
        });
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
        {role.company && (
          <span className="role-co"><span className="role-logo" aria-hidden="true">{role.company.charAt(0).toUpperCase()}</span>{role.company}</span>
        )}
        <span className="role-title">{role.title}</span>
        <span className="role-chips">
          {role.where && <span className="role-chip">{Icon.pin()}{role.where}</span>}
          {role.mode && <span className="role-chip">{Icon.home()}{role.mode}</span>}
          {role.experience && <span className="role-chip">{Icon.briefcase()}{role.experience}</span>}
          {role.posted && <span className="role-chip">{Icon.calendar()}{tidyPosted(role.posted)}</span>}
        </span>
        {role.skills.length > 0 && <span className="role-skills">{role.skills.join(" \u00b7 ")}</span>}
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
  const quals = splitRequirements(qualsText);
  const source = job ? field(job, "Source") : undefined;
  const fit = job ? field(job, "Why it fits") : undefined;
  const facts = job && j ? describeJob({ title: j.title, location: j.location, postedText: j.postedText, fields: job.fields, requirements: qualsText, fit, source, applyUrl: j.applyUrl }) : null;
  const roles = rolesFrom(items, j?.applyUrl ?? null, j?.title ?? null);
  const shown = all ? roles : roles.slice(0, ROLE_LIMIT);
  const notes = items.filter((i) => i.kind === "note" || i.kind === "paragraph");
  const noteLinks = notes.flatMap((i) => i.links).map((l) => ({ ...l, label: /search/i.test(l.label ?? "") ? "Search more roles" : l.label }));
  return (
    <>
      {job && j && facts && (
        <article className="learn-card job-card fade-in">
          <div className="job-top">
            <span className="best">Best match</span>
            {source && <span className="job-via" title={source}>via {source.replace(/\s*\(.*\)\s*$/, "").split(/[,;]/)[0]!.replace(/\s+API$/i, "").trim()}</span>}
          </div>
          {facts.company && (
            <div className="job-co">
              <span className="job-logo" aria-hidden="true">{facts.company.charAt(0).toUpperCase()}</span>
              <span className="job-co-name">{facts.company}</span>
            </div>
          )}
          <h2 className="job-title">{j.title}</h2>
          <ul className="job-facts">
            {facts.location && <li><span className="jf-ico">{Icon.pin()}</span><span className="jf-label">Location</span><span className="jf-val">{facts.location}</span></li>}
            {facts.workMode && <li><span className="jf-ico">{Icon.home()}</span><span className="jf-label">Work mode</span><span className="jf-val">{facts.workMode}</span></li>}
            {facts.experience && <li><span className="jf-ico">{Icon.briefcase()}</span><span className="jf-label">Experience</span><span className="jf-val">{facts.experience}</span></li>}
            {facts.posted && <li><span className="jf-ico">{Icon.calendar()}</span><span className="jf-label">Posted</span><span className="jf-val">{tidyPosted(facts.posted)}</span></li>}
          </ul>
          {facts.skills.length > 0 && (
            <div className="job-skills">
              <p className="jf-head">Skills</p>
              <div className="learn-tags">{facts.skills.map((k) => <span className="tagp" key={k}>{k}</span>)}</div>
            </div>
          )}
          {fit && <p className="fit">{Icon.check()}<span>{fit.charAt(0).toUpperCase() + fit.slice(1)}</span></p>}
          <OpenButtons url={j.applyUrl} open="Apply" copy="Copy job link" />
          {quals.length > 0 && (
            <Fold title="What they ask for" meta={quals.length} open>
              <ul className="quals">{quals.map((q, i) => <li key={i}>{q}</li>)}</ul>
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

const f = (item: Item, ...labels: string[]) => field(item, ...labels);

function Block({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <article className="dx fade-in">
      <p className="dx-label"><span className="dx-ico" aria-hidden="true">{icon}</span>{label}</p>
      {children}
    </article>
  );
}

/** Word, fact, quote, tip, history and a riddle for the day, each as its own small card. */
export function DailyView({ items }: { items: Item[] }) {
  const item = items[0];
  if (!item) return null;
  const word = f(item, "Word");
  const quote = f(item, "Quote");
  const history = f(item, "History");
  const year = history ? /^(\d{1,4}(?:\s?(?:BC|AD|BCE|CE))?)\s*[-:\u2013\u2014]\s*(.+)$/i.exec(history) : null;
  const riddle = f(item, "Riddle");
  const answer = f(item, "Answer");
  return (
    <div className="dx-stack">
      {word && (
        <Block icon={Icon.learn()} label="Word of the day">
          <h2 className="dx-word">{word}</h2>
          {f(item, "Part of speech") && <p className="dx-pos">{f(item, "Part of speech")}</p>}
          {f(item, "Meaning") && <p className="dx-body">{f(item, "Meaning")}</p>}
          {f(item, "Example") && <p className="dx-ex">&ldquo;{f(item, "Example")}&rdquo;</p>}
        </Block>
      )}
      {f(item, "Fact") && <Block icon={Icon.bell()} label="Fact of the day"><p className="dx-body">{f(item, "Fact")}</p></Block>}
      {quote && (
        <Block icon={Icon.news()} label="Quote of the day">
          <p className="dx-quote">&ldquo;{quote}&rdquo;</p>
          {f(item, "Author") && <p className="dx-author">{f(item, "Author")}</p>}
        </Block>
      )}
      {f(item, "Tip") && <Block icon={Icon.check()} label="Tip of the day"><p className="dx-body">{f(item, "Tip")}</p></Block>}
      {history && (
        <Block icon={Icon.calendar()} label="History of the day">
          {year ? <><p className="dx-year">{year[1]}</p><p className="dx-body">{year[2]}</p></> : <p className="dx-body">{history}</p>}
        </Block>
      )}
      {riddle && (
        <Block icon={Icon.pin()} label="Riddle of the day">
          <p className="dx-body">{riddle}</p>
          {answer && (
            <details className="dx-reveal">
              <summary>Reveal answer</summary>
              <p className="dx-answer">{answer}</p>
            </details>
          )}
        </Block>
      )}
    </div>
  );
}
