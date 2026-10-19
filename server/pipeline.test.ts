import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pipeline, type PipelineDeps } from "./pipeline.ts";
import { PARSER_VERSION } from "./normalize/index.ts";
import { fileStore } from "./store/cache.ts";
import { DriveError, type DriveClient, type DriveFile } from "./drive/index.ts";

const fixtures = path.resolve(import.meta.dirname, "..", "fixtures", "synthetic");
const briefingPdf = fs.readFileSync(path.join(fixtures, "Morning-Briefing-2026-01-15.pdf"));

interface FakeDrive extends DriveClient {
  files: DriveFile[];
  listCalls: number;
  downloadCalls: number;
  bytesFor: (id: string) => Buffer;
  failList: DriveError | null;
}

function fakeDrive(files: DriveFile[]): FakeDrive {
  const d: FakeDrive = {
    mode: "fake",
    configured: true,
    files,
    listCalls: 0,
    downloadCalls: 0,
    failList: null,
    bytesFor: () => briefingPdf,
    async listFolder() {
      d.listCalls++;
      if (d.failList) throw d.failList;
      return d.files;
    },
    async download(file) {
      d.downloadCalls++;
      return { file, bytes: d.bytesFor(file.id) };
    },
  };
  return d;
}

function file(name: string, modifiedTime: string | null = "2026-01-15T03:35:00Z", id = name): DriveFile {
  return { id, name, modifiedTime, size: briefingPdf.length, md5Checksum: null, webViewLink: null };
}

describe("Pipeline", () => {
  let dir: string;
  let now: Date;
  const clock = () => now;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofd-store-"));
    now = new Date("2026-01-15T04:00:00Z"); // 09:30 IST on 15 Jan
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function pipeline(drive: DriveClient, folderId: string | null = "folder", fetchImage?: PipelineDeps["fetchImage"]) {
    return new Pipeline({ drive, folderId, store: fileStore(dir), ocr: null, now: clock, listingTtlMs: 60_000, fetchImage });
  }

  it("shows today's briefing, caches it, and serves the cache on the next call", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf"), file("Morning-Briefing-2026-01-14.pdf")]);
    const p = pipeline(drive);
    const first = await p.today();
    expect(first.status).toBe("ok");
    expect(first.requestedDate).toBe("2026-01-15");
    expect(first.todayIST).toBe("2026-01-15");
    expect(first.cached).toBe(false);
    expect(first.briefing?.date).toBe("2026-01-15");
    expect(first.briefing?.source).toMatchObject({ kind: "drive", fileName: "Morning-Briefing-2026-01-15.pdf", modifiedTime: "2026-01-15T03:35:00Z" });
    expect(first.briefing?.pdfUrl).toBe("/api/documents/drive%3AMorning-Briefing-2026-01-15.pdf/pdf");
    expect(first.availableDates).toEqual(["2026-01-15", "2026-01-14"]);
    expect(drive.downloadCalls).toBe(1);

    const second = await p.today();
    expect(second.cached).toBe(true);
    expect(drive.downloadCalls).toBe(1);
    expect(drive.listCalls).toBe(1); // listing reused inside its TTL
    expect(p.pdf("drive:Morning-Briefing-2026-01-15.pdf")?.bytes.length).toBe(briefingPdf.length);
    const image = first.briefing!.sections.flatMap((s) => s.items).find((i) => i.images.length)!.images[0]!;
    expect(p.imagePath(image.id)).not.toBeNull();
  });

  it("reports a missing day instead of showing another day's data", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-14.pdf")]);
    const r = await pipeline(drive).today();
    expect(r.status).toBe("missing");
    expect(r.briefing).toBeNull();
    expect(r.latestAvailableDate).toBe("2026-01-14");
    expect(drive.downloadCalls).toBe(0);
  });

  it("uses the IST date even when UTC is still the previous day", async () => {
    now = new Date("2026-01-14T19:30:00Z"); // 01:00 IST on 15 Jan
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf")]);
    const r = await pipeline(drive).today();
    expect(r.requestedDate).toBe("2026-01-15");
    expect(r.status).toBe("ok");
  });

  it("picks the newest duplicate and says so", async () => {
    const drive = fakeDrive([
      file("Morning-Briefing-2026-01-15.pdf", "2026-01-15T03:35:00Z", "old"),
      file("Morning-Briefing-2026-01-15.pdf", "2026-01-15T05:00:00Z", "new"),
    ]);
    const r = await pipeline(drive).today();
    expect(r.status).toBe("ok");
    expect(r.briefing?.source.fileId).toBe("new");
    expect(r.notices[0]).toContain("2 files carry the date 2026-01-15");
  });

  it("refresh re-lists and re-downloads when the file changed; reprocess re-parses the cached file", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf", "2026-01-15T03:35:00Z", "f1")]);
    const p = pipeline(drive);
    await p.today();
    // same version: refresh asks Drive but keeps the cached result
    const same = await p.today({ refresh: true });
    expect(drive.listCalls).toBe(2);
    expect(same.cached).toBe(true);
    expect(same.notices).toContain("Drive has no newer version of this file.");
    // new version uploaded in place
    drive.files = [file("Morning-Briefing-2026-01-15.pdf", "2026-01-15T06:00:00Z", "f1")];
    const stale = await p.today();
    expect(stale.cached).toBe(true); // listing TTL not yet expired
    const fresh = await p.today({ refresh: true });
    expect(fresh.cached).toBe(false);
    expect(fresh.briefing?.source.modifiedTime).toBe("2026-01-15T06:00:00Z");
    const downloads = drive.downloadCalls;
    const re = await p.reprocess("drive:f1");
    expect(re.status).toBe("ok");
    expect(re.briefing?.processedAt).toBe(now.toISOString());
    expect(re.briefing?.source.modifiedTime).toBe("2026-01-15T06:00:00Z");
    expect(drive.downloadCalls).toBe(downloads);
  });

  it("keeps the stored Drive version when a parser change re-runs on the cached file", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf", null, "f1")]);
    drive.download = async (f) => { drive.downloadCalls++; return { file: { ...f, modifiedTime: "2026-01-15T03:35:00Z" }, bytes: briefingPdf }; };
    const store = fileStore(dir);
    const p = new Pipeline({ drive, folderId: "folder", store, ocr: null, now: clock });
    await p.today();
    const entry = store.getEntry("drive:f1")!;
    store.putResult({ ...entry, parserVersion: "0.0.0-old" }, store.getResult("drive:f1")!);
    const r = await p.today();
    expect(r.cached).toBe(false);
    expect(r.briefing?.source.modifiedTime).toBe("2026-01-15T03:35:00Z");
    expect(store.getEntry("drive:f1")?.modifiedTime).toBe("2026-01-15T03:35:00Z");
    expect(drive.downloadCalls).toBe(1);
  });

  it("invalidates cached results when the parser version changes", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf", "2026-01-15T03:35:00Z", "f1")]);
    const store = fileStore(dir);
    const p = new Pipeline({ drive, folderId: "folder", store, ocr: null, now: clock });
    await p.today();
    const entry = store.getEntry("drive:f1")!;
    store.putResult({ ...entry, parserVersion: "0.0.0-old" }, store.getResult("drive:f1")!);
    const r = await p.today();
    expect(r.cached).toBe(false);
    expect(store.getEntry("drive:f1")?.parserVersion).toBe(PARSER_VERSION);
  });

  it("in public mode (unknown modifiedTime) serves the cache until refresh downloads again", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf", null, "f1")]);
    drive.download = async (f) => {
      drive.downloadCalls++;
      return { file: { ...f, modifiedTime: "2026-01-15T03:35:00Z" }, bytes: briefingPdf };
    };
    const p = pipeline(drive);
    const first = await p.today();
    expect(first.briefing?.source.modifiedTime).toBe("2026-01-15T03:35:00Z");
    expect((await p.today()).cached).toBe(true);
    expect(drive.downloadCalls).toBe(1);
    const refreshed = await p.today({ refresh: true });
    expect(drive.downloadCalls).toBe(2);
    expect(refreshed.cached).toBe(true);
  });

  it("surfaces Drive failures with a code and retry flag", async () => {
    const drive = fakeDrive([]);
    drive.failList = new DriveError("no_access", "nope", false);
    const r = await pipeline(drive).today();
    expect(r.status).toBe("error");
    expect(r.error).toMatchObject({ code: "drive_no_access", retryable: false });
    const unconfigured = await pipeline(drive, null).today();
    expect(unconfigured.error?.code).toBe("drive_not_configured");
  });

  it("surfaces PDF failures (corrupted, password, not a pdf) with codes", async () => {
    const drive = fakeDrive([file("Morning-Briefing-2026-01-15.pdf")]);
    drive.bytesFor = () => fs.readFileSync(path.join(fixtures, "password.pdf"));
    const r = await pipeline(drive).today();
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("pdf_password_protected");
    const p = pipeline(drive);
    const corrupted = await p.processUpload(fs.readFileSync(path.join(fixtures, "corrupted.pdf")), "x.pdf");
    expect(corrupted.error?.code).toBe("pdf_corrupted");
    const notPdf = await p.processUpload(Buffer.from("hello"), "x.pdf");
    expect(notPdf.error?.code).toBe("pdf_not_pdf");
  });

  it("processes an uploaded PDF through the same pipeline, keyed by content", async () => {
    const p = pipeline(fakeDrive([]), null);
    const r = await p.processUpload(briefingPdf, "Morning-Briefing-2026-01-15.pdf");
    expect(r.status).toBe("ok");
    expect(r.sourceKind).toBe("upload");
    expect(r.requestedDate).toBe("2026-01-15");
    expect(r.briefing?.key).toMatch(/^upload:[0-9a-f]{16}$/);
    expect(r.briefing?.sections.length).toBeGreaterThan(5);
    const again = await p.processUpload(briefingPdf, "renamed.pdf");
    expect(again.cached).toBe(true);
    const scanned = await p.processUpload(fs.readFileSync(path.join(fixtures, "scanned.pdf")), "scan.pdf");
    expect(scanned.status).toBe("ok");
    expect(scanned.briefing?.confidence).toBe("partial");
    expect(scanned.requestedDate).toBe("unknown");
  });

  it("fetches a printed https Image: URL for a headline without an embedded picture, and refuses unsafe ones", async () => {
    const pdf = fs.readFileSync(path.join(fixtures, "remote-images.pdf"));
    const asked: string[] = [];
    const p = pipeline(fakeDrive([]), null, async (url) => {
      asked.push(url);
      return { bytes: new Uint8Array([1, 2, 3]), type: "image/jpeg" };
    });
    const r = await p.processUpload(pdf, "Morning-Briefing-2026-01-16.pdf");
    const heads = r.briefing!.sections.filter((s) => s.kind === "headlines").flatMap((s) => s.items).filter((i) => i.kind === "headline");
    expect(heads).toHaveLength(3);
    expect(asked).toEqual(["https://img.example.com/harbour.jpg"]); // "none" and a literal IP are never fetched
    expect(heads[0]!.images[0]!.url).toMatch(/^\/api\/images\/[0-9a-f]{40}\.png$/);
    expect(p.imagePath(heads[0]!.images[0]!.id)).not.toBeNull();
    expect(heads[1]!.images).toHaveLength(0);
    expect(heads[2]!.images).toHaveLength(0);
    const notes = r.briefing!.notes.filter((n) => n.code === "headline_without_image");
    expect(notes).toHaveLength(2); // only the two stories that still have no picture
  });
});
