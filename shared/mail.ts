/** Display parts for the mail cards, recovered from their one-line titles. Each returns null when the shape is unknown. */

export interface GithubParts {
  repo: string | null;
  ref: string;
  status: string | null;
}

/** "GitHub · [org/repo] PROD PR #9198 · merged into master" */
export function parseGithubTitle(title: string): GithubParts | null {
  const parts = title.split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || !/^github$/i.test(parts[0]!)) return null;
  const rest = parts.slice(1);
  let repo: string | null = null;
  let ref = rest[0]!;
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(ref);
  if (m) {
    repo = m[1]!;
    ref = m[2]!.trim() || rest[0]!;
  }
  return { repo, ref, status: rest.length > 1 ? rest.slice(1).join(" · ") : null };
}

export interface ShareParts {
  folder: string;
  by: string | null;
  note: string | null;
}

/** `Google Drive · Folder shared with you: "Routines" (shared by Abhishek, a@b.com, outside your organization)` */
export function parseShareTitle(title: string): ShareParts | null {
  const m = /shared with you:\s*"([^"]+)"\s*(?:\(([^)]*)\))?/i.exec(title) ?? /shared with you:\s*(\S[^(]*?)\s*(?:\(([^)]*)\))?$/i.exec(title);
  if (!m) return null;
  const inner = (m[2] ?? "").replace(/^shared by\s+/i, "").split(",").map((s) => s.trim()).filter(Boolean);
  const by = inner[0] ?? null;
  const note = inner.find((s) => /outside|external|your organi[sz]ation/i.test(s)) ?? null;
  return { folder: m[1]!.trim(), by, note };
}

export type AlertTone = "error" | "info" | "muted";

/** Sentry-like errors are urgent-looking, marketing mail is ignorable. */
export function alertTone(name: string, detail: string, mailCell: string): AlertTone {
  if (/\(ignore\)/i.test(mailCell) || /marketing|trial|newsletter|promo/i.test(detail)) return "muted";
  if (/sentry|error|exception|failed|alert/i.test(`${name} ${detail}`)) return "error";
  return "info";
}
