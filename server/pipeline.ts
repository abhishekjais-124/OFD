/**
 * pipeline: resolve the date (IST) → find the file → fetch → extract → normalize →
 * validate → store. The API layer only talks to this class.
 */
import type { Briefing, BriefingResponse, BriefingSource } from "../shared/schema.ts";
import { todayIST, type IsoDate } from "../shared/ist.ts";
import { DriveError, dateFromFileName, selectBriefing, type DriveClient, type DriveFile } from "./drive/index.ts";
import { ExtractError, extractPdf, type OcrEngine } from "./extract/index.ts";
import { PARSER_VERSION, ValidationError, normalizeBriefing } from "./normalize/index.ts";
import { sha256, type Store, type StoreEntry } from "./store/cache.ts";

export interface PipelineDeps {
  drive: DriveClient;
  folderId: string | null;
  store: Store;
  ocr: OcrEngine | null;
  now?: () => Date;
  /** How long a folder listing is reused before Drive is asked again (ms). */
  listingTtlMs?: number;
}

export interface ProcessOptions {
  /** Ask Drive again and re-download when the file changed (or when its modifiedTime is unknown). */
  refresh?: boolean;
  /** Re-run the parser on the cached PDF even when the cached result is current. */
  reprocess?: boolean;
}

const DOC_KEY_RE = /^[A-Za-z0-9._:-]+$/;

export class Pipeline {
  private listing: { files: DriveFile[]; at: number } | null = null;
  private readonly now: () => Date;
  private readonly listingTtlMs: number;

  constructor(private readonly deps: PipelineDeps) {
    this.now = deps.now ?? (() => new Date());
    this.listingTtlMs = deps.listingTtlMs ?? 60_000;
  }

  get parserVersion(): string {
    return PARSER_VERSION;
  }

  todayIST(): IsoDate {
    return todayIST(this.now());
  }

  /** Processed briefing for today's IST date. */
  today(opts: ProcessOptions = {}): Promise<BriefingResponse> {
    return this.forDate(this.todayIST(), opts);
  }

  async listDates(refresh = false): Promise<IsoDate[]> {
    const files = await this.listFolder(refresh);
    return selectBriefing(files, "0000-00-00").availableDates;
  }

  /** Processed briefing for a specific IST date. Never substitutes another day's file. */
  async forDate(date: IsoDate, opts: ProcessOptions = {}): Promise<BriefingResponse> {
    const base = this.emptyResponse(date);
    let files: DriveFile[];
    try {
      files = await this.listFolder(Boolean(opts.refresh));
    } catch (err) {
      return this.errorResponse(base, err);
    }
    const sel = selectBriefing(files, date);
    base.availableDates = sel.availableDates;
    base.latestAvailableDate = sel.latestDate;
    if (sel.ignored.length) {
      base.notices.push(`Ignored ${sel.ignored.length} file(s) whose name does not match Morning-Briefing-YYYY-MM-DD.pdf: ${sel.ignored.map((f) => f.name).join(", ")}.`);
    }
    if (!sel.file) {
      base.status = "missing";
      return base;
    }
    if (sel.duplicates.length) {
      base.notices.push(`${sel.duplicates.length + 1} files carry the date ${date}; showing the newest (${sel.file.name}, modified ${sel.file.modifiedTime ?? "unknown"}).`);
    }
    try {
      const { briefing, cached, notice } = await this.processDriveFile(sel.file, opts);
      if (notice) base.notices.push(notice);
      base.status = "ok";
      base.briefing = briefing;
      base.cached = cached;
      base.sourceKind = "drive";
      return base;
    } catch (err) {
      return this.errorResponse(base, err);
    }
  }

  /** Re-parses the cached PDF for a document key without touching the network. */
  async reprocess(key: string): Promise<BriefingResponse> {
    const entry = this.deps.store.getEntry(key);
    const pdf = this.deps.store.getPdf(key);
    const base = this.emptyResponse(entry?.date ?? "unknown");
    if (!entry || !pdf) {
      base.status = "error";
      base.error = { code: "not_cached", message: "There is no cached PDF for this document; refresh it from Drive or upload it again.", retryable: false };
      return base;
    }
    try {
      const briefing = await this.run(pdf, {
        key,
        source: {
          kind: entry.sourceKind,
          fileId: entry.fileId,
          fileName: entry.fileName,
          modifiedTime: entry.modifiedTime,
          size: pdf.length,
          webViewLink: entry.sourceKind === "drive" ? `https://drive.google.com/file/d/${entry.fileId}/view` : null,
        },
        fileNameDate: entry.date,
        sourceKind: entry.sourceKind,
        modifiedTime: entry.modifiedTime,
      });
      base.status = "ok";
      base.briefing = briefing;
      base.requestedDate = briefing.date ?? "unknown";
      base.sourceKind = entry.sourceKind;
      return base;
    } catch (err) {
      return this.errorResponse(base, err);
    }
  }

  /** The upload fallback: same pipeline, keyed by content hash. */
  async processUpload(bytes: Uint8Array, fileName: string): Promise<BriefingResponse> {
    const hash = sha256(bytes);
    const key = `upload:${hash.slice(0, 16)}`;
    const fileNameDate = dateFromFileName(fileName);
    const base = this.emptyResponse(fileNameDate ?? "unknown");
    try {
      const cached = this.deps.store.getEntry(key);
      const existing = cached && cached.parserVersion === PARSER_VERSION ? this.deps.store.getResult(key) : null;
      if (existing) {
        base.status = "ok";
        base.briefing = existing;
        base.cached = true;
        base.requestedDate = existing.date ?? "unknown";
        base.sourceKind = "upload";
        return base;
      }
      this.deps.store.putPdf(key, bytes);
      const briefing = await this.run(bytes, {
        key,
        source: { kind: "upload", fileId: hash, fileName, modifiedTime: null, size: bytes.length, webViewLink: null },
        fileNameDate,
        sourceKind: "upload",
        modifiedTime: null,
      });
      base.status = "ok";
      base.briefing = briefing;
      base.requestedDate = briefing.date ?? "unknown";
      base.sourceKind = "upload";
      return base;
    } catch (err) {
      return this.errorResponse(base, err);
    }
  }

  cached(key: string): Briefing | null {
    if (!DOC_KEY_RE.test(key)) return null;
    return this.deps.store.getResult(key);
  }

  pdf(key: string): { bytes: Buffer; fileName: string } | null {
    if (!DOC_KEY_RE.test(key)) return null;
    const bytes = this.deps.store.getPdf(key);
    const entry = this.deps.store.getEntry(key);
    return bytes ? { bytes, fileName: entry?.fileName ?? "briefing.pdf" } : null;
  }

  imagePath(id: string): string | null {
    if (!/^[0-9a-f]{40}$/.test(id)) return null;
    return this.deps.store.imagePath(id);
  }

  listCached(): StoreEntry[] {
    return this.deps.store.listEntries();
  }

  // ---- internals ----

  private async listFolder(refresh: boolean): Promise<DriveFile[]> {
    if (!this.deps.folderId) throw new DriveError("not_configured", "DRIVE_FOLDER_ID is not set. Configure Drive in .env or upload a PDF.", false);
    const fresh = this.listing && this.now().getTime() - this.listing.at < this.listingTtlMs;
    if (!refresh && fresh) return this.listing!.files;
    const files = await this.deps.drive.listFolder(this.deps.folderId);
    this.listing = { files, at: this.now().getTime() };
    return files;
  }

  private async processDriveFile(file: DriveFile, opts: ProcessOptions): Promise<{ briefing: Briefing; cached: boolean; notice?: string }> {
    const key = `drive:${file.id}`;
    const entry = this.deps.store.getEntry(key);
    const current = entry && entry.parserVersion === PARSER_VERSION;
    const sameVersion = entry && file.modifiedTime !== null && entry.modifiedTime === file.modifiedTime;
    const unknownVersion = file.modifiedTime === null && entry !== null;

    if (!opts.refresh && !opts.reprocess && current && (sameVersion || unknownVersion)) {
      const result = this.deps.store.getResult(key);
      if (result) return { briefing: result, cached: true };
    }

    let bytes = this.deps.store.getPdf(key);
    let downloaded: DriveFile = file;
    let notice: string | undefined;
    const needDownload = opts.refresh || !bytes || !entry || (file.modifiedTime !== null && entry.modifiedTime !== file.modifiedTime);
    if (needDownload) {
      const dl = await this.deps.drive.download(file);
      downloaded = dl.file;
      if (entry && dl.file.modifiedTime === entry.modifiedTime && current && !opts.reprocess) {
        const result = this.deps.store.getResult(key);
        if (result) return { briefing: result, cached: true, notice: "Drive has no newer version of this file." };
      }
      bytes = dl.bytes;
      this.deps.store.putPdf(key, bytes);
    } else if (opts.reprocess && entry && (file.modifiedTime === null || entry.modifiedTime === file.modifiedTime)) {
      downloaded = { ...file, modifiedTime: entry.modifiedTime };
    }

    const briefing = await this.run(bytes!, {
      key,
      source: {
        kind: "drive",
        fileId: file.id,
        fileName: file.name,
        modifiedTime: downloaded.modifiedTime,
        size: bytes!.length,
        webViewLink: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
      },
      fileNameDate: dateFromFileName(file.name),
      sourceKind: "drive",
      modifiedTime: downloaded.modifiedTime,
    });
    return { briefing, cached: false, notice };
  }

  private async run(bytes: Uint8Array, meta: { key: string; source: BriefingSource; fileNameDate: string | null; sourceKind: "drive" | "upload"; modifiedTime: string | null }): Promise<Briefing> {
    const extracted = await extractPdf(bytes, { ocr: this.deps.ocr });
    for (const page of extracted.pages) for (const image of page.images) this.deps.store.putImage(image.id, image.png);
    const briefing = normalizeBriefing({
      extracted,
      key: meta.key,
      source: meta.source,
      fileNameDate: meta.fileNameDate,
      processedAt: this.now(),
      imageUrl: (id) => `/api/images/${id}.png`,
      pdfUrl: `/api/documents/${encodeURIComponent(meta.key)}/pdf`,
    });
    this.deps.store.putResult(
      {
        key: meta.key,
        sourceKind: meta.sourceKind,
        fileId: meta.source.fileId,
        fileName: meta.source.fileName,
        modifiedTime: meta.modifiedTime,
        parserVersion: PARSER_VERSION,
        date: briefing.date,
        sha256: sha256(bytes),
        processedAt: briefing.processedAt,
      },
      briefing,
    );
    return briefing;
  }

  private emptyResponse(date: string): BriefingResponse {
    return {
      status: "ok",
      requestedDate: date,
      todayIST: this.todayIST(),
      briefing: null,
      latestAvailableDate: null,
      availableDates: [],
      notices: [],
      error: null,
      cached: false,
      sourceKind: null,
    };
  }

  private errorResponse(base: BriefingResponse, err: unknown): BriefingResponse {
    base.status = "error";
    if (err instanceof DriveError) base.error = { code: `drive_${err.code}`, message: err.message, retryable: err.retryable };
    else if (err instanceof ExtractError) base.error = { code: `pdf_${err.code}`, message: err.message, retryable: err.code === "corrupted" };
    else if (err instanceof ValidationError) base.error = { code: "parse_failed", message: err.message, retryable: false };
    else base.error = { code: "unexpected", message: (err as Error).message ?? String(err), retryable: true };
    return base;
  }
}
