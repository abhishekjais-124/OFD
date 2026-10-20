import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Briefing, Item } from "@shared/schema";
import { dayLabel, formatDateTimeIST, formatLongDateIST, timeAgo, weekDates, weekdayParts } from "@shared/ist";
import { formatBytes, parseRoutineDetails, sourcesSummary } from "@shared/more";
import { Icon, LinkChips } from "./ui.tsx";

/** A titled group of rows, like a settings screen. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="section">
      {title && <div className="section-head"><h2>{title}</h2></div>}
      {children}
    </section>
  );
}

function Ico({ tone, children }: { tone?: "ok" | "warn" | "accent" | "plain"; children: ReactNode }) {
  return <span className={`mrow-ico more-${tone ?? "plain"}`}>{children}</span>;
}

/** A row that opens a link or runs an action. */
export function ActionRow({ icon, title, sub, href, onClick, disabled, trailing }: {
  icon: ReactNode; title: string; sub?: string; href?: string; onClick?: () => void; disabled?: boolean; trailing?: ReactNode;
}) {
  const inner = (
    <>
      <Ico>{icon}</Ico>
      <span className="mrow-text"><span className="mrow-title">{title}</span>{sub && <span className="mrow-sub">{sub}</span>}</span>
      {trailing ?? <span className="srow-go">{Icon.chev()}</span>}
    </>
  );
  return href
    ? <a className="srow" href={href} target="_blank" rel="noreferrer">{inner}</a>
    : <button className="srow" type="button" onClick={onClick} disabled={disabled}>{inner}</button>;
}

/** A row that expands to show more. */
export function FoldRow({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children: ReactNode }) {
  return (
    <details className="mrow">
      <summary>
        <Ico>{icon}</Ico>
        <span className="mrow-text"><span className="mrow-title">{title}</span>{sub && <span className="mrow-sub">{sub}</span>}</span>
        {Icon.chev()}
      </summary>
      <div className="mrow-body wide">{children}</div>
    </details>
  );
}

/** The date, where it came from and the two things you do to it: check Drive again, or read the PDF again. */
export function BriefingHeader({ briefing, cached, now, busy, canRefresh, onRefresh, onReprocess }: {
  briefing: Briefing; cached: boolean; now: Date; busy: "refresh" | "reprocess" | "upload" | null; canRefresh: boolean; onRefresh: () => void; onReprocess: () => void;
}) {
  const b = briefing;
  const status = b.confidence === "high" ? "Everything read cleanly" : b.confidence === "low" ? "Read with OCR, lower confidence" : "Some parts could not be read";
  return (
    <div className="mhead">
      <h2 className="mhead-date">{b.date ? formatLongDateIST(b.date) : "Date unknown"}</h2>
      <p className="mhead-file">{b.source.fileName}</p>
      <p className="mhead-status"><span className={`sdot ${b.confidence}`} />{status}</p>
      <p className="mhead-when" title={formatDateTimeIST(new Date(b.processedAt))}>Processed {timeAgo(new Date(b.processedAt), now)}{cached ? " · from cache" : ""}</p>
      <div className="mhead-actions">
        {canRefresh && (
          <button className="qa" type="button" onClick={onRefresh} disabled={busy !== null}>
            {Icon.refresh(busy === "refresh" ? "spin" : undefined)}<span className="qa-t">Check Drive</span><span className="qa-s">Look for a newer file</span>
          </button>
        )}
        <button className="qa" type="button" onClick={onReprocess} disabled={busy !== null}>
          {Icon.reprocess(busy === "reprocess" ? "spin" : undefined)}<span className="qa-t">Read again</span><span className="qa-s">Re-read the saved file</span>
        </button>
      </div>
    </div>
  );
}

/** The current Monday-to-Sunday week as pills: days with a saved briefing are tappable, the rest are dimmed. */
export function DayPills({ dates, today, current, onPick }: { dates: string[]; today: string; current: string | null; onPick: (d: string) => void }) {
  if (!today) return null;
  const have = new Set(dates);
  // days of other weeks that have a file (old briefings) stay reachable after the week
  const older = dates.filter((d) => !weekDates(today).includes(d) && d < today);
  return (
    <div className="daypills week" role="list">
      {weekDates(today).map((d) => {
        const { weekday, day } = weekdayParts(d);
        const ready = have.has(d);
        return (
          <button key={d} role="listitem" type="button" disabled={!ready} aria-label={dayLabel(d, today)} aria-current={d === today ? "date" : undefined} className={`daypill${d === current ? " on" : ""}${d === today ? " today" : ""}`} onClick={() => onPick(d)}>
            <span className="dp-w">{weekday}</span>
            <span className="dp-d">{day}</span>
          </button>
        );
      })}
      {older.map((d) => (
        <button key={d} role="listitem" type="button" className={`btn sm${d === current ? " on" : ""}`} onClick={() => onPick(d)}>{dayLabel(d, today)}</button>
      ))}
    </div>
  );
}

/** Choose or drop a PDF. */
export function UploadRow({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null) => { const f = files?.[0]; if (f) onFile(f); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); };
  return (
    <div className={`uprow${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => take(e.target.files)} />
      <ActionRow icon={Icon.upload()} title="Read another PDF" sub="Choose a file, or drop one here. Same reading as Drive." onClick={() => input.current?.click()} disabled={busy} />
    </div>
  );
}

/** What the routine reported about its sources, as one folded row. */
export function SourcesRow({ item }: { item: Item }) {
  const d = parseRoutineDetails(item.lines);
  const folder = item.links.find((l) => l.url === d.folderUrl);
  return (
    <FoldRow icon={Icon.check()} title="Sources check" sub={[sourcesSummary(d), d.schedule].filter(Boolean).join(" · ")}>
      {d.blocked.length > 0 && (
        <ul className="hosts">{d.blocked.map((h) => <li key={h.host} className="bad"><span className="sdot low" />{h.host}<em>blocked</em></li>)}</ul>
      )}
      {d.ok.length > 0 && (
        <ul className="hosts">{d.ok.map((h) => <li key={h.host}><span className="sdot high" />{h.host}{h.note && <em>{h.note}</em>}</li>)}</ul>
      )}
      {d.other.length > 0 && <p className="mrow-note">{d.other.join(" ")}</p>}
      {folder && <LinkChips links={[{ ...folder, label: "Reports folder" }]} />}
    </FoldRow>
  );
}

/** The extraction notes, folded. */
export function NotesRow({ briefing }: { briefing: Briefing }) {
  const real = briefing.notes.filter((n) => n.code !== "front_matter");
  const warn = real.filter((n) => n.level === "warn").length;
  const sub = real.length === 0 ? "Nothing to report" : `${real.length} note${real.length === 1 ? "" : "s"}${warn ? `, ${warn} to check` : ""}`;
  return (
    <FoldRow icon={Icon.warn()} title="Extraction notes" sub={sub}>
      {real.length === 0 ? <p className="mrow-note">Every page had a text layer and every section was recognised.</p> : (
        <ul className="notes-list">
          {real.map((n, i) => <li key={i} className={n.level}><span className="lvl" />{n.message}{n.page ? <em> p. {n.page}</em> : null}</li>)}
        </ul>
      )}
    </FoldRow>
  );
}

export function AboutRow({ briefing }: { briefing: Briefing }) {
  const size = formatBytes(briefing.source.size);
  return (
    <FoldRow icon={Icon.pdf()} title="About this file" sub={[briefing.pdfUrl ? `${briefing.pageCount} page${briefing.pageCount === 1 ? "" : "s"}` : "compact file", size].filter(Boolean).join(" · ")}>
      <dl className="about">
        <dt>Source</dt><dd>{briefing.source.kind === "drive" ? "Google Drive" : "Uploaded"}</dd>
        {briefing.source.modifiedTime && <><dt>Drive version</dt><dd>{formatDateTimeIST(new Date(briefing.source.modifiedTime))}</dd></>}
        <dt>Date from</dt><dd>{briefing.dateSource === "filename" ? "File name" : briefing.dateSource === "content" ? "Inside the document" : "Unknown"}</dd>
        <dt>Parser</dt><dd>{briefing.parserVersion}</dd>
      </dl>
    </FoldRow>
  );
}
