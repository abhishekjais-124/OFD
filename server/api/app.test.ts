import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { Pipeline } from "../pipeline.ts";
import { fileStore } from "../store/cache.ts";
import type { DriveClient, DriveFile } from "../drive/index.ts";

const fixtures = path.resolve(import.meta.dirname, "..", "..", "fixtures", "synthetic");
const pdf = fs.readFileSync(path.join(fixtures, "Morning-Briefing-2026-01-15.pdf"));
const file: DriveFile = { id: "f1", name: "Morning-Briefing-2026-01-15.pdf", modifiedTime: "2026-01-15T03:35:00Z", size: pdf.length, md5Checksum: null, webViewLink: null };
const drive: DriveClient = {
  mode: "fake",
  configured: true,
  async listFolder() { return [file]; },
  async download(f) { return { file: f, bytes: pdf }; },
};

describe("API", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofd-api-")); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function app() {
    const pipeline = new Pipeline({ drive, folderId: "folder", store: fileStore(dir), ocr: null, now: () => new Date("2026-01-15T04:00:00Z") });
    return createApp({ pipeline, status: { driveConfigured: true, driveAuthMode: "fake", folderId: "folder", ocrEnabled: false } });
  }

  it("serves status, today, the PDF and images", async () => {
    const a = app();
    const status = await request(a).get("/api/status").expect(200);
    expect(status.body).toMatchObject({ driveConfigured: true, todayIST: "2026-01-15" });
    const today = await request(a).get("/api/today").expect(200);
    expect(today.body.status).toBe("ok");
    expect(today.body.briefing.date).toBe("2026-01-15");
    const pdfRes = await request(a).get(today.body.briefing.pdfUrl).expect(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");
    const image = today.body.briefing.sections.flatMap((s: { items: { images: { url: string }[] }[] }) => s.items).find((i: { images: unknown[] }) => i.images.length).images[0].url;
    const img = await request(a).get(image).expect(200);
    expect(img.headers["content-type"]).toContain("image/png");
    await request(a).get("/api/images/not-a-real-id.png").expect(404);
    await request(a).get("/api/documents/nope/pdf").expect(404);
  });

  it("validates dates, refreshes and reprocesses", async () => {
    const a = app();
    await request(a).get("/api/briefings/2026-13-01").expect(400);
    const missing = await request(a).get("/api/briefings/2026-01-14").expect(200);
    expect(missing.body.status).toBe("missing");
    expect(missing.body.latestAvailableDate).toBe("2026-01-15");
    const ok = await request(a).post("/api/briefings/2026-01-15/refresh").expect(200);
    expect(ok.body.status).toBe("ok");
    const re = await request(a).post(`/api/documents/${encodeURIComponent("drive:f1")}/reprocess`).expect(200);
    expect(re.body.status).toBe("ok");
    expect(re.body.cached).toBe(false);
    const list = await request(a).get("/api/briefings").expect(200);
    expect(list.body.availableDates).toEqual(["2026-01-15"]);
    expect(list.body.cached[0].key).toBe("drive:f1");
  });

  it("accepts an uploaded PDF as raw bytes", async () => {
    const a = app();
    const res = await request(a).post("/api/upload").set("content-type", "application/pdf").set("x-file-name", "Morning-Briefing-2026-01-15.pdf").send(pdf).expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.sourceKind).toBe("upload");
    await request(a).post("/api/upload").set("content-type", "application/pdf").send(Buffer.alloc(0)).expect(400);
  });
});
