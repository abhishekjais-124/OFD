/**
 * Exercises web/public/sw.js in a tiny fake worker environment: the strategies that
 * make the last processed result readable offline.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: { request: Request; respondWith: (p: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void }) => void;

class FakeCache {
  store = new Map<string, Response>();
  async match(req: Request | string) { return this.store.get(typeof req === "string" ? req : req.url)?.clone() ?? undefined; }
  async put(req: Request | string, res: Response) { this.store.set(typeof req === "string" ? req : req.url, res); }
  async addAll(urls: string[]) { for (const u of urls) this.store.set(new URL(u, "http://localhost").href, new Response("shell")); }
}

function boot() {
  const caches = new Map<string, FakeCache>();
  const handlers: Record<string, Handler> = {};
  const self = {
    location: new URL("http://localhost/sw.js"),
    addEventListener: (name: string, fn: Handler) => { handlers[name] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const cachesApi = {
    open: async (name: string) => { if (!caches.has(name)) caches.set(name, new FakeCache()); return caches.get(name)!; },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
  };
  const fetchMock = vi.fn<(req: Request) => Promise<Response>>();
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "..", "web", "public", "sw.js"), "utf8");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "caches", "fetch", "Response", "Headers", "URL", src)(self, cachesApi, fetchMock, Response, Headers, URL);
  const request = (url: string, mode: RequestMode | "navigate" = "cors") => new Request(new URL(url, "http://localhost").href, mode === "navigate" ? undefined : { mode });
  const run = async (req: Request) => {
    let out: Promise<Response> | null = null;
    handlers.fetch!({ request: req, respondWith: (p) => { out = p; }, waitUntil: () => {} });
    if (!out) return null;
    return await out;
  };
  return { fetchMock, run, request, caches };
}

describe("service worker strategies", () => {
  let env: ReturnType<typeof boot>;
  beforeEach(() => { env = boot(); });

  it("serves the API from the network and remembers the last good answer", async () => {
    env.fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { headers: { "content-type": "application/json" } }));
    const online = await env.run(env.request("/api/today"));
    expect(await online!.json()).toEqual({ status: "ok" });
    expect(online!.headers.get("x-ofd-cache")).toBeNull();

    env.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const offline = await env.run(env.request("/api/today"));
    expect(offline!.headers.get("x-ofd-cache")).toBe("1");
    expect(offline!.headers.get("x-ofd-cached-at")).toMatch(/^\d{4}-/);
    expect(await offline!.json()).toEqual({ status: "ok" });
  });

  it("does not keep failed API answers and fails loudly when nothing is cached", async () => {
    env.fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await env.run(env.request("/api/today"));
    env.fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(env.run(env.request("/api/today"))).rejects.toThrow("Failed to fetch");
  });

  it("serves images and PDFs cache-first", async () => {
    env.fetchMock.mockResolvedValueOnce(new Response("png", { status: 200 }));
    await env.run(env.request("/api/images/abc.png"));
    env.fetchMock.mockClear();
    const hit = await env.run(env.request("/api/images/abc.png"));
    expect(await hit!.text()).toBe("png");
    expect(env.fetchMock).not.toHaveBeenCalled();
  });

  it("leaves POST requests and other origins alone", async () => {
    expect(await env.run(new Request("http://localhost/api/upload", { method: "POST" }))).toBeNull();
    expect(await env.run(new Request("https://example.com/x"))).toBeNull();
  });
});
