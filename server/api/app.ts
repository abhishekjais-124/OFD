import express, { type Express } from "express";
import type { StatusResponse } from "../../shared/schema.ts";
import { isIsoDate } from "../../shared/ist.ts";
import type { Pipeline } from "../pipeline.ts";
import { WeatherError, parseCoordinates, type WeatherService } from "../weather.ts";

export interface AppDeps {
  pipeline: Pipeline;
  weather?: WeatherService;
  status: Omit<StatusResponse, "todayIST" | "parserVersion">;
  /** Directory of the built web app; when set, it is served as static files. */
  staticDir?: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const { pipeline } = deps;
  app.disable("x-powered-by");

  app.get("/api/status", (_req, res) => {
    const body: StatusResponse = { ...deps.status, todayIST: pipeline.todayIST(), parserVersion: pipeline.parserVersion };
    res.json(body);
  });

  app.get("/api/weather", async (req, res) => {
    if (!deps.weather) {
      res.status(404).json({ error: { code: "disabled", message: "weather is not enabled", retryable: false } });
      return;
    }
    try {
      const { lat, lon } = parseCoordinates(req.query.lat, req.query.lon);
      res.setHeader("cache-control", "private, max-age=300");
      res.json(await deps.weather.get(lat, lon));
    } catch (err) {
      if (err instanceof WeatherError && err.code === "bad_coordinates") {
        res.status(400).json({ error: { code: err.code, message: err.message, retryable: false } });
      } else {
        // 503, not 502: Cloudflare swaps an origin 502 for its own HTML error page
        res.status(503).json({ error: { code: "weather_unavailable", message: (err as Error).message, retryable: true } });
      }
    }
  });

  app.get("/api/today", async (req, res) => {
    res.json(await pipeline.today({ refresh: req.query.refresh === "1" }));
  });

  app.get("/api/briefings", async (req, res) => {
    try {
      const availableDates = await pipeline.listDates(req.query.refresh === "1");
      res.json({ todayIST: pipeline.todayIST(), availableDates, cached: pipeline.listCached() });
    } catch (err) {
      res.json({ todayIST: pipeline.todayIST(), availableDates: [], cached: pipeline.listCached(), error: (err as Error).message });
    }
  });

  app.get("/api/briefings/:date", async (req, res) => {
    const date = String(req.params.date);
    if (!isIsoDate(date)) {
      res.status(400).json({ error: { code: "bad_date", message: "date must be YYYY-MM-DD", retryable: false } });
      return;
    }
    res.json(await pipeline.forDate(date, { refresh: req.query.refresh === "1" }));
  });

  app.post("/api/briefings/:date/refresh", async (req, res) => {
    const date = String(req.params.date);
    if (!isIsoDate(date)) {
      res.status(400).json({ error: { code: "bad_date", message: "date must be YYYY-MM-DD", retryable: false } });
      return;
    }
    res.json(await pipeline.forDate(date, { refresh: true }));
  });

  app.post("/api/documents/:key/reprocess", async (req, res) => {
    res.json(await pipeline.reprocess(String(req.params.key)));
  });

  app.get("/api/documents/:key", (req, res) => {
    const briefing = pipeline.cached(String(req.params.key));
    if (!briefing) {
      res.status(404).json({ error: { code: "not_cached", message: "no processed result for this key", retryable: false } });
      return;
    }
    res.json(briefing);
  });

  app.get("/api/documents/:key/pdf", (req, res) => {
    const pdf = pipeline.pdf(String(req.params.key));
    if (!pdf) {
      res.status(404).json({ error: { code: "not_cached", message: "no cached PDF for this key", retryable: false } });
      return;
    }
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${pdf.fileName.replace(/"/g, "")}"`);
    res.setHeader("cache-control", "private, max-age=3600");
    res.send(pdf.bytes);
  });

  app.get("/api/images/:id.png", (req, res) => {
    const file = pipeline.imagePath(String(req.params.id));
    if (!file) {
      res.status(404).end();
      return;
    }
    // headers only on success: a cached error must never become immutable
    res.sendFile(file, { dotfiles: "allow", headers: { "cache-control": "public, max-age=31536000, immutable" } });
  });

  app.post("/api/upload", express.raw({ type: () => true, limit: "60mb" }), async (req, res) => {
    const bytes = req.body as Buffer | undefined;
    if (!bytes || !Buffer.isBuffer(bytes) || bytes.length === 0) {
      res.status(400).json({ error: { code: "empty_upload", message: "send the PDF bytes as the request body", retryable: false } });
      return;
    }
    const name = decodeURIComponent(String(req.get("x-file-name") ?? "upload.pdf"));
    res.json(await pipeline.processUpload(bytes, name));
  });

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir, { index: "index.html" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile("index.html", { root: deps.staticDir }));
  }

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[ofd] ${req.method} ${req.originalUrl} failed:`, err.stack ?? err.message);
    res.status(500).json({ error: { code: "unexpected", message: err.message, retryable: true } });
  });
  return app;
}
