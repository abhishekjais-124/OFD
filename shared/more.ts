/** Reads the "Routine details" card the routine prints: schedule, reports folder, and one OK/BLOCKED line per source. */

export interface HostCheck {
  host: string;
  /** Text in brackets after the host, for example "HTTP 404 on probe path". */
  note: string | null;
}

export interface RoutineDetails {
  schedule: string | null;
  folderUrl: string | null;
  ok: HostCheck[];
  blocked: HostCheck[];
  /** Lines that are none of the above, shown as they are. */
  other: string[];
}

export function parseRoutineDetails(lines: string[]): RoutineDetails {
  const out: RoutineDetails = { schedule: null, folderUrl: null, ok: [], blocked: [], other: [] };
  for (const raw of lines) {
    const line = raw.trim();
    const host = /^(OK|BLOCKED)\s+(\S+)\s*(?:\(([^)]*)\))?\s*$/i.exec(line);
    if (host) {
      (host[1]!.toUpperCase() === "OK" ? out.ok : out.blocked).push({ host: host[2]!, note: host[3]?.trim() || null });
      continue;
    }
    const folder = /^Reports folder:\s*(https?:\/\/\S+)/i.exec(line);
    if (folder) {
      out.folderUrl = folder[1]!;
      continue;
    }
    if (/^Routine runs\b/i.test(line)) {
      out.schedule = line.replace(/\.$/, "");
      continue;
    }
    if (line) out.other.push(line);
  }
  return out;
}

/** One line for the collapsed row: "14 sources reachable" or "11 reachable, 3 blocked". */
export function sourcesSummary(d: Pick<RoutineDetails, "ok" | "blocked">): string {
  if (!d.ok.length && !d.blocked.length) return "No source check in this briefing";
  if (!d.blocked.length) return `${d.ok.length} source${d.ok.length === 1 ? "" : "s"} reachable`;
  return `${d.ok.length} reachable, ${d.blocked.length} blocked`;
}

/** "1.4 KB", "26 KB", "1.2 MB". */
export function formatBytes(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  if (n < 1024) return `${n} B`;
  if (n < 10 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
