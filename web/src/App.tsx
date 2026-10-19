import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Briefing, BriefingResponse } from "@shared/schema";
import { formatDateTimeIST } from "@shared/ist";
import { api, type ApiResult } from "./api.ts";
import { AppBar, RefreshButton, TabBar, type RefreshState, type Tab } from "./components/nav.tsx";
import { ErrorState, MissingState, OfflineBanner, Skeleton } from "./components/states.tsx";
import { Icon, ToastProvider, useToast } from "./components/ui.tsx";
import { actionKey, useDoneMap } from "./done.ts";
import { usePullToRefresh } from "./pull.ts";
import { skyKey, useWeather } from "./weather.tsx";
import { LearnPage, MailPage, MoreLite, MorePage, NewsPage, SearchPage, TodayPage, type PageProps } from "./pages/pages.tsx";

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
  const toast = useToast();
  const initial = parseHash();
  const [route, setRoute] = useState<Route>(initial.route);
  const [source, setSource] = useState<Source>(initial.date ? { kind: "date", date: initial.date } : { kind: "today" });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");
  const [busy, setBusy] = useState<"refresh" | "reprocess" | "upload" | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const weather = useWeather();
  const reqId = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((state: RefreshState) => {
    setRefreshState(state);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setRefreshState("idle"), 1600);
  }, []);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const loadedRef = useRef<Loaded | null>(null);

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

  const sky = skyKey(weather.state.status === "ok" ? weather.state.weather : null);
  useEffect(() => {
    if (sky) document.documentElement.dataset.sky = sky;
    else delete document.documentElement.dataset.sky;
  }, [sky]);

  const go = useCallback((r: Route, s?: Source) => {
    const next = s ?? sourceRef.current;
    if (s) setSource(s);
    history.pushState(null, "", hashFor(r, next));
    setRoute(r);
  }, []);

  const load = useCallback(async (s: Source, opts: { refresh?: boolean } = {}) => {
    if (s.kind === "upload") { setLoading(false); return; }
    const id = ++reqId.current;
    const hadBriefing = loadedRef.current?.response.status === "ok";
    setFatal(null);
    if (opts.refresh) { setBusy("refresh"); setRefreshState("busy"); } else setLoading(true);
    try {
      const res: ApiResult<BriefingResponse> = s.kind === "today" ? await api.today(opts.refresh) : await api.forDate(s.date, opts.refresh);
      if (id !== reqId.current) return;
      // a failed refresh must not replace a briefing you are reading
      if (opts.refresh && hadBriefing && res.data.status === "error") {
        toast(`Couldn't refresh: ${res.data.error?.message ?? "unknown error"}. Showing the saved copy.`);
        flash("fail");
        return;
      }
      const loadedNow: Loaded = { response: res.data, fromCache: res.fromCache, cachedAt: res.cachedAt };
      loadedRef.current = loadedNow;
      setLoaded(loadedNow);
      if (opts.refresh) {
        const at = formatDateTimeIST(new Date()).split(", ")[1] ?? "";
        if (res.data.status === "ok") { toast(res.data.cached ? `Up to date · checked ${at}` : "New version loaded from Drive"); flash("ok"); }
        else if (res.data.status === "missing") { toast("Still no briefing for this day"); flash("idle"); }
        else flash("fail");
      }
    } catch (err) {
      if (id !== reqId.current) return;
      if (opts.refresh && hadBriefing) { toast("Couldn't refresh. You may be offline. Showing the saved copy."); flash("fail"); }
      else setFatal((err as Error).message);
    } finally {
      if (id === reqId.current) { setLoading(false); setBusy(null); }
    }
  }, [toast, flash]);

  useEffect(() => { void load(source); }, [source, load]);

  loadedRef.current = loaded;
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
  const refresh = useCallback(() => {
    if (busy !== null || sourceRef.current.kind === "upload") return;
    weather.refresh();
    void load(sourceRef.current, { refresh: true });
  }, [load, weather, busy]);

  const doneMap = useDoneMap();
  const actionCount = useMemo(
    () => (briefing ? briefing.sections.flatMap((s) => s.items).filter((i) => i.kind === "action" && !doneMap[actionKey(i)]).length : 0),
    [briefing, doneMap],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement | null)?.tagName ?? "");
      if (e.key === "/" && !typing && briefing && route !== "search") { e.preventDefault(); go("search"); }
      else if (e.key === "Escape" && route === "search") go("today");
      else if ((e.key === "r" || e.key === "R") && !typing && !e.metaKey && !e.ctrlKey && route !== "search") refresh();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing, route, go, refresh]);

  const ptr = usePullToRefresh(refresh, route !== "search" && source.kind !== "upload");
  const offline = !online || Boolean(loaded?.fromCache);
  const pageProps: PageProps | null = briefing && response
    ? { briefing, todayIST: response.todayIST, now, cached: response.cached, notices: response.notices, sourceKind: response.sourceKind, weather: weather.state, onLocate: weather.retry }
    : null;
  const todayIST = response?.todayIST ?? "";
  const moreCommon = {
    busy, availableDates: response?.availableDates ?? [], onUpload: (f: File) => void upload(f), onOpenDate: openDate,
    todayIST,
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
          <button className="btn bar-btn" type="button" onClick={() => go("search")} aria-label="Search (press /)" title="Search (/)">{Icon.search()}</button>
        )}
        {route !== "search" && source.kind !== "upload" && (
          <RefreshButton state={refreshState} onClick={refresh} disabled={busy !== null} />
        )}
      </AppBar>
      {ptr.pull > 0 && (
        <div className={`ptr${ptr.armed ? " armed" : ""}`} style={{ transform: `translate(-50%, ${ptr.pull}px)` }} aria-hidden="true">
          {Icon.refresh(ptr.armed ? "spin" : undefined)}<span>{ptr.armed ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
      )}
      <main className="page" key={route}>
        {offline && <OfflineBanner processedAt={briefing?.processedAt ?? loaded?.cachedAt ?? null} />}
        <div className="route fade-in">{body}</div>
      </main>
      <TabBar active={route} onSelect={(t) => go(t)} badges={{ mail: actionCount || undefined }} />
    </div>
  );
}
