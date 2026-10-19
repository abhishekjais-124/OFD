import crypto from "node:crypto";
import * as mupdf from "mupdf";
import {
  ExtractError, type ExtractedDocument, type ExtractedImage, type ExtractedLine, type ExtractedLink,
  type ExtractedPage, type OcrEngine, type Rect,
} from "./types.ts";

/** Pages with fewer real characters than this are candidates for OCR. */
const MIN_TEXT_CHARS = 40;
/** Images displayed smaller than this (in points) are decoration (bullets, icons) and skipped. */
const MIN_IMAGE_SIZE = 16;
const OCR_SCALE = 2;

interface StextLine {
  bbox: { x: number; y: number; w: number; h: number };
  font: { name: string; weight: string; size: number };
  text: string;
}
interface StextBlock {
  type: "text" | "image";
  bbox: { x: number; y: number; w: number; h: number };
  lines?: StextLine[];
}

export interface ExtractOptions {
  ocr?: OcrEngine | null;
}

function openDocument(bytes: Uint8Array): mupdf.Document {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF")) throw new ExtractError("not_pdf", "the file is not a PDF (no %PDF header).");
  try {
    return mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (err) {
    throw new ExtractError("corrupted", `the PDF could not be opened: ${(err as Error).message}`);
  }
}

function rectFromArray(r: number[]): Rect {
  return { x: r[0]!, y: r[1]!, w: r[2]! - r[0]!, h: r[3]! - r[1]! };
}

function pageText(page: mupdf.Page, pageNumber: number): { lines: ExtractedLine[]; images: ExtractedImage[]; warnings: ExtractedDocument["warnings"] } {
  const warnings: ExtractedDocument["warnings"] = [];
  const stext = page.toStructuredText("preserve-whitespace,preserve-images");
  const json = JSON.parse(stext.asJSON()) as { blocks: StextBlock[] };
  const lines: ExtractedLine[] = [];
  json.blocks.forEach((block, blockIndex) => {
    if (block.type !== "text" || !block.lines) return;
    for (const l of block.lines) {
      const text = l.text.replace(/\s+/g, " ").trim();
      if (!text) continue;
      lines.push({
        text,
        bbox: { x: l.bbox.x, y: l.bbox.y, w: l.bbox.w, h: l.bbox.h },
        bold: l.font.weight === "bold" || /bold|black|heavy|semibold/i.test(l.font.name),
        size: l.font.size,
        fontName: l.font.name,
        block: blockIndex,
      });
    }
  });

  const images: ExtractedImage[] = [];
  const seen = new Set<string>();
  stext.walk({
    onImageBlock(bbox, _transform, image) {
      const rect = rectFromArray(bbox);
      if (rect.w < MIN_IMAGE_SIZE || rect.h < MIN_IMAGE_SIZE) return;
      try {
        const pixmap = image.toPixmap();
        const png = pixmap.asPNG();
        const id = crypto.createHash("sha1").update(png).digest("hex");
        if (seen.has(`${id}:${Math.round(rect.x)}:${Math.round(rect.y)}`)) return;
        seen.add(`${id}:${Math.round(rect.x)}:${Math.round(rect.y)}`);
        images.push({ id, bbox: rect, width: image.getWidth(), height: image.getHeight(), png });
      } catch (err) {
        warnings.push({ code: "image_decode_failed", message: `an image on page ${pageNumber} could not be decoded: ${(err as Error).message}`, page: pageNumber });
      }
    },
  });
  stext.destroy();
  return { lines, images, warnings };
}

function pageLinks(page: mupdf.Page): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  for (const link of page.getLinks()) {
    const uri = link.getURI();
    if (!uri || !/^[a-z][a-z0-9+.-]*:/i.test(uri)) continue; // skip internal GoTo links
    out.push({ url: uri, bbox: rectFromArray(link.getBounds()) });
  }
  return out;
}

/** Renders a page to PNG (used for OCR). Exported for the fixture generator and tests. */
export function renderPagePng(page: mupdf.Page, scale = OCR_SCALE): Uint8Array {
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();
  pixmap.destroy();
  return png;
}

/**
 * Extracts text lines (with font info), link annotations and embedded images from
 * every page, keeping the page number. Pages without real text fall back to OCR when
 * an engine is provided; otherwise they are reported as a warning.
 */
export async function extractPdf(bytes: Uint8Array, opts: ExtractOptions = {}): Promise<ExtractedDocument> {
  const doc = openDocument(bytes);
  try {
    if (doc.needsPassword()) throw new ExtractError("password_protected", "the PDF is password protected; OFD cannot read it.");
    let pageCount: number;
    try {
      pageCount = doc.countPages();
    } catch (err) {
      throw new ExtractError("corrupted", `the PDF page tree is damaged: ${(err as Error).message}`);
    }
    if (pageCount === 0) throw new ExtractError("empty", "the PDF has no pages.");

    const warnings: ExtractedDocument["warnings"] = [];
    const pages: ExtractedPage[] = [];
    let ocrUsed = false;

    for (let i = 0; i < pageCount; i++) {
      const number = i + 1;
      let page: mupdf.Page;
      try {
        page = doc.loadPage(i);
      } catch (err) {
        warnings.push({ code: "page_unreadable", message: `page ${number} could not be loaded: ${(err as Error).message}`, page: number });
        continue;
      }
      try {
        const bounds = page.getBounds();
        const { lines, images, warnings: pageWarnings } = pageText(page, number);
        warnings.push(...pageWarnings);
        const links = pageLinks(page);
        const textChars = lines.reduce((n, l) => n + l.text.length, 0);
        let finalLines = lines;
        let ocr = false;
        if (textChars < MIN_TEXT_CHARS) {
          if (opts.ocr) {
            try {
              const png = renderPagePng(page, OCR_SCALE);
              const ocrLines = await opts.ocr.recognize(png, OCR_SCALE);
              if (ocrLines.length) {
                finalLines = ocrLines;
                ocr = true;
                ocrUsed = true;
                warnings.push({ code: "ocr", message: `page ${number} had no text layer; its text comes from OCR and is lower confidence.`, page: number });
              } else {
                warnings.push({ code: "no_text", message: `page ${number} has no text layer and OCR found nothing.`, page: number });
              }
            } catch (err) {
              warnings.push({ code: "ocr_failed", message: `page ${number} has no text layer and OCR failed: ${(err as Error).message}`, page: number });
            }
          } else {
            warnings.push({ code: "no_text", message: `page ${number} has no text layer (scanned or image-only) and OCR is disabled.`, page: number });
          }
        }
        pages.push({
          number,
          width: bounds[2]! - bounds[0]!,
          height: bounds[3]! - bounds[1]!,
          lines: finalLines,
          links,
          images,
          ocr,
          textChars,
        });
      } finally {
        page.destroy();
      }
    }

    if (!pages.length) throw new ExtractError("corrupted", "no page of the PDF could be read.");
    return {
      pageCount,
      pages,
      meta: {
        title: doc.getMetaData("info:Title") ?? null,
        producer: doc.getMetaData("info:Producer") ?? null,
        creationDate: doc.getMetaData("info:CreationDate") ?? null,
      },
      ocrUsed,
      warnings,
    };
  } finally {
    doc.destroy();
  }
}
