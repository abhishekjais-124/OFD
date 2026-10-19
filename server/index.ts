import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "./api/app.ts";
import { loadDotEnv, readConfig } from "./config.ts";
import { driveClientFromConfig } from "./drive/index.ts";
import { tesseractEngine } from "./extract/index.ts";
import { Pipeline } from "./pipeline.ts";
import { fileStore } from "./store/cache.ts";
import { weatherService } from "./weather.ts";

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
  weather: weatherService(),
  status: { driveConfigured: drive.configured, driveAuthMode: drive.mode, folderId: cfg.drive.folderId, ocrEnabled: cfg.ocrEnabled },
  staticDir: fs.existsSync(path.join(staticDir, "index.html")) ? staticDir : undefined,
});

// OFD_BASE mounts the whole app under a path (OFD_BASE=/OFD for aj124.com/OFD); empty serves at the root
const base = (process.env.OFD_BASE ?? "").trim().replace(/\/+$/, "");
let server: express.Express = app;
if (base) {
  server = express();
  server.set("strict routing", true); // "/OFD" redirects, "/OFD/" serves
  server.get(base, (_req, res) => res.redirect(301, `${base}/`));
  server.use(base, app);
}
server.get("/healthz", (_req, res) => void res.type("text").send("ok"));

server.listen(cfg.port, () => {
  console.log(`[ofd] api listening on http://localhost:${cfg.port} (base: ${base || "/"}, drive: ${drive.mode}, folder: ${cfg.drive.folderId ?? "none"}, ocr: ${cfg.ocrEnabled ? "on" : "off"})`);
});
