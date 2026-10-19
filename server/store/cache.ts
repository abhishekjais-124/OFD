/**
 * store: a file-based cache keyed by document key. A cached result is valid only for
 * the same (modifiedTime, parserVersion); the original PDF and extracted images are
 * kept next to it so Reprocess never needs the network.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Briefing } from "../../shared/schema.ts";

export interface StoreEntry {
  key: string;
  sourceKind: "drive" | "upload";
  fileId: string;
  fileName: string;
  modifiedTime: string | null;
  parserVersion: string;
  date: string | null;
  sha256: string;
  processedAt: string;
}

export interface Store {
  getEntry(key: string): StoreEntry | null;
  listEntries(): StoreEntry[];
  getResult(key: string): Briefing | null;
  putResult(entry: StoreEntry, briefing: Briefing): void;
  /** Stores the PDF bytes for a key and returns their sha256. */
  putPdf(key: string, bytes: Uint8Array): string;
  getPdf(key: string): Buffer | null;
  putImage(id: string, png: Uint8Array): void;
  imagePath(id: string): string | null;
  /** Drops the processed result (keeps the PDF so it can be reprocessed). */
  invalidate(key: string): void;
}

function safeName(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function sha256(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function fileStore(dir: string): Store {
  const resultsDir = path.join(dir, "results");
  const pdfDir = path.join(dir, "pdfs");
  const imagesDir = path.join(dir, "images");
  for (const d of [resultsDir, pdfDir, imagesDir]) fs.mkdirSync(d, { recursive: true });
  const indexPath = path.join(dir, "index.json");

  let index: Record<string, StoreEntry> = {};
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<string, StoreEntry>;
  } catch {
    index = {};
  }
  const persist = () => {
    const tmp = `${indexPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2));
    fs.renameSync(tmp, indexPath);
  };

  return {
    getEntry: (key) => index[key] ?? null,
    listEntries: () => Object.values(index),
    getResult(key) {
      const entry = index[key];
      if (!entry) return null;
      try {
        return JSON.parse(fs.readFileSync(path.join(resultsDir, `${safeName(key)}.json`), "utf8")) as Briefing;
      } catch {
        return null;
      }
    },
    putResult(entry, briefing) {
      fs.writeFileSync(path.join(resultsDir, `${safeName(key(entry))}.json`), JSON.stringify(briefing));
      index[entry.key] = entry;
      persist();
    },
    putPdf(key, bytes) {
      const hash = sha256(bytes);
      fs.writeFileSync(path.join(pdfDir, `${safeName(key)}.pdf`), bytes);
      return hash;
    },
    getPdf(key) {
      const file = path.join(pdfDir, `${safeName(key)}.pdf`);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    putImage(id, png) {
      const file = path.join(imagesDir, `${safeName(id)}.png`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, png);
    },
    imagePath(id) {
      const file = path.join(imagesDir, `${safeName(id)}.png`);
      return fs.existsSync(file) ? file : null;
    },
    invalidate(key) {
      const file = path.join(resultsDir, `${safeName(key)}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      delete index[key];
      persist();
    },
  };

  function key(entry: StoreEntry): string {
    return entry.key;
  }
}
