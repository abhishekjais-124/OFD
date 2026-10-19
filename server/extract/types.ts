export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtractedLine {
  text: string;
  bbox: Rect;
  bold: boolean;
  size: number;
  fontName: string;
  /** Index of the layout block the engine grouped this line into (cells and cards are usually one block). */
  block: number;
  /** 0-100 for OCR lines; undefined for real text. */
  ocrConfidence?: number;
}

export interface ExtractedLink {
  url: string;
  bbox: Rect;
}

export interface ExtractedImage {
  /** sha1 of the PNG bytes, stable across runs. */
  id: string;
  bbox: Rect;
  width: number;
  height: number;
  png: Uint8Array;
}

export interface ExtractedPage {
  number: number; // 1-based
  width: number;
  height: number;
  lines: ExtractedLine[];
  links: ExtractedLink[];
  images: ExtractedImage[];
  /** True when the page text came from OCR. */
  ocr: boolean;
  /** Characters of real (non-OCR) text found on the page. */
  textChars: number;
}

export interface ExtractedDocument {
  pageCount: number;
  pages: ExtractedPage[];
  meta: { title: string | null; producer: string | null; creationDate: string | null };
  ocrUsed: boolean;
  warnings: { code: string; message: string; page?: number }[];
}

export type ExtractErrorCode = "corrupted" | "password_protected" | "empty" | "not_pdf";

export class ExtractError extends Error {
  constructor(public readonly code: ExtractErrorCode, message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/** OCR engine interface so the pipeline can run without tesseract in tests. */
export interface OcrEngine {
  recognize(png: Uint8Array, scale: number): Promise<ExtractedLine[]>;
}
