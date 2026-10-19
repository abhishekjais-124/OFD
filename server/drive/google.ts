import type { TokenProvider } from "./auth.ts";
import { DriveError, type DownloadedFile, type DriveClient, type DriveFile } from "./types.ts";

const API = "https://www.googleapis.com/drive/v3";
const FIELDS = "files(id,name,modifiedTime,size,md5Checksum,webViewLink),nextPageToken";

export interface GoogleDriveOptions {
  /** Bearer tokens for service-account and OAuth modes. */
  tokens?: TokenProvider;
  /** API key for folders shared with "anyone with the link". */
  apiKey?: string;
  mode: "api_key" | "service_account" | "oauth";
  fetchImpl?: typeof fetch;
}

interface RawFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  webViewLink?: string;
}

function mapError(res: Response, what: string): DriveError {
  if (res.status === 401 || res.status === 403) {
    return new DriveError("no_access", `Google Drive refused ${what} (HTTP ${res.status}). The identity OFD uses cannot see the folder.`, false);
  }
  if (res.status === 404) return new DriveError("not_found", `${what}: not found (HTTP 404).`, false);
  return new DriveError("unexpected", `${what} failed with HTTP ${res.status}.`);
}

/** Google Drive v3 client over fetch. Read-only scope, no SDK. */
export function googleDriveClient(opts: GoogleDriveOptions): DriveClient {
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function authed(url: URL): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.tokens) headers.authorization = `Bearer ${await opts.tokens.token()}`;
    else if (opts.apiKey) url.searchParams.set("key", opts.apiKey);
    try {
      return await fetchImpl(url, { headers });
    } catch (err) {
      throw new DriveError("network", `could not reach Google Drive: ${(err as Error).message}`);
    }
  }

  return {
    mode: opts.mode,
    configured: true,

    async listFolder(folderId) {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const url = new URL(`${API}/files`);
        url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
        url.searchParams.set("fields", FIELDS);
        url.searchParams.set("pageSize", "200");
        url.searchParams.set("supportsAllDrives", "true");
        url.searchParams.set("includeItemsFromAllDrives", "true");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const res = await authed(url);
        if (!res.ok) throw mapError(res, "listing the folder");
        const json = (await res.json()) as { files?: RawFile[]; nextPageToken?: string };
        for (const f of json.files ?? []) {
          files.push({
            id: f.id,
            name: f.name,
            modifiedTime: f.modifiedTime ?? null,
            size: f.size ? Number(f.size) : null,
            md5Checksum: f.md5Checksum ?? null,
            webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
          });
        }
        pageToken = json.nextPageToken;
      } while (pageToken);
      return files;
    },

    async download(file): Promise<DownloadedFile> {
      const url = new URL(`${API}/files/${encodeURIComponent(file.id)}`);
      url.searchParams.set("alt", "media");
      url.searchParams.set("supportsAllDrives", "true");
      const res = await authed(url);
      if (!res.ok) throw mapError(res, `downloading ${file.name}`);
      return { file, bytes: Buffer.from(await res.arrayBuffer()) };
    },
  };
}
