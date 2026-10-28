/* OFD service worker: app shell + last processed result for offline reading. */
const VERSION = "ofd-v2";
// mount path ("" at the root, "/OFD" behind aj124.com/OFD), taken from where this worker lives
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = `${VERSION}-shell`;
const API = `${VERSION}-api`;
const MEDIA = `${VERSION}-media`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([`${BASE}/`, `${BASE}/manifest.webmanifest`, `${BASE}/icons/icon.svg`]).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function withHeaders(res, extra) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return res.arrayBuffer().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers }));
}

async function networkFirst(req, cacheName, { storeOnlyOk = true } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok || !storeOnlyOk) {
      const copy = await withHeaders(res.clone(), { "x-ofd-cached-at": new Date().toISOString() });
      await cache.put(req, copy);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false }) || (req.mode === "navigate" ? await cache.match(`${BASE}/`) : null);
    if (hit) return withHeaders(hit, { "x-ofd-cache": "1" });
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.startsWith(BASE + "/") ? url.pathname.slice(BASE.length) : url.pathname;

  if (path.startsWith("/api/images/") || path.endsWith("/pdf")) {
    event.respondWith(cacheFirst(req, MEDIA));
    return;
  }
  if (path === "/api/today" || path === "/api/weather" || path.startsWith("/api/briefings") || path.startsWith("/api/documents/") || path === "/api/status") {
    // the API result itself says whether it is ok; cache the body either way so the last state is readable offline
    event.respondWith(networkFirst(req, API, { storeOnlyOk: true }));
    return;
  }
  if (path.startsWith("/api/") || path === "/version.json") return;
  // app shell, scripts, styles, icons: network first, cached copy when offline
  event.respondWith(networkFirst(req, SHELL));
});
