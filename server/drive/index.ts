import type { Config } from "../config.ts";
import { oauthTokens, serviceAccountTokens } from "./auth.ts";
import { googleDriveClient } from "./google.ts";
import { publicDriveClient, unconfiguredDriveClient } from "./public.ts";
import type { DriveClient } from "./types.ts";

export type { DriveClient, DriveFile, DownloadedFile } from "./types.ts";
export { DriveError } from "./types.ts";
export { selectBriefing, dateFromFileName } from "./select.ts";

/** Picks the Drive client from configuration. "auto" uses the strongest configured credential. */
export function driveClientFromConfig(cfg: Config, fetchImpl: typeof fetch = fetch): DriveClient {
  const d = cfg.drive;
  if (!d.folderId) return unconfiguredDriveClient();
  const mode = d.authMode === "auto"
    ? d.serviceAccountJson ? "service_account" : d.oauth ? "oauth" : d.apiKey ? "api_key" : "public"
    : d.authMode;
  switch (mode) {
    case "service_account":
      if (!d.serviceAccountJson) return unconfiguredDriveClient();
      return googleDriveClient({ mode, tokens: serviceAccountTokens(d.serviceAccountJson, fetchImpl), fetchImpl });
    case "oauth":
      if (!d.oauth) return unconfiguredDriveClient();
      return googleDriveClient({ mode, tokens: oauthTokens(d.oauth, fetchImpl), fetchImpl });
    case "api_key":
      if (!d.apiKey) return unconfiguredDriveClient();
      return googleDriveClient({ mode, apiKey: d.apiKey, fetchImpl });
    default:
      return publicDriveClient(fetchImpl);
  }
}
