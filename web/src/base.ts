/** Mount path of the app without a trailing slash: "" at the domain root, "/OFD" behind aj124.com/OFD. */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Server-made URLs such as /api/images/x.png are root-relative; add the mount path. */
export function withBase(url: string): string {
  return url.startsWith("/api/") ? BASE + url : url;
}
