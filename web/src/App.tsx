import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Briefing, BriefingResponse } from "@shared/schema";
import { formatDateTimeIST, formatLongDateIST } from "@shared/ist";
import { api, type ApiResult } from "./api.ts";
import { ActionSummary, NotesPanel, SectionView } from "./components/sections.tsx";
import { ErrorState, MissingState, OfflineBanner, Skeleton } from "./components/states.tsx";
import { Upload } from "./components/Upload.tsx";
import { Chip, Icon, ToastProvider, useToast } from "./components/ui.tsx";
import { countItems, filterSections } from "./search.ts";
import { useTheme } from "./theme.ts";

type View = { kind: "today" } | { kind: "date"; date: string } | { kind: "upload" };

interface Loaded {
  response: BriefingResponse;
  fromCache: boolean;
  cachedAt: string | null;
}

function viewFromHash(): View {
  const m = /^#\/date\/(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
  if (m) return { kind: "date", date: m[1]! };
  if (location.hash === "#/upload") return { kind: "upload" };
  return { kind: "today" };
}

function hashFor(view: View): string {
  return view.kind === "date" ? `#/date/${view.date}` : view.kind === "upload" ? "#/upload" : "#/";
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const theme = useTheme();
  const toast = useToast();
  const [view, setView] = useState<View>(viewFromHash);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"refresh" | "reprocess" | "upload" | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const reqId = useRef(0);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(tick);
    };
  }, []);

  const navigate = useCallback((v: View) => {
    history.pushState(null, "", hashFor(v));
    setView(v);
  }, []);

  const load = useCallback(async (v: View, opts: { refresh?: boolean } = {}) => {
    if (v.kind === "upload") {
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setFatal(null);
    if (opts.refresh) setBusy("refresh");
    else setLoading(true);
    try {
      const res: ApiResult<BriefingResponse> = v.kind === "today" ? await api.today(opts.refresh) : await api.forDate(v.date, opts.refresh);
      if (id !== reqId.current) return;
      setLoaded({ response: res.data, fromCache: res.fromCache, cachedAt: res.cachedAt });
      if (opts.refresh && res.data.status === "ok") toast(res.data.cached ? "Already up to date" : "Refreshed");
    } catch (err) {
      if (id !== reqId.current) return;
      setFatal((err as Error).message);
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setBusy(null);
      }
    }
  }, [toast]);

  useEffect(() => {
    void load(view);
    setSectionId(null);
  }, [view, load]);

  const reprocess = useCallback(async (key: string) => {
    setBusy("reprocess");
    try {
      const res = await api.reprocess(key);
      setLoaded((prev) => ({ response: { ...(prev?.response ?? res.data), ...res.data, availableDates: prev?.response.availableDates ?? res.data.availableDates }, fromCache: res.fromCache, cachedAt: res.cachedAt }));
      toast(res.data.status === "ok" ? "Reprocessed" : "Reprocess failed");
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const upload = useCallback(async (file: File) => {
    setBusy("upload");
    setFatal(null);
    try {
      const res = await api.upload(file);
      setLoaded({ response: res.data, fromCache: false, cachedAt: null });
      if (view.kind !== "upload") navigate({ kind: "upload" });
      toast(res.data.status === "ok" ? `Processed ${file.name}` : "Could not process the file");
    } catch (err) {
      setFatal((err as Error).message);
    } finally {
      setBusy(null);
    }
  }, [navigate, toast, view.kind]);

  const response = loaded?.response ?? null;
  const briefing: Briefing | null = response?.status === "ok" ? response.briefing : null;
  const filter = useMemo(() => ({ query, sectionId }), [query, sectionId]);
  const visible = useMemo(() => (briefing ? filterSections(briefing, filter) : []), [briefing, filter]);
  const filtering = query.trim().length > 0 || sectionId !== null;
  const offline = !online || Boolean(loaded?.fromCache);
  const isToday = Boolean(response && briefing && briefing.date === response.todayIST);
  const showingUpload = response?.sourceKind === "upload";

  const themeIcon = theme.choice === "system" ? Icon.auto() : theme.choice === "dark" ? Icon.moon() : Icon.sun();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href="#/" onClick={(e) => { e.preventDefault(); navigate({ kind: "today" }); }} aria-label="OFD, go to today">
            <span className="dot" aria-hidden="true" />OFD <small>of the day</small>
          </a>
          <div className="topbar-actions">
            <button className="btn ghost icon" type="button" onClick={() => navigate({ kind: "upload" })} aria-label="Upload a PDF" title="Upload a PDF">{Icon.upload()}</button>
            <button className="btn ghost icon" type="button" onClick={theme.cycle} aria-label={`Theme: ${theme.choice}. Change theme`} title={`Theme: ${theme.choice}`}>{themeIcon}</button>
          </div>
        </div>
      </header>

      <main className="page">
        {offline && <OfflineBanner processedAt={briefing?.processedAt ?? loaded?.cachedAt ?? null} />}

        {view.kind === "upload" && !briefing && (
          <div className="hero">
            <span className="eyebrow">Upload</span>
            <h1>Read a briefing PDF</h1>
            <p className="date">Processed locally with the same pipeline as the Drive folder.</p>
          </div>
        )}

        {loading && !briefing && view.kind !== "upload" && <Skeleton />}

        {fatal && !loading && (
          <ErrorState code="network" message={fatal} retryable onRetry={() => void load(view, { refresh: view.kind !== "upload" })} busy={busy !== null} />
        )}

        {!loading && !fatal && response?.status === "missing" && (
          <>
            <div className="hero">
              <span className="eyebrow">{response.requestedDate === response.todayIST ? "Today" : "Requested day"}</span>
              <h1>{formatLongDateIST(response.requestedDate)}</h1>
              <div className="meta-row">{response.availableDates.length > 0 && <span>{response.availableDates.length} day{response.availableDates.length === 1 ? "" : "s"} in the folder</span>}</div>
            </div>
            <MissingState
              date={response.requestedDate}
              latest={response.latestAvailableDate}
              onShowLatest={() => response.latestAvailableDate && navigate({ kind: "date", date: response.latestAvailableDate })}
              onRetry={() => void load(view, { refresh: true })}
              busy={busy !== null}
            />
          </>
        )}

        {!loading && !fatal && response?.status === "error" && response.error && (
          <ErrorState code={response.error.code} message={response.error.message} retryable={response.error.retryable} onRetry={() => void load(view, { refresh: true })} busy={busy !== null}>
            {view.kind !== "upload" && <button className="btn" type="button" onClick={() => navigate({ kind: "upload" })}>{Icon.upload()} Upload the PDF instead</button>}
          </ErrorState>
        )}

        {briefing && response && (
          <>
            <div className="hero fade-in">
              <span className="eyebrow">{showingUpload ? "Uploaded file" : isToday ? "Today" : "Not today"}</span>
              <h1>{briefing.title}</h1>
              <p className="date">{briefing.date ? formatLongDateIST(briefing.date) : "Date unknown"}{briefing.dateSource === "content" ? " (read from the document)" : ""}</p>
              <div className="meta-row">
                {!isToday && !showingUpload && <Chip tone="warn">Showing {briefing.date ?? "an undated file"}, today is {response.todayIST}</Chip>}
                {showingUpload && <Chip tone="accent">{briefing.source.fileName}</Chip>}
                <Chip title={briefing.processedAt}>processed {formatDateTimeIST(new Date(briefing.processedAt))}</Chip>
                {briefing.source.modifiedTime && <Chip title="modifiedTime on Drive">Drive version {formatDateTimeIST(new Date(briefing.source.modifiedTime))}</Chip>}
                {response.cached && <Chip tone="quiet">cached</Chip>}
                {briefing.ocrUsed && <Chip tone="warn">OCR, lower confidence</Chip>}
                {briefing.confidence === "partial" && <Chip tone="danger">partial extraction</Chip>}
              </div>
              <div className="actions-row">
                {!showingUpload && <button className="btn" type="button" onClick={() => void load(view, { refresh: true })} disabled={busy !== null}>{Icon.refresh(busy === "refresh" ? "spin" : undefined)} Refresh</button>}
                <button className="btn" type="button" onClick={() => void reprocess(briefing.key)} disabled={busy !== null}>{Icon.reprocess(busy === "reprocess" ? "spin" : undefined)} Reprocess</button>
                <a className="btn" href={briefing.pdfUrl} target="_blank" rel="noreferrer">{Icon.pdf()} Original PDF</a>
                {briefing.source.webViewLink && <a className="btn ghost" href={briefing.source.webViewLink} target="_blank" rel="noreferrer">{Icon.open()} On Drive</a>}
              </div>
            </div>

            {response.notices.map((n, i) => <div className="banner info" key={i}>{Icon.warn()}<div className="grow">{n}</div></div>)}

            {!isToday && !showingUpload && response.availableDates.includes(response.todayIST) && (
              <div className="banner info">{Icon.warn()}<div className="grow">Today's briefing exists.</div><button className="btn sm primary" type="button" onClick={() => navigate({ kind: "today" })}>Open today</button></div>
            )}

            <div className="toolbar">
              <div className="search">
                {Icon.search()}
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search everything in this briefing" aria-label="Search" autoComplete="off" />
                {query && <button className="btn ghost icon clear" type="button" onClick={() => setQuery("")} aria-label="Clear search">{Icon.x()}</button>}
              </div>
              <div className="chips" role="tablist" aria-label="Sections">
                <button className={`btn sm${sectionId === null ? " on" : ""}`} type="button" onClick={() => setSectionId(null)}>All</button>
                {briefing.sections.map((s) => (
                  <button key={s.id} className={`btn sm${sectionId === s.id ? " on" : ""}`} type="button" onClick={() => setSectionId(sectionId === s.id ? null : s.id)}>{s.title}</button>
                ))}
              </div>
            </div>

            {!filtering && <ActionSummary briefing={briefing} now={now} />}
            {visible.map((s) => <SectionView key={s.id} section={s} ctx={{ pdfUrl: briefing.pdfUrl, now }} hideActions={!filtering} />)}
            {filtering && visible.length === 0 && (
              <div className="state"><h2>No matches</h2><p>Nothing in this briefing matches "{query}".</p><div className="actions-row"><button className="btn" type="button" onClick={() => { setQuery(""); setSectionId(null); }}>Clear filters</button></div></div>
            )}
            {filtering && visible.length > 0 && <p className="small muted" style={{ marginTop: 14 }}>{countItems(visible)} matching item{countItems(visible) === 1 ? "" : "s"}</p>}

            <NotesPanel briefing={briefing} />
          </>
        )}

        {(view.kind === "upload" || response?.status !== "ok" || showingUpload) && !loading && (
          <section className="section" aria-label="Upload a PDF">
            <div className="section-head"><h2>{briefing ? "Read another PDF" : "Upload a PDF"}</h2></div>
            <Upload onFile={(f) => void upload(f)} busy={busy !== null} />
          </section>
        )}

        {response && response.availableDates.length > 1 && (
          <section className="section" aria-label="Other days">
            <div className="section-head"><h2>Other days</h2></div>
            <div className="chips">
              {response.availableDates.map((d) => (
                <button key={d} className={`btn sm${briefing?.date === d && !showingUpload ? " on" : ""}`} type="button" onClick={() => navigate(d === response.todayIST ? { kind: "today" } : { kind: "date", date: d })}>{d === response.todayIST ? "Today" : d}</button>
              ))}
            </div>
          </section>
        )}

        <p className="footer">OFD reads the daily Morning Briefing PDF. Dates are in IST. {briefing && <a href={briefing.pdfUrl} target="_blank" rel="noreferrer">Verify against the original</a>}</p>
      </main>
    </>
  );
}
