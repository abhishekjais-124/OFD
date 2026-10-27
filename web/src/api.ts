import type { BriefingResponse, StatusResponse } from "@shared/schema";
import type { QuizResponse } from "@shared/quiz";
import { BASE, withBase } from "./base.ts";

export interface ApiResult<T> {
  data: T;
  /** True when the service worker answered from its cache because the network failed. */
  fromCache: boolean;
  cachedAt: string | null;
}

async function call<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(BASE + input, init);
  const fromCache = res.headers.get("x-ofd-cache") === "1";
  const cachedAt = res.headers.get("x-ofd-cached-at");
  if (!res.ok && !fromCache) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* no body */
    }
    throw new Error(message);
  }
  // image and PDF urls come back root-relative; keep them working when mounted under a path
  const data = JSON.parse(await res.text(), (_k, v) => (typeof v === "string" ? withBase(v) : v)) as T;
  return { data, fromCache, cachedAt };
}

export const api = {
  status: () => call<StatusResponse>("/api/status"),
  today: (refresh = false) => call<BriefingResponse>(`/api/today${refresh ? "?refresh=1" : ""}`),
  quiz: (date: string) => call<QuizResponse>(`/api/quiz/${date}`),
  forDate: (date: string, refresh = false) => call<BriefingResponse>(`/api/briefings/${date}${refresh ? "?refresh=1" : ""}`),
  reprocess: (key: string) => call<BriefingResponse>(`/api/documents/${encodeURIComponent(key)}/reprocess`, { method: "POST" }),
  upload: (file: File) =>
    call<BriefingResponse>("/api/upload", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    }),
};
