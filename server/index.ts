import fs from "node:fs";
import path from "node:path";
import { createApp } from "./api/app.ts";
import { loadDotEnv, readConfig } from "./config.ts";
import { driveClientFromConfig } from "./drive/index.ts";
import { tesseractEngine } from "./extract/index.ts";
import { Pipeline } from "./pipeline.ts";
import { fileStore } from "./store/cache.ts";

loadDotEnv();
const cfg = readConfig();
const drive = driveClientFromConfig(cfg);
const store = fileStore(cfg.cacheDir);
const pipeline = new Pipeline({
  drive,
  folderId: cfg.drive.folderId,
  store,
  ocr: cfg.ocrEnabled ? tesseractEngine(cfg.cacheDir) : null,
});

const staticDir = path.resolve(import.meta.dirname, "..", "web");
const app = createApp({
  pipeline,
  status: { driveConfigured: drive.configured, driveAuthMode: drive.mode, folderId: cfg.drive.folderId, ocrEnabled: cfg.ocrEnabled },
  staticDir: fs.existsSync(path.join(staticDir, "index.html")) ? staticDir : undefined,
});

app.listen(cfg.port, () => {
  console.log(`[ofd] api listening on http://localhost:${cfg.port} (drive: ${drive.mode}, folder: ${cfg.drive.folderId ?? "none"}, ocr: ${cfg.ocrEnabled ? "on" : "off"})`);
});
