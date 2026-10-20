import { compareIsoDates, isIsoDate, type IsoDate } from "../../shared/ist.ts";
import type { DriveFile } from "./types.ts";

/** The compact .json format is preferred; the .pdf is still read when it is all there is. */
export const BRIEFING_NAME_RE = /^Morning-Briefing-(\d{4}-\d{2}-\d{2})\.(?:pdf|json)$/i;

/** Date encoded in a briefing file name, or null when the name does not follow the pattern. */
export function dateFromFileName(name: string): IsoDate | null {
  const m = BRIEFING_NAME_RE.exec(name.trim());
  if (!m) return null;
  return isIsoDate(m[1]) ? m[1]! : null;
}

export interface Selection {
  /** The file to use for the requested date, or null when there is none. */
  file: DriveFile | null;
  /** Other files that carry the same date (older versions, re-uploads under new ids). */
  duplicates: DriveFile[];
  /** All dates present in the folder, newest first. */
  availableDates: IsoDate[];
  /** Newest date in the folder, null when the folder has no briefing files. */
  latestDate: IsoDate | null;
  /** Files that look like briefings but whose name does not parse (wrong pattern or impossible date). */
  ignored: DriveFile[];
}

function newestFirst(a: DriveFile, b: DriveFile): number {
  const at = a.modifiedTime ?? "";
  const bt = b.modifiedTime ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/** Pure selection of the file for a date from a folder listing. */
export function selectBriefing(files: DriveFile[], date: IsoDate): Selection {
  const byDate = new Map<IsoDate, DriveFile[]>();
  const ignored: DriveFile[] = [];
  for (const f of files) {
    const d = dateFromFileName(f.name);
    if (!d) {
      if (/briefing/i.test(f.name) && /\.(?:pdf|json)$/i.test(f.name)) ignored.push(f);
      continue;
    }
    const list = byDate.get(d) ?? [];
    list.push(f);
    byDate.set(d, list);
  }
  const availableDates = [...byDate.keys()].sort((a, b) => compareIsoDates(b, a));
  const all = [...(byDate.get(date) ?? [])].sort(newestFirst);
  const json = all.filter((f) => /\.json$/i.test(f.name));
  const candidates = json.length ? json : all;
  return {
    file: candidates[0] ?? null,
    duplicates: candidates.slice(1),
    availableDates,
    latestDate: availableDates[0] ?? null,
    ignored,
  };
}
