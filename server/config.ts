import fs from "node:fs";
import path from "node:path";

export type DriveAuthMode = "auto" | "public" | "api_key" | "service_account" | "oauth";

export interface Config {
  port: number;
  cacheDir: string;
  ocrEnabled: boolean;
  drive: {
    folderId: string | null;
    authMode: DriveAuthMode;
    apiKey: string | null;
    serviceAccountJson: string | null;
    oauth: { clientId: string; clientSecret: string; refreshToken: string } | null;
  };
}

/** Minimal .env loader (KEY=value lines, # comments, optional quotes). No dependency needed. */
export function loadDotEnv(file = path.resolve(process.cwd(), ".env"), env: NodeJS.ProcessEnv = process.env): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}

function blank(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  let serviceAccountJson = blank(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const saFile = blank(env.GOOGLE_SERVICE_ACCOUNT_FILE);
  if (!serviceAccountJson && saFile) {
    serviceAccountJson = fs.readFileSync(path.resolve(saFile), "utf8");
  }
  const clientId = blank(env.GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = blank(env.GOOGLE_OAUTH_CLIENT_SECRET);
  const refreshToken = blank(env.GOOGLE_OAUTH_REFRESH_TOKEN);
  const authMode = (blank(env.DRIVE_AUTH) ?? "auto") as DriveAuthMode;
  return {
    port: Number(env.OFD_API_PORT ?? 8787),
    cacheDir: path.resolve(env.OFD_CACHE_DIR ?? ".cache"),
    ocrEnabled: (env.OFD_OCR ?? "1") !== "0",
    drive: {
      folderId: blank(env.DRIVE_FOLDER_ID),
      authMode,
      apiKey: blank(env.GOOGLE_API_KEY),
      serviceAccountJson,
      oauth: clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null,
    },
  };
}
