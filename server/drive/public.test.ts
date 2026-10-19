import { describe, expect, it } from "vitest";
import { parseEmbeddedFolder, publicDriveClient } from "./public.ts";

const html = `<div class="flip-entries"><div class="flip-entry" id="entry-ABC123" tabindex="0"><a class="flip-entry-info" href="https://drive.google.com/file/d/ABC123/view?usp=drive_web"><div class="flip-entry-thumb"></div><div class="flip-entry-title">Morning-Briefing-2026-10-19.pdf</div></a></div><div class="flip-entry" id="entry-DEF456"><a class="flip-entry-info" href="#"><div class="flip-entry-title">Notes &amp; things.txt</div></a></div></div>`;

describe("public folder parsing", () => {
  it("extracts ids and names from the embedded folder view", () => {
    expect(parseEmbeddedFolder(html)).toMatchObject([
      { id: "ABC123", name: "Morning-Briefing-2026-10-19.pdf" },
      { id: "DEF456", name: "Notes & things.txt" },
    ]);
  });

  it("downloads through the public endpoint and reads modifiedTime from Last-Modified", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("uc?export=download")) {
        return new Response(Buffer.from("%PDF-1.4 fake"), {
          headers: { "content-type": "application/octet-stream", "last-modified": "Mon, 19 Oct 2026 10:10:56 GMT" },
        });
      }
      return new Response(html, { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const client = publicDriveClient(fetchImpl);
    const files = await client.listFolder("folder");
    const dl = await client.download(files[0]!);
    expect(dl.file.modifiedTime).toBe("2026-10-19T10:10:56.000Z");
    expect(dl.bytes.toString()).toContain("%PDF");
  });

  it("refuses an HTML answer instead of the file", async () => {
    const fetchImpl = (async () => new Response("<html>sign in</html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const client = publicDriveClient(fetchImpl);
    await expect(client.download({ id: "x", name: "f.pdf", modifiedTime: null, size: null, md5Checksum: null, webViewLink: null }))
      .rejects.toMatchObject({ code: "no_access" });
  });
});
