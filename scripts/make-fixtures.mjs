// Generates the synthetic test fixtures in fixtures/synthetic from briefing.template.html.
// Needs Google Chrome (headless print to PDF) and the mupdf package. Run: node scripts/make-fixtures.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as mupdf from "mupdf";

const dir = path.resolve(import.meta.dirname, "..", "fixtures", "synthetic");
const chrome = process.env.CHROME_BIN
  ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome");

function colorPng(r, g, b, w = 300, h = 168) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  const px = pix.getPixels();
  for (let i = 0; i < px.length; i += 3) {
    const y = Math.floor(i / 3 / w);
    const shade = 0.6 + 0.4 * (y / h);
    px[i] = r * shade; px[i + 1] = g * shade; px[i + 2] = b * shade;
  }
  return `data:image/png;base64,${Buffer.from(pix.asPNG()).toString("base64")}`;
}

const html = fs.readFileSync(path.join(dir, "briefing.template.html"), "utf8")
  .replace("{{IMG1}}", colorPng(47, 111, 237))
  .replace("{{IMG2}}", colorPng(60, 160, 90))
  .replace("{{IMG3}}", colorPng(220, 120, 40))
  .replace("{{IMG4}}", colorPng(200, 60, 80))
  .replace("{{IMG5}}", colorPng(120, 80, 200));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ofd-fixture-"));
const htmlPath = path.join(tmp, "brief.html");
fs.writeFileSync(htmlPath, html);
const pdfPath = path.join(dir, "Morning-Briefing-2026-01-15.pdf");
execFileSync(chrome, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
], { stdio: "ignore" });
console.log("wrote", pdfPath);

const bytes = fs.readFileSync(pdfPath);

// Scanned variant: every page rendered to an image and wrapped in a fresh PDF with no text layer.
{
  const src = mupdf.Document.openDocument(bytes, "application/pdf");
  const out = new mupdf.PDFDocument();
  for (let i = 0; i < Math.min(2, src.countPages()); i++) {
    const page = src.loadPage(i);
    const [, , w, h] = page.getBounds();
    const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
    const image = new mupdf.Image(pix);
    const imageRef = out.addImage(image);
    const resources = out.newDictionary();
    const xobjects = out.newDictionary();
    xobjects.put("Im0", imageRef);
    resources.put("XObject", xobjects);
    const contents = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    const pageObj = out.addPage([0, 0, w, h], 0, resources, contents);
    out.insertPage(-1, pageObj);
  }
  const scanned = path.join(dir, "scanned.pdf");
  fs.writeFileSync(scanned, out.saveToBuffer("compress").asUint8Array());
  console.log("wrote", scanned);
}

// Password-protected variant.
{
  const doc = new mupdf.PDFDocument(bytes);
  const locked = path.join(dir, "password.pdf");
  fs.writeFileSync(locked, doc.saveToBuffer("encrypt=aes-256,user-password=secret,owner-password=secret").asUint8Array());
  console.log("wrote", locked);
}

// Corrupted variant: a truncated file and a non-PDF.
fs.writeFileSync(path.join(dir, "corrupted.pdf"), bytes.subarray(0, 1500));
fs.writeFileSync(path.join(dir, "not-a-pdf.pdf"), Buffer.from("this is not a pdf at all\n"));
console.log("wrote corrupted.pdf and not-a-pdf.pdf");
fs.rmSync(tmp, { recursive: true, force: true });
