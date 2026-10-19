import type { Item } from "@shared/schema";
import { alertTone, parseGithubTitle, parseShareTitle } from "@shared/mail";
import { Icon, LinkChips, PageRef, useToast, copyText } from "./ui.tsx";

interface Ctx { pdfUrl: string }

/** A compact, expandable row for a GitHub or Drive notification. */
export function UpdateRow({ item, ctx }: { item: Item; ctx: Ctx }) {
  const gh = item.kind === "github" ? parseGithubTitle(item.title ?? "") : null;
  const share = item.kind === "share" ? parseShareTitle(item.title ?? "") : null;
  const icon = item.kind === "github" ? Icon.branch() : item.kind === "share" ? Icon.folder() : Icon.mail();
  const heading = gh ? gh.ref : share ? `Folder shared: ${share.folder}` : item.title ?? "Update";
  const sub = gh ? [gh.repo, gh.status].filter(Boolean).join(" · ") : share ? [share.by && `from ${share.by}`, share.note].filter(Boolean).join(" · ") : "";
  const bodyField = item.fields.find((f) => /^(today|summary|details)$/i.test(f.label));
  const hasMore = Boolean(bodyField) || item.links.length > 0;
  return (
    <details className="mrow">
      <summary>
        <span className={`mrow-ico ${item.kind}`}>{icon}</span>
        <span className="mrow-text">
          <span className="mrow-title">{heading}</span>
          {sub && <span className="mrow-sub">{sub}</span>}
        </span>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
        {hasMore && Icon.chev()}
      </summary>
      {hasMore && (
        <div className="mrow-body">
          {bodyField && <p>{bodyField.text}</p>}
          <LinkChips links={item.links} />
        </div>
      )}
    </details>
  );
}

/** Automated alerts as one quiet list: a dot for tone, the name, a short detail, and open/copy. */
export function AlertList({ item, ctx }: { item: Item; ctx: Ctx }) {
  const toast = useToast();
  const table = item.tables[0];
  if (!table) return null;
  const rows = table.rows.map((r) => {
    const name = r[0]?.text ?? "";
    const detail = r[1]?.text ?? "";
    const mailCell = r[2];
    const link = mailCell?.links[0];
    return { name, detail, link, tone: alertTone(name, detail, mailCell?.text ?? "") };
  });
  const loud = rows.filter((r) => r.tone !== "muted");
  const quiet = rows.filter((r) => r.tone === "muted");
  const Row = ({ r }: { r: (typeof rows)[number] }) => (
    <li className={`arow ${r.tone}`}>
      <span className="adot" aria-hidden="true" />
      <span className="arow-text">
        <span className="arow-name">{r.name}</span>
        <span className="arow-detail">{r.detail}</span>
      </span>
      {r.link && (
        <span className="arow-acts">
          <a className="btn ghost icon" href={r.link.url} target="_blank" rel="noreferrer" aria-label={`Open ${r.name}`} title={r.link.url}>{Icon.open()}</a>
          <button className="btn ghost icon" type="button" aria-label={`Copy ${r.name} link`} title="Copy link" onClick={async () => toast((await copyText(r.link!.url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
        </span>
      )}
    </li>
  );
  return (
    <details className="alerts">
      <summary>
        <span className="mrow-ico alerts">{Icon.bell()}</span>
        <span className="mrow-text">
          <span className="mrow-title">Automated alerts</span>
          <span className="mrow-sub">{loud.length} to look at{quiet.length ? ` · ${quiet.length} ignorable` : ""}</span>
        </span>
        <PageRef page={item.page} pdfUrl={ctx.pdfUrl} />
        {Icon.chev()}
      </summary>
      <ul className="alist">
        {loud.map((r, i) => <Row key={`l${i}`} r={r} />)}
        {quiet.map((r, i) => <Row key={`q${i}`} r={r} />)}
      </ul>
    </details>
  );
}
