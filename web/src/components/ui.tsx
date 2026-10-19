import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Field, ItemFlag, Link, Table } from "@shared/schema";

/* ---------- icons (inline, 18px) ---------- */
const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Icon = {
  open: () => <svg viewBox="0 0 24 24" {...p}><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>,
  copy: () => <svg viewBox="0 0 24 24" {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>,
  refresh: (cls?: string) => <svg viewBox="0 0 24 24" {...p} className={cls}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>,
  reprocess: (cls?: string) => <svg viewBox="0 0 24 24" {...p} className={cls}><path d="M4 7h11a4 4 0 0 1 0 8H9M9 15l-3 3 3 3M4 7l3-3" /></svg>,
  pdf: () => <svg viewBox="0 0 24 24" {...p}><path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8 14h8M8 17h5" /></svg>,
  upload: () => <svg viewBox="0 0 24 24" {...p}><path d="M12 16V5M7 10l5-5 5 5M5 20h14" /></svg>,
  sun: () => <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: () => <svg viewBox="0 0 24 24" {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
  auto: () => <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>,
  search: () => <svg viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  x: () => <svg viewBox="0 0 24 24" {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  chev: () => <svg viewBox="0 0 24 24" {...p} className="chev"><path d="M6 9l6 6 6-6" /></svg>,
  offline: () => <svg viewBox="0 0 24 24" {...p}><path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7-7M5 12.5A10 10 0 0 1 8 9.5M12 20h.01M19 12.5a10 10 0 0 0-2.5-2.4" /></svg>,
  warn: () => <svg viewBox="0 0 24 24" {...p}><path d="M12 3l10 18H2L12 3zM12 10v4M12 17.5h.01" /></svg>,
  home: () => <svg viewBox="0 0 24 24" {...p}><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg>,
  mail: () => <svg viewBox="0 0 24 24" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  news: () => <svg viewBox="0 0 24 24" {...p}><path d="M5 4h11a1 1 0 0 1 1 1v14H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM17 8h3v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 15h4" /></svg>,
  learn: () => <svg viewBox="0 0 24 24" {...p}><path d="M12 3l9 4.5-9 4.5-9-4.5zM7 10.5v5c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-5" /></svg>,
  more: () => <svg viewBox="0 0 24 24" {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>,
  calendar: () => <svg viewBox="0 0 24 24" {...p}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>,
  briefcase: () => <svg viewBox="0 0 24 24" {...p}><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></svg>,
  pin: () => <svg viewBox="0 0 24 24" {...p}><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  branch: () => <svg viewBox="0 0 24 24" {...p}><circle cx="6" cy="5.5" r="2.2" /><circle cx="6" cy="18.5" r="2.2" /><circle cx="18" cy="9" r="2.2" /><path d="M6 7.7v8.6M18 11.2c0 3.6-6 2.4-11 5.4" /></svg>,
  folder: () => <svg viewBox="0 0 24 24" {...p}><path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v8.8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>,
  bell: () => <svg viewBox="0 0 24 24" {...p}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>,
  back: () => <svg viewBox="0 0 24 24" {...p}><path d="M15 5l-7 7 7 7" /></svg>,
  check: () => <svg viewBox="0 0 24 24" {...p}><path d="M5 12l4 4L19 7" /></svg>,
};

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- small pieces ---------- */
const FLAG_LABEL: Record<ItemFlag, { text: string; cls: string }> = {
  ocr: { text: "OCR, lower confidence", cls: "warn" },
  low_confidence: { text: "low confidence", cls: "warn" },
  partial: { text: "partial", cls: "warn" },
  wrapped_url: { text: "URL joined across lines", cls: "warn" },
  unrecognized: { text: "unrecognized section", cls: "" },
};
export function Flags({ flags }: { flags: ItemFlag[] }) {
  const shown = flags.filter((f) => f !== "low_confidence" || !flags.includes("ocr"));
  if (!shown.length) return null;
  return (
    <span className="flags">
      {shown.map((f) => (
        <span key={f} className={`badge ${FLAG_LABEL[f]!.cls}`}>{FLAG_LABEL[f]!.text}</span>
      ))}
    </span>
  );
}

/** A URL as a first-class element: label, wrapped address, one-tap open and copy. */
export function LinkRow({ link, truncate = false }: { link: Link; truncate?: boolean }) {
  const toast = useToast();
  const onCopy = useCallback(async () => {
    toast((await copyText(link.url)) ? "Copied link" : "Copy failed");
  }, [link.url, toast]);
  return (
    <div className="urlrow">
      <div style={{ minWidth: 0 }}>
        {link.label && link.label !== hostOf(link.url) && <span className="label">{link.label}</span>}
        <a className={`url${link.confidence === "low" ? " low" : ""}${truncate ? " trunc" : ""}`} href={link.url} target="_blank" rel="noreferrer" title={link.url}>
          {link.url}
        </a>
      </div>
      <div className="acts">
        <a className="btn ghost icon" href={link.url} target="_blank" rel="noreferrer" aria-label={`Open ${link.label ?? link.url}`} title="Open">{Icon.open()}</a>
        <button className="btn ghost icon" type="button" onClick={onCopy} aria-label={`Copy ${link.label ?? link.url}`} title="Copy">{Icon.copy()}</button>
      </div>
    </div>
  );
}

export function CopyButton({ url, label }: { url: string; label: string }) {
  const toast = useToast();
  return (
    <button className="btn icon" type="button" aria-label={label} title={label} onClick={async () => toast((await copyText(url)) ? "Copied link" : "Copy failed")}>
      {Icon.copy()}
    </button>
  );
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function LinkList({ links, truncate }: { links: Link[]; truncate?: boolean }) {
  if (!links.length) return null;
  return (
    <div className="urls">
      {links.map((l, i) => <LinkRow key={`${l.url}-${i}`} link={l} truncate={truncate} />)}
    </div>
  );
}

export function FieldList({ fields, skip = [] }: { fields: Field[]; skip?: string[] }) {
  const shown = fields.filter((f) => !skip.some((s) => f.label.toLowerCase().startsWith(s.toLowerCase())) && !/^https?:\/\//.test(f.text));
  if (!shown.length) return null;
  return (
    <dl className="fields">
      {shown.map((f, i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{f.label}</dt>
          <dd>{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Table that becomes a stacked list under 640px; link cells get the URL element. */
export function DataTable({ table, highlight }: { table: Table; highlight?: (rowIndex: number) => boolean }) {
  return (
    <div className="table-wrap">
      <table className="data">
        {table.header.length > 0 && (
          <thead>
            <tr>{table.header.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className={highlight?.(r) || row.some((c) => c.badge) ? "hl" : undefined}>
              {row.map((cell, c) => (
                <td key={c} data-label={table.header[c] ?? ""}>
                  {cell.links.length > 0
                    ? <LinkList links={cell.links} truncate />
                    : cell.text}
                  {cell.badge && <> <span className="badge">{cell.badge}</span></>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Chip({ children, tone, title }: { children: ReactNode; tone?: "accent" | "warn" | "danger" | "ok" | "quiet"; title?: string }) {
  return <span className={`chip${tone ? ` ${tone}` : ""}`} title={title}>{children}</span>;
}

/** Links as small pills: tap the label to open, tap the icon to copy. The full address is in the tooltip. */
export function LinkChips({ links }: { links: Link[] }) {
  const toast = useToast();
  if (!links.length) return null;
  return (
    <div className="lchips">
      {links.map((l, i) => {
        const name = l.label && l.label !== hostOf(l.url) ? l.label : hostOf(l.url);
        return (
          <span className={`lchip${l.confidence === "low" ? " low" : ""}`} key={`${l.url}-${i}`}>
            <a href={l.url} target="_blank" rel="noreferrer" title={l.url}><span className="lchip-name">{name}</span>{Icon.open()}</a>
            <button type="button" aria-label={`Copy ${name}`} title="Copy link" onClick={async () => toast((await copyText(l.url)) ? "Copied link" : "Copy failed")}>{Icon.copy()}</button>
          </span>
        );
      })}
    </div>
  );
}
