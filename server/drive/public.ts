import { DriveError, type DownloadedFile, type DriveClient, type DriveFile } from "./types.ts";

/**
 * Zero-credential mode for a folder shared with "anyone with the link": lists the
 * folder through Drive's embedded folder view and downloads through the public
 * download endpoint. modifiedTime comes from the download's Last-Modified header,
 * so it is only known after a download. Use a real credential when the folder is
 * private.
 */
export function publicDriveClient(fetchImpl: typeof fetch = fetch): DriveClient {
  return {
    mode: "public",
    configured: true,

    async listFolder(folderId) {
      let res: Response;
      try {
        res = await fetchImpl(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`);
      } catch (err) {
        throw new DriveError("network", `could not reach Google Drive: ${(err as Error).message}`);
      }
      if (!res.ok) throw new DriveError("no_access", `Drive returned HTTP ${res.status} for the folder; it may not be shared with anyone with the link.`, false);
      const html = await res.text();
      return parseEmbeddedFolder(html);
    },

    async download(file): Promise<DownloadedFile> {
      let res: Response;
      try {
        res = await fetchImpl(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`, { redirect: "follow" });
      } catch (err) {
        throw new DriveError("network", `could not download ${file.name}: ${(err as Error).message}`);
      }
      if (!res.ok) throw new DriveError("no_access", `download of ${file.name} failed with HTTP ${res.status}.`, false);
      const type = res.headers.get("content-type") ?? "";
      const bytes = Buffer.from(await res.arrayBuffer());
      if (type.includes("text/html")) {
        throw new DriveError("no_access", `Drive answered with a web page instead of ${file.name}; the file is probably not public.`, false);
      }
      const lastModified = res.headers.get("last-modified");
      const modifiedTime = lastModified && !Number.isNaN(Date.parse(lastModified)) ? new Date(lastModified).toISOString() : file.modifiedTime;
      return { file: { ...file, modifiedTime, size: bytes.length }, bytes };
    },
  };
}

/** Parses the entries of Drive's embedded folder view. Exported for tests. */
export function parseEmbeddedFolder(html: string): DriveFile[] {
  const files: DriveFile[] = [];
  const entryRe = /<div class="flip-entry"[^>]*id="entry-([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(html))) {
    const id = m[1]!;
    const name = decodeEntities(m[2]!.trim());
    files.push({ id, name, modifiedTime: null, size: null, md5Checksum: null, webViewLink: `https://drive.google.com/file/d/${id}/view` });
  }
  return files;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Client used when Drive is not configured at all: every call explains what to do. */
export function unconfiguredDriveClient(): DriveClient {
  const err = () => new DriveError("not_configured", "Google Drive is not configured. Set DRIVE_FOLDER_ID (and a credential) in .env, or upload a PDF.", false);
  return {
    mode: "none",
    configured: false,
    async listFolder() { throw err(); },
    async download() { throw err(); },
  };
}
