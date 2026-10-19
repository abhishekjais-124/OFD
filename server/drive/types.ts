/** A file in the briefing folder, as reported by the source (Drive or a fake in tests). */
export interface DriveFile {
  id: string;
  name: string;
  /** ISO instant; null when the source cannot tell (public link mode before download). */
  modifiedTime: string | null;
  size: number | null;
  md5Checksum: string | null;
  webViewLink: string | null;
}

export interface DownloadedFile {
  file: DriveFile;
  bytes: Buffer;
}

/**
 * The only thing the rest of the app knows about Google Drive: list the folder,
 * download a file. Implemented by the Google client and by fakes in tests.
 */
export interface DriveClient {
  readonly mode: string;
  readonly configured: boolean;
  listFolder(folderId: string): Promise<DriveFile[]>;
  download(file: DriveFile): Promise<DownloadedFile>;
}

export class DriveError extends Error {
  constructor(
    public readonly code: "not_configured" | "no_access" | "not_found" | "network" | "unexpected",
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "DriveError";
  }
}
