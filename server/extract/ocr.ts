import path from "node:path";
import type { ExtractedLine, OcrEngine } from "./types.ts";

/**
 * Local, open-source OCR through tesseract.js (WASM). The English model is downloaded
 * once into the cache directory on first use and reused afterwards.
 */
export function tesseractEngine(cacheDir: string): OcrEngine {
  let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

  async function worker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        const { createWorker } = await import("tesseract.js");
        return createWorker("eng", 1, { cachePath: path.join(cacheDir, "tessdata"), logger: () => {} });
      })();
    }
    return workerPromise;
  }

  return {
    async recognize(png, scale) {
      const w = await worker();
      const result = await w.recognize(Buffer.from(png), {}, { blocks: true });
      const lines: ExtractedLine[] = [];
      let block = 0;
      for (const b of result.data.blocks ?? []) {
        for (const p of b.paragraphs) {
          for (const l of p.lines) {
            const text = l.text.replace(/\s+/g, " ").trim();
            if (!text) continue;
            lines.push({
              text,
              bbox: {
                x: l.bbox.x0 / scale,
                y: l.bbox.y0 / scale,
                w: (l.bbox.x1 - l.bbox.x0) / scale,
                h: (l.bbox.y1 - l.bbox.y0) / scale,
              },
              bold: false,
              size: (l.bbox.y1 - l.bbox.y0) / scale * 0.75,
              fontName: "ocr",
              block,
              ocrConfidence: Math.round(l.confidence),
            });
          }
          block++;
        }
      }
      return lines;
    },
  };
}
