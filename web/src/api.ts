import type { BriefingResponse, StatusResponse } from "@shared/schema";

export interface ApiResult<T> {
  data: T;
  /** True when the service worker answered from its cache because the network failed. */
  fromCache: boolean;
  cachedAt: string | null;
}

async function call<T>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(input, init);
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
  return { data: (await res.json()) as T, fromCache, cachedAt };
}

export const api = {
  status: () => call<StatusResponse>("/api/status"),
  today: (refresh = false) => call<BriefingResponse>(`/api/today${refresh ? "?refresh=1" : ""}`),
  forDate: (date: string, refresh = false) => call<BriefingResponse>(`/api/briefings/${date}${refresh ? "?refresh=1" : ""}`),
  reprocess: (key: string) => call<BriefingResponse>(`/api/documents/${encodeURIComponent(key)}/reprocess`, { method: "POST" }),
  upload: (file: File) =>
    call<BriefingResponse>("/api/upload", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    }),
};
