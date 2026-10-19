/**
 * The typed, validated shape of a processed briefing. Both the server (normalize +
 * validate) and the UI use these types; the zod schema is the single source of truth.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const linkSchema = z.object({
  url: z.string().min(1),
  /** Text shown for the link: the label printed before it, or the hostname. */
  label: z.string().optional(),
  page: z.number().int().positive(),
  /** "annotation" = embedded PDF link, "text" = URL recovered from printed text. */
  source: z.enum(["annotation", "text"]),
  confidence: z.enum(["high", "low"]).default("high"),
});
export type Link = z.infer<typeof linkSchema>;

export const bboxSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type BBox = z.infer<typeof bboxSchema>;

export const imageSchema = z.object({
  id: z.string().min(1),
  page: z.number().int().positive(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  /** URL served by the API, e.g. /api/images/<id>.png */
  url: z.string().min(1),
  bbox: bboxSchema,
});
export type ImageRef = z.infer<typeof imageSchema>;

export const tableCellSchema = z.object({
  text: z.string(),
  links: z.array(linkSchema).default([]),
  /** Inline marker such as "BEST MATCH" found inside the cell. */
  badge: z.string().optional(),
});
export type TableCell = z.infer<typeof tableCellSchema>;

export const tableSchema = z.object({
  header: z.array(z.string()),
  rows: z.array(z.array(tableCellSchema)),
  page: z.number().int().positive(),
  caption: z.string().optional(),
});
export type Table = z.infer<typeof tableSchema>;

export const fieldSchema = z.object({ label: z.string(), text: z.string() });
export type Field = z.infer<typeof fieldSchema>;

export const itemKindSchema = z.enum([
  "action", "mail", "github", "share", "alerts", "glance", "calendar", "headline",
  "question", "job", "jobs", "routine", "table", "paragraph", "note", "mention",
]);
export type ItemKind = z.infer<typeof itemKindSchema>;

export const itemFlagSchema = z.enum(["ocr", "low_confidence", "partial", "wrapped_url", "unrecognized"]);
export type ItemFlag = z.infer<typeof itemFlagSchema>;

export const actionSchema = z.object({
  deadlineDate: z.string().nullable(),
  deadlineText: z.string().optional(),
  priority: z.enum(["important", "normal"]),
  from: z.string().optional(),
  received: z.string().optional(),
  steps: z.array(z.string()).default([]),
});
export type ActionDetails = z.infer<typeof actionSchema>;

export const headlineSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  timestampText: z.string().optional(),
  /** ISO instant when the timestamp could be parsed. */
  timestamp: z.string().nullable(),
  source: z.string().optional(),
  url: z.string().nullable(),
});
export type HeadlineDetails = z.infer<typeof headlineSchema>;

export const questionSchema = z.object({
  number: z.string().optional(),
  title: z.string(),
  difficulty: z.string().optional(),
  problemUrl: z.string().nullable(),
  fields: z.array(fieldSchema).default([]),
  topics: z.array(z.string()).default([]),
  companies: z.array(z.string()).default([]),
});
export type QuestionDetails = z.infer<typeof questionSchema>;

export const jobSchema = z.object({
  title: z.string(),
  company: z.string().optional(),
  location: z.string().optional(),
  postedText: z.string().optional(),
  applyUrl: z.string().nullable(),
  fields: z.array(fieldSchema).default([]),
});
export type JobDetails = z.infer<typeof jobSchema>;

export const mentionSchema = z.object({
  from: z.string(),
  /** Channel such as "#apollo-dev", or "DM". */
  where: z.string().optional(),
  text: z.string(),
  timeText: z.string().optional(),
  /** ISO instant when the time could be parsed. */
  timestamp: z.string().nullable(),
  url: z.string().nullable(),
});
export type MentionDetails = z.infer<typeof mentionSchema>;

export const itemSchema = z.object({
  id: z.string().min(1),
  kind: itemKindSchema,
  page: z.number().int().positive(),
  title: z.string().optional(),
  /** The item's visible lines in reading order (headings and labels included). */
  lines: z.array(z.string()),
  /** Label/value pairs recovered from "Label: text" lines. */
  fields: z.array(fieldSchema).default([]),
  links: z.array(linkSchema).default([]),
  images: z.array(imageSchema).default([]),
  tables: z.array(tableSchema).default([]),
  flags: z.array(itemFlagSchema).default([]),
  action: actionSchema.optional(),
  headline: headlineSchema.optional(),
  question: questionSchema.optional(),
  job: jobSchema.optional(),
  mention: mentionSchema.optional(),
});
export type Item = z.infer<typeof itemSchema>;

export const sectionKindSchema = z.enum([
  "glance", "mail", "calendar", "slack", "headlines", "question", "job", "routine", "unknown",
]);
export type SectionKind = z.infer<typeof sectionKindSchema>;

export const sectionSchema = z.object({
  id: z.string().min(1),
  kind: sectionKindSchema,
  title: z.string(),
  page: z.number().int().positive(),
  items: z.array(itemSchema),
});
export type Section = z.infer<typeof sectionSchema>;

export const noteSchema = z.object({
  level: z.enum(["info", "warn"]),
  code: z.string(),
  message: z.string(),
  page: z.number().int().positive().optional(),
});
export type ExtractionNote = z.infer<typeof noteSchema>;

export const sourceSchema = z.object({
  kind: z.enum(["drive", "upload"]),
  fileId: z.string(),
  fileName: z.string(),
  modifiedTime: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  /** Link to the original file on Drive, when it came from Drive. */
  webViewLink: z.string().nullable(),
});
export type BriefingSource = z.infer<typeof sourceSchema>;

export const briefingSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  parserVersion: z.string(),
  /** Key used by the API to address this processed document. */
  key: z.string().min(1),
  /** Document date (IST). Null when neither the file name nor the content gives one. */
  date: z.string().nullable(),
  dateSource: z.enum(["filename", "content", "unknown"]),
  title: z.string(),
  subtitle: z.string().optional(),
  pageCount: z.number().int().nonnegative(),
  sections: z.array(sectionSchema),
  notes: z.array(noteSchema),
  source: sourceSchema,
  processedAt: z.string(),
  ocrUsed: z.boolean(),
  confidence: z.enum(["high", "low", "partial"]),
  /** URL that serves the cached original PDF. Append #page=N to jump to a page. */
  pdfUrl: z.string(),
});
export type Briefing = z.infer<typeof briefingSchema>;

/** What GET /api/today and GET /api/briefings/:date return. */
export interface BriefingResponse {
  status: "ok" | "missing" | "error";
  requestedDate: string;
  /** Today in IST on the server at the time of the response. */
  todayIST: string;
  briefing: Briefing | null;
  /** When status is "missing": the newest date that does exist. */
  latestAvailableDate: string | null;
  /** All dates that have a file in the source folder (newest first). */
  availableDates: string[];
  /** Human readable notices: duplicate files, fallback used, etc. */
  notices: string[];
  error: { code: string; message: string; retryable: boolean } | null;
  /** When the result was served from cache. */
  cached: boolean;
  /** "drive" or "upload" for the document shown, null when nothing is shown. */
  sourceKind: "drive" | "upload" | null;
}

export interface StatusResponse {
  driveConfigured: boolean;
  driveAuthMode: string;
  folderId: string | null;
  parserVersion: string;
  todayIST: string;
  ocrEnabled: boolean;
}

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

/** What GET /api/weather returns. Temperatures are in degrees Celsius, wind in km/h. */
export interface WeatherResponse {
  sky: Sky;
  isDay: boolean;
  label: string;
  tempC: number;
  feelsC: number;
  highC: number | null;
  lowC: number | null;
  windKph: number;
  humidity: number;
  place: string | null;
  /** ISO instant the observation was fetched on the server. */
  fetchedAt: string;
}
