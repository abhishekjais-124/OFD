import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Briefing, BriefingResponse } from "@shared/schema";
import { api, type ApiResult } from "./api.ts";
import { AppBar, TabBar, type Tab } from "./components/nav.tsx";
import { ErrorState, MissingState, OfflineBanner, Skeleton } from "./components/states.tsx";
import { Icon, ToastProvider, useToast } from "./components/ui.tsx";
import { LearnPage, MailPage, MoreLite, MorePage, NewsPage, SearchPage, TodayPage, type PageProps } from "./pages/pages.tsx";
import { useTheme } from "./theme.ts";

type Route = Tab | "search";
/** What is being read: today's file, a specific day, or an uploaded file. */
type Source = { kind: "today" } | { kind: "date"; date: string } | { kind: "upload" };

const ROUTES: Route[] = ["today", "mail", "news", "learn", "more", "search"];
const TITLES: Record<Route, string> = { today: "Today", mail: "Mail", news: "News", learn: "Learn", more: "More", search: "Search" };

function parseHash(): { route: Route; date: string | null } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : path === "upload" ? "more" : "today";
  const date = new URLSearchParams(query).get("date");
  return { route, date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null };
}

function hashFor(route: Route, source: Source): string {
  return `#/${route}${source.kind === "date" ? `?date=${source.date}` : ""}`;
}

interface Loaded { response: BriefingResponse; fromCache: boolean; cachedAt: string | null }

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
  const initial = parseHash();
  const [route, setRoute] = useState<Route>(initial.route);
  const [source, setSource] = useState<Source>(initial.date ? { kind: "date", date: initial.date } : { kind: "today" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"refresh" | "reprocess" | "upload" | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const reqId = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      setRoute(h.route);
      if (h.date) setSource({ kind: "date", date: h.date });
      else if (sourceRef.current.kind === "date") setSource({ kind: "today" });
    };
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("hashchange", onHash);
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

  useEffect(() => { window.scrollTo(0, 0); }, [route]);

  const go = useCallback((r: Route, s?: Source) => {
    const next = s ?? sourceRef.current;
    if (s) setSource(s);
    history.pushState(null, "", hashFor(r, next));
    setRoute(r);
  }, []);

  const load = useCallback(async (s: Source, opts: { refresh?: boolean } = {}) => {
    if (s.kind === "upload") { setLoading(false); return; }
    const id = ++reqId.current;
    setFatal(null);
    if (opts.refresh) setBusy("refresh"); else setLoading(true);
    try {
      const res: ApiResult<BriefingResponse> = s.kind === "today" ? await api.today(opts.refresh) : await api.forDate(s.date, opts.refresh);
      if (id !== reqId.current) return;
      setLoaded({ response: res.data, fromCache: res.fromCache, cachedAt: res.cachedAt });
      if (opts.refresh && res.data.status === "ok") toast(res.data.cached ? "Already up to date" : "Refreshed");
    } catch (err) {
      if (id !== reqId.current) return;
      setFatal((err as Error).message);
    } finally {
      if (id === reqId.current) { setLoading(false); setBusy(null); }
    }
  }, [toast]);

  useEffect(() => { void load(source); }, [source, load]);

  const response = loaded?.response ?? null;
  const briefing: Briefing | null = response?.status === "ok" ? response.briefing : null;

  const reprocess = useCallback(async () => {
    if (!briefing) return;
    setBusy("reprocess");
    try {
      const res = await api.reprocess(briefing.key);
      setLoaded((prev) => ({ response: { ...(prev?.response ?? res.data), ...res.data, availableDates: prev?.response.availableDates ?? res.data.availableDates }, fromCache: res.fromCache, cachedAt: res.cachedAt }));
      toast(res.data.status === "ok" ? "Reprocessed" : "Reprocess failed");
    } catch (err) { toast((err as Error).message); } finally { setBusy(null); }
  }, [briefing, toast]);

  const upload = useCallback(async (file: File) => {
    setBusy("upload");
    setFatal(null);
    try {
      const res = await api.upload(file);
      setLoaded({ response: res.data, fromCache: false, cachedAt: null });
      setSource({ kind: "upload" });
      history.pushState(null, "", hashFor("today", { kind: "upload" }));
      setRoute("today");
      toast(res.data.status === "ok" ? `Processed ${file.name}` : "Could not process the file");
    } catch (err) { setFatal((err as Error).message); } finally { setBusy(null); }
  }, [toast]);

  const openDate = useCallback((d: string | "today") => go("today", d === "today" ? { kind: "today" } : { kind: "date", date: d }), [go]);
  const refresh = useCallback(() => void load(source, { refresh: true }), [load, source]);

  const actionCount = useMemo(
    () => (briefing ? briefing.sections.flatMap((s) => s.items).filter((i) => i.kind === "action").length : 0),
    [briefing],
  );
  const offline = !online || Boolean(loaded?.fromCache);
  const pageProps: PageProps | null = briefing && response
    ? { briefing, todayIST: response.todayIST, now, cached: response.cached, notices: response.notices, sourceKind: response.sourceKind }
    : null;
  const todayIST = response?.todayIST ?? "";
  const moreCommon = {
    busy, availableDates: response?.availableDates ?? [], onUpload: (f: File) => void upload(f), onOpenDate: openDate,
    theme: theme.choice, setTheme: theme.set, todayIST,
  };

  let body: React.ReactNode;
  if (route === "search" && briefing) {
    body = <SearchPage briefing={briefing} now={now} query={query} setQuery={setQuery} />;
  } else if (route === "more" && !briefing) {
    body = <MoreLite {...moreCommon} />;
  } else if (loading && !briefing) {
    body = <Skeleton />;
  } else if (fatal && !loading) {
    body = <ErrorState code="network" message={fatal} retryable onRetry={refresh} busy={busy !== null} />;
  } else if (response?.status === "missing") {
    body = <MissingState date={response.requestedDate} latest={response.latestAvailableDate} onShowLatest={() => response.latestAvailableDate && openDate(response.latestAvailableDate)} onRetry={refresh} busy={busy !== null} />;
  } else if (response?.status === "error" && response.error) {
    body = (
      <ErrorState code={response.error.code} message={response.error.message} retryable={response.error.retryable} onRetry={refresh} busy={busy !== null}>
        <button className="btn" type="button" onClick={() => go("more")}>{Icon.upload()} Upload the PDF instead</button>
      </ErrorState>
    );
  } else if (pageProps) {
    body = route === "today" ? <TodayPage {...pageProps} />
      : route === "mail" ? <MailPage {...pageProps} />
      : route === "news" ? <NewsPage {...pageProps} />
      : route === "learn" ? <LearnPage {...pageProps} />
      : <MorePage {...pageProps} {...moreCommon} onRefresh={refresh} onReprocess={() => void reprocess()} />;
  } else {
    body = <Skeleton />;
  }

  const showBack = route === "search";
  return (
    <div className="app">
      <AppBar
        title={route === "today" ? <span className="wordmark"><span className="dot" aria-hidden="true" />OFD</span> : TITLES[route]}
        left={showBack ? <button className="btn ghost icon" type="button" onClick={() => go("today")} aria-label="Back">{Icon.back()}</button> : undefined}
      >
        {briefing && route !== "search" && (
          <button className="btn ghost icon" type="button" onClick={() => go("search")} aria-label="Search" title="Search">{Icon.search()}</button>
        )}
        {route !== "search" && source.kind !== "upload" && (
          <button className="btn ghost icon" type="button" onClick={refresh} disabled={busy !== null} aria-label="Refresh" title="Refresh">{Icon.refresh(busy === "refresh" ? "spin" : undefined)}</button>
        )}
      </AppBar>
      <main className="page" key={route}>
        {offline && <OfflineBanner processedAt={briefing?.processedAt ?? loaded?.cachedAt ?? null} />}
        <div className="route fade-in">{body}</div>
      </main>
      <TabBar active={route} onSelect={(t) => go(t)} badges={{ mail: actionCount || undefined }} />
    </div>
  );
}
